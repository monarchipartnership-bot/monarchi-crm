import { supabase } from '../supabaseClient';

// The company-wide "Інформаційна база" — same content the AI Agents map's
// core-button modal has been pointing at since it was built (see the
// Constellation page's "Інформаційна база" agent-modal). Two tables:
// kb_categories (topics) and kb_articles (readable/editable sections
// within a topic), seeded from supabase/migrations/2026-09-23_knowledge_base.sql.
export async function fetchKnowledgeBase() {
  const [{ data: categories, error: catError }, { data: articles, error: artError }] = await Promise.all([
    supabase.from('kb_categories').select('*').order('position', { ascending: true }),
    supabase.from('kb_articles').select('*').order('position', { ascending: true }),
  ]);
  if (catError) { console.warn('fetchKnowledgeBase categories failed', catError); return []; }
  if (artError) { console.warn('fetchKnowledgeBase articles failed', artError); return []; }
  return (categories ?? []).map((cat) => ({
    ...cat,
    articles: (articles ?? []).filter((a) => a.category_id === cat.id),
  }));
}

export async function updateKnowledgeArticle(id, { title, content }) {
  const { data, error } = await supabase
    .from('kb_articles')
    .update({ title, content, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select().single();
  if (error) throw error;
  return data;
}

export async function createKnowledgeArticle(categoryId, { title, content }) {
  const { data: siblings, error: fetchError } = await supabase
    .from('kb_articles').select('position').eq('category_id', categoryId).order('position', { ascending: false }).limit(1);
  if (fetchError) throw fetchError;
  const position = siblings?.[0] ? siblings[0].position + 1 : 1;
  const { data, error } = await supabase
    .from('kb_articles')
    .insert({ category_id: categoryId, title: title.trim(), content: content.trim(), position })
    .select().single();
  if (error) throw error;
  return data;
}

export async function deleteKnowledgeArticle(id) {
  const { error } = await supabase.from('kb_articles').delete().eq('id', id);
  if (error) throw error;
}
