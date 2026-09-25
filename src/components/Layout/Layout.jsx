import { useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Sidebar from '../Sidebar/Sidebar';
import TopBar from './TopBar';
import { useCrmToAiTransition } from '../../contexts/CrmToAiTransitionContext';
import './Layout.css';

// Routes that take over the full viewport — sidebar and topbar collapse so
// the page itself owns all the screen space (e.g. the Constellation map,
// which is meant to feel like a fullscreen space canvas, not a boxed-in
// CRM page).
const IMMERSIVE_PREFIXES = ['/tools/constellation-test'];

// CrmToAiTransitionProvider/TransitionPortal are mounted from App.jsx, above
// AuthGate — not here. Layout is already the single shared parent route
// element for every CRM/AI route (so it never unmounted between Home<->Map
// on its own), but it WOULD unmount if AuthGate swapped to its loading/
// <Login/> branch mid-transition, which would orphan the overlay. Mounting
// the provider above AuthGate makes that impossible regardless of route or
// auth-state churn. Layout only *consumes* the context here.
export default function Layout() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { pathname } = useLocation();
  const { mode, startDirect } = useCrmToAiTransition();
  const immersive = IMMERSIVE_PREFIXES.some((p) => pathname.startsWith(p));

  return (
    <>
      {!immersive && (
        <button className="menu-btn" aria-label="Menu" onClick={() => setMobileOpen(true)}>
          <svg viewBox="0 0 24 24"><path d="M3 6h18M3 12h18M3 18h18" /></svg>
        </button>
      )}
      {!immersive && <div className={'scrim' + (mobileOpen ? ' show' : '')} onClick={() => setMobileOpen(false)} />}

      <div className="shell show">
        {!immersive && <Sidebar mobileOpen={mobileOpen} onCloseMobile={() => setMobileOpen(false)} onIntroLink={startDirect} />}
        <main className={'main' + (immersive ? ' immersive' : '')}>
          {!immersive && <TopBar />}
          <div className={'view' + (mode === 'direct' ? ' crm-dissolving' : '')}>
            <Outlet />
          </div>
        </main>
      </div>
    </>
  );
}
