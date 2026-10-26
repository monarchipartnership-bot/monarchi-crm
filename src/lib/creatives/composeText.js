// Puts the words of an ad (headline, subline, badge, button) over a CLEAN picture, in the browser. This is the way for the languages where the image model is
// not trusted to spell (text_render «overlay»): the words are exactly the strings of the brief, set in a real font, so Cyrillic is always right.
// Two layers: the pure layout (testable in Node, no canvas) and the drawing on a canvas.

export const ZONES = ['left', 'right', 'top', 'bottom', 'center'];

// Splits a text into lines no wider than maxWidth (measure(text) → width). A word that is wider than a line stays on a line of its own.
export function wrapLines(measure, text, maxWidth) {
  const words = String(text || '').split(/\s+/).filter(Boolean);
  const lines = [];
  let cur = '';
  for (const w of words) {
    const t = cur ? `${cur} ${w}` : w;
    if (!cur || measure(t) <= maxWidth) cur = t;
    else { lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);
  return lines;
}

// The free area of the picture for the words, by the zone the brief names. maxW (px): the width of the calm part of the picture beside the subject
// (found by looking at the picture), so the words do not run onto the subject; only for the side zones.
export function zoneBox(zone, W, H, maxW = Infinity) {
  const pad = Math.round(W * 0.07);
  const side = (w) => Math.max(Math.round(W * 0.22), Math.min(w, maxW));
  if (zone === 'right') { const w = side(Math.round(W * 0.5) - pad); return { x: W - pad - w, y: Math.round(H * 0.1), w, h: Math.round(H * 0.8), align: 'left' }; }
  if (zone === 'top') return { x: pad, y: pad, w: W - 2 * pad, h: Math.round(H * 0.36), align: 'left' };
  if (zone === 'bottom') return { x: pad, y: Math.round(H * 0.62), w: W - 2 * pad, h: Math.round(H * 0.3), align: 'left' };
  if (zone === 'center') return { x: Math.round(W * 0.15), y: Math.round(H * 0.3), w: Math.round(W * 0.7), h: Math.round(H * 0.4), align: 'center' };
  return { x: pad, y: Math.round(H * 0.1), w: side(Math.round(W * 0.5) - pad), h: Math.round(H * 0.8), align: 'left' }; // left (the default)
}

// The positions of every line, pill and the button inside the box: { items: [{ kind, x, y, w, h, lines, size, weight }] } where y is the top of the item.
// measure(text, size, weight) → width. Sizes follow the width of the picture (1080 px wide = headline 64 px).
export function layoutText({ measure, W, H, zone, headline, subline, badge, cta, maxW = Infinity }) {
  const box = zoneBox(zone, W, H, maxW);
  const k = W / 1080;
  const items = [];
  const gap = Math.round(26 * k);
  let y = 0;
  const textItem = (kind, text, size, weight, lineHeight) => {
    if (!text) return;
    const lines = wrapLines((t) => measure(t, size, weight), text, box.w);
    const h = Math.round(lines.length * size * lineHeight);
    items.push({ kind, lines, size, weight, x: box.x, y, w: box.w, h, lineHeight });
    y += h + gap;
  };
  // a pill (the badge, the button): the type shrinks (down to 62%) until the text fits the zone, then the text wraps inside the pill
  const pillItem = (kind, text, size, weight) => {
    if (!text) return;
    const padOf = (s) => Math.round(s * 0.9);
    let sz = size;
    while (sz > size * 0.62 && measure(text, sz, weight) + 2 * padOf(sz) > box.w) sz -= 1;
    const padX = padOf(sz);
    const padY = Math.round(sz * 0.55);
    const inner = Math.max(1, box.w - 2 * padX);
    const lines = measure(text, sz, weight) <= inner ? [text] : wrapLines((t) => measure(t, sz, weight), text, inner);
    const widest = Math.max(...lines.map((l) => measure(l, sz, weight)));
    const w = Math.min(box.w, Math.round(widest) + 2 * padX);
    const h = Math.round(sz + (lines.length - 1) * sz * 1.15 + 2 * padY);
    items.push({ kind, lines, size: sz, weight, x: box.x, y, w, h, padX, padY, lineHeight: 1.15 });
    y += h + gap;
  };
  textItem('headline', headline, Math.round(64 * k), 800, 1.12);
  textItem('subline', subline, Math.round(34 * k), 500, 1.3);
  pillItem('badge', badge, Math.round(30 * k), 800);
  pillItem('cta', cta, Math.round(32 * k), 800);
  const total = Math.max(0, y - gap);
  const top = zone === 'top' ? box.y : zone === 'bottom' ? Math.round(box.y + box.h - total) : Math.round(box.y + (box.h - total) / 2);
  items.forEach((it) => {
    it.y += top;
    if (box.align === 'center') it.x = Math.round(box.x + (box.w - (it.kind === 'badge' || it.kind === 'cta' ? it.w : box.w)) / 2);
  });
  return { box, items, total };
}

// ---------------------------------------------------------------------------------------------------------------- drawing (browser only)
const loadImage = (url) => new Promise((resolve, reject) => {
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload = () => resolve(img);
  img.onerror = () => reject(new Error('Не вдалося завантажити картинку для накладання тексту (перевірте, що вона збережена в сховищі).'));
  img.src = url;
});

const FONT = "'Onest', 'Inter', 'Segoe UI', Arial, sans-serif";

// How wide the calm part of the picture is beside the subject (left or right zone): bands of columns are scanned from the edge until the picture gets busy
// (the spread of the brightness is large: hair, a face, a product). → px; Infinity when the zone is not a side one or the picture cannot be read.
function calmWidth(ctx, W, H, zone) {
  if (zone !== 'left' && zone !== 'right') return Infinity;
  try {
    const box = zoneBox(zone, W, H);
    const bands = 24;
    const bw = Math.max(1, Math.round((W * 0.6) / bands));
    for (let i = 0; i < bands; i += 1) {
      const x = zone === 'left' ? i * bw : W - (i + 1) * bw;
      const d = ctx.getImageData(x, box.y, bw, box.h).data;
      let sum = 0; let sq = 0; let n = 0;
      for (let p = 0; p < d.length; p += 4 * 11) { const l = (0.2126 * d[p] + 0.7152 * d[p + 1] + 0.0722 * d[p + 2]) / 255; sum += l; sq += l * l; n += 1; }
      const mean = n ? sum / n : 0;
      if (Math.sqrt(Math.max(0, (n ? sq / n : 0) - mean * mean)) > 0.07) return Math.max(0, i * bw - Math.round(W * 0.07));
    }
    return Infinity;
  } catch { return Infinity; }
}

// → a PNG Blob: the picture with the words over it. The colour of the words follows the brightness of the picture under them.
export async function composeText({ imageUrl, zone = 'left', headline = '', subline = '', badge = '', cta = '', maxSide = 2048 }) {
  const img = await loadImage(imageUrl);
  const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
  const W = Math.round(img.naturalWidth * scale);
  const H = Math.round(img.naturalHeight * scale);
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, W, H);
  try { await document.fonts.load(`800 40px ${FONT}`); await document.fonts.load(`500 30px ${FONT}`); } catch { /* the fallback font is fine */ }
  const measure = (t, size, weight) => { ctx.font = `${weight} ${size}px ${FONT}`; return ctx.measureText(t).width; };
  const lay = layoutText({ measure, W, H, zone, headline, subline, badge, cta, maxW: calmWidth(ctx, W, H, zone) });
  // the picture under the words: dark → white words, light → near-black words, plus a soft veil on that side for legibility
  let lum = 0.5;
  try {
    const b = lay.box;
    const d = ctx.getImageData(b.x, b.y, Math.max(1, b.w), Math.max(1, b.h)).data;
    let sum = 0; let n = 0;
    for (let i = 0; i < d.length; i += 4 * 37) { sum += (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) / 255; n += 1; }
    lum = n ? sum / n : 0.5;
  } catch { /* a picture the browser does not let us read: white words on a veil */ lum = 0.3; }
  const light = lum > 0.55;
  const ink = light ? '#1B0A22' : '#FFFFFF';
  const back = light ? '#FFFFFF' : '#1B0A22';
  const a = light ? 255 : 0;
  const horizontal = zone === 'left' || zone === 'right';
  const g = horizontal ? ctx.createLinearGradient(zone === 'left' ? 0 : W, 0, zone === 'left' ? W * 0.6 : W * 0.4, 0) : ctx.createLinearGradient(0, zone === 'bottom' ? H : 0, 0, zone === 'bottom' ? H * 0.55 : H * 0.5);
  g.addColorStop(0, `rgba(${a},${a},${a},0.42)`); g.addColorStop(1, `rgba(${a},${a},${a},0)`);
  if (zone !== 'center') { ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); } else { ctx.fillStyle = `rgba(${a},${a},${a},0.22)`; ctx.fillRect(lay.box.x - 24, lay.box.y, lay.box.w + 48, lay.box.h); }
  ctx.textBaseline = 'top';
  for (const it of lay.items) {
    ctx.font = `${it.weight} ${it.size}px ${FONT}`;
    if (it.kind === 'badge' || it.kind === 'cta') {
      const r = Math.min(it.h / 2, it.size * 1.4);
      ctx.beginPath(); ctx.roundRect(it.x, it.y, it.w, it.h, r);
      if (it.kind === 'cta') { ctx.fillStyle = ink; ctx.fill(); ctx.fillStyle = back; } else { ctx.lineWidth = Math.max(2, it.size * 0.09); ctx.strokeStyle = ink; ctx.stroke(); ctx.fillStyle = ink; }
      it.lines.forEach((line, i) => ctx.fillText(line, it.x + it.padX, it.y + it.padY + i * it.size * it.lineHeight));
    } else {
      ctx.fillStyle = ink;
      it.lines.forEach((line, i) => ctx.fillText(line, it.x, it.y + i * it.size * it.lineHeight));
    }
  }
  return new Promise((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Не вдалося зібрати картинку.'))), 'image/png'));
}
