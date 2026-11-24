// The room of the map (owner's mockup "Карта AI команди" + the module sheet, 2026-11-09): one big floor slab with a chamfered outline, perimeter walls / windows / planters built from instanced modules (Blender GLBs, with box placeholders until a file exists), a front entrance with the logo, amber light routes on the floor, and the central platform with the brain hologram.
// A module GLB gives named root nodes; every mesh inside is named "<node>_<Role>" and the role picks the material here (the owner will improve the models one by one, the layout code does not change).
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { Reflector } from 'three/examples/jsm/objects/Reflector.js';

const UP = new THREE.Vector3(0, 1, 0);
export const OUTLINE = [[-20, -29], [20, -29], [34, -14], [34, 16], [24, 32], [6, 32], [-6, 32], [-24, 32], [-34, 16], [-34, -14]]; // clockwise seen from above (x right, z towards the entrance); the entrance (x -6..6) has no wall
const WS = 1.7; // the whole shell (stone wall, glass belt, roof, entrance) is scaled up: the owner wants a real, tall wall in proportion to the hall
const DOOR = 10 * WS, FRONT_Z = 32; // the entrance module spans x -DOOR..DOOR; the wall modules end there

// ---------- materials ----------
const hdr = (r, g, b) => new THREE.Color(r, g, b); // colours above 1 glow through the bloom
export const MATS = {
  Body: new THREE.MeshStandardMaterial({ color: 0x6a5c88, roughness: 0.36, metalness: 0.5 }),
  Floor: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.34, metalness: 0.4 }),
  Cap: new THREE.MeshStandardMaterial({ color: 0xa595c8, roughness: 0.3, metalness: 0.45 }),
  Base: new THREE.MeshStandardMaterial({ color: 0x7c6ea0, roughness: 0.35, metalness: 0.5 }),
  Seam: new THREE.MeshBasicMaterial({ color: 0x1a1230 }),
  Seat: new THREE.MeshStandardMaterial({ color: 0x3a2766, roughness: 0.6 }),
  Panel: new THREE.MeshStandardMaterial({ color: 0x2f2347, roughness: 0.4, metalness: 0.4 }),
  Glow: new THREE.MeshBasicMaterial({ color: hdr(0.7, 0.35, 1.4), side: THREE.DoubleSide }),
  Rim: new THREE.MeshStandardMaterial({ color: 0xa89acb, roughness: 0.28, metalness: 0.6, side: THREE.DoubleSide }),
  Dark: new THREE.MeshStandardMaterial({ color: 0x2b1f3f, roughness: 0.4, metalness: 0.3 }),
  Frame: new THREE.MeshStandardMaterial({ color: 0xa89acb, roughness: 0.3, metalness: 0.6 }),
  Neon: new THREE.MeshBasicMaterial({ color: hdr(1.1, 0.6, 2.0), side: THREE.DoubleSide }),
  Amber: new THREE.MeshBasicMaterial({ color: hdr(3.2, 1.7, 0.45), side: THREE.DoubleSide }),
  Logo: new THREE.MeshBasicMaterial({ color: hdr(1.8, 1.6, 2.2) }),
  Glass: new THREE.MeshStandardMaterial({ color: 0xa48cff, roughness: 0.04, metalness: 0.1, transparent: true, opacity: 0.2, depthWrite: false, side: THREE.DoubleSide }),
  Soil: new THREE.MeshStandardMaterial({ color: 0x2a1d1a, roughness: 1 }),
  Leaf: new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.65, side: THREE.DoubleSide }),
  Flower: new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.55, side: THREE.DoubleSide }),
  Core: new THREE.MeshBasicMaterial({ color: hdr(3.2, 2.7, 1.9) }),
  Decal: new THREE.MeshBasicMaterial({ color: hdr(1.6, 0.95, 0.4), transparent: true, opacity: 0.85, depthWrite: false }),
};
const ROLE = /_(Body|Dark|Frame|Neon|Amber|Glass|Soil|Leaf|Flower|Logo|Decal|Cap|Base|Seam|Panel|Glow|Seat)/i;
const roleOf = (name) => { const m = ROLE.exec(name || ''); return m ? m[1][0].toUpperCase() + m[1].slice(1).toLowerCase() : 'Body'; };

