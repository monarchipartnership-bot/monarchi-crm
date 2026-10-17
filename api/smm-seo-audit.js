// Mon'Archi SMM — the SEO agent. Crawls the PUBLIC pages of Monarchi's own site (about 25), runs the checks (code), asks the
// model for a priority plan and proposed titles/descriptions, and saves the audit. It only reads; it never edits the site.
// Same rules as the other endpoints that spend money: a valid session, key only on the server, every call through the shared
// model client.
//
// POST body: { url?: string }  (default: smm_settings.site_url)
// → { id, summary, findings, plan, planError? }
import { createClient } from '@supabase/supabase-js';
import { getModelClient } from './_lib/ai.js';
import { runSeoAudit } from './_lib/seoRun.js';

const SUPA_URL = 'https://meyacsdlosuqbkbichsf.supabase.co';
const SUPA_KEY = 'sb_publishable_jnJ1vdEUtn8ytNdJ4KT5Eg_TVlzWYcA';

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

  const settings = (await db.from('smm_settings').select('site_url').eq('id', 1).maybeSingle()).data;
  const url = String(req.body?.url || settings?.site_url || '').trim();
  if (!url) { bad(res, 400, 'Вкажіть адресу сайту.'); return; }

  try {
    const r = await runSeoAudit({ db, model: getModelClient(token), email, url });
    res.status(200).json(r);
  } catch (e) { bad(res, e.status || 500, e.message); }
}
