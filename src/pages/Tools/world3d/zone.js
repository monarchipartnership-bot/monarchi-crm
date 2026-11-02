// A zone of the Client district (decision 35): the back of the city is cut into four zones, one per quarter (research, creative, ads, reports). A zone is one
// plate of its own (it replaces the blocks and the streets of its area). A car road runs into it from the street at the river side and leaves it at the far end
// (no roundabout: an exit gate), the houses of the agents (one house per agent, named like the agent) stand along the road with room between them for the vans.
// Every zone has its own shape of the road: straight with the houses staggered, an S-bend, a dogleg, an arc.
// Built in a local frame (the centre of the plate is the origin, z grows towards the river) and placed on the map scaled by S.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { C, box, mat, canvasTex } from './models.js';
import { makeCartGlb } from './assets.js';
import { instancedProto } from './park.js';
import { makeHouse, makeSite } from './houses.js';
import { HD } from './village.js';

const LAWN = 0xe3d3f1, ASPHALT = 0xd0b6dc, STONE = 0xfcf7fd;
const G = 0.43; // the ground level of a zone in its own frame
const RW = 6, SW = 2.6; // the road for cars and the sidewalk beside it (local units)
const SIDE = 13; // the distance of the house centre from the road axis
const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
// the shape of the road: its offset from the middle of the plate at t (0 at the street, 1 at the exit)
const SHAPES = {
  comb: () => 0,
  sbend: (t) => 10 * Math.sin(t * Math.PI * 2),
  zig: (t) => 13 * smooth(0.36, 0.58, t),
  arc: (t) => 15 * Math.sin(t * Math.PI),
};
const LAYOUT = { comb: { pairs: false, step: 27 }, sbend: { pairs: true }, zig: { pairs: true }, arc: { pairs: false, step: 32 } };

