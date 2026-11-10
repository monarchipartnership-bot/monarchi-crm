// Vector glyphs for the holograms of the team hubs: each glyph is drawn once on a small canvas, becomes one shared texture and is used by every sprite that needs it. 100 x 100 design box.
import * as THREE from 'three';

const poly = (c, pts, close = true) => { c.beginPath(); pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); if (close) c.closePath(); c.stroke(); };
const circ = (c, x, y, r) => { c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.stroke(); };
const rrect = (c, x, y, w, h, r = 6) => { c.beginPath(); c.roundRect(x, y, w, h, r); c.stroke(); };
const line = (c, x1, y1, x2, y2) => { c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke(); };
const ell = (c, x, y, rx, ry) => { c.beginPath(); c.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); c.stroke(); };

export const GLYPHS = {
  megaphone: (c) => { poly(c, [[18, 42], [38, 42], [80, 20], [80, 80], [38, 58], [18, 58]]); line(c, 34, 60, 40, 84); },
  play: (c) => poly(c, [[36, 24], [36, 76], [78, 50]]),
  image: (c) => { rrect(c, 16, 24, 68, 52); circ(c, 36, 42, 6); poly(c, [[20, 70], [44, 50], [60, 62], [72, 54], [82, 66]], false); },
  chat: (c) => { rrect(c, 14, 22, 72, 46, 12); poly(c, [[34, 68], [28, 86], [50, 68]], false); },
  people: (c) => { circ(c, 50, 34, 14); c.beginPath(); c.arc(50, 88, 28, Math.PI, Math.PI * 2); c.stroke(); },
  heart: (c) => { c.beginPath(); c.moveTo(50, 82); c.bezierCurveTo(8, 52, 22, 16, 50, 36); c.bezierCurveTo(78, 16, 92, 52, 50, 82); c.stroke(); },
  plane: (c) => { poly(c, [[14, 50], [88, 18], [60, 82], [48, 58]]); line(c, 48, 58, 88, 18); },
  chart: (c) => { line(c, 24, 82, 24, 56); line(c, 50, 82, 50, 34); line(c, 76, 82, 76, 18); },
  trend: (c) => { poly(c, [[14, 76], [40, 50], [58, 62], [86, 26]], false); poly(c, [[68, 26], [86, 26], [86, 44]], false); },
  magnifier: (c) => { circ(c, 44, 44, 26); line(c, 63, 63, 88, 88); },
  key: (c) => { circ(c, 32, 50, 16); line(c, 48, 50, 90, 50); line(c, 76, 50, 76, 64); line(c, 86, 50, 86, 62); },
  link: (c) => { c.save(); c.translate(50, 50); c.rotate(-0.6); rrect(c, -42, -13, 44, 26, 13); rrect(c, -2, -13, 44, 26, 13); c.restore(); },
  person: (c) => { circ(c, 50, 32, 15); c.beginPath(); c.arc(50, 90, 30, Math.PI * 1.1, Math.PI * 1.9); c.stroke(); },
  phone: (c) => { rrect(c, 30, 10, 40, 80, 8); line(c, 44, 78, 56, 78); },
  mail: (c) => { rrect(c, 14, 26, 72, 48, 6); poly(c, [[16, 30], [50, 56], [84, 30]], false); },
  check: (c) => poly(c, [[26, 52], [43, 70], [76, 30]], false),
  document: (c) => { poly(c, [[28, 14], [60, 14], [76, 30], [76, 86], [28, 86]]); line(c, 38, 52, 66, 52); line(c, 38, 66, 66, 66); },
  briefcase: (c) => { rrect(c, 14, 34, 72, 48, 6); rrect(c, 38, 20, 24, 14, 4); line(c, 14, 56, 86, 56); },
  target: (c) => { circ(c, 50, 50, 36); circ(c, 50, 50, 21); circ(c, 50, 50, 6); },
  coins: (c) => { ell(c, 50, 30, 26, 10); ell(c, 50, 48, 26, 10); ell(c, 50, 66, 26, 10); line(c, 24, 30, 24, 66); line(c, 76, 30, 76, 66); },
  gear: (c) => { circ(c, 50, 50, 22); circ(c, 50, 50, 8); for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; line(c, 50 + Math.cos(a) * 26, 50 + Math.sin(a) * 26, 50 + Math.cos(a) * 38, 50 + Math.sin(a) * 38); } },
  headset: (c) => { c.beginPath(); c.arc(50, 52, 32, Math.PI, Math.PI * 2); c.stroke(); rrect(c, 14, 50, 14, 24, 5); rrect(c, 72, 50, 14, 24, 5); c.beginPath(); c.moveTo(78, 74); c.quadraticCurveTo(76, 90, 52, 90); c.stroke(); },
  refresh: (c) => { c.beginPath(); c.arc(50, 50, 30, 0.3, Math.PI * 1.55); c.stroke(); poly(c, [[44, 14], [64, 22], [46, 32]], false); },
  layers: (c) => { poly(c, [[50, 18], [86, 36], [50, 54], [14, 36]]); poly(c, [[14, 52], [50, 70], [86, 52]], false); poly(c, [[14, 68], [50, 86], [86, 68]], false); },
  org: (c) => { rrect(c, 36, 12, 28, 18, 4); line(c, 50, 30, 50, 48); line(c, 22, 48, 78, 48); line(c, 22, 48, 22, 62); line(c, 78, 48, 78, 62); line(c, 50, 48, 50, 62); rrect(c, 10, 62, 24, 18, 4); rrect(c, 38, 62, 24, 18, 4); rrect(c, 66, 62, 24, 18, 4); },
  bulb: (c) => { circ(c, 50, 40, 24); line(c, 40, 72, 60, 72); line(c, 43, 82, 57, 82); },
  brush: (c) => { line(c, 28, 78, 76, 24); circ(c, 28, 78, 8); },
  film: (c) => { rrect(c, 14, 24, 72, 52, 5); line(c, 30, 24, 30, 76); line(c, 70, 24, 70, 76); poly(c, [[42, 38], [42, 62], [60, 50]]); },
  wave: (c) => { c.beginPath(); for (let x = 12; x <= 88; x += 2) { const y = 50 + Math.sin((x - 12) / 76 * Math.PI * 4) * 22 * Math.sin((x - 12) / 76 * Math.PI); x === 12 ? c.moveTo(x, y) : c.lineTo(x, y); } c.stroke(); },
  flask: (c) => poly(c, [[42, 14], [58, 14], [58, 40], [82, 82], [18, 82], [42, 40]]),
  calendar: (c) => { rrect(c, 16, 24, 68, 60, 6); line(c, 16, 42, 84, 42); line(c, 34, 16, 34, 30); line(c, 66, 16, 66, 30); },
  funnel: (c) => poly(c, [[14, 22], [86, 22], [58, 52], [58, 84], [42, 74], [42, 52]]),
  globe: (c) => { circ(c, 50, 50, 36); ell(c, 50, 50, 16, 36); line(c, 14, 50, 86, 50); },
};

