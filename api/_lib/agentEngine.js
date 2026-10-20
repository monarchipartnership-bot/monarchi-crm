// The engine of the agent framework: the agents of a team are linked in a chain through TASKS. An agent (or the schedule, or a
// person) puts a task in the queue; the engine runs the tasks of the agents that are ON (an agent is stopped when its own switch is
// off or when an agent it REQUIRES upstream is off, see src/lib/agents/chain.js), logs every model call with the exact prompt, and
// the handler of the role may create the next tasks:
//   strategist  -> plan of the week (waits for the person's OK) -> per post: copywriter (write) + visual (visual) in parallel
//   copywriter + visual (both done) -> quality control (review) -> back to the executor with comments (up to maxRounds) or to the person
// The database, the model and the site readers are handed in, so the same code runs from the buttons, from the cron and in tests.
import { agentDue, ancestorsOf, chainStates } from '../../src/lib/agents/chain.js';
import { DEFAULT_PROMPTS } from '../../src/lib/agents/defaultPrompts.js';
import { SMM_ROLES, TEAM } from '../../src/lib/agents/smmTeam.js';
import { kyivParts } from '../../src/lib/agentSchedule.js';
import { BudgetError } from './modelClient.js';
import { buildCopyPrompts, buildQcPrompts, buildStrategistPrompts, buildVisualPrompts, decideQc, feedbackFor, parseCopy, parseQc, parseStrategy, parseVisual, scheduleStrategy } from './agentContent.js';
import { analyseCompetitors } from './smmRun.js';
import { insightLine } from './competitorAnalysis.js';
import { DEFAULT_SITE, analyseSite, authFromEnv, collectSiteStats, reportInput, strategistLines } from './googleSiteData.js';
import { applyExtras, siteExtras } from './siteExtras.js';
import { runSeoAudit } from './seoRun.js';
import * as higgsfield from './higgsfield.js';
import { campaignRole } from './campaignRun.js';
import { CAMPAIGN_TEAM } from '../../src/lib/agents/campaignTeam.js';
import { LANGUAGES, MAX_POSTS_PER_RUN, nextMonday, PLATFORM_KEYS } from './smmContent.js';

const MODEL = 'claude-sonnet-5';
const LEASE_MIN = 10;
const MAX_REFRESH_PER_RUN = 5;
const TASK_TYPE = { site_analyst: 'report', seo: 'audit', competitors: 'analyse', social_analyst: 'report', strategist: 'plan_week', copywriter: 'write', visual: 'visual', qc: 'review', publisher: 'publish' };
const READY = Object.fromEntries(SMM_ROLES.map((r) => [r.role, { ready: r.ready, note: r.readyNote }]));

// The image/video generator: the real Higgsfield when its keys are set on the server, nothing otherwise (ctx.hf = null turns it off, a stand-in replaces it in tests).
const hfOf = (ctx) => (ctx.hf === undefined ? (higgsfield.isConfigured() ? higgsfield : null) : ctx.hf);
export const generatorReady = (ctx) => !!hfOf(ctx);

const must = (r, what) => { if (r.error) throw new Error(`${what}: ${r.error.message}`); return r.data; };
const iso = (d) => d.toISOString();

// ---------------------------------------------------------------------------------------------------------------- team and tasks
export async function loadTeam(db) {
  const agents = must(await db.from('ag_agents').select('*').eq('team', TEAM).eq('scope_type', 'internal').eq('scope_id', '').order('sort'), 'agents') || [];
  const links = agents.length ? must(await db.from('ag_links').select('*').in('from_agent_id', agents.map((a) => a.id)), 'links') || [] : [];
  return { agents, links, byRole: new Map(agents.map((a) => [a.role, a])), byId: new Map(agents.map((a) => [a.id, a])) };
}

export async function enqueue(db, { agent, type, brief = {}, postId = null, planId = null, from = null, by = null, parent = null }) {
  return must(await db.from('ag_tasks').insert({ agent_id: agent.id, type, status: 'queued', brief, post_id: postId, plan_id: planId, created_by_agent_id: from?.id ?? null, created_by: by, parent_task_id: parent }).select().single(), 'task');
}

async function loadPrompt(db, agent, task) {
  const rows = must(await db.from('ag_prompts').select('*').eq('agent_id', agent.id), 'prompts') || [];
  const p = rows.find((r) => r.id === task.brief?.prompt_id) || rows.find((r) => r.is_default) || rows[0];
  if (p) return { id: p.id, version: p.current_version, body: p.body };
  return { id: null, version: null, body: DEFAULT_PROMPTS[agent.role]?.body || '' };
}

// The model, wrapped so that every call is written to ag_runs with the EXACT system and user prompt that was sent.
// prefix: the editable instruction of agents whose system prompt is built by older code (competitors, SEO).
function recorder(ctx, { task, agent, prompt, prefix = '' }) {
  const state = { cost: 0 };
  return {
    state,
    async callModel(args) {
      const params = { ...args.params };
      if (prefix.trim()) params.system = `${prefix.trim()}\n\n${params.system}`;
      const started = Date.now();
      const content = params.messages?.[0]?.content;
      const log = { task_id: task.id, agent_id: agent.id, prompt_id: prompt.id, prompt_version: prompt.version, model: params.model, system_prompt: params.system, user_prompt: typeof content === 'string' ? content : JSON.stringify(content) };
      try {
        const r = await ctx.model.callModel({ ...args, trigger: ctx.trigger, actor: ctx.email, params });
        state.cost += r.costUsd || 0;
        await ctx.db.from('ag_runs').insert({ ...log, response: r.text, input_tokens: r.usage?.input_tokens ?? null, output_tokens: r.usage?.output_tokens ?? null, cost_usd: r.costUsd ?? null, duration_ms: Date.now() - started, status: 'ok' });
        return r;
      } catch (e) {
        await ctx.db.from('ag_runs').insert({ ...log, duration_ms: Date.now() - started, status: 'error', error: String(e?.message || e).slice(0, 500) });
        throw e;
      }
    },
  };
}