// agents: [{ key, name, status }]; deptKey: the department; center: world {x, z}; rect: { w, d } the plate in world units; streetZ: the z of the street at the river side
export function buildZone({ world, assets, agents, deptKey, label, center, S, rng, rect, streetZ, style = 'comb' }) {
  const g = new THREE.Group(); g.position.set(center.x, 0, center.z); g.scale.setScalar(S); world.add(g);
  const toW = (x, z) => ({ x: center.x + x * S, z: center.z + z * S });
  const HX = rect.w / 2 / S, HZ = rect.d / 2 / S;
  const built = agents.filter((a) => a.status !== 'not_started'), planned = agents.filter((a) => a.status === 'not_started');
  const H = { side: G + 0.06, road: G + 0.14, paint: G + 0.18 };
  const asphalt = new THREE.MeshStandardMaterial({ color: ASPHALT, roughness: 0.95 });
  const decal = (color, n = 1) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, polygonOffset: true, polygonOffsetFactor: -n, polygonOffsetUnits: -n * 2 });
  const stoneM = new THREE.MeshStandardMaterial({ color: STONE, roughness: 0.9, side: THREE.DoubleSide });

  // ---- the plate: the kerb of any block, only as big as the whole zone, and a lawn on it
  { const plate = new THREE.Mesh(new RoundedBoxGeometry(rect.w, 0.2, rect.d, 3, 0.5), mat(0xfdf8fe, { rough: 0.9 })); plate.position.set(center.x, 0.04, center.z); plate.receiveShadow = true; world.add(plate);
    const lawn = new THREE.Mesh(new RoundedBoxGeometry(rect.w - 1.2, 0.12, rect.d - 1.2, 3, 0.4), mat(LAWN, { rough: 0.95 })); lawn.position.set(center.x, 0.2, center.z); lawn.receiveShadow = true; world.add(lawn); }

  // ---- the road line
  const edgeZ = (streetZ - center.z) / S, northZ = -HZ; // the street at the river side and the far edge of the plate (local z)
  const shape = SHAPES[style] || SHAPES.comb, lay = LAYOUT[style] || LAYOUT.comb;
  const tOf = (z) => (edgeZ - z) / (edgeZ - northZ);
  const xAt = (z) => shape(Math.max(0, Math.min(1, tOf(z))));
  const dxdz = (z) => xAt(z + 0.5) - xAt(z - 0.5); // the slope of the road at z
  const roadZ0 = edgeZ + 3, roadZ1 = northZ - 9; // the road is a little longer than the plate on both ends: it joins the street and leaves for the outskirts
  const samples = []; for (let z = roadZ0; z >= roadZ1 - 1e-6; z -= 2) samples.push({ x: xAt(z), z });
  function ribbon(off, w, y, material) {
    const pos = [], idx = [];
    samples.forEach((q, k) => { const a = samples[Math.max(0, k - 1)], b = samples[Math.min(samples.length - 1, k + 1)]; let tx = b.x - a.x, tz = b.z - a.z; const l = Math.hypot(tx, tz) || 1; tx /= l; tz /= l; const nx = -tz, nz = tx; pos.push(q.x + nx * (off - w / 2), y, q.z + nz * (off - w / 2), q.x + nx * (off + w / 2), y, q.z + nz * (off + w / 2)); if (k) { const v = k * 2; idx.push(v - 2, v - 1, v, v - 1, v + 1, v); } });
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setIndex(idx); geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, material); m.receiveShadow = true; g.add(m); return m;
  }
  ribbon(0, RW, H.road, new THREE.MeshStandardMaterial({ color: ASPHALT, roughness: 0.95, side: THREE.DoubleSide }));
  [-1, 1].forEach((sd) => { ribbon(sd * (RW / 2 + SW / 2 + 0.2), SW, H.side, stoneM); ribbon(sd * (RW / 2 + 0.2), 0.4, H.road + 0.01, decal(0xffffff, 2)); });
  { const dm = new THREE.InstancedMesh(new THREE.BoxGeometry(0.22, 0.03, 1.8), decal(0xffffff, 3), 80), o = new THREE.Object3D(); let n = 0;
    for (let z = edgeZ - 2; z > roadZ1 + 2 && n < 80; z -= 4.6) { o.position.set(xAt(z), H.paint, z); o.rotation.set(0, Math.atan2(dxdz(z), 1), 0); o.updateMatrix(); dm.setMatrixAt(n++, o.matrix); } dm.count = n; g.add(dm); }

  // ---- the gates: «in» at the street, «out» at the far end
  const gate = (z, text, sign) => {
    const x = xAt(z), w = RW + 2 * SW + 1;
    [-1, 1].forEach((sd) => { box(g, 1.2, 5.4, 1.2, C.white, x + sd * (w / 2 + 0.6), G, z, 0.2); box(g, 1.5, 0.4, 1.5, C.plum, x + sd * (w / 2 + 0.6), G + 5.4, z, 0.1, { emissive: C.plum, ei: 0.25 }); });
    box(g, w + 2.4, 1.5, 0.9, C.deep, x, G + 4.4, z, 0.2);
    const tex = canvasTex(768, 90, (c, cw, ch) => { const gr = c.createLinearGradient(0, 0, cw, 0); gr.addColorStop(0, '#b544b5'); gr.addColorStop(1, '#661466'); c.fillStyle = gr; c.fillRect(0, 0, cw, ch); c.fillStyle = '#fff'; c.textAlign = 'center'; c.textBaseline = 'middle'; let size = 50; c.font = `800 ${size}px Onest, Arial`; while (c.measureText(text).width > cw - 40 && size > 22) { size -= 2; c.font = `800 ${size}px Onest, Arial`; } c.fillText(text, cw / 2, ch / 2 + 2); });
    [1, -1].forEach((sd) => { const gs = new THREE.Mesh(new THREE.PlaneGeometry(w + 1.4, 1.28), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false })); gs.position.set(x, G + 4.4, z + sd * 0.47); if (sd < 0) gs.rotation.y = Math.PI; g.add(gs); });
  };
  gate(edgeZ - 4, label.toUpperCase());
  gate(northZ + 4, 'ВИЇЗД');

  // ---- the houses along the road: the doors look at it; built agents first (from the street), planned ones after them
  const houses = [], sites = [], flags = [];
  const ctx = { g, assets, deptKey, SY: G, S, toW, houses, sites, flags };
  const N = built.length + planned.length, zA = edgeZ - 24, zB = northZ + 20; // the first and the last row of houses
  const rows = lay.pairs ? Math.ceil(N / 2) : N, step = lay.pairs ? (rows > 1 ? (zA - zB) / (rows - 1) : 0) : Math.min(lay.step, rows > 1 ? (zA - zB) / (rows - 1) : 0);
  function frame(slot) {
    const side = slot % 2 ? 1 : -1, k = lay.pairs ? Math.floor(slot / 2) : slot, z = zA - k * step + (!lay.pairs && rows > 1 ? 0 : 0);
    const off = SIDE + (lay.pairs ? 0 : (k % 2 ? 2 : -1.5)), x = xAt(z) + (lay.pairs ? side : (k % 2 ? 1 : -1)) * off;
    const faceSide = Math.sign(x - xAt(z)) || 1, dir = new THREE.Vector3(-faceSide, 0, 0), yaw = Math.atan2(dir.x, dir.z) + (rng() - 0.5) * 0.06;
    return { p: { x, z }, yaw, dir, door: { x: x + dir.x * (HD / 2 + 1.0), z }, faceSide };
  }
  const placed = [];
  built.forEach((a, i) => { const fr = frame(i); placed.push(fr); makeHouse(ctx, a, i, i, fr); });
  planned.forEach((a, k) => { const fr = frame(built.length + k); placed.push(fr); makeSite(ctx, a, built.length + k, built.length + k, fr); });
  // the drives: asphalt from the door to the road, a short stub for a van
  placed.forEach((fr) => { const rx = xAt(fr.p.z) - fr.faceSide * (RW / 2 + 0.2), x0 = fr.door.x, len = Math.abs(rx - x0), m = new THREE.Mesh(new THREE.PlaneGeometry(len, 3.2), asphalt); m.rotation.x = -Math.PI / 2; m.position.set((x0 + rx) / 2, H.road - 0.01, fr.p.z); m.receiveShadow = true; g.add(m); });

  // ---- scenery
  const taken = [];
  const nearRoad = (x, z, m = 0) => samples.some((q) => Math.hypot(q.x - x, q.z - z) < RW / 2 + SW + 2.4 + m);
  const clear = (x, z, m = 0) => !nearRoad(x, z, m) && !placed.some((fr) => Math.hypot(x - fr.p.x, z - fr.p.z) < 11 + m);
  const free = (r) => { for (let t = 0; t < 800; t++) { const x = (rng() - 0.5) * 2 * (HX - 6), z = (rng() - 0.5) * 2 * (HZ - 6); if (clear(x, z, r * 0.4) && !taken.some(([tx, tz, tr]) => Math.hypot(x - tx, z - tz) < tr + r + 2)) { taken.push([x, z, r]); return { x, z }; } } return null; };
  const pond = (r) => { const sp = free(r + 1); if (!sp) return; const pg = new THREE.Group(); pg.position.set(sp.x, G, sp.z); g.add(pg);
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(r, r + 0.2, 0.4, 40), mat(C.cream)); ring.position.y = 0.1; pg.add(ring);
    const water = new THREE.Mesh(new THREE.CircleGeometry(r - 0.8, 40), new THREE.MeshStandardMaterial({ color: 0xa9bef2, roughness: 0.16, metalness: 0.05, emissive: 0x6f86d8, emissiveIntensity: 0.14 })); water.rotation.x = -Math.PI / 2; water.position.y = 0.32; pg.add(water);
    [[-1.4, 0.8, 0.8], [1.6, -0.8, 0.6], [0.3, 2.0, 0.55]].forEach(([x, z, rr], k) => { const lp = new THREE.Mesh(new THREE.CircleGeometry(rr, 16), new THREE.MeshStandardMaterial({ color: k % 2 ? 0xf3b6e4 : 0xd9a6df, roughness: 0.6 })); lp.rotation.x = -Math.PI / 2; lp.position.set(x, 0.34, z); pg.add(lp); }); };
  const plaza = (r) => { const sp = free(r + 1); if (!sp) return; const f = assets.fountain.getObjectByName('fountain').clone(true); const base = new THREE.Mesh(new THREE.CylinderGeometry(r, r + 0.3, 0.34, 40), [mat(C.cream, { rough: 0.9 }), new THREE.MeshStandardMaterial({ color: 0xe9dcf5, roughness: 0.95 }), mat(C.cream, { rough: 0.9 })]); base.position.set(sp.x, G + 0.03, sp.z); g.add(base); f.position.set(sp.x, G + 0.24, sp.z); f.scale.setScalar(r / 9); g.add(f); };
  if (style === 'comb') { pond(6.5); } else if (style === 'sbend') { plaza(6); pond(5); } else if (style === 'zig') { pond(5.5); plaza(5); } else { pond(7); }
  const trees = { tree_round: [], tree_cone: [], tree_blossom: [], bush: [] }, kinds = Object.keys(trees), put = (k, x, z, sc) => trees[k].push([center.x + x * S, center.z + z * S, sc * S * 1.35, G * S, rng() * 6]);
  for (let z = edgeZ - 8; z > northZ + 6; z -= 8) { put('tree_blossom', xAt(z) - (RW / 2 + SW + 2.4), z, 0.9); put('tree_blossom', xAt(z) + (RW / 2 + SW + 2.4), z - 4, 0.9); } // an avenue along the road
  for (let t = 0, n = 0; t < 4000 && n < 40; t++) { const x = (rng() - 0.5) * 2 * (HX - 4), z = (rng() - 0.5) * 2 * (HZ - 4); if (!clear(x, z) || taken.some(([tx, tz, tr]) => Math.hypot(x - tx, z - tz) < tr + 1)) continue; const k = kinds[Math.floor(rng() * kinds.length)]; put(k, x, z, k === 'bush' ? 0.8 + rng() * 0.5 : 0.85 + rng() * 0.55); n++; }
  kinds.forEach((k) => { if (trees[k].length) instancedProto(world, assets, k, trees[k]); });
  const benches = []; for (let z = edgeZ - 18, k = 0; z > northZ + 12; z -= 24, k++) [-1, 1].forEach((sd) => benches.push([center.x + (xAt(z) + sd * (RW / 2 + SW + 0.6)) * S, center.z + z * S, S * 1.2, G * S, sd > 0 ? Math.PI / 2 : -Math.PI / 2]));
  instancedProto(world, assets, 'bench', benches);
  const beds = []; for (let k = 0; k < 6; k++) { const sp = free(2.5); if (sp) beds.push([center.x + sp.x * S, center.z + sp.z * S, S * 1.2, G * S]); } instancedProto(world, assets, 'flower_bed', beds);
  const lamps = []; for (let z = edgeZ - 10; z > northZ + 4; z -= 11) { lamps.push([xAt(z) + RW / 2 + SW + 0.4, z]); lamps.push([xAt(z - 5.5) - (RW / 2 + SW + 0.4), z - 5.5]); }
  const lampWorld = lamps.filter(([x, z]) => Math.abs(x) < HX - 2 && Math.abs(z) < HZ - 2).map(([x, z]) => [center.x + x * S, center.z + z * S]);

  // ---- vans: in at the street, up the right lane past the houses, out of the exit gate; then they come in again
  const polyLen = (P) => { let L = 0; const cum = [0]; for (let i = 1; i < P.length; i++) { L += Math.hypot(P[i].x - P[i - 1].x, P[i].z - P[i - 1].z); cum.push(L); } return { P, L, cum }; };
  const polyAt = (p, s) => { s = Math.max(0, Math.min(p.L, s)); let i = 1; while (i < p.P.length - 1 && p.cum[i] < s) i++; const a = p.P[i - 1], b = p.P[i], l = p.cum[i] - p.cum[i - 1] || 1, f = (s - p.cum[i - 1]) / l, dx = b.x - a.x, dz = b.z - a.z, n = Math.hypot(dx, dz) || 1; return { x: a.x + dx * f, z: a.z + dz * f, dx: dx / n, dz: dz / n }; };
  const lane = polyLen(samples.map((q) => ({ x: q.x + RW / 4, z: q.z })));
  const vans = [[C.violet, 0], [C.pink, 0.5]].map(([col, ph]) => { const c = makeCartGlb(assets.cart, col, assets.logo); c.scale.setScalar(1.5 / S); g.add(c); return { c, ph }; });
  function tick(dt, t) {
    vans.forEach((k) => {
      const s = (k.ph * lane.L + t * 9 / S * 0.7) % lane.L, p = polyAt(lane, s);
      k.c.position.set(p.x, H.road + 0.01, p.z); k.c.scale.setScalar((1.5 / S) * Math.min(1, Math.min(s, lane.L - s) / 6)); // it appears at the street and disappears at the exit
      const target = -Math.atan2(p.dz, p.dx); k.c.userData.ang = target; k.c.rotation.y = target; k.c.userData.parcel.position.y = k.c.userData.parcel.userData.base + Math.sin(t * 2.4 + k.ph * 9) * 0.03;
    });
  }
  const contains = (wx, wz, m = 0) => Math.abs(wx - center.x) < rect.w / 2 - m && Math.abs(wz - center.z) < rect.d / 2 - m;
  const plaque = new THREE.Vector3(center.x, 14, streetZ - 9);
  return { kind: 'zone', deptKey, group: g, houses, sites, flags, tick, contains, lamps: lampWorld, center, S, rect, gate: { x: center.x, z: streetZ }, label, plaque };
}
