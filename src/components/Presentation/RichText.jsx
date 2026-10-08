import { useLayoutEffect, useRef } from 'react';
import { useEditor } from './editorContext';
import { FONT_BY_ID, fontCss, MAX_SIZE, MIN_SIZE } from '../../lib/presentation/fonts';
import { RUN_KEYS, normalize, normalizeHex, replaceRange } from '../../lib/presentation/textModel';

// ----- Model <-> style / DOM ---------------------------------------------------------
export function runCss(r) {
  const s = {};
  if (r.f) s.fontFamily = fontCss(r.f);
  if (r.w) s.fontWeight = r.w;
  if (r.i) s.fontStyle = 'italic';
  if (r.u) s.textDecoration = 'underline';
  if (r.s) s.fontSize = r.s + 'px';
  if (r.c) s.color = r.c;
  if (r.ls != null) s.letterSpacing = r.ls + 'px';
  return s;
}

const paraCss = (p) => ({ ...(p.align ? { textAlign: p.align } : {}), ...(p.lh ? { lineHeight: p.lh } : {}) });

// Only known keys with valid values survive (a pasted or corrupted attribute can't smuggle anything in).
function cleanRun(o) {
  const r = {};
  if (o && typeof o === 'object') {
    if (FONT_BY_ID[o.f]) r.f = o.f;
    if (Number.isFinite(o.w) && o.w >= 100 && o.w <= 900) r.w = o.w;
    if (o.i === true) r.i = true;
    if (o.u === true) r.u = true;
    if (Number.isFinite(o.s)) r.s = Math.min(MAX_SIZE, Math.max(MIN_SIZE, o.s));
    if (normalizeHex(o.c)) r.c = normalizeHex(o.c);
    if (Number.isFinite(o.ls)) r.ls = Math.min(5, Math.max(-1, o.ls));
  }
  return r;
}

const AL = ['left', 'center', 'right'];
const LISTS = ['bullet', 'number'];

export function buildDom(el, value) {
  el.textContent = '';
  const paras = value.paras.length ? value.paras : [{ runs: [] }];
  paras.forEach((p) => {
    const div = document.createElement('div');
    div.className = 'pt-p';
    if (p.list) div.dataset.list = p.list;
    if (p.align) div.dataset.align = p.align;
    if (p.lh) div.dataset.lh = String(p.lh);
    Object.assign(div.style, paraCss(p));
    if (!p.runs.length) div.appendChild(document.createElement('br'));
    p.runs.forEach((r) => {
      const span = document.createElement('span');
      span.textContent = r.t;
      const own = cleanRun(r);
      if (Object.keys(own).length) span.dataset.r = JSON.stringify(own);
      Object.assign(span.style, runCss(own));
      div.appendChild(span);
    });
    el.appendChild(div);
  });
}

function readRuns(node, inherited, out) {
  node.childNodes.forEach((n) => {
    if (n.nodeType === 3) {
      const t = n.nodeValue.replace(/[​\r\n]/g, '');
      if (t) out.push({ ...inherited, t });
    } else if (n.nodeType === 1 && n.tagName !== 'BR') {
      let st = inherited;
      if (n.dataset?.r) { try { st = cleanRun(JSON.parse(n.dataset.r)); } catch { st = inherited; } }
      readRuns(n, st, out);
    }
  });
}

// One paragraph per top-level child of the block (so paragraph index = child index).
export function domToText(el) {
  const paras = [];
  el.childNodes.forEach((n) => {
    const runs = [];
    if (n.nodeType === 3) {
      const t = n.nodeValue.replace(/[​\r\n]/g, '');
      if (t) runs.push({ t });
      paras.push({ runs });
      return;
    }
    if (n.nodeType !== 1) return;
    let base = {};
    if (n.dataset?.r) { try { base = cleanRun(JSON.parse(n.dataset.r)); } catch { base = {}; } }
    readRuns(n, base, runs);
    const para = { runs };
    if (LISTS.includes(n.dataset?.list)) para.list = n.dataset.list;
    if (AL.includes(n.dataset?.align)) para.align = n.dataset.align;
    const lh = Number(n.dataset?.lh);
    if (Number.isFinite(lh) && lh >= 1 && lh <= 2) para.lh = lh;
    paras.push(para);
  });
  return normalize({ paras });
}

// ----- Selection <-> offsets -------------------------------------------------------------
function topChild(el, node) {
  let n = node;
  while (n && n.parentNode !== el) n = n.parentNode;
  return n;
}

function posFromDom(el, node, offset) {
  if (node === el) return { p: Math.min(offset, Math.max(el.childNodes.length - 1, 0)), o: 0 };
  const top = topChild(el, node);
  if (!top) return { p: 0, o: 0 };
  const p = Array.prototype.indexOf.call(el.childNodes, top);
  const r = document.createRange();
  r.selectNodeContents(top);
  r.setEnd(node, offset);
  return { p, o: r.toString().replace(/​/g, '').length };
}

function domFromPos(el, pos) {
  const top = el.childNodes[Math.min(pos.p, el.childNodes.length - 1)];
  if (!top) return { node: el, offset: 0 };
  const walker = document.createTreeWalker(top, NodeFilter.SHOW_TEXT);
  let left = pos.o;
  let last = null;
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    last = n;
    if (left <= n.nodeValue.length) return { node: n, offset: left };
    left -= n.nodeValue.length;
  }
  return last ? { node: last, offset: last.nodeValue.length } : { node: top, offset: 0 };
}

