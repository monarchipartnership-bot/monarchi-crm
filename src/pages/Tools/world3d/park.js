// The two parks: a lawn with mowing stripes, paved paths round and across, a round plaza with a fountain in the middle (models from Blender),
// flower beds, benches, lamps, hedges and trees of several kinds.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { C, box, cyl, mat } from './models.js';
import { onNight, additive, poolTex } from './night.js';

// static props are merged into a few meshes (one per material), so a park with many trees stays cheap
const protos = new Map();
function staticProto(src, name) {
  if (protos.has(name)) return protos.get(name);
  src.updateWorldMatrix(true, true); const inv = new THREE.Matrix4().copy(src.matrixWorld).invert(); const byMat = new Map();
  src.traverse((o) => {
    if (!o.isMesh) return;
    let g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld));
    Object.keys(g.attributes).forEach((k) => { if (k !== 'position' && k !== 'normal') g.deleteAttribute(k); });
    if (!byMat.has(o.material)) byMat.set(o.material, []); byMat.get(o.material).push(g);
  });
  const grp = new THREE.Group();
  byMat.forEach((geos, m) => { const mesh = new THREE.Mesh(mergeGeometries(geos), m); mesh.castShadow = true; mesh.receiveShadow = true; grp.add(mesh); });
  protos.set(name, grp); return grp;
}

