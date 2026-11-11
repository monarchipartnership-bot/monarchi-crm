// Schedule and control of an operation (spec 2026-11-02, §3 and §5): an operation is a standing assignment whose agents work by their own schedules. The person must see when
// each agent works next, be able to change it, pause an agent, ask it to wait for their OK, and give instructions. Pure code: the server and the page both use it.
import { nextInterval, nextScheduled } from '../agentSchedule.js';

export const WEEKDAYS = ['Понеділок', 'Вівторок', 'Середа', 'Четвер', 'Пʼятниця', 'Субота', 'Неділя'];
export const MAX_INSTRUCTIONS = 20;
export const MAX_INSTRUCTION_CHARS = 1000;

export const MAX_EVERY_DAYS = 60;
// ---- the schedule of one agent: { weekday 1..7, time 'HH:MM' } (weekly) or { everyDays 1..60, time } (every N days) or null
export function cleanSchedule(input) {
  if (input == null || input === false) return null;
  if (input.everyDays != null && input.everyDays !== '' && !input.weekday) {
    const n = Number(input.everyDays);
    if (!Number.isInteger(n) || n < 1 || n > MAX_EVERY_DAYS) throw new Error(`Періодичність — від 1 до ${MAX_EVERY_DAYS} днів.`);
    const t = /^(\d{1,2}):(\d{2})$/.exec(String(input.time || '09:00').trim());
    if (!t || Number(t[1]) > 23 || Number(t[2]) > 59) throw new Error('Час має бути у форматі ГГ:ХХ, наприклад 09:00.');
    return { everyDays: n, time: `${String(Number(t[1])).padStart(2, '0')}:${t[2]}` };
  }
  const weekday = Number(input.weekday);
  if (!Number.isInteger(weekday) || weekday < 1 || weekday > 7) throw new Error('День тижня має бути від 1 (понеділок) до 7 (неділя).');
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(input.time || '09:00').trim());
  if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) throw new Error('Час має бути у форматі ГГ:ХХ, наприклад 09:00.');
  return { weekday, time: `${String(Number(m[1])).padStart(2, '0')}:${m[2]}` };
}

const SHORT_DAYS = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'нд'];
export const describeSchedule = (s) => (Array.isArray(s?.weekdays) && s.weekdays.length > 1 ? `щотижня: ${[...s.weekdays].sort((a, b) => a - b).map((d) => SHORT_DAYS[d - 1]).join(', ')} о ${s.time || '09:00'}`
  : Array.isArray(s?.weekdays) && s.weekdays.length === 1 ? `щотижня, ${WEEKDAYS[s.weekdays[0] - 1].toLowerCase()} о ${s.time || '09:00'}` : s?.weekday ? `щотижня, ${WEEKDAYS[s.weekday - 1].toLowerCase()} о ${s.time || '09:00'}`
  : Number(s?.everyDays) === 1 ? `щодня о ${s.time || '09:00'}` : Number(s?.everyDays) > 1 ? `кожні ${s.everyDays} дн. о ${s.time || '09:00'}` : '');

// ---- the mode of an agent inside a campaign: auto (works and passes on), confirm (works, then waits for the person's OK), paused
export const AGENT_MODES = [{ key: 'auto', label: 'Сам' }, { key: 'confirm', label: 'З моїм підтвердженням' }, { key: 'paused', label: 'Пауза' }];
export const modeOfAgent = (a) => (!a.enabled ? 'paused' : a.config?.confirm_before_pass ? 'confirm' : 'auto');

// agents: the rows of ag_agents of ONE campaign (team 'campaign'); upstreamName(a) → the name of the agent it waits for.
// → [{ id, role, name, trigger, mode, schedule, scheduleText, nextAt, when, lastRunAt, lastStatus }] in the order of the chain (`sort`)
export function scheduleRows(agents = [], now = new Date()) {
  return [...agents].sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0)).map((a) => {
    const trigger = a.config?.trigger || 'upstream';
    const mode = modeOfAgent(a);
    const next = a.schedule?.weekday ? nextScheduled('weekly', { weeklyDay: a.schedule.weekday, weeklyTime: a.schedule.time }, now)
      : Number(a.schedule?.everyDays) >= 1 ? nextInterval({ everyDays: a.schedule.everyDays, time: a.schedule.time }, { last: a.last_scheduled || null, since: a.enabled_since || null }, now) : null;
    const when = mode === 'paused' ? 'на паузі'
      : next ? `наступний запуск ${next.at.toISOString()}`
        : trigger === 'initial' ? 'один раз, під час запуску операції'
          : trigger === 'upstream' ? 'після агентів, від яких залежить' : 'без розкладу, лише вручну';
    return { id: a.id, role: a.role, name: a.name, trigger, mode, schedule: a.schedule || null, scheduleText: describeSchedule(a.schedule), nextAt: mode === 'paused' ? null : next?.at.toISOString() || null, when, lastRunAt: a.last_run_at || null, lastStatus: a.last_status || null };
  });
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
  return mine.length ? { title: 'Вказівки менеджера для цієї операції (виконуйте їх, вони важливіші за загальні правила)', text: mine.map((i) => `- ${i.text}${i.role ? '' : ' (для всіх агентів)'}`).join('\n') } : null;
};
