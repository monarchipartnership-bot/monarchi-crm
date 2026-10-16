// Mon'Archi SMM — the content strategist + copywriter. Writes a week of posts for the chosen networks from the brand
// profile and saves them as `needs_review` for a person to approve (nothing is ever published from here).
// Same rules as the other endpoints that spend money: a valid Supabase session, the key only in the server
// environment, every call through the shared model client (retries, usage log, spending limits).
// The work itself is in api/_lib/smmRun.js (the weekly autopilot uses the same function).
//
// POST body: { platforms: [{ platform, count }], weekStart: 'YYYY-MM-DD', language?: 'en'|'uk', focus?: string }
// → { batchId, count, requested, posts: [...] }
import { createClient } from '@supabase/supabase-js';
import { getModelClient } from './_lib/ai.js';
import { BudgetError, ModelError } from './_lib/modelClient.js';
import { generateWeek } from './_lib/smmRun.js';

const SUPA_URL = 'https://meyacsdlosuqbkbichsf.supabase.co';
const SUPA_KEY = 'sb_publishable_jnJ1vdEUtn8ytNdJ4KT5Eg_TVlzWYcA';

function bad(res, code, error, extra = {}) { res.status(code).json({ error, ...extra }); }

export default async function handler(req, res) {
  if (req.method !== 'POST') { bad(res, 405, 'Method not allowed'); return; }
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) { bad(res, 401, 'Потрібна авторизація'); return; }
  const { data: userData, error: authError } = await createClient(SUPA_URL, SUPA_KEY).auth.getUser(token);
  if (authError || !userData?.user) { bad(res, 401, 'Сесія недійсна'); return; }
  if (!process.env.ANTHROPIC_API_KEY) { bad(res, 500, 'ANTHROPIC_API_KEY не налаштовано'); return; }

  // Read and write with the person's own session, so the normal row-level security applies.
  const db = createClient(SUPA_URL, SUPA_KEY, { global: { headers: { Authorization: 'Bearer ' + token } }, auth: { persistSession: false, autoRefreshToken: false } });
  try {
    const r = await generateWeek({ db, model: getModelClient(token), actor: { email: userData.user.email || null, trigger: 'user' }, request: req.body });
    res.status(200).json({ batchId: r.batchId, count: r.posts.length, requested: r.requested, posts: r.posts });
  } catch (e) {
    if (e instanceof BudgetError) { bad(res, 429, e.message); return; }
    if (e instanceof ModelError) { bad(res, 502, e.message); return; }
    if (e.raw) { console.warn('smm-generate: unusable model answer', e.raw); bad(res, 502, e.message, { raw: e.raw }); return; }
    bad(res, /Мова|Оберіть|не більше|Вкажіть|двічі/.test(e.message) ? 400 : 500, e.message);
  }
}
