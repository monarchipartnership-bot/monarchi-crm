import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { C, box, cyl, makeCart, mat, canvasTex } from './models.js';
import { loadAssets, makeCartGlb, setRobotRun } from './assets.js';
import { createBuilding } from './buildings.js';
import { buildPark, instancedProto } from './park.js';
import { buildForecourts } from './forecourt.js';
import { initDayNight, collectEmissives } from './daynight.js';
import { additive, haloTex, poolTex, onNight, hookMark, hookTrim } from './night.js';
import { RUN, runOf } from './runstatus.js';
import './world3d.css';

const ICONS = {
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
  minus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M5 12h14"/></svg>',
  rotL: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/></svg>',
  rotR: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/></svg>',
  home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11 12 3l9 8"/><path d="M5 10v10h14V10"/></svg>',
};

// The 3D map. `container` is an empty element; `opts`: { depts, onFocusDept(key), onOpenAgent(dept, agent), onReset(), debug }.
// Returns { api, setRunStatus(map), setPaused(bool), dispose() }.
export async function createWorld(container, opts = {}) {
const DEPTS = opts.depts;
let halo = null;
const hookStart = hookMark();
let disposed = false;
const assets = await loadAssets();

// ------------------------------------------------------------ renderer, camera
const root = container; root.classList.add('w3d'); root.innerHTML = '';
const mk = (tag, cls, parent = root) => { const e = document.createElement(tag); e.className = cls; parent.appendChild(e); return e; };
const sky = mk('div', 'w3d-sky'), starsEl = mk('canvas', 'w3d-stars', sky), moonEl = mk('div', 'w3d-moon', sky);
const stage = mk('div', 'w3d-stage');
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NeutralToneMapping;
stage.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const VIEW_H = 88;
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -400, 800);
const BASE_OFFSET = new THREE.Vector3(1, 0.95, 1).normalize().multiplyScalar(160);
const HOME = new THREE.Vector3(-4, 0, -4);
camera.position.copy(BASE_OFFSET);
function resize() {
  const w = stage.clientWidth, h = stage.clientHeight, a = w / h, H = Math.max(VIEW_H, 104 / a);
  renderer.setSize(w, h); root.classList.toggle('w3d-narrow', w < 640); // a small stage (a phone) gets smaller labels and the controls in a row
  camera.left = -H * a / 2; camera.right = H * a / 2; camera.top = H / 2; camera.bottom = -H / 2;
  camera.updateProjectionMatrix();
}
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true; controls.dampingFactor = 0.09;
controls.mouseButtons = { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE };
controls.touches = { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_ROTATE };
controls.screenSpacePanning = false; controls.zoomToCursor = true;
controls.minZoom = 0.95; controls.maxZoom = 4.5; controls.zoomSpeed = 0.9;
controls.minPolarAngle = 0.72; controls.maxPolarAngle = 1.12;
controls.minAzimuthAngle = Math.PI / 4 - 0.62; controls.maxAzimuthAngle = Math.PI / 4 + 0.62;
controls.target.copy(HOME); controls.update();
const HOME_OFFSET = camera.position.clone().sub(controls.target); // the standard viewing angle

// ------------------------------------------------------------ light (the sun follows the camera target so shadows stay sharp)
const hemi = new THREE.HemisphereLight(0xffffff, 0xe3b9ef, 0.95); scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff2ff, 2.6);
sun.castShadow = true; sun.shadow.mapSize.set(3072, 3072);
Object.assign(sun.shadow.camera, { left: -44, right: 44, top: 44, bottom: -44, near: 1, far: 220 });
sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.05; sun.shadow.radius = 4;
const SUN_OFF = new THREE.Vector3(-34, 70, 44);
scene.add(sun, sun.target);
const fill = new THREE.DirectionalLight(0xe8c6ff, 0.55); fill.position.set(40, 24, -30); scene.add(fill);

// ------------------------------------------------------------ the district: a square street grid, one building per city block
const world = new THREE.Group(); scene.add(world);
const GRID = 32, ROADW = 4.4, BLOCK = GRID - ROADW; // block plates are 27.6 wide, streets between them
const STREETS = [-112, -80, -48, -16, 16, 48, 80, 112]; // street centre lines (x and z)
const ASPHALT = 0xd9c3e3, KERB = 0xfdf8fe;
function fadeTex() {
  const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d');
  const gr = g.createRadialGradient(128, 128, 0, 128, 128, 128); gr.addColorStop(0, '#fff'); gr.addColorStop(0.62, '#fff'); gr.addColorStop(0.98, '#000'); g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
  return new THREE.CanvasTexture(c);
}
const ground = new THREE.Mesh(new THREE.PlaneGeometry(270, 270), new THREE.MeshStandardMaterial({ color: ASPHALT, alphaMap: fadeTex(), transparent: true, roughness: 0.95 }));
ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; world.add(ground);
const RING_ORDER = ['strategy-research', 'performance-creative', 'performance-delivery', 'data-tracking-reporting', 'client-success', 'sales']; // the order of the chain (also the demo route)
const PLOT = { management: [0, 0], 'strategy-research': [-1, 0], 'performance-creative': [-1, -1], 'performance-delivery': [-1, 1], 'data-tracking-reporting': [1, -1], 'client-success': [1, 0], sales: [1, 1] };
const PARKS = [[0, 1], [0, -1]];
// the zebra crossings sit where the door drives meet the street; the lane dashes leave them free
const CROSSINGS = Object.values(PLOT).map(([i, j]) => [i * GRID, j * GRID + GRID / 2]);
// lane dashes down the middle of every street (not across crossings)
{
  const dash = new THREE.BoxGeometry(1.6, 0.03, 0.2), dm = new THREE.InstancedMesh(dash, mat(C.white, { rough: 0.8 }), 1600); let n = 0; const o = new THREE.Object3D();
  STREETS.forEach((s) => { for (let u = -118; u <= 118; u += 4.2) { if (STREETS.some((c) => Math.abs(u - c) < ROADW / 2 + 1.5)) continue; if (CROSSINGS.some(([cx, cz]) => Math.abs(cz - s) < 0.1 && Math.abs(u - cx) < 2.6)) continue; o.position.set(u, 0.03, s); o.rotation.set(0, 0, 0); o.updateMatrix(); dm.setMatrixAt(n++, o.matrix); o.position.set(s, 0.03, u); o.rotation.set(0, Math.PI / 2, 0); o.updateMatrix(); dm.setMatrixAt(n++, o.matrix); } });
  dm.count = n; dm.receiveShadow = true; world.add(dm);
}
const blockCentre = (i, j) => new THREE.Vector3(i * GRID, 0, j * GRID);
// raised city blocks (the kerb), one per cell of the grid
const blockMat = mat(KERB, { rough: 0.9 });
for (let i = -3; i <= 3; i++) for (let j = -3; j <= 3; j++) { const b = new THREE.Mesh(new RoundedBoxGeometry(BLOCK, 0.2, BLOCK, 2, 0.5), blockMat); b.position.set(i * GRID, 0.04, j * GRID); b.receiveShadow = true; world.add(b); }

