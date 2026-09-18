import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { fetchAllDealTasks, setTaskStatus, deleteTask, ACTIVITY_TYPES } from '../../../lib/api/tasks';
import { fetchAllDeals } from '../../../lib/api/deals';
import { fetchAllProfiles, profileLabel } from '../../../lib/api/profile';
import { fetchPipelines } from '../../../lib/api/pipelines';
import { useAuth } from '../../../contexts/AuthContext';
import { FIELD_ICONS } from '../../../lib/taskFieldIcons';
import { DUE_STATUS_ICONS } from '../../../lib/dueStatusIcons';
import { todayIso, buildMonthGrid, isoDate, MONTH_NAMES } from '../../../lib/dateHelpers';
import Select from '../../../components/common/Select';
import DatePicker from '../../../components/common/DatePicker';
import ProfileAvatar from '../../../components/common/ProfileAvatar';
import CreateDealTaskModal from '../../../components/Deals/CreateDealTaskModal';
import '../../../styles/reportPage.css';
import '../../../styles/automationTasksPage.css';
import '../../../styles/automationDashboard.css';
import '../../../styles/comparePage.css';
import '../../../styles/clientsDirectory.css';
import '../../../styles/dealsBoard.css';
import '../../../styles/projectsPage.css';
import '../../../styles/myRequestsPage.css';
import '../../../styles/dealTasksPage.css';

const SEARCH_ICON = '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.35-4.35"/></svg>';
const MORE_ICON = '<svg viewBox="0 0 24 24"><circle cx="12" cy="5" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="12" cy="19" r="1.6"/></svg>';
// A two-person glyph for "Призначено" (assignee), distinct from FIELD_ICONS.user's
// single person used for "Поставив" (creator) — same idea, one glance tells them apart.
const PEOPLE_ICON = '<svg viewBox="0 0 24 24"><circle cx="9" cy="8" r="3"/><path d="M3.5 20a5.5 5.5 0 0 1 11 0"/><circle cx="17" cy="8" r="2.4"/><path d="M15 11.3a4.2 4.2 0 0 1 5.5 4"/></svg>';

// Same 3 activity types deals can create today (Задача/Дзвінок/Email) — the
// mockup this page is built from showed ~10 type badges, but only these are
// actually creatable from a deal card right now, so the rest would just be
// permanently-empty filter options.
const TYPE_META = {
  task: { label: 'Задача', color: '#7C3AED', tint: '#EDE7FB', icon: 'checklist' },
  call: { label: 'Дзвінок', color: '#2563EB', tint: '#E8F0FE', icon: 'phone' },
  email: { label: 'Email', color: '#DB2777', tint: '#FCE7F3', icon: 'email' },
};

// Signal-bar icons (Linear/Jira-style) instead of a plain up/down arrow —
// more bars filled reads as "more urgent" at a glance, and it's a distinct
// glyph per level rather than the same arrow just flipped.
// Every <rect> carries its own fill="currentColor" (rather than setting it
// once on the <svg>) so it still renders filled under .deal-tasks-badge
// svg's `fill: none` (that rule targets the <svg> element itself, which
// then wins over an inherited value once fill is set directly per-shape).
const PRIORITY_META = {
  high: {
    label: 'Високий', color: '#DC2626', tint: '#FEE2E2',
    icon: '<svg viewBox="0 0 24 24"><rect fill="currentColor" x="3" y="13" width="4" height="8" rx="1"/><rect fill="currentColor" x="10" y="8" width="4" height="13" rx="1"/><rect fill="currentColor" x="17" y="3" width="4" height="18" rx="1"/></svg>',
  },
  medium: {
    label: 'Середній', color: '#EA580C', tint: '#FFEDD5',
    icon: '<svg viewBox="0 0 24 24"><rect fill="currentColor" x="3" y="13" width="4" height="8" rx="1"/><rect fill="currentColor" x="10" y="8" width="4" height="13" rx="1"/><rect fill="currentColor" opacity=".3" x="17" y="3" width="4" height="18" rx="1"/></svg>',
  },
  low: {
    label: 'Низький', color: '#CA8A04', tint: '#FEF9C3',
    icon: '<svg viewBox="0 0 24 24"><rect fill="currentColor" x="3" y="13" width="4" height="8" rx="1"/><rect fill="currentColor" opacity=".3" x="10" y="8" width="4" height="13" rx="1"/><rect fill="currentColor" opacity=".3" x="17" y="3" width="4" height="18" rx="1"/></svg>',
  },
};

// Kanban columns for the priority-grouped view — same 3 levels as
// PRIORITY_META plus a "no priority set" bucket so every filtered task has
// a column to land in.
const KANBAN_COLUMNS = [
  { key: 'high', label: PRIORITY_META.high.label, color: PRIORITY_META.high.color },
  { key: 'medium', label: PRIORITY_META.medium.label, color: PRIORITY_META.medium.color },
  { key: 'low', label: PRIORITY_META.low.label, color: PRIORITY_META.low.color },
  { key: 'none', label: 'Без пріоритету', color: '#64748B' },
];

