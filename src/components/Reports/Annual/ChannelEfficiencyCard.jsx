import { pct } from '../../../lib/weeklyLogic';
import { outreachId, leadsId, callsId, qualifiedId, isOrganicChannel } from '../../../lib/annualLogic';
import { CHANNEL_ICONS } from '../../../lib/reportIcons';

// Compact at-a-glance card for one channel — Cover Letters/Всього
// відповідей/Конверсія/Calls/Qualified Leads, sitting above the full
// metric/ratio breakdown MonthlyChannelBlock already renders lower on the
// page. Organic channels (Invites/DM/Consultations/Project Catalog) never
// send outreach — no Cover Letters equivalent — so that stat (and the
// Конверсія built on it) is dropped for them rather than shown as 0/—.
export default function ChannelEfficiencyCard({ channel, sums }) {
  const hasOutreach = !isOrganicChannel(channel);
  const coverLetters = sums[outreachId(channel)] || 0;
  const responses = sums[leadsId(channel)] || 0;
  const calls = sums[callsId(channel)] || 0;
  const qualified = sums[qualifiedId(channel)] || 0;
  const conversion = hasOutreach ? pct(responses, coverLetters) : null;

  return (
    <div className="eff-channel-card">
      <div className="eff-channel-head">
        <span className="eff-channel-icon" dangerouslySetInnerHTML={{ __html: CHANNEL_ICONS[channel.key] || '' }} />
        <div className="eff-channel-title">{channel.title}</div>
      </div>
      <div className="eff-channel-stats">
        {hasOutreach && (
          <div className="eff-channel-stat">
            <div className="eff-channel-stat-value">{coverLetters}</div>
            <div className="eff-channel-stat-label">Cover Letters</div>
          </div>
        )}
        <div className="eff-channel-stat">
          <div className="eff-channel-stat-value">{responses}</div>
          <div className="eff-channel-stat-label">Всього відповідей</div>
        </div>
        <div className="eff-channel-stat">
          <div className="eff-channel-stat-value hl">{conversion === null ? '—' : conversion.toFixed(1) + '%'}</div>
          <div className="eff-channel-stat-label">Конверсія</div>
        </div>
        <div className="eff-channel-stat">
          <div className="eff-channel-stat-value">{calls}</div>
          <div className="eff-channel-stat-label">Calls</div>
        </div>
        <div className="eff-channel-stat">
          <div className="eff-channel-stat-value">{qualified}</div>
          <div className="eff-channel-stat-label">Qualified Leads</div>
        </div>
      </div>
    </div>
  );
}
