import { Link, useLocation } from 'react-router-dom';
import { SECTION_ICONS, CHANNEL_ICONS } from '../../lib/reportIcons';

// Compare's own icon (mirrors Sidebar/icons.js's IC.compare shape) without
// its fixed inline color — this badge needs the icon to read as plain
// white on top of its own gradient, same as every other "our style" badge.
const COMPARE_ICON = '<svg viewBox="0 0 24 24"><path d="M7 7h11"/><path d="m15 4 3 3-3 3"/><path d="M17 17H6"/><path d="m9 14-3 3 3 3"/></svg>';

// Same 5 gradient pairs as DealDetailModal.jsx's SectionHead sections —
// reused rather than inventing a new palette, one distinct color per report
// type so the row reads at a glance.
const REPORT_TYPES = [
  { key: 'daily', label: 'Daily Report', to: '/reports/daily', icon: CHANNEL_ICONS.con, gradient: 'linear-gradient(135deg, #A78BFA, #7C3AED)' },
  { key: 'weekly', label: 'Weekly Report', to: '/reports/weekly', icon: SECTION_ICONS['Тренди за місяцями'], gradient: 'linear-gradient(135deg, #60A5FA, #2563EB)' },
  { key: 'monthly', label: 'Monthly Report', to: '/reports/monthly', icon: SECTION_ICONS['Місяці'], gradient: 'linear-gradient(135deg, #2DD4BF, #0D9488)' },
  { key: 'annual', label: 'Annual Report', to: '/reports/annual', icon: SECTION_ICONS['Річні підсумки'], gradient: 'linear-gradient(135deg, #F472B6, #DB2777)' },
  { key: 'compare', label: 'Compare', to: '/reports/compare', icon: COMPARE_ICON, gradient: 'linear-gradient(135deg, #94A3B8, #475569)' },
];

// Pinned above every report page's own hero — Daily Report now doubles as
// the section's landing page (was a separate ReportsHub.jsx grid before),
// so switching report type has to stay reachable from wherever you land.
export default function ReportTypeSwitcher() {
  const { pathname } = useLocation();
  return (
    <div className="report-type-switcher">
      {REPORT_TYPES.map((r) => (
        <Link key={r.key} to={r.to} className={'report-type-card' + (pathname === r.to ? ' active' : '')}>
          <span className="report-type-card-icon" style={{ background: r.gradient }} dangerouslySetInnerHTML={{ __html: r.icon }} />
          <span className="report-type-card-label">{r.label}</span>
        </Link>
      ))}
    </div>
  );
}
