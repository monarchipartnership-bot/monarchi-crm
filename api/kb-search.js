// POST { query } → { results: [{ id, why }] } — the search by meaning of «Інформаційна база» (spec 2026-11-02, §8). A signed-in person only; one model call (a few cents):
// the model reads the question and a short card of every section and names the ones that answer it. Nothing is written.
import { createClient } from '@supabase/supabase-js';
import { getModelClient } from './_lib/ai.js';
import { BudgetError, ModelError } from './_lib/modelClient.js';
import { buildKbSearchPrompt, parseKbSearch } from '../src/lib/kbSearch.js';

const SUPA_URL = 'https://meyacsdlosuqbkbichsf.supabase.co';
const SUPA_KEY = 'sb_publishable_jnJ1vdEUtn8ytNdJ4KT5Eg_TVlzWYcA';
const MODEL = 'claude-sonnet-5';

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) { res.status(401).json({ error: 'Не авторизовано' }); return; }
  const { data: userData, error: authError } = await createClient(SUPA_URL, SUPA_KEY).auth.getUser(token);
  if (authError || !userData?.user) { res.status(401).json({ error: 'Сесія недійсна' }); return; }
  if (!process.env.ANTHROPIC_API_KEY) { res.status(500).json({ error: 'ANTHROPIC_API_KEY не налаштовано на сервері' }); return; }

  const query = String(req.body?.query || '').trim();
  if (query.length < 3) { res.status(400).json({ error: 'Напишіть, що шукаєте (хоча б кілька слів).' }); return; }
  try {
    const db = createClient(SUPA_URL, SUPA_KEY, { global: { headers: { Authorization: 'Bearer ' + token } }, auth: { persistSession: false, autoRefreshToken: false } });
    const [cats, arts] = await Promise.all([db.from('kb_categories').select('id, label'), db.from('kb_articles').select('id, category_id, title, content').limit(400)]);
    if (cats.error || arts.error) throw new Error((cats.error || arts.error).message);
    const label = new Map((cats.data || []).map((c) => [c.id, c.label]));
    const articles = (arts.data || []).map((a) => ({ id: a.id, title: a.title, content: a.content, categoryLabel: label.get(a.category_id) || '' }));
    if (!articles.length) { res.status(200).json({ results: [] }); return; }
    const { system, user } = buildKbSearchPrompt(query, articles);
    const result = await getModelClient(token).callModel({
      agentKey: 'kb-search', actor: userData.user.email, params: { model: MODEL, max_tokens: 900, thinking: { type: 'disabled' }, system, messages: [{ role: 'user', content: user }] },
    });
    res.status(200).json({ results: parseKbSearch(result.text, articles.map((a) => a.id)), costUsd: result.costUsd });
  } catch (e) {
    if (e instanceof BudgetError) { res.status(429).json({ error: e.message }); return; }
    if (e instanceof ModelError) { res.status(502).json({ error: 'Помилка моделі: ' + e.message }); return; }
    res.status(500).json({ error: e?.message || 'Не вдалося виконати пошук.' });
  }
}
