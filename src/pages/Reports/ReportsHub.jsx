import HubCard from '../../components/Reports/HubCard';
import { SECTION_ICONS, CHANNEL_ICONS } from '../../lib/reportIcons';
import { IC, iconOnly } from '../../components/Sidebar/icons';
import '../../styles/reportPage.css';
import '../../styles/hubPage.css';

export default function ReportsHub() {
  return (
    <div className="report-page">
      <section className="rpt-hero">
        <div className="rpt-hero-heading">
          <span className="rpt-hero-icon" dangerouslySetInnerHTML={{ __html: SECTION_ICONS['Місяці'] }} />
          <h1>Reports Manager</h1>
        </div>
        <p className="sub">Оберіть тип звіту.</p>
      </section>

      <div className="hub-grid">
        <HubCard icon={CHANNEL_ICONS.con} title="Daily Report" desc="Log today's work, clients touched, and tomorrow's plan." to="/reports/daily" />
        <HubCard icon={SECTION_ICONS['Тренди за місяцями']} title="Weekly Report" desc="Build the team's weekly performance report." to="/reports/weekly" />
        <HubCard icon={SECTION_ICONS['Місяці']} title="Monthly Report" desc="Monthly results & summary analytics across all weeks." to="/reports/monthly" />
        <HubCard icon={SECTION_ICONS['Річні підсумки']} title="Annual Report" desc="Full-year results & summary analytics across all months." to="/reports/annual" />
        <HubCard icon={iconOnly(IC.compare)} title="Compare" desc="Compare saved Weekly or Monthly reports side by side." to="/reports/compare" />
      </div>
    </div>
  );
}
