import { useEffect, useRef, useState } from 'react';
import DayPicker from '../Reports/DayPicker';
import WeekPicker from '../Reports/Weekly/WeekPicker';
import EditableItemList from '../Reports/EditableItemList';
import {
  fetchProjectDailyReport, saveProjectDailyReport,
  fetchProjectWeeklyReport, saveProjectWeeklyReport,
  fetchProjectMonthlyReport, saveProjectMonthlyReport,
} from '../../lib/api/projectReports';
import { parseAdCsv, deriveRatios } from '../../lib/adCsvImport';
import { computeWeeksForMonth, defaultWeekIndexFor, defaultDayFor, isoDate, MONTH_NAMES } from '../../lib/dateHelpers';

const PLATFORMS = [
  { value: 'meta', label: 'Meta' },
  { value: 'google', label: 'Google' },
  { value: 'other', label: 'Інше' },
];

const TEXT_SECTIONS = [
  { key: 'whatWasDone', title: 'Що було зроблено' },
  { key: 'mostEffective', title: 'Найефективніші креативи' },
  { key: 'conclusion', title: 'Висновок' },
  { key: 'plansNext', title: 'Плани на наступний період' },
  { key: 'whatWorked', title: 'Що спрацювало' },
  { key: 'whatDidntWork', title: 'Що не спрацювало' },
];

const EMPTY_METRICS = { spend: 0, impressions: 0, reach: 0, clicks: 0, purchases: 0, revenue: 0 };

function emptyTextSections() {
  const t = {};
  TEXT_SECTIONS.forEach((s) => { t[s.key] = []; });
  return t;
}

function initialPeriod(periodType) {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  if (periodType === 'daily') return { year, month, day: defaultDayFor(year, month) };
  if (periodType === 'weekly') return { year, month, weekIndex: defaultWeekIndexFor(computeWeeksForMonth(year, month)) };
  return { year, month };
}

