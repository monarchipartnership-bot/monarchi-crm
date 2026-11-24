// [ported into the CRM 2026-11-10: createAgentMap(host, opts) mounts the scene inside a host element and returns an api; the standalone sandbox lives in D:/Monarchi/Prototypes/ai-world-districts]
// "Карта AI команди" (owner, 2026-11-09): replaces the office. 8 team islands (round platform, a holographic hub of the team in the exact centre, a curved work pod + a robot per agent) around a central brain hub, drawn as cheaply as possible: pods and robots are instanced (one draw call per part for ALL 43 agents), platforms / hubs / holograms are procedural, labels and the UI are HTML, post = bloom only.
// The pod and the robot come from Blender (public/ai-world/models/map/pod.glb, robot_bunny.glb); until a file exists a placeholder built from primitives in the same local frame is used, so the layout can be tuned independently.
// Pod frame (glTF, Y up): origin = the floor point under the hovering robot, back wall at z = -1.25 (curved, concave to +Z), the open side (+Z) looks at the hub. Footprint x +-1.6, z -1.45 .. +1.0. Robot: origin on the floor under it, face to +Z.
import * as THREE from 'three';
import { createTaskMarkers } from './taskMarkers.js';
import { createAgentNames } from './agentNames.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { glyphTexture } from './icons.js';
import { makeScreens } from './screens.js';
import { buildRoom, buildRoutes, buildDecor, MATS, setView } from './room.js';
import { buildSurround, GROUND_Y, BRIDGE_PZ } from './surround.js';

const BASE = import.meta.env.BASE_URL;
// the islands come from the registry (src/lib/workflow/registry.js, mapIslands): the team of the client and the archived departments
// 5th state "problem" (a failed task / a failed last run). CRM states -> the scene's: working -> working, paused (a result waits for a person) -> waiting, waiting (idle, ready) -> standby, inactive -> inactive
const STATE_IDX = { working: 0, paused: 1, waiting: 2, inactive: 3, problem: 4 };
export async function createAgentMap(host, opts = {}) {
const W = () => Math.max(1, host.clientWidth || 800), H = () => Math.max(1, host.clientHeight || 600);
setView(() => ({ w: W(), h: H() }));
const offs = []; const on = (t, ev, fn, o) => { t.addEventListener(ev, fn, o); offs.push(() => t.removeEventListener(ev, fn, o)); };
const TEAMS = (opts.islands || []).map((l) => ({ ...l, dept: l.key, name: l.label, n: l.agents.length, list: l.agents }));
const root = document.createElement('div'); root.className = 'am3-root'; host.appendChild(root);
const stage = root;
// real agent counts of the CRM (the mockups show other numbers); `a` = angle on the big ring (0 = up / north, clockwise); `main` = the big hologram glyph, `orbit` = the small ones riding the orbit ring

const RING = 25; // distance of the island centres from the brain hub
const FLOOR = 0.62; // top of the platforms
const POD_W = 4.4, POD_BACK = 1.45, POD_MARGIN = 0.55, HUB_R = 1.75; // pod width along the ring, how far a pod reaches back from the robot, the rim left free behind it, the radius of the hub pedestal
const BG_ROT = 0; // turns the panorama so its brightest horizon is behind the building
const ROBOT_SCALE = 1.0; // the robot is ~1 m with the ears: in the mockups it is about 1/3 of the pod's width
const CREAM = 0xe9d6c7, VIOLET = 0x8a4dff, DARK = 0x2b1f3f, NEON = 0xc76dff;

// ---------- renderer / camera / post ----------
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.info.autoReset = false; renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); renderer.setSize(W(), H()); renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0;
stage.appendChild(renderer.domElement);
const scene = new THREE.Scene(); scene.background = new THREE.Color(0x17051c); scene.fog = new THREE.FogExp2(0x17051c, 0.0011);
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture; scene.environmentIntensity = 0.6;
const camera = new THREE.PerspectiveCamera(40, W() / H(), 0.5, 4000);
// the home view = the owner's own angle (2026-11-10: seen from the front-right, 48 degrees above the floor, the whole scene filling the screen); it is also the farthest the camera may go, and the camera is drawn towards it when it is moved away
const HOME_AZ = 0.8, HOME_EL = 0.84, HOME_D = 70, HOME_TGT = new THREE.Vector3(0, 0, 3);
const HOME = { tgt: HOME_TGT, pos: HOME_TGT.clone().add(new THREE.Vector3(Math.cos(HOME_EL) * Math.sin(HOME_AZ), Math.sin(HOME_EL), Math.cos(HOME_EL) * Math.cos(HOME_AZ)).multiplyScalar(HOME_D)) };
camera.position.copy(HOME.pos);
// the camera, as in the office (owner's settings): the left button moves the floor in its plane, the middle button / wheel zooms smoothly, the right button turns it; the farther the camera the tighter it is kept to the building; H or the button on the left = home
const HOME_DIST = HOME.pos.distanceTo(HOME.tgt);
const controls = new OrbitControls(camera, renderer.domElement); controls.target.copy(HOME.tgt);
controls.mouseButtons = { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE }; controls.touches = { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_ROTATE };
controls.screenSpacePanning = false; controls.enableZoom = false; controls.enableDamping = true; controls.dampingFactor = 0.075; controls.rotateSpeed = 0.55; controls.panSpeed = 0.9;
controls.minPolarAngle = 0.3; controls.maxPolarAngle = 1.4; controls.update();
let distT = HOME_DIST; const MIN_D = 5, MAX_D = HOME_DIST;
let dragging = false; renderer.domElement.addEventListener('pointerdown', () => { dragging = true; }); on(window, 'pointerup', () => { dragging = false; });
renderer.domElement.addEventListener('wheel', (e) => { e.preventDefault(); distT = Math.min(MAX_D, Math.max(MIN_D, distT * Math.exp(Math.sign(e.deltaY) * Math.min(Math.abs(e.deltaY), 120) * 0.0011))); }, { passive: false });
const _pr = renderer.getPixelRatio(), composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(W() * _pr, H() * _pr, { type: THREE.HalfFloatType, samples: 4 })); // a multisampled target: crisp edges (the renderer's own antialias does not reach the composer)
 composer.addPass(new RenderPass(scene, camera));
composer.addPass(new UnrealBloomPass(new THREE.Vector2(W(), H()), 0.3, 0.35, 0.93)); composer.addPass(new OutputPass());
scene.add(new THREE.HemisphereLight(0xd8c8ff, 0x20123d, 0.55));
const sun = new THREE.DirectionalLight(0xffffff, 0.9); sun.position.set(-20, 40, 25); scene.add(sun);

// the backdrop (owner's picture, 2026-11-09): a violet horizon panorama (equirectangular, the glowing horizon line on the equator) round the whole scene; under the building a soft dark disc that fades into it + a faint violet glow, as if the neon lit the polished ground
// 2026-11-11: the owner asked for one simple background across the whole AI Agents section, so the panorama is not loaded any more (scene.background stays the plain deep violet set above, same as the CSS background of the other tabs). To bring the panorama back: load ai-world/map/background.webp as an equirectangular texture into scene.background.
const radial = (stops) => { const cv = document.createElement('canvas'); cv.width = cv.height = 512; const g = cv.getContext('2d'), gr = g.createRadialGradient(256, 256, 0, 256, 256, 256); stops.forEach(([o, c]) => gr.addColorStop(o, c)); g.fillStyle = gr; g.fillRect(0, 0, 512, 512); const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t; };
const ground = new THREE.Mesh(new THREE.CircleGeometry(2400, 96), new THREE.MeshBasicMaterial({ map: radial([[0, 'rgba(14,9,32,1)'], [0.05, 'rgba(18,12,42,1)'], [0.3, 'rgba(26,18,62,1)'], [0.75, 'rgba(60,42,128,1)'], [1, 'rgba(120,88,210,1)']]), depthWrite: false, fog: false })); ground.rotation.x = -Math.PI / 2; ground.position.y = GROUND_Y; ground.renderOrder = -2; scene.add(ground);
const glowDisc = new THREE.Mesh(new THREE.CircleGeometry(95, 64), new THREE.MeshBasicMaterial({ map: radial([[0, 'rgba(150,90,255,0.22)'], [0.55, 'rgba(110,60,220,0.09)'], [1, 'rgba(90,40,200,0)']]), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false })); glowDisc.rotation.x = -Math.PI / 2; glowDisc.position.y = GROUND_Y + 0.03; glowDisc.renderOrder = -1; scene.add(glowDisc);

