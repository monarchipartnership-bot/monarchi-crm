// Low-poly "Hub style" models of the AI Agents city: white bodies, plum accents. Everything is built from primitives (no external assets).
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

export const C = {
  white: 0xffffff, cream: 0xfcf6fd, lilac: 0xf1dcf5, lilac2: 0xe6c6ee, mid: 0xd9a6df, plum: 0xb544b5, plum2: 0xae40ae, deep: 0x661466, dark: 0x270827,
  glow: 0xeb9cef, glass: 0xd9c9f7, pink: 0xf3b6e4, violet: 0x8f5bd6,
  live: 0xb07ce0, dev: 0xf59b5b, plan: 0x7c8cf8,
};
export const STATUS_COLOR = { live: C.live, in_development: C.dev, not_started: C.plan };

const matCache = new Map();
export function mat(color, o = {}) {
  const key = color + JSON.stringify(o);
  if (!matCache.has(key)) {
    matCache.set(key, new THREE.MeshStandardMaterial({ color, roughness: o.rough ?? 0.62, metalness: o.metal ?? 0.0, emissive: o.emissive ?? 0x000000, emissiveIntensity: o.ei ?? 1, transparent: !!o.opacity, opacity: o.opacity ?? 1, ...(o.side !== undefined ? { side: o.side } : {}) }));
  }
  return matCache.get(key);
}
const shadowed = (m) => { m.castShadow = true; m.receiveShadow = true; return m; };

// rounded box standing on y (its bottom), centered on x/z
export function box(parent, w, h, d, color, x = 0, y = 0, z = 0, r = 0.14, o = {}) {
  const m = shadowed(new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 3, Math.min(r, w / 2 - 0.001, h / 2 - 0.001, d / 2 - 0.001)), mat(color, o)));
  m.position.set(x, y + h / 2, z);
  parent.add(m);
  return m;
}
export function cyl(parent, rt, rb, h, color, x = 0, y = 0, z = 0, o = {}, seg = 36) {
  const m = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat(color, o)));
  m.position.set(x, y + h / 2, z);
  parent.add(m);
  return m;
}
export function sph(parent, r, color, x = 0, y = 0, z = 0, o = {}, sx = 1, sy = 1, sz = 1) {
  const m = shadowed(new THREE.Mesh(new THREE.SphereGeometry(r, 28, 18), mat(color, o)));
  m.position.set(x, y, z);
  m.scale.set(sx, sy, sz);
  parent.add(m);
  return m;
}
function dome(parent, r, color, x, y, z, o = {}) {
  const m = shadowed(new THREE.Mesh(new THREE.SphereGeometry(r, 36, 18, 0, Math.PI * 2, 0, Math.PI / 2), mat(color, { side: THREE.DoubleSide, ...o })));
  m.position.set(x, y, z);
  parent.add(m);
  return m;
}
function torus(parent, R, r, color, x, y, z, rx = Math.PI / 2, o = {}) {
  const m = shadowed(new THREE.Mesh(new THREE.TorusGeometry(R, r, 14, 48), mat(color, o)));
  m.position.set(x, y, z);
  m.rotation.x = rx;
  parent.add(m);
  return m;
}
function prism(parent, w, h, d, color, x, y, z, o = {}) { // triangular roof (ridge along z)
  const s = new THREE.Shape();
  s.moveTo(-w / 2, 0); s.lineTo(w / 2, 0); s.lineTo(-w / 2, h); s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: d, bevelEnabled: false });
  g.translate(0, 0, -d / 2);
  const m = shadowed(new THREE.Mesh(g, mat(color, o)));
  m.position.set(x, y, z);
  parent.add(m);
  return m;
}
const glassMat = { rough: 0.2, metal: 0.1, emissive: 0xb9a3f5, ei: 0.18 };
function windows(parent, cx, cz, w, d, y, h, colsZ, colsX) { // windows on the two faces the camera sees (+z and +x)
  const gw = (w * 0.78) / colsZ;
  for (let i = 0; i < colsZ; i++) box(parent, gw * 0.72, h, 0.07, C.glass, cx - w * 0.39 + gw * (i + 0.5), y, cz + d / 2 + 0.02, 0.05, glassMat);
  const gd = (d * 0.78) / colsX;
  for (let i = 0; i < colsX; i++) box(parent, 0.07, h, gd * 0.72, C.glass, cx + w / 2 + 0.02, y, cz - d * 0.39 + gd * (i + 0.5), 0.05, glassMat);
}
function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}
function plane(parent, w, h, tex, x, y, z, ry = 0, rx = 0, transparent = false) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, transparent, toneMapped: false, side: THREE.DoubleSide }));
  m.position.set(x, y, z); m.rotation.set(rx, ry, 0);
  parent.add(m);
  return m;
}

