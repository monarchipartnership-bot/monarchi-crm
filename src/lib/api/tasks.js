import { supabase } from '../supabaseClient';

// Task Reports (Automation Department) — a normalized `tasks` table, one row
// per task, mutated immediately per action (no batch "Save" button like the
// numeric report pages) since tasks need independent per-item edits and
// cross-period queries (a task can move out of the week it was planned for).
//
// `planned_date` is immutable — the day/week a task was ORIGINALLY planned
// for; Weekly/Monthly views group by this. `task_date` is mutable — the day
// it's CURRENTLY assigned to (starts equal to planned_date, changes via
// "move"). Daily view queries by task_date (live placement); Weekly/Monthly
// view query by planned_date (original plan, for a stable retrospective).

function nowIso() {
  return new Date().toISOString();
}

// Typed activities on a deal's own task rows — `activity_type`/`scheduled_at`/
// `duration_minutes` are optional columns used only when a task is opened
// from a deal's "Активності" tab; every other task in the app (Daily/Weekly/
// Monthly Tasks, PM department) just leaves them null.
export const ACTIVITY_TYPES = [
  { value: 'task', label: 'Задача', icon: 'checklist' },
  { value: 'call', label: 'Дзвінок', icon: 'phone' },
  { value: 'meeting', label: 'Зустріч', icon: 'meeting' },
  { value: 'email', label: 'Email', icon: 'email' },
  { value: 'deadline', label: 'Дедлайн', icon: 'deadline' },
];

