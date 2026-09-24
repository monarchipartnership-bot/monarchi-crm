const EDIT_ICON = '<svg viewBox="0 0 24 24"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/></svg>';
const TRASH_ICON = '<svg viewBox="0 0 24 24"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/></svg>';

// Splits an article's plain-text content into blank-line-separated blocks,
// and within each block recognizes two shapes already common across the
// seeded articles: a short "Label:" line introducing the rest of the
// block, and a run of "- item" lines. Anything else stays a plain
// paragraph (line breaks kept, not collapsed) — this is presentation only,
// no article is re-authored or has facts inferred that aren't in its text.
function parseBlocks(content) {
  return content
    .split(/\n{2,}/)
    .map((raw) => raw.trim())
    .filter(Boolean)
    .map((block) => {
      const lines = block.split('\n').map((l) => l.trim()).filter(Boolean);
      let heading = null;
      let rest = lines;
      if (lines.length > 1 && lines[0].endsWith(':') && lines[0].length < 80 && !lines[0].startsWith('-')) {
        heading = lines[0].slice(0, -1);
        rest = lines.slice(1);
      }
      const isList = rest.length > 0 && rest.every((l) => l.startsWith('- '));
      return {
        heading,
        isList,
        items: isList ? rest.map((l) => l.slice(2).trim()) : null,
        text: isList ? null : rest.join('\n'),
      };
    });
}

function estimateReadMinutes(content) {
  const words = content.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 180));
}

function formatUpdatedDate(iso) {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleDateString('uk-UA', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch {
    return null;
  }
}

function ArticleBody({ content }) {
  const blocks = parseBlocks(content);
  return (
    <div className="kb-article-body">
      {blocks.map((block, i) => (
        <div key={i} className="kb-block">
          {block.heading && <h3 className="kb-block-heading">{block.heading}</h3>}
          {block.isList ? (
            <ul className={'kb-list' + (block.items.length >= 6 && block.items.every((it) => it.length < 44) ? ' kb-list-2col' : '')}>
              {block.items.map((item, j) => <li key={j}>{item}</li>)}
            </ul>
          ) : (
            <p className="kb-block-text">{block.text}</p>
          )}
        </div>
      ))}
    </div>
  );
}

function EditForm({ title, content, onTitleChange, onContentChange, onCancel, onSave, saving, saveLabel, titleAutoFocus }) {
  return (
    <div className="kb-edit-form">
      <input
        type="text" className="kb-edit-title" placeholder="Назва розділу"
        value={title} onChange={(e) => onTitleChange(e.target.value)}
        autoFocus={titleAutoFocus}
      />
      <textarea
        className="kb-edit-body" placeholder="Текст розділу…"
        value={content} onChange={(e) => onContentChange(e.target.value)}
      />
      <div className="kb-edit-actions">
        <button type="button" className="kb-btn kb-btn-ghost" onClick={onCancel} disabled={saving}>Скасувати</button>
        <button type="button" className="kb-btn kb-btn-primary" onClick={onSave} disabled={saving || !title.trim()}>
          {saving ? 'Збереження…' : saveLabel}
        </button>
      </div>
    </div>
  );
}

export default function ArticleView({
  article, editing, draft, setDraft, saving,
  onStartEdit, onCancelEdit, onSave, onDelete,
  creating, newArticle, setNewArticle, onCancelCreate, onSaveCreate,
}) {
  if (creating) {
    return (
      <div className="kb-article kb-article-panel">
        <EditForm
          title={newArticle.title} content={newArticle.content}
          onTitleChange={(v) => setNewArticle((d) => ({ ...d, title: v }))}
          onContentChange={(v) => setNewArticle((d) => ({ ...d, content: v }))}
          onCancel={onCancelCreate} onSave={onSaveCreate} saving={saving}
          saveLabel="Створити розділ" titleAutoFocus
        />
      </div>
    );
  }

  if (!article) {
    return <div className="kb-empty">Оберіть розділ ліворуч або скористайтесь пошуком.</div>;
  }

  if (editing) {
    return (
      <div className="kb-article kb-article-panel">
        <EditForm
          title={draft.title} content={draft.content}
          onTitleChange={(v) => setDraft((d) => ({ ...d, title: v }))}
          onContentChange={(v) => setDraft((d) => ({ ...d, content: v }))}
          onCancel={onCancelEdit} onSave={onSave} saving={saving}
          saveLabel="Зберегти" titleAutoFocus={false}
        />
      </div>
    );
  }

  const updated = formatUpdatedDate(article.updated_at);
  const readMin = estimateReadMinutes(article.content);

  return (
    <div className="kb-article kb-article-panel">
      <div className="kb-breadcrumb">
        <span className="kb-breadcrumb-cat" style={{ color: article.categoryColor }}>{article.categoryLabel.toUpperCase()}</span>
        <span className="kb-breadcrumb-sep">›</span>
        <span className="kb-breadcrumb-title">{article.title}</span>
      </div>

      <div className="kb-article-head">
        <h1 className="kb-article-title">{article.title}</h1>
        <div className="kb-article-actions">
          <button type="button" className="kb-btn kb-btn-primary" onClick={onStartEdit}>
            <span dangerouslySetInnerHTML={{ __html: EDIT_ICON }} /> Редагувати
          </button>
          <button type="button" className="kb-icon-btn kb-btn-danger" onClick={onDelete} aria-label="Видалити розділ">
            <span dangerouslySetInnerHTML={{ __html: TRASH_ICON }} />
          </button>
        </div>
      </div>

      {(updated || readMin) && (
        <div className="kb-article-meta">
          {updated && <span>Оновлено {updated}</span>}
          {updated && readMin && <span className="kb-meta-dot" />}
          {readMin && <span>Час читання: {readMin} хв</span>}
        </div>
      )}

      <ArticleBody content={article.content} />
    </div>
  );
}