// ---------- the seven buildings (each ~5x5 footprint, base on y=0, drawn around the local origin) ----------

export function buildCommand(anim) { // management: the tower in the middle of the plaza
  const g = new THREE.Group();
  cyl(g, 3.1, 3.4, 0.9, C.white, 0, 0, 0, {}, 48);
  cyl(g, 2.7, 2.7, 0.12, C.plum, 0, 0.9, 0);
  cyl(g, 1.7, 2.1, 5.6, C.white, 0, 1.0, 0, {}, 48);
  for (const y of [2.2, 3.9, 5.3]) cyl(g, 1.78, 1.78, 0.16, C.plum, 0, y, 0, { emissive: C.plum, ei: 0.25 }, 48);
  for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + Math.PI / 4; box(g, 0.5, 2.6, 0.08, C.glass, Math.sin(a) * 1.95, 2.4, Math.cos(a) * 1.95, 0.04, glassMat).rotation.y = a; }
  cyl(g, 1.2, 1.7, 0.7, C.lilac, 0, 6.6, 0, {}, 48);
  const crystal = shadowed(new THREE.Mesh(new THREE.OctahedronGeometry(0.95, 0), mat(C.plum, { rough: 0.15, metal: 0.2, emissive: C.plum2, ei: 0.7 })));
  crystal.scale.set(0.8, 1.35, 0.8); crystal.position.y = 8.6; g.add(crystal);
  const ring1 = torus(g, 1.7, 0.06, C.glow, 0, 8.6, 0, Math.PI / 2.4, { emissive: C.glow, ei: 1.2 });
  const ring2 = torus(g, 2.2, 0.05, C.mid, 0, 8.6, 0, Math.PI / 1.7, { emissive: C.mid, ei: 0.8 });
  cyl(g, 0.05, 0.05, 2.4, C.deep, 0, 7.3, 0);
  anim.push((t) => { crystal.rotation.y = t * 0.8; crystal.position.y = 8.6 + Math.sin(t * 1.4) * 0.18; ring1.rotation.z = t * 0.6; ring2.rotation.z = -t * 0.45; });
  return g;
}

export function buildSales() { // sales: hall with rising bars and an arrow on the roof
  const g = new THREE.Group();
  box(g, 5.6, 2.9, 4.4, C.white, 0, 0, 0, 0.22);
  box(g, 5.9, 0.34, 4.7, C.lilac, 0, 2.9, 0, 0.14);
  windows(g, 0, 0, 5.6, 4.4, 0.55, 1.4, 4, 3);
  box(g, 2.6, 0.34, 1.0, C.plum, 0, 2.15, 2.5, 0.12, { emissive: C.plum, ei: 0.2 }); // sign over the door
  box(g, 1.1, 1.7, 0.08, C.deep, 0, 0, 2.21, 0.05);
  const hs = [1.0, 1.7, 2.5, 3.4];
  hs.forEach((h, i) => box(g, 0.78, h, 0.78, i === 3 ? C.plum : [C.mid, C.pink, C.glow][i], -1.65 + i * 1.05, 3.24, -0.3, 0.16, { emissive: C.plum, ei: 0.08 + i * 0.05 }));
  const rod = box(g, 3.9, 0.16, 0.16, C.deep, -0.1, 4.9, -0.3, 0.07); rod.rotation.z = 0.5; rod.position.y = 5.6;
  const head = shadowed(new THREE.Mesh(new THREE.ConeGeometry(0.34, 0.8, 4), mat(C.deep))); head.position.set(1.62, 7.42, -0.3); head.rotation.z = -1.07 + 0.0; g.add(head);
  return g;
}

