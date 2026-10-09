import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { ROUTE_META, DYNAMIC_ROUTE_META } from '../../routes/routeMeta';
import { FIELD_ICONS } from '../../lib/taskFieldIcons';
import { profileLabel } from '../../lib/api/profile';
import NotificationBell from '../Sidebar/NotificationBell';
import ActionIcon from '../common/ActionIcon';
import './TopBar.css';

function pageMeta(pathname) {
  const dynamicMatch = DYNAMIC_ROUTE_META.find((r) => r.test(pathname));
  const meta = ROUTE_META[pathname] ?? dynamicMatch;
  const trail = meta?.trail ?? [];
  const title = meta?.title || trail[trail.length - 1]?.label || 'Monarchi CRM';
  return { title, desc: meta?.desc, icon: meta?.icon, pageIcon: meta?.pageIcon, infoLabel: meta?.infoLabel };
}

export default function TopBar() {
  const { email, signOut, profile } = useAuth();
  const { pathname } = useLocation();
  const [infoOpen, setInfoOpen] = useState(false);
  const infoRef = useRef(null);
  const { title, desc, icon, pageIcon, infoLabel } = pageMeta(pathname);

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
        {pageIcon
          ? <img className="topbar-page-icon" src={pageIcon} alt="" width="32" height="32" draggable="false" />
          : icon && <span className="topbar-icon" dangerouslySetInnerHTML={{ __html: icon }} />}
        <h1 className={'topbar-title' + (pageIcon ? ' topbar-title--page' : '')}>{title}</h1>
        {desc && (
          <div className="topbar-info-wrap" ref={infoRef}>
            {infoLabel ? (
              <button type="button" className="topbar-info-btn topbar-info-btn--labeled" aria-label="Про розділ" aria-expanded={infoOpen} onClick={() => setInfoOpen((o) => !o)}>
                <ActionIcon name="info" size={18} />
                <span className="topbar-info-label">{infoLabel}</span>
              </button>
            ) : (
              <button type="button" className="topbar-info-btn" aria-label="Про розділ" onClick={() => setInfoOpen((o) => !o)}>i</button>
            )}
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

      {/* A page may put its own compact controls here (React portal), e.g. Daily Report's manager / save state / exports. Empty everywhere else. */}
      <div className="topbar-slot" id="topbar-slot" />

      <div className="topbar-actions">
        <NotificationBell />
        <div className="topbar-account">
          <Link className="topbar-avatar" to="/account" title="Мій кабінет">
            {profile?.photo ? <img src={profile.photo} alt="" /> : <span dangerouslySetInnerHTML={{ __html: FIELD_ICONS.user }} />}
          </Link>
          <div className="topbar-user">
            <Link className="topbar-user-name" to="/account">{profile ? profileLabel(profile) : (email ?? 'user@monarchi.agency')}</Link>
            <button type="button" onClick={signOut}>Вийти</button>
          </div>
        </div>
      </div>
    </div>
  );
}
