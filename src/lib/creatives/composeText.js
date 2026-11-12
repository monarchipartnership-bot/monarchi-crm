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
// padK: the margin from the edge as a share of the width (the style of the project may change it; 0.07 is the default).
export function zoneBox(zone, W, H, maxW = Infinity, span = null, padK = 0.07) {
  const pad = Math.round(W * padK);
  const side = (w) => Math.max(Math.round(W * 0.22), Math.min(w, maxW));
  if (zone === 'right') { const w = side(Math.round(W * 0.5) - pad); return { x: W - pad - w, y: Math.round(H * 0.1), w, h: Math.round(H * 0.8), align: 'left' }; }
  if (zone === 'top') return { x: span ? span.x : pad, y: pad, w: span ? span.w : W - 2 * pad, h: Math.round(H * 0.36), align: 'left' };
  if (zone === 'bottom') return { x: span ? span.x : pad, y: Math.round(H * 0.62), w: span ? span.w : W - 2 * pad, h: Math.round(H * 0.3), align: 'left' };
  if (zone === 'center') return { x: Math.round(W * 0.15), y: Math.round(H * 0.3), w: Math.round(W * 0.7), h: Math.round(H * 0.4), align: 'center' };
  return { x: pad, y: Math.round(H * 0.1), w: side(Math.round(W * 0.5) - pad), h: Math.round(H * 0.8), align: 'left' }; // left (the default)
}

