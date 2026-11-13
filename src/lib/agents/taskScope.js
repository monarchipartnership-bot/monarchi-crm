// The TASKS of the creative teams (owner, 2026-11-12, step 3.0b): every task has a card of its own, and the AI Agents section lists them all instead of «Операції».
// A task is one of: the regular main one, an additional regular one, a seasonal one (all kept in ag_campaigns.config.regulars; every run of them is a request with brief.regular_id) or a one-off one
// (one request). This file lists the tasks of all operations and cuts the cabinet of an operation down to ONE task, so the same views (work, review, costs) show only that task. Pure code.
import { regularsOf, kyivToday, pausedBySeason, seasonOver, buildOperationView, hasCreativeCycles } from './operationCycles.js';
import { creativeRunState } from './aiResults.js';
import { TASK_KIND } from './teamTasks.js';
import { previewRuns } from './scheduleCalendar.js';

const dayMonth = (d) => (d ? `${String(d).slice(8, 10)}.${String(d).slice(5, 7)}` : '');
const at = (v) => { const t = new Date(v).getTime(); return Number.isNaN(t) ? 0 : t; };

// A task is read from its key: `reg:<regularId>` | `one:<requestId>`.
export const parseTaskKey = (key) => {
  const m = /^(reg|one):(.+)$/.exec(String(key || ''));
  return m ? (m[1] === 'reg' ? { kind: 'regular', regularId: m[2] } : { kind: 'oneoff', requestId: Number(m[2]) }) : null;
};

// The requests (cycles) that belong to a task: the runs of a regular task, or the single request of a one-off one.
export function requestsOfTask(cockpit, task) {
  const t = task?.regularId != null || task?.requestId != null ? task : parseTaskKey(task?.key);
  if (!t) return [];
  const all = cockpit?.requests || [];
  if (t.regularId != null) return all.filter((r) => r.kind === 'regular' && (r.regularId || 'r1') === t.regularId);
  return all.filter((r) => r.id === t.requestId);
}

// The cabinet of an operation cut down to one task: its requests, and the notes/questions of the agents that belong to them. The rest of the cabinet (the profile of the client, the money of the
// whole operation) is not part of a task and is left out.
export function scopeCockpit(cockpit, task) {
  if (!cockpit) return cockpit;
  const mine = requestsOfTask(cockpit, task);
  const ids = new Set(mine.map((r) => r.id));
  return { ...cockpit, requests: mine, attention: (cockpit.attention || []).filter((a) => a.requestId != null && ids.has(a.requestId)) };
}

// → [{ key, campaignId, projectId, kind: 'main' | 'extra' | 'seasonal' | 'oneoff', kindLabel, title, line, state: 'work' | 'wait' | 'paused' | 'soon' | 'ok' | 'stopped' | 'done', stateText,
//      regularId?, requestId?, enabled?, review (pictures waiting), approved, costUsd, lastAt }]  all the tasks of ONE creative operation, the newest activity first.
export function tasksOfOperation({ campaign, cockpit = null, now = new Date() } = {}) {
  if (!campaign || !hasCreativeCycles(campaign)) return [];
  const view = buildOperationView({ campaign, cockpit, now });
  const today = kyivToday(now);
  const plain = view.regulars.filter((r) => !r.seasonal);
  const out = [];
  const runsOf = (regularId) => (cockpit?.requests || []).filter((r) => r.kind === 'regular' && (r.regularId || 'r1') === regularId);
  const sum = (reqs, f) => reqs.reduce((s, r) => s + f(r), 0);
  view.regulars.forEach((r) => {
    const seasonal = !!r.seasonal;
    const kind = seasonal ? 'seasonal' : plain[0]?.id === r.id ? 'main' : 'extra';
    const over = seasonOver(r, now);
    const rest = !seasonal ? pausedBySeason(campaign, regularsOf(campaign).find((x) => x.id === r.id) || r, now) : null;
    let state = 'work'; let stateText = 'працює';
    if (over) { state = 'done'; stateText = 'сезон завершено'; } else if (!r.enabled) { state = 'paused'; stateText = 'зупинено'; } else if (rest) { state = 'paused'; stateText = `на паузі до ${dayMonth(rest.endDate)}`; } else if (seasonal && r.startDate && today < r.startDate) { state = 'soon'; stateText = `почнеться ${dayMonth(r.startDate)}`; }
    const runs = runsOf(r.id);
    const review = sum(runs, (x) => x.creatives?.review || 0);
    if (state === 'work' && runs.some((x) => x.status === 'waiting')) { state = 'wait'; stateText = 'агент питає вас'; } // step 3.7
    else if (state === 'work' && runs.some((x) => x.status === 'paused')) { state = 'wait'; stateText = 'запуск на паузі'; }
    else if (state === 'work' && review > 0) { state = 'wait'; stateText = 'чекає вас'; }
    const period = seasonal ? `${r.startDate ? `${dayMonth(r.startDate)} – ` : 'до '}${dayMonth(r.endDate)}` : '';
    const line = [period, r.whenText, r.enabled && state !== 'paused' && !over && r.next?.text ? `наступний запуск ${r.next.text}` : ''].filter(Boolean).join(' · ');
    out.push({ key: `reg:${r.id}`, campaignId: campaign.id, projectId: campaign.project_id ?? null, kind, kindLabel: TASK_KIND[kind], title: r.title || 'Без назви', line, state, stateText, regularId: r.id, enabled: r.enabled,
      schedule: { everyDays: r.everyDays || null, weekdays: r.weekdays || [], time: r.time || '09:00', nextAt: r.next?.at || null, endDate: r.endDate || null, startDate: r.startDate || null },
      review, approved: sum(runs, (x) => x.creatives?.approved || 0), costUsd: Math.round(sum(runs, (x) => (x.cost?.model || 0) + (x.cost?.higgsfield || 0)) * 100) / 100, runs: runs.length, lastAt: runs.map((x) => x.updatedAt || x.createdAt).filter(Boolean).sort().pop() || null });
  });
  (cockpit?.requests || []).filter((r) => r.kind !== 'regular').forEach((r) => {
    const st = creativeRunState(r);
    out.push({ key: `one:${r.id}`, campaignId: campaign.id, projectId: campaign.project_id ?? null, kind: 'oneoff', kindLabel: TASK_KIND.oneoff, title: r.title || `Завдання №${r.id}`,
      line: [r.createdAt ? dayMonth(String(r.createdAt).slice(0, 10)) : '', st.text].filter(Boolean).join(' · '), state: st.state === 'ok' ? 'done' : st.state, stateText: st.state === 'ok' ? 'завершено' : r.status === 'waiting' ? 'агент питає вас' : r.status === 'paused' ? 'на паузі' : st.state === 'wait' ? 'чекає вас' : st.state === 'stopped' ? 'зупинилось' : 'працює',
      requestId: r.id, review: r.creatives?.review || 0, approved: r.creatives?.approved || 0, costUsd: Math.round(((r.cost?.model || 0) + (r.cost?.higgsfield || 0)) * 100) / 100, runs: 1, lastAt: r.updatedAt || r.createdAt || null });
  });
  return out.sort((a, b) => at(b.lastAt) - at(a.lastAt));
}

