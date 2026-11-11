// POST { campaignId, text } → { fields, agent_settings, notes, costUsd } — «Проаналізувати й заповнити» in the form of a cycle: the model reads the description of the cycle
// (typed or dictated) and the card of the project and returns the values for the fields of the form and for the settings of the agents of this cycle.
// A signed-in person only; one model call (a few cents). Nothing is written: the form shows the draft and the person corrects it.
import { createClient } from '@supabase/supabase-js';
import { getModelClient } from './_lib/ai.js';
import { BudgetError, ModelError } from './_lib/modelClient.js';
import { MIN_FILL_CHARS, buildFillPrompt, parseFill } from '../src/lib/agents/cycleFormFill.js';

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

  const num = (v) => (v == null || v === '' ? NaN : Number(v));
  const campaignId = num(req.body?.campaignId);
  const projectId = num(req.body?.projectId); // the launch of the creative team: the operation does not exist yet, the project does
  const text = String(req.body?.text || '').trim();
  if (!Number.isFinite(campaignId) && !Number.isFinite(projectId)) { res.status(400).json({ error: 'Не вказано операцію чи проєкт.' }); return; }
  if (text.length < MIN_FILL_CHARS) { res.status(400).json({ error: 'Опишіть завдання хоча б одним-двома реченнями: що потрібно й для чого.' }); return; }
  try {
    const db = createClient(SUPA_URL, SUPA_KEY, { global: { headers: { Authorization: 'Bearer ' + token } }, auth: { persistSession: false, autoRefreshToken: false } });
    const campaign = Number.isFinite(campaignId) ? (await db.from('ag_campaigns').select('id, name, project_id, config').eq('id', campaignId).maybeSingle()).data : { id: null, name: '', project_id: projectId, config: {} };
    if (!campaign) { res.status(404).json({ error: 'Операцію не знайдено.' }); return; }
    const [project, settings] = await Promise.all([
      campaign.project_id ? db.from('projects').select('name, client, website, business_type, notes').eq('id', campaign.project_id).maybeSingle().then((r) => r.data) : null,
      campaign.project_id ? db.from('project_creative').select('restrictions, inputs').eq('project_id', campaign.project_id).maybeSingle().then((r) => r.data) : null,
    ]);
    const { system, user } = buildFillPrompt({ text, campaign, project, settings });
    const result = await getModelClient(token).callModel({
      agentKey: 'creative-form-fill', actor: userData.user.email, projectId: campaign.project_id || null,
      params: { model: MODEL, max_tokens: 2000, thinking: { type: 'disabled' }, system, messages: [{ role: 'user', content: user }] },
    });
    res.status(200).json({ ...parseFill(result.text), costUsd: result.costUsd });
  } catch (e) {
    if (e instanceof BudgetError) { res.status(429).json({ error: e.message }); return; }
    if (e instanceof ModelError) { res.status(502).json({ error: 'Помилка моделі: ' + e.message }); return; }
    res.status(/прочитати|нічого не визначив/.test(e?.message || '') ? 422 : 500).json({ error: e?.message || 'Не вдалося проаналізувати опис.' });
  }
}
