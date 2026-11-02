// Cycles and schedule of a campaign (spec 2026-11-02, §3 and §5): a campaign is a standing assignment, a CYCLE is one pass of it (a one-off campaign has one cycle per request,
// a repeating one a cycle every week). The person must see when each agent works next, be able to change it, pause an agent, ask it to wait for their OK, and give
// instructions. Pure code: the server and the page both use it.
import { nextScheduled } from '../agentSchedule.js';

export const WEEKDAYS = ['Понеділок', 'Вівторок', 'Середа', 'Четвер', 'Пʼятниця', 'Субота', 'Неділя'];
export const STALE_CYCLE_DAYS = 3; // a cycle still «running» after this long did not finish: a new pass starts a new one
export const MAX_INSTRUCTIONS = 20;
export const MAX_INSTRUCTION_CHARS = 1000;

// ---- the schedule of one agent: { weekday 1..7, time 'HH:MM' } or null
export function cleanSchedule(input) {
  if (input == null || input === false) return null;
  const weekday = Number(input.weekday);
  if (!Number.isInteger(weekday) || weekday < 1 || weekday > 7) throw new Error('День тижня має бути від 1 (понеділок) до 7 (неділя).');
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(input.time || '09:00').trim());
  if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) throw new Error('Час має бути у форматі ГГ:ХХ, наприклад 09:00.');
  return { weekday, time: `${String(Number(m[1])).padStart(2, '0')}:${m[2]}` };
}

export const describeSchedule = (s) => (s?.weekday ? `щотижня, ${WEEKDAYS[s.weekday - 1].toLowerCase()} о ${s.time || '09:00'}` : '');

// ---- the mode of an agent inside a campaign: auto (works and passes on), confirm (works, then waits for the person's OK), paused
export const AGENT_MODES = [{ key: 'auto', label: 'Сам' }, { key: 'confirm', label: 'З моїм підтвердженням' }, { key: 'paused', label: 'Пауза' }];
export const modeOfAgent = (a) => (!a.enabled ? 'paused' : a.config?.confirm_before_pass ? 'confirm' : 'auto');

// agents: the rows of ag_agents of ONE campaign (team 'campaign'); upstreamName(a) → the name of the agent it waits for.
// → [{ id, role, name, trigger, mode, schedule, scheduleText, nextAt, when, lastRunAt, lastStatus }] in the order of the chain (`sort`)
export function scheduleRows(agents = [], now = new Date()) {
  return [...agents].sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0)).map((a) => {
    const trigger = a.config?.trigger || 'upstream';
    const mode = modeOfAgent(a);
    const next = a.schedule?.weekday ? nextScheduled('weekly', { weeklyDay: a.schedule.weekday, weeklyTime: a.schedule.time }, now) : null;
    const when = mode === 'paused' ? 'на паузі'
      : next ? `наступний запуск ${next.at.toISOString()}`
        : trigger === 'initial' ? 'один раз, під час запуску кампанії'
          : trigger === 'upstream' ? 'після агентів, від яких залежить' : 'без розкладу, лише вручну';
    return { id: a.id, role: a.role, name: a.name, trigger, mode, schedule: a.schedule || null, scheduleText: describeSchedule(a.schedule), nextAt: mode === 'paused' ? null : next?.at.toISOString() || null, when, lastRunAt: a.last_run_at || null, lastStatus: a.last_status || null };
  });
}

// ---- the state of a cycle, from the tasks the campaign's agents did during it
// cycle: { status, started_at, request?: { status } }; tasks: [{ agent_id, status, output }] created since the cycle began; expectedAgents: how many agents are meant to work in it.
// → { status, progress 0..1, done, open, failed, waiting }
export function cycleState({ cycle, tasks = [], expectedAgents = 0, request = null }) {
  if (['cancelled'].includes(cycle.status)) return { status: 'cancelled', progress: Number(cycle.progress) || 0, done: 0, open: 0, failed: 0, waiting: 0 };
  const live = tasks.filter((t) => t.status !== 'cancelled');
  const doneAgents = new Set(live.filter((t) => t.status === 'done').map((t) => t.agent_id));
  const open = live.filter((t) => ['queued', 'running'].includes(t.status)).length;
  const failed = live.filter((t) => t.status === 'failed').length;
  const waiting = live.filter((t) => t.status === 'done' && t.output?.awaiting_pass).length;
  const total = Math.max(expectedAgents, new Set(live.map((t) => t.agent_id)).size);
  let progress = total ? Math.min(1, doneAgents.size / total) : 0;
  let status;
  if (request) { // a cycle of a creative request follows the request
    status = { draft: 'queued', running: 'running', review: 'review', done: 'done', problem: 'problem', cancelled: 'cancelled' }[request.status] || 'running';
    if (status === 'review' || status === 'done') progress = 1;
  } else if (failed && !open) status = 'problem';
  else if (open || (total && doneAgents.size < total && !failed && live.length === 0)) status = 'running';
  else if (waiting) status = 'review';
  else if (total && doneAgents.size < total) status = 'running';
  else status = live.length ? 'done' : 'running';
  if (status === 'done') progress = 1;
  return { status, progress: Math.round(progress * 100) / 100, done: doneAgents.size, open, failed, waiting };
}

// ---- the instructions of the manager for a campaign (config.instructions: [{ role|null, text, by, at }])
export function cleanInstruction({ role = null, text }, by = null, now = new Date()) {
  const t = String(text || '').replace(/\s+/g, ' ').trim();
  if (t.length < 3) throw new Error('Напишіть вказівку для агентів.');
  return { role: role || null, text: t.slice(0, MAX_INSTRUCTION_CHARS), by, at: now.toISOString() };
}
export const addInstruction = (list = [], item) => [...list, item].slice(-MAX_INSTRUCTIONS);
// What the agent of this role reads: the general ones and its own, the newest last.
export const instructionsFor = (list = [], role) => list.filter((i) => !i.role || i.role === role);
export const instructionBlock = (list = [], role) => {
  const mine = instructionsFor(list, role).slice(-10);
  return mine.length ? { title: 'Вказівки менеджера для цієї кампанії (виконуйте їх, вони важливіші за загальні правила)', text: mine.map((i) => `- ${i.text}${i.role ? '' : ' (для всіх агентів)'}`).join('\n') } : null;
};