// ---------- materials / textures ----------
const std = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.38, metalness: 0.08, ...o });
const basic = (c, o = {}) => new THREE.MeshBasicMaterial({ color: c, ...o });
const MAT = {
  cream: std(CREAM, { roughness: 0.32 }), dark: std(DARK, { roughness: 0.4, metalness: 0.2 }), violet: std(VIOLET, { roughness: 0.3 }), neon: basic(NEON), neonDim: basic(0x7a3fe0),
  green: std(0x56b43a, { roughness: 0.6, side: THREE.DoubleSide }), glass: std(0x1a1030, { roughness: 0.15, metalness: 0.4 }),
};
function canvasTex(w, h, draw) { const cv = document.createElement('canvas'); cv.width = w; cv.height = h; draw(cv.getContext('2d'), w, h); const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; }
const screenTex = canvasTex(512, 256, (c, w, h) => { const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#3a1a8a'); g.addColorStop(1, '#1c0b45'); c.fillStyle = g; c.fillRect(0, 0, w, h); c.fillStyle = 'rgba(176,110,255,0.55)'; c.beginPath(); c.moveTo(0, h); for (let x = 0; x <= w; x += 8) c.lineTo(x, h * 0.62 - Math.sin(x / 38) * 26 - Math.sin(x / 15) * 9); c.lineTo(w, h); c.fill(); c.strokeStyle = '#e1c4ff'; c.lineWidth = 3; c.beginPath(); for (let x = 0; x <= w; x += 8) c.lineTo(x, h * 0.62 - Math.sin(x / 38) * 26 - Math.sin(x / 15) * 9); c.stroke(); });
const tabletTex = canvasTex(128, 128, (c, w, h) => { c.fillStyle = '#1a0f33'; c.fillRect(0, 0, w, h); c.fillStyle = '#9a62ff'; for (const [x, y] of [[22, 22], [68, 22], [22, 68], [68, 68]]) c.fillRect(x, y, 38, 38); });
const faceTex = canvasTex(256, 256, (c, w, h) => { c.fillStyle = '#0d0820'; c.fillRect(0, 0, w, h); c.strokeStyle = '#d9b8ff'; c.lineWidth = 12; c.lineCap = 'round'; c.shadowColor = '#c76dff'; c.shadowBlur = 14; for (const x of [84, 172]) { c.beginPath(); c.arc(x, 112, 16, Math.PI * 1.1, Math.PI * 1.9); c.stroke(); } c.beginPath(); c.arc(128, 150, 20, 0.2, Math.PI - 0.2); c.stroke(); });
// the desk screens are live little applications per team (screens.js): an atlas of tiles redrawn ~7x a second; the instance colour dims a screen by the agent's state
const screens = makeScreens(TEAMS);
const POD_MAT = { Pod_Body: MAT.cream, Pod_Screen: screens.patch(basic(0xffffff, { side: THREE.DoubleSide })), Pod_Neon: MAT.neon, Pod_Tablet: MAT.glass, Pod_TabletScreen: basic(0xffffff, { map: tabletTex }), Pod_Plants: MAT.green, Pod_Pad: basic(VIOLET, { transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }) };
POD_MAT.Pod_Cap = std(0xf1e8de, { roughness: 0.28 }); POD_MAT.Pod_Leaf = std(0xffffff, { vertexColors: true, roughness: 0.65, side: THREE.DoubleSide }); POD_MAT.Pod_Flower = std(0xffffff, { vertexColors: true, roughness: 0.55, side: THREE.DoubleSide }); POD_MAT.Pod_Soil = std(0x2a1d1a, { roughness: 1 }); POD_MAT.Pod_Status = basic(0xffffff);
// the states of an agent and the light each one wears on the back of its desk (the owner's palette of the office robots: working = green, waiting for tasks = violet, standby = blue, not active = white); until the real states come from the CRM they are dealt out pseudo-randomly
const STATUS = [{ k: 'working', name: 'Працює', col: new THREE.Color('#4BE07F'), pulse: 3.0 }, { k: 'waiting', name: 'Очікує завдань', col: new THREE.Color('#A45CFF'), pulse: 1.6 }, { k: 'standby', name: 'Резерв', col: new THREE.Color('#5BB8FF'), pulse: 0.7 }, { k: 'inactive', name: 'Не активний', col: new THREE.Color('#F2F2FA'), pulse: 0 }, { k: 'problem', name: 'Проблема', col: new THREE.Color('#FF5A6E'), pulse: 4.5 }];

const ROBOT_MAT = { Robot_Cream: std(0xf4eee8, { roughness: 0.25 }), Robot_Violet: std(0x7a45e8, { roughness: 0.3 }), Robot_Face: basic(0xffffff, { map: faceTex }), Robot_Glow: basic(NEON) };

// ---------- the parts of the pod and of the robot (Blender GLB, or a placeholder in the same local frame) ----------
function merge(list) { const P = [], N = [], U = []; for (const g0 of list) { const g = g0.index ? g0.toNonIndexed() : g0, p = g.attributes.position.array, n = g.attributes.normal.array, u = g.attributes.uv ? g.attributes.uv.array : null; for (let i = 0; i < p.length; i++) { P.push(p[i]); N.push(n[i]); } for (let i = 0; i < p.length / 3 * 2; i++) U.push(u ? u[i] : 0); } const o = new THREE.BufferGeometry(); o.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); o.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3)); o.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2)); return o; }
const IDM = new THREE.Matrix4();
function placeholderPod() {
  const shell = new THREE.CylinderGeometry(1.25, 1.25, 1.1, 18, 1, true, Math.PI - 1.25, 2.5).translate(0, 0.55, 0);
  const bench = new THREE.CylinderGeometry(1.0, 1.0, 0.45, 18, 1, true, Math.PI - 1.0, 2.0).translate(0, 0.225, 0);
  const screen = new THREE.CylinderGeometry(1.18, 1.18, 0.62, 18, 1, true, Math.PI - 1.0, 2.0).translate(0, 0.85, 0);
  const neon = new THREE.CylinderGeometry(1.27, 1.27, 0.06, 18, 1, true, Math.PI - 1.25, 2.5).translate(0, 0.08, 0);
  const pad = new THREE.CircleGeometry(0.55, 24).rotateX(-Math.PI / 2).translate(0, 0.015, 0);
  const plant = new THREE.ConeGeometry(0.25, 0.5, 6).translate(1.15, 0.9, -0.5);
  return [{ name: 'Pod_Body', geo: merge([shell, bench]), base: IDM }, { name: 'Pod_Screen', geo: screen, base: IDM }, { name: 'Pod_Neon', geo: neon, base: IDM }, { name: 'Pod_Pad', geo: pad, base: IDM }, { name: 'Pod_Plants', geo: plant, base: IDM }];
}
function placeholderRobot() {
  const body = new THREE.SphereGeometry(0.3, 14, 10).scale(1, 1.15, 1).translate(0, 0.62, 0), head = new THREE.SphereGeometry(0.27, 14, 10).translate(0, 1.0, 0);
  const ear = (x) => new THREE.CylinderGeometry(0.05, 0.07, 0.4, 6).translate(x, 1.35, 0), jet = new THREE.CylinderGeometry(0.22, 0.05, 0.14, 12).translate(0, 0.28, 0);
  const face = new THREE.PlaneGeometry(0.34, 0.26).translate(0, 1.0, 0.265);
  return [{ name: 'Body', geo: body, base: IDM, mat: ROBOT_MAT.Robot_Cream }, { name: 'Head', geo: head, base: IDM, mat: ROBOT_MAT.Robot_Cream }, { name: 'Face', geo: face, base: IDM, mat: ROBOT_MAT.Robot_Face }, { name: 'EarL', geo: ear(-0.12), base: IDM, mat: ROBOT_MAT.Robot_Cream }, { name: 'EarR', geo: ear(0.12), base: IDM, mat: ROBOT_MAT.Robot_Cream }, { name: 'JetCore', geo: jet, base: IDM, mat: ROBOT_MAT.Robot_Glow }];
}
// every mesh of a GLB becomes a part: geometry in the node's local space + the node's matrix relative to the file root (+ the ear node for the wiggle)
async function loadParts(url, fallback) {
  try {
    const gltf = await new GLTFLoader().loadAsync(url), parts = []; gltf.scene.updateMatrixWorld(true);
    gltf.scene.traverse((o) => {
      if (!o.isMesh) return; let n = o, ear = null, jet = null; for (; n; n = n.parent) { if (/^Ear[LR]/.test(n.name)) ear = n; if (/^Jet(Core|Plume)/.test(n.name)) jet = n; }
      const gn = o.parent && o.parent !== gltf.scene && !o.name ? o.parent.name : o.name;
      parts.push({ name: o.name || gn, geo: o.geometry, base: o.matrixWorld.clone(), mat: o.material && ROBOT_MAT[o.material.name], matName: o.material && o.material.name, ear: ear ? { side: ear.name[3] === 'L' ? 1 : -1, pivot: ear.matrixWorld.clone(), inv: ear.matrixWorld.clone().invert() } : null, jet: !!jet });
    });
    if (!parts.length) throw new Error('empty'); console.log('[map] loaded', url, parts.map((p) => p.name).join(','));
    return parts;
  } catch (e) { console.warn('[map] placeholder for', url, e.message); return fallback(); }
}