export function buildClient() { // account management: round lounge with a dome and floating speech bubbles
  const g = new THREE.Group();
  cyl(g, 2.5, 2.6, 2.3, C.white, 0, 0, 0, {}, 48);
  cyl(g, 2.75, 2.75, 0.22, C.lilac, 0, 2.3, 0, {}, 48);
  dome(g, 2.45, C.lilac2, 0, 2.5, 0, { rough: 0.35 });
  torus(g, 2.6, 0.07, C.plum, 0, 2.28, 0, Math.PI / 2, { emissive: C.plum, ei: 0.3 });
  for (let i = 0; i < 6; i++) { const a = -0.3 + i * 0.52; box(g, 0.7, 1.2, 0.08, C.glass, Math.sin(a + 0.8) * 2.52, 0.55, Math.cos(a + 0.8) * 2.52, 0.04, glassMat).rotation.y = a + 0.8; }
  box(g, 1.1, 1.5, 0.08, C.deep, 0, 0, 2.55, 0.05);
  const bub = (x, y, z, col, s) => { const b = new THREE.Group(); box(b, 1.5 * s, 1.0 * s, 0.5 * s, col, 0, 0, 0, 0.3 * s, { emissive: col, ei: 0.18 }); const tail = shadowed(new THREE.Mesh(new THREE.ConeGeometry(0.22 * s, 0.4 * s, 4), mat(col))); tail.position.set(-0.4 * s, -0.12 * s, 0); tail.rotation.z = Math.PI; b.add(tail); b.position.set(x, y, z); g.add(b); return b; };
  const b1 = bub(-0.5, 5.2, 0.5, C.plum, 1), b2 = bub(1.2, 6.2, -0.6, C.pink, 0.8);
  return { g, tick: (t) => { b1.position.y = 5.2 + Math.sin(t * 1.3) * 0.15; b2.position.y = 6.2 + Math.sin(t * 1.1 + 1) * 0.15; } };
}

export function buildResearch() { // strategy & research: observatory with dome, telescope, books, magnifier
  const g = new THREE.Group();
  box(g, 4.2, 2.8, 4.2, C.white, 0, 0, 0, 0.22);
  windows(g, 0, 0, 4.2, 4.2, 0.7, 1.2, 3, 3);
  box(g, 1.0, 1.6, 0.08, C.deep, 0, 0, 2.12, 0.05);
  cyl(g, 2.0, 2.0, 0.3, C.lilac, 0, 2.8, 0, {}, 48);
  const d = dome(g, 1.9, C.white, 0, 3.1, 0);
  const slit = box(g, 0.5, 1.9, 0.9, C.dark, 0.7, 3.6, 1.0, 0.1); slit.rotation.x = -0.7; slit.rotation.y = 0.5;
  const tel = new THREE.Group(); tel.position.set(0.1, 3.8, 0.4); tel.rotation.set(-0.9, 0.55, 0); g.add(tel);
  cyl(tel, 0.34, 0.26, 2.4, C.plum, 0, 0, 0, { emissive: C.plum, ei: 0.2 }); cyl(tel, 0.4, 0.4, 0.2, C.deep, 0, 2.3, 0);
  [[2.9, 0.0, 1.2, C.plum, 0.5], [2.9, 0.5, 1.2, C.mid, 0.4], [2.95, 0.9, 1.1, C.pink, 0.35]].forEach(([x, y, w, c, h], i) => box(g, w, h * 0.7, 0.9, c, x - 0.0, y, 2.6 + i * 0.03 - 1.4 + 0.0, 0.08)); // book stack beside
  const lens = torus(g, 0.75, 0.12, C.deep, -3.1, 1.6, 2.4, 0, { emissive: C.plum, ei: 0.2 }); lens.rotation.y = 0.8;
  const handle = box(g, 0.2, 1.1, 0.2, C.deep, -3.1, 0, 2.4, 0.08); handle.position.set(-2.6, 0.95, 1.9); handle.rotation.z = -0.9; handle.rotation.y = 0.8;
  const glassLens = new THREE.Mesh(new THREE.CircleGeometry(0.66, 32), mat(C.glass, { emissive: 0xc8b5f8, ei: 0.3, opacity: 0.55, side: THREE.DoubleSide })); glassLens.position.copy(lens.position); glassLens.rotation.y = 0.8; g.add(glassLens);
  return { g, tick: (t) => { d.rotation.y = Math.sin(t * 0.3) * 0.25; } };
}

