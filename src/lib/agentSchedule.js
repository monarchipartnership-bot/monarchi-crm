// When the project AI agent is due. The schedule lives in the agent's settings
// (schedule: { weeklyDay 1..7 (Mon..Sun), weeklyTime 'HH:MM', monthlyDay 1..28, monthlyTime 'HH:MM' })
// and is read in Kyiv time, the team's own clock — not the server's.
// Pure code (used by the cron on the server and by the tab to show "next run").

const KYIV = 'Europe/Kyiv';
const pad = (n) => String(n).padStart(2, '0');
const minutesOf = (hhmm) => { const [h, m] = String(hhmm || '09:00').split(':').map(Number); return (h || 0) * 60 + (m || 0); };

// → { date: 'YYYY-MM-DD', weekday: 1..7 (Mon..Sun), minutes: since midnight }
export function kyivParts(now = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: KYIV, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', weekday: 'short' }).formatToParts(now).map((x) => [x.type, x.value]));
  const weekday = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 }[p.weekday];
  return { date: `${p.year}-${p.month}-${p.day}`, weekday, minutes: Number(p.hour) * 60 + Number(p.minute) };
}

function kyivOffset(date) {
  const part = new Intl.DateTimeFormat('en-US', { timeZone: KYIV, timeZoneName: 'longOffset' }).formatToParts(date).find((x) => x.type === 'timeZoneName')?.value || 'GMT+03:00';
  return part === 'GMT' ? '+00:00' : part.replace('GMT', '');
}

// The exact moment of 'YYYY-MM-DD' + 'HH:MM' on the Kyiv clock.
export function kyivInstant(date, time) {
  const t = pad(Math.floor(minutesOf(time) / 60)) + ':' + pad(minutesOf(time) % 60);
  return new Date(`${date}T${t}:00${kyivOffset(new Date(`${date}T12:00:00Z`))}`);
}

const addDays = (date, n) => { const d = new Date(`${date}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const weekdayOf = (date) => ((new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7) + 1;

// The most recent scheduled moment that is not in the future: { date, at: Date } for the report type.
export function lastScheduled(periodType, schedule = {}, now = new Date()) {
  const k = kyivParts(now);
  if (periodType === 'monthly') {
    const day = Math.min(Math.max(Number(schedule.monthlyDay) || 1, 1), 28);
    const time = schedule.monthlyTime || '09:00';
    let [y, m] = k.date.split('-').map(Number);
    if (k.date.slice(8) < pad(day) || (Number(k.date.slice(8)) === day && k.minutes < minutesOf(time))) { m -= 1; if (m === 0) { m = 12; y -= 1; } }
    const date = `${y}-${pad(m)}-${pad(day)}`;
    return { date, at: kyivInstant(date, time) };
  }
  const wd = Math.min(Math.max(Number(schedule.weeklyDay) || 1, 1), 7);
  const time = schedule.weeklyTime || '09:00';
  let back = (k.weekday - wd + 7) % 7;
  if (back === 0 && k.minutes < minutesOf(time)) back = 7;
  const date = addDays(k.date, -back);
  return { date, at: kyivInstant(date, time) };
}

// The next scheduled moment after `now` (to show "next run" in the tab).
export function nextScheduled(periodType, schedule = {}, now = new Date()) {
  const last = lastScheduled(periodType, schedule, now);
  const span = periodType === 'monthly' ? 33 : 8;
  // Walk forward day by day from the last moment until the first scheduled day after now.
  for (let i = 1; i <= span; i += 1) {
    const date = addDays(last.date, i);
    const hit = periodType === 'monthly' ? Number(date.slice(8)) === Math.min(Math.max(Number(schedule.monthlyDay) || 1, 1), 28) : weekdayOf(date) === Math.min(Math.max(Number(schedule.weeklyDay) || 1, 1), 7);
    if (hit) return { date, at: kyivInstant(date, periodType === 'monthly' ? schedule.monthlyTime || '09:00' : schedule.weeklyTime || '09:00') };
  }
  return null;
}

const MAX_TRIES = 3; // a failed run is tried again up to this many times in total…
const RETRY_AFTER_MIN = 60; // …at least this long after the previous failure

// Should the agent run now for this report type?
//   agent: the project_agents row; runs: agent_runs rows of this project and type (any period);
//   returns { due: boolean, scheduledFor: 'YYYY-MM-DD', reason }.
// A run is due when its scheduled moment has passed, the agent was already switched on at that moment,
// and no run for that period finished (ok / skipped) or is still being retried. Missing a cron tick
// therefore only delays a report, it never loses one.
export function isDue({ periodType, agent, runs, now = new Date(), dueStartOf }) {
  const cfg = agent.config || {};
  const task = periodType === 'weekly' ? cfg.tasks?.weeklyReport : cfg.tasks?.monthlyReport;
  if (!agent.enabled) return { due: false, reason: 'вимкнено' };
  if (task === false) return { due: false, reason: 'цей звіт не увімкнено' };
  const sched = lastScheduled(periodType, cfg.schedule || {}, now);
  if (agent.enabled_since && sched.at < new Date(agent.enabled_since)) return { due: false, reason: 'запланований момент був до вмикання агента' };
  const periodStart = dueStartOf(sched.date);
  const mine = runs.filter((r) => r.period_start === periodStart);
  // A 'running' row only counts while it is fresh: a run that crashed must not block the project for ever.
  const live = (r) => r.status === 'running' && now.getTime() - new Date(r.started_at).getTime() < 15 * 60000;
  if (mine.some((r) => r.status === 'ok' || r.status === 'skipped' || live(r))) return { due: false, reason: 'вже виконано', scheduledFor: sched.date };
  const failed = mine.filter((r) => r.status === 'problem');
  if (failed.length >= MAX_TRIES) return { due: false, reason: 'вичерпано спроби', scheduledFor: sched.date };
  const lastFail = failed.map((r) => new Date(r.finished_at || r.started_at).getTime()).sort((a, b) => b - a)[0];
  if (lastFail && now.getTime() - lastFail < RETRY_AFTER_MIN * 60000) return { due: false, reason: 'чекаємо перед повтором', scheduledFor: sched.date };
  return { due: true, scheduledFor: sched.date, periodStart };
}
