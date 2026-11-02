// POST { text, language? } → { extracted } — lays the free words of the manager about a client over the fields of the card (quick fill, spec 2026-11-02).
// It needs a signed-in person; one model call (≈ a couple of cents). Nothing is written here: the screen shows the result for a check and saves it.
import { createClient } from '@supabase/supabase-js';
import { getModelClient } from './_lib/ai.js';
import { BudgetError, ModelError } from './_lib/modelClient.js';
import { buildExtractPrompt, parseExtraction } from '../src/lib/agents/profileExtract.js';

const SUPA_URL = 'https://meyacsdlosuqbkbichsf.supabase.co';
const SUPA_KEY = 'sb_publishable_jnJ1vdEUtn8ytNdJ4KT5Eg_TVlzWYcA';
const MODEL = 'claude-sonnet-5';

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) { res.status(401).json({ error: 'Не авторизовано' }); return; }
  const authClient = createClient(SUPA_URL, SUPA_KEY);
  const { data: userData, error: authError } = await authClient.auth.getUser(token);
  if (authError || !userData?.user) { res.status(401).json({ error: 'Сесія недійсна' }); return; }
  if (!process.env.ANTHROPIC_API_KEY) { res.status(500).json({ error: 'ANTHROPIC_API_KEY не налаштовано на сервері' }); return; }

  const text = String(req.body?.text || '').trim();
  if (text.length < 8) { res.status(400).json({ error: 'Скажіть або напишіть трохи більше про клієнта.' }); return; }
  const language = ['uk', 'ru', 'en'].includes(req.body?.language) ? req.body.language : 'uk';
  const { system, user } = buildExtractPrompt(text, language);
  try {
    const result = await getModelClient(token).callModel({
      agentKey: 'project-profile-extract', actor: userData.user.email, params: { model: MODEL, max_tokens: 2400, thinking: { type: 'disabled' }, system, messages: [{ role: 'user', content: user }] },
    });
    res.status(200).json({ extracted: parseExtraction(result.text, text), costUsd: result.costUsd });
  } catch (e) {
    if (e instanceof BudgetError) { res.status(429).json({ error: e.message }); return; }
    if (e instanceof ModelError) { res.status(502).json({ error: 'Помилка моделі: ' + e.message }); return; }
    res.status(e?.message?.includes('розібрати') ? 422 : 500).json({ error: e?.message || 'Не вдалося розібрати текст.' });
  }
}
