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

// ------------------------------------------------------------ the map: five districts on the city grid, split by two waters, a long green square and a forest (approved 2026-11-01, variant B «Дві води»)
// A slot is one building on a block of the grid. It takes the first department of the data whose key is listed (the old keys keep working while the registry is rebuilt)
// and borrows the silhouette of `shape` (a department the scene already knows how to build).
const LAYOUT = {
  slots: [
    { id: 'admin', keys: ['management'], shape: 'management', cell: [0, 0] },
    { id: 'client-research', keys: ['client-research', 'strategy-research'], shape: 'strategy-research', cell: [1, -3] },
    { id: 'client-creative', keys: ['client-creative', 'performance-creative'], shape: 'performance-creative', cell: [2, -3] },
    { id: 'client-ads', keys: ['client-ads', 'performance-delivery'], shape: 'performance-delivery', cell: [1, -2] },
    { id: 'client-reports', keys: ['client-reports', 'client-success'], shape: 'client-success', cell: [2, -2] },
    { id: 'sales', keys: ['sales'], shape: 'sales', cell: [-2, 0] },
    { id: 'internal', keys: ['internal', 'data-tracking-reporting'], shape: 'data-tracking-reporting', cell: [3, 1] },
    { id: 'social', keys: ['social'], shape: 'performance-creative', cell: [0, 3] },
  ],
  parks: [[-1, 0]], strip: [], strip2: [[0, 1], [0, 2]], forest: [[2, 1], [3, 0], [3, 2], [2, 2], [1, 2], [4, 1], [4, 2], [4, 0], [2, 0]],
  water: [{ w: 9, pts: [[-170, -52], [-100, -44], [-30, -52], [30, -46], [100, -54], [170, -48]] }, { w: 7, pts: [[-47, -40], [-52, 10], [-44, 60], [-50, 120], [-46, 170]] }],
  home: [8, -6], viewH: 170, pan: [-80, 112, -112, 112], lim: 120, range: 4, lamp: 112, lampStreets: [-80, -48, -16, 16, 48, 80], vx: [-16, 16, 48],
  districts: [
    { n: 'Клієнтський район', sub: 'проєкти клієнтів · 4 квартали', slots: ['client-research', 'client-creative', 'client-ads', 'client-reports'] },
    { n: 'Адміністративний район', sub: 'нагляд за агентами', slots: ['admin'] },
    { n: 'Продажний район', sub: 'нові клієнти', slots: ['sales'] },
    { n: 'Внутрішній район', sub: 'SEO сайту Mon’Archi', slots: ['internal'] },
    { n: 'Соціальний район', sub: 'наші соцмережі', slots: ['social'] },
  ],
};

export async function createWorld(container, opts = {}) {
const DEPTS = opts.depts;
const LAY = LAYOUT;
const ZK = LAY.viewH / 88; // the zoom steps below were tuned for a view 88 units tall; the wider map keeps the same look at the matching zoom
const slotOf = new Map(); // department key -> slot
LAY.slots.forEach((sl) => { const d = DEPTS.find((x) => sl.keys.includes(x.key)); if (d && !slotOf.has(d.key)) slotOf.set(d.key, sl); });
let halo = null;
const hookStart = hookMark();
let disposed = false;
const assets = await loadAssets((p) => opts.onProgress?.(p * 0.7));

// ------------------------------------------------------------ renderer, camera
const root = container; root.classList.add('w3d'); root.innerHTML = '';
const mk = (tag, cls, parent = root) => { const e = document.createElement(tag); e.className = cls; parent.appendChild(e); return e; };
const sky = mk('div', 'w3d-sky'), starsEl = mk('canvas', 'w3d-stars', sky), moonEl = mk('div', 'w3d-moon', sky);
const stage = mk('div', 'w3d-stage');
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.shadowMap.autoUpdate = false; // the shadow pass is redrawn every second frame (and at once while the camera moves), see frame()
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NeutralToneMapping;
stage.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const VIEW_H = LAY.viewH;
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -400, 800);
const BASE_OFFSET = new THREE.Vector3(1, 0.95, 1).normalize().multiplyScalar(160);
const HOME = new THREE.Vector3(LAY.home[0], 0, LAY.home[1]);
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
controls.minZoom = 0.95; controls.maxZoom = 4.5 * VIEW_H / 88; controls.zoomSpeed = 3.0 * Math.sqrt(ZK); // about ten wheel notches from the whole city to a desk (it was 0.9: over thirty)
controls.minPolarAngle = 0.8; controls.maxPolarAngle = 1.05;
controls.minAzimuthAngle = Math.PI / 4 - 0.36; controls.maxAzimuthAngle = Math.PI / 4 + 0.36; // the turn is small on purpose: the map is read from one side
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
const RING_ORDER = LAY.slots.filter((sl) => sl.id !== 'admin').map((sl) => [...slotOf].find(([, v]) => v === sl)?.[0]).filter(Boolean); // the order of the chain (also the demo route)
const PLOT = Object.fromEntries([...slotOf].map(([k, sl]) => [k, sl.cell]));
const PARKS = LAY.parks;
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
for (let i = -LAY.range; i <= LAY.range; i++) for (let j = -LAY.range; j <= LAY.range; j++) { const b = new THREE.Mesh(new RoundedBoxGeometry(BLOCK, 0.2, BLOCK, 2, 0.5), blockMat); b.position.set(i * GRID, 0.04, j * GRID); b.receiveShadow = true; world.add(b); }

