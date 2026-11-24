// The desk screens (owner, 2026-11-10: "something closer to real work, not just stripes"): every team has two little live "applications" drawn on a canvas atlas (4 x 4 tiles of 384 x 192): a creative studio, a terminal, an ads dashboard, a report with a table, a sales funnel / kanban, a social feed / calendar, an SEO rank table, a research radar / map. The atlas is redrawn about 7 times a second (the numbers tick, charts scroll, lists run, cursors blink) and the desk-screen material picks the tile of its team; the instance colour dims it by the agent's state.
import * as THREE from 'three';

const TW = 480, TH = 160, COLS = 4, DW = 384, DH = 192, K = TH / DH, OX = (TW - DW * K) / 2; // the screen is ~3:1: a tile is 480 x 160, the 2:1 design (384 x 192) is drawn scaled in the middle, with side panels
const LAV = '#d9c8ff', DIM = '#8f78c9', PANEL = '#21104a', FONT = '600 13px Onest, system-ui, sans-serif', MONO = '600 12px Consolas, "Courier New", monospace';
const hsh = (a, b = 0) => { const x = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return x - Math.floor(x); };
const wave = (x, t) => Math.sin(x * 1.7 + t) * 0.5 + Math.sin(x * 0.63 - t * 1.3) * 0.3 + Math.sin(x * 3.1 + t * 0.7) * 0.2;
const rr = (c, x, y, w, h, r) => { c.beginPath(); c.roundRect ? c.roundRect(x, y, w, h, r) : c.rect(x, y, w, h); };
const txt = (c, s, x, y, col = LAV, font = FONT, al = 'left') => { c.font = font; c.fillStyle = col; c.textAlign = al; c.textBaseline = 'middle'; c.fillText(s, x, y); };
const hex = (col) => '#' + col.toString(16).padStart(6, '0');

function chrome(c, title, col) { const TW = DW, TH = DH; // the common frame: dark background, a header strip with the app title and three dots
  const g = c.createLinearGradient(0, 0, 0, TH); g.addColorStop(0, '#1d0e46'); g.addColorStop(1, '#0f0628'); c.fillStyle = g; c.fillRect(0, 0, TW, TH);
  c.fillStyle = '#2b1670'; c.fillRect(0, 0, TW, 24); c.fillStyle = col; c.fillRect(0, 23, TW, 2);
  txt(c, title, 10, 12, '#ffffff', '700 13px Onest, system-ui, sans-serif');
  for (let i = 0; i < 3; i++) { c.fillStyle = i === 0 ? col : '#6d55b5'; c.beginPath(); c.arc(TW - 14 - i * 14, 12, 4, 0, 7); c.fill(); }
}
const line = (c, pts, col, w = 2) => { c.strokeStyle = col; c.lineWidth = w; c.lineJoin = 'round'; c.beginPath(); pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); c.stroke(); };

