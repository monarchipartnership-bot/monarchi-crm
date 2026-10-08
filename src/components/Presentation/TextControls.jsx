import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import ActionIcon from '../common/ActionIcon';
import { FONTS, FONT_BY_ID, MAX_SIZE, MIN_SIZE, SIZE_PRESETS, WEIGHT_LABELS, fontCss, nearestWeight } from '../../lib/presentation/fonts';
import { MIXED, clampSize, normalizeHex } from '../../lib/presentation/textModel';

// Keeps the caret in the slide text while a toolbar button is pressed.
export const keepFocus = (e) => e.preventDefault();

const SWATCHES = ['#F9EDF9', '#FFFFFF', '#EBC6EB', '#F08CF0', '#BF46BF', '#AE40AE', '#682768', '#270827', '#FFD166', '#7DD3FC'];

// Popover under a trigger, outside any clipping parent, closing on outside press / Escape.
export function Popover({ anchor, onClose, children, width = 240 }) {
  const ref = useRef(null);
  const [pos, setPos] = useState(null);
  useLayoutEffect(() => {
    const r = anchor.current?.getBoundingClientRect();
    if (!r) return;
    const left = Math.min(Math.max(8, r.left), window.innerWidth - width - 8);
    const below = r.bottom + 6;
    const top = below + 280 > window.innerHeight ? Math.max(8, r.top - 6 - 280) : below;
    setPos({ left, top });
  }, [anchor, width]);
  useEffect(() => {
    const down = (e) => { if (!ref.current?.contains(e.target) && !anchor.current?.contains(e.target)) onClose(); };
    const key = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('mousedown', down);
    document.addEventListener('keydown', key);
    return () => { document.removeEventListener('mousedown', down); document.removeEventListener('keydown', key); };
  }, [anchor, onClose]);
  if (!pos) return null;
  return createPortal(
    <div ref={ref} className="pb-pop" style={{ left: pos.left, top: pos.top, width }} onMouseDown={(e) => { if (!/INPUT|TEXTAREA/.test(e.target.tagName)) e.preventDefault(); }}>{children}</div>,
    document.body,
  );
}

// ----- Font ------------------------------------------------------------------------------------
export function FontMenu({ value, onChange, compact }) {
  const [open, setOpen] = useState(false);
  const btn = useRef(null);
  const label = value === MIXED ? 'Змішано' : value;
  return (
    <>
      <button ref={btn} type="button" className={'pb-select' + (compact ? ' compact' : '')} onMouseDown={keepFocus} onClick={() => setOpen((o) => !o)} aria-haspopup="listbox" aria-expanded={open} aria-label="Шрифт" style={{ fontFamily: value === MIXED ? undefined : fontCss(value) }}>
        <span>{label}</span><ActionIcon name="chevron" size={16} />
      </button>
      {open && (
        <Popover anchor={btn} onClose={() => setOpen(false)} width={300}>
          <ul className="pb-fontlist" role="listbox" aria-label="Шрифт">
            {['brand', 'standard'].map((g) => (
              <li key={g} className="pb-fontgroup">
                <div className="pb-fontgroup-name">{g === 'brand' ? 'Фірмові' : 'Стандартні (як у PowerPoint)'}</div>
                {FONTS.filter((f) => f.group === g).map((f) => (
                  <button key={f.id} type="button" role="option" aria-selected={value === f.id} className={'pb-fontitem' + (value === f.id ? ' on' : '')} onClick={() => { onChange(f.id); setOpen(false); }}>
                    <span style={{ fontFamily: f.css }}>{f.id}</span>
                    <span className="pb-fontsample" style={{ fontFamily: f.css }}>Аа Abc</span>
                    {value === f.id && <ActionIcon name="select" size={16} />}
                  </button>
                ))}
              </li>
            ))}
          </ul>
        </Popover>
      )}
    </>
  );
}

// ----- Size ---------------------------------------------------------------------------------------
export function SizeField({ value, onChange, compact }) {
  const [draft, setDraft] = useState(null);
  const [open, setOpen] = useState(false);
  const wrap = useRef(null);
  const shown = draft ?? (value === MIXED ? '' : String(value));
  const commit = () => {
    if (draft == null) return;
    const n = clampSize(draft);
    setDraft(null);
    if (n != null) onChange(n);
  };
  const step = (d) => { const base = value === MIXED ? 18 : value; const n = clampSize(base + d); if (n != null) onChange(n); };
  return (
    <div className={'pb-size' + (compact ? ' compact' : '')} ref={wrap}>
      <button type="button" className="pb-iconbtn" onMouseDown={keepFocus} onClick={() => step(-1)} aria-label="Зменшити розмір" disabled={value !== MIXED && value <= MIN_SIZE}>−</button>
      <input
        type="text" inputMode="numeric" value={shown} placeholder={value === MIXED ? '—' : ''} aria-label={`Розмір шрифту (${MIN_SIZE}–${MAX_SIZE})`}
        onChange={(e) => setDraft(e.target.value.replace(/[^\d]/g, '').slice(0, 3))}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commit(); } if (e.key === 'ArrowUp') { e.preventDefault(); step(1); } if (e.key === 'ArrowDown') { e.preventDefault(); step(-1); } }}
        onFocus={(e) => e.target.select()}
      />
      <button type="button" className="pb-iconbtn" onMouseDown={keepFocus} onClick={() => step(1)} aria-label="Збільшити розмір" disabled={value !== MIXED && value >= MAX_SIZE}>+</button>
      <button type="button" className="pb-iconbtn" onMouseDown={keepFocus} onClick={() => setOpen((o) => !o)} aria-label="Типові розміри" aria-expanded={open}><ActionIcon name="chevron" size={16} /></button>
      {open && (
        <Popover anchor={wrap} onClose={() => setOpen(false)} width={120}>
          <div className="pb-sizelist">{SIZE_PRESETS.map((n) => <button key={n} type="button" className={n === value ? 'on' : ''} onClick={() => { onChange(n); setOpen(false); }}>{n}</button>)}</div>
        </Popover>
      )}
    </div>
  );
}