export function buildCreative(anim) { // creative studio: sawtooth roof, canvas on an easel, floating frames, palette
  const g = new THREE.Group();
  box(g, 5.6, 2.6, 4.2, C.white, 0, 0, 0, 0.2);
  for (let i = 0; i < 3; i++) prism(g, 1.7, 1.4, 4.2, i % 2 ? C.lilac : C.lilac2, -2.2 + i * 1.85, 2.6, 0);
  windows(g, 0, 0, 5.6, 4.2, 0.6, 1.3, 4, 3);
  box(g, 1.1, 1.5, 0.08, C.deep, 0, 0, 2.12, 0.05);
  const art = canvasTex(256, 192, (c, w, h) => { const gr = c.createLinearGradient(0, 0, w, h); gr.addColorStop(0, '#f3b6e4'); gr.addColorStop(0.5, '#b544b5'); gr.addColorStop(1, '#661466'); c.fillStyle = gr; c.fillRect(0, 0, w, h); c.fillStyle = 'rgba(255,255,255,.85)'; c.beginPath(); c.arc(80, 70, 34, 0, 7); c.fill(); c.fillStyle = 'rgba(255,255,255,.35)'; c.beginPath(); c.moveTo(0, h); c.lineTo(110, 90); c.lineTo(190, 140); c.lineTo(w, 100); c.lineTo(w, h); c.fill(); });
  const easel = new THREE.Group(); easel.position.set(3.2, 0, 2.7); easel.rotation.y = 0.2; g.add(easel);
  cyl(easel, 0.06, 0.06, 2.1, C.deep, -0.7, 0, -0.35); cyl(easel, 0.06, 0.06, 2.1, C.deep, 0.7, 0, -0.35); cyl(easel, 0.06, 0.06, 2.3, C.deep, 0, 0, 0.4).rotation.x = 0.15;
  box(easel, 2.1, 1.6, 0.12, C.white, 0, 0.7, 0, 0.06);
  plane(easel, 1.9, 1.42, art, 0, 1.5, 0.07);
  const frames = [];
  [[-1.4, 5.2, 0.8, 0.5], [0.9, 6.0, -0.6, 1.3], [2.3, 4.8, 0.2, 2.1]].forEach(([x, y, z, ph], i) => {
    const f = new THREE.Group(); box(f, 1.3, 1.0, 0.1, C.white, 0, 0, 0, 0.05); plane(f, 1.15, 0.85, art, 0, 0.5, 0.06); f.position.set(x, y, z); f.rotation.y = 0.4; g.add(f); frames.push([f, y, ph]);
  });
  const pal = new THREE.Group(); pal.position.set(-3.0, 0, 2.6); g.add(pal);
  cyl(pal, 0.8, 0.8, 0.14, C.white, 0, 0.3, 0, {}, 40); cyl(pal, 0.1, 0.1, 0.3, C.deep, 0, 0, 0);
  [C.plum, C.pink, C.violet, C.dev, C.glow].forEach((c, i) => cyl(pal, 0.14, 0.14, 0.1, c, Math.cos(i * 1.25) * 0.5, 0.44, Math.sin(i * 1.25) * 0.5, { emissive: c, ei: 0.2 }, 16));
  return { g, tick: (t) => frames.forEach(([f, y, ph]) => { f.position.y = y + Math.sin(t * 1.2 + ph) * 0.16; f.rotation.y = 0.4 + Math.sin(t * 0.5 + ph) * 0.25; }) };
}

