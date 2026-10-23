// Models made in Blender (blender/*.py -> public/models/*.glb), loaded once and cloned per agent.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { C, STATUS_COLOR } from './models.js';
import { loadLogos, emblemDecal } from './logo.js';
import { beamMat } from './night.js';
import { BASE } from './paths.js';
import { RUN } from './runstatus.js';

const BUILD = Date.now(); // the models are rebuilt often while we work; this keeps the browser from showing an old copy
export async function loadAssets() {
  try { await Promise.all([document.fonts.load('800 48px Onest'), document.fonts.load('700 20px Onest')]); } catch (e) { /* the sign falls back to Arial */ }
  const L = new GLTFLoader();
  const [r, w, c, fa, fb, logo, fo, pk, ca, cb, sa, sb, aa, ab, ma, mb, la, lb, ka, kb, da, db] = await Promise.all([L.loadAsync(BASE + 'models/robot.glb?v=' + BUILD), L.loadAsync(BASE + 'models/workstation.glb?v=' + BUILD), L.loadAsync(BASE + 'models/cart.glb?v=' + BUILD), L.loadAsync(BASE + 'models/furniture_a.glb?v=' + BUILD), L.loadAsync(BASE + 'models/furniture_b.glb?v=' + BUILD), loadLogos(), L.loadAsync(BASE + 'models/fountain.glb?v=' + BUILD), L.loadAsync(BASE + 'models/park.glb?v=' + BUILD), L.loadAsync(BASE + 'models/creative_a.glb?v=' + BUILD), L.loadAsync(BASE + 'models/creative_b.glb?v=' + BUILD), L.loadAsync(BASE + 'models/strategy_a.glb?v=' + BUILD), L.loadAsync(BASE + 'models/strategy_b.glb?v=' + BUILD), L.loadAsync(BASE + 'models/ads_a.glb?v=' + BUILD), L.loadAsync(BASE + 'models/ads_b.glb?v=' + BUILD), L.loadAsync(BASE + 'models/mgmt_a.glb?v=' + BUILD), L.loadAsync(BASE + 'models/mgmt_b.glb?v=' + BUILD), L.loadAsync(BASE + 'models/sales_a.glb?v=' + BUILD), L.loadAsync(BASE + 'models/sales_b.glb?v=' + BUILD), L.loadAsync(BASE + 'models/client_a.glb?v=' + BUILD), L.loadAsync(BASE + 'models/client_b.glb?v=' + BUILD), L.loadAsync(BASE + 'models/data_a.glb?v=' + BUILD), L.loadAsync(BASE + 'models/data_b.glb?v=' + BUILD)]);
  const prep = (s) => s.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  prep(r.scene); prep(w.scene); prep(c.scene); prep(fa.scene); prep(fb.scene); prep(fo.scene); prep(pk.scene); prep(ca.scene); prep(cb.scene); prep(sa.scene); prep(sb.scene); prep(aa.scene); prep(ab.scene); prep(ma.scene); prep(mb.scene); prep(la.scene); prep(lb.scene); prep(ka.scene); prep(kb.scene); prep(da.scene); prep(db.scene);
  return { robot: r.scene, station: w.scene, cart: c.scene, furnA: fa.scene, furnB: fb.scene, logo, fountain: fo.scene, park: pk.scene, creA: ca.scene, creB: cb.scene, strA: sa.scene, strB: sb.scene, adsA: aa.scene, adsB: ab.scene, mgA: ma.scene, mgB: mb.scene, salA: la.scene, salB: lb.scene, cliA: ka.scene, cliB: kb.scene, datA: da.scene, datB: db.scene };
}

