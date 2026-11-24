// The surroundings of the building, take 3 (owner, 2026-11-10): "the platform must be LOGICALLY connected to something off-screen, not just hover" - extra dust / animations are not wanted. So the variants now give the building something real to stand on / to lead to:
//   1 = STEPPED BASE: the slab is the top of a monumental stepped terrace: five wider and wider tiers going down into the haze, glowing seams on their edges
//   2 = SKY BRIDGE: from the entrance forecourt a bridge on pylons runs out to a round gate plaza (arch + beacon) that stands on its own column
//   3 = BUTTRESS LEGS: eight slanting hexagonal legs from the corners of the slab down to the ground, with light bands
//   4 = stepped base + bridge together
// A small "Частинки" toggle keeps the faint dust the owner liked in the earlier take (it is only a mood layer, off with the button).
// The switch is in the bottom middle; ?bg=0..4 in the address sets the start variant.
import * as THREE from 'three';
import { MATS, getModule, instance, mat } from './room.js';

export const GROUND_Y = -22; // the ground is far below the building
const SLAB_BOTTOM = -0.6;
export const BRIDGE_PZ = 32.45 + 5.7 + 36 + 14 - 1; // z of the centre of the gate plaza at the end of the bridge (the drones fly there)
const hdr = (r, g, b) => new THREE.Color(r, g, b);
const FRONT = 32.45, FORE = 5.7, DOOR = 17; // the outline of the slab: the wall loop + the entrance forecourt (the same numbers as room.js)
const OUTLINE = [[DOOR, FRONT], [26, FRONT], [34.5, 23.95], [34.5, -18], [22, -30.5], [-22, -30.5], [-34.5, -18], [-34.5, 23.95], [-26, FRONT], [-DOOR, FRONT], [-DOOR, FRONT + FORE], [DOOR, FRONT + FORE]];

// the outline pushed outwards by d (miter joins)
function offsetPoly(pts, d) {
  const n = pts.length; let A = 0; for (let i = 0; i < n; i++) { const [x1, z1] = pts[i], [x2, z2] = pts[(i + 1) % n]; A += x1 * z2 - x2 * z1; } const sgn = A >= 0 ? 1 : -1;
  const nrm = (a, b) => { const dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz); return [sgn * dz / l, -sgn * dx / l]; };
  return pts.map((p, i) => { const a = pts[(i + n - 1) % n], b = pts[(i + 1) % n], n1 = nrm(a, p), n2 = nrm(p, b), k = d / (1 + n1[0] * n2[0] + n1[1] * n2[1]); return [p[0] + (n1[0] + n2[0]) * k, p[1] + (n1[1] + n2[1]) * k]; });
}
const shapeOf = (pts) => new THREE.Shape(pts.map(([x, z]) => new THREE.Vector2(x, -z)));
function prism(pts, top, bottom, mats) { // a polygon prism between two heights (xz outline)
  const g = new THREE.ExtrudeGeometry(shapeOf(pts), { depth: top - bottom, bevelEnabled: false }); g.rotateX(-Math.PI / 2); g.translate(0, bottom, 0); return new THREE.Mesh(g, mats);
}
function ribbon(pts, dOuter, dInner, y, mat) { // a flat glowing band between two offsets of the outline
  const sh = shapeOf(offsetPoly(pts, dOuter)), hole = new THREE.Path(offsetPoly(pts, dInner).map(([x, z]) => new THREE.Vector2(x, -z))); sh.holes.push(hole);
  const g = new THREE.ExtrudeGeometry(sh, { depth: 0.06, bevelEnabled: false }); g.rotateX(-Math.PI / 2); g.translate(0, y, 0); return new THREE.Mesh(g, mat);
}

function band(pts, dOuter, dInner, y, h, mat) { // a flat ring of height h between two offsets of the outline (a curb / a glowing line)
  const sh = shapeOf(offsetPoly(pts, dOuter)); sh.holes.push(new THREE.Path(offsetPoly(pts, dInner).map(([x, z]) => new THREE.Vector2(x, -z))));
  const g = new THREE.ExtrudeGeometry(sh, { depth: h, bevelEnabled: false }); g.rotateX(-Math.PI / 2); g.translate(0, y, 0); return new THREE.Mesh(g, mat);
}
const along = (pts, step, off = 0.5) => { const out = []; for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length], dx = b[0] - a[0], dz = b[1] - a[1], len = Math.hypot(dx, dz), c = Math.max(1, Math.round(len / step)), yaw = Math.atan2(-dz, dx); for (let k = 0; k < c; k++) { const t = (k + off) / c; out.push({ x: a[0] + dx * t, z: a[1] + dz * t, yaw, len, edge: i }); } } return out; };

