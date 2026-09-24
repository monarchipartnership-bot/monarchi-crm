const PLUS_ICON = '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>';

// One small line icon per category `key` (from kb_categories.key, seeded by
// the migration) — purely decorative, keyed off real DB data, never guessed
// per-article since articles carry no icon field of their own.
const CATEGORY_ICONS = {
  'about-company': '<svg viewBox="0 0 24 24"><path d="M4 21V5a1 1 0 0 1 1-1h7a1 1 0 0 1 1 1v16"/><path d="M13 9h6a1 1 0 0 1 1 1v11"/><path d="M8 8h.01M8 12h.01M8 16h.01"/></svg>',
  'client-journey': '<svg viewBox="0 0 24 24"><path d="M9 20l-5-2V6l5 2m0 12l6-2m-6 2V8m6 10l5 2V6l-5-2m0 16V6m0 0L9 8"/></svg>',
  access: '<svg viewBox="0 0 24 24"><circle cx="8" cy="15" r="4"/><path d="M10.5 12.5 20 3m-4 1 2 2m-6 2 2 2"/></svg>',
  channels: '<svg viewBox="0 0 24 24"><path d="M3 11v2a1 1 0 0 0 1 1h2l4 4V6L6 10H4a1 1 0 0 0-1 1Z"/><path d="M16 9a3 3 0 0 1 0 6m2-9a7 7 0 0 1 0 12"/></svg>',
  'landing-pages': '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 8h18M7 6h.01"/></svg>',
  metrics: '<svg viewBox="0 0 24 24"><path d="M4 20V10m6 10V4m6 16v-7"/></svg>',
  seasonality: '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>',
};
function ic(key) {
  return CATEGORY_ICONS[key] || '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/></svg>';
}

// Builds a short plain-text snippet around the first match of `query`
// inside `content`, for the search results list — so a hit doesn't just
// say "found something", it shows the actual matching sentence.
function snippetAround(content, query) {
  const idx = content.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return content.slice(0, 140);
  const start = Math.max(0, idx - 60);
  const end = Math.min(content.length, idx + query.length + 80);
  return (start > 0 ? '…' : '') + content.slice(start, end).trim() + (end < content.length ? '…' : '');
}

export default function KnowledgeSidebar({
  categories, search, searchResults, selectedId, collapsed,
  onToggleCategory, onSelect, onAddClick,
}) {
  if (searchResults) {
    return (
      <div className="kb-search-results">
        <div className="kb-search-count">{searchResults.length} {searchResults.length === 1 ? 'результат' : 'результатів'}</div>
        {searchResults.map((a) => (
          <button
            key={a.id} type="button"
            className={'kb-search-item' + (a.id === selectedId ? ' active' : '')}
            onClick={() => onSelect(a.id)}
          >
            <span className="kb-search-item-cat" style={{ color: a.categoryColor }}>{a.categoryLabel}</span>
            <span className="kb-search-item-title">{a.title}</span>
            <span className="kb-search-item-snippet">{snippetAround(a.content, search)}</span>
          </button>
        ))}
        {searchResults.length === 0 && <div className="kb-search-empty">Нічого не знайдено.</div>}
      </div>
    );
  }

  return (
    <nav className="kb-tree">
      {categories.map((cat) => (
        <div key={cat.id} className="kb-tree-group">
          <button type="button" className="kb-tree-cat" onClick={() => onToggleCategory(cat.id)} style={{ '--kb-color': cat.color }}>
            <span className="kb-tree-cat-icon" dangerouslySetInnerHTML={{ __html: ic(cat.key) }} />
            <span className="kb-tree-cat-label">{cat.label}</span>
            <span className="kb-tree-cat-count">{cat.articles.length}</span>
            <svg className={'kb-tree-chevron' + (collapsed[cat.id] ? ' collapsed' : '')} viewBox="0 0 24 24"><path d="m6 9 6 6 6-6" /></svg>
          </button>
          {!collapsed[cat.id] && (
            <div className="kb-tree-branch">
              {cat.articles.map((a) => (
                <button
                  key={a.id} type="button"
                  className={'kb-tree-item' + (a.id === selectedId ? ' active' : '')}
                  onClick={() => onSelect(a.id)}
                >
                  <span className="kb-tree-item-dot" />
                  {a.title}
                </button>
              ))}
              <button type="button" className="kb-tree-add" onClick={() => onAddClick(cat.id)}>
                <span dangerouslySetInnerHTML={{ __html: PLUS_ICON }} /> Новий розділ
              </button>
            </div>
          )}
        </div>
      ))}
    </nav>
  );
}