// one robot per real agent: status colour on the pad/stripe/bulb, a hard hat while it is still being built, a ghost while only planned
export function makeAgentRobot(base, status, seed, run = 'inactive') {
  const g = base.clone(true);
  const sc = (RUN[run] || RUN.inactive).color; // the runtime state colours the hat, the pad and the stripe
  const ghost = status === 'not_started';
  const mats = new Map();
  const own = (m) => { if (!mats.has(m)) mats.set(m, m.clone()); return mats.get(m); };
  g.traverse((o) => {
    if (!o.isMesh) return;
    const n = o.material.name;
    if (n === 'mat_status') { o.material = own(o.material); o.material.color.setHex(sc); o.material.emissive.setHex(sc); o.material.emissiveIntensity = 0.5; }
    else if (n === 'mat_eye') { o.material = own(o.material); const e = status === 'live' ? C.glow : status === 'in_development' ? C.pink : C.plan; o.material.color.setHex(e); o.material.emissive.setHex(e); o.material.emissiveIntensity = 1.4; }
    else if (ghost && ['mat_white', 'mat_dark', 'mat_joint', 'mat_cheek'].includes(n)) { o.material = own(o.material); o.material.transparent = true; o.material.opacity = n === 'mat_dark' ? 0.55 : 0.42; o.material.emissive.setHex(C.plan); o.material.emissiveIntensity = 0.3; o.castShadow = false; }
  });
  const hat = g.getObjectByName('Hat'), ant = g.getObjectByName('Antenna'), bulb = g.getObjectByName('Bulb');
  if (hat) { hat.visible = true; hat.traverse((o) => { if (o.isMesh && o.material.name === 'mat_hat') { o.material = own(o.material); o.material.color.setHex(sc); o.material.emissive.setHex(sc); o.material.emissiveIntensity = ghost ? 0.05 : 0.18; } }); }
  if (ant) ant.visible = false; if (bulb) bulb.visible = false; // everyone wears the hat now; it carries the state
  const head = g.getObjectByName('Head');
  g.userData.parts = { head, bulb, status, run, baseY: head ? head.position.y : 0, eyes: g.getObjectByName('Eyes'), armL: g.getObjectByName('ShoulderL'), armR: g.getObjectByName('ShoulderR') };
  g.userData.seed = seed;
  g.traverse((o) => { if (o.isMesh) o.material = own(o.material); }); // every robot owns its materials, so it can be faded and lit on its own
  g.userData.look = makeLook([...mats.values()]); g.userData.runColor = sc;
  g.userData.runMats = [...mats.values()].filter((m) => m.name === 'mat_status' || m.name === 'mat_hat'); // what a change of state recolours
  return g;
}
// the agent's state changed (the page got fresh activity): recolour the hat, the pad and the stripe in place
export function setRobotRun(g, run) {
  const sc = (RUN[run] || RUN.inactive).color; if (g.userData.runColor === sc) return; g.userData.runColor = sc;
  (g.userData.runMats || []).forEach((m) => { m.color.setHex(sc); m.emissive.setHex(sc); const e = g.userData.look.all.find((x) => x.m === m); if (e && e.e0) e.e0.copy(m.emissive); });
  g.userData.look.applied = '';
  g.userData.parts.run = run;
}
// hover highlight + fade state for a set of materials: the app sets fadeT / hlT, tickLook eases towards them
const HL_COLOR = new THREE.Color(0xffc9f4);
function makeLook(list) { return { all: list.map((m) => ({ m, o0: m.opacity, t0: m.transparent, dw0: m.depthWrite, e0: m.emissive ? m.emissive.clone() : null })), fade: 1, fadeT: 1, hl: 0, hlT: 0, lt: null, s0: null, applied: '' }; }
export function makeFadable(obj) { const mats = new Map(); obj.traverse((o) => { if (o.isMesh) { if (!mats.has(o.material)) mats.set(o.material, o.material.clone()); o.material = mats.get(o.material); } }); return makeLook([...mats.values()]); }
function applyLook(L, fade, hl, glow) {
  L.all.forEach((e) => {
    const m = e.m, tr = fade < 0.995 || e.t0;
    if (m.transparent !== tr) { m.transparent = tr; m.needsUpdate = true; }
    m.opacity = e.o0 * fade; m.depthWrite = fade < 0.6 ? false : e.dw0;
    if (glow && e.e0) m.emissive.copy(e.e0).lerp(HL_COLOR, hl * 0.2);
  });
}
function stepLook(L, t, rate = 9) {
  const dt = L.lt == null ? 0 : Math.min(0.1, Math.max(0, t - L.lt)); L.lt = t; const k = 1 - Math.exp(-dt * rate);
  L.fade += (L.fadeT - L.fade) * k; L.hl += (L.hlT - L.hl) * k;
  if (Math.abs(L.fade - L.fadeT) < 0.004) L.fade = L.fadeT; if (Math.abs(L.hl - L.hlT) < 0.004) L.hl = L.hlT;
}
export function tickAgentRobot(g, t) {
  const { head, bulb, status, run, baseY, eyes, armL, armR } = g.userData.parts, s = g.userData.seed;
  if (head) { head.rotation.y = Math.sin(t * 0.7 + s * 1.7) * 0.4; head.rotation.x = Math.sin(t * 1.1 + s) * 0.04; head.position.y = baseY + Math.sin(t * 1.8 + s) * 0.012; }
  if (eyes) { const ph = (t * 0.22 + s * 0.37) % 1; eyes.scale.y = ph < 0.025 ? 0.12 : 1; } // an occasional blink
  const typing = { working: 0.07, waiting: 0.025, paused: 0, problem: 0.04, inactive: 0.012 }[run] ?? 0.03; // only a working agent types hard
  if (armL) armL.rotation.x = Math.sin(t * 9 + s) * typing;
  if (armR) armR.rotation.x = Math.sin(t * 9 + s + 2.2) * typing;
  if (bulb && status === 'live') bulb.scale.setScalar(0.8 + Math.sin(t * 4 + s) * 0.25);
  if (status === 'not_started') g.position.y = 0.1 + Math.sin(t * 1.8 + s) * 0.07;
  const L = g.userData.look; // hover highlight and the fade of a row that stands in front of the one the pointer is heading to
  stepLook(L, t); if (L.s0 == null) L.s0 = g.scale.x;
  const key = L.fade.toFixed(3) + '|' + L.hl.toFixed(3);
  if (key !== L.applied) { L.applied = key; applyLook(L, L.fade, L.hl, true); g.scale.setScalar(L.s0 * (1 + 0.07 * L.hl)); const S = g.userData.stationLook; if (S) applyLook(S, 1 - (1 - L.fade) * 0.55, 0, false); }
}

// a van that carries a task: the accent colour tints the stripe, the roof and the ribbon
export function makeCartGlb(base, color, logo) {
  const g = base.clone(true); const own = new Map();
  g.traverse((o) => { if (o.isMesh && o.material.name === 'mat_accent') { if (!own.has(o.material)) own.set(o.material, o.material.clone()); o.material = own.get(o.material); o.material.color.setHex(color); o.material.emissive.setHex(color); o.material.emissiveIntensity = 0.2; } });
  if (logo) { const t = emblemDecal(logo); [-1, 1].forEach((sd) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.34), new THREE.MeshBasicMaterial({ map: t, transparent: true, toneMapped: false })); m.position.set(-0.05, sd * 0.462, 0.36); if (sd < 0) m.rotation.y = Math.PI; m.rotation.y += sd > 0 ? 0 : 0; g.add(m); }); }
  const beam = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 1.7), beamMat); beam.rotation.x = -Math.PI / 2; beam.position.set(2.7, 0.08, 0); beam.renderOrder = 6; g.add(beam);
  const parcel = g.getObjectByName('Parcel'); parcel.userData.base = parcel.position.y; g.userData.parcel = parcel;
  return g;
}