const modelParams = (agent, extra) => ({ model: agent.model || MODEL, thinking: { type: 'disabled' }, ...extra });

async function notify(ctx, emails, { title, body, link }) {
  const to = [...new Set((emails || []).map((e) => String(e).trim().toLowerCase()).filter(Boolean))];
  if (!to.length) return;
  await ctx.db.from('notifications').insert(to.map((email) => ({ recipient_email: email, sender_email: ctx.email, type: 'project_report', title, body: String(body).slice(0, 400), link })));
}

const loadBrand = async (db) => (await db.from('smm_brand').select('*').eq('id', 1).maybeSingle()).data || {};
async function loadPost(db, id) {
  const post = must(await db.from('smm_posts').select('*').eq('id', id).maybeSingle(), 'post');
  if (!post) throw new Error('Пост не знайдено (можливо, видалений).');
  return post;
}

// What the research agents have found, as short lines for the strategist.
async function loadResearch(db) {
  const comps = (await db.from('smm_competitors').select('id, name').order('created_at', { ascending: true }).limit(20)).data || [];
  const reps = comps.length ? (await db.from('smm_competitor_reports').select('competitor_id, analysis, created_at').in('competitor_id', comps.map((c) => c.id)).not('analysis', 'is', null).order('created_at', { ascending: false }).limit(60)).data || [] : [];
  const latest = new Map();
  reps.forEach((r) => { if (!latest.has(r.competitor_id)) latest.set(r.competitor_id, r.analysis); });
  const competitors = comps.map((c) => insightLine(c.name, latest.get(c.id))).filter(Boolean);
  const audit = (await db.from('smm_site_audits').select('plan, created_at').not('plan', 'is', null).order('created_at', { ascending: false }).limit(1)).data?.[0];
  const seo = audit?.plan ? [audit.plan.summary, ...(audit.plan.priorities || []).map((p) => `${p.title}: ${p.why}`)].filter(Boolean) : [];
  // what the site analyst found in GA4 / Search Console (the table may not exist yet: then nothing)
  const stats = (await db.from('smm_site_stats').select('data').order('created_at', { ascending: false }).limit(1)).data?.[0];
  return { competitors, seo, site: strategistLines(stats?.data), social: [] };
}

// Every agent of every team (the SMM team and the campaign teams of the clients) with the links between them. States are computed
// per agent id, and links never cross a team, so one pass of the queue serves all teams.
export async function loadAll(db) {
  const agents = must(await db.from('ag_agents').select('*').order('sort'), 'agents') || [];
  const links = agents.length ? must(await db.from('ag_links').select('*').in('from_agent_id', agents.map((a) => a.id)), 'links') || [] : [];
  const campaigns = must(await db.from('ag_campaigns').select('id, status'), 'campaigns') || [];
  return { agents, links, byId: new Map(agents.map((a) => [a.id, a])), campaigns: new Map(campaigns.map((c) => [String(c.id), c.status])) };
}
// The team one agent belongs to (same team and scope), in the shape the handlers use.
export function subTeam(all, agent) {
  const agents = all.agents.filter((a) => a.team === agent.team && a.scope_type === agent.scope_type && a.scope_id === agent.scope_id);
  const ids = new Set(agents.map((a) => a.id));
  return { agents, links: all.links.filter((l) => ids.has(l.from_agent_id) && ids.has(l.to_agent_id)), byRole: new Map(agents.map((a) => [a.role, a])), byId: new Map(agents.map((a) => [a.id, a])) };
}
const readyOf = (a) => (a?.team === CAMPAIGN_TEAM ? { ready: true } : READY[a?.role] || { ready: false });
const typeOf = (a) => (a.team === CAMPAIGN_TEAM ? 'report' : TASK_TYPE[a.role]);
// A campaign team works only while its campaign is active (pausing a campaign stops all of its agents at once).
const campaignOn = (all, a) => a.team !== CAMPAIGN_TEAM || all.campaigns.get(a.scope_id) === 'active';
const runnable = (all, states, a) => !!a && readyOf(a).ready && campaignOn(all, a) && states[a.id]?.state === 'on';