// ---------- module loading ----------
const BASE = import.meta.env.BASE_URL;
let VIEW = () => ({ w: innerWidth, h: innerHeight }); // the size of the drawing area (the host sets it)
export function setView(f) { VIEW = f; }
const gltfCache = new Map();
const gltfOf = (url) => { if (!gltfCache.has(url)) gltfCache.set(url, new GLTFLoader().loadAsync(url).then((g) => { g.scene.updateMatrixWorld(true); return g; }).catch((e) => { console.warn('[room] no', url, e.message); return null; })); return gltfCache.get(url); };
const box = (w, h, d, y = h / 2) => new THREE.BoxGeometry(w, h, d).translate(0, y, 0);
// returns [{ role, geo }] for the node `node` of the file (or the whole file when node is null); `fallback()` gives the same list when the file is missing
async function getModule(file, node, fallback) {
  const g = await gltfOf(`${BASE}ai-world/models/map/${file}`); if (!g) return fallback();
  const parts = [], want = node && node.toLowerCase();
  g.scene.traverse((o) => { if (!o.isMesh) return; if (want) { let n = o, ok = false; for (; n && n !== g.scene; n = n.parent) if ((n.name || '').toLowerCase() === want) ok = true; if (!ok) return; } const geo = o.geometry.clone(); geo.applyMatrix4(o.matrixWorld); let name = o.name; if (!ROLE.test(name) && o.parent && o.parent !== g.scene) name = o.parent.name; parts.push({ role: roleOf(name), geo, vc: !!geo.attributes.color }); });
  if (!parts.length) { console.warn('[room] empty module', file, node); return fallback(); }
  return parts;
}
const FB = {
  wall: () => [{ role: 'Body', geo: box(4, 1.3, 0.5) }, { role: 'Amber', geo: box(1.6, 0.06, 0.52, 0.28) }],
  wallTall: () => [{ role: 'Body', geo: box(4, 2.2, 0.5) }, { role: 'Amber', geo: box(1.6, 0.06, 0.52, 0.28) }],
  post: () => [{ role: 'Body', geo: new THREE.CylinderGeometry(0.31, 0.31, 1.4, 12).translate(0, 0.7, 0) }],
  postTall: () => [{ role: 'Body', geo: new THREE.CylinderGeometry(0.31, 0.31, 2.3, 12).translate(0, 1.15, 0) }],
  window: () => [{ role: 'Frame', geo: box(4, 0.35, 0.2) }, { role: 'Glass', geo: box(4, 2.0, 0.04, 1.4) }],
  windowTall: () => [{ role: 'Frame', geo: box(4, 0.35, 0.2) }, { role: 'Glass', geo: box(4, 3.0, 0.04, 1.85) }],
  planter: () => [{ role: 'Body', geo: box(3.2, 0.5, 0.9) }, { role: 'Leaf', geo: colorize(box(2.8, 0.6, 0.6, 0.8), 0x4c9a3a) }, { role: 'Flower', geo: colorize(box(1.2, 0.4, 0.5, 1.0), 0x9b59ff) }],
  planterSmall: () => [{ role: 'Body', geo: box(0.8, 0.5, 0.8) }, { role: 'Leaf', geo: colorize(box(0.5, 0.7, 0.5, 0.85), 0x4c9a3a) }],
  entrance: () => [{ role: 'Body', geo: box(12, 1.3, 1.2, 0.65) }, { role: 'Neon', geo: box(3.2, 0.1, 0.1, 2.6) }],
  hub: () => [{ role: 'Body', geo: new THREE.CylinderGeometry(6.2, 6.2, 0.35, 64).translate(0, 0.175, 0) }, { role: 'Dark', geo: new THREE.CylinderGeometry(3.7, 3.7, 0.9, 48).translate(0, 0.45, 0) }],
  brain: () => [{ role: 'Brain', geo: new THREE.IcosahedronGeometry(1.2, 3) }],
};
function colorize(geo, c) { const col = new THREE.Color(c), n = geo.attributes.position.count, a = new Float32Array(n * 3); for (let i = 0; i < n; i++) { a[i * 3] = col.r; a[i * 3 + 1] = col.g; a[i * 3 + 2] = col.b; } geo.setAttribute('color', new THREE.BufferAttribute(a, 3)); return geo; }
// instance one module at many matrices
function instance(scene, parts, mats) {
  const out = [];
  for (const p of parts) { const m = MATS[p.role] || MATS.Body, im = new THREE.InstancedMesh(p.geo, p.role === 'Leaf' || p.role === 'Flower' ? (p.vc ? m : new THREE.MeshStandardMaterial({ color: p.role === 'Leaf' ? 0x4c9a3a : 0x9b59ff, side: THREE.DoubleSide })) : m, mats.length); mats.forEach((mx, i) => im.setMatrixAt(i, mx)); im.instanceMatrix.needsUpdate = true; im.frustumCulled = false; if (p.role === 'Glass') im.renderOrder = 3; scene.add(im); out.push(im); }
  return out;
}
const mat = (x, y, z, yaw, sx = 1, sy = 1, sz = 1) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(UP, yaw), new THREE.Vector3(sx, sy, sz));

// ---------- geometry helpers ----------
function ribbon(points, width, y, closed = false) { // a flat strip along a polyline (all normals up)
  const P = [], I = [], hw = width / 2, n = points.length;
  for (let i = 0; i < n; i++) {
    const a = points[(i - 1 + n) % n], b = points[i], c = points[(i + 1) % n], d0 = i > 0 || closed ? new THREE.Vector2(b.x - a.x, b.y - a.y).normalize() : null, d1 = i < n - 1 || closed ? new THREE.Vector2(c.x - b.x, c.y - b.y).normalize() : null;
    const d = d0 && d1 ? d0.clone().add(d1).normalize() : (d0 || d1), nx = -d.y, nz = d.x; P.push(b.x + nx * hw, y, b.y + nz * hw, b.x - nx * hw, y, b.y - nz * hw);
  }
  const segs = closed ? n : n - 1; for (let i = 0; i < segs; i++) { const a = i * 2, b = ((i + 1) % n) * 2; I.push(a, a + 1, b, a + 1, b + 1, b); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(P.map((_, i) => (i % 3 === 1 ? 1 : 0)), 3)); g.setIndex(I); return g;
}
function ribbonUV(points, width, y) { // like ribbon() but with uv: x along the strip, y across it (0..1), for soft glow strips
  const g = ribbon(points, width, y), n = points.length, UV = []; let acc = 0;
  for (let i = 0; i < n; i++) { if (i) acc += points[i].distanceTo(points[i - 1]); UV.push(acc * 0.2, 0, acc * 0.2, 1); }
  g.setAttribute('uv', new THREE.Float32BufferAttribute(UV, 2)); return g;
}
function tileTexture() {
  const cv = document.createElement('canvas'); cv.width = cv.height = 256; const c = cv.getContext('2d');
  c.fillStyle = '#54487a'; c.fillRect(0, 0, 256, 256); const g = c.createLinearGradient(0, 0, 256, 256); g.addColorStop(0, 'rgba(255,255,255,0.05)'); g.addColorStop(1, 'rgba(0,0,0,0.08)'); c.fillStyle = g; c.fillRect(0, 0, 256, 256);
  c.strokeStyle = 'rgba(190,170,255,0.16)'; c.lineWidth = 2; c.strokeRect(1, 1, 254, 254);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; return t;
}


