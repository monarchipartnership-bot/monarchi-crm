// Mon'Archi SMM — the SEO agent. Crawls the PUBLIC pages of Monarchi's own site (about 25), runs the checks (code), asks the
// model for a priority plan and proposed titles/descriptions, and saves the audit. It only reads; it never edits the site.
// Same rules as the other endpoints that spend money: a valid session, key only on the server, every call through the shared
// model client.
//
// POST body: { url?: string }  (default: smm_settings.site_url)
// → { id, summary, findings, plan, planError? }
import { createClient } from '@supabase/supabase-js';
import { getModelClient } from './_lib/ai.js';
import { BudgetError, ModelError } from './_lib/modelClient.js';
import { auditSite, crawlSite } from './_lib/seoAudit.js';
import { buildPlanPrompts, parsePlan } from './_lib/seoPlan.js';

const SUPA_URL = 'https://meyacsdlosuqbkbichsf.supabase.co';
const SUPA_KEY = 'sb_publishable_jnJ1vdEUtn8ytNdJ4KT5Eg_TVlzWYcA';
const MODEL = 'claude-sonnet-5';

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

  let crawl;
  try { crawl = await crawlSite(url); } catch (e) { bad(res, 400, e.message); return; }
  if (!crawl.pages.length) { bad(res, 502, 'Не вдалося прочитати жодної сторінки сайту.'); return; }
  const audit = auditSite(crawl.pages, crawl.ctx);

  // The model writes the plan; if it cannot, the audit (all of the checks) is still saved and shown.
  let plan = null;
  let planError = null;
  try {
    const { system, user } = buildPlanPrompts(url, audit, crawl.pages);
    const result = await getModelClient(token).callModel({ agentKey: 'smm-seo', trigger: 'user', actor: email, params: { model: MODEL, max_tokens: 2600, thinking: { type: 'disabled' }, system, messages: [{ role: 'user', content: user }] } });
    plan = parsePlan(result.text);
    if (!plan) planError = 'Модель не повернула придатний план. Результати перевірок збережено.';
  } catch (e) {
    planError = e instanceof BudgetError ? e.message : e instanceof ModelError ? e.message : 'Не вдалося скласти план: ' + e.message;
  }

  const pagesLite = crawl.pages.map((p) => ({ url: p.url, status: p.status, ms: p.ms, title: p.title, description: p.description, h1: p.h1[0] || '', words: p.words }));
  const { data: saved, error } = await db.from('smm_site_audits').insert({ site_url: url, summary: audit.summary, findings: audit.findings, pages: pagesLite, plan, error: planError, created_by: email }).select('id, created_at').single();
  if (error) { bad(res, 500, 'Не вдалося зберегти аудит: ' + error.message); return; }
  res.status(200).json({ id: saved.id, summary: audit.summary, findings: audit.findings, plan, planError });
}