// ---------------------------------------------------------------------------------------------------------------- production of a post
// After the copywriter or the visual agent finishes: when nothing of the production is still open and the text is written,
// the quality controller gets the post.
export async function advancePost(ctx, team, postId) {
  const { db } = ctx;
  const post = await loadPost(db, postId);
  if (post.status !== 'producing') return null;
  const open = must(await db.from('ag_tasks').select('id, type').eq('post_id', postId).in('status', ['queued', 'running']), 'tasks') || [];
  if (open.length) return null;
  if (!String(post.body || '').trim()) return null; // the text failed: the person sees the failed task and retries it
  if (post.needs_visual && !post.visual_prompt) return null;
  const qc = team.byRole.get('qc');
  if (!qc) return null;
  // The text and the visual may finish at the same moment, each seeing «nothing else is open»: only the one that wins this
  // conditional update (producing -> qc) puts the post in front of the controller.
  const won = await db.from('smm_posts').update({ status: 'qc', updated_at: iso(ctx.now()) }).eq('id', postId).eq('status', 'producing').select('id');
  if (won.error || !won.data?.length) return null;
  return enqueue(db, { agent: qc, type: 'review', postId, planId: post.plan_id, from: null, by: 'ланцюжок' });
}

// Plan approved: every planned post goes into production: the text and (when it needs one) the visual, in parallel.
export async function startProduction(ctx, team, posts) {
  const copy = team.byRole.get('copywriter');
  const vis = team.byRole.get('visual');
  const strat = team.byRole.get('strategist');
  let count = 0;
  for (const post of posts) {
    await ctx.db.from('smm_posts').update({ status: 'producing', updated_at: iso(ctx.now()) }).eq('id', post.id);
    if (copy) await enqueue(ctx.db, { agent: copy, type: 'write', postId: post.id, planId: post.plan_id, from: strat, by: 'ланцюжок' });
    if (post.needs_visual && vis) await enqueue(ctx.db, { agent: vis, type: 'visual', postId: post.id, planId: post.plan_id, from: strat, by: 'ланцюжок' });
    count += 1;
  }
  return count;
}

export async function approvePlan(ctx, planId) {
  const team = await loadTeam(ctx.db);
  const plan = must(await ctx.db.from('smm_plans').select('*').eq('id', planId).maybeSingle(), 'plan');
  if (!plan) throw new Error('План не знайдено.');
  if (plan.status !== 'awaiting_approval' && plan.status !== 'draft') throw new Error('Цей план уже оброблено.');
  must(await ctx.db.from('smm_plans').update({ status: 'approved', approved_by: ctx.email, approved_at: iso(ctx.now()) }).eq('id', planId), 'plan');
  const posts = must(await ctx.db.from('smm_posts').select('*').eq('plan_id', planId).eq('status', 'planned'), 'posts') || [];
  return { started: await startProduction(ctx, team, posts) };
}

export async function rejectPlan(ctx, planId, reason) {
  const note = String(reason || '').trim().slice(0, 400) || 'План відхилено без причини.';
  const now = iso(ctx.now());
  must(await ctx.db.from('smm_plans').update({ status: 'rejected', note, approved_by: ctx.email, approved_at: now }).eq('id', planId).eq('status', 'awaiting_approval'), 'plan');
  must(await ctx.db.from('smm_posts').update({ status: 'rejected', review_note: note, reviewed_by: ctx.email, reviewed_at: now }).eq('plan_id', planId).eq('status', 'planned'), 'posts');
  return { ok: true };
}

// ---------------------------------------------------------------------------------------------------------------- the roles
async function strategist({ ctx, team, agent, task, prompt, rec }) {
  const { db } = ctx;
  const cfg = agent.config || {};
  const brief = task.brief || {};
  const today = kyivParts(ctx.now());
  const weekStart = /^\d{4}-\d{2}-\d{2}$/.test(String(brief.weekStart || '')) ? brief.weekStart : nextMonday(today.date, today.weekday);
  const counts = brief.counts || cfg.counts || {};
  let left = MAX_POSTS_PER_RUN;
  const platforms = PLATFORM_KEYS.map((k) => ({ platform: k, count: Math.min(7, Math.max(0, Math.floor(Number(counts[k]) || 0))) })).filter((p) => p.count > 0)
    .map((p) => { const c = Math.min(p.count, left); left -= c; return { ...p, count: c }; }).filter((p) => p.count > 0);
  if (!platforms.length) throw new Error('У налаштуваннях стратега не вказано жодного поста.');
  const language = LANGUAGES[brief.language || cfg.language] ? (brief.language || cfg.language) : 'en';
  const total = platforms.reduce((s, p) => s + p.count, 0);

  const [brand, research, recent, rejected] = await Promise.all([
    loadBrand(db), loadResearch(db),
    db.from('smm_posts').select('topic').order('created_at', { ascending: false }).limit(40),
    db.from('smm_posts').select('review_note').eq('status', 'rejected').not('review_note', 'is', null).order('reviewed_at', { ascending: false }).limit(10),
  ]);
  const { system, user } = buildStrategistPrompts({
    body: prompt.body, brand, platforms, language, focus: brief.focus ?? cfg.focus ?? '', weekStart, research,
    recentTopics: (recent.data || []).map((r) => r.topic).filter(Boolean), rejections: (rejected.data || []).map((r) => r.review_note).filter(Boolean),
  });
  const result = await rec.callModel({ agentKey: 'smm-strategist', params: modelParams(agent, { max_tokens: Math.min(7000, 520 * total + 1400), system, messages: [{ role: 'user', content: user }] }) });
  const plan = parseStrategy(result.text, platforms);
  if (!plan) throw new Error('Модель не повернула придатний план тижня. Спробуйте ще раз (відповідь модель збережено в історії).');

  const approval = cfg.requirePlanApproval !== false;
  const now = iso(ctx.now());
  const planRow = must(await db.from('smm_plans').insert({ week_start: weekStart, status: approval ? 'awaiting_approval' : 'approved', summary: plan.summary, language, task_id: task.id, created_by: ctx.email, ...(approval ? {} : { approved_by: 'авто', approved_at: now }) }).select().single(), 'plan');
  const batchId = globalThis.crypto.randomUUID();
  const rows = scheduleStrategy(plan.posts, weekStart).map((p) => ({
    platform: p.platform, format: p.format, status: 'planned', topic: p.topic, body: '', hashtags: '', visual_brief: p.visual_brief, fact_check: p.fact_check, language,
    scheduled_for: p.scheduled_for, batch_id: batchId, source: 'agent', created_by: ctx.email, plan_id: planRow.id, needs_visual: p.needs_visual,
    brief: { angle: p.angle, key_points: p.key_points, cta: p.cta, seo_note: p.seo_note },
  }));
  const saved = must(await db.from('smm_posts').insert(rows).select(), 'posts');
  let started = 0;
  if (!approval) started = await startProduction(ctx, team, saved);
  else await notify(ctx, cfg.notifyEmails, { title: 'SMM: план тижня чекає на ваше «ок»', body: `${saved.length} постів на тиждень з ${weekStart}: ${plan.summary}`, link: '/automation/smm?tab=queue' });
  return { output: { planId: planRow.id, posts: saved.length, requested: total, approval, started, weekStart }, summary: `План на тиждень з ${weekStart}: ${saved.length} із ${total} постів${approval ? ', чекає на ваше «ок»' : ', запущено у виробництво'}.` };
}

