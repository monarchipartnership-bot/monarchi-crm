// Rich text of a slide block, as data (never as HTML): paragraphs made of runs.
//
//   Text = { paras: [ Para ] }
//   Para = { runs: [ Run ], align?: 'left'|'center'|'right', lh?: number, list?: 'bullet'|'number' }
//   Run  = { t, f?: fontId, w?: weight, i?: true, u?: true, s?: size (px on the 960x540 slide), c?: '#RRGGBB', ls?: letter-spacing px }
//
// A missing property means "inherit from the style of the block", so switching the
// presentation style restyles everything the person did not format by hand.
// Everything the editor, the preview, the PDF and the PPTX show comes from this.
import { FONT_BY_ID, MAX_SIZE, MIN_SIZE, nearestWeight } from './fonts';

export const MIXED = Symbol('mixed');
export const RUN_KEYS = ['f', 'w', 'i', 'u', 's', 'c', 'ls'];

export const text = (value = '') => ({
  paras: String(value).split(/\r?\n/).map((line) => ({ runs: line ? [{ t: line }] : [] })),
});

// Lines of text as list paragraphs ("- item", "1. item", "• item" markers are dropped).
export function listText(lines, list = 'bullet') {
  const clean = (lines || []).map((l) => String(l).replace(/^\s*(?:[-–•*]|\d+[.)])\s+/, '').trim()).filter(Boolean);
  return { paras: (clean.length ? clean : ['']).map((l) => ({ list, runs: l ? [{ t: l }] : [] })) };
}

export const paraText = (p) => p.runs.map((r) => r.t).join('');
export const plain = (tx) => (tx?.paras || []).map(paraText).join('\n');
export const isEmptyText = (tx) => !plain(tx).trim();

const sameRun = (a, b) => RUN_KEYS.every((k) => a[k] === b[k]);

export function normalizePara(p) {
  const runs = [];
  p.runs.forEach((r) => {
    if (!r.t) return;
    const last = runs[runs.length - 1];
    if (last && sameRun(last, r)) last.t += r.t;
    else runs.push({ ...r });
  });
  return { ...p, runs };
}

export const normalize = (tx) => ({ paras: (tx.paras.length ? tx.paras : [{ runs: [] }]).map(normalizePara) });

// ----- Positions: { p: paragraph index, o: character offset in it } ---------------
export function cmp(a, b) { return a.p - b.p || a.o - b.o; }
export function order(a, b) { return cmp(a, b) <= 0 ? [a, b] : [b, a]; }

// Splits the runs of one paragraph so that `o` falls on a run boundary; returns the index
// of the run starting at `o` (runs.length when o is at the end).
function splitAt(runs, o) {
  let pos = 0;
  for (let i = 0; i < runs.length; i += 1) {
    const len = runs[i].t.length;
    if (o === pos) return i;
    if (o < pos + len) {
      const head = { ...runs[i], t: runs[i].t.slice(0, o - pos) };
      const tail = { ...runs[i], t: runs[i].t.slice(o - pos) };
      runs.splice(i, 1, head, tail);
      return i + 1;
    }
    pos += len;
  }
  return runs.length;
}

// Calls fn(run) on every run inside [start, end] (a copy of the text is returned).
function mapRange(tx, start, end, fn) {
  const [a, b] = order(start, end);
  const paras = tx.paras.map((p, pi) => {
    if (pi < a.p || pi > b.p) return p;
    const runs = p.runs.map((r) => ({ ...r }));
    const from = pi === a.p ? a.o : 0;
    const to = pi === b.p ? b.o : paraText(p).length;
    if (from >= to) return p;
    const i0 = splitAt(runs, from);
    const i1 = splitAt(runs, to);
    for (let i = i0; i < i1; i += 1) runs[i] = fn(runs[i]);
    return normalizePara({ ...p, runs });
  });
  return { paras };
}

export const mapRunsInRange = mapRange;

// patch: { f, w, i, u, s, c, ls }; a key set to null/undefined clears the override.
export function applyRunStyle(tx, start, end, patch) {
  return mapRange(tx, start, end, (r) => {
    const next = { ...r };
    Object.keys(patch).forEach((k) => {
      if (!RUN_KEYS.includes(k)) return;
      if (patch[k] == null || patch[k] === false) delete next[k];
      else next[k] = patch[k];
    });
    return next;
  });
}

export function applyParaStyle(tx, start, end, patch) {
  const [a, b] = order(start, end);
  return {
    paras: tx.paras.map((p, i) => {
      if (i < a.p || i > b.p) return p;
      const next = { ...p };
      Object.keys(patch).forEach((k) => {
        if (patch[k] == null) delete next[k];
        else next[k] = patch[k];
      });
      return next;
    }),
  };
}

export function resetFormatting(tx) {
  return normalize({ paras: tx.paras.map((p) => ({ runs: p.runs.map((r) => ({ t: r.t })), ...(p.list ? { list: p.list } : {}) })) });
}