export function buildDelivery(anim) { // ads performance: broadcast mast, dish, megaphone, target rings
  const g = new THREE.Group();
  box(g, 4.4, 2.4, 4.0, C.white, 0, 0, 0, 0.2);
  windows(g, 0, 0, 4.4, 4.0, 0.55, 1.2, 3, 3);
  box(g, 1.0, 1.5, 0.08, C.deep, 0, 0, 2.02, 0.05);
  cyl(g, 0.34, 0.5, 4.2, C.white, -0.3, 2.4, -0.2, {}, 24);
  for (const y of [3.4, 4.8, 6.0]) cyl(g, 0.5, 0.5, 0.12, C.plum, -0.3, y, -0.2, { emissive: C.plum, ei: 0.25 }, 24);
  const dish = new THREE.Group(); dish.position.set(-0.3, 5.6, -0.2); g.add(dish);
  const bowl = shadowed(new THREE.Mesh(new THREE.SphereGeometry(1.3, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2.6), mat(C.lilac, { side: THREE.DoubleSide, rough: 0.3 }))); bowl.rotation.x = Math.PI / 2 - 0.7; bowl.position.set(0.1, 0.3, 0.3); dish.add(bowl);
  const feed = cyl(dish, 0.05, 0.05, 1.3, C.deep, 0.1, 0.1, 0.9); feed.rotation.x = Math.PI / 2 - 0.7; feed.position.set(0.1, 0.65, 1.1);
  sph(dish, 0.14, C.glow, 0.1, 0.95, 1.55, { emissive: C.glow, ei: 1 });
  const mega = new THREE.Group(); mega.position.set(1.6, 2.4, 0.4); mega.rotation.set(0, 0.6, 0.35); g.add(mega);
  const cone = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.28, 1.5, 28), mat(C.plum, { emissive: C.plum, ei: 0.2 }))); cone.rotation.z = -Math.PI / 2; cone.position.set(0.7, 0.9, 0); mega.add(cone);
  cyl(mega, 0.34, 0.34, 0.5, C.deep, -0.2, 0.64, 0).rotation.z = Math.PI / 2;
  const waves = [0.9, 1.4, 1.9].map((r, i) => { const w = torus(mega, r, 0.04, C.glow, 2.0 + i * 0.35, 0.9, 0, 0, { emissive: C.glow, ei: 1.0, opacity: 0.7 }); w.material = w.material.clone(); w.rotation.y = Math.PI / 2; w.scale.setScalar(0.5 + i * 0.25); return w; });
  const target = new THREE.Group(); target.position.set(2.6, 0.02, 2.4); g.add(target);
  [1.3, 0.95, 0.6, 0.28].forEach((r, i) => cyl(target, r, r, 0.05 + i * 0.01, i % 2 ? C.white : C.plum, 0, 0, 0, { emissive: C.plum, ei: i % 2 ? 0 : 0.15 }, 40));
  const arrow = new THREE.Group(); arrow.position.set(2.6, 0.2, 2.4); arrow.rotation.z = 0.5; g.add(arrow);
  cyl(arrow, 0.04, 0.04, 1.6, C.deep, 0, 0, 0); const fl = box(arrow, 0.3, 0.3, 0.04, C.dev, 0, 1.4, 0, 0.02);
  return { g, tick: (t) => { dish.rotation.y = Math.sin(t * 0.4) * 0.5; waves.forEach((w, i) => { const k = (t * 0.7 + i * 0.33) % 1; w.scale.setScalar(0.4 + k * 0.9); w.material.opacity = 0.8 * (1 - k) + 0.02; }); } };
}

export function buildData() { // data & reporting: server stack, big chart screen, database discs
  const g = new THREE.Group();
  const racks = [[-1.4, 0, 0, 3.2], [0.2, 0, 0, 2.6], [1.8, 0, 0, 2.0]];
  racks.forEach(([x, y, z, h]) => { box(g, 1.4, h, 3.2, C.white, x, y, z, 0.18); for (let i = 0; i < Math.floor(h / 0.6); i++) { box(g, 1.1, 0.12, 0.06, i % 3 === 0 ? C.live : C.glass, x, 0.4 + i * 0.55, 1.63, 0.03, { emissive: i % 3 === 0 ? C.live : 0xb9a3f5, ei: 0.7 }); } });
  box(g, 5.2, 0.3, 3.7, C.lilac, 0, 3.3, 0, 0.12).visible = false;
  const scr = new THREE.Group(); scr.position.set(0.3, 2.3, -1.9); g.add(scr);
  box(scr, 4.4, 2.5, 0.2, C.deep, 0, 0, 0, 0.12);
  const chart = canvasTex(320, 180, (c, w, h) => { c.fillStyle = '#f9edf9'; c.fillRect(0, 0, w, h); c.fillStyle = '#d9a6df'; [40, 74, 56, 98, 82, 124, 108, 150].forEach((v, i) => { c.fillStyle = i % 2 ? '#b544b5' : '#d9a6df'; c.fillRect(24 + i * 36, h - 20 - v, 24, v); }); c.strokeStyle = '#661466'; c.lineWidth = 4; c.beginPath(); c.moveTo(20, 130); [[70, 100], [120, 112], [170, 70], [220, 80], [270, 36], [310, 20]].forEach(([x, y]) => c.lineTo(x, y)); c.stroke(); });
  plane(scr, 4.0, 2.25, chart, 0, 1.25, 0.11);
  [-1.6, 1.6].forEach((x) => cyl(scr, 0.08, 0.08, 1.4, C.deep, x, -1.4, -0.05));
  scr.position.y = 1.7;
  const disc = new THREE.Group(); disc.position.set(3.2, 0, 2.6); g.add(disc);
  [0, 1, 2].forEach((i) => { cyl(disc, 0.95, 0.95, 0.55, i === 1 ? C.plum : C.white, 0, i * 0.62, 0, i === 1 ? { emissive: C.plum, ei: 0.2 } : {}, 40); });
  const pulse = torus(disc, 1.05, 0.04, C.glow, 0, 1.0, 0, Math.PI / 2, { emissive: C.glow, ei: 1 });
  return { g, tick: (t) => { pulse.position.y = 0.4 + ((t * 0.5) % 1) * 1.3; } };
}