async function copywriter({ ctx, agent, task, prompt, rec }) {
  const { db } = ctx;
  const post = await loadPost(db, task.post_id);
  const feedback = task.brief?.feedback || [];
  const { system, user } = buildCopyPrompts({ body: prompt.body, brand: await loadBrand(db), post, feedback, language: post.language || 'en', previous: feedback.length ? post.body : '' });
  const result = await rec.callModel({ agentKey: 'smm-copywriter', params: modelParams(agent, { max_tokens: 1800, system, messages: [{ role: 'user', content: user }] }) });
  const copy = parseCopy(result.text);
  if (!copy) throw new Error('Модель не повернула придатний текст поста (відповідь збережено в історії).');
  must(await db.from('smm_posts').update({ body: copy.body, hashtags: copy.hashtags, fact_check: copy.fact_check || post.fact_check, updated_at: iso(ctx.now()) }).eq('id', post.id), 'post');
  return { output: { chars: copy.body.length, rework: feedback.length > 0 }, summary: `Текст для ${post.platform}: ${copy.body.length} знаків${feedback.length ? ' (за зауваженнями)' : ''}.`, advance: post.id };
}

async function visual({ ctx, agent, task, prompt, rec }) {
  const { db } = ctx;
  const post = await loadPost(db, task.post_id);
  const feedback = task.brief?.feedback || [];
  const { system, user } = buildVisualPrompts({ body: prompt.body, styleNotes: agent.config?.styleNotes || '', brand: await loadBrand(db), post, feedback });
  const result = await rec.callModel({ agentKey: 'smm-visual', params: modelParams(agent, { max_tokens: 1400, system, messages: [{ role: 'user', content: user }] }) });
  const v = parseVisual(result.text, post);
  if (!v) throw new Error('Модель не повернула придатний промт для візуалу (відповідь збережено в історії).');
  const update = { visual_prompt: v, asset_kind: v.mode, asset_status: 'none', asset_url: null, updated_at: iso(ctx.now()) };
  let generated = null;
  const hf = hfOf(ctx);
  if (agent.config?.generate !== false && hf) {
    try { generated = await hf.submit({ post, visual: v }); } catch (e) { update.asset_status = 'failed'; update.visual_prompt = { ...v, generation_error: String(e.message || e).slice(0, 300) }; }
    if (generated) { update.asset_status = 'pending'; update.visual_prompt = { ...v, generation: { job_id: generated.jobId, status_url: generated.statusUrl, provider: generated.provider, at: iso(ctx.now()) } }; }
  }
  must(await db.from('smm_posts').update(update).eq('id', post.id), 'post');
  return { output: { mode: v.mode, aspect: v.aspect_ratio, asset: update.asset_status }, summary: `Промт для ${post.platform}: ${v.mode}, ${v.aspect_ratio}${generated ? ', генерацію запущено' : ', без генерації'}.`, advance: post.id };
}

