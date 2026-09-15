import { useEffect, useMemo, useRef, useState } from 'react';
import MonthlyChannelBlock from '../../../components/Reports/Monthly/MonthlyChannelBlock';
import MonthlyFinanceSection from '../../../components/Reports/Monthly/MonthlyFinanceSection';
import EditableItemList from '../../../components/Reports/EditableItemList';
import EditableClientList from '../../../components/Reports/EditableClientList';
import { fetchWeeklyRowsForMonth, fetchMonthlyReportByStart, saveMonthlyReport } from '../../../lib/api/monthlyReports';
import { fetchAllProfiles } from '../../../lib/api/profile';
import { fetchCustomTags, saveCustomTag } from '../../../lib/api/customTags';
import { computeSums, findMissingWeeks } from '../../../lib/monthlyLogic';
import { aggregateClientsFromWeeks, aggregateTasksFromWeeks, buildMonthSummary } from '../../../lib/monthlyAggregation';
import { fetchTasksForMonth } from '../../../lib/api/tasks';
import { deriveTaskStatus, STATUS_LABELS } from '../../../lib/taskStatus';
import { computeWeeksForMonth, MONTH_NAMES, fmtDate, isoDate, yearOptions } from '../../../lib/dateHelpers';
import { CHANNELS, LI_CHANNEL, pct, achievement, toNum } from '../../../lib/weeklyLogic';
import { CLIENT_PLATFORMS, CLIENT_TYPES } from '../../../lib/reportConstants';
import { exportPDF, exportJPEG } from '../../../lib/exportHelpers';
import { SECTION_ICONS, CHANNEL_ICONS } from '../../../lib/reportIcons';
import { FIELD_ICONS } from '../../../lib/taskFieldIcons';
import { DUE_STATUS_ICONS } from '../../../lib/dueStatusIcons';
import DeltaBadge from '../../../components/Automation/DeltaBadge';
import fiverrLogo from '../../../assets/logos/fiverr.png';
import linkedinLogo from '../../../assets/logos/linkedin.png';
import facebookLogo from '../../../assets/logos/facebook.png';
import instagramLogo from '../../../assets/logos/instagram.png';
import redditLogo from '../../../assets/logos/reddit.png';
import '../../../styles/reportPage.css';
import '../../../styles/automationTasksPage.css';
import '../../../styles/automationDashboard.css';

// Same "Ліди vs Cover Letters" split confirmed for Weekly/Annual Report —
// see the field dictionary. mb/gm/li send real outreach (Cover Letters /
// Connections); organic channels (Invites/DM/Consultations/Project
// Catalog) are inbound, so they're excluded from Cover Letters and instead
// feed Відповіді via their own Кількість (no separate Answers step there).
const COVER_LETTERS_PAIRS = [
  ['mb_cl', 'pp_mb_cl'], ['gm_cl', 'pp_gm_cl'], ['li_conn', 'pp_li_conn'],
];
const RESPONSES_PAIRS = [
  ['mb_a', 'pp_mb_a'], ['gm_a', 'pp_gm_a'], ['li_answers', 'pp_li_a'],
  ['ol_inv', 'pp_ol_inv'], ['ol_dm', 'pp_ol_dm'], ['ol_con', 'pp_ol_con'], ['ol_pc', 'pp_ol_pc'],
];

function sumPairs(pairs, idx, getValue) {
  return pairs.reduce((s, pair) => s + toNum(getValue(pair[idx])), 0);
}

function relPctDelta(cur, prev) {
  if (!prev) return null;
  return Math.round(((cur - prev) / prev) * 100);
}

function prevPeriodOf(year, month) {
  return month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };
}

// "Інші платформи" tabs — every CLIENT_PLATFORMS entry except Upwork (which
// already has its own dedicated tabbed section above). Only LinkedIn has a
// real data model (LI_CHANNEL) wired up so far; the rest show a stub until
// their own metrics are built out. Same list/logos as Weekly Report.
const OTHER_PLATFORMS = CLIENT_PLATFORMS.filter((p) => p !== 'Upwork');
const OTHER_PLATFORM_LOGOS = { Fiverr: fiverrLogo, LinkedIn: linkedinLogo, Facebook: facebookLogo, Instagram: instagramLogo, Reddit: redditLogo };
const GENERIC_PLATFORM_ICON = '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/></svg>';

