import { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../../../contexts/AuthContext';
import WeekPicker from '../../../components/Reports/Weekly/WeekPicker';
import AutoResizeTextarea from '../../../components/Reports/AutoResizeTextarea';
import TaskRow from '../../../components/Automation/TaskRow';
import TaskSubtasks from '../../../components/Automation/TaskSubtasks';
import TagInput from '../../../components/Automation/TagInput';
import TaskDetailModal from '../../../components/Automation/TaskDetailModal';
import DonutChart from '../../../components/Automation/DonutChart';
import StatusLegend from '../../../components/Automation/StatusLegend';
import {
  fetchTasksForWeek, fetchCarriedInTasks, fetchBacklogTasks, createTask, createRecurringSeries,
  setTaskStatus, moveTask, deleteTask, deleteTaskSeries, updateTaskFields, cancelTask,
} from '../../../lib/api/tasks';
import { fetchAllProfiles } from '../../../lib/api/profile';
import { computeWeeksForMonth, defaultWeekIndexFor, mondayOf, isoDate, fmtDate, todayIso, addDaysIso } from '../../../lib/dateHelpers';
import { deriveTaskStatus } from '../../../lib/taskStatus';
import { deriveDueStatus, DUE_STATUS_ORDER, DUE_STATUS_LABELS } from '../../../lib/dueStatus';
import { BASE_TAGS } from '../../../lib/tagColors';
import { FIELD_ICONS } from '../../../lib/taskFieldIcons';
import { SECTION_ICONS } from '../../../lib/reportIcons';
import '../../../styles/reportPage.css';
import '../../../styles/automationTasksPage.css';

const DAY_NAMES = ['Понеділок', 'Вівторок', 'Середа', 'Четвер', "П'ятниця", 'Субота', 'Неділя'];
const RECURRENCE_TYPE_OPTIONS = [
  { value: 'daily', label: 'Кожен день' },
  { value: 'weekly', label: 'По днях тижня' },
  { value: 'monthly', label: 'Щомісяця' },
];
const WEEKDAY_OPTIONS = [
  { value: 1, label: 'Пн' }, { value: 2, label: 'Вт' }, { value: 3, label: 'Ср' }, { value: 4, label: 'Чт' },
  { value: 5, label: 'Пт' }, { value: 6, label: 'Сб' }, { value: 7, label: 'Нд' },
];
const PRIORITY_OPTIONS = [
  { value: '', label: 'Без пріоритету' },
  { value: 'high', label: 'Високий' },
  { value: 'medium', label: 'Середній' },
  { value: 'low', label: 'Низький' },
];
let rowKeySeq = 0;
function nextRowKey() { return ++rowKeySeq; }

function profileLabel(p) {
  const full = `${p.first_name || ''} ${p.last_name || ''}`.trim();
  return full || p.email;
}

function initialPeriod() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  return { year, month, weekIndex: defaultWeekIndexFor(computeWeeksForMonth(year, month)) };
}

