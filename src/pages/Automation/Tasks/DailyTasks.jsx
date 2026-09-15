import { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../../../contexts/AuthContext';
import DailyTaskRow from '../../../components/Automation/DailyTaskRow';
import AutoResizeTextarea from '../../../components/Reports/AutoResizeTextarea';
import TaskSubtasks from '../../../components/Automation/TaskSubtasks';
import TaskDetailModal from '../../../components/Automation/TaskDetailModal';
import {
  fetchTasksForDay, fetchMovedOutTasks, fetchTaskCountForDay, createTask, createRecurringSeries,
  setTaskStatus, moveTask, cancelTask, deleteTask, deleteTaskSeries, updateTaskFields,
} from '../../../lib/api/tasks';
import { fetchAllProfiles } from '../../../lib/api/profile';
import { MONTH_NAMES, daysInMonth, defaultDayFor, fmtDate, isoDate, addDaysIso, yearOptions } from '../../../lib/dateHelpers';
import { BASE_TAGS } from '../../../lib/tagColors';
import { FIELD_ICONS } from '../../../lib/taskFieldIcons';
import { deriveDueStatus, DUE_STATUS_ORDER, DUE_STATUS_LABELS } from '../../../lib/dueStatus';
import { DUE_STATUS_ICONS } from '../../../lib/dueStatusIcons';
import { SECTION_ICONS } from '../../../lib/reportIcons';
import TagInput from '../../../components/Automation/TagInput';
import StatusLegend from '../../../components/Automation/StatusLegend';
import '../../../styles/reportPage.css';
import '../../../styles/automationTasksPage.css';

// Simple "trending" glyph for the "Перенесено" stat card — no existing icon
// set has this shape (dueStatusIcons covers done/overdue/etc, not "moved").
const MOVED_STAT_ICON = '<svg viewBox="0 0 24 24"><path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/></svg>';

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

function fmtIso(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return fmtDate(y, m, d);
}

function profileLabel(p) {
  const full = `${p.first_name || ''} ${p.last_name || ''}`.trim();
  return full || p.email;
}

function initialPeriod() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  return { year, month, day: defaultDayFor(year, month) };
}