// ---------- the islands ----------
const islands = [], agents = [];
for (const t of TEAMS) {
  const rp = Math.max(3.9, t.n * POD_W / (2 * Math.PI)), r = rp + POD_BACK + POD_MARGIN, ang = t.a * Math.PI / 180; // pods stand on a ring of radius rp; nothing reaches beyond the rim
  const isl = { t, rp, r, pos: new THREE.Vector3(t.p[0], 0, t.p[1]), group: new THREE.Group(), holo: null, orbit: null };
  isl.group.position.copy(isl.pos); scene.add(isl.group);
  buildPlatform(isl.group, r);
  buildHub(isl, t);
  for (let i = 0; i < t.n; i++) { const a = (i + 0.5) / t.n * Math.PI * 2 + Math.PI / t.n * 0; agents.push({ team: isl, idx: i, a, x: isl.pos.x + Math.sin(a) * rp, z: isl.pos.z + Math.cos(a) * rp, yaw: a + Math.PI, key: t.list[i] ? t.list[i].key : null, deptKey: t.dept, name: t.list[i] ? t.list[i].name : `${t.name}: агент ${i + 1}`, phase: Math.random() * 6 }); }
  islands.push(isl);
}
function buildPlatform(g, r) { // cream rim + dark violet top + neon: the look of the mockups
  const body = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 0.985, FLOOR, 72), MAT.cream); body.position.y = FLOOR / 2; g.add(body);
  const top = new THREE.Mesh(new THREE.CylinderGeometry(r - 0.3, r - 0.3, 0.03, 72), MAT.dark); top.position.y = FLOOR + 0.005; g.add(top);
  const band = new THREE.Mesh(new THREE.CylinderGeometry(r + 0.02, r * 0.995, 0.09, 72, 1, true), MAT.neon); band.position.y = 0.2; g.add(band);
  const edge = new THREE.Mesh(new THREE.TorusGeometry(r - 0.3, 0.035, 6, 96), MAT.neon); edge.rotation.x = Math.PI / 2; edge.position.y = FLOOR + 0.02; g.add(edge);
}
// the hologram base (Blender, models/map/island_hub.glb, root island_hub, radius 3.3 incl. the floor rings, top 1.45): scaled per island so its floor rings stay clear of the desks; the procedural pedestal below stays as the fallback and is removed once the model is in
function hubScale(rp) { return Math.min(1, (rp - 1.6) / 3.3); }
const HUB_MAT = { IHub_Body: MAT.cream, IHub_Dark: MAT.dark, IHub_Neon: MAT.neon, IHub_Beam: basic(VIOLET, { transparent: true, opacity: 0.3, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }), IHub_Glass: basic(VIOLET, { transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }), IHub_Glow: basic(NEON, { transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }) };
async function loadIslandHubs() {
  try {
    const gltf = await new GLTFLoader().loadAsync(BASE + 'ai-world/models/map/island_hub.glb');
    gltf.scene.traverse((o) => { if (o.isMesh) o.material = HUB_MAT[o.name] || HUB_MAT[o.parent && o.parent.name] || MAT.cream; });
    for (const isl of islands) { for (const m of isl.hubOld || []) m.parent.remove(m); const h = gltf.scene.clone(true), s = isl.hs; h.scale.setScalar(s); h.position.y = FLOOR; isl.group.add(h); isl.hubNew = h; }
    console.log('[map] island hub model in');
  } catch (e) { console.warn('[map] island hub fallback', e.message); }
}
function buildHub(isl, t) {
  const g = isl.group, T = FLOOR; isl.hubOld = []; isl.hs = hubScale(isl.rp);
  const add = (geo, mat, y) => { const m = new THREE.Mesh(geo, mat); m.position.y = y; g.add(m); isl.hubOld.push(m); return m; };
  add(new THREE.CylinderGeometry(HUB_R, HUB_R * 1.06, 0.28, 48), MAT.cream, T + 0.14); add(new THREE.CylinderGeometry(HUB_R * 0.78, HUB_R * 0.82, 0.26, 48), MAT.dark, T + 0.41);
  const r1 = add(new THREE.TorusGeometry(HUB_R * 0.8, 0.035, 6, 64), MAT.neon, T + 0.3); r1.rotation.x = Math.PI / 2; const r2 = add(new THREE.TorusGeometry(HUB_R * 1.0, 0.03, 6, 64), MAT.neon, T + 0.2); r2.rotation.x = Math.PI / 2;
  add(new THREE.CylinderGeometry(HUB_R * 0.6, HUB_R * 0.6, 0.04, 40), basic(NEON), T + 0.56);
  add(new THREE.CylinderGeometry(HUB_R * 0.55, HUB_R * 0.8, 1.0, 32, 1, true), basic(VIOLET, { transparent: true, opacity: 0.2, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }), T + 1.0); // the beam
  // the hologram (exact centre of the island): a glass sphere + a lat-long net + the big glyph + the orbit ring with the small glyphs
  const holo = new THREE.Group(); holo.position.y = T + 3.1; g.add(holo); isl.holo = holo;
  holo.add(new THREE.Mesh(new THREE.SphereGeometry(1.45, 28, 18), basic(VIOLET, { transparent: true, opacity: 0.16, depthWrite: false, blending: THREE.AdditiveBlending })));
  const net = new THREE.Mesh(new THREE.SphereGeometry(1.46, 18, 12), basic(NEON, { wireframe: true, transparent: true, opacity: 0.16, depthWrite: false })); holo.add(net);
  for (const k of [-0.9, 0.9]) { const disc = new THREE.Mesh(new THREE.TorusGeometry(1.6, 0.02, 6, 64), basic(NEON, { transparent: true, opacity: 0.7 })); disc.rotation.x = Math.PI / 2; disc.position.y = k - 0.4 * Math.sign(k) - 1.2; holo.add(disc); }
  const big = new THREE.Sprite(new THREE.SpriteMaterial({ map: glyphTexture(t.main, { badge: false, color: '#f3e8ff', size: 256 }), transparent: true, depthWrite: false })); big.scale.setScalar(1.9); holo.add(big);
  const orbit = new THREE.Group(); orbit.rotation.x = 0.35; holo.add(orbit); isl.orbit = orbit;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(2.25, 0.018, 6, 96), basic(NEON, { transparent: true, opacity: 0.8 })); ring.rotation.x = Math.PI / 2; orbit.add(ring);
  t.orbit.forEach((name, i) => { const a = i / t.orbit.length * Math.PI * 2, s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glyphTexture(name), transparent: true, depthWrite: false })); s.scale.setScalar(0.62); s.position.set(Math.cos(a) * 2.25, 0, Math.sin(a) * 2.25); orbit.add(s); });
}
// ---------- instanced pods / robots ----------
const N = agents.length;
const podMeshes = [], robotMeshes = [], proxy = new THREE.InstancedMesh(new THREE.SphereGeometry(0.55, 8, 6), basic(0xff0000), N);
proxy.visible = false; scene.add(proxy);
let robotParts = [];
const tmpM = new THREE.Matrix4(), tmpA = new THREE.Matrix4(), tmpR = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpV = new THREE.Vector3(), tmpS = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0), Z = new THREE.Vector3(0, 0, 1);
const podM = agents.map((ag) => new THREE.Matrix4().compose(new THREE.Vector3(ag.x, FLOOR, ag.z), new THREE.Quaternion().setFromAxisAngle(UP, ag.yaw), new THREE.Vector3(1, 1, 1)));
let selected = -1, hovered = -1, statusMesh = null;
agents.forEach((ag) => { const st = opts.runStates && ag.key ? opts.runStates[ag.key] : null; ag.status = st in STATE_IDX ? STATE_IDX[st] : 2; });
const boxProxy = new THREE.InstancedMesh(new THREE.BoxGeometry(3.2, 1.7, 2.6), basic(0x00ff00), N); boxProxy.visible = false; scene.add(boxProxy); // the desk is clickable too: a box round every pod
// the office agent robot (robot_agent_lite, lightened to ~1600 triangles: map/robot_map.glb): one instanced mesh per part; Head / Arms / Antennas are animated about their own pivots (the node names of the office model), the face and the emblem get the same textures as in the office
const loadImg = (src) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
async function loadOfficeRobot(url) {
  try {
    const gltf = await new GLTFLoader().loadAsync(url), parts = []; gltf.scene.updateMatrixWorld(true);
    const face = canvasTex(512, 320, (c) => { c.fillStyle = '#000'; c.fillRect(0, 0, 512, 320); c.strokeStyle = '#c9a8ff'; c.lineWidth = 22; c.lineCap = 'round'; c.shadowColor = '#a45cff'; c.shadowBlur = 30; c.beginPath(); c.arc(150, 140, 52, Math.PI * 1.12, Math.PI * 1.88); c.stroke(); c.beginPath(); c.arc(362, 140, 52, Math.PI * 1.12, Math.PI * 1.88); c.stroke(); c.beginPath(); c.arc(256, 190, 62, Math.PI * 0.12, Math.PI * 0.88); c.stroke(); }); face.flipY = false;
    let emb = null; try { const img = await loadImg(BASE + 'ai-world/logo/emblem.svg'); emb = canvasTex(512, 512, (c) => c.drawImage(img, 0, 0, 512, 512)); emb.flipY = false; } catch (e) { /* no emblem */ }
    const seen = new Set();
    gltf.scene.traverse((o) => {
      if (!o.isMesh) return; const mat = o.material, k = mat.name;
      if (!seen.has(mat)) { seen.add(mat);
        if (k === 'mat_face_screen') { mat.map = face; mat.emissiveMap = face; mat.emissive.set(0xffffff); mat.emissiveIntensity = 1.4; }
        if (k === 'mat_emblem' && emb) { mat.map = emb; mat.color.set(0xffffff); }
        if (k === 'mat_glow') { mat.emissive.set(0xa45cff); mat.color.set(0xa45cff); mat.emissiveIntensity = 2.2; }
        if (k === 'mat_glow_soft') { mat.emissive.set(0x9a50ff); mat.color.set(0x9a50ff); mat.emissiveIntensity = 0.8; mat.transparent = true; mat.depthWrite = false; }
        mat.needsUpdate = true; }
      const chain = []; for (let n = o; n; n = n.parent) { const kind = /^Head$/.test(n.name) ? 'head' : /^ArmL$/.test(n.name) ? 'armL' : /^ArmR$/.test(n.name) ? 'armR' : /^AntennaL$/.test(n.name) ? 'antL' : /^AntennaR$/.test(n.name) ? 'antR' : null; if (kind) chain.unshift({ kind, pivot: n.matrixWorld.clone(), inv: n.matrixWorld.clone().invert() }); }
      parts.push({ name: o.name, geo: o.geometry, base: o.matrixWorld.clone(), mat, chain });
    });
    if (!parts.length) throw new Error('empty'); console.log('[map] loaded', url, parts.length, 'parts');
    return parts;
  } catch (e) { console.warn('[map] placeholder for', url, e.message); return placeholderRobot().map((p) => ({ ...p, chain: [] })); }
}
async function buildAgents() {
  const [podParts, rParts] = await Promise.all([loadParts(BASE + 'ai-world/models/map/pod_v2.glb', () => null).then((pp) => pp || loadParts(BASE + 'ai-world/models/map/pod.glb', placeholderPod)), loadOfficeRobot(BASE + 'ai-world/models/map/robot_map.glb')]);
  for (const p of podParts) {
    const mat = POD_MAT[p.matName] || POD_MAT[p.name] || MAT.cream, im = new THREE.InstancedMesh(p.geo, mat, N); im.frustumCulled = false;
    for (let i = 0; i < N; i++) { tmpM.multiplyMatrices(podM[i], p.base); im.setMatrixAt(i, tmpM); } im.instanceMatrix.needsUpdate = true; if (p.name === 'Pod_Pad') im.visible = false; if (p.name === 'Pod_Screen') { screenMesh = im; const tl = new Float32Array(N); for (let i = 0; i < N; i++) { tl[i] = screens.tileOf(TEAMS.indexOf(agents[i].team.t), agents[i].idx % 2); im.setColorAt(i, _SC.setScalar(SCREEN_LIGHT[agents[i].status])); } p.geo.setAttribute('aTile', new THREE.InstancedBufferAttribute(tl, 1)); } if (p.name === 'Pod_Status') { statusMesh = im; for (let i = 0; i < N; i++) im.setColorAt(i, STATUS[agents[i].status].col); } scene.add(im); podMeshes.push(im);
  }
  robotParts = rParts.map((p) => { const mat = p.mat || ROBOT_MAT[p.matName] || ROBOT_MAT.Robot_Cream, im = new THREE.InstancedMesh(p.geo, mat, N); im.frustumCulled = false; im.instanceMatrix.setUsage(THREE.DynamicDrawUsage); scene.add(im); robotMeshes.push(im); return { ...p, im }; });
  for (let i = 0; i < N; i++) { tmpM.setPosition(agents[i].x, FLOOR + 0.6, agents[i].z); proxy.setMatrixAt(i, tmpM); } proxy.instanceMatrix.needsUpdate = true;
  for (let i = 0; i < N; i++) { tmpM.multiplyMatrices(podM[i], new THREE.Matrix4().makeTranslation(0, 0.85, -0.2)); boxProxy.setMatrixAt(i, tmpM); } boxProxy.instanceMatrix.needsUpdate = true;
}
// the light on the back of every desk: the colour of the agent's state, pulsing at its own pace; brighter when the desk or the robot is hovered / chosen
const _SC = new THREE.Color(); const SCREEN_LIGHT = [1, 0.7, 0.4, 0.12, 0.8]; let screenMesh = null;
function updateStatus(t) {
  if (!statusMesh) return;
  for (let i = 0; i < N; i++) { const s = STATUS[agents[i].status], k = (s.pulse ? 1.4 + 0.7 * Math.sin(t * s.pulse + agents[i].phase) : 1.0) * (i === selected ? 1.8 : i === hovered ? 1.4 : 1); statusMesh.setColorAt(i, _SC.copy(s.col).multiplyScalar(k * 1.5)); }
  statusMesh.instanceColor.needsUpdate = true;
}
const _E = new THREE.Euler(), _R = { head: new THREE.Matrix4(), armL: new THREE.Matrix4(), armR: new THREE.Matrix4(), antL: new THREE.Matrix4(), antR: new THREE.Matrix4() }, _CH = new THREE.Matrix4(), _PM = new THREE.Matrix4();
function updateRobots(t) {
  if (!robotParts.length) return;
  for (let i = 0; i < N; i++) {
    const ag = agents[i], ph = ag.phase, lift = i === selected ? 0.3 : i === hovered ? 0.15 : 0, y = FLOOR + 0.15 + 0.04 * Math.sin(t * 1.6 + ph) + lift, sc = ROBOT_SCALE * (i === selected ? 1.15 : 1);
    tmpQ.setFromAxisAngle(UP, ag.yaw + Math.PI); tmpA.compose(tmpV.set(ag.x, y, ag.z), tmpQ, tmpS.set(sc, sc, sc)); // the robot faces its desk
    // the poses (the robot works at its desk: the arms forward and tapping, the head looks round, the antennas sway)
    _R.head.makeRotationFromEuler(_E.set(0.05 * Math.sin(t * 1.1 + ph), 0.4 * Math.sin(t * 0.5 + ph * 1.3), 0));
    _R.armL.makeRotationFromEuler(_E.set(-0.55 + 0.12 * Math.sin(t * 13 + ph), 0, 0.08)); _R.armR.makeRotationFromEuler(_E.set(-0.55 + 0.12 * Math.sin(t * 13 + ph + 1.7), 0, -0.08));
    _R.antL.makeRotationFromEuler(_E.set(0, 0, 0.12 * Math.sin(t * 2.3 + ph))); _R.antR.makeRotationFromEuler(_E.set(0, 0, -0.12 * Math.sin(t * 2.3 + ph + 1)));
    for (const p of robotParts) {
      tmpM.copy(p.base);
      for (let c = p.chain.length - 1; c >= 0; c--) { const e = p.chain[c]; _CH.multiplyMatrices(e.pivot, _R[e.kind]).multiply(e.inv); tmpM.premultiply(_CH); }
      tmpM.premultiply(tmpA); p.im.setMatrixAt(i, tmpM);
    }
  }
  for (const p of robotParts) p.im.instanceMatrix.needsUpdate = true;
}
// DATA CONDUITS (replace the plain lines, owner's note 2026-11-10): a shallow dark channel runs from the hub to every desk; light packets run along it in the colour of the agent's state - working: fast, waiting: slowly, standby: a faint tick, not active: none; the node at the desk end wears the state colour (so the floor says who works and who waits). One instanced mesh per layer.
// a train of three chevrons pointing outward (+x), fading towards the tail (vertex colours); built flat on the floor
function chevronTrain() {
  const parts = [], cols = [];
  [[0.0, 1, 1], [-0.30, 0.78, 0.55], [-0.58, 0.58, 0.28]].forEach(([x0, sc, br]) => {
    const sh = new THREE.Shape(); const P = [[0.2, 0], [-0.05, 0.15], [-0.17, 0.15], [0.05, 0], [-0.17, -0.15], [-0.05, -0.15]].map(([x, y]) => [x * sc + x0, y * sc]); sh.moveTo(...P[0]); P.slice(1).forEach((q) => sh.lineTo(...q)); sh.closePath();
    const g = new THREE.ExtrudeGeometry(sh, { depth: 0.02, bevelEnabled: false }); g.rotateX(-Math.PI / 2); g.translate(0, 0.0, 0); // shape y -> -z, extrusion -> up
    const n = g.attributes.position.count, c = new Float32Array(n * 3).fill(br); g.setAttribute('color', new THREE.BufferAttribute(c, 3)); parts.push(g);
  });
  return mergeGeos(parts);
}
function mergeGeos(list) { const pos = [], col = [], idx = []; let off = 0; for (const g of list) { const gi = g.index ? g : null; pos.push(...g.attributes.position.array); col.push(...g.attributes.color.array); if (gi) idx.push(...[...gi.index.array].map((v) => v + off)); else for (let k = 0; k < g.attributes.position.count; k++) idx.push(off + k); off += g.attributes.position.count; } const m = new THREE.BufferGeometry(); m.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); m.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); m.setIndex(idx); m.computeVertexNormals(); return m; }
const PED_H = 0.15, PED_R = 0.62; // the little pedestal under every robot: the conduit ends in it
const grooves = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.02, 0.2), new THREE.MeshStandardMaterial({ color: 0x120a28, roughness: 0.45, metalness: 0.3 }), N), cLines = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.012, 0.022), basic(0xffffff), N * 2), packets = new THREE.InstancedMesh(chevronTrain(), basic(0xffffff, { vertexColors: true }), N * 2);
const portGeo = new THREE.TorusGeometry(0.13, 0.03, 6, 20); portGeo.rotateX(Math.PI / 2);
const ports = new THREE.InstancedMesh(portGeo, basic(0xffffff), N); // the start: a small port ring where the channel leaves the hub's floor ring
const pedBase = new THREE.InstancedMesh(new THREE.CylinderGeometry(PED_R, PED_R * 1.04, 0.07, 40), MAT.cream, N), pedTop = new THREE.InstancedMesh(new THREE.CylinderGeometry(PED_R * 0.86, PED_R * 0.9, PED_H - 0.07, 40), MAT.dark, N);
const pedRingGeo = new THREE.TorusGeometry(PED_R * 0.8, 0.026, 6, 48); pedRingGeo.rotateX(Math.PI / 2);
const pedRing = new THREE.InstancedMesh(pedRingGeo, basic(0xffffff), N), pedGlow = new THREE.InstancedMesh(new THREE.CircleGeometry(PED_R * 0.74, 36).rotateX(-Math.PI / 2), basic(0xffffff, { transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending }), N);
const SPEED = [0.42, 0.16, 0.05, 0, 0.1];
agents.forEach((ag, i) => {
  const isl = ag.team, r0 = 3.2 * isl.hs, r1 = isl.rp - PED_R, len = r1 - r0, mid = (r0 + r1) / 2, sx = Math.sin(ag.a), cz = Math.cos(ag.a); ag.sp = { x: isl.pos.x, z: isl.pos.z, sx, cz, r0, len, yaw: ag.a - Math.PI / 2 };
  tmpQ.setFromAxisAngle(UP, ag.sp.yaw); tmpM.compose(tmpV.set(isl.pos.x + sx * mid, FLOOR + 0.03, isl.pos.z + cz * mid), tmpQ, tmpS.set(len, 1, 1)); grooves.setMatrixAt(i, tmpM);
  for (const [k, off] of [[0, -0.085], [1, 0.085]]) { tmpM.compose(tmpV.set(isl.pos.x + sx * mid - cz * off, FLOOR + 0.04, isl.pos.z + cz * mid + sx * off), tmpQ, tmpS.set(len, 1, 1)); cLines.setMatrixAt(i * 2 + k, tmpM); cLines.setColorAt(i * 2 + k, STATUS[ag.status].col.clone().multiplyScalar(0.7)); } // two thin edge lines of the channel, in the colour of the state
  tmpM.makeTranslation(isl.pos.x + sx * r0, FLOOR + 0.045, isl.pos.z + cz * r0); ports.setMatrixAt(i, tmpM); ports.setColorAt(i, new THREE.Color(NEON).multiplyScalar(1.2));
  for (const im of [pedBase, pedTop, pedRing, pedGlow]) { const yy = im === pedBase ? 0.035 : im === pedTop ? 0.07 + (PED_H - 0.07) / 2 : im === pedRing ? PED_H + 0.012 : PED_H + 0.006; tmpM.makeTranslation(ag.x, FLOOR + yy, ag.z); im.setMatrixAt(i, tmpM); }
});
for (const im of [packets, pedRing, pedGlow]) { im.frustumCulled = false; im.instanceMatrix.setUsage(THREE.DynamicDrawUsage); }
scene.add(grooves, cLines, packets, ports, pedBase, pedTop, pedRing, pedGlow);
const _PC = new THREE.Color();
function updateConduits(t) {
  for (let i = 0; i < N; i++) {
    const ag = agents[i], s = STATUS[ag.status], sp = ag.sp, v = SPEED[ag.status], br = (i === selected ? 1.9 : i === hovered ? 1.5 : 1);
    for (let k = 0; k < 2; k++) {
      const idx = i * 2 + k;
      if (!v) { tmpM.makeScale(0, 0, 0); packets.setMatrixAt(idx, tmpM); continue; }
      const u = (ag.phase * 0.1 + t * v + k * 0.5) % 1, d = sp.r0 + 0.2 + u * (sp.len - 0.2), f = Math.min(1, u * 6, (1 - u) * 6) * 0.9 + 0.1;
      tmpQ.setFromAxisAngle(UP, sp.yaw); tmpM.compose(tmpV.set(sp.x + sp.sx * d, FLOOR + 0.06, sp.z + sp.cz * d), tmpQ, tmpS.set(f, 1, f)); packets.setMatrixAt(idx, tmpM); packets.setColorAt(idx, _PC.copy(s.col).multiplyScalar(2.2 * br));
    }
    const pk = (s.pulse ? 1.3 + 0.7 * Math.sin(t * s.pulse + ag.phase) : 1.0) * br; pedRing.setColorAt(i, _PC.copy(s.col).multiplyScalar(pk * 1.6)); pedGlow.setColorAt(i, _PC.copy(s.col).multiplyScalar(pk));
  }
  packets.instanceMatrix.needsUpdate = true; if (packets.instanceColor) packets.instanceColor.needsUpdate = true; if (pedRing.instanceColor) pedRing.instanceColor.needsUpdate = true; if (pedGlow.instanceColor) pedGlow.instanceColor.needsUpdate = true;
}
for (const isl of islands) { const ring = new THREE.Mesh(new THREE.TorusGeometry(HUB_R * 1.2, 0.028, 6, 72), MAT.neon); ring.rotation.x = Math.PI / 2; ring.position.set(isl.pos.x, FLOOR + 0.04, isl.pos.z); scene.add(ring); (isl.hubOld = isl.hubOld || []).push(ring); }

