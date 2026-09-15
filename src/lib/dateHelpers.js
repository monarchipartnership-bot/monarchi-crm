export const MONTH_NAMES = [
  'Січень', 'Лютий', 'Березень', 'Квітень', 'Травень', 'Червень',
  'Липень', 'Серпень', 'Вересень', 'Жовтень', 'Листопад', 'Грудень',
];

export function pad2(n) {
  return n < 10 ? '0' + n : '' + n;
}

export function daysInMonth(y, m) {
  return new Date(y, m, 0).getDate();
}

export function isoDate(y, m, d) {
  return `${y}-${pad2(m)}-${pad2(d)}`;
}

export function fmtDate(y, m, d) {
  return `${pad2(d)}.${pad2(m)}.${y}`;
}

// Years available in the period pickers: last year, this year, next year.
export function yearOptions() {
  const curY = new Date().getFullYear();
  const years = [];
  for (let y = curY - 1; y <= curY + 1; y++) years.push(y);
  return years;
}

// Default day to preselect when a year/month is picked: today's day if the
// period is the current month, otherwise the 1st.
export function defaultDayFor(y, m) {
  const now = new Date();
  return y === now.getFullYear() && m === now.getMonth() + 1 ? now.getDate() : 1;
}

export function fmtDY(d) {
  return `${pad2(d.getDate())}.${pad2(d.getMonth() + 1)}.${String(d.getFullYear()).slice(-2)}`;
}

// Monday-start calendar weeks intersected with the month's boundaries.
// Index restarts at 1 every month (not global ISO week numbers); the first
// and last week of the month can be partial.
export function computeWeeksForMonth(year, month) {
  const first = new Date(year, month - 1, 1);
  const last = new Date(year, month, 0);
  const weeks = [];
  let cursor = new Date(first);
  while (cursor <= last) {
    const dow = cursor.getDay();
    const mondayOffset = dow === 0 ? -6 : 1 - dow;
    const weekMonday = new Date(cursor);
    weekMonday.setDate(cursor.getDate() + mondayOffset);
    const weekSunday = new Date(weekMonday);
    weekSunday.setDate(weekMonday.getDate() + 6);
    const start = weekMonday < first ? new Date(first) : weekMonday;
    const end = weekSunday > last ? new Date(last) : weekSunday;
    weeks.push({ start, end });
    cursor = new Date(end);
    cursor.setDate(cursor.getDate() + 1);
  }
  return weeks.map((w, i) => ({ index: i + 1, start: w.start, end: w.end }));
}

// The week (from computeWeeksForMonth) that today falls into, or the first
// week if today isn't in this month.
export function defaultWeekIndexFor(weeks) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const hit = weeks.find((w) => today >= w.start && today <= w.end);
  return hit ? hit.index : 1;
}

// The Monday of the real calendar week containing `dateLike` (a Date or
// ISO date string) — independent of any month, unlike computeWeeksForMonth
// which clips weeks at month boundaries. Used to compare "which week is
// this date in" for task status coloring (a week can straddle two months).
export function mondayOf(dateLike) {
  const d = new Date(dateLike);
  d.setHours(0, 0, 0, 0);
  const dow = d.getDay();
  d.setDate(d.getDate() + (dow === 0 ? -6 : 1 - dow));
  return d;
}

// Monday-start week [start,end] (as ISO date strings) containing `dateLike`.
export function isoWeekRange(dateLike) {
  const start = mondayOf(dateLike);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return {
    start: isoDate(start.getFullYear(), start.getMonth() + 1, start.getDate()),
    end: isoDate(end.getFullYear(), end.getMonth() + 1, end.getDate()),
  };
}

export function todayIso() {
  const d = new Date();
  return isoDate(d.getFullYear(), d.getMonth() + 1, d.getDate());
}

// `dateLike` shifted by `days` (may be negative), as an ISO date string.
export function addDaysIso(dateLike, days) {
  const d = new Date(dateLike);
  d.setDate(d.getDate() + days);
  return isoDate(d.getFullYear(), d.getMonth() + 1, d.getDate());
}