const BASE = import.meta.env.BASE_URL;
export function buildSurround(scene, { zf = 32.45, room = null, level: startLevel = 4, dust: startDust = true, viewH = () => 800, ui = false } = {}) {
  const G = { dust: new THREE.Group(), tiers: new THREE.Group(), bridge: new THREE.Group(), legs: new THREE.Group() }; scene.add(G.dust, G.tiers, G.bridge, G.legs);
  const CX = 0, CZ = 2;
  // the same materials as the building (room.js): polished lilac tile on the tops, lilac metal on the sides, stone caps, violet neon and amber slits like the wall's lamps
  const shade = (m, k) => { const c = m.clone(); c.color.multiplyScalar(k); return c; };
  const CAP = MATS.Cap, BASEM = MATS.Base, STONE_DARK = MATS.Panel;
  const NEONV = new THREE.MeshBasicMaterial({ color: hdr(1.1, 0.6, 2.0) }), NEONA = new THREE.MeshBasicMaterial({ color: hdr(2.6, 1.5, 0.45) });
  const tileMat = (k) => shade(MATS.Floor, 1 - k * 0.1), sideMat = (k) => shade(MATS.Rim, 1 - k * 0.13);

  // ---- mood layer: faint light dust drifting up (the particles the owner liked) ----
  let dust = null;
  { const N = 700, pos = new Float32Array(N * 3), seed = new Float32Array(N), kind = new Float32Array(N);
    for (let i = 0; i < N; i++) { const a = Math.random() * Math.PI * 2, r = 10 + Math.pow(Math.random(), 0.7) * 110; pos[i * 3] = CX + Math.cos(a) * r; pos[i * 3 + 1] = Math.random() * 90 + GROUND_Y; pos[i * 3 + 2] = CZ + Math.sin(a) * r; seed[i] = Math.random(); kind[i] = Math.random() < 0.18 ? 1 : 0; }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1)); g.setAttribute('aKind', new THREE.BufferAttribute(kind, 1));
    const mat = new THREE.ShaderMaterial({ uniforms: { uTime: { value: 0 }, uScale: { value: viewH() / 2 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: 'attribute float aSeed; attribute float aKind; uniform float uTime; uniform float uScale; varying float vK; varying float vA; void main() { vec3 p = position; float h = 90.0; float y0 = p.y - (' + GROUND_Y.toFixed(1) + '); p.y = ' + GROUND_Y.toFixed(1) + ' + mod(y0 + uTime * (1.2 + aSeed * 2.4), h); p.x += sin(uTime * 0.2 + aSeed * 40.0) * 2.0; p.z += cos(uTime * 0.17 + aSeed * 31.0) * 2.0; vK = aKind; float u = (p.y - (' + GROUND_Y.toFixed(1) + ')) / h; vA = smoothstep(0.0, 0.12, u) * (1.0 - smoothstep(0.7, 1.0, u)); vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_PointSize = (0.5 + aSeed * 0.9) * uScale * 0.9 / -mv.z; gl_Position = projectionMatrix * mv; }',
      fragmentShader: 'varying float vK; varying float vA; void main() { vec2 c = gl_PointCoord - 0.5; float d = length(c) * 2.0; if (d > 1.0) discard; float a = pow(1.0 - d, 2.0) * vA; vec3 col = mix(vec3(0.55, 0.32, 1.4), vec3(2.0, 1.3, 0.35), vK); gl_FragColor = vec4(col, a); }' });
    dust = new THREE.Points(g, mat); dust.frustumCulled = false; G.dust.add(dust); }

  // ---- 1: the stepped base: the slab is the top of a terrace of the same stone; every tier has a stone curb, a violet line and amber slits like the wall; lamps and pots on the first terrace ----
  { const D = [4, 9.5, 17, 27, 40], STEP = 4.2, slitGeo = new THREE.BoxGeometry(2.2, 0.16, 0.08), slits = [];
    D.forEach((d, k) => { const top = SLAB_BOTTOM - k * STEP, pts = offsetPoly(OUTLINE, d); G.tiers.add(prism(pts, top, GROUND_Y - 1, [tileMat(k), sideMat(k)]));
      if (k < 4) { G.tiers.add(band(OUTLINE, d, d - 0.55, top, 0.32, k === 0 ? CAP : shade(MATS.Cap, 1 - k * 0.12))); G.tiers.add(band(OUTLINE, d - 0.12, d - 0.26, top + 0.325, 0.03, NEONV)); }
      else G.tiers.add(ribbon(OUTLINE, d - 0.1, d - 0.4, top + 0.005, NEONV));
      if (k < 4) for (const q of along(pts, 8.5)) slits.push(mat(q.x, top - 1.25, q.z, q.yaw)); // amber slits on the tier's face
      if (k < 3) G.tiers.add(band(OUTLINE, d + 0.01, d - 0.0, top - 0.55, 0.06, NEONV)); // a violet foot line under the curb
    });
    const sl = new THREE.InstancedMesh(slitGeo, NEONA, slits.length); slits.forEach((m, i) => sl.setMatrixAt(i, m)); sl.frustumCulled = false; G.tiers.add(sl);
    // decor on the first terrace (from decor.glb, the same lamp posts and pots as on the islands)
    const p1 = offsetPoly(OUTLINE, 2.6);
    Promise.all(['lamp_post', 'pot_round_a', 'pot_round_b', 'pot_tall'].map((n) => getModule('decor.glb', n, () => null))).then(([lamp, potA, potB, potT]) => {
      if (!lamp) return; const L = [], PA = [], PB = [], PT = [];
      along(p1, 9.5, 0.25).forEach((q) => L.push(mat(q.x, SLAB_BOTTOM, q.z, 0)));
      along(p1, 4.75, 0.5).forEach((q, i) => (i % 3 === 0 ? PA : i % 3 === 1 ? PB : PT).push(mat(q.x, SLAB_BOTTOM, q.z, q.yaw)));
      for (const [m, l] of [[lamp, L], [potA, PA], [potB, PB], [potT, PT]]) if (m && l.length) instance(G.tiers, m, l);
    }); }

  // ---- 2: the sky bridge: a deck of the same tile with stone parapets (amber slit + violet line), lamp posts, tapered pylons; the round gate plaza has a curb, light rings, pots, lamps and a stone arch with the emblem ----
  { const z0 = FRONT + FORE, LEN = 36, W = 11, z1 = z0 + LEN, PR = 14, pz = z1 + PR - 1, rect = (w, a0, a1) => [[-w / 2, a0], [w / 2, a0], [w / 2, a1], [-w / 2, a1]];
    G.bridge.add(prism(rect(W, z0 - 0.5, z1 + 0.5), 0, -0.9, [tileMat(0), sideMat(0)])); G.bridge.add(prism(rect(W - 1.2, z0 - 0.5, z1 + 0.5), -0.9, -2.3, [shade(MATS.Base, 0.8), shade(MATS.Base, 0.8)]));
    for (const sx of [-1, 1]) {
      const px = sx * (W / 2 - 0.35), par = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.1, LEN + 1), CAP); par.position.set(px, 0.55, z0 + LEN / 2); G.bridge.add(par);
      const nl = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.05, LEN + 1), NEONV); nl.position.set(px, 1.12, z0 + LEN / 2); G.bridge.add(nl);
      const sl = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.14, LEN - 6), NEONA); sl.position.set(px - sx * 0.37, 0.55, z0 + LEN / 2); G.bridge.add(sl);
      const foot = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.08, LEN + 1), NEONV); foot.position.set(sx * (W / 2 + 0.02), -0.8, z0 + LEN / 2); G.bridge.add(foot); }
    for (const zz of [z0 + 9, z0 + 22]) { // pylons: a pair of tapered legs under the deck, down to the ground
      for (const sx of [-1, 1]) { const leg = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 2.4, -GROUND_Y - 2.4, 6), BASEM); leg.position.set(sx * 3.4, (GROUND_Y - 2.4) / 2 - 0.2, zz); G.bridge.add(leg);
        const collar = new THREE.Mesh(new THREE.CylinderGeometry(1.9, 1.9, 0.5, 6), CAP); collar.position.set(sx * 3.4, -2.55, zz); G.bridge.add(collar);
        for (const y of [-6, -11, -16]) { const band = new THREE.Mesh(new THREE.TorusGeometry(1.5 + (-y - 2.4) * 0.065, 0.07, 6, 6), NEONV); band.rotation.x = Math.PI / 2; band.position.set(sx * 3.4, y, zz); G.bridge.add(band); } }
      const beam = new THREE.Mesh(new THREE.BoxGeometry(W + 0.4, 0.9, 2.4), CAP); beam.position.set(0, -2.75, zz); G.bridge.add(beam); }
    // the gate plaza
    const circ = (r) => Array.from({ length: 56 }, (_, i) => [Math.sin(i / 56 * Math.PI * 2) * r, pz + Math.cos(i / 56 * Math.PI * 2) * r]).reverse();
    const pl = circ(PR); G.bridge.add(prism(pl, 0, -1.0, [tileMat(0), sideMat(0)]));
    G.bridge.add(band(pl, 0, -0.6, 0, 0.32, CAP)); G.bridge.add(band(pl, -0.12, -0.26, 0.325, 0.03, NEONV)); G.bridge.add(band(pl, 0.01, 0, -0.55, 0.06, NEONV));
    for (const [r, m, w] of [[PR - 3.0, NEONV, 0.1], [PR - 6.2, NEONA, 0.07], [PR - 9.4, NEONV, 0.07]]) { const ring = new THREE.Mesh(new THREE.TorusGeometry(r, w, 6, 96), m); ring.rotation.x = Math.PI / 2; ring.position.set(0, 0.03, pz); G.bridge.add(ring); }
    for (let k = 0; k < 12; k++) { const a = k / 12 * Math.PI * 2, spoke = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.03, 3.1), k % 2 ? NEONV : NEONA); spoke.position.set(Math.sin(a) * (PR - 4.6), 0.03, pz + Math.cos(a) * (PR - 4.6)); spoke.rotation.y = a; G.bridge.add(spoke); }
    const col = new THREE.Mesh(new THREE.CylinderGeometry(5.2, 7.4, -GROUND_Y - 1.4, 8), BASEM); col.position.set(0, (GROUND_Y - 1.4) / 2 - 0.6, pz); G.bridge.add(col);
    for (const y of [-5, -11, -17]) { const b = new THREE.Mesh(new THREE.TorusGeometry(5.3 + (-y) * 0.12, 0.1, 6, 8), NEONV); b.rotation.x = Math.PI / 2; b.position.set(0, y, pz); G.bridge.add(b); }
    // the gate: stone pillars + a stone arch with an amber inner line and the emblem; a beacon behind it
    const gz = pz - 4;
    for (const sx of [-1, 1]) { const pil = new THREE.Mesh(new THREE.BoxGeometry(1.7, 5, 1.7), CAP); pil.position.set(sx * 6.5, 2.5, gz); G.bridge.add(pil);
      for (const fz of [-1, 1]) { const st = new THREE.Mesh(new THREE.BoxGeometry(0.12, 3.4, 0.05), NEONA); st.position.set(sx * 6.5, 2.6, gz + fz * 0.86); G.bridge.add(st); }
      const cap = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.35, 2.1), STONE_DARK); cap.position.set(sx * 6.5, 5.1, gz); G.bridge.add(cap); }
    const arch = new THREE.Mesh(new THREE.TorusGeometry(6.5, 0.75, 10, 48, Math.PI), CAP); arch.position.set(0, 5.2, gz); G.bridge.add(arch);
    const arch2 = new THREE.Mesh(new THREE.TorusGeometry(5.65, 0.09, 6, 64, Math.PI), NEONA); arch2.position.set(0, 5.2, gz); G.bridge.add(arch2);
    const arch3 = new THREE.Mesh(new THREE.TorusGeometry(7.25, 0.06, 6, 64, Math.PI), NEONV); arch3.position.set(0, 5.2, gz); G.bridge.add(arch3);
    { const img = new Image(); img.onload = () => { const cv = document.createElement('canvas'); cv.width = cv.height = 256; cv.getContext('2d').drawImage(img, 0, 0, 256, 256); const tx = new THREE.CanvasTexture(cv); tx.colorSpace = THREE.SRGBColorSpace; const em = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 3.4), new THREE.MeshBasicMaterial({ map: tx, color: hdr(1.8, 1.6, 2.2), transparent: true, side: THREE.DoubleSide, depthWrite: false })); em.position.set(0, 9.6, gz); G.bridge.add(em); }; img.src = BASE + 'ai-world/logo/emblem.svg'; }
    const beacon = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.9, 20, 8), BASEM); beacon.position.set(0, 10, pz + 6); G.bridge.add(beacon);
    for (const y of [4, 9, 14]) { const r = new THREE.Mesh(new THREE.TorusGeometry(0.75 - (y - 4) * 0.025, 0.06, 6, 8), NEONV); r.rotation.x = Math.PI / 2; r.position.set(0, y, pz + 6); G.bridge.add(r); }
    const bl = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 3, 8), NEONV); bl.position.set(0, 21.5, pz + 6); const bt = new THREE.Mesh(new THREE.SphereGeometry(1.1, 16, 12), NEONA); bt.position.set(0, 24, pz + 6); G.bridge.add(bl, bt);
    // decor: lamp posts along the bridge, lamps and pots round the plaza (the same models as the islands)
    Promise.all(['lamp_post', 'pot_round_a', 'pot_round_b', 'pot_tall'].map((n) => getModule('decor.glb', n, () => null))).then(([lamp, potA, potB, potT]) => {
      if (!lamp) return; const L = [], PA = [], PB = [], PT = [];
      for (let k = 0; k < 4; k++) for (const sx of [-1, 1]) L.push(mat(sx * (W / 2 - 1.3), 0, z0 + 4 + k * 9, 0));
      for (let k = 0; k < 18; k++) { const a = (k + 0.5) / 18 * Math.PI * 2, r = PR - 1.4, x = Math.sin(a) * r, z = pz + Math.cos(a) * r; if (z < pz - 8 && Math.abs(x) < 8) continue; if (z < pz - 3.5 && z > pz - 5.2 && Math.abs(x) < 8) continue; (k % 2 ? L : (k % 4 === 0 ? PA : PB)).push(mat(x, 0, z, a)); }
      for (let k = 0; k < 9; k++) { const a = (k + 0.25) / 9 * Math.PI * 2 + 0.2, r = PR - 3.0, x = Math.sin(a) * r, z = pz + Math.cos(a) * r; if (z < pz - 8 && Math.abs(x) < 8) continue; PT.push(mat(x, 0, z, a)); }
      for (const [m, l] of [[lamp, L], [potA, PA], [potB, PB], [potT, PT]]) if (m && l.length) instance(G.bridge, m, l); }); }

  // ---- 3: buttress legs from the corners of the slab ----
  { const corners = OUTLINE.filter((p, i) => i !== 0 && i !== 9 && i !== 10 && i !== 11 || false).concat([OUTLINE[10], OUTLINE[11]]), UPV = new THREE.Vector3(0, 1, 0);
    for (const [x, z] of corners) {
      const out = new THREE.Vector3(x - CX, 0, z - CZ).normalize(), A = new THREE.Vector3(x - out.x * 2.4, -0.7, z - out.z * 2.4), B = new THREE.Vector3(x + out.x * 15, GROUND_Y, z + out.z * 15), dir = B.clone().sub(A), len = dir.length(), mid = A.clone().add(B).multiplyScalar(0.5);
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 4.4, len, 6), BASEM); leg.position.copy(mid); leg.quaternion.setFromUnitVectors(UPV, dir.clone().negate().normalize()); G.legs.add(leg); /* the narrow end (cylinder top) is at the slab */
      for (const t of [0.3, 0.55, 0.8]) { const p = A.clone().lerp(B, t), r = 2.6 + (4.4 - 2.6) * t + 0.04, band = new THREE.Mesh(new THREE.TorusGeometry(r, 0.09, 6, 6), NEONV); band.position.copy(p); band.quaternion.copy(leg.quaternion); band.rotateX(Math.PI / 2); G.legs.add(band); }
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(3.0, 3.0, 0.5, 6), CAP); cap.position.set(x - out.x * 2.4, -0.55, z - out.z * 2.4); G.legs.add(cap); } }

  // ---- the switch ----
  let level = 0, dustOn = true;
  const TIPS = ['Без оточення', 'Ступінчаста основа: плита - верх монументальної тераси, що йде вниз у серпанок', 'Небесний міст від входу до круглого майданчика з аркою-воротами та маяком', 'Опорні "ноги" від кутів плити до землі', 'Ступінчаста основа + міст'];
  function apply() { G.tiers.visible = level === 1 || level === 4; G.bridge.visible = level === 2 || level === 4; G.legs.visible = level === 3; G.dust.visible = dustOn; document.querySelectorAll('#bgsw button[data-l]').forEach((b) => b.classList.toggle('on', +b.dataset.l === level)); const d = document.querySelector('#bgsw button[data-dust]'); if (d) d.classList.toggle('on', dustOn); }
  function set(n) { level = n; apply(); }
  set(startLevel); dustOn = startDust; apply();
  void ui;

  function update(t) { if (dustOn) dust.material.uniforms.uTime.value = t; }
  void zf; void room;
  return { set, update, get level() { return level; }, groups: G };
}
