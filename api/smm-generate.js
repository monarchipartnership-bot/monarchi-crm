// Mon'Archi SMM — the content strategist + copywriter. Writes a week of posts for the chosen networks from the brand
// profile and saves them as `needs_review` for a person to approve (nothing is ever published from here).
// Same rules as the other endpoints that spend money: a valid Supabase session, the key only in the server
// environment, every call through the shared model client (retries, usage log, spending limits).
//
// POST body: { platforms: [{ platform, count }], weekStart: 'YYYY-MM-DD', language?: 'en'|'uk', focus?: string }
// → { batchId, count, posts: [...] }
import { createClient } from '@supabase/supabase-js';
import { getModelClient } from './_lib/ai.js';
import { BudgetError, ModelError } from './_lib/modelClient.js';
import { buildPrompts, parsePosts, scheduleFor, validRequest } from './_lib/smmContent.js';
import { insightLine } from './_lib/competitorAnalysis.js';

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

  const reqInfo = validRequest(req.body);
  if (reqInfo.errors.length) { bad(res, 400, reqInfo.errors.join(' ')); return; }
  const email = userData.user.email || null;

  // Read and write with the person's own session, so the normal row-level security applies.
  const db = createClient(SUPA_URL, SUPA_KEY, { global: { headers: { Authorization: 'Bearer ' + token } }, auth: { persistSession: false, autoRefreshToken: false } });
  const [brandRes, compRes, recentRes, rejectRes] = await Promise.all([
    db.from('smm_brand').select('*').eq('id', 1).maybeSingle(),
    db.from('smm_competitors').select('id, name, notes').order('created_at', { ascending: true }).limit(20),
    db.from('smm_posts').select('topic').order('created_at', { ascending: false }).limit(40),
    db.from('smm_posts').select('review_note').eq('status', 'rejected').not('review_note', 'is', null).order('reviewed_at', { ascending: false }).limit(10),
  ]);
  if (brandRes.error) { bad(res, 500, 'Таблиці SMM ще не створено (потрібна міграція): ' + brandRes.error.message); return; }

  // The newest successful analysis of each competitor, in one short line each.
  const comps = compRes.data || [];
  const repRes = comps.length ? await db.from('smm_competitor_reports').select('competitor_id, analysis, created_at').in('competitor_id', comps.map((c) => c.id)).not('analysis', 'is', null).order('created_at', { ascending: false }).limit(60) : { data: [] };
  const latest = new Map();
  (repRes.data || []).forEach((r) => { if (!latest.has(r.competitor_id)) latest.set(r.competitor_id, r.analysis); });
  const competitorsWithInsight = comps.map((c) => ({ ...c, insight: insightLine(c.name, latest.get(c.id)) }));

  const { system, user } = buildPrompts({
    brand: brandRes.data || {}, competitors: competitorsWithInsight, platforms: reqInfo.platforms, language: reqInfo.language,
    focus: reqInfo.focus, weekStart: reqInfo.weekStart, recentTopics: (recentRes.data || []).map((r) => r.topic).filter(Boolean),
    rejections: (rejectRes.data || []).map((r) => r.review_note).filter(Boolean),
  });
  const total = reqInfo.platforms.reduce((s, p) => s + p.count, 0);

  let result;
  try {
    result = await getModelClient(token).callModel({
      agentKey: 'smm-content', trigger: 'user', actor: email,
      params: { model: MODEL, max_tokens: Math.min(7000, 650 * total + 800), thinking: { type: 'disabled' }, system, messages: [{ role: 'user', content: user }] },
    });
  } catch (e) {
    if (e instanceof BudgetError) { bad(res, 429, e.message); return; }
    bad(res, 502, e instanceof ModelError ? e.message : 'Не вдалося звернутися до моделі: ' + e.message);
    return;
  }

  const posts = scheduleFor(parsePosts(result.text, reqInfo.platforms), reqInfo.weekStart);
  if (!posts.length) { bad(res, 502, 'Модель не повернула жодного придатного поста. Спробуйте ще раз.'); return; }

  const batchId = crypto.randomUUID();
  const rows = posts.map((p) => ({
    platform: p.platform, format: p.format, status: 'needs_review', topic: p.topic, body: p.body, hashtags: p.hashtags,
    visual_brief: p.visual_brief, fact_check: p.fact_check, language: reqInfo.language, scheduled_for: p.scheduled_for,
    batch_id: batchId, source: 'agent', created_by: email,
  }));
  const { data: saved, error } = await db.from('smm_posts').insert(rows).select();
  if (error) { bad(res, 500, 'Не вдалося зберегти пости: ' + error.message); return; }
  res.status(200).json({ batchId, count: saved.length, requested: total, posts: saved });
}
