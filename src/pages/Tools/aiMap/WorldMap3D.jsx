import { useEffect, useMemo, useRef, useState } from 'react';
import './WorldMap3D.css';
import { nightNow } from './nightRule';

// The 3D map of departments and agents (src/pages/Tools/world3d). three.js and the models are a separate chunk that starts loading when the Map
// section opens; until the city is ready the shell shows the sky of the scene (not the cosmos behind the page) and a small loader, then the
// city fades in. The scene is kept alive for a few minutes when the section is left, so coming back is instant.
// The page owns the state (which department is focused, which agent is open); the scene reports clicks and follows props.

const WORLD_DEPTS = ['management', 'strategy-research', 'performance-creative', 'performance-delivery', 'data-tracking-reporting', 'client-success', 'sales', 'client-research', 'client-creative', 'client-ads', 'client-reports', 'internal', 'social'];
const KEEP_ALIVE_MS = 3 * 60 * 1000;

// AGENT_DEPTS (departments → functions → agents) to the flat shape the scene draws: one building per department, one desk per agent.
function toWorldDepts(agentDepts) {
  return Object.entries(agentDepts)
    .filter(([key]) => WORLD_DEPTS.includes(key))
    .map(([key, d]) => ({
      key, label: d.label, subtitle: d.subtitle || '',
      agents: (d.subcategories || []).flatMap((sc) => sc.agents.map((a) => ({ key: a.key, name: a.name, status: a.status }))),
    }));
}

// one scene for the whole page session
const cache = { world: null, host: null, promise: null, timer: 0, progress: 0, listeners: new Set(), handlers: {}, revealed: false };

function parking() { // a hidden, fixed-size place for the scene while it loads or while the section is away (it needs a real size to draw)
  let p = document.getElementById('w3d-parking');
  if (!p) { p = document.createElement('div'); p.id = 'w3d-parking'; p.style.cssText = 'position:fixed;left:-10000px;top:0;width:1280px;height:720px;visibility:hidden;pointer-events:none'; document.body.appendChild(p); }
  return p;
}

function ensureWorld(depts) {
  if (cache.promise) return cache.promise;
  const host = document.createElement('div');
  host.className = 'w3d-host'; host.style.cssText = 'position:absolute;inset:0;opacity:0';
  parking().appendChild(host); cache.host = host; cache.revealed = false;
  cache.promise = import('../world3d/world.js')
    .then(({ createWorld }) => createWorld(host, {
      depts,
      debug: new URLSearchParams(window.location.search).has('w3ddebug'),
      onProgress: (p) => { cache.progress = p; cache.listeners.forEach((f) => f(p)); },
      onFocusDept: (k) => cache.handlers.onFocusDept?.(k),
      onOpenAgent: (d, k) => cache.handlers.onOpenAgent?.(d, k),
      onReset: () => cache.handlers.onReset?.(),
      onTheme: (n) => cache.handlers.onTheme?.(n),
      onStep: (i) => cache.handlers.onStep?.(i),
    }))
    .then((w) => { cache.world = w; return w; })
    .catch((e) => { cache.promise = null; host.remove(); cache.host = null; throw e; });
  return cache.promise;
}

function scheduleDispose() {
  clearTimeout(cache.timer);
  cache.timer = setTimeout(() => {
    cache.world?.dispose(); cache.host?.remove();
    cache.world = null; cache.host = null; cache.promise = null; cache.progress = 0;
  }, KEEP_ALIVE_MS);
}

