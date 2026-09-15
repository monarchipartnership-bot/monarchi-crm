// Horizontal "week 1 → week 2 → ..." progress timeline for Monthly Tasks.
// `weeks` = [{ index, label, pct, isCurrent }]. Color thresholds are a
// simple, consistent rule (the mockup's own example numbers weren't
// self-consistent, so exact cutoffs are a judgment call): >=70% green,
// 40-69% amber, <40% red.
function colorForPct(pct) {
  if (pct >= 70) return 'good';
  if (pct >= 40) return 'mid';
  return 'low';
}

export default function MonthProgressStepper({ weeks }) {
  return (
    <div className="month-stepper">
      {weeks.map((w) => (
        <div className="month-step" key={w.index}>
          <div className="month-step-head">
            <span className="month-step-dot" />
            <span className="month-step-label">
              Тиждень {w.index}
              {w.isCurrent && <span className="month-step-today" title="Поточний тиждень" />}
            </span>
          </div>
          <div className="month-step-range">{w.label}</div>
          <div className="month-step-bar">
            <div className={'month-step-bar-fill ' + colorForPct(w.pct)} style={{ width: `${w.pct}%` }} />
          </div>
          <div className="month-step-pct">{w.pct}%</div>
        </div>
      ))}
    </div>
  );
}
