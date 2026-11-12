// The chain of the creative department, per REQUEST (ag_creative_requests). The agents are shared workers (one per role); a client is attached to
// each of them by a link row (ag_agent_clients: on/off, mode, priority, confirm-before-pass). A request starts the strategist for its client;
// every finished task starts the agents below it for the same client and request when EVERY participating agent above it has delivered; when the
// last agent has delivered the request goes to the person (status «review»). Standalone on purpose (no import of agentEngine): the engine calls
// into this file.
import { ancestorsOf } from '../../src/lib/agents/chain.js';
import { CAP_MESSAGE, cappedCampaigns } from './campaignCycles.js';
import { CREATIVE_TEAM, REQUEST_ENTRY_ROLE, connectCampaign, isCreativeRole, requestRoles } from '../../src/lib/agents/creativeTeam.js';
import { SCOUT_ROLE, intelState } from '../../src/lib/agents/clientIntel.js';
import { scoutFailed } from './creativeScout.js';

export const MAX_REWORK_ROUNDS = 2; // the quality checker may send the work back twice; the third time it goes to the person as it is

const iso = (d) => d.toISOString();
const must = (r, what) => { if (r.error) throw new Error(`${what}: ${r.error.message}`); return r.data; };

// The agents of the department and the links between them.
export async function loadDepartment(db) {
  const agents = must(await db.from('ag_agents').select('*').eq('team', CREATIVE_TEAM).eq('scope_type', 'internal').eq('scope_id', ''), 'agents') || [];
  const links = agents.length ? must(await db.from('ag_links').select('*').in('from_agent_id', agents.map((a) => a.id)), 'links') || [] : [];
  return { agents, links, byId: new Map(agents.map((a) => [a.id, a])), byRole: new Map(agents.map((a) => [a.role, a])) };
}

// The link rows of one client: agent id -> row.
export async function loadClientLinks(db, campaignId) {
  const rows = must(await db.from('ag_agent_clients').select('*').eq('campaign_id', campaignId), 'client links') || [];
  return new Map(rows.map((r) => [r.agent_id, r]));
}

// An agent takes part in a client's request when it is on, linked to the client, not paused for it, and is an agent of the request chain.
const REQUEST_ROLES = new Set(requestRoles());
export const takesPart = (agent, link) => !!agent && agent.enabled && REQUEST_ROLES.has(agent.role) && !!link && link.enabled && link.mode !== 'paused';
const participantsOf = (dept, links) => dept.agents.filter((a) => takesPart(a, links.get(a.id)));
const upstreamOf = (dept, parts, a) => ancestorsOf(a.id, dept.links).map((id) => dept.byId.get(id)).filter((x) => x && parts.some((p) => p.id === x.id));

async function enqueue(db, agent, { campaignId, requestId, brief, by }) {
  return must(await db.from('ag_tasks').insert({ agent_id: agent.id, type: 'creative', status: 'queued', brief, created_by: by, request_id: requestId, campaign_id: campaignId }).select().single(), 'task');
}

// The scout of the client (owner, 2026-11-12): studies the site and the cabinet once and writes the profile that the agents read. It starts when the team is launched, when a request
// finds no profile, when a profile is older than 30 days (then the work does not wait) and by the «Оновити» button (force). One scout task per client at a time.
// → { started, reason? }
export async function startIntel(ctx, campaignId, { force = false } = {}) {
  const { db } = ctx;
  const campaign = must(await db.from('ag_campaigns').select('*').eq('id', campaignId).maybeSingle(), 'campaign');
  if (!campaign?.project_id) return { started: false, reason: 'no-project' };
  if (['paused', 'archived'].includes(campaign.status)) return { started: false, reason: 'paused' };
  await connectCampaign(db, campaign, { email: ctx.email, only: [SCOUT_ROLE] });
  const dept = await loadDepartment(db);
  const scout = dept.byRole.get(SCOUT_ROLE);
  if (!scout || !scout.enabled) return { started: false, reason: 'off' };
  const open = must(await db.from('ag_tasks').select('id').eq('agent_id', scout.id).eq('campaign_id', campaignId).in('status', ['queued', 'running']).limit(1), 'tasks') || [];
  if (open.length) return { started: false, reason: 'active' };
  const row = must(await db.from('ag_project_intel').select('status, summary, updated_at').eq('project_id', campaign.project_id).maybeSingle(), 'intel');
  const state = intelState(row, ctx.now());
  if (!force && state === 'fresh') return { started: false, reason: 'fresh' };
  if (!force && state === 'failed' && Date.now() - new Date(row?.updated_at || 0).getTime() < 86400000) return { started: false, reason: 'recent-failure' }; // a closed site is not asked again and again
  if (!row?.summary) must(await db.from('ag_project_intel').upsert({ project_id: campaign.project_id, status: 'running', task_id: null, updated_at: iso(ctx.now()) }, { onConflict: 'project_id' }), 'intel');
  await enqueue(db, scout, { campaignId, requestId: null, brief: { trigger: 'intel', manual: true, force }, by: ctx.email || 'розвідка' });
  return { started: true, state };
}