export default function DailyTasks({ department = 'automation' }) {
  const { email: myEmail } = useAuth();
  const [period, setPeriod] = useState(initialPeriod);
  const [tasks, setTasks] = useState([]);
  const [movedOut, setMovedOut] = useState([]);
  const [yesterdayCount, setYesterdayCount] = useState(null);
  const [loading, setLoading] = useState(true);
  const [profiles, setProfiles] = useState([]);

  const [newText, setNewText] = useState('');
  const [newAssignee, setNewAssignee] = useState('');
  const [newPriority, setNewPriority] = useState('');
  const [newTags, setNewTags] = useState([]);
  const [newSubtasks, setNewSubtasks] = useState([]);
  const [subtasksOpen, setSubtasksOpen] = useState(false);
  const [newRecurring, setNewRecurring] = useState(false);
  const [newRecurrenceType, setNewRecurrenceType] = useState('daily');
  const [newRecurrenceWeekdays, setNewRecurrenceWeekdays] = useState([]);
  const [newRecurrenceDayOfMonth, setNewRecurrenceDayOfMonth] = useState(null);
  const [adding, setAdding] = useState(false);

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

  const [viewTask, setViewTask] = useState(null);
  const [viewInitialMode, setViewInitialMode] = useState('view');

  const dateIso = isoDate(period.year, period.month, period.day);

  useEffect(() => {
    fetchAllProfiles().then(setProfiles);
    setNewAssignee(myEmail || '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myEmail]);

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
    const dim = daysInMonth(next.year, next.month);
    setPeriod({ year: next.year, month: next.month, day: Math.min(next.day, dim) });
  }

  function reload() {
    setLoading(true);
    Promise.all([fetchTasksForDay(dateIso, department), fetchMovedOutTasks(dateIso, department)])
      .then(([own, moved]) => { setTasks(own); setMovedOut(moved); })
      .catch((e) => console.warn('load day tasks failed', e))
      .finally(() => setLoading(false));
    fetchTaskCountForDay(addDaysIso(dateIso, -1), department).then(setYesterdayCount);
  }

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([fetchTasksForDay(dateIso, department), fetchMovedOutTasks(dateIso, department)])
      .then(([own, moved]) => { if (!cancelled) { setTasks(own); setMovedOut(moved); } })
      .catch((e) => console.warn('load day tasks failed', e))
      .finally(() => { if (!cancelled) setLoading(false); });
    fetchTaskCountForDay(addDaysIso(dateIso, -1), department).then((n) => { if (!cancelled) setYesterdayCount(n); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateIso, department]);

  const byFilters = (list) => list.filter((t) =>
    (!assigneeFilter || t.assignee_email === assigneeFilter)
    && (!priorityFilter || t.priority === priorityFilter)
    && (!tagFilter || (t.tags || []).includes(tagFilter))
    && (!dueFilter || deriveDueStatus(t) === dueFilter)
  );

  const activeTasks = byFilters(tasks.filter((t) => t.status !== 'cancelled'));
  const doneTasks = byFilters(tasks.filter((t) => t.status === 'done'));
  const cancelledTasks = byFilters(tasks.filter((t) => t.status === 'cancelled'));
  const movedOutFiltered = byFilters(movedOut);

  // Stats bar — the whole day's real totals, not narrowed by the filters
  // above (those only affect the task list itself).
  const dayStats = useMemo(() => {
    const total = tasks.length;
    const done = tasks.filter((t) => t.status === 'done').length;
    const cancelled = tasks.filter((t) => t.status === 'cancelled').length;
    const moved = movedOut.length;
    const pct = (n) => (total ? Math.round((n / total) * 100) : 0);
    const delta = yesterdayCount == null ? null : total - yesterdayCount;
    return { total, done, cancelled, moved, donePct: pct(done), cancelledPct: pct(cancelled), movedPct: pct(moved), delta };
  }, [tasks, movedOut, yesterdayCount]);

  const tagFilterOptions = useMemo(() => {
    const set = new Set(BASE_TAGS);
    tasks.forEach((t) => (t.tags || []).forEach((tag) => set.add(tag)));
    return Array.from(set);
  }, [tasks]);

  async function handleAdd() {
    const text = newText.trim();
    if (!text) return;
    setAdding(true);
    try {
      if (newRecurring) {
        const jsDay = new Date(period.year, period.month - 1, period.day).getDay();
        const isoWd = jsDay === 0 ? 7 : jsDay;
        const rule = newRecurrenceType === 'weekly'
          ? { type: 'weekly', weekdays: newRecurrenceWeekdays.length ? newRecurrenceWeekdays : [isoWd] }
          : newRecurrenceType === 'monthly'
            ? { type: 'monthly', dayOfMonth: newRecurrenceDayOfMonth || undefined }
            : { type: 'daily' };
        const row = await createRecurringSeries({
          text, startDate: dateIso, rule, assigneeEmail: newAssignee, priority: newPriority, tags: newTags, subtasks: newSubtasks,
          department, createdByEmail: myEmail,
        });
        setTasks((t) => [...t, row]);
      } else {
        const row = await createTask({
          text, plannedDate: dateIso, taskDate: dateIso, assigneeEmail: newAssignee, priority: newPriority, tags: newTags, subtasks: newSubtasks,
          department, createdByEmail: myEmail,
        });
        setTasks((t) => [...t, row]);
      }
      setNewText('');
      setNewTags([]);
      setNewSubtasks([]);
      setSubtasksOpen(false);
      setNewRecurring(false);
      setNewRecurrenceWeekdays([]);
      setNewRecurrenceDayOfMonth(null);
    } catch (e) {
      alert('Помилка додавання: ' + (e.message || e));
    } finally {
      setAdding(false);
    }
  }

  async function handleToggleDone(task) {
    const next = task.status === 'done' ? 'pending' : 'done';
    setTasks((t) => t.map((it) => (it.id === task.id ? { ...it, status: next } : it)));
    setViewTask((v) => (v && v.id === task.id ? { ...v, status: next } : v));
    try {
      await setTaskStatus(task.id, next);
    } catch (e) {
      alert('Помилка: ' + (e.message || e));
      reload();
    }
  }

  async function handleSubtasksChange(task, subtasks) {
    setTasks((t) => t.map((it) => (it.id === task.id ? { ...it, subtasks } : it)));
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
      await deleteTaskSeries(task.series_id, dateIso);
      reload();
    } catch (e) {
      alert('Помилка видалення серії: ' + (e.message || e));
    }
  }

  // TaskDetailModal openers — `initialMode` lets the row's own inline
  // "Перенести"/"Скасувати" buttons jump straight into that mode instead of
  // landing on the view screen first.
  function openView(task) { setViewTask(task); setViewInitialMode('view'); }
  function openEdit(task) { setViewTask(task); setViewInitialMode('edit'); }
  function openMove(task) { setViewTask(task); setViewInitialMode('move'); }
  function openCancel(task) { setViewTask(task); setViewInitialMode('cancel'); }

  async function handleMove(task, newDateIso, reason) {
    try {
      await moveTask(task.id, newDateIso, reason);
      setViewTask(null);
      reload();
    } catch (e) {
      alert('Помилка перенесення: ' + (e.message || e));
      reload();
    }
  }

  async function handleCancel(task, reason) {
    setTasks((t) => t.map((it) => (it.id === task.id ? { ...it, status: 'cancelled', cancel_reason: reason } : it)));
    try {
      await cancelTask(task.id, reason);
      reload();
    } catch (e) {
      alert('Помилка скасування: ' + (e.message || e));
      reload();
    }
  }

  async function handleSaveEdits(task, patchFields) {
    setTasks((t) => t.map((it) => (it.id === task.id ? { ...it, ...patchFields } : it)));
    setViewTask((v) => (v && v.id === task.id ? { ...v, ...patchFields } : v));
    try {
      await updateTaskFields(task.id, patchFields);
    } catch (e) {
      alert('Помилка збереження: ' + (e.message || e));
      reload();
    }
  }

  async function handleDelete(task) {
    if (!confirm('Видалити цю задачу?')) return;
    setTasks((t) => t.filter((it) => it.id !== task.id));
    setMovedOut((t) => t.filter((it) => it.id !== task.id));
    try {
      await deleteTask(task.id);
    } catch (e) {
      alert('Помилка видалення: ' + (e.message || e));
      reload();
    }
  }

  return (
    <div className="report-page daily-tasks-page">
      <section className="rpt-hero">
        <div className="rpt-hero-heading">
          <span className="rpt-hero-icon" dangerouslySetInnerHTML={{ __html: SECTION_ICONS['Задачі'] }} />
          <h1>Daily Tasks</h1>
        </div>

        <div className="month-period-picker">
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
          <div className="wk-field-box month-period-day">
            <span className="wk-field-icon" dangerouslySetInnerHTML={{ __html: FIELD_ICONS.day }} />
            <div className="wk-field-body">
              <label>День</label>
              <select value={period.day} onChange={(e) => handlePeriodChange({ ...period, day: +e.target.value })}>
                {Array.from({ length: daysInMonth(period.year, period.month) }, (_, i) => i + 1).map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
          </div>
        </div>
      </section>

      <div className="daily-stats-row">
        <div className="daily-stat-card">
          <span className="daily-stat-icon daily-stat-icon-total" dangerouslySetInnerHTML={{ __html: FIELD_ICONS.day }} />
          <div className="daily-stat-body">
            <span>Усього задач на день</span>
            <b>{dayStats.total}</b>
            {dayStats.delta != null && (
              <em>{dayStats.delta > 0 ? `+${dayStats.delta}` : dayStats.delta} від вчора</em>
            )}
          </div>
        </div>
        <div className="daily-stat-card">
          <span className="daily-stat-icon daily-stat-icon-done" dangerouslySetInnerHTML={{ __html: DUE_STATUS_ICONS.done }} />
          <div className="daily-stat-body">
            <span>Виконано</span>
            <b>{dayStats.done}</b>
            <em>{dayStats.donePct}% від загальної кількості</em>
          </div>
        </div>
        <div className="daily-stat-card">
          <span className="daily-stat-icon daily-stat-icon-moved" dangerouslySetInnerHTML={{ __html: MOVED_STAT_ICON }} />
          <div className="daily-stat-body">
            <span>Перенесено</span>
            <b>{dayStats.moved}</b>
            <em>{dayStats.movedPct}% від загальної кількості</em>
          </div>
        </div>
        <div className="daily-stat-card">
          <span className="daily-stat-icon daily-stat-icon-cancelled" dangerouslySetInnerHTML={{ __html: DUE_STATUS_ICONS.cancelled }} />
          <div className="daily-stat-body">
            <span>Скасовано</span>
            <b>{dayStats.cancelled}</b>
            <em>{dayStats.cancelledPct}% від загальної кількості</em>
          </div>
        </div>
      </div>

      <div className="daily-add-panel">
        <div className="daily-add-panel-head">Додати нову задачу</div>
        <div className="task-add-row">
          <AutoResizeTextarea
            value={newText}
            onChange={setNewText}
            placeholder="Нова задача на цей день..."
          />
          <button
            type="button"
            className={'wk-row-subtask-btn' + (subtasksOpen ? ' on' : '')}
            onClick={() => setSubtasksOpen((o) => !o)}
            title="Підзадачі"
          >
            Підзадачі{newSubtasks.length > 0 ? ` (${newSubtasks.length})` : ''}
          </button>
        </div>

        {subtasksOpen && (
          <div className="wk-row-subtasks">
            <TaskSubtasks subtasks={newSubtasks} onChange={setNewSubtasks} forceOpen />
          </div>
        )}

        <div className="wk-row-fields">
          <div className="wk-field-box">
            <span className="wk-field-icon" dangerouslySetInnerHTML={{ __html: FIELD_ICONS.assignee }} />
            <div className="wk-field-body">
              <label>Відповідальний</label>
              <select
                value={newAssignee}
                title={assigneeOptions.find((o) => o.value === newAssignee)?.label || 'Не призначено'}
                onChange={(e) => setNewAssignee(e.target.value)}
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
              <select value={newPriority} onChange={(e) => setNewPriority(e.target.value)}>
                {PRIORITY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          </div>
          <div className={'wk-field-box wk-field-box-recur' + (newRecurring ? ' open' : '')}>
            <span className="wk-field-icon" dangerouslySetInnerHTML={{ __html: FIELD_ICONS.repeat }} />
            <div className="wk-field-body">
              <label>Повторення</label>
              <label className="task-recur-toggle">
                <input type="checkbox" checked={newRecurring} onChange={(e) => setNewRecurring(e.target.checked)} />
                Повторювати
              </label>
              {newRecurring && (
                <div className="wk-row-recurrence">
                  <select value={newRecurrenceType} onChange={(e) => setNewRecurrenceType(e.target.value)}>
                    {RECURRENCE_TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                  {newRecurrenceType === 'weekly' && (
                    <div className="wk-weekday-picker">
                      {WEEKDAY_OPTIONS.map((w) => (
                        <button
                          key={w.value}
                          type="button"
                          className={newRecurrenceWeekdays.includes(w.value) ? 'on' : ''}
                          onClick={() => setNewRecurrenceWeekdays((cur) => (cur.includes(w.value) ? cur.filter((x) => x !== w.value) : [...cur, w.value]))}
                        >
                          {w.label}
                        </button>
                      ))}
                    </div>
                  )}
                  {newRecurrenceType === 'monthly' && (
                    <input
                      type="number"
                      min="1"
                      max="31"
                      className="wk-day-of-month"
                      placeholder="Число місяця"
                      value={newRecurrenceDayOfMonth || ''}
                      onChange={(e) => setNewRecurrenceDayOfMonth(e.target.value ? +e.target.value : null)}
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
              <TagInput tags={newTags} onChange={setNewTags} />
            </div>
          </div>
          <button type="button" className="btn btn-p wk-field-submit" onClick={handleAdd} disabled={adding || !newText.trim()}>
            {adding ? '...' : '+ Додати'}
          </button>
        </div>
      </div>

      <section className="report-section">
        <div className="stitle">
          <span>Задачі на {fmtDate(period.year, period.month, period.day)}</span>
          <span className="stitle-badge">{activeTasks.length} активні</span>
          <div className="task-filter-wrap stitle-filter" ref={filterPopoverRef}>
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
        </div>
        {loading ? (
          <div className="empty-hint">Завантаження...</div>
        ) : (
          <div className="task-list">
            {activeTasks.length === 0 && <div className="empty-hint">На цей день ще немає задач.</div>}
            {activeTasks.map((task) => (
              <DailyTaskRow
                key={task.id}
                task={task}
                profile={profilesByEmail[task.assignee_email]}
                onView={openView}
                onEdit={openEdit}
                onToggleDone={handleToggleDone}
                onMove={openMove}
                onCancel={openCancel}
                onDelete={handleDelete}
                onDeleteSeries={handleDeleteSeries}
                onSubtasksChange={handleSubtasksChange}
              />
            ))}
          </div>
        )}
      </section>

      {!loading && (
        <>
          <div className="daily-bottom-grid">
          <section className="report-section">
            <div className="stitle daily-bottom-title">
              <span className="daily-bottom-icon daily-bottom-icon-done" dangerouslySetInnerHTML={{ __html: DUE_STATUS_ICONS.done }} />
              <span>Виконані задачі</span>
              <span className="stitle-badge">{doneTasks.length}</span>
            </div>
            <div className="task-list">
              {doneTasks.length === 0 ? (
                <div className="daily-empty-state">
                  <span className="daily-empty-icon" dangerouslySetInnerHTML={{ __html: DUE_STATUS_ICONS.done }} />
                  <b>Ще немає виконаних задач.</b>
                  <span>Коли задачі будуть виконані, вони з&#39;являться тут.</span>
                </div>
              ) : doneTasks.map((task) => (
                <DailyTaskRow
                  key={task.id}
                  task={task}
                  profile={profilesByEmail[task.assignee_email]}
                  onView={openView}
                  onEdit={openEdit}
                  onToggleDone={handleToggleDone}
                  onMove={openMove}
                  onCancel={openCancel}
                  onDelete={handleDelete}
                  onDeleteSeries={handleDeleteSeries}
                  onSubtasksChange={handleSubtasksChange}
                />
              ))}
            </div>
          </section>

          <section className="report-section">
            <div className="stitle daily-bottom-title">
              <span className="daily-bottom-icon daily-bottom-icon-moved" dangerouslySetInnerHTML={{ __html: MOVED_STAT_ICON }} />
              <span>Перенесені задачі</span>
              <span className="stitle-badge">{movedOutFiltered.length}</span>
            </div>
            <div className="task-list">
              {movedOutFiltered.length === 0 ? (
                <div className="daily-empty-state">
                  <span className="daily-empty-icon" dangerouslySetInnerHTML={{ __html: MOVED_STAT_ICON }} />
                  <b>Немає перенесених задач.</b>
                  <span>Перенесені задачі будуть відображатися тут.</span>
                </div>
              ) : movedOutFiltered.map((task) => (
                <div className="task-row moved-row" key={task.id}>
                  <span className="task-text">{task.text}</span>
                  <span className="status-pill moved">Перенесено на {fmtIso(task.task_date)}</span>
                  <button type="button" className="task-del" onClick={() => handleDelete(task)} aria-label="Видалити задачу">&times;</button>
                </div>
              ))}
            </div>
          </section>
          </div>

          <section className="report-section">
            <div className="stitle">Скасовані задачі</div>
            <div className="task-list">
              {cancelledTasks.length === 0 && <div className="empty-hint">Немає скасованих задач.</div>}
              {cancelledTasks.map((task) => (
                <div className="task-row cancelled-row" key={task.id}>
                  <div className="task-cancel-body">
                    <span className="task-text done">{task.text}</span>
                    {task.cancel_reason && <span className="task-cancel-reason">Причина: {task.cancel_reason}</span>}
                  </div>
                  <span className="status-pill cancelled">Скасовано</span>
                  <button type="button" className="task-del" onClick={() => handleDelete(task)} aria-label="Видалити задачу">&times;</button>
                </div>
              ))}
            </div>
          </section>
        </>
      )}

      <StatusLegend />

      {viewTask && (
        <TaskDetailModal
          task={viewTask}
          profile={profilesByEmail[viewTask.assignee_email]}
          assigneeOptions={assigneeOptions}
          initialMode={viewInitialMode}
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
