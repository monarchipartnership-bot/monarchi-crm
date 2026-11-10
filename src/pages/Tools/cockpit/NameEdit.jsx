import { useState } from 'react';
import { TITLE_MAX } from '../../../lib/agents/aiProjects';
import { Ic } from './parts';

// A name that a person may change in place (the name of an operation): the text with a pencil, a click turns it into a field with a counter.
// Enter saves, Escape cancels (the cards check [data-name-edit] so that Escape does not close them meanwhile).
//   value: the name now  onSave(text) → Promise (throws a message the person can read)  label: what is being named (for the screen reader and the hint)
export default function NameEdit({ value, onSave, label = 'Назва', max = TITLE_MAX, as: Tag = 'b' }) {
  const [text, setText] = useState(null); // null: not edited
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  async function save() {
    const next = String(text || '').replace(/\s+/g, ' ').trim();
    if (!next) { setErr('Назва не може бути порожньою.'); return; }
    if (next === value) { setText(null); return; }
    setBusy(true); setErr('');
    try { await onSave(next); setText(null); } catch (e) { setErr(e?.message || 'Не вдалося зберегти назву.'); } finally { setBusy(false); }
  }
  if (text == null) {
    return <Tag className="pcd-nm">{value}<button type="button" className="pcd-rename" onClick={() => { setText(value || ''); setErr(''); }} aria-label={`Змінити: ${label}`} title={`Змінити: ${label}`}><Ic n="pen" size={15} /></button></Tag>;
  }
  return (
    <div className="pcd-name-edit" data-name-edit>
      <input className="ckp-field" autoFocus value={text} maxLength={max} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setText(null); }} aria-label={label} />
      <small>{text.length} / {max}</small>
      <button type="button" className="ckp-btn is-primary is-sm" disabled={busy} onClick={save}>Зберегти</button>
      <button type="button" className="ckp-btn is-sm" disabled={busy} onClick={() => setText(null)}>Скасувати</button>
      {err && <span className="ckp-err" role="alert">{err}</span>}
    </div>
  );
}