const DRAW = {
  creatives: [
    (c, t, col) => { chrome(c, 'Студія креативів', col); // clip thumbnails + a timeline with a playhead
      const sel = Math.floor(t * 0.7) % 6;
      for (let i = 0; i < 6; i++) { const x = 10 + (i % 3) * 123, y = 34 + Math.floor(i / 3) * 52, g = c.createLinearGradient(x, y, x + 114, y + 46), h = hsh(i) * 360; g.addColorStop(0, `hsl(${h},70%,50%)`); g.addColorStop(1, `hsl(${h + 50},70%,30%)`); c.fillStyle = g; rr(c, x, y, 114, 46, 5); c.fill();
        c.fillStyle = 'rgba(255,255,255,0.85)'; c.beginPath(); c.moveTo(x + 50, y + 14); c.lineTo(x + 50, y + 32); c.lineTo(x + 66, y + 23); c.fill(); if (i === sel) { c.strokeStyle = '#fff'; c.lineWidth = 3; rr(c, x, y, 114, 46, 5); c.stroke(); } }
      for (let r = 0; r < 2; r++) { let x = 10; for (let k = 0; k < 7; k++) { const w = 20 + hsh(k, r + 3) * 50; c.fillStyle = r ? '#6a3df0' : col; rr(c, x, 146 + r * 20, w, 14, 3); c.fill(); x += w + 4; } }
      c.fillStyle = '#fff'; c.fillRect(10 + (t * 26) % 360, 140, 2, 44); },
    (c, t, col) => { chrome(c, 'Редактор макета', col); // a layout with shapes moving, a tool column, swatches, a render bar
      for (let i = 0; i < 5; i++) { c.fillStyle = i === Math.floor(t) % 5 ? col : PANEL; rr(c, 8, 32 + i * 28, 24, 22, 4); c.fill(); }
      c.fillStyle = '#2c1a66'; rr(c, 42, 32, 236, 122, 6); c.fill();
      c.fillStyle = col; c.beginPath(); c.arc(110 + Math.sin(t) * 18, 92, 26, 0, 7); c.fill(); c.fillStyle = '#ffffff'; rr(c, 160 + Math.cos(t * 0.8) * 14, 62, 70, 40, 8); c.fill(); c.fillStyle = '#7b4dff'; rr(c, 80, 122, 150 + Math.sin(t * 1.3) * 30, 14, 6); c.fill();
      for (let i = 0; i < 6; i++) { c.fillStyle = `hsl(${i * 60},75%,58%)`; c.beginPath(); c.arc(298 + (i % 3) * 26, 46 + Math.floor(i / 3) * 26, 9, 0, 7); c.fill(); }
      const p = (t * 9) % 100; c.fillStyle = PANEL; rr(c, 42, 164, 340, 14, 7); c.fill(); c.fillStyle = col; rr(c, 42, 164, 340 * p / 100, 14, 7); c.fill(); txt(c, 'Рендер ' + Math.floor(p) + '%', 300, 140, LAV, FONT); },
  ],
  service: [
    (c, t, col) => { chrome(c, 'Термінал · сервіс', col); const L = ['› sync clients  ✓', '› fetch ads api  200', '› write report.pdf', '› queue: 3 tasks', '› refresh tokens  ✓', '› backup db  98%', '› webhook sent  ✓', '› check budgets', '› send alerts  ✓']; const o = Math.floor(t * 1.6);
      for (let i = 0; i < 10; i++) { const s = L[(o + i) % L.length]; txt(c, s, 12, 40 + i * 15, s.includes('✓') ? '#52f0a0' : LAV, MONO); } if (Math.floor(t * 2) % 2) { c.fillStyle = LAV; c.fillRect(12, 40 + 10 * 15 - 6, 8, 12); } },
    (c, t, col) => { chrome(c, 'Стан сервісів', col); const N = ['CRM', 'Meta', 'Google', 'Telegram', 'Sheets', 'Storage', 'Queue', 'Agents'];
      N.forEach((n, i) => { const x = 10 + (i % 2) * 186, y = 34 + Math.floor(i / 2) * 36, ok = hsh(i, Math.floor(t / 4)) > 0.12; c.fillStyle = PANEL; rr(c, x, y, 176, 30, 6); c.fill(); c.fillStyle = ok ? '#52f0a0' : '#ffb347'; c.beginPath(); c.arc(x + 14, y + 15, 5, 0, 7); c.fill(); txt(c, n, x + 28, y + 15); txt(c, Math.floor(40 + hsh(i) * 160 + wave(i + 3, t * 2) * 20) + ' мс', x + 168, y + 15, DIM, MONO, 'right'); }); },
  ],
  ads: [
    (c, t, col) => { chrome(c, 'Реклама · огляд', col); const K = [['ROAS', (3.1 + wave(1, t * 0.4) * 0.3).toFixed(2)], ['CTR', (2.0 + wave(2, t * 0.4) * 0.3).toFixed(1) + '%'], ['CPC', '$' + (0.62 + wave(3, t * 0.4) * 0.08).toFixed(2)]];
      K.forEach(([k, v], i) => { const x = 10 + i * 122; c.fillStyle = PANEL; rr(c, x, 32, 114, 40, 6); c.fill(); txt(c, k, x + 8, 44, DIM, '600 11px Onest, sans-serif'); txt(c, v, x + 8, 60, '#fff', '700 17px Onest, sans-serif'); });
      c.fillStyle = PANEL; rr(c, 10, 80, 364, 100, 6); c.fill(); const a = [], b = []; for (let i = 0; i <= 36; i++) { a.push([20 + i * 9.6, 150 - (wave(i * 0.35 + t, t) * 0.5 + 0.5) * 60]); b.push([20 + i * 9.6, 160 - (wave(i * 0.3 + 4, t * 0.8) * 0.5 + 0.5) * 50]); }
      c.fillStyle = 'rgba(176,110,255,0.25)'; c.beginPath(); c.moveTo(20, 170); a.forEach(([x, y]) => c.lineTo(x, y)); c.lineTo(20 + 36 * 9.6, 170); c.fill(); line(c, a, col, 2.5); line(c, b, '#52f0a0', 2); },
    (c, t, col) => { chrome(c, 'Витрати за днями', col); for (let i = 0; i < 14; i++) { const h = 20 + (wave(i * 0.8, t * 0.6) * 0.5 + 0.5) * 100, x = 14 + i * 20; c.fillStyle = i === Math.floor(t * 1.2) % 14 ? '#fff' : col; c.fillRect(x, 170 - h, 14, h); }
      const pc = 0.62 + wave(1, t * 0.3) * 0.08; c.strokeStyle = PANEL; c.lineWidth = 14; c.beginPath(); c.arc(334, 80, 30, 0, 7); c.stroke(); c.strokeStyle = '#52f0a0'; c.beginPath(); c.arc(334, 80, 30, -1.57, -1.57 + 6.28 * pc); c.stroke(); txt(c, Math.floor(pc * 100) + '%', 334, 80, '#fff', '700 14px Onest, sans-serif', 'center'); txt(c, 'Бюджет', 334, 124, DIM, '600 11px Onest, sans-serif', 'center'); },
  ],
  reports: [
    (c, t, col) => { chrome(c, 'Звіт клієнта', col); for (let i = 0; i < 6; i++) { const y = 36 + i * 24, w = 80 + hsh(i, Math.floor(t / 3)) * 160; c.fillStyle = PANEL; rr(c, 10, y, 364, 20, 4); c.fill(); txt(c, ['Покази', 'Кліки', 'Ліди', 'Витрати', 'CPL', 'ROAS'][i], 18, y + 10); c.fillStyle = i === Math.floor(t * 0.8) % 6 ? '#fff' : col; rr(c, 110, y + 5, w * (0.9 + 0.1 * Math.sin(t * 2 + i)), 10, 4); c.fill(); txt(c, Math.floor(w * (12 + i * 3)), 366, y + 10, DIM, MONO, 'right'); } },
    (c, t, col) => { chrome(c, 'Підсумок місяця', col); const parts = [0.38, 0.27, 0.2, 0.15], cs = [col, '#52f0a0', '#ffb347', '#6a8cff']; let a0 = -1.57 + t * 0.15; parts.forEach((p, i) => { c.strokeStyle = cs[i]; c.lineWidth = 24; c.beginPath(); c.arc(92, 110, 46, a0, a0 + 6.28 * p - 0.05); c.stroke(); a0 += 6.28 * p; }); txt(c, Math.floor(3400 + wave(1, t) * 120), 92, 110, '#fff', '700 18px Onest, sans-serif', 'center');
      cs.forEach((cc, i) => { c.fillStyle = cc; c.fillRect(176, 52 + i * 28, 12, 12); txt(c, ['Meta', 'Google', 'TikTok', 'Інше'][i], 196, 58 + i * 28); txt(c, Math.floor(parts[i] * 100) + '%', 360, 58 + i * 28, DIM, MONO, 'right'); }); },
  ],
  sales: [
    (c, t, col) => { chrome(c, 'Воронка продажів', col); const S = ['Ліди', 'Контакт', 'Пропозиція', 'Угода']; S.forEach((s, i) => { const w = 360 - i * 66, x = (384 - w) / 2, y = 34 + i * 36; const g = c.createLinearGradient(x, 0, x + w, 0); g.addColorStop(0, col); g.addColorStop(1, '#6a35d8'); c.fillStyle = g; rr(c, x, y, w, 30, 6); c.fill(); txt(c, s, x + 12, y + 15, '#fff'); txt(c, String(Math.floor((120 - i * 28) + wave(i, t) * 6)), x + w - 12, y + 15, '#fff', '700 14px Onest, sans-serif', 'right'); }); },
    (c, t, col) => { chrome(c, 'Угоди', col); for (let k = 0; k < 3; k++) { const x = 10 + k * 123; c.fillStyle = PANEL; rr(c, x, 32, 116, 150, 6); c.fill(); txt(c, ['Нові', 'В роботі', 'Виграні'][k], x + 8, 44, DIM, '600 11px Onest, sans-serif');
      for (let i = 0; i < 3; i++) { const y = 58 + i * 40 + Math.sin(t * 1.2 + k * 2 + i) * (k === 1 ? 4 : 1.5); c.fillStyle = '#34207a'; rr(c, x + 6, y, 104, 34, 5); c.fill(); c.fillStyle = [col, '#ffb347', '#52f0a0'][k]; c.fillRect(x + 6, y, 3, 34); c.fillStyle = LAV; c.fillRect(x + 14, y + 8, 50 + hsh(k, i) * 36, 5); c.fillStyle = DIM; c.fillRect(x + 14, y + 20, 36, 4); } } },
  ],
  smm: [
    (c, t, col) => { chrome(c, 'Стрічка · SMM', col); for (let k = 0; k < 2; k++) { const x = 10 + k * 188; c.fillStyle = PANEL; rr(c, x, 32, 176, 148, 6); c.fill(); const g = c.createLinearGradient(x, 36, x + 168, 108), h = 280 + k * 80; g.addColorStop(0, `hsl(${h},70%,55%)`); g.addColorStop(1, `hsl(${h + 60},70%,30%)`); c.fillStyle = g; rr(c, x + 5, 37, 166, 80, 5); c.fill();
      txt(c, '♥ ' + Math.floor(120 + k * 80 + t * (3 + k)), x + 10, 132, '#ff7ab6', FONT); txt(c, '✉ ' + Math.floor(14 + t * 0.4), x + 80, 132, DIM, FONT); c.fillStyle = LAV; c.fillRect(x + 10, 150, 110 + k * 20, 5); c.fillStyle = DIM; c.fillRect(x + 10, 162, 70, 4); } },
    (c, t, col) => { chrome(c, 'Контент-план', col); ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Нд'].forEach((d, i) => txt(c, d, 30 + i * 50, 38, DIM, '600 11px Onest, sans-serif', 'center'));
      for (let r = 0; r < 4; r++) for (let i = 0; i < 7; i++) { const x = 8 + i * 50, y = 50 + r * 32, on = hsh(i, r) > 0.45, cur = (i + r * 7) === Math.floor(t * 0.9) % 28; c.fillStyle = cur ? col : PANEL; rr(c, x, y, 44, 27, 5); c.fill(); if (on) { c.fillStyle = cur ? '#fff' : ['#ff7ab6', '#52f0a0', '#ffb347'][(i + r) % 3]; c.beginPath(); c.arc(x + 22, y + 13, 5, 0, 7); c.fill(); } } },
  ],
  seo: [
    (c, t, col) => { chrome(c, 'Позиції запитів', col); for (let i = 0; i < 7; i++) { const y = 34 + i * 21, rk = 1 + Math.floor(hsh(i) * 12 + Math.max(0, wave(i, t * 0.5)) * 2), up = wave(i * 2, t * 0.6) > 0; c.fillStyle = PANEL; rr(c, 10, y, 364, 18, 4); c.fill(); c.fillStyle = LAV; c.fillRect(18, y + 7, 60 + hsh(i, 5) * 140, 4); txt(c, '#' + rk, 300, y + 9, '#fff', '700 12px Onest, sans-serif', 'right'); txt(c, up ? '▲' : '▼', 330, y + 9, up ? '#52f0a0' : '#ff6b8a', FONT, 'center'); txt(c, String(Math.floor(900 - rk * 40 + wave(i, t) * 20)), 366, y + 9, DIM, MONO, 'right'); } },
    (c, t, col) => { chrome(c, 'Динаміка позиції', col); c.fillStyle = PANEL; rr(c, 10, 32, 364, 148, 6); c.fill(); const p = []; for (let i = 0; i <= 30; i++) p.push([20 + i * 11.5, 60 + i * 2.2 - (wave(i * 0.4, t * 0.5) * 0.5 + 0.5) * 38 - Math.min(i, 30) * 1.2]); line(c, p, '#52f0a0', 2.5); c.fillStyle = col; c.beginPath(); c.arc(p[30][0], p[30][1], 5, 0, 7); c.fill(); txt(c, 'ТОП-' + (3 + Math.floor(Math.max(0, wave(1, t)) * 3)), 40, 160, '#fff', '700 16px Onest, sans-serif'); },
  ],
  research: [
    (c, t, col) => { chrome(c, 'Карта ринку', col); for (let y = 0; y < 8; y++) for (let x = 0; x < 22; x++) { const m = hsh(x, y + 9) > 0.35 && ((x > 2 && x < 19) && (y > 1 && y < 7)); if (!m) continue; c.fillStyle = '#4a2f9a'; c.beginPath(); c.arc(20 + x * 16, 44 + y * 16, 3, 0, 7); c.fill(); }
      for (let i = 0; i < 5; i++) { const x = 40 + hsh(i, 2) * 300, y = 56 + hsh(i, 6) * 90, ph = (t * 0.6 + i * 0.37) % 1; c.fillStyle = col; c.beginPath(); c.arc(x, y, 4, 0, 7); c.fill(); c.strokeStyle = `rgba(255,208,74,${1 - ph})`; c.lineWidth = 2; c.beginPath(); c.arc(x, y, 4 + ph * 22, 0, 7); c.stroke(); } },
    (c, t, col) => { chrome(c, 'Радар конкурентів', col); c.strokeStyle = '#3d2a85'; c.lineWidth = 2; for (let r = 1; r <= 3; r++) { c.beginPath(); c.arc(96, 108, r * 26, 0, 7); c.stroke(); } const a = t * 1.6; c.strokeStyle = col; c.lineWidth = 3; c.beginPath(); c.moveTo(96, 108); c.lineTo(96 + Math.cos(a) * 80, 108 + Math.sin(a) * 80); c.stroke();
      for (let i = 0; i < 5; i++) { const aa = hsh(i) * 6.28, rr0 = 20 + hsh(i, 4) * 56; c.fillStyle = '#fff'; c.beginPath(); c.arc(96 + Math.cos(aa) * rr0, 108 + Math.sin(aa) * rr0, 4, 0, 7); c.fill(); }
      for (let i = 0; i < 7; i++) { c.fillStyle = PANEL; rr(c, 196, 36 + i * 21, 178, 17, 4); c.fill(); c.fillStyle = LAV; c.fillRect(204, 42 + i * 21, 40 + hsh(i, 8) * 100, 4); } },
  ],
};

