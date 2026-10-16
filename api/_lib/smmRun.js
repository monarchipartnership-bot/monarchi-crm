// The work of the SMM content team, as functions that need nothing but a database client and a model client:
//  - generateWeek: write a week of posts into the approval queue (used by the «Згенерувати план» button AND the autopilot);
//  - analyseCompetitors: read competitor websites and save an analysis for each (the button AND the autopilot);
//  - smmDue / runSmmWeekly: the weekly autopilot (the cron every 15 minutes asks «is it time?», then runs it).
// The database and the model are handed in, so scripts/check-core.mjs tests the schedule and the whole run with stand-ins.
import { lastScheduled } from '../../src/lib/agentSchedule.js';
import { BudgetError, ModelError } from './modelClient.js';
import { buildAnalysisPrompts, insightLine, parseAnalysis } from './competitorAnalysis.js';
import { buildPrompts, MAX_POSTS_PER_RUN, nextMonday, parsePosts, PLATFORM_KEYS, scheduleFor, validRequest } from './smmContent.js';
import { readSite } from './siteReader.js';

const MODEL = 'claude-sonnet-5';
const MAX_TRIES = 3;
const RETRY_AFTER_MIN = 60;
const LEASE_MIN = 12;
const REFRESH_AFTER_DAYS = 6;
const MAX_REFRESH_PER_RUN = 5;

// ---------------------------------------------------------------------------------------- a week of posts
// → { batchId, requested, posts: [saved rows] }. Throws an Error with a readable message (BudgetError / ModelError pass through).
export async function generateWeek({ db, model, actor, request }) {
  const info = validRequest(request);
  if (info.errors.length) throw new Error(info.errors.join(' '));
  const [brandRes, compRes, recentRes, rejectRes] = await Promise.all([
    db.from('smm_brand').select('*').eq('id', 1).maybeSingle(),
    db.from('smm_competitors').select('id, name, notes').order('created_at', { ascending: true }).limit(20),
    db.from('smm_posts').select('topic').order('created_at', { ascending: false }).limit(40),
    db.from('smm_posts').select('review_note').eq('status', 'rejected').not('review_note', 'is', null).order('reviewed_at', { ascending: false }).limit(10),
  ]);
  if (brandRes.error) throw new Error('Таблиці SMM ще не створено (потрібна міграція): ' + brandRes.error.message);

  // The newest successful analysis of each competitor, in one short line each.
  const comps = compRes.data || [];
  const repRes = comps.length ? await db.from('smm_competitor_reports').select('competitor_id, analysis, created_at').in('competitor_id', comps.map((c) => c.id)).not('analysis', 'is', null).order('created_at', { ascending: false }).limit(60) : { data: [] };
  const latest = new Map();
  (repRes.data || []).forEach((r) => { if (!latest.has(r.competitor_id)) latest.set(r.competitor_id, r.analysis); });

  const { system, user } = buildPrompts({
    brand: brandRes.data || {}, competitors: comps.map((c) => ({ ...c, insight: insightLine(c.name, latest.get(c.id)) })), platforms: info.platforms, language: info.language,
    focus: info.focus, weekStart: info.weekStart, recentTopics: (recentRes.data || []).map((r) => r.topic).filter(Boolean), rejections: (rejectRes.data || []).map((r) => r.review_note).filter(Boolean),
  });
  const total = info.platforms.reduce((s, p) => s + p.count, 0);
  const result = await model.callModel({
    agentKey: 'smm-content', trigger: actor?.trigger || 'user', actor: actor?.email || null,
    params: { model: MODEL, max_tokens: Math.min(7000, 650 * total + 800), thinking: { type: 'disabled' }, system, messages: [{ role: 'user', content: user }] },
  });
  const posts = scheduleFor(parsePosts(result.text, info.platforms), info.weekStart);
  if (!posts.length) {
    const err = new Error('Модель не повернула жодного придатного поста. Спробуйте ще раз.');
    err.raw = String(result.text || '').slice(0, 700) + ' [...] ' + String(result.text || '').slice(-200);
    throw err;
  }
  const batchId = globalThis.crypto.randomUUID();
  const rows = posts.map((p) => ({
    platform: p.platform, format: p.format, status: 'needs_review', topic: p.topic, body: p.body, hashtags: p.hashtags, visual_brief: p.visual_brief, fact_check: p.fact_check,
    language: info.language, scheduled_for: p.scheduled_for, batch_id: batchId, source: 'agent', created_by: actor?.email || null,
  }));
  const { data: saved, error } = await db.from('smm_posts').insert(rows).select();
  if (error) throw new Error('Не вдалося зберегти пости: ' + error.message);
  return { batchId, requested: total, posts: saved };
}

