import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { fetchAllDealTasks, setTaskStatus, deleteTask, ACTIVITY_TYPES } from '../../../lib/api/tasks';
import { fetchAllDeals } from '../../../lib/api/deals';
import { fetchAllProfiles, profileLabel } from '../../../lib/api/profile';
import { fetchPipelines } from '../../../lib/api/pipelines';
import { useAuth } from '../../../contexts/AuthContext';
import { FIELD_ICONS } from '../../../lib/taskFieldIcons';
import { DUE_STATUS_ICONS } from '../../../lib/dueStatusIcons';
import { PAGE_ICONS } from '../../../lib/pageIcons';
import { todayIso, buildMonthGrid, isoDate, MONTH_NAMES } from '../../../lib/dateHelpers';
import ActionIcon from '../../../components/common/ActionIcon';
import Select from '../../../components/common/Select';
import DatePicker from '../../../components/common/DatePicker';
import ProfileAvatar from '../../../components/common/ProfileAvatar';
import CreateDealTaskModal from '../../../components/Deals/CreateDealTaskModal';
import '../../../styles/reportPage.css';
import '../../../styles/automationTasksPage.css';
import '../../../styles/dealsBoard.css';
import '../../../styles/dealTasksPage.css';

// Sales — Задачі (update "sales tasks" kit): one working area with three views of
// the same filtered data — Список, Календар, Канбан за пріоритетом. Order is the
// same in every view so nothing jumps when switching: summary → scopes + create →
// filters → view switch → content. Filters, scope and page live in this component's
// state, so they survive a view change.

// Same 3 activity types deals can create today (Задача/Дзвінок/Email) — only
// these are creatable from a deal card right now, so more would be permanently
// empty filter options.
const TYPE_META = {
  task: { label: 'Задача', color: '#6B2A8E', tint: '#F1E6F8', icon: 'checklist' },
  call: { label: 'Дзвінок', color: '#6B2A8E', tint: '#F1E6F8', icon: 'phone' },
  email: { label: 'Email', color: '#6B2A8E', tint: '#F1E6F8', icon: 'email' },
};

// Signal-bar glyphs (more bars = more urgent): a distinct shape per level, so
// priority never depends on colour alone. Every <rect> carries its own fill so it
// still renders under `svg { fill: none }`.
const BARS = (a, b, c) => `<svg viewBox="0 0 24 24"><rect fill="currentColor" opacity="${a}" x="3" y="13" width="4" height="8" rx="1"/><rect fill="currentColor" opacity="${b}" x="10" y="8" width="4" height="13" rx="1"/><rect fill="currentColor" opacity="${c}" x="17" y="3" width="4" height="18" rx="1"/></svg>`;
const PRIORITY_META = {
  high: { label: 'Високий', color: '#B3261E', tint: '#FDE8EA', icon: BARS(1, 1, 1) },
  medium: { label: 'Середній', color: '#9A5B00', tint: '#FFF1D6', icon: BARS(1, 1, 0.3) },
  low: { label: 'Низький', color: '#4B3FB0', tint: '#ECE9FB', icon: BARS(1, 0.3, 0.3) },
};
const NO_PRIORITY = { label: 'Без пріоритету', color: '#746080', tint: '#F3EEF6', icon: BARS(0.3, 0.3, 0.3) };

// Board columns: the three priorities, plus a "no priority" column that only
// appears when some filtered task actually has none (so nothing is lost).
const BOARD_COLUMNS = [
  { key: 'high', ...PRIORITY_META.high },
  { key: 'medium', ...PRIORITY_META.medium },
  { key: 'low', ...PRIORITY_META.low },
];