// ---------- the room (floor, walls, windows, planters, entrance, central platform + brain) and the amber routes with a pulse running along each ----------
const pulses = []; let room = null, surround = null;
async function buildScene() {
  room = await buildRoom(scene, { hubPos: new THREE.Vector3(0, 0, 0) });
  buildDecor(scene, islands, FLOOR);
  surround = buildSurround(scene, { zf: 32.45, room, viewH: H });
  const curves = buildRoutes(scene, new THREE.Vector3(0, 0, 0), islands);
  room.curves = curves; buildDrones(curves);
  curves.forEach((c, i) => { const pulse = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 1.7, 1.2) })); scene.add(pulse); pulses.push({ pulse, c, ph: Math.random(), speed: 0.045 + Math.random() * 0.02, dirn: i % 2 ? 1 : -1 }); });
}


// ---------- task drones: one shuttles along every hub <-> island route (the model and the eased dwell / fly cycle come from the office version) ----------
const drones = [], fliers = [], couriers = [];
async function buildDrones(curves) {
  let src = null; try { src = (await new GLTFLoader().loadAsync(BASE + 'ai-world/models/room/dp_drone_lite.glb')).scene; } catch (e) { console.warn('[map] no drone', e.message); return; }
  const parcelGeo = new THREE.BoxGeometry(0.3, 0.2, 0.3), parcelMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 0.9, 2.4) });
  curves.forEach((c, i) => {
    const o = src.clone(true); o.scale.setScalar(0.9); scene.add(o);
    const parcel = new THREE.Mesh(parcelGeo, parcelMat); parcel.position.set(0, -0.35, 0); o.add(parcel);
    drones.push({ o, c, parcel, rotL: o.getObjectByName('rotor_L'), rotR: o.getObjectByName('rotor_R'), t: -Math.random() * 6, phase: 'dwell', dir: 1, dur: 2 + Math.random() * 2, time: 0, len: c.cu.getLength(), spin: 0, yaw: 0, bob: Math.random() * 6, h: 3.2 + (i % 4) * 0.5 });
  });
  // free flyers: drones that just cruise over the whole base, high above the islands (closed smooth loops, each its own)
  const mkDrone = (sc) => { const o = src.clone(true); o.scale.setScalar(sc); scene.add(o); return { o, rotL: o.getObjectByName('rotor_L'), rotR: o.getObjectByName('rotor_R'), spin: Math.random() * 6, yaw: 0, roll: 0, bob: Math.random() * 6 }; };
  for (let i = 0; i < 5; i++) {
    const n = 7, pts = [], a0 = Math.random() * 6.28, dir = i % 2 ? 1 : -1;
    for (let k = 0; k < n; k++) { const a = a0 + dir * k / n * Math.PI * 2, r = 9 + Math.random() * 17; pts.push(new THREE.Vector3(Math.cos(a) * r, 8.5 + Math.random() * 3.2, Math.sin(a) * r * 0.92 + 1)); }
    const c = new THREE.CatmullRomCurve3(pts, true, 'centripetal'); fliers.push({ ...mkDrone(1.15), c, len: c.getLength(), u: Math.random(), v: 3.2 + Math.random() * 1.8 });
  }
  // couriers: out through the entrance door, along the bridge, through the gate arch, a lap over the plaza and back (outbound lane x +1.2, return lane x -1.2); the door opens in front of them
  { const pz = BRIDGE_PZ, P = (x, y, z) => new THREE.Vector3(x, y, z);
    const pts = [P(1.2, 2.6, 9), P(1.2, 2.6, 30), P(1.2, 2.2, 41), P(1.2, 2.4, 60), P(1.2, 2.6, 76), P(2.5, 3.0, pz - 4), P(7.5, 3.4, pz + 1), P(5, 3.8, pz + 8), P(-3, 3.8, pz + 9), P(-7.5, 3.4, pz + 2), P(-2.5, 3.0, pz - 4), P(-1.2, 2.6, 76), P(-1.2, 2.4, 60), P(-1.2, 2.2, 41), P(-1.2, 2.6, 30), P(-1.2, 2.6, 9), P(0, 2.9, 6.2)];
    const c = new THREE.CatmullRomCurve3(pts, true, 'centripetal'), len = c.getLength();
    for (let i = 0; i < 3; i++) { const d = mkDrone(1.0); const parcel = new THREE.Mesh(parcelGeo, parcelMat); parcel.position.set(0, -0.35, 0); d.o.add(parcel); couriers.push({ ...d, c, len, u: i / 3 + 0.02, v: 4.6, parcel }); } }
}
const sm = (t) => t * t * (3 - 2 * t), dv = new THREE.Vector3(), dn = new THREE.Vector3();
function updateDoors(dt) { // the entrance opens in front of a courier drone (10 m ahead) and shuts behind it; also for the shuttle drones at the door and when the owner clicks it
  const D = room && room.doors; if (!D) return; let near = false;
  for (const d of couriers) if (d.o.visible && Math.abs(d.o.position.z - D.pos.z) < 10 && Math.abs(d.o.position.x) < 6) { near = true; break; }
  if (!near) for (const d of drones) if (Math.hypot(d.o.position.x - D.pos.x, d.o.position.z - D.pos.z) < 8) { near = true; break; }
  D.target = D.manual || near ? 1 : 0; D.open += (D.target - D.open) * Math.min(1, dt * 2.6); if (Math.abs(D.target - D.open) < 0.002) D.open = D.target;
  const e = D.open * D.open * (3 - 2 * D.open); D.L.position.x = -D.slide * e; D.R.position.x = D.slide * e;
}
const _T = new THREE.Vector3();
function flyAlong(d, dt) { // moves a loop drone along its curve: heading from the tangent, banks into the turns, bobs a little
  d.spin += dt * 40; if (d.rotL) { d.rotL.rotation.y = d.spin; d.rotR.rotation.y = -d.spin; } d.bob += dt;
  d.u = (d.u + d.v * dt / d.len) % 1; const p = d.c.getPointAt(d.u); d.c.getTangentAt(d.u, _T);
  const a = Math.atan2(_T.x, _T.z); let da = a - d.yaw; da = Math.atan2(Math.sin(da), Math.cos(da)); d.yaw += da * Math.min(1, dt * 3); d.roll += (THREE.MathUtils.clamp(-da * 1.2, -0.35, 0.35) - d.roll) * Math.min(1, dt * 3);
  d.o.position.set(p.x, p.y + 0.06 * Math.sin(d.bob * 1.6), p.z); d.o.rotation.set(-_T.y * 0.4, d.yaw, d.roll, 'YXZ');
}
function updateDrones(dt) {
  const bridgeOn = !surround || surround.level === 2 || surround.level === 4; for (const d of couriers) d.o.visible = bridgeOn;
  for (const d of fliers) flyAlong(d, dt); if (bridgeOn) for (const d of couriers) { flyAlong(d, dt); if (d.parcel) d.parcel.visible = d.u < 0.5; }
  for (const d of drones) {
    d.spin += dt * 40; if (d.rotL) { d.rotL.rotation.y = d.spin; d.rotR.rotation.y = -d.spin; } d.bob += dt; d.t += dt;
    let u = d.dir > 0 ? 0 : 1;
    if (d.phase === 'dwell') { d.parcel.scale.setScalar(d.t < 0 ? 0 : Math.min(1, d.t / 0.8)); if (d.t >= d.dur) { d.phase = 'fly'; d.t = 0; d.time = d.len / 3.2; } }
    else { const k = Math.min(1, d.t / d.time); u = d.dir > 0 ? sm(k) : 1 - sm(k); if (k >= 1) { d.dir = -d.dir; d.phase = 'dwell'; d.t = 0; d.dur = 2 + Math.random() * 2; } }
    const q = d.c.cu.getPoint(Math.min(1, Math.max(0, u))), lift = Math.sin(Math.min(1, Math.max(0, u)) * Math.PI), y = 1.6 + (d.h - 1.6) * Math.min(1, lift * 3) + 0.06 * Math.sin(d.bob * 1.6);
    const q2 = d.c.cu.getPoint(Math.min(1, u + 0.02)), q1 = d.c.cu.getPoint(Math.max(0, u - 0.02)); dn.set(q2.x - q1.x, 0, q2.y - q1.y); if (dn.lengthSq() > 1e-6) { let a = Math.atan2(dn.x, dn.z); if (d.phase === 'fly' && d.dir < 0 || d.phase === 'dwell' && d.dir < 0) a += Math.PI; let da = a - d.yaw; da = Math.atan2(Math.sin(da), Math.cos(da)); d.yaw += da * Math.min(1, dt * 4); }
    d.o.position.set(q.x, y, q.y); d.o.rotation.set(0, d.yaw, 0);
  }
}

