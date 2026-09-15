import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from '../Sidebar/Sidebar';
import TopBar from './TopBar';
import './Layout.css';

export default function Layout() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <>
      <button className="menu-btn" aria-label="Menu" onClick={() => setMobileOpen(true)}>
        <svg viewBox="0 0 24 24"><path d="M3 6h18M3 12h18M3 18h18" /></svg>
      </button>
      <div className={'scrim' + (mobileOpen ? ' show' : '')} onClick={() => setMobileOpen(false)} />

      <div className="shell show">
        <Sidebar mobileOpen={mobileOpen} onCloseMobile={() => setMobileOpen(false)} />
        <main className="main">
          <TopBar />
          <div className="view">
            <Outlet />
          </div>
        </main>
      </div>
    </>
  );
}
