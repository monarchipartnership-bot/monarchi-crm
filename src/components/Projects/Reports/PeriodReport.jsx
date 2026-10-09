import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import CompareModal from './CompareModal';
import ResultView from './ResultView';
import CampaignGroupsModal from './CampaignGroupsModal';
import CustomMetricModal from './CustomMetricModal';
import { useReportContext } from './useReportContext';
import { useConfirm } from '../../common/ConfirmDialog';
import AutoResizeTextarea from '../../Reports/AutoResizeTextarea';
import WeekPicker from '../../Reports/Weekly/WeekPicker';
import { daysInRange, fetchProjectRange, periodFromPicker, regroupData } from '../../../lib/periodReport';
import { fetchProjectReports, saveProjectReport, deleteProjectReport } from '../../../lib/api/projectReportStore';
import { fetchProjectDecks } from '../../../lib/api/projectDecks';
import { EMPTY_SECTIONS, buildWhatWasDone, comparisonPeriod, pullReportData, reportPayload } from '../../../lib/reportEngine';
import { platformInfo } from '../../../lib/adAccounts';
import { MONTH_NAMES, computeWeeksForMonth, defaultWeekIndexFor, todayIso, yearOptions } from '../../../lib/dateHelpers';
import { useAuth } from '../../../contexts/AuthContext';
import '../../../styles/projectReports.css';
import Select from '../../common/Select';

const TEXT_BLOCKS = [
  { key: 'whatWasDone', title: 'What was done' },
  { key: 'conclusion', title: 'Conclusion' },
  { key: 'plans', title: 'Plans for the next period' },
];
const STATUS = { draft: 'Чернетка', reviewed: 'Перевірено', final: 'Фінал' };
const fmt = (s) => s.split('-').reverse().join('.');

function initialPicker() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  return { year, month, weekIndex: defaultWeekIndexFor(computeWeeksForMonth(year, month)) };
}

