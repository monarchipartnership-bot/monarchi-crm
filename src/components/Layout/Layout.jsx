import { useEffect, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import Sidebar from '../Sidebar/Sidebar';
import TopBar from './TopBar';
import IntroTransition from '../IntroTransition/IntroTransition';
import { INTRO_STAGE1_TOTAL_MS } from '../../lib/introTiming';
import './Layout.css';

// Routes that take over the full viewport — sidebar and topbar collapse so
// the page itself owns all the screen space (e.g. the Constellation map,
// which is meant to feel like a fullscreen space canvas, not a boxed-in
// CRM page).
const IMMERSIVE_PREFIXES = ['/tools/constellation-test'];

export default function Layout() {
  const [mobileOpen, setMobileOpen] = useState(false);
  // Set to a path to start stage 1 of the AI Agents entrance (darken +
  // welcome) right here, before navigating — the route only changes once
  // that's finished, so the target page never flashes underneath it.
  const [introTarget, setIntroTarget] = useState(null);
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const immersive = IMMERSIVE_PREFIXES.some((p) => pathname.startsWith(p));

  useEffect(() => {
    if (!introTarget) return undefined;
    const timer = setTimeout(() => {
      navigate(introTarget);
      setIntroTarget(null);
    }, INTRO_STAGE1_TOTAL_MS);
    return () => clearTimeout(timer);
  }, [introTarget, navigate]);

  return (
    <>
      {introTarget && <IntroTransition />}

      {!immersive && (
        <button className="menu-btn" aria-label="Menu" onClick={() => setMobileOpen(true)}>
          <svg viewBox="0 0 24 24"><path d="M3 6h18M3 12h18M3 18h18" /></svg>
        </button>
      )}
      {!immersive && <div className={'scrim' + (mobileOpen ? ' show' : '')} onClick={() => setMobileOpen(false)} />}

      <div className="shell show">
        {!immersive && <Sidebar mobileOpen={mobileOpen} onCloseMobile={() => setMobileOpen(false)} onIntroLink={setIntroTarget} />}
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
