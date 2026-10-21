import { useRef, useState } from 'react';
import useDialogA11y from '../../lib/useDialogA11y';
import DesignTodo from '../common/DesignTodo';
import '../../styles/projectReports.css';

// «Повернути на доопрацювання»: the approver says what is wrong. The note is kept with the report and shown to whoever opens it next.
export default function ReportReturnDialog({ title, onSubmit, onClose }) {
  const box = useRef(null);
  useDialogA11y(box, onClose);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try { await onSubmit(note.trim()); } catch (err) { setError(err.message || 'Не вдалося повернути звіт.'); setBusy(false); }
  }

  return (
    <div className="modal-overlay show" onClick={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <form ref={box} tabIndex={-1} className="modal-box prep-modal" role="dialog" aria-modal="true" aria-labelledby="rrd-title" onSubmit={submit}>
        <div className="modal-head">
          <h3 id="rrd-title">Повернути на доопрацювання</h3>
          <DesignTodo note="Вікно «Повернути на доопрацювання»" />
          <button type="button" className="modal-close" onClick={onClose} disabled={busy} aria-label="Закрити">&times;</button>
        </div>
        <div className="modal-body">
          {title && <div className="pacc-hint">{title}</div>}
          <div className="pf full">
            <label htmlFor="rrd-note">Що потрібно виправити</label>
            <textarea id="rrd-note" rows={4} value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} placeholder="Наприклад: додайте плани на наступний тиждень і перевірте текст «What was done»." />
          </div>
          {error && <div className="form-err">{error}</div>}
        </div>
        <div className="modal-foot">
          <button type="submit" className="btn btn-p" disabled={busy}>{busy ? '...' : 'Повернути'}</button>
          <button type="button" className="btn" onClick={onClose} disabled={busy}>Скасувати</button>
        </div>
      </form>
    </div>
  );
}