// Orthogonal to the raw pending/done/cancelled `status` column — this is
// "how urgent is it right now", derived from `scheduled_at` (deal tasks
// never set `task_date`, so lib/dueStatus.js's date-based version doesn't
// apply here).
const STATUS_META = {
  overdue: { label: 'Протерміновано', color: '#DC2626', tint: '#FEE2E2' },
  due_today: { label: 'Сьогодні', color: '#7C3AED', tint: '#EDE7FB' },
  upcoming: { label: 'Заплановано', color: '#2563EB', tint: '#E8F0FE' },
  no_date: { label: 'Без дати', color: '#64748B', tint: '#F1F5F9' },
  done: { label: 'Виконано', color: '#16A34A', tint: '#DCFCE7' },
  cancelled: { label: 'Скасовано', color: '#64748B', tint: '#F1F5F9' },
};

function deriveStatus(task, today) {
  if (task.status === 'done') return 'done';
  if (task.status === 'cancelled') return 'cancelled';
  const day = task.scheduled_at ? toLocalDateIso(task.scheduled_at) : (task.task_date || null);
  if (!day) return 'no_date';
  if (day < today) return 'overdue';
  if (day === today) return 'due_today';
  return 'upcoming';
}

// "Сьогодні"/"Завтра" + time for near dates (when the exact hour matters),
// a plain calendar date for anything further out (where the hour doesn't).
function fmtDate(iso) {
  if (!iso) return '—';
  const day = toLocalDateIso(iso);
  const today = todayIso();
  const tomorrow = daysAgoIso(-1);
  const time = new Date(iso).toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' });
  if (day === today) return `Сьогодні ${time}`;
  if (day === tomorrow) return `Завтра ${time}`;
  return new Date(iso).toLocaleDateString('uk-UA');
}