// A request that arrived before the profile of the client exists waits for the scout: the strategist reads the profile. → true when the request must wait.
async function intelGate(ctx, campaign) {
  const row = must(await ctx.db.from('ag_project_intel').select('status, summary, updated_at').eq('project_id', campaign.project_id).maybeSingle(), 'intel');
  const state = intelState(row, ctx.now());
  const r = await startIntel(ctx, campaign.id).catch((e) => { console.warn('startIntel failed:', e?.message || e); return { started: false, reason: 'error' }; });
  return ['none', 'running'].includes(state) && (r.started || r.reason === 'active');
}

// The scout delivered (or failed for good): the requests that were waiting for it start their strategist now.
export async function releaseWaitingRequests(ctx, campaignId) {
  const { db } = ctx;
  const reqs = must(await db.from('ag_creative_requests').select('id').eq('campaign_id', campaignId).eq('status', 'running'), 'requests') || [];
  if (!reqs.length) return 0;
  const dept = await loadDepartment(db);
  const entry = dept.byRole.get(REQUEST_ENTRY_ROLE);
  const links = await loadClientLinks(db, campaignId);
  const link = entry ? links.get(entry.id) : null;
  if (!entry || !entry.enabled || !link || !link.enabled || link.mode === 'paused') return 0;
  let released = 0;
  for (const r of reqs) {
    const any = must(await db.from('ag_tasks').select('id').eq('request_id', r.id).limit(1), 'tasks') || [];
    if (any.length) continue; // it already works
    await enqueue(db, entry, { campaignId, requestId: r.id, brief: { trigger: 'request', manual: true, requestId: r.id, afterIntel: true }, by: 'розвідка' });
    released += 1;
  }
  return released;
}

// The scout's task failed for good or was withdrawn: the profile is marked failed (when there never was one) and the waiting requests go on without it.
export async function scoutEnded(ctx, task) {
  const campaign = task?.campaign_id ? must(await ctx.db.from('ag_campaigns').select('project_id').eq('id', task.campaign_id).maybeSingle(), 'campaign') : null;
  if (campaign?.project_id) await scoutFailed(ctx, campaign.project_id);
  if (task?.campaign_id) await releaseWaitingRequests(ctx, task.campaign_id);
}

// The request is started by the person: the strategist of this client gets the first task (it runs even if the client's link is in manual mode:
// the person asked). The campaign must not be paused or archived.
export async function startRequest(ctx, requestId) {
  const { db } = ctx;
  const req = must(await db.from('ag_creative_requests').select('*').eq('id', requestId).maybeSingle(), 'request');
  if (!req) throw new Error('Запит не знайдено.');
  if (req.status === 'running') throw new Error('Запит уже в роботі.');
  const campaign = must(await db.from('ag_campaigns').select('*').eq('id', req.campaign_id).maybeSingle(), 'campaign');
  if (!campaign) throw new Error('Операцію не знайдено.');
  if (['paused', 'archived'].includes(campaign.status)) throw new Error('Операцію призупинено або в архіві: відділ креативів не працює.');
  if (!String(req.brief?.goal || '').trim()) throw new Error('У запиті немає опису задачі.');
  if ((await cappedCampaigns(db)).has(String(req.campaign_id))) throw new Error(CAP_MESSAGE);
  const dept = await loadDepartment(db);
  const entry = dept.byRole.get(REQUEST_ENTRY_ROLE);
  const links = await loadClientLinks(db, req.campaign_id);
  if (!entry || !entry.enabled) throw new Error('Агент креативний стратег вимкнений: увімкніть його на сторінці агента.');
  const link = links.get(entry.id);
  if (!link || !link.enabled || link.mode === 'paused') throw new Error('Для цього клієнта Агент креативний стратег вимкнений або на паузі (вкладка «Проєкти» на його сторінці).');
  const now = iso(ctx.now());
  must(await db.from('ag_creative_requests').update({ status: 'running', error: null, started_at: now, finished_at: null, updated_at: now }).eq('id', requestId), 'request');
  if (campaign.project_id && await intelGate(ctx, campaign)) return { started: 0, waiting: 'intel', participants: participantsOf(dept, links).length }; // the strategist starts when the scout has delivered
  await enqueue(db, entry, { campaignId: req.campaign_id, requestId, brief: { trigger: 'request', manual: true, requestId }, by: ctx.email || 'запит' });
  return { started: 1, participants: participantsOf(dept, links).length };
}