// ---------- HTML labels ----------
const iconUrl = (name) => glyphTexture(name, { badge: false, color: '#F6E9FA', size: 64 }).image.toDataURL();
// the section box over a work zone (owner's pick 2026-11-10, "capsule"): a medallion whose ring shows the LOAD (share of the working agents among the built ones), the name, "N agents · X working" and one dot per agent in the colour of its state; no % figure
const hexOf = (c) => '#' + new THREE.Color(c).getHexString();
function capHtml(icon, name, color, list, withPips = true) {
  const n = list.length, working = list.filter((a) => a.status === 0).length, built = list.filter((a) => a.status !== 3).length, p = built ? working / built : 0;
  const SZ = 46, W = 4, R = (SZ - W) / 2, C = 2 * Math.PI * R;
  const ring = `<svg width="${SZ}" height="${SZ}" viewBox="0 0 ${SZ} ${SZ}"><circle cx="${SZ / 2}" cy="${SZ / 2}" r="${R}" fill="rgba(255,255,255,.07)" stroke="rgba(255,255,255,.14)" stroke-width="${W}"/><circle cx="${SZ / 2}" cy="${SZ / 2}" r="${R}" fill="none" stroke="${color}" stroke-width="${W}" stroke-linecap="round" stroke-dasharray="${C * p} ${C}" transform="rotate(-90 ${SZ / 2} ${SZ / 2})" style="filter:drop-shadow(0 0 4px ${color})"/></svg>`;
  const pips = list.map((a) => `<i style="background:${STATUS[a.status].col.getStyle()}" title="${a.name.replace(/"/g, '&quot;')} · ${STATUS[a.status].name}"></i>`).join('');
  return `<div class="med">${ring}<img src="${iconUrl(icon)}" alt=""></div><div class="col"><b>${name}</b><small>${n} агентів · ${working} працює</small>${withPips ? `<div class="pips">${pips}</div>` : ''}</div>`;
}
const mkLabel = (icon, name, color, onclick) => { const el = document.createElement('div'); el.className = 'lbl'; el.style.setProperty('--tc', color); el.onclick = onclick; root.appendChild(el); el._cap = { icon, name, color }; return el; };
const labels = islands.map((isl) => mkLabel(isl.t.main, isl.t.name, hexOf(isl.t.color), () => flyTo(isl)));
const brainLbl = mkLabel('globe', 'Оркестратор', '#c9a6ff', () => flyHome()); 
function updateLabels() { // redone whenever the states change
  islands.forEach((isl, i) => { labels[i].innerHTML = capHtml(labels[i]._cap.icon, labels[i]._cap.name, labels[i]._cap.color, agents.filter((a) => a.team === isl)); });
  brainLbl.innerHTML = capHtml(brainLbl._cap.icon, brainLbl._cap.name, brainLbl._cap.color, agents, false);
}
updateLabels();
// overlap check of the islands (a console warning if two platforms touch)
for (let i = 0; i < islands.length; i++) for (let j = i + 1; j < islands.length; j++) { const d = islands[i].pos.distanceTo(islands[j].pos); if (d < islands[i].r + islands[j].r + 1) console.warn('[map] islands overlap', islands[i].t.key, islands[j].t.key, d.toFixed(1), (islands[i].r + islands[j].r).toFixed(1)); }
const proj = new THREE.Vector3();
function placeLabel(el, x, y, z) { proj.set(x, y, z).project(camera); if (proj.z > 1) { el.style.display = 'none'; return; } el.style.display = ''; el.style.left = ((proj.x * 0.5 + 0.5) * W()) + 'px'; el.style.top = ((-proj.y * 0.5 + 0.5) * H()) + 'px'; }

