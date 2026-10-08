import { FONTS } from './fonts';
import { normalizeHex } from './textModel';

// What a block looks like with no overrides (its slide style), read from the browser, so the
// toolbar can show real values and know whether bold / italic is already on.
function rgbToHex(rgb) {
  const m = String(rgb).match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (!m) return normalizeHex(rgb) || '#F9EDF9';
  return '#' + [m[1], m[2], m[3]].map((n) => Number(n).toString(16).padStart(2, '0')).join('').toUpperCase();
}

export function fontIdFromFamily(family) {
  const first = String(family).split(',')[0].replace(/['"]/g, '').trim().toLowerCase();
  return FONTS.find((f) => f.css.split(',')[0].replace(/['"]/g, '').trim().toLowerCase() === first)?.id || 'Onest';
}

export function blockDefaults(el) {
  if (!el) return { f: 'Onest', w: 400, i: false, u: false, s: 18, c: '#F9EDF9', ls: 0, align: 'left', lh: 1.4 };
  const cs = getComputedStyle(el);
  const size = parseFloat(cs.fontSize) || 18;
  const lh = cs.lineHeight === 'normal' ? 1.2 : parseFloat(cs.lineHeight) / size;
  return {
    f: fontIdFromFamily(cs.fontFamily),
    w: Number(cs.fontWeight) || 400,
    i: cs.fontStyle === 'italic',
    u: false,
    s: Math.round(size),
    c: rgbToHex(cs.color),
    ls: Math.round((parseFloat(cs.letterSpacing) || 0) * 10) / 10,
    align: ['center', 'right'].includes(cs.textAlign) ? cs.textAlign : 'left',
    lh: Math.round(lh * 100) / 100,
  };
}

// Blocks that never take lists (titles, headings, client / period lines).
export function blockAllowsList(blockId) {
  const key = blockId.slice(blockId.indexOf(':') + 1);
  return ['list', 'body', 'items'].includes(key);
}
