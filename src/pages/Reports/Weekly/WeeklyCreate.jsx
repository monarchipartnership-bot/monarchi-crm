import { useEffect, useMemo, useRef, useState } from 'react';
import WeekFullness from '../../../components/Reports/Weekly/WeekFullness';
import ReportTypeSwitcher from '../../../components/Reports/ReportTypeSwitcher';
import ChannelBlock from '../../../components/Reports/Weekly/ChannelBlock';
import FinanceSection from '../../../components/Reports/Weekly/FinanceSection';
import EditableClientList from '../../../components/Reports/EditableClientList';
import EditableItemList from '../../../components/Reports/EditableItemList';
import DeltaBadge from '../../../components/Automation/DeltaBadge';
import { fetchSavedWeekIndexes, fetchReportByWeekStart, fetchWeeklyRowsBetween, saveWeeklyReport, fetchDailyClientsForWeek } from '../../../lib/api/weeklyReports';
import { syncReportClientsToDirectory } from '../../../lib/reportClientSync';
import { fetchAllProfiles } from '../../../lib/api/profile';
import { fetchCustomTags, saveCustomTag } from '../../../lib/api/customTags';
import { fetchTasksForWeek } from '../../../lib/api/tasks';
import { fetchDepartmentIdByName } from '../../../lib/api/departments';
import { deriveTaskStatus, STATUS_LABELS } from '../../../lib/taskStatus';
import { aggregateDailyClients } from '../../../lib/weeklyClientImport';
import { computeWeeksForMonth, defaultWeekIndexFor, fmtDate, isoDate, addDaysIso, MONTH_NAMES, yearOptions } from '../../../lib/dateHelpers';
import { CHANNELS, LI_CHANNEL, allFieldIds, applyPlanPreset, achievement, pct, toNum } from '../../../lib/weeklyLogic';
import { CLIENT_PLATFORMS } from '../../../lib/reportConstants';
import { STATUSES } from '../../../lib/clientStatus';
import { exportPDF, exportJPEG } from '../../../lib/exportHelpers';
import { SECTION_ICONS, CHANNEL_ICONS } from '../../../lib/reportIcons';
import { FIELD_ICONS } from '../../../lib/taskFieldIcons';
import fiverrLogo from '../../../assets/logos/fiverr.png';
import linkedinLogo from '../../../assets/logos/linkedin.png';
import facebookLogo from '../../../assets/logos/facebook.png';
import instagramLogo from '../../../assets/logos/instagram.png';
import redditLogo from '../../../assets/logos/reddit.png';
import '../../../styles/reportPage.css';
import '../../../styles/automationTasksPage.css';
import '../../../styles/automationDashboard.css';

// "Інші платформи" tabs — every CLIENT_PLATFORMS entry except Upwork (which
// already has its own dedicated tabbed section above). Only LinkedIn has a
// real data model (LI_CHANNEL) wired up so far; the rest show a stub until
// their own metrics are built out.
const OTHER_PLATFORMS = CLIENT_PLATFORMS.filter((p) => p !== 'Upwork');
const OTHER_PLATFORM_LOGOS = { Fiverr: fiverrLogo, LinkedIn: linkedinLogo, Facebook: facebookLogo, Instagram: instagramLogo, Reddit: redditLogo };
const GENERIC_PLATFORM_ICON = '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/></svg>';

// Same tag vocabulary as Sales Daily Report, for the Задачі columns' tag chips.
const ACTIVITY_TAGS = ['Дзвінок', 'Лист', 'Зустріч', 'Proposal', 'Follow-up'];
const TAG_CONTEXT = 'sales_activity';

// `t_plan`/`t_done`/`t_next` used to be free-text lists here; they're now a
// live grouped view of the shared `tasks` engine (STATUS_GROUPS below).
// `t_conc` (висновки) stays a manual narrative field — it's a summary
// write-up, not a task list, so there's nothing in `tasks` to replace it with.
const TASK_SECTIONS = [
  { key: 't_conc', title: 'Висновки', empty: 'Немає пунктів — додайте перший нижче' },
];
const STATUS_GROUPS = [
  { key: 'done', title: 'Виконано' },
  { key: 'pending', title: 'В очікуванні' },
  { key: 'moved', title: 'Перенесено' },
  { key: 'cancelled', title: 'Скасовано' },
];