// ---------- camera flights ----------
let tween = null; const ease = (k) => k * k * (3 - 2 * k);
function flyTo(isl) {
  const tgt = isl.pos.clone().setY(1.2), dir = tgt.clone().setY(0).normalize(), pos = tgt.clone().addScaledVector(dir, isl.r * 1.05 + 3).setY(isl.r * 1.25 + 3);
  tween = { from: { t: controls.target.clone(), p: camera.position.clone() }, to: { t: tgt, p: pos }, t0: performance.now(), ms: 1000 }; distT = pos.distanceTo(tgt); hidePanel(); setFocused(isl);
}
function flyHome() { tween = { from: { t: controls.target.clone(), p: camera.position.clone() }, to: { t: HOME.tgt.clone(), p: HOME.pos.clone() }, t0: performance.now(), ms: 1000 }; distT = HOME_DIST; selected = -1; hidePanel(); setFocused(null); }
// the department the camera is at (owner 2026-11-11): told to the page, which shows the strip of departments
let focused = null;
function setFocused(isl) { if (isl === focused) return; focused = isl; if (opts.onFocusDept) opts.onFocusDept(isl ? isl.t.dept : null); }
const homeBtn = document.createElement('button'); homeBtn.type = 'button'; homeBtn.title = 'Додому (H)'; homeBtn.setAttribute('aria-label', 'Додому'); homeBtn.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11l9-8 9 8M5 10v10h5v-6h4v6h5V10"/></svg>';
Object.assign(homeBtn.style, { position: 'absolute', left: '20px', bottom: '24px', width: '44px', height: '44px', borderRadius: '14px', border: '1px solid rgba(235,156,239,0.4)', background: 'rgba(52,16,52,0.82)', color: '#F6E9FA', display: 'grid', placeItems: 'center', cursor: 'pointer', backdropFilter: 'blur(10px)' }); homeBtn.addEventListener('click', flyHome); homeBtn.className = 'am3-home'; root.appendChild(homeBtn);
const panel = document.createElement('div'); panel.className = 'am3-panel'; panel.innerHTML = '<b></b><p></p><button type="button" class="am3-open">Відкрити агента</button>'; root.appendChild(panel);
const pT = panel.querySelector('b'), pP = panel.querySelector('p'), pB = panel.querySelector('.am3-open'); let panelAgent = -1;
pB.addEventListener('click', () => { const ag = agents[panelAgent]; if (ag && ag.key && opts.onOpenAgent) opts.onOpenAgent(ag.deptKey, ag.key); });
function showPanel(a, b, agentIdx = -1) { pT.textContent = a; pP.textContent = b; panelAgent = agentIdx; pB.style.display = agentIdx >= 0 && agents[agentIdx].key && opts.onOpenAgent ? '' : 'none'; panel.style.display = 'block'; }
function hidePanel() { panel.style.display = 'none'; panelAgent = -1; }