// The positions of every line, pill and the button inside the box: { items: [{ kind, x, y, w, h, lines, size, weight }] } where y is the top of the item.
// measure(text, size, weight) → width. Sizes follow the width of the picture (1080 px wide = headline 64 px).
export function layoutText({ measure, W, H, zone, headline, subline, badge, cta, maxW = Infinity, span = null, fit = 1, padK = 0.07 }) {
  const box = zoneBox(zone, W, H, maxW, span, padK);
  const k = (W / 1080) * fit; // fit < 1: smaller type, so the words fit the calm part of a picture
  const items = [];
  const gap = Math.round(26 * k);
  let y = 0;
  const textItem = (kind, text, size, weight, lineHeight) => {
    if (!text) return;
    const lines = wrapLines((t) => measure(t, size, weight), text, box.w);
    const h = Math.round(lines.length * size * lineHeight);
    const tw = Math.round(Math.max(...lines.map((l) => measure(l, size, weight))));
    items.push({ kind, lines, size, weight, x: box.x, y, w: box.w, tw, h, lineHeight });
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
  const left = Math.min(...items.map((it) => it.x));
  const right = Math.max(...items.map((it) => it.x + (it.kind === 'badge' || it.kind === 'cta' ? it.w : it.tw)));
  const rect = items.length ? { x: left, y: Math.min(...items.map((it) => it.y)), w: Math.max(1, right - left), h: Math.max(1, total) } : { x: box.x, y: box.y, w: 1, h: 1 };
  return { box, items, total, rect };
}


// ---------------------------------------------------------------------------------------------------------------- reading the picture (browser canvas or server canvas)
const lum = (d, i) => (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) / 255;
export const BUSY = 0.12; // above this share of «something is here» the zone is busy (hair, a face, a product): the words go on a dark veil
export const IN_THE_WAY = 0.004; // above this share even a small thing (a logo in a corner) is under the words: another place or a narrower stretch is tried

// How much of a rectangle is NOT the plain background: the share of the sampled pixels whose brightness differs from the median of the rectangle by more than a slow gradient or a
// vignette can explain. A smooth wall gives ~0, a logo in a corner a few percent, hair or a face tens of percent. → 0..1
export function busyOf(ctx, x, y, w, h) {
  try {
    const bw = Math.max(1, Math.round(w)); const bh = Math.max(1, Math.round(h));
    const d = ctx.getImageData(Math.round(x), Math.round(y), bw, bh).data;
    const stride = Math.max(1, Math.round(Math.sqrt((bw * bh) / 40000)));
    const vals = [];
    for (let r = 0; r < bh; r += stride) for (let c = 0; c < bw; c += stride) vals.push(lum(d, (r * bw + c) * 4));
    if (!vals.length) return 0;
    const sorted = [...vals].sort((p, q) => p - q);
    const median = sorted[Math.floor(sorted.length / 2)];
    return vals.filter((v) => Math.abs(v - median) > 0.14).length / vals.length;
  } catch { return 0.05; }
}

// The calmest of the four zones; the zone the brief names gets a head start (a person asked for it). → { zone, score }
export function pickZone(ctx, W, H, preferred = 'left') {
  const zones = ['top', 'bottom', 'left', 'right'];
  if (preferred === 'center') return { zone: 'center', score: busyOf(ctx, W * 0.15, H * 0.3, W * 0.7, H * 0.4) };
  let best = null;
  for (const z of zones) {
    const b = zoneBox(z, W, H);
    const score = busyOf(ctx, b.x, b.y, b.w, b.h);
    const weighted = z === preferred ? score * 0.8 : score;
    if (!best || weighted < best.weighted) best = { zone: z, score, weighted };
  }
  return { zone: best.zone, score: best.score };
}

// The longest calm stretch along a top or bottom zone (bands of columns whose brightness hardly changes): the words start there and stay inside it, so they do not run onto the
// logo in a corner or onto the subject. → { x, w } or null when the whole width is fine or nothing wide enough is calm.
export function calmSpan(ctx, W, H, zone, rows = null, padK = 0.07) {
  if (zone !== 'top' && zone !== 'bottom') return null;
  try {
    const box = { ...zoneBox(zone, W, H, Infinity, null, padK), ...(rows ? { y: Math.round(rows.y), h: Math.max(8, Math.round(rows.h)) } : {}) };
    const bands = 40;
    const bw = Math.max(1, Math.round(box.w / bands));
    const calm = [];
    for (let i = 0; i < bands; i += 1) {
      const d = ctx.getImageData(box.x + i * bw, box.y, bw, box.h).data;
      let sum = 0; let sq = 0; let n = 0;
      for (let p = 0; p < d.length; p += 4 * 13) { const l = lum(d, p); sum += l; sq += l * l; n += 1; }
      const mean = n ? sum / n : 0;
      calm.push(Math.sqrt(Math.max(0, (n ? sq / n : 0) - mean * mean)) <= 0.07);
    }
    let best = { start: 0, len: 0 }; let cur = { start: 0, len: 0 };
    calm.forEach((c, i) => { if (c) { if (!cur.len) cur.start = i; cur.len += 1; if (cur.len > best.len) best = { ...cur }; } else cur = { start: 0, len: 0 }; });
    if (best.len >= bands) return null; // everything is calm: the default width
    if (best.len < bands * 0.34) return null; // nothing wide enough: the words keep the default width and get the dark veil
    return { x: Math.round(box.x + best.start * bw), w: Math.round(best.len * bw) };
  } catch { return null; }
}

// ---------------------------------------------------------------------------------------------------------------- drawing
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

// Paints the words over a picture that is ALREADY drawn on ctx (a browser canvas or the canvas of the server, the same calls): the layout, the colour of the words by the brightness of the picture
// under them, a soft veil on that side, the pills of the badge and the button. → the layout (what was placed where).
// style: what the project's style decides (lib/agents/projectStyle.js composerOptions): { zoneLock, scale, plate: 'auto'|'on'|'off', plateAlpha, ink: 'auto'|'light'|'dark' }; what it leaves open the picture decides.
export function paintText(ctx, { W, H, zone: wanted = 'left', headline = '', subline = '', badge = '', cta = '', font = FONT, smart = true, style = null }) {
  const st = style || {};
  const asked = st.zoneLock || wanted; // a zone fixed by the style wins over the zone of the brief
  const padK = st.margin > 0 ? st.margin : 0.07; // the margin from the edge, a share of the width
  const measure = (t, size, weight) => { ctx.font = `${weight} ${size}px ${font}`; return ctx.measureText(t).width; };
  // the zone of the brief is a wish: the picture decides. Every zone is laid out for real and the picture is read under the rectangle the words would take (the zone of the brief has a head start);
  // a top or bottom zone narrows to the calm stretch when a logo or the subject is in the way.
  const maxW = (z) => calmWidth(ctx, W, H, z);
  const lay0 = (z, span = null, fit = 1) => layoutText({ measure, W, H, zone: z, headline, subline, badge, cta, maxW: maxW(z), span, fit, padK });
  // the picture is read under the words AND a margin around them (5% of the width): the words never touch a logo or the subject
  const mg = Math.round(W * 0.05);
  const readRect = (l) => { const x = Math.max(0, l.rect.x - mg); const y = Math.max(0, l.rect.y - Math.round(mg * 0.6)); return busyOf(ctx, x, y, Math.min(W - x, l.rect.w + 2 * mg), Math.min(H - y, l.rect.h + Math.round(mg * 1.2))); };
  let zone = asked; let lay = lay0(zone); let score = 0; let busy = false;
  if (smart) {
    let best = null;
    for (const z of (st.zoneLock ? [st.zoneLock] : asked === 'center' ? ['center'] : ['top', 'bottom', 'left', 'right'])) {
      for (const fit of (st.scale ? [st.scale] : [1, 0.85, 0.72, 0.6, 0.5])) { // a size fixed by the style is not shrunk; otherwise // smaller type when the calm place is small; the bigger the better
        const variants = [lay0(z, null, fit)];
        if (z === 'top' || z === 'bottom') { // and the same words narrowed to the calm stretch of their rows (a logo in a corner, the subject)
          const span = calmSpan(ctx, W, H, z, { y: variants[0].rect.y, h: variants[0].rect.h }, padK);
          if (span) variants.push(lay0(z, { x: span.x + Math.round(mg * 0.5), w: Math.max(Math.round(W * 0.25), span.w - Math.round(mg * 1.5)) }, fit));
        }
        let fitBest = null;
        for (const l of variants) {
          const sc = readRect(l);
          const lines = (l.items.find((it) => it.kind === 'headline')?.lines.length) || 1;
          const weighted = sc + Math.max(0, lines - 2) * 0.04 + (l.rect.w < W * 0.3 ? 0.03 : 0) + (z === asked ? 0 : 0.004) + (1 - fit) * 0.06; // a narrow column, a tall headline, small type: all worse than a wide calm place
          if (!best || weighted < best.weighted) best = { z, l, sc, weighted };
          if (!fitBest || sc < fitBest) fitBest = sc;
        }
        if (fitBest <= IN_THE_WAY) break; // fits here: no need for a smaller type
      }
    }
    zone = best.z; lay = best.l; score = best.sc; busy = score > BUSY;
  }
  // the picture under the words: dark → white words, light → near-black words, plus a soft veil on that side for legibility
  let lum = 0.5;
  try {
    const b = lay.rect;
    const d = ctx.getImageData(b.x, b.y, Math.max(1, b.w), Math.max(1, b.h)).data;
    let sum = 0; let n = 0;
    for (let i = 0; i < d.length; i += 4 * 37) { sum += (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) / 255; n += 1; }
    lum = n ? sum / n : 0.5;
  } catch { /* a picture that cannot be read: white words on a veil */ lum = 0.3; }
  let light = !busy && lum > 0.55; // true: dark words on a light picture
  if (st.plate === 'on' && st.ink !== 'dark') light = false; // a plate: a dark veil and white words, unless dark words were asked for
  if (st.ink === 'light') light = false; else if (st.ink === 'dark') light = true;
  const veil = st.plate === 'off' ? 0 : (st.plateAlpha ?? (busy ? 0.7 : 0.42));
  const ink = light ? '#1B0A22' : '#FFFFFF';
  const back = light ? '#FFFFFF' : '#1B0A22';
  const a = light ? 255 : 0;
  const horizontal = zone === 'left' || zone === 'right';
  const g = horizontal ? ctx.createLinearGradient(zone === 'left' ? 0 : W, 0, zone === 'left' ? W * 0.6 : W * 0.4, 0) : ctx.createLinearGradient(0, zone === 'bottom' ? H : 0, 0, zone === 'bottom' ? H * 0.55 : H * 0.5);
  g.addColorStop(0, `rgba(${a},${a},${a},${veil})`); g.addColorStop(1, `rgba(${a},${a},${a},0)`);
  if (veil > 0) { if (zone !== 'center') { ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); } else { ctx.fillStyle = `rgba(${a},${a},${a},${Math.min(0.9, veil * 0.55)})`; ctx.fillRect(lay.box.x - 24, lay.box.y, lay.box.w + 48, lay.box.h); } }
  ctx.textBaseline = 'top';
  for (const it of lay.items) {
    ctx.font = `${it.weight} ${it.size}px ${font}`;
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
  return { ...lay, zone, busy, asked, score };
}

// → a PNG Blob: the picture with the words over it (in the browser).
export async function composeText({ imageUrl, zone = 'left', headline = '', subline = '', badge = '', cta = '', maxSide = 4096 }) {
  const img = await loadImage(imageUrl);
  const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
  const W = Math.round(img.naturalWidth * scale);
  const H = Math.round(img.naturalHeight * scale);
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, W, H);
  try { await document.fonts.load(`800 40px ${FONT}`); await document.fonts.load(`500 30px ${FONT}`); } catch { /* the fallback font is fine */ }
  paintText(ctx, { W, H, zone, headline, subline, badge, cta });
  return new Promise((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Не вдалося зібрати картинку.'))), 'image/png'));
}
