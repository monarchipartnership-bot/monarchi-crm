import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import WeekPicker from '../../components/Reports/Weekly/WeekPicker';
import CompareBlock from '../../components/Reports/Weekly/CompareBlock';
import CompareListBlock from '../../components/Reports/Weekly/CompareListBlock';
import { fetchReportByWeekStart } from '../../lib/api/weeklyReports';
import { fetchMonthlyReportByStart } from '../../lib/api/monthlyReports';
import { computeWeeksForMonth, defaultWeekIndexFor, fmtDY, isoDate, MONTH_NAMES } from '../../lib/dateHelpers';
import { CHANNELS, LI_CHANNEL, COST_ITEMS, INCOME_FIELDS, gv, pctVal, costLine, financeCalc, numFmt, pctFmt, moneyFmt, fp } from '../../lib/weeklyLogic';
import { exportJPEG } from '../../lib/exportHelpers';
import '../../styles/reportPage.css';
import '../../styles/comparePage.css';

const MAX_SLOTS = 6;

const WEEKLY_TASK_SECTIONS = [
  { key: 't_plan', title: 'Задачі — Заплановано' },
  { key: 't_done', title: 'Задачі — Виконано' },
  { key: 't_next', title: 'Задачі — Плани на наступний тиждень' },
  { key: 't_conc', title: 'Задачі — Висновки' },
];
const MONTHLY_TASK_SECTIONS = [
  { key: 't_plan', title: 'Задачі — Заплановано' },
  { key: 't_done', title: 'Задачі — Виконано' },
  { key: 't_next', title: 'Задачі — Плани на наступний місяць' },
  { key: 't_conc', title: 'Задачі — Висновки' },
];

function initialWeeklyPanelPeriod() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  return { year, month, weekIndex: defaultWeekIndexFor(computeWeeksForMonth(year, month)) };
}
function initialMonthlyPanelPeriod() {
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
}

// ---- Weekly row builders — raw per-week fact values (live compute) ----
function weeklyMetricRows(channel, slots) {
  return channel.metrics.map((m) => ({ label: m.label, values: slots.map((s) => gv((id) => s.data[id], m.id)) }));
}
function weeklyRatioRows(channel, slots) {
  return channel.ratios.map((r) => ({ label: r.label, values: slots.map((s) => pctVal((id) => s.data[id], r.num, r.den)) }));
}
function weeklyCostRows(items, slots) {
  return items.map((it) => ({
    label: it.label,
    values: slots.map((s) => (gv((id) => s.data[id], it.id) === null ? null : costLine((id) => s.data[id], it))),
  }));
}

// ---- Monthly row builders — pre-aggregated sums/ratioPct/finance ----
function monthlyRatioKey(r) {
  return r.pp.replace('pp_', '');
}
function monthlyMetricRows(channel, slots) {
  return channel.metrics.map((m) => ({ label: m.label, values: slots.map((s) => gv((id) => s.data.sums?.[id], m.id)) }));
}
function monthlyRatioRows(channel, slots) {
  return channel.ratios.map((r) => ({
    label: r.label,
    values: slots.map((s) => {
      const v = s.data.ratioPct?.[monthlyRatioKey(r)];
      return v === null || v === undefined || isNaN(v) ? null : v;
    }),
  }));
}
function monthlyCostRows(items, slots) {
  return items.map((it) => ({
    label: it.label,
    values: slots.map((s) => {
      const raw = gv((id) => s.data.sums?.[id], it.id);
      if (raw === null) return null;
      const line = it.direct ? raw : raw * 0.15;
      return it.exp ? -line : line;
    }),
  }));
}