// ---------- path helpers ----------
function roundedPath(pts, r, seg) { // open polyline with rounded interior corners
  const out = [pts[0].clone()]; out.corners = [];
  for (let i = 1; i < pts.length - 1; i++) { const a = pts[i - 1], b = pts[i], c = pts[i + 1], rr = Math.min(r, a.distanceTo(b) * 0.45, b.distanceTo(c) * 0.45), p1 = b.clone().add(a.clone().sub(b).normalize().multiplyScalar(rr)), p2 = b.clone().add(c.clone().sub(b).normalize().multiplyScalar(rr)); for (let k = 0; k <= seg; k++) { const t = k / seg, u = 1 - t; out.push(new THREE.Vector2(u * u * p1.x + 2 * u * t * b.x + t * t * p2.x, u * u * p1.y + 2 * u * t * b.y + t * t * p2.y)); if (k === Math.floor(seg / 2)) { const mm = out[out.length - 1].clone(); mm.turn = Math.acos(Math.min(1, Math.max(-1, b.clone().sub(a).normalize().dot(c.clone().sub(b).normalize())))); out.corners.push(mm); } } }
  out.push(pts[pts.length - 1].clone()); return out;
}
const inwardOf = (p, t) => { const n = new THREE.Vector2(-t.y, t.x); if (n.dot(p.clone().negate()) < 0) n.negate(); return n; }; // the room centre is the origin: the inward side is the perpendicular that looks at it
function frames(path) { return path.map((p, i) => { const a = path[Math.max(0, i - 1)], b = path[Math.min(path.length - 1, i + 1)], t = b.clone().sub(a).normalize(); return { x: p.x, y: p.y, t, n: inwardOf(p, t) }; }); }
function pathLength(path) { let L = 0; for (let i = 1; i < path.length; i++) L += path[i].distanceTo(path[i - 1]); return L; }
function pathAt(path, d) { let acc = 0; for (let i = 1; i < path.length; i++) { const seg = path[i].distanceTo(path[i - 1]); if (acc + seg >= d || i === path.length - 1) { const u = Math.min(1, Math.max(0, (d - acc) / (seg || 1))), p = path[i - 1].clone().lerp(path[i], u), t = path[i].clone().sub(path[i - 1]).normalize(); return { x: p.x, y: p.y, t, n: inwardOf(p, t) }; } acc += seg; } }
// sweep a (u inward, v up) profile along a path -> a smooth strip surface (drawn double-sided by its material)
const sst = (x, a, b) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const facadeLift = (p) => 1.3 * sst(p.y, 25.5, 31.5) * sst(Math.abs(p.x), 7, 14); // extra height of the parapet in front
function sweep(path, profile, lift = null, from = 0.8) {
  const F = frames(path), m = profile.length, P = [], I = [];
  for (const f of F) { const L = lift ? lift(f) : 0; for (const [u, v] of profile) P.push(f.x + f.n.x * u, v + (v > from ? L : 0), f.y + f.n.y * u); }
  for (let i = 0; i < F.length - 1; i++) for (let j = 0; j < m - 1; j++) { const a = i * m + j, b = a + 1, c = (i + 1) * m + j, d = c + 1; I.push(a, c, b, b, c, d); }
  const UV = []; let acc = 0; F.forEach((f, i) => { if (i) acc += Math.hypot(f.x - F[i - 1].x, f.y - F[i - 1].y); profile.forEach((_, j) => UV.push(acc / 18, j / Math.max(1, m - 1))); });
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(UV, 2)); g.setIndex(I); g.computeVertexNormals(); return g;
}
// a flat strip of width w at distance u from the path, at height y
function ribbonOpen(path, u, w, y, lift = null) { const F = frames(path), P = [], I = []; for (const f of F) { const yy = y + (lift ? lift(f) : 0); P.push(f.x + f.n.x * u, yy, f.y + f.n.y * u, f.x + f.n.x * (u + w), yy, f.y + f.n.y * (u + w)); } for (let i = 0; i < F.length - 1; i++) { const a = i * 2; I.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); } const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(P.map((_, i) => (i % 3 === 1 ? 1 : 0)), 3)); g.setIndex(I); return g; }

