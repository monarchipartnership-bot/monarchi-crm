import { MONTH_NAMES, daysInMonth, yearOptions } from '../../lib/dateHelpers';

// Year / Month / Day select trio, shared by the Daily Report create & history pages.
export default function DayPicker({ year, month, day, onChange, extra, years }) {
  const dim = daysInMonth(year, month);
  const days = Array.from({ length: dim }, (_, i) => i + 1);
  const yearList = years ?? yearOptions();

  return (
    <div className="picker">
      <div className="pk-field">
        <label>Рік</label>
        <select value={year} onChange={(e) => onChange({ year: +e.target.value, month, day })}>
          {yearList.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>
      <div className="pk-field">
        <label>Місяць</label>
        <select value={month} onChange={(e) => onChange({ year, month: +e.target.value, day })}>
          {MONTH_NAMES.map((name, i) => <option key={name} value={i + 1}>{name}</option>)}
        </select>
      </div>
      <div className="pk-field">
        <label>День</label>
        <select value={day} onChange={(e) => onChange({ year, month, day: +e.target.value })}>
          {days.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
      </div>
      {extra && <div className="pk-sp" />}
      {extra}
    </div>
  );
}