function WeeklyCompareSection() {
  const [slots, setSlots] = useState([]);
  const [panelOpen, setPanelOpen] = useState(false);
  const [panelPeriod, setPanelPeriod] = useState(initialWeeklyPanelPeriod);
  const [panelError, setPanelError] = useState('');
  const [adding, setAdding] = useState(false);

  const cmpSlots = slots.map((s) => ({ key: s.key, label: `${fmtDY(s.start)}–${fmtDY(s.end)}` }));

  async function handleAddSlot() {
    setPanelError('');
    const weeks = computeWeeksForMonth(panelPeriod.year, panelPeriod.month);
    const week = weeks.find((w) => w.index === panelPeriod.weekIndex);
    if (!week) return;
    const iso = isoDate(week.start.getFullYear(), week.start.getMonth() + 1, week.start.getDate());
    if (slots.some((s) => s.key === iso)) { setPanelError('Цей тиждень вже додано.'); return; }
    if (slots.length >= MAX_SLOTS) { alert(`Максимум ${MAX_SLOTS} тижнів для порівняння.`); return; }
    setAdding(true);
    try {
      const row = await fetchReportByWeekStart(iso);
      if (!row) { setPanelError('Звіт за цей тиждень ще не збережено.'); return; }
      const data = row.data || {};
      setSlots((prev) => [...prev, { key: iso, year: panelPeriod.year, month: panelPeriod.month, index: week.index, start: week.start, end: week.end, data, manager: data.manager || row.author || '' }]);
      setPanelOpen(false);
    } catch (e) {
      setPanelError('Помилка завантаження: ' + (e.message || e));
    } finally {
      setAdding(false);
    }
  }

  function removeSlot(key) {
    setSlots((prev) => prev.filter((s) => s.key !== key));
  }

  const financeIncomeRows = slots.length ? [
    ...INCOME_FIELDS.map((f) => ({ label: f.label, values: slots.map((s) => gv((id) => s.data[id], f.id)) })),
    { label: 'Total Income', hl: true, values: slots.map((s) => financeCalc((id) => s.data[id]).totalInc) },
  ] : [];

  const financeSummaryRows = slots.length ? [
    { label: 'Витрати — профілі', values: slots.map((s) => financeCalc((id) => s.data[id]).profilesTotal) },
    { label: 'Витрати — Manual Bidding', values: slots.map((s) => financeCalc((id) => s.data[id]).mbTotal) },
    { label: 'Витрати — GetMany', values: slots.map((s) => financeCalc((id) => s.data[id]).gmTotal) },
    { label: 'Витрати — LinkedIn', values: slots.map((s) => financeCalc((id) => s.data[id]).liTotal) },
    { label: 'Total Витрати', hl: true, values: slots.map((s) => financeCalc((id) => s.data[id]).allTotal) },
    { label: 'Total Income', values: slots.map((s) => financeCalc((id) => s.data[id]).totalInc) },
    { label: 'Прибуток', hl: true, values: slots.map((s) => financeCalc((id) => s.data[id]).profit) },
  ] : [];

  return (
    <>
      <p className="sub">Порівняйте до {MAX_SLOTS} збережених тижнів. Показники — тільки Факт, найкраще значення в кожному рядку виділено зеленим.</p>

      <div className="slots-row">
        {slots.map((s) => (
          <div className="slot-chip" key={s.key}>
            <b>{fmtDY(s.start)}–{fmtDY(s.end)}</b>
            {s.manager && <span>· {s.manager}</span>}
            <button type="button" onClick={() => removeSlot(s.key)} title="Прибрати">&times;</button>
          </div>
        ))}
        <button type="button" className="btn" onClick={() => setPanelOpen((o) => !o)}>+ Додати тиждень</button>
      </div>

      {panelOpen && (
        <WeekPicker
          year={panelPeriod.year}
          month={panelPeriod.month}
          weekIndex={panelPeriod.weekIndex}
          onChange={(next) => setPanelPeriod({ year: next.year, month: next.month, weekIndex: Math.min(next.weekIndex, computeWeeksForMonth(next.year, next.month).length) })}
          extra={
            <>
              <button type="button" className="btn btn-p" onClick={handleAddSlot} disabled={adding} style={{ alignSelf: 'flex-end' }}>
                {adding ? '...' : 'Додати'}
              </button>
              {panelError && <div className="save-state" style={{ color: 'var(--bad)' }}>{panelError}</div>}
            </>
          }
        />
      )}

      {!slots.length ? (
        <div className="cmp-empty">
          <p>Додайте принаймні один збережений тиждень, щоб почати порівняння.</p>
        </div>
      ) : (
        <>
          <div className="stitle">Upwork</div>
          {CHANNELS.map((c) => (
            <div key={c.key}>
              <CompareBlock title={`${c.title} — Показники`} slots={cmpSlots} rows={weeklyMetricRows(c, slots)} formatter={numFmt} />
              <CompareBlock title={`${c.title} — Конверсія`} slots={cmpSlots} rows={weeklyRatioRows(c, slots)} formatter={pctFmt} />
            </div>
          ))}

          <div className="stitle">LinkedIn</div>
          <CompareBlock title="LinkedIn — Показники" slots={cmpSlots} rows={weeklyMetricRows(LI_CHANNEL, slots)} formatter={numFmt} />
          <CompareBlock title="LinkedIn — Конверсія" slots={cmpSlots} rows={weeklyRatioRows(LI_CHANNEL, slots)} formatter={pctFmt} />

          <div className="stitle">Фінанси</div>
          <CompareBlock title="Дохід" slots={cmpSlots} rows={financeIncomeRows} formatter={moneyFmt} />
          <CompareBlock title="Витрати — профілі Upwork" slots={cmpSlots} rows={weeklyCostRows(COST_ITEMS.profiles, slots)} formatter={moneyFmt} />
          <CompareBlock title="Витрати — Manual Bidding" slots={cmpSlots} rows={weeklyCostRows(COST_ITEMS.mb, slots)} formatter={moneyFmt} />
          <CompareBlock title="Витрати — GetMany" slots={cmpSlots} rows={weeklyCostRows(COST_ITEMS.gm, slots)} formatter={moneyFmt} />
          <CompareBlock title="Витрати — LinkedIn" slots={cmpSlots} rows={weeklyCostRows(COST_ITEMS.li, slots)} formatter={moneyFmt} />
          <CompareBlock title="Підсумок" slots={cmpSlots} rows={financeSummaryRows} formatter={moneyFmt} />

          <div className="stitle">Клієнти</div>
          <CompareListBlock
            title="Клієнти"
            slots={cmpSlots}
            columns={slots.map((s) => (s.data.clients || []).map((c, i) => (
              <li key={i}>
                <b>{c.name || '—'}</b>
                <div className="cmp-tag">{c.platform} · {c.leadType}</div>
                {c.text}
              </li>
            )))}
          />

          <div className="stitle">Задачі</div>
          {WEEKLY_TASK_SECTIONS.map((sec) => (
            <CompareListBlock
              key={sec.key}
              title={sec.title}
              slots={cmpSlots}
              columns={slots.map((s) => (s.data.tasks?.[sec.key] || []).map((it, i) => <li key={i}>{it.text}</li>))}
            />
          ))}
        </>
      )}
    </>
  );
}