// Orthogonal to the raw pending/done/cancelled `status` column — "how urgent is
// it right now", derived from `scheduled_at` (deal tasks never set `task_date`).
const STATUS_META = {
  overdue: { label: 'Протерміновано', color: '#B3261E', tint: '#FDE8EA' },
  due_today: { label: 'Сьогодні', color: '#6B2A8E', tint: '#EBD9F5' },
  upcoming: { label: 'Заплановано', color: '#6B2A8E', tint: '#F4ECFA' },
  no_date: { label: 'Без дати', color: '#746080', tint: '#F3EEF6' },
  done: { label: 'Виконано', color: '#1E7A4E', tint: '#E5F5EC' },
  cancelled: { label: 'Скасовано', color: '#746080', tint: '#F3EEF6' },
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

// "Сьогодні"/"Завтра" + time for near dates (when the exact hour matters), a
// plain calendar date for anything further out.
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

// `scheduled_at`/`created_at`/`completed_at` are timestamps (UTC) — comparing
// their raw `.slice(0, 10)` against a LOCAL "today" is wrong near midnight in a
// UTC+ timezone, so every date comparison goes through this instead.
function toLocalDateIso(iso) {
  if (!iso) return null;
  // A bare 'YYYY-MM-DD' is already a calendar date, not a timestamp.
  if (iso.length === 10 && !iso.includes('T')) return iso;
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function daysAgoIso(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const TABS = [
  { key: 'all', label: 'Усі задачі' },
  { key: 'mine', label: 'Мої задачі' },
  { key: 'today', label: 'Сьогодні' },
  { key: 'overdue', label: 'Прострочені' },
];

const VIEWS = [
  { key: 'list', label: 'Список', icon: 'list' },
  { key: 'calendar', label: 'Календар', icon: 'day' },
  { key: 'kanban', label: 'Канбан за пріоритетом', icon: 'kanban' },
];

const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Нд'];
const MORE_ICON = '<svg viewBox="0 0 24 24"><circle cx="12" cy="5" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="12" cy="19" r="1.6"/></svg>';
// A two-person glyph for "Призначено" (assignee), distinct from the single
// person used for "Поставив" (creator).
const PEOPLE_ICON = '<svg viewBox="0 0 24 24"><circle cx="9" cy="8" r="3"/><path d="M3.5 20a5.5 5.5 0 0 1 11 0"/><circle cx="17" cy="8" r="2.4"/><path d="M15 11.3a4.2 4.2 0 0 1 5.5 4"/></svg>';

const PAGE_SIZE_OPTIONS = [
  { value: '10', label: '10' },
  { value: '25', label: '25' },
  { value: '50', label: '50' },
];

function Icon({ html }) {
  return <span className="dtp-ic" aria-hidden="true" dangerouslySetInnerHTML={{ __html: html }} />;
}

function Badge({ meta, icon, children }) {
  return (
    <span className="dtp-badge" style={{ color: meta.color, background: meta.tint }}>
      {icon && <Icon html={icon} />}
      {children || meta.label}
    </span>
  );
}

export default function DealTasksPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { email: myEmail } = useAuth();
  const [tasks, setTasks] = useState([]);
  const [deals, setDeals] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [pipelines, setPipelines] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

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
  const [rowMenu, setRowMenu] = useState(null); // { id, top, right } — fixed-position popover
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [viewMode, setViewMode] = useState('list');
  const [taskDetailId, setTaskDetailId] = useState(null);
  const [editTaskRow, setEditTaskRow] = useState(null);
  const now = new Date();
  const [calYear, setCalYear] = useState(now.getFullYear());
  const [calMonth, setCalMonth] = useState(now.getMonth() + 1);
  const detailRef = useRef(null);
  const detailTriggerRef = useRef(null);

  function reload() {
    setLoading(true);
    setLoadError(false);
    Promise.all([fetchAllDealTasks(), fetchAllDeals(), fetchAllProfiles(), fetchPipelines()])
      .then(([t, d, p, pl]) => { setTasks(t); setDeals(d); setProfiles(p); setPipelines(pl); })
      .catch((e) => { console.warn('deal tasks load failed', e); setLoadError(true); })
      .finally(() => setLoading(false));
  }

  useEffect(() => { reload(); }, []);

  // Deep link from a notification (`/reports/deal-tasks?open=<taskId>`) — tasks
  // only load once `reload()` resolves, so this waits for that; it also re-runs
  // on every `searchParams` change (a second notification only changes the query).
  useEffect(() => {
    const openId = searchParams.get('open');
    if (!openId || loading) return;
    const found = tasks.find((t) => String(t.id) === String(openId));
    if (found) setTaskDetailId(found.id);
    setSearchParams((sp) => { sp.delete('open'); return sp; }, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, searchParams]);

  // The row menu is `position: fixed` (a scrollable table wrapper would clip an
  // absolute one), so it closes on any outside click, scroll or resize.
  useEffect(() => {
    if (rowMenu === null) return undefined;
    const close = () => setRowMenu(null);
    function onDocClick(e) { if (!(e.target instanceof Element) || !e.target.closest('.dtp-menu, .dtp-menu-btn')) close(); }
    document.addEventListener('mousedown', onDocClick);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [rowMenu]);

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

  // One row per task, enriched with everything the table/filters need.
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

  const boardColumns = useMemo(() => {
    const cols = BOARD_COLUMNS.map((c) => ({ ...c, items: filtered.filter((r) => r.task.priority === c.key) }));
    const known = new Set(BOARD_COLUMNS.map((c) => c.key));
    const none = filtered.filter((r) => !known.has(r.task.priority));
    if (none.length) cols.push({ key: 'none', ...NO_PRIORITY, items: none });
    return cols;
  }, [filtered]);

  async function handleSetStatus(row, status) {
    setTasks((t) => t.map((it) => (it.id === row.task.id ? { ...it, status } : it)));
    await setTaskStatus(row.task.id, status);
  }

  // Unlike Скасувати (which just marks the task cancelled), this removes the row.
  async function handleDeleteTask(row) {
    if (!confirm('Видалити цю задачу назавжди? Цю дію не можна скасувати.')) return;
    setTasks((t) => t.filter((it) => it.id !== row.task.id));
    setTaskDetailId((id) => (id === row.task.id ? null : id));
    await deleteTask(row.task.id);
  }

  function openDetail(id, e) {
    detailTriggerRef.current = e?.currentTarget || document.activeElement;
    setTaskDetailId(id);
  }
  function closeDetail() {
    setTaskDetailId(null);
    setTimeout(() => detailTriggerRef.current?.focus?.(), 0);
  }

  // Detail popup: Escape closes it, focus moves in and stays inside while open.
  useEffect(() => {
    if (!taskDetailRow) return undefined;
    const box = detailRef.current;
    box?.querySelector('button')?.focus();
    function onKey(e) {
      if (e.key === 'Escape') { e.stopPropagation(); closeDetail(); return; }
      if (e.key !== 'Tab' || !box) return;
      const f = box.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskDetailRow?.task.id]);

  const num = (v) => (loading || loadError ? '—' : v);
  const hasNoTasks = !loading && !loadError && rows.length === 0;
  const noMatches = !loading && !loadError && rows.length > 0 && filtered.length === 0;
  const delta = (d) => (d !== 0 ? <span className="dtp-delta">{d > 0 ? '▲ +' : '▼ '}{d}</span> : null);

  const summary = [
    { key: 'total', label: 'Всього задач (за 7 днів)', value: num(kpis.total), extra: loading ? null : delta(kpis.totalDelta), icon: FIELD_ICONS.checklist },
    { key: 'today', label: 'Сьогодні', value: num(kpis.today), icon: FIELD_ICONS.day },
    { key: 'overdue', label: 'Прострочені', value: num(kpis.overdue), icon: FIELD_ICONS.deadline, tone: 'overdue' },
    { key: 'done', label: 'Завершено (тиждень)', value: num(kpis.doneWeek), extra: loading ? null : delta(kpis.doneWeekDelta), icon: FIELD_ICONS.check, tone: 'done' },
  ];

  return (
    <div className="dtp-page">
      <section className="dtp-summary" aria-label="Підсумок задач">
        {summary.map((s) => (
          <div className={'dtp-metric' + (s.tone ? ' ' + s.tone : '')} key={s.key}>
            <span className="dtp-metric-ic"><Icon html={s.icon} /></span>
            <div>
              <div className="dtp-metric-label">{s.label}</div>
              <div className="dtp-metric-value">{s.value}{s.extra}</div>
            </div>
          </div>
        ))}
      </section>

      <div className="dtp-scope-row">
        <div className="dtp-scopes" role="group" aria-label="Швидкі вибірки">
          {TABS.map((t) => (
            <button key={t.key} type="button" className="dtp-scope" aria-pressed={tab === t.key} onClick={() => { setTab(t.key); setPage(1); }}>
              {t.label}
              <span className="dtp-scope-count">{loading ? '—' : tabCounts[t.key]}</span>
            </button>
          ))}
        </div>
        <button type="button" className="btn btn-p dtp-create" onClick={() => setCreateModalOpen(true)}>
          <ActionIcon name="create" size={18} /> Створити задачу
        </button>
      </div>

      <section className="dtp-filters" aria-label="Фільтри">
        <div className="dtp-field dtp-field--search">
          <label htmlFor="dtp-search">Пошук</label>
          <div className="dtp-search">
            <ActionIcon name="search" size={18} />
            <input
              id="dtp-search" type="text" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              placeholder="За задачею, угодою чи клієнтом"
            />
          </div>
        </div>
        <div className="dtp-field">
          <label>Статус</label>
          <Select
            value={statusFilter} onChange={(v) => { setStatusFilter(v); setPage(1); }} placeholder="Усі статуси" ariaLabel="Статус"
            options={[{ value: '', label: 'Усі статуси' }, ...Object.entries(STATUS_META).map(([k, m]) => ({ value: k, label: m.label }))]}
          />
        </div>
        <div className="dtp-field">
          <label>Тип</label>
          <Select
            value={typeFilter} onChange={(v) => { setTypeFilter(v); setPage(1); }} placeholder="Усі типи" ariaLabel="Тип"
            options={[{ value: '', label: 'Усі типи' }, ...ACTIVITY_TYPES.map((t) => ({ value: t.value, label: t.label }))]}
          />
        </div>
        <div className="dtp-field">
          <label>Джерело</label>
          <Select
            value={pipelineFilter} onChange={(v) => { setPipelineFilter(v); setPage(1); }} placeholder="Усі джерела" ariaLabel="Джерело"
            options={[{ value: '', label: 'Усі джерела' }, ...pipelines.map((p) => ({ value: String(p.id), label: p.name }))]}
          />
        </div>
        <div className="dtp-field">
          <label>Виконавець</label>
          <Select
            value={assigneeFilter} onChange={(v) => { setAssigneeFilter(v); setPage(1); }} placeholder="Усі виконавці" ariaLabel="Виконавець"
            options={[{ value: '', label: 'Усі виконавці' }, ...profiles.map((p) => ({ value: p.email, label: profileLabel(p) }))]}
          />
        </div>
        <div className="dtp-field"><label>Дата з</label><DatePicker value={dateFrom} onChange={(v) => { setDateFrom(v); setPage(1); }} /></div>
        <div className="dtp-field"><label>Дата по</label><DatePicker value={dateTo} onChange={(v) => { setDateTo(v); setPage(1); }} /></div>
        <div className="dtp-field dtp-field--reset">
          <label aria-hidden="true">&nbsp;</label>
          <button type="button" className="btn dtp-reset" onClick={handleReset}>
            <Icon html={FIELD_ICONS.undo} /> Скинути
          </button>
        </div>
      </section>

      <div className="dtp-views" role="group" aria-label="Подання">
        {VIEWS.map((v) => (
          <button key={v.key} type="button" className="dtp-view" aria-pressed={viewMode === v.key} onClick={() => setViewMode(v.key)}>
            <Icon html={FIELD_ICONS[v.icon]} /> {v.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="dtp-panel dtp-skeleton" role="status" aria-live="polite">
          <span className="dtp-sr">Завантаження задач…</span>
          {[0, 1, 2, 3, 4].map((i) => <div className="dtp-skeleton-row" key={i} />)}
        </div>
      ) : loadError ? (
        <div className="dtp-panel dtp-empty" role="alert">
          <p className="dtp-empty-title">Не вдалося завантажити задачі</p>
          <button type="button" className="btn" onClick={reload}>Спробувати ще раз</button>
        </div>
      ) : hasNoTasks ? (
        <div className="dtp-panel dtp-empty">
          <img className="dtp-empty-ic" src={PAGE_ICONS['page.deal-tasks'].src} alt="" width="64" height="64" />
          <p className="dtp-empty-title">Задач по угодах ще немає</p>
          <button type="button" className="btn btn-p" onClick={() => setCreateModalOpen(true)}>
            <ActionIcon name="create" size={18} /> Створити задачу
          </button>
        </div>
      ) : noMatches ? (
        <div className="dtp-panel dtp-empty">
          <p className="dtp-empty-title">За вибраними фільтрами задач немає</p>
          <button type="button" className="btn" onClick={() => { handleReset(); setTab('all'); }}>
            <Icon html={FIELD_ICONS.undo} /> Скинути фільтри
          </button>
        </div>
      ) : viewMode === 'calendar' ? (
        <div className="dtp-panel dtp-cal">
          <div className="dtp-cal-nav">
            <span className="dtp-cal-month">{MONTH_NAMES[calMonth - 1]} {calYear}</span>
            <div className="dtp-cal-btns">
              <button type="button" className="dtp-icon-btn" onClick={() => shiftCalMonth(-1)} aria-label="Попередній місяць">
                <ActionIcon name="chevron" size={18} className="dtp-flip" />
              </button>
              <button type="button" className="dtp-cal-today" onClick={() => { setCalYear(now.getFullYear()); setCalMonth(now.getMonth() + 1); }}>Сьогодні</button>
              <button type="button" className="dtp-icon-btn" onClick={() => shiftCalMonth(1)} aria-label="Наступний місяць">
                <ActionIcon name="chevron" size={18} />
              </button>
            </div>
          </div>
          <div className="dtp-cal-scroll">
            <div className="dtp-cal-grid">
              {WEEKDAYS.map((w) => <div key={w} className="dtp-cal-dow">{w}</div>)}
              {calCells.map((c, i) => {
                const iso = isoDate(c.year, c.month, c.day);
                const items = tasksByDay[iso] || [];
                const shown = items.slice(0, 3);
                const extra = items.length - shown.length;
                return (
                  <div key={i} className={'dtp-cal-cell' + (c.out ? ' out' : '') + (iso === today ? ' today' : '')}>
                    <div className="dtp-cal-daynum">{c.day}</div>
                    <div className="dtp-cal-items">
                      {shown.map((r) => {
                        const type = TYPE_META[r.task.activity_type] || TYPE_META.task;
                        return (
                          <button key={r.task.id} type="button" className="dtp-cal-chip" onClick={(e) => openDetail(r.task.id, e)} title={r.title}>
                            <span className="dtp-cal-chip-ic"><Icon html={FIELD_ICONS[type.icon]} /></span>
                            <span className="dtp-cal-chip-text">{r.title}</span>
                          </button>
                        );
                      })}
                      {extra > 0 && <div className="dtp-cal-more">+{extra} ще</div>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          {noDateCount > 0 && <div className="dtp-cal-hint">{noDateCount} задач без дати не показані в календарі</div>}
        </div>
      ) : viewMode === 'kanban' ? (
        <div className="dtp-board-scroll">
          <div className="dtp-board" style={{ '--cols': boardColumns.length }}>
            {boardColumns.map((col) => (
              <section className="dtp-col" key={col.key} aria-label={`Пріоритет: ${col.label}`}>
                <header className="dtp-col-head">
                  <span className="dtp-col-ic" style={{ color: col.color, background: col.tint }}><Icon html={col.icon} /></span>
                  <h3>{col.label}</h3>
                  <span className="dtp-col-count">{col.items.length}</span>
                </header>
                <div className="dtp-col-body">
                  {col.items.length === 0 ? (
                    <div className="dtp-col-empty">Немає задач</div>
                  ) : col.items.map((r) => {
                    const type = TYPE_META[r.task.activity_type] || TYPE_META.task;
                    const status = STATUS_META[r.dueStatus];
                    const assignee = r.task.assignee_email ? profilesByEmail[r.task.assignee_email] : null;
                    const assigneeName = assignee ? profileLabel(assignee) : r.task.assignee_email;
                    const priority = PRIORITY_META[r.task.priority] || NO_PRIORITY;
                    return (
                      <article
                        key={r.task.id} className="dtp-card" tabIndex={0}
                        onClick={(e) => openDetail(r.task.id, e)}
                        onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); openDetail(r.task.id, e); } }}
                      >
                        <div className="dtp-card-top">
                          <span className="dtp-type"><Icon html={FIELD_ICONS[type.icon]} /> {type.label}</span>
                          <Badge meta={priority} />
                        </div>
                        <h4 className="dtp-card-title">{r.title}</h4>
                        {r.deal ? (
                          <Link className="dtp-deal-link" to={`/reports/deals?open=${r.deal.id}`} onClick={(e) => e.stopPropagation()}>
                            <Icon html={FIELD_ICONS.link || FIELD_ICONS.externalLink} /> {r.dealLabel}
                          </Link>
                        ) : <span className="dtp-deal-missing">{r.dealLabel}</span>}
                        <div className="dtp-card-foot">
                          {assignee || r.task.assignee_email ? (
                            <span className="dtp-assignee"><ProfileAvatar profile={assignee} email={r.task.assignee_email} name={assigneeName} className="task-avatar dtp-avatar" />{assigneeName}</span>
                          ) : <span className="dtp-muted">Не призначено</span>}
                          <span className={'dtp-date' + (r.dueStatus === 'overdue' ? ' overdue' : '')}>
                            <Icon html={FIELD_ICONS.day} /> {r.dateIso ? fmtDate(r.task.scheduled_at || r.task.task_date) : 'Без дати'}
                          </span>
                          <Badge meta={status} icon={DUE_STATUS_ICONS[r.dueStatus]} />
                        </div>
                      </article>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        </div>
      ) : (
        <>
          <div className="dtp-panel dtp-table-panel">
            <div className="dtp-table-wrap">
              <table className="dtp-table">
                <thead>
                  <tr>
                    <th scope="col">Задача</th>
                    <th scope="col">Угода</th>
                    <th scope="col">Виконавець</th>
                    <th scope="col">Дата</th>
                    <th scope="col">Пріоритет</th>
                    <th scope="col">Статус</th>
                    <th scope="col" className="dtp-sr-th"><span className="dtp-sr">Дії</span></th>
                  </tr>
                </thead>
                <tbody>
                  {paged.map((r) => {
                    const type = TYPE_META[r.task.activity_type] || TYPE_META.task;
                    const priority = PRIORITY_META[r.task.priority] || NO_PRIORITY;
                    const status = STATUS_META[r.dueStatus];
                    const assignee = r.task.assignee_email ? profilesByEmail[r.task.assignee_email] : null;
                    const assigneeName = assignee ? profileLabel(assignee) : r.task.assignee_email;
                    return (
                      <tr
                        key={r.task.id} tabIndex={0}
                        onClick={(e) => openDetail(r.task.id, e)}
                        onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); openDetail(r.task.id, e); } }}
                      >
                        <td data-label="Задача">
                          <div className="dtp-title-cell">
                            <span className="dtp-title-ic"><Icon html={FIELD_ICONS[type.icon]} /></span>
                            <div className="dtp-title-text">
                              <div className="dtp-title">{r.title}</div>
                              <span className="dtp-type-chip">{type.label}</span>
                              {r.subtitle && <div className="dtp-sub">{r.subtitle}</div>}
                            </div>
                          </div>
                        </td>
                        <td data-label="Угода">
                          {r.deal ? (
                            <Link className="dtp-deal-link" to={`/reports/deals?open=${r.deal.id}`} onClick={(e) => e.stopPropagation()}>
                              {r.dealLabel}{r.pipelineName ? ` · ${r.pipelineName}` : ''} <Icon html={FIELD_ICONS.externalLink} />
                            </Link>
                          ) : <span className="dtp-deal-missing">{r.dealLabel}</span>}
                          {r.clientLabel && <div className="dtp-sub">Client: {r.clientLabel}</div>}
                        </td>
                        <td data-label="Виконавець">
                          {assignee || r.task.assignee_email ? (
                            <span className="dtp-assignee"><ProfileAvatar profile={assignee} email={r.task.assignee_email} name={assigneeName} className="task-avatar dtp-avatar" />{assigneeName}</span>
                          ) : <span className="dtp-muted">Не призначено</span>}
                        </td>
                        <td data-label="Дата" className={'dtp-date-cell' + (r.dueStatus === 'overdue' ? ' overdue' : '')}>
                          {r.dateIso ? fmtDate(r.task.scheduled_at || r.task.task_date) : <span className="dtp-muted">Без дати</span>}
                        </td>
                        <td data-label="Пріоритет"><Badge meta={priority} icon={priority.icon} /></td>
                        <td data-label="Статус"><Badge meta={status} icon={DUE_STATUS_ICONS[r.dueStatus]} /></td>
                        <td className="dtp-actions-cell" onClick={(e) => e.stopPropagation()}>
                          <button
                            type="button" className="dtp-menu-btn" aria-label="Дії" aria-haspopup="menu" aria-expanded={rowMenu?.id === r.task.id}
                            onClick={(e) => {
                              if (rowMenu?.id === r.task.id) { setRowMenu(null); return; }
                              const b = e.currentTarget.getBoundingClientRect();
                              setRowMenu({ id: r.task.id, top: b.bottom + 4, right: Math.max(8, window.innerWidth - b.right) });
                            }}
                          >
                            <Icon html={MORE_ICON} />
                          </button>
                          {rowMenu?.id === r.task.id && (
                            <div className="dtp-menu" role="menu" style={{ top: rowMenu.top, right: rowMenu.right }}>
                              {r.deal && <button type="button" role="menuitem" onClick={() => { setRowMenu(null); navigate(`/reports/deals?open=${r.deal.id}`); }}>Відкрити угоду</button>}
                              {r.task.status === 'pending' ? (
                                <>
                                  <button type="button" role="menuitem" onClick={() => { setRowMenu(null); handleSetStatus(r, 'done'); }}>Позначити виконаною</button>
                                  <button type="button" role="menuitem" onClick={() => { setRowMenu(null); handleSetStatus(r, 'cancelled'); }}>Скасувати</button>
                                </>
                              ) : (
                                <button type="button" role="menuitem" onClick={() => { setRowMenu(null); handleSetStatus(r, 'pending'); }}>Повернути в роботу</button>
                              )}
                              <button type="button" role="menuitem" className="danger" onClick={() => { setRowMenu(null); handleDeleteTask(r); }}>Видалити</button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="dtp-pager">
            <div className="dtp-pager-hint">Показано {rangeStart}-{rangeEnd} з {filtered.length} задач</div>
            {pageCount > 1 && (
              <div className="dtp-pages">
                <button type="button" className="dtp-page-btn" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={clampedPage === 1} aria-label="Попередня сторінка">&#8249;</button>
                {Array.from({ length: pageCount }, (_, i) => i + 1).map((n) => (
                  <button key={n} type="button" className={'dtp-page-btn' + (n === clampedPage ? ' on' : '')} aria-current={n === clampedPage ? 'page' : undefined} onClick={() => setPage(n)}>{n}</button>
                ))}
                <button type="button" className="dtp-page-btn" onClick={() => setPage((p) => Math.min(pageCount, p + 1))} disabled={clampedPage === pageCount} aria-label="Наступна сторінка">&#8250;</button>
              </div>
            )}
            <div className="dtp-page-size">
              Показувати по
              <Select value={String(pageSize)} onChange={(v) => { setPageSize(Number(v)); setPage(1); }} options={PAGE_SIZE_OPTIONS} ariaLabel="Кількість на сторінці" />
            </div>
          </div>
        </>
      )}

      {createModalOpen && (
        <CreateDealTaskModal
          hub
          deals={deals}
          profiles={profiles.map((p) => ({ email: p.email, label: profileLabel(p) }))}
          myEmail={myEmail}
          onClose={() => setCreateModalOpen(false)}
          onCreated={(row) => setTasks((t) => [row, ...t])}
        />
      )}

      {taskDetailRow && createPortal(
        <div className="tmodal-overlay dtp-overlay" onClick={(e) => { if (e.target === e.currentTarget) closeDetail(); }}>
          <div className="tmodal-box dtp-detail" role="dialog" aria-modal="true" aria-labelledby="dtp-detail-title" ref={detailRef}>
            <div className="tmodal-head">
              <div className="dtp-detail-head">
                <span className="dtp-title-ic"><Icon html={FIELD_ICONS[(TYPE_META[taskDetailRow.task.activity_type] || TYPE_META.task).icon]} /></span>
                <div>
                  <h3 id="dtp-detail-title">{(TYPE_META[taskDetailRow.task.activity_type] || TYPE_META.task).label}</h3>
                  <p className="dtp-detail-when">
                    <Icon html={FIELD_ICONS.history} />
                    {taskDetailRow.dateIso ? fmtDate(taskDetailRow.task.scheduled_at || taskDetailRow.task.task_date) : 'Без дати'}
                  </p>
                </div>
              </div>
              <button type="button" className="dtp-icon-btn" onClick={closeDetail} aria-label="Закрити"><ActionIcon name="close" size={20} /></button>
            </div>
            <div className="tmodal-body">
              {taskDetailRow.deal && (
                <button
                  type="button" className="dtp-detail-deal"
                  onClick={() => { setTaskDetailId(null); navigate(`/reports/deals?open=${taskDetailRow.deal.id}`); }}
                >
                  <span className="dtp-detail-deal-ic"><Icon html={FIELD_ICONS.briefcase} /></span>
                  <span className="dtp-detail-deal-text">
                    <span className="dtp-deal-link">{taskDetailRow.dealLabel}{taskDetailRow.pipelineName ? ` · ${taskDetailRow.pipelineName}` : ''}</span>
                    {taskDetailRow.clientLabel && <span className="dtp-sub">Client: {taskDetailRow.clientLabel}</span>}
                  </span>
                  <Icon html={FIELD_ICONS.externalLink} />
                </button>
              )}

              <div className="dtp-detail-label">Опис задачі</div>
              <p className="dtp-detail-text">{taskDetailRow.task.text || '—'}</p>

              <div className="dtp-detail-meta">
                {taskDetailRow.task.priority && PRIORITY_META[taskDetailRow.task.priority] && (
                  <span className="dtp-pill">
                    <Icon html={PRIORITY_META[taskDetailRow.task.priority].icon} />
                    Пріоритет: <b style={{ color: PRIORITY_META[taskDetailRow.task.priority].color }}>{PRIORITY_META[taskDetailRow.task.priority].label}</b>
                  </span>
                )}
                {taskDetailRow.task.created_by_email && (
                  <span className="dtp-pill">
                    <Icon html={FIELD_ICONS.user} />
                    Поставив: <b>{profileLabel(profilesByEmail[taskDetailRow.task.created_by_email] || { email: taskDetailRow.task.created_by_email })}</b>
                  </span>
                )}
                {taskDetailRow.task.assignee_email && (
                  <span className="dtp-pill">
                    <Icon html={PEOPLE_ICON} />
                    Призначено: <b>{profileLabel(profilesByEmail[taskDetailRow.task.assignee_email] || { email: taskDetailRow.task.assignee_email })}</b>
                  </span>
                )}
              </div>
            </div>
            <div className="tmodal-foot">
              <button type="button" className="btn btn-danger" style={{ marginRight: 'auto' }} onClick={() => handleDeleteTask(taskDetailRow)}>Видалити</button>
              <button type="button" className="btn" onClick={() => setEditTaskRow(taskDetailRow)}><ActionIcon name="edit" size={18} /> Редагувати</button>
              {taskDetailRow.task.status === 'pending' ? (
                <>
                  <button type="button" className="btn dtp-cancel-task" onClick={() => handleSetStatus(taskDetailRow, 'cancelled')}>Скасувати</button>
                  <button type="button" className="btn btn-p" onClick={() => handleSetStatus(taskDetailRow, 'done')}>Виконано</button>
                </>
              ) : (
                <button type="button" className="btn" onClick={() => handleSetStatus(taskDetailRow, 'pending')}>
                  <Icon html={FIELD_ICONS.undo} /> Повернути в роботу
                </button>
              )}
            </div>
          </div>
        </div>,
        document.body,
      )}

      {editTaskRow && (
        <CreateDealTaskModal
          hub
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
