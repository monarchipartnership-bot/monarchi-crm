import { useState } from 'react';

// Collapsible block for the Клієнти / Задачі sections: one column per
// selected week, each showing a bullet list (or "—" if empty for that slot).
export default function CompareListBlock({ title, slots, columns }) {
  const [open, setOpen] = useState(true);

  return (
    <div className="cmp-block">
      <button type="button" className="cmp-block-head" onClick={() => setOpen((o) => !o)}>
        <span>{title}</span>
        <svg className={'chev' + (open ? ' open' : '')} viewBox="0 0 24 24"><path d="M9 6l6 6-6 6" /></svg>
      </button>
      {open && (
        <div className="cmp-block-body">
          <div className="cmp-list-row" style={{ gridTemplateColumns: `repeat(${slots.length}, 1fr)` }}>
            {columns.map((col, i) => (
              <div className="cmp-list-col" key={slots[i].key}>
                <h4>{slots[i].label}</h4>
                {col.length ? (
                  <ul>{col}</ul>
                ) : (
                  <div className="cmp-empty-line">—</div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