const PLAN_PRESET_OPTIONS = [
  { value: '', label: '— оберіть —' },
  { value: 'none', label: 'Немає' },
  { value: 'min', label: 'Мінімальний' },
  { value: 'avg', label: 'Середній' },
  { value: 'real', label: 'Реальний' },
  { value: 'max', label: 'Максимальний' },
];

// Page-specific KPI rollups. "Всього Cover Letters" only sums channels
// where we actually send outreach (Upwork-style + LinkedIn Connections) —
// organic channels (Invites/DM/Consultations/Project Catalog) are inbound,
// leads reach out to us, so they have no Cover-Letters equivalent and are
// excluded here. "Всього відповідей" sums every channel's real contact
// stage: Answers for Upwork-style + LinkedIn (LinkedIn's separate "Leads"
// field is just accepted connection requests, not real contact, so it's
// not used), and organic channels' own "Кількість" (their inbound lead
// count stands in for it, since they have no separate Answers step).
// Field ids are hardcoded rather than derived — same "don't get clever with
// ids" spirit as weeklyLogic.js itself.
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

function initialPeriod() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const weeks = computeWeeksForMonth(year, month);
  return { year, month, weekIndex: defaultWeekIndexFor(weeks) };
}

function emptyFields() {
  const f = {};
  allFieldIds().forEach((id) => { f[id] = ''; });
  return f;
}

function profileLabel(p) {
  const full = `${p.first_name || ''} ${p.last_name || ''}`.trim();
  return full || p.email;
}