on(window, 'keydown', (e) => { const tg = e.target; if (tg && (/^(INPUT|TEXTAREA|SELECT)$/.test(tg.tagName) || tg.isContentEditable)) return; if (e.key === 'Escape' || e.key === 'h' || e.key === 'H') flyHome(); });

// ---------- picking (a cheap invisible proxy sphere per robot) ----------
const ray = new THREE.Raycaster(), mouse = new THREE.Vector2(); let down = null;
function pick(e) { const rc = renderer.domElement.getBoundingClientRect(); mouse.set((e.clientX - rc.left) / rc.width * 2 - 1, -((e.clientY - rc.top) / rc.height) * 2 + 1); ray.setFromCamera(mouse, camera); const hit = ray.intersectObjects([proxy, boxProxy], false)[0]; return hit ? hit.instanceId : -1; }
renderer.domElement.addEventListener('pointermove', (e) => { const h = pick(e); if (h !== hovered) { hovered = h; renderer.domElement.style.cursor = h >= 0 ? 'pointer' : ''; } });
renderer.domElement.addEventListener('pointerdown', (e) => { down = [e.clientX, e.clientY]; });
renderer.domElement.addEventListener('pointerup', (e) => { if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 5) return; const h = pick(e); if (h >= 0) { selected = h; if (!agentNames.near(agents[h].team)) flyTo(agents[h].team); /* first the department, then the agent */ else if (agents[h].key && opts.onOpenAgent) { hidePanel(); opts.onOpenAgent(agents[h].deptKey, agents[h].key); } else showPanel(agents[h].name, `Команда: ${agents[h].team.t.name} · Статус: ${STATUS[agents[h].status].name}`, h); } else { const D = room && room.doors; ray.setFromCamera(mouse, camera); const fp = ray.ray.intersectPlane(FLOOR_PLANE, _FP), isl = fp ? islands.find((x) => Math.hypot(fp.x - x.pos.x, fp.z - x.pos.z) < x.r) : null; if (D && ray.intersectObjects([D.L, D.R], true).length) D.manual = !D.manual; else if (isl && !agentNames.near(isl)) flyTo(isl); /* a click on a department opens it */ else if (selected >= 0) { selected = -1; hidePanel(); } } });
const FLOOR_PLANE = new THREE.Plane(new THREE.Vector3(0, 1, 0), -FLOOR), _FP = new THREE.Vector3();