// ---------- the room ----------
export async function buildRoom(scene, { hubPos = new THREE.Vector3(0, 0, 0) } = {}) {
  const room = { routes: [], brain: null, ring: null };
  // the building shell (owner's full-room reference 2026-11-09): the outline is the sharp-cornered shape of the mockup (straight edges + 45-degree chamfers, no rounding); the wall has TWO parts standing on the floor: a stone wall (lilac metal, panel seams, long amber slits, violet foot line) and a tinted glass band on top of it with slim lilac mullions and a rounded cap that has a violet line; the entrance module is part of the same wall (stone wall flows into it), the glass stops at the entrance
  const [mPlA, mPlB, mPlC, mBol, mEntr, mHub, mBrain, mWall, mWinS, mWinL] = await Promise.all([
    getModule('planters_v2.glb', 'planter_a', FB.planter), getModule('planters_v2.glb', 'planter_b', FB.planter), getModule('planters_v2.glb', 'planter_c', FB.planter), getModule('planters_v2.glb', 'bollard', FB.planterSmall),
    getModule('entrance_wall.glb', 'entrance', FB.entrance), getModule('hub_platform_v2.glb', null, () => null).then((m) => m || getModule('hub_platform.glb', null, FB.hub)), getModule('brain_v2.glb', null, () => null).then((m) => m || getModule('brain.glb', null, FB.brain)), getModule('wall_stone.glb', 'wall_straight', FB.wall),
    getModule('window_glass.glb', 'window_straight', FB.window), getModule('window_glass.glb', 'window_lamp', FB.window),
  ]);
  const ZF = FRONT_Z + 0.45, ST = 1.3 * WS, GT = ST + 1.45 * WS, TH = 0.66 * WS, SLAB = 0.6; // outer face of the front wall, stone top, glass top, wall thickness, floor slab
  const loop0 = [[DOOR, ZF], [26, ZF], [34.5, 23.95], [34.5, -18], [22, -30.5], [-22, -30.5], [-34.5, -18], [-34.5, 23.95], [-26, ZF], [-DOOR, ZF]].map(([x, z]) => new THREE.Vector2(x, z));
  const path = roundedPath(loop0, 0.9, 3); // the path is the OUTER face of the wall; "u" in the sweeps = distance inward from it
  const shape = new THREE.Shape(path.concat([new THREE.Vector2(-DOOR, ZF + 5.7), new THREE.Vector2(DOOR, ZF + 5.7)]).map((q) => new THREE.Vector2(q.x, -q.y))); // + the entrance forecourt in front of the door
  const slab = new THREE.ExtrudeGeometry(shape, { depth: SLAB, bevelEnabled: false }); slab.rotateX(-Math.PI / 2); slab.translate(0, -SLAB, 0); // top face at y = 0
  // polished floor: a half-resolution planar reflection of the scene, blurred, added on top of the floor (so only the bright things - neon, lamps, the dome - show in it), as in the owner's pictures
  { const SH = { name: 'FloorReflect', uniforms: { color: { value: null }, tDiffuse: { value: null }, textureMatrix: { value: null }, uStrength: { value: 0.55 }, uTexel: { value: new THREE.Vector2(1 / 800, 1 / 450) } },
      vertexShader: 'uniform mat4 textureMatrix; varying vec4 vUv; void main() { vUv = textureMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: 'uniform sampler2D tDiffuse; uniform float uStrength; uniform vec2 uTexel; varying vec4 vUv; void main() { vec3 acc = vec3(0.0); float ws = 0.0; for (int i = -2; i <= 2; i++) for (int j = -2; j <= 2; j++) { float w = exp(-float(i * i + j * j) * 0.25); acc += texture2DProj(tDiffuse, vUv + vec4(vec2(float(i), float(j)) * uTexel * 2.2 * vUv.w, 0.0, 0.0)).rgb * w; ws += w; } gl_FragColor = vec4(acc / ws * uStrength, 1.0); }' };
    const tw = Math.max(256, Math.round(VIEW().w * 0.5)), th = Math.max(256, Math.round(VIEW().h * 0.5));
    const refl = new Reflector(new THREE.ShapeGeometry(shape), { textureWidth: tw, textureHeight: th, clipBias: 0.003, multisample: 2, shader: SH });
    refl.rotation.x = -Math.PI / 2; refl.position.y = 0.014; refl.material.transparent = true; refl.material.blending = THREE.AdditiveBlending; refl.material.depthWrite = false; refl.material.uniforms.uTexel.value.set(1 / tw, 1 / th); scene.add(refl); room.reflector = refl; }
  { const ft = tileTexture(); ft.repeat.set(1 / 3, 1 / 3); MATS.Floor.map = ft; MATS.Floor.needsUpdate = true; }
  scene.add(new THREE.Mesh(slab, [MATS.Floor, MATS.Rim]));
  // the raised lilac band along the foot of the wall (owner's views) with a thin light line on its inner edge
  scene.add(new THREE.Mesh(sweep(path, [[TH, 0], [TH, 0.1], [TH + 1.5, 0.1], [TH + 1.6, 0.04], [TH + 1.65, 0]]), MATS.Rim));
  scene.add(new THREE.Mesh(ribbonOpen(path, TH + 1.45, 0.07, 0.105), MATS.Neon));
  scene.add(new THREE.Mesh(sweep(path, [[-0.01, -SLAB + 0.05], [-0.01, -SLAB + 0.14]]), MATS.Neon)); // violet foot line of the slab
  // the glass part of the wall (owner's block 5 + the shell views): Blender modules (window_glass.glb) standing on the top of the stone wall, set 0.10 m inside its centre line, so the stone leaves a ledge outside; a lamp pilaster every ~12 m; the belt carries on over the entrance wings up to |x| = 7.5 where the wall starts to rise
  { const gM = [], lM = [], pts = loop0, n0 = pts.length;
    for (let i = 0; i < n0 - 1; i++) {
      let A = pts[i].clone(), B = pts[i + 1].clone(); const d = B.clone().sub(A); d.normalize(); const nrm = new THREE.Vector2(-d.y, d.x); if (nrm.dot(A.clone().add(B).multiplyScalar(-0.5)) < 0) nrm.negate();
      A.addScaledVector(nrm, 0.43 * WS); B.addScaledVector(nrm, 0.43 * WS); if (i === 0) A.addScaledVector(d, -(DOOR - 7.7)); if (i === n0 - 2) B.addScaledVector(d, DOOR - 7.7); // the belt runs on over the entrance wing and ends inside the rising slope
      const L = A.distanceTo(B), yaw = Math.atan2(nrm.x, nrm.y), lamps = L > 12 ? Math.max(1, Math.round((L - 2) / 13)) : 0, cuts = [0];
      for (let k = 1; k <= lamps; k++) { const c = L * k / (lamps + 1); cuts.push(c - 0.6 * WS, c + 0.6 * WS); } cuts.push(L);
      for (let q = 0; q < cuts.length; q += 2) { const a0 = cuts[q], g = cuts[q + 1] - a0; if (g < 0.5) continue; const n = Math.max(1, Math.round(g / (4 * WS))), sx = g / (n * 4); for (let k = 0; k < n; k++) { const c = A.clone().addScaledVector(d, a0 + (k + 0.5) * g / n); gM.push(mat(c.x, ST, c.y, yaw, sx, WS, WS)); } }
      for (let k = 1; k <= lamps; k++) { const c = A.clone().addScaledVector(d, L * k / (lamps + 1)); lM.push(mat(c.x, ST, c.y, yaw, WS, WS, WS)); }
    }
    instance(scene, mWinS, gM); if (lM.length) instance(scene, mWinL, lM);
    // the roof over the glass: as thick (wide) as the stone wall below it, rounded, with a light line on its inner edge; it flows into the rising slope of the entrance
    const rp = [new THREE.Vector2(7.7, ZF)].concat(path, [new THREE.Vector2(-7.7, ZF)]), sc = WS, W = TH, RP = [[0, 0], [0, 0.1 * sc], [0.05 * sc, 0.19 * sc], [0.14 * sc, 0.22 * sc], [W - 0.14 * sc, 0.22 * sc], [W - 0.05 * sc, 0.19 * sc], [W, 0.1 * sc], [W, 0]].map(([u, v]) => [u, v + GT]);
    scene.add(new THREE.Mesh(sweep(rp, RP), MATS.Cap));
    scene.add(new THREE.Mesh(ribbonOpen(rp, W * 0.68, 0.12, GT + 0.22 * sc + 0.004), MATS.Neon)); }
  // the stone wall: the Blender module (wall_stone.glb / wall_straight, the owner's block 4) chained along every straight edge of the outline; the centre line is 0.33 m inside the outer face; every end is lengthened by 0.14 m so the 45-degree corners overlap without a gap, the ends at the entrance are not
  { const mats = [], glow = [], pts = loop0, n0 = pts.length;
    for (let i = 0; i < n0 - 1; i++) {
      let A = pts[i].clone(), B = pts[i + 1].clone(); const d = B.clone().sub(A), len0 = d.length(); d.normalize(); const nrm = new THREE.Vector2(-d.y, d.x); if (nrm.dot(A.clone().add(B).multiplyScalar(-0.5)) < 0) nrm.negate();
      // the centre line is the edge shifted 0.33 inward; square ends at (vertex + 0.33 * normal) give a sharp outer corner and an overlap on the inside
      A.addScaledVector(nrm, 0.33 * WS); B.addScaledVector(nrm, 0.33 * WS);
      const len = A.distanceTo(B), n = Math.max(1, Math.round(len / (4 * WS))), sx = len / (n * 4), yaw = Math.atan2(nrm.x, nrm.y);
      for (let k = 0; k < n; k++) { const c = A.clone().addScaledVector(d, (k + 0.5) * len / n), M = mat(c.x, 0, c.y, yaw, sx, WS, WS); mats.push(M);
        for (const side of [1, -1]) glow.push(new THREE.Matrix4().multiplyMatrices(M, new THREE.Matrix4().compose(new THREE.Vector3(0, 0.2, side * 0.262), new THREE.Quaternion().setFromAxisAngle(UP, side > 0 ? 0 : Math.PI), new THREE.Vector3(1, 1, 1)))); }
      void len0;
    }
    instance(scene, mWall, mats);
    // the lamp glow of every amber strip: a soft additive halo just off the wall (both faces), so the strips read as lit lamps
    const cv = document.createElement('canvas'); cv.width = 512; cv.height = 128; const g = cv.getContext('2d'); g.translate(256, 64); g.scale(1, 0.25); const gr = g.createRadialGradient(0, 0, 0, 0, 0, 256);
    gr.addColorStop(0, 'rgba(255,200,110,0.9)'); gr.addColorStop(0.18, 'rgba(255,170,70,0.55)'); gr.addColorStop(0.45, 'rgba(255,140,40,0.2)'); gr.addColorStop(0.75, 'rgba(255,120,30,0.05)'); gr.addColorStop(1, 'rgba(255,110,30,0)'); g.fillStyle = gr; g.fillRect(-256, -256, 512, 512);
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
    const halo = new THREE.InstancedMesh(new THREE.PlaneGeometry(3.6, 0.9), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.7 }), glow.length); glow.forEach((m, i) => halo.setMatrixAt(i, m)); halo.instanceMatrix.needsUpdate = true; halo.frustumCulled = false; halo.renderOrder = 2; scene.add(halo); }
  // planters: LONG ones (planters_long.glb, 8 m bowls with lush plants) in a chain along the inner side of every wall edge, so the greenery runs round the whole contour like in the reference; when that file is missing the short ones (planters_v2) stand on the corners / walls as before
  { const [lA, lB, lC] = await Promise.all(['a', 'b', 'c'].map((k) => getModule('planters_long.glb', 'planter_long_' + k, () => null)));
    if (lA && lB && lC) {
      const K = 1.5, LEN = 8.0 * K, GAP = 0.5, STEP = LEN + GAP, chains = [[], [], []]; let ci = 0;
      for (let i = 1; i < loop0.length - 2; i++) { // every edge except the two short front pieces beside the entrance
        const A = loop0[i].clone(), B = loop0[i + 1].clone(), d = B.clone().sub(A), L = d.length(); d.normalize(); const nrm = new THREE.Vector2(-d.y, d.x); if (nrm.dot(A.clone().add(B).multiplyScalar(-0.5)) < 0) nrm.negate();
        const n = Math.floor((L - 3 + GAP) / STEP); if (n < 1) continue; const total = n * LEN + (n - 1) * GAP, s0 = (L - total) / 2, off = TH + 0.6 * K + 0.12, yaw = Math.atan2(nrm.x, nrm.y);
        for (let k = 0; k < n; k++) { const c = A.clone().addScaledVector(d, s0 + LEN / 2 + k * STEP).addScaledVector(nrm, off); chains[ci++ % 3].push(mat(c.x, 0, c.y, yaw, K, K, K)); }
      }
      [lA, lB, lC].forEach((m, i) => { if (chains[i].length) instance(scene, m, chains[i]); });
    } else {
  { const PK = 1.4, plM = [[], [], []], bol = []; let pi = 0;
    const put = (x, z, yaw) => { const M = mat(x, 0, z, yaw, PK, PK, PK); plM[pi % 3].push(M); const sgn = pi % 2 ? 1 : -1; bol.push(new THREE.Matrix4().multiplyMatrices(M, new THREE.Matrix4().compose(new THREE.Vector3(sgn * 2.6, 0, 0.1), new THREE.Quaternion(), new THREE.Vector3(1.3 / PK, 1.3 / PK, 1.3 / PK)))); pi++; };
    for (const c of path.corners) { if (!(c.turn > 0.5)) continue; const b = c.clone().negate().normalize(), q = c.clone().addScaledVector(b, 4.4); put(q.x, q.y, Math.atan2(b.x, b.y) + Math.PI / 2 * 0); }
    for (const x of [-15, 0, 15]) put(x, -30.5 + TH + 1.0, 0);
    for (const z of [-6, 14]) { put(-34.5 + TH + 1.0, z, Math.PI / 2); put(34.5 - TH - 1.0, z, -Math.PI / 2); }
    for (let i = 0; i < 3; i++) if (plM[i].length) instance(scene, [mPlA, mPlB, mPlC][i], plM[i]);
    if (bol.length) instance(scene, mBol, bol); }
    }
  }
  // the entrance: part of the wall (its origin is on the outer plane of the wall, x = 0 in the middle of the door)
  instance(scene, mEntr, [mat(0, 0, ZF, 0, WS, WS, WS)]);
  // the two sliding door leaves are separate nodes of the file: real meshes in groups that the frame loop slides sideways (they vanish into the solid wall beside the passage)
  { const leaves = {}; for (const [key, node] of [['L', 'door_L'], ['R', 'door_R']]) { const parts = await getModule('entrance_wall.glb', node, () => []), g = new THREE.Group(); g.position.set(0, 0, ZF); g.scale.setScalar(WS); for (const q of parts) { const m = new THREE.Mesh(q.geo, MATS[q.role] || MATS.Body); m.userData.door = true; g.add(m); } scene.add(g); leaves[key] = g; }
    room.doors = { L: leaves.L, R: leaves.R, open: 0, target: 0, manual: false, slide: 1.5 * WS, pos: new THREE.Vector3(0, 1.3, ZF - 1.2 * WS) }; }

  // the central platform + dome + brain
  const hub = new THREE.Group(); hub.position.copy(hubPos); scene.add(hub); room.hub = hub;
  instance(hub, mHub, [new THREE.Matrix4()]);
  const domeY = 1.35, R = 4.1; // the dome is taller than the wall (owner's views: it rises above the glass roof)
  const dome = new THREE.Mesh(new THREE.SphereGeometry(R, 40, 20, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x5a3cff, transparent: true, opacity: 0.09, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending })); dome.position.y = domeY; dome.scale.y = 1.45; dome.renderOrder = 4; hub.add(dome);
  { const inner = new THREE.Mesh(new THREE.SphereGeometry(R * 0.985, 40, 20, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x070218, transparent: true, opacity: 0.82, depthWrite: false, side: THREE.BackSide })); inner.position.y = domeY; inner.scale.y = 1.45; inner.renderOrder = 1; hub.add(inner); }
  const dotTex = (() => { const cv = document.createElement('canvas'); cv.width = cv.height = 64; const g = cv.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,0.7)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t; })(); // soft round dots
  { const ico = new THREE.IcosahedronGeometry(R * 1.004, 2).toNonIndexed(), pos = ico.attributes.position, keep = [], nodes = new Map(); // the upper half of a geodesic sphere: lines along the edges, a glowing node at every vertex
    for (let i = 0; i < pos.count; i += 3) { let ok = true; for (let k = 0; k < 3; k++) if (pos.getY(i + k) < -0.01) ok = false; if (!ok) continue; for (let k = 0; k < 3; k++) { keep.push(pos.getX(i + k), pos.getY(i + k), pos.getZ(i + k)); const key = pos.getX(i + k).toFixed(3) + pos.getY(i + k).toFixed(3) + pos.getZ(i + k).toFixed(3); nodes.set(key, [pos.getX(i + k), pos.getY(i + k), pos.getZ(i + k)]); } }
    const tri = new THREE.BufferGeometry(); tri.setAttribute('position', new THREE.Float32BufferAttribute(keep, 3));
    const lat = new THREE.LineSegments(new THREE.EdgesGeometry(tri, 1), new THREE.LineBasicMaterial({ color: new THREE.Color(0.5, 0.28, 1.2), transparent: true, opacity: 0.5, depthWrite: false })); lat.position.y = domeY; lat.scale.y = 1.45; hub.add(lat);
    const pg = new THREE.BufferGeometry(); pg.setAttribute('position', new THREE.Float32BufferAttribute([...nodes.values()].flat(), 3));
    const pts = new THREE.Points(pg, new THREE.PointsMaterial({ map: dotTex, alphaTest: 0.02, color: new THREE.Color(0.95, 0.6, 2.0), size: 0.15, sizeAttenuation: true, transparent: true, opacity: 0.95, depthWrite: false, blending: THREE.AdditiveBlending })); pts.position.y = domeY; pts.scale.y = 1.45; hub.add(pts); }
  // a soft light on the top disc of the platform, under the dome (the brain stands in it)
  { const cvg = document.createElement('canvas'); cvg.width = cvg.height = 256; const gg = cvg.getContext('2d'), gr = gg.createRadialGradient(128, 128, 0, 128, 128, 128); gr.addColorStop(0, 'rgba(110,50,235,0.55)'); gr.addColorStop(0.5, 'rgba(80,35,200,0.22)'); gr.addColorStop(1, 'rgba(80,30,200,0)'); gg.fillStyle = gr; gg.fillRect(0, 0, 256, 256);
    const disc = new THREE.Mesh(new THREE.CircleGeometry(R * 0.95, 48), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(cvg), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })); disc.rotation.x = -Math.PI / 2; disc.position.y = domeY + 0.05; hub.add(disc); }
  const rim = new THREE.Mesh(new THREE.TorusGeometry(R, 0.04, 6, 80), new THREE.MeshBasicMaterial({ color: hdr(2.3, 1.45, 0.4) })); // a gold ring at the foot of the dome
  rim.rotation.x = Math.PI / 2; rim.position.y = domeY; hub.add(rim);
  const band = new THREE.Mesh(new THREE.CylinderGeometry(R + 0.3, R + 0.3, 0.55, 64, 1, true), new THREE.MeshBasicMaterial({ color: 0x6a40ff, transparent: true, opacity: 0.1, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending })); band.position.y = domeY + 0.8; hub.add(band); room.ring = band;
  // the brain: glass body + a glowing net + points (the Blender mesh is drawn three ways)
  const brainG = new THREE.Group(); brainG.position.y = domeY + 2.5; hub.add(brainG); room.brain = brainG;
  const BRAIN_VS = 'varying vec3 vN; varying vec3 vV; varying float vS; varying float vH; void main() { vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); vS = color.r; vH = color.g; gl_Position = projectionMatrix * mv; }';
  const BRAIN_FS = 'varying vec3 vN; varying vec3 vV; varying float vS; varying float vH; void main() { float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.2); float neon = smoothstep(0.55, 0.9, vS); float gold = smoothstep(0.62, 0.9, vS); vec3 body = vec3(0.09, 0.02, 0.3) * (0.35 + 0.8 * vH); vec3 line = mix(vec3(0.8, 0.22, 1.7), vec3(2.2, 1.3, 0.25), gold); vec3 col = body + line * neon * 0.95 + vec3(0.3, 0.07, 0.85) * f * 0.8; gl_FragColor = vec4(col, clamp(0.78 + 0.2 * neon + 0.15 * f, 0.0, 1.0)); }';
  for (const p of mBrain) {
    if (p.geo.attributes.position.count < 200) continue; // the small inner core mesh is drawn separately
    if (p.geo.attributes.color) { // brain_v2: COLOR_0.R = the mask of the sulci -> they glow as neon lines; the gyri stay a dark translucent violet; glowing nodes on the crests
      brainG.add(new THREE.Mesh(p.geo, new THREE.ShaderMaterial({ vertexShader: BRAIN_VS, fragmentShader: BRAIN_FS, vertexColors: true, transparent: true, depthWrite: false, side: THREE.FrontSide }))); brainG.children[brainG.children.length - 1].renderOrder = 2;
      const src = p.geo.attributes.position, col = p.geo.attributes.color, sel = []; for (let i = 0; i < src.count; i += 11) if (col.getX(i) < 0.3) sel.push(src.getX(i), src.getY(i), src.getZ(i));
      const gp = [], vp = []; for (let i = 0; i < sel.length; i += 3) (((i / 3) | 0) % 3 === 0 ? gp : vp).push(sel[i], sel[i + 1], sel[i + 2]);
      for (const [arr, c, sz] of [[gp, new THREE.Color(2.4, 1.6, 0.4), 0.075], [vp, new THREE.Color(1.1, 0.5, 2.2), 0.05]]) { const ng = new THREE.BufferGeometry(); ng.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3)); const pt = new THREE.Points(ng, new THREE.PointsMaterial({ map: dotTex, alphaTest: 0.02, color: c, size: sz, sizeAttenuation: true, transparent: true, opacity: 0.95, depthWrite: false, blending: THREE.AdditiveBlending })); pt.renderOrder = 3; brainG.add(pt); }
      continue;
    }
    brainG.add(new THREE.Mesh(p.geo, new THREE.MeshBasicMaterial({ color: 0x4a1fa8, transparent: true, opacity: 0.5, depthWrite: false })));
    brainG.add(new THREE.Mesh(p.geo, new THREE.MeshBasicMaterial({ color: hdr(0.5, 0.28, 1.1), wireframe: true, transparent: true, opacity: 0.55, depthWrite: false })));
    brainG.add(new THREE.Points(p.geo, new THREE.PointsMaterial({ map: dotTex, alphaTest: 0.02, color: hdr(0.9, 0.6, 1.5), size: 0.05, sizeAttenuation: true, transparent: true, opacity: 0.95, depthWrite: false })));
  }
  brainG.scale.setScalar(1.5);
  // (no core sphere: the gold lives in the sulci and the nodes)
  return room;
}

