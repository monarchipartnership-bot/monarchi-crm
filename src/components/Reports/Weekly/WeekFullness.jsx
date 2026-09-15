import { Fragment } from 'react';
import { computeWeeksForMonth } from '../../../lib/dateHelpers';
import { DUE_STATUS_ICONS } from '../../../lib/dueStatusIcons';

// "Заповненість місяця (по тижнях)" — a circle stepper (one node per week of
// the month) connected by a line, plus an overall completion stat on the
// right. A week's completion credit is 1 if saved, a fraction of days
// elapsed/7 if it's the currently-viewed (in-progress) week, else 0.
export default function WeekFullness({ year, month, currentWeekIndex, savedWeekIndexes, onSelectWeek }) {
  const weeks = computeWeeksForMonth(year, month);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const steps = weeks.map((w) => {
    const done = savedWeekIndexes.has(w.index);
    const isCurrent = w.index === currentWeekIndex;
    let credit = 0;
    if (done) {
      credit = 1;
    } else if (isCurrent) {
      const start = new Date(w.start);
      start.setHours(0, 0, 0, 0);
      const elapsedDays = Math.min(7, Math.max(0, Math.floor((today - start) / 86400000) + 1));
      credit = elapsedDays / 7;
    }
    return { ...w, done, isCurrent, credit };
  });
  const creditSum = steps.reduce((s, w) => s + w.credit, 0);
  const donePct = weeks.length ? Math.round((creditSum / weeks.length) * 100) : 0;

  return (
    <div className="fullness">
      <div className="mf-title">Заповненість місяця (по тижнях)</div>
      <div className="wk-stepper-row">
        <div className="wk-stepper">
          {steps.map((w, i) => (
            <Fragment key={w.index}>
              <div className="wk-step">
                <button
                  type="button"
                  className={'wk-step-dot' + (w.done ? ' done' : '') + (w.isCurrent ? ' cur' : '')}
                  title={`Тиждень ${w.index}`}
                  onClick={() => onSelectWeek(w.index)}
                >
                  {w.done ? <span dangerouslySetInnerHTML={{ __html: DUE_STATUS_ICONS.done }} /> : w.index}
                </button>
                <span className="wk-step-label">Тиждень {w.index}</span>
              </div>
              {i < steps.length - 1 && <span className={'wk-step-line' + (w.done ? ' done' : '')} />}
            </Fragment>
          ))}
        </div>
        <div className="wk-stepper-side">
          <div className="wk-stepper-count">{creditSum.toFixed(1)} / {weeks.length} тижні</div>
          <div className="wk-stepper-pct">{donePct}% виконано</div>
          <div className="wk-stepper-bar"><div className="wk-stepper-bar-fill" style={{ width: donePct + '%' }} /></div>
        </div>
      </div>
    </div>
  );
}