// «Виправити з коментарем» (owner, 2026-11-12): the person tells in words what to change in the result of a step; the same agent makes it again from its previous version
// and the comment, and the chain does the rest by itself: the agents below it work again because something above them delivered after their last task (a rework). Only
// while no picture has been made: a rework after that would double the creatives. Costs one run of the agent and of every agent below it.
export const REVISABLE_ROLES = ['creative_strategy', 'creative_brief', 'creative_copywriter', 'creative_maker'];
export async function reviseStep(ctx, taskId, comment) {
  const { db } = ctx;
  const note = String(comment || '').replace(/\r\n/g, '\n').trim();
  if (note.length < 3) throw new Error('Опишіть, що виправити.');
  if (note.length > 2000) throw new Error('Коментар завеликий (понад 2000 символів).');
  const task = must(await db.from('ag_tasks').select('*').eq('id', taskId).maybeSingle(), 'task');
  if (!task || task.status !== 'done' || !task.request_id) throw new Error('Виправити можна лише завершений крок завдання.');
  const agent = must(await db.from('ag_agents').select('*').eq('id', task.agent_id).maybeSingle(), 'agent');
  if (!agent || !REVISABLE_ROLES.includes(agent.role)) throw new Error('Цей крок не виправляється коментарем.');
  const req = must(await db.from('ag_creative_requests').select('*').eq('id', task.request_id).maybeSingle(), 'request');
  if (!req || req.status === 'cancelled') throw new Error('Завдання не знайдено або скасовано.');
  const campaign = must(await db.from('ag_campaigns').select('*').eq('id', req.campaign_id).maybeSingle(), 'campaign');
  if (!campaign || campaign.status === 'archived') throw new Error('Операція в архіві: виправляти вже не можна.');
  const paused = campaign.status === 'paused'; // a paused operation takes the correction too: the step waits in the queue like every other and works when the operation is resumed
  if ((await cappedCampaigns(db)).has(String(req.campaign_id))) throw new Error(CAP_MESSAGE);
  const made = (must(await db.from('ag_creatives').select('id, status').eq('request_id', req.id), 'creatives') || []).filter((c) => !['planned', 'failed'].includes(c.status));
  if (made.length) throw new Error('Картинки цього завдання вже генерувалися або перевіряються: правка створила б дублі. Створіть нове завдання з потрібними змінами.');
  const open = must(await db.from('ag_tasks').select('id').eq('request_id', req.id).in('status', ['queued', 'running']).limit(1), 'tasks') || [];
  if (open.length) throw new Error('У завданні вже є крок у черзі або в роботі: дочекайтесь його завершення, потім виправляйте.');
  const created = await enqueue(db, agent, { campaignId: req.campaign_id, requestId: req.id, brief: { trigger: 'revision', requestId: req.id, revision: { comment: note, by: ctx.email || null, of: task.id } }, by: ctx.email || 'менеджер' });
  const now = iso(ctx.now());
  must(await db.from('ag_creative_requests').update({ status: 'running', error: null, finished_at: null, updated_at: now }).eq('id', req.id), 'request');
  if (campaign.project_id) await db.from('ag_client_events').insert({ project_id: campaign.project_id, campaign_id: req.campaign_id, kind: 'note', subject: `Правка результату: ${agent.name}`, body: note.slice(0, 600), actor: ctx.email || null, meta: { task_id: task.id, request_id: req.id } });
  return { ok: true, taskId: created.id, paused };
}

