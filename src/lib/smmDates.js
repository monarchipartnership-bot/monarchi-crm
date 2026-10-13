// Dates of the SMM content plan. Posts are scheduled on the Kyiv clock (the team's own), whatever the viewer's
// computer says, so a post planned for 18:00 reads 18:00 for everyone. Pure code.
import { kyivInstant, kyivParts } from './agentSchedule.js';

const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Нд'];
const MONTHS_GEN = ['січня', 'лютого', 'березня', 'квітня', 'травня', 'червня', 'липня', 'серпня', 'вересня', 'жовтня', 'листопада', 'грудня'];

export const addDaysYmd = (ymd, n) => { const d = new Date(`${ymd}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const weekdayIndex = (ymd) => (new Date(`${ymd}T12:00:00Z`).getUTCDay() + 6) % 7; // 0 = Monday

export const todayKyiv = () => kyivParts(new Date()).date;
export const mondayYmd = (ymd) => addDaysYmd(ymd, -weekdayIndex(ymd));
export const weekDays = (monday) => Array.from({ length: 7 }, (_, i) => addDaysYmd(monday, i));
export const nextMondayYmd = (today = todayKyiv()) => addDaysYmd(mondayYmd(today), 7);

export const kyivYmd = (iso) => (iso ? kyivParts(new Date(iso)).date : null);
export function kyivTime(iso) {
  if (!iso) return '';
  const m = kyivParts(new Date(iso)).minutes;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}
export const toIso = (ymd, time) => kyivInstant(ymd, time || '12:00').toISOString();

export const fmtDayShort = (ymd) => `${WEEKDAYS[weekdayIndex(ymd)]} ${ymd.slice(8, 10)}.${ymd.slice(5, 7)}`;
export const fmtDayLong = (ymd) => `${Number(ymd.slice(8, 10))} ${MONTHS_GEN[Number(ymd.slice(5, 7)) - 1]}`;
export const fmtWhen = (iso) => (iso ? `${fmtDayShort(kyivYmd(iso))}, ${kyivTime(iso)}` : 'Без дати');
export const fmtRange = (monday) => `${fmtDayLong(monday)} – ${fmtDayLong(addDaysYmd(monday, 6))}`;
