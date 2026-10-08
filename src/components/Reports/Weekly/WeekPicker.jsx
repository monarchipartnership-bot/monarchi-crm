import { MONTH_NAMES, computeWeeksForMonth, fmtDate, yearOptions } from '../../../lib/dateHelpers';
import Select from '../../common/Select';

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
        <Select value={year} onChange={(v) => onChange({ year: v, month, weekIndex })} ariaLabel="Рік" options={yearList.map((y) => ({ value: y, label: String(y) }))} />
      </div>
      <div className="pk-field">
        <label>Місяць</label>
        <Select value={month} onChange={(v) => onChange({ year, month: v, weekIndex })} ariaLabel="Місяць" options={MONTH_NAMES.map((name, i) => ({ value: i + 1, label: name }))} />
      </div>
      <div className="pk-field">
        <label>Тиждень</label>
        <Select value={weekIndex} onChange={(v) => onChange({ year, month, weekIndex: v })} ariaLabel="Тиждень"
          options={weeks.map((w) => ({ value: w.index, label: `Тиждень ${w.index} (${fmtDate(w.start.getFullYear(), w.start.getMonth() + 1, w.start.getDate())}–${fmtDate(w.end.getFullYear(), w.end.getMonth() + 1, w.end.getDate())})` }))} />
      </div>
      {extra && <div className="pk-sp" />}
      {extra}
    </div>
  );
}
