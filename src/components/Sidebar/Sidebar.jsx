import { Link, NavLink, useLocation } from 'react-router-dom';
import { WordmarkWhite } from '../Logo/Logo';
import { DEPTS } from './sidebarData';
import './Sidebar.css';

function Icon({ svg }) {
  return <span className="side-ic-box" dangerouslySetInnerHTML={{ __html: svg }} />;
}

// True if `pathname` is `base` or a path segment nested under it.
function pathMatches(pathname, base) {
  return pathname === base || pathname.startsWith(base + '/');
}

export default function Sidebar({ mobileOpen, onCloseMobile, onIntroLink }) {
  const { pathname } = useLocation();

  return (
    <aside className={'sidebar' + (mobileOpen ? ' open' : '')}>
      <Link className="side-brand" to="/" onClick={onCloseMobile}>
        <WordmarkWhite className="side-wordmark" />
        <span className="side-crm-tag">CRM</span>
      </Link>

      <nav className="side-scroll">
        {Object.entries(DEPTS).map(([dk, d]) => (
          <div className="side-group" key={dk}>
            <div className="side-group-label">{d.label.replace(' Department', '')}</div>
            {!d.items.length && <div className="side-soon">Незабаром</div>}
            {d.items.map((it) => {
              const extraActive = it.activeMatch?.some((p) => pathMatches(pathname, p));
              if (it.introTransition) {
                return (
                  <button
                    key={it.key}
                    type="button"
                    className={'side-node' + (pathMatches(pathname, it.to) || extraActive ? ' active' : '')}
                    onClick={() => { onCloseMobile?.(); onIntroLink?.(it.to); }}
                  >
                    <Icon svg={it.icon} />
                    {it.name}
                  </button>
                );
              }
              return (
                <NavLink
                  key={it.key}
                  className={({ isActive }) => 'side-node' + (isActive || extraActive ? ' active' : '')}
                  to={it.to}
                  onClick={onCloseMobile}
                >
                  <Icon svg={it.icon} />
                  {it.name}
                </NavLink>
              );
            })}
          </div>
        ))}
      </nav>
    </aside>
  );
}
