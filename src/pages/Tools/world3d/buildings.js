// A department building you can walk into: outer shell (two front walls + roof fade away on entering), an interior with a themed back wall
// and ONE workstation per real agent (desk from Blender + robot from Blender).
import * as THREE from 'three';
import { C, box, cyl, sph, mat, canvasTex, plane, torus, dome, prism, glassMat } from './models.js';
import { makeAgentRobot, tickAgentRobot, makeFadable } from './assets.js';
import { runOf } from './runstatus.js';
import { logoPlaqueTex, signTexLogo } from './logo.js';
import { onNight, wallWash, doorPool, NIGHT } from './night.js';

const CELL_X = 3.7, CELL_Z = 3.7;
export function layoutFor(n, key) {
  const cols = n <= 4 ? 2 : 3, rows = Math.ceil(n / cols), st = STYLE[key] || { H: 8.2 };
  const W = cols * CELL_X + 3.4, D = rows * CELL_Z + 5.6;
  return st.round ? { cols, rows, W: 12.4, D: 12.4, H: st.H, round: true } : { cols, rows, W, D, H: st.H, round: false };
}

// ---------- small textures
const chartTex = (bars = true) => canvasTex(320, 180, (c, w, h) => {
  c.fillStyle = '#fbf3fd'; c.fillRect(0, 0, w, h);
  [40, 74, 56, 98, 82, 124, 108, 150].forEach((v, i) => { c.fillStyle = i % 2 ? '#b544b5' : '#d9a6df'; c.fillRect(24 + i * 36, h - 20 - v, 24, v); });
  c.strokeStyle = '#661466'; c.lineWidth = 4; c.beginPath(); c.moveTo(20, 130); [[70, 100], [120, 112], [170, 70], [220, 80], [270, 36], [310, 20]].forEach(([x, y]) => c.lineTo(x, y)); c.stroke();
});
const artTex = (a = '#f3b6e4', b = '#b544b5', d = '#661466') => canvasTex(256, 192, (c, w, h) => {
  const gr = c.createLinearGradient(0, 0, w, h); gr.addColorStop(0, a); gr.addColorStop(0.5, b); gr.addColorStop(1, d); c.fillStyle = gr; c.fillRect(0, 0, w, h);
  c.fillStyle = 'rgba(255,255,255,.85)'; c.beginPath(); c.arc(80, 70, 34, 0, 7); c.fill(); c.fillStyle = 'rgba(255,255,255,.35)'; c.beginPath(); c.moveTo(0, h); c.lineTo(110, 90); c.lineTo(190, 140); c.lineTo(w, 100); c.lineTo(w, h); c.fill();
});
const mapTex = () => canvasTex(320, 200, (c, w, h) => {
  c.fillStyle = '#fbf3fd'; c.fillRect(0, 0, w, h); c.strokeStyle = '#ebc6eb'; c.lineWidth = 2;
  for (let x = 0; x < w; x += 32) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, h); c.stroke(); } for (let y = 0; y < h; y += 32) { c.beginPath(); c.moveTo(0, y); c.lineTo(w, y); c.stroke(); }
  c.strokeStyle = '#b544b5'; c.lineWidth = 5; c.beginPath(); c.moveTo(30, 160); c.lineTo(100, 100); c.lineTo(170, 130); c.lineTo(250, 50); c.stroke();
  [[30, 160], [100, 100], [170, 130], [250, 50]].forEach(([x, y]) => { c.fillStyle = '#661466'; c.beginPath(); c.arc(x, y, 9, 0, 7); c.fill(); });
});
const netTex = () => canvasTex(320, 200, (c, w, h) => {
  c.fillStyle = '#270827'; c.fillRect(0, 0, w, h); const P = [[160, 100], [60, 50], [260, 50], [60, 150], [260, 150], [160, 30], [160, 175]];
  c.strokeStyle = 'rgba(235,156,239,.8)'; c.lineWidth = 3; P.slice(1).forEach(([x, y]) => { c.beginPath(); c.moveTo(160, 100); c.lineTo(x, y); c.stroke(); });
  P.forEach(([x, y], i) => { c.fillStyle = i ? '#d9a6df' : '#eb9cef'; c.beginPath(); c.arc(x, y, i ? 10 : 16, 0, 7); c.fill(); });
});
const signTex = (text) => canvasTex(512, 128, (c, w, h) => {
  c.fillStyle = '#661466'; c.fillRect(0, 0, w, h); c.fillStyle = '#b544b5'; c.fillRect(0, 0, w, 10);
  c.fillStyle = '#fff'; c.font = '800 54px Onest, Arial, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(text, w / 2, h / 2 + 4);
});
const floorTex = (a, b) => canvasTex(128, 128, (c, w, h) => { c.fillStyle = a; c.fillRect(0, 0, w, h); c.fillStyle = b; c.fillRect(0, 0, w / 2, h / 2); c.fillRect(w / 2, h / 2, w / 2, h / 2); });

const SIGN = { management: 'КЕРУВАННЯ', sales: 'ПРОДАЖІ', 'client-success': 'КЛІЄНТИ', 'strategy-research': 'СТРАТЕГІЯ', 'performance-creative': 'КРЕАТИВИ', 'performance-delivery': 'РЕКЛАМА', 'data-tracking-reporting': 'ДАНІ' };

// ---------- shapes: every department gets its own silhouette (height, roof volumes, facade) so the purpose reads from afar
const STYLE = {
  management: { H: 11.5, top: 13.5 },
  sales: { H: 6.2, top: 7.4 },
  'client-success': { H: 7.0, top: 9.6, round: true },
  'strategy-research': { H: 8.4, top: 11.4 },
  'performance-creative': { H: 7.4, top: 10.2 },
  'performance-delivery': { H: 9.0, top: 15.5 },
  'data-tracking-reporting': { H: 7.8, top: 10.4 },
};
const gable = (parent, w, h, d, color, x, y, z) => { // symmetric triangular roof, ridge along z, gable ends face +z / -z
  const s = new THREE.Shape(); s.moveTo(-w / 2, 0); s.lineTo(w / 2, 0); s.lineTo(0, h); s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: d, bevelEnabled: false }); g.translate(0, 0, -d / 2);
  const m = new THREE.Mesh(g, mat(color)); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; parent.add(m); return m;
};
function arcWall(parent, rOut, rIn, a0, a1, h, color, y = 0, o = {}) { // a ring segment standing on y (angles in the x/z plane, 0 = +x, pi/2 = +z)
  const s = new THREE.Shape(); s.absarc(0, 0, rOut, -a1, -a0, false); s.absarc(0, 0, rIn, -a0, -a1, true); s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: h, bevelEnabled: false, curveSegments: 48 }); g.rotateX(-Math.PI / 2);
  const m = new THREE.Mesh(g, mat(color, o)); m.position.y = y; m.castShadow = true; m.receiveShadow = true; parent.add(m); return m;
}
const FRONT_A0 = -Math.PI / 4, FRONT_A1 = 3 * Math.PI / 4; // the half of a round building that faces the camera

// ---------- roof signatures (they lift away when the building opens)
function roofProps(key, g, W, D, y) {
  const ticks = [];
  const R = new THREE.Group(); R.position.y = y; g.add(R);
  if (key === 'management') {
    box(R, W * 0.76, 3.2, D * 0.76, C.white, 0, 0, 0, 0.22); box(R, W * 0.76 + 0.3, 0.22, D * 0.76 + 0.3, C.plum, 0, 3.2, 0, 0.08, { emissive: C.plum, ei: 0.3 });
    box(R, W * 0.46, 3.0, D * 0.46, C.white, 0, 3.42, 0, 0.2); box(R, W * 0.46 + 0.3, 0.2, D * 0.46 + 0.3, C.plum, 0, 6.42, 0, 0.08, { emissive: C.plum, ei: 0.3 });
    [-2.4, 0, 2.4].forEach((x) => { box(R, 1.3, 1.9, 0.08, C.glass, x, 0.7, D * 0.38 + 0.04, 0.04, glassMat); box(R, 0.08, 1.9, 1.3, C.glass, W * 0.38 + 0.04, 0.7, x * 0.8, 0.04, glassMat); });
    box(R, 1.2, 1.7, 0.08, C.glass, 0, 3.9, D * 0.23 + 0.04, 0.04, glassMat); box(R, 0.08, 1.7, 1.2, C.glass, W * 0.23 + 0.04, 3.9, 0, 0.04, glassMat);
    cyl(R, 0.7, 0.95, 1.1, C.lilac, 0, 6.62, 0, {}, 40);
    const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.95, 0), mat(C.plum, { rough: 0.15, metal: 0.2, emissive: C.plum2, ei: 0.7 })); crystal.scale.set(0.8, 1.35, 0.8); crystal.castShadow = true; R.add(crystal);
    const r1 = torus(R, 1.7, 0.06, C.glow, 0, 9.4, 0, Math.PI / 2.4, { emissive: C.glow, ei: 1.2 }), r2 = torus(R, 2.2, 0.05, C.mid, 0, 9.4, 0, Math.PI / 1.7, { emissive: C.mid, ei: 0.8 });
    cyl(R, 0.05, 0.05, 1.8, C.deep, 0, 7.7, 0);
    ticks.push((t) => { crystal.rotation.y = t * 0.8; crystal.position.y = 9.4 + Math.sin(t * 1.4) * 0.18; r1.rotation.z = t * 0.6; r2.rotation.z = -t * 0.45; });
  } else if (key === 'sales') {
    [1.0, 1.8, 2.7, 3.7].forEach((h, i) => box(R, 1.0, h, 1.0, i === 3 ? C.plum : [C.mid, C.pink, C.glow][i], -2.4 + i * 1.5, 0, 0, 0.2, { emissive: C.plum, ei: 0.08 + i * 0.05 }));
  } else if (key === 'client-success') {
    dome(R, W * 0.46, C.lilac2, 0, 0, 0, { rough: 0.35 });
    torus(R, W * 0.46, 0.09, C.plum, 0, 0.2, 0, Math.PI / 2, { emissive: C.plum, ei: 0.3 });
  } else if (key === 'strategy-research') {
    gable(R, W + 0.9, 2.8, D + 0.9, C.lilac2, 0, 0, 0);
    const dm = dome(R, 1.7, C.white, 0, 2.2, -D * 0.12);
    const tel = new THREE.Group(); tel.position.set(0.1, 3.3, -D * 0.12 + 0.3); tel.rotation.set(-0.9, 0.55, 0); R.add(tel);
    cyl(tel, 0.3, 0.22, 2.0, C.plum, 0, 0, 0, { emissive: C.plum, ei: 0.2 }); cyl(tel, 0.36, 0.36, 0.2, C.deep, 0, 1.9, 0);
    ticks.push((t) => { dm.rotation.y = Math.sin(t * 0.3) * 0.25; });
  } else if (key === 'performance-creative') {
    const up = new THREE.Group(); up.position.set(W * 0.08, 0, -D * 0.04); up.rotation.y = 0.14; R.add(up);
    const uw = W * 0.72, ud = D * 0.62;
    box(up, uw, 2.7, ud, C.white, 0, 0, 0, 0.2); box(up, uw + 0.3, 0.2, ud + 0.3, C.plum, 0, 2.7, 0, 0.08, { emissive: C.plum, ei: 0.3 });
    box(up, uw * 0.8, 1.5, 0.08, C.glass, 0, 0.6, ud / 2 + 0.04, 0.04, glassMat); box(up, 0.08, 1.5, ud * 0.7, C.glass, uw / 2 + 0.04, 0.6, 0, 0.04, glassMat);
    const n = 3, pw = uw / n; for (let i = 0; i < n; i++) prism(up, pw, 1.5, ud, i % 2 ? C.lilac : C.lilac2, -uw / 2 + pw * (i + 0.5) - pw / 2, 2.9, 0);
  } else if (key === 'performance-delivery') {
    box(R, W * 0.74, 3.0, D * 0.74, C.white, 0, 0, 0, 0.22); box(R, W * 0.74 + 0.3, 0.2, D * 0.74 + 0.3, C.plum, 0, 3.0, 0, 0.08, { emissive: C.plum, ei: 0.3 });
    box(R, W * 0.44, 2.8, D * 0.44, C.white, 0, 3.2, 0, 0.2); box(R, W * 0.44 + 0.3, 0.2, D * 0.44 + 0.3, C.plum, 0, 6.0, 0, 0.08, { emissive: C.plum, ei: 0.3 });
    cyl(R, 0.28, 0.5, 4.2, C.white, 0, 6.2, 0, {}, 24); [7.2, 8.4, 9.6].forEach((h) => cyl(R, 0.5, 0.5, 0.12, C.plum, 0, h, 0, { emissive: C.plum, ei: 0.25 }, 24));
    const dish = new THREE.Group(); dish.position.set(0, 10.2, 0); R.add(dish);
    { const pts = []; for (let i = 0; i <= 12; i++) { const r = i / 12 * 1.5; pts.push(new THREE.Vector2(r, r * r * 0.42)); }
      const bowl = new THREE.Mesh(new THREE.LatheGeometry(pts, 40), mat(C.lilac, { side: THREE.DoubleSide, rough: 0.3 })); bowl.rotation.x = -1.0; bowl.position.set(0, 0.5, 0.35); bowl.castShadow = true; dish.add(bowl);
      const arm = cyl(dish, 0.05, 0.05, 1.5, C.deep, 0, 0.25, 0.95); arm.rotation.x = -1.0; arm.position.set(0, 0.95, 1.0); sph(dish, 0.13, C.glow, 0, 1.5, 1.6, { emissive: C.glow, ei: 1 });
      cyl(dish, 0.12, 0.12, 0.5, C.deep, 0, -0.1, 0, {}, 16); }
    const mega = new THREE.Group(); mega.position.set(W * 0.22, 3.0, D * 0.2); mega.rotation.set(0, 0.6, 0); R.add(mega);
    const cone = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 0.32, 1.8, 28), mat(C.plum, { emissive: C.plum, ei: 0.2 })); cone.rotation.z = -Math.PI / 2; cone.position.set(0.8, 1.3, 0); cone.castShadow = true; mega.add(cone);
    cyl(mega, 0.4, 0.4, 0.6, C.deep, -0.3, 1.0, 0).rotation.z = Math.PI / 2; cyl(mega, 0.1, 0.1, 1.0, C.deep, -0.3, 0, 0);
    const waves = [0.9, 1.4, 1.9].map((r, i) => { const w = torus(mega, r, 0.045, C.glow, 2.2 + i * 0.35, 1.3, 0, 0, { emissive: C.glow, ei: 1.0, opacity: 0.7 }); w.material = w.material.clone(); w.rotation.y = Math.PI / 2; return w; });
    ticks.push((t) => { dish.rotation.y = Math.sin(t * 0.4) * 0.5; waves.forEach((w, i) => { const k = (t * 0.7 + i * 0.33) % 1; w.scale.setScalar(0.4 + k * 0.9); w.material.opacity = 0.8 * (1 - k) + 0.02; }); });
  } else if (key === 'data-tracking-reporting') {
    const fans = [];
    [-W * 0.26, 0, W * 0.26].forEach((x) => { cyl(R, 1.25, 1.35, 1.1, C.white, x, 0, D * 0.2, {}, 40); const fan = new THREE.Group(); fan.position.set(x, 1.12, D * 0.2); R.add(fan); torus(fan, 1.0, 0.07, C.plum, 0, 0, 0, Math.PI / 2, { emissive: C.plum, ei: 0.3 }); [0, 1, 2].forEach((k) => { const bl = box(fan, 1.9, 0.05, 0.28, C.mid, 0, 0, 0, 0.02); bl.rotation.y = k * Math.PI / 3; }); fans.push(fan); });
    box(R, W * 0.8, 0.3, 0.5, C.deep, 0, 0.9, D * 0.34, 0.1);
    const scr = new THREE.Group(); scr.position.set(0, 0, -D / 2 + 1.2); R.add(scr);
    box(scr, 5.4, 3.0, 0.22, C.deep, 0, 1.4, 0, 0.12); plane(scr, 4.9, 2.6, chartTex(), 0, 2.7, 0.12); [-2, 2].forEach((x) => cyl(scr, 0.09, 0.09, 1.5, C.deep, x, 0, -0.05));
    ticks.push((t) => fans.forEach((f, i) => { f.rotation.y = t * (2 + i * 0.3); }));
  }
  return { R, ticks };
}