const cache = new Map();
// a glyph texture: `badge` = a round dark plate with a ring (an orbiting icon), otherwise the bare glyph (the big icon in the middle)
export function glyphTexture(name, { badge = true, color = '#e6d4ff', size = 128 } = {}) {
  const key = `${name}|${badge}|${color}|${size}`; if (cache.has(key)) return cache.get(key);
  const cv = document.createElement('canvas'); cv.width = cv.height = size; const c = cv.getContext('2d'); c.scale(size / 100, size / 100);
  if (badge) { c.fillStyle = 'rgba(60,24,120,0.55)'; c.beginPath(); c.arc(50, 50, 47, 0, Math.PI * 2); c.fill(); c.strokeStyle = 'rgba(199,109,255,0.95)'; c.lineWidth = 3.5; c.beginPath(); c.arc(50, 50, 46, 0, Math.PI * 2); c.stroke(); c.save(); c.translate(50, 50); c.scale(0.56, 0.56); c.translate(-50, -50); }
  c.strokeStyle = color; c.lineWidth = badge ? 7 : 5; c.lineCap = 'round'; c.lineJoin = 'round'; c.shadowColor = 'rgba(199,109,255,0.9)'; c.shadowBlur = badge ? 0 : 6;
  (GLYPHS[name] || GLYPHS.globe)(c); if (badge) c.restore();
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; cache.set(key, t); return t;
}