// floor light routes (amber, owner's full-room reference): straight runs with a single 45-degree bend (rounded), from the hub platform to every island + one straight to the entrance
class PolyCurve {
  constructor(pts) { this.pts = pts; this.cum = [0]; for (let i = 1; i < pts.length; i++) this.cum.push(this.cum[i - 1] + pts[i].distanceTo(pts[i - 1])); this.L = this.cum[this.cum.length - 1]; }
  getLength() { return this.L; }
  getPoint(t) { const s = Math.min(1, Math.max(0, t)) * this.L; let lo = 0, hi = this.cum.length - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (this.cum[m] <= s) lo = m; else hi = m; } return this.pts[lo].clone().lerp(this.pts[hi], (s - this.cum[lo]) / (this.cum[hi] - this.cum[lo] || 1)); }
}
export function buildRoutes(scene, hubPos, islands) {
  const curves = [], geos = [], dirs = Array.from({ length: 8 }, (_, k) => new THREE.Vector2(Math.cos(k * Math.PI / 4), Math.sin(k * Math.PI / 4))), V = (x, y) => new THREE.Vector2(x, y);
  const hub = V(hubPos.x, hubPos.z), by = Object.fromEntries(islands.map((i) => [i.t.key, i]));
  const edgePt = (isl, from) => { const T = V(isl.pos.x, isl.pos.z); return T.clone().addScaledVector(T.clone().sub(from).normalize(), -(isl.r + 0.25)); };
  const bend = (p0, p3) => { // p0 -> p3 as one straight run along a cardinal direction + one along a diagonal
    const D = p3.clone().sub(p0); let ang = Math.atan2(D.y, D.x); if (ang < 0) ang += Math.PI * 2; const k = Math.floor(ang / (Math.PI / 4)) % 8, A = dirs[k], B = dirs[(k + 1) % 8], det = A.x * B.y - A.y * B.x, a = (D.x * B.y - D.y * B.x) / det, b = (A.x * D.y - A.y * D.x) / det, card = k % 2 === 0;
    const first = card ? A : B, l1 = card ? a : b, l2 = card ? b : a; return l1 > 1.5 && l2 > 1.5 ? [p0, p0.clone().addScaledVector(first, l1), p3] : [p0, p3];
  };
  const glowGeos = [], coreGeos = [], nodes = [], draw = (poly) => { const pts = roundedPath(poly, 2.6, 6); geos.push(ribbon(pts, 0.22, 0.03)); coreGeos.push(ribbon(pts, 0.08, 0.034)); glowGeos.push(ribbonUV(pts, 1.4, 0.022)); nodes.push(pts[0], pts[pts.length - 1]); return pts; };
  const join = (a, b) => a.concat(b.slice(1));
  // one route from the hub to every island (the islands come from the registry, so their number is not fixed)
  for (const isl of islands) { const dir = V(isl.pos.x, isl.pos.z).sub(hub).normalize(), p0 = hub.clone().addScaledVector(dir, 7.5); curves.push({ cu: new PolyCurve(draw(bend(p0, edgePt(isl, p0)))), y: 0.06 }); }
  curves.push({ cu: new PolyCurve(draw([V(hubPos.x, hubPos.z + 7.5), V(hubPos.x, 29.6)])), y: 0.06 }); // to the entrance
  const cv = document.createElement('canvas'); cv.width = 4; cv.height = 64; const g = cv.getContext('2d'), gr = g.createLinearGradient(0, 0, 0, 64); gr.addColorStop(0, 'rgba(255,160,60,0)'); gr.addColorStop(0.5, 'rgba(255,170,70,0.5)'); gr.addColorStop(1, 'rgba(255,160,60,0)'); g.fillStyle = gr; g.fillRect(0, 0, 4, 64);
  const glow = new THREE.Mesh(mergeIndexed(glowGeos, true), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(cv), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.55 })); glow.renderOrder = 1; scene.add(glow);
  const merged = mergeIndexed(geos); scene.add(new THREE.Mesh(merged, MATS.Amber));
  scene.add(new THREE.Mesh(mergeIndexed(coreGeos), MATS.Core));
  { const ng = new THREE.SphereGeometry(0.3, 14, 8); ng.scale(1, 0.22, 1); const im = new THREE.InstancedMesh(ng, MATS.Core, nodes.length), M = new THREE.Matrix4(); nodes.forEach((q, i) => { M.makeTranslation(q.x, 0.05, q.y); im.setMatrixAt(i, M); }); im.instanceMatrix.needsUpdate = true; im.frustumCulled = false; scene.add(im); } // a glowing node at every end and every fork
  return curves;
}
function mergeIndexed(list, uv = false) { const P = [], N = [], I = [], U = []; let off = 0; for (const g of list) { P.push(...g.attributes.position.array); N.push(...g.attributes.normal.array); if (uv) U.push(...g.attributes.uv.array); I.push(...Array.from(g.index.array, (i) => i + off)); off += g.attributes.position.count; } const o = new THREE.BufferGeometry(); o.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); o.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3)); if (uv) o.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2)); o.setIndex(I); return o; }

