import { useEffect, useRef, useState } from 'react';
import AutoResizeTextarea from './AutoResizeTextarea';
import { clientFullName } from '../../lib/clientName';

// Live search-or-create name field — a growing textarea (client names are
// sometimes full company names) plus a dropdown of directory matches while
// it has focus and text. Clicking a match calls `onPick`; typing anything
// (including after a pick, since the text may no longer refer to the same
// person) calls `onTextChange` and drops the link. Shared by
// EditableClientList.jsx's inline rows and AddClientModal.jsx's popup form.
export default function ClientNameField({ value, clientId, directory, capturing, onPick, onTextChange }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e) { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  if (capturing) return <div className="capture-text">{value}</div>;

  const q = (value || '').trim().toLowerCase();
  const matches = q
    ? directory.filter((c) => clientFullName(c).toLowerCase().includes(q) || c.company?.toLowerCase().includes(q)).slice(0, 8)
    : [];

  return (
    <div className="client-name-field" ref={wrapRef}>
      <AutoResizeTextarea
        value={value}
        onChange={(v) => { onTextChange(v); setOpen(true); }}
        onFocus={() => setOpen(true)}
        placeholder="напр. Acme Inc."
      />
      {clientId && <span className="client-name-linked" title="Знайдено в довіднику Контактів">&#10003; у довіднику</span>}
      {open && matches.length > 0 && (
        <div className="client-name-suggestions">
          {matches.map((c) => (
            <button type="button" key={c.id} onClick={() => { onPick(c); setOpen(false); }}>
              {clientFullName(c)}{c.company ? <span className="hint"> · {c.company}</span> : ''}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