// teams: [{ key, color }] in the order of the islands; returns the atlas texture, a per-tile attribute helper and the animated material patch
export function makeScreens(teams) {
  const cv = document.createElement('canvas'); cv.width = TW * COLS; cv.height = TH * COLS; const ctx = cv.getContext('2d');
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4; tex.generateMipmaps = true; tex.minFilter = THREE.LinearMipmapLinearFilter;
  const T = { value: 0 }; let last = -1;
  const tileOf = (teamIdx, variant) => teamIdx * 2 + variant;
  function redraw(t) { // every tile of every team
    teams.forEach((tm, ti) => { const fn = DRAW[tm.key]; if (!fn) return; for (let v = 0; v < 2; v++) { const id = tileOf(ti, v), x = (id % COLS) * TW, y = Math.floor(id / COLS) * TH, col = hex(tm.color); ctx.save(); ctx.translate(x, y); ctx.beginPath(); ctx.rect(0, 0, TW, TH); ctx.clip();
      const g = ctx.createLinearGradient(0, 0, 0, TH); g.addColorStop(0, '#1d0e46'); g.addColorStop(1, '#0f0628'); ctx.fillStyle = g; ctx.fillRect(0, 0, TW, TH); ctx.fillStyle = '#2b1670'; ctx.fillRect(0, 0, TW, 20); ctx.fillStyle = col; ctx.fillRect(0, 19, TW, 2);
      for (let i = 0; i < 5; i++) { ctx.fillStyle = i === Math.floor(t * 0.5 + v) % 5 ? col : '#2c1a66'; rr(ctx, 14, 34 + i * 25, 36, 19, 5); ctx.fill(); } // nav column
      for (let i = 0; i < 5; i++) { const w = 12 + (wave(i * 1.3 + v, t * 0.8) * 0.5 + 0.5) * 40; ctx.fillStyle = '#2c1a66'; rr(ctx, OX + DW * K + 12, 36 + i * 24, 56, 8, 4); ctx.fill(); ctx.fillStyle = i % 2 ? '#52f0a0' : col; rr(ctx, OX + DW * K + 12, 36 + i * 24, w, 8, 4); ctx.fill(); } // right gauges
      ctx.translate(OX, 0); ctx.scale(K, K); fn[v](ctx, t + v * 3.1 + ti * 1.7, col); ctx.restore(); } });
    tex.needsUpdate = true;
  }
  redraw(0);
  function patch(m) { // the desk screen material: samples the tile `aTile` of the atlas, a faint scan band on top
    m.map = tex;
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = T;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', `#include <common>
attribute float aTile; varying float vTile; varying float vPh;`).replace('#include <begin_vertex>', `#include <begin_vertex>
vTile = aTile;
#ifdef USE_INSTANCING
vPh = fract(sin(dot(instanceMatrix[3].xz, vec2(12.9898, 78.233))) * 43758.5453);
#else
vPh = 0.0;
#endif`);
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
varying float vTile; varying float vPh; uniform float uTime;`).replace('#include <map_fragment>', `
      { float id = floor(vTile + 0.5); float col = mod(id, 4.0); float row = floor(id / 4.0);
        vec2 q = vec2(vMapUv.x, 1.0 - vMapUv.y); q = clamp(q, 0.0, 1.0) * vec2(0.992, 0.984) + vec2(0.004, 0.008);
        vec2 uvT = vec2((col + q.x) / 4.0, 1.0 - (row + 1.0 - q.y) / 4.0);
        vec4 sd = texture2D(map, uvT); diffuseColor *= sd;
        float sc = exp(-pow((fract(uTime * 0.2 + vPh) - q.y) * 9.0, 2.0)) * 0.12;
        diffuseColor.rgb += sc * vec3(0.5, 0.35, 1.0) + diffuseColor.rgb * 0.06 * sin(uTime * 3.0 + vPh * 6.28); }`);
    };
    return m;
  }
  return { texture: tex, patch, tileOf, update(t) { T.value = t; if (t - last > 0.14) { last = t; redraw(t); } } };
}