// ---------------------------------------------------------------------------------------- competitor analyses
// → [{ competitorId, name, ok, error?, pages, analysis?, budget? }]; stops starting new ones when the spending limit is reached.
export async function analyseCompetitors({ db, model, actor, competitors, read = readSite, parallel = 3 }) {
  async function failWith(c, message, pages) {
    await db.from('smm_competitor_reports').insert({ competitor_id: c.id, pages, analysis: null, error: message, created_by: actor?.email || null });
    return { competitorId: c.id, name: c.name, ok: false, error: message, pages };
  }
  async function one(c) {
    const base = { competitorId: c.id, name: c.name };
    let site;
    try { site = await read(c.website); } catch (e) { return failWith(c, e.message, []); }
    const pages = site.pages.map((p) => ({ url: p.url, title: p.title || '', ok: p.ok, error: p.error || null }));
    if (site.blockedByRobots) return failWith(c, 'Сайт забороняє автоматичне читання (robots.txt). Агент його поважає.', pages);
    if (!site.pages.some((p) => p.ok)) return failWith(c, site.pages[0]?.error ? `Не вдалося прочитати сайт: ${site.pages[0].error}` : 'Не вдалося прочитати сайт.', pages);
    const { system, user } = buildAnalysisPrompts(c, site.pages);
    let result;
    try {
      result = await model.callModel({ agentKey: 'smm-competitors', trigger: actor?.trigger || 'user', actor: actor?.email || null, params: { model: MODEL, max_tokens: 1800, thinking: { type: 'disabled' }, system, messages: [{ role: 'user', content: user }] } });
    } catch (e) {
      if (e instanceof BudgetError) return { ...base, ok: false, error: e.message, budget: true, pages };
      return failWith(c, e instanceof ModelError ? e.message : 'Не вдалося звернутися до моделі: ' + e.message, pages);
    }
    const analysis = parseAnalysis(result.text);
    if (!analysis) return failWith(c, 'Модель не повернула придатний аналіз. Спробуйте ще раз.', pages);
    const { error } = await db.from('smm_competitor_reports').insert({ competitor_id: c.id, pages, analysis, created_by: actor?.email || null });
    if (error) return { ...base, ok: false, error: 'Не вдалося зберегти звіт: ' + error.message, pages };
    return { ...base, ok: true, pages, analysis };
  }
  const results = [];
  for (let i = 0; i < competitors.length; i += parallel) {
    const batch = await Promise.all(competitors.slice(i, i + parallel).map(one));
    results.push(...batch);
    if (batch.some((r) => r.budget)) break;
  }
  return results;
}

// ---------------------------------------------------------------------------------------- the weekly autopilot
// settings: the smm_settings row. → { due, scheduledFor?: 'YYYY-MM-DD', reason }. Missing a cron tick only delays a run, never loses it.
export function smmDue({ settings, now = new Date() }) {
  if (!settings?.enabled) return { due: false, reason: 'вимкнено' };
  if (settings.run_state === 'running' && settings.lease_until && new Date(settings.lease_until) > now) return { due: false, reason: 'вже виконується' };
  const sched = lastScheduled('weekly', { weeklyDay: settings.weekday, weeklyTime: settings.time }, now);
  if (settings.enabled_since && sched.at < new Date(settings.enabled_since)) return { due: false, reason: 'запланований момент був до вмикання' };
  if (settings.last_scheduled === sched.date) {
    if (settings.last_status === 'ok') return { due: false, reason: 'вже виконано', scheduledFor: sched.date };
    if ((settings.attempts || 0) >= MAX_TRIES) return { due: false, reason: 'вичерпано спроби', scheduledFor: sched.date };
    if (settings.last_attempt_at && now.getTime() - new Date(settings.last_attempt_at).getTime() < RETRY_AFTER_MIN * 60000) return { due: false, reason: 'чекаємо перед повтором', scheduledFor: sched.date };
  }
  return { due: true, scheduledFor: sched.date };
}