// ---------- exterior details: windows with frames, sills and mullions; a double door with a canopy; a big fascia sign over the entrance
const glassTexture = canvasTex(64, 128, (c, w, h) => {
  const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#efe4ff'); g.addColorStop(0.5, '#bba6f2'); g.addColorStop(1, '#8d78dc'); c.fillStyle = g; c.fillRect(0, 0, w, h);
  c.fillStyle = 'rgba(255,255,255,.38)'; c.beginPath(); c.moveTo(6, 0); c.lineTo(26, 0); c.lineTo(4, h * 0.75); c.lineTo(-16, h * 0.75); c.closePath(); c.fill();
  c.fillStyle = 'rgba(255,255,255,.18)'; c.beginPath(); c.moveTo(34, 0); c.lineTo(44, 0); c.lineTo(22, h * 0.75); c.lineTo(12, h * 0.75); c.closePath(); c.fill();
});
// three kinds of window glass: lit, half lit and dark at night (so the facades are not evenly lit)
const glassSet = [1.15, 0.6, 0.05].map(() => new THREE.MeshStandardMaterial({ map: glassTexture, roughness: 0.12, metalness: 0.15, emissive: 0x6a56c8, emissiveIntensity: 0.14 }));
glassSet.forEach((m) => { m.userData.noBoost = true; });
const glassMaterial = glassSet[0], glassDay = new THREE.Color(0x6a56c8), glassLit = new THREE.Color(0xffd9ea);
onNight((n) => glassSet.forEach((m, i) => { m.emissive.lerpColors(glassDay, glassLit, n); m.emissiveIntensity = 0.14 + n * [1.15, 0.6, 0.05][i]; }));
let glassCount = 0; const glassFor = () => glassSet[[0, 0, 1, 0, 2, 1, 0, 0, 1, 2, 0, 1][glassCount++ % 12]];
function pane(F, x, y, z, w, h, ry = 0, frame = C.white, mull = 1) { // y = the bottom of the glass, z = the wall surface, ry turns it to face along an arc
  const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = ry; F.add(g);
  box(g, w + 0.3, h + 0.3, 0.12, frame, 0, -0.15, 0, 0.04);
  const gl = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.06), glassFor()); gl.position.set(0, h / 2, 0.1); g.add(gl);
  for (let k = 1; k <= mull; k++) box(g, 0.07, h, 0.05, frame, -w / 2 + w * k / (mull + 1), 0, 0.12, 0.01);
  if (h > 1.8) box(g, w, 0.07, 0.05, frame, 0, h * 0.55, 0.12, 0.01);
  box(g, w + 0.5, 0.13, 0.32, C.lilac2, 0, -0.27, 0.1, 0.03);
  return g;
}
function doorway(F, x, z, ry = 0) { // two glass leaves in a plum frame, a canopy with two lamps and two steps
  const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = ry; F.add(g);
  box(g, 3.0, 3.5, 0.2, C.deep, 0, 0, 0, 0.05);
  [-0.62, 0.62].forEach((dx) => { const l = new THREE.Mesh(new THREE.BoxGeometry(1.15, 3.0, 0.06), glassMaterial); l.position.set(dx, 1.5, 0.12); g.add(l); box(g, 0.05, 0.7, 0.07, C.white, dx > 0 ? 0.2 : -0.2, 1.0, 0.18, 0.02); });
  box(g, 0.08, 3.0, 0.08, C.deep, 0, 0, 0.12, 0.02);
  const tr = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.34, 0.06), glassMaterial); tr.position.set(0, 3.22, 0.12); g.add(tr);
  box(g, 4.2, 0.2, 1.5, C.plum, 0, 3.55, 0.75, 0.06, { emissive: C.plum, ei: 0.25 });
  [-1.9, 1.9].forEach((sx) => { box(g, 0.08, 0.5, 0.08, C.deep, sx, 3.05, 1.35, 0.02); sph(g, 0.12, C.glow, sx * 0.92, 2.9, 0.18, { emissive: C.glow, ei: 1.4 }); });
  box(g, 3.8, 0.12, 1.5, C.lilac2, 0, 0, 0.75, 0.03); box(g, 3.3, 0.24, 0.7, C.lilac2, 0, 0, 0.35, 0.03);
  return g;
}
function fasciaTex(text, wU, hU, logo, onLight = false) { // white lettering and the emblem on a transparent plate (the plum band behind is a box)
  const S = 170, c = document.createElement('canvas'); c.width = Math.round(wU * S); c.height = Math.round(hU * S); const g = c.getContext('2d');
  const r = c.height * 0.4; g.font = `800 ${Math.round(c.height * 0.62)}px Onest, Arial, sans-serif`; try { g.letterSpacing = `${Math.round(c.height * 0.05)}px`; } catch (e) { /* older engines */ }
  g.textBaseline = 'middle'; g.textAlign = 'left'; const tw = g.measureText(text).width, gap = c.height * 0.3, total = r * 2 + gap + tw, x = (c.width - total) / 2;
  if (!onLight) { g.fillStyle = '#fff'; g.beginPath(); g.arc(x + r, c.height / 2, r, 0, 7); g.fill(); }
  g.drawImage(logo.emblemCanvas, x + r * (onLight ? 0 : 0.12), c.height / 2 - r * (onLight ? 1 : 0.88), r * (onLight ? 2 : 1.76), r * (onLight ? 2 : 1.76));
  g.fillStyle = onLight ? '#661466' : '#fff'; g.fillText(text, x + r * 2 + gap, c.height / 2 + c.height * 0.03);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
}
function fascia(F, key, W, D, H, logo) {
  const y0 = H - 2.0, h = 1.6, zS = D / 2 + 0.3, xS = W / 2 + 0.3;
  const own = key !== 'strategy-research'; // the colonnade building has its name on the entablature instead of a front band
  if (own) { box(F, W + 1.4, h, 0.9, C.deep, 0, y0, zS, 0.08); box(F, W + 1.5, 0.1, 0.95, C.plum, 0, y0 - 0.05, zS, 0.03, { emissive: C.plum, ei: 0.4 }); }
  box(F, 0.9, h, D + 1.4, C.deep, xS, y0, 0, 0.08); box(F, 0.95, 0.1, D + 1.5, C.plum, xS, y0 - 0.05, 0, 0.03, { emissive: C.plum, ei: 0.4 });
  const pw = Math.min(W - 1.0, 9.5), pd = Math.min(D - 1.0, 9.5);
  if (own) plane(F, pw, 1.3, fasciaTex(SIGN[key], pw, 1.3, logo), 0, y0 + h / 2, D / 2 + 0.77, 0, 0, true);
  plane(F, pd, 1.3, fasciaTex(SIGN[key], pd, 1.3, logo), W / 2 + 0.77, y0 + h / 2, 0, Math.PI / 2, 0, true);
}
function roundFascia(F, RR, H, text, logo) { // a curved sign band round the front of the circular building
  const th0 = -0.35, len = Math.PI / 2 + 0.7, r = RR + 0.78, h = 1.5, S = 170;
  const c = document.createElement('canvas'); c.width = Math.round(r * len * S); c.height = Math.round(h * S); const g = c.getContext('2d');
  g.fillStyle = '#661466'; g.fillRect(0, 0, c.width, c.height); g.fillStyle = '#b544b5'; g.fillRect(0, c.height - 14, c.width, 14);
  const rr = c.height * 0.36; g.font = `800 ${Math.round(c.height * 0.58)}px Onest, Arial, sans-serif`; try { g.letterSpacing = `${Math.round(c.height * 0.05)}px`; } catch (e) { /* older engines */ }
  g.textBaseline = 'middle'; const tw = g.measureText(text).width, gap = c.height * 0.3, total = rr * 2 + gap + tw, x = (c.width - total) / 2;
  g.fillStyle = '#fff'; g.beginPath(); g.arc(x + rr, c.height / 2, rr, 0, 7); g.fill(); g.drawImage(logo.emblemCanvas, x + rr * 0.12, c.height / 2 - rr * 0.88, rr * 1.76, rr * 1.76); g.fillText(text, x + rr * 2 + gap, c.height / 2 + 4);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 72, 1, true, th0, len), new THREE.MeshBasicMaterial({ map: t, toneMapped: false })); m.position.y = H - 2.0 + h / 2; F.add(m);
}

// windows along the +z face (x runs along the face) and along the +x face (z runs along it)
function windowsZ(F, W, zf, y, h, w, step, skip, frames, mull = 1) { const n = Math.max(1, Math.floor((W - 2.4) / step)); for (let i = 0, k = 0; i < n; i++) { const x = -W / 2 + 1.2 + (i + 0.5) * (W - 2.4) / n; if (skip && skip(x)) continue; pane(F, x, y, zf, w, h, 0, frames ? frames[k++ % frames.length] : C.white, mull); } }
function windowsX(F, D, xf, y, h, w, step, skip, frames, mull = 1) { const n = Math.max(1, Math.floor((D - 2.4) / step)); for (let i = 0, k = 0; i < n; i++) { const z = -D / 2 + 1.2 + (i + 0.5) * (D - 2.4) / n; if (skip && skip(z)) continue; pane(F, xf, y, z, w, h, Math.PI / 2, frames ? frames[k++ % frames.length] : C.white, mull); } }
function awning(F, cx, cz, len, alongX, y) { const N = 8; for (let k = 0; k < N; k++) { const u = (k + 0.5) / N - 0.5; const a = alongX ? box(F, len / N, 0.14, 1.5, k % 2 ? C.white : C.plum, cx + u * len, y, cz + 0.7, 0.04) : box(F, 1.5, 0.14, len / N, k % 2 ? C.white : C.plum, cx + 0.7, y, cz + u * len, 0.04); if (alongX) a.rotation.x = 0.3; else a.rotation.z = -0.3; } }