export default function AdReportForm({ projectId, periodType }) {
  const idRef = useRef(1);
  const makeId = () => idRef.current++;

  const [period, setPeriod] = useState(() => initialPeriod(periodType));
  const [platform, setPlatform] = useState('meta');
  const [metrics, setMetrics] = useState(EMPTY_METRICS);
  const [textSections, setTextSections] = useState(emptyTextSections);
  const [statusLabel, setStatusLabel] = useState('—');
  const saveTimerRef = useRef(null);
  const skipNextSaveRef = useRef(false);
  const skipNextLoadRef = useRef(false);

  const weeks = periodType === 'weekly' ? computeWeeksForMonth(period.year, period.month) : null;
  const currentWeek = weeks ? (weeks.find((w) => w.index === period.weekIndex) || weeks[0]) : null;

  function periodKey() {
    if (periodType === 'daily') return isoDate(period.year, period.month, period.day);
    if (periodType === 'weekly' && currentWeek) {
      return {
        start: isoDate(currentWeek.start.getFullYear(), currentWeek.start.getMonth() + 1, currentWeek.start.getDate()),
        end: isoDate(currentWeek.end.getFullYear(), currentWeek.end.getMonth() + 1, currentWeek.end.getDate()),
      };
    }
    return isoDate(period.year, period.month, 1);
  }

  function handlePeriodChange(next) {
    if (periodType === 'daily') {
      setPeriod(next);
    } else if (periodType === 'weekly') {
      const dim = computeWeeksForMonth(next.year, next.month).length;
      setPeriod({ year: next.year, month: next.month, weekIndex: Math.min(next.weekIndex, dim) });
    } else {
      setPeriod({ year: next.year, month: next.month });
    }
  }

  // Load whenever the project, period, or platform changes — each of those
  // three is part of the row's identity, so switching any one loads a
  // different (possibly not-yet-created) report.
  useEffect(() => {
    if (!projectId) return;
    if (skipNextLoadRef.current) { skipNextLoadRef.current = false; return; }
    let cancelled = false;
    setStatusLabel('Завантаження...');
    const key = periodKey();

    const fetchFn = periodType === 'daily'
      ? () => fetchProjectDailyReport(projectId, key, platform)
      : periodType === 'weekly'
        ? () => (key ? fetchProjectWeeklyReport(projectId, key.start, platform) : Promise.resolve(null))
        : () => fetchProjectMonthlyReport(projectId, key, platform);

    fetchFn()
      .then((row) => {
        if (cancelled) return;
        skipNextSaveRef.current = true;
        if (row?.data) {
          const d = row.data;
          setMetrics({ ...EMPTY_METRICS, ...Object.fromEntries(Object.keys(EMPTY_METRICS).map((k) => [k, d[k] ?? 0])) });
          const loadedText = emptyTextSections();
          TEXT_SECTIONS.forEach((s) => { loadedText[s.key] = (d[s.key] || []).map((it) => ({ id: makeId(), text: it.text })); });
          setTextSections(loadedText);
          setStatusLabel('Збережено ' + new Date(row.updated_at).toLocaleString('uk-UA'));
        } else {
          setMetrics(EMPTY_METRICS);
          setTextSections(emptyTextSections());
          setStatusLabel('Ще не збережено');
        }
      })
      .catch((e) => {
        if (cancelled) return;
        console.warn('load project report failed', e);
        setStatusLabel('Помилка завантаження');
      });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, periodType, platform, period.year, period.month, period.day, period.weekIndex]);

  // Autosave — debounced, skipped once right after a period/platform's data
  // finishes loading (same pattern as the Sales report Create pages).
  useEffect(() => {
    if (skipNextSaveRef.current) { skipNextSaveRef.current = false; return; }
    if (!projectId) return;
    clearTimeout(saveTimerRef.current);
    setStatusLabel('Зберігається...');
    saveTimerRef.current = setTimeout(async () => {
      try {
        const data = {
          ...metrics,
          ...Object.fromEntries(TEXT_SECTIONS.map((s) => [s.key, textSections[s.key].map((it) => ({ text: it.text }))])),
        };
        const key = periodKey();
        if (periodType === 'daily') {
          await saveProjectDailyReport({ projectId, reportDate: key, platform, data });
        } else if (periodType === 'weekly' && key) {
          await saveProjectWeeklyReport({ projectId, weekStart: key.start, weekEnd: key.end, platform, data });
        } else if (periodType === 'monthly') {
          await saveProjectMonthlyReport({ projectId, monthStart: key, platform, data });
        }
        setStatusLabel('Збережено ' + new Date().toLocaleString('uk-UA'));
      } catch (e) {
        console.warn('autosave failed', e);
        setStatusLabel('Помилка збереження');
      }
    }, 900);
    return () => clearTimeout(saveTimerRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [metrics, textSections]);

  function setMetric(key, value) {
    setMetrics((m) => ({ ...m, [key]: value === '' ? 0 : Number(value) }));
  }

  function handleCsvFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    const hasData = Object.values(metrics).some((v) => v > 0);
    if (hasData && !confirm('Замінити поточні значення метрик даними з CSV?')) { e.target.value = ''; return; }
    const reader = new FileReader();
    reader.onload = (ev) => {
      const parsed = parseAdCsv(ev.target.result);
      if (parsed.error) { alert(parsed.error); return; }
      // A platform switch here is just relabeling the report currently being
      // edited — it must NOT trigger the load effect to fetch (and clobber
      // these freshly-parsed values with) whatever the other platform's row
      // already holds for this same period.
      if (parsed.platform !== 'other' && parsed.platform !== platform) {
        skipNextLoadRef.current = true;
        setPlatform(parsed.platform);
      }
      setMetrics((m) => ({ ...m, ...parsed.totals }));
    };
    reader.readAsText(file, 'UTF-8');
    e.target.value = '';
  }

  const ratios = deriveRatios(metrics);

  // DayPicker/WeekPicker each already render their own `.picker` box — the
  // shared fields below are injected via their `extra` slot rather than
  // wrapped in a second `.picker`, which previously produced a nested
  // box-in-a-box with misaligned fields.
  const extra = (
    <>
      <div className="pk-field">
        <label>Платформа</label>
        <select value={platform} onChange={(e) => setPlatform(e.target.value)}>
          {PLATFORMS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
        </select>
      </div>
      <div className="pk-sp" />
      <label className="btn ad-csv-btn">
        &#8593; Завантажити CSV
        <input type="file" accept=".csv" hidden onChange={handleCsvFile} />
      </label>
      <div className="pk-field"><label>&nbsp;</label><div className="save-state">{statusLabel}</div></div>
    </>
  );

  return (
    <div className="ad-report-form">
      {periodType === 'daily' && <DayPicker year={period.year} month={period.month} day={period.day} onChange={handlePeriodChange} extra={extra} />}
      {periodType === 'weekly' && <WeekPicker year={period.year} month={period.month} weekIndex={period.weekIndex} onChange={handlePeriodChange} extra={extra} />}
      {periodType === 'monthly' && (
        <div className="picker">
          <div className="pk-field">
            <label>Рік</label>
            <select value={period.year} onChange={(e) => handlePeriodChange({ ...period, year: +e.target.value })}>
              {[period.year - 1, period.year, period.year + 1].map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <div className="pk-field">
            <label>Місяць</label>
            <select value={period.month} onChange={(e) => handlePeriodChange({ ...period, month: +e.target.value })}>
              {MONTH_NAMES.map((name, i) => <option key={name} value={i + 1}>{name}</option>)}
            </select>
          </div>
          {extra}
        </div>
      )}

      <section className="report-section">
        <div className="stitle">Метрики</div>
        <div className="ad-metrics-grid">
          <div className="pf">
            <label>Spend ($)</label>
            <input type="number" value={metrics.spend} onChange={(e) => setMetric('spend', e.target.value)} />
          </div>
          <div className="pf">
            <label>Impressions</label>
            <input type="number" value={metrics.impressions} onChange={(e) => setMetric('impressions', e.target.value)} />
          </div>
          <div className="pf">
            <label>Reach</label>
            <input type="number" value={metrics.reach} onChange={(e) => setMetric('reach', e.target.value)} />
          </div>
          <div className="pf">
            <label>Clicks</label>
            <input type="number" value={metrics.clicks} onChange={(e) => setMetric('clicks', e.target.value)} />
          </div>
          <div className="pf">
            <label>Purchases</label>
            <input type="number" value={metrics.purchases} onChange={(e) => setMetric('purchases', e.target.value)} />
          </div>
          <div className="pf">
            <label>Revenue ($)</label>
            <input type="number" value={metrics.revenue} onChange={(e) => setMetric('revenue', e.target.value)} />
          </div>
        </div>

        <div className="ad-stat-row">
          <div className="ad-stat"><div className="ad-stat-value">{ratios.ctr === null ? '—' : ratios.ctr.toFixed(2) + '%'}</div><div className="ad-stat-label">CTR</div></div>
          <div className="ad-stat"><div className="ad-stat-value">{ratios.cpc === null ? '—' : '$' + ratios.cpc.toFixed(2)}</div><div className="ad-stat-label">CPC</div></div>
          <div className="ad-stat"><div className="ad-stat-value">{ratios.cpm === null ? '—' : '$' + ratios.cpm.toFixed(2)}</div><div className="ad-stat-label">CPM</div></div>
          <div className="ad-stat"><div className="ad-stat-value">{ratios.roas === null ? '—' : ratios.roas.toFixed(2) + 'x'}</div><div className="ad-stat-label">ROAS</div></div>
          <div className="ad-stat"><div className="ad-stat-value">{ratios.romi === null ? '—' : ratios.romi.toFixed(1) + '%'}</div><div className="ad-stat-label">ROMI</div></div>
        </div>
      </section>

      {TEXT_SECTIONS.map((s) => (
        <section className="report-section" key={s.key}>
          <div className="stitle">{s.title}</div>
          <EditableItemList
            items={textSections[s.key]}
            onChange={(id, patch) => setTextSections((t) => ({ ...t, [s.key]: t[s.key].map((it) => (it.id === id ? { ...it, ...patch } : it)) }))}
            onAdd={() => setTextSections((t) => ({ ...t, [s.key]: [...t[s.key], { id: makeId(), text: '' }] }))}
            onRemove={(id) => setTextSections((t) => ({ ...t, [s.key]: t[s.key].filter((it) => it.id !== id) }))}
            emptyHint="Немає пунктів — додайте перший нижче"
            addLabel="Додати пункт"
          />
        </section>
      ))}
    </div>
  );
}
