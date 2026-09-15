import { achievement, fp, pct, toNum } from '../../../lib/weeklyLogic';
import { metricIcon } from '../../../lib/reportIcons';
import Sparkline from '../../Automation/Sparkline';
import DeltaBadge from '../../Automation/DeltaBadge';

// One metric or ratio card in a channel's unified block — a big editable
// Факт value with the % of plan achieved shown inline beside it, a small
// "План" line underneath (plan is mostly set once via a preset, not typed
// every week, so it stays visually secondary), a slim achievement bar, and
// (once ≥2 weeks of history exist) a trend sparkline + delta caption.
// `history`/`delta` are omitted entirely on the read-only History view.
export function MetricKCard({ metric, fields, onChange, readOnly, history, delta }) {
  const actual = toNum(fields[metric.id]);
  const plan = toNum(fields[metric.pp]);
  const ach = achievement(fields[metric.id] === undefined || fields[metric.id] === '' ? null : actual, plan);

  return (
    <div className="kcard">
      <div className="kcard-label">
        <span className="kcard-icon" dangerouslySetInnerHTML={{ __html: metricIcon(metric.label) }} />
        {metric.label}
      </div>
      <div className="kcard-main">
        {readOnly ? (
          <div className="kcard-value">{fields[metric.id] || '0'}</div>
        ) : (
          <input type="number" className="kcard-value-input" value={fields[metric.id] ?? ''} placeholder="0" onChange={(e) => onChange(metric.id, e.target.value)} />
        )}
        <span className="kcard-pct-inline" style={{ color: ach.color }}>{ach.text}</span>
      </div>
      <div className="kcard-plan-line">
        План {readOnly ? (
          <b>{fields[metric.pp] || '0'}</b>
        ) : (
          <input type="number" className="kcard-plan-input" value={fields[metric.pp] ?? ''} placeholder="0" onChange={(e) => onChange(metric.pp, e.target.value)} />
        )}
      </div>
      <div className="kcard-bar"><div className="kcard-bar-fill" style={{ width: ach.barPct + '%', background: ach.color }} /></div>
      {history && history.length >= 2 && (
        <div className="kcard-trend">
          <Sparkline values={history} color="var(--purple)" />
          <div className="kcard-trend-caption">vs мин. тиждень <DeltaBadge diff={delta} /></div>
        </div>
      )}
    </div>
  );
}

export function RatioKCard({ ratio, fields, onChange, readOnly, history, delta }) {
  const factPct = pct(toNum(fields[ratio.num]), toNum(fields[ratio.den]));
  const plan = toNum(fields[ratio.pp]);
  const ach = achievement(factPct, plan);

  return (
    <div className="kcard">
      <div className="kcard-label">
        <span className="kcard-icon" dangerouslySetInnerHTML={{ __html: metricIcon(ratio.label) }} />
        {ratio.label}
      </div>
      <div className="kcard-main">
        <div className="kcard-value">{fp(factPct)}</div>
        <span className="kcard-pct-inline" style={{ color: ach.color }}>{ach.text}</span>
      </div>
      <div className="kcard-plan-line">
        План {readOnly ? (
          <b>{Math.round(plan)}%</b>
        ) : (
          <input type="number" className="kcard-plan-input" value={fields[ratio.pp] ?? ''} placeholder="0" onChange={(e) => onChange(ratio.pp, e.target.value)} />
        )}
      </div>
      <div className="kcard-bar"><div className="kcard-bar-fill" style={{ width: ach.barPct + '%', background: ach.color }} /></div>
      {history && history.length >= 2 && (
        <div className="kcard-trend">
          <Sparkline values={history} color="var(--purple)" />
          <div className="kcard-trend-caption">vs мин. тиждень <DeltaBadge diff={delta} suffix="%" /></div>
        </div>
      )}
    </div>
  );
}