// ----- Reading the formatting of a selection -------------------------------------
// defaults: what the block shows with no overrides, { f, w, i, u, s, c, ls, align, lh }.
// Returns for every property its value, or MIXED when the selection holds several.
export function readStyle(tx, start, end, defaults) {
  const [a, b] = order(start, end);
  const collapsed = cmp(a, b) === 0;
  const seen = {};
  const add = (k, v) => { (seen[k] ||= new Set()).add(v); };
  const eff = (r, k) => (r[k] != null ? r[k] : defaults[k]);

  const visit = (r) => RUN_KEYS.forEach((k) => add(k, k === 'i' || k === 'u' ? Boolean(r[k] ?? defaults[k]) : eff(r, k)));

  for (let pi = a.p; pi <= b.p && pi < tx.paras.length; pi += 1) {
    const p = tx.paras[pi];
    const from = pi === a.p ? a.o : 0;
    const to = pi === b.p ? b.o : paraText(p).length;
    let pos = 0;
    let touched = false;
    p.runs.forEach((r) => {
      const rs = pos;
      const re = pos + r.t.length;
      pos = re;
      const inside = collapsed ? (from > rs && from <= re) || (from === 0 && rs === 0) : re > from && rs < to;
      if (inside && (!collapsed || !touched)) { visit(r); touched = true; }
    });
    if (!touched && p.runs.length === 0) RUN_KEYS.forEach((k) => add(k, k === 'i' || k === 'u' ? Boolean(defaults[k]) : defaults[k]));
    if (!touched && p.runs.length > 0 && collapsed) visit(p.runs[p.runs.length - 1]);
    add('align', p.align || defaults.align);
    add('lh', p.lh || defaults.lh);
    add('list', p.list || null);
  }
  const out = {};
  Object.keys(seen).forEach((k) => { out[k] = seen[k].size > 1 ? MIXED : [...seen[k]][0]; });
  return out;
}

// ----- Validation of values the person types -------------------------------------
export function normalizeHex(value) {
  let v = String(value || '').trim().replace(/^#/, '');
  if (/^[0-9a-f]{3}$/i.test(v)) v = v.split('').map((c) => c + c).join('');
  return /^[0-9a-f]{6}$/i.test(v) ? '#' + v.toUpperCase() : null;
}

export function clampSize(value) {
  const n = Math.round(Number(value));
  return Number.isFinite(n) ? Math.min(MAX_SIZE, Math.max(MIN_SIZE, n)) : null;
}

export function clampSpacing(value, min, max) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : null;
}

// A weight the family really has a file for (so the preview and the PDF never fake one).
export function supportedWeight(fontId, weight) {
  return nearestWeight(fontId, weight);
}

export function fontSupportsItalic(fontId) {
  return Boolean(FONT_BY_ID[fontId]?.italic);
}

// ----- Pasted text ----------------------------------------------------------------
// Pasted content is taken as plain text only, so nothing from another page (markup,
// scripts, styles, links) can reach a slide. Line breaks become paragraphs.
export function plainToParas(str) {
  return String(str || '').replace(/\r\n?/g, '\n').split('\n').map((line) => ({ runs: line ? [{ t: line }] : [] }));
}

// Replaces [start, end] with `str` (plain text, may hold line breaks), keeping the style of the run it lands in.
export function replaceRange(tx, start, end, str) {
  const [a, b] = order(start, end);
  const pieces = plainToParas(str);
  const before = tx.paras[a.p];
  const after = tx.paras[b.p];
  const head = sliceParaRuns(before, 0, a.o);
  const tail = sliceParaRuns(after, b.o, paraText(after).length);
  const styleRun = before.runs.find((r) => r.t) || {};
  const style = Object.fromEntries(RUN_KEYS.filter((k) => styleRun[k] != null).map((k) => [k, styleRun[k]]));
  const mid = pieces.map((p) => ({ ...p, runs: p.runs.map((r) => ({ ...style, t: r.t })) }));

  const merged = [];
  mid.forEach((p, i) => {
    let runs = p.runs;
    if (i === 0) runs = [...head, ...runs];
    if (i === mid.length - 1) runs = [...runs, ...tail];
    merged.push(normalizePara({ ...(i === 0 ? { align: before.align, lh: before.lh, list: before.list } : { list: before.list }), runs }));
  });
  const clean = merged.map((p) => Object.fromEntries(Object.entries(p).filter(([, v]) => v !== undefined)));
  const paras = [...tx.paras.slice(0, a.p), ...clean, ...tx.paras.slice(b.p + 1)];
  const last = clean.length - 1;
  const caret = { p: a.p + last, o: paraText(clean[last]).length - tail.reduce((n, r) => n + r.t.length, 0) };
  return { text: { paras }, caret };
}

function sliceParaRuns(p, from, to) {
  const out = [];
  let pos = 0;
  p.runs.forEach((r) => {
    const rs = pos;
    const re = pos + r.t.length;
    pos = re;
    const s = Math.max(from, rs);
    const e = Math.min(to, re);
    if (e > s) out.push({ ...r, t: r.t.slice(s - rs, e - rs) });
  });
  return out;
}

// Replaces the whole text with a plain string (the input fields of the Data panel), keeping the
// formatting of the first run so a shared field keeps its look when edited from the side panel.
export function setPlain(tx, str) {
  const first = tx?.paras?.flatMap((p) => p.runs).find((r) => r.t) || {};
  const style = Object.fromEntries(RUN_KEYS.filter((k) => first[k] != null).map((k) => [k, first[k]]));
  const align = tx?.paras?.[0]?.align;
  return { paras: String(str).split(/\r?\n/).map((l) => ({ ...(align ? { align } : {}), runs: l ? [{ ...style, t: l }] : [] })) };
}
