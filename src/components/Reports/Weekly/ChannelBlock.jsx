import { MetricKCard, RatioKCard } from './KCard';
import { CHANNEL_ICONS } from '../../../lib/reportIcons';
import AutoDealStats from '../AutoDealStats';

export default function ChannelBlock({ channel, fields, onChange, readOnly, historyForMetric, historyForRatio, leadCount, autoStats }) {
  return (
    <div className="chbox-unified">
      <div className="chbox-title">
        <span className="chbox-icon" dangerouslySetInnerHTML={{ __html: CHANNEL_ICONS[channel.key] }} />
        {channel.title}
        {typeof leadCount === 'number' && (
          <span className="chbox-leads" title="Унікальні ліди з Upwork у «Клієнтах» цього звіту, обрані з цим каналом">Лідів у звіті: {leadCount}</span>
        )}
      </div>
      {autoStats && <AutoDealStats autoStats={autoStats} fields={fields} channel={channel} period="тиждень" />}
      <div className="kcard-row-label">Показники</div>
      <div className="kcard-row">
        {channel.metrics.map((m) => {
          const h = historyForMetric?.(m.id);
          return (
            <MetricKCard key={m.id} metric={m} fields={fields} onChange={onChange} readOnly={readOnly} history={h?.values} delta={h?.delta} />
          );
        })}
      </div>
      <div className="kcard-row-label">Конверсія</div>
      <div className="kcard-row">
        {channel.ratios.map((r) => {
          const h = historyForRatio?.(r);
          return (
            <RatioKCard key={r.key} ratio={r} fields={fields} onChange={onChange} readOnly={readOnly} history={h?.values} delta={h?.delta} />
          );
        })}
      </div>
    </div>
  );
}
