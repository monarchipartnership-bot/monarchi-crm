import { useCallback, useMemo } from 'react';
import { getBlockText, setBlockText } from '../../lib/presentation/deckOps';
import { nearestWeight, FONT_BY_ID } from '../../lib/presentation/fonts';
import { blockAllowsList, blockDefaults } from '../../lib/presentation/textDefaults';
import { MIXED, applyParaStyle, cmp, mapRunsInRange, paraText, readStyle, resetFormatting } from '../../lib/presentation/textModel';

// A caret with no selected text means "the whole block", like in a presentation editor
// where a selected text frame is formatted as one piece.
function effectiveRange(text, sel) {
  if (cmp(sel.start, sel.end) !== 0) return { start: sel.start, end: sel.end };
  const last = Math.max(text.paras.length - 1, 0);
  return { start: { p: 0, o: 0 }, end: { p: last, o: paraText(text.paras[last] || { runs: [] }).length } };
}

// The formatting of the selected block and the commands that change it.
export default function useTextCommands({ deck, update, sel, selRef, bus, rootRef }) {
  const info = useMemo(() => {
    if (!sel) return null;
    const text = getBlockText(deck, sel.blockId);
    if (!text) return null;
    const el = rootRef.current?.querySelector(`[data-block="${sel.blockId.replace(/"/g, '\\"')}"]`);
    const defaults = blockDefaults(el);
    const range = effectiveRange(text, sel);
    return { blockId: sel.blockId, defaults, style: readStyle(text, range.start, range.end, defaults), canList: blockAllowsList(sel.blockId) };
  }, [deck, sel, rootRef]);

  // fn(text, start, end) → new text. Keeps the person's selection after the block is rebuilt.
  const apply = useCallback((fn) => {
    const s = selRef.current;
    if (!s) return;
    bus.current.pending = { blockId: s.blockId, start: s.start, end: s.end };
    update((d) => {
      const tx = getBlockText(d, s.blockId);
      if (!tx) return d;
      const { start, end } = effectiveRange(tx, s);
      return setBlockText(d, s.blockId, fn(tx, start, end));
    });
  }, [update, selRef, bus]);

  const runFn = useCallback((fn) => apply((tx, a, b) => mapRunsInRange(tx, a, b, fn)), [apply]);
  const defaults = info?.defaults;
  const style = info?.style;

  const cmds = useMemo(() => ({
    font: (id) => runFn((r) => {
      const next = { ...r, f: id };
      if (r.w) next.w = nearestWeight(id, r.w);
      if (r.i && !FONT_BY_ID[id].italic) delete next.i;
      return next;
    }),
    size: (n) => runFn((r) => ({ ...r, s: n })),
    color: (c) => runFn((r) => ({ ...r, c })),
    spacing: (n) => runFn((r) => ({ ...r, ls: n })),
    weight: (w) => runFn((r) => ({ ...r, w: nearestWeight(r.f || defaults?.f || 'Onest', w) })),
    bold: () => {
      const on = style && style.w !== MIXED && style.w >= 600;
      runFn((r) => { const f = r.f || defaults?.f || 'Onest'; return { ...r, w: nearestWeight(f, on ? 400 : 700) }; });
    },
    italic: () => {
      const on = style?.i === true;
      runFn((r) => { const next = { ...r }; if (on) delete next.i; else next.i = true; return next; });
    },
    underline: () => {
      const on = style?.u === true;
      runFn((r) => { const next = { ...r }; if (on) delete next.u; else next.u = true; return next; });
    },
    align: (v) => apply((tx, a, b) => applyParaStyle(tx, a, b, { align: v })),
    lineHeight: (v) => apply((tx, a, b) => applyParaStyle(tx, a, b, { lh: v })),
    list: (kind) => apply((tx, a, b) => applyParaStyle(tx, a, b, { list: style?.list === kind ? null : kind })),
    reset: () => apply((tx) => resetFormatting(tx)),
  }), [runFn, apply, style, defaults]);

  const onKey = useCallback((blockId, k) => {
    if (selRef.current?.blockId !== blockId) return;
    if (k === 'b') cmds.bold();
    if (k === 'i') cmds.italic();
    if (k === 'u') cmds.underline();
  }, [cmds, selRef]);

  return { info, cmds, onKey };
}
