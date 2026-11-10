import { useEffect, useMemo, useRef, useState } from 'react';
import { fetchKnowledgeBase, updateKnowledgeArticle, createKnowledgeArticle, deleteKnowledgeArticle, searchKnowledge } from '../../lib/api/knowledgeBase';
import { kbPrivacyWarnings } from '../../lib/kbSearch';
import KnowledgeNav from './KnowledgeNav';
import ArticleView from './ArticleView';
import { KnowledgeHome, KnowledgeCategory, KnowledgeSearch } from './KnowledgeHome';
import { ICON } from './kbIcons';
import { plural } from './kbText';
import '../../styles/knowledgeBasePage.css';

// Lives inside the AI Agents map (see ConstellationTest.jsx's knowledge-base button): a full-screen light workspace over the page, not a routed CRM
// page. The header carries the way back to the map on the right. `onClose` returns the caller to the map.
export default function KnowledgeBase({ onClose }) {
  const [categories, setCategories] = useState(null);
  const [loadError, setLoadError] = useState(false);
  const [search, setSearch] = useState('');
  const [view, setView] = useState('home'); // home | category | article | create
  const [categoryId, setCategoryId] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ title: '', content: '' });
  const [saving, setSaving] = useState(false);
  const [newArticle, setNewArticle] = useState({ title: '', content: '' });
  const [smart, setSmart] = useState(null); // the search by meaning: { query, loading, results: [{ id, why }], error }
  const searchRef = useRef(null);
  const mainRef = useRef(null);

  useEffect(() => {
    let alive = true;
    fetchKnowledgeBase().then((data) => {
      if (!alive) return;
      setCategories(data);
      if (!data.length) setLoadError(true);
    });
    return () => { alive = false; };
  }, []);

  // «/» and ⌘K / Ctrl+K focus the search, Esc clears it or leaves the base
  useEffect(() => {
    const onKey = (e) => {
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName || '');
      if ((e.key === 'k' && (e.metaKey || e.ctrlKey)) || (e.key === '/' && !typing)) { e.preventDefault(); searchRef.current?.focus(); }
      else if (e.key === 'Escape' && !typing) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const allArticles = useMemo(
    () => (categories ?? []).flatMap((cat) => cat.articles.map((a) => ({ ...a, categoryId: cat.id, categoryLabel: cat.label, categoryColor: cat.color }))),
    [categories]
  );
  const selected = allArticles.find((a) => a.id === selectedId) || null;
  const category = (categories ?? []).find((c) => c.id === (view === 'article' ? selected?.categoryId : categoryId)) || null;

  const query = search.trim();
  const searchResults = useMemo(() => {
    const q = query.toLowerCase();
    if (!q) return null;
    return allArticles.filter((a) => a.title.toLowerCase().includes(q) || a.content.toLowerCase().includes(q));
  }, [query, allArticles]);

  function go(next) {
    next();
    setSearch('');
    setEditing(false);
    mainRef.current?.scrollTo({ top: 0 });
  }
  const goHome = () => go(() => { setView('home'); setCategoryId(null); setSelectedId(null); });
  const goCategory = (id) => go(() => { setView('category'); setCategoryId(id); setSelectedId(null); });
  const goArticle = (id) => go(() => {
    const art = allArticles.find((a) => a.id === id);
    setView('article'); setSelectedId(id); if (art) setCategoryId(art.categoryId);
  });
  const goCreate = (catId) => go(() => { setView('create'); setCategoryId(catId); setNewArticle({ title: '', content: '' }); });

  function startEdit() {
    if (!selected) return;
    setDraft({ title: selected.title, content: selected.content });
    setEditing(true);
    mainRef.current?.scrollTo({ top: 0 });
  }

  async function saveEdit() {
    if (!selected) return;
    if (!privacyOk(`${draft.title}\n${draft.content}`)) return;
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
      const catId = selected.categoryId;
      setCategories((cats) => cats.map((cat) => ({ ...cat, articles: cat.articles.filter((a) => a.id !== selected.id) })));
      setSelectedId(null); setEditing(false); setView('category'); setCategoryId(catId);
    } catch (err) {
      console.warn('deleteKnowledgeArticle failed', err);
      alert('Не вдалося видалити розділ.');
    }
  }

  async function saveNewArticle() {
    if (!newArticle.title.trim() || !categoryId) return;
    if (!privacyOk(`${newArticle.title}\n${newArticle.content}`)) return;
    setSaving(true);
    try {
      const created = await createKnowledgeArticle(categoryId, newArticle);
      setCategories((cats) => cats.map((cat) => (cat.id === categoryId ? { ...cat, articles: [...cat.articles, created] } : cat)));
      setSelectedId(created.id); setView('article'); setEditing(false);
      setNewArticle({ title: '', content: '' });
    } catch (err) {
      console.warn('createKnowledgeArticle failed', err);
      alert('Не вдалося створити розділ.');
    } finally {
      setSaving(false);
    }
  }

  const loading = categories === null;
  // the search by meaning: asked by the button on the results page, for the words typed now
  async function runSmart() {
    const q = query;
    setSmart({ query: q, loading: true, results: [], error: '' });
    try { const r = await searchKnowledge(q); setSmart((s) => (s?.query === q ? { query: q, loading: false, results: r, error: '' } : s)); } catch (e) { setSmart((s) => (s?.query === q ? { query: q, loading: false, results: [], error: e.message || 'Не вдалося виконати пошук.' } : s)); }
  }
  // secrets and payment data are not for the base: saving them asks for an explicit yes
  const privacyOk = (text) => { const stop = kbPrivacyWarnings(text).filter((w) => w.level === 'stop'); return !stop.length || confirm(`У тексті є те, чого не можна класти в базу:\n\n${stop.map((w) => '• ' + w.text).join('\n')}\n\nБазу читають AI-агенти, тож текст потрапляє до постачальника моделі. Зберегти все одно?`); };
  const navView = searchResults ? 'search' : view;
  const total = allArticles.length;

  let main = null;
  if (searchResults) main = <KnowledgeSearch results={searchResults} query={query} categories={categories} onArticle={goArticle} smart={smart?.query === query ? smart : null} onSmart={runSmart} allArticles={allArticles} />;
  else if (view === 'home') main = <KnowledgeHome categories={categories} allArticles={allArticles} onCategory={goCategory} onArticle={goArticle} />;
  else if (view === 'category' && category) main = <KnowledgeCategory category={category} onArticle={goArticle} onAdd={goCreate} />;
  else main = (
    <ArticleView
      article={view === 'create' ? null : selected} category={category}
      editing={editing} draft={draft} setDraft={setDraft} saving={saving}
      onStartEdit={startEdit} onCancelEdit={() => setEditing(false)} onSave={saveEdit} onDelete={handleDelete}
      onOpenCategory={goCategory} onOpenArticle={goArticle}
      creating={view === 'create'} newArticle={newArticle} setNewArticle={setNewArticle}
      onCancelCreate={() => (categoryId ? goCategory(categoryId) : goHome())}
      onSaveCreate={saveNewArticle}
    />
  );

  return (
    <div className="kb-overlay" role="dialog" aria-modal="true" aria-label="Інформаційна база">
      <header className="kb-top">
        <button type="button" className="kb-brand" onClick={goHome} aria-label="Інформаційна база: на головну">
          <span className="kb-brand-badge" dangerouslySetInnerHTML={{ __html: ICON.book }} />
          <span className="kb-brand-text"><b>Інформаційна база</b><small>Спільна база знань Mon'Archi{!loading && total ? ` · ${total} ${plural(total, 'розділ', 'розділи', 'розділів')}` : ''}</small></span>
        </button>

        <label className="kb-search">
          <span className="kb-search-ico" dangerouslySetInnerHTML={{ __html: ICON.search }} />
          <input
            ref={searchRef} type="text" value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Пошук по всій базі — назва або текст розділу…" aria-label="Пошук по базі знань"
          />
          <span className="kb-search-kbd">/</span>
        </label>

        <button type="button" className="kb-back" onClick={onClose} aria-label="До мапи" title="До мапи">
          <span className="kb-bi" dangerouslySetInnerHTML={{ __html: ICON.arrowLeft }} />
        </button>
      </header>

      {loading && <div className="kb-empty kb-empty-full">Завантаження…</div>}

      {!loading && loadError && (
        <div className="kb-empty kb-empty-full">
          База поки порожня. Якщо ви щойно додали таблиці — переконайтесь, що міграцію
          <code> 2026-09-23_knowledge_base.sql</code> вже застосовано в Supabase.
        </div>
      )}

      {!loading && !loadError && (
        <div className="kb-body">
          <aside className="kb-side">
            <KnowledgeNav
              categories={categories} view={navView === 'create' ? 'category' : navView} categoryId={category?.id || null} selectedId={selectedId}
              onHome={goHome} onCategory={goCategory} onArticle={goArticle} onAdd={goCreate}
            />
          </aside>
          <main className="kb-main" ref={mainRef}>{main}</main>
        </div>
      )}
    </div>
  );
}