// decoration of the work circles (decor.glb, owner's request): a lamp post and a pot in every gap between two desks (the pots alternate: round / round / tall), and a thin ring of light round the hub of the island
export async function buildDecor(scene, islands, FLOOR = 0.62) {
  const [lamp, potA, potB, potT, arc] = await Promise.all(['lamp_post', 'pot_round_a', 'pot_round_b', 'pot_tall', 'floor_arc'].map((k) => getModule('decor.glb', k, () => null)));
  if (!lamp) return;
  const L = [], PA = [], PB = [], PT = [], AR = [];
  for (const isl of islands) {
    const n = isl.t.n, rp = isl.rp;
    for (let i = 0; i < n; i++) {
      const a = (i + 1) / n * Math.PI * 2, sx = Math.sin(a), cz = Math.cos(a), yaw = a * 3.1;
      const at = (rho) => [isl.pos.x + sx * rho, isl.pos.z + cz * rho];
      L.push(mat(...[at(rp + 1.3)[0], FLOOR, at(rp + 1.3)[1]], 0)); // lamp post near the rim
      const [px, pz] = at(rp + 0.05 + (i % 3 === 2 ? 0.5 : 0)); (i % 3 === 0 ? PA : i % 3 === 1 ? PB : PT).push(mat(px, FLOOR, pz, yaw));
    }
    for (let k = 0; k < 10; k++) AR.push(mat(isl.pos.x, FLOOR + 0.02, isl.pos.z, k * Math.PI / 5 + 0.12, 0.8, 1, 0.8)); // a ring of light (radius 3.2) round the hub
  }
  instance(scene, lamp, L); if (potA && PA.length) instance(scene, potA, PA); if (potB && PB.length) instance(scene, potB, PB); if (potT && PT.length) instance(scene, potT, PT); if (arc) instance(scene, arc, AR);
}
export { getModule, instance, mat };