export default function WeeklyTasks({ department = 'automation' }) {
  const { email: myEmail } = useAuth();
  const [period, setPeriod] = useState(initialPeriod);
  const [weekTasks, setWeekTasks] = useState([]);
  const [carriedIn, setCarriedIn] = useState([]);
  const [backlogTasks, setBacklogTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [profiles, setProfiles] = useState([]);

  const [selected, setSelected] = useState(() => new Set());
  const [dragOverIdx, setDragOverIdx] = useState(null);

  const [assigneeFilter, setAssigneeFilter] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [tagFilter, setTagFilter] = useState('');
  const [dueFilter, setDueFilter] = useState('');
  const [filterOpen, setFilterOpen] = useState(false);
  const filterPopoverRef = useRef(null);
  const activeFilterCount = [assigneeFilter, priorityFilter, tagFilter, dueFilter].filter(Boolean).length;

  useEffect(() => {
    if (!filterOpen) return;
    function onDocClick(e) {
      if (filterPopoverRef.current && !filterPopoverRef.current.contains(e.target)) setFilterOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [filterOpen]);

  const [listModalOpen, setListModalOpen] = useState(false);
  const [listRows, setListRows] = useState([]);
  const [savingList, setSavingList] = useState(false);

  const [bulkMoveOpen, setBulkMoveOpen] = useState(false);
  const [bulkMoveDayIdx, setBulkMoveDayIdx] = useState(0);
  const [bulkMoving, setBulkMoving] = useState(false);

  const [viewTask, setViewTask] = useState(null);

  const [viewMode, setViewMode] = useState('board'); // 'board' | 'list'
  const [inlineAddDayIdx, setInlineAddDayIdx] = useState(null);
  const [inlineText, setInlineText] = useState('');
  const [weekPickerOpen, setWeekPickerOpen] = useState(false);

  const weeks = computeWeeksForMonth(period.year, period.month);
  const pickedWeek = weeks.find((w) => w.index === period.weekIndex) || weeks[0];

  // The real, unclipped Monday-start week — computeWeeksForMonth clips the
  // first/last week of a month, which would otherwise cut days off the grid.
  const days = useMemo(() => {
    const monday = mondayOf(pickedWeek.start);
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      return { date: d, iso: isoDate(d.getFullYear(), d.getMonth() + 1, d.getDate()) };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period.year, period.month, period.weekIndex]);
  const startIso = days[0].iso;
  const endIso = days[6].iso;

  useEffect(() => {
    fetchAllProfiles().then(setProfiles);
    reloadBacklog();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [department]);

  // Backlog ("Без дати") tasks aren't week-scoped, so they're fetched once
  // on mount and refreshed after any mutation that could add/remove one.
  function reloadBacklog() {
    fetchBacklogTasks(department).then(setBacklogTasks).catch((e) => console.warn('load backlog failed', e));
  }

  const profilesByEmail = useMemo(() => {
    const map = {};
    profiles.forEach((p) => { map[p.email] = p; });
    return map;
  }, [profiles]);

  const assigneeOptions = useMemo(() => {
    const known = new Set(profiles.map((p) => p.email));
    const list = profiles.map((p) => ({ value: p.email, label: profileLabel(p) }));
    if (myEmail && !known.has(myEmail)) list.unshift({ value: myEmail, label: myEmail });
    return list;
  }, [profiles, myEmail]);

  function handlePeriodChange(next) {
    const dim = computeWeeksForMonth(next.year, next.month).length;
    setPeriod({ year: next.year, month: next.month, weekIndex: Math.min(next.weekIndex, dim) });
  }

  // Quick ±1 week nudge, alongside the precise Рік/Місяць/Тиждень picker
  // above — navigates by the real unclipped Monday so it works correctly
  // across month boundaries too.
  function goToAdjacentWeek(deltaDays) {
    const targetMonday = addDaysIso(startIso, deltaDays);
    const [ty, tm] = targetMonday.split('-').map(Number);
    const weeksInTargetMonth = computeWeeksForMonth(ty, tm);
    const match = weeksInTargetMonth.find((w) => {
      const wMonday = mondayOf(w.start);
      return isoDate(wMonday.getFullYear(), wMonday.getMonth() + 1, wMonday.getDate()) === targetMonday;
    });
    handlePeriodChange({ year: ty, month: tm, weekIndex: match ? match.index : defaultWeekIndexFor(weeksInTargetMonth) });
  }
  function goToToday() {
    const now = new Date();
    const ty = now.getFullYear(), tm = now.getMonth() + 1;
    handlePeriodChange({ year: ty, month: tm, weekIndex: defaultWeekIndexFor(computeWeeksForMonth(ty, tm)) });
  }

  function reload() {
    setLoading(true);
    Promise.all([fetchTasksForWeek(startIso, endIso, department), fetchCarriedInTasks(startIso, endIso, department)])
      .then(([own, carried]) => { setWeekTasks(own); setCarriedIn(carried); })
      .catch((e) => console.warn('load week tasks failed', e))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setSelected(new Set());
    Promise.all([fetchTasksForWeek(startIso, endIso, department), fetchCarriedInTasks(startIso, endIso, department)])
      .then(([own, carried]) => { if (!cancelled) { setWeekTasks(own); setCarriedIn(carried); } })
      .catch((e) => console.warn('load week tasks failed', e))
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startIso, endIso, department]);

  async function handleToggleDone(task) {
    const next = task.status === 'done' ? 'pending' : 'done';
    const patch = (t) => t.map((it) => (it.id === task.id ? { ...it, status: next } : it));
    setWeekTasks(patch); setCarriedIn(patch); setBacklogTasks(patch);
    setViewTask((v) => (v && v.id === task.id ? { ...v, status: next } : v));
    try {
      await setTaskStatus(task.id, next);
    } catch (e) {
      alert('Помилка: ' + (e.message || e));
      reload();
    }
  }

  async function handleMove(task, newDateIso) {
    // Moving can push a task in or out of this week's date range entirely,
    // so a full reload (rather than an in-place patch) is the only way to
    // keep the native/carried-in groupings correct afterwards. A backlog
    // task (no planned_date yet) also needs planned_date backfilled — it's
    // being scheduled for the first time, not "moved" from somewhere.
    try {
      if (!task.planned_date) {
        await updateTaskFields(task.id, { planned_date: newDateIso, task_date: newDateIso });
      } else {
        await moveTask(task.id, newDateIso);
      }
      setViewTask(null);
      reload();
      reloadBacklog();
    } catch (e) {
      alert('Помилка перенесення: ' + (e.message || e));
      reload();
      reloadBacklog();
    }
  }

  async function handleDelete(task) {
    if (!confirm('Видалити цю задачу?')) return;
    setWeekTasks((t) => t.filter((it) => it.id !== task.id));
    setCarriedIn((t) => t.filter((it) => it.id !== task.id));
    setBacklogTasks((t) => t.filter((it) => it.id !== task.id));
    try {
      await deleteTask(task.id);
    } catch (e) {
      alert('Помилка видалення: ' + (e.message || e));
      reload();
    }
  }

  async function handleSubtasksChange(task, subtasks) {
    const patch = (t) => t.map((it) => (it.id === task.id ? { ...it, subtasks } : it));
    setWeekTasks(patch); setCarriedIn(patch); setBacklogTasks(patch);
    setViewTask((v) => (v && v.id === task.id ? { ...v, subtasks } : v));
    try {
      await updateTaskFields(task.id, { subtasks });
    } catch (e) {
      console.warn('updateTaskFields (subtasks) failed', e);
      reload();
    }
  }

  async function handleDeleteSeries(task) {
    if (!confirm('Видалити всі майбутні задачі цієї серії (ще не виконані)? Минулі залишаться.')) return;
    try {
      await deleteTaskSeries(task.series_id, todayIso());
      reload();
    } catch (e) {
      alert('Помилка видалення серії: ' + (e.message || e));
    }
  }

  async function handleCancel(task, reason) {
    const patch = (t) => t.map((it) => (it.id === task.id ? { ...it, status: 'cancelled', cancel_reason: reason } : it));
    setWeekTasks(patch); setCarriedIn(patch); setBacklogTasks(patch);
    setViewTask((v) => (v && v.id === task.id ? { ...v, status: 'cancelled', cancel_reason: reason } : v));
    try {
      await cancelTask(task.id, reason);
    } catch (e) {
      alert('Помилка скасування: ' + (e.message || e));
      reload();
    }
  }

  async function handleSaveEdits(task, patchFields) {
    const patch = (t) => t.map((it) => (it.id === task.id ? { ...it, ...patchFields } : it));
    setWeekTasks(patch); setCarriedIn(patch); setBacklogTasks(patch);
    setViewTask((v) => (v && v.id === task.id ? { ...v, ...patchFields } : v));
    try {
      await updateTaskFields(task.id, patchFields);
    } catch (e) {
      alert('Помилка збереження: ' + (e.message || e));
      reload();
    }
  }

  const byFilters = (list) => list.filter((t) =>
    (!assigneeFilter || t.assignee_email === assigneeFilter)
    && (!priorityFilter || t.priority === priorityFilter)
    && (!tagFilter || (t.tags || []).includes(tagFilter))
    && (!dueFilter || deriveDueStatus(t) === dueFilter)
  );
  const weekTasksFiltered = byFilters(weekTasks);

  const tagFilterOptions = useMemo(() => {
    const set = new Set(BASE_TAGS);
    weekTasks.forEach((t) => (t.tags || []).forEach((tag) => set.add(tag)));
    carriedIn.forEach((t) => (t.tags || []).forEach((tag) => set.add(tag)));
    return Array.from(set);
  }, [weekTasks, carriedIn]);

  // Sidebar "week overview" stats — based on the same set as the flat
  // "Задачі на цей тиждень" list. "Перенесено" is the existing
  // done/pending/moved/cancelled model (a task pushed past its planned
  // week); "Протерміновано" is the real date-relative overdue count
  // (deriveDueStatus), independent of that.
  const weekStats = useMemo(() => {
    const total = weekTasksFiltered.length;
    const done = weekTasksFiltered.filter((t) => deriveTaskStatus(t) === 'done').length;
    const moved = weekTasksFiltered.filter((t) => deriveTaskStatus(t) === 'moved').length;
    const overdue = weekTasksFiltered.filter((t) => deriveDueStatus(t) === 'overdue').length;
    const pct = total ? Math.round((done / total) * 100) : 0;
    return { total, done, moved, overdue, pct };
  }, [weekTasksFiltered]);

  async function handleInlineAdd(dayIdx) {
    const text = inlineText.trim();
    if (!text) { setInlineAddDayIdx(null); return; }
    const dayIso = days[dayIdx].iso;
    try {
      const row = await createTask({ text, plannedDate: dayIso, taskDate: dayIso, assigneeEmail: myEmail, department, createdByEmail: myEmail });
      setWeekTasks((t) => [...t, row]);
      setInlineText('');
    } catch (e) {
      alert('Помилка додавання: ' + (e.message || e));
    }
  }

  // ----- multi-select (flat "Задачі на цей тиждень" list) -----
  function toggleSelect(id) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  // ----- list-builder modal (numbered rows, each with its own day + its own
  // full field set — assignee/priority/tags/subtasks/recurrence are all
  // per-row now, so a single batch can freely mix one-off and recurring rows) -----
  function makeRow(dayIdx = 0) {
    return {
      key: nextRowKey(), text: '', dayIdx,
      assignee: myEmail || '', priority: '', tags: [],
      subtasksOpen: false, subtasks: [],
      recurring: false, recurrenceType: 'daily', recurrenceWeekdays: [], recurrenceDayOfMonth: null,
    };
  }
  function openListModal() {
    setListRows([makeRow()]);
    setListModalOpen(true);
  }
  function closeListModal() {
    setListModalOpen(false);
    setListRows([]);
  }
  function addRow() {
    setListRows((rows) => [...rows, makeRow()]);
  }
  function updateRow(i, patch) {
    setListRows((rows) => rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }
  function removeRow(i) {
    setListRows((rows) => (rows.length > 1 ? rows.filter((_, idx) => idx !== i) : rows));
  }
  async function saveList() {
    const rows = listRows.filter((r) => r.text.trim());
    if (!rows.length) return;
    setSavingList(true);
    try {
      await Promise.all(rows.map((r) => {
        if (r.dayIdx === 'none') {
          return createTask({
            text: r.text.trim(), plannedDate: null, taskDate: null,
            assigneeEmail: r.assignee, priority: r.priority, tags: r.tags, subtasks: r.subtasks,
            department, createdByEmail: myEmail,
          });
        }
        const dayIso = days[r.dayIdx].iso;
        if (r.recurring) {
          const jsDay = days[r.dayIdx].date.getDay();
          const isoWd = jsDay === 0 ? 7 : jsDay;
          const rule = r.recurrenceType === 'weekly'
            ? { type: 'weekly', weekdays: r.recurrenceWeekdays.length ? r.recurrenceWeekdays : [isoWd] }
            : r.recurrenceType === 'monthly'
              ? { type: 'monthly', dayOfMonth: r.recurrenceDayOfMonth || undefined }
              : { type: 'daily' };
          return createRecurringSeries({
            text: r.text.trim(), startDate: dayIso, rule,
            assigneeEmail: r.assignee, priority: r.priority, tags: r.tags, subtasks: r.subtasks,
            department, createdByEmail: myEmail,
          });
        }
        return createTask({
          text: r.text.trim(), plannedDate: dayIso, taskDate: dayIso,
          assigneeEmail: r.assignee, priority: r.priority, tags: r.tags, subtasks: r.subtasks,
          department, createdByEmail: myEmail,
        });
      }));
      closeListModal();
      reload();
      reloadBacklog();
    } catch (e) {
      alert('Помилка збереження списку: ' + (e.message || e));
    } finally {
      setSavingList(false);
    }
  }

  // ----- bulk move / delete -----
  function openBulkMove() {
    if (!selected.size) return;
    setBulkMoveDayIdx(0);
    setBulkMoveOpen(true);
  }
  async function confirmBulkMove() {
    const ids = [...selected];
    if (!ids.length) return;
    const targetIso = days[bulkMoveDayIdx].iso;
    setBulkMoving(true);
    try {
      await Promise.all(ids.map((id) => moveTask(id, targetIso)));
      setBulkMoveOpen(false);
      setSelected(new Set());
      reload();
    } catch (e) {
      alert('Помилка перенесення: ' + (e.message || e));
    } finally {
      setBulkMoving(false);
    }
  }
  async function confirmBulkDelete() {
    const ids = [...selected];
    if (!ids.length) return;
    if (!confirm(`Видалити ${ids.length} задач(і)?`)) return;
    try {
      await Promise.all(ids.map((id) => deleteTask(id)));
      setSelected(new Set());
      reload();
    } catch (e) {
      alert('Помилка видалення: ' + (e.message || e));
      reload();
    }
  }

  // ----- drag & drop between day columns -----
  function handleDropOnDay(e, dayIso, dayIdx) {
    e.preventDefault();
    setDragOverIdx(null);
    const idStr = e.dataTransfer.getData('text/plain');
    if (!idStr) return;
    handleMove({ id: Number(idStr) }, dayIso);
    void dayIdx;
  }

  return (
    <div className="report-page weekly-tasks-page">
      <section className="rpt-hero">
        <div className="rpt-hero-heading">
          <span className="rpt-hero-icon" dangerouslySetInnerHTML={{ __html: SECTION_ICONS['Задачі'] }} />
          <h1>Weekly Tasks</h1>
        </div>
      </section>

      <div className="wk-layout">
        <aside className="wk-sidebar">
          <div className="wk-side-panel">
            <div className="wk-side-nav">
              <button type="button" className="wk-side-arrow" onClick={() => goToAdjacentWeek(-7)} aria-label="Попередній тиждень">&#8249;</button>
              <div className="wk-side-nav-mid">
                <div className="wk-side-label">Огляд тижня</div>
                <div className="wk-side-range">
                  {fmtDate(days[0].date.getFullYear(), days[0].date.getMonth() + 1, days[0].date.getDate())} – {fmtDate(days[6].date.getFullYear(), days[6].date.getMonth() + 1, days[6].date.getDate())}
                </div>
              </div>
              <button type="button" className="wk-side-arrow" onClick={() => goToAdjacentWeek(7)} aria-label="Наступний тиждень">&#8250;</button>
            </div>
            <button type="button" className="wk-side-today" onClick={goToToday}>Сьогодні</button>
            <button type="button" className="wk-side-pick" onClick={() => setWeekPickerOpen(true)}>Обрати тиждень</button>
          </div>

          <div className="wk-side-panel wk-progress-panel">
            <div className="wk-side-label">Прогрес тижня</div>
            {weekStats.total > 0 ? (
              <>
                <div className="wk-progress-chart">
                  <DonutChart
                    slices={[
                      { label: 'Виконано', value: weekStats.done, color: '#1E9E5D' },
                      { label: 'Залишилось', value: Math.max(weekStats.total - weekStats.done, 0), color: '#E1D9EA' },
                    ]}
                    centerValue={`${weekStats.pct}%`}
                    centerLabel={`${weekStats.done} з ${weekStats.total} задач`}
                  />
                </div>
              </>
            ) : (
              <p className="sec-empty">На цей тиждень задач ще немає.</p>
            )}
          </div>

          <div className="wk-side-panel">
            <div className="wk-side-label">Швидка статистика</div>
            <div className="wk-side-stat"><span>Всього задач</span><b>{weekStats.total}</b></div>
            <div className="wk-side-stat"><span>Виконано</span><b>{weekStats.done}</b></div>
            <div className="wk-side-stat"><span>Перенесено</span><b>{weekStats.moved}</b></div>
            <div className="wk-side-stat"><span>Протерміновано</span><b>{weekStats.overdue}</b></div>
          </div>

          <div className="wk-side-panel">
            <div className="wk-side-label">Без дати{backlogTasks.length ? ` (${backlogTasks.length})` : ''}</div>
            {backlogTasks.length === 0 ? (
              <p className="sec-empty">Немає задач без дати.</p>
            ) : (
              <div className="task-list wk-backlog-list">
                {backlogTasks.map((task) => (
                  <TaskRow
                    key={task.id}
                    task={task}
                    profile={profilesByEmail[task.assignee_email]}
                    truncateText
                    onView={setViewTask}
                    onToggleDone={handleToggleDone}
                    onMove={handleMove}
                    onDelete={handleDelete}
                    onDeleteSeries={handleDeleteSeries}
                    onSubtasksChange={handleSubtasksChange}
                  />
                ))}
              </div>
            )}
          </div>
        </aside>

        <div className="wk-main">
          <div className="wk-main-toolbar">
            <div className="wk-view-toggle">
              <button type="button" className={viewMode === 'board' ? 'on' : ''} onClick={() => setViewMode('board')} title="Календар">&#9638;</button>
              <button type="button" className={viewMode === 'list' ? 'on' : ''} onClick={() => setViewMode('list')} title="Список">&#9776;</button>
            </div>
            <span className="sp" />
            <div className="task-filter-wrap" ref={filterPopoverRef}>
              <button
                type="button"
                className={'btn task-filter-btn' + (activeFilterCount ? ' has-active' : '')}
                onClick={() => setFilterOpen((o) => !o)}
              >
                <svg viewBox="0 0 24 24"><path d="M4 4h16l-6.5 8v6l-3 1.5v-7.5z" /></svg>
                Фільтр{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
              </button>
              {filterOpen && (
                <div className="task-filter-popover">
                  <div className="task-filter-row">
                    <label>Виконавець</label>
                    <select value={assigneeFilter} onChange={(e) => setAssigneeFilter(e.target.value)}>
                      <option value="">Усі</option>
                      {assigneeOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </div>
                  <div className="task-filter-row">
                    <label>Пріоритет</label>
                    <select value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value)}>
                      <option value="">Усі</option>
                      {PRIORITY_OPTIONS.filter((o) => o.value).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </div>
                  <div className="task-filter-row">
                    <label>Тег</label>
                    <select value={tagFilter} onChange={(e) => setTagFilter(e.target.value)}>
                      <option value="">Усі</option>
                      {tagFilterOptions.map((tag) => <option key={tag} value={tag}>{tag}</option>)}
                    </select>
                  </div>
                  <div className="task-filter-row">
                    <label>Терміновість</label>
                    <select value={dueFilter} onChange={(e) => setDueFilter(e.target.value)}>
                      <option value="">Усі</option>
                      {DUE_STATUS_ORDER.map((key) => <option key={key} value={key}>{DUE_STATUS_LABELS[key]}</option>)}
                    </select>
                  </div>
                </div>
              )}
            </div>
            <button type="button" className="btn btn-p" onClick={openListModal}>+ Додати задачу</button>
          </div>

          {viewMode === 'list' && (
            <section className="report-section">
              <div className="stitle">Задачі на цей тиждень</div>
              <div className="wk-toolbar">
                <span className="sp" />
                <button type="button" className="btn btn-move" disabled={!selected.size} onClick={openBulkMove}>
                  Перенести{selected.size ? ` (${selected.size})` : ''}
                </button>
                <button type="button" className="btn btn-danger" disabled={!selected.size} onClick={confirmBulkDelete}>
                  Видалити{selected.size ? ` (${selected.size})` : ''}
                </button>
              </div>
              {loading ? (
                <div className="empty-hint">Завантаження...</div>
              ) : (
                <div className="task-list">
                  {weekTasksFiltered.length === 0 && <div className="empty-hint">На цей тиждень ще немає задач.</div>}
                  {weekTasksFiltered.map((task) => (
                    <div className="wk-list-row" key={task.id}>
                      <input
                        type="checkbox"
                        className="wk-select"
                        checked={selected.has(task.id)}
                        onChange={() => toggleSelect(task.id)}
                        aria-label="Обрати задачу"
                      />
                      <TaskRow
                        task={task}
                        profile={profilesByEmail[task.assignee_email]}
                        onToggleDone={handleToggleDone}
                        onMove={handleMove}
                        onDelete={handleDelete}
                        onDeleteSeries={handleDeleteSeries}
                        onSubtasksChange={handleSubtasksChange}
                      />
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}

          {viewMode === 'board' && (
            <section className="report-section">
              <div className="wk-cal-heading">
                <span className="wk-cal-icon" dangerouslySetInnerHTML={{ __html: SECTION_ICONS['Місяці'] }} />
                <div className="wk-cal-text">
                  <div className="stitle">Календар тижня</div>
                  <div className="week-cal-sub">
                    Тиждень {fmtDate(days[0].date.getFullYear(), days[0].date.getMonth() + 1, days[0].date.getDate())}–{fmtDate(days[6].date.getFullYear(), days[6].date.getMonth() + 1, days[6].date.getDate())}
                  </div>
                </div>
              </div>
              {loading ? (
                <div className="empty-hint">Завантаження...</div>
              ) : (
                <div className="week-grid">
                  {days.map((d, i) => {
                    // Grouped by task_date (current placement), not planned_date —
                    // a task moved to another day within this week must visually
                    // move to that day's column, not stay under its original day.
                    const native = byFilters(weekTasks.filter((t) => t.task_date === d.iso));
                    const carried = byFilters(carriedIn.filter((t) => t.task_date === d.iso));
                    const total = native.length + carried.length;
                    const isToday = d.iso === todayIso();
                    return (
                      <div
                        className={'week-day-col' + (dragOverIdx === i ? ' drag-over' : '') + (isToday ? ' today' : '')}
                        key={d.iso}
                        onDragOver={(e) => { e.preventDefault(); setDragOverIdx(i); }}
                        onDragLeave={() => setDragOverIdx((cur) => (cur === i ? null : cur))}
                        onDrop={(e) => handleDropOnDay(e, d.iso, i)}
                      >
                        <div className="week-day-head">
                          <div>
                            {DAY_NAMES[i]} <span className="hint">{fmtDate(d.date.getFullYear(), d.date.getMonth() + 1, d.date.getDate())}</span>
                          </div>
                          {total > 0 && <span className="week-day-count">{total}</span>}
                        </div>
                        <div className="task-list">
                          {total === 0 && inlineAddDayIdx !== i && <div className="empty-hint">Немає задач</div>}
                          {native.map((task) => (
                            <TaskRow
                              key={task.id}
                              task={task}
                              profile={profilesByEmail[task.assignee_email]}
                              truncateText
                              hideDelete
                              onView={setViewTask}
                              onToggleDone={handleToggleDone}
                              onMove={handleMove}
                              onDelete={handleDelete}
                              onDeleteSeries={handleDeleteSeries}
                              onSubtasksChange={handleSubtasksChange}
                            />
                          ))}
                          {carried.map((task) => (
                            <TaskRow
                              key={task.id}
                              task={task}
                              profile={profilesByEmail[task.assignee_email]}
                              carriedIn
                              truncateText
                              hideDelete
                              onView={setViewTask}
                              onToggleDone={handleToggleDone}
                              onMove={handleMove}
                              onDelete={handleDelete}
                              onDeleteSeries={handleDeleteSeries}
                              onSubtasksChange={handleSubtasksChange}
                            />
                          ))}
                        </div>
                        {inlineAddDayIdx === i ? (
                          <div className="wk-inline-add">
                            <input
                              type="text"
                              autoFocus
                              value={inlineText}
                              onChange={(e) => setInlineText(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') { e.preventDefault(); handleInlineAdd(i); }
                                if (e.key === 'Escape') { setInlineAddDayIdx(null); setInlineText(''); }
                              }}
                              onBlur={() => { if (!inlineText.trim()) setInlineAddDayIdx(null); }}
                              placeholder="Нова задача..."
                            />
                          </div>
                        ) : (
                          <button
                            type="button"
                            className="wk-add-task-btn"
                            onClick={() => { setInlineAddDayIdx(i); setInlineText(''); }}
                          >
                            + Додати задачу
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          )}
        </div>
      </div>

      <StatusLegend />

      {weekPickerOpen && (
        <div className="tmodal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setWeekPickerOpen(false); }}>
          <div className="tmodal-box">
            <div className="tmodal-head">
              <h3>Обрати тиждень</h3>
              <button type="button" className="tmodal-close" onClick={() => setWeekPickerOpen(false)} aria-label="Закрити">&times;</button>
            </div>
            <div className="tmodal-body">
              <WeekPicker year={period.year} month={period.month} weekIndex={period.weekIndex} onChange={handlePeriodChange} />
            </div>
            <div className="tmodal-foot">
              <button type="button" className="btn btn-p" onClick={() => setWeekPickerOpen(false)}>Готово</button>
            </div>
          </div>
        </div>
      )}

      {listModalOpen && (
        <div className="tmodal-overlay" onClick={(e) => { if (e.target === e.currentTarget) closeListModal(); }}>
          <div className="tmodal-box wk-list-modal">
            <div className="tmodal-head">
              <h3>Список задач на тиждень</h3>
              <button type="button" className="tmodal-close" onClick={closeListModal} aria-label="Закрити">&times;</button>
            </div>
            <div className="tmodal-body">
              <div className="items">
                {listRows.map((row, i) => (
                  <div className="wk-row-outer wk-row-rich" key={row.key}>
                    <div className="item-box numbered">
                      <div className="item-num">{i + 1}</div>
                      <div className="item-box-body">
                        <AutoResizeTextarea
                          className="wk-row-text"
                          value={row.text}
                          onChange={(v) => updateRow(i, { text: v })}
                          placeholder="Текст задачі..."
                        />
                      </div>
                      <button
                        type="button"
                        className={'wk-row-subtask-btn' + (row.subtasksOpen ? ' on' : '')}
                        onClick={() => updateRow(i, { subtasksOpen: !row.subtasksOpen })}
                        title="Підзадачі"
                      >
                        Підзадачі{row.subtasks.length > 0 ? ` (${row.subtasks.length})` : ''}
                      </button>
                      <button type="button" className="del-btn" onClick={() => removeRow(i)} aria-label="Видалити рядок">&times;</button>
                    </div>

                    {row.subtasksOpen && (
                      <div className="wk-row-subtasks">
                        <TaskSubtasks subtasks={row.subtasks} onChange={(next) => updateRow(i, { subtasks: next })} forceOpen />
                      </div>
                    )}

                    {row.text.trim() && (
                      <div className="wk-row-fields">
                        <div className="wk-field-box">
                          <span className="wk-field-icon" dangerouslySetInnerHTML={{ __html: FIELD_ICONS.day }} />
                          <div className="wk-field-body">
                            <label>День тижня</label>
                            <select
                              value={row.dayIdx}
                              title={row.dayIdx === 'none' ? 'Без дати' : `${DAY_NAMES[row.dayIdx]} — ${fmtDate(days[row.dayIdx].date.getFullYear(), days[row.dayIdx].date.getMonth() + 1, days[row.dayIdx].date.getDate())}`}
                              onChange={(e) => {
                                const v = e.target.value === 'none' ? 'none' : +e.target.value;
                                updateRow(i, { dayIdx: v, recurring: v === 'none' ? false : row.recurring });
                              }}
                            >
                              <option value="none">Без дати</option>
                              {days.map((d, di) => (
                                <option key={d.iso} value={di}>
                                  {DAY_NAMES[di].slice(0, 3)} — {fmtDate(d.date.getFullYear(), d.date.getMonth() + 1, d.date.getDate())}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>
                        <div className="wk-field-box">
                          <span className="wk-field-icon" dangerouslySetInnerHTML={{ __html: FIELD_ICONS.assignee }} />
                          <div className="wk-field-body">
                            <label>Відповідальний</label>
                            <select
                              value={row.assignee}
                              title={assigneeOptions.find((o) => o.value === row.assignee)?.label || 'Не призначено'}
                              onChange={(e) => updateRow(i, { assignee: e.target.value })}
                            >
                              <option value="">Не призначено</option>
                              {assigneeOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                            </select>
                          </div>
                        </div>
                        <div className="wk-field-box">
                          <span className="wk-field-icon" dangerouslySetInnerHTML={{ __html: FIELD_ICONS.priority }} />
                          <div className="wk-field-body">
                            <label>Пріоритет</label>
                            <select value={row.priority} onChange={(e) => updateRow(i, { priority: e.target.value })}>
                              {PRIORITY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                            </select>
                          </div>
                        </div>
                        <div className={'wk-field-box wk-field-box-recur' + (row.recurring ? ' open' : '')}>
                          <span className="wk-field-icon" dangerouslySetInnerHTML={{ __html: FIELD_ICONS.repeat }} />
                          <div className="wk-field-body">
                            <label>Повторення</label>
                            <label className="task-recur-toggle">
                              <input
                                type="checkbox"
                                checked={row.recurring}
                                disabled={row.dayIdx === 'none'}
                                onChange={(e) => updateRow(i, { recurring: e.target.checked })}
                              />
                              Повторювати{row.dayIdx === 'none' ? ' (недоступно без дати)' : ''}
                            </label>
                            {row.recurring && (
                              <div className="wk-row-recurrence">
                                <select value={row.recurrenceType} onChange={(e) => updateRow(i, { recurrenceType: e.target.value })}>
                                  {RECURRENCE_TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                                </select>
                                {row.recurrenceType === 'weekly' && (
                                  <div className="wk-weekday-picker">
                                    {WEEKDAY_OPTIONS.map((w) => (
                                      <button
                                        key={w.value}
                                        type="button"
                                        className={row.recurrenceWeekdays.includes(w.value) ? 'on' : ''}
                                        onClick={() => updateRow(i, {
                                          recurrenceWeekdays: row.recurrenceWeekdays.includes(w.value)
                                            ? row.recurrenceWeekdays.filter((x) => x !== w.value)
                                            : [...row.recurrenceWeekdays, w.value],
                                        })}
                                      >
                                        {w.label}
                                      </button>
                                    ))}
                                  </div>
                                )}
                                {row.recurrenceType === 'monthly' && (
                                  <input
                                    type="number"
                                    min="1"
                                    max="31"
                                    className="wk-day-of-month"
                                    placeholder="Число місяця"
                                    value={row.recurrenceDayOfMonth || ''}
                                    onChange={(e) => updateRow(i, { recurrenceDayOfMonth: e.target.value ? +e.target.value : null })}
                                  />
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="wk-field-box wk-field-box-tag">
                          <span className="wk-field-icon" dangerouslySetInnerHTML={{ __html: FIELD_ICONS.tag }} />
                          <div className="wk-field-body">
                            <label>Тег</label>
                            <TagInput tags={row.tags} onChange={(tags) => updateRow(i, { tags })} />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
              <button type="button" className="add-btn" onClick={addRow}>+ Додати рядок</button>
            </div>
            <div className="tmodal-foot">
              <button type="button" className="btn" onClick={closeListModal}>Скасувати</button>
              <button type="button" className="btn btn-p" onClick={saveList} disabled={savingList || !listRows.some((r) => r.text.trim())}>
                {savingList ? '...' : 'Зберегти список'}
              </button>
            </div>
          </div>
        </div>
      )}

      {bulkMoveOpen && (
        <div className="tmodal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setBulkMoveOpen(false); }}>
          <div className="tmodal-box">
            <div className="tmodal-head">
              <h3>Перенести {selected.size} задач(і)</h3>
              <button type="button" className="tmodal-close" onClick={() => setBulkMoveOpen(false)} aria-label="Закрити">&times;</button>
            </div>
            <div className="tmodal-body">
              <label>Новий день</label>
              <div className="day-select">
                {days.map((d, i) => (
                  <button
                    key={d.iso}
                    type="button"
                    className={i === bulkMoveDayIdx ? 'on' : ''}
                    onClick={() => setBulkMoveDayIdx(i)}
                  >
                    {DAY_NAMES[i].slice(0, 3)} <span className="hint">{fmtDate(d.date.getFullYear(), d.date.getMonth() + 1, d.date.getDate())}</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="tmodal-foot">
              <button type="button" className="btn" onClick={() => setBulkMoveOpen(false)}>Скасувати</button>
              <button type="button" className="btn btn-p" onClick={confirmBulkMove} disabled={bulkMoving}>
                {bulkMoving ? '...' : 'Підтвердити перенесення'}
              </button>
            </div>
          </div>
        </div>
      )}

      {viewTask && (
        <TaskDetailModal
          task={viewTask}
          profile={profilesByEmail[viewTask.assignee_email]}
          assigneeOptions={assigneeOptions}
          onClose={() => setViewTask(null)}
          onToggleDone={handleToggleDone}
          onMove={handleMove}
          onCancel={handleCancel}
          onDelete={handleDelete}
          onDeleteSeries={handleDeleteSeries}
          onSubtasksChange={handleSubtasksChange}
          onSaveEdits={handleSaveEdits}
        />
      )}
    </div>
  );
}