// ------------------------------------------------------------ buildings: the pad's front edge sits 3.2 from the street, a drive runs from the door to the street
const buildings = new Map();
const pickables = [];
const FRONT = BLOCK / 2 - 3.2; // front edge of every pad, relative to the block centre
function addBuilding(d, cell, idx) {
  const b = createBuilding(d, assets, idx), c = blockCentre(cell[0], cell[1]);
  const pos = new THREE.Vector3(c.x, 0.14, c.z + FRONT - (b.D + 4.6) / 2);
  b.root.position.copy(pos); world.add(b.root);
  b.pos = pos.clone(); b.idx = idx; b.cell = c; b.door = new THREE.Vector3(c.x, 0.5, c.z + GRID / 2); // the middle of the street in front of the door
  // the drive from the pad to the street, with a zebra crossing on the street
  const drv = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.16, 3.4), mat(C.lilac2, { rough: 0.9 })); drv.position.set(c.x, 0.125, c.z + FRONT + 1.7); drv.receiveShadow = true; world.add(drv);
  for (let k = -2; k <= 2; k++) box(world, 3.4, 0.03, 0.45, C.white, c.x, 0.0, c.z + GRID / 2 + k * 0.8, 0.01); // bars run parallel to the road, spread across its width
  buildings.set(d.key, b); pickables.push(b.root);
  return b;
}
addBuilding(DEPTS.find((d) => d.key === 'management'), PLOT.management, -1);
RING_ORDER.forEach((k, i) => addBuilding(DEPTS.find((d) => d.key === k), PLOT[k], i));

