// Is it night on the 3D map right now? The same dawn / dusk rule as the scene (world3d/daynight.js), kept here without three.js so the page can use it
// before the scene is loaded (the loader, the colours of the top bar).
export function nightNow() {
  let mode = 'auto'; try { mode = localStorage.getItem('aiw.tod') || 'auto'; } catch { /* no storage */ }
  if (mode === 'night') return true;
  if (mode === 'day') return false;
  const d = new Date(), h = d.getHours() + d.getMinutes() / 60;
  const sm = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  return sm(5.25, 8, h) * (1 - sm(17.5, 20.5, h)) < 0.5;
}