async function qualityControl({ ctx, team, agent, task, prompt, rec }) {
  const { db } = ctx;
  const post = await loadPost(db, task.post_id);
  const { system, user } = buildQcPrompts({ body: prompt.body, brand: await loadBrand(db), post, language: post.language || 'en' });
  const result = await rec.callModel({ agentKey: 'smm-qc', params: modelParams(agent, { max_tokens: 1200, system, messages: [{ role: 'user', content: user }] }) });
  const qc = parseQc(result.text);
  if (!qc) throw new Error('Модель не повернула придатний висновок контролю якості (відповідь збережено в історії).');
  const rounds = post.rounds || 0;
  const decision = decideQc({ qc, rounds, maxRounds: Number(agent.config?.maxRounds ?? 2), hasVisual: !!post.needs_visual });
  const history = [...(post.qc?.history || []), ...(post.qc?.verdict ? [{ round: post.qc.round, verdict: post.qc.verdict, summary: post.qc.summary, issues: post.qc.issues }] : [])];
  const saved = { ...qc, round: rounds + 1, unresolved: decision.unresolved, history, at: iso(ctx.now()) };
  if (decision.action === 'to_review') {
    must(await db.from('smm_posts').update({ qc: saved, status: 'needs_review', updated_at: iso(ctx.now()) }).eq('id', post.id), 'post');
    return { output: { verdict: qc.verdict, action: 'to_review', unresolved: decision.unresolved, issues: qc.issues.length }, summary: qc.verdict === 'pass' ? 'Пройшов контроль, чекає на вас.' : 'Лишилися зауваження після всіх кіл, передано вам із позначкою.' };
  }
  must(await db.from('smm_posts').update({ qc: saved, status: 'producing', rounds: rounds + 1, updated_at: iso(ctx.now()) }).eq('id', post.id), 'post');
  for (const target of decision.targets) {
    const to = team.byRole.get(target === 'text' ? 'copywriter' : 'visual');
    if (to) await enqueue(db, { agent: to, type: target === 'text' ? 'write' : 'visual', postId: post.id, planId: post.plan_id, from: agent, by: 'контроль якості', parent: task.id, brief: { feedback: feedbackFor(qc, target), round: rounds + 1 } });
  }
  return { output: { verdict: 'revise', action: 'rework', targets: decision.targets, issues: qc.issues.length }, summary: `Повернуто на доопрацювання (${decision.targets.map((t) => (t === 'text' ? 'текст' : 'візуал')).join(', ')}), коло ${rounds + 1}.` };
}

async function competitors({ ctx, agent, task, rec }) {
  const { db, now } = ctx;
  const all = (await db.from('smm_competitors').select('*').neq('website', '')).data || [];
  if (!all.length) return { output: { analysed: 0 }, summary: 'Немає конкурентів із сайтом: додайте їх у вкладці «Бренд і конкуренти».' };
  let list = all;
  if (task.brief?.scheduled) { // on schedule only the stale ones; a person pressing «run» gets all of them
    const days = Number(agent.config?.refreshDays ?? 6);
    const reps = (await db.from('smm_competitor_reports').select('competitor_id, created_at, analysis').in('competitor_id', all.map((c) => c.id)).order('created_at', { ascending: false }).limit(100)).data || [];
    const newest = new Map();
    reps.forEach((r) => { if (!newest.has(r.competitor_id)) newest.set(r.competitor_id, r); });
    list = all.filter((c) => { const r = newest.get(c.id); return !r || now().getTime() - new Date(r.created_at).getTime() > (r.analysis ? days : 1) * 86400000; });
  }
  list = list.slice(0, MAX_REFRESH_PER_RUN);
  if (!list.length) return { output: { analysed: 0 }, summary: 'Усі аналізи свіжі, оновлювати нічого.' };
  const results = await analyseCompetitors({ db, model: rec, actor: { email: ctx.email, trigger: ctx.trigger }, competitors: list, read: ctx.read });
  const ok = results.filter((r) => r.ok);
  if (!ok.length) throw new Error(results[0]?.error || 'Не вдалося проаналізувати жодного конкурента.');
  const failed = results.filter((r) => !r.ok);
  return { output: { analysed: ok.length, failed: failed.map((f) => ({ name: f.name, error: f.error })) }, summary: `Проаналізовано ${ok.length} із ${results.length}${failed.length ? `. Не вдалося: ${failed.map((f) => f.name).join(', ')}` : ''}.` };
}

// The website analyst: reads GA4 and Search Console as the service account, works out the figures, changes and findings IN CODE, lets the model
// phrase a short report (it never computes), saves everything, and the strategist and the SEO agent read it next time they work.
const SITE_RULES = 'Write in Ukrainian, plain words, at most 220 words: the most useful finding first, then what grew or fell, then what deserves attention. Use ONLY the numbers in the data; where a figure has no change shown (too little data), say the volume is too small to judge and never calculate a percentage yourself. Name any cause as a hypothesis, never as a fact. If the data has leads (заявки з форми сайту), say how many there were and where they came from right after the main finding; if siteCheck says the site did not answer, put that first. End with two short lists: «Для SEO» and «Для стратега», each at most 3 lines, taken from the findings.';
async function siteAnalyst({ ctx, agent, prompt, rec }) {
  const cfg = { ...DEFAULT_SITE, ...Object.fromEntries(Object.entries(agent.config || {}).filter(([, v]) => v)) };
  const raw = ctx.site ? await ctx.site({ config: cfg }) : await collectSiteStats({ auth: authFromEnv(ctx.env || process.env), config: cfg, now: ctx.now });
  const extras = await siteExtras({ db: ctx.db, fetchFn: ctx.extrasFetch || fetch, now: ctx.now });
  const analysis = applyExtras(analyseSite(raw, agent.config?.thresholds), extras);
  let report = '';
  let modelError = null;
  try {
    const r = await rec.callModel({ agentKey: 'smm-site-analyst', params: modelParams(agent, { max_tokens: 1200, system: `${prompt.body}\n\n${SITE_RULES}`, messages: [{ role: 'user', content: reportInput(analysis) }] }) });
    report = String(r.text || '').trim();
  } catch (e) { modelError = String(e?.message || e).slice(0, 300); }
  if (!report) report = analysis.findings.map((f) => '- ' + f.text).join('\n') || 'Даних для звіту немає.';
  const row = { period_start: raw.period.cur.start, period_end: raw.period.cur.end, data: analysis, report, model_error: modelError, created_by: ctx.email };
  const saved = await ctx.db.from('smm_site_stats').insert(row).select('id').single();
  if (saved.error) throw new Error(/smm_site_stats/.test(saved.error.message) ? 'Не вдалося зберегти звіт: таблицю smm_site_stats ще не створено (потрібна міграція 20261032000000).' : 'Не вдалося зберегти звіт: ' + saved.error.message);
  const notes = [raw.errors?.ga4 && 'GA4 недоступний', raw.errors?.gsc && 'Search Console недоступний', modelError && 'текст звіту зібрано без моделі'].filter(Boolean);
  return { output: { statsId: saved.data.id, findings: analysis.findings.length, seoLines: analysis.handoff.seo.length, strategistLines: analysis.handoff.strategist.length, notes }, summary: `Звіт за ${raw.period.cur.start} – ${raw.period.cur.end}: ${analysis.findings.length} висновків${notes.length ? '. ' + notes.join(', ') : ''}.` };
}