// ------------------------------------------------------------ scenery
const rng = (() => { let s = 11; return () => (s = (s * 16807) % 2147483647) / 2147483647; })();
const plots = [...buildings.values()];
const padRect = (b) => ({ x0: b.cell.x - (b.W + 4.6) / 2 - 1.2, x1: b.cell.x + (b.W + 4.6) / 2 + 1.2, z0: b.pos.z - (b.D + 4.6) / 2 - 1.2, z1: b.cell.z + BLOCK / 2 });
const inPad = (x, z) => plots.some((b) => { const r = padRect(b); return x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1; });
const trees = [];
function scatterTrees(cx, cz, n, keepOut) { for (let t = 0, k = 0; t < 200 && k < n; t++) { const x = cx + (rng() - 0.5) * (BLOCK - 3), z = cz + (rng() - 0.5) * (BLOCK - 3); if (keepOut(x, z)) continue; trees.push([x, z, 0.8 + rng() * 0.8]); k++; } }
// the two parks (they use the free cells of the 3x3 square): paths, a fountain, flower beds, benches, hedges and trees
const parkTicks = [];
const parkLamps = [];
PARKS.forEach(([i, j]) => buildPark(world, blockCentre(i, j), assets, BLOCK, parkTicks, parkLamps));
// the margins of the central blocks: a few trees where the pads leave room
buildForecourts(world, plots, assets, { BLOCK, FRONT, rng }); // lawn, paved apron, hedges, beds, benches, trees, a car bay and bollards round every building
{ // trees as three instanced meshes
  const N = Math.max(1, trees.length), trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.1, 0.14, 1, 8), mat(C.deep), N), c1 = new THREE.InstancedMesh(new THREE.SphereGeometry(0.7, 14, 10), mat(0xffffff, { rough: 0.8 }), N), c2 = new THREE.InstancedMesh(new THREE.SphereGeometry(0.45, 12, 8), mat(0xffffff, { rough: 0.8 }), N);
  const o = new THREE.Object3D(), col = new THREE.Color(); const cols = [C.pink, C.mid, 0xe3a4f0, 0xf6cdf0, 0xc9a4f0];
  trees.forEach(([x, z, s], n) => {
    o.rotation.set(0, rng() * 6, 0); const y = 0.2;
    o.position.set(x, y + 0.5 * s, z); o.scale.set(s, s, s); o.updateMatrix(); trunk.setMatrixAt(n, o.matrix);
    o.position.set(x, y + 1.5 * s, z); o.scale.set(s, s * 1.1, s); o.updateMatrix(); c1.setMatrixAt(n, o.matrix);
    o.position.set(x + 0.3 * s, y + 2.1 * s, z + 0.1 * s); o.scale.set(s, s, s); o.updateMatrix(); c2.setMatrixAt(n, o.matrix);
    col.setHex(cols[Math.floor(rng() * cols.length)]); c1.setColorAt(n, col); c2.setColorAt(n, col);
  });
  [trunk, c1, c2].forEach((m) => { m.count = trees.length; m.castShadow = true; m.receiveShadow = true; world.add(m); });
}
// street lamps along every street of the work zone (plus the lamps of the parks); at night each casts a pool of light and a halo
const lampPts = [];
[-48, -16, 16, 48].forEach((st) => { for (let u = -56, k = 0; u <= 56; u += 16, k++) { const side = k % 2 ? 1 : -1; lampPts.push([u, st + 2.9 * side]); lampPts.push([st + 2.9 * side, u]); } });
instancedProto(world, assets, 'lamp_post', lampPts.map(([x, z]) => [x, z, 1.0]));
const lampAll = [...lampPts.map(([x, z]) => [x, z, 2.75]), ...parkLamps.map(([x, z]) => [x, z, 2.5])];
{
  const poolGeo = new THREE.PlaneGeometry(11, 11); poolGeo.rotateX(-Math.PI / 2); const pm = additive(poolTex, 0xffd2f4), pools = new THREE.InstancedMesh(poolGeo, pm, lampAll.length), m4 = new THREE.Matrix4();
  lampAll.forEach(([x, z], i) => { m4.makeTranslation(x, 0.18, z); pools.setMatrixAt(i, m4); }); pools.renderOrder = 6; pools.frustumCulled = false; world.add(pools); onNight((n) => { pm.opacity = 0.5 * n; });
  const hg = new THREE.BufferGeometry(); hg.setAttribute('position', new THREE.Float32BufferAttribute(lampAll.flatMap(([x, z, y]) => [x, y + 0.14, z]), 3));
  halo = new THREE.Points(hg, new THREE.PointsMaterial({ map: haloTex, size: 30, sizeAttenuation: false, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })); halo.renderOrder = 7; halo.frustumCulled = false; world.add(halo);
  onNight((n) => { halo.material.opacity = 0.8 * n; });
}
// outer city blocks (they fade into the haze)
{
  const winTex = canvasTex(64, 64, (c, w, h) => { c.fillStyle = '#fff'; c.fillRect(0, 0, w, h); c.fillStyle = '#d6d8ee'; for (let y = 6; y < h; y += 16) for (let x = 6; x < w; x += 16) c.fillRect(x, y, 9, 8); });
  winTex.wrapS = winTex.wrapT = THREE.RepeatWrapping;
  const tints = [0xeceaf8, 0xe6e6f6, 0xf0eefa, 0xe2e3f4, 0xeeeefa];
  for (let i = -3; i <= 3; i++) for (let j = -3; j <= 3; j++) {
    if (Math.abs(i) <= 1 && Math.abs(j) <= 1) continue;
    const c = blockCentre(i, j), far = Math.max(Math.abs(i), Math.abs(j));
    if (rng() < 0.16) { const lawn = new THREE.Mesh(new RoundedBoxGeometry(BLOCK - 2, 0.1, BLOCK - 2, 2, 0.4), mat(0xe9d9f4, { rough: 0.95 })); lawn.position.set(c.x, 0.2, c.z); world.add(lawn); continue; }
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([qx, qz]) => {
      if (rng() < 0.15) return;
      const w = 8 + rng() * 4, d = 8 + rng() * 4, h = (2 + rng() * 3.6) * (far === 2 ? 1 : 0.85), x = c.x + qx * 7, z = c.z + qz * 7;
      const tex = winTex.clone(); tex.needsUpdate = true; tex.repeat.set(Math.max(1, Math.round(w / 3)), Math.max(1, Math.round(h / 3)));
      const m = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 3, 0.35), new THREE.MeshStandardMaterial({ color: tints[Math.floor(rng() * tints.length)], map: tex, roughness: 0.75 }));
      m.position.set(x, 0.14 + h / 2, z); m.castShadow = true; m.receiveShadow = true; world.add(m);
      box(world, w + 0.3, 0.25, d + 0.3, 0xdcddf0, x, 0.14 + h, z, 0.1);
    });
  }
}

