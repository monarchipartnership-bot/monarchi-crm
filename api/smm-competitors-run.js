// Mon'Archi SMM — the competitor agent. Reads the public website of one competitor (or of all that have one), asks the
// model for structured notes, and saves them as a report the content strategist then uses. Reads public pages only,
// never social networks. Same rules as the other endpoints that spend money: a valid session, key only on the server,
// every call through the shared model client.
//
// POST body: { competitorId?: number }  (without it: every competitor that has a website, at most 10)
// → { results: [{ competitorId, name, ok, error?, pages, analysis? }] }
import { createClient } from '@supabase/supabase-js';
import { getModelClient } from './_lib/ai.js';
import { BudgetError, ModelError } from './_lib/modelClient.js';
import { buildAnalysisPrompts, parseAnalysis } from './_lib/competitorAnalysis.js';
import { readSite } from './_lib/siteReader.js';

const SUPA_URL = 'https://meyacsdlosuqbkbichsf.supabase.co';
const SUPA_KEY = 'sb_publishable_jnJ1vdEUtn8ytNdJ4KT5Eg_TVlzWYcA';
const MODEL = 'claude-sonnet-5';
const MAX_PER_RUN = 10;
const PARALLEL = 3;

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

  const model = getModelClient(token);
  async function one(c) {
    const base = { competitorId: c.id, name: c.name };
    let site;
    try { site = await readSite(c.website); } catch (e) { return fail(c, base, e.message, []); }
    const pages = site.pages.map((p) => ({ url: p.url, title: p.title || '', ok: p.ok, error: p.error || null }));
    if (site.blockedByRobots) return fail(c, base, 'Сайт забороняє автоматичне читання (robots.txt). Агент його поважає.', pages);
    if (!site.pages.some((p) => p.ok)) return fail(c, base, site.pages[0]?.error ? `Не вдалося прочитати сайт: ${site.pages[0].error}` : 'Не вдалося прочитати сайт.', pages);
    const { system, user } = buildAnalysisPrompts(c, site.pages);
    let result;
    try {
      result = await model.callModel({ agentKey: 'smm-competitors', trigger: 'user', actor: email, params: { model: MODEL, max_tokens: 1800, thinking: { type: 'disabled' }, system, messages: [{ role: 'user', content: user }] } });
    } catch (e) {
      if (e instanceof BudgetError) return { ...base, ok: false, error: e.message, budget: true, pages };
      return fail(c, base, e instanceof ModelError ? e.message : 'Не вдалося звернутися до моделі: ' + e.message, pages);
    }
    const analysis = parseAnalysis(result.text);
    if (!analysis) return fail(c, base, 'Модель не повернула придатний аналіз. Спробуйте ще раз.', pages);
    const { error: saveError } = await db.from('smm_competitor_reports').insert({ competitor_id: c.id, pages, analysis, created_by: email });
    if (saveError) return { ...base, ok: false, error: 'Не вдалося зберегти звіт: ' + saveError.message, pages };
    return { ...base, ok: true, pages, analysis };
  }
  // A failed run is also kept (with its reason), so the page can say why there is no fresh analysis.
  async function fail(c, base, message, pages) {
    await db.from('smm_competitor_reports').insert({ competitor_id: c.id, pages, analysis: null, error: message, created_by: email });
    return { ...base, ok: false, error: message, pages };
  }

  const results = [];
  for (let i = 0; i < competitors.length; i += PARALLEL) {
    const batch = await Promise.all(competitors.slice(i, i + PARALLEL).map(one));
    results.push(...batch);
    if (batch.some((r) => r.budget)) break; // the spending limit is reached: do not start more
  }
  res.status(200).json({ results });
}
