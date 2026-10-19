import { NavLink, Outlet } from 'react-router-dom';
import '../../styles/settingsLayout.css';

// «Налаштування» (the gear in the top bar): everything that is set up once and then rarely touched lives here, apart from the working
// pages of the side menu. A new settings page = one more entry in SECTIONS + one route under /settings in App.jsx.
const SECTIONS = [
  { to: '/settings/account', label: 'Мій кабінет', hint: 'Профіль, відпустки, погодження' },
  { to: '/settings/site-leads', label: 'Заявки з сайту', hint: 'Форма сайту, Telegram, журнал' },
];

export default function SettingsLayout() {
  return (
    <div className="settings-shell">
      <nav className="settings-nav" aria-label="Розділи налаштувань">
        {SECTIONS.map((s) => (
          <NavLink key={s.to} to={s.to} className={({ isActive }) => 'settings-tab' + (isActive ? ' is-active' : '')}>
            <span className="settings-tab-label">{s.label}</span>
            <span className="settings-tab-hint">{s.hint}</span>
          </NavLink>
        ))}
      </nav>
      <div className="settings-body"><Outlet /></div>
    </div>
  );
}
