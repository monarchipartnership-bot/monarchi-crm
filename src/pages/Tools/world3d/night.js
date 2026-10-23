// Shared night state: how dark it is (0 day .. 1 night), the callbacks that follow it, and the glow textures/materials used for lamps, windows and vans.
import * as THREE from 'three';

export const NIGHT = { n: 0, hooks: [] };
export const onNight = (fn) => { NIGHT.hooks.push(fn); fn(NIGHT.n); };
export const hookMark = () => NIGHT.hooks.length; // a scene that is torn down drops the hooks it added (not the ones of this module)
export const hookTrim = (n) => { NIGHT.hooks.length = n; };
export const setNight = (n) => { NIGHT.n = n; NIGHT.hooks.forEach((f) => f(n)); };

function canvasTexture(w, h, draw) { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; }
const radial = (inner, mid, outer) => canvasTexture(128, 128, (g, w, h) => { const r = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2); r.addColorStop(0, inner); r.addColorStop(0.45, mid); r.addColorStop(1, outer); g.fillStyle = r; g.fillRect(0, 0, w, h); });

export const poolTex = radial('rgba(255,238,215,.95)', 'rgba(255,200,235,.38)', 'rgba(255,190,230,0)'); // warm pool of light on the ground
export const haloTex = radial('rgba(255,244,222,1)', 'rgba(255,214,235,.45)', 'rgba(255,200,230,0)'); // glow round a bulb
export const washTex = canvasTexture(8, 64, (g, w, h) => { const l = g.createLinearGradient(0, 0, 0, h); l.addColorStop(0, 'rgba(255,190,245,0)'); l.addColorStop(1, 'rgba(255,205,250,.95)'); g.fillStyle = l; g.fillRect(0, 0, w, h); }); // light washing up a wall
export const beamTex = canvasTexture(128, 32, (g, w, h) => { const l = g.createLinearGradient(0, 0, w, 0); l.addColorStop(0, 'rgba(255,246,205,.95)'); l.addColorStop(1, 'rgba(255,246,205,0)'); g.fillStyle = l; g.fillRect(0, 0, w, h); g.globalCompositeOperation = 'destination-in'; const v = g.createLinearGradient(0, 0, 0, h); v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(0.5, 'rgba(0,0,0,1)'); v.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = v; g.fillRect(0, 0, w, h); }); // headlight beam

export function additive(map, color) { return new THREE.MeshBasicMaterial({ map, color, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }); }
export const wallWash = additive(washTex, 0xff9bec), doorPool = additive(poolTex, 0xffd6f6), beamMat = additive(beamTex, 0xfff0c4);
onNight((n) => { wallWash.opacity = 0.5 * n; doorPool.opacity = 0.75 * n; beamMat.opacity = 0.8 * n; });