// ---------- facades (they sit on the front walls, so they shrink away when the building opens); every window ends below the fascia sign
function facade(key, F, W, D, H, logo) {
  const zf = D / 2 + 0.6, xf = W / 2 + 0.6;
  if (key === 'management') { // glass tower: three floors of tall panes
    [[0.8, 2.2], [3.8, 2.2], [6.8, 2.2]].forEach(([y, h], r) => { windowsZ(F, W, zf, y, h, 1.5, 2.1, r === 0 ? (x) => Math.abs(x) < 2.6 : null); windowsX(F, D, xf, y, h, 1.5, 2.1); });
  } else if (key === 'sales') { // shop front: wide display windows under striped awnings
    [-1, 1].forEach((s) => { const cx = s * (W / 4 + 0.9); pane(F, cx, 0.7, zf, 4.2, 2.4, 0, C.white, 3); awning(F, cx, zf, 4.8, true, 3.3); });
    const n = Math.max(2, Math.floor((D - 2.4) / 5)); for (let i = 0; i < n; i++) { const z = -D / 2 + 1.2 + (i + 0.5) * (D - 2.4) / n; pane(F, xf, 0.7, z, 3.4, 2.4, Math.PI / 2, C.white, 2); awning(F, xf, z, 4.0, false, 3.3); }
  } else if (key === 'strategy-research') { // classical porch: columns, an entablature carrying the name and a pediment
    const nC = Math.max(4, Math.round(W / 2.2)); const px = (i) => -W / 2 + 0.7 + i * (W - 1.4) / (nC - 1);
    box(F, W + 1.2, 0.3, 2.0, C.lilac2, 0, 0, D / 2 + 1.2, 0.06);
    for (let i = 0; i < nC; i++) { cyl(F, 0.3, 0.34, H - 1.7, C.white, px(i), 0.3, D / 2 + 1.9, {}, 24); cyl(F, 0.42, 0.42, 0.2, C.lilac2, px(i), 0.3, D / 2 + 1.9, {}, 24); }
    box(F, W + 1.2, 0.8, 2.4, C.white, 0, H - 1.4, D / 2 + 1.3, 0.08); box(F, W + 1.3, 0.14, 2.5, C.plum, 0, H - 0.6, D / 2 + 1.3, 0.04, { emissive: C.plum, ei: 0.3 });
    const s = new THREE.Shape(); s.moveTo(-(W + 1.4) / 2, 0); s.lineTo((W + 1.4) / 2, 0); s.lineTo(0, 1.7); s.closePath(); const pm = new THREE.Mesh(new THREE.ExtrudeGeometry(s, { depth: 0.5, bevelEnabled: false }), mat(C.white)); pm.position.set(0, H - 0.5, D / 2 + 2.0); pm.castShadow = true; F.add(pm);
    for (let i = 0; i < nC - 1; i++) { const x = (px(i) + px(i + 1)) / 2; if (Math.abs(x) < 1.5) continue; pane(F, x, 0.9, zf, 1.1, 3.2); pane(F, x, 4.8, zf, 1.1, 1.6); }
    windowsX(F, D, xf, 0.9, 3.2, 1.1, 2.8); windowsX(F, D, xf, 4.8, 1.6, 1.1, 2.8);
    plane(F, W - 2.6, 0.62, fasciaTex(SIGN[key], W - 2.6, 0.62, logo, true), 0, H - 1.0, D / 2 + 2.52, 0, 0, true); // the name sits on the entablature
  } else if (key === 'performance-creative') { // playful: windows in coloured frames and a round porthole
    const cols = [C.plum, C.pink, C.violet, C.dev, C.glow], px = -W * 0.26;
    windowsZ(F, W, zf, 0.9, 2.4, 1.5, 2.5, (x) => Math.abs(x) < 2.6 || Math.abs(x - px) < 2.0, cols); windowsZ(F, W, zf, 4.2, 0.95, 1.1, 2.5, null, cols, 0);
    const rim = cyl(F, 1.35, 1.35, 0.16, C.plum, px, 2.6, zf + 0.04, { emissive: C.plum, ei: 0.3 }, 40); rim.rotation.x = Math.PI / 2; const gc = new THREE.Mesh(new THREE.CylinderGeometry(1.12, 1.12, 0.08, 40), glassMaterial); gc.rotation.x = Math.PI / 2; gc.position.set(px, 2.6, zf + 0.14); F.add(gc);
    box(F, 2.24, 0.07, 0.05, C.white, px, 2.6, zf + 0.2, 0.01); box(F, 0.07, 2.24, 0.05, C.white, px, 1.48, zf + 0.2, 0.01);
    windowsX(F, D, xf, 0.9, 2.4, 1.5, 2.6, null, cols); windowsX(F, D, xf, 4.2, 0.95, 1.1, 2.6, null, cols, 0);
  } else if (key === 'performance-delivery') { // ribbon windows and a billboard on the side
    [[0.8, 1.9], [3.4, 1.9], [5.9, 0.9]].forEach(([y, h], r) => windowsZ(F, W, zf, y, h, 2.6, 3.2, r === 0 ? (x) => Math.abs(x) < 2.6 : null, null, 2));
    box(F, 0.16, 4.4, D - 3.0, C.deep, xf + 0.08, 1.3, 0, 0.08); plane(F, D - 3.5, 3.9, chartTex(), xf + 0.18, 3.5, 0, Math.PI / 2); windowsX(F, D, xf, 5.9, 0.9, 2.6, 3.2, null, null, 2);
  } else if (key === 'data-tracking-reporting') { // data centre: narrow slit windows below, a louvre grille above
    windowsZ(F, W, zf, 0.8, 2.6, 0.8, 2.6, (x) => Math.abs(x) < 2.6, [C.lilac2], 0); windowsX(F, D, xf, 0.8, 2.6, 0.8, 2.6, null, [C.lilac2], 0);
    for (let k = 0; k < 4; k++) { const y = 3.9 + k * 0.5, em = k % 2 ? {} : { emissive: C.plum, ei: 0.3 }; box(F, W - 0.8, 0.22, 0.24, k % 2 ? C.lilac2 : C.plum, 0, y, zf + 0.08, 0.04, em); box(F, 0.24, 0.22, D - 0.8, k % 2 ? C.lilac2 : C.plum, xf + 0.08, y, 0, 0.04, em); }
  }
}


// a back wall with real openings (so you see the street through the glass); ops = [{ c, w, y0, y1 }] along the wall
const clearGlass = new THREE.MeshStandardMaterial({ color: 0xcfc4ff, transparent: true, opacity: 0.16, roughness: 0.05, metalness: 0.1, emissive: 0x6a56c8, emissiveIntensity: 0.05, depthWrite: false });
clearGlass.userData.noBoost = true;
function wallWithOpenings(g, axis, len, H, fixed, ops, thick = 0.6) {
  const seg = (a, b, y0, y1) => { const l = b - a; if (l < 0.02 || y1 - y0 < 0.02) return; const m = (a + b) / 2; if (axis === 'x') box(g, l, y1 - y0, thick, C.white, m, y0, fixed, 0.06); else box(g, thick, y1 - y0, l, C.white, fixed, y0, m, 0.06); };
  let cur = -len / 2; [...ops].sort((p, q) => p.c - q.c).forEach((o) => { const a = o.c - o.w / 2, b = o.c + o.w / 2; seg(cur, a, 0, H); seg(a, b, 0, o.y0); seg(a, b, o.y1, H); cur = b; });
  seg(cur, len / 2, 0, H);
  ops.forEach((o) => {
    const h = o.y1 - o.y0, my = (o.y0 + o.y1) / 2, fr = (w, hh, x, y) => (axis === 'x' ? box(g, w, hh, thick + 0.1, C.white, x, y, fixed, 0.03) : box(g, thick + 0.1, hh, w, C.white, fixed, y, x, 0.03));
    const gl = new THREE.Mesh(axis === 'x' ? new THREE.BoxGeometry(o.w, h, 0.05) : new THREE.BoxGeometry(0.05, h, o.w), clearGlass); gl.position.set(axis === 'x' ? o.c : fixed, my, axis === 'x' ? fixed : o.c); gl.renderOrder = 2; g.add(gl);
    fr(o.w + 0.3, 0.16, o.c, o.y0 - 0.16); fr(o.w + 0.3, 0.16, o.c, o.y1); fr(0.16, h, o.c - o.w / 2 - 0.08, o.y0); fr(0.16, h, o.c + o.w / 2 + 0.08, o.y0); fr(0.08, h, o.c, o.y0); fr(o.w, 0.08, o.c, my);
  });
}

// a ring-shaped wall with real window openings (angles in radians, 0 = +x, pi/2 = +z)
function arcWithOpenings(g, rOut, rIn, a0, a1, H, ops, y0, y1) {
  let cur = a0;
  [...ops].sort((p, q) => p - q).forEach((c) => {
    const a = c - ARC_HW, b = c + ARC_HW;
    arcWall(g, rOut, rIn, cur, a, H, C.white); arcWall(g, rOut, rIn, a, b, y0, C.white); arcWall(g, rOut, rIn, a, b, H - y1, C.white, y1); cur = b;
  });
  arcWall(g, rOut, rIn, cur, a1, H, C.white);
  const rm = (rOut + rIn) / 2, fo = rOut + 0.07, fi = rIn - 0.07;
  ops.forEach((c) => {
    const a = c - ARC_HW, b = c + ARC_HW;
    const gl = arcWall(g, rm + 0.025, rm - 0.025, a, b, y1 - y0, C.white, y0); gl.material = clearGlass; gl.castShadow = false; gl.renderOrder = 2;
    arcWall(g, fo, fi, a - 0.03, b + 0.03, 0.16, C.white, y0 - 0.16); arcWall(g, fo, fi, a - 0.03, b + 0.03, 0.16, C.white, y1);
    arcWall(g, fo, fi, a - 0.03, a, y1 - y0, C.white, y0); arcWall(g, fo, fi, b, b + 0.03, y1 - y0, C.white, y0); arcWall(g, fo, fi, c - 0.012, c + 0.012, y1 - y0, C.white, y0);
  });
}
const ARC_HW = 12 * Math.PI / 180;
// a board that follows the curve of the round wall; deg = angle in degrees, 0 = +x, 90 = +z
function curvedPanel(g, r, deg0, deg1, y0, y1, tex) {
  const a0 = deg0 * Math.PI / 180, a1 = deg1 * Math.PI / 180;
  arcWall(g, r + 0.02, r - 0.08, a0 - 0.025, a1 + 0.025, y1 - y0 + 0.16, C.white, y0 - 0.08);
  tex.wrapS = THREE.RepeatWrapping; tex.repeat.x = -1; tex.offset.x = 1; // seen from inside the u axis runs the other way
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r - 0.1, r - 0.1, y1 - y0, 48, 1, true, Math.PI / 2 - a1, a1 - a0), new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, toneMapped: false }));
  m.position.y = (y0 + y1) / 2; g.add(m); return m;
}
const tint = (o, hex) => { const cache = new Map(); o.traverse((m) => { if (m.isMesh && ['mat_paint', 'mat_bag'].includes(m.material.name)) { if (!cache.has(m.material)) { const c = m.material.clone(); c.color.setHex(hex); cache.set(m.material, c); } m.material = cache.get(m.material); } }); return o; };
const splatTex = (seed) => canvasTex(256, 256, (c, w, h) => {
  let s = seed * 9301 + 49297; const r = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; }; const cols = ['#b544b5', '#f3b6e4', '#8f5bd6', '#f59b5b', '#7c8cf8', '#ffd76a', '#9fe0c8'];
  for (let k = 0; k < 4; k++) { c.fillStyle = cols[Math.floor(r() * cols.length)]; const x = 90 + r() * 76, y = 90 + r() * 76, R = 18 + r() * 34; c.beginPath(); for (let a = 0; a < 6.3; a += 0.35) { const rr = R * (0.75 + r() * 0.5); const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr; if (a === 0) c.moveTo(px, py); else c.lineTo(px, py); } c.closePath(); c.fill();
    for (let d = 0; d < 7; d++) { const a = r() * 6.3, dist = R + 8 + r() * 56; c.beginPath(); c.arc(x + Math.cos(a) * dist, y + Math.sin(a) * dist, 2 + r() * 7, 0, 7); c.fill(); }
    c.strokeStyle = c.fillStyle; c.lineWidth = 4 + r() * 6; c.lineCap = 'round'; c.beginPath(); const a2 = r() * 6.3; c.moveTo(x, y); c.lineTo(x + Math.cos(a2) * (R + 60), y + Math.sin(a2) * (R + 60)); c.stroke(); }
});
const neonTex = (text) => canvasTex(1040, 230, (c, w, h) => { c.font = '800 150px Onest, Arial, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.shadowColor = '#ff5de0'; c.shadowBlur = 38; c.fillStyle = '#ffd6fa'; c.fillText(text, w / 2, h / 2 + 6); c.shadowBlur = 16; c.fillStyle = '#ffffff'; c.fillText(text, w / 2, h / 2 + 6); });


const bigMapTex = () => canvasTex(1024, 640, (c, w, h) => {
  c.fillStyle = '#fbf3fd'; c.fillRect(0, 0, w, h); c.strokeStyle = '#efdcf4'; c.lineWidth = 2; for (let x = 0; x < w; x += 64) { c.beginPath(); c.moveTo(x, 70); c.lineTo(x, h); c.stroke(); } for (let y = 70; y < h; y += 64) { c.beginPath(); c.moveTo(0, y); c.lineTo(w, y); c.stroke(); }
  c.fillStyle = '#e9d3f1'; [[220, 330, 150], [560, 250, 190], [850, 400, 140], [420, 520, 120]].forEach(([x, y, r]) => { c.beginPath(); c.ellipse(x, y, r * 1.3, r * 0.7, 0.3, 0, 7); c.fill(); });
  c.strokeStyle = '#cfd9ff'; c.lineWidth = 16; c.lineCap = 'round'; c.beginPath(); c.moveTo(0, 250); c.bezierCurveTo(250, 160, 350, 480, 620, 380); c.bezierCurveTo(780, 320, 900, 470, 1024, 420); c.stroke();
  const g = c.createLinearGradient(0, 0, w, 0); g.addColorStop(0, '#b544b5'); g.addColorStop(1, '#661466'); c.fillStyle = g; c.fillRect(0, 0, w, 70); c.fillStyle = '#fff'; c.font = '800 38px Onest, Arial, sans-serif'; c.textBaseline = 'middle'; c.fillText('КАРТА СТРАТЕГІЇ', 28, 37);
  const P = [[110, 500], [270, 400], [430, 450], [610, 310], [770, 360], [930, 210]];
  c.strokeStyle = '#b544b5'; c.lineWidth = 8; c.setLineDash([20, 14]); c.beginPath(); P.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); c.stroke(); c.setLineDash([]);
  [['#ffd76a', 150, 140, -0.1], ['#f3b6e4', 330, 170, 0.08], ['#9fe0c8', 700, 140, -0.06], ['#f59b5b', 880, 520, 0.1], ['#7c8cf8', 560, 560, -0.08]].forEach(([col, x, y, a]) => { c.save(); c.translate(x, y); c.rotate(a); c.fillStyle = col; c.fillRect(-52, -38, 104, 76); c.fillStyle = 'rgba(40,10,50,.35)'; for (let k = 0; k < 3; k++) c.fillRect(-38, -20 + k * 18, 76 - k * 14, 5); c.restore(); c.fillStyle = '#d94a8c'; c.beginPath(); c.arc(x, y - 30, 7, 0, 7); c.fill(); });
  c.strokeStyle = '#d94a8c'; c.lineWidth = 2.5; [[150, 110, 270, 400], [330, 140, 430, 450], [700, 110, 610, 310], [880, 490, 770, 360]].forEach(([a, b, x, y]) => { c.beginPath(); c.moveTo(a, b); c.lineTo(x, y); c.stroke(); });
  P.forEach(([x, y], i) => { c.fillStyle = '#fff'; c.strokeStyle = '#b544b5'; c.lineWidth = 6; c.beginPath(); c.arc(x, y, 28, 0, 7); c.fill(); c.stroke(); c.fillStyle = '#661466'; c.font = '800 30px Onest, Arial, sans-serif'; c.textAlign = 'center'; c.fillText(String(i + 1), x, y + 2); });
});
const flowTex = () => canvasTex(1024, 520, (c, w, h) => {
  c.fillStyle = '#ffffff'; c.fillRect(0, 0, w, h); c.fillStyle = '#661466'; c.fillRect(0, 0, w, 64); c.fillStyle = '#fff'; c.font = '800 34px Onest, Arial, sans-serif'; c.textBaseline = 'middle'; c.fillText('ПЛАН НА КВАРТАЛ', 26, 34);
  const cols = ['#b544b5', '#8f5bd6', '#f59b5b', '#7c8cf8'], names = ['Дослід.', 'Аналіз', 'Стратегія', 'Запуск'];
  names.forEach((n, i) => { const x = 40 + i * 245; c.fillStyle = cols[i]; c.beginPath(); c.roundRect(x, 100, 200, 90, 18); c.fill(); c.fillStyle = '#fff'; c.font = '700 30px Onest, Arial, sans-serif'; c.textAlign = 'center'; c.fillText(n, x + 100, 146); if (i < 3) { c.strokeStyle = '#661466'; c.lineWidth = 6; c.beginPath(); c.moveTo(x + 205, 145); c.lineTo(x + 238, 145); c.stroke(); c.fillStyle = '#661466'; c.beginPath(); c.moveTo(x + 240, 145); c.lineTo(x + 224, 135); c.lineTo(x + 224, 155); c.fill(); } });
  c.strokeStyle = '#ebc6eb'; c.lineWidth = 2; for (let y = 240; y < 500; y += 52) { c.beginPath(); c.moveTo(40, y); c.lineTo(560, y); c.stroke(); }
  c.strokeStyle = '#b544b5'; c.lineWidth = 8; c.lineJoin = 'round'; c.beginPath(); [[60, 470], [150, 420], [240, 440], [330, 350], [420, 330], [540, 260]].forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); c.stroke();
  [[60, 470], [150, 420], [240, 440], [330, 350], [420, 330], [540, 260]].forEach(([x, y]) => { c.fillStyle = '#fff'; c.strokeStyle = '#661466'; c.lineWidth = 5; c.beginPath(); c.arc(x, y, 11, 0, 7); c.fill(); c.stroke(); });
  c.fillStyle = '#ffd76a'; c.beginPath(); c.arc(760, 330, 70, 0, 7); c.fill(); c.strokeStyle = '#f59b5b'; c.lineWidth = 8; for (let k = 0; k < 10; k++) { const a = k / 10 * 6.283; c.beginPath(); c.moveTo(760 + Math.cos(a) * 88, 330 + Math.sin(a) * 88); c.lineTo(760 + Math.cos(a) * 112, 330 + Math.sin(a) * 112); c.stroke(); }
  c.fillStyle = '#b8a4e8'; c.fillRect(735, 395, 50, 26); [['#f3b6e4', 880, 250], ['#9fe0c8', 930, 330], ['#7c8cf8', 870, 420]].forEach(([col, x, y]) => { c.fillStyle = col; c.fillRect(x, y, 90, 70); });
});
const compassTex = () => canvasTex(512, 512, (c, w, h) => {
  c.translate(256, 256); c.strokeStyle = '#b544b5'; c.lineWidth = 7; c.beginPath(); c.arc(0, 0, 220, 0, 7); c.stroke(); c.strokeStyle = '#d9a6df'; c.lineWidth = 4; c.beginPath(); c.arc(0, 0, 168, 0, 7); c.stroke();
  for (let k = 0; k < 48; k++) { const a = k / 48 * 6.283, l = k % 4 === 0 ? 30 : 14; c.strokeStyle = '#b544b5'; c.lineWidth = k % 4 === 0 ? 5 : 3; c.beginPath(); c.moveTo(Math.cos(a) * 220, Math.sin(a) * 220); c.lineTo(Math.cos(a) * (220 - l), Math.sin(a) * (220 - l)); c.stroke(); }
  for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4, R = k % 2 ? 120 : 190; c.fillStyle = k % 2 ? '#d9a6df' : (k % 4 === 0 ? '#661466' : '#b544b5'); c.beginPath(); c.moveTo(Math.cos(a) * R, Math.sin(a) * R); c.lineTo(Math.cos(a + 0.28) * 34, Math.sin(a + 0.28) * 34); c.lineTo(Math.cos(a - 0.28) * 34, Math.sin(a - 0.28) * 34); c.closePath(); c.fill(); }
  c.fillStyle = '#661466'; c.font = '800 44px Onest, Arial, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('Пн', 0, -246 + 0);
});