export default function WorldMap3D({ agentDepts, focusedDept, hidden, runStates, onFocusDept, onOpenAgent, onReset, onTheme, onStep }) {
  const shellRef = useRef(null);
  const worldRef = useRef(null);
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);
  const [progress, setProgress] = useState(cache.progress);
  const [loaderGone, setLoaderGone] = useState(!!cache.world); // coming back to a scene that is already built: no loader at all
  const night = useMemo(() => nightNow(), []);
  const depts = useMemo(() => toWorldDepts(agentDepts), [agentDepts]);

  useEffect(() => {
    cache.handlers = { onFocusDept, onOpenAgent, onReset, onTheme, onStep };
  });

  useEffect(() => {
    let alive = true;
    clearTimeout(cache.timer);
    let tl = null;
    if (new URLSearchParams(window.location.search).has('w3ddebug')) { // a timeline of the load, for checking that nothing pops in
      window.__w3dTimeline = []; const t0 = performance.now();
      tl = setInterval(() => { const sh = shellRef.current, ld = sh && sh.querySelector('.w3d-loader'); window.__w3dTimeline.push([Math.round(performance.now() - t0), Math.round(cache.progress * 100), ld ? +getComputedStyle(ld).opacity : null, cache.host ? +cache.host.style.opacity : null, cache.host && cache.host.parentElement === sh ? 'in' : 'parked']); if (window.__w3dTimeline.length > 400) clearInterval(tl); }, 150);
    }
    const onProg = (p) => { if (alive) setProgress(p); };
    cache.listeners.add(onProg); onProg(cache.progress);
    ensureWorld(depts).then((w) => {
      if (!alive) return;
      worldRef.current = w;
      shellRef.current.appendChild(cache.host); w.setPaused(false);
      // two frames with the city on screen first, then the fade, so it never pops in half drawn
      requestAnimationFrame(() => requestAnimationFrame(() => {
        if (!alive || !cache.host) return;
        cache.host.style.transition = cache.revealed ? 'none' : 'opacity .9s ease'; cache.host.style.opacity = '1'; cache.revealed = true;
        setReady(true);
      }));
    }).catch((e) => { console.error('3D map failed to start', e); if (alive) setFailed(true); });
    return () => {
      alive = false; cache.listeners.delete(onProg); if (tl) clearInterval(tl);
      if (worldRef.current && cache.host) { worldRef.current.setPaused(true); parking().appendChild(cache.host); }
      worldRef.current = null;
      if (cache.promise) scheduleDispose();
    };
  }, [depts]);

  // the loader fades out, then leaves the page
  useEffect(() => {
    if (!ready) return undefined;
    const t = setTimeout(() => setLoaderGone(true), 900);
    return () => clearTimeout(t);
  }, [ready]);

  // the page's focus drives the camera (only when it differs from what the scene already shows, so a click does not restart the flight)
  useEffect(() => {
    const w = worldRef.current; if (!w || !ready) return;
    if (focusedDept) { if (w.state.dept !== focusedDept) w.api.selectDept(focusedDept); } else if (w.state.dept) w.api.reset();
  }, [focusedDept, ready]);
  useEffect(() => { if (ready) worldRef.current?.setRunStatus(runStates); }, [runStates, ready]);
  useEffect(() => { if (ready) worldRef.current?.setPaused(!!hidden); }, [hidden, ready]);

  if (failed) return <div className="w3d-failed">Не вдалося запустити 3D-мапу. Оновіть сторінку або відкрийте розділ «Агенти».</div>;
  return (
    <div ref={shellRef} className={'w3d-shell' + (night ? ' is-night' : '') + (focusedDept ? ' is-focused' : '')} style={{ visibility: hidden ? 'hidden' : 'visible' }}>
      {!loaderGone && (
        <div className={'w3d-loader' + (ready ? ' is-done' : '')} role="status" aria-live="polite">
          <img className="w3d-loader-mark" src={`${import.meta.env.BASE_URL}ai-world/logo/emblem.svg`} alt="" />
          <div className="w3d-loader-text">Будуємо місто агентів…</div>
          <div className="w3d-loader-bar" aria-hidden="true"><i style={{ width: `${Math.round(Math.min(1, progress) * 100)}%` }} /></div>
        </div>
      )}
    </div>
  );
}