async function seo({ ctx, task, rec }) {
  const url = String(task.brief?.url || (await ctx.db.from('smm_settings').select('site_url').eq('id', 1).maybeSingle()).data?.site_url || '').trim();
  if (!url) throw new Error('Вкажіть адресу сайту у вкладці «Сайт».');
  const traffic = ((await ctx.db.from('smm_site_stats').select('data').order('created_at', { ascending: false }).limit(1)).data?.[0]?.data?.handoff?.seo) || [];
  const r = await runSeoAudit({ db: ctx.db, model: rec, email: ctx.email, url, trigger: ctx.trigger, crawl: ctx.crawl, traffic });
  return { output: { auditId: r.id, pages: r.summary.pages, high: r.summary.high, medium: r.summary.medium, planError: r.planError }, summary: `Аудит: ${r.summary.pages} сторінок, проблем: ${r.summary.high} важливих, ${r.summary.medium} середніх${r.planError ? '. План не склався: ' + r.planError : ''}.` };
}

const HANDLERS = { strategist, copywriter, visual, qc: qualityControl, competitors, seo, site_analyst: siteAnalyst };
const handlerOf = (a) => (a?.team === CAMPAIGN_TEAM ? campaignRole : HANDLERS[a?.role]);

// Pictures and videos that were sent to the generator: look at each, keep the finished file in our storage, record a failure.
export async function pollAssets(ctx) {
  const hf = hfOf(ctx);
  if (!hf) return 0;
  const posts = must(await ctx.db.from('smm_posts').select('id, asset_kind, visual_prompt, updated_at').eq('asset_status', 'pending').limit(20), 'posts') || [];
  let changed = 0;
  for (const post of posts) {
    const gen = post.visual_prompt?.generation;
    let patch = null;
    if (!gen?.status_url) patch = { asset_status: 'failed' };
    else {
      const r = await hf.check({ statusUrl: gen.status_url, kind: post.asset_kind });
      if (r.state === 'ready') patch = { asset_status: 'ready', asset_url: await hf.persist({ db: ctx.db, url: r.url, kind: post.asset_kind, postId: post.id }) };
      else if (r.state === 'failed') patch = { asset_status: 'failed', visual_prompt: { ...post.visual_prompt, generation_error: r.error } };
      else if (ctx.now().getTime() - new Date(gen.at || post.updated_at).getTime() > 45 * 60000) patch = { asset_status: 'failed', visual_prompt: { ...post.visual_prompt, generation_error: 'Час очікування генерації вичерпано.' } };
    }
    if (patch) { await ctx.db.from('smm_posts').update({ ...patch, updated_at: iso(ctx.now()) }).eq('id', post.id); changed += 1; }
  }
  return changed;
}

// A person asks for a new picture of a post that is already in the queue (the same visual brief, a new prompt and a new generation).
export async function redoVisual(ctx, postId, note = '') {
  const team = await loadTeam(ctx.db);
  const vis = team.byRole.get('visual');
  if (!vis) throw new Error('Візуал-агента не знайдено.');
  const feedback = String(note || '').trim() ? [String(note).trim().slice(0, 400)] : ['Зробіть інший варіант: інша композиція, той самий сенс.'];
  await enqueue(ctx.db, { agent: vis, type: 'visual', postId, from: null, by: ctx.email, brief: { feedback, redo: true } });
  return { ok: true };
}

