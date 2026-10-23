// The chain of the creative department, per REQUEST (ag_creative_requests). The agents are shared workers (one per role); a client is attached to
// each of them by a link row (ag_agent_clients: on/off, mode, priority, confirm-before-pass). A request starts the strategist for its client;
// every finished task starts the agents below it for the same client and request when EVERY participating agent above it has delivered; when the
// last agent has delivered the request goes to the person (status «review»). Standalone on purpose (no import of agentEngine): the engine calls
// into this file.
import { ancestorsOf } from '../../src/lib/agents/chain.js';
import { CREATIVE_TEAM, REQUEST_ENTRY_ROLE, isCreativeRole, requestRoles } from '../../src/lib/agents/creativeTeam.js';

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

// The request is started by the person: the strategist of this client gets the first task (it runs even if the client's link is in manual mode:
// the person asked). The campaign must not be paused or archived.
export async function startRequest(ctx, requestId) {
  const { db } = ctx;
  const req = must(await db.from('ag_creative_requests').select('*').eq('id', requestId).maybeSingle(), 'request');
  if (!req) throw new Error('Запит не знайдено.');
  if (req.status === 'running') throw new Error('Запит уже в роботі.');
  const campaign = must(await db.from('ag_campaigns').select('*').eq('id', req.campaign_id).maybeSingle(), 'campaign');
  if (!campaign) throw new Error('Кампанію не знайдено.');
  if (['paused', 'archived'].includes(campaign.status)) throw new Error('Кампанію призупинено або в архіві: відділ креативів не працює.');
  if (!String(req.brief?.goal || '').trim()) throw new Error('У запиті немає опису задачі.');
  const dept = await loadDepartment(db);
  const entry = dept.byRole.get(REQUEST_ENTRY_ROLE);
  const links = await loadClientLinks(db, req.campaign_id);
  if (!entry || !entry.enabled) throw new Error('Агент креативний стратег вимкнений: увімкніть його на сторінці агента.');
  const link = links.get(entry.id);
  if (!link || !link.enabled || link.mode === 'paused') throw new Error('Для цього клієнта Агент креативний стратег вимкнений або на паузі (вкладка «Проєкти» на його сторінці).');
  const now = iso(ctx.now());
  must(await db.from('ag_creative_requests').update({ status: 'running', error: null, started_at: now, finished_at: null, updated_at: now }).eq('id', requestId), 'request');
  await enqueue(db, entry, { campaignId: req.campaign_id, requestId, brief: { trigger: 'request', manual: true, requestId }, by: ctx.email || 'запит' });
  return { started: 1, participants: participantsOf(dept, links).length };
}

// A task of the request finished: the agents below it may start. An agent starts when every participating agent above it has a done task of THIS
// request and it has none of its own yet. A link in manual mode is not started by the chain (the person starts it); if something above failed,
// the request waits until the task is retried.
export async function fanOutRequest(ctx, team, agent, task) {
  const rid = task?.request_id;
  if (!rid) return;
  const { db } = ctx;
  const req = must(await db.from('ag_creative_requests').select('status, campaign_id').eq('id', rid).maybeSingle(), 'request');
  if (!req || req.status === 'cancelled') return;
  const dept = await loadDepartment(db);
  const links = await loadClientLinks(db, req.campaign_id);
  const parts = participantsOf(dept, links);
  const targets = dept.links.filter((l) => l.from_agent_id === agent.id).map((l) => parts.find((p) => p.id === l.to_agent_id)).filter(Boolean);
  for (const b of targets) {
    if (links.get(b.id).mode === 'manual') continue;
    const ups = upstreamOf(dept, parts, b);
    const ids = [b.id, ...ups.map((a) => a.id)];
    const rows = must(await db.from('ag_tasks').select('id, agent_id, status').in('agent_id', ids).eq('request_id', rid), 'tasks') || [];
    if (rows.some((r) => ['queued', 'running'].includes(r.status))) continue; // someone above is still working: the last one to finish starts it
    const done = new Set(rows.filter((r) => r.status === 'done').map((r) => r.agent_id));
    if (rows.some((r) => r.agent_id === b.id)) continue; // it already has (or had) its task for this request
    if (!ups.every((u) => done.has(u.id))) continue;
    const created = await enqueue(db, b, { campaignId: req.campaign_id, requestId: rid, brief: { trigger: 'request', requestId: rid, from: agent.name }, by: 'ланцюжок' });
    // Two agents finishing at the same moment may both start the same one: the earliest task stays, the later one withdraws.
    const same = must(await db.from('ag_tasks').select('id').eq('agent_id', b.id).eq('request_id', rid).in('status', ['queued', 'running']).order('id', { ascending: true }), 'tasks') || [];
    if (same.length > 1 && Math.min(...same.map((t) => t.id)) !== created.id) await db.from('ag_tasks').update({ status: 'cancelled', finished_at: iso(ctx.now()) }).eq('id', created.id).eq('status', 'queued');
  }
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
