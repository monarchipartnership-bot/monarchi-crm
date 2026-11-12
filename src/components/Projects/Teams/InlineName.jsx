import { useEffect, useRef, useState } from 'react';

// A name that the person can change in place (owner, 2026-11-12): the text with a pencil; a click on it turns it into a field (Enter saves, Escape cancels).
//   value: the name now   fallback: what is shown when there is no name (the type)   onSave(text) → Promise   maxLength   as: the tag of the text («b», «h3»)   label: for screen readers
export default function InlineName({ value = '', fallback = '', onSave, maxLength = 60, className = '', label = 'Назва', as: Tag = 'b', allowEmpty = true }) {
  const [edit, setEdit] = useState(false);
  const [text, setText] = useState(value);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const ref = useRef(null);
  useEffect(() => { if (edit) { ref.current?.focus(); ref.current?.select(); } }, [edit]);
  useEffect(() => { if (!edit) setText(value); }, [value, edit]);
  async function save() {
    const next = text.replace(/\s+/g, ' ').trim();
    if (next === String(value || '').trim()) { setEdit(false); return; }
    if (!next && !allowEmpty) { setErr('Назва не може бути порожньою.'); return; }
    setBusy(true); setErr('');
    try { await onSave(next); setEdit(false); } catch (e) { setErr(e?.message || 'Не вдалося зберегти назву.'); } finally { setBusy(false); }
  }
  if (edit) {
    return (
      <span className={'inm is-edit ' + className}>
        <input ref={ref} className="inm-input" value={text} maxLength={maxLength} disabled={busy} aria-label={label} placeholder={fallback}
          onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); save(); } if (e.key === 'Escape') { setEdit(false); setErr(''); } }} onBlur={() => { if (!busy) save(); }} />
        {err && <span className="inm-err" role="alert">{err}</span>}
      </span>
    );
  }
  return (
    <span className={'inm ' + className}>
      <Tag className="inm-text">{value || fallback}</Tag>
      <button type="button" className="inm-pen" onClick={() => setEdit(true)} aria-label={`${label}: змінити`} title="Змінити назву">
        <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 20l1-4L16 5l3 3L8 19z" /></svg>
      </button>
    </span>
  );
}