// A task of the request finished: the agents below it may start. An agent starts when every participating agent above it has a done task of THIS
// request and it has none of its own yet. A link in manual mode is not started by the chain (the person starts it); if something above failed,
// the request waits until the task is retried.
export async function fanOutRequest(ctx, team, agent, task) {
  if (agent.role === SCOUT_ROLE) { await releaseWaitingRequests(ctx, task?.campaign_id); return; } // the scout has no chain: it releases the requests that waited for it
  const rid = task?.request_id;
  if (!rid) return;
  const { db } = ctx;
  const req = must(await db.from('ag_creative_requests').select('status, campaign_id').eq('id', rid).maybeSingle(), 'request');
  if (!req || req.status === 'cancelled') return;
  const dept = await loadDepartment(db);
  const links = await loadClientLinks(db, req.campaign_id);
  const parts = participantsOf(dept, links);
  if (agent.role === 'creative_quality') { await reworkFromQuality(ctx, dept, links, parts, agent, task, req); return; }
  const targets = dept.links.filter((l) => l.from_agent_id === agent.id).map((l) => parts.find((p) => p.id === l.to_agent_id)).filter(Boolean);
  for (const b of targets) {
    if (links.get(b.id).mode === 'manual') continue;
    const ups = upstreamOf(dept, parts, b);
    const ids = [b.id, ...ups.map((a) => a.id)];
    const rows = must(await db.from('ag_tasks').select('id, agent_id, status').in('agent_id', ids).eq('request_id', rid), 'tasks') || [];
    if (rows.some((r) => ['queued', 'running'].includes(r.status))) continue; // someone above is still working: the last one to finish starts it
    const done = new Set(rows.filter((r) => r.status === 'done').map((r) => r.agent_id));
    // it works again when something above it delivered AFTER its own last task (a rework): the first time it has no task of its own yet
    const lastOwn = Math.max(0, ...rows.filter((r) => r.agent_id === b.id).map((r) => r.id));
    const lastUp = Math.max(0, ...rows.filter((r) => r.status === 'done' && ups.some((u) => u.id === r.agent_id)).map((r) => r.id));
    if (lastOwn && lastOwn > lastUp) continue; // it already worked on the latest version of what is above it
    if (!ups.every((u) => done.has(u.id))) continue;
    const created = await enqueue(db, b, { campaignId: req.campaign_id, requestId: rid, brief: { trigger: 'request', requestId: rid, from: agent.name }, by: 'ланцюжок' });
    // Two agents finishing at the same moment may both start the same one: the earliest task stays, the later one withdraws.
    const same = must(await db.from('ag_tasks').select('id').eq('agent_id', b.id).eq('request_id', rid).in('status', ['queued', 'running']).order('id', { ascending: true }), 'tasks') || [];
    if (same.length > 1 && Math.min(...same.map((t) => t.id)) !== created.id) await db.from('ag_tasks').update({ status: 'cancelled', finished_at: iso(ctx.now()) }).eq('id', created.id).eq('status', 'queued');
  }
}

// The quality checker answered. A «revise» verdict sends the work back to the agents it names (the copywriter for copy issues, the maker for the
// pictures' prompts) with exactly the issues for them, at most MAX_REWORK_ROUNDS times; the checker looks again when they have delivered (the chain
// above runs it again because their tasks are newer than its own). After the last round the request goes to the person with what is still wrong.
async function reworkFromQuality(ctx, dept, links, parts, qc, task, req) {
  const { db } = ctx;
  const verdict = task.output?.json;
  if (!verdict || verdict.verdict !== 'revise') return;
  const mine = must(await db.from('ag_tasks').select('id, output, status').eq('agent_id', qc.id).eq('request_id', task.request_id).eq('status', 'done'), 'tasks') || [];
  const round = mine.filter((t) => t.output?.json?.verdict === 'revise').length;
  const mark = async (rework) => { await db.from('ag_tasks').update({ output: { ...task.output, rework } }).eq('id', task.id); };
  if (round > MAX_REWORK_ROUNDS) { await mark({ round, stopped: true }); return; }
  const roleOf = { copy: 'creative_copywriter', creative: 'creative_maker' };
  const sent = [];
  const skipped = [];
  for (const target of ['copy', 'creative']) {
    const issues = (verdict.issues || []).filter((i) => i.target === target && ['high', 'medium'].includes(i.severity));
    if (!issues.length) continue;
    const agent = parts.find((p) => p.role === roleOf[target]);
    if (!agent || links.get(agent.id)?.mode === 'manual') { skipped.push(roleOf[target]); continue; }
    await enqueue(db, agent, { campaignId: req.campaign_id, requestId: task.request_id, brief: { trigger: 'rework', requestId: task.request_id, round, feedback: issues.map((i) => ({ concept: i.concept, severity: i.severity, comment: i.comment })), from: qc.name }, by: 'перевірка якості' });
    sent.push(roleOf[target]);
  }
  await mark({ round, sent, skipped, stopped: !sent.length });
}

