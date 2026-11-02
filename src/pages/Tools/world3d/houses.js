// One house per agent and one building site per planned agent, shared by the village and the zones of the Client district.
// ctx: { g (the group the houses belong to), assets, deptKey, SY (floor level), S (scale of g), toW(x, z) (local → world), houses, sites, flags }
// fr: { p, yaw, dir, door } the frame of the house in the local space of g.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { C, box, cyl, mat, canvasTex } from './models.js';
import { makeAgentRobot, tickAgentRobot } from './assets.js';
import { doorPool, NIGHT } from './night.js';
import { RUN, runOf } from './runstatus.js';
import { HW, HD, HH, ROOF, PROPS, signTex, gable, roofProp } from './village.js';

export function makeHouse(ctx, a, i, slot, fr) {
const { g, assets, deptKey, SY, S, toW, houses, flags } = ctx;
  const { p, yaw, dir, door } = fr, hg = new THREE.Group(); hg.position.set(p.x, SY, p.z); hg.rotation.y = yaw; g.add(hg);
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
  { const dw = toW(door.x, door.z); b.door = { x: dw.x, z: dw.z }; } b.doorLocal = door; b.dirLocal = dir;
  return b;
}


export function makeSite(ctx, a, i, slot, fr) {
const { g, SY, S, toW, sites, flags } = ctx; // a planned agent: a plot with scaffolding and a board «скоро»
  const { p, yaw, dir, door } = fr, sg = new THREE.Group(); sg.position.set(p.x, SY, p.z); sg.rotation.y = yaw; g.add(sg);
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