// t_plan/t_done used to be manually-entered lists auto-filled by fuzzy
// text-matching (aggregateTasksFromWeeks); they're now a real read-only
// rollup of the shared `tasks` engine (see monthSalesTasks) — only
// t_next/t_conc are still hand-edited here.
const TASK_SECTIONS = [
  { key: 't_next', title: 'Плани на наступний місяць', auto: false },
  { key: 't_conc', title: 'Висновки', auto: false },
];

const ACTIVITY_TAGS = ['Дзвінок', 'Лист', 'Зустріч', 'Proposal', 'Follow-up'];
const TAG_CONTEXT = 'sales_activity';
const CLIENT_PAGE_SIZE = 10;
const SEARCH_ICON = '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.35-4.35"/></svg>';
const FILTER_ICON = '<svg viewBox="0 0 24 24"><path d="M4 4h16l-6.5 8v6l-3 1.5v-7.5z"/></svg>';

function profileLabel(p) {
  const full = `${p.first_name || ''} ${p.last_name || ''}`.trim();
  return full || p.email;
}

function initialPeriod() {
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
}

export default function MonthlyCreate() {
  const pageRef = useRef(null);
  const idRef = useRef(1);
  const makeId = () => idRef.current++;

  const [period, setPeriod] = useState(initialPeriod);
  const [manager, setManager] = useState('');
  const [sums, setSums] = useState({});
  const [prevMonthData, setPrevMonthData] = useState(null);
  const [ratioPct, setRatioPct] = useState({});
  const [fin, setFin] = useState({ profiles_total: 0, mb_total: 0, gm_total: 0, li_total: 0, all_total: 0, total_inc: 0, profit: 0 });
  const [weeksFound, setWeeksFound] = useState(0);
  const [weeksTotal, setWeeksTotal] = useState(0);
  const [missingWeeks, setMissingWeeks] = useState([]);
  const [clients, setClients] = useState([]);
  const [tasks, setTasks] = useState({ t_next: [], t_conc: [] });
  const [legacyPlan, setLegacyPlan] = useState([]);
  const [legacyDone, setLegacyDone] = useState([]);
  const [monthSalesTasks, setMonthSalesTasks] = useState([]);
  const [statusLabel, setStatusLabel] = useState('—');
  const [capturing, setCapturing] = useState(false);
  const [exportingJPEG, setExportingJPEG] = useState(false);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [profiles, setProfiles] = useState([]);
  const [activeChannel, setActiveChannel] = useState(CHANNELS[0].key);
  const [activeOtherPlatform, setActiveOtherPlatform] = useState('LinkedIn');
  const [tagSuggestions, setTagSuggestions] = useState(ACTIVITY_TAGS);
  const [clientSearch, setClientSearch] = useState('');
  const [clientPlatformFilter, setClientPlatformFilter] = useState('');
  const [clientTypeFilter, setClientTypeFilter] = useState('');
  const [clientFilterOpen, setClientFilterOpen] = useState(false);
  const [clientPage, setClientPage] = useState(1);
  const saveTimerRef = useRef(null);
  const skipNextSaveRef = useRef(false);
  const clientFilterRef = useRef(null);

  useEffect(() => {
    fetchAllProfiles().then(setProfiles);
    fetchCustomTags(TAG_CONTEXT).then((saved) => {
      if (saved.length) setTagSuggestions((prev) => [...new Set([...prev, ...saved])]);
    });
  }, []);

  useEffect(() => {
    if (!clientFilterOpen) return;
    function onDocClick(e) {
      if (clientFilterRef.current && !clientFilterRef.current.contains(e.target)) setClientFilterOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [clientFilterOpen]);

  // Report's own manager field stores a display label, not an email —
  // looked up here since tasks.assignee_email is always an email.
  const managerEmail = useMemo(() => profiles.find((p) => profileLabel(p) === manager)?.email || '', [profiles, manager]);

  useEffect(() => {
    if (!managerEmail) { setMonthSalesTasks([]); return; }
    let cancelled = false;
    const startIso = isoDate(period.year, period.month, 1);
    const dim = new Date(period.year, period.month, 0).getDate();
    const endIso = isoDate(period.year, period.month, dim);
    fetchTasksForMonth(startIso, endIso, 'sales')
      .then((rows) => { if (!cancelled) setMonthSalesTasks(rows.filter((t) => t.assignee_email === managerEmail)); })
      .catch((e) => console.warn('load month sales tasks failed', e));
    return () => { cancelled = true; };
  }, [period.year, period.month, managerEmail]);

  function handleNewTag(tag) {
    setTagSuggestions((prev) => (prev.includes(tag) ? prev : [...prev, tag]));
    saveCustomTag(TAG_CONTEXT, tag);
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setStatusLabel('Завантаження…');
      const expectedWeeks = computeWeeksForMonth(period.year, period.month);
      const rows = await fetchWeeklyRowsForMonth(period.year, period.month);
      if (cancelled) return;
      skipNextSaveRef.current = true;

      const agg = computeSums(rows);
      setSums(agg.sums);
      setRatioPct(agg.ratioPct);
      setFin(agg.fin);
      setWeeksFound(rows.length);
      setWeeksTotal(expectedWeeks.length);
      setMissingWeeks(findMissingWeeks(rows, expectedWeeks));

      const aggregatedClients = aggregateClientsFromWeeks(rows);
      if (!cancelled) { setLegacyPlan(aggregateTasksFromWeeks(rows, 't_plan')); setLegacyDone(aggregateTasksFromWeeks(rows, 't_done')); }

      const { year: prevYear, month: prevMonth } = prevPeriodOf(period.year, period.month);
      try {
        const prevSnapshot = await fetchMonthlyReportByStart(isoDate(prevYear, prevMonth, 1));
        if (cancelled) return;
        setPrevMonthData(prevSnapshot?.data || null);
      } catch (e) {
        console.warn('load previous month snapshot failed', e);
        setPrevMonthData(null);
      }

      let manualManager = '';
      let manualTasks = { t_next: [], t_conc: [] };
      let manualClients = [];
      try {
        const snapshot = await fetchMonthlyReportByStart(isoDate(period.year, period.month, 1));
        if (cancelled) return;
        if (snapshot) {
          manualManager = snapshot.author || '';
          manualTasks.t_next = snapshot.data?.tasks?.t_next || [];
          manualTasks.t_conc = snapshot.data?.tasks?.t_conc || [];
          manualClients = snapshot.data?.clients || [];
          setStatusLabel('Збережено ' + new Date(snapshot.updated_at).toLocaleString('uk-UA'));
        } else {
          setStatusLabel('Ще не збережено');
        }
      } catch (e) {
        console.warn('load monthly snapshot failed', e);
        setStatusLabel('Помилка завантаження');
      }
      if (cancelled) return;
      skipNextSaveRef.current = true;

      setManager(manualManager);
      setTasks({
        t_next: manualTasks.t_next.map((it) => ({ id: makeId(), text: it.text, tag: it.tag || '' })),
        t_conc: manualTasks.t_conc.map((it) => ({ id: makeId(), text: it.text, tag: it.tag || '' })),
      });
      const clientList = aggregatedClients.length ? aggregatedClients : manualClients;
      setClients(clientList.map((c) => ({ ...c, id: makeId() })));
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period.year, period.month]);

  function handleGenerateSummary() {
    const text = buildMonthSummary({
      doneCount: monthSalesTasks.length ? monthSalesTasks.filter((t) => deriveTaskStatus(t) === 'done').length : legacyDone.length,
      planCount: monthSalesTasks.length || legacyPlan.length,
      clients,
      monthName: MONTH_NAMES[period.month - 1],
      year: period.year,
    });
    setTasks((t) => ({ ...t, t_conc: [...t.t_conc, { id: makeId(), text }] }));
  }

  // Autosave — debounced across manager/clients/tasks edits and re-fires
  // whenever the auto-derived weekly aggregation (sums/ratioPct/fin/weeks*)
  // changes; skipped once right after a period finishes loading so
  // re-populating the form doesn't immediately re-save it.
  useEffect(() => {
    if (skipNextSaveRef.current) { skipNextSaveRef.current = false; return; }
    clearTimeout(saveTimerRef.current);
    setStatusLabel('Зберігається...');
    saveTimerRef.current = setTimeout(async () => {
      try {
        const data = {
          _type: 'monarchi_monthly_report',
          _version: 2,
          manager,
          sums,
          ratioPct,
          finance: fin,
          weeks_found: weeksFound,
          weeks_total: weeksTotal,
          // Real counts from the tasks engine — kept alongside (not inside)
          // the archived t_next/t_conc JSON so next month's "vs минулий
          // місяць" comparison keeps working without re-deriving history.
          tasks_done_count: monthSalesTasks.filter((t) => deriveTaskStatus(t) === 'done').length,
          tasks_total_count: monthSalesTasks.length,
          tasks: Object.fromEntries(TASK_SECTIONS.map((s) => [s.key, tasks[s.key].map((it) => ({ text: it.text, tag: it.tag || '' }))])),
          clients: clients.map((c) => ({ name: c.name || '', platform: c.platform, leadType: c.leadType, text: c.text })),
        };
        await saveMonthlyReport({ year: period.year, month: period.month, manager, weeksFound, weeksTotal, data });
        setStatusLabel('Збережено ' + new Date().toLocaleString('uk-UA'));
      } catch (e) {
        console.warn('autosave failed', e);
        setStatusLabel('Помилка збереження');
      }
    }, 900);
    return () => clearTimeout(saveTimerRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [manager, clients, tasks, sums, ratioPct, fin, weeksFound, weeksTotal, monthSalesTasks]);

  async function handleExportJPEG() {
    await exportJPEG(pageRef.current, `monthly_report_${period.year}-${String(period.month).padStart(2, '0')}.jpg`, {
      onStart: () => { setExportingJPEG(true); setCapturing(true); },
      onEnd: () => { setExportingJPEG(false); setCapturing(false); },
    });
  }

  function handleAddClient() {
    setClientSearch('');
    setClientPlatformFilter('');
    setClientTypeFilter('');
    setClients((c) => [...c, { id: makeId(), platform: CLIENT_PLATFORMS[0], leadType: CLIENT_TYPES[0], name: '', text: '' }]);
    setClientPage(Infinity); // clamped to the real last page below, so the new row is visible
  }

  const activeClientFilterCount = [clientPlatformFilter, clientTypeFilter].filter(Boolean).length;
  const filteredClients = clients.filter((c) => {
    if (clientSearch.trim() && !(c.name || '').toLowerCase().includes(clientSearch.trim().toLowerCase())) return false;
    if (clientPlatformFilter && c.platform !== clientPlatformFilter) return false;
    if (clientTypeFilter && c.leadType !== clientTypeFilter) return false;
    return true;
  });
  const clientPageCount = Math.max(1, Math.ceil(filteredClients.length / CLIENT_PAGE_SIZE));
  const clampedClientPage = Math.min(clientPage, clientPageCount);
  const pagedClients = filteredClients.slice((clampedClientPage - 1) * CLIENT_PAGE_SIZE, clampedClientPage * CLIENT_PAGE_SIZE);
  const clientRangeStart = filteredClients.length ? (clampedClientPage - 1) * CLIENT_PAGE_SIZE + 1 : 0;
  const clientRangeEnd = Math.min(clampedClientPage * CLIENT_PAGE_SIZE, filteredClients.length);

  // ---- KPI summary row — same Cover Letters/Відповіді/Конверсія split as
  // Weekly Report, just summed from the month's already-aggregated `sums`
  // instead of one week's raw input fields. "vs минулий місяць" compares
  // against the previous month's saved monthly_reports snapshot, if any.
  const prevSums = prevMonthData?.sums || {};
  const totalCoverLetters = sumPairs(COVER_LETTERS_PAIRS, 0, (id) => sums[id]);
  const totalCoverLettersPlan = sumPairs(COVER_LETTERS_PAIRS, 1, (id) => sums[id]);
  const totalResponses = sumPairs(RESPONSES_PAIRS, 0, (id) => sums[id]);
  const totalResponsesPlan = sumPairs(RESPONSES_PAIRS, 1, (id) => sums[id]);
  const prevCoverLetters = sumPairs(COVER_LETTERS_PAIRS, 0, (id) => prevSums[id]);
  const prevResponses = sumPairs(RESPONSES_PAIRS, 0, (id) => prevSums[id]);

  const tasksDoneCount = monthSalesTasks.length ? monthSalesTasks.filter((t) => deriveTaskStatus(t) === 'done').length : legacyDone.length;
  const tasksPlanCount = monthSalesTasks.length || legacyPlan.length;
  const prevTasksDone = prevMonthData?.tasks_done_count ?? (prevMonthData?.tasks?.t_done || []).filter((it) => it.text?.trim()).length;

  const conversion = pct(totalResponses, totalCoverLetters);
  const conversionPlan = pct(totalResponsesPlan, totalCoverLettersPlan);
  const prevConversion = pct(prevResponses, prevCoverLetters);
  const conversionDeltaPp = (conversion !== null && prevConversion !== null) ? Math.round((conversion - prevConversion) * 10) / 10 : null;

  const coverLettersAch = achievement(totalCoverLetters, totalCoverLettersPlan);
  const responsesAch = achievement(totalResponses, totalResponsesPlan);
  const tasksAch = achievement(tasksDoneCount, tasksPlanCount);
  const conversionAch = achievement(conversion, conversionPlan);

  const monthToday = new Date();
  monthToday.setHours(0, 0, 0, 0);
  const monthStartDate = new Date(period.year, period.month - 1, 1);
  const monthEndDate = new Date(period.year, period.month, 0);
  let monthStatus, monthStatusSub;
  if (monthToday < monthStartDate) {
    monthStatus = 'Заплановано';
    monthStatusSub = null;
  } else if (monthToday > monthEndDate) {
    monthStatus = 'Завершено';
    monthStatusSub = null;
  } else {
    monthStatus = 'В процесі';
    const daysLeft = Math.ceil((monthEndDate - monthToday) / 86400000) + 1;
    monthStatusSub = `${daysLeft} дні залишилось`;
  }

  return (
    <div className="report-page monthly-report-page" ref={pageRef}>
      <section className="rpt-hero">
        <div className="rpt-hero-top-row">
          <div className="rpt-hero-heading">
            <span className="rpt-hero-icon" dangerouslySetInnerHTML={{ __html: SECTION_ICONS['Місяці'] }} />
            <h1>Monthly Report</h1>
          </div>

          <div className="week-period-picker">
            <div className="wk-field-box">
              <span className="wk-field-icon" dangerouslySetInnerHTML={{ __html: FIELD_ICONS.day }} />
              <div className="wk-field-body">
                <label>Рік</label>
                <select value={period.year} onChange={(e) => setPeriod((p) => ({ ...p, year: +e.target.value }))}>
                  {yearOptions().map((y) => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>
            </div>
            <div className="wk-field-box">
              <span className="wk-field-icon" dangerouslySetInnerHTML={{ __html: FIELD_ICONS.day }} />
              <div className="wk-field-body">
                <label>Місяць</label>
                <select value={period.month} onChange={(e) => setPeriod((p) => ({ ...p, month: +e.target.value }))}>
                  {MONTH_NAMES.map((name, i) => <option key={name} value={i + 1}>{name}</option>)}
                </select>
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="week-toolbar-row">
        <div className="week-toolbar-left">
          <div className="wk-field-box">
            <span className="wk-field-icon" dangerouslySetInnerHTML={{ __html: FIELD_ICONS.assignee }} />
            <div className="wk-field-body">
              <label>Менеджер</label>
              <select value={manager} onChange={(e) => setManager(e.target.value)}>
                <option value="">Оберіть менеджера</option>
                {profiles.map((p) => <option key={p.email} value={profileLabel(p)}>{profileLabel(p)}</option>)}
              </select>
            </div>
          </div>
          <div className="wk-field-box">
            <span className="wk-field-icon" dangerouslySetInnerHTML={{ __html: SECTION_ICONS['Місяці'] }} />
            <div className="wk-field-body">
              <label>Тижнів знайдено</label>
              <div className="weeks-badge">{weeksFound} з {weeksTotal}</div>
            </div>
          </div>
        </div>
        <div className="week-toolbar-right">
          <div className="save-state">{statusLabel}</div>
          {!capturing && (
            <div className="export-menu-wrap">
              <button type="button" className="btn" onClick={() => setExportMenuOpen((o) => !o)}>&#8595; Експорт</button>
              {exportMenuOpen && (
                <div className="export-menu">
                  <button type="button" onClick={() => { setExportMenuOpen(false); exportPDF(); }}>Завантажити PDF</button>
                  <button type="button" disabled={exportingJPEG} onClick={() => { setExportMenuOpen(false); handleExportJPEG(); }}>
                    {exportingJPEG ? '...' : 'Завантажити JPEG'}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      {missingWeeks.length > 0 && (
        <div className="weeks-missing">
          <span className="weeks-missing-icon" dangerouslySetInnerHTML={{ __html: DUE_STATUS_ICONS.overdue }} />
          <div>
            <b>Відсутні тижні:</b> {missingWeeks.map((w) => `Тиждень ${w.index} (${fmtDate(w.start.getFullYear(), w.start.getMonth() + 1, w.start.getDate())}–${fmtDate(w.end.getFullYear(), w.end.getMonth() + 1, w.end.getDate())})`).join(', ')}
          </div>
        </div>
      )}

      <div className="dash-kpi-row">
        <div className="dash-kpi">
          <div className="dash-kpi-head">
            <span className="dash-kpi-icon" dangerouslySetInnerHTML={{ __html: SECTION_ICONS['Клієнти'] }} />
            <div className="dash-kpi-label">Всього Cover Letters</div>
          </div>
          <div className="dash-kpi-value">{totalCoverLetters}</div>
          <div className="dash-kpi-plan">План: {totalCoverLettersPlan}</div>
          <div className="dash-kpi-sub"><DeltaBadge diff={relPctDelta(totalCoverLetters, prevCoverLetters)} suffix="%" /> vs минулий місяць</div>
          <div className="kcard-bar" style={{ marginTop: 8 }}><div className="kcard-bar-fill" style={{ width: coverLettersAch.barPct + '%', background: coverLettersAch.color }} /></div>
        </div>

        <div className="dash-kpi">
          <div className="dash-kpi-head">
            <span className="dash-kpi-icon" dangerouslySetInnerHTML={{ __html: CHANNEL_ICONS.dm }} />
            <div className="dash-kpi-label">Всього відповідей</div>
          </div>
          <div className="dash-kpi-value">{totalResponses}</div>
          <div className="dash-kpi-plan">План: {totalResponsesPlan}</div>
          <div className="dash-kpi-sub"><DeltaBadge diff={relPctDelta(totalResponses, prevResponses)} suffix="%" /> vs минулий місяць</div>
          <div className="kcard-bar" style={{ marginTop: 8 }}><div className="kcard-bar-fill" style={{ width: responsesAch.barPct + '%', background: responsesAch.color }} /></div>
        </div>

        <div className="dash-kpi">
          <div className="dash-kpi-head">
            <span className="dash-kpi-icon" dangerouslySetInnerHTML={{ __html: SECTION_ICONS['Тренди за місяцями'] }} />
            <div className="dash-kpi-label">Конверсія</div>
          </div>
          <div className="dash-kpi-value">{conversion === null ? '—' : conversion.toFixed(1) + '%'}</div>
          <div className="dash-kpi-plan">План: {conversionPlan === null ? '—' : conversionPlan.toFixed(0) + '%'}</div>
          <div className="dash-kpi-sub"><DeltaBadge diff={conversionDeltaPp} suffix="%" /> vs минулий місяць</div>
          <div className="kcard-bar" style={{ marginTop: 8 }}><div className="kcard-bar-fill" style={{ width: conversionAch.barPct + '%', background: conversionAch.color }} /></div>
        </div>

        <div className="dash-kpi">
          <div className="dash-kpi-head">
            <span className="dash-kpi-icon" dangerouslySetInnerHTML={{ __html: SECTION_ICONS['Задачі'] }} />
            <div className="dash-kpi-label">Планових завдань виконано</div>
          </div>
          <div className="dash-kpi-value">{tasksDoneCount}</div>
          <div className="dash-kpi-plan">План: {tasksPlanCount}</div>
          <div className="dash-kpi-sub"><DeltaBadge diff={relPctDelta(tasksDoneCount, prevTasksDone)} suffix="%" /> vs минулий місяць</div>
          <div className="kcard-bar" style={{ marginTop: 8 }}><div className="kcard-bar-fill" style={{ width: tasksAch.barPct + '%', background: tasksAch.color }} /></div>
        </div>

        <div className="dash-kpi">
          <div className="dash-kpi-head">
            <span className="dash-kpi-icon" dangerouslySetInnerHTML={{ __html: SECTION_ICONS['Виконано за день'] }} />
            <div className="dash-kpi-label">Статус місяця</div>
          </div>
          <div className="dash-kpi-value" style={{ color: 'var(--purple)' }}>{monthStatus}</div>
          {monthStatusSub && <div className="dash-kpi-sub">{monthStatusSub}</div>}
        </div>
      </div>

      <section className="report-section">
        <div className="stitle"><span className="stitle-icon" dangerouslySetInnerHTML={{ __html: SECTION_ICONS.Upwork }} />Upwork</div>
        <div className="chan-tabs">
          {CHANNELS.map((c) => (
            <button
              key={c.key}
              type="button"
              className={'chan-tab' + (c.key === activeChannel ? ' active' : '')}
              onClick={() => setActiveChannel(c.key)}
            >
              <span dangerouslySetInnerHTML={{ __html: CHANNEL_ICONS[c.key] }} />
              {c.title}
            </button>
          ))}
        </div>
        <MonthlyChannelBlock channel={CHANNELS.find((c) => c.key === activeChannel) || CHANNELS[0]} sums={sums} />
      </section>

      <section className="report-section">
        <div className="stitle"><span className="stitle-icon" dangerouslySetInnerHTML={{ __html: SECTION_ICONS.LinkedIn }} />Інші платформи</div>
        <div className="chan-tabs">
          {OTHER_PLATFORMS.map((p) => (
            <button
              key={p}
              type="button"
              className={'chan-tab' + (p === activeOtherPlatform ? ' active' : '')}
              onClick={() => setActiveOtherPlatform(p)}
            >
              {OTHER_PLATFORM_LOGOS[p] ? (
                <img src={OTHER_PLATFORM_LOGOS[p]} alt="" className="chan-tab-logo" />
              ) : (
                <span dangerouslySetInnerHTML={{ __html: GENERIC_PLATFORM_ICON }} />
              )}
              {p}
            </button>
          ))}
        </div>
        {activeOtherPlatform === 'LinkedIn' ? (
          <MonthlyChannelBlock channel={LI_CHANNEL} sums={sums} />
        ) : (
          <div className="empty-state">
            <p>Розділ «{activeOtherPlatform}» у розробці — показники для цієї платформи буде додано пізніше.</p>
          </div>
        )}
      </section>

      <section className="report-section">
        <div className="stitle"><span className="stitle-icon" dangerouslySetInnerHTML={{ __html: SECTION_ICONS.Фінанси }} />Фінанси</div>
        <MonthlyFinanceSection sums={sums} fin={fin} />
      </section>

      <section className="report-section">
        <div className="stitle">
          <span className="stitle-icon" dangerouslySetInnerHTML={{ __html: SECTION_ICONS['Клієнти'] }} />Клієнти
          {!capturing && (
            <div className="mc-client-toolbar stitle-filter">
              <div className="mc-client-search">
                <span dangerouslySetInnerHTML={{ __html: SEARCH_ICON }} />
                <input
                  type="text"
                  value={clientSearch}
                  onChange={(e) => { setClientSearch(e.target.value); setClientPage(1); }}
                  placeholder="Пошук за іменем..."
                />
              </div>
              <div className="task-filter-wrap" ref={clientFilterRef}>
                <button
                  type="button"
                  className={'btn task-filter-btn' + (activeClientFilterCount ? ' has-active' : '')}
                  onClick={() => setClientFilterOpen((o) => !o)}
                >
                  <span dangerouslySetInnerHTML={{ __html: FILTER_ICON }} />
                  Фільтр{activeClientFilterCount > 0 ? ` (${activeClientFilterCount})` : ''}
                </button>
                {clientFilterOpen && (
                  <div className="task-filter-popover">
                    <div className="task-filter-row">
                      <label>Платформа</label>
                      <select value={clientPlatformFilter} onChange={(e) => { setClientPlatformFilter(e.target.value); setClientPage(1); }}>
                        <option value="">Усі</option>
                        {CLIENT_PLATFORMS.map((p) => <option key={p} value={p}>{p}</option>)}
                      </select>
                    </div>
                    <div className="task-filter-row">
                      <label>Тип клієнта</label>
                      <select value={clientTypeFilter} onChange={(e) => { setClientTypeFilter(e.target.value); setClientPage(1); }}>
                        <option value="">Усі</option>
                        {CLIENT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
        <div className="placeholder">
          <p>Автоматично зібрано з клієнтів усіх тижневих звітів цього місяця — повторення одного й того ж клієнта об&#39;єднані в один запис із хронологією дій за тижнями. Можна редагувати чи видаляти нижче.</p>
        </div>
        {filteredClients.length === 0 && clients.length > 0 ? (
          <div className="empty-hint">Немає клієнтів за цим фільтром</div>
        ) : (
          <EditableClientList
            items={pagedClients}
            onChange={(id, item) => setClients((c) => c.map((it) => (it.id === id ? item : it)))}
            onAdd={handleAddClient}
            onRemove={(id) => setClients((c) => c.filter((it) => it.id !== id))}
            capturing={capturing}
            iconBoxed
          />
        )}
        {filteredClients.length > CLIENT_PAGE_SIZE && (
          <div className="month-pagination">
            <div className="month-pagination-hint">{clientRangeStart}-{clientRangeEnd} з {filteredClients.length} клієнтів</div>
            <div className="month-pagination-pages">
              <button type="button" onClick={() => setClientPage((p) => Math.max(1, p - 1))} disabled={clampedClientPage === 1} aria-label="Попередня сторінка">&#8249;</button>
              {Array.from({ length: clientPageCount }, (_, i) => i + 1).map((n) => (
                <button key={n} type="button" className={n === clampedClientPage ? 'on' : ''} onClick={() => setClientPage(n)}>{n}</button>
              ))}
              <button type="button" onClick={() => setClientPage((p) => Math.min(clientPageCount, p + 1))} disabled={clampedClientPage === clientPageCount} aria-label="Наступна сторінка">&#8250;</button>
            </div>
          </div>
        )}
      </section>

      <section className="report-section">
        <div className="stitle"><span className="stitle-icon" dangerouslySetInnerHTML={{ __html: SECTION_ICONS['Задачі'] }} />Задачі</div>
        <div className="placeholder">
          <p>«Заплановано» та «Виконано» — реальний перелік задач менеджера за цей місяць з рушія задач (без вгадування схожості). «Плани на наступний місяць» і «Висновки» заповнюються вручну; для висновків можна натиснути «Згенерувати підсумок», щоб отримати чернетку на основі задач і клієнтів місяця.</p>
        </div>
        {!managerEmail ? (
          <div className="empty-hint">Оберіть менеджера, щоб побачити задачі за цей місяць.</div>
        ) : monthSalesTasks.length === 0 ? (
          <div className="empty-hint">За цей місяць немає задач у новому рушії.</div>
        ) : (
          <div className="month-table-wrap" style={{ marginBottom: 18 }}>
            <table className="month-task-table">
              <thead><tr><th>Задача</th><th>Статус</th><th>Дата</th></tr></thead>
              <tbody>
                {monthSalesTasks.map((t) => {
                  const status = deriveTaskStatus(t);
                  return (
                    <tr key={t.id}>
                      <td className="month-task-text">{(t.text || '').split('\n')[0]}</td>
                      <td>{STATUS_LABELS[status]}</td>
                      <td className="month-task-date">{t.planned_date}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <div className="task-grid-4">
          {TASK_SECTIONS.map((s) => {
            const count = tasks[s.key].filter((it) => it.text?.trim()).length;
            return (
              <div key={s.key}>
                <div className="ssub">{s.title}{count > 0 && <span className="ssub-count">{count}</span>}</div>
                <EditableItemList
                  items={tasks[s.key]}
                  onChange={(id, patch) => setTasks((t) => ({ ...t, [s.key]: t[s.key].map((it) => (it.id === id ? { ...it, ...patch } : it)) }))}
                  onAdd={() => setTasks((t) => ({ ...t, [s.key]: [...t[s.key], { id: makeId(), text: '' }] }))}
                  onRemove={(id) => setTasks((t) => ({ ...t, [s.key]: t[s.key].filter((it) => it.id !== id) }))}
                  emptyHint="Немає пунктів — додайте перший нижче"
                  addLabel="Додати пункт"
                  capturing={capturing}
                  withTags={!s.auto}
                  iconByTag={!s.auto}
                  tagSuggestions={tagSuggestions}
                  onNewTag={!s.auto ? handleNewTag : undefined}
                />
                {s.key === 't_conc' && !capturing && (
                  <button type="button" className="add-btn" onClick={handleGenerateSummary}>&#10024; Згенерувати підсумок</button>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {(legacyPlan.length > 0 || legacyDone.length > 0) && (
        <section className="report-section">
          <div className="stitle">Архів задач (до оновлення)</div>
          <p className="empty-hint" style={{ marginBottom: 10 }}>Зібрано зі старих тижневих звітів нечітким збігом тексту — лише перегляд.</p>
          <div className="task-grid">
            {legacyPlan.length > 0 && (
              <div>
                <div className="ssub">Заплановано на місяць<span className="ssub-count">{legacyPlan.length}</span></div>
                <ul className="archive-list">{legacyPlan.map((text, i) => <li key={i}>{text}</li>)}</ul>
              </div>
            )}
            {legacyDone.length > 0 && (
              <div>
                <div className="ssub">Виконано за місяць<span className="ssub-count">{legacyDone.length}</span></div>
                <ul className="archive-list">{legacyDone.map((text, i) => <li key={i}>{text}</li>)}</ul>
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