// The person gives the OK on a result that waited for it (the link of its client has confirm_before_pass): the chain goes on.
export async function passOn(ctx, taskId) {
  const { db } = ctx;
  const task = must(await db.from('ag_tasks').select('*').eq('id', taskId).maybeSingle(), 'task');
  if (!task || task.status !== 'done') throw new Error('Завдання не знайдено або ще не завершене.');
  if (!task.output?.awaiting_pass) throw new Error('Цей результат не чекає на підтвердження.');
  must(await db.from('ag_tasks').update({ output: { ...task.output, awaiting_pass: false, passed_by: ctx.email || null } }).eq('id', taskId), 'task');
  const dept = await loadDepartment(db);
  const agent = dept.byId.get(task.agent_id);
  if (agent) await fanOutRequest(ctx, dept, agent, task);
  return { ok: true };
}

// After every task of a request: a failure puts the request in «problem» (with the reason), a success may finish it. The request is finished
// («review») when nothing is queued or running and every last agent of the chain has delivered; the copy is then attached to the creatives
// of its concepts. A result that waits for the person's OK keeps the request open.
export async function settleRequest(ctx, rid, failure = null) {
  const { db } = ctx;
  const req = must(await db.from('ag_creative_requests').select('*').eq('id', rid).maybeSingle(), 'request');
  if (!req || ['cancelled', 'done'].includes(req.status)) return null;
  const now = iso(ctx.now());
  if (failure) {
    must(await db.from('ag_creative_requests').update({ status: 'problem', error: String(failure).slice(0, 500), updated_at: now }).eq('id', rid), 'request');
    return 'problem';
  }
  const tasks = must(await db.from('ag_tasks').select('id, agent_id, status, output').eq('request_id', rid), 'tasks') || [];
  if (tasks.some((t) => ['queued', 'running'].includes(t.status))) return req.status;
  if (tasks.some((t) => t.status === 'failed')) return req.status;
  const dept = await loadDepartment(db);
  const links = await loadClientLinks(db, req.campaign_id);
  const parts = participantsOf(dept, links);
  const partIds = new Set(parts.map((a) => a.id));
  const leaves = parts.filter((a) => !dept.links.some((l) => l.from_agent_id === a.id && partIds.has(l.to_agent_id)));
  const doneIds = new Set(tasks.filter((t) => t.status === 'done').map((t) => t.agent_id));
  const waiting = tasks.some((t) => t.status === 'done' && t.output?.awaiting_pass);
  if (waiting || !leaves.every((a) => doneIds.has(a.id))) {
    if (req.status === 'problem') must(await db.from('ag_creative_requests').update({ status: 'running', error: null, updated_at: now }).eq('id', rid), 'request');
    return 'running';
  }
  await attachCopy(db, rid, dept, tasks);
  must(await db.from('ag_creative_requests').update({ status: 'review', error: null, finished_at: now, updated_at: now }).eq('id', rid), 'request');
  return 'review';
}

// The copywriter's texts go to the creatives of the same concept.
async function attachCopy(db, rid, dept, tasks) {
  const writer = dept.byRole.get('creative_copywriter');
  const out = writer ? tasks.filter((t) => t.agent_id === writer.id && t.status === 'done').sort((a, b) => b.id - a.id)[0]?.output : null;
  const texts = out?.json?.texts;
  if (!Array.isArray(texts) || !texts.length) return;
  const rows = must(await db.from('ag_creatives').select('id, concept_key').eq('request_id', rid), 'creatives') || [];
  for (const r of rows) {
    const mine = texts.filter((t) => t.concept === r.concept_key);
    if (mine.length) must(await db.from('ag_creatives').update({ copy: { variants: mine }, updated_at: iso(new Date()) }).eq('id', r.id), 'creative');
  }
}

// The person cancels a request: its waiting tasks are withdrawn, a task already running finishes but starts nothing.
export async function cancelRequest(ctx, requestId) {
  const { db } = ctx;
  const now = iso(ctx.now());
  must(await db.from('ag_tasks').update({ status: 'cancelled', finished_at: now, lease_until: null }).eq('request_id', requestId).eq('status', 'queued'), 'tasks');
  must(await db.from('ag_creative_requests').update({ status: 'cancelled', updated_at: now, finished_at: now }).eq('id', requestId), 'request');
  return { ok: true };
}

// After a task of a client finished (or failed) the link row remembers it: the «Проєкти» tab shows when the agent last worked for the client.
export async function touchClientLink(ctx, task, ok) {
  if (!task?.campaign_id) return;
  const now = iso(ctx.now());
  await ctx.db.from('ag_agent_clients').update({ last_run_at: now, last_status: ok ? 'ok' : 'problem', updated_at: now }).eq('agent_id', task.agent_id).eq('campaign_id', task.campaign_id);
}

export { isCreativeRole };