// The lists of the section «Задачі»: every task of every operation, with the project name; filters: all | wait | work | paused | archive.
export const TASK_FILTERS = [['all', 'Усі'], ['wait', 'Чекають на вас'], ['work', 'Працюють'], ['paused', 'На паузі'], ['archive', 'Архів']];
export const matchesFilter = (task, filter) => {
  if (filter === 'wait') return task.state === 'wait' || task.state === 'stopped';
  if (filter === 'work') return task.state === 'work';
  if (filter === 'paused') return task.state === 'paused' || task.state === 'soon';
  if (filter === 'archive') return task.state === 'done';
  return task.state !== 'done';
};
const ORDER = { wait: 0, stopped: 0, work: 1, soon: 2, paused: 3, done: 4 };
// campaigns: ag_campaigns rows; cockpits: { [campaignId]: cockpit }; projects: [{ id, name, client }] → [{ ...task, projectName, campaignName, campaignStatus }]
export function allTasks({ campaigns = [], cockpits = {}, projects = [], now = new Date() } = {}) {
  const nameOf = new Map(projects.map((p) => [p.id, p.client || p.name]));
  return campaigns.filter((c) => c.status !== 'archived' && c.status !== 'draft').flatMap((c) => tasksOfOperation({ campaign: c, cockpit: cockpits[c.id] || null, now })
    .map((t) => ({ ...t, projectName: nameOf.get(c.project_id) || c.name, campaignName: c.name, campaignStatus: c.status })))
    .sort((a, b) => (ORDER[a.state] ?? 5) - (ORDER[b.state] ?? 5) || at(b.lastAt) - at(a.lastAt));
}
// The projects with their tasks, for the list A: [{ projectId, projectName, campaignStatus, tasks: [...] }] the one with the tasks that wait for the person first.
export function groupByProject(tasks = []) {
  const map = new Map();
  tasks.forEach((t) => { if (!map.has(t.projectId)) map.set(t.projectId, { projectId: t.projectId, projectName: t.projectName, campaignStatus: t.campaignStatus, tasks: [] }); map.get(t.projectId).tasks.push(t); });
  return [...map.values()].sort((a, b) => Math.min(...a.tasks.map((t) => ORDER[t.state] ?? 5)) - Math.min(...b.tasks.map((t) => ORDER[t.state] ?? 5)) || String(a.projectName).localeCompare(String(b.projectName)));
}

const kyivDate = (iso) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Kyiv' }).format(new Date(iso));
const addDay = (d, n) => { const t = new Date(`${d}T00:00:00Z`); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
// The runs the regular and seasonal tasks make by their schedules in the next `horizon` days. tasks: allTasks(); a task that is switched off or over is not in it; a task of a team that is on
// pause is shown with `held: true` (it does not start until the team is continued). → [{ date, time, task }] by date and time
export function calendarRuns(tasks = [], today = kyivDate(new Date().toISOString()), horizon = 30) {
  const last = addDay(today, horizon);
  const out = [];
  tasks.filter((t) => t.regularId && t.schedule && t.enabled !== false && t.state !== 'done' && t.state !== 'paused').forEach((t) => {
    const s = t.schedule;
    let dates = [];
    if (s.everyDays) {
      let d = s.startDate && s.startDate > today ? s.startDate : s.nextAt ? kyivDate(s.nextAt) : today;
      if (d < today) d = today;
      for (let i = 0; i < 100 && d <= last; i += 1) { dates.push(d); d = addDay(d, s.everyDays); }
    } else if (s.weekdays?.length) {
      dates = previewRuns({ mode: 'week', days: s.weekdays, start: s.startDate || null, end: s.endDate || null }, today, horizon);
    }
    dates.filter((d) => !s.endDate || d <= s.endDate).forEach((date) => out.push({ date, time: s.time, task: t, held: t.campaignStatus === 'paused' }));
  });
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time) || a.task.title.localeCompare(b.task.title));
}
