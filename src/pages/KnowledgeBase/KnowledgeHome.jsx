import { catIcon, ICON } from './kbIcons';
import { formatDate, plural, preview, readMinutes, snippetAround } from './kbText';

const sections = (n) => `${n} ${plural(n, 'розділ', 'розділи', 'розділів')}`;

function ArticleCard({ article, category, onOpen, query }) {
  const upd = formatDate(article.updated_at);
  return (
    <button type="button" className="kb-card kb-card-article" style={{ '--kb-c': category.color || '#b544b5' }} onClick={() => onOpen(article.id)}>
      <span className="kb-card-tag"><i className="kb-dot" />{category.label}</span>
      <b className="kb-card-title">{article.title}</b>
      <span className="kb-card-text">{query ? snippetAround(article.content, query) : preview(article.content)}</span>
      <span className="kb-card-meta">
        <span><span className="kb-mi" dangerouslySetInnerHTML={{ __html: ICON.clock }} />{readMinutes(article.content)} хв</span>
        {upd && <span><span className="kb-mi" dangerouslySetInnerHTML={{ __html: ICON.calendar }} />{upd}</span>}
      </span>
    </button>
  );
}

// The main page: what the base holds (topic cards with their first articles) and what changed lately.
export function KnowledgeHome({ categories, allArticles, onCategory, onArticle }) {
  const total = allArticles.length;
  const recent = [...allArticles].filter((a) => a.updated_at).sort((a, b) => b.updated_at.localeCompare(a.updated_at)).slice(0, 5);
  return (
    <div className="kb-page">
      <section className="kb-hero">
        <div>
          <div className="kb-kicker">Інформаційна база</div>
          <h1>Усе, що знає команда про Mon'Archi</h1>
          <p>Процеси, доступи, канали, метрики й сезонність в одному місці. Ті самі тексти читають і AI-агенти, тому тут варто тримати все актуальним.</p>
        </div>
        <div className="kb-hero-stats">
          <div><b>{categories.length}</b><small>{plural(categories.length, 'тема', 'теми', 'тем')}</small></div>
          <div><b>{total}</b><small>{plural(total, 'розділ', 'розділи', 'розділів')}</small></div>
        </div>
      </section>

      <h2 className="kb-h2">Теми</h2>
      <div className="kb-grid">
        {categories.map((cat) => (
          <article key={cat.id} className="kb-card kb-card-cat" style={{ '--kb-c': cat.color || '#b544b5' }}>
            <button type="button" className="kb-card-cat-head" onClick={() => onCategory(cat.id)}>
              <span className="kb-badge" dangerouslySetInnerHTML={{ __html: catIcon(cat.key) }} />
              <span className="kb-card-cat-name"><b>{cat.label}</b><small>{sections(cat.articles.length)}</small></span>
              <span className="kb-go" dangerouslySetInnerHTML={{ __html: ICON.arrow }} />
            </button>
            <ul className="kb-card-list">
              {cat.articles.slice(0, 4).map((a) => (
                <li key={a.id}><button type="button" onClick={() => onArticle(a.id)}>{a.title}</button></li>
              ))}
              {cat.articles.length > 4 && <li className="kb-card-more"><button type="button" onClick={() => onCategory(cat.id)}>ще {cat.articles.length - 4}…</button></li>}
              {!cat.articles.length && <li className="kb-card-more">Поки порожньо</li>}
            </ul>
          </article>
        ))}
      </div>

      {recent.length > 0 && (
        <>
          <h2 className="kb-h2">Нещодавно оновлено</h2>
          <ul className="kb-recent">
            {recent.map((a) => (
              <li key={a.id}>
                <button type="button" onClick={() => onArticle(a.id)} style={{ '--kb-c': a.categoryColor || '#b544b5' }}>
                  <span className="kb-recent-ico" dangerouslySetInnerHTML={{ __html: ICON.doc }} />
                  <span className="kb-recent-name"><b>{a.title}</b><small>{a.categoryLabel}</small></span>
                  <span className="kb-recent-date">{formatDate(a.updated_at)}</span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

// One topic: a header with its icon and the articles as cards.
export function KnowledgeCategory({ category, onArticle, onAdd }) {
  return (
    <div className="kb-page" style={{ '--kb-c': category.color || '#b544b5' }}>
      <section className="kb-cat-head">
        <span className="kb-badge kb-badge-lg" dangerouslySetInnerHTML={{ __html: catIcon(category.key) }} />
        <div>
          <div className="kb-kicker">Тема</div>
          <h1>{category.label}</h1>
          <p>{sections(category.articles.length)}</p>
        </div>
        <button type="button" className="kb-btn kb-btn-primary" onClick={() => onAdd(category.id)}>
          <span className="kb-bi" dangerouslySetInnerHTML={{ __html: ICON.plus }} /> Новий розділ
        </button>
      </section>
      <div className="kb-grid kb-grid-2">
        {category.articles.map((a) => <ArticleCard key={a.id} article={a} category={category} onOpen={onArticle} />)}
      </div>
      {!category.articles.length && <div className="kb-empty">У цій темі ще немає розділів.</div>}
    </div>
  );
}

// Results of the search box: every hit as a card with the sentence that matched.
export function KnowledgeSearch({ results, query, categories, onArticle, smart = null, onSmart, allArticles = [] }) {
  const byId = new Map(allArticles.map((a) => [a.id, a]));
  const smartRows = (smart?.results || []).map((r) => ({ ...r, article: byId.get(r.id) })).filter((r) => r.article);
  return (
    <div className="kb-page">
      <section className="kb-cat-head kb-cat-head-search">
        <span className="kb-badge kb-badge-lg" dangerouslySetInnerHTML={{ __html: ICON.search }} />
        <div>
          <div className="kb-kicker">Пошук</div>
          <h1>«{query.trim()}»</h1>
          <p>{results.length} {plural(results.length, 'результат', 'результати', 'результатів')}</p>
        </div>
      </section>
      {onSmart && (
        <section className="kb-smart" aria-label="Пошук за змістом">
          <div className="kb-smart-head">
            <div><b>Пошук за змістом</b><span>Шукає розділи, які відповідають на запит по суті, навіть якщо в них інші слова. Один запит до моделі, кілька центів.</span></div>
            <button type="button" className="kb-btn kb-btn-primary" onClick={onSmart} disabled={smart?.loading || query.trim().length < 3}>{smart?.loading ? 'Шукаю…' : smart ? 'Шукати ще раз' : 'Шукати за змістом'}</button>
          </div>
          {smart?.error && <p className="kb-smart-err" role="alert">{smart.error}</p>}
          {smart && !smart.loading && !smart.error && !smartRows.length && <p className="kb-smart-none">За змістом нічого відповідного не знайдено.</p>}
          {smartRows.length > 0 && (
            <ol className="kb-smart-list">
              {smartRows.map((r) => {
                const cat = categories.find((c) => c.articles.some((x) => x.id === r.id)) || { label: r.article.categoryLabel, color: r.article.categoryColor };
                return <li key={r.id}><button type="button" onClick={() => onArticle(r.id)} style={{ '--kb-c': cat.color || '#b544b5' }}><span className="kb-card-tag"><i className="kb-dot" />{cat.label}</span><b>{r.article.title}</b><span>{r.why}</span></button></li>;
              })}
            </ol>
          )}
        </section>
      )}
      <div className="kb-grid kb-grid-2">
        {results.map((a) => {
          const cat = categories.find((c) => c.articles.some((x) => x.id === a.id)) || { label: a.categoryLabel, color: a.categoryColor };
          return <ArticleCard key={a.id} article={a} category={cat} onOpen={onArticle} query={query.trim()} />;
        })}
      </div>
      {!results.length && <div className="kb-empty">Нічого не знайдено. Спробуйте інше слово або назву теми.</div>}
    </div>
  );
}