export const BUILDERS = {
  management: buildCommand, sales: buildSales, 'client-success': buildClient, 'strategy-research': buildResearch,
  'performance-creative': buildCreative, 'performance-delivery': buildDelivery, 'data-tracking-reporting': buildData,
};

// ---------- agents (one little robot per real agent) ----------

export function makeRobot(status, seed) {
  const g = new THREE.Group();
  const sc = STATUS_COLOR[status] ?? C.plan;
  const ghost = status === 'not_started';
  const body = ghost ? { opacity: 0.42, emissive: C.plan, ei: 0.35, rough: 0.3 } : {};
  cyl(g, 0.56, 0.6, 0.08, sc, 0, 0, 0, { emissive: sc, ei: ghost ? 0.5 : 0.55 }, 32);
  torus(g, 0.7, 0.025, sc, 0, 0.06, 0, Math.PI / 2, { emissive: sc, ei: 1, opacity: ghost ? 0.7 : 0 });
  const bodyM = new THREE.Mesh(new THREE.CapsuleGeometry(0.27, 0.34, 6, 14), mat(C.white, body)); bodyM.position.y = 0.58; bodyM.castShadow = !ghost; g.add(bodyM);
  const stripe = cyl(g, 0.285, 0.285, 0.07, sc, 0, 0.5, 0, { emissive: sc, ei: 0.6, ...(ghost ? { opacity: 0.6 } : {}) }, 24);
  const head = new THREE.Group(); head.position.y = 1.18; g.add(head);
  const hm = new THREE.Mesh(new THREE.SphereGeometry(0.31, 24, 16), mat(C.white, body)); hm.castShadow = !ghost; head.add(hm);
  const visor = new THREE.Mesh(new THREE.SphereGeometry(0.265, 20, 12), mat(C.dark, { rough: 0.15, metal: 0.3, ...(ghost ? { opacity: 0.55 } : {}) })); visor.scale.set(1, 0.62, 0.62); visor.position.set(0, 0.02, 0.17); head.add(visor);
  const eyeCol = status === 'live' ? C.glow : status === 'in_development' ? C.pink : C.plan;
  [-0.1, 0.1].forEach((x) => { const e = sph(head, 0.045, eyeCol, x, 0.03, 0.34, { emissive: eyeCol, ei: 1.6 }); e.castShadow = false; });
  const ant = cyl(head, 0.018, 0.018, 0.2, C.deep, 0, 0.3, 0, ghost ? { opacity: 0.5 } : {}, 8);
  const bulb = sph(head, 0.06, sc, 0, 0.53, 0, { emissive: sc, ei: 1.3 }); bulb.castShadow = false;
  [-1, 1].forEach((s) => sph(g, 0.085, C.white, s * 0.33, 0.62, 0.02, body));
  if (status === 'in_development') { // hard hat: the agent is still being built
    const hat = new THREE.Mesh(new THREE.SphereGeometry(0.34, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2.1), mat(C.dev, { rough: 0.4 })); hat.position.y = 0.05; hat.castShadow = true; head.add(hat);
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.04, 24), mat(C.dev, { rough: 0.4 })); brim.position.set(0, 0.07, 0.04); head.add(brim);
    box(head, 0.1, 0.12, 0.34, 0xffffff, 0, 0.29, 0, 0.04).material = mat(0xffe3c9);
    ant.visible = false; bulb.visible = false;
  }
  let holo = null;
  if (status === 'live') {
    holo = new THREE.Group(); holo.position.set(0.85, 0.95, 0.1); holo.rotation.y = -0.5; g.add(holo);
    const tex = canvasTex(128, 96, (c, w, h) => { c.fillStyle = 'rgba(181,68,181,.18)'; c.fillRect(0, 0, w, h); c.strokeStyle = 'rgba(235,156,239,.9)'; c.lineWidth = 3; c.strokeRect(2, 2, w - 4, h - 4); c.fillStyle = 'rgba(235,156,239,.95)'; [30, 50, 38, 62].forEach((v, i) => c.fillRect(18 + i * 26, h - 14 - v, 16, v)); });
    plane(holo, 0.9, 0.68, tex, 0, 0, 0, 0, 0, true);
  }
  g.userData.seed = seed; g.userData.parts = { head, bulb, holo, ghost, status };
  return g;
}
export function tickRobot(g, t) {
  const { head, bulb, holo, status } = g.userData.parts; const s = g.userData.seed;
  g.position.y = (g.userData.baseY || 0) + Math.sin(t * 1.8 + s) * (status === 'not_started' ? 0.07 : 0.025);
  head.rotation.y = Math.sin(t * 0.7 + s * 1.7) * 0.45;
  if (status === 'live') bulb.scale.setScalar(0.8 + Math.sin(t * 4 + s) * 0.25);
  if (holo) holo.position.y = 0.95 + Math.sin(t * 1.4 + s) * 0.05;
}

