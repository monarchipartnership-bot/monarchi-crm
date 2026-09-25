import { useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Sidebar from '../Sidebar/Sidebar';
import TopBar from './TopBar';
import CrackTransition from '../CrackTransition/CrackTransition';
import './Layout.css';

// Routes that take over the full viewport — sidebar and topbar collapse so
// the page itself owns all the screen space (e.g. the Constellation map,
// which is meant to feel like a fullscreen space canvas, not a boxed-in
// CRM page).
const IMMERSIVE_PREFIXES = ['/tools/constellation-test'];

export default function Layout() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { pathname } = useLocation();
  const immersive = IMMERSIVE_PREFIXES.some((p) => pathname.startsWith(p));

  // Step 1 of the new CRM->AI Agents transition, being built from scratch:
  // cracks -> crumble -> black screen. Nothing beyond the black screen is
  // wired up yet (no navigation), so this is a dead end by design for now
  // — later steps will decide what happens from there.
  const [crackActive, setCrackActive] = useState(false);

  return (
    <>
      {crackActive && <CrackTransition onBlackScreen={() => {}} />}

      {!immersive && (
        <button className="menu-btn" aria-label="Menu" onClick={() => setMobileOpen(true)}>
          <svg viewBox="0 0 24 24"><path d="M3 6h18M3 12h18M3 18h18" /></svg>
        </button>
      )}
      {!immersive && <div className={'scrim' + (mobileOpen ? ' show' : '')} onClick={() => setMobileOpen(false)} />}

      <div className="shell show">
        {!immersive && (
          <Sidebar
            mobileOpen={mobileOpen} onCloseMobile={() => setMobileOpen(false)}
            onAiAgentsClick={() => setCrackActive(true)}
          />
        )}
        <main className={'main' + (immersive ? ' immersive' : '')}>
          {!immersive && <TopBar />}
          <div className="view">
            <Outlet />
          </div>
        </main>
      </div>
    </>
  );
}
