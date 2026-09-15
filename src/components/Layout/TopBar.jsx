import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { ROUTE_META, DYNAMIC_ROUTE_META } from '../../routes/routeMeta';
import { FIELD_ICONS } from '../../lib/taskFieldIcons';
import NotificationBell from '../Sidebar/NotificationBell';
import './TopBar.css';

function pageMeta(pathname) {
  const dynamicMatch = DYNAMIC_ROUTE_META.find((r) => r.test(pathname));
  const meta = ROUTE_META[pathname] ?? dynamicMatch;
  const trail = meta?.trail ?? [];
  const title = meta?.title || trail[trail.length - 1]?.label || 'Monarchi CRM';
  return { title, desc: meta?.desc, icon: meta?.icon };
}

export default function TopBar() {
  const { email, signOut } = useAuth();
  const { pathname } = useLocation();
  const [infoOpen, setInfoOpen] = useState(false);
  const infoRef = useRef(null);
  const { title, desc, icon } = pageMeta(pathname);

  useEffect(() => { setInfoOpen(false); }, [pathname]);

  useEffect(() => {
    if (!infoOpen) return;
    function handleClickOutside(e) {
      if (infoRef.current && !infoRef.current.contains(e.target)) setInfoOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [infoOpen]);

  return (
    <div className="topbar">
      <div className="topbar-heading">
        {icon && <span className="topbar-icon" dangerouslySetInnerHTML={{ __html: icon }} />}
        <h1 className="topbar-title">{title}</h1>
        {desc && (
          <div className="topbar-info-wrap" ref={infoRef}>
            <button type="button" className="topbar-info-btn" aria-label="Про розділ" onClick={() => setInfoOpen((o) => !o)}>i</button>
            {infoOpen && (
              <div className="topbar-info-card">
                <p>{desc}</p>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="topbar-search">
        <span dangerouslySetInnerHTML={{ __html: FIELD_ICONS.search }} />
        <input type="text" placeholder="Пошук по CRM — скоро" disabled />
      </div>

      <div className="topbar-actions">
        <NotificationBell />
        <div className="topbar-account">
          <Link className="topbar-avatar" to="/account" title="Мій кабінет">
            <span dangerouslySetInnerHTML={{ __html: FIELD_ICONS.user }} />
          </Link>
          <div className="topbar-user">
            <Link className="topbar-user-name" to="/account">{email ?? 'user@monarchi.agency'}</Link>
            <button type="button" onClick={signOut}>Вийти</button>
          </div>
        </div>
      </div>
    </div>
  );
}