export function setSelection(el, start, end) {
  const a = domFromPos(el, start);
  const b = domFromPos(el, end || start);
  const range = document.createRange();
  range.setStart(a.node, a.offset);
  range.setEnd(b.node, b.offset);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
}

// The selection inside an editable block: { blockId, start, end, rect } (or null).
export function readSelection() {
  const sel = window.getSelection();
  if (!sel || !sel.anchorNode) return null;
  const host = (sel.anchorNode.nodeType === 1 ? sel.anchorNode : sel.anchorNode.parentElement)?.closest?.('[data-rich]');
  if (!host || !host.contains(sel.focusNode)) return null;
  const a = posFromDom(host, sel.anchorNode, sel.anchorOffset);
  const f = posFromDom(host, sel.focusNode, sel.focusOffset);
  return { blockId: host.dataset.block, start: a, end: f };
}

// ----- Components --------------------------------------------------------------------------------
export function StaticText({ value }) {
  const paras = value?.paras?.length ? value.paras : [{ runs: [] }];
  return paras.map((p, i) => (
    <div key={i} className="pt-p" data-list={p.list} data-align={p.align} data-lh={p.lh} style={paraCss(p)}>
      {p.runs.length ? p.runs.map((r, j) => <span key={j} style={runCss(r)}>{r.t}</span>) : <br />}
    </div>
  ));
}

const isEmpty = (v) => !v?.paras?.some((p) => p.runs.some((r) => r.t));

// A text block of a slide. Editable in the editor; static (React elements) everywhere else.
export default function RichText({ id, value, className = '', placeholder = '', as: Tag = 'div' }) {
  const ed = useEditor();
  const ref = useRef(null);
  const emitted = useRef(null);
  const empty = isEmpty(value);
  const cls = `pt ${className}${empty && placeholder ? ' is-empty' : ''}${ed.editable && ed.selectedId === id ? ' is-selected' : ''}`;

  useLayoutEffect(() => {
    const el = ref.current;
    if (!ed.editable || !el) return;
    if (value === emitted.current) return; // this change came from typing in the block itself
    buildDom(el, value);
    emitted.current = null;
    const pending = ed.bus.current.pending;
    if (pending && pending.blockId === id) {
      ed.bus.current.pending = null;
      el.focus({ preventScroll: true });
      setSelection(el, pending.start, pending.end);
    }
  });

  if (!ed.editable) {
    return <Tag className={cls} data-ph={placeholder} data-block={id}><StaticText value={value} /></Tag>;
  }

  function onInput() {
    const next = domToText(ref.current);
    emitted.current = next;
    ed.onText(id, next);
  }

  function onKeyDown(e) {
    if (e.key === 'Escape') { e.currentTarget.blur(); return; }
    if (e.key === 'Enter' && e.shiftKey) { e.preventDefault(); document.execCommand('insertParagraph'); return; }
    if ((e.ctrlKey || e.metaKey) && ['b', 'i', 'u'].includes(e.key.toLowerCase())) {
      e.preventDefault();
      ed.onKey?.(id, e.key.toLowerCase());
    }
  }

  function onPaste(e) {
    e.preventDefault();
    const str = e.clipboardData?.getData('text/plain') || '';
    const sel = readSelection();
    if (!str || !sel || sel.blockId !== id) return;
    const current = domToText(ref.current);
    const { text, caret } = replaceRange(current, sel.start, sel.end, str);
    emitted.current = null;
    ed.bus.current.pending = { blockId: id, start: caret, end: caret };
    ed.onText(id, text);
  }

  return (
    <Tag
      ref={ref}
      className={cls}
      data-rich="1"
      data-block={id}
      data-ph={placeholder}
      contentEditable
      suppressContentEditableWarning
      spellCheck={false}
      onInput={onInput}
      onKeyDown={onKeyDown}
      onPaste={onPaste}
      onDrop={(e) => e.preventDefault()}
      onBeforeInput={(e) => { if (/^format/.test(e.nativeEvent.inputType || '')) e.preventDefault(); }}
      onFocus={() => ed.onFocusBlock(id)}
      onBlur={() => {
        // Clean up whatever the browser left behind (stray wrappers) once the person leaves the block.
        const el = ref.current;
        if (el) {
          const next = domToText(el);
          if (JSON.stringify(next) !== JSON.stringify(normalize(value))) { emitted.current = null; ed.onText(id, next); }
        }
        ed.onBlurBlock(id);
      }}
    />
  );
}

// A plain table cell / metric label: editable text without formatting.
export function PlainCell({ id, value, className = '', placeholder = '' }) {
  const ed = useEditor();
  const ref = useRef(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (el && document.activeElement !== el && el.textContent !== (value || '')) el.textContent = value || '';
  });
  if (!ed.editable) return <span className={`pc ${className}${value ? '' : ' is-empty'}`} data-ph={placeholder} data-pc="1">{value}</span>;
  return (
    <span
      ref={ref}
      className={`pc ${className}${value ? '' : ' is-empty'}`}
      data-ph={placeholder}
      data-cell={id}
      contentEditable
      suppressContentEditableWarning
      spellCheck={false}
      onInput={(e) => ed.onCell(id, e.currentTarget.textContent.replace(/[\r\n]+/g, ' '))}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === 'Escape') { e.preventDefault(); e.currentTarget.blur(); } }}
      onPaste={(e) => {
        e.preventDefault();
        const str = (e.clipboardData?.getData('text/plain') || '').replace(/[\r\n]+/g, ' ');
        document.execCommand('insertText', false, str);
      }}
      onDrop={(e) => e.preventDefault()}
      onFocus={() => ed.onFocusBlock(null)}
    />
  );
}

export { RUN_KEYS };
