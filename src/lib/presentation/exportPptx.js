import PptxGenJS from 'pptxgenjs';
import { toJpeg } from 'html-to-image';
import { renderForExport } from './exportCommon.jsx';
import { FONT_BY_ID } from './fonts';
import { getBlockText } from './deckOps';
import { fontIdFromFamily } from './textDefaults';
import { SLIDE_H, SLIDE_W } from '../../components/Presentation/SlideView';

const PX = 96; // 960 px = 10 in
const PT = 0.75; // 1 px = 0.75 pt

const hex = (rgb) => {
  const m = String(rgb).match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (!m) return 'FFFFFF';
  return [m[1], m[2], m[3]].map((n) => Number(n).toString(16).padStart(2, '0')).join('').toUpperCase();
};

// Header / body fills of the tables, flattened onto the dark slide background (PowerPoint has no alpha fills here).
const TABLE = { head: '632063', odd: '2B0A2B', even: '341234', line: '5E3A5E' };

function relRect(el, base) {
  const r = el.getBoundingClientRect();
  return { x: (r.left - base.left) / PX, y: (r.top - base.top) / PX, w: r.width / PX, h: r.height / PX };
}

// Text of one block / cell as PowerPoint text runs, honouring everything the person formatted by hand.
function blockRuns(el, tx, ctx) {
  const cs = getComputedStyle(el);
  const baseSize = parseFloat(cs.fontSize) || 18;
  const upper = cs.textTransform === 'uppercase';
  const fontOf = (id) => { const f = FONT_BY_ID[id] || FONT_BY_ID.Onest; return ctx.safeFonts ? f.safe : f.pptx; };
  const def = {
    f: fontIdFromFamily(cs.fontFamily), w: Number(cs.fontWeight) || 400, i: cs.fontStyle === 'italic', s: baseSize,
    c: hex(cs.color), ls: parseFloat(cs.letterSpacing) || 0, align: ['center', 'right'].includes(cs.textAlign) ? cs.textAlign : 'left',
    lh: (cs.lineHeight === 'normal' ? 1.2 : parseFloat(cs.lineHeight) / baseSize),
  };
  const firstP = el.querySelector('.pt-p');
  const after = firstP ? (parseFloat(getComputedStyle(firstP).marginBottom) || 0) + (parseFloat(getComputedStyle(firstP).paddingBottom) || 0) : 0;

  const out = [];
  tx.paras.forEach((p, pi) => {
    const runs = p.runs.length ? p.runs : [{ t: ' ' }];
    runs.forEach((r, ri) => {
      const f = r.f || def.f;
      const w = r.w || def.w;
      const text = upper ? r.t.toUpperCase() : r.t;
      const options = {
        fontFace: fontOf(f), fontSize: Math.round((r.s || def.s) * PT * 10) / 10, color: ((r.c || '#' + def.c).replace('#', '')).toUpperCase(),
        bold: w >= 600, italic: Boolean(r.i || def.i), charSpacing: Math.round(((r.ls != null ? r.ls : def.ls) * PT) * 10) / 10,
        align: p.align || def.align, lineSpacingMultiple: Math.min(3, Math.max(0.5, p.lh || def.lh)),
        paraSpaceAfter: Math.round(after * PT * 10) / 10, breakLine: ri === runs.length - 1 && pi < tx.paras.length - 1,
      };
      if (r.u) options.underline = { style: 'sng' };
      if (p.list === 'bullet') options.bullet = { indent: 20 };
      if (p.list === 'number') options.bullet = { type: 'number', indent: 24 };
      out.push({ text, options });
    });
  });
  return out;
}

function plainRuns(el, ctx) {
  const t = { paras: [{ runs: [{ t: el.textContent }] }] };
  return blockRuns(el, t, ctx);
}

function collectTexts(slideEl, deck, ctx) {
  const base = slideEl.getBoundingClientRect();
  const shapes = [];
  slideEl.querySelectorAll('[data-block], [data-pc]').forEach((el) => {
    if (el.closest('table')) return;
    let runs;
    if (el.dataset.block) {
      const tx = getBlockText(deck, el.dataset.block);
      if (!tx || !tx.paras.some((p) => p.runs.some((r) => r.t))) return;
      runs = blockRuns(el, tx, ctx);
    } else {
      if (!el.textContent.trim()) return;
      runs = plainRuns(el, ctx);
    }
    const r = relRect(el, base);
    shapes.push({ runs, x: r.x, y: r.y, w: Math.min(r.w + 0.06, SLIDE_W / PX - r.x), h: r.h + 0.04 });
  });
  return shapes;
}

