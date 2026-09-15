import { useEffect, useRef, useState } from 'react';
import { fmtDate } from '../../lib/dateHelpers';

function isoToDMY(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  return fmtDate(y, m, d);
}

function isoDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function presetRange(kind) {
  const now = new Date();
  if (kind === 'thisMonth') {
    return { start: isoDate(new Date(now.getFullYear(), now.getMonth(), 1)), end: isoDate(new Date(now.getFullYear(), now.getMonth() + 1, 0)) };
  }
  if (kind === 'lastMonth') {
    return { start: isoDate(new Date(now.getFullYear(), now.getMonth() - 1, 1)), end: isoDate(new Date(now.getFullYear(), now.getMonth(), 0)) };
  }
  // last30
  const end = new Date(now);
  const start = new Date(now);
  start.setDate(start.getDate() - 29);
  return { start: isoDate(start), end: isoDate(end) };
}

export const PRESETS = [
  { key: 'thisMonth', label: 'Цей місяць' },
  { key: 'lastMonth', label: 'Минулий місяць' },
  { key: 'last30', label: 'Останні 30 днів' },
];

export { presetRange };

export default function DateRangePicker({ range, onChange }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(range);
  const wrapRef = useRef(null);

  useEffect(() => { setDraft(range); }, [range]);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  function apply(next) {
    setDraft(next);
    onChange(next);
    setOpen(false);
  }

  return (
    <div className="date-range-picker" ref={wrapRef}>
      <button type="button" className="btn date-range-btn" onClick={() => setOpen((o) => !o)}>
        {isoToDMY(range.start)} – {isoToDMY(range.end)}
      </button>
      {open && (
        <div className="date-range-popover">
          <div className="date-range-presets">
            {PRESETS.map((p) => (
              <button type="button" key={p.key} onClick={() => apply(presetRange(p.key))}>{p.label}</button>
            ))}
          </div>
          <div className="task-filter-row">
            <label>Від</label>
            <input type="date" value={draft.start} onChange={(e) => setDraft((d) => ({ ...d, start: e.target.value }))} />
          </div>
          <div className="task-filter-row">
            <label>До</label>
            <input type="date" value={draft.end} onChange={(e) => setDraft((d) => ({ ...d, end: e.target.value }))} />
          </div>
          <button type="button" className="btn btn-p" onClick={() => apply(draft)}>Застосувати</button>
        </div>
      )}
    </div>
  );
}