// ------------------------------------------------------------ buildings: the pad's front edge sits 3.2 from the street, a drive runs from the door to the street
const buildings = new Map();
const pickables = [];
const FRONT = BLOCK / 2 - 3.2; // front edge of every pad, relative to the block centre
function addBuilding(d, cell, idx) {
  const sl = slotOf.get(d.key), b = createBuilding(sl && sl.shape !== d.key ? { ...d, shape: sl.shape } : d, assets, idx), c = blockCentre(cell[0], cell[1]);
  const pos = new THREE.Vector3(c.x, 0.14, c.z + FRONT - (b.D + 4.6) / 2);
  b.root.position.copy(pos); world.add(b.root);
  b.pos = pos.clone(); b.idx = idx; b.cell = c; b.door = new THREE.Vector3(c.x, 0.5, c.z + GRID / 2); // the middle of the street in front of the door
  // the drive from the pad to the street, with a zebra crossing on the street
  const drv = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.16, 3.4), mat(C.lilac2, { rough: 0.9 })); drv.position.set(c.x, 0.125, c.z + FRONT + 1.7); drv.receiveShadow = true; world.add(drv);
  for (let k = -2; k <= 2; k++) box(world, 3.4, 0.03, 0.45, C.white, c.x, 0.0, c.z + GRID / 2 + k * 0.8, 0.01); // bars run parallel to the road, spread across its width
  buildings.set(d.key, b); pickables.push(b.root);
  return b;
}
{ const adm = DEPTS.find((d) => slotOf.get(d.key)?.id === 'admin'); if (adm) addBuilding(adm, PLOT[adm.key], -1); }
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
// ---- forests, long green squares, two waters with bridges
const reserved = new Set([...Object.values(PLOT), ...PARKS, ...(LAY.strip || []), ...(LAY.strip2 || []), ...(LAY.forest || [])].map(([i, j]) => i + ',' + j));
const waterCurves = (LAY.water || []).map((sp) => { const curve = new THREE.CatmullRomCurve3(sp.pts.map(([x, z]) => new THREE.Vector3(x, 0, z))); return { sp, curve, P: curve.getSpacedPoints(Math.max(8, Math.round(curve.getLength() / 2))) }; });
function nearWater(x, z, r) { return waterCurves.some(({ sp, P }) => P.some((q) => Math.hypot(q.x - x, q.z - z) < r + sp.w / 2)); }
(LAY.forest || []).forEach(([i, j]) => {
  const c = blockCentre(i, j), lawn = new THREE.Mesh(new RoundedBoxGeometry(BLOCK - 1.2, 0.12, BLOCK - 1.2, 2, 0.4), mat(0xddcdf0, { rough: 0.95 })); lawn.position.set(c.x, 0.2, c.z); lawn.receiveShadow = true; world.add(lawn);
  const nearPlot = (x, z) => Object.values(PLOT).some(([pi, pj]) => Math.abs(x - pi * GRID) < 12 && Math.abs(z - pj * GRID) < 12);
  for (let t = 0, k = 0; t < 600 && k < 64; t++) { const x = c.x + (rng() - 0.5) * (BLOCK - 2), z = c.z + (rng() - 0.5) * (BLOCK - 2); if (nearPlot(x, z)) continue; trees.push([x, z, 1.1 + rng() * 1.1]); k++; }
});
[...(LAY.strip || []).map((c) => [...c, 'x']), ...(LAY.strip2 || []).map((c) => [...c, 'z'])].forEach(([i, j, ax]) => { // a long green square: lawn, a stone walk down the middle, a double row of trees, benches
  const c0 = blockCentre(i, j), lawn = new THREE.Mesh(new RoundedBoxGeometry(BLOCK, 0.14, BLOCK, 2, 0.4), mat(0xe3d3f1, { rough: 0.95 })); lawn.position.set(c0.x, 0.2, c0.z); lawn.receiveShadow = true; world.add(lawn);
  const rot = (u, v) => (ax === 'z' ? [c0.x + v, c0.z + u] : [c0.x + u, c0.z + v]), c = { x: c0.x, z: c0.z };
  const walk = new THREE.Mesh(new THREE.BoxGeometry(ax === 'z' ? 3.2 : BLOCK, 0.05, ax === 'z' ? BLOCK : 3.2), mat(0xfcf7fd, { rough: 0.9 })); walk.position.set(c0.x, 0.28, c0.z); walk.receiveShadow = true; world.add(walk);
  for (let u = -12; u <= 12; u += 4.5) { const t1 = rot(u, -4.2), t2 = rot(u + 1.5, 4.2); trees.push([t1[0], t1[1], 1.0 + rng() * 0.5]); trees.push([t2[0], t2[1], 1.0 + rng() * 0.5]); if (Math.abs(u) > 8) { const t3 = rot(u, -10), t4 = rot(u + 2, 10); trees.push([t3[0], t3[1], 1.3 + rng() * 0.5]); trees.push([t4[0], t4[1], 1.3 + rng() * 0.5]); } }
  { const b1 = rot(-6, -2.2), b2 = rot(6, 2.2); box(world, ax === 'z' ? 0.7 : 2.6, 0.5, ax === 'z' ? 2.6 : 0.7, C.cream, b1[0], 0.28, b1[1], 0.15); box(world, ax === 'z' ? 0.7 : 2.6, 0.5, ax === 'z' ? 2.6 : 0.7, C.cream, b2[0], 0.28, b2[1], 0.15); const l1 = rot(-8, -1.9), l2 = rot(8, 1.9); parkLamps.push(l1, l2); }
});
function waterStrip(P, w, y, material) {
  const pos = [], idx = [];
  P.forEach((q, k) => { const a = P[Math.max(0, k - 1)], b = P[Math.min(P.length - 1, k + 1)]; let tx = b.x - a.x, tz = b.z - a.z; const l = Math.hypot(tx, tz) || 1; tx /= l; tz /= l; pos.push(q.x - tz * w / 2, y, q.z + tx * w / 2, q.x + tz * w / 2, y, q.z - tx * w / 2); if (k) { const v = k * 2; idx.push(v - 2, v - 1, v, v - 1, v + 1, v); } });
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
  const m = new THREE.Mesh(g, material); m.receiveShadow = true; world.add(m); return m;
}
const waterMat = new THREE.MeshStandardMaterial({ color: 0xa9bef2, roughness: 0.16, metalness: 0.05, emissive: 0x6f86d8, emissiveIntensity: 0.14, side: THREE.DoubleSide });
const bankMat = new THREE.MeshStandardMaterial({ color: 0xfdf8fe, roughness: 0.9, side: THREE.DoubleSide });
waterCurves.forEach(({ sp, P }) => {
  waterStrip(P, sp.w + 3.6, 0.27, bankMat); waterStrip(P, sp.w, 0.31, waterMat);
  // bridges where the streets cross it
  const along = sp.axis || (Math.abs(sp.pts[0][1] - sp.pts[sp.pts.length - 1][1]) > Math.abs(sp.pts[0][0] - sp.pts[sp.pts.length - 1][0]) ? 'z' : 'x');
  STREETS.forEach((st) => { for (let k = 1; k < P.length; k++) {
    const a = P[k - 1], b = P[k], va = along === 'z' ? a.z : a.x, vb = along === 'z' ? b.z : b.x; // streets that cross it run the other way
    if ((va - st) * (vb - st) >= 0) continue;
    const f = (st - va) / (vb - va), x = a.x + (b.x - a.x) * f, z = a.z + (b.z - a.z) * f, L = sp.w + 6;
    const Wd = ROADW + 0.6;
    if (along === 'z') { box(world, L, 0.34, Wd, C.cream, x, 0.14, z, 0.1); box(world, L, 0.5, 0.25, C.plum, x, 0.48, z - Wd / 2 + 0.125, 0.08); box(world, L, 0.5, 0.25, C.plum, x, 0.48, z + Wd / 2 - 0.125, 0.08); }
    else { box(world, Wd, 0.34, L, C.cream, x, 0.14, z, 0.1); box(world, 0.25, 0.5, L, C.plum, x - Wd / 2 + 0.125, 0.48, z, 0.08); box(world, 0.25, 0.5, L, C.plum, x + Wd / 2 - 0.125, 0.48, z, 0.08); }
  } });
});
// the demo vans do not drive on water

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
LAY.lampStreets.forEach((st) => { for (let u = -LAY.lamp, k = 0; u <= LAY.lamp; u += 16, k++) { const side = k % 2 ? 1 : -1; if (!nearWater(u, st + 2.9 * side, 7)) lampPts.push([u, st + 2.9 * side]); if (!nearWater(st + 2.9 * side, u, 7)) lampPts.push([st + 2.9 * side, u]); } });
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
  for (let i = -LAY.range; i <= LAY.range; i++) for (let j = -LAY.range; j <= LAY.range; j++) {
    if (reserved.has(i + ',' + j) || nearWater(i * GRID, j * GRID, 26)) continue;
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
const VX = LAY.vx;
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
    if (hero.s >= heroStop[hero.next]) { hero.s = heroStop[hero.next]; hero.pause = 2.4; hero.step = hero.next % RING_ORDER.length; hero.next = hero.next % (heroStop.length - 1) + 1; if (hero.s >= heroPath.L - 0.01) hero.s = 0; opts.onStep?.(hero.step); }
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
DEPT_ICON['client-research'] = DEPT_ICON['strategy-research']; DEPT_ICON['client-creative'] = DEPT_ICON['performance-creative']; DEPT_ICON['client-ads'] = DEPT_ICON['performance-delivery']; DEPT_ICON['client-reports'] = DEPT_ICON['client-success'];
DEPT_ICON.internal = DEPT_ICON['data-tracking-reporting']; DEPT_ICON.social = DEPT_ICON['performance-creative'];
const count = (d, st) => d.agents.filter((a) => a.status === st).length;
// the label over a building: a plum header with the department, and below it the split of its agents by status
function labelHTML(d) {
  const n = d.agents.length, live = count(d, 'live'), dev = count(d, 'in_development'), plan = count(d, 'not_started');
  return `<span class="lv-head"><span class="lv-ico">${DEPT_ICON[d.key] || ''}</span><b>${d.label}</b></span><span class="lv-status"><span><i class="s-live"></i>${live}</span><span><i class="s-dev"></i>${dev}</span><span><i class="s-plan"></i>${plan}</span><em>${n} ${plural(n)}</em></span>`;
}
const deptLabels = DEPTS.filter((d) => buildings.has(d.key)).map((d) => {
  const b = buildings.get(d.key), el = document.createElement('button');
  el.type = 'button'; el.className = 'dept-label'; el.dataset.key = d.key; el.innerHTML = labelHTML(d);
  el.addEventListener('click', () => user.dept(d.key)); labelLayer.appendChild(el);
  return { el, b, d };
});
// the district plaques: the big name over every district; a district of one building has the plaque take the place of the department flag and opens it
const districtLabels = LAY.districts.map((dd) => {
  const present = dd.slots.map((id) => LAY.slots.find((q) => q.id === id)).filter((sl) => [...slotOf.values()].includes(sl));
  if (!present.length) return null;
  const el = document.createElement('div'); el.className = 'district-label'; el.innerHTML = `<b>${dd.n}</b><small>${dd.sub}</small>`; labelLayer.appendChild(el);
  const cx = present.reduce((a, sl) => a + sl.cell[0] * GRID, 0) / present.length, cz = present.reduce((a, sl) => a + sl.cell[1] * GRID, 0) / present.length;
  if (present.length === 1) {
    const key = [...slotOf].find(([, v]) => v === present[0])[0], dl = deptLabels.find((q) => q.d.key === key), d0 = dl.d;
    const cnt = (st) => d0.agents.filter((a) => a.status === st).length;
    dl.el.classList.add('is-merged'); el.classList.add('is-single'); el.style.pointerEvents = 'auto'; el.style.cursor = 'pointer';
    el.innerHTML = `<b>${dd.n}</b><small>${dd.sub} · ${d0.agents.length} ${plural(d0.agents.length)}</small><span class="dl-st"><span><i class="s-live"></i>${cnt('live')}</span><span><i class="s-dev"></i>${cnt('in_development')}</span><span><i class="s-plan"></i>${cnt('not_started')}</span></span>`;
    el.addEventListener('click', () => user.dept(key));
  }
  else { el.style.pointerEvents = 'auto'; el.style.cursor = 'pointer'; el.addEventListener('click', () => user.district(cx, cz, present.length)); present.forEach((sl) => { const k = [...slotOf].find(([, v]) => v === sl)[0], dl = deptLabels.find((q) => q.d.key === k); if (dl) dl.quarter = true; }); } // the quarters' own flags would pile up over the whole district: the plaque stands for them until you come closer; a click on the plaque brings the whole district into view
  const keys = present.map((sl) => [...slotOf].find(([, v]) => v === sl)[0]);
  return { el, keys, many: present.length > 1, pos: new THREE.Vector3(cx, present.length > 1 ? 46 : 30, cz + 4) };
}).filter(Boolean);
const STATUS_DOT = { live: 'live', in_development: 'dev', not_started: 'plan' };
const agentLabels = [];
const CHEV = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg>';
DEPTS.forEach((d) => { const b = buildings.get(d.key); if (!b) return; d.agents.forEach((a, i) => {
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
  districtLabels.forEach(({ el, pos }) => { place(el, tmp.copy(pos)); });
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
let autoFocused = false; // the focus came from zooming in on a building (not from a click), so zooming back out lets go of it again
const selRing = new THREE.Mesh(new THREE.TorusGeometry(0.95, 0.06, 10, 40), new THREE.MeshBasicMaterial({ color: C.glow })); selRing.rotation.x = Math.PI / 2; selRing.visible = false; scene.add(selRing);
function applySelection() {
  buildings.forEach((b, k) => { b.sel.material.opacity = state.dept === k ? 0.9 : 0; });
  deptLabels.forEach(({ el }) => { el.classList.toggle('is-on', state.dept === el.dataset.key); });
  agentLabels.forEach((l) => { l.el.classList.toggle('is-on', l.key === state.agent && l.dept === state.dept); });
  selRing.visible = false;
  if (state.agent) { const b = buildings.get(state.dept), rb = b.robots.find((r) => r.userData.agent === state.agent); if (rb) { selRing.visible = true; selRing.userData.target = rb; } }
  opts.onState?.(state);
}
const zoomFor = (b) => THREE.MathUtils.clamp(0.7 * (Math.max(VIEW_H, 104 / (stage.clientWidth / stage.clientHeight)) * stage.clientWidth / stage.clientHeight) / ((b.W + b.D) / Math.SQRT2 + 5), 1.3 * ZK, 3.4 * ZK);
const api = {
  state,
  selectDept(key) { autoFocused = false; state.dept = key; state.agent = null; applySelection(); const b = buildings.get(key); flyTo(b.pos.clone().add(new THREE.Vector3(1.0, 2.0, 1.0)), zoomFor(b)); },
  selectAgent(deptKey, agentKey) { autoFocused = false; state.dept = deptKey; state.agent = agentKey; applySelection(); const b = buildings.get(deptKey), rb = b.robots.find((r) => r.userData.agent === agentKey), wp = rb.getWorldPosition(new THREE.Vector3()); flyTo(b.pos.clone().lerp(wp, 0.45).add(new THREE.Vector3(0, 1.5, 0)), zoomFor(b) * 1.15); },
  zoom(f) { flyTo(controls.target.clone(), THREE.MathUtils.clamp(camera.zoom * f, controls.minZoom, controls.maxZoom), 350); },
  rotate(rad) { const off = camera.position.clone().sub(controls.target), sph = new THREE.Spherical().setFromVector3(off); sph.theta = THREE.MathUtils.clamp(sph.theta + rad, controls.minAzimuthAngle, controls.maxAzimuthAngle); const to = new THREE.Vector3().setFromSpherical(sph), from = camera.position.clone().sub(controls.target), t0 = performance.now(); const step = () => { const k = Math.min(1, (performance.now() - t0) / 450); camera.position.copy(controls.target).add(from.clone().lerp(to, ease(k))); if (k < 1) requestAnimationFrame(step); }; step(); },
  district(x, z, n) { autoFocused = false; state.dept = null; state.agent = null; applySelection(); flyTo(new THREE.Vector3(x, 0, z + 2), n > 1 ? 1.75 : 2.4); }, // a district of several buildings: all of them in view, none opened
  reset() { autoFocused = false; state.dept = null; state.agent = null; applySelection(); flyTo(HOME, 1, 650, HOME_OFFSET); },
  clear() { api.reset(); },
  buildings,
};
const user = { // what a person does on the map: move the camera and tell the page, which owns the real state
  dept(k) { api.selectDept(k); opts.onFocusDept?.(k); },
  district(x, z, n) { api.district(x, z, n); opts.onReset?.(); },
  agent(d, k) { api.selectAgent(d, k); opts.onOpenAgent?.(d, k); },
  reset() { api.reset(); opts.onReset?.(); },
};
const camEl = mk('div', 'w3d-cam');
camEl.innerHTML = `<button type="button" data-a="in" aria-label="Наблизити">${ICONS.plus}</button><button type="button" data-a="out" aria-label="Віддалити">${ICONS.minus}</button><button type="button" data-a="rl" aria-label="Повернути ліворуч">${ICONS.rotL}</button><button type="button" data-a="rr" aria-label="Повернути праворуч">${ICONS.rotR}</button><button type="button" data-a="home" aria-label="Весь острів">${ICONS.home}</button>`;
camEl.addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; ({ in: () => api.zoom(1.35), out: () => api.zoom(1 / 1.35), rl: () => api.rotate(0.3), rr: () => api.rotate(-0.3), home: () => user.reset() })[b.dataset.a](); });
collectEmissives(scene, { mat_glow: 3.5 });
const dn = initDayNight({ app: root, sun, hemi, fill, renderer, stars: starsEl, moon: moonEl, onTheme: (n) => opts.onTheme?.(n) });
applySelection();

// ------------------------------------------------------------ a building opens by itself when you zoom in on it (and closes again when you leave)
let autoKey = null, prevAuto = null;
function updateAutoOpen() {
  let best = null, bd = 1e9;
  buildings.forEach((b) => { const d = Math.hypot(controls.target.x - b.pos.x, controls.target.z - b.pos.z); if (d < bd) { bd = d; best = b; } });
  const z = camera.zoom, cur = best && autoKey === best.key;
  autoKey = best && bd < (cur ? 17 : 14) && z > (cur ? 1.55 : 1.95) * ZK ? best.key : null;
  if (window.__noAuto) autoKey = null; // debugging aid: keep every building closed
  // The page's interface follows the building: when one opens by zoom the page gets the same focus a click would give it (no camera flight, the camera is
  // already there), and when it closes again by zoom the focus is released. Not while a flight is running: then the camera is moving on purpose.
  if (!tween && autoKey !== prevAuto) {
    if (autoKey && state.dept !== autoKey) { state.dept = autoKey; state.agent = null; autoFocused = true; applySelection(); opts.onFocusDept?.(autoKey); }
    else if (!autoKey && autoFocused && state.dept === prevAuto) { state.dept = null; state.agent = null; autoFocused = false; applySelection(); opts.onReset?.(); }
    prevAuto = autoKey;
  }
}

// ------------------------------------------------------------ loop
const clock = new THREE.Clock();
const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
resize();
const ro = new ResizeObserver(() => { if (stage.clientWidth > 0 && stage.clientHeight > 0) resize(); }); ro.observe(stage);
let wasAtMin = false;
// Adaptive resolution: if frames take too long (a weak or busy GPU, a game running next to the browser, a hi-dpi screen) draw fewer pixels instead of freezing;
// when there is room again, go back up.
const PR_FLOOR = Math.min(1, window.devicePixelRatio); // never draw below one pixel per screen pixel: below it the picture goes soft
let pr = Math.min(2, Math.max(window.devicePixelRatio, 1.5)), prMax = pr, ema = 1 / 60, slowFor = 0, fastFor = 0, lastAdapt = performance.now();
renderer.setPixelRatio(pr);
function adaptResolution(now) {
  const d = Math.min(0.25, (now - lastAdapt) / 1000); lastAdapt = now; ema += (d - ema) * 0.1;
  if (ema > 0.034) { slowFor += d; fastFor = 0; } else if (ema < 0.02) { fastFor += d; slowFor = 0; } else { slowFor = 0; fastFor = 0; }
  if (slowFor > 1.2 && pr > PR_FLOOR + 0.02) { pr = Math.max(PR_FLOOR, pr * 0.85); renderer.setPixelRatio(pr); resize(); slowFor = 0; }
  else if (fastFor > 6 && pr < prMax) { pr = Math.min(prMax, pr * 1.15); renderer.setPixelRatio(pr); resize(); fastFor = 0; }
}
const shadowLast = new THREE.Vector3(); let shadowZoom = 0, shadowTick = 0;
const FRAME_STATS = { n: 0, sum: 0, max: 0 }; // the cost of one frame of the loop itself (JS side), for ?w3ddebug
let raf = 0, paused = false;
function frame() {
  raf = 0;
  if (disposed || paused) return;
  const tFrame0 = performance.now();
  { const moved = shadowLast.distanceTo(controls.target) > 0.02 || Math.abs(camera.zoom - shadowZoom) > 0.002; shadowLast.copy(controls.target); shadowZoom = camera.zoom; if (moved || (++shadowTick & 1) === 0) renderer.shadowMap.needsUpdate = true; }
  adaptResolution(tFrame0);
  const dt = Math.min(clock.getDelta(), 0.05), t = reduce ? 0 : clock.elapsedTime;
  updateAutoOpen();
  dn.update(dt);
  if (halo) halo.material.size = 30 * Math.min(1.8, Math.max(0.85, Math.pow(camera.zoom, 0.55)));
  buildings.forEach((b) => { b.setOpen((state.dept === b.key && camera.zoom > 1.15 * ZK) || autoKey === b.key); b.update(dt, t, reduce); });
  deptLabels.forEach((l) => { const dim = l.b.open > 0.2 || (l.quarter && camera.zoom < 1.45); if (l.dim !== dim) { l.dim = dim; l.el.classList.toggle('is-dim', dim); } });
  districtLabels.forEach((l) => { const dim = l.keys.some((k) => buildings.get(k).open > 0.2) || (l.many && camera.zoom >= 1.45); if (l.dim !== dim) { l.dim = dim; l.el.classList.toggle('is-dim', dim); } }); // an opened district hands over to its own flags
  agentLabels.forEach((l) => { const show = buildings.get(l.dept).open > 0.55; if (l.el.hidden === show) l.el.hidden = !show; });
  if (!reduce) tickCarts(dt, t);
  tickRoutes(dt, clock.elapsedTime);
  parkTicks.forEach((fn) => fn(t));
  if (selRing.visible) { const wp = selRing.userData.target.getWorldPosition(new THREE.Vector3()); selRing.position.set(wp.x, wp.y + 0.12, wp.z); selRing.scale.setScalar(1 + Math.sin(t * 4) * 0.06); }
  const atMin = camera.zoom <= controls.minZoom + 0.04; // zoomed out as far as it goes: go back to the standard view
  if (atMin && !wasAtMin && !tween) { const off = camera.position.clone().sub(controls.target); if (state.dept || controls.target.distanceTo(HOME) > 0.6 || off.distanceTo(HOME_OFFSET) > 0.6) user.reset(); }
  wasAtMin = atMin;
  stepTween(performance.now());
  { // the camera may reach every district: the room to move opens with the zoom (none when the whole city is in view) and is the box around all of them
    const s = THREE.MathUtils.smoothstep(camera.zoom, controls.minZoom + 0.05, controls.minZoom + 0.75), B = LAY.pan;
    const x0 = THREE.MathUtils.lerp(HOME.x - 3, B[0], s), x1 = THREE.MathUtils.lerp(HOME.x + 3, B[1], s), z0 = THREE.MathUtils.lerp(HOME.z - 3, B[2], s), z1 = THREE.MathUtils.lerp(HOME.z + 3, B[3], s);
    controls.target.x = THREE.MathUtils.clamp(controls.target.x, x0, x1); controls.target.z = THREE.MathUtils.clamp(controls.target.z, z0, z1);
    if (!tween && camera.zoom < controls.minZoom + 0.12 && !state.dept) controls.target.lerp(HOME, 1 - Math.exp(-4 * dt)); // zoomed all the way out: the city settles back to the centre
  } // the working zone only: far out you see the whole zone, closer in you can reach its edges, never the outskirts
  controls.update();
  sun.position.copy(controls.target).add(SUN_OFF); sun.target.position.copy(controls.target); sun.target.updateMatrixWorld();
  updateFocus(); updateLabels();
  renderer.render(scene, camera);
  FRAME_STATS.n++; { const d = performance.now() - tFrame0; FRAME_STATS.sum += d; FRAME_STATS.max = Math.max(FRAME_STATS.max, d); }
  raf = requestAnimationFrame(frame);
}
// Everything inside the buildings is hidden while they are closed, so the GPU would first meet it (upload meshes, textures, shaders) the moment a
// building opens, which froze the map for seconds. Show each interior once, here, behind the loading, one building at a time.
async function prewarm() {
  renderer.shadowMap.needsUpdate = true;
  camera.updateMatrixWorld(); camera.updateProjectionMatrix();
  let n = 0;
  for (const b of buildings.values()) {
    if (disposed) return;
    b.inner.visible = true; b.inner.traverse((o) => o.layers.set(0));
    renderer.shadowMap.needsUpdate = true; renderer.render(scene, camera);
    b.inner.visible = false; b.inner.traverse((o) => o.layers.set(1));
    opts.onProgress?.(0.7 + 0.3 * (++n / buildings.size));
    await new Promise((r) => setTimeout(r, 0));
  }
}
await prewarm();
if (disposed) return { dispose() {} };
raf = requestAnimationFrame(frame);
const io = typeof IntersectionObserver !== 'undefined' ? new IntersectionObserver(([e]) => setPaused(!e.isIntersecting)) : null; io?.observe(root);
const onVis = () => setPaused(document.hidden); document.addEventListener('visibilitychange', onVis);
function setPaused(v) { paused = v; if (!v && !raf && !disposed) { clock.getDelta(); lastAdapt = performance.now(); raf = requestAnimationFrame(frame); } }
if (opts.debug) window.__app = { loopState: () => ({ paused, raf, disposed, hidden: document.hidden }), frameStats: () => { const o = { ...FRAME_STATS, avg: FRAME_STATS.n ? FRAME_STATS.sum / FRAME_STATS.n : 0 }; FRAME_STATS.n = 0; FRAME_STATS.sum = 0; FRAME_STATS.max = 0; return o; }, setPaused: (v) => setPaused(v), api, camera, controls, scene, buildings, renderer, getFocus: () => focus && { agent: focus.rb.userData.agent, sx: focus.sx, sy: focus.sy }, ptr };

// fresh states from the page (real activity): recolour the hats and the boxes
function setRunStatus(map) {
  DEPTS.forEach((d) => { const b = buildings.get(d.key); if (!b) return; d.agents.forEach((a, i) => {
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