// ------------------------------------------------------------ demo carts that drive along the streets (not real task data)
const VX = [-48, -16, 16, 48];
function route(a, b) { // a, b: points in the middle of a street running along x; go along it, turn into a cross street, come back to the second street
  if (Math.abs(a.z - b.z) < 0.01) return [b];
  let xv = VX[0], cost = 1e9; VX.forEach((x) => { const c = Math.abs(a.x - x) + Math.abs(b.x - x); if (c < cost) { cost = c; xv = x; } });
  return [{ x: xv, z: a.z }, { x: xv, z: b.z }, b];
}
function makePath(points) { const seg = []; let L = 0; for (let i = 0; i < points.length - 1; i++) { const a = points[i], b = points[i + 1], l = Math.hypot(b.x - a.x, b.z - a.z); if (l < 1e-3) continue; seg.push({ a, l, s0: L, dx: (b.x - a.x) / l, dz: (b.z - a.z) / l }); L += l; } return { seg, L }; }
function pathAt(p, s) { s = ((s % p.L) + p.L) % p.L; for (const g of p.seg) if (s <= g.s0 + g.l) return { x: g.a.x + g.dx * (s - g.s0), z: g.a.z + g.dz * (s - g.s0), dx: g.dx, dz: g.dz }; const g = p.seg[p.seg.length - 1]; return { x: g.a.x, z: g.a.z, dx: g.dx, dz: g.dz }; }
const LANE = 1.0;
const dirOf = (a, b) => { const l = Math.hypot(b.x - a.x, b.z - a.z) || 1; return { dx: (b.x - a.x) / l, dz: (b.z - a.z) / l }; };
// the same route shifted onto the right-hand lane; at a corner the two shifted lines cross, so the van follows a clean path without jumps
function laneOffset(points) {
  const P = [points[0]]; points.forEach((q) => { const l = P[P.length - 1]; if (Math.hypot(q.x - l.x, q.z - l.z) > 1e-3) P.push(q); });
  const raw = P.slice(0, -1), m = raw.length, out = [];
  const off = (i) => { const d = dirOf(raw[i], raw[(i + 1) % m]); return { x: -d.dz * LANE, z: d.dx * LANE }; };
  for (let i = 0; i < m; i++) { const o1 = off((i - 1 + m) % m), o2 = off(i), straight = Math.abs(o1.x - o2.x) < 1e-6 && Math.abs(o1.z - o2.z) < 1e-6; out.push(straight ? { x: raw[i].x + o1.x, z: raw[i].z + o1.z } : { x: raw[i].x + o1.x + o2.x, z: raw[i].z + o1.z + o2.z }); }
  out.push(out[0]);
  return { pts: out, raw };
}
function drive(cart, p, dt) { // sit on the road and turn smoothly towards the direction of travel
  cart.position.set(p.x, 0.03, p.z);
  const target = -Math.atan2(p.dz, p.dx); let d = target - (cart.userData.ang ?? target); while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
  cart.userData.ang = (cart.userData.ang ?? target) + d * Math.min(1, dt * 9); cart.rotation.y = cart.userData.ang;
}
// the demo task visits the departments in the order of the chain and comes back along the streets
const stops = RING_ORDER.map((k) => buildings.get(k).door);
const heroRaw = [{ x: stops[0].x, z: stops[0].z }];
for (let i = 1; i <= stops.length; i++) { const a2 = heroRaw[heroRaw.length - 1], b2 = stops[i % stops.length]; route(a2, { x: b2.x, z: b2.z }).forEach((q) => heroRaw.push(q)); }
const heroLane = laneOffset(heroRaw);
const cum = [0]; heroLane.pts.forEach((q, i) => { if (i) cum.push(cum[i - 1] + Math.hypot(q.x - heroLane.pts[i - 1].x, q.z - heroLane.pts[i - 1].z)); });
const heroStop = [0]; { let from = 0; for (let k = 1; k < stops.length; k++) { let i = from; while (i < heroLane.raw.length && Math.hypot(heroLane.raw[i].x - stops[k].x, heroLane.raw[i].z - stops[k].z) > 1e-3) i++; heroStop.push(cum[i]); from = i; } heroStop.push(cum[cum.length - 1]); }
const heroPath = makePath(heroLane.pts);
const hero = { cart: makeCartGlb(assets.cart, C.plum, assets.logo), s: 0, pause: 2.2, next: 1, step: 0 };
hero.cart.scale.setScalar(1.75);
const heroRing = new THREE.Mesh(new THREE.TorusGeometry(1.15, 0.05, 10, 48), new THREE.MeshBasicMaterial({ color: C.glow })); heroRing.rotation.x = Math.PI / 2; heroRing.position.y = 0.05; hero.cart.add(heroRing);
world.add(hero.cart);
// quiet traffic on the two ring streets
const sq = (h) => [{ x: -h, z: -h }, { x: h, z: -h }, { x: h, z: h }, { x: -h, z: h }, { x: -h, z: -h }];
const loopLanes = [laneOffset(sq(16)), laneOffset(sq(48))];
const loops = loopLanes.map((l) => makePath(l.pts));

