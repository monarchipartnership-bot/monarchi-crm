import { useEffect, useRef, useState } from 'react';

// Search-and-pick over the deals already loaded by the caller (no fetch of
// its own — the Задачі page and DealsBoard both already hold the full deals
// list) — same shell/behavior as ClientPicker, minus the inline "create new"
// flow (picking an existing deal is all this needs).
export default function DealPicker({ value, onChange, deals, placeholder = 'Пошук угоди...' }) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e) { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  const selected = deals.find((d) => d.id === value);
  const q = query.trim().toLowerCase();
  const results = (q
    ? deals.filter((d) => dealLabel(d).toLowerCase().includes(q) || d.clients?.name?.toLowerCase().includes(q) || d.clients?.company?.toLowerCase().includes(q))
    : deals
  ).slice(0, 20);

  function pick(deal) {
    onChange(deal);
    setQuery('');
    setOpen(false);
  }

  return (
    <div className="client-picker" ref={wrapRef}>
      {selected && !open ? (
        <button type="button" className="client-picker-selected" onClick={() => setOpen(true)}>
          {dealLabel(selected)}
          <span className="client-picker-change">Змінити</span>
        </button>
      ) : (
        <input
          type="text"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder={placeholder}
        />
      )}
      {open && (
        <div className="client-picker-list">
          {results.length === 0 ? (
            <div className="client-picker-empty">Нічого не знайдено.</div>
          ) : results.map((d) => (
            <button type="button" key={d.id} className="client-picker-item" onClick={() => pick(d)}>
              {dealLabel(d)}
              {d.clients?.name && <span className="hint"> · {d.clients.name}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function dealLabel(deal) {
  return deal.title || deal.clients?.company || deal.clients?.name || 'Угода';
}