const adsWallTex = () => canvasTex(2048, 640, (c, w, h) => {
  c.fillStyle = '#170828'; c.fillRect(0, 0, w, h);
  const tiles = [['Google Ads', 'ROAS 4.8×', 'line'], ['Meta Ads', 'CPA ₴126', 'bars'], ['TikTok Ads', 'CTR 3.1%', 'area'], ['Бюджет', '78%', 'donut'], ['Воронка', '1 284', 'funnel'], ['Активність', 'за годинами', 'heat']];
  tiles.forEach(([title, val, kind], i) => {
    const x = 28 + (i % 3) * 668, y = 28 + Math.floor(i / 3) * 302, tw = 640, th = 280;
    c.fillStyle = '#2a1050'; c.beginPath(); c.roundRect(x, y, tw, th, 26); c.fill(); c.strokeStyle = '#8f5bd6'; c.lineWidth = 3; c.stroke();
    c.fillStyle = '#d9a6df'; c.font = '700 28px Onest, Arial, sans-serif'; c.textBaseline = 'top'; c.textAlign = 'left'; c.fillText(title, x + 26, y + 20);
    c.fillStyle = '#ffffff'; c.font = '800 52px Onest, Arial, sans-serif'; c.fillText(val, x + 26, y + 58);
    const cx = x + 26, cy = y + 128, cw = tw - 52, ch = th - 150;
    if (kind === 'line' || kind === 'area') { const pts = [0.15, 0.3, 0.22, 0.5, 0.42, 0.7, 0.62, 0.9].map((v, k) => [cx + k / 7 * cw, cy + ch - v * ch]); c.strokeStyle = kind === 'line' ? '#eb9cef' : '#9fe0c8'; c.lineWidth = 6; c.lineJoin = 'round'; c.beginPath(); pts.forEach(([px, py], k) => (k ? c.lineTo(px, py) : c.moveTo(px, py))); c.stroke(); if (kind === 'area') { c.lineTo(cx + cw, cy + ch); c.lineTo(cx, cy + ch); c.closePath(); c.fillStyle = 'rgba(159,224,200,.28)'; c.fill(); } else pts.forEach(([px, py]) => { c.fillStyle = '#fff'; c.beginPath(); c.arc(px, py, 7, 0, 7); c.fill(); }); }
    if (kind === 'bars') [0.35, 0.55, 0.45, 0.8, 0.65, 0.95].forEach((v, k) => { c.fillStyle = k % 2 ? '#7c8cf8' : '#b544b5'; c.fillRect(cx + k * (cw / 6) + 6, cy + ch - v * ch, cw / 6 - 18, v * ch); });
    if (kind === 'donut') { const R = ch * 0.55; c.lineWidth = 26; c.strokeStyle = '#3d1c70'; c.beginPath(); c.arc(cx + cw * 0.5, cy + ch * 0.5, R, 0, 7); c.stroke(); c.strokeStyle = '#f59b5b'; c.beginPath(); c.arc(cx + cw * 0.5, cy + ch * 0.5, R, -1.57, -1.57 + 6.283 * 0.78); c.stroke(); }
    if (kind === 'funnel') [1, 0.78, 0.55, 0.36].forEach((v, k) => { c.fillStyle = ['#b544b5', '#8f5bd6', '#7c8cf8', '#9fe0c8'][k]; const ww = cw * v; c.fillRect(cx + (cw - ww) / 2, cy + k * (ch / 4), ww, ch / 4 - 6); });
    if (kind === 'heat') for (let r = 0; r < 4; r++) for (let q = 0; q < 12; q++) { const v = (Math.sin(q * 0.9 + r) + 1) / 2; c.fillStyle = `rgba(235,156,239,${0.15 + v * 0.8})`; c.fillRect(cx + q * (cw / 12) + 2, cy + r * (ch / 4) + 2, cw / 12 - 6, ch / 4 - 6); }
  });
});
const budgetTex = () => canvasTex(1024, 640, (c, w, h) => {
  c.fillStyle = '#ffffff'; c.fillRect(0, 0, w, h); c.fillStyle = '#661466'; c.fillRect(0, 0, w, 84); c.fillStyle = '#fff'; c.font = '800 44px Onest, Arial, sans-serif'; c.textBaseline = 'middle'; c.textAlign = 'left'; c.fillText('БЮДЖЕТ ПО КАНАЛАХ', 36, 44);
  [['Google', 0.72, '#b544b5'], ['Meta', 0.58, '#8f5bd6'], ['TikTok', 0.41, '#f59b5b']].forEach(([n, v, col], i) => { const y = 130 + i * 104; c.fillStyle = '#270827'; c.font = '700 36px Onest, Arial, sans-serif'; c.fillText(n, 36, y + 28); c.fillStyle = '#f1dcf5'; c.beginPath(); c.roundRect(230, y + 8, 600, 40, 20); c.fill(); c.fillStyle = col; c.beginPath(); c.roundRect(230, y + 8, 600 * v, 40, 20); c.fill(); c.fillStyle = '#270827'; c.textAlign = 'right'; c.fillText(Math.round(v * 100) + '%', w - 36, y + 28); c.textAlign = 'left'; });
  [['ROAS ▲ 4.8×', '#b544b5'], ['CPA ▼ 12%', '#8f5bd6']].forEach(([t, col], i) => { c.fillStyle = col; c.beginPath(); c.roundRect(36 + i * 490, 460, 460, 130, 28); c.fill(); c.fillStyle = '#fff'; c.font = '800 54px Onest, Arial, sans-serif'; c.textAlign = 'center'; c.fillText(t, 36 + i * 490 + 230, 526); c.textAlign = 'left'; });
});
const tickerTex = () => { const t = canvasTex(2048, 96, (c, w, h) => { c.fillStyle = '#170828'; c.fillRect(0, 0, w, h); c.font = '800 54px Onest, Arial, sans-serif'; c.textBaseline = 'middle'; c.shadowColor = '#ff5de0'; c.shadowBlur = 18; c.fillStyle = '#ffd6fa'; const seg = 'ROAS ▲ 4.8×   •   CPA ▼ 12%   •   CTR ▲ 3.1%   •   КОНВЕРСІЇ ▲ 1 284   •   '; c.fillText(seg, 20, h / 2 + 4); }); t.wrapS = THREE.RepeatWrapping; return t; };
const bullseyeTex = () => canvasTex(512, 512, (c) => { [[250, '#b544b5'], [205, '#ffffff'], [160, '#b544b5'], [115, '#ffffff'], [70, '#f59b5b'], [28, '#661466']].forEach(([r, col]) => { c.globalAlpha = 0.55; c.fillStyle = col; c.beginPath(); c.arc(256, 256, r, 0, 7); c.fill(); }); });