export function buildPark(world, c, assets, B, ticks, lamps = []) {
  const Y = 0.26, half = B / 2 - 0.8;
  const place = (name, x, z, ry = 0, s = 1, y = Y) => { const o = staticProto(assets.park.getObjectByName(name), name).clone(true); o.position.set(c.x + x, y, c.z + z); o.rotation.y = ry; o.scale.setScalar(s); world.add(o); return o; };
  // lawn with mowing stripes
  const lawn = new THREE.Mesh(new RoundedBoxGeometry(B - 1.6, 0.14, B - 1.6, 2, 0.4), mat(0xe3d3f1, { rough: 0.95 })); lawn.position.set(c.x, 0.2, c.z); lawn.receiveShadow = true; world.add(lawn);
  const sw = (B - 3.4) / 9; for (let k = 0; k < 9; k += 2) { const s = new THREE.Mesh(new THREE.BoxGeometry(sw, 0.012, B - 3.2), mat(0xecdff8, { rough: 0.95 })); s.position.set(c.x - (B - 3.4) / 2 + sw * (k + 0.5), Y + 0.006, c.z); s.receiveShadow = true; world.add(s); }
  // paths: across both ways, a ring round the plaza and the plaza itself
  const stone = mat(0xfcf7fd, { rough: 0.9 }), edge = mat(0xe6c6ee, { rough: 0.9 });
  const pathZ = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.05, B - 1.6), stone); pathZ.position.set(c.x, Y + 0.0, c.z); pathZ.receiveShadow = true; world.add(pathZ);
  const pathX = new THREE.Mesh(new THREE.BoxGeometry(B - 1.6, 0.05, 2.2), stone); pathX.position.set(c.x, Y + 0.0, c.z); pathX.receiveShadow = true; world.add(pathX);
  const ring = (r0, r1, y, m) => { const r = new THREE.Mesh(new THREE.RingGeometry(r0, r1, 96), m); r.rotation.x = -Math.PI / 2; r.position.set(c.x, y, c.z); r.receiveShadow = true; world.add(r); };
  ring(7.9, 9.9, Y + 0.03, edge); ring(8.1, 9.7, Y + 0.035, stone);
  cyl(world, 6.9, 6.9, 0.05, edge, c.x, Y, c.z, {}, 72); cyl(world, 6.7, 6.7, 0.06, stone, c.x, Y, c.z, {}, 72);
  ring(4.4, 4.5, Y + 0.075, edge); ring(5.5, 5.6, Y + 0.075, edge);
  // the fountain: stone from Blender, the water is made here (flat water, falling sheets, droplets on arcs, ripples), so nothing flickers
  const fs = assets.fountain.getObjectByName('fountain'); const f = fs.clone(true); f.position.set(c.x, Y + 0.06, c.z); f.scale.setScalar(1.0); world.add(f);
  ['WaterSurface', 'WaterBowl2', 'WaterBowl3', 'JetMain', 'JetTop'].concat([...Array(8)].flatMap((_, i) => ['SideJet' + i, 'SideDrop' + i]), ['Ripple1', 'Ripple2', 'Ripple3']).forEach((n) => { const o = f.getObjectByName(n); if (o) o.visible = false; });
  const ph = (c.x * 0.31 + c.z * 0.17);
  const flat = (col) => new THREE.MeshStandardMaterial({ color: col, roughness: 0.25, metalness: 0.05, emissive: 0x6d86e8, emissiveIntensity: 0.12, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const waterMats = []; const disc = (r, y, col) => { const m = new THREE.Mesh(new THREE.CircleGeometry(r, 64), flat(col)); m.material.userData.noBoost = true; waterMats.push(m.material); m.rotation.x = -Math.PI / 2; m.position.y = y; m.receiveShadow = true; f.add(m); return m; };
  disc(3.06, 0.78, 0xa9bcff); disc(1.5, 2.18, 0xbac9ff); disc(0.8, 3.3, 0xc7d3ff);
  onNight((n) => waterMats.forEach((m) => { m.emissiveIntensity = 0.12 + 1.0 * n; })); // the water is lit from below at night
  const fMat = additive(poolTex, 0xa7bcff); onNight((n) => { fMat.opacity = 0.95 * n; });
  { const fg = new THREE.Mesh(new THREE.PlaneGeometry(11, 11), fMat); fg.rotation.x = -Math.PI / 2; fg.position.y = 0.84; fg.renderOrder = 6; f.add(fg); }
  // falling sheets of water over the rims of the bowls
  const streak = (() => { const cv = document.createElement('canvas'); cv.width = 128; cv.height = 256; const g = cv.getContext('2d'); g.clearRect(0, 0, 128, 256); for (let i = 0; i < 46; i++) { g.fillStyle = `rgba(255,255,255,${0.25 + Math.random() * 0.55})`; const x = Math.random() * 128, w = 1 + Math.random() * 2.5, y = Math.random() * 256, h = 40 + Math.random() * 120; g.fillRect(x, y, w, h); } const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t; })();
  const sheetMat = new THREE.MeshBasicMaterial({ map: streak, color: 0xcfe0ff, transparent: true, opacity: 0.75, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
  const sheet = (r, y0, y1) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r + 0.05, y1 - y0, 56, 1, true), sheetMat); m.position.y = (y0 + y1) / 2; m.renderOrder = 3; f.add(m); m.scale.set(1, 1, 1); streak.repeat.set(5, 1); return m; };
  sheet(1.66, 0.8, 2.12); sheet(0.9, 2.2, 3.26);
  // droplets thrown up by the middle spout and by a ring of eight small jets
  const N = 150, drops = new THREE.InstancedMesh(new THREE.SphereGeometry(0.07, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, depthWrite: false, toneMapped: false }), N); drops.renderOrder = 5; drops.frustumCulled = false; f.add(drops);
  const seeds = [...Array(N)].map((_, i) => { const mid = i < 60; const jetIx = mid ? -1 : (i - 60) % 8; const a = mid ? Math.random() * Math.PI * 2 : jetIx / 8 * Math.PI * 2; return { mid, a, jetIx, vr: mid ? 0.2 + Math.random() * 1.0 : 0.35 + Math.random() * 0.35, vy: mid ? 6.8 + Math.random() * 1.4 : 4.6 + Math.random() * 0.8, off: Math.random(), life: mid ? 1.2 : 0.95 }; });
  const G = 14, o3 = new THREE.Object3D();
  const landing = (r) => (r < 0.85 ? 3.3 : r < 1.55 ? 2.18 : 0.78);
  const ripples = [0, 1, 2].map(() => { const m = new THREE.Mesh(new THREE.RingGeometry(0.92, 1, 64), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, toneMapped: false })); m.rotation.x = -Math.PI / 2; m.position.y = 0.8; m.renderOrder = 4; f.add(m); return m; });
  ticks.push((t) => {
    streak.offset.y = -(t * 0.9) % 1;
    seeds.forEach((d, i) => {
      const k = ((t / d.life + d.off) % 1) * d.life, ox = d.mid ? 0 : Math.cos(d.a) * 2.2, oz = d.mid ? 0 : Math.sin(d.a) * 2.2, oy = d.mid ? 3.45 : 0.82;
      const dirx = Math.cos(d.a), dirz = Math.sin(d.a); // the small jets lean out a little, towards the wall of the basin
      const x = ox + dirx * d.vr * k, z = oz + dirz * d.vr * k, y = oy + d.vy * k - 0.5 * G * k * k, r = Math.hypot(x, z);
      const gone = y < (d.mid ? landing(r) : 0.78) + 0.02;
      o3.position.set(x, y, z); o3.scale.setScalar(gone ? 0.0001 : 0.7 + (1 - k / d.life) * 0.5); o3.updateMatrix(); drops.setMatrixAt(i, o3.matrix);
    });
    drops.instanceMatrix.needsUpdate = true;
    ripples.forEach((m, i) => { const k = (t * 0.3 + i / 3 + ph) % 1; m.scale.set(0.5 + k * 2.6, 0.5 + k * 2.6, 1); m.material.opacity = 0.5 * (1 - k) * Math.min(1, k * 6); });
  });
  // flower beds on the plaza, benches facing the fountain, lamps in a pinwheel along the ring
  [[1, 1], [-1, 1], [1, -1], [-1, -1]].forEach(([sx, sz]) => { place('flower_bed', sx * 5.7 * Math.SQRT1_2 * 1.0, sz * 5.7 * Math.SQRT1_2 * 1.0, 0, 0.78, Y + 0.06); });
  [[1, 1], [-1, 1], [1, -1], [-1, -1]].forEach(([sx, sz]) => { const x = sx * 11.2 * Math.SQRT1_2, z = sz * 11.2 * Math.SQRT1_2; place('bench', x, z, Math.atan2(-x, -z), 1.1); });
  for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2; const x = 9.0 * Math.cos(a) - 2.7 * Math.sin(a), z = 9.0 * Math.sin(a) + 2.7 * Math.cos(a); place('lamp_post', x, z, 0, 0.9); lamps.push([c.x + x, c.z + z]); }
  // hedges along the edges, open where the paths come in
  const hedge = mat(0xa98bdd, { rough: 0.9 });
  [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([dx, dz]) => [-1, 1].forEach((s) => {
    const len = half - 3.2, off = 3.2 + len / 2;
    const h = new THREE.Mesh(new RoundedBoxGeometry(dx ? 0.9 : len, 0.8, dx ? len : 0.9, 2, 0.3), hedge); h.position.set(c.x + (dx ? dx * (half - 0.2) : s * off), Y + 0.4, c.z + (dz ? dz * (half - 0.2) : s * off)); h.castShadow = true; h.receiveShadow = true; world.add(h);
  }));
  // trees: cypresses flank the entrances, blossom trees stand behind the benches, round trees fill the corners
  [[1, 1], [-1, 1], [1, -1], [-1, -1]].forEach(([sx, sz]) => {
    place('tree_cone', sx * 2.9, sz * (half - 2.0), 0, 0.85); place('tree_cone', sx * (half - 2.0), sz * 2.9, 0, 0.85);
    place('tree_blossom', sx * 9.0, sz * 9.0, sx + sz, 1.05);
    place('tree_round', sx * 10.8, sz * 3.9, sx * 1.3, 0.95); place('tree_round', sx * 3.9, sz * 10.8, sz * 2.1, 0.95);
    place('bush', sx * 11.6, sz * 11.6, sx, 1.0); place('bush', sx * 6.9, sz * 11.8, sz, 0.8); place('bush', sx * 11.8, sz * 6.9, sx, 0.8);
  });
}

// one instanced copy of a park prop per position: items are [x, z, scale, y = 0.14]
export function instancedProto(world, assets, name, items) {
  const proto = staticProto(assets.park.getObjectByName(name), name), m4 = new THREE.Matrix4(), out = [];
  proto.children.forEach((mesh) => {
    const im = new THREE.InstancedMesh(mesh.geometry, mesh.material, items.length);
    const q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
    items.forEach(([x, z, s, y = 0.14, ry = 0], i) => { m4.compose(new THREE.Vector3(x, y, z), q.setFromAxisAngle(up, ry), new THREE.Vector3(s, s, s)); im.setMatrixAt(i, m4); });
    im.castShadow = true; im.receiveShadow = true; world.add(im); out.push(im);
  });
  return out;
}
