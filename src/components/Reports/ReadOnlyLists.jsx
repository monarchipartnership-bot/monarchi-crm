// Read-only renderings of saved report items, used on History pages.

export function ReadOnlyItemList({ items, emptyLabel }) {
  if (!items?.length) return <div className="ro-empty">{emptyLabel}</div>;
  return (
    <div className="items">
      {items.map((it, i) => (
        <div className="ro-item" key={i}>
          <div className="item-num">{i + 1}</div>
          <div className="ro-body">{it.text}</div>
        </div>
      ))}
    </div>
  );
}

export function ReadOnlyClientList({ items }) {
  if (!items?.length) return <div className="ro-empty">Немає клієнтів</div>;
  return (
    <div className="items">
      {items.map((it, i) => (
        <div className="ro-item ro-client" key={i}>
          <div className="ro-client-meta">
            <span className="ro-badge platform">{it.platform}</span>
            <span className="ro-badge leadtype">{it.leadType}</span>
          </div>
          {it.name && <div className="ro-client-name">{it.name}</div>}
          <div className="ro-client-text">{it.text || '—'}</div>
        </div>
      ))}
    </div>
  );
}
