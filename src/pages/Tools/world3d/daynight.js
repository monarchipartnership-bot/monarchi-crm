// Day and night: the sun/moon and sky colours follow the real local time (or a test switch), and everything else follows through setNight().
import * as THREE from 'three';
import { setNight, onNight } from './night.js';

const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
export const nowHours = () => { const d = new Date(); return d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600; };
// how much daylight there is at an hour of the day: dawn 5:15-8:00, dusk 17:30-20:30
export const daylightAt = (h) => smooth(5.25, 8.0, h) * (1 - smooth(17.5, 20.5, h));

const C = (hex) => new THREE.Color(hex);
const SKY = { day: [C('#ffffff'), C('#f7ecfa'), C('#e7cff0'), C('#e9d3f2')], night: [C('#3a1f6e'), C('#22104a'), C('#0f0626'), C('#0f0626')], warm: [C('#ffc9a0'), C('#f6b6c8'), C('#b98ad6'), C('#d7a9d8')] };
const hex = (c) => '#' + c.getHexString();

// every material that glows (plum edges, lamps, status lights) glows more at night
export function collectEmissives(scene, boostByName = {}) {
  const list = new Map();
  scene.traverse((o) => { const m = o.material; if (!o.isMesh || !m || !m.isMeshStandardMaterial || !m.emissive || m.emissive.getHex() === 0 || list.has(m)) return; if (m.userData.noBoost) return; list.set(m, m.emissiveIntensity); });
  onNight((n) => list.forEach((base, m) => { m.emissiveIntensity = base * (1 + (boostByName[m.name] ?? 1.3) * n); }));
}

export function initDayNight({ app, sun, hemi, fill, renderer, stars, moon }) {
  let mode = 'auto'; try { mode = localStorage.getItem('aiw.tod') || 'auto'; } catch (e) { /* no storage */ }
  const target = () => (mode === 'day' ? 1 : mode === 'night' ? 0 : daylightAt(nowHours()));
  let d = target();
  if (stars) { const w = (stars.width = 1600), h = (stars.height = 900), g = stars.getContext('2d'); for (let i = 0; i < 190; i++) { const r = Math.random() * 1.6 + 0.4; g.fillStyle = `rgba(255,${230 + Math.random() * 25 | 0},255,${0.35 + Math.random() * 0.65})`; g.beginPath(); g.arc(Math.random() * w, Math.random() * h * 0.7, r, 0, 7); g.fill(); } }

  // the test switch
  const sw = document.createElement('div'); sw.className = 'todsw';
  sw.innerHTML = `<span>Час доби · тест</span><button type="button" data-m="auto"><b>◔</b><i id="todtime">Авто</i></button><button type="button" data-m="day"><b>☀</b>День</button><button type="button" data-m="night"><b>☾</b>Ніч</button>`;
  app.appendChild(sw);
  const paint = () => sw.querySelectorAll('button').forEach((b) => b.classList.toggle('is-on', b.dataset.m === mode));
  sw.addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; mode = b.dataset.m; try { localStorage.setItem('aiw.tod', mode); } catch (er) { /* no storage */ } paint(); });
  paint();
  const clockEl = sw.querySelector('#todtime'); let clockT = 0;

  const col = new THREE.Color(), col2 = new THREE.Color();
  function apply() {
    const n = 1 - d, warm = Math.pow(Math.sin(Math.PI * d), 2); // the warm dawn/dusk tint peaks halfway
    setNight(n);
    sun.intensity = lerp(0.6, 2.6, d); sun.color.set(0x9fb0ff).lerp(col.set(0xfff2ff), d).lerp(col2.set(0xffb98a), warm * 0.65);
    hemi.intensity = lerp(0.55, 0.95, d); hemi.color.set(0x6a58c8).lerp(col.set(0xffffff), d); hemi.groundColor.set(0x241250).lerp(col.set(0xe3b9ef), d);
    fill.intensity = lerp(0.14, 0.55, d);
    renderer.toneMappingExposure = lerp(1.2, 1.0, d);
    const sky = [0, 1, 2, 3].map((i) => col.copy(SKY.night[i]).lerp(SKY.day[i], d).lerp(SKY.warm[i], warm * 0.75).clone());
    ['--bg0', '--bg1', '--bg2', '--vig'].forEach((v, i) => app.style.setProperty(v, hex(sky[i])));
    app.classList.toggle('is-night', n > 0.5);
    const sv = smooth(0.4, 0.95, n); if (stars) stars.style.opacity = sv; if (moon) moon.style.opacity = sv;
  }
  apply();
  let last = -1, lastNow = performance.now();
  return {
    dispose() { sw.remove(); },
    update() {
      const now = performance.now(), dt = Math.min(1, (now - lastNow) / 1000); lastNow = now; // real elapsed time, so the change takes about as long on a slow frame rate too
      const t = target(); d += (t - d) * Math.min(1, dt * 1.7); if (Math.abs(t - d) < 0.002) d = t;
      if (Math.abs(d - last) > 0.0015) { last = d; apply(); }
      clockT -= dt; if (clockT < 0) { clockT = 1; const h = nowHours(); clockEl.textContent = mode === 'auto' ? `Авто ${String(Math.floor(h)).padStart(2, '0')}:${String(Math.floor((h % 1) * 60)).padStart(2, '0')}` : 'Авто'; }
    },
  };
}

