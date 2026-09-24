import { useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { WordmarkWhite } from '../Logo/Logo';
import { DEPTS } from './sidebarData';
import './Sidebar.css';

function Icon({ svg }) {
  return <span className="side-ic-box" dangerouslySetInnerHTML={{ __html: svg }} />;
}

// "AI Agents" — the CRM->AI transition's trigger. First visual beat of the
// transition (scale 1->0.96->1, crm-to-ai spec phase 1) plays right here,
// independent of the shared transition timeline, since it just needs to
// react to this one click rather than stay in lockstep with anything else.
function TransitionTriggerNode({ active, icon, name, onTrigger }) {
  const [pulsing, setPulsing] = useState(false);

  function handleClick(e) {
    setPulsing(true);
    setTimeout(() => setPulsing(false), 200);
    onTrigger(e.currentTarget);
  }

  return (
    <button
      type="button"
      className={'side-node' + (active ? ' active' : '') + (pulsing ? ' trigger-pulse' : '')}
      onClick={handleClick}
    >
      <Icon svg={icon} />
      {name}
    </button>
  );
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
                  <TransitionTriggerNode
                    key={it.key}
                    active={pathMatches(pathname, it.to) || extraActive}
                    icon={it.icon}
                    name={it.name}
                    onTrigger={(el) => { onCloseMobile?.(); onIntroLink?.(it.to, el); }}
                  />
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