const netScreenTex = (logo) => canvasTex(1536, 800, (c, w, h) => {
  c.fillStyle = '#140626'; c.fillRect(0, 0, w, h); const g0 = c.createRadialGradient(768, 400, 20, 768, 400, 700); g0.addColorStop(0, 'rgba(181,68,181,.35)'); g0.addColorStop(1, 'rgba(20,6,38,0)'); c.fillStyle = g0; c.fillRect(0, 0, w, h);
  c.fillStyle = '#d9a6df'; c.font = '800 40px Onest, Arial, sans-serif'; c.textBaseline = 'middle'; c.textAlign = 'left'; c.fillText('AI-КООРДИНАЦІЯ', 44, 52);
  const hub = [768, 395], nodes = [['Продажі', '#f59b5b'], ['Клієнти', '#9fe0c8'], ['Стратегія', '#8f5bd6'], ['Креативи', '#f3b6e4'], ['Реклама', '#7c8cf8'], ['Дані', '#ffd76a']];
  const pos = nodes.map((n, i) => { const a = -Math.PI / 2 + (i + 0.5) / 6 * Math.PI * 2; return [hub[0] + Math.cos(a) * 520, hub[1] + Math.sin(a) * 250]; });
  pos.forEach(([x, y], i) => { c.strokeStyle = nodes[i][1]; c.lineWidth = 5; c.globalAlpha = 0.75; c.beginPath(); c.moveTo(hub[0], hub[1]); c.lineTo(x, y); c.stroke(); c.globalAlpha = 1; for (let k = 1; k < 5; k++) { const t = k / 5 + (i % 2) * 0.07; c.fillStyle = '#fff'; c.beginPath(); c.arc(hub[0] + (x - hub[0]) * t, hub[1] + (y - hub[1]) * t, 7, 0, 7); c.fill(); } });
  c.fillStyle = '#2a1050'; c.beginPath(); c.arc(hub[0], hub[1], 92, 0, 7); c.fill(); c.strokeStyle = '#eb9cef'; c.lineWidth = 8; c.stroke(); if (logo) c.drawImage(logo.emblemCanvas, hub[0] - 62, hub[1] - 62, 124, 124);
  pos.forEach(([x, y], i) => { c.fillStyle = '#2a1050'; c.beginPath(); c.roundRect(x - 120, y - 38, 240, 76, 38); c.fill(); c.strokeStyle = nodes[i][1]; c.lineWidth = 6; c.stroke(); c.fillStyle = nodes[i][1]; c.beginPath(); c.arc(x - 78, y, 14, 0, 7); c.fill(); c.fillStyle = '#fff'; c.font = '800 34px Onest, Arial, sans-serif'; c.textAlign = 'left'; c.fillText(nodes[i][0], x - 52, y + 2); });
  [['ЗАДАЧ У ЧЕРЗІ', '12', '#b544b5'], ['В РОБОТІ', '3', '#8f5bd6'], ['НА ЗАТВЕРДЖЕННІ', '5', '#f59b5b']].forEach(([t, v, col], i) => { const x = 44 + i * 500; c.fillStyle = '#2a1050'; c.beginPath(); c.roundRect(x, 700, 460, 76, 24); c.fill(); c.fillStyle = col; c.fillRect(x, 700, 12, 76); c.fillStyle = '#d9a6df'; c.font = '700 26px Onest, Arial, sans-serif'; c.textAlign = 'left'; c.fillText(t, x + 32, 738); c.fillStyle = '#fff'; c.font = '800 46px Onest, Arial, sans-serif'; c.textAlign = 'right'; c.fillText(v, x + 430, 738); });
});
const orgTex = () => canvasTex(1024, 640, (c, w, h) => {
  c.fillStyle = '#fff'; c.fillRect(0, 0, w, h); c.fillStyle = '#661466'; c.fillRect(0, 0, w, 80); c.fillStyle = '#fff'; c.font = '800 42px Onest, Arial, sans-serif'; c.textBaseline = 'middle'; c.textAlign = 'left'; c.fillText('ОРГСТРУКТУРА AI', 34, 42);
  c.fillStyle = '#b544b5'; c.beginPath(); c.roundRect(352, 118, 320, 84, 22); c.fill(); c.fillStyle = '#fff'; c.font = '800 38px Onest, Arial, sans-serif'; c.textAlign = 'center'; c.fillText('Керування', 512, 162);
  const kids = [['Продажі', '#f59b5b'], ['Клієнти', '#9fe0c8'], ['Стратегія', '#8f5bd6'], ['Креативи', '#f3b6e4'], ['Реклама', '#7c8cf8'], ['Дані', '#ffd76a']];
  c.strokeStyle = '#661466'; c.lineWidth = 5; c.beginPath(); c.moveTo(512, 202); c.lineTo(512, 262); c.moveTo(90, 262); c.lineTo(934, 262); c.stroke();
  kids.forEach(([n, col], i) => { const x = 90 + i * 168.8; c.beginPath(); c.moveTo(x, 262); c.lineTo(x, 320); c.stroke(); c.fillStyle = col; c.beginPath(); c.roundRect(x - 74, 320, 148, 150, 20); c.fill(); c.fillStyle = '#270827'; c.font = '800 28px Onest, Arial, sans-serif'; c.fillText(n, x, 372); c.fillStyle = 'rgba(39,8,39,.55)'; c.font = '600 22px Onest, Arial, sans-serif'; c.fillText(['9 аг.', '2 аг.', '4 аг.', '6 аг.', '6 аг.', '2 аг.'][i], x, 420); });
  c.fillStyle = '#f1dcf5'; c.beginPath(); c.roundRect(40, 520, 944, 80, 22); c.fill(); c.fillStyle = '#661466'; c.font = '700 30px Onest, Arial, sans-serif'; c.fillText('31 агент · 7 відділів · людина затверджує результат', 512, 562);
});
const clockLabelTex = (t) => canvasTex(512, 128, (c, w, h) => { c.fillStyle = '#661466'; c.beginPath(); c.roundRect(0, 0, w, h, 40); c.fill(); c.fillStyle = '#fff'; c.font = '800 58px Onest, Arial, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(t, w / 2, h / 2 + 3); });

const funnelBoardTex = () => canvasTex(1180, 520, (c, w, h) => {
  c.fillStyle = '#fff'; c.fillRect(0, 0, w, h); c.fillStyle = '#661466'; c.fillRect(0, 0, w, 78);
  c.fillStyle = '#fff'; c.font = '800 40px Onest, Arial, sans-serif'; c.textBaseline = 'middle'; c.textAlign = 'left'; c.fillText('ВОРОНКА ПРОДАЖІВ', 34, 40);
  c.fillStyle = '#eb9cef'; c.font = '700 28px Onest, Arial, sans-serif'; c.textAlign = 'right'; c.fillText('цей місяць', w - 34, 41);
  const st = [['Ліди', 1240, '#f3b6e4'], ['Кваліфіковані', 612, '#d9a6df'], ['Пропозиція', 318, '#b544b5'], ['Переговори', 140, '#8f5bd6'], ['Угода', 62, '#661466']];
  st.forEach(([n, v, col], i) => {
    const y = 104 + i * 80, wi = 640 - i * 112, x = 40 + (640 - wi) / 2;
    c.fillStyle = col; c.beginPath(); c.roundRect(x, y, wi, 66, 14); c.fill();
    c.fillStyle = i < 2 ? '#661466' : '#fff'; c.font = '800 32px Onest, Arial, sans-serif'; c.textAlign = 'center'; c.fillText(n + ' · ' + v, 40 + 320, y + 34);
    if (i) { c.fillStyle = '#9a6aa0'; c.font = '700 26px Onest, Arial, sans-serif'; c.textAlign = 'left'; c.fillText('→ ' + Math.round(v / st[i - 1][1] * 100) + '%', 710, y + 34); }
  });
  c.fillStyle = '#fbf3fd'; c.beginPath(); c.roundRect(850, 104, 300, 150, 22); c.fill(); c.fillStyle = '#9a6aa0'; c.font = '700 24px Onest, Arial, sans-serif'; c.textAlign = 'center'; c.fillText('ПЛАН МІСЯЦЯ', 1000, 140);
  c.fillStyle = '#661466'; c.font = '800 66px Onest, Arial, sans-serif'; c.fillText('72%', 1000, 202);
  c.fillStyle = '#eddff0'; c.beginPath(); c.roundRect(870, 226, 260, 14, 7); c.fill(); c.fillStyle = '#e0457b'; c.beginPath(); c.roundRect(870, 226, 260 * 0.72, 14, 7); c.fill();
  c.fillStyle = '#fbf3fd'; c.beginPath(); c.roundRect(850, 278, 300, 226, 22); c.fill(); c.fillStyle = '#9a6aa0'; c.font = '700 24px Onest, Arial, sans-serif'; c.fillText('СЕРЕДНІЙ ЧЕК', 1000, 314);
  c.fillStyle = '#661466'; c.font = '800 54px Onest, Arial, sans-serif'; c.fillText('$4 800', 1000, 372);
  c.strokeStyle = '#b544b5'; c.lineWidth = 6; c.beginPath(); [[880, 470], [930, 440], [975, 452], [1030, 414], [1080, 424], [1120, 392]].forEach(([x, y], i) => i ? c.lineTo(x, y) : c.moveTo(x, y)); c.stroke();
});
const leaderTex = () => canvasTex(1180, 520, (c, w, h) => {
  c.fillStyle = '#fff'; c.fillRect(0, 0, w, h); c.fillStyle = '#b544b5'; c.fillRect(0, 0, w, 78);
  c.fillStyle = '#fff'; c.font = '800 40px Onest, Arial, sans-serif'; c.textBaseline = 'middle'; c.textAlign = 'left'; c.fillText('ЗАКРИТІ УГОДИ · РЕЙТИНГ', 34, 40);
  const rows = [['1', 'Агент кваліфікації лідів', 86, '#f5c26b'], ['2', 'Агент контролю стану угод', 71, '#d6d0de'], ['3', 'Агент аналізу відповідей', 58, '#f59b5b'], ['4', 'Агент написання листів', 44, '#d9a6df'], ['5', 'Агент підбору кейсу', 31, '#d9a6df']];
  rows.forEach(([n, name, v, col], i) => {
    const y = 104 + i * 80;
    c.fillStyle = '#fbf3fd'; c.beginPath(); c.roundRect(34, y, w - 68, 66, 16); c.fill();
    c.fillStyle = col; c.beginPath(); c.arc(80, y + 33, 25, 0, 7); c.fill(); c.fillStyle = '#270827'; c.font = '800 30px Onest, Arial, sans-serif'; c.textAlign = 'center'; c.fillText(n, 80, y + 35);
    c.fillStyle = '#270827'; c.font = '700 30px Onest, Arial, sans-serif'; c.textAlign = 'left'; c.fillText(name, 132, y + 35);
    c.fillStyle = '#eddff0'; c.beginPath(); c.roundRect(640, y + 22, 400, 22, 11); c.fill(); c.fillStyle = i ? '#b544b5' : '#e0457b'; c.beginPath(); c.roundRect(640, y + 22, 400 * v / 100, 22, 11); c.fill();
    c.fillStyle = '#661466'; c.font = '800 30px Onest, Arial, sans-serif'; c.textAlign = 'right'; c.fillText(v + '%', w - 54, y + 35);
  });
});

const journeyTex = () => canvasTex(1100, 540, (c, w, h) => {
  c.fillStyle = '#fff'; c.fillRect(0, 0, w, h); c.fillStyle = '#661466'; c.fillRect(0, 0, w, 82);
  c.fillStyle = '#fff'; c.font = '800 42px Onest, Arial, sans-serif'; c.textBaseline = 'middle'; c.textAlign = 'left'; c.fillText('ШЛЯХ КЛІЄНТА', 36, 42);
  c.fillStyle = '#eb9cef'; c.font = '700 28px Onest, Arial, sans-serif'; c.textAlign = 'right'; c.fillText('від знайомства до продовження', w - 36, 43);
  const st = [['Знайомство', '#f3b6e4', 'бриф, цілі'], ['Онбординг', '#d9a6df', 'доступи, старт'], ['Запуск', '#b544b5', 'кампанії'], ['Звіти', '#8f5bd6', 'щотижня'], ['Продовження', '#661466', 'ріст, upsell']];
  c.strokeStyle = '#eddff0'; c.lineWidth = 12; c.lineCap = 'round'; c.beginPath(); c.moveTo(110, 200); c.lineTo(990, 200); c.stroke();
  st.forEach(([n, col, sub], i) => {
    const x = 110 + i * 220;
    c.fillStyle = col; c.beginPath(); c.arc(x, 200, 52, 0, 7); c.fill(); c.fillStyle = i < 2 ? '#661466' : '#fff'; c.font = '800 46px Onest, Arial, sans-serif'; c.textAlign = 'center'; c.fillText(String(i + 1), x, 203);
    c.fillStyle = '#270827'; c.font = '800 32px Onest, Arial, sans-serif'; c.fillText(n, x, 292); c.fillStyle = '#9a6aa0'; c.font = '600 25px Onest, Arial, sans-serif'; c.fillText(sub, x, 334);
  });
  [['AI-акаунт-менеджер', '#b544b5', 40], ['AI-координатор онбордингу', '#8f5bd6', 420]].forEach(([t, col, x]) => { c.fillStyle = '#fbf3fd'; c.beginPath(); c.roundRect(x, 394, 360, 96, 26); c.fill(); c.fillStyle = col; c.beginPath(); c.arc(x + 48, 442, 22, 0, 7); c.fill(); c.fillStyle = '#270827'; c.font = '700 27px Onest, Arial, sans-serif'; c.textAlign = 'left'; c.fillText(t, x + 84, 444); });
  c.fillStyle = '#fbf3fd'; c.beginPath(); c.roundRect(820, 394, 244, 96, 26); c.fill(); c.fillStyle = '#9a6aa0'; c.font = '700 22px Onest, Arial, sans-serif'; c.textAlign = 'center'; c.fillText('ПРОДОВЖЕННЯ', 942, 422); c.fillStyle = '#661466'; c.font = '800 44px Onest, Arial, sans-serif'; c.fillText('91%', 942, 465);
});
const npsTex = () => canvasTex(540, 560, (c, w, h) => {
  c.fillStyle = '#fff'; c.fillRect(0, 0, w, h); c.fillStyle = '#e0457b'; c.fillRect(0, 0, w, 78);
  c.fillStyle = '#fff'; c.font = '800 38px Onest, Arial, sans-serif'; c.textBaseline = 'middle'; c.textAlign = 'left'; c.fillText('ЗАДОВОЛЕНІСТЬ', 30, 40);
  c.lineWidth = 34; c.lineCap = 'butt'; [['#6fd39a', 0, 0.72], ['#ffd76a', 0.72, 0.9], ['#f0668f', 0.9, 1]].forEach(([col, a, b]) => { c.strokeStyle = col; c.beginPath(); c.arc(270, 270, 112, -Math.PI / 2 + a * Math.PI * 2, -Math.PI / 2 + b * Math.PI * 2); c.stroke(); });
  c.fillStyle = '#661466'; c.font = '800 88px Onest, Arial, sans-serif'; c.textAlign = 'center'; c.fillText('72', 270, 262); c.fillStyle = '#9a6aa0'; c.font = '700 26px Onest, Arial, sans-serif'; c.fillText('NPS', 270, 322);
  c.fillStyle = '#ffd76a'; c.font = '800 54px Onest, Arial, sans-serif'; c.fillText('★★★★★', 270, 440); c.fillStyle = '#270827'; c.font = '800 34px Onest, Arial, sans-serif'; c.fillText('4.8 з 5', 270, 500);
});
const meetTex = () => canvasTex(540, 560, (c, w, h) => {
  c.fillStyle = '#fff'; c.fillRect(0, 0, w, h); c.fillStyle = '#7c8cf8'; c.fillRect(0, 0, w, 78);
  c.fillStyle = '#fff'; c.font = '800 38px Onest, Arial, sans-serif'; c.textBaseline = 'middle'; c.textAlign = 'left'; c.fillText('ЗУСТРІЧІ · ТИЖДЕНЬ', 30, 40);
  ['Пн', 'Вт', 'Ср', 'Чт', 'Пт'].forEach((d, i) => {
    const y = 100 + i * 90; c.fillStyle = '#fbf3fd'; c.beginPath(); c.roundRect(24, y, w - 48, 78, 16); c.fill();
    c.fillStyle = '#661466'; c.font = '800 30px Onest, Arial, sans-serif'; c.textAlign = 'left'; c.fillText(d, 44, y + 40);
    [[100, 130, '#b544b5'], [260, 90, '#8f5bd6'], [370, 110, '#f59b5b']].forEach(([x, ww, col], k) => { if ((i + k) % 3 === 2) return; c.fillStyle = col; c.beginPath(); c.roundRect(x, y + 14, ww, 50, 12); c.fill(); });
  });
});
const welcomeMatTex = () => canvasTex(640, 280, (c, w, h) => {
  c.fillStyle = '#b544b5'; c.beginPath(); c.roundRect(8, 8, w - 16, h - 16, 40); c.fill(); c.strokeStyle = '#f3b6e4'; c.lineWidth = 8; c.beginPath(); c.roundRect(28, 28, w - 56, h - 56, 28); c.stroke();
  c.fillStyle = '#fff'; c.font = '800 66px Onest, Arial, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('ЛАСКАВО', w / 2, 100); c.fillText('ПРОСИМО', w / 2, 180);
  c.fillStyle = '#f3b6e4'; c.beginPath(); c.arc(78, 140, 14, 0, 7); c.arc(562, 140, 14, 0, 7); c.fill();
});

const dashTex = () => canvasTex(1100, 580, (c, w, h) => {
  c.fillStyle = '#fff'; c.fillRect(0, 0, w, h); c.fillStyle = '#661466'; c.fillRect(0, 0, w, 78);
  c.fillStyle = '#fff'; c.font = '800 40px Onest, Arial, sans-serif'; c.textBaseline = 'middle'; c.textAlign = 'left'; c.fillText('ЗВІТНІСТЬ · ВСІ КАНАЛИ', 34, 40);
  c.fillStyle = '#eb9cef'; c.font = '700 28px Onest, Arial, sans-serif'; c.textAlign = 'right'; c.fillText('оновлено щойно', w - 34, 41);
  [['ВИТРАТИ', '$12 480', '+4%', '#b544b5'], ['ЛІДИ', '1 240', '+18%', '#8f5bd6'], ['CPL', '$10.1', '−12%', '#f59b5b'], ['ROAS', '4.2×', '+9%', '#6fd39a']].forEach(([t, v, d, col], i) => {
    const x = 28 + i * 262; c.fillStyle = '#fbf3fd'; c.beginPath(); c.roundRect(x, 98, 244, 118, 20); c.fill(); c.fillStyle = col; c.fillRect(x, 98, 10, 118);
    c.fillStyle = '#9a6aa0'; c.font = '700 22px Onest, Arial, sans-serif'; c.textAlign = 'left'; c.fillText(t, x + 28, 128); c.fillStyle = '#270827'; c.font = '800 48px Onest, Arial, sans-serif'; c.fillText(v, x + 28, 176); c.fillStyle = col; c.font = '800 26px Onest, Arial, sans-serif'; c.textAlign = 'right'; c.fillText(d, x + 226, 128);
  });
  c.fillStyle = '#fbf3fd'; c.beginPath(); c.roundRect(28, 236, 640, 320, 22); c.fill();
  c.strokeStyle = '#eddff0'; c.lineWidth = 2; for (let k = 0; k < 5; k++) { c.beginPath(); c.moveTo(56, 270 + k * 62); c.lineTo(644, 270 + k * 62); c.stroke(); }
  [['#b544b5', [40, 62, 54, 90, 80, 120, 150, 140, 190]], ['#8fa2ff', [20, 30, 44, 38, 62, 58, 80, 96, 108]]].forEach(([col, pts]) => { c.strokeStyle = col; c.lineWidth = 7; c.lineJoin = 'round'; c.beginPath(); pts.forEach((v, i) => { const x = 70 + i * 68, y = 520 - v; i ? c.lineTo(x, y) : c.moveTo(x, y); }); c.stroke(); });
  c.fillStyle = '#fbf3fd'; c.beginPath(); c.roundRect(690, 236, 382, 320, 22); c.fill(); c.fillStyle = '#9a6aa0'; c.font = '700 22px Onest, Arial, sans-serif'; c.textAlign = 'left'; c.fillText('ЛІДИ ЗА КАНАЛАМИ', 716, 268);
  [['Meta', 0.82, '#b544b5'], ['Google', 0.64, '#8f5bd6'], ['TikTok', 0.38, '#f59b5b'], ['LinkedIn', 0.22, '#7c8cf8'], ['Organic', 0.46, '#6fd39a']].forEach(([n, v, col], i) => {
    const y = 300 + i * 50; c.fillStyle = '#270827'; c.font = '700 24px Onest, Arial, sans-serif'; c.fillText(n, 716, y + 14); c.fillStyle = '#eddff0'; c.beginPath(); c.roundRect(850, y, 200, 26, 13); c.fill(); c.fillStyle = col; c.beginPath(); c.roundRect(850, y, 200 * v, 26, 13); c.fill();
  });
});
const trackTex = () => canvasTex(720, 520, (c, w, h) => {
  c.fillStyle = '#fff'; c.fillRect(0, 0, w, h); c.fillStyle = '#8f5bd6'; c.fillRect(0, 0, w, 76);
  c.fillStyle = '#fff'; c.font = '800 34px Onest, Arial, sans-serif'; c.textBaseline = 'middle'; c.textAlign = 'left'; c.fillText('ТРЕКІНГ · ЦІЛІСНІСТЬ', 28, 40);
  [['GA4 · події', 1], ['Meta Pixel', 1], ['Google Tag Manager', 1], ['UTM-мітки · 3 помилки', 0], ['Конверсії → CRM', 1], ['Дублі лідів', 1]].forEach(([n, ok], i) => {
    const y = 96 + i * 62; c.fillStyle = '#fbf3fd'; c.beginPath(); c.roundRect(22, y, 440, 52, 14); c.fill();
    c.fillStyle = ok ? '#6fd39a' : '#ffb347'; c.beginPath(); c.arc(54, y + 26, 15, 0, 7); c.fill(); c.fillStyle = '#fff'; c.font = '800 20px Onest, Arial, sans-serif'; c.textAlign = 'center'; c.fillText(ok ? '✓' : '!', 54, y + 28);
    c.fillStyle = '#270827'; c.font = '700 25px Onest, Arial, sans-serif'; c.textAlign = 'left'; c.fillText(n, 84, y + 27);
  });
  c.lineWidth = 26; c.lineCap = 'round'; c.strokeStyle = '#eddff0'; c.beginPath(); c.arc(590, 250, 80, 0, Math.PI * 2); c.stroke();
  c.strokeStyle = '#6fd39a'; c.beginPath(); c.arc(590, 250, 80, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * 0.96); c.stroke();
  c.fillStyle = '#661466'; c.font = '800 54px Onest, Arial, sans-serif'; c.textAlign = 'center'; c.fillText('96%', 590, 252); c.fillStyle = '#9a6aa0'; c.font = '700 22px Onest, Arial, sans-serif'; c.fillText('здоров’я даних', 590, 366);
});
const gridRugTex = () => canvasTex(512, 320, (c, w, h) => {
  c.fillStyle = 'rgba(181,68,181,.16)'; c.beginPath(); c.roundRect(6, 6, w - 12, h - 12, 30); c.fill(); c.strokeStyle = 'rgba(181,68,181,.55)'; c.lineWidth = 5; c.beginPath(); c.roundRect(6, 6, w - 12, h - 12, 30); c.stroke();
  c.strokeStyle = 'rgba(143,91,214,.35)'; c.lineWidth = 2; for (let x = 40; x < w - 20; x += 36) { c.beginPath(); c.moveTo(x, 20); c.lineTo(x, h - 20); c.stroke(); } for (let y = 40; y < h - 20; y += 36) { c.beginPath(); c.moveTo(20, y); c.lineTo(w - 20, y); c.stroke(); }
  c.fillStyle = 'rgba(181,68,181,.7)'; [[112, 76], [220, 148], [328, 112], [400, 220], [150, 232]].forEach(([x, y]) => { c.beginPath(); c.arc(x, y, 9, 0, 7); c.fill(); });
  c.strokeStyle = 'rgba(181,68,181,.7)'; c.lineWidth = 4; c.beginPath(); c.moveTo(112, 76); c.lineTo(220, 148); c.lineTo(328, 112); c.lineTo(400, 220); c.moveTo(220, 148); c.lineTo(150, 232); c.stroke();
});

// ---------- interiors (back walls are z=-D/2 and x=-W/2; the camera looks from +x,+z). The furniture comes from Blender (furniture_a/b.glb).
function furn(assets, name, x, z, ry = 0, s = 1) {
  const src = assets.furnA.getObjectByName(name) || assets.furnB.getObjectByName(name) || assets.creA.getObjectByName(name) || assets.creB.getObjectByName(name) || assets.strA.getObjectByName(name) || assets.strB.getObjectByName(name) || assets.adsA.getObjectByName(name) || assets.adsB.getObjectByName(name) || assets.mgA.getObjectByName(name) || assets.mgB.getObjectByName(name) || assets.salA.getObjectByName(name) || assets.salB.getObjectByName(name) || assets.cliA.getObjectByName(name) || assets.cliB.getObjectByName(name) || assets.datA.getObjectByName(name) || assets.datB.getObjectByName(name);
  const o = src.clone(true); o.position.set(x, 0, z); o.rotation.y = ry; o.scale.setScalar(s); return o;
}
function interior(key, g, W, D, ticks, round, assets) {
  const bz = -D / 2 + 0.12, bx = -W / 2 + 0.12;
  const add = (name, x, z, ry, s) => { const o = furn(assets, name, x, z, ry, s); g.add(o); return o; };
  const wallPanel = (tex, w, h, x, y, z, ry = 0) => plane(g, w, h, tex, x, y, z, ry);
  if (key === 'sales') { // a sales floor: funnel and pipeline boards, a leaderboard, a deal gong, a plan thermometer, a meeting table, a reception desk
    box(g, 6.2, 2.8, 0.12, C.white, 0, 3.2, bz, 0.06); plane(g, 5.9, 2.5, funnelBoardTex(), 0, 4.6, bz + 0.08);
    box(g, 0.12, 2.8, 6.2, C.white, bx, 3.2, 0, 0.06); plane(g, 5.9, 2.5, leaderTex(), bx + 0.08, 4.6, 0, Math.PI / 2);
    const tz = -D / 2 + 2.75;
    add('rug_round', 0, tz, 0, 1.5); add('round_meeting_table', 0, tz, 0, 1.0);
    [0.8, 2.36, 3.93, 5.5].forEach((a) => { const px = Math.cos(a) * 1.75, pz = tz + Math.sin(a) * 1.75; add('office_chair', px, pz, Math.atan2(-px, tz - pz), 0.95); });
    const gong = add('deal_gong', 3.5, -D / 2 + 1.25, 0, 1.0), gp = gong.getObjectByName('GongPivot');
    if (gp) ticks.push((t) => { gp.rotation.x = Math.sin(t * 1.7) * 0.05 * (0.5 + 0.5 * Math.sin(t * 0.45)); });
    add('goal_thermometer', -3.5, -D / 2 + 0.9, 0, 1.0);
    add('funnel_sculpture', -W / 2 + 1.05, 0.0, 0, 1.0); add('lead_magnet', -W / 2 + 1.05, 3.5, 0, 1.0);
    add('water_cooler', -W / 2 + 0.7, D / 2 - 1.2, Math.PI / 2, 1.0);
    add('contract_podium', W / 2 - 1.15, -3.5, Math.PI / 4, 1.0); add('trophy', W / 2 - 1.0, -1.2, 0.5, 1.0); add('coin_stacks', W / 2 - 1.0, 0.9, 0, 1.0);
    add('reception_desk', -4.3, D / 2 - 0.9, 0, 1.0);
    add('floor_lamp', 3.2, D / 2 - 0.9, 0, 1.2);
    add('plant_big', -W / 2 + 0.8, -D / 2 + 0.8, 0, 1.15); add('plant_big', W / 2 - 0.8, -D / 2 + 0.8, 0, 1.15); add('plant_big', W / 2 - 0.8, D / 2 - 0.9, 0, 1.1);
  } else if (key === 'client-success') { // a client lounge: journey / satisfaction / meetings boards on the curved wall, a lounge, a glass meeting pod, a concierge desk, a heart
    const R0 = W / 2;
    curvedPanel(g, R0, 201, 249, 3.0, 5.6, journeyTex()); curvedPanel(g, R0, 138, 160, 3.0, 5.4, npsTex()); curvedPanel(g, R0, 290, 312, 3.0, 5.4, meetTex());
    plane(g, 2.8, 1.22, welcomeMatTex(), 0, 0.034, 4.55, 0, -Math.PI / 2, true).renderOrder = 1;
    add('rug_round', -1.6, -3.7, 0, 1.25); add('coffee_table', -1.6, -3.7, 0, 1.0);
    add('sofa', -1.6, -5.3, 0, 1.0); add('armchair', -3.7, -3.7, Math.PI / 2, 1.0); add('armchair', 0.5, -3.7, -Math.PI / 2, 1.0);
    add('meeting_pod', 2.6, -3.4, 0, 1.0);
    const ht = add('heart_sculpture', -4.7, -1.1, 0, 1.0), hb = ht.getObjectByName('HeartBody'), hr = ht.getObjectByName('HeartRing');
    ticks.push((t) => { if (hb) hb.scale.setScalar(1 + 0.05 * Math.sin(t * 3.2) + 0.02 * Math.sin(t * 6.4)); if (hr) hr.rotation.y = t * 0.7; });
    const bob = (o, names, amp, sp) => names.forEach((n, i) => { const b = o.getObjectByName(n); if (b) { const y0 = b.position.y; ticks.push((t) => { b.position.y = y0 + Math.sin(t * sp + i * 1.9) * amp; }); } });
    bob(add('chat_bubbles', 4.7, -0.9, 0, 1.0), ['Bubble0', 'Bubble1', 'Bubble2'], 0.07, 1.3);
    bob(add('balloon_bundle', -5.0, 1.7, 0, 1.0), ['Balloon0', 'Balloon1', 'Balloon2', 'Balloon3'], 0.05, 1.1);
    add('concierge_desk', -2.6, 3.7, 0, 1.0); add('satisfaction_totem', 1.6, 5.0, 0, 1.0);
    add('tea_trolley', 4.8, 1.3, 0.5, 1.0); add('gift_table', 3.4, 3.8, 0, 1.0);
    add('floor_lamp', -4.9, -2.7, 0, 1.2); add('plant_big', 0.4, -5.4, 0, 1.2); add('plant_big', -4.7, 3.4, 0, 1.1); add('plant_big', 5.0, 2.9, 0, 1.1);
  } else if (key === 'strategy-research') { // a war room for plans: a big strategy map, a plan table, books, a whiteboard, a kanban board, a thinking corner
    box(g, 5.0, 3.3, 0.12, C.white, 0, 2.7, bz, 0.06); plane(g, 4.7, 3.0, bigMapTex(), 0, 4.35, bz + 0.08); // the frame stands on 2.7, the picture is centred in it
    box(g, 0.12, 2.6, 5.0, C.white, bx, 5.9 - 1.3, 0, 0.06); plane(g, 4.7, 2.4, flowTex(), bx + 0.08, 5.9, 0, Math.PI / 2);
    const at = (n, x, z, ry, s2) => add(n, x, z, ry, s2);
    plane(g, 5.6, 5.6, compassTex(), 0, 0.032, -D / 2 + 3.3, 0, -Math.PI / 2, true).renderOrder = 1;
    at('bookshelf', -W / 2 + 0.6, 0, Math.PI / 2, 1.0);
    at('strategy_table', 0, -D / 2 + 2.3, 0, 1.0);
    at('thinker', -W / 2 + 1.55, -D / 2 + 2.2, 0.5, 1.0);
    at('idea_bulb', -W / 2 + 0.9, -D / 2 + 0.9, 0, 1.05);
    at('telescope', W / 2 - 1.3, -D / 2 + 1.0, -0.3, 1.0);
    at('armchair', W / 2 - 0.95, -D / 2 + 3.3, -1.1, 1.0); at('side_table', W / 2 - 0.7, -D / 2 + 2.3, 0, 1.0);
    at('giant_magnifier', W / 2 - 1.0, -D / 2 + 4.9, -0.7, 0.9);
    at('globe', -W / 2 + 0.95, D / 2 - 1.0, 0.6, 0.85); const gl = g.children[g.children.length - 1].getObjectByName('GlobeBall'); if (gl) ticks.push((t) => { gl.rotation.y = t * 0.4; });
    at('kanban_board', 0.2, D / 2 - 0.5, 0, 0.95); at('flipchart', -W / 2 + 2.9, D / 2 - 0.5, 0.15, 0.9);
    at('filing_cabinet', W / 2 - 0.9, D / 2 - 0.8, -0.35, 1.0);
    at('plant_big', -W / 2 + 0.8, -D / 2 + 3.9, 0, 1.1); at('plant_big', W / 2 - 0.8, D / 2 - 2.0, 0, 1.0);
  } else if (key === 'performance-creative') { // a real studio: paintings, paint, easels, sculpture, a photo corner, a swatch board
    const a2 = artTex('#c9a4f0', '#8f5bd6', '#3a1a66'), a3 = artTex('#ffd0b0', '#f59b5b', '#a8500f'), a4 = artTex('#d9a6df', '#b544b5', '#270827'), a5 = artTex('#bfe8ff', '#7c8cf8', '#2a2a7a');
    [[artTex(), -3.0, 3.5, 2.2, 1.7], [a2, -0.55, 3.8, 1.5, 2.0], [a3, 1.8, 3.4, 2.4, 1.8]].forEach(([t, x, y, w, h]) => { box(g, w + 0.24, h + 0.24, 0.1, C.white, x, y - h / 2 - 0.12, bz, 0.04); plane(g, w, h, t, x, y, bz + 0.07); });
    plane(g, 5.2, 1.15, neonTex('КРЕАТИВ'), 0, 5.75, bz + 0.07, 0, 0, true);
    [[a4, -1.3, 3.5, 1.6, 2.0], [a5, 1.3, 3.8, 1.6, 2.0]].forEach(([t, z, y, w, h]) => { box(g, 0.1, h + 0.24, w + 0.24, C.white, bx, y - h / 2 - 0.12, z, 0.04); plane(g, w, h, t, bx + 0.07, y, z, Math.PI / 2); });
    const placeAt = (n, x, z, ry, s2, color) => { const o = add(n, x, z, ry, s2); if (color) tint(o, color); return o; };
    placeAt('supply_shelf', -W / 2 + 0.55, 0, Math.PI / 2, 1.0);
    placeAt('easel', -W / 2 + 1.5, -D / 2 + 2.0, 0.45, 1.0);
    placeAt('canvas_stack', -1.2, -D / 2 + 0.65, 0, 0.95);
    placeAt('paint_bucket', -3.3, -D / 2 + 1.6, 0, 1.0, 0xb544b5); placeAt('paint_bucket', -2.7, -D / 2 + 2.3, 1.2, 0.9, 0xf59b5b); placeAt('paint_bucket', -W / 2 + 2.9, -2.2, 2.4, 0.9, 0x7c8cf8);
    placeAt('sculpture', 3.9, -D / 2 + 1.5, 0.3, 0.95);
    placeAt('giant_tube', 5.3, -D / 2 + 1.0, 0.5, 1.0, 0xf59b5b);
    placeAt('bean_bag', W / 2 - 1.0, -3.0, 0.4, 1.0, 0xf3b6e4); placeAt('bean_bag', W / 2 - 0.95, -1.0, -0.5, 0.9, 0xf59b5b);
    placeAt('ring_light', W / 2 - 0.7, 3.4, -Math.PI / 2, 1.0);
    placeAt('drawing_table', -W / 2 + 1.1, 4.0, Math.PI / 2, 1.0);
    placeAt('art_rack', -W / 2 + 0.9, -3.3, Math.PI / 2, 1.0);
    placeAt('swatch_board', -1.8, D / 2 - 0.6, 0, 1.0);
    placeAt('plant_big', W / 2 - 0.9, -D / 2 + 1.0, 0, 1.15);
    const pal = new THREE.Group(); pal.position.set(W / 2 - 1.1, 0, 1.2); g.add(pal); cyl(pal, 0.7, 0.7, 0.12, C.white, 0, 0.55, 0, {}, 36); cyl(pal, 0.1, 0.1, 0.55, C.deep, 0, 0, 0);
    [C.plum, C.pink, C.violet, C.dev, C.glow].forEach((c, i) => cyl(pal, 0.12, 0.12, 0.08, c, Math.cos(i * 1.25) * 0.4, 0.66, Math.sin(i * 1.25) * 0.4, { emissive: c, ei: 0.2 }, 16));
    // paint splashes on the floor
    [[-2.2, -3.6, 3.4, 1], [3.1, -3.0, 2.8, 2], [-5.3, -0.6, 2.6, 3], [5.0, 4.7, 2.6, 4], [0.8, 5.5, 3.0, 5], [-4.6, 3.8, 2.4, 6], [6.2, -4.6, 2.2, 7]].forEach(([x, z, s2, sd]) => { const m = plane(g, s2, s2, splatTex(sd), x, 0.035, z, 0, -Math.PI / 2, true); m.rotation.z = sd * 0.9; m.renderOrder = 1; }); // lying flat on the floor, turned about its own axis
  } else if (key === 'performance-delivery') { // an ads control room: a video wall of dashboards, a live ticker, budgets, a rocket, a target, gauges and coins
    box(g, 8.9, 3.0, 0.12, C.deep, 0, 2.85, bz, 0.06); plane(g, 8.6, 2.69, adsWallTex(), 0, 4.35, bz + 0.08);
    const tk = tickerTex(); plane(g, 8.6, 0.4, tk, 0, 6.6, bz + 0.08); box(g, 8.8, 0.52, 0.1, C.deep, 0, 6.34, bz, 0.04); ticks.push((t) => { tk.offset.x = -((t * 0.05) % 1); });
    box(g, 0.12, 2.8, 4.0, C.white, bx, 3.1, 0, 0.06); plane(g, 3.8, 2.375, budgetTex(), bx + 0.08, 4.5, 0, Math.PI / 2);
    plane(g, 7.2, 7.2, bullseyeTex(), 0, 0.03, -D / 2 + 3.4, 0, -Math.PI / 2, true).renderOrder = 1;
    const at = (n, x, z, ry, s2) => add(n, x, z, ry, s2);
    at('control_console', 0, -D / 2 + 2.0, 0, 1.0);
    const rk = at('rocket', W / 2 - 1.4, -D / 2 + 1.6, -0.4, 1.0); const fl = rk.getObjectByName('Flame'); if (fl) ticks.push((t) => { fl.scale.set(0.9 + Math.sin(t * 23) * 0.08, 0.9 + Math.sin(t * 17 + 1) * 0.25, 0.9 + Math.sin(t * 19) * 0.08); });
    at('target_stand', W / 2 - 0.9, -0.2, -Math.PI / 2, 1.0); at('billboard_small', W / 2 - 0.9, 2.7, -Math.PI / 2, 0.9); at('phone_stack', W / 2 - 0.9, 4.7, -Math.PI / 2, 0.9);
    const gg = at('gauge_big', -W / 2 + 0.9, 0.2, Math.PI / 2, 1.0); const nd = gg.getObjectByName('Needle'); if (nd) ticks.push((t) => { nd.rotation.z = 0.3 + Math.sin(t * 0.8) * 0.7; });
    at('coin_stacks', -W / 2 + 1.7, -D / 2 + 1.8, 0, 1.0); at('ab_boards', -W / 2 + 1.1, 3.2, Math.PI / 2, 0.85);
    at('chart_stand', 2.3, D / 2 - 0.55, 0.1, 0.95); at('floor_lamp', -W / 2 + 0.7, D / 2 - 0.8, 0, 1.2);
    at('plant_big', W / 2 - 0.9, D / 2 - 1.0, 0, 1.1); at('plant_big', -W / 2 + 0.8, -D / 2 + 0.8, 0, 1.0);
  } else if (key === 'data-tracking-reporting') { // the data room: a reporting dashboard and a tracking-health board, racks, a database tower, a hologram chart, a pipeline, a tag cube, a printer, a watching eye
    box(g, 5.4, 2.9, 0.12, C.deep, 0, 3.2, bz, 0.06); plane(g, 5.1, 2.69, dashTex(), 0, 4.65, bz + 0.08);
    box(g, 0.12, 2.9, 3.9, C.white, bx, 3.2, 0, 0.06); plane(g, 3.6, 2.6, trackTex(), bx + 0.08, 4.65, 0, Math.PI / 2);
    plane(g, 4.4, 2.75, gridRugTex(), 0, 0.034, -1.85, 0, -Math.PI / 2, true).renderOrder = 1;
    [-1.45, -0.5, 0.45].forEach((x) => add('server_rack', x, -D / 2 + 0.6, 0, 0.7));
    const dt = add('database_tower', -3.9, -3.3, 0, 1.0), dcu = dt.getObjectByName('DbCubes'); if (dcu) ticks.push((t) => { dcu.rotation.y = t * 0.8; });
    const hc = add('holo_bar_chart', 0, -1.85, 0, 1.0);
    for (let k = 0; k < 6; k++) { const b = hc.getObjectByName('HoloBar' + k); if (b) ticks.push((t) => { b.scale.y = 0.72 + 0.28 * Math.sin(t * 1.5 + k * 0.9); }); }
    const pl = add('data_pipeline', 3.4, -3.3, 0, 0.85);
    for (let k = 0; k < 4; k++) { const pk = pl.getObjectByName('Packet' + k); if (pk) ticks.push((t) => { pk.position.x = -1.9 + ((t * 0.4 + k / 4) % 1) * 3.8; }); }
    const tg = add('tag_orbit', 4.5, -0.6, 0, 1.0), to = tg.getObjectByName('TagOrbit'), tcu = tg.getObjectByName('TagCube');
    ticks.push((t) => { if (to) to.rotation.y = t * 0.9; if (tcu) { tcu.rotation.y = -t * 0.6; tcu.position.y = Math.sin(t * 1.6) * 0.07; } });
    add('cookie_jar', 4.5, 1.7, 0, 1.0);
    const bc = add('alert_beacon', 4.8, 3.0, 0, 1.0), lg = bc.getObjectByName('LampG'); if (lg) lg.traverse((m) => { if (m.isMesh) { m.material = m.material.clone(); const e0 = m.material.emissiveIntensity; ticks.push((t) => { m.material.emissiveIntensity = e0 * (0.65 + 0.35 * Math.sin(t * 2.4)); }); } });
    const pr = add('report_printer', -4.5, 0.2, Math.PI / 2, 1.0), ps = pr.getObjectByName('PrintSheet'); if (ps) { const z0 = ps.position.z; ticks.push((t) => { ps.position.z = z0 + 0.1 + 0.1 * Math.sin(t * 1.1); }); }
    add('binder_cart', -4.4, 2.5, 0.9, 1.0);
    const ey = add('watcher_eye', -4.5, -1.7, 0.5, 1.0), eb = ey.getObjectByName('EyeBall'); if (eb) ticks.push((t) => { eb.rotation.y = Math.sin(t * 0.7) * 0.6; eb.rotation.x = Math.sin(t * 1.1) * 0.22; });
    add('filing_cabinet', 2.6, D / 2 - 0.7, -0.3, 1.0); add('floor_lamp', -2.9, D / 2 - 0.8, 0, 1.2);
    add('plant_big', -W / 2 + 0.7, -D / 2 + 0.7, 0, 1.1); add('plant_big', -W / 2 + 0.7, D / 2 - 0.7, 0, 1.05); add('plant_big', W / 2 - 0.7, D / 2 - 0.6, 0, 1.05);
  } else if (key === 'management') { // the command room: an AI network screen, an org chart, world clocks, a briefing table, a switchboard, a lounge and a coffee corner
    box(g, 6.5, 3.4, 0.12, C.deep, 0, 4.5, bz, 0.06); plane(g, 6.2, 3.23, netScreenTex(assets.logo), 0, 6.2, bz + 0.08);
    box(g, 0.12, 2.7, 4.2, C.white, bx, 3.85, 0, 0.06); plane(g, 3.9, 2.44, orgTex(), bx + 0.08, 5.2, 0, Math.PI / 2);
    if (assets.logo) { const lt = logoPlaqueTex(assets.logo); plane(g, 4.6, 0.99, lt, bx + 0.07, 8.3, 0, Math.PI / 2, 0, true); }
    [['КИЇВ', 0, -1.7], ['ЛОНДОН', -2, 0], ['НЬЮ-ЙОРК', -7, 1.7]].forEach(([name, off, z]) => {
      const ck = add('wall_clock', bx + 0.1, z, Math.PI / 2, 1.0); ck.position.y = 10.3; plane(g, 1.3, 0.33, clockLabelTex(name), bx + 0.07, 9.45, z, Math.PI / 2);
      const hh = ck.getObjectByName('HandHour'), mm = ck.getObjectByName('HandMin');
      ticks.push(() => { const d = new Date(Date.now() + off * 3600e3 + (new Date().getTimezoneOffset() + 120) * 60e3 * 0); const m = d.getMinutes() + d.getSeconds() / 60, hr = (d.getHours() % 12) + m / 60; if (mm) mm.rotation.z = -m / 60 * Math.PI * 2; if (hh) hh.rotation.z = -hr / 12 * Math.PI * 2; });
    });
    add('rug_round', 0, -2.3, 0, 1.45);
    const ht = add('holo_table', 0, -2.3, 0, 0.8); const cr = ht.getObjectByName('HoloCrystal'), r1 = ht.getObjectByName('HoloRing1'), r2 = ht.getObjectByName('HoloRing2');
    ticks.push((t) => { if (cr) { cr.rotation.y = t; cr.position.y = Math.sin(t * 1.4) * 0.1; } if (r1) r1.rotation.y = t * 0.6; if (r2) r2.rotation.y = -t * 0.45; });
    add('office_chair', -1.9, -2.3, Math.PI / 2, 1.0); add('office_chair', 1.9, -2.3, -Math.PI / 2, 1.0); add('office_chair', 0, -0.7, Math.PI, 1.0);
    add('flag_stand', -4.7, -D / 2 + 0.9, 0, 0.9); add('flag_stand', 4.7, -D / 2 + 0.9, 0, 0.9);
    add('espresso_station', -2.7, -D / 2 + 0.75, 0, 0.9); add('patch_panel', 2.7, -D / 2 + 0.7, 0, 0.9);
    add('sofa', -W / 2 + 1.0, -0.2, Math.PI / 2, 0.9); add('floor_lamp', -W / 2 + 0.7, 1.6, 0, 1.2);
    add('water_cooler', -W / 2 + 0.7, 3.0, Math.PI / 2, 1.0);
    add('globe', W / 2 - 0.9, -0.4, 0.6, 0.9);
    add('trophy', -W / 2 + 0.9, -2.5, 0.5, 0.9);
    add('plant_big', W / 2 - 0.8, -D / 2 + 0.7, 0, 1.2); add('plant_big', -W / 2 + 0.8, D / 2 - 0.8, 0, 1.1);
  }
}

const padTexBase = canvasTex(128, 128, (c, w, h) => { c.fillStyle = '#fcf6fd'; c.fillRect(0, 0, w, h); c.fillStyle = '#f5eaf9'; c.fillRect(0, 0, w / 2, h / 2); c.fillRect(w / 2, h / 2, w / 2, h / 2); c.strokeStyle = '#ead6f1'; c.lineWidth = 3; c.strokeRect(0, 0, w, h); });
function padTop(w, d) { const t = padTexBase.clone(); t.needsUpdate = true; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(w / 2.4, d / 2.4); return new THREE.MeshStandardMaterial({ map: t, roughness: 0.85 }); }

// ---------- the building
export function createBuilding(dept, assets, idx) {
  const key = dept.key, n = dept.agents.length;
  const { cols, rows, W, D, H, round } = layoutFor(n, key);
  const st = STYLE[key] || { top: H + 5 };
  const RR = W / 2; // radius of a round building
  const root = new THREE.Group();
  root.userData = { kind: 'dept', key };
  const PAD_H = 0.28;
  let pad, edge, sel;
  if (round) {
    const Rp = RR + 2.8;
    pad = new THREE.Mesh(new THREE.CylinderGeometry(Rp, Rp, PAD_H, 72), [mat(C.cream, { rough: 0.85 }), padTop(Rp * 2, Rp * 2), mat(C.cream, { rough: 0.85 })]);
    edge = new THREE.Mesh(new THREE.CylinderGeometry(Rp + 0.15, Rp + 0.15, 0.08, 72), mat(C.plum, { emissive: C.plum, ei: 0.3 }));
    sel = new THREE.Mesh(new THREE.CylinderGeometry(Rp + 0.8, Rp + 0.8, 0.04, 72), new THREE.MeshBasicMaterial({ color: C.plum, transparent: true, opacity: 0 }));
  } else {
    const ps = mat(C.cream, { rough: 0.85 });
    pad = new THREE.Mesh(new THREE.BoxGeometry(W + 4.6, PAD_H, D + 4.6), [ps, ps, padTop(W + 4.6, D + 4.6), ps, ps, ps]);
    edge = new THREE.Mesh(new THREE.BoxGeometry(W + 4.9, 0.08, D + 4.9), mat(C.plum, { emissive: C.plum, ei: 0.3 }));
    sel = new THREE.Mesh(new THREE.BoxGeometry(W + 5.6, 0.04, D + 5.6), new THREE.MeshBasicMaterial({ color: C.plum, transparent: true, opacity: 0 }));
  }
  pad.position.y = PAD_H / 2; pad.receiveShadow = true; pad.castShadow = true; edge.position.y = 0.04; sel.position.y = 0.02; root.add(pad, edge, sel);
  { // an inlaid border of lilac stone a little inside the pad edge (open at the front for the drive)
    const im = mat(C.lilac2, { rough: 0.8 });
    if (round) { const gap = 0.3, rg = new THREE.Mesh(new THREE.RingGeometry(RR + 2.2, RR + 2.42, 96, 1, -Math.PI / 2 + gap, Math.PI * 2 - 2 * gap), im); rg.rotation.x = -Math.PI / 2; rg.position.y = PAD_H + 0.012; rg.receiveShadow = true; root.add(rg); }
    else {
      const X = (W + 4.6) / 2 - 0.45, Z = (D + 4.6) / 2 - 0.45, strip = (w, d, x, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.02, d), im); m.position.set(x, PAD_H + 0.01, z); m.receiveShadow = true; root.add(m); };
      strip(2 * X, 0.2, 0, -Z); strip(0.2, 2 * Z, -X, 0); strip(0.2, 2 * Z, X, 0); strip(X - 2.2, 0.2, -(X + 2.2) / 2, Z); strip(X - 2.2, 0.2, (X + 2.2) / 2, Z);
    }
  }
  const body = new THREE.Group(); body.position.y = PAD_H; root.add(body);

  // floor
  const ft = floorTex('#f6e9fa', '#eed7f4'); ft.wrapS = ft.wrapT = THREE.RepeatWrapping; ft.repeat.set(W / 2.2, D / 2.2);
  const floorTop = new THREE.MeshStandardMaterial({ map: ft, roughness: 0.8 });
  const floor = round ? new THREE.Mesh(new THREE.CylinderGeometry(RR, RR, 0.2, 64), [mat(C.white), floorTop, mat(C.white)]) : new THREE.Mesh(new THREE.BoxGeometry(W, 0.2, D), [mat(C.white), mat(C.white), floorTop, mat(C.white), mat(C.white), mat(C.white)]);
  floor.position.y = -0.08; floor.receiveShadow = true; body.add(floor); // its top sits 0.02 above the pad, so the two faces never share a depth (that made the floor flicker up close)

  const front = new THREE.Group(); body.add(front); // the part that shrinks when the building opens
  const wall = (g, w, h, d, x, z) => box(g, w, h, d, C.white, x, 0, z, 0.12);

  if (round) {
    const BA0 = FRONT_A1, BA1 = FRONT_A0 + Math.PI * 2;
    const rad = (d) => d * Math.PI / 180;
    arcWithOpenings(body, RR + 0.6, RR, BA0, BA1, H, [rad(175), rad(275)], 1.8, 5.3);
    arcWall(body, RR, RR - 0.2, BA0, BA1, 1.5, C.lilac); arcWall(body, RR + 0.02, RR - 0.26, BA0, BA1, 0.14, C.plum, 1.5, { emissive: C.plum, ei: 0.25 });
    arcWall(front, RR + 0.6, RR, FRONT_A0, FRONT_A1, H, C.white);
    arcWall(front, RR + 0.85, RR + 0.5, FRONT_A0, FRONT_A1, 0.5, C.lilac2);
    roundFascia(front, RR, H, SIGN[key], assets.logo);
    for (let a = FRONT_A0 + 0.35; a < FRONT_A1 - 0.25; a += 0.5) {
      if (Math.abs(a - Math.PI / 2) < 0.5) continue;
      const px = Math.cos(a) * (RR + 0.6), pz = Math.sin(a) * (RR + 0.6), ry = Math.atan2(Math.cos(a), Math.sin(a));
      pane(front, px, 1.0, pz, 1.2, 2.4, ry); pane(front, px, 3.9, pz, 1.0, 0.9, ry, C.white, 0);
    }
    doorway(front, 0, RR + 0.6, 0);
  } else {
    const WIN = { 'performance-creative': { cz: W / 2 - 1.9, wz: 2.4, cx: D / 2 - 2.7, wx: 2.4, y0: 1.7, y1: 4.9 }, 'strategy-research': { cz: W / 2 - 1.5, wz: 1.8, cx: D / 2 - 2.5, wx: 1.8, y0: 1.4, y1: 5.5 }, 'performance-delivery': { cz: W / 2 - 1.7, wz: 2.2, cx: D / 2 - 2.6, wx: 2.2, y0: 1.6, y1: 5.2 }, management: { cz: W / 2 - 1.2, wz: 1.6, cx: D / 2 - 1.4, wx: 1.6, y0: 1.8, y1: 6.6 }, sales: { cz: W / 2 - 1.7, wz: 2.2, cx: D / 2 - 2.6, wx: 2.2, y0: 1.6, y1: 5.0 }, 'data-tracking-reporting': { cz: W / 2 - 1.6, wz: 1.6, cx: D / 2 - 1.5, wx: 1.6, y0: 1.8, y1: 5.4 } }[key];
    if (WIN) {
      wallWithOpenings(body, 'x', W + 1.2, H, -D / 2 - 0.3, [-1, 1].map((s2) => ({ c: s2 * WIN.cz, w: WIN.wz, y0: WIN.y0, y1: WIN.y1 })));
      wallWithOpenings(body, 'z', D, H, -W / 2 - 0.3, [-1, 1].map((s2) => ({ c: s2 * WIN.cx, w: WIN.wx, y0: WIN.y0, y1: WIN.y1 })));
    } else { wall(body, W + 1.2, H, 0.6, 0, -D / 2 - 0.3); wall(body, 0.6, H, D, -W / 2 - 0.3, 0); }
    box(body, W, 1.5, 0.2, C.lilac, 0, 0, -D / 2 + 0.1, 0.05); box(body, 0.2, 1.5, D, C.lilac, -W / 2 + 0.1, 0, 0, 0.05);
    box(body, W, 0.14, 0.24, C.plum, 0, 1.5, -D / 2 + 0.12, 0.04, { emissive: C.plum, ei: 0.25 }); box(body, 0.24, 0.14, D, C.plum, -W / 2 + 0.12, 1.5, 0, 0.04, { emissive: C.plum, ei: 0.25 });
    const nWin = WIN ? 0 : Math.max(2, Math.floor(W / 4.4));
    for (let i = 0; i < nWin; i++) { const x = -W / 2 + (i + 0.5) * (W / nWin); box(body, 1.2, 2.6, 0.06, C.glass, x, 3.2, -D / 2 + 0.03, 0.04, glassMat); }
    const nWinZ = WIN ? 0 : Math.max(2, Math.floor(D / 4.4));
    for (let i = 0; i < nWinZ; i++) { const z = -D / 2 + (i + 0.5) * (D / nWinZ); box(body, 0.06, 2.6, 1.2, C.glass, -W / 2 + 0.03, 3.2, z, 0.04, glassMat); }
    wall(front, W + 1.2, H, 0.6, 0, D / 2 + 0.3); wall(front, 0.6, H, D, W / 2 + 0.3, 0);
    box(front, W + 1.3, 0.5, 0.82, C.lilac2, 0, 0, D / 2 + 0.3, 0.05); box(front, 0.82, 0.5, D + 0.1, C.lilac2, W / 2 + 0.3, 0, 0, 0.05); // plinth
    box(front, 0.8, H - 2.3, 0.8, C.lilac2, W / 2 + 0.3, 0.5, D / 2 + 0.3, 0.06); // corner pilaster up to the sign band
    facade(key, front, W, D, H, assets.logo);
    fascia(front, key, W, D, H, assets.logo);
    doorway(front, 0, D / 2 + 0.6, 0);
    const wz = new THREE.Mesh(new THREE.PlaneGeometry(W + 1, 3.6), wallWash); wz.position.set(0, 1.8, D / 2 + 0.95); wz.renderOrder = 6; front.add(wz);
    const wx = new THREE.Mesh(new THREE.PlaneGeometry(D + 1, 3.6), wallWash); wx.rotation.y = Math.PI / 2; wx.position.set(W / 2 + 0.95, 1.8, 0); wx.renderOrder = 6; front.add(wx);
  }
  { const pool = new THREE.Mesh(new THREE.PlaneGeometry(7, 5.4), doorPool); pool.rotation.x = -Math.PI / 2; pool.position.set(0, 0.06, (round ? RR + 0.6 : D / 2 + 0.6) + 2.4); pool.renderOrder = 6; body.add(pool); }

  // roof (fades away)
  const roof = new THREE.Group(); body.add(roof);
  if (round) { cyl(roof, RR + 1.1, RR + 1.1, 0.16, C.plum, 0, H - 0.02, 0, { emissive: C.plum, ei: 0.2 }, 64); cyl(roof, RR + 0.9, RR + 0.9, 0.5, C.lilac, 0, H + 0.1, 0, {}, 64); }
  else { box(roof, W + 0.95, 0.16, D + 0.95, C.plum, 0, H - 0.02, 0, 0.06, { emissive: C.plum, ei: 0.2 }); box(roof, W + 0.7, 0.5, D + 0.7, C.lilac, 0, H + 0.1, 0, 0.12); }
  const { R, ticks: roofTicks } = roofProps(key, roof, W, D, H + 0.6);
  const roofMats = [];
  roof.traverse((o) => { if (o.isMesh) { o.material = o.material.clone(); o.material.transparent = true; roofMats.push([o.material, o.material.opacity]); o.userData.ownRoof = true; } });

  // interior props + one workstation per agent
  const itick = [];
  const inner = new THREE.Group(); body.add(inner); // everything inside (props, desks, agents): hidden while the building is closed, which is most of the time
  interior(key, inner, W, D, itick, round, assets);
  inner.traverse((o) => { if (o.isMesh) o.castShadow = false; }); // the props inside cast no shadow (nobody sees it, and it doubled the draw calls of an open building); desks and agents, added next, still do
  const slots = [];
  const robots = [];
  const z0 = -D / 2 + 4.6 + CELL_Z / 2;
  dept.agents.forEach((a, i) => {
    const c = i % cols, r = Math.floor(i / cols);
    const rowCount = r === rows - 1 ? n - r * cols : cols;
    const x = (c - (rowCount - 1) / 2) * CELL_X, z = z0 + r * CELL_Z;
    const stn = assets.station.clone(true); stn.position.set(x, 0, z); stn.scale.setScalar(1.3); inner.add(stn);
    const rb = makeAgentRobot(assets.robot, a.status, i * 1.7 + idx, runOf(a)); rb.position.set(x, 0, z - 0.72); rb.scale.setScalar(1.4);
    rb.userData.kind = 'agent'; rb.userData.dept = key; rb.userData.agent = a.key;
    rb.userData.stationLook = makeFadable(stn); // the desk fades together with its agent
    inner.add(rb); robots.push(rb); slots.push({ x, z });
  });

  const il = new THREE.PointLight(0xffd9f2, 0, 22, 1.5); il.position.set(0, Math.min(H * 0.75, 5.2), 1.0); body.add(il);
  const b = {
    key, root, body, inner, W, D, H, round, sel, robots, slots, topY: st.top + PAD_H,
    open: 0, target: 0, anim: roofTicks, itick, front, roof, roofMats, R,
    setOpen(v) { b.target = v ? 1 : 0; },
    update(dt, t, reduce) {
      const k = reduce ? 1 : Math.min(1, dt * 4.2);
      if (Math.abs(b.target - b.open) > 0.0015) b.open += (b.target - b.open) * k; else b.open = b.target;
      const o = b.open, e = o * o * (3 - 2 * o);
      front.scale.y = Math.max(0.12, 1 - 0.88 * e);
      il.intensity = NIGHT.n * b.open * 26;
      const f = 1 - Math.min(1, e * 1.2); roofMats.forEach(([m, base]) => { m.opacity = base * f; });
      roof.visible = f > 0.02;
      roof.position.y = e * 2.2;
      const shown = b.open > 0.004 || b.target > 0;
      if (shown !== inner.visible) { inner.visible = shown; inner.traverse((o) => o.layers.set(shown ? 0 : 1)); } // raycasts ignore .visible, so a hidden interior also leaves the picking layer
      b.anim.forEach((fn) => fn(t)); // the roof keeps turning while the building is closed
      if (!shown) return;
      b.itick.forEach((fn) => fn(t));
      b.robots.forEach((r) => tickAgentRobot(r, t));
    },
  };
  return b;
}
