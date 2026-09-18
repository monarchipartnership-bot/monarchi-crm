import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAnimatedOpen } from '../../lib/useAnimatedOpen';
import { useFloatingPosition } from '../../lib/useFloatingPosition';
import '../../styles/dropdownAnim.css';

export const DEFAULT_QUICK_COLORS = [
  '#7C3AED', '#2F80ED', '#0EA5E9', '#1E9E5D', '#059669',
  '#D97706', '#D14343', '#EC4899', '#8B5CF6', '#64748B',
];

// A wider palette for the "Свій колір" popover — the quick row above stays
// short on purpose (fast picks for the common cases), this is the fuller set.
export const PALETTE_COLORS = [
  '#7C3AED', '#2F80ED', '#0EA5E9', '#16A34A', '#059669', '#EA580C',
  '#DC2626', '#DB2777', '#C026D3', '#8B5CF6', '#64748B', '#A78BFA',
  '#93C5FD', '#86EFAC', '#FDBA74', '#F9A8D4', '#C4B5FD', '#4B5563',
];

const CLOSE_MS = 140;

const PALETTE_ICON = '<svg viewBox="0 0 24 24"><path d="M12 3a9 9 0 1 0 0 18c1.1 0 1.6-.6 1.6-1.5 0-.5-.2-.9-.5-1.2-.3-.3-.5-.7-.5-1.2 0-.9.7-1.6 1.6-1.6H16a5 5 0 0 0 5-5c0-4-4-7.5-9-7.5z"/><circle cx="7.5" cy="10.5" r="1.2"/><circle cx="10.5" cy="7" r="1.2"/><circle cx="15" cy="7.5" r="1.2"/><circle cx="17.5" cy="11" r="1.2"/></svg>';
const EYEDROPPER_ICON = '<svg viewBox="0 0 24 24"><path d="M15.5 2.5a3 3 0 0 1 4 4.5l-2 2 1.5 1.5-3 3-1.5-1.5-7 7H4v-3.5l7-7-1.5-1.5 3-3L14 4z"/></svg>';
const CHECK_ICON = '<svg viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5"/></svg>';
const CHEVRON_ICON = '<svg viewBox="0 0 24 24"><path d="m6 9 6 6 6-6"/></svg>';

const HEX_RE = /^#[0-9a-f]{6}$/i;
export const sameColor = (a, b) => (a || '').toLowerCase() === (b || '').toLowerCase();

// The "Свій колір" dropdown content — a wider preset grid plus a custom hex
// field (with an eyedropper when the browser supports it). Portaled the same
// way as DatePicker/Select so it can't get clipped by an ancestor's overflow
// or lose a stacking fight to a later sibling.
function ColorPickerPopover({ color, onPickPreset, onCustomChange, style, closing, placementTop, rootRef }) {
  const [hexDraft, setHexDraft] = useState(color);
  useEffect(() => { setHexDraft(color); }, [color]);

  function commitHex(v) {
    setHexDraft(v);
    if (HEX_RE.test(v)) onCustomChange(v);
  }

  async function pickWithEyedropper() {
    if (!window.EyeDropper) return;
    try {
      const res = await new window.EyeDropper().open();
      commitHex(res.sRGBHex);
    } catch { /* user cancelled the eyedropper — nothing to do */ }
  }

  return (
    <div ref={rootRef} className={'color-picker-pop' + (closing ? ' closing' : '') + (placementTop ? ' placement-top' : '')} style={style}>
      <div className="color-picker-grid">
        {PALETTE_COLORS.map((c) => (
          <button type="button" key={c} className="color-picker-swatch" style={{ background: c }} onClick={() => onPickPreset(c)} aria-label={c}>
            {sameColor(c, color) && <span dangerouslySetInnerHTML={{ __html: CHECK_ICON }} />}
          </button>
        ))}
      </div>
      <p className="color-picker-hint">Або оберіть свій колір</p>
      <div className="color-picker-custom-row">
        <button
          type="button" className="color-picker-eyedrop" onClick={pickWithEyedropper}
          disabled={!window.EyeDropper} title={window.EyeDropper ? 'Піпетка' : 'Піпетка не підтримується цим браузером'}
          dangerouslySetInnerHTML={{ __html: EYEDROPPER_ICON }}
        />
        <input type="text" value={hexDraft} onChange={(e) => commitHex(e.target.value)} />
        <span className="color-picker-preview" style={{ background: HEX_RE.test(hexDraft) ? hexDraft : 'transparent' }} />
      </div>
    </div>
  );
}

// Quick preset dots + the "Свій колір" dropdown + the current hex readout —
// the shared color-editing trio used by both the Pipeline and Stage manager
// modals, so both read as the same designated "box style" instead of two
// slightly different color pickers.
export function ColorPickerControl({ color, onChange, quickColors = DEFAULT_QUICK_COLORS }) {
  const containerRef = useRef(null);
  const popoverRef = useRef(null);
  const [open, setOpen] = useState(false);
  const rendered = useAnimatedOpen(open, CLOSE_MS);
  const pos = useFloatingPosition(containerRef, open, 6, 380);

  useEffect(() => {
    if (!open) return;
    // The popover itself is portaled to document.body, outside containerRef's
    // own subtree — without also excluding it here, clicking anything inside
    // it (the hex input, the eyedropper) would count as "outside" and close
    // the popover before the click on it even lands.
    function onDocClick(e) {
      if (containerRef.current?.contains(e.target)) return;
      if (popoverRef.current?.contains(e.target)) return;
      setOpen(false);
    }
    function onKeyDown(e) { if (e.key === 'Escape') setOpen(false); }
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <>
      <div className="pipeline-color-row">
        {quickColors.map((c) => (
          <button
            key={c} type="button" className={'pipeline-color-swatch' + (sameColor(c, color) ? ' active' : '')}
            style={{ background: c }} onClick={() => onChange(c)} aria-label={c}
          />
        ))}
      </div>
      <div className="pipeline-custom-wrap" ref={containerRef}>
        <button type="button" className={'pipeline-custom-btn' + (open ? ' open' : '')} onClick={() => setOpen((o) => !o)}>
          <span dangerouslySetInnerHTML={{ __html: PALETTE_ICON }} /> Свій колір
          <span className="pipeline-custom-chevron" dangerouslySetInnerHTML={{ __html: CHEVRON_ICON }} />
        </button>
        {rendered && createPortal(
          <ColorPickerPopover
            color={color}
            onPickPreset={(c) => { onChange(c); setOpen(false); }}
            onCustomChange={onChange}
            closing={!open} placementTop={pos.placement === 'top'} rootRef={popoverRef}
            style={{ position: 'fixed', top: pos.top, bottom: pos.bottom, left: pos.left }}
          />,
          document.body,
        )}
      </div>
      <div className="pipeline-hex-readout">
        <span className="pipeline-hex-code">{color.toUpperCase()}</span>
        <span className="pipeline-hex-swatch" style={{ background: color }} />
      </div>
    </>
  );
}
