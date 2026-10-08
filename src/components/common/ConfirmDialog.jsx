import { useCallback, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import ActionIcon from './ActionIcon';
import useDialogA11y from '../../lib/useDialogA11y';

// One confirmation window for every destructive / replacing / "leave without saving" action of the
// project workspace. The question is asked BEFORE anything runs: the caller awaits `confirm()` and only
// calls its API when the answer is true. Cancel is focused first for a danger action.
//
//   const [confirm, confirmDialog] = useConfirm();
//   if (!(await confirm({ title, body, confirmLabel, cancelLabel, danger: true }))) return;
//   ...render {confirmDialog}
function ConfirmWindow({ title, body, confirmLabel = 'Так', cancelLabel = 'Скасувати', danger, onResult }) {
  const box = useRef(null);
  useDialogA11y(box, () => onResult(false), { initialFocus: danger ? '[data-cancel]' : '[data-confirm]' });
  return createPortal(
    <div className="pw-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onResult(false); }}>
      <div ref={box} className="pw-dialog pw-dialog--confirm" role="alertdialog" aria-modal="true" aria-labelledby="pw-confirm-title" aria-describedby="pw-confirm-body" tabIndex={-1}>
        <div className="pw-dialog-head">
          <h2 id="pw-confirm-title">{title}</h2>
          <button type="button" className="pw-x" onClick={() => onResult(false)} aria-label="Закрити"><ActionIcon name="close" size={20} /></button>
        </div>
        <div className="pw-dialog-body"><p id="pw-confirm-body">{body}</p></div>
        <div className="pw-dialog-foot">
          <button type="button" className="pw-btn" data-cancel onClick={() => onResult(false)}>{cancelLabel}</button>
          <button type="button" className={'pw-btn ' + (danger ? 'pw-btn--danger-solid' : 'pw-btn--primary')} data-confirm onClick={() => onResult(true)}>
            {danger && <ActionIcon name="delete" size={18} />}{confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export function useConfirm() {
  const [state, setState] = useState(null);
  const confirm = useCallback((opts) => new Promise((resolve) => setState({ ...opts, resolve })), []);
  const dialog = state ? (
    <ConfirmWindow {...state} onResult={(v) => { state.resolve(v); setState(null); }} />
  ) : null;
  return [confirm, dialog];
}
