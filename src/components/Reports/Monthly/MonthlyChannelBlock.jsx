import { MetricKCard, RatioKCard } from '../Weekly/KCard';
import { CHANNEL_ICONS } from '../../../lib/reportIcons';

// Monthly's cards are pure rollups (no live input — sums is a plain id→number
// map, same shape as Weekly's own `fields`) but otherwise render through the
// exact same MetricKCard/RatioKCard Weekly uses, in readOnly mode: icon,
// big value, inline % of plan, "План" line (now a real sum of everyone's
// weekly plan entries this month — see lib/monthlyLogic.js), slim
// achievement bar. No sparkline/history this pass (no prior-month data yet).
export default function MonthlyChannelBlock({ channel, sums }) {
  return (
    <div className="chbox-unified">
      <div className="chbox-title">
        <span className="chbox-icon" dangerouslySetInnerHTML={{ __html: CHANNEL_ICONS[channel.key] }} />
        {channel.title}
      </div>
      <div className="kcard-row-label">Показники</div>
      <div className="kcard-row">
        {channel.metrics.map((m) => (
          <MetricKCard key={m.id} metric={m} fields={sums} readOnly />
        ))}
      </div>
      <div className="kcard-row-label">Конверсія</div>
      <div className="kcard-row">
        {channel.ratios.map((r) => (
          <RatioKCard key={r.key} ratio={r} fields={sums} readOnly />
        ))}
      </div>
    </div>
  );
}
