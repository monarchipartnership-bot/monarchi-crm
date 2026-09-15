import { MONTH_NAMES, computeWeeksForMonth, fmtDate, yearOptions } from '../../../lib/dateHelpers';

// Year / Month / Week select trio. Weeks are Monday-start calendar weeks
// clipped to the month, numbered 1..N within that month (see
// computeWeeksForMonth) — matching the legacy Weekly Report picker.
export default function WeekPicker({ year, month, weekIndex, onChange, extra, years }) {
  const weeks = computeWeeksForMonth(year, month);
  const yearList = years ?? yearOptions();

  return (
    <div className="picker">
      <div className="pk-field">
        <label>Рік</label>
        <select value={year} onChange={(e) => onChange({ year: +e.target.value, month, weekIndex })}>
          {yearList.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>
      <div className="pk-field">
        <label>Місяць</label>
        <select value={month} onChange={(e) => onChange({ year, month: +e.target.value, weekIndex })}>
          {MONTH_NAMES.map((name, i) => <option key={name} value={i + 1}>{name}</option>)}
        </select>
      </div>
      <div className="pk-field">
        <label>Тиждень</label>
        <select value={weekIndex} onChange={(e) => onChange({ year, month, weekIndex: +e.target.value })}>
          {weeks.map((w) => (
            <option key={w.index} value={w.index}>
              Тиждень {w.index} ({fmtDate(w.start.getFullYear(), w.start.getMonth() + 1, w.start.getDate())}–{fmtDate(w.end.getFullYear(), w.end.getMonth() + 1, w.end.getDate())})
            </option>
          ))}
        </select>
      </div>
      {extra && <div className="pk-sp" />}
      {extra}
    </div>
  );
}
