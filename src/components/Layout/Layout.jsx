import { useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
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
  const navigate = useNavigate();
  const immersive = IMMERSIVE_PREFIXES.some((p) => pathname.startsWith(p));

  // The new CRM->AI Agents transition, built from scratch: cracks (radiating
  // from wherever the AI Agents item actually sits) -> crumble -> black
  // screen -> the real AI Map. Navigate() fires the instant black screen is
  // reached; the overlay itself stays up ~400ms longer as a safety margin
  // so the route swap underneath is never visible, then unmounts, revealing
  // the AI Map already a little way into its own (unrelated, pre-existing)
  // mount-time reveal.
  const [crackActive, setCrackActive] = useState(false);
  const [crackOrigin, setCrackOrigin] = useState(null);

  function handleAiAgentsClick(buttonEl) {
    const rect = buttonEl?.getBoundingClientRect?.();
    setCrackOrigin(rect ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 } : null);
    setCrackActive(true);
  }

  function handleBlackScreen() {
    navigate('/tools/constellation-test');
    setTimeout(() => setCrackActive(false), 400);
  }

  return (
    <>
      {crackActive && <CrackTransition origin={crackOrigin} onBlackScreen={handleBlackScreen} />}

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
            onAiAgentsClick={handleAiAgentsClick}
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
