// A zone of the Client district (decision 35): the back of the city is cut into four zones, one per quarter (research, creative, ads, reports). A zone is one
// plate of its own (it replaces the blocks and the streets of its area), a car road runs into it from the street at the river side, along it stand the houses
// of the agents (one house per agent, named like the agent) and the road ends in a roundabout with a plaza. Vans carry the tasks along the road.
// Built in a local frame (the centre of the plate is the origin, z grows towards the river) and placed on the map scaled by S.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { C, box, cyl, mat, canvasTex } from './models.js';
import { makeCartGlb } from './assets.js';
import { instancedProto } from './park.js';
import { makeHouse, makeSite } from './houses.js';
import { HD } from './village.js';

const LAWN = 0xe3d3f1, ASPHALT = 0xd0b6dc, STONE = 0xfcf7fd;
const G = 0.43; // the ground level of a zone in its own frame
const RW = 6, SW = 2.6; // the spine road for cars and the sidewalk beside it (local units)
const ROW = 22; // the distance between the houses along the road
const SIDE = 12.5; // the distance of the house centre from the road axis

// agents: [{ key, name, status }]; deptKey: the department; center: world {x, z}; rect: { w, d } the plate in world units; streetZ: the z of the street at the river side
export function buildZone({ world, assets, agents, deptKey, label, center, S, rng, rect, streetZ }) {
  const g = new THREE.Group(); g.position.set(center.x, 0, center.z); g.scale.setScalar(S); world.add(g);
  const toW = (x, z) => ({ x: center.x + x * S, z: center.z + z * S });
  const HX = rect.w / 2 / S, HZ = rect.d / 2 / S;
  const built = agents.filter((a) => a.status !== 'not_started'), planned = agents.filter((a) => a.status === 'not_started');
  const H = { side: G + 0.06, road: G + 0.14, paint: G + 0.18 };
  const decal = (color, n = 1) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, polygonOffset: true, polygonOffsetFactor: -n, polygonOffsetUnits: -n * 2 });
  const asphalt = new THREE.MeshStandardMaterial({ color: ASPHALT, roughness: 0.95 });

  // ---- the plate: the kerb of any block, only as big as the whole zone, and a lawn on it
  { const plate = new THREE.Mesh(new RoundedBoxGeometry(rect.w, 0.2, rect.d, 3, 0.5), mat(0xfdf8fe, { rough: 0.9 })); plate.position.set(center.x, 0.04, center.z); plate.receiveShadow = true; world.add(plate);
    const lawn = new THREE.Mesh(new RoundedBoxGeometry(rect.w - 1.2, 0.12, rect.d - 1.2, 3, 0.4), mat(LAWN, { rough: 0.95 })); lawn.position.set(center.x, 0.2, center.z); lawn.receiveShadow = true; world.add(lawn); }
  const contains = (wx, wz, m = 0) => Math.abs(wx - center.x) < rect.w / 2 - m && Math.abs(wz - center.z) < rect.d / 2 - m;

  // ---- the road: from the street up the middle of the zone to the roundabout at the far end
  const TURN = -HZ + 19, RR = 9; // the roundabout: centre z and the radius of the road
  const edgeZ = (streetZ - center.z) / S; // the street at the river side in the local z
  { const len = edgeZ - (TURN + RR), zc = (edgeZ + TURN + RR) / 2;
    const road = new THREE.Mesh(new THREE.PlaneGeometry(RW, len), asphalt); road.rotation.x = -Math.PI / 2; road.position.set(0, H.road, zc); road.receiveShadow = true; g.add(road);
    [-1, 1].forEach((sd) => { const side = new THREE.Mesh(new THREE.PlaneGeometry(SW, len), new THREE.MeshStandardMaterial({ color: STONE, roughness: 0.9 })); side.rotation.x = -Math.PI / 2; side.position.set(sd * (RW / 2 + SW / 2 + 0.2), H.side, zc); side.receiveShadow = true; g.add(side); box(g, 0.4, 0.16, len, C.white, sd * (RW / 2 + 0.2), G - 0.02, zc, 0.03); });
    for (let z = edgeZ - 3; z > TURN + RR + 2; z -= 4.6) box(g, 0.22, 0.03, 1.8, C.white, 0, H.paint, z, 0.02);
    // the roundabout
    const ring = new THREE.Mesh(new THREE.RingGeometry(RR - RW / 2, RR + RW / 2, 64), asphalt); ring.rotation.x = -Math.PI / 2; ring.position.set(0, H.road, TURN); ring.receiveShadow = true; g.add(ring);
    const isl = new THREE.Mesh(new THREE.CylinderGeometry(RR - RW / 2 - 0.5, RR - RW / 2 - 0.5, 0.34, 48), [mat(C.cream, { rough: 0.9 }), new THREE.MeshStandardMaterial({ color: 0xe9dcf5, roughness: 0.95 }), mat(C.cream, { rough: 0.9 })]); isl.position.set(0, G + 0.05, TURN); isl.receiveShadow = true; g.add(isl);
    const kerbO = new THREE.Mesh(new THREE.RingGeometry(RR + RW / 2, RR + RW / 2 + 0.4, 64), decal(0xffffff, 2)); kerbO.rotation.x = -Math.PI / 2; kerbO.position.set(0, H.road + 0.01, TURN); g.add(kerbO);
    const dm = new THREE.InstancedMesh(new THREE.BoxGeometry(1.4, 0.03, 0.2), decal(0xffffff, 3), 22), o = new THREE.Object3D(); for (let k = 0; k < 22; k++) { const th = (k / 22) * Math.PI * 2; o.position.set(Math.cos(th) * RR, H.paint, TURN + Math.sin(th) * RR); o.rotation.set(0, -th - Math.PI / 2, 0); o.updateMatrix(); dm.setMatrixAt(k, o.matrix); } g.add(dm);
    // the plaza of the roundabout: the fountain of the parks
    const f = assets.fountain.getObjectByName('fountain').clone(true); f.position.set(0, G + 0.22, TURN); f.scale.setScalar(0.62); g.add(f);
    // a gateway at the street
    [-1, 1].forEach((sd) => { box(g, 1.2, 5.4, 1.2, C.white, sd * (RW / 2 + SW + 1.2), G, edgeZ - 4, 0.2); box(g, 1.5, 0.4, 1.5, C.plum, sd * (RW / 2 + SW + 1.2), G + 5.4, edgeZ - 4, 0.1, { emissive: C.plum, ei: 0.25 }); });
    box(g, RW + 2 * SW + 4.8, 1.5, 0.9, C.deep, 0, G + 4.4, edgeZ - 4, 0.2);
    const gtex = canvasTex(768, 90, (c, w, h) => { const gr = c.createLinearGradient(0, 0, w, 0); gr.addColorStop(0, '#b544b5'); gr.addColorStop(1, '#661466'); c.fillStyle = gr; c.fillRect(0, 0, w, h); c.fillStyle = '#fff'; c.textAlign = 'center'; c.textBaseline = 'middle'; let size = 50; c.font = `800 ${size}px Onest, Arial`; while (c.measureText(label.toUpperCase()).width > w - 40 && size > 22) { size -= 2; c.font = `800 ${size}px Onest, Arial`; } c.fillText(label.toUpperCase(), w / 2, h / 2 + 2); });
    [1, -1].forEach((sd) => { const gs = new THREE.Mesh(new THREE.PlaneGeometry(RW + 2 * SW + 3.6, 1.28), new THREE.MeshBasicMaterial({ map: gtex, toneMapped: false })); gs.position.set(0, G + 4.4, edgeZ - 4 + sd * 0.47); if (sd < 0) gs.rotation.y = Math.PI; g.add(gs); });
  }

  // ---- the houses along the road: a pair per row, the doors look at the road; built agents first (from the street), planned ones after them
  const houses = [], sites = [], flags = [];
  const ctx = { g, assets, deptKey, SY: G, S, toW, houses, sites, flags };
  const rowZ = (k) => edgeZ - 22 - k * ROW; // the first row stands a little inside from the street
  function frame(slot) {
    const side = slot % 2 ? 1 : -1, k = Math.floor(slot / 2), x = side * SIDE, z = rowZ(k) + (side > 0 ? 3.5 : 0), dir = new THREE.Vector3(-side, 0, 0), yaw = Math.atan2(dir.x, dir.z) + (rng() - 0.5) * 0.06;
    return { p: { x, z }, yaw, dir, door: { x: x + dir.x * (HD / 2 + 1.0), z } };
  }
  const placed = [];
  built.forEach((a, i) => { const fr = frame(i); placed.push(fr); makeHouse(ctx, a, i, i, fr); });
  planned.forEach((a, k) => { const fr = frame(built.length + k); placed.push(fr); makeSite(ctx, a, built.length + k, built.length + k, fr); });
  // the drives: asphalt from the door to the road, a short car stub
  placed.forEach((fr) => { const x0 = fr.door.x, x1 = Math.sign(x0) * (RW / 2), len = Math.abs(x1 - x0), m = new THREE.Mesh(new THREE.PlaneGeometry(len, 3.2), asphalt); m.rotation.x = -Math.PI / 2; m.position.set((x0 + x1) / 2, H.road - 0.01, fr.p.z); m.receiveShadow = true; g.add(m); });

  // ---- scenery: trees on the lawn outside the houses, benches and lamps on the sidewalk, a pond, beds
  const taken = [];
  const clear = (x, z, m = 0) => { if (Math.abs(x) < RW / 2 + SW + 2 + m && z > TURN - RR - 6 - m) return false; if (Math.hypot(x, z - TURN) < RR + RW / 2 + 4 + m) return false; return !placed.some((fr) => Math.hypot(x - fr.p.x, z - fr.p.z) < 11 + m); };
  const free = (r) => { for (let t = 0; t < 600; t++) { const x = (rng() - 0.5) * 2 * (HX - 6), z = (rng() - 0.5) * 2 * (HZ - 6); if (clear(x, z, r * 0.4) && !taken.some(([tx, tz, tr]) => Math.hypot(x - tx, z - tz) < tr + r + 2)) { taken.push([x, z, r]); return { x, z }; } } return null; };
  { const sp = free(7); if (sp) { const pg = new THREE.Group(); pg.position.set(sp.x, G, sp.z); g.add(pg);
      const ring = new THREE.Mesh(new THREE.CylinderGeometry(6.6, 6.8, 0.4, 40), mat(C.cream)); ring.position.y = 0.1; pg.add(ring);
      const water = new THREE.Mesh(new THREE.CircleGeometry(5.8, 40), new THREE.MeshStandardMaterial({ color: 0xa9bef2, roughness: 0.16, metalness: 0.05, emissive: 0x6f86d8, emissiveIntensity: 0.14 })); water.rotation.x = -Math.PI / 2; water.position.y = 0.32; pg.add(water);
      [[-1.8, 1.0, 0.9], [2.0, -1.0, 0.7], [0.4, 2.4, 0.6]].forEach(([x, z, r], k) => { const lp = new THREE.Mesh(new THREE.CircleGeometry(r, 16), new THREE.MeshStandardMaterial({ color: k % 2 ? 0xf3b6e4 : 0xd9a6df, roughness: 0.6 })); lp.rotation.x = -Math.PI / 2; lp.position.set(x, 0.34, z); pg.add(lp); }); } }
  const trees = { tree_round: [], tree_cone: [], tree_blossom: [], bush: [] }, kinds = Object.keys(trees), put = (k, x, z, sc) => trees[k].push([center.x + x * S, center.z + z * S, sc * S * 1.35, G * S, rng() * 6]);
  for (let z = edgeZ - 8; z > TURN + RR + 6; z -= 8) { put('tree_blossom', -(RW / 2 + SW + 2.4), z, 0.9); put('tree_blossom', RW / 2 + SW + 2.4, z - 4, 0.9); } // an avenue along the road
  for (let t = 0, n = 0; t < 4000 && n < 46; t++) { const x = (rng() - 0.5) * 2 * (HX - 4), z = (rng() - 0.5) * 2 * (HZ - 4); if (!clear(x, z) || taken.some(([tx, tz, tr]) => Math.hypot(x - tx, z - tz) < tr + 1)) continue; const k = kinds[Math.floor(rng() * kinds.length)]; put(k, x, z, k === 'bush' ? 0.8 + rng() * 0.5 : 0.85 + rng() * 0.55); n++; }
  kinds.forEach((k) => { if (trees[k].length) instancedProto(world, assets, k, trees[k]); });
  const benches = []; for (let k = 0; k < 4; k++) { const z = edgeZ - 30 - k * 22; [-1, 1].forEach((sd) => benches.push([center.x + sd * (RW / 2 + SW + 0.6) * S, center.z + z * S, S * 1.2, G * S, sd > 0 ? Math.PI / 2 : -Math.PI / 2])); }
  instancedProto(world, assets, 'bench', benches);
  const beds = []; for (let k = 0; k < 6; k++) { const sp = free(2.5); if (sp) beds.push([center.x + sp.x * S, center.z + sp.z * S, S * 1.2, G * S]); } instancedProto(world, assets, 'flower_bed', beds);
  const lamps = []; for (let z = edgeZ - 10; z > TURN + RR + 2; z -= 11) { lamps.push([RW / 2 + SW + 0.4, z]); lamps.push([-(RW / 2 + SW + 0.4), z - 5.5]); } [0.4, 2.1, 3.8, 5.5].forEach((a) => lamps.push([Math.cos(a) * (RR + RW / 2 + 1.2), TURN + Math.sin(a) * (RR + RW / 2 + 1.2)]));
  const lampWorld = lamps.filter(([x, z]) => Math.abs(x) < HX - 2 && Math.abs(z) < HZ - 2).map(([x, z]) => [center.x + x * S, center.z + z * S]);

  // ---- vans on the road: up the right lane, round the roundabout, back down the other lane
  const polyLen = (P) => { let L = 0; const cum = [0]; for (let i = 1; i < P.length; i++) { L += Math.hypot(P[i].x - P[i - 1].x, P[i].z - P[i - 1].z); cum.push(L); } return { P, L, cum }; };
  const polyAt = (p, s) => { s = ((s % p.L) + p.L) % p.L; let i = 1; while (i < p.P.length - 1 && p.cum[i] < s) i++; const a = p.P[i - 1], b = p.P[i], l = p.cum[i] - p.cum[i - 1] || 1, f = (s - p.cum[i - 1]) / l, dx = b.x - a.x, dz = b.z - a.z, n = Math.hypot(dx, dz) || 1; return { x: a.x + dx * f, z: a.z + dz * f, dx: dx / n, dz: dz / n }; };
  const lane = RW / 4, loop = (() => { const P = []; for (let z = edgeZ - 1; z >= TURN + RR; z -= 3) P.push({ x: lane, z }); for (let k = 0; k <= 24; k++) { const th = (k / 24) * Math.PI * 2; P.push({ x: Math.sin(th) * RR, z: TURN + Math.cos(th) * RR }); } for (let z = TURN + RR; z <= edgeZ - 1; z += 3) P.push({ x: -lane, z }); return polyLen(P); })();
  const vans = [[C.violet, 0], [C.pink, 0.5]].map(([col, ph]) => { const c = makeCartGlb(assets.cart, col, assets.logo); c.scale.setScalar(1.5 / S); g.add(c); return { c, ph }; });
  function tick(dt, t) {
    vans.forEach((k) => { const p = polyAt(loop, k.ph * loop.L + t * 8 / S * 0.8); k.c.position.set(p.x, H.road + 0.01, p.z); const target = -Math.atan2(p.dz, p.dx); let d = target - (k.c.userData.ang ?? target); while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; k.c.userData.ang = (k.c.userData.ang ?? target) + d * Math.min(1, dt * 9); k.c.rotation.y = k.c.userData.ang; k.c.userData.parcel.position.y = k.c.userData.parcel.userData.base + Math.sin(t * 2.4 + k.ph * 9) * 0.03; });
  }
  return { kind: 'zone', deptKey, group: g, houses, sites, flags, tick, contains, lamps: lampWorld, center, S, rect, gate: { x: center.x, z: streetZ }, label, plaqueY: 34 };
}
