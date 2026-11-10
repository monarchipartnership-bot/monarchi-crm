// POST { projectId } → { text, colors, fonts, style, logo, notes, images } — «Визначити бренд із файлів»: the model looks at the client's uploaded files and names
// the colours, the kind of type and the style. A signed-in person only; one model call (a few cents). Nothing is written: the page shows the draft for a check.
import { createClient } from '@supabase/supabase-js';
import { getModelClient } from './_lib/ai.js';
import { BudgetError, ModelError } from './_lib/modelClient.js';
import { buildBrandPrompt, parseBrand, pickBrandImages } from '../src/lib/agents/brandAnalysis.js';

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

  const projectId = Number(req.body?.projectId);
  if (!Number.isFinite(projectId)) { res.status(400).json({ error: 'Не вказано проєкт.' }); return; }
  try {
    const db = createClient(SUPA_URL, SUPA_KEY, { global: { headers: { Authorization: 'Bearer ' + token } }, auth: { persistSession: false, autoRefreshToken: false } });
    const assets = await db.from('project_creative_assets').select('kind, name, url').eq('project_id', projectId).order('id', { ascending: true });
    if (assets.error) throw new Error(assets.error.message);
    const images = pickBrandImages(assets.data || []);
    if (!images.length) { res.status(400).json({ error: 'Спершу додайте файли клієнта: логотип, готові креативи або приклади стилю.' }); return; }
    const { system, user } = buildBrandPrompt(images);
    const content = [{ type: 'text', text: user }];
    images.forEach((im) => content.push({ type: 'text', text: `[${im.caption}]` }, { type: 'image', source: { type: 'url', url: im.url } }));
    const result = await getModelClient(token).callModel({
      agentKey: 'project-brand-analyze', actor: userData.user.email, projectId, params: { model: MODEL, max_tokens: 1500, thinking: { type: 'disabled' }, system, messages: [{ role: 'user', content }] },
    });
    res.status(200).json({ ...parseBrand(result.text), images: images.length, costUsd: result.costUsd });
  } catch (e) {
    if (e instanceof BudgetError) { res.status(429).json({ error: e.message }); return; }
    if (e instanceof ModelError) { res.status(502).json({ error: 'Помилка моделі: ' + e.message }); return; }
    res.status(/прочитати|нічого не визначив/.test(e?.message || '') ? 422 : 500).json({ error: e?.message || 'Не вдалося проаналізувати файли.' });
  }
}