// ---------- extras ----------

export function makeTree(h = 1, col = C.pink) {
  const g = new THREE.Group();
  cyl(g, 0.09 * h, 0.12 * h, 0.9 * h, C.deep, 0, 0, 0, {}, 8);
  sph(g, 0.62 * h, col, 0, 1.25 * h, 0, { rough: 0.8 }, 1, 1.1, 1);
  sph(g, 0.4 * h, col, 0.28 * h, 1.7 * h, 0.1 * h, { rough: 0.8 });
  return g;
}
export function makeLamp() {
  const g = new THREE.Group();
  cyl(g, 0.04, 0.05, 1.5, C.deep, 0, 0, 0, {}, 8); sph(g, 0.14, C.glow, 0, 1.6, 0, { emissive: C.glow, ei: 1.4 });
  return g;
}
export function makeCart(col = C.plum) { // a small hover van with a parcel on top
  const g = new THREE.Group();
  box(g, 1.7, 0.5, 0.95, C.white, 0, 0.15, 0, 0.18);
  box(g, 0.6, 0.55, 0.9, col, 0.55, 0.45, 0, 0.16, { emissive: col, ei: 0.15 });
  box(g, 1.75, 0.07, 1.0, C.glow, 0, 0.1, 0, 0.03, { emissive: C.glow, ei: 1.1 });
  const parcel = new THREE.Group(); parcel.position.set(-0.3, 0.68, 0); g.add(parcel);
  box(parcel, 0.7, 0.55, 0.7, C.white, 0, 0, 0, 0.1); box(parcel, 0.14, 0.58, 0.72, col, 0, 0, 0, 0.05, { emissive: col, ei: 0.2 }); box(parcel, 0.72, 0.58, 0.14, col, 0, 0, 0, 0.05, { emissive: col, ei: 0.2 });
  g.userData.parcel = parcel;
  return g;
}
export function makeCloud(s = 1) {
  const g = new THREE.Group();
  [[0, 0, 0, 1.6], [1.4, -0.1, 0.3, 1.2], [-1.4, -0.1, -0.2, 1.1], [0.5, 0.5, 0, 1.0]].forEach(([x, y, z, r]) => { const m = new THREE.Mesh(new THREE.SphereGeometry(r * s, 20, 12), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 })); m.position.set(x * s, y * s, z * s); m.scale.y = 0.62; g.add(m); });
  return g;
}

export { canvasTex, plane, torus, dome, prism, windows, glassMat };