// ---------------------------------------------------------------------------------------------------------------- running tasks
// Claims a queued task (only one process can) and runs it. → the finished task row, or null when someone else took it.
export async function runTask(ctx, team, task) {
  const { db } = ctx;
  const agent = team.byId.get(task.agent_id);
  const now = ctx.now();
  const claim = await db.from('ag_tasks').update({ status: 'running', started_at: iso(now), lease_until: iso(new Date(now.getTime() + LEASE_MIN * 60000)) }).eq('id', task.id).or(`status.eq.queued,lease_until.lt.${iso(now)}`).select();
  if (claim.error || !claim.data?.length) return null;
  const handler = handlerOf(agent);
  const prompt = agent ? await loadPrompt(db, agent, task) : { id: null, version: null, body: '' };
  const rec = recorder(ctx, { task, agent: agent || { id: task.agent_id }, prompt, prefix: agent?.team !== CAMPAIGN_TEAM && ['competitors', 'seo'].includes(agent?.role) ? prompt.body : '' });
  let outcome;
  try {
    if (!handler) throw new Error(readyOf(agent).note || 'Цей агент ще не вміє виконувати завдання.');
    const r = await handler({ ctx, team, agent, task, prompt, rec });
    outcome = { ok: true, ...r };
  } catch (e) {
    outcome = { ok: false, error: e instanceof BudgetError ? e.message : (e?.message || String(e)) };
  }
  const finished = iso(ctx.now());
  const status = outcome.ok ? 'done' : 'failed';
  await db.from('ag_tasks').update({ status, output: outcome.ok ? outcome.output : null, error: outcome.ok ? null : String(outcome.error).slice(0, 600), cost_usd: rec.state.cost, finished_at: finished, lease_until: null, prompt_id: prompt.id, prompt_version: prompt.version }).eq('id', task.id);
  if (agent) await db.from('ag_agents').update({ last_run_at: finished, last_status: outcome.ok ? 'ok' : 'problem', last_message: String(outcome.ok ? outcome.summary : outcome.error).slice(0, 500) }).eq('id', agent.id);
  if (outcome.ok && agent) { try { await fanOut(ctx, team, agent); } catch (e) { console.warn('fanOut failed:', e?.message || e); } }
  if (outcome.ok && outcome.advance) { try { await advancePost(ctx, team, outcome.advance); } catch (e) { console.warn('advancePost failed:', e?.message || e); } }
  return { id: task.id, status, role: agent?.role, error: outcome.ok ? null : outcome.error };
}

// A campaign agent finished: the agents that depend on it may start. An agent starts only when the whole chain above it has delivered
// for this round: every agent upstream of it (directly or further up, only the ones that are switched on) has a finished task that is
// newer (a later task id) than the agent's own last one (the researchers, which work once at the launch, only need to have finished once). So a report
// or a control never starts before the work it checks, whatever order the parallel tasks finish in. If something upstream failed,
// the round waits until it is retried: that is how a broken link stops the chain.
async function fanOut(ctx, team, agent) {
  if (agent.team !== CAMPAIGN_TEAM) return;
  const targets = team.links.filter((l) => l.from_agent_id === agent.id).map((l) => team.byId.get(l.to_agent_id)).filter((b) => b && b.enabled && b.config?.trigger === 'upstream');
  for (const b of targets) {
    const ups = ancestorsOf(b.id, team.links).map((id) => team.byId.get(id)).filter((a) => a && a.enabled);
    const ids = [b.id, ...ups.map((a) => a.id)];
    const open = must(await ctx.db.from('ag_tasks').select('id').in('agent_id', ids).in('status', ['queued', 'running']).limit(1), 'tasks') || [];
    if (open.length) continue; // someone in the chain is still working: the last one to finish starts it
    const rows = must(await ctx.db.from('ag_tasks').select('agent_id, id').in('agent_id', ids).eq('status', 'done').order('id', { ascending: false }).limit(600), 'tasks') || [];
    const last = new Map();
    rows.forEach((r) => { if (!last.has(r.agent_id) || r.id > last.get(r.agent_id)) last.set(r.agent_id, r.id); }); // task ids only grow: no ties, unlike timestamps
    const mine = last.get(b.id);
    const ready = ups.every((u) => last.has(u.id) && (u.config?.trigger === 'initial' || !mine || last.get(u.id) > mine));
    if (!ready) continue;
    const task = await enqueue(ctx.db, { agent: b, type: 'report', brief: { trigger: 'upstream', from: agent.name }, by: 'ланцюжок' });
    // Two agents finishing at the same moment may both start the same one: the earliest open task stays, the later one withdraws.
    const same = must(await ctx.db.from('ag_tasks').select('id').eq('agent_id', b.id).in('status', ['queued', 'running']).order('id', { ascending: true }), 'tasks') || [];
    if (same.length > 1 && Math.min(...same.map((t) => t.id)) !== task.id) await ctx.db.from('ag_tasks').update({ status: 'cancelled', finished_at: iso(ctx.now()) }).eq('id', task.id).eq('status', 'queued');
  }
}

// Agents with a schedule whose moment has come get a task. → [roles started]
async function scheduleDue(ctx, all) {
  const states = chainStates(all.agents, all.links);
  const started = [];
  for (const a of all.agents) {
    if (!a.schedule || !runnable(all, states, a) || !a.enabled) continue;
    const verdict = agentDue({ agent: a, now: ctx.now() });
    if (!verdict.due) continue;
    const open = must(await ctx.db.from('ag_tasks').select('id').eq('agent_id', a.id).in('status', ['queued', 'running']).limit(1), 'tasks') || [];
    if (open.length) continue;
    const same = a.last_scheduled === verdict.scheduledFor;
    must(await ctx.db.from('ag_agents').update({ last_scheduled: verdict.scheduledFor, attempts: same ? (a.attempts || 0) + 1 : 1, last_attempt_at: iso(ctx.now()) }).eq('id', a.id), 'agent');
    await enqueue(ctx.db, { agent: a, type: typeOf(a), brief: { scheduled: true, scheduledFor: verdict.scheduledFor }, by: 'розклад' });
    started.push(a.role);
  }
  return started;
}

