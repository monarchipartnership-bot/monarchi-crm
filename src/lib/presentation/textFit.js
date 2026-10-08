// Estimates how tall a block of text is on a 960x540 slide, so long report texts are split
// into slides by what really fits, not by a character count. Pure (no DOM): the deck builder
// and the future AI agent both use it. The widths below are Onest's, the font every style uses
// for body text; they are rounded up a little on purpose, because a page that ends early looks
// fine and a page that overflows does not.

// Slide frame (see presentationSlides.css): content is 960 - 2*56 wide and 540 - 84 - 56 tall.
const CONTENT_H = 400;
const SAFETY_PX = 14;

// Height taken by the heading block (font * line-height + margin-bottom) in each style.
const HEADING_H = { 'monarchi-impact': 46 * 1.08 + 22, 'plum-editorial': 44 * 1.08 + 22 };
const HEADING_DEFAULT = 38 * 1.08 + 22;

const NARROW = new Set(Array.from("iIl|!.,:;'’`ії ()[]-–—/\\"));
const WIDE = new Set(Array.from('mwMWшщжюыМШЩЖЮЫ@%№'));

function charEm(ch) {
  if (ch === ' ') return 0.27;
  if (NARROW.has(ch)) return 0.32;
  if (WIDE.has(ch)) return 0.92;
  if (ch >= '0' && ch <= '9') return 0.6;
  if (ch !== ch.toLowerCase()) return 0.7; // capital
  return 0.58;
}

const textEm = (s) => Array.from(s).reduce((w, ch) => w + charEm(ch), 0);

// Number of lines `text` takes when wrapped at `widthPx` with `fontPx` type (word wrap, long words break).
export function lineCount(text, fontPx, widthPx) {
  const max = widthPx / fontPx;
  const space = charEm(' ');
  let lines = 1;
  let used = 0;
  String(text).split(/\s+/).filter(Boolean).forEach((word) => {
    let w = textEm(word);
    if (used > 0 && used + space + w > max) { lines += 1; used = 0; }
    else if (used > 0) used += space;
    while (w > max) { lines += 1; w -= max; }
    used += w;
  });
  return lines;
}

// Text kinds of the slide: list (22px, bullets indented 1.5em, 10px between items) and paragraph (21px, 14px between).
const KINDS = {
  list: { font: 22, lh: 1.38, width: 820 - 33, gap: 10 },
  paragraph: { font: 21, lh: 1.45, width: 820, gap: 14 },
};

export function blockHeight(kind, text) {
  const k = KINDS[kind];
  return lineCount(text, k.font, k.width) * k.font * k.lh + k.gap;
}

export function pageBudget(style) {
  return CONTENT_H - (HEADING_H[style] ?? HEADING_DEFAULT) - SAFETY_PX;
}

// A single block taller than a whole page (rare: one huge paragraph) is cut at sentence ends, then at words.
function splitBlock(kind, text, budget) {
  if (blockHeight(kind, text) <= budget) return [text];
  const sentences = text.match(/[^.!?…]+[.!?…]+["»”)]*\s*|[^.!?…]+$/g) || [text];
  const parts = [];
  let cur = '';
  const push = () => { if (cur.trim()) parts.push(cur.trim()); cur = ''; };
  sentences.forEach((s) => {
    if (blockHeight(kind, s.trim()) > budget) {
      push();
      s.split(/\s+/).forEach((word) => {
        const next = cur ? cur + ' ' + word : word;
        if (cur && blockHeight(kind, next) > budget) push();
        cur = cur ? cur + ' ' + word : word;
      });
      return;
    }
    const next = cur + s;
    if (cur && blockHeight(kind, next.trim()) > budget) push();
    cur += s;
  });
  push();
  return parts;
}

// Splits blocks (list items or paragraphs) into pages that fit the slide. Pages are balanced afterwards,
// so 5 items that need 2 pages go 3 + 2 and not 4 + 1. `maxItems` caps a page regardless of height.
export function paginateBlocks(kind, blocks, style, maxItems = Infinity) {
  const budget = pageBudget(style);
  const items = blocks.flatMap((b) => splitBlock(kind, b, budget));
  const pages = [];
  let cur = [];
  let used = 0;
  items.forEach((it) => {
    const h = blockHeight(kind, it);
    if (cur.length && (used + h > budget || cur.length >= maxItems)) { pages.push(cur); cur = []; used = 0; }
    cur.push(it);
    used += h;
  });
  if (cur.length) pages.push(cur);
  if (pages.length < 2) return pages;

  // Balance: same number of pages, but move items from the longer page to the next while that evens them out.
  const heights = (p) => p.reduce((s, it) => s + blockHeight(kind, it), 0);
  for (let i = pages.length - 2; i >= 0; i -= 1) {
    while (pages[i].length > 1) {
      const last = pages[i][pages[i].length - 1];
      const h = blockHeight(kind, last);
      const a = heights(pages[i]);
      const b = heights(pages[i + 1]);
      if (b + h <= budget && pages[i + 1].length < maxItems && Math.abs((a - h) - (b + h)) < Math.abs(a - b)) {
        pages[i].pop();
        pages[i + 1].unshift(last);
      } else break;
    }
  }
  return pages;
}