// «Тижневий звіт» / «Місячний звіт»: pick the period, pull the numbers from the
// project's ad accounts together with the period before it for comparison, add
// the text, save. Reports made by hand and (later) by the AI agent sit in one list.
export default function PeriodReport({ projectId, periodType }) {
  const [confirm, confirmDialog] = useConfirm();
  const { email } = useAuth();
  const navigate = useNavigate();
  const ctx = useReportContext(projectId);
  const [picker, setPicker] = useState(initialPicker);
  const [saved, setSaved] = useState([]);
  const [decks, setDecks] = useState([]);
  const [savedLoaded, setSavedLoaded] = useState(false);
  const applied = useRef('');
  const [data, setData] = useState(null);
  const [sections, setSections] = useState(EMPTY_SECTIONS);
  const [note, setNote] = useState('');
  const [selection, setSelection] = useState([]);
  const [options, setOptions] = useState({ groups: true });
  const [status, setStatus] = useState('draft');
  const [meta, setMeta] = useState({ source: 'manual', id: null });
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState('');
  // The "What was done" helper: what it was built from (shown to the person, never printed in the report).
  const [work, setWork] = useState(null);
  const [message, setMessage] = useState('');
  const [errors, setErrors] = useState({});
  const [modal, setModal] = useState(null);
  // What the numbers are compared with. Nothing until the person asks («Порівняти»):
  //   { mode: 'calendar' } the previous report period (previous week of the month / previous month)
  //   { mode: 'days' }     the same number of days right before this period
  //   { mode: 'custom', from, to } any dates; null = no comparison.
  const [cmp, setCmp] = useState(null);
  const [askOff, setAskOff] = useState(() => { try { return localStorage.getItem('prep-ask-compare') === 'off'; } catch { return false; } });

  const period = periodFromPicker(periodType, picker);
  const prevFor = (c) => comparisonPeriod(periodType, picker, period, c);
  const prev = prevFor(cmp);
  const daysCur = daysInRange(period.start, period.end);
  const daysPrev = prev ? daysInRange(prev.start, prev.end) : daysCur;
  const unequal = daysCur !== daysPrev;
  const comparePresets = [
    { key: 'calendar', title: periodType === 'weekly' ? 'Попередній тиждень місяця' : 'Попередній місяць', hint: 'за календарем звітів', range: (() => { const q = prevFor({ mode: 'calendar' }); return { from: q.start, to: q.end }; })() },
    { key: 'days', title: `Попередні ${daysCur} дн.`, hint: 'така ж тривалість, одразу перед періодом', range: (() => { const q = prevFor({ mode: 'days' }); return { from: q.start, to: q.end }; })() },
  ];
  const unfinished = period.end >= todayIso();

  const reloadSaved = useCallback(async () => {
    const [rows, deckRows] = await Promise.all([fetchProjectReports(projectId, periodType), fetchProjectDecks(projectId)]);
    setSaved(rows);
    setDecks(deckRows.filter((d) => d.period_type === periodType));
    setSavedLoaded(true);
  }, [projectId, periodType]);
  useEffect(() => { setSavedLoaded(false); setSaved([]); applied.current = ''; reloadSaved(); }, [reloadSaved]);

  // Opening a period shows its saved report if there is one.
  useEffect(() => {
    if (!savedLoaded) return;
    const row = saved.find((r) => r.period_start === period.start);
    const key = `${projectId}|${periodType}|${period.start}`;
    const marker = `${key}|${row?.updated_at || ''}`;
    if (applied.current === marker) return;
    if (applied.current.startsWith(key + '|') && dirty) return; // keep what the person is typing
    applied.current = marker;
    if (row) {
      setData(row.data?.platforms ? { platforms: row.data.platforms, previous: row.data.previous || null } : null);
      setSections({ ...EMPTY_SECTIONS, ...(row.data?.sections || {}) });
      setNote(row.data?.note || '');
      setSelection(row.data?.selection || []);
      setOptions({ groups: true, ...(row.data?.options || {}) });
      setStatus(row.status);
      setMeta({ source: row.source, id: row.id });
      setCmp(row.data?.previous?.period ? (row.data.compare?.mode === 'custom' ? { mode: 'custom', from: row.data.previous.period.start, to: row.data.previous.period.end } : { mode: row.data.compare?.mode || 'calendar' }) : null);
    } else {
      setData(null);
      setSections(EMPTY_SECTIONS);
      setNote('');
      setSelection([]);
      setOptions({ groups: true });
      setCmp(null);
      setWork(null);
      setStatus('draft');
      setMeta({ source: 'manual', id: null });
    }
    setDirty(false);
    setMessage('');
    setErrors({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saved, savedLoaded, period.start, projectId, periodType, dirty]);

  async function changePicker(next) {
    if (dirty && !(await confirm({ title: 'Незбережені зміни', body: 'Є незбережені зміни в цьому звіті. Перейти до іншого періоду без збереження?', confirmLabel: 'Перейти без збереження', cancelLabel: 'Залишитись' }))) return;
    if (periodType === 'weekly') {
      const dim = computeWeeksForMonth(next.year, next.month).length;
      setPicker({ year: next.year, month: next.month, weekIndex: Math.min(next.weekIndex || 1, dim) });
    } else {
      setPicker({ year: next.year, month: next.month, weekIndex: 1 });
    }
  }

  async function pull(c = cmp) {
    const pv = prevFor(c);
    setBusy('pull');
    setMessage('');
    try {
      const pulled = await pullReportData({ accounts: ctx.accounts, kind: ctx.kind, groups: ctx.groups, period, prev: pv });
      setErrors(pulled.errors);
      setData(pulled.data);
      setDirty(true);
      // The period is on screen: offer a comparison (unless it is set already or switched off).
      if (!c && !askOff) setModal('ask');
    } catch (e) {
      setMessage(e.message || 'Не вдалося отримати дані.');
    } finally {
      setBusy('');
    }
  }

  // Adds / changes / removes the comparison of the numbers already pulled, without asking the accounts for the period again.
  async function applyCompare(c) {
    setCmp(c);
    setModal(null);
    if (!data) return;
    setDirty(true);
    if (!c) { setData((d) => ({ ...d, previous: null })); return; }
    const pv = prevFor(c);
    setBusy('pull');
    try {
      const before = await fetchProjectRange(ctx.accounts, pv.start, pv.end, ctx.kind, ctx.groups);
      setData((d) => ({ ...d, previous: { period: { start: pv.start, end: pv.end }, platforms: before.platforms } }));
    } catch (e) {
      setMessage(e.message || 'Не вдалося отримати дані для порівняння.');
    } finally {
      setBusy('');
    }
  }

  function neverAsk() {
    setAskOff(true);
    try { localStorage.setItem('prep-ask-compare', 'off'); } catch { /* optional */ }
  }

  async function save(nextStatus = status) {
    setBusy('save');
    setMessage('');
    try {
      const row = await saveProjectReport({
        projectId, periodType, periodStart: period.start, periodEnd: period.end, status: nextStatus,
        source: meta.source, createdBy: email,
        data: reportPayload({ kind: ctx.kind, data, compare: cmp, period, prev, selection, options, sections, note }),
      });
      setStatus(row.status);
      setDirty(false);
      await reloadSaved();
      setMessage('Звіт збережено.');
    } catch (e) {
      setMessage((e.message || 'Не вдалося зберегти.') + ' Якщо це перше збереження, перевірте, що застосовано міграцію 20261008000000.');
    } finally {
      setBusy('');
    }
  }

  async function remove(row) {
    if (!(await confirm({ title: 'Видалити звіт?', body: 'Видалити збережений звіт? Дію не можна скасувати.', confirmLabel: 'Видалити звіт', danger: true }))) return;
    try { await deleteProjectReport(row.id); await reloadSaved(); } catch (e) { setMessage(e.message || 'Не вдалося видалити.'); }
  }

  function openSaved(row) {
    const [y, m] = row.period_start.split('-').map(Number);
    if (periodType === 'monthly') { changePicker({ year: y, month: m, weekIndex: 1 }); return; }
    const weeks = computeWeeksForMonth(y, m);
    const idx = weeks.find((w) => `${w.start.getFullYear()}-${String(w.start.getMonth() + 1).padStart(2, '0')}-${String(w.start.getDate()).padStart(2, '0')}` === row.period_start)?.index || 1;
    changePicker({ year: y, month: m, weekIndex: idx });
  }

  // "What was done" from the accounts' change history (weekly) or from the month's weekly lists (monthly).
  async function fillWhatWasDone(kind) {
    if (sections.whatWasDone.trim() && !(await confirm({ title: 'Замінити текст?', body: 'Поточний текст «What was done» буде замінено. Продовжити?', confirmLabel: 'Замінити', cancelLabel: 'Залишити' }))) return;
    setBusy('work');
    setMessage('');
    setWork(null);
    try {
      const weeklyRows = kind === 'weeks' ? await fetchProjectReports(projectId, 'weekly') : [];
      const result = await buildWhatWasDone({
        source: kind === 'weeks' ? 'weeks' : 'history', periodType, period, accounts: ctx.accounts, projectName: ctx.project.name, note,
        weeklyRows, expectedWeeks: computeWeeksForMonth(picker.year, picker.month).length,
      });
      if (result.empty) { setWork({ ...result.info, empty: result.empty }); return; }
      setSections((s) => ({ ...s, whatWasDone: result.text }));
      setDirty(true);
      setWork({ ...result.info, writer: result.writer });
    } catch (e) {
      setMessage(e.message || 'Не вдалося сформувати текст.');
    } finally {
      setBusy('');
    }
  }

  if (ctx.error) return <div className="proj-empty">{ctx.error}</div>;
  if (!ctx.ready) return <div className="empty-hint">Завантаження...</div>;

  const campaignNames = data ? [...new Set(Object.values(data.platforms).flatMap((p) => p.campaigns.map((c) => c.name)))] : [];
  const first = data ? Object.values(data.platforms)[0] : null;
  const hasAccounts = ctx.accounts.length > 0;

  return (
    <div className="prep-wrap">
      <section className="report-section">
        {periodType === 'weekly' ? (
          <WeekPicker year={picker.year} month={picker.month} weekIndex={picker.weekIndex} onChange={changePicker} years={yearOptions()} />
        ) : (
          <div className="picker">
            <div className="pk-field">
              <label>Рік</label>
              <Select value={picker.year} onChange={(v) => changePicker({ ...picker, year: v })} ariaLabel="Рік" options={yearOptions().map((y) => ({ value: y, label: String(y) }))} />
            </div>
            <div className="pk-field">
              <label>Місяць</label>
              <Select value={picker.month} onChange={(v) => changePicker({ ...picker, month: v })} ariaLabel="Місяць" options={MONTH_NAMES.map((name, i) => ({ value: i + 1, label: name }))} />
            </div>
          </div>
        )}
        <div className="prep-period-line">
          <b>{period.label}</b> · {fmt(period.start)} – {fmt(period.end)}{prev ? ` · порівняння з ${fmt(prev.start)} – ${fmt(prev.end)}` : ''}
          {meta.id && <span className={'pacc-pill prep-src prep-src--' + meta.source}>{meta.source === 'agent' ? 'AI-агент' : 'Вручну'}</span>}
        </div>
        <div className="prep-actions">
          <button type="button" className="btn btn-p" onClick={() => pull()} disabled={!hasAccounts || busy === 'pull'}>{busy === 'pull' ? 'Завантаження…' : data ? 'Оновити з кабінетів' : 'Підтягнути з кабінетів'}</button>
          <button type="button" className={'btn' + (cmp ? ' prep-btn-on' : '')} onClick={() => setModal('compare')} disabled={busy === 'pull'}>
            {cmp && prev ? `Порівняння: ${fmt(prev.start)}–${fmt(prev.end)}` : 'Порівняти'}
          </button>
          <button type="button" className="btn" onClick={() => setModal('groups')}>Групи кампаній</button>
          <button type="button" className="btn" onClick={() => setModal('metric')}>+ Метрика</button>
          {!hasAccounts && <span className="pacc-hint">Підключіть рекламний кабінет на вкладці «Огляд», щоб тягнути цифри автоматично.</span>}
        </div>
      </section>

      {Object.entries(errors).map(([p, msg]) => <div className="pacc-err" key={p}>{p}: {msg}</div>)}

      {data && unfinished && (
        <div className="prep-internal-note" role="note">
          <b>Тільки для внутрішнього користування.</b> Період ще не завершився: у звіті дані до сьогоднішнього дня, тому з попереднім повним періодом порівнювати суми рано. Попередження не потрапляє у презентацію та експорт.
        </div>
      )}

      {data?.previous && unequal && (
        <div className="prep-internal-note" role="note">
          <b>Тільки для внутрішнього користування.</b> Періоди різної тривалості: {daysCur} дн. проти {daysPrev} дн. Суми (витрати, покази, кліки, продажі) порівнювати некоректно, дивіться відносні показники (CTR, CPC, CPM, ROAS, AOV) або оберіть «Попередніми {daysCur} дн.». Це попередження не потрапляє у презентацію та експорт.
        </div>
      )}

      {data && Object.keys(data.platforms).length > 0 && (
        <section className="report-section">
          <ResultView
            data={data} kind={ctx.kind} custom={ctx.custom}
            title={ctx.project.name} subtitle={period.label}
            fileBase={`${ctx.project.name}_${periodType}_${period.start}`}
            campaignMode="selected" selection={selection} onSelectionChange={(s) => { setSelection(s); setDirty(true); }}
            options={options} onOptionsChange={(o) => { setOptions(o); setDirty(true); }}
            curLabel={`${fmt(period.start)} – ${fmt(period.end)}`}
            prevLabel={data.previous?.period ? `${fmt(data.previous.period.start)} – ${fmt(data.previous.period.end)}` : 'Попередній'}
          />
        </section>
      )}

      <section className="report-section">
        <div className="stitle">Текст звіту (англійською)</div>
        <div className="prep-texts">
          {TEXT_BLOCKS.map((b) => (
            <div className="ov-field-box" key={b.key}>
              <div className="ov-field-label">{b.title}</div>
              <AutoResizeTextarea value={sections[b.key]} onChange={(v) => { setSections((s) => ({ ...s, [b.key]: v })); setDirty(true); }} placeholder={b.title + '…'} />
              {b.key === 'whatWasDone' && (
                <div className="prep-work">
                  <div className="prep-work-actions">
                    {periodType === 'monthly' && (
                      <button type="button" className="btn" onClick={() => fillWhatWasDone('weeks')} disabled={busy === 'work'}>{busy === 'work' ? 'Формуємо…' : 'Зібрати з тижневих звітів'}</button>
                    )}
                    <button type="button" className={'btn' + (periodType === 'weekly' ? ' btn-p' : '')} onClick={() => fillWhatWasDone('history')} disabled={busy === 'work' || !hasAccounts}>{busy === 'work' ? 'Формуємо…' : 'Сформувати з історії кабінетів'}</button>
                    {!hasAccounts && <span className="pacc-hint">Потрібен підключений кабінет.</span>}
                  </div>
                  {work && (
                    <div className="prep-internal-note" role="note">
                      <b>Тільки для внутрішнього користування.</b>{' '}
                      {work.empty || (work.kind === 'weeks'
                        ? `Текст зібрано з тижневих звітів: ${work.weeks.join('; ')}.${work.missing > 0 ? ` Тижнів без тексту: ${work.missing}.` : ''}`
                        : `Текст написано за ${work.facts.length} діями з кабінетів (системні сповіщення відфільтровано).`)}
                      {work.writer === 'plain' && ' Автоматичне оформлення зараз недоступне, тому показано сирий список дій: відредагуйте його.'}
                      {work.notes?.map((n) => <div key={n}>{n}</div>)}
                      {Object.entries(work.errors || {}).map(([p, m]) => <div key={p}>{p}: {m}</div>)}
                      {work.facts?.length > 0 && (
                        <details className="prep-work-facts"><summary>Які дії враховано</summary><ul>{work.facts.map((f) => <li key={f}>{f}</li>)}</ul></details>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
          <div className="ov-field-box">
            <div className="ov-field-label">Нотатка менеджера (контекст для AI-агента, у звіт не потрапляє)</div>
            <AutoResizeTextarea value={note} onChange={(v) => { setNote(v); setDirty(true); }} placeholder="Напр.: у вересні тестуємо Labor Day, акцент на RTS…" />
          </div>
        </div>
        <div className="prep-save-row">
          <div className="pk-field">
            <label>Статус</label>
            <Select value={status} onChange={(v) => { setStatus(v); setDirty(true); }} ariaLabel="Статус" options={Object.entries(STATUS).map(([v, l]) => ({ value: v, label: l }))} />
          </div>
          <button type="button" className="btn btn-p" onClick={() => save()} disabled={busy === 'save' || (!data && !sections.whatWasDone && !sections.conclusion && !sections.plans)}>
            {busy === 'save' ? '...' : 'Зберегти звіт'}
          </button>
          <button
            type="button" className="btn" disabled={!meta.id || dirty || !data || !Object.keys(data.platforms).length}
            title={!meta.id ? 'Спершу збережіть звіт' : dirty ? 'Збережіть зміни у звіті' : 'Відкрити презентацію для клієнта з цього звіту'}
            onClick={() => navigate(`/clients?project=${projectId}&type=${periodType}&start=${period.start}&platform=${Object.keys(data.platforms)[0]}`)}
          >
            Створити презентацію
          </button>
          {dirty && <span className="pacc-hint">Є незбережені зміни</span>}
          {message && <span className="pacc-hint">{message}</span>}
        </div>
      </section>

      <section className="report-section">
        <div className="stitle">Збережені звіти</div>
        {saved.length === 0 ? (
          <div className="empty-hint">Збережених звітів ще немає.</div>
        ) : (
          <table className="prep-table prep-saved">
            <thead><tr><th>Період</th><th>Джерело</th><th>Статус</th><th>Оновлено</th><th>Презентація</th><th /></tr></thead>
            <tbody>
              {saved.map((r) => (
                <tr key={r.id} className={r.period_start === period.start ? 'on' : ''}>
                  <td className="lbl"><button type="button" className="pacc-link" onClick={() => openSaved(r)}>{fmt(r.period_start)} – {fmt(r.period_end)}</button></td>
                  <td><span className={'pacc-pill prep-src prep-src--' + r.source}>{r.source === 'agent' ? 'AI-агент' : 'Вручну'}</span></td>
                  <td>{STATUS[r.status] || r.status}</td>
                  <td className="muted">{new Date(r.updated_at).toLocaleString('uk-UA')}</td>
                  <td>
                    <div className="prep-deckcell">
                      {Object.keys(r.data?.platforms || {}).map((p, _i, all) => {
                        const has = decks.some((d) => d.period_start === r.period_start && d.platform === p);
                        return (
                          <button
                            key={p} type="button" className="pacc-link"
                            onClick={() => navigate(`/clients?project=${projectId}&type=${periodType}&start=${r.period_start}&platform=${p}`)}
                          >
                            {has ? 'Відкрити презентацію' : 'Створити презентацію'}{all.length > 1 ? ` · ${platformInfo(p).label}` : ''}
                          </button>
                        );
                      })}
                    </div>
                  </td>
                  <td className="num"><button type="button" className="pacc-link pacc-link--danger" onClick={() => remove(r)}>Видалити</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {(modal === 'compare' || modal === 'ask') && (
        <CompareModal
          offer={modal === 'ask'} current={{ from: period.start, to: period.end }} presets={comparePresets} value={cmp}
          onApply={applyCompare} onClose={() => setModal(null)} onNeverAsk={neverAsk}
        />
      )}
      {modal === 'groups' && (
        <CampaignGroupsModal projectId={projectId} groups={ctx.groups} campaignNames={campaignNames} onClose={() => setModal(null)}
          onSaved={async () => { const g = await ctx.reloadGroups(); setData((d) => (d ? regroupData(d, g) : d)); setDirty(true); }} />
      )}
      {modal === 'metric' && (
        <CustomMetricModal projectId={projectId} custom={ctx.custom} onClose={() => setModal(null)} onChanged={ctx.reloadCustom}
          sample={first ? { base: first.total, currency: first.currency, label: 'весь акаунт' } : null} />
      )}
      {confirmDialog}
    </div>
  );
}
