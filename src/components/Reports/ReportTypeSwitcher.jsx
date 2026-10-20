import { Link, useLocation } from 'react-router-dom';
import { SI } from '../Sidebar/sidebarIcons';

// The report-type list of the Reports Manager in Hub style: the approved centered list of ring medallions
// (3D page icon in the ring, plum capsule on the current one). Pinned above every report page; Daily Report is
// the section's landing page, so switching type has to stay reachable from wherever you land.
const REPORT_TYPES = [
  { key: 'daily', label: 'Daily Report', to: '/reports/daily', img: SI.dailyReport },
  { key: 'weekly', label: 'Weekly Report', to: '/reports/weekly', img: SI.weeklyReport },
  { key: 'monthly', label: 'Monthly Report', to: '/reports/monthly', img: SI.monthlyReport },
  { key: 'annual', label: 'Annual Report', to: '/reports/annual', img: SI.reportsManager },
  { key: 'compare', label: 'Compare', to: '/reports/compare', img: null },
];

export default function ReportTypeSwitcher() {
  const { pathname } = useLocation();
  return (
    <nav className="report-type-switcher rpt-switch" aria-label="Тип звіту">
      {REPORT_TYPES.map((r) => (
        <Link key={r.key} to={r.to} className={'report-type-card rpt-sw' + (pathname === r.to ? ' active' : '')} aria-current={pathname === r.to ? 'page' : undefined}>
          <span className="hub-ring">
            {r.img
              ? <span className="hub-tile"><img src={r.img} alt="" draggable="false" /></span>
              : <span className="hub-tile hub-tile--ln"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7h11" /><path d="m15 4 3 3-3 3" /><path d="M17 17H6" /><path d="m9 14-3 3 3 3" /></svg></span>}
          </span>
          <span className="report-type-card-label">{r.label}</span>
        </Link>
      ))}
    </nav>
  );
}
