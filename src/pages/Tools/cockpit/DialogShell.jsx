import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import '../../../styles/returnDialog.css';

// The common shell of the windows of a creative (owner's picks 2026-11-17, decisions 54 and 55): «Повернути», «Редагувати текст», «Порівняти реалізм», «Створити відео».
// The creative on the left, the form on the right, the buttons and the keys in the foot; Esc closes, Ctrl+Enter sends.
//   title, sub: the head   label: for screen readers   left: the node on the left (the picture)   children: the form   footer: the buttons (right side of the foot)   noFoot: no foot (the screen «Готово»)
//   busy: the window cannot be closed   onClose()   onSubmit(): Ctrl+Enter   escGuard(): true = Esc is for something else (an open list)   wide: the left column is wider
export default function DialogShell({ title, sub, label, left, children, footer, noFoot = false, busy = false, onClose, onSubmit, escGuard, wide = false }) {
  const box = useRef(null);
  const live = useRef({});
  live.current = { busy, onClose, onSubmit, escGuard };
  useEffect(() => {
    box.current?.focus();
    const onKey = (e) => {
      const { busy: b, onClose: close, onSubmit: send, escGuard: guard } = live.current;
      if (e.key === 'Escape' && !b && !guard?.()) { e.stopPropagation(); close(); }
      else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && !b && send) { e.preventDefault(); e.stopPropagation(); send(); }
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, []);
  return createPortal(
    <div className="ckp ckp-overlay is-night ai-immersive ted-ov" data-ai-safe onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <div ref={box} className={'rtd-win' + (wide ? ' is-wide' : '') + (left ? '' : ' no-left')} role="dialog" aria-modal="true" aria-label={label || title} tabIndex={-1}>
        <header className="rtd-head">
          <div><h2>{title}</h2>{sub && <small>{sub}</small>}</div>
          <button type="button" className="rtd-x" onClick={onClose} disabled={busy} aria-label="Закрити">×</button>
        </header>
        <div className="rtd-body">
          {left && <div className="rtd-left">{left}</div>}
          <div className="rtd-form">{children}</div>
        </div>
        {!noFoot && (
          <footer className="rtd-foot">
            <span className="rtd-keys"><kbd>Esc</kbd> закрити{onSubmit ? <> · <kbd>Ctrl</kbd>+<kbd>Enter</kbd> надіслати</> : null}</span>
            <span className="rtd-btns">{footer}</span>
          </footer>
        )}
      </div>
    </div>,
    document.body,
  );
}

// the picture of the creative on the left: the picture itself (or a plain block with the name)
export function LeftPicture({ item, note, tag = '', play = false }) {
  const url = item.rawUrl || item.url;
  return (
    <>
      <div className="rtd-pic">
        {url ? <img src={url} alt={item.conceptName} /> : <span className="rtd-noimg">{item.conceptName}</span>}
        {tag && <span className="rtd-tag">{tag}</span>}
        {play && <span className="rtd-play" aria-hidden="true">▶</span>}
      </div>
      {note && <small>{note}</small>}
    </>
  );
}

// the price line of the windows that spend money: the sum, what it is for, and, when the limit of the task is too small, a red line
export function PriceBlock({ asking, text, sum, note, bad = false, hint = '' }) {
  if (asking) return <div className="rtd-price" role="status"><small>Рахуємо вартість…</small></div>;
  if (!sum && !bad && !note) return <div className="rtd-price"><small>{hint}</small></div>;
  return (
    <div className={'rtd-price' + (bad ? ' is-bad' : '')} role="status">
      <span><b>{sum}</b> <small>{text}</small></span>
      <small>{note}</small>
    </div>
  );
}
