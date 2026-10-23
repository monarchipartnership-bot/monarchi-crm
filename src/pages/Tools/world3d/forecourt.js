// The ground round every building: a lawn over the block, a paved apron round the pad, hedges along the block edge, flower beds, benches, trees,
// a small car park and bollards. Everything repeated is instanced, so seven buildings cost a handful of draw calls.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { mat, canvasTex } from './models.js';
import { instancedProto } from './park.js';

const LAWN = 0xcdb2e8, LAWN2 = 0xd8c1ee;
const CAR_COLORS = [0xf3b6e4, 0xd9a6df, 0xc9a4f0, 0xffffff, 0xb7c2ff, 0xffd0b0, 0x9fe0c8];

function pavingTex() { // pale tiles with a faint joint, two tones in a checker so a large square does not read as one flat colour
  const t = canvasTex(128, 128, (c, w, h) => {
    c.fillStyle = '#f7eefb'; c.fillRect(0, 0, w, h); c.fillStyle = '#e9d8f2'; c.fillRect(0, 0, w / 2, h / 2); c.fillRect(w / 2, h / 2, w / 2, h / 2);
    c.strokeStyle = '#d6bbe4'; c.lineWidth = 3; c.strokeRect(0, 0, w, h); c.beginPath(); c.moveTo(w / 2, 0); c.lineTo(w / 2, h); c.moveTo(0, h / 2); c.lineTo(w, h / 2); c.lineWidth = 1.5; c.stroke();
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}

function carGeometries() {
  const body = [], dark = [];
  const rb = (w, h, d, x, y, z, r = 0.16) => { const g = new RoundedBoxGeometry(w, h, d, 3, Math.min(r, w / 2 - 0.01, h / 2 - 0.01, d / 2 - 0.01)); g.translate(x, y, z); return g; };
  body.push(rb(3.5, 0.8, 1.7, 0, 0.62, 0, 0.3), rb(1.9, 0.62, 1.52, -0.15, 1.2, 0, 0.26));
  dark.push(rb(1.5, 0.34, 1.56, -0.15, 1.2, 0, 0.12)); // the glass band
  [[1.05, 0.82], [-1.05, 0.82], [1.05, -0.82], [-1.05, -0.82]].forEach(([x, z]) => { const g = new THREE.CylinderGeometry(0.34, 0.34, 0.26, 16); g.rotateX(Math.PI / 2); g.translate(x, 0.34, z); dark.push(g); });
  const strip = (gs) => mergeGeometries(gs.map((g) => { const n = g.index ? g.toNonIndexed() : g; ['uv', 'uv1'].forEach((k) => n.deleteAttribute(k)); return n; }));
  return { body: strip(body), dark: strip(dark) };
}

function rotInstances(world, geo, material, items, castShadow = true) { // items: [x, y, z, yaw, scale]
  const im = new THREE.InstancedMesh(geo, material, items.length), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
  items.forEach(([x, y, z, ry, s = 1], i) => { m4.compose(new THREE.Vector3(x, y, z), q.setFromAxisAngle(up, ry), new THREE.Vector3(s, s, s)); im.setMatrixAt(i, m4); });
  im.castShadow = castShadow; im.receiveShadow = true; world.add(im); return im;
}

export function buildForecourts(world, plots, assets, { BLOCK, rng, FRONT }) {
  const half = BLOCK / 2, lawnMat = mat(LAWN, { rough: 0.95 }), lawn2 = mat(LAWN2, { rough: 0.95 }), pave = pavingTex();
  const apronTop = new THREE.MeshStandardMaterial({ map: pave, roughness: 0.9 }), apronSide = mat(0xf0e2f6, { rough: 0.9 });
  const beds = [], benches = [], trees = { tree_round: [], tree_cone: [], tree_blossom: [] }, bushes = [], cars = [], bollards = [];
  const car = carGeometries(), carMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.45, metalness: 0.1 }), darkMat = mat(0x2a0b33, { rough: 0.4 });
  const capMat = mat(0xb544b5, { rough: 0.5, emissive: 0xb544b5, ei: 0.2 }), postMat = mat(0xffffff, { rough: 0.6 });

  plots.forEach((b, bi) => {
    const c = b.cell, round = b.round, pw = round ? 18 : b.W + 4.6, pd = round ? 18 : b.D + 4.6;
    const x0 = c.x - pw / 2, x1 = c.x + pw / 2, z1 = c.z + FRONT, z0 = z1 - pd; // the pad
    // lawn over the whole block (just above the kerb plate; the drive and crossing stand a little higher)
    const lawn = new THREE.Mesh(new RoundedBoxGeometry(BLOCK - 0.9, 0.03, BLOCK - 0.9, 2, 0.012), lawnMat); lawn.position.set(c.x, 0.145, c.z); lawn.receiveShadow = true; world.add(lawn);
    for (let k = 0; k < 8; k += 2) { const sw = (BLOCK - 0.9) / 8, st = new THREE.Mesh(new THREE.BoxGeometry(sw, 0.012, BLOCK - 0.9), lawn2); st.position.set(c.x - (BLOCK - 0.9) / 2 + sw * (k + 0.5), 0.162, c.z); st.receiveShadow = true; world.add(st); }
    // the paved apron round the pad
    const ax0 = x0 - 1.1, ax1 = x1 + 1.1, az0 = z0 - 1.1, az1 = z1 + 1.1, aw = ax1 - ax0, ad = az1 - az0;
    const tt = pave.clone(); tt.needsUpdate = true; tt.wrapS = tt.wrapT = THREE.RepeatWrapping; tt.repeat.set(aw / 1.8, ad / 1.8);
    const top = new THREE.MeshStandardMaterial({ map: tt, roughness: 0.9 });
    const apron = new THREE.Mesh(new THREE.BoxGeometry(aw, 0.06, ad), [apronSide, apronSide, top, apronSide, apronSide, apronSide]); apron.position.set((ax0 + ax1) / 2, 0.165, (az0 + az1) / 2); apron.receiveShadow = true; world.add(apron);
    // bollards along the front edge of the apron, a gap for the drive
    for (let x = ax0 + 0.6; x <= ax1 - 0.5; x += 1.9) if (Math.abs(x - c.x) > 2.7) bollards.push([x, 0.19, az1 - 0.18, 0, 1]);
    // flower beds flanking the drive, benches facing the building on both sides and at the back
    [-1, 1].forEach((s) => beds.push([c.x + s * 4.1, c.z + half - 1.5, 0.75, 0.155]));
    [-1, 1].forEach((s) => { const bx = s < 0 ? ax0 - 1.5 : ax1 + 1.5; if (Math.abs(bx - c.x) < half - 1.7) beds.push([bx, az0 + 0.5, 0.7, 0.155]); }); // beds at the back corners of the apron
    [-1, 1].forEach((s) => { benches.push([s < 0 ? ax0 + 0.35 : ax1 - 0.35, z0 + pd * 0.30, 1.0, 0.19, s < 0 ? Math.PI / 2 : -Math.PI / 2]); benches.push([s < 0 ? ax0 + 0.35 : ax1 - 0.35, z0 + pd * 0.70, 1.0, 0.19, s < 0 ? Math.PI / 2 : -Math.PI / 2]); });
    benches.push([c.x, az0 + 0.35, 1.0, 0.19, 0]);
    // hedge along the block edge (back and both sides), left open at the front where the street lamps and the crossing are
    const hz0 = c.z - half + 1.0, hx0 = c.x - half + 1.0, hx1 = c.x + half - 1.0;
    for (let x = hx0; x <= hx1; x += 2.5) bushes.push([x + (rng() - 0.5) * 0.4, c.z - half + 0.9, 0.8 + rng() * 0.3, 0.155]);
    for (let z = hz0 + 1.8; z <= c.z + half - 5.5; z += 2.5) { bushes.push([c.x - half + 0.9, z + (rng() - 0.5) * 0.4, 0.8 + rng() * 0.3, 0.155]); bushes.push([c.x + half - 0.9, z + (rng() - 0.5) * 0.4, 0.8 + rng() * 0.3, 0.155]); }
    // a few cars in a bay on the side with more room (the right one: the camera sees it)
    const bayX = ax1 + 1.15;
    if (bayX + 1.0 < c.x + half - 1.5) for (let k = 0; k < 3; k++) { const z = z0 + 2.6 + k * 2.9 + (bi % 2) * 1.4; if (z < z1 - 3) cars.push([bayX, 0.18, z, Math.PI / 2 + (rng() - 0.5) * 0.06, 0.62, CAR_COLORS[(bi * 3 + k) % CAR_COLORS.length]]); }
    // trees on the lawn left and behind (never on the apron, the bay or the front strip)
    const free = (x, z) => !(x > ax0 - 0.8 && x < ax1 + 0.8 && z > az0 - 0.8) && !(z > z1 - 1) && Math.abs(x - c.x) < half - 1.6 && Math.abs(z - c.z) < half - 1.6 && !(x > bayX - 1.4);
    for (let t = 0, n = 0; t < 120 && n < 9; t++) { const x = c.x + (rng() - 0.5) * (BLOCK - 3), z = c.z + (rng() - 0.5) * (BLOCK - 3); if (!free(x, z)) continue; const k = ['tree_round', 'tree_blossom', 'tree_cone'][Math.floor(rng() * 3)]; trees[k].push([x, z, 0.75 + rng() * 0.35, 0.155]); n++; }
  });

  instancedProto(world, assets, 'flower_bed', beds.map(([x, z, s, y]) => [x, z, s, y]));
  instancedProto(world, assets, 'bush', bushes);
  Object.entries(trees).forEach(([name, items]) => { if (items.length) instancedProto(world, assets, name, items); });
  // benches need a heading
  { const proto = assets.park.getObjectByName('bench'); proto.updateWorldMatrix(true, true); const inv = new THREE.Matrix4().copy(proto.matrixWorld).invert(); const byMat = new Map();
    proto.traverse((o) => { if (!o.isMesh) return; const g = (o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone()); g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld)); Object.keys(g.attributes).forEach((k) => { if (k !== 'position' && k !== 'normal') g.deleteAttribute(k); }); if (!byMat.has(o.material)) byMat.set(o.material, []); byMat.get(o.material).push(g); });
    byMat.forEach((gs, m) => rotInstances(world, mergeGeometries(gs), m, benches.map(([x, z, s, y, ry]) => [x, y, z, ry, s]))); }
  // bollards: a white post and a glowing plum cap
  { const post = new THREE.CylinderGeometry(0.11, 0.13, 0.55, 12); post.translate(0, 0.275, 0); const cap = new THREE.SphereGeometry(0.13, 12, 8); cap.translate(0, 0.58, 0);
    rotInstances(world, post, postMat, bollards); rotInstances(world, cap, capMat, bollards, false); }
  // cars: a tinted body, dark glass and wheels
  { const items = cars.map(([x, y, z, ry, s]) => [x, y, z, ry, s]); const body = rotInstances(world, car.body, carMat, items); cars.forEach(([, , , , , col], i) => body.setColorAt(i, new THREE.Color(col))); body.instanceColor.needsUpdate = true; rotInstances(world, car.dark, darkMat, items); }
}
