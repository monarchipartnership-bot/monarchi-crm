import { useMemo } from 'react';
import { ICON } from './kbIcons';
import { formatDate, parseBlocks, readMinutes } from './kbText';

// Presentation only: no article is re-authored; the text is split into the blocks it already has (see kbText.parseBlocks).
function ArticleBody({ blocks }) {
  return (
    <div className="kb-article-body">
      {blocks.map((block, i) => (
        <section key={i} id={`kb-b-${i}`} className="kb-block">
          {block.heading && <h3 className="kb-block-heading">{block.heading}</h3>}
          {block.isList ? (
            <ul className={'kb-list' + (block.items.length >= 6 && block.items.every((it) => it.length < 44) ? ' kb-list-2col' : '')}>
              {block.items.map((item, j) => <li key={j}>{item}</li>)}
            </ul>
          ) : (
            <p className="kb-block-text">{block.text}</p>
          )}
        </section>
      ))}
    </div>
  );
}

function EditForm({ title, content, onTitleChange, onContentChange, onCancel, onSave, saving, saveLabel, titleAutoFocus, heading }) {
  return (
    <div className="kb-edit-form">
      <div className="kb-kicker">{heading}</div>
      <input
        type="text" className="kb-edit-title" placeholder="Назва розділу" aria-label="Назва розділу"
        value={title} onChange={(e) => onTitleChange(e.target.value)}
        autoFocus={titleAutoFocus}
      />
      <textarea
        className="kb-edit-body" placeholder="Текст розділу…" aria-label="Текст розділу"
        value={content} onChange={(e) => onContentChange(e.target.value)}
      />
      <div className="kb-edit-hint">Порожній рядок розділяє блоки. Рядок з двокрапкою на початку блоку стане його заголовком, рядки з «- » стануть списком.</div>
      <div className="kb-edit-actions">
        <button type="button" className="kb-btn kb-btn-ghost" onClick={onCancel} disabled={saving}>Скасувати</button>
        <button type="button" className="kb-btn kb-btn-primary" onClick={onSave} disabled={saving || !title.trim()}>
          {saving ? 'Збереження…' : saveLabel}
        </button>
      </div>
    </div>
  );
}

function scrollToBlock(i) {
  document.getElementById(`kb-b-${i}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

export default function ArticleView({
  article, category, editing, draft, setDraft, saving,
  onStartEdit, onCancelEdit, onSave, onDelete, onOpenCategory, onOpenArticle,
  creating, newArticle, setNewArticle, onCancelCreate, onSaveCreate,
}) {
  const blocks = useMemo(() => parseBlocks(article?.content), [article?.content]);

  if (creating) {
    return (
      <div className="kb-page kb-page-narrow">
        <EditForm
          heading={`Новий розділ · ${category?.label || ''}`}
          title={newArticle.title} content={newArticle.content}
          onTitleChange={(v) => setNewArticle((d) => ({ ...d, title: v }))}
          onContentChange={(v) => setNewArticle((d) => ({ ...d, content: v }))}
          onCancel={onCancelCreate} onSave={onSaveCreate} saving={saving}
          saveLabel="Створити розділ" titleAutoFocus
        />
      </div>
    );
  }

  if (!article) return <div className="kb-empty">Розділ не знайдено.</div>;

  if (editing) {
    return (
      <div className="kb-page kb-page-narrow">
        <EditForm
          heading={`Редагування · ${category?.label || ''}`}
          title={draft.title} content={draft.content}
          onTitleChange={(v) => setDraft((d) => ({ ...d, title: v }))}
          onContentChange={(v) => setDraft((d) => ({ ...d, content: v }))}
          onCancel={onCancelEdit} onSave={onSave} saving={saving}
          saveLabel="Зберегти" titleAutoFocus={false}
        />
      </div>
    );
  }

  const updated = formatDate(article.updated_at);
  const siblings = category?.articles || [];
  const idx = siblings.findIndex((a) => a.id === article.id);
  const prev = idx > 0 ? siblings[idx - 1] : null;
  const next = idx >= 0 && idx < siblings.length - 1 ? siblings[idx + 1] : null;
  const toc = blocks.map((b, i) => ({ i, title: b.heading })).filter((t) => t.title);

  return (
    <div className="kb-article-layout" style={{ '--kb-c': category?.color || '#b544b5' }}>
      <article className="kb-article">
        <div className="kb-breadcrumb">
          <button type="button" className="kb-crumb" onClick={() => onOpenCategory(category.id)}>{category?.label}</button>
          <span className="kb-breadcrumb-sep">›</span>
          <span className="kb-breadcrumb-title">{article.title}</span>
        </div>

        <div className="kb-article-head">
          <h1 className="kb-article-title">{article.title}</h1>
          <div className="kb-article-actions">
            <button type="button" className="kb-btn kb-btn-primary" onClick={onStartEdit}>
              <span className="kb-bi" dangerouslySetInnerHTML={{ __html: ICON.edit }} /> Редагувати
            </button>
            <button type="button" className="kb-icon-btn kb-btn-danger" onClick={onDelete} aria-label="Видалити розділ">
              <span dangerouslySetInnerHTML={{ __html: ICON.trash }} />
            </button>
          </div>
        </div>

        <div className="kb-article-meta">
          <span><span className="kb-mi" dangerouslySetInnerHTML={{ __html: ICON.clock }} />{readMinutes(article.content)} хв читання</span>
          {updated && <span><span className="kb-mi" dangerouslySetInnerHTML={{ __html: ICON.calendar }} />Оновлено {updated}</span>}
        </div>

        <ArticleBody blocks={blocks} />

        {(prev || next) && (
          <div className="kb-pager">
            {prev ? (
              <button type="button" className="kb-pager-btn" onClick={() => onOpenArticle(prev.id)}>
                <small><span className="kb-bi" dangerouslySetInnerHTML={{ __html: ICON.arrowLeft }} /> Попередній</small>
                <b>{prev.title}</b>
              </button>
            ) : <span />}
            {next ? (
              <button type="button" className="kb-pager-btn kb-pager-next" onClick={() => onOpenArticle(next.id)}>
                <small>Наступний <span className="kb-bi" dangerouslySetInnerHTML={{ __html: ICON.arrow }} /></small>
                <b>{next.title}</b>
              </button>
            ) : <span />}
          </div>
        )}
      </article>

      <aside className="kb-aside" aria-label="Навігація по розділу">
        {toc.length > 0 && (
          <div className="kb-aside-card">
            <div className="kb-aside-title">На цій сторінці</div>
            <ul className="kb-toc">
              {toc.map((t) => <li key={t.i}><button type="button" onClick={() => scrollToBlock(t.i)}>{t.title}</button></li>)}
            </ul>
          </div>
        )}
        {siblings.length > 1 && (
          <div className="kb-aside-card">
            <div className="kb-aside-title">Ще в темі «{category.label}»</div>
            <ul className="kb-toc">
              {siblings.filter((a) => a.id !== article.id).slice(0, 6).map((a) => (
                <li key={a.id}><button type="button" onClick={() => onOpenArticle(a.id)}>{a.title}</button></li>
              ))}
            </ul>
          </div>
        )}
      </aside>
    </div>
  );
}
