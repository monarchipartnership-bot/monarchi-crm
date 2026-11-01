// The Social district as a village: one small house per agent (named like the agent), the gate and a pedestrian ring round a plaza where the agents
// walk between the houses carrying tasks. The village is built in its own local frame (a plaza at the origin, the gate towards +z) and placed on the
// map scaled down; every house is a «building» the rest of the map already understands (open, close, a robot inside, a flag, a selection ring).
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { C, box, cyl, mat, canvasTex } from './models.js';
import { makeAgentRobot, tickAgentRobot, makeCartGlb } from './assets.js';
import { instancedProto } from './park.js';
import { doorPool, NIGHT } from './night.js';
import { RUN, runOf } from './runstatus.js';

const HW = 10.6, HD = 9.4, HH = 6.6; // a house
const RP = 15.5, RW = 8; // the ring ROAD for cars: centre line and width
const RS = 21.6, SW = 3.2; // the sidewalk ring outside it, where the agents walk
const G = 0.43; // the ground level of the village in its own frame (the lawn of the super-block)
const LAWN = 0xe3d3f1, STONE = 0xfcf7fd, ASPHALT = 0xd0b6dc;
const ANGLES = [155, 200, 235, 305, 340, 20, 65, 110]; // houses on an ellipse round the plaza; built agents take the first six (the chain goes round, with a gap in the north for the entrance), planned ones stand in the south, near the camera
const ELL = { a: 60, b: 34 };
const ROOF = ['flat', 'gable', 'shed', 'gable', 'flat', 'shed'];
const PROPS = ['calendar', 'pen', 'palette', 'check', 'plane', 'chart', 'eye', 'bubble'];


function signTex(text) {
  return canvasTex(512, 128, (c, w, h) => {
    const gr = c.createLinearGradient(0, 0, w, 0); gr.addColorStop(0, '#b544b5'); gr.addColorStop(1, '#661466'); c.fillStyle = gr; c.fillRect(0, 0, w, h);
    c.fillStyle = '#fff'; c.textAlign = 'center'; c.textBaseline = 'middle';
    const words = text.split(' '); let lines = [text]; if (text.length > 14) { const mid = Math.ceil(words.length / 2); lines = [words.slice(0, mid).join(' '), words.slice(mid).join(' ')].filter(Boolean); }
    const size = lines.length > 1 ? 40 : 52; c.font = `800 ${size}px Onest, Arial, sans-serif`;
    lines.forEach((ln, k) => c.fillText(ln, w / 2, h / 2 + (k - (lines.length - 1) / 2) * (size + 4), w - 40));
  });
}
function gable(parent, w, d, h, color, ax) { // a pitched roof: a triangle extruded along the ridge
  const s = new THREE.Shape(), half = (ax === 'x' ? d : w) / 2; s.moveTo(-half - 0.5, 0); s.lineTo(half + 0.5, 0); s.lineTo(0, h); s.closePath();
  const len = (ax === 'x' ? w : d) + 1.0, g = new THREE.ExtrudeGeometry(s, { depth: len, bevelEnabled: true, bevelSize: 0.12, bevelThickness: 0.12, bevelSegments: 2 });
  g.translate(0, 0, -len / 2); if (ax === 'x') g.rotateY(Math.PI / 2);
  const m = new THREE.Mesh(g, mat(color, { rough: 0.6 })); m.castShadow = true; m.receiveShadow = true; parent.add(m); return m;
}
function roofProp(g, kind, y) {
  const p = new THREE.Group(); p.position.set(0, y, 0); g.add(p);
  if (kind === 'calendar') { box(p, 2.2, 1.8, 0.3, C.white, 0, 0.3, 0, 0.08); box(p, 2.2, 0.5, 0.34, C.plum, 0, 1.6, 0, 0.06); for (let i = 0; i < 3; i++) box(p, 0.4, 0.3, 0.36, C.mid, -0.7 + i * 0.7, 0.7, 0, 0.04); }
  else if (kind === 'pen') { const b = cyl(p, 0.22, 0.22, 2.6, C.plum, 0, 0.3, 0); b.rotation.z = 0.6; const t = cyl(p, 0, 0.22, 0.7, C.deep, 0, 0, 0); t.position.set(-0.78, 0.1, 0); t.rotation.z = 0.6 + Math.PI; }
  else if (kind === 'palette') { cyl(p, 1.3, 1.3, 0.3, C.cream, 0, 0.3, 0); [C.plum, C.pink, C.violet, C.dev].forEach((c, i) => cyl(p, 0.28, 0.28, 0.34, c, Math.cos(i * 1.4) * 0.8, 0.34, Math.sin(i * 1.4) * 0.8)); }
  else if (kind === 'check') { box(p, 2.0, 2.2, 0.3, C.white, 0, 0.3, 0, 0.12); box(p, 0.4, 1.0, 0.36, C.plum, -0.3, 0.9, 0, 0.1).rotation.z = 0.6; box(p, 0.4, 1.5, 0.36, C.plum, 0.4, 1.0, 0, 0.1).rotation.z = -0.7; }
  else if (kind === 'plane') { const c = new THREE.Mesh(new THREE.ConeGeometry(0.9, 2.6, 4), mat(C.plum, { rough: 0.5 })); c.rotation.z = -Math.PI / 2 + 0.5; c.position.y = 1.3; c.castShadow = true; p.add(c); }
  else if (kind === 'chart') { [0.8, 1.4, 2.0, 1.2].forEach((h, i) => box(p, 0.5, h, 0.5, i % 2 ? C.plum : C.mid, -0.9 + i * 0.6, 0.3, 0, 0.08)); }
  else if (kind === 'eye') { const s = new THREE.Mesh(new THREE.SphereGeometry(1.0, 20, 14), mat(C.white, { rough: 0.4 })); s.position.y = 1.3; s.castShadow = true; p.add(s); const i = new THREE.Mesh(new THREE.SphereGeometry(0.46, 16, 12), mat(C.plum)); i.position.set(0, 1.3, 0.82); p.add(i); }
  else { const s = new THREE.Mesh(new THREE.SphereGeometry(1.05, 20, 14), mat(C.white, { rough: 0.4 })); s.position.y = 1.4; s.scale.y = 0.75; s.castShadow = true; p.add(s); [-0.4, 0, 0.4].forEach((x) => { const d = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 8), mat(C.plum)); d.position.set(x, 1.4, 0.95); p.add(d); }); }
  return p;
}

