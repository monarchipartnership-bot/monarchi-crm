import { useRef, useState } from 'react';
import useDialogA11y from '../../lib/useDialogA11y';
import '../../styles/projectReports.css';
import '../../styles/reportWinHub.css';

const QUICK = ['Бракує планів', 'Перевірте цифри', 'Уточніть висновки', 'Додайте креативи'];
const UNDO_ICON = '<svg viewBox="0 0 24 24"><path d="M9 14L4 9l5-5M4 9h11a5 5 0 0 1 0 10h-3"/></svg>';
const X_ICON = '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>';

// «Повернути на доопрацювання»: the approver says what is wrong. The note is kept with the report and shown to whoever opens it next.
// The quick reasons only put a phrase into the note; the person can edit it.
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
  const addQuick = (phrase) => setNote((n) => { const base = n.replace(/\s+$/, ''); return ((base ? base + (/[.!?]$/.test(base) ? ' ' : '. ') : '') + phrase + '.').slice(0, 1000); });

  return (
    <div className="rw-overlay" onClick={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <form ref={box} tabIndex={-1} className="rw-dialog" role="dialog" aria-modal="true" aria-labelledby="rrd-title" onSubmit={submit}>
        <div className="rw-dh">
          <span className="rw-md rw-md--warm"><span className="rw-mi" dangerouslySetInnerHTML={{ __html: UNDO_ICON }} /></span>
          <div className="rw-dt"><h3 id="rrd-title">Повернути на доопрацювання</h3>{title && <small>{title}</small>}</div>
          <button type="button" className="rw-x" onClick={onClose} disabled={busy} aria-label="Закрити" dangerouslySetInnerHTML={{ __html: X_ICON }} />
        </div>
        <div className="rw-db">
          <label htmlFor="rrd-note" className="rw-lab">Що потрібно виправити</label>
          <textarea id="rrd-note" rows={4} value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} placeholder="Наприклад: додайте плани на наступний тиждень і перевірте текст «Висновки»." autoFocus />
          <div className="rw-cnt"><span>Нотатку побачить той, хто відкриє звіт далі.</span><span>{note.length} / 1000</span></div>
          <div className="rw-quick"><span>Швидкі причини:</span>{QUICK.map((q) => <button type="button" key={q} className="rw-qc" onClick={() => addQuick(q)}>{q}</button>)}</div>
          {error && <div className="rw-err" role="alert">{error}</div>}
        </div>
        <div className="rw-df">
          <button type="button" className="rw-btn rw-btn--bad" onClick={onClose} disabled={busy}><span dangerouslySetInnerHTML={{ __html: X_ICON }} /> Скасувати</button>
          <button type="submit" className="rw-btn rw-btn--ok" disabled={busy}><span dangerouslySetInnerHTML={{ __html: UNDO_ICON }} /> {busy ? '...' : 'Повернути'}</button>
        </div>
      </form>
    </div>
  );
}