// ---------- loop ----------
function onResize() { const w = W(), h = H(); renderer.setSize(w, h); composer.setSize(w, h); if (room && room.reflector) { const rt = room.reflector.getRenderTarget(), rw = Math.max(256, Math.round(w * 0.5)), rh = Math.max(256, Math.round(h * 0.5)); rt.setSize(rw, rh); room.reflector.material.uniforms.uTexel.value.set(1 / rw, 1 / rh); } camera.aspect = w / h; camera.updateProjectionMatrix(); }
const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => onResize()) : null; if (ro) ro.observe(host);
const clock = new THREE.Clock(); let frames = 0, acc = 0;
function frame() {
  const dt = Math.min(clock.getDelta(), 0.1), t = clock.elapsedTime;
  if (tween) { const k = Math.min(1, (performance.now() - tween.t0) / tween.ms), e = ease(k); controls.target.lerpVectors(tween.from.t, tween.to.t, e); camera.position.lerpVectors(tween.from.p, tween.to.p, e); if (k >= 1) tween = null; }
  else { const off = camera.position.clone().sub(controls.target), cur = off.length(); if (Math.abs(distT - cur) > 0.01) { off.setLength(cur + (distT - cur) * Math.min(1, dt * 7)); camera.position.copy(controls.target).add(off); } }
  { const cur = camera.position.distanceTo(controls.target), kk = Math.max(0, Math.min(1, (cur - 30) / (HOME_DIST - 30))); controls.maxPolarAngle = 1.4 + (1.08 - 1.4) * kk; } // the farther, the less the camera may drop towards the horizon
  controls.enablePan = camera.position.distanceTo(controls.target) < 0.78 * HOME_DIST; // far away the view cannot be slid sideways at all, only turned round the room
  controls.update();
  if (!tween) { // far away the view stays on the building, closer it may roam the whole floor (+2 m beyond the walls); the target is eased back, not snapped
    const tg = controls.target, cur = camera.position.distanceTo(tg), x01 = Math.max(0, Math.min(1, (0.8 * HOME_DIST - cur) / (0.5 * HOME_DIST))), sm = x01 * x01 * (3 - 2 * x01), lx = sm * 35.5, lz = sm * 35.5; // the room is x -34.5..34.5, z -30.5..38 (with the forecourt): 1 m beyond it, centred on z 3.8
    const nx = Math.max(-lx, Math.min(lx, tg.x)), nz = Math.max(HOME_TGT.z * (1 - sm) + 3.8 * sm - lz, Math.min(HOME_TGT.z * (1 - sm) + 3.8 * sm + lz, tg.z)), ny = Math.max(-6, Math.min(8, tg.y)), e = Math.min(1, dt * 10), d = new THREE.Vector3((nx - tg.x) * e, (ny - tg.y) * e, (nz - tg.z) * e); camera.position.add(d); tg.add(d);
  }
  { const off = camera.position.clone().sub(controls.target), L = off.length(); if (L > MAX_D) camera.position.copy(controls.target).add(off.multiplyScalar(MAX_D / L)); } // never farther than the full view
  for (const isl of islands) { isl.holo.position.y = FLOOR + 3.1 + Math.sin(t * 1.1 + isl.t.a) * 0.06; isl.holo.children[1].rotation.y = t * 0.12; isl.orbit.rotation.y = t * 0.35; }
  if (room) { room.brain.rotation.y = t * 0.25; room.ring.rotation.y = -t * 0.1; }
  for (const p of pulses) { const u = (p.ph + t * p.speed) % 1, q = p.c.cu.getPoint(p.dirn > 0 ? u : 1 - u); p.pulse.position.set(q.x, 0.2, q.y); }
  screens.update(t); if (surround) surround.update(t, dt); updateRobots(t); updateStatus(t); updateConduits(t); updateDrones(dt); updateDoors(dt);
  islands.forEach((isl, i) => placeLabel(labels[i], isl.pos.x - isl.r * 0.45, 3.2, isl.pos.z - isl.r * 0.8)); placeLabel(brainLbl, 0, 9.6, 0); taskMarkers.update(); agentNames.update(); if (!tween) setFocused(agentNames.nearest());
  renderer.info.reset(); composer.render();
}
await Promise.all([buildAgents(), buildScene(), loadIslandHubs()]);
// the carriers of real tasks (taskMarkers.js): fed by the page through setTasks, placed every frame
const taskMarkers = createTaskMarkers({ root, camera, getSize: () => ({ w: W(), h: H() }), agents, floor: FLOOR, onOpen: (task) => { if (opts.onOpenTask) opts.onOpenTask(task); } });
// the names of the robots and the cross-fade with the department boxes (agentNames.js)
const agentNames = createAgentNames({ root, camera, getSize: () => ({ w: W(), h: H() }), agents, islands, boxes: labels, floor: FLOOR, statusOf: (a) => ({ color: STATUS[a.status].col.getStyle(), name: STATUS[a.status].name }), onOpen: (i) => { if (agents[i].key && opts.onOpenAgent) opts.onOpenAgent(agents[i].deptKey, agents[i].key); } });
let running = false;
function setPaused(p) { if (p && running) { renderer.setAnimationLoop(null); running = false; } else if (!p && !running) { clock.getDelta(); onResize(); renderer.setAnimationLoop(frame); running = true; } }
function applyStatuses() { // after the CRM states change: the colours baked at build time are redone (the desk lamps, the packets and the pedestals read agents[i].status every frame)
  updateLabels(); agentNames.refresh();
  agents.forEach((ag, i) => { const c = STATUS[ag.status].col.clone().multiplyScalar(0.7); cLines.setColorAt(i * 2, c); cLines.setColorAt(i * 2 + 1, c); if (screenMesh) screenMesh.setColorAt(i, _SC.setScalar(SCREEN_LIGHT[ag.status])); });
  if (cLines.instanceColor) cLines.instanceColor.needsUpdate = true; if (screenMesh && screenMesh.instanceColor) screenMesh.instanceColor.needsUpdate = true;
}
function setRunStatus(states) { if (!states) return; agents.forEach((ag) => { const st = ag.key ? states[ag.key] : null; if (st in STATE_IDX) ag.status = STATE_IDX[st]; }); applyStatuses(); if (selected >= 0 && panel.style.display !== 'none') showPanel(agents[selected].name, `Команда: ${agents[selected].team.t.name} · Статус: ${STATUS[agents[selected].status].name}`, selected); }
function selectDept(key) { const isl = islands.find((x) => x.t.dept === key); if (isl) flyTo(isl); else flyHome(); }
renderer.domElement.addEventListener('dblclick', (e) => { const h = pick(e); if (h >= 0 && agents[h].key && opts.onOpenAgent) opts.onOpenAgent(agents[h].deptKey, agents[h].key); });
onResize(); setPaused(false);
function dispose() {
  taskMarkers.dispose(); agentNames.dispose();
  setPaused(true); offs.forEach((f) => f()); if (ro) ro.disconnect();
  controls.dispose(); if (room && room.reflector) { room.reflector.getRenderTarget().dispose(); if (room.reflector.dispose) room.reflector.dispose(); }
  if (composer.dispose) composer.dispose(); renderer.dispose(); renderer.forceContextLoss(); root.remove();
}
return { setPaused, setRunStatus, setTasks: (list) => taskMarkers.set(list), selectDept, flyHome, dispose, resize: onResize, get agents() { return agents; } };
} // createAgentMap