// agents: [{ key, name, status }]; center: world {x, z}; S: scale; gateZ: the z of the street the gate opens on (world)
export function buildVillage({ world, assets, agents, deptKey, center, S, rng, rect }) {
  const g = new THREE.Group(); g.position.set(center.x, 0, center.z); g.scale.setScalar(S); world.add(g);
  const toW = (x, z) => ({ x: center.x + x * S, z: center.z + z * S });
  const built = agents.filter((a) => a.status !== 'not_started'), planned = agents.filter((a) => a.status === 'not_started');

  // ---- the ground: the whole rectangle of the village (its blocks and the streets between them) is one plate with the kerb of any other block
  const HX = rect.w / 2 / S, HZ = rect.d / 2 / S; // half sizes in the local frame
  { const plate = new THREE.Mesh(new RoundedBoxGeometry(rect.w, 0.2, rect.d, 3, 0.5), mat(0xfdf8fe, { rough: 0.9 })); plate.position.set(center.x, 0.04, center.z); plate.receiveShadow = true; world.add(plate);
    const lawn = new THREE.Mesh(new RoundedBoxGeometry(rect.w - 1.2, 0.12, rect.d - 1.2, 3, 0.4), mat(LAWN, { rough: 0.95 })); lawn.position.set(center.x, 0.2, center.z); lawn.receiveShadow = true; world.add(lawn); }
  const contains = (wx, wz, m = 0) => Math.abs(wx - center.x) < rect.w / 2 - m && Math.abs(wz - center.z) < rect.d / 2 - m;

  // ---- the plaza (a lawn island with the fountain and beds), the ring ROAD round it, the sidewalk outside the road.
  // Every layer has its own height (at least 0.04 apart) and every painted line is a decal with a polygon offset, so no two surfaces share a depth and nothing shimmers.
  const H = { side: G + 0.06, foot: G + 0.11, road: G + 0.16, paint: G + 0.2 };
  const decal = (color, n = 1) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, polygonOffset: true, polygonOffsetFactor: -n, polygonOffsetUnits: -n * 2 });
  const OPEN = Math.asin((RW / 2 + 0.6) / (RP + RW / 2)); // the entrance road opens the outer edge line of the ring
  { const pr = RP - RW / 2 - 1.0; // the plaza island: the top is its own colour, so there is no second disc over it
    const base = new THREE.Mesh(new THREE.CylinderGeometry(pr + 0.5, pr + 0.5, 0.34, 72), [mat(C.cream, { rough: 0.9 }), new THREE.MeshStandardMaterial({ color: 0xe9dcf5, roughness: 0.95 }), mat(C.cream, { rough: 0.9 })]); base.position.y = G - 0.02; base.receiveShadow = true; g.add(base);
    const f = assets.fountain.getObjectByName('fountain').clone(true); f.position.set(0, G + 0.15, 0); f.scale.setScalar(0.95); g.add(f);
    const ring = (r0, r1, y, material, th0 = 0, th1 = Math.PI * 2) => { const m = new THREE.Mesh(new THREE.RingGeometry(r0, r1, 120, 1, th0, th1 - th0), material); m.rotation.x = -Math.PI / 2; m.position.y = y; m.receiveShadow = true; g.add(m); return m; };
    ring(RS - SW / 2, RS + SW / 2, H.side, new THREE.MeshStandardMaterial({ color: STONE, roughness: 0.9 })); // the sidewalk
    ring(RS - SW / 2 - 0.35, RS - SW / 2, H.side + 0.01, decal(0xffffff)); ring(RS + SW / 2, RS + SW / 2 + 0.3, H.side + 0.01, decal(C.lilac2));
    ring(RP - RW / 2, RP + RW / 2, H.road, new THREE.MeshStandardMaterial({ color: ASPHALT, roughness: 0.95 })); // the road
    const white = decal(0xffffff, 2);
    ring(RP - RW / 2 - 0.4, RP - RW / 2, H.road + 0.01, white); // the edge lines of the road; the outer one is open where the entrance joins
    ring(RP + RW / 2, RP + RW / 2 + 0.4, H.road + 0.01, white, Math.PI / 2 + OPEN, Math.PI / 2 - OPEN + Math.PI * 2);
    const dm = new THREE.InstancedMesh(new THREE.BoxGeometry(1.6, 0.03, 0.22), decal(0xffffff, 3), 40), o = new THREE.Object3D(); for (let k = 0; k < 40; k++) { const th = (k / 40) * Math.PI * 2; o.position.set(Math.cos(th) * RP, H.paint, Math.sin(th) * RP); o.rotation.set(0, -th - Math.PI / 2, 0); o.updateMatrix(); dm.setMatrixAt(k, o.matrix); } g.add(dm); // the dashes down the middle of the road
  }
  const stoneMat = mat(STONE, { rough: 0.9 }); stoneMat.side = THREE.DoubleSide;
  function ribbon(P, w, y, material) {
    const pos = [], idx = [];
    P.forEach((q, k) => { const a = P[Math.max(0, k - 1)], b = P[Math.min(P.length - 1, k + 1)]; let tx = b.x - a.x, tz = b.z - a.z; const l = Math.hypot(tx, tz) || 1; tx /= l; tz /= l; pos.push(q.x - tz * w / 2, y, q.z + tx * w / 2, q.x + tz * w / 2, y, q.z - tx * w / 2); if (k) { const v = k * 2; idx.push(v - 2, v - 1, v, v - 1, v + 1, v); } });
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setIndex(idx); geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, material); m.receiveShadow = true; g.add(m); return m;
  }

  // ---- the houses
  const houses = [], sites = [], flags = [];
  const houseAt = (slot) => { const th = ANGLES[slot] * Math.PI / 180, j = 0.04 * Math.sin(slot * 2.3 + 1); return { x: Math.cos(th) * ELL.a * (1 + j), z: Math.sin(th) * ELL.b * (1 - j) }; };
  const SY = G; // the floor level of a house
  function frame(slot) { const p = houseAt(slot), yaw = Math.atan2(-p.x, -p.z) + (rng() - 0.5) * 0.2, dir = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw)); return { p, yaw, dir, door: { x: p.x + dir.x * (HD / 2 + 1.0), z: p.z + dir.z * (HD / 2 + 1.0) } }; }

  function buildHouse(a, i, slot) {
    const { p, yaw, dir, door } = frame(slot), hg = new THREE.Group(); hg.position.set(p.x, SY, p.z); hg.rotation.y = yaw; g.add(hg);
    const key = deptKey + '/' + a.key;
    hg.userData = { kind: 'dept', key: deptKey, agentKey: a.key };
    const pad = new THREE.Mesh(new RoundedBoxGeometry(HW + 3.6, 0.28, HD + 3.8, 2, 0.12), [mat(C.cream), mat(C.cream), mat(0xf6ecfa), mat(C.cream), mat(C.cream), mat(C.cream)]); pad.position.y = -0.14; pad.receiveShadow = true; pad.castShadow = true; hg.add(pad);
    const edge = new THREE.Mesh(new RoundedBoxGeometry(HW + 3.9, 0.08, HD + 4.1, 2, 0.04), mat(C.plum, { emissive: C.plum, ei: 0.3 })); edge.position.y = -0.3; hg.add(edge);
    const sel = new THREE.Mesh(new THREE.BoxGeometry(HW + 5.0, 0.04, HD + 5.2), new THREE.MeshBasicMaterial({ color: C.plum, transparent: true, opacity: 0 })); sel.position.y = -0.34; hg.add(sel);
    const body = new THREE.Group(); hg.add(body);
    box(body, HW, 0.2, HD, C.lilac2, 0, -0.08, 0, 0.04);
    const front = new THREE.Group(); body.add(front); // the walls the camera sees: they shrink when the house opens
    const gm = { rough: 0.2, metal: 0.1, emissive: 0xb9a3f5, ei: 0.18 };
    Object.entries({ 'z+': [0, 1], 'z-': [0, -1], 'x+': [1, 0], 'x-': [-1, 0] }).forEach(([name, [lx, lz]]) => {
      const nx = lx * Math.cos(yaw) + lz * Math.sin(yaw), nz = -lx * Math.sin(yaw) + lz * Math.cos(yaw), seen = nx * 0.707 + nz * 0.707 > 0.05, G = new THREE.Group(); (seen ? front : body).add(G);
      if (lz) G.position.set(0, 0, lz * (HD / 2 + 0.3)); else G.position.set(lx * (HW / 2 + 0.3), 0, 0);
      G.rotation.y = Math.atan2(lx, lz); // every wall is built as the +z wall of its own frame, then turned
      const len = lz ? HW + 0.6 : HD, out = 0.32;
      box(G, len, HH, 0.6, C.white, 0, 0, 0, 0.12);
      if (seen) box(G, len + 0.1, 0.45, 0.8, C.lilac2, 0, 0, 0, 0.05);
      (lz ? [-3.3, 3.3] : [-2.5, 2.5]).forEach((x) => { if (name === 'z+' && Math.abs(x) < 1.2) return; box(G, 1.7, 2.5, 0.1, C.glass, x, 1.9, out + 0.06, 0.05, gm); });
      const doorSeen = Math.sin(yaw) * 0.707 + Math.cos(yaw) * 0.707 > 0.05, camFacing = Math.max(...[[1, 0], [-1, 0], [0, -1]].map(([x, z]) => (x * Math.cos(yaw) + z * Math.sin(yaw)) * 0.707 + (-x * Math.sin(yaw) + z * Math.cos(yaw)) * 0.707)), thisFacing = nx * 0.707 + nz * 0.707;
      if (name !== 'z+' && seen && !doorSeen && Math.abs(thisFacing - camFacing) < 1e-6) { // the door looks away from the camera: the name goes on the wall that looks at it
        box(G, len + 0.1, 1.8, 0.1, C.deep, 0, HH - 1.9, out + 0.02, 0.06);
        const sg2 = new THREE.Mesh(new THREE.PlaneGeometry(len - 1.4, (len - 1.4) / 4.8), new THREE.MeshBasicMaterial({ map: signTex(a.name), toneMapped: false })); sg2.position.set(0, HH - 1.0, out + 0.1); G.add(sg2);
      }
      if (name === 'z+') {
        box(G, 1.7, 3.0, 0.16, C.plum, 0, 0.45, out + 0.1, 0.08, { emissive: C.plum, ei: 0.25 }); box(G, 2.6, 0.22, 1.2, C.lilac2, 0, 3.55, out + 0.6, 0.06); box(G, 2.2, 0.16, 1.0, C.cream, 0, 0, out + 0.75, 0.04); // door, canopy, step
        box(G, HW + 0.7, 1.8, 0.1, C.deep, 0, HH - 1.9, out + 0.02, 0.06);
        const sg = new THREE.Mesh(new THREE.PlaneGeometry(HW - 1.4, (HW - 1.4) / 4.8), new THREE.MeshBasicMaterial({ map: signTex(a.name), toneMapped: false })); sg.position.set(0, HH - 1.0, out + 0.1); G.add(sg); // the name over the door
        const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 8), new THREE.MeshBasicMaterial({ color: RUN[runOf(a)].color, toneMapped: false })); lamp.position.set(HW / 2 - 1.0, HH - 0.6, out + 0.2); G.add(lamp); lamp.userData.stateLamp = true; // the state of the agent
      }
    });
    box(body, HW, 1.4, 0.2, C.lilac, 0, 0, -HD / 2 + 0.1, 0.05); box(body, 0.2, 1.4, HD, C.lilac, -HW / 2 + 0.1, 0, 0, 0.05);
    const pool = new THREE.Mesh(new THREE.PlaneGeometry(7, 5.4), doorPool); pool.rotation.x = -Math.PI / 2; pool.position.set(0, 0.06, HD / 2 + 3.2); pool.renderOrder = 6; body.add(pool);
    const roof = new THREE.Group(); body.add(roof); const style = ROOF[i % ROOF.length];
    if (style === 'gable') { const r = gable(roof, HW, HD, 2.6, C.plum, i % 2 ? 'x' : 'z'); r.position.y = HH; }
    else if (style === 'shed') { const r = box(roof, HW + 1.0, 0.5, HD + 1.0, C.plum, 0, HH + 0.2, 0, 0.1); r.rotation.x = -0.12; box(roof, HW + 0.7, 0.4, 0.5, C.lilac, 0, HH + 0.35, HD / 2 + 0.2, 0.08); }
    else { box(roof, HW + 0.95, 0.18, HD + 0.95, C.plum, 0, HH - 0.02, 0, 0.06, { emissive: C.plum, ei: 0.2 }); box(roof, HW + 0.7, 0.5, HD + 0.7, C.lilac, 0, HH + 0.12, 0, 0.12); }
    const prop = roofProp(roof, PROPS[i % PROPS.length], style === 'gable' ? HH + 2.7 : HH + 0.8);
    const roofMats = []; roof.traverse((o) => { if (o.isMesh) { o.material = o.material.clone(); o.material.transparent = true; roofMats.push([o.material, o.material.opacity]); } });
    const inner = new THREE.Group(); body.add(inner);
    box(inner, 5.4, 0.06, 4.4, C.lilac, 0, 0, 0.4, 0.2);
    box(inner, 3.2, 2.0, 0.12, C.white, 0, 1.6, -HD / 2 + 0.2, 0.06); box(inner, 2.8, 1.6, 0.14, 0xe6c6ee, 0, 1.8, -HD / 2 + 0.22, 0.04); [0.5, 1.0, 1.4].forEach((h, k) => box(inner, 0.4, h, 0.16, k % 2 ? C.plum : C.mid, -0.8 + k * 0.8, 1.9, -HD / 2 + 0.3, 0.04)); // a screen with a chart
    box(inner, 0.8, 3.0, 0.8, C.lilac2, -HW / 2 + 0.9, 0, -HD / 2 + 0.9, 0.08); // a bookcase
    inner.traverse((o) => { if (o.isMesh) o.castShadow = false; });
    const stn = assets.station.clone(true); stn.position.set(0, 0, 0.2); stn.scale.setScalar(1.3); inner.add(stn);
    const rb = makeAgentRobot(assets.robot, a.status, i * 1.7, runOf(a)); rb.position.set(0, 0, -0.52); rb.scale.setScalar(1.4); rb.userData.kind = 'agent'; rb.userData.dept = deptKey; rb.userData.agent = a.key; rb.userData.stationLook = null; inner.add(rb);
    inner.visible = false; inner.traverse((o) => o.layers.set(1));
    const il = new THREE.PointLight(0xffd9f2, 0, 22, 1.5); il.position.set(0, 4.6, 1.0); body.add(il);
    const w = toW(p.x, p.z), topY = (SY + HH + 5.2) * S;
    const b = {
      key, dept: deptKey, agentKey: a.key, village: true, root: hg, body, inner, W: HW * S, D: HD * S, H: HH * S, round: false, sel, robots: [rb], slots: [{ x: 0, z: 0 }],
      pos: new THREE.Vector3(w.x, 0.14, w.z), topY, reach: 8, open: 0, target: 0, away: 0, idx: i, slot, built: true, a,
      setOpen(v) { b.target = v ? 1 : 0; },
      update(dt, t, reduce) {
        const k = reduce ? 1 : Math.min(1, dt * 4.2);
        if (Math.abs(b.target - b.open) > 0.0015) b.open += (b.target - b.open) * k; else b.open = b.target;
        const o = b.open, e = o * o * (3 - 2 * o);
        front.scale.y = Math.max(0.12, 1 - 0.88 * e); il.intensity = NIGHT.n * b.open * 26;
        const f = 1 - Math.min(1, e * 1.2); roofMats.forEach(([m, base]) => { m.opacity = base * f; }); roof.visible = f > 0.02; roof.position.y = e * 2.2;
        const shown = b.open > 0.004 || b.target > 0;
        if (shown !== inner.visible) { inner.visible = shown; inner.traverse((x) => x.layers.set(shown ? 0 : 1)); }
        prop.rotation.y = t * 0.7 + i;
        if (!shown) return;
        rb.visible = !b.away; tickAgentRobot(rb, t);
      },
    };
    hg.traverse((o) => { if (o.userData.kind == null) o.userData.house = b; });
    houses.push(b); flags.push({ b, a, built: true, x: w.x, z: w.z, y: topY });
    b.door = { x: center.x + door.x * S, z: center.z + door.z * S }; b.doorLocal = door; b.dirLocal = dir;
    return b;
  }

  function buildSite(a, i, slot) { // a planned agent: a plot with scaffolding and a board «скоро»
    const { p, yaw, dir, door } = frame(slot), sg = new THREE.Group(); sg.position.set(p.x, SY, p.z); sg.rotation.y = yaw; g.add(sg);
    const pad = new THREE.Mesh(new RoundedBoxGeometry(HW + 3.6, 0.28, HD + 3.8, 2, 0.12), mat(0xf3eafa)); pad.position.y = -0.14; pad.receiveShadow = true; sg.add(pad);
    const edge = new THREE.Mesh(new RoundedBoxGeometry(HW + 3.9, 0.08, HD + 4.1, 2, 0.04), mat(C.plan, { emissive: C.plan, ei: 0.25 })); edge.position.y = -0.3; sg.add(edge);
    box(sg, HW, 0.3, HD, C.lilac2, 0, 0, 0, 0.05); box(sg, HW, 1.6, 0.4, C.white, 0, 0.3, -HD / 2 + 0.2, 0.06); box(sg, 0.4, 1.6, HD, C.white, -HW / 2 + 0.2, 0.3, 0, 0.06);
    const px = [-HW / 2, HW / 2], pz = [-HD / 2, HD / 2];
    px.forEach((x) => pz.forEach((z) => cyl(sg, 0.14, 0.14, HH, C.plan, x, 0.3, z, {}, 8)));
    [2.2, 4.2, HH].forEach((y) => { px.forEach((x) => box(sg, 0.14, 0.14, HD, C.plan, x, y, 0, 0.03)); pz.forEach((z) => box(sg, HW, 0.14, 0.14, C.plan, 0, y, z, 0.03)); });
    const net = new THREE.Mesh(new THREE.PlaneGeometry(HW, 2.4), new THREE.MeshStandardMaterial({ color: 0xcfd6ff, transparent: true, opacity: 0.38, side: THREE.DoubleSide })); net.position.set(0, 3.4, HD / 2); sg.add(net);
    const board = new THREE.Mesh(new THREE.PlaneGeometry(7.4, 1.6), new THREE.MeshBasicMaterial({ map: canvasTex(512, 112, (c, w, h) => { c.fillStyle = '#eef0ff'; c.fillRect(0, 0, w, h); c.strokeStyle = '#7C8CF8'; c.lineWidth = 6; c.setLineDash([18, 12]); c.strokeRect(6, 6, w - 12, h - 12); c.setLineDash([]); c.fillStyle = '#3b4aa8'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.font = '800 32px Onest, Arial'; const words = a.name.split(' '), mid = Math.ceil(words.length / 2), lines = a.name.length > 16 ? [words.slice(0, mid).join(' '), words.slice(mid).join(' ')] : [a.name]; lines.forEach((ln, k) => c.fillText(ln, w / 2, (lines.length > 1 ? 36 + k * 34 : 48), w - 30)); c.font = '700 19px Onest, Arial'; c.fillStyle = '#7C8CF8'; c.fillText('ЗАПЛАНОВАНО · СКОРО', w / 2, h - 16); }), toneMapped: false })); board.position.set(0, 1.9, HD / 2 + 2.4); sg.add(board);
    cyl(sg, 0.12, 0.12, 2.0, C.plan, -3.5, 0, HD / 2 + 2.4, {}, 8); cyl(sg, 0.12, 0.12, 2.0, C.plan, 3.5, 0, HD / 2 + 2.4, {}, 8);
    const w = toW(p.x, p.z), topY = (SY + HH + 2) * S, s = { a, built: false, x: w.x, z: w.z, y: topY, slot, door, dir, x0: p.x, z0: p.z, th: Math.atan2(door.z, door.x) };
    sites.push(s); flags.push({ b: s, a, built: false, x: w.x, z: w.z, y: topY });
    return s;
  }
  built.forEach((a, i) => buildHouse(a, i, i)); planned.forEach((a, k) => buildSite(a, built.length + k, 6 + k));

  // ---- paths: a spur from every door to the ring, the entrance walk from the gate
  const ringAngle = (h) => Math.atan2(h.doorLocal.z, h.doorLocal.x);
  function spurFor(a, d) { // door -> sidewalk: it leaves the door straight out and meets the sidewalk at a right angle
    const th = Math.atan2(a.z, a.x), rEnd = RS + SW / 2 - 0.3, end = { x: Math.cos(th) * rEnd, z: Math.sin(th) * rEnd };
    const dist = Math.hypot(end.x - a.x, end.z - a.z), L1 = Math.min(9, dist * 0.38), L2 = Math.min(9, dist * 0.38);
    const V = (x, z) => new THREE.Vector3(x, 0, z);
    return new THREE.CubicBezierCurve3(V(a.x, a.z), V(a.x + d.x * L1, a.z + d.z * L1), V(end.x + Math.cos(th) * L2, end.z + Math.sin(th) * L2), V(end.x, end.z)).getSpacedPoints(18).map((q) => ({ x: q.x, z: q.z }));
  }
  houses.forEach((h) => { h.spur = spurFor(h.doorLocal, h.dirLocal); ribbon(h.spur, 2.6, H.foot, stoneMat); });
  sites.forEach((st) => { st.spur = spurFor(st.door, st.dir); ribbon(st.spur, 2.6, H.foot, stoneMat); });
  const GATE_Z = -(HZ - 2.6); // the gate: on the north edge, towards the main building
  function arc(t0, t1, r) { let d = t1 - t0; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; const n = Math.max(2, Math.ceil(Math.abs(d) * r / 1.2)); return Array.from({ length: n + 1 }, (_, k) => ({ x: Math.cos(t0 + d * k / n) * r, z: Math.sin(t0 + d * k / n) * r })); }
  const polyLen = (P) => { let L = 0; const cum = [0]; for (let i = 1; i < P.length; i++) { L += Math.hypot(P[i].x - P[i - 1].x, P[i].z - P[i - 1].z); cum.push(L); } return { P, L, cum }; };
  const polyAt = (p, s) => { s = Math.max(0, Math.min(p.L, s)); let i = 1; while (i < p.P.length - 1 && p.cum[i] < s) i++; const a = p.P[i - 1], b = p.P[i], l = p.cum[i] - p.cum[i - 1] || 1, f = (s - p.cum[i - 1]) / l, dx = b.x - a.x, dz = b.z - a.z, n = Math.hypot(dx, dz) || 1; return { x: a.x + dx * f, z: a.z + dz * f, dx: dx / n, dz: dz / n }; };
  const routeBetween = (a, b) => [...a.spur, ...arc(ringAngle(a), ringAngle(b), RS), ...b.spur.slice().reverse()]; // the agents keep to the sidewalk and the footpaths

  // ---- the entrance road from the street z=48 through the gate to the ring road, two bays with parked cars at the gate
  const asphaltMat = mat(ASPHALT, { rough: 0.95 }); asphaltMat.side = THREE.DoubleSide;
  const edge = (48 + 2.2 - center.z) / S, ringTop = -(RP + RW / 2 - 0.6); // the street edge, the outer edge of the ring road, in local z
  { const len = ringTop - edge, zc = (edge + ringTop) / 2;
    const road = new THREE.Mesh(new THREE.PlaneGeometry(RW, Math.abs(len)), asphaltMat); road.rotation.x = -Math.PI / 2; road.position.set(0, H.road, zc); road.receiveShadow = true; g.add(road);
    { const kEnd = -(RS + SW / 2 + 0.3), klen = Math.abs(kEnd - edge), kzc = (edge + kEnd) / 2; [-RW / 2 - 0.22, RW / 2 + 0.22].forEach((x) => box(g, 0.45, 0.2, klen, C.white, x, G, kzc, 0.03)); }
    for (let z = edge + 2; z < ringTop - 1; z += 4.6) { if (Math.abs(z + RS) < SW + 1) continue; box(g, 0.22, 0.03, 1.8, C.white, 0, H.road + 0.03, z, 0.02); }
    for (let k = -3; k <= 3; k++) box(g, 0.6, 0.03, SW, C.white, k * 1.15, H.road + 0.03, -RS - SW / 2, 0.02); // a zebra where the sidewalk crosses the entrance road
    [-6.9, 6.9].forEach((x) => { box(g, 1.4, 6.2, 1.4, C.white, x, G, GATE_Z, 0.2); box(g, 1.7, 0.4, 1.7, C.plum, x, G + 6.2, GATE_Z, 0.1, { emissive: C.plum, ei: 0.25 }); });
    box(g, 16, 1.8, 1.0, C.deep, 0, G + 5.1, GATE_Z, 0.2);
    const gtex = canvasTex(768, 86, (c, w, h) => { const gr = c.createLinearGradient(0, 0, w, 0); gr.addColorStop(0, '#b544b5'); gr.addColorStop(1, '#661466'); c.fillStyle = gr; c.fillRect(0, 0, w, h); c.fillStyle = '#fff'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.font = '800 52px Onest, Arial'; c.fillText('СОЦІАЛЬНИЙ РАЙОН', w / 2, h / 2 + 2); });
    [1, -1].forEach((sd) => { const gs = new THREE.Mesh(new THREE.PlaneGeometry(14.8, 1.62), new THREE.MeshBasicMaterial({ map: gtex, toneMapped: false })); gs.position.set(0, G + 6.0, GATE_Z + sd * 0.52); if (sd < 0) gs.rotation.y = Math.PI; g.add(gs); });
    [-1, 1].forEach((sd, k) => { const x = sd * 13.5, bz = GATE_Z + 8; const bay = new THREE.Mesh(new THREE.PlaneGeometry(5.4, 8.4), asphaltMat); bay.rotation.x = -Math.PI / 2; bay.position.set(x, H.road, bz); g.add(bay);
      const c = makeCartGlb(assets.cart, [C.mid, C.plum][k], assets.logo); c.scale.setScalar(1.6 / S); c.position.set(x, H.road + 0.01, bz); c.rotation.y = Math.PI / 2 + (k ? Math.PI : 0); g.add(c); }); }

  // ---- scenery
  const inPathNear = () => false;
  const frame0 = (h) => ({ x: (h.pos.x - center.x) / S, z: (h.pos.z - center.z) / S });
  const RIN = RS + SW / 2 + 2.6; // everything inside this radius belongs to the plaza, the road and the sidewalk
  const inPath = (x, z, m = 0) => { const r = Math.hypot(x, z); if (r < RIN + m) return true; if (Math.abs(x) < RW / 2 + 3.4 + m && z < 0) return true; if (Math.hypot(x, z - (GATE_Z + 8)) < 15 + m) return true; return houses.some((h) => Math.hypot(x - frame0(h).x, z - frame0(h).z) < 11 + m || h.spur.some((q) => Math.hypot(q.x - x, q.z - z) < 3.4 + m)) || sites.some((st) => Math.hypot(x - st.x0, z - st.z0) < 11 + m); };
  const onSurface = (x, z, m = 0) => { const r = Math.hypot(x, z); if (r > RP - RW / 2 - 0.8 && r < RS + SW / 2 + 0.3 + m) return true; if (Math.abs(x) < RW / 2 + 0.9 + m && z < -RP && z > edge - 1) return true; if (Math.hypot(x, z - (GATE_Z + 8)) < 6.5 + m && Math.abs(x) > 9) return false; return houses.some((h) => h.spur.some((q) => Math.hypot(q.x - x, q.z - z) < 1.8 + m)) || sites.some((st) => st.spur.some((q) => Math.hypot(q.x - x, q.z - z) < 1.8 + m)); };
  const inRect = (x, z, m) => Math.abs(x) < HX - m && Math.abs(z) < HZ - m;
  const taken = [];
  const freeSpot = (r) => { for (let t = 0; t < 800; t++) { const x = (rng() - 0.5) * 2 * (HX - 8), z = (rng() - 0.5) * 2 * (HZ - 8); if (inRect(x, z, r + 2) && !inPath(x, z, r * 0.45) && !taken.some(([tx, tz, tr]) => Math.hypot(x - tx, z - tz) < tr + r + 3)) { taken.push([x, z, r]); return { x, z }; } } return null; };
  // decorative elements: a pond with lily pads, a gazebo, a sculpture beside the entrance road
  { const sp = freeSpot(9); if (sp) {
      const pg = new THREE.Group(); pg.position.set(sp.x, G, sp.z); g.add(pg);
      const ring = new THREE.Mesh(new THREE.CylinderGeometry(8.4, 8.6, 0.4, 48), mat(C.cream)); ring.position.y = 0.1; ring.receiveShadow = true; pg.add(ring);
      const water = new THREE.Mesh(new THREE.CircleGeometry(7.4, 48), new THREE.MeshStandardMaterial({ color: 0xa9bef2, roughness: 0.16, metalness: 0.05, emissive: 0x6f86d8, emissiveIntensity: 0.14 })); water.rotation.x = -Math.PI / 2; water.position.y = 0.32; pg.add(water);
      [[-2.5, 1.5, 1.0], [2.8, -1.2, 0.8], [0.6, 3.2, 0.7], [-1.0, -3.0, 0.9]].forEach(([x, z, r], k) => { const lp = new THREE.Mesh(new THREE.CircleGeometry(r, 18), new THREE.MeshStandardMaterial({ color: k % 2 ? 0xf3b6e4 : 0xd9a6df, roughness: 0.6 })); lp.rotation.x = -Math.PI / 2; lp.position.set(x, 0.34, z); pg.add(lp); }); } }
  { const sp = freeSpot(7.5); if (sp) {
      const gz = new THREE.Group(); gz.position.set(sp.x, G, sp.z); g.add(gz);
      cyl(gz, 5.2, 5.4, 0.35, C.cream, 0, 0, 0, {}, 40); cyl(gz, 4.6, 4.6, 0.1, C.lilac2, 0, 0.35, 0, {}, 40);
      for (let k = 0; k < 6; k++) { const th = k * Math.PI / 3; cyl(gz, 0.22, 0.22, 4.2, C.white, Math.cos(th) * 3.9, 0.4, Math.sin(th) * 3.9, {}, 10); }
      const roof = new THREE.Mesh(new THREE.ConeGeometry(5.6, 2.2, 6), mat(C.plum, { rough: 0.6 })); roof.position.y = 5.7; roof.castShadow = true; gz.add(roof); cyl(gz, 0.15, 0.15, 0.9, C.deep, 0, 6.6, 0, {}, 8);
      box(gz, 1.8, 0.3, 0.6, C.cream, 0, 0.35, 2.6, 0.1); box(gz, 0.6, 0.3, 1.8, C.cream, 2.6, 0.35, 0, 0.1); } }
  { const sx = 13.5, sz = GATE_Z + 21; taken.push([sx, sz, 5]);
    const sc = new THREE.Group(); sc.position.set(sx, G, sz); g.add(sc);
    cyl(sc, 2.0, 2.4, 1.2, C.cream, 0, 0, 0, {}, 24); cyl(sc, 1.5, 1.5, 0.3, C.plum, 0, 1.2, 0, { emissive: C.plum, ei: 0.25 }, 24);
    const hs = new THREE.Shape(); hs.moveTo(0, -1); hs.bezierCurveTo(-2.2, 0.6, -1.4, 2.0, 0, 1.0); hs.bezierCurveTo(1.4, 2.0, 2.2, 0.6, 0, -1);
    const hg = new THREE.ExtrudeGeometry(hs, { depth: 0.8, bevelEnabled: true, bevelSize: 0.15, bevelThickness: 0.15, bevelSegments: 3 }); hg.translate(0, 0, -0.4);
    const heart = new THREE.Mesh(hg, mat(C.plum, { rough: 0.4, emissive: C.plum, ei: 0.2 })); heart.position.y = 3.2; heart.scale.setScalar(1.15); heart.castShadow = true; heart.rotation.y = -0.5; sc.add(heart); }
  const trees = { tree_round: [], tree_cone: [], tree_blossom: [], bush: [] }, kinds = Object.keys(trees), put = (k, x, z, sc) => trees[k].push([center.x + x * S, center.z + z * S, sc * S * 1.35, G * S, rng() * 6]);
  for (let z = GATE_Z + 6; z < -(RIN + 1); z += 7.5) { put('tree_blossom', -RW / 2 - 3.6, z, 0.95); put('tree_blossom', RW / 2 + 3.6, z + 3.7, 0.95); } // an avenue of blossom trees along the entrance road
  for (let t = 0, n = 0; t < 9000 && n < 120; t++) { const x = (rng() - 0.5) * 2 * (HX - 4), z = (rng() - 0.5) * 2 * (HZ - 4); if (!inRect(x, z, 3) || inPath(x, z) || taken.some(([tx, tz, tr]) => Math.hypot(x - tx, z - tz) < tr + 1)) continue; const k = kinds[Math.floor(rng() * kinds.length)]; put(k, x, z, k === 'bush' ? 0.8 + rng() * 0.5 : 0.85 + rng() * 0.55); n++; }
  // a hedge of bushes outside the sidewalk (open at the footpaths and at the entrance)
  const angDiff = (u, v) => Math.abs(Math.atan2(Math.sin(u - v), Math.cos(u - v)));
  for (let a = 0; a < Math.PI * 2; a += 0.1) { const nearSpur = houses.some((h) => angDiff(ringAngle(h), a) < 0.17) || sites.some((st) => angDiff(st.th, a) < 0.17) || angDiff(-Math.PI / 2, a) < 0.3; if (!nearSpur) put('bush', Math.cos(a) * (RS + SW / 2 + 3.0), Math.sin(a) * (RS + SW / 2 + 3.0), 0.55); }
  kinds.forEach((k) => { if (trees[k].length) instancedProto(world, assets, k, trees[k]); });
  const benches = [], face = (x, z) => Math.atan2(-x, -z); // a bench faces the middle of the plaza (the same turn as the benches of the parks)
  for (let k = 0; k < 14; k++) { const th = k * Math.PI / 7 + 0.17, r = RS + SW / 2 + 1.5, x = Math.cos(th) * r, z = Math.sin(th) * r; if (!onSurface(x, z, 0.4) && !inPathNear(x, z)) benches.push([center.x + x * S, center.z + z * S, S * 1.2, G * S, face(x, z)]); }
  houses.forEach((h) => { const i = Math.floor(h.spur.length * 0.55), q = h.spur[i], q2 = h.spur[i + 1], tx = q2.x - q.x, tz = q2.z - q.z, l = Math.hypot(tx, tz) || 1, nx = -tz / l, nz = tx / l; [1, -1].forEach((sd, k) => { if (k) return; const x = q.x + nx * sd * 2.6, z = q.z + nz * sd * 2.6; if (!onSurface(x, z, 0.3)) benches.push([center.x + x * S, center.z + z * S, S * 1.2, G * S, Math.atan2(nx * sd, nz * sd)]); }); }); // a bench beside every footpath, facing it
  instancedProto(world, assets, 'bench', benches);
  const beds = []; for (let k = 0; k < 6; k++) { const th = k * Math.PI / 3 + 0.5, r = 6.6; beds.push([center.x + Math.cos(th) * r * S, center.z + Math.sin(th) * r * S, S * 1.1, (G + 0.15) * S]); }
  for (let k = 0; k < 14; k++) { const sp = freeSpot(2.5); if (sp) beds.push([center.x + sp.x * S, center.z + sp.z * S, S * 1.2, G * S]); }
  instancedProto(world, assets, 'flower_bed', beds);
  const lamps = [], addLamp = (x, z) => { if (!onSurface(x, z, 0.5) && Math.abs(x) < HX - 1.5 && Math.abs(z) < HZ - 1.5) lamps.push([x, z]); };
  for (let k = 0; k < 16; k++) { const th = k * Math.PI / 8 + 0.1; addLamp(Math.cos(th) * (RS + SW / 2 + 1.5), Math.sin(th) * (RS + SW / 2 + 1.5)); }
  for (let z = GATE_Z + 6; z < -(RIN - 1); z += 9) { addLamp(RW / 2 + 2.4, z); addLamp(-RW / 2 - 2.4, z + 4.5); }
  houses.forEach((h) => { const d = h.doorLocal, dir = h.dirLocal; addLamp(d.x + dir.z * 4.6 + dir.x * 1.6, d.z - dir.x * 4.6 + dir.z * 1.6); });
  sites.forEach((st) => { addLamp(st.door.x + st.dir.z * 6 + st.dir.x * 2, st.door.z - st.dir.x * 6 + st.dir.z * 2); });
  const lampWorld = lamps.map(([x, z]) => [center.x + x * S, center.z + z * S]);

  // ---- people: the sending agent leaves its house, carries the task round the ring to the next house, goes in; the next one comes out
  const chain = houses, walkers = [];
  if (chain.length > 1) [0, Math.floor(chain.length / 2)].forEach((startEdge, w) => {
    const a = chain[startEdge].a, rb = makeAgentRobot(assets.robot, a.status, 40 + w, runOf(a)); rb.scale.setScalar(1.15); rb.visible = false; g.add(rb);
    const parcel = new THREE.Group(); box(parcel, 0.7, 0.55, 0.7, C.plum, 0, 0, 0, 0.1, { emissive: C.plum, ei: 0.25 }); box(parcel, 0.74, 0.12, 0.2, C.cream, 0, 0.28, 0, 0.03); parcel.position.set(0, 1.55, 0.4); rb.add(parcel);
    walkers.push({ rb, edge: startEdge, s: 0, state: 'wait', t: 0.8 + w * 0.4, route: null, parcel });
  });
  function startEdge(w) { const a = chain[w.edge % chain.length], b = chain[(w.edge + 1) % chain.length]; w.route = polyLen(routeBetween(a, b)); w.s = 0; w.state = 'walk'; w.from = a; w.to = b; a.away++; w.rb.visible = true; }
  function drive(obj, p, dt) { const target = Math.atan2(p.dx, p.dz); let d = target - (obj.userData.ang ?? target); while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; obj.userData.ang = (obj.userData.ang ?? target) + d * Math.min(1, dt * 9); obj.rotation.y = obj.userData.ang; }
  function tick(dt, t) {
    walkers.forEach((w) => {
      if (w.state === 'wait') { w.t -= dt; if (w.t <= 0) startEdge(w); }
      else {
        w.s += 7.5 * dt; const p = polyAt(w.route, w.s); w.rb.position.set(p.x, H.side + 0.04 + Math.abs(Math.sin(w.s * 2.0)) * 0.07, p.z); drive(w.rb, p, dt); w.rb.rotation.z = Math.sin(w.s * 2.0) * 0.05;
        const near = Math.min(1, Math.min(w.s, w.route.L - w.s) / 2.6); w.rb.scale.setScalar(1.15 * (0.25 + 0.75 * near)); // it shrinks into the doorway on both ends
        if (w.s >= w.route.L - 0.02) { w.rb.visible = false; w.from.away--; w.state = 'wait'; w.t = 1.6; w.edge = (w.edge + 1) % chain.length; }
      }
      w.parcel.position.y = 1.55 + Math.sin(t * 5) * 0.04;
    });
  }
  // the tour of the vans: from the street z=48 through the gate down to the ring road, one lap (anticlockwise as seen on the map, keeping to the outer lane), and out again
  const excursion = (() => {
    const RC = RP + 1.8, xin = -2.5, xout = 2.5, P = [], w = (x, z) => P.push({ x: center.x + x * S, z: center.z + z * S }), zs = (48 + 1.0 - center.z) / S;
    const zi = -Math.sqrt(RC * RC - xin * xin), zo = -Math.sqrt(RC * RC - xout * xout);
    w(-7, zs); w(-3.6, zs + 0.8); w(xin, zs + 3); w(xin, zi - 10); w(xin, zi - 4);
    const a0 = -Math.PI / 2 - Math.asin(Math.abs(xin) / RC), a1 = -Math.PI / 2 + Math.asin(Math.abs(xout) / RC) - Math.PI * 2;
    for (let k = 0; k <= 48; k++) { const th = a0 + (a1 - a0) * k / 48; w(Math.cos(th) * RC, Math.sin(th) * RC); }
    w(xout, zo - 4); w(xout, zo - 10); w(xout, zs + 3); w(3.6, zs + 0.8); w(7, zs);
    return P;
  })();
  return { group: g, excursion, houses, sites, flags, tick, contains, lamps: lampWorld, taken, center, S, gate: { x: center.x, z: 48 }, halfX: rect.w / 2, plaqueY: 34 };
}
