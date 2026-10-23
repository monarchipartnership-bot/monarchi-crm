// The Mon'Archi logo (public/logo/*.svg) drawn into canvases so it can sit on signs, walls and vans in the 3D scene.
import * as THREE from 'three';
import { BASE } from './paths.js';

const load = (src) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });

export async function loadLogos() {
  const [full, emblem] = await Promise.all([load(BASE + 'logo/header_logo.svg'), load(BASE + 'logo/emblem.svg')]);
  const mk = (img, w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; c.getContext('2d').drawImage(img, 0, 0, w, h); return c; };
  return { fullCanvas: mk(full, 1488, 320), emblemCanvas: mk(emblem, 512, 512), ratio: 186 / 40 };
}
const tex = (c) => { const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t; };

// a white plaque with the full logo (the headquarters sign and the wall of the headquarters)
export function logoPlaqueTex(logo) {
  const c = document.createElement('canvas'); c.width = 1600; c.height = 344; const g = c.getContext('2d');
  g.fillStyle = '#ffffff'; g.beginPath(); g.roundRect(0, 0, c.width, c.height, 60); g.fill();
  g.strokeStyle = '#b544b5'; g.lineWidth = 14; g.beginPath(); g.roundRect(7, 7, c.width - 14, c.height - 14, 54); g.stroke();
  const w = 1380, h = w / logo.ratio; g.drawImage(logo.fullCanvas, (c.width - w) / 2, (c.height - h) / 2, w, h);
  return tex(c);
}
// the sign over a door: a plum plate with the emblem in a white badge and the name of the department
export function signTexLogo(text, logo) {
  const c = document.createElement('canvas'); c.width = 640; c.height = 128; const g = c.getContext('2d');
  g.fillStyle = '#661466'; g.fillRect(0, 0, c.width, c.height); g.fillStyle = '#b544b5'; g.fillRect(0, 0, c.width, 10);
  g.fillStyle = '#fff'; g.beginPath(); g.arc(72, 68, 46, 0, 7); g.fill(); g.drawImage(logo.emblemCanvas, 36, 32, 72, 72);
  g.fillStyle = '#fff'; g.font = '800 52px Onest, Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, 380, 72);
  return tex(c);
}
// a round decal of the emblem for the vans
export function emblemDecal(logo) { return tex(logo.emblemCanvas); }
