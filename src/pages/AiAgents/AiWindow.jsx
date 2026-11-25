import { Suspense, useRef } from 'react';
import useDialogA11y from '../../lib/useDialogA11y';

// A full-size window inside the AI Agents section (owner's rule: everything about the agents opens INSIDE the section, over the map, never as a page of the CRM menu).
// The window is light (the pages inside are the light pages of the workflow) over the dark map; Esc, the cross or a click outside close it.
// A dialog that opens above it (a confirmation, the large view of a creative) takes Esc first.
export default function AiWindow({ title, onClose, dark = false, children }) {
  const box = useRef(null);
  useDialogA11y(box, () => { if (document.querySelector('.pw-overlay, .wf-lb, .gr-ov')) return; onClose(); }, { initialFocus: '[data-close]' });
  return (
    <div className="aia-win-back" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={box} className={'aia-win' + (dark ? ' is-dark' : '')} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1}>
        <header className="aia-win-head">
          <h2>{title}</h2>
          <button type="button" className="aia-win-x" data-close onClick={onClose} aria-label="Закрити вікно">Закрити</button>
        </header>
        <div className="aia-win-body wf">
          <Suspense fallback={<div className="wf-load">Завантаження…</div>}>{children}</Suspense>
        </div>
      </div>
    </div>
  );
}
