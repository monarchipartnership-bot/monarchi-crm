// The calendar of the schedule of a regular task (owner, 2026-11-11, variant C): two modes in one block, «every N days» from a first day and «days of the week», and the
// time shown as a RANGE (the creatives are not made in a moment: a start at 09:00 means ready from 09:00 to 09:30). Pure code: the component and the tests use it.
// Dates are 'YYYY-MM-DD' strings (the Kyiv calendar), so no time zone can move a day.
import { addDays } from '../agentSchedule.js';

export const WINDOW_MINUTES = 30; // how long after the start the text and the concepts of a run are ready, an estimate until real runs say otherwise
export const SHORT_WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Нд'];
export const MONTHS = ['Січень', 'Лютий', 'Березень', 'Квітень', 'Травень', 'Червень', 'Липень', 'Серпень', 'Вересень', 'Жовтень', 'Листопад', 'Грудень'];

const pad = (n) => String(n).padStart(2, '0');
export const weekdayOf = (date) => ((new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7) + 1; // 1..7, Monday first

// '09:00' → '09:30' (the end of the window of the run)
export function endTime(time, minutes = WINDOW_MINUTES) {
  const [h, m] = String(time || '09:00').split(':').map(Number);
  const total = ((h || 0) * 60 + (m || 0) + minutes) % 1440;
  return `${pad(Math.floor(total / 60))}:${pad(total % 60)}`;
}
// → «з 09:00 до 09:30»
export const windowText = (time, minutes = WINDOW_MINUTES) => `з ${String(time || '09:00').slice(0, 5)} до ${endTime(time, minutes)}`;

// The days the schedule starts a run, from today on. value: { mode: 'every' | 'week', every, days: [1..7], start: 'YYYY-MM-DD' }
export function previewRuns(value, today, horizon = 62) {
  const out = [];
  if (value.mode === 'every') {
    const n = Math.max(1, Math.round(Number(value.every)) || 1);
    let d = value.start && value.start >= today ? value.start : today;
    for (let i = 0; i < 100 && d <= addDays(today, horizon); i += 1) { out.push(d); d = addDays(d, n); }
    return out;
  }
  const days = new Set((value.days || []).map(Number));
  for (let i = 0; i <= horizon; i += 1) { const d = addDays(today, i); if (days.has(weekdayOf(d))) out.push(d); }
  return out;
}

// The weeks of a month for the grid: [{ date: 'YYYY-MM-DD' | null }] with empty cells in front (Monday first)
export function monthCells(year, month0) {
  const first = `${year}-${pad(month0 + 1)}-01`;
  const cells = Array.from({ length: weekdayOf(first) - 1 }, () => ({ date: null }));
  const count = new Date(Date.UTC(year, month0 + 1, 0)).getUTCDate();
  for (let d = 1; d <= count; d += 1) cells.push({ date: `${year}-${pad(month0 + 1)}-${pad(d)}`, day: d });
  return cells;
}

export const dayMonthOf = (date) => `${date.slice(8, 10)}.${date.slice(5, 7)}`;