export function buildSmmNotifications({ status, count, weekStart, message, emails = [] }) {
  const to = [...new Set(emails.map((e) => String(e).trim().toLowerCase()).filter(Boolean))];
  const ok = status === 'ok';
  return to.map((email) => ({
    recipient_email: email, type: ok ? 'project_report' : 'project_agent_problem',
    title: ok ? 'SMM: пости на тиждень готові до перевірки' : 'SMM: автозапуск не зміг скласти пости',
    body: (ok ? `${count} постів на тиждень з ${weekStart} чекають у черзі схвалення.` : message || 'Помилка').slice(0, 400),
    link: ok ? '/automation/smm?tab=queue' : '/automation/smm',
  }));
}

const weekdayOf = (ymd) => ((new Date(`${ymd}T12:00:00Z`).getUTCDay() + 6) % 7) + 1;

// Runs the autopilot once for the schedule moment `scheduledFor`. Never throws: the outcome is written to smm_settings.
export async function runSmmWeekly({ db, model, settings, scheduledFor, email, now = new Date(), read = readSite }) {
  const actor = { email, trigger: 'cron' };
  const leaseUntil = new Date(now.getTime() + LEASE_MIN * 60000).toISOString();
  // Claim the run: only one at a time (a stale 'running' claim is taken over after the lease).
  const claim = await db.from('smm_settings').update({ run_state: 'running', lease_until: leaseUntil }).eq('id', 1).or(`run_state.eq.idle,lease_until.lt.${now.toISOString()}`).select('id');
  if (claim.error || !claim.data?.length) return { status: 'skipped', message: 'Інший запуск уже триває.' };

  let status = 'ok';
  let message = '';
  let count = 0;
  const notes = [];
  const weekStart = nextMonday(scheduledFor, weekdayOf(scheduledFor));
  try {
    if (settings.refresh_competitors) {
      const comps = (await db.from('smm_competitors').select('*').neq('website', '')).data || [];
      const reps = comps.length ? (await db.from('smm_competitor_reports').select('competitor_id, created_at, analysis').in('competitor_id', comps.map((c) => c.id)).order('created_at', { ascending: false }).limit(100)).data || [] : [];
      const newest = new Map();
      reps.forEach((r) => { if (!newest.has(r.competitor_id)) newest.set(r.competitor_id, r); });
      const stale = comps.filter((c) => {
        const r = newest.get(c.id);
        return !r || now.getTime() - new Date(r.created_at).getTime() > (r.analysis ? REFRESH_AFTER_DAYS : 1) * 86400000;
      }).slice(0, MAX_REFRESH_PER_RUN);
      if (stale.length) {
        const res = await analyseCompetitors({ db, model, actor, competitors: stale, read });
        const failed = res.filter((r) => !r.ok);
        if (failed.length) notes.push(`Не вдалося оновити аналіз: ${failed.map((f) => f.name).join(', ')}.`);
      }
    }
    const platforms = PLATFORM_KEYS.map((k) => ({ platform: k, count: Math.min(7, Math.max(0, Number(settings.counts?.[k]) || 0)) })).filter((p) => p.count > 0);
    let total = 0;
    const trimmed = platforms.map((p) => { const c = Math.min(p.count, Math.max(0, MAX_POSTS_PER_RUN - total)); total += c; return { ...p, count: c }; }).filter((p) => p.count > 0);
    if (!trimmed.length) throw new Error('В налаштуваннях автозапуску не вказано жодного поста.');
    const week = await generateWeek({ db, model, actor, request: { platforms: trimmed, weekStart, language: settings.language, focus: '' } });
    count = week.posts.length;
    message = `Створено ${count} із ${week.requested} постів на тиждень з ${weekStart}.${notes.length ? ' ' + notes.join(' ') : ''}`;
  } catch (e) {
    status = 'problem';
    message = e instanceof BudgetError ? e.message : (e?.message || String(e));
  }

  const sameSchedule = settings.last_scheduled === scheduledFor;
  const attempts = status === 'ok' ? 1 : (sameSchedule ? (settings.attempts || 0) + 1 : 1);
  await db.from('smm_settings').update({
    run_state: 'idle', lease_until: null, last_scheduled: scheduledFor, attempts, last_attempt_at: now.toISOString(),
    last_run_at: now.toISOString(), last_status: status, last_message: message.slice(0, 500),
  }).eq('id', 1);

  // The people are told when it worked, and once when it failed for good (not on every retry).
  if (status === 'ok' || attempts >= MAX_TRIES) {
    const rows = buildSmmNotifications({ status, count, weekStart, message, emails: settings.notify_emails || [] });
    if (rows.length) await db.from('notifications').insert(rows.map((r) => ({ ...r, sender_email: email })));
  }
  return { status, message, count, weekStart };
}