// `scheduled_at`/`created_at`/`completed_at` are timestamps (stored/served
// in UTC) — comparing their raw `.slice(0, 10)` against a LOCAL "today" (from
// todayIso()) is wrong close to midnight in any UTC+ timezone: e.g. at
// 01:00 local in UTC+3, toISOString() is still the previous UTC day, so a
// task scheduled "right now" would misread as a day overdue. Every date
// comparison in this file goes through this instead, matching todayIso()'s
// own local-component approach.
function toLocalDateIso(iso) {
  if (!iso) return null;
  // A bare 'YYYY-MM-DD' (task_date/planned_date) is already a calendar date,
  // not a timestamp — parsing it as UTC midnight and reading local
  // components back off it can shift it a day in a negative-offset
  // timezone, so it's returned untouched instead.
  if (iso.length === 10 && !iso.includes('T')) return iso;
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function daysAgoIso(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Purely decorative "wave" for each KPI card's little chart illustration —
// same idea as "Мої заявки"'s hand-authored KPI_CONFIG.bars, not a real
// trend. Four distinct shapes (rising / hump / zigzag / dip-then-recover)
// so the cards read as different at a glance instead of the same shape
// recolored four times.
const KPI_WAVES = {
  total: [35, 45, 40, 55, 65, 60, 80],
  today: [30, 55, 75, 90, 70, 50, 40],
  overdue: [60, 35, 70, 40, 85, 45, 65],
  doneWeek: [70, 50, 30, 45, 60, 80, 95],
};

const TABS = [
  { key: 'all', label: 'Усі задачі' },
  { key: 'mine', label: 'Мої задачі' },
  { key: 'today', label: 'Сьогодні' },
  { key: 'overdue', label: 'Прострочені' },
];

const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Нд'];
const CHEVRON_LEFT = '<svg viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6"/></svg>';
const CHEVRON_RIGHT = '<svg viewBox="0 0 24 24"><path d="M9 18l6-6-6-6"/></svg>';

const PAGE_SIZE_OPTIONS = [
  { value: '10', label: '10' },
  { value: '25', label: '25' },
  { value: '50', label: '50' },
];

export default function DealTasksPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { email: myEmail } = useAuth();
  const [tasks, setTasks] = useState([]);
  const [deals, setDeals] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [pipelines, setPipelines] = useState([]);
  const [loading, setLoading] = useState(true);

  const [tab, setTab] = useState('all');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [pipelineFilter, setPipelineFilter] = useState('');
  const [assigneeFilter, setAssigneeFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [rowMenuOpenId, setRowMenuOpenId] = useState(null);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [viewMode, setViewMode] = useState('list');
  const [taskDetailId, setTaskDetailId] = useState(null);
  const [editTaskRow, setEditTaskRow] = useState(null);
  const now = new Date();
  const [calYear, setCalYear] = useState(now.getFullYear());
  const [calMonth, setCalMonth] = useState(now.getMonth() + 1);

  function reload() {
    setLoading(true);
    Promise.all([fetchAllDealTasks(), fetchAllDeals(), fetchAllProfiles(), fetchPipelines()])
      .then(([t, d, p, pl]) => { setTasks(t); setDeals(d); setProfiles(p); setPipelines(pl); })
      .finally(() => setLoading(false));
  }

  useEffect(() => { reload(); }, []);

  // Deep link from a notification (`/reports/deal-tasks?open=<taskId>`) —
  // tasks only load once `reload()` above resolves, so this waits for that
  // instead of firing on mount. Also re-runs on every `searchParams` change
  // (not just on mount/load) — clicking a *second* notification while
  // already on this page only changes the query string, it doesn't remount
  // the component or flip `loading`, so that had to be a real dependency
  // too, not just `loading`.
  useEffect(() => {
    const openId = searchParams.get('open');
    // Waits for `loading` to clear (the first `reload()` to finish) rather
    // than for `tasks` to be non-empty — otherwise a deal-tasks page with
    // genuinely zero tasks would never clear the `open` param at all.
    if (!openId || loading) return;
    const found = tasks.find((t) => String(t.id) === String(openId));
    if (found) setTaskDetailId(found.id);
    setSearchParams((sp) => { sp.delete('open'); return sp; }, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, searchParams]);

  useEffect(() => {
    if (rowMenuOpenId === null) return;
    function onDocClick(e) { if (!e.target.closest('.row-menu')) setRowMenuOpenId(null); }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [rowMenuOpenId]);

  const dealsById = useMemo(() => {
    const map = {};
    deals.forEach((d) => { map[d.id] = d; });
    return map;
  }, [deals]);

  const profilesByEmail = useMemo(() => {
    const map = {};
    profiles.forEach((p) => { map[p.email] = p; });
    return map;
  }, [profiles]);

  const today = todayIso();

  // One row per task, enriched with everything the table/filters need —
  // computed once so neither the KPI pass nor the filter pass repeats it.
  const rows = useMemo(() => tasks.map((t) => {
    const deal = dealsById[t.deal_id];
    const lines = (t.text || '').split('\n');
    return {
      task: t,
      deal,
      title: lines[0] || '(без назви)',
      subtitle: lines.slice(1).join(' ').trim(),
      dealLabel: deal ? (deal.title || deal.clients?.company || deal.clients?.name || 'Угода') : 'Угода видалена',
      pipelineName: deal?.pipelines?.name || '',
      clientLabel: deal?.clients?.name || deal?.clients?.company || '',
      pipelineId: deal?.pipeline_id || null,
      dueStatus: deriveStatus(t, today),
      dateIso: toLocalDateIso(t.scheduled_at || t.task_date),
      createdDateIso: toLocalDateIso(t.created_at),
      completedDateIso: toLocalDateIso(t.completed_at),
    };
  }), [tasks, dealsById, today]);

  function handleReset() {
    setSearch(''); setStatusFilter(''); setTypeFilter(''); setPipelineFilter(''); setAssigneeFilter('');
    setDateFrom(''); setDateTo(''); setPage(1);
  }

  const tabFiltered = useMemo(() => rows.filter((r) => {
    if (tab === 'mine') return r.task.assignee_email === myEmail;
    if (tab === 'today') return r.dueStatus === 'due_today';
    if (tab === 'overdue') return r.dueStatus === 'overdue';
    return true;
  }), [rows, tab, myEmail]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return tabFiltered.filter((r) => {
      if (q) {
        const hit = r.title.toLowerCase().includes(q) || r.dealLabel.toLowerCase().includes(q) || r.clientLabel.toLowerCase().includes(q);
        if (!hit) return false;
      }
      if (statusFilter && r.dueStatus !== statusFilter) return false;
      if (typeFilter && r.task.activity_type !== typeFilter) return false;
      if (pipelineFilter && String(r.pipelineId) !== pipelineFilter) return false;
      if (assigneeFilter && r.task.assignee_email !== assigneeFilter) return false;
      if (dateFrom && (!r.dateIso || r.dateIso < dateFrom)) return false;
      if (dateTo && (!r.dateIso || r.dateIso > dateTo)) return false;
      return true;
    });
  }, [tabFiltered, search, statusFilter, typeFilter, pipelineFilter, assigneeFilter, dateFrom, dateTo]);

  const tabCounts = useMemo(() => ({
    all: rows.length,
    mine: rows.filter((r) => r.task.assignee_email === myEmail).length,
    today: rows.filter((r) => r.dueStatus === 'due_today').length,
    overdue: rows.filter((r) => r.dueStatus === 'overdue').length,
  }), [rows, myEmail]);

  const kpis = useMemo(() => {
    const weekAgo = daysAgoIso(7);
    const twoWeeksAgo = daysAgoIso(14);
    const createdThisWeek = rows.filter((r) => r.createdDateIso >= weekAgo).length;
    const createdPrevWeek = rows.filter((r) => r.createdDateIso >= twoWeeksAgo && r.createdDateIso < weekAgo).length;
    const doneThisWeek = rows.filter((r) => r.task.status === 'done' && r.completedDateIso >= weekAgo).length;
    const donePrevWeek = rows.filter((r) => r.task.status === 'done' && r.completedDateIso >= twoWeeksAgo && r.completedDateIso < weekAgo).length;
    return {
      total: rows.length,
      totalDelta: createdThisWeek - createdPrevWeek,
      today: tabCounts.today,
      overdue: tabCounts.overdue,
      doneWeek: doneThisWeek,
      doneWeekDelta: doneThisWeek - donePrevWeek,
    };
  }, [rows, tabCounts]);


  // Tasks/calls without a scheduled date have nowhere to land on a day grid —
  // grouped separately so the calendar can surface how many are hidden.
  const tasksByDay = useMemo(() => {
    const map = {};
    filtered.forEach((r) => { if (r.dateIso) (map[r.dateIso] = map[r.dateIso] || []).push(r); });
    return map;
  }, [filtered]);
  const noDateCount = useMemo(() => filtered.filter((r) => !r.dateIso).length, [filtered]);
  const calCells = useMemo(() => buildMonthGrid(calYear, calMonth), [calYear, calMonth]);

  function shiftCalMonth(delta) {
    let m = calMonth + delta;
    let y = calYear;
    if (m < 1) { m = 12; y -= 1; }
    if (m > 12) { m = 1; y += 1; }
    setCalMonth(m);
    setCalYear(y);
  }

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const clampedPage = Math.min(page, pageCount);
  const paged = filtered.slice((clampedPage - 1) * pageSize, clampedPage * pageSize);
  const rangeStart = filtered.length ? (clampedPage - 1) * pageSize + 1 : 0;
  const rangeEnd = Math.min(clampedPage * pageSize, filtered.length);
  const taskDetailRow = taskDetailId ? rows.find((r) => r.task.id === taskDetailId) : null;

  async function handleSetStatus(row, status) {
    setTasks((t) => t.map((it) => (it.id === row.task.id ? { ...it, status } : it)));
    await setTaskStatus(row.task.id, status);
  }

  // Unlike Скасувати (which just marks the task cancelled), this actually
  // removes the row — for a task added by mistake, not one that just didn't
  // happen.
  async function handleDeleteTask(row) {
    if (!confirm('Видалити цю задачу назавжди? Цю дію не можна скасувати.')) return;
    setTasks((t) => t.filter((it) => it.id !== row.task.id));
    setTaskDetailId((id) => (id === row.task.id ? null : id));
    await deleteTask(row.task.id);
  }

  return (
    <div className="report-page deal-tasks-page">
      <div className="deal-tasks-tabs-row">
        <div className="chan-tabs deal-tasks-tabs">
          {TABS.map((t) => (
            <button key={t.key} type="button" className={'chan-tab' + (tab === t.key ? ' active' : '')} onClick={() => { setTab(t.key); setPage(1); }}>
              {t.label} <span className="deal-tasks-tab-count">{tabCounts[t.key]}</span>
            </button>
          ))}
        </div>
        <button type="button" className="btn btn-p" onClick={() => setCreateModalOpen(true)}>
          <span dangerouslySetInnerHTML={{ __html: FIELD_ICONS.plus }} /> Створити задачу
        </button>
      </div>

      <div className="deal-tasks-toolbar">
        <div className="myreq-filters">
          <div className="pf myreq-keyword">
            <label>Пошук</label>
            <div className="mc-client-search">
              <span dangerouslySetInnerHTML={{ __html: SEARCH_ICON }} />
              <input type="text" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="Пошук задач..." />
            </div>
          </div>
          <div className="pf">
            <label>Статус</label>
            <Select
              value={statusFilter} onChange={(v) => { setStatusFilter(v); setPage(1); }} placeholder="Усі статуси"
              options={[{ value: '', label: 'Усі статуси' }, ...Object.entries(STATUS_META).map(([k, m]) => ({ value: k, label: m.label }))]}
            />
          </div>
          <div className="pf">
            <label>Тип</label>
            <Select
              value={typeFilter} onChange={(v) => { setTypeFilter(v); setPage(1); }} placeholder="Усі типи"
              options={[{ value: '', label: 'Усі типи' }, ...ACTIVITY_TYPES.map((t) => ({ value: t.value, label: t.label }))]}
            />
          </div>
          <div className="pf">
            <label>Джерело</label>
            <Select
              value={pipelineFilter} onChange={(v) => { setPipelineFilter(v); setPage(1); }} placeholder="Усі джерела"
              options={[{ value: '', label: 'Усі джерела' }, ...pipelines.map((p) => ({ value: String(p.id), label: p.name }))]}
            />
          </div>
          <div className="pf">
            <label>Виконавець</label>
            <Select
              value={assigneeFilter} onChange={(v) => { setAssigneeFilter(v); setPage(1); }} placeholder="Усі виконавці"
              options={[{ value: '', label: 'Усі виконавці' }, ...profiles.map((p) => ({ value: p.email, label: profileLabel(p) }))]}
            />
          </div>
          <div className="pf"><label>Дата з</label><DatePicker value={dateFrom} onChange={(v) => { setDateFrom(v); setPage(1); }} /></div>
          <div className="pf"><label>Дата по</label><DatePicker value={dateTo} onChange={(v) => { setDateTo(v); setPage(1); }} /></div>
          <div className="pf myreq-reset-wrap">
            <label className="myreq-reset-label">&nbsp;</label>
            <button type="button" className="btn myreq-reset" onClick={handleReset}>
              <span dangerouslySetInnerHTML={{ __html: FIELD_ICONS.undo }} /> Скинути
            </button>
          </div>
        </div>

        <div className="deal-tasks-view-toggle">
          <button type="button" className={viewMode === 'list' ? 'on' : ''} title="Список" onClick={() => setViewMode('list')}>
            <span dangerouslySetInnerHTML={{ __html: FIELD_ICONS.list }} />
          </button>
          <button type="button" className={viewMode === 'calendar' ? 'on' : ''} title="Календар" onClick={() => setViewMode('calendar')}>
            <span dangerouslySetInnerHTML={{ __html: FIELD_ICONS.day }} />
          </button>
          <button type="button" className={viewMode === 'kanban' ? 'on' : ''} title="Канбан за пріоритетом" onClick={() => setViewMode('kanban')}>
            <span dangerouslySetInnerHTML={{ __html: FIELD_ICONS.kanban }} />
          </button>
        </div>
      </div>

      {loading ? (
        <div className="empty-hint">Завантаження...</div>
      ) : (
        <>
          <div className="myreq-kpi-row deal-tasks-kpi-row">
            <div className="myreq-kpi-card deal-tasks-kpi-card purple">
              <div className="myreq-kpi-left">
                <span className="myreq-kpi-ic" dangerouslySetInnerHTML={{ __html: FIELD_ICONS.checklist }} />
                <div>
                  <div className="myreq-kpi-label">Всього задач</div>
                  <div className="myreq-kpi-value-row">
                    <span className="myreq-kpi-value">{kpis.total}</span>
                    {kpis.totalDelta !== 0 && (
                      <span className="myreq-kpi-delta">{kpis.totalDelta > 0 ? '▲' : '▼'} {kpis.totalDelta > 0 ? '+' : ''}{kpis.totalDelta}</span>
                    )}
                  </div>
                  <div className="myreq-kpi-sub">за останні 7 днів</div>
                </div>
              </div>
              <div className="myreq-kpi-spark">
                {KPI_WAVES.total.map((h, i) => <span key={i} className="myreq-kpi-bar" style={{ height: h + '%', opacity: .35 + i * 0.09 }} />)}
              </div>
            </div>

            <div className="myreq-kpi-card deal-tasks-kpi-card yellow">
              <div className="myreq-kpi-left">
                <span className="myreq-kpi-ic" dangerouslySetInnerHTML={{ __html: FIELD_ICONS.history }} />
                <div>
                  <div className="myreq-kpi-label">Сьогодні</div>
                  <div className="myreq-kpi-value-row">
                    <span className="myreq-kpi-value">{kpis.today}</span>
                  </div>
                  <div className="myreq-kpi-sub">заплановано на сьогодні</div>
                </div>
              </div>
              <div className="myreq-kpi-spark">
                {KPI_WAVES.today.map((h, i) => <span key={i} className="myreq-kpi-bar" style={{ height: h + '%', opacity: .35 + i * 0.09 }} />)}
              </div>
            </div>

            <div className="myreq-kpi-card deal-tasks-kpi-card red">
              <div className="myreq-kpi-left">
                <span className="myreq-kpi-ic" dangerouslySetInnerHTML={{ __html: FIELD_ICONS.deadline }} />
                <div>
                  <div className="myreq-kpi-label">Прострочені</div>
                  <div className="myreq-kpi-value-row">
                    <span className="myreq-kpi-value">{kpis.overdue}</span>
                  </div>
                  <div className="myreq-kpi-sub">потребують уваги</div>
                </div>
              </div>
              <div className="myreq-kpi-spark">
                {KPI_WAVES.overdue.map((h, i) => <span key={i} className="myreq-kpi-bar" style={{ height: h + '%', opacity: .35 + i * 0.09 }} />)}
              </div>
            </div>

            <div className="myreq-kpi-card deal-tasks-kpi-card green">
              <div className="myreq-kpi-left">
                <span className="myreq-kpi-ic" dangerouslySetInnerHTML={{ __html: FIELD_ICONS.check }} />
                <div>
                  <div className="myreq-kpi-label">Завершено (тиждень)</div>
                  <div className="myreq-kpi-value-row">
                    <span className="myreq-kpi-value">{kpis.doneWeek}</span>
                    {kpis.doneWeekDelta !== 0 && (
                      <span className="myreq-kpi-delta">{kpis.doneWeekDelta > 0 ? '▲' : '▼'} {kpis.doneWeekDelta > 0 ? '+' : ''}{kpis.doneWeekDelta}</span>
                    )}
                  </div>
                  <div className="myreq-kpi-sub">за останні 7 днів</div>
                </div>
              </div>
              <div className="myreq-kpi-spark">
                {KPI_WAVES.doneWeek.map((h, i) => <span key={i} className="myreq-kpi-bar" style={{ height: h + '%', opacity: .35 + i * 0.09 }} />)}
              </div>
            </div>
          </div>

          {filtered.length === 0 ? (
            <div className="placeholder"><p>{rows.length === 0 ? 'Задач по угодах ще немає.' : 'Немає задач за цим фільтром.'}</p></div>
          ) : viewMode === 'calendar' ? (
            <div className="deal-tasks-cal">
              <div className="deal-tasks-cal-nav">
                <span className="deal-tasks-cal-month-label">{MONTH_NAMES[calMonth - 1]} {calYear}</span>
                <div className="deal-tasks-cal-nav-btns">
                  <button type="button" onClick={() => shiftCalMonth(-1)} aria-label="Попередній місяць" dangerouslySetInnerHTML={{ __html: CHEVRON_LEFT }} />
                  <button type="button" className="deal-tasks-cal-today-btn" onClick={() => { setCalYear(now.getFullYear()); setCalMonth(now.getMonth() + 1); }}>Сьогодні</button>
                  <button type="button" onClick={() => shiftCalMonth(1)} aria-label="Наступний місяць" dangerouslySetInnerHTML={{ __html: CHEVRON_RIGHT }} />
                </div>
              </div>
              <div className="deal-tasks-cal-grid">
                {WEEKDAYS.map((w) => <div key={w} className="deal-tasks-cal-dow">{w}</div>)}
                {calCells.map((c, i) => {
                  const iso = isoDate(c.year, c.month, c.day);
                  const items = tasksByDay[iso] || [];
                  const shown = items.slice(0, 3);
                  const extra = items.length - shown.length;
                  return (
                    <div key={i} className={'deal-tasks-cal-cell' + (c.out ? ' out' : '') + (iso === today ? ' today' : '')}>
                      <div className="deal-tasks-cal-daynum">{c.day}</div>
                      <div className="deal-tasks-cal-items">
                        {shown.map((r) => {
                          const type = TYPE_META[r.task.activity_type] || TYPE_META.task;
                          return (
                            <button
                              key={r.task.id} type="button" className="deal-tasks-cal-chip"
                              onClick={() => setTaskDetailId(r.task.id)} title={r.title}
                            >
                              <span className="deal-tasks-cal-chip-ic" style={{ background: type.color }} dangerouslySetInnerHTML={{ __html: FIELD_ICONS[type.icon] }} />
                              <span className="deal-tasks-cal-chip-text">{r.title}</span>
                            </button>
                          );
                        })}
                        {extra > 0 && <div className="deal-tasks-cal-more">+{extra} ще</div>}
                      </div>
                    </div>
                  );
                })}
              </div>
              {noDateCount > 0 && (
                <div className="deal-tasks-cal-nodate-hint">{noDateCount} задач без дати не показані в календарі</div>
              )}
            </div>
          ) : viewMode === 'kanban' ? (
            <div className="deals-board deal-tasks-priority-board">
              {KANBAN_COLUMNS.map((col) => {
                const items = filtered.filter((r) => (r.task.priority || 'none') === col.key);
                return (
                  <div className="deals-column" key={col.key} style={{ '--stage-color': col.color }}>
                    <div className="deals-column-head">
                      <span className="deals-column-label">
                        <span className="deals-column-dot" />
                        {col.label}
                      </span>
                      <span className="deals-column-count">{items.length}</span>
                    </div>
                    <div className="deals-column-body">
                      {items.length === 0 ? (
                        <div className="empty-hint">Немає задач</div>
                      ) : items.map((r) => {
                        const type = TYPE_META[r.task.activity_type] || TYPE_META.task;
                        const status = STATUS_META[r.dueStatus];
                        const assignee = r.task.assignee_email ? profilesByEmail[r.task.assignee_email] : null;
                        const assigneeName = assignee ? profileLabel(assignee) : r.task.assignee_email;
                        return (
                          <div key={r.task.id} className="deal-tasks-kanban-card" onClick={() => setTaskDetailId(r.task.id)}>
                            <div className="deal-tasks-kanban-card-top">
                              <span className="deal-tasks-kanban-card-ic" style={{ background: type.tint, color: type.color }} dangerouslySetInnerHTML={{ __html: FIELD_ICONS[type.icon] }} />
                              <span className="deal-tasks-kanban-card-title">{r.title}</span>
                            </div>
                            {r.dealLabel && <div className="deal-tasks-subtitle">{r.dealLabel}</div>}
                            <div className="deal-tasks-kanban-card-foot">
                              {r.dueStatus === 'done' || r.dueStatus === 'cancelled' ? (
                                <span className={'deal-tasks-kanban-status ' + r.dueStatus}>{r.dueStatus === 'done' ? 'Виконана' : 'Скасовано'}</span>
                              ) : (
                                <span className="deal-tasks-kanban-status" style={{ color: status.color, background: status.tint, borderColor: `${status.color}4D` }}>{status.label}</span>
                              )}
                              {(assignee || r.task.assignee_email) && (
                                <ProfileAvatar
                                  profile={assignee} email={r.task.assignee_email} name={assigneeName}
                                  className="task-avatar deal-tasks-kanban-avatar" title={assigneeName}
                                />
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <>
              <div className="deal-tasks-grid">
                <div className="deal-tasks-grid-header">
                  <div>Задача</div>
                  <div>Угода / Клієнт</div>
                  <div>Тип</div>
                  <div>Пріоритет</div>
                  <div>Статус</div>
                  <div>Виконавець</div>
                  <div>Дата</div>
                  <button type="button" className="deal-tasks-grid-settings" disabled title="Налаштування колонок — скоро">
                    <span dangerouslySetInnerHTML={{ __html: FIELD_ICONS.settings }} />
                  </button>
                </div>

                {paged.map((r) => {
                  const type = TYPE_META[r.task.activity_type] || TYPE_META.task;
                  const priority = PRIORITY_META[r.task.priority];
                  const status = STATUS_META[r.dueStatus];
                  const assignee = r.task.assignee_email ? profilesByEmail[r.task.assignee_email] : null;
                  const assigneeName = assignee ? profileLabel(assignee) : r.task.assignee_email;
                  const dateStr = fmtDate(r.task.scheduled_at || r.task.task_date);
                  return (
                    <div key={r.task.id} className="deal-tasks-grid-row" onClick={() => setTaskDetailId(r.task.id)}>
                      <div className="deal-tasks-title-row">
                        <span className="deal-tasks-title-ic" style={{ background: type.tint, color: type.color }} dangerouslySetInnerHTML={{ __html: FIELD_ICONS[type.icon] }} />
                        <div className="deal-tasks-title-text">
                          <div className="ink">{r.title}</div>
                          {r.subtitle && <div className="deal-tasks-subtitle">{r.subtitle}</div>}
                        </div>
                      </div>
                      <div>
                        <div className="deal-tasks-link">{r.dealLabel}{r.pipelineName ? ` · ${r.pipelineName}` : ''}</div>
                        {r.clientLabel && <div className="deal-tasks-subtitle">Client: {r.clientLabel}</div>}
                      </div>
                      <div>
                        <span className="deal-tasks-badge" style={{ color: type.color, background: type.tint, border: `1px solid ${type.color}4D` }}>
                          <span dangerouslySetInnerHTML={{ __html: FIELD_ICONS[type.icon] }} /> {type.label}
                        </span>
                      </div>
                      <div>
                        {priority && (
                          <span
                            className={'deal-tasks-badge' + (r.task.priority === 'high' ? ' pulse' : '')}
                            style={{ color: priority.color, background: priority.tint, border: `1px solid ${priority.color}4D` }}
                          >
                            <span dangerouslySetInnerHTML={{ __html: priority.icon }} /> {priority.label}
                          </span>
                        )}
                      </div>
                      <div>
                        {r.dueStatus === 'done' || r.dueStatus === 'cancelled' ? (
                          <span className={'deal-history-status ' + r.dueStatus}>{r.dueStatus === 'done' ? 'Виконана' : 'Скасовано'}</span>
                        ) : (
                          <span className="deal-tasks-badge" style={{ color: status.color, background: status.tint, border: `1px solid ${status.color}4D` }}>
                            <span dangerouslySetInnerHTML={{ __html: DUE_STATUS_ICONS[r.dueStatus] }} /> {status.label}
                          </span>
                        )}
                      </div>
                      <div>
                        {assignee || r.task.assignee_email ? (
                          <span className="deal-tasks-assignee">
                            <ProfileAvatar profile={assignee} email={r.task.assignee_email} name={assigneeName} />
                            {assigneeName}
                          </span>
                        ) : '—'}
                      </div>
                      <div className="deal-tasks-date">
                        <span dangerouslySetInnerHTML={{ __html: FIELD_ICONS.day }} /> {dateStr}
                      </div>
                      <div className="row-menu" onClick={(e) => e.stopPropagation()}>
                        <button type="button" className="row-menu-btn" onClick={() => setRowMenuOpenId((id) => (id === r.task.id ? null : r.task.id))} aria-label="Дії">
                          <span dangerouslySetInnerHTML={{ __html: MORE_ICON }} />
                        </button>
                        {rowMenuOpenId === r.task.id && (
                          <div className="row-menu-popover">
                            {r.deal && <button type="button" onClick={() => { setRowMenuOpenId(null); navigate(`/reports/deals?open=${r.deal.id}`); }}>Відкрити угоду</button>}
                            {r.task.status === 'pending' ? (
                              <>
                                <button type="button" onClick={() => { setRowMenuOpenId(null); handleSetStatus(r, 'done'); }}>Позначити виконаною</button>
                                <button type="button" onClick={() => { setRowMenuOpenId(null); handleSetStatus(r, 'cancelled'); }}>Скасувати</button>
                              </>
                            ) : (
                              <button type="button" onClick={() => { setRowMenuOpenId(null); handleSetStatus(r, 'pending'); }}>Повернути в роботу</button>
                            )}
                            <button type="button" className="danger" onClick={() => { setRowMenuOpenId(null); handleDeleteTask(r); }}>Видалити</button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="month-pagination">
                <div className="month-pagination-hint">
                  Показано {rangeStart}-{rangeEnd} з {filtered.length} задач
                </div>
                {pageCount > 1 && (
                  <div className="month-pagination-pages">
                    <button type="button" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={clampedPage === 1} aria-label="Попередня сторінка">&#8249;</button>
                    {Array.from({ length: pageCount }, (_, i) => i + 1).map((n) => (
                      <button key={n} type="button" className={n === clampedPage ? 'on' : ''} onClick={() => setPage(n)}>{n}</button>
                    ))}
                    <button type="button" onClick={() => setPage((p) => Math.min(pageCount, p + 1))} disabled={clampedPage === pageCount} aria-label="Наступна сторінка">&#8250;</button>
                  </div>
                )}
                <div className="deal-tasks-page-size">
                  Показувати по
                  <Select
                    value={String(pageSize)} onChange={(v) => { setPageSize(Number(v)); setPage(1); }}
                    options={PAGE_SIZE_OPTIONS}
                  />
                </div>
              </div>
            </>
          )}
        </>
      )}

      {createModalOpen && (
        <CreateDealTaskModal
          deals={deals}
          profiles={profiles.map((p) => ({ email: p.email, label: profileLabel(p) }))}
          myEmail={myEmail}
          onClose={() => setCreateModalOpen(false)}
          onCreated={(row) => setTasks((t) => [row, ...t])}
        />
      )}

      {taskDetailRow && createPortal(
        <div className="tmodal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setTaskDetailId(null); }}>
          <div className="tmodal-box deal-tasks-detail-box">
            <div className="tmodal-head">
              <div className="pipeline-modal-head">
                <span
                  className="pipeline-modal-head-ic"
                  style={{ background: (TYPE_META[taskDetailRow.task.activity_type] || TYPE_META.task).tint, color: (TYPE_META[taskDetailRow.task.activity_type] || TYPE_META.task).color }}
                  dangerouslySetInnerHTML={{ __html: FIELD_ICONS[(TYPE_META[taskDetailRow.task.activity_type] || TYPE_META.task).icon] }}
                />
                <div>
                  <h3>{(TYPE_META[taskDetailRow.task.activity_type] || TYPE_META.task).label}</h3>
                  <p className="deal-tasks-detail-when">
                    <span dangerouslySetInnerHTML={{ __html: FIELD_ICONS.history }} />
                    {fmtDate(taskDetailRow.task.scheduled_at || taskDetailRow.task.task_date)}
                  </p>
                </div>
              </div>
              <button type="button" className="tmodal-close deal-tasks-detail-close" onClick={() => setTaskDetailId(null)} aria-label="Закрити">&times;</button>
            </div>
            <div className="tmodal-body">
              {taskDetailRow.deal && (
                <button
                  type="button" className="deal-tasks-detail-dealbox"
                  onClick={() => { setTaskDetailId(null); navigate(`/reports/deals?open=${taskDetailRow.deal.id}`); }}
                >
                  <span className="deal-tasks-detail-dealbox-ic" dangerouslySetInnerHTML={{ __html: FIELD_ICONS.briefcase }} />
                  <span className="deal-tasks-detail-dealbox-text">
                    <span className="deal-tasks-link">{taskDetailRow.dealLabel}{taskDetailRow.pipelineName ? ` · ${taskDetailRow.pipelineName}` : ''}</span>
                    {taskDetailRow.clientLabel && <span className="deal-tasks-subtitle">Client: {taskDetailRow.clientLabel}</span>}
                  </span>
                  <span className="deal-tasks-detail-dealbox-arrow" dangerouslySetInnerHTML={{ __html: FIELD_ICONS.externalLink }} />
                </button>
              )}

              <label className="deal-tasks-detail-label">Опис задачі</label>
              <p className="deal-tasks-detail-text">{taskDetailRow.task.text || '—'}</p>

              <div className="deal-tasks-detail-meta">
                {taskDetailRow.task.priority && (
                  <span className="deal-tasks-detail-pill" style={{ background: (PRIORITY_META[taskDetailRow.task.priority] || {}).tint, borderColor: `${(PRIORITY_META[taskDetailRow.task.priority] || {}).color}4D` }}>
                    <span style={{ color: (PRIORITY_META[taskDetailRow.task.priority] || {}).color }} dangerouslySetInnerHTML={{ __html: FIELD_ICONS.priority }} />
                    Пріоритет: <b style={{ color: (PRIORITY_META[taskDetailRow.task.priority] || {}).color }}>{PRIORITY_META[taskDetailRow.task.priority]?.label}</b>
                  </span>
                )}
                {taskDetailRow.task.created_by_email && (
                  <span className="deal-tasks-detail-pill">
                    <span dangerouslySetInnerHTML={{ __html: FIELD_ICONS.user }} />
                    Поставив: <b>{profileLabel(profilesByEmail[taskDetailRow.task.created_by_email] || { email: taskDetailRow.task.created_by_email })}</b>
                  </span>
                )}
                {taskDetailRow.task.assignee_email && (
                  <span className="deal-tasks-detail-pill">
                    <span dangerouslySetInnerHTML={{ __html: PEOPLE_ICON }} />
                    Призначено: <b>{profileLabel(profilesByEmail[taskDetailRow.task.assignee_email] || { email: taskDetailRow.task.assignee_email })}</b>
                  </span>
                )}
              </div>
            </div>
            <div className="tmodal-foot">
              <button type="button" className="btn btn-danger" style={{ marginRight: 'auto' }} onClick={() => handleDeleteTask(taskDetailRow)}>Видалити</button>
              <button type="button" className="btn" onClick={() => setEditTaskRow(taskDetailRow)}>Редагувати</button>
              {taskDetailRow.task.status === 'pending' ? (
                <>
                  <button type="button" className="btn deal-tasks-detail-cancel-btn" onClick={() => handleSetStatus(taskDetailRow, 'cancelled')}>Скасувати</button>
                  <button type="button" className="btn btn-p" onClick={() => handleSetStatus(taskDetailRow, 'done')}>Виконано</button>
                </>
              ) : (
                <button type="button" className="btn" onClick={() => handleSetStatus(taskDetailRow, 'pending')}>
                  <span dangerouslySetInnerHTML={{ __html: FIELD_ICONS.undo }} /> Повернути в роботу
                </button>
              )}
            </div>
          </div>
        </div>,
        document.body,
      )}

      {editTaskRow && (
        <CreateDealTaskModal
          task={editTaskRow.task}
          deal={editTaskRow.deal}
          deals={deals}
          profiles={profiles.map((p) => ({ email: p.email, label: profileLabel(p) }))}
          myEmail={myEmail}
          onClose={() => setEditTaskRow(null)}
          onSaved={(patch) => { setTasks((t) => t.map((it) => (it.id === editTaskRow.task.id ? { ...it, ...patch } : it))); setEditTaskRow(null); }}
        />
      )}
    </div>
  );
}