// ----- Weight ---------------------------------------------------------------------------------------
export function WeightSelect({ fontId, value, onChange }) {
  const weights = (FONT_BY_ID[fontId === MIXED ? 'Onest' : fontId] || FONT_BY_ID.Onest).weights;
  const near = value === MIXED ? '' : String(nearestWeight(fontId === MIXED ? 'Onest' : fontId, value));
  return (
    <select className="pb-native" aria-label="Насиченість" value={near} onChange={(e) => onChange(Number(e.target.value))}>
      {value === MIXED && <option value="">Змішано</option>}
      {weights.map((w) => <option key={w} value={w}>{w} · {WEIGHT_LABELS[w] || ''}</option>)}
    </select>
  );
}

// ----- B I U -------------------------------------------------------------------------------------------
export function StyleButtons({ bold, italic, underline, italicDisabled, onBold, onItalic, onUnderline }) {
  const mk = (on, label, text, click, cls, disabled, title) => (
    <button type="button" className={'pb-iconbtn pb-biu ' + cls + (on === true ? ' on' : '')} aria-pressed={on === true ? 'true' : on === MIXED ? 'mixed' : 'false'} aria-label={label} title={title || label} disabled={disabled} onMouseDown={keepFocus} onClick={click}>{text}</button>
  );
  return (
    <span className="pb-group">
      {mk(bold, 'Жирний (Ctrl+B)', 'B', onBold, 'b')}
      {mk(italic, 'Курсив (Ctrl+I)', 'I', onItalic, 'i', italicDisabled, italicDisabled ? 'Для цього шрифту немає курсиву' : undefined)}
      {mk(underline, 'Підкреслений (Ctrl+U)', 'U', onUnderline, 'u')}
    </span>
  );
}

export function AlignButtons({ value, onChange }) {
  return (
    <span className="pb-group" role="group" aria-label="Вирівнювання">
      {[['left', 'За лівим краєм'], ['center', 'По центру'], ['right', 'За правим краєм']].map(([v, label]) => (
        <button key={v} type="button" className={'pb-iconbtn' + (value === v ? ' on' : '')} aria-pressed={value === v} aria-label={label} title={label} onMouseDown={keepFocus} onClick={() => onChange(v)}>
          <ActionIcon name={'align-' + v} size={18} />
        </button>
      ))}
    </span>
  );
}

// ----- Colour ------------------------------------------------------------------------------------------
export function ColorField({ value, onChange, compact }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(null);
  const btn = useRef(null);
  const shown = draft ?? (value === MIXED ? '' : value);
  const hex = draft != null ? normalizeHex(draft) : null;
  const invalid = draft != null && draft.trim() !== '' && !hex;
  const commit = () => { if (hex) onChange(hex); setDraft(null); };
  return (
    <div className={'pb-color' + (compact ? ' compact' : '')}>
      <button ref={btn} type="button" className="pb-swatch" aria-label="Колір тексту" aria-expanded={open} onMouseDown={keepFocus} onClick={() => setOpen((o) => !o)} style={value === MIXED ? undefined : { background: value }}>{value === MIXED ? '?' : ''}</button>
      {!compact && (
        <input
          type="text" className={invalid ? 'bad' : ''} value={shown} placeholder="#RRGGBB" aria-label="Колір у форматі HEX" aria-invalid={invalid} maxLength={7}
          onChange={(e) => setDraft(e.target.value)} onBlur={commit}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commit(); } }}
        />
      )}
      {open && (
        <Popover anchor={btn} onClose={() => setOpen(false)} width={236}>
          <div className="pb-swatches">
            {SWATCHES.map((c) => <button key={c} type="button" className={'pb-sw' + (value === c ? ' on' : '')} style={{ background: c }} aria-label={c} onClick={() => { onChange(c); setOpen(false); }} />)}
          </div>
          <div className="pb-hexrow">
            <input
              type="text" className={invalid ? 'bad' : ''} value={shown} placeholder="#RRGGBB" aria-label="Колір у форматі HEX" aria-invalid={invalid} maxLength={7}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); if (hex) { onChange(hex); setDraft(null); setOpen(false); } } }}
            />
            <button type="button" className="btn" disabled={!hex} onClick={() => { onChange(hex); setDraft(null); setOpen(false); }}>OK</button>
          </div>
          {invalid && <div className="pb-hexerr">Введіть колір у форматі #RRGGBB</div>}
        </Popover>
      )}
    </div>
  );
}