export default function WeeklyCreate() {
  const pageRef = useRef(null);
  const idRef = useRef(1);
  const makeId = () => idRef.current++;

  const [period, setPeriod] = useState(initialPeriod);
  const [fields, setFields] = useState(emptyFields);
  const [clients, setClients] = useState([]);
  const [tasks, setTasks] = useState({ t_plan: [], t_done: [], t_next: [], t_conc: [] });
  const [savedWeekIndexes, setSavedWeekIndexes] = useState(() => new Set());
  const [statusLabel, setStatusLabel] = useState('—');
  const [planPresetSel, setPlanPresetSel] = useState('');
  const [capturing, setCapturing] = useState(false);
  const [exportingJPEG, setExportingJPEG] = useState(false);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [activeChannel, setActiveChannel] = useState(CHANNELS[0].key);
  const [activeOtherPlatform, setActiveOtherPlatform] = useState('LinkedIn');
  const [weeklyHistory, setWeeklyHistory] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [tagSuggestions, setTagSuggestions] = useState(ACTIVITY_TAGS);
  const [weekSalesTasks, setWeekSalesTasks] = useState([]);
  const [nextWeekSalesTasks, setNextWeekSalesTasks] = useState([]);
  const [salesDeptId, setSalesDeptId] = useState(null);
  const saveTimerRef = useRef(null);
  const skipNextSaveRef = useRef(false);

  useEffect(() => {
    fetchDepartmentIdByName('Sales відділ').then(setSalesDeptId);
  }, []);

  useEffect(() => {
    fetchAllProfiles().then(setProfiles);
    fetchCustomTags(TAG_CONTEXT).then((saved) => {
      if (saved.length) setTagSuggestions((prev) => [...new Set([...prev, ...saved])]);
    });
  }, []);

  // Report's own manager select stores a display label, not an email —
  // looked up here since tasks.assignee_email is always an email.
  const managerEmail = useMemo(() => profiles.find((p) => profileLabel(p) === fields.manager)?.email || '', [profiles, fields.manager]);

  function handleNewTag(tag) {
    setTagSuggestions((prev) => (prev.includes(tag) ? prev : [...prev, tag]));
    saveCustomTag(TAG_CONTEXT, tag);
  }

  const weeks = computeWeeksForMonth(period.year, period.month);
  const currentWeek = weeks.find((w) => w.index === period.weekIndex) || weeks[0];

  function handlePeriodChange(next) {
    const dim = computeWeeksForMonth(next.year, next.month).length;
    setPeriod({ year: next.year, month: next.month, weekIndex: Math.min(next.weekIndex, dim) });
  }

  const setField = (id, value) => setFields((f) => ({ ...f, [id]: String(value) }));

  useEffect(() => {
    let cancelled = false;
    fetchSavedWeekIndexes(period.year, period.month).then((idx) => { if (!cancelled) setSavedWeekIndexes(idx); });
    return () => { cancelled = true; };
  }, [period.year, period.month]);

  useEffect(() => {
    let cancelled = false;
    if (!currentWeek) return;
    const weekStartIso = isoDate(currentWeek.start.getFullYear(), currentWeek.start.getMonth() + 1, currentWeek.start.getDate());
    const weekEndIso = isoDate(currentWeek.end.getFullYear(), currentWeek.end.getMonth() + 1, currentWeek.end.getDate());

    (async () => {
      setStatusLabel('Завантаження...');
      let manualClients = [];
      let loadedFields = emptyFields();
      let loadedTasks = { t_plan: [], t_done: [], t_next: [], t_conc: [] };
      try {
        const row = await fetchReportByWeekStart(weekStartIso);
        if (row) {
          const data = row.data || {};
          allFieldIds().forEach((id) => { loadedFields[id] = data[id] ?? ''; });
          manualClients = (data.clients || []).map((c) => ({ ...c, id: makeId(), fromDaily: false }));
          // All four legacy keys are loaded (not just TASK_SECTIONS' t_conc) so
          // an already-saved week's t_plan/t_done/t_next survive as archive —
          // only t_conc is still actively edited going forward.
          ['t_plan', 't_done', 't_next', 't_conc'].forEach((key) => {
            loadedTasks[key] = (data.tasks?.[key] || []).map((it) => ({ ...it, id: makeId() }));
          });
          setStatusLabel('Збережено ' + new Date(row.updated_at).toLocaleString('uk-UA'));
        } else {
          setStatusLabel('Ще не збережено');
        }
      } catch (e) {
        console.warn('loadReport failed', e);
        setStatusLabel('Помилка завантаження');
      }
      if (cancelled) return;
      skipNextSaveRef.current = true;
      setFields(loadedFields);
      setTasks(loadedTasks);

      const existingNames = new Set(manualClients.map((c) => (c.name || '').trim().toLowerCase()));
      const dailyRows = await fetchDailyClientsForWeek(weekStartIso, weekEndIso);
      if (cancelled) return;
      const imported = aggregateDailyClients(dailyRows)
        .filter((c) => !existingNames.has(c.name.trim().toLowerCase()))
        .map((c) => ({ ...c, id: makeId() }));
      skipNextSaveRef.current = true;
      setClients([...manualClients, ...imported]);

      const historyRows = await fetchWeeklyRowsBetween(addDaysIso(weekStartIso, -56), addDaysIso(weekStartIso, -7));
      if (!cancelled) setWeeklyHistory(historyRows);
    })();

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period.year, period.month, period.weekIndex]);

  // Live "Задачі" — this week's sales tasks for the report's own manager,
  // grouped by deriveTaskStatus below, plus a read-only preview of what's
  // already planned for next week (replaces the old manually-typed t_next).
  useEffect(() => {
    if (!currentWeek || !managerEmail || !salesDeptId) { setWeekSalesTasks([]); setNextWeekSalesTasks([]); return; }
    let cancelled = false;
    const weekStartIso = isoDate(currentWeek.start.getFullYear(), currentWeek.start.getMonth() + 1, currentWeek.start.getDate());
    const weekEndIso = isoDate(currentWeek.end.getFullYear(), currentWeek.end.getMonth() + 1, currentWeek.end.getDate());
    const nextWeekStartIso = addDaysIso(weekStartIso, 7);
    const nextWeekEndIso = addDaysIso(weekEndIso, 7);
    fetchTasksForWeek(weekStartIso, weekEndIso, salesDeptId)
      .then((rows) => { if (!cancelled) setWeekSalesTasks(rows.filter((t) => t.assignee_email === managerEmail)); })
      .catch((e) => console.warn('load week sales tasks failed', e));
    fetchTasksForWeek(nextWeekStartIso, nextWeekEndIso, salesDeptId)
      .then((rows) => { if (!cancelled) setNextWeekSalesTasks(rows.filter((t) => t.assignee_email === managerEmail)); })
      .catch((e) => console.warn('load next week sales tasks failed', e));
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period.year, period.month, period.weekIndex, managerEmail, salesDeptId]);

  function handlePlanPreset(value) {
    setPlanPresetSel(value);
    if (!value) return;
    applyPlanPreset(value, setField);
  }

  // Autosave — debounced across fields/clients/tasks changes; skipped once
  // right after a period's data (and its daily-client import) finishes
  // loading so re-populating the form doesn't immediately re-save it.
  useEffect(() => {
    if (skipNextSaveRef.current) { skipNextSaveRef.current = false; return; }
    clearTimeout(saveTimerRef.current);
    setStatusLabel('Зберігається...');
    saveTimerRef.current = setTimeout(async () => {
      try {
        const data = {
          _type: 'upwork_weekly_report',
          _version: 3,
          ...fields,
          // t_plan/t_done/t_next are resaved byte-for-byte from whatever was
          // loaded (archive only, no longer edited) — only t_conc is live.
          tasks: {
            t_plan: tasks.t_plan.map((it) => ({ text: it.text, tag: it.tag || '' })),
            t_done: tasks.t_done.map((it) => ({ text: it.text, tag: it.tag || '' })),
            t_next: tasks.t_next.map((it) => ({ text: it.text, tag: it.tag || '' })),
            t_conc: tasks.t_conc.map((it) => ({ text: it.text, tag: it.tag || '' })),
          },
          clients: clients.map((c) => ({ name: c.name, platform: c.platform, leadType: c.leadType, title: c.title || '', text: c.text })),
        };
        await saveWeeklyReport({ year: period.year, month: period.month, weekIndex: period.weekIndex, week: currentWeek, manager: fields.manager, data });
        setSavedWeekIndexes((prev) => new Set(prev).add(period.weekIndex));
        setStatusLabel('Збережено ' + new Date().toLocaleString('uk-UA'));
        // Only rows added directly in Weekly (never mentioned in a Daily
        // Report) — a Daily-imported row was already synced when the day
        // itself saved, so re-processing it here on every Weekly autosave
        // would just be redundant work against the exact same client/deal.
        const weekStartIso = isoDate(currentWeek.start.getFullYear(), currentWeek.start.getMonth() + 1, currentWeek.start.getDate());
        syncReportClientsToDirectory(clients.filter((c) => !c.fromDaily), fields.manager, weekStartIso);
      } catch (e) {
        console.warn('autosave failed', e);
        setStatusLabel('Помилка збереження');
      }
    }, 900);
    return () => clearTimeout(saveTimerRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fields, clients, tasks]);

  async function handleExportJPEG() {
    const iso = isoDate(currentWeek.start.getFullYear(), currentWeek.start.getMonth() + 1, currentWeek.start.getDate());
    await exportJPEG(pageRef.current, `weekly_report_${iso}.jpg`, {
      onStart: () => { setExportingJPEG(true); setCapturing(true); },
      onEnd: () => { setExportingJPEG(false); setCapturing(false); },
    });
  }

  if (!currentWeek) return null;

  // ---- per-metric/ratio trend series for the active channel's cards ----
  // Historical weeks (oldest→newest) plus the currently-edited week appended
  // last, so the sparkline reads as "trend up to and including today".
  function historyForMetric(id) {
    const values = weeklyHistory.map((r) => toNum(r.data?.[id])).concat(toNum(fields[id]));
    const delta = values.length >= 2 ? values[values.length - 1] - values[values.length - 2] : null;
    return { values, delta };
  }
  function ratioPctFor(getValue, ratio) {
    const v = pct(toNum(getValue(ratio.num)), toNum(getValue(ratio.den)));
    return v === null ? 0 : Math.round(v * 10) / 10;
  }
  function historyForRatio(ratio) {
    const values = weeklyHistory.map((r) => ratioPctFor((id) => r.data?.[id], ratio)).concat(ratioPctFor((id) => fields[id], ratio));
    const delta = values.length >= 2 ? Math.round((values[values.length - 1] - values[values.length - 2]) * 10) / 10 : null;
    return { values, delta };
  }

  // ---- KPI summary row ----
  const prevData = weeklyHistory[weeklyHistory.length - 1]?.data || {};
  const totalCoverLetters = sumPairs(COVER_LETTERS_PAIRS, 0, (id) => fields[id]);
  const totalCoverLettersPlan = sumPairs(COVER_LETTERS_PAIRS, 1, (id) => fields[id]);
  const totalResponses = sumPairs(RESPONSES_PAIRS, 0, (id) => fields[id]);
  const totalResponsesPlan = sumPairs(RESPONSES_PAIRS, 1, (id) => fields[id]);
  const prevCoverLetters = sumPairs(COVER_LETTERS_PAIRS, 0, (id) => prevData[id]);
  const prevResponses = sumPairs(RESPONSES_PAIRS, 0, (id) => prevData[id]);

  const tasksDoneCount = tasks.t_done.filter((it) => it.text?.trim()).length;
  const tasksPlanCount = tasks.t_plan.filter((it) => it.text?.trim()).length;
  const prevTasksDone = (prevData.tasks?.t_done || []).filter((it) => it.text?.trim()).length;

  const conversion = pct(totalResponses, totalCoverLetters);
  const conversionPlan = pct(totalResponsesPlan, totalCoverLettersPlan);
  const prevConversion = pct(prevResponses, prevCoverLetters);
  const conversionDeltaPp = (conversion !== null && prevConversion !== null) ? Math.round((conversion - prevConversion) * 10) / 10 : null;

  const coverLettersAch = achievement(totalCoverLetters, totalCoverLettersPlan);
  const responsesAch = achievement(totalResponses, totalResponsesPlan);
  const tasksAch = achievement(tasksDoneCount, tasksPlanCount);
  const conversionAch = achievement(conversion, conversionPlan);

  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const ws = new Date(currentWeek.start);
  ws.setHours(0, 0, 0, 0);
  const we = new Date(currentWeek.end);
  we.setHours(0, 0, 0, 0);
  let weekStatus, weekStatusSub;
  if (now < ws) {
    weekStatus = 'Заплановано';
    weekStatusSub = null;
  } else if (now > we) {
    weekStatus = 'Завершено';
    weekStatusSub = null;
  } else {
    weekStatus = 'В процесі';
    const daysLeft = Math.ceil((we - now) / 86400000) + 1;
    weekStatusSub = `${daysLeft} дні залишилось`;
  }

  const activeChannelData = CHANNELS.find((c) => c.key === activeChannel) || CHANNELS[0];

  return (
    <div className="report-page weekly-report-page" ref={pageRef}>
      {!capturing && <ReportTypeSwitcher />}
      <section className="rpt-hero">
        <div className="rpt-hero-top-row">
          <div className="rpt-hero-heading">
            <span className="rpt-hero-icon" dangerouslySetInnerHTML={{ __html: SECTION_ICONS['Тренди за місяцями'] }} />
            <h1>Weekly Report</h1>
          </div>

          <div className="week-period-picker">
            <div className="wk-field-box">
              <span className="wk-field-icon" dangerouslySetInnerHTML={{ __html: FIELD_ICONS.day }} />
              <div className="wk-field-body">
                <label>Рік</label>
                <select value={period.year} onChange={(e) => handlePeriodChange({ ...period, year: +e.target.value })}>
                  {yearOptions().map((y) => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>
            </div>
            <div className="wk-field-box">
              <span className="wk-field-icon" dangerouslySetInnerHTML={{ __html: FIELD_ICONS.day }} />
              <div className="wk-field-body">
                <label>Місяць</label>
                <select value={period.month} onChange={(e) => handlePeriodChange({ ...period, month: +e.target.value })}>
                  {MONTH_NAMES.map((name, i) => <option key={name} value={i + 1}>{name}</option>)}
                </select>
              </div>
            </div>
            <div className="wk-field-box week-period-week">
              <span className="wk-field-icon" dangerouslySetInnerHTML={{ __html: FIELD_ICONS.day }} />
              <div className="wk-field-body">
                <label>Тиждень</label>
                <select value={period.weekIndex} onChange={(e) => handlePeriodChange({ ...period, weekIndex: +e.target.value })}>
                  {weeks.map((w) => (
                    <option key={w.index} value={w.index}>
                      Тиждень {w.index} ({fmtDate(w.start.getFullYear(), w.start.getMonth() + 1, w.start.getDate())}–{fmtDate(w.end.getFullYear(), w.end.getMonth() + 1, w.end.getDate())})
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="dash-kpi-row">
        <div className="dash-kpi">
          <div className="dash-kpi-head">
            <span className="dash-kpi-icon" dangerouslySetInnerHTML={{ __html: SECTION_ICONS['Клієнти'] }} />
            <div className="dash-kpi-label">Всього Cover Letters</div>
          </div>
          <div className="dash-kpi-value">{totalCoverLetters}</div>
          <div className="dash-kpi-plan">План: {totalCoverLettersPlan}</div>
          <div className="dash-kpi-sub"><DeltaBadge diff={relPctDelta(totalCoverLetters, prevCoverLetters)} suffix="%" /> vs мин. тиждень</div>
          <div className="kcard-bar" style={{ marginTop: 8 }}><div className="kcard-bar-fill" style={{ width: coverLettersAch.barPct + '%', background: coverLettersAch.color }} /></div>
        </div>

        <div className="dash-kpi">
          <div className="dash-kpi-head">
            <span className="dash-kpi-icon" dangerouslySetInnerHTML={{ __html: CHANNEL_ICONS.dm }} />
            <div className="dash-kpi-label">Всього відповідей</div>
          </div>
          <div className="dash-kpi-value">{totalResponses}</div>
          <div className="dash-kpi-plan">План: {totalResponsesPlan}</div>
          <div className="dash-kpi-sub"><DeltaBadge diff={relPctDelta(totalResponses, prevResponses)} suffix="%" /> vs мин. тиждень</div>
          <div className="kcard-bar" style={{ marginTop: 8 }}><div className="kcard-bar-fill" style={{ width: responsesAch.barPct + '%', background: responsesAch.color }} /></div>
        </div>

        <div className="dash-kpi">
          <div className="dash-kpi-head">
            <span className="dash-kpi-icon" dangerouslySetInnerHTML={{ __html: SECTION_ICONS['Задачі'] }} />
            <div className="dash-kpi-label">Планових завдань виконано</div>
          </div>
          <div className="dash-kpi-value">{tasksDoneCount}</div>
          <div className="dash-kpi-plan">План: {tasksPlanCount}</div>
          <div className="dash-kpi-sub"><DeltaBadge diff={relPctDelta(tasksDoneCount, prevTasksDone)} suffix="%" /> vs мин. тиждень</div>
          <div className="kcard-bar" style={{ marginTop: 8 }}><div className="kcard-bar-fill" style={{ width: tasksAch.barPct + '%', background: tasksAch.color }} /></div>
        </div>

        <div className="dash-kpi">
          <div className="dash-kpi-head">
            <span className="dash-kpi-icon" dangerouslySetInnerHTML={{ __html: SECTION_ICONS['Тренди за місяцями'] }} />
            <div className="dash-kpi-label">Конверсія</div>
          </div>
          <div className="dash-kpi-value">{conversion === null ? '—' : conversion.toFixed(1) + '%'}</div>
          <div className="dash-kpi-plan">План: {conversionPlan === null ? '—' : conversionPlan.toFixed(0) + '%'}</div>
          <div className="dash-kpi-sub"><DeltaBadge diff={conversionDeltaPp} suffix="%" /> vs мин. тиждень</div>
          <div className="kcard-bar" style={{ marginTop: 8 }}><div className="kcard-bar-fill" style={{ width: conversionAch.barPct + '%', background: conversionAch.color }} /></div>
        </div>

        <div className="dash-kpi">
          <div className="dash-kpi-head">
            <span className="dash-kpi-icon" dangerouslySetInnerHTML={{ __html: SECTION_ICONS['Виконано за день'] }} />
            <div className="dash-kpi-label">Статус тижня</div>
          </div>
          <div className="dash-kpi-value" style={{ color: 'var(--purple)' }}>{weekStatus}</div>
          {weekStatusSub && <div className="dash-kpi-sub">{weekStatusSub}</div>}
        </div>
      </div>

      <WeekFullness
        year={period.year}
        month={period.month}
        currentWeekIndex={period.weekIndex}
        savedWeekIndexes={savedWeekIndexes}
        onSelectWeek={(weekIndex) => handlePeriodChange({ ...period, weekIndex })}
      />

      <div className="week-toolbar-row">
        <div className="week-toolbar-left">
          <div className="wk-field-box">
            <span className="wk-field-icon" dangerouslySetInnerHTML={{ __html: FIELD_ICONS.repeat }} />
            <div className="wk-field-body">
              <label>Тип плану</label>
              <select value={planPresetSel} onChange={(e) => handlePlanPreset(e.target.value)}>
                {PLAN_PRESET_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          </div>
          <div className="wk-field-box">
            <span className="wk-field-icon" dangerouslySetInnerHTML={{ __html: FIELD_ICONS.assignee }} />
            <div className="wk-field-body">
              <label>Менеджер</label>
              <select value={fields.manager} onChange={(e) => setField('manager', e.target.value)}>
                <option value="">Оберіть менеджера</option>
                {profiles.map((p) => <option key={p.email} value={profileLabel(p)}>{profileLabel(p)}</option>)}
              </select>
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
        <ChannelBlock
          channel={activeChannelData}
          fields={fields}
          onChange={setField}
          historyForMetric={historyForMetric}
          historyForRatio={historyForRatio}
        />
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
          <ChannelBlock
            channel={LI_CHANNEL}
            fields={fields}
            onChange={setField}
            historyForMetric={historyForMetric}
            historyForRatio={historyForRatio}
          />
        ) : (
          <div className="empty-state">
            <p>Розділ «{activeOtherPlatform}» у розробці — показники для цієї платформи буде додано пізніше.</p>
          </div>
        )}
      </section>

      <section className="report-section">
        <div className="stitle"><span className="stitle-icon" dangerouslySetInnerHTML={{ __html: SECTION_ICONS.Фінанси }} />Фінанси</div>
        <FinanceSection fields={fields} onChange={setField} clients={clients} weeklyHistory={weeklyHistory} />
      </section>

      <section className="report-section">
        <div className="stitle"><span className="stitle-icon" dangerouslySetInnerHTML={{ __html: SECTION_ICONS['Клієнти'] }} />Клієнти</div>
        <EditableClientList
          items={clients}
          onChange={(id, item) => setClients((c) => c.map((it) => (it.id === id ? item : it)))}
          onAdd={() => setClients((c) => [...c, { id: makeId(), platform: CLIENT_PLATFORMS[0], leadType: STATUSES[0], name: '', title: '', text: '', clientId: null, fromDaily: false }])}
          onRemove={(id) => setClients((c) => c.filter((it) => it.id !== id))}
          capturing={capturing}
          iconBoxed
        />
      </section>

      <section className="report-section">
        <div className="stitle"><span className="stitle-icon" dangerouslySetInnerHTML={{ __html: SECTION_ICONS['Задачі'] }} />Задачі</div>
        {!managerEmail ? (
          <div className="empty-hint">Оберіть менеджера, щоб побачити його задачі за цей тиждень.</div>
        ) : (
          <div className="task-grid">
            {STATUS_GROUPS.map((g) => {
              const items = weekSalesTasks.filter((t) => deriveTaskStatus(t) === g.key);
              return (
                <div key={g.key}>
                  <div className="ssub">{g.title}{items.length > 0 && <span className="ssub-count">{items.length}</span>}</div>
                  {items.length === 0 ? (
                    <div className="empty-hint">Немає задач.</div>
                  ) : (
                    <ul className="archive-list">{items.map((t) => <li key={t.id}>{(t.text || '').split('\n')[0]}</li>)}</ul>
                  )}
                </div>
              );
            })}
            <div>
              <div className="ssub">Плани на наступний тиждень{nextWeekSalesTasks.length > 0 && <span className="ssub-count">{nextWeekSalesTasks.length}</span>}</div>
              {nextWeekSalesTasks.length === 0 ? (
                <div className="empty-hint">Ще нічого не заплановано — сплануйте у Task Manager.</div>
              ) : (
                <ul className="archive-list">{nextWeekSalesTasks.map((t) => <li key={t.id}>{(t.text || '').split('\n')[0]}</li>)}</ul>
              )}
            </div>
          </div>
        )}
        <div className="task-grid" style={{ marginTop: 18 }}>
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
                  emptyHint={s.empty}
                  addLabel="Додати пункт"
                  capturing={capturing}
                  withTags
                  iconByTag
                  tagSuggestions={tagSuggestions}
                  onNewTag={handleNewTag}
                />
              </div>
            );
          })}
        </div>
      </section>

      {(tasks.t_plan.some((it) => it.text?.trim()) || tasks.t_done.some((it) => it.text?.trim()) || tasks.t_next.some((it) => it.text?.trim())) && (
        <section className="report-section">
          <div className="stitle">Архів задач (до оновлення)</div>
          <p className="empty-hint" style={{ marginBottom: 10 }}>Збережено до переходу на новий рушій задач — лише перегляд.</p>
          <div className="task-grid">
            {[{ key: 't_plan', title: 'Заплановано' }, { key: 't_done', title: 'Виконано' }, { key: 't_next', title: 'Плани на наступний тиждень' }].map((s) => {
              const items = tasks[s.key].filter((it) => it.text?.trim());
              if (!items.length) return null;
              return (
                <div key={s.key}>
                  <div className="ssub">{s.title}<span className="ssub-count">{items.length}</span></div>
                  <ul className="archive-list">{items.map((it) => <li key={it.id}>{it.text}</li>)}</ul>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