// All tasks currently sitting on a given day (Daily Tasks view).
// `department` scopes to 'automation' (default, backward-compatible),
// 'sales', or 'pm' — one shared engine reused across departments rather
// than a parallel table per department.
export async function fetchTasksForDay(dateIso, department = 'automation') {
  const { data, error } = await supabase
    .from('tasks')
    .select('*')
    .eq('task_date', dateIso)
    .eq('department', department)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

// Just the count for a day (head-count query, no rows) — used for the
// "+N від вчора" delta on Daily Tasks' stats bar so it doesn't need to pull
// yesterday's full task rows just to measure how many there were.
export async function fetchTaskCountForDay(dateIso, department = 'automation') {
  const { count, error } = await supabase
    .from('tasks')
    .select('id', { count: 'exact', head: true })
    .eq('task_date', dateIso)
    .eq('department', department);
  if (error) { console.warn('fetchTaskCountForDay failed', error); return 0; }
  return count ?? 0;
}

// Tasks originally planned for this week (Weekly Tasks view's own rows —
// shown under their original day regardless of where task_date has since moved).
export async function fetchTasksForWeek(startIso, endIso, department = 'automation') {
  const { data, error } = await supabase
    .from('tasks')
    .select('*')
    .gte('planned_date', startIso)
    .lte('planned_date', endIso)
    .eq('department', department)
    .order('planned_date', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

// Tasks planned for an EARLIER week but currently sitting on a day within
// this week — i.e. carried in from a previous week's overflow.
export async function fetchCarriedInTasks(startIso, endIso, department = 'automation') {
  const { data, error } = await supabase
    .from('tasks')
    .select('*')
    .gte('task_date', startIso)
    .lte('task_date', endIso)
    .lt('planned_date', startIso)
    .eq('department', department)
    .order('task_date', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

// All tasks planned within a month (Monthly Tasks rollup).
export async function fetchTasksForMonth(startIso, endIso, department = 'automation') {
  const { data, error } = await supabase
    .from('tasks')
    .select('*')
    .gte('planned_date', startIso)
    .lte('planned_date', endIso)
    .eq('department', department)
    .order('planned_date', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function createTask({
  text, plannedDate, taskDate, assigneeEmail, priority, tags, subtasks, department = 'automation', clientId, dealId, createdByEmail,
  activityType, scheduledAt, durationMinutes,
}) {
  const payload = {
    text,
    planned_date: plannedDate ?? null,
    task_date: taskDate ?? plannedDate ?? null,
    status: 'pending',
    assignee_email: assigneeEmail || null,
    priority: priority || null,
    tags: tags?.length ? tags : [],
    subtasks: subtasks?.length ? subtasks : [],
    department,
    client_id: clientId || null,
    deal_id: dealId || null,
    created_by_email: createdByEmail || null,
    activity_type: activityType || null,
    scheduled_at: scheduledAt || null,
    duration_minutes: durationMinutes || null,
    updated_at: nowIso(),
  };
  const { data, error } = await supabase.from('tasks').insert(payload).select().single();
  if (error) throw error;
  return data;
}

// Tasks linked to one deal (client card's "Задача" action, and the deal
// detail view) — a deal is where the sales-pipeline activity lives now.
export async function fetchTasksForDeal(dealId) {
  const { data, error } = await supabase.from('tasks').select('*').eq('deal_id', dealId).order('created_at', { ascending: false });
  if (error) { console.warn('fetchTasksForDeal failed', error); return []; }
  return data ?? [];
}

// `YYYY-MM-DD` shifted by whole calendar months, clamped to the day the
// target month actually has (e.g. Jan 31 + 1 month -> Feb 28/29, not Mar 3).
function addMonthsIso(iso, months) {
  const [y, m, d] = iso.split('-').map(Number);
  const totalMonths = (m - 1) + months;
  const targetYear = y + Math.floor(totalMonths / 12);
  const targetMonth = ((totalMonths % 12) + 12) % 12; // 0-11
  const daysInTarget = new Date(targetYear, targetMonth + 1, 0).getDate();
  const day = Math.min(d, daysInTarget);
  const mm = String(targetMonth + 1).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  return `${targetYear}-${mm}-${dd}`;
}

// Local copy of dateHelpers' addDaysIso — kept here so this file has no
// import-order dependency on it; both implementations are equivalent.
function addDaysIsoLocal(iso, days) {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

// 1=Mon..7=Sun for a "YYYY-MM-DD" string.
function isoWeekday(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  const dow = new Date(y, m - 1, d).getDay(); // 0=Sun..6=Sat
  return dow === 0 ? 7 : dow;
}

const DEFAULT_OCCURRENCES = { daily: 8, weekly: 8, monthly: 6 };

// Every date in a recurring series, starting at `startDateIso` (inclusive),
// for a `rule` of shape { type: 'daily' } | { type: 'weekly', weekdays: [1-7] }
// | { type: 'monthly', dayOfMonth? }.
// - daily: consecutive days.
// - weekly: walks forward day-by-day collecting dates whose ISO weekday is
//   in `rule.weekdays` (defaults to the start date's own weekday if omitted,
//   preserving the simple "same weekday every week" behavior as a special
//   case) — `occurrences` counts total dates across all selected weekdays,
//   not per-weekday.
// - monthly: steps by whole months from `rule.dayOfMonth` (or the start
//   date's own day if omitted), clamped per month via addMonthsIso.
export function datesForRule(startDateIso, rule, occurrences) {
  const type = rule?.type || 'daily';
  const n = occurrences ?? DEFAULT_OCCURRENCES[type] ?? 8;

  if (type === 'monthly') {
    let anchor = startDateIso;
    if (rule.dayOfMonth) {
      const [y, m] = anchor.split('-').map(Number);
      const dim = new Date(y, m, 0).getDate();
      anchor = `${y}-${String(m).padStart(2, '0')}-${String(Math.min(rule.dayOfMonth, dim)).padStart(2, '0')}`;
    }
    const dates = [anchor];
    for (let i = 1; i < n; i++) dates.push(addMonthsIso(dates[i - 1], 1));
    return dates;
  }

  if (type === 'weekly') {
    const weekdays = rule.weekdays?.length ? rule.weekdays : [isoWeekday(startDateIso)];
    const dates = [];
    let cursor = startDateIso;
    let guard = 0;
    while (dates.length < n && guard < 400) {
      if (weekdays.includes(isoWeekday(cursor))) dates.push(cursor);
      cursor = addDaysIsoLocal(cursor, 1);
      guard++;
    }
    return dates;
  }

  // daily
  const dates = [startDateIso];
  for (let i = 1; i < n; i++) dates.push(addDaysIsoLocal(dates[i - 1], 1));
  return dates;
}

// Creates a batch of real task rows sharing one `series_id` (the first row's
// own id) — see the "Design trade-off" note in the task plan: this generates
// a fixed batch up front rather than a live background job, since the app
// has no server to run one. `fetchSeriesFutureCount` + a manual "continue
// series" action top it back up later if it runs low.
export async function createRecurringSeries({ text, startDate, rule, assigneeEmail, priority, tags, subtasks, department = 'automation', clientId, createdByEmail }) {
  const dates = datesForRule(startDate, rule);
  const [firstDate, ...restDates] = dates;

  const basePayload = {
    text,
    status: 'pending',
    recurrence_rule: rule,
    assignee_email: assigneeEmail || null,
    priority: priority || null,
    tags: tags?.length ? tags : [],
    department,
    client_id: clientId || null,
    created_by_email: createdByEmail || null,
    updated_at: nowIso(),
  };
  const firstSubtasks = subtasks?.length ? subtasks : [];

  const { data: first, error: firstError } = await supabase
    .from('tasks')
    .insert({ ...basePayload, planned_date: firstDate, task_date: firstDate, subtasks: firstSubtasks })
    .select()
    .single();
  if (firstError) throw firstError;

  const { error: seriesError } = await supabase.from('tasks').update({ series_id: first.id }).eq('id', first.id);
  if (seriesError) throw seriesError;

  if (restDates.length) {
    const restRows = restDates.map((d) => ({ ...basePayload, planned_date: d, task_date: d, series_id: first.id, subtasks: [] }));
    const { error: restError } = await supabase.from('tasks').insert(restRows);
    if (restError) throw restError;
  }

  return { ...first, series_id: first.id, subtasks: firstSubtasks };
}

// How many not-yet-done future instances remain in a series — used to decide
// whether to show a "Продовжити серію" action.
export async function fetchSeriesFutureCount(seriesId, afterDateIso) {
  const { count, error } = await supabase
    .from('tasks')
    .select('id', { count: 'exact', head: true })
    .eq('series_id', seriesId)
    .eq('status', 'pending')
    .gte('task_date', afterDateIso);
  if (error) { console.warn('fetchSeriesFutureCount failed', error); return 0; }
  return count ?? 0;
}

// Extends a series with another batch, continuing from the latest existing
// date in it (rather than from today, so gaps never open up).
export async function continueSeries(seriesId, rule, text, assigneeEmail, priority, tags) {
  const { data: latest, error: latestError } = await supabase
    .from('tasks')
    .select('task_date')
    .eq('series_id', seriesId)
    .order('task_date', { ascending: false })
    .limit(1)
    .single();
  if (latestError) throw latestError;

  const type = rule?.type || 'daily';
  const nextStart = type === 'monthly' ? addMonthsIso(latest.task_date, 1) : addDaysIsoLocal(latest.task_date, 1);
  const dates = datesForRule(nextStart, rule);
  const rows = dates.map((d) => ({
    text, status: 'pending', recurrence_rule: rule, series_id: seriesId,
    assignee_email: assigneeEmail || null, priority: priority || null, tags: tags?.length ? tags : [],
    planned_date: d, task_date: d, subtasks: [], updated_at: nowIso(),
  }));
  const { error } = await supabase.from('tasks').insert(rows);
  if (error) throw error;
}

// Deletes only pending, not-yet-happened instances of a series — past
// done/cancelled rows stay untouched so history is preserved.
export async function deleteTaskSeries(seriesId, fromDateIso) {
  const { error } = await supabase
    .from('tasks')
    .delete()
    .eq('series_id', seriesId)
    .eq('status', 'pending')
    .gte('task_date', fromDateIso);
  if (error) throw error;
}

export async function updateTaskFields(id, patch) {
  const { error } = await supabase.from('tasks').update({ ...patch, updated_at: nowIso() }).eq('id', id);
  if (error) throw error;
}

export async function setTaskStatus(id, status) {
  const payload = { status, updated_at: nowIso(), completed_at: status === 'done' ? nowIso() : null };
  const { error } = await supabase.from('tasks').update(payload).eq('id', id);
  if (error) throw error;
}

export async function moveTask(id, newTaskDateIso, reason) {
  const { error } = await supabase.from('tasks').update({ task_date: newTaskDateIso, move_reason: reason || null, updated_at: nowIso() }).eq('id', id);
  if (error) throw error;
}

export async function cancelTask(id, reason) {
  const payload = { status: 'cancelled', cancel_reason: reason || null, updated_at: nowIso() };
  const { error } = await supabase.from('tasks').update(payload).eq('id', id);
  if (error) throw error;
}

// Tasks that were originally planned for this day but have since been moved
// to a different day — still pending there, shown here as a "moved out" log.
export async function fetchMovedOutTasks(dateIso, department = 'automation') {
  const { data, error } = await supabase
    .from('tasks')
    .select('*')
    .eq('planned_date', dateIso)
    .neq('task_date', dateIso)
    .eq('status', 'pending')
    .eq('department', department)
    .order('task_date', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function updateTaskText(id, text) {
  const { error } = await supabase.from('tasks').update({ text, updated_at: nowIso() }).eq('id', id);
  if (error) throw error;
}

export async function deleteTask(id) {
  const { error } = await supabase.from('tasks').delete().eq('id', id);
  if (error) throw error;
}

// Every task planned OR currently placed on/after `sinceIso` — the single
// broad fetch the Dashboard aggregates client-side (today/yesterday/this
// week/last week/trend), matching the rest of the app's fetch-raw-rows-and-
// compute-in-JS pattern rather than SQL aggregates.
// Tasks with no date at all — the "Без дати" backlog. Only ever created via
// WeeklyTasks' creation form; Daily/Monthly's own fetches are date-scoped so
// backlog rows can never appear there.
export async function fetchBacklogTasks(department = 'automation') {
  const { data, error } = await supabase
    .from('tasks')
    .select('*')
    .is('task_date', null)
    .eq('department', department)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function fetchTasksSince(sinceIso, department = 'automation') {
  const { data, error } = await supabase
    .from('tasks')
    .select('*')
    .or(`planned_date.gte.${sinceIso},task_date.gte.${sinceIso}`)
    .eq('department', department)
    .order('task_date', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

// Most recently created tasks across every department — for the Home
// dashboard's "recent activity" feed, unlike fetchTasksSince (which orders
// by task_date, not when the row was actually created).
export async function fetchRecentTasks(limit = 5) {
  const { data, error } = await supabase.from('tasks').select('*').order('created_at', { ascending: false }).limit(limit);
  if (error) { console.warn('fetchRecentTasks failed', error); return []; }
  return data ?? [];
}

// Every task linked to any deal, across every pipeline — backs the "Задачі"
// button on the Deals page header (a cross-deal task inbox), so a manager can
// see what's outstanding without opening each deal card one by one.
export async function fetchAllDealTasks() {
  const { data, error } = await supabase
    .from('tasks')
    .select('*')
    .not('deal_id', 'is', null)
    .order('created_at', { ascending: false });
  if (error) { console.warn('fetchAllDealTasks failed', error); return []; }
  return data ?? [];
}

// Every task assigned to one person, across every department and client —
// backs the "Мої задачі" page (Sales client-tasks included, since those are
// just tasks table rows with client_id set).
export async function fetchTasksForAssignee(assigneeEmail) {
  const { data, error } = await supabase
    .from('tasks')
    .select('*')
    .eq('assignee_email', assigneeEmail)
    .neq('status', 'cancelled')
    .order('task_date', { ascending: true, nullsFirst: false });
  if (error) throw error;
  return data ?? [];
}