// One pass of the queue: starts what is due on schedule, then runs the queued tasks of the agents that are ON (a few at a time)
// until nothing is left or the time is up. Called by the cron every 15 minutes and by the page after a plan is approved.
export async function processQueue(ctx, { maxMs = 200000, parallel = 3 } = {}) {
  const began = Date.now();
  const stats = { processed: 0, failed: 0, started: [], waiting: 0, left: 0 };
  let all = await loadAll(ctx.db);
  if (!all.agents.length) return { ...stats, note: 'Команди ще не створено.' };
  stats.started = await scheduleDue(ctx, all);
  try { stats.assets = await pollAssets(ctx); } catch (e) { console.warn('pollAssets failed:', e?.message || e); }
  for (let pass = 0; pass < 60 && Date.now() - began < maxMs; pass += 1) {
    all = await loadAll(ctx.db); // switches may be flipped while we work
    const states = chainStates(all.agents, all.links);
    const now = iso(ctx.now());
    const tasks = must(await ctx.db.from('ag_tasks').select('*').or(`status.eq.queued,and(status.eq.running,lease_until.lt.${now})`).order('created_at', { ascending: true }).limit(40), 'tasks') || [];
    const ready = tasks.filter((t) => runnable(all, states, all.byId.get(t.agent_id)));
    stats.waiting = tasks.length - ready.length;
    stats.left = ready.length;
    if (!ready.length) break;
    const results = await Promise.all(ready.slice(0, parallel).map((t) => runTask(ctx, subTeam(all, all.byId.get(t.agent_id)), t).catch((e) => ({ status: 'failed', error: e.message }))));
    results.filter(Boolean).forEach((r) => { stats.processed += 1; if (r.status === 'failed') stats.failed += 1; });
    if (!results.filter(Boolean).length) break;
  }
  const rest = must(await ctx.db.from('ag_tasks').select('id, agent_id').in('status', ['queued', 'running']).limit(100), 'tasks') || [];
  const states = chainStates(all.agents, all.links);
  stats.left = rest.filter((t) => runnable(all, states, all.byId.get(t.agent_id))).length;
  stats.waiting = rest.length - stats.left;
  return stats;
}

// «Run now» from the agent's page: puts a task in the queue and runs THAT task even if the agent is switched off (a deliberate
// manual run, e.g. to try a prompt before switching the agent on); what the task creates next runs only if its agents are on.
export async function runNow(ctx, agentId, brief = {}) {
  const all = await loadAll(ctx.db);
  const agent = all.byId.get(agentId);
  if (!agent) throw new Error('Агента не знайдено.');
  if (!readyOf(agent).ready) throw new Error(readyOf(agent).note || 'Цей агент ще не готовий до роботи.');
  if (agent.team !== CAMPAIGN_TEAM && !['site_analyst', 'strategist', 'seo', 'competitors'].includes(agent.role)) throw new Error('Цей агент працює за завданнями від інших агентів.');
  const task = await enqueue(ctx.db, { agent, type: typeOf(agent), brief, by: ctx.email });
  const result = await runTask(ctx, subTeam(all, agent), task);
  return { taskId: task.id, ...(result || { status: 'skipped' }) };
}

// The campaign is launched: it becomes active, and the agents that start the work (research, the weekly analysts) get their first
// task right away; everything else follows through the chain. A weekly agent's next scheduled run is the following one.
export async function launchCampaign(ctx, campaignId) {
  const all = await loadAll(ctx.db);
  const campaign = must(await ctx.db.from('ag_campaigns').select('*').eq('id', campaignId).maybeSingle(), 'campaign');
  if (!campaign) throw new Error('Кампанію не знайдено.');
  if (campaign.status === 'active') throw new Error('Кампанію вже запущено.');
  const mine = all.agents.filter((a) => a.team === CAMPAIGN_TEAM && a.scope_id === String(campaign.id) && a.enabled);
  if (!mine.length) throw new Error('Увімкніть хоча б одного агента.');
  const now = iso(ctx.now());
  must(await ctx.db.from('ag_campaigns').update({ status: 'active', launched_at: now, updated_at: now }).eq('id', campaign.id), 'campaign');
  must(await ctx.db.from('ag_agents').update({ enabled_since: now, attempts: 0 }).eq('team', CAMPAIGN_TEAM).eq('scope_id', String(campaign.id)).eq('enabled', true), 'agents');
  let started = 0;
  for (const a of mine) {
    if (['initial', 'schedule'].includes(a.config?.trigger)) { await enqueue(ctx.db, { agent: a, type: 'report', brief: { launch: true }, by: ctx.email }); started += 1; }
  }
  return { started, agents: mine.length };
}

export async function retryTask(ctx, taskId) {
  must(await ctx.db.from('ag_tasks').update({ status: 'queued', error: null, finished_at: null, lease_until: null }).eq('id', taskId).in('status', ['failed', 'cancelled']), 'task');
  return { ok: true };
}

export async function cancelTask(ctx, taskId) {
  must(await ctx.db.from('ag_tasks').update({ status: 'cancelled', finished_at: iso(ctx.now()), lease_until: null }).eq('id', taskId).eq('status', 'queued'), 'task');
  return { ok: true };
}