function MonthlyCompareSection() {
  const [slots, setSlots] = useState([]);
  const [panelOpen, setPanelOpen] = useState(false);
  const [panelPeriod, setPanelPeriod] = useState(initialMonthlyPanelPeriod);
  const [panelError, setPanelError] = useState('');
  const [adding, setAdding] = useState(false);

  const cmpSlots = slots.map((s) => ({ key: s.key, label: `${MONTH_NAMES[s.month - 1]} ${s.year}` }));

  async function handleAddSlot() {
    setPanelError('');
    const iso = isoDate(panelPeriod.year, panelPeriod.month, 1);
    if (slots.some((s) => s.key === iso)) { setPanelError('Цей місяць вже додано.'); return; }
    if (slots.length >= MAX_SLOTS) { alert(`Максимум ${MAX_SLOTS} місяців для порівняння.`); return; }
    setAdding(true);
    try {
      const row = await fetchMonthlyReportByStart(iso);
      if (!row) { setPanelError('Monthly Report за цей місяць ще не збережено.'); return; }
      setSlots((prev) => [...prev, { key: iso, year: panelPeriod.year, month: panelPeriod.month, data: row.data || {}, manager: row.author || '' }]);
      setPanelOpen(false);
    } catch (e) {
      setPanelError('Помилка завантаження: ' + (e.message || e));
    } finally {
      setAdding(false);
    }
  }

  function removeSlot(key) {
    setSlots((prev) => prev.filter((s) => s.key !== key));
  }

  const financeIncomeRows = slots.length ? [
    ...INCOME_FIELDS.map((f) => ({ label: f.label, values: slots.map((s) => gv((id) => s.data.sums?.[id], f.id)) })),
    { label: 'Total Income', hl: true, values: slots.map((s) => (s.data.finance?.total_inc ?? null)) },
  ] : [];

  const financeSummaryRows = slots.length ? [
    { label: 'Витрати — профілі', values: slots.map((s) => s.data.finance?.profiles_total ?? null) },
    { label: 'Витрати — Manual Bidding', values: slots.map((s) => s.data.finance?.mb_total ?? null) },
    { label: 'Витрати — GetMany', values: slots.map((s) => s.data.finance?.gm_total ?? null) },
    { label: 'Витрати — LinkedIn', values: slots.map((s) => s.data.finance?.li_total ?? null) },
    { label: 'Total Витрати', hl: true, values: slots.map((s) => s.data.finance?.all_total ?? null) },
    { label: 'Total Income', values: slots.map((s) => s.data.finance?.total_inc ?? null) },
    { label: 'Прибуток', hl: true, values: slots.map((s) => s.data.finance?.profit ?? null) },
  ] : [];

  return (
    <>
      <p className="sub">Оберіть до {MAX_SLOTS} будь-яких місяців (з будь-яких років) для порівняння. Найкраще значення в кожному рядку виділено зеленим.</p>

      <div className="slots-row">
        {slots.map((s) => (
          <div className="slot-chip" key={s.key}>
            <b>{MONTH_NAMES[s.month - 1]} {s.year}</b>
            {s.manager && <span>· {s.manager}</span>}
            <button type="button" onClick={() => removeSlot(s.key)} title="Прибрати">&times;</button>
          </div>
        ))}
        <button type="button" className="btn" onClick={() => setPanelOpen((o) => !o)}>+ Додати місяць</button>
      </div>

      {panelOpen && (
        <div className="picker">
          <div className="pk-field">
            <label>Рік</label>
            <select value={panelPeriod.year} onChange={(e) => setPanelPeriod((p) => ({ ...p, year: +e.target.value }))}>
              {[panelPeriod.year - 1, panelPeriod.year, panelPeriod.year + 1].map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <div className="pk-field">
            <label>Місяць</label>
            <select value={panelPeriod.month} onChange={(e) => setPanelPeriod((p) => ({ ...p, month: +e.target.value }))}>
              {MONTH_NAMES.map((name, i) => <option key={name} value={i + 1}>{name}</option>)}
            </select>
          </div>
          <button type="button" className="btn btn-p" onClick={handleAddSlot} disabled={adding} style={{ alignSelf: 'flex-end' }}>
            {adding ? '...' : 'Додати'}
          </button>
          {panelError && <div className="save-state" style={{ color: 'var(--bad)' }}>{panelError}</div>}
        </div>
      )}

      {!slots.length ? (
        <div className="cmp-empty">
          <p>Додайте принаймні один збережений місяць, щоб почати порівняння.</p>
        </div>
      ) : (
        <>
          <div className="stitle">Upwork</div>
          {CHANNELS.map((c) => (
            <div key={c.key}>
              <CompareBlock title={`${c.title} — Показники`} slots={cmpSlots} rows={monthlyMetricRows(c, slots)} formatter={numFmt} />
              <CompareBlock title={`${c.title} — Конверсія`} slots={cmpSlots} rows={monthlyRatioRows(c, slots)} formatter={fp} />
            </div>
          ))}

          <div className="stitle">LinkedIn</div>
          <CompareBlock title="LinkedIn — Показники" slots={cmpSlots} rows={monthlyMetricRows(LI_CHANNEL, slots)} formatter={numFmt} />
          <CompareBlock title="LinkedIn — Конверсія" slots={cmpSlots} rows={monthlyRatioRows(LI_CHANNEL, slots)} formatter={fp} />

          <div className="stitle">Фінанси</div>
          <CompareBlock title="Дохід" slots={cmpSlots} rows={financeIncomeRows} formatter={moneyFmt} />
          <CompareBlock title="Витрати — профілі Upwork" slots={cmpSlots} rows={monthlyCostRows(COST_ITEMS.profiles, slots)} formatter={moneyFmt} />
          <CompareBlock title="Витрати — Manual Bidding" slots={cmpSlots} rows={monthlyCostRows(COST_ITEMS.mb, slots)} formatter={moneyFmt} />
          <CompareBlock title="Витрати — GetMany" slots={cmpSlots} rows={monthlyCostRows(COST_ITEMS.gm, slots)} formatter={moneyFmt} />
          <CompareBlock title="Витрати — LinkedIn" slots={cmpSlots} rows={monthlyCostRows(COST_ITEMS.li, slots)} formatter={moneyFmt} />
          <CompareBlock title="Підсумок" slots={cmpSlots} rows={financeSummaryRows} formatter={moneyFmt} />

          <div className="stitle">Клієнти</div>
          <CompareListBlock
            title="Клієнти"
            slots={cmpSlots}
            columns={slots.map((s) => (s.data.clients || []).map((c, i) => (
              <li key={i}>
                <b>{c.name || '—'}</b>
                <div className="cmp-tag">{c.platform} · {c.leadType}</div>
                {c.text}
              </li>
            )))}
          />

          <div className="stitle">Задачі</div>
          {MONTHLY_TASK_SECTIONS.map((sec) => (
            <CompareListBlock
              key={sec.key}
              title={sec.title}
              slots={cmpSlots}
              columns={slots.map((s) => (s.data.tasks?.[sec.key] || []).map((it, i) => <li key={i}>{it.text}</li>))}
            />
          ))}
        </>
      )}
    </>
  );
}

export default function ReportsCompare() {
  const navigate = useNavigate();
  const pageRef = useRef(null);
  const [reportType, setReportType] = useState(null);
  const [exportingJPEG, setExportingJPEG] = useState(false);

  async function handleExportJPEG() {
    const today = isoDate(new Date().getFullYear(), new Date().getMonth() + 1, new Date().getDate());
    await exportJPEG(pageRef.current, `${reportType}_compare_${today}.jpg`, {
      onStart: () => setExportingJPEG(true),
      onEnd: () => setExportingJPEG(false),
    });
  }

  return (
    <div className="report-page reports-compare-page" ref={pageRef}>
      <div className="page-actions">
        <button type="button" className="btn" onClick={() => (reportType ? setReportType(null) : navigate(-1))}>
          &#8592; {reportType ? 'Змінити тип звіту' : 'Back'}
        </button>
        <div className="sp" />
        {reportType && (
          <button type="button" className="btn" onClick={handleExportJPEG} disabled={exportingJPEG}>
            {exportingJPEG ? '...' : <>&#8595; JPEG</>}
          </button>
        )}
      </div>

      <section className="rpt-hero">
        <h1>Compare</h1>
        {!reportType && <p className="sub">Оберіть тип звіту, який хочете порівняти.</p>}
      </section>

      {!reportType ? (
        <div className="compare-type-grid">
          <button type="button" className="compare-type-card" onClick={() => setReportType('weekly')}>
            <div className="ctc-title">Weekly Report</div>
            <div className="ctc-desc">Порівняти до {MAX_SLOTS} збережених тижнів.</div>
          </button>
          <button type="button" className="compare-type-card" onClick={() => setReportType('monthly')}>
            <div className="ctc-title">Monthly Report</div>
            <div className="ctc-desc">Порівняти до {MAX_SLOTS} збережених місяців.</div>
          </button>
        </div>
      ) : reportType === 'weekly' ? (
        <WeeklyCompareSection />
      ) : (
        <MonthlyCompareSection />
      )}
    </div>
  );
}
