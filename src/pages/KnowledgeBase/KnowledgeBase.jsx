import { useEffect, useMemo, useState } from 'react';
import { fetchKnowledgeBase, updateKnowledgeArticle, createKnowledgeArticle, deleteKnowledgeArticle } from '../../lib/api/knowledgeBase';
import KnowledgeOrb from './KnowledgeOrb';
import KnowledgeSidebar from './KnowledgeSidebar';
import ArticleView from './ArticleView';
import '../../styles/knowledgeBasePage.css';

const SEARCH_ICON = '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.35-4.35"/></svg>';
const BACK_ICON = '<svg viewBox="0 0 24 24"><path d="m15 18-6-6 6-6"/></svg>';

// Lives only inside the AI Agents map (see ConstellationTest.jsx's core
// sphere) — opens as a near-fullscreen panel over the constellation's own
// starfield, not a routed CRM page and not a plain white modal. `onClose`
// returns the caller to the map.
export default function KnowledgeBase({ onClose }) {
  const [categories, setCategories] = useState(null);
  const [loadError, setLoadError] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [collapsed, setCollapsed] = useState({});
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ title: '', content: '' });
  const [saving, setSaving] = useState(false);
  const [addingTo, setAddingTo] = useState(null);
  const [newArticle, setNewArticle] = useState({ title: '', content: '' });

  useEffect(() => {
    let alive = true;
    fetchKnowledgeBase().then((data) => {
      if (!alive) return;
      setCategories(data);
      if (data.length && data[0].articles.length) setSelectedId(data[0].articles[0].id);
      if (!data.length) setLoadError(true);
    });
    return () => { alive = false; };
  }, []);

  const allArticles = useMemo(
    () => (categories ?? []).flatMap((cat) => cat.articles.map((a) => ({ ...a, categoryLabel: cat.label, categoryColor: cat.color }))),
    [categories]
  );
  const selected = allArticles.find((a) => a.id === selectedId) || null;

  const searchResults = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return null;
    return allArticles.filter((a) => a.title.toLowerCase().includes(q) || a.content.toLowerCase().includes(q));
  }, [search, allArticles]);

  function openArticle(id) {
    setSelectedId(id);
    setEditing(false);
    setAddingTo(null);
  }

  function startEdit() {
    if (!selected) return;
    setDraft({ title: selected.title, content: selected.content });
    setEditing(true);
  }

  async function saveEdit() {
    if (!selected) return;
    setSaving(true);
    try {
      const updated = await updateKnowledgeArticle(selected.id, draft);
      setCategories((cats) => cats.map((cat) => ({
        ...cat,
        articles: cat.articles.map((a) => (a.id === updated.id ? { ...a, ...updated } : a)),
      })));
      setEditing(false);
    } catch (err) {
      console.warn('saveEdit failed', err);
      alert('Не вдалося зберегти зміни. Спробуйте ще раз.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!selected) return;
    if (!confirm(`Видалити розділ "${selected.title}"? Це незворотно.`)) return;
    try {
      await deleteKnowledgeArticle(selected.id);
      setCategories((cats) => cats.map((cat) => ({ ...cat, articles: cat.articles.filter((a) => a.id !== selected.id) })));
      setSelectedId(null);
      setEditing(false);
    } catch (err) {
      console.warn('deleteKnowledgeArticle failed', err);
      alert('Не вдалося видалити розділ.');
    }
  }

  async function saveNewArticle(categoryId) {
    if (!newArticle.title.trim()) return;
    setSaving(true);
    try {
      const created = await createKnowledgeArticle(categoryId, newArticle);
      setCategories((cats) => cats.map((cat) => (cat.id === categoryId ? { ...cat, articles: [...cat.articles, created] } : cat)));
      setSelectedId(created.id);
      setAddingTo(null);
      setNewArticle({ title: '', content: '' });
      setEditing(false);
    } catch (err) {
      console.warn('createKnowledgeArticle failed', err);
      alert('Не вдалося створити розділ.');
    } finally {
      setSaving(false);
    }
  }

  function toggleCategory(id) {
    setCollapsed((c) => ({ ...c, [id]: !c[id] }));
  }

  const loading = categories === null;

  return (
    <div className="kb-overlay">
      <div className="kb-nav">
        <button type="button" className="kb-nav-pill" onClick={onClose}>
          <span dangerouslySetInnerHTML={{ __html: BACK_ICON }} /> До карти системи
        </button>
        {/* No duplicate "CRM" pill here — the map's own top-right exit link
            (ConstellationTest.jsx's .constellation-exit) stays rendered and
            clickable behind this overlay's transparent top band, so it
            shows through in the same corner instead of stacking two. */}
      </div>

      <div className="kb-panel">
        <div className="kb-panel-glow" />

        <div className="kb-header">
          <KnowledgeOrb />
          <div className="kb-header-text">
            <div className="kb-kicker">ІНФОРМАЦІЙНА БАЗА</div>
            <h1>Спільна база знань</h1>
            <p>Усе, що знає команда про Mon'Archi — процеси, доступи, канали, метрики й сезонність. Той самий контент, на який спираються AI-агенти й бот підтримки клієнтів.</p>
          </div>
        </div>

        <div className="kb-search">
          <span dangerouslySetInnerHTML={{ __html: SEARCH_ICON }} />
          <input
            type="text" value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Пошук по всій базі — назва або текст розділу…"
          />
          <span className="kb-search-kbd">⌘K</span>
        </div>

        {loading && <div className="kb-empty">Завантаження…</div>}

        {!loading && loadError && (
          <div className="kb-empty">
            База поки порожня. Якщо ви щойно додали таблиці — переконайтесь, що міграцію
            <code> 2026-09-23_knowledge_base.sql</code> вже застосовано в Supabase.
          </div>
        )}

        {!loading && !loadError && (
          <div className="kb-body">
            <aside className="kb-sidebar">
              <KnowledgeSidebar
                categories={categories} search={search} searchResults={searchResults}
                selectedId={selectedId} collapsed={collapsed}
                onToggleCategory={toggleCategory}
                onSelect={openArticle}
                onAddClick={(catId) => { setAddingTo(catId); setSelectedId(null); }}
              />
            </aside>

            <section className="kb-content">
              <ArticleView
                article={addingTo ? null : selected}
                editing={editing} draft={draft} setDraft={setDraft} saving={saving}
                onStartEdit={startEdit} onCancelEdit={() => setEditing(false)} onSave={saveEdit} onDelete={handleDelete}
                creating={!!addingTo} newArticle={newArticle} setNewArticle={setNewArticle}
                onCancelCreate={() => { setAddingTo(null); setNewArticle({ title: '', content: '' }); }}
                onSaveCreate={() => saveNewArticle(addingTo)}
              />
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
