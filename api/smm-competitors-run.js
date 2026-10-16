// Mon'Archi SMM — the competitor agent. Reads the public website of one competitor (or of all that have one), asks the
// model for structured notes, and saves them as a report the content strategist then uses. Reads public pages only,
// never social networks. Same rules as the other endpoints that spend money: a valid session, key only on the server,
// every call through the shared model client. The work itself is in api/_lib/smmRun.js (the weekly autopilot reuses it).
//
// POST body: { competitorId?: number }  (without it: every competitor that has a website, at most 10)
// → { results: [{ competitorId, name, ok, error?, pages, analysis? }] }
import { createClient } from '@supabase/supabase-js';
import { getModelClient } from './_lib/ai.js';
import { analyseCompetitors } from './_lib/smmRun.js';

const SUPA_URL = 'https://meyacsdlosuqbkbichsf.supabase.co';
const SUPA_KEY = 'sb_publishable_jnJ1vdEUtn8ytNdJ4KT5Eg_TVlzWYcA';
const MAX_PER_RUN = 10;

function bad(res, code, error) { res.status(code).json({ error }); }

export default async function handler(req, res) {
  if (req.method !== 'POST') { bad(res, 405, 'Method not allowed'); return; }
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) { bad(res, 401, 'Потрібна авторизація'); return; }
  const { data: userData, error: authError } = await createClient(SUPA_URL, SUPA_KEY).auth.getUser(token);
  if (authError || !userData?.user) { bad(res, 401, 'Сесія недійсна'); return; }
  if (!process.env.ANTHROPIC_API_KEY) { bad(res, 500, 'ANTHROPIC_API_KEY не налаштовано'); return; }
  const email = userData.user.email || null;

  const db = createClient(SUPA_URL, SUPA_KEY, { global: { headers: { Authorization: 'Bearer ' + token } }, auth: { persistSession: false, autoRefreshToken: false } });
  const id = req.body?.competitorId != null ? Number(req.body.competitorId) : null;
  let q = db.from('smm_competitors').select('*').neq('website', '').order('created_at', { ascending: true }).limit(MAX_PER_RUN);
  if (id) q = db.from('smm_competitors').select('*').eq('id', id).limit(1);
  const { data: competitors, error } = await q;
  if (error) { bad(res, 500, 'Не вдалося прочитати конкурентів: ' + error.message); return; }
  if (!competitors?.length) { bad(res, 400, id ? 'Конкурента не знайдено.' : 'Немає конкурентів із сайтом. Додайте адресу сайту.'); return; }
  if (id && !competitors[0].website?.trim()) { bad(res, 400, 'У конкурента не вказано сайт. Соцмережі агент не читає, лише публічні сайти.'); return; }

  const results = await analyseCompetitors({ db, model: getModelClient(token), actor: { email, trigger: 'user' }, competitors });
  res.status(200).json({ results });
}