function collectImages(slideEl) {
  const base = slideEl.getBoundingClientRect();
  return [...slideEl.querySelectorAll('[data-pptx-img] img')].map((img) => {
    const r = relRect(img, base);
    return { data: img.src.replace(/^data:/, ''), ...r };
  });
}

function collectTables(slideEl, ctx) {
  const base = slideEl.getBoundingClientRect();
  return [...slideEl.querySelectorAll('table.ps-table')].map((table) => {
    const r = relRect(table, base);
    const heads = [...table.querySelectorAll('thead th')];
    const bodyRows = [...table.querySelectorAll('tbody tr')];
    const cell = (td, kind, rowIdx) => {
      const cs = getComputedStyle(td);
      const f = FONT_BY_ID[fontIdFromFamily(cs.fontFamily)] || FONT_BY_ID.Onest;
      return {
        text: td.textContent || ' ',
        options: {
          fontFace: ctx.safeFonts ? f.safe : f.pptx, fontSize: Math.round(parseFloat(cs.fontSize) * PT * 10) / 10, bold: Number(cs.fontWeight) >= 600,
          color: hex(cs.color), align: cs.textAlign === 'right' ? 'right' : 'left', valign: 'middle',
          fill: { color: kind === 'head' ? TABLE.head : rowIdx % 2 ? TABLE.even : TABLE.odd },
          margin: [0.03, 0.12, 0.03, 0.12],
        },
      };
    };
    const rows = [heads.map((h) => cell(h, 'head', 0)), ...bodyRows.map((tr, i) => [...tr.children].map((td) => cell(td, 'body', i)))];
    const rowH = [heads[0].parentElement.getBoundingClientRect().height / PX, ...bodyRows.map((tr) => tr.getBoundingClientRect().height / PX)];
    return { rows, x: r.x, y: r.y, w: r.w, colW: heads.map((h) => h.getBoundingClientRect().width / PX), rowH };
  });
}

// Editable PowerPoint file: a picture of the decoration behind each slide plus real text
// boxes and tables on top (positions are read from the same drawing the editor shows).
// Fonts are not embedded: the person opening the file needs them installed. `safeFonts`
// swaps the brand fonts for Arial / Arial Narrow / Georgia so it looks right anywhere.
export async function exportPptx(deck, fileBase, { safeFonts = true, returnBlob = false } = {}) {
  const out = await renderForExport(deck);
  try {
    if (!out.slides.length) throw new Error('У презентації немає видимих слайдів.');
    const ctx = { safeFonts };
    const measured = out.slides.map((el) => ({ texts: collectTexts(el, deck, ctx), tables: collectTables(el, ctx), images: collectImages(el) }));

    out.host.classList.add('pres-bgonly');
    const opts = { width: SLIDE_W, height: SLIDE_H, pixelRatio: 2, quality: 0.9, backgroundColor: '#270827' };
    await toJpeg(out.slides[0], opts).catch(() => null);

    const pptx = new PptxGenJS();
    pptx.layout = 'LAYOUT_16x9';
    pptx.title = fileBase;
    for (let i = 0; i < out.slides.length; i += 1) {
      const bg = await toJpeg(out.slides[i], opts);
      const slide = pptx.addSlide();
      slide.background = { data: bg.replace(/^data:/, '') };
      measured[i].images.forEach((im) => slide.addImage({ data: im.data, x: im.x, y: im.y, w: im.w, h: im.h }));
      measured[i].tables.forEach((t) => {
        slide.addTable(t.rows, { x: t.x, y: t.y, w: t.w, colW: t.colW, rowH: t.rowH, border: { type: 'solid', pt: 0.5, color: TABLE.line } });
      });
      measured[i].texts.forEach((t) => {
        slide.addText(t.runs, { x: t.x, y: t.y, w: t.w, h: t.h, margin: 0, valign: 'top', fit: 'none', wrap: true });
      });
    }
    if (returnBlob) return pptx.write({ outputType: 'blob' });
    await pptx.writeFile({ fileName: `${fileBase}.pptx` });
    return null;
  } finally {
    out.cleanup();
  }
}
