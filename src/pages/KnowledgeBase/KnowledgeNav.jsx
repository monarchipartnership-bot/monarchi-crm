import { catIcon, ICON } from './kbIcons';

// The left column: «Головна», then every topic with its article count; the topic that is open unfolds its articles underneath.
export default function KnowledgeNav({ categories, view, categoryId, selectedId, onHome, onCategory, onArticle, onAdd }) {
  return (
    <nav className="kb-nav" aria-label="Розділи бази знань">
      <button type="button" className={'kb-nav-home' + (view === 'home' ? ' is-active' : '')} onClick={onHome}>
        <span className="kb-nav-ico" dangerouslySetInnerHTML={{ __html: ICON.home }} />
        <span className="kb-nav-label">Головна</span>
      </button>
      <div className="kb-nav-title">Теми</div>
      {categories.map((cat) => {
        const open = cat.id === categoryId && view !== 'home' && view !== 'search';
        return (
          <div key={cat.id} className={'kb-nav-group' + (open ? ' is-open' : '')} style={{ '--kb-c': cat.color || '#b544b5' }}>
            <button type="button" className={'kb-nav-cat' + (open && view === 'category' ? ' is-active' : '')} onClick={() => onCategory(cat.id)} aria-expanded={open}>
              <span className="kb-nav-ico kb-nav-ico-cat" dangerouslySetInnerHTML={{ __html: catIcon(cat.key) }} />
              <span className="kb-nav-label">{cat.label}</span>
              <span className="kb-nav-count">{cat.articles.length}</span>
            </button>
            {open && (
              <div className="kb-nav-branch">
                {cat.articles.map((a) => (
                  <button key={a.id} type="button" className={'kb-nav-item' + (a.id === selectedId && view === 'article' ? ' is-active' : '')} onClick={() => onArticle(a.id)}>
                    {a.title}
                  </button>
                ))}
                <button type="button" className="kb-nav-add" onClick={() => onAdd(cat.id)}>
                  <span className="kb-nav-add-ico" dangerouslySetInnerHTML={{ __html: ICON.plus }} /> Новий розділ
                </button>
              </div>
            )}
          </div>
        );
      })}
    </nav>
  );
}
