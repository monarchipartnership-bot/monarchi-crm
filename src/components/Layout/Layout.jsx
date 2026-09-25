import { useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Sidebar from '../Sidebar/Sidebar';
import TopBar from './TopBar';
import TransitionPortal from '../CrmToAiTransition/TransitionPortal';
import { CrmToAiTransitionProvider, useCrmToAiTransition } from '../../contexts/CrmToAiTransitionContext';
import './Layout.css';

// Routes that take over the full viewport — sidebar and topbar collapse so
// the page itself owns all the screen space (e.g. the Constellation map,
// which is meant to feel like a fullscreen space canvas, not a boxed-in
// CRM page).
const IMMERSIVE_PREFIXES = ['/tools/constellation-test'];

// The provider needs to sit above both TransitionPortal and <Outlet/>
// (ConstellationTest reads the same context to sync its own reveal), so
// the actual shell markup lives in a child component that can call
// useCrmToAiTransition() — the provider component itself can't consume
// its own context.
export default function Layout() {
  return (
    <CrmToAiTransitionProvider>
      <LayoutShell />
    </CrmToAiTransitionProvider>
  );
}

function LayoutShell() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { pathname } = useLocation();
  const { mode, startDirect } = useCrmToAiTransition();
  const immersive = IMMERSIVE_PREFIXES.some((p) => pathname.startsWith(p));

  return (
    <>
      {mode !== 'idle' && <TransitionPortal />}

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
