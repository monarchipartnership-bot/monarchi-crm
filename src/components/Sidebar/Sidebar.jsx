import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { MonoKnot } from '../Logo/Logo';
import { DEPTS } from './sidebarData';
import { useAgentReviewCount } from '../../lib/useAgentReviewCount';
import './Sidebar.css';

const COLLAPSED_KEY = 'monarchi.sidebar.collapsed';

// True if `pathname` is `base` or a path segment nested under it. "/" only
// ever matches itself — otherwise every page would count as being "on" home.
function pathMatches(pathname, base) {
  if (base === '/') return pathname === '/';
  return pathname === base || pathname.startsWith(base + '/');
}

// Exactly one item is active: the one whose route (or explicit activeMatch
// route) is the longest match for the current path. A plain prefix match
// lit up both "Projects" (/projects) and "Dashboard" (/projects/dashboard)
// on the dashboard page — the most specific route wins instead.
function pickActiveId(pathname) {
  let bestId = null;
  let bestLen = -1;
  for (const [dk, d] of Object.entries(DEPTS)) {
    for (const it of d.items) {
      for (const base of [it.to, ...(it.activeMatch || [])]) {
        if (pathMatches(pathname, base) && base.length > bestLen) {
          bestId = `${dk}:${it.key}`;
          bestLen = base.length;
        }
      }
    }
  }
  return bestId;
}

function readCollapsed() {
  try { return localStorage.getItem(COLLAPSED_KEY) === '1'; } catch { return false; }
}

export default function Sidebar({ mobileOpen, onCloseMobile }) {
  const { pathname } = useLocation();
  // The only "necessary link to the general CRM" the AI Agents section's
  // locked navigation model allows (docs/ai-agents-roadmap.md §1) — a
  // heads-up badge on its one sidebar entry, not a new page/route.
  const agentReviewCount = useAgentReviewCount();
  // Per-viewer layout preference — localStorage is enough, and the menu
  // still works if storage is unavailable. Only applies on desktop widths;
  // the mobile drawer is always the full menu (see Sidebar.css).
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const activeId = pickActiveId(pathname);

  function toggleCollapsed() {
    setCollapsed((c) => {
      const next = !c;
      try { localStorage.setItem(COLLAPSED_KEY, next ? '1' : '0'); } catch { /* preference only */ }
      return next;
    });
  }

  return (
    <aside className={'sidebar monarchi-sidebar' + (mobileOpen ? ' open' : '') + (collapsed ? ' is-collapsed' : '')}>
      <Link className="side-brand" to="/" onClick={onCloseMobile} aria-label="Monarchi Hub — головна">
        <MonoKnot className="side-brand-mark" aria-hidden="true" />
        <span className="side-brand-name">Monarchi <span className="side-brand-hub">Hub</span></span>
      </Link>

      <nav className="side-scroll" aria-label="Головне меню">
        {Object.entries(DEPTS).map(([dk, d]) => (
          <div className="side-group" key={dk}>
            <div className={'side-group-label' + (d.hideLabel ? ' sr-only' : '')}>{d.label.replace(' Department', '')}</div>
            {d.items.map((it) => {
              const isActive = activeId === `${dk}:${it.key}`;
              const showBadge = it.key === 'constellation' && agentReviewCount > 0;
              return (
                <Link
                  key={it.key}
                  className={'side-node' + (isActive ? ' active' : '')}
                  to={it.to}
                  onClick={onCloseMobile}
                  aria-current={isActive ? 'page' : undefined}
                  title={collapsed ? it.name : undefined}
                >
                  <img className="side-icon" src={it.icon} alt="" width="32" height="32" draggable="false" />
                  <span className="side-label">{it.name}</span>
                  {showBadge && (
                    <span className="side-node-badge">
                      <span aria-hidden="true">{agentReviewCount}</span>
                      <span className="sr-only">: {agentReviewCount} на перевірку</span>
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      <button
        type="button"
        className="side-collapse"
        onClick={toggleCollapsed}
        aria-expanded={!collapsed}
        aria-label={collapsed ? 'Розгорнути меню' : 'Згорнути меню'}
        title={collapsed ? 'Розгорнути меню' : 'Згорнути меню'}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m14 7-5 5 5 5" /></svg>
        <span className="side-collapse-text" aria-hidden="true">Згорнути</span>
      </button>
    </aside>
  );
}
