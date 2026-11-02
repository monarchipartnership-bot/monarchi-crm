import { useRef, useState } from 'react';
import Select from '../common/Select';

// What a person can do with a metric row of a table (the report builder, the workspace of a report): drag it up or down (the row follows the pointer, the others make
// room, on release it settles), click it to get ⇄ (replace) and × (remove) to its left, Alt + ↑ / ↓ on the focused name moves it for the keyboard.
// `tools` = { onChange(action, key, toKey, toIndex), options(key) } (see lib/reportMetricOps.js for what the actions mean); null turns everything off.
// The table keeps its own markup and takes the pieces from here: rowAttrs (ref, style, class of the <tr>), cellAttrs (drag start on the first cell), toolbar, name, replaceBox.
const SETTLE_MS = 160;

export function useRowTools(tools) {
  const [sel, setSel] = useState(null); // the metric row that is picked
  const [replacing, setReplacing] = useState(false);
  const rowEls = useRef(new Map());
  const skipClick = useRef(false);
  const [drag, setDrag] = useState(null); // { key, from, to, dy, h, settling }

  const act = (action, key, toKey, toIndex) => { setReplacing(false); if (action === 'remove' || action === 'replace') setSel(null); tools.onChange(action, key, toKey, toIndex); };

  function startRowDrag(e, key, from, rowKeys) {
    if (!tools || e.button !== 0 || e.target.closest('.mt-tools, .mt-replace, .crh-eye, .rt-eye')) return;
    const rects = rowKeys.map((k) => rowEls.current.get(k)?.getBoundingClientRect());
    if (rects.some((r) => !r)) return;
    const startY = e.clientY;
    const h = rects[from].height;
    const mids = rects.map((r) => r.top + r.height / 2);
    let started = false;
    let last = { to: from, dy: 0 };
    const move = (ev) => {
      const dy = ev.clientY - startY;
      if (!started && Math.abs(dy) < 6) return; // a click is not a drag
      started = true;
      const centre = mids[from] + dy;
      const to = mids.filter((m, i) => i !== from && m < centre).length; // the place in the new order: how many other rows are above the dragged one
      last = { to, dy };
      setDrag({ key, from, to, dy, h, settling: false });
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      if (!started) return;
      skipClick.current = true;
      setTimeout(() => { skipClick.current = false; }, 0);
      const { to } = last;
      const slot = to > from ? rects[to].top + rects[to].height - h : rects[to].top; // where the row ends up
      setDrag({ key, from, to, dy: slot - rects[from].top, h, settling: true });
      setTimeout(() => { setDrag(null); if (to !== from) act('move', key, null, to); }, SETTLE_MS);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  }

  const rowStyle = (rowIndex, key) => {
    if (!drag) return undefined;
    const base = { position: 'relative' };
    if (key === drag.key) return { ...base, transform: `translateY(${drag.dy}px)`, transition: drag.settling ? `transform ${SETTLE_MS}ms ease` : 'none', zIndex: 3, boxShadow: '0 8px 22px rgba(104,39,104,.25)', background: '#fff' };
    const shift = drag.from < drag.to && rowIndex > drag.from && rowIndex <= drag.to ? -drag.h : drag.from > drag.to && rowIndex >= drag.to && rowIndex < drag.from ? drag.h : 0;
    return { ...base, transform: shift ? `translateY(${shift}px)` : 'none', transition: `transform ${SETTLE_MS}ms ease` };
  };

  return {
    on: Boolean(tools),
    // the <tr>: the ref the drag measures, the style while dragging, the classes (`own`: the table's own class, e.g. the eye's «off»)
    rowAttrs: (key, ri, own = '') => ({
      ref: (el) => { if (el) rowEls.current.set(key, el); else rowEls.current.delete(key); },
      style: rowStyle(ri, key),
      className: (own + (tools && sel === key ? ' crh-picked' : '') + (tools ? ' mt-row' : '') + (drag?.key === key ? ' mt-dragging' : '')).trim() || undefined,
    }),
    // the first cell starts the drag
    cellAttrs: (key, ri, rowKeys) => (tools ? { onPointerDown: (e) => startRowDrag(e, key, ri, rowKeys) } : {}),
    toolbar: (key, label) => (tools && sel === key ? (
      <span className="mt-tools" role="toolbar" aria-label={`Дії з метрикою ${label}`}>
        <button type="button" className={'mt-tool' + (replacing ? ' on' : '')} aria-expanded={replacing} aria-label="Замінити" title="Замінити" onClick={() => setReplacing((v) => !v)}>&#8644;</button>
        <button type="button" className="mt-tool mt-tool--bad" aria-label="Видалити" title="Видалити" onClick={() => act('remove', key)}>&times;</button>
      </span>
    ) : null),
    name: (key, label) => (tools ? (
      <button type="button" className="mt-name" aria-pressed={sel === key} title="Перетягніть вгору чи вниз, щоб змінити порядок; натисніть, щоб замінити або видалити" onKeyDown={(e) => { if (e.altKey && e.key === 'ArrowUp') { e.preventDefault(); act('up', key); } else if (e.altKey && e.key === 'ArrowDown') { e.preventDefault(); act('down', key); } }} onClick={() => { if (skipClick.current) return; setReplacing(false); setSel(sel === key ? null : key); }}>{label}</button>
    ) : label),
    replaceBox: (key, label) => (tools && sel === key && replacing ? (
      <div className="mt-replace">
        <Select value="" searchable placeholder="Замінити на…" ariaLabel={`Замінити метрику ${label}`} options={tools.options(key)} onChange={(to) => to && act('replace', key, to)} />
      </div>
    ) : null),
  };
}