// the route of a van, drawn as a light dashed strip that fades in while you point at the van
const DASH = 3.4;
const dashTex = canvasTex(64, 16, (c) => { c.fillStyle = '#fff'; c.beginPath(); c.roundRect(2, 4, 36, 8, 4); c.fill(); });
dashTex.wrapS = THREE.RepeatWrapping;
function routeRibbon(pts, color) {
  const pos = [], uv = [], idx = []; let u = 0, vi = 0; const hw = 0.3;
  for (let i = 0; i < pts.length - 1; i++) {
    const a2 = pts[i], b2 = pts[i + 1], l = Math.hypot(b2.x - a2.x, b2.z - a2.z); if (l < 1e-3) continue;
    const dx = (b2.x - a2.x) / l, dz = (b2.z - a2.z) / l, nx = -dz * hw, nz = dx * hw, ax = a2.x - dx * hw, az = a2.z - dz * hw, bx = b2.x + dx * hw, bz = b2.z + dz * hw;
    pos.push(ax + nx, 0.07, az + nz, ax - nx, 0.07, az - nz, bx + nx, 0.07, bz + nz, bx - nx, 0.07, bz - nz);
    const u0 = u / DASH, u1 = (u + l) / DASH; uv.push(u0, 0, u0, 1, u1, 0, u1, 1); idx.push(vi, vi + 1, vi + 2, vi + 1, vi + 3, vi + 2); vi += 4; u += l;
  }
  const g2 = new THREE.BufferGeometry(); g2.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g2.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g2.setIndex(idx);
  const m = new THREE.Mesh(g2, new THREE.MeshBasicMaterial({ map: dashTex, color, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
  m.renderOrder = 4; m.visible = false; world.add(m); return m;
}
const heroRibbon = routeRibbon(heroLane.pts, C.plum), loopRibbons = loopLanes.map((l) => routeRibbon(l.pts, C.violet));
hero.cart.userData.info = { ribbon: heroRibbon, hero: true };
const carts = [[C.violet, 0, 0.0, 6], [C.pink, 0, 0.5, 6], [C.mid, 1, 0.1, 8], [C.violet, 1, 0.45, 8], [C.pink, 1, 0.75, 8]].map(([col, li, ph, v]) => { const c = makeCartGlb(assets.cart, col, assets.logo); c.scale.setScalar(1.6); c.userData.info = { ribbon: loopRibbons[li], hero: false }; world.add(c); return { c, li, ph, v }; });
const cartObjs = [hero.cart, ...carts.map((k) => k.c)];
let hoverRibbon = null;
const SPEED = 9;
function tickCarts(dt, t) {
  if (hero.pause > 0) hero.pause -= dt;
  else {
    hero.s += SPEED * dt;
    if (hero.s >= heroStop[hero.next]) { hero.s = heroStop[hero.next]; hero.pause = 2.4; hero.step = hero.next % RING_ORDER.length; hero.next = hero.next % (heroStop.length - 1) + 1; if (hero.s >= heroPath.L - 0.01) hero.s = 0; ui?.setStep(hero.step); }
  }
  drive(hero.cart, pathAt(heroPath, hero.s), dt);
  hero.cart.userData.parcel.position.y = hero.cart.userData.parcel.userData.base + Math.sin(t * 3) * 0.03;
  carts.forEach((k) => { const L = loops[k.li]; drive(k.c, pathAt(L, k.ph * L.L + t * k.v), dt); k.c.userData.parcel.position.y = k.c.userData.parcel.userData.base + Math.sin(t * 2.4 + k.ph * 9) * 0.03; });
}
function tickRoutes(dt, t) {
  dashTex.offset.x = -(t * 0.6) % 1;
  [heroRibbon, ...loopRibbons].forEach((r) => { const target = r === hoverRibbon ? 0.8 : 0; const o = r.material.opacity + (target - r.material.opacity) * Math.min(1, dt * 8); r.material.opacity = Math.abs(o - target) < 0.01 ? target : o; r.visible = r.material.opacity > 0.01; });
}

// ------------------------------------------------------------ HTML labels projected from the scene
const labelLayer = mk('div', 'w3d-labels');
const plural = (n) => (n === 1 ? 'агент' : n < 5 ? 'агенти' : 'агентів');
const ic = (path) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${path}</svg>`;
const DEPT_ICON = {
  management: ic('<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/>'),
  sales: ic('<path d="M4 4h16l-6 8v6l-4 2v-8z"/>'),
  'client-success': ic('<circle cx="9" cy="8" r="3"/><path d="M3 20a6 6 0 0 1 12 0"/><path d="m15 12 2 2 4-4"/>'),
  'strategy-research': ic('<circle cx="10" cy="10" r="6"/><path d="m21 21-5.2-5.2"/><path d="M8 11l2-2 2 2 3-3"/>'),
  'performance-creative': ic('<path d="M4 20h4l11-11-4-4L4 16z"/><path d="m14 7 3 3"/>'),
  'performance-delivery': ic('<path d="M3 10v4a1 1 0 0 0 1 1h3l5 4V5L7 9H4a1 1 0 0 0-1 1z"/><path d="M17 8a5 5 0 0 1 0 8"/>'),
  'data-tracking-reporting': ic('<path d="M6 20v-6M12 20V9M18 20V4"/>'),
};
const count = (d, st) => d.agents.filter((a) => a.status === st).length;
// the label over a building: a plum header with the department, and below it the split of its agents by status
function labelHTML(d) {
  const n = d.agents.length, live = count(d, 'live'), dev = count(d, 'in_development'), plan = count(d, 'not_started');
  return `<span class="lv-head"><span class="lv-ico">${DEPT_ICON[d.key] || ''}</span><b>${d.label}</b></span><span class="lv-status"><span><i class="s-live"></i>${live}</span><span><i class="s-dev"></i>${dev}</span><span><i class="s-plan"></i>${plan}</span><em>${n} ${plural(n)}</em></span>`;
}
const deptLabels = DEPTS.map((d) => {
  const b = buildings.get(d.key), el = document.createElement('button');
  el.type = 'button'; el.className = 'dept-label'; el.dataset.key = d.key; el.innerHTML = labelHTML(d);
  el.addEventListener('click', () => user.dept(d.key)); labelLayer.appendChild(el);
  return { el, b, d };
});
const STATUS_DOT = { live: 'live', in_development: 'dev', not_started: 'plan' };
const agentLabels = [];
const CHEV = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg>';
DEPTS.forEach((d) => { const b = buildings.get(d.key); d.agents.forEach((a, i) => {
  const run = RUN[runOf(a)], el = document.createElement('div'); el.className = 'agent-label'; el.hidden = true; el.style.setProperty('--c', run.css); el.style.setProperty('--ci', run.ink);
  el.innerHTML = `<b class="pin">${i + 1}</b><button type="button" class="abox" aria-label="Відкрити агента: ${a.name}"><span class="an-top"><span class="an-name">${a.name}</span><span class="an-go">${CHEV}</span></span><span class="an-st"><i></i>${run.label}</span></button>`;
  el.addEventListener('click', () => user.agent(d.key, a.key)); // the box opens the agent, like a click on the robot itself
  labelLayer.appendChild(el); agentLabels.push({ el, dept: d.key, key: a.key, robot: b.robots[i] });
}); });
const heroTag = document.createElement('div'); heroTag.className = 'hero-tag'; heroTag.innerHTML = '<i></i>Демо-задача'; labelLayer.appendChild(heroTag);
const tmp = new THREE.Vector3();
const place = (el, v) => { v.project(camera); el.style.transform = `translate(${((v.x * 0.5 + 0.5) * stage.clientWidth).toFixed(1)}px, ${((-v.y * 0.5 + 0.5) * stage.clientHeight).toFixed(1)}px) translate(-50%, -100%)`; };
let lastLs = 0;
function updateLabels() {
  // the agent boxes follow the scale of the scene: bigger when zoomed in, and below a readable size they fall back to just the numbered pins (the name shows on hover/selection)
  const pxu = stage.clientHeight / (camera.top - camera.bottom) * camera.zoom, ls = THREE.MathUtils.clamp(pxu * 0.02, 0.5, 1.05);
  if (Math.abs(ls - lastLs) > 0.01) { lastLs = ls; labelLayer.style.setProperty('--ls', ls.toFixed(2)); labelLayer.classList.toggle('mini', ls < 0.6); }
  deptLabels.forEach(({ el, b }) => { place(el, tmp.set(b.pos.x, b.topY, b.pos.z)); });
  const vis = agentLabels.filter((l) => !l.el.hidden), mini = labelLayer.classList.contains('mini'), W = stage.clientWidth, H = stage.clientHeight;
  vis.forEach((l) => { l.robot.getWorldPosition(tmp); tmp.y += 3.7; tmp.project(camera); l.sx = (tmp.x * 0.5 + 0.5) * W; l.sy = (-tmp.y * 0.5 + 0.5) * H; l.ow = l.el.offsetWidth; l.oh = l.el.offsetHeight; });
  // declutter: nearer boxes (lower on screen) keep their place, a box that would cover one of them is lifted above it and its stem grows
  const placed = [], pinW = mini ? 0 : 2.4 * 14 * (parseFloat(labelLayer.style.getPropertyValue('--ls')) || 1);
  vis.sort((a, b) => b.sy - a.sy).forEach((l) => {
    let y = l.sy; const w = l.ow + pinW, cx = l.sx - pinW / 2, h = l.oh;
    if (!mini) for (let k = 0; k < 14; k++) { const hit = placed.find((p) => Math.abs(cx - p.cx) < (w + p.w) / 2 + 4 && y - h < p.y + 3 && y > p.y - p.h - 3); if (!hit) break; y = hit.y - hit.h - 4; }
    placed.push({ cx, w, y, h });
    l.el.style.transform = `translate(${l.sx.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -100%)`; l.el.style.setProperty('--sh', (l.sy - y).toFixed(1) + 'px');
    l.el.style.zIndex = String(10 + Math.round(l.sy)); // the nearer a box is to the camera, the higher it sits
  });
  place(heroTag, hero.cart.getWorldPosition(tmp).setY(3.6));
}

// ------------------------------------------------------------ picking
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), tip = mk('div', 'w3d-tip'); tip.hidden = true;
function pick(ev) {
  const r = renderer.domElement.getBoundingClientRect();
  ndc.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  const hits = ray.intersectObjects(pickables, true);
  for (const h of hits) { let o = h.object, hidden = false; while (o) { if (o.visible === false) { hidden = true; break; } o = o.parent; } if (hidden) continue; o = h.object; while (o) { if (o.userData?.kind === 'agent') return { kind: 'agent', obj: o }; if (o.userData?.kind === 'dept') return { kind: 'dept', obj: o }; o = o.parent; } }
  return null;
}
let down = null;
renderer.domElement.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY }; });
renderer.domElement.addEventListener('pointerup', (e) => {
  if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 5) { down = null; return; }
  down = null;
  if (focus) { user.agent(focus.rb.userData.dept, focus.rb.userData.agent); return; } // the agent under the pointer, even when a row in front of it is faded
  const p = pick(e);
  if (!p) { user.reset(); return; }
  if (p.kind === 'agent') user.agent(p.obj.userData.dept, p.obj.userData.agent); else user.dept(p.obj.userData.key);
});
renderer.domElement.addEventListener('pointermove', (e) => {
  if (e.buttons) { tip.hidden = true; hoverRibbon = null; return; }
  const p = pick(e);
  // a van under the cursor (and nearer than any building): light up its route
  let van = null; const ch = ray.intersectObjects(cartObjs, true)[0];
  if (ch) { const bh = ray.intersectObjects(pickables, true).find((h) => { let o = h.object; while (o) { if (o.visible === false) return false; o = o.parent; } return true; }); if (!bh || ch.distance < bh.distance) { let o = ch.object; while (o && !o.userData.info) o = o.parent; van = o; } }
  hoverRibbon = van ? van.userData.info.ribbon : null;
  renderer.domElement.style.cursor = (p || van || focus) ? 'pointer' : 'grab';
  if (van) { const info = van.userData.info; const d = DEPTS.find((x) => x.key === RING_ORDER[hero.next % RING_ORDER.length]); tip.textContent = info.hero ? `Демо-задача · далі: ${d.label}` : 'Фоновий рух (демо)'; tip.hidden = false; tip.style.transform = `translate(${e.clientX + 14}px, ${e.clientY + 14}px)`; return; }
  tip.hidden = true;
});
renderer.domElement.addEventListener('pointerleave', () => { hoverRibbon = null; tip.hidden = true; });


// ------------------------------------------------------------ focus: the agent the pointer is on, and the agents standing in its way
const ptr = { x: 0, y: 0, in: false, drag: false };
let boxHover = null, focus = null;
const hovRing = new THREE.Mesh(new THREE.TorusGeometry(1.3, 0.1, 10, 56), new THREE.MeshBasicMaterial({ color: 0xc23fd6, transparent: true, opacity: 0, depthWrite: false })); hovRing.rotation.x = Math.PI / 2; hovRing.visible = false; hovRing.renderOrder = 8; scene.add(hovRing); // the ring under the agent the pointer is on
renderer.domElement.addEventListener('pointermove', (e) => { const r = renderer.domElement.getBoundingClientRect(); ptr.x = e.clientX - r.left; ptr.y = e.clientY - r.top; ptr.in = true; ptr.drag = !!e.buttons; });
renderer.domElement.addEventListener('pointerleave', () => { ptr.in = false; });
renderer.domElement.addEventListener('pointerdown', () => { ptr.drag = true; });
const onWinUp = () => { ptr.drag = false; }; window.addEventListener('pointerup', onWinUp);
agentLabels.forEach((l) => { l.el.addEventListener('mouseenter', () => { boxHover = l; }); l.el.addEventListener('mouseleave', () => { if (boxHover === l) boxHover = null; }); });
function updateFocus() {
  const W = stage.clientWidth, H = stage.clientHeight, pxu = H / (camera.top - camera.bottom) * camera.zoom, cands = [];
  buildings.forEach((b) => { if (b.open < 0.55) return; b.robots.forEach((rb) => { rb.getWorldPosition(tmp); tmp.y += 1.5; const vz = tmp.clone().applyMatrix4(camera.matrixWorldInverse).z; tmp.project(camera); cands.push({ rb, b, sx: (tmp.x * 0.5 + 0.5) * W, sy: (-tmp.y * 0.5 + 0.5) * H, vz, rx: 1.05 * pxu, ry: 1.6 * pxu, near: 3.6 * pxu }); }); });
  let f = null;
  if (boxHover) f = cands.find((c) => c.rb.userData.agent === boxHover.key && c.rb.userData.dept === boxHover.dept) || null;
  else if (ptr.in && !ptr.drag) { const hit = cands.filter((c) => ((ptr.x - c.sx) / c.rx) ** 2 + ((ptr.y - c.sy) / c.ry) ** 2 < 1); if (hit.length) f = hit.reduce((a, c) => (c.vz < a.vz ? c : a)); } // under the pointer, the one farthest from the camera wins
  focus = f;
  cands.forEach((c) => { const L = c.rb.userData.look; L.hlT = c === f ? 1 : 0; L.fadeT = f && c !== f && c.b === f.b && c.vz > f.vz + 0.4 && Math.hypot(c.sx - f.sx, c.sy - f.sy) < c.near ? 0.1 : 1; });
  if (f) { f.rb.getWorldPosition(hovRing.position); hovRing.position.y += 0.06; hovRing.userData.last = f.rb; }
  hovRing.userData.t = f ? 1 : 0; const hm = hovRing.material; hm.opacity += (hovRing.userData.t - hm.opacity) * 0.22; if (Math.abs(hm.opacity - hovRing.userData.t) < 0.01) hm.opacity = hovRing.userData.t; hovRing.visible = hm.opacity > 0.01; hovRing.scale.setScalar(0.85 + 0.15 * hm.opacity);
  agentLabels.forEach((l) => { const fade = l.robot.userData.look.fade; l.el.style.opacity = fade < 0.995 ? Math.max(0.1, fade).toFixed(3) : ''; l.el.style.pointerEvents = fade < 0.5 ? 'none' : ''; }); // a box fades together with its agent, and lets the pointer through while it is faded
  agentLabels.forEach((l) => l.el.classList.toggle('is-hover', !!f && l.key === f.rb.userData.agent && l.dept === f.rb.userData.dept));
}

// ------------------------------------------------------------ camera focus (650 ms, the kit's easing)
const ease = (t) => 1 - Math.pow(1 - t, 4);
let tween = null;
function flyTo(target, zoom, ms = 650, offsetTo = null) { const off0 = camera.position.clone().sub(controls.target); tween = { t0: performance.now(), ms, from: controls.target.clone(), to: target.clone(), z0: camera.zoom, z1: zoom, off0, off1: offsetTo ? offsetTo.clone() : off0.clone() }; }
function stepTween(now) { if (!tween) return; const k = Math.min(1, (now - tween.t0) / tween.ms), e = ease(k); controls.target.lerpVectors(tween.from, tween.to, e); camera.zoom = tween.z0 + (tween.z1 - tween.z0) * e; camera.updateProjectionMatrix(); camera.position.copy(controls.target).add(tween.off0.clone().lerp(tween.off1, e)); if (k >= 1) tween = null; }
controls.addEventListener('start', () => { tween = null; });

// ------------------------------------------------------------ state shared with the UI
const state = { dept: null, agent: null };
const selRing = new THREE.Mesh(new THREE.TorusGeometry(0.95, 0.06, 10, 40), new THREE.MeshBasicMaterial({ color: C.glow })); selRing.rotation.x = Math.PI / 2; selRing.visible = false; scene.add(selRing);
function applySelection() {
  buildings.forEach((b, k) => { b.sel.material.opacity = state.dept === k ? 0.9 : 0; });
  deptLabels.forEach(({ el }) => { el.classList.toggle('is-on', state.dept === el.dataset.key); });
  agentLabels.forEach((l) => { l.el.classList.toggle('is-on', l.key === state.agent && l.dept === state.dept); });
  selRing.visible = false;
  if (state.agent) { const b = buildings.get(state.dept), rb = b.robots.find((r) => r.userData.agent === state.agent); if (rb) { selRing.visible = true; selRing.userData.target = rb; } }
  opts.onState?.(state);
}
const zoomFor = (b) => THREE.MathUtils.clamp(0.7 * (Math.max(VIEW_H, 104 / (stage.clientWidth / stage.clientHeight)) * stage.clientWidth / stage.clientHeight) / ((b.W + b.D) / Math.SQRT2 + 5), 1.3, 3.4);
const api = {
  state,
  selectDept(key) { state.dept = key; state.agent = null; applySelection(); const b = buildings.get(key); flyTo(b.pos.clone().add(new THREE.Vector3(1.0, 2.0, 1.0)), zoomFor(b)); },
  selectAgent(deptKey, agentKey) { state.dept = deptKey; state.agent = agentKey; applySelection(); const b = buildings.get(deptKey), rb = b.robots.find((r) => r.userData.agent === agentKey), wp = rb.getWorldPosition(new THREE.Vector3()); flyTo(b.pos.clone().lerp(wp, 0.45).add(new THREE.Vector3(0, 1.5, 0)), zoomFor(b) * 1.15); },
  zoom(f) { flyTo(controls.target.clone(), THREE.MathUtils.clamp(camera.zoom * f, controls.minZoom, controls.maxZoom), 350); },
  rotate(rad) { const off = camera.position.clone().sub(controls.target), sph = new THREE.Spherical().setFromVector3(off); sph.theta = THREE.MathUtils.clamp(sph.theta + rad, controls.minAzimuthAngle, controls.maxAzimuthAngle); const to = new THREE.Vector3().setFromSpherical(sph), from = camera.position.clone().sub(controls.target), t0 = performance.now(); const step = () => { const k = Math.min(1, (performance.now() - t0) / 450); camera.position.copy(controls.target).add(from.clone().lerp(to, ease(k))); if (k < 1) requestAnimationFrame(step); }; step(); },
  reset() { state.dept = null; state.agent = null; applySelection(); flyTo(HOME, 1, 650, HOME_OFFSET); },
  clear() { api.reset(); },
  buildings,
};
const user = { // what a person does on the map: move the camera and tell the page, which owns the real state
  dept(k) { api.selectDept(k); opts.onFocusDept?.(k); },
  agent(d, k) { api.selectAgent(d, k); opts.onOpenAgent?.(d, k); },
  reset() { api.reset(); opts.onReset?.(); },
};
const camEl = mk('div', 'w3d-cam');
camEl.innerHTML = `<button type="button" data-a="in" aria-label="Наблизити">${ICONS.plus}</button><button type="button" data-a="out" aria-label="Віддалити">${ICONS.minus}</button><button type="button" data-a="rl" aria-label="Повернути ліворуч">${ICONS.rotL}</button><button type="button" data-a="rr" aria-label="Повернути праворуч">${ICONS.rotR}</button><button type="button" data-a="home" aria-label="Весь острів">${ICONS.home}</button>`;
camEl.addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; ({ in: () => api.zoom(1.35), out: () => api.zoom(1 / 1.35), rl: () => api.rotate(0.3), rr: () => api.rotate(-0.3), home: () => user.reset() })[b.dataset.a](); });
collectEmissives(scene, { mat_glow: 3.5 });
const dn = initDayNight({ app: root, sun, hemi, fill, renderer, stars: starsEl, moon: moonEl });
applySelection();

// ------------------------------------------------------------ a building opens by itself when you zoom in on it (and closes again when you leave)
let autoKey = null;
function updateAutoOpen() {
  let best = null, bd = 1e9;
  buildings.forEach((b) => { const d = Math.hypot(controls.target.x - b.pos.x, controls.target.z - b.pos.z); if (d < bd) { bd = d; best = b; } });
  const z = camera.zoom, cur = best && autoKey === best.key;
  autoKey = best && bd < (cur ? 17 : 14) && z > (cur ? 1.55 : 1.95) ? best.key : null;
  if (window.__noAuto) autoKey = null; // debugging aid: keep every building closed
}

// ------------------------------------------------------------ loop
const clock = new THREE.Clock();
const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
resize();
const ro = new ResizeObserver(() => { if (stage.clientWidth > 0 && stage.clientHeight > 0) resize(); }); ro.observe(stage);
let wasAtMin = false;
let raf = 0, paused = false;
function frame() {
  raf = 0;
  if (disposed || paused) return;
  const dt = Math.min(clock.getDelta(), 0.05), t = reduce ? 0 : clock.elapsedTime;
  updateAutoOpen();
  dn.update(dt);
  if (halo) halo.material.size = 30 * Math.min(1.8, Math.max(0.85, Math.pow(camera.zoom, 0.55)));
  buildings.forEach((b) => { b.setOpen((state.dept === b.key && camera.zoom > 1.15) || autoKey === b.key); b.update(dt, t, reduce); });
  deptLabels.forEach((l) => { const dim = l.b.open > 0.2; if (l.dim !== dim) { l.dim = dim; l.el.classList.toggle('is-dim', dim); } });
  agentLabels.forEach((l) => { const show = buildings.get(l.dept).open > 0.55; if (l.el.hidden === show) l.el.hidden = !show; });
  if (!reduce) tickCarts(dt, t);
  tickRoutes(dt, clock.elapsedTime);
  parkTicks.forEach((fn) => fn(t));
  if (selRing.visible) { const wp = selRing.userData.target.getWorldPosition(new THREE.Vector3()); selRing.position.set(wp.x, wp.y + 0.12, wp.z); selRing.scale.setScalar(1 + Math.sin(t * 4) * 0.06); }
  const atMin = camera.zoom <= controls.minZoom + 0.04; // zoomed out as far as it goes: go back to the standard view
  if (atMin && !wasAtMin && !tween) { const off = camera.position.clone().sub(controls.target); if (state.dept || controls.target.distanceTo(HOME) > 0.6 || off.distanceTo(HOME_OFFSET) > 0.6) user.reset(); }
  wasAtMin = atMin;
  stepTween(performance.now());
  { const lim = 8 + 33 * Math.min(1, Math.max(0, (camera.zoom - 1) / 0.5)); controls.target.x = THREE.MathUtils.clamp(controls.target.x, -lim, lim); controls.target.z = THREE.MathUtils.clamp(controls.target.z, -lim, lim); } // the working zone only: far out you see the whole zone, closer in you can reach its edges, never the outskirts
  controls.update();
  sun.position.copy(controls.target).add(SUN_OFF); sun.target.position.copy(controls.target); sun.target.updateMatrixWorld();
  updateFocus(); updateLabels();
  renderer.render(scene, camera);
  raf = requestAnimationFrame(frame);
}
raf = requestAnimationFrame(frame);
const io = typeof IntersectionObserver !== 'undefined' ? new IntersectionObserver(([e]) => setPaused(!e.isIntersecting)) : null; io?.observe(root);
const onVis = () => setPaused(document.hidden); document.addEventListener('visibilitychange', onVis);
function setPaused(v) { paused = v; if (!v && !raf && !disposed) { clock.getDelta(); raf = requestAnimationFrame(frame); } }
if (opts.debug) window.__app = { api, camera, controls, scene, buildings, renderer, getFocus: () => focus && { agent: focus.rb.userData.agent, sx: focus.sx, sy: focus.sy }, ptr };

// fresh states from the page (real activity): recolour the hats and the boxes
function setRunStatus(map) {
  DEPTS.forEach((d) => { const b = buildings.get(d.key); d.agents.forEach((a, i) => {
    const run = map && map[a.key] && RUN[map[a.key]] ? map[a.key] : 'inactive', rb = b.robots[i], l = agentLabels.find((x) => x.dept === d.key && x.key === a.key);
    setRobotRun(rb, run);
    if (l) { const r = RUN[run]; l.el.style.setProperty('--c', r.css); l.el.style.setProperty('--ci', r.ink); const st = l.el.querySelector('.an-st'); if (st) st.lastChild.textContent = r.label; }
  }); });
}
function dispose() {
  if (disposed) return; disposed = true;
  cancelAnimationFrame(raf); ro.disconnect(); io?.disconnect(); document.removeEventListener('visibilitychange', onVis); window.removeEventListener('pointerup', onWinUp);
  dn.dispose(); hookTrim(hookStart); controls.dispose();
  scene.traverse((o) => { if (o.isMesh || o.isPoints) o.geometry?.dispose?.(); });
  renderer.dispose(); renderer.forceContextLoss(); root.innerHTML = ''; root.classList.remove('w3d', 'is-night');
}
return { api, setRunStatus, setPaused, dispose, state };
}
