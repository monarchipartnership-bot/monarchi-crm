// The fill of a month by weeks (the side panel of the Daily Report): a week is a step. Working days are Monday to Friday; a day that is not in the future and has no saved report is missed.
//   savedDays: Set of day numbers that have a report   today: a Date (any time of day)
// → [{ n, from, to, due, done, status }] with the status:
//   'future' nothing is due yet   'over' a day before today is missed   'on' the week with today, nothing missed so far   'ok' every due day of a past week is done
export function monthWeekSteps({ year, month, savedDays, today }) {
  const dim = new Date(year, month, 0).getDate();
  const t = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const weeks = [];
  let cur = null;
  for (let d = 1; d <= dim; d += 1) {
    const dt = new Date(year, month - 1, d);
    const dow = dt.getDay(); // 0 = Sunday
    if (!cur || dow === 1) { cur = { n: weeks.length + 1, from: d, to: d, days: [] }; weeks.push(cur); }
    cur.to = d;
    if (dow >= 1 && dow <= 5) cur.days.push({ d, time: dt.getTime() });
  }
  return weeks
    .filter((w) => w.days.length > 0)
    .map((w, i) => {
      const due = w.days.filter((x) => x.time <= t);
      const done = due.filter((x) => savedDays.has(x.d)).length;
      const missedBefore = due.some((x) => x.time < t && !savedDays.has(x.d));
      const hasToday = w.days.some((x) => x.time === t) || (due.length > 0 && due.length < w.days.length);
      const left = w.days.length - due.length; // working days still ahead
      let status;
      if (!due.length) status = 'future';
      else if (missedBefore) status = 'over';
      else if (left > 0 || hasToday) status = left > 0 ? 'on' : done === due.length ? 'ok' : 'on';
      else status = done === due.length ? 'ok' : 'over';
      return { n: i + 1, from: w.from, to: w.to, due: due.length, done, total: w.days.length, status };
    });
}
