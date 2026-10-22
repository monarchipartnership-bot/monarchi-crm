// The chain of the creative studio, per REQUEST (ag_creative_requests): a request starts the analysts, every finished task starts the agents
// that depend on it (when ALL enabled agents above it have delivered for this request), and when the last agent has delivered the request
// goes to the person (status «review»). Standalone on purpose (no import of agentEngine): the engine calls into this file.
import { ancestorsOf } from '../../src/lib/agents/chain.js';
import { isStudioRole } from '../../src/lib/agents/studioTeam.js';

const iso = (d) => d.toISOString();
const must = (r, what) => { if (r.error) throw new Error(`${what}: ${r.error.message}`); return r.data; };
const CAMPAIGN_TEAM = 'campaign';

// The studio agents of a campaign and the links between them.
export async function loadStudio(db, campaignId) {
  const all = must(await db.from('ag_agents').select('*').eq('team', CAMPAIGN_TEAM).eq('scope_type', 'client').eq('scope_id', String(campaignId)), 'agents') || [];
  const agents = all.filter((a) => isStudioRole(a.role));
  const links = agents.length ? must(await db.from('ag_links').select('*').in('from_agent_id', agents.map((a) => a.id)), 'links') || [] : [];
  return { agents, links, byId: new Map(agents.map((a) => [a.id, a])), byRole: new Map(agents.map((a) => [a.role, a])) };
}

async function enqueueStudio(db, agent, requestId, brief, by) {
  return must(await db.from('ag_tasks').insert({ agent_id: agent.id, type: 'studio', status: 'queued', brief, created_by: by, request_id: requestId }).select().single(), 'task');
}

// The enabled agents with nothing enabled above them (they start the request), and the ones with nothing enabled below them (they end it).
const enabledOf = (studio) => studio.agents.filter((a) => a.enabled);
const upstreamOf = (studio, a) => ancestorsOf(a.id, studio.links).map((id) => studio.byId.get(id)).filter((x) => x && x.enabled);
export const entryAgents = (studio) => enabledOf(studio).filter((a) => !upstreamOf(studio, a).length);
export function leafAgents(studio) {
  const on = new Set(enabledOf(studio).map((a) => a.id));
  return enabledOf(studio).filter((a) => !studio.links.some((l) => l.from_agent_id === a.id && on.has(l.to_agent_id)));
}

// The request is started: its entry agents get their first tasks. The campaign must not be paused or archived.
export async function startRequest(ctx, requestId) {
  const { db } = ctx;
  const req = must(await db.from('ag_creative_requests').select('*').eq('id', requestId).maybeSingle(), 'request');
  if (!req) throw new Error('Запит не знайдено.');
  if (req.status === 'running') throw new Error('Запит уже в роботі.');
  const campaign = must(await db.from('ag_campaigns').select('*').eq('id', req.campaign_id).maybeSingle(), 'campaign');
  if (!campaign) throw new Error('Кампанію не знайдено.');
  if (['paused', 'archived'].includes(campaign.status)) throw new Error('Кампанію призупинено або в архіві: студія не працює.');
  if (!String(req.brief?.goal || '').trim()) throw new Error('У запиті немає опису задачі.');
  const studio = await loadStudio(db, req.campaign_id);
  const entry = entryAgents(studio);
  if (!entry.length) throw new Error('Увімкніть хоча б одного агента студії (аналітика клієнта, конкурентів або автора ТЗ).');
  const now = iso(ctx.now());
  must(await db.from('ag_creative_requests').update({ status: 'running', error: null, started_at: now, finished_at: null, updated_at: now }).eq('id', requestId), 'request');
  for (const a of entry) await enqueueStudio(db, a, requestId, { trigger: 'request', requestId }, ctx.email || 'запит');
  return { started: entry.length, agents: enabledOf(studio).length };
}

// A studio agent finished a task of a request: the agents below it may start. An agent starts when every enabled agent above it has a done
// task of THIS request and it has none of its own yet. If something above failed, the request waits until the task is retried.
export async function fanOutRequest(ctx, team, agent, task) {
  const rid = task?.request_id;
  if (!rid) return;
  const { db } = ctx;
  const req = must(await db.from('ag_creative_requests').select('status').eq('id', rid).maybeSingle(), 'request');
  if (!req || ['cancelled'].includes(req.status)) return;
  const studio = await loadStudio(db, Number(agent.scope_id));
  const targets = studio.links.filter((l) => l.from_agent_id === agent.id).map((l) => studio.byId.get(l.to_agent_id)).filter((b) => b && b.enabled);
  for (const b of targets) {
    const ups = upstreamOf(studio, b);
    const ids = [b.id, ...ups.map((a) => a.id)];
    const rows = must(await db.from('ag_tasks').select('id, agent_id, status').in('agent_id', ids).eq('request_id', rid), 'tasks') || [];
    if (rows.some((r) => ['queued', 'running'].includes(r.status))) continue; // someone above is still working: the last one to finish starts it
    const done = new Set(rows.filter((r) => r.status === 'done').map((r) => r.agent_id));
    if (rows.some((r) => r.agent_id === b.id)) continue; // it already has (or had) its task for this request
    if (!ups.every((u) => done.has(u.id))) continue;
    const created = await enqueueStudio(db, b, rid, { trigger: 'request', requestId: rid, from: agent.name }, 'ланцюжок');
    // Two agents finishing at the same moment may both start the same one: the earliest task stays, the later one withdraws.
    const same = must(await db.from('ag_tasks').select('id').eq('agent_id', b.id).eq('request_id', rid).in('status', ['queued', 'running']).order('id', { ascending: true }), 'tasks') || [];
    if (same.length > 1 && Math.min(...same.map((t) => t.id)) !== created.id) await db.from('ag_tasks').update({ status: 'cancelled', finished_at: iso(ctx.now()) }).eq('id', created.id).eq('status', 'queued');
  }
}

// After every task of a request: a failure puts the request in «problem» (with the reason), a success may finish it. The request is
// finished («review») when nothing is queued or running and every last agent of the chain has delivered; the copy is then attached to the
// creatives of its concepts.
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
  const studio = await loadStudio(db, req.campaign_id);
  const doneIds = new Set(tasks.filter((t) => t.status === 'done').map((t) => t.agent_id));
  const finished = leafAgents(studio).every((a) => doneIds.has(a.id));
  if (!finished) {
    if (req.status === 'problem') must(await db.from('ag_creative_requests').update({ status: 'running', error: null, updated_at: now }).eq('id', rid), 'request');
    return 'running';
  }
  await attachCopy(db, rid, studio, tasks);
  must(await db.from('ag_creative_requests').update({ status: 'review', error: null, finished_at: now, updated_at: now }).eq('id', rid), 'request');
  return 'review';
}

// The copywriter's texts go to the creatives of the same concept.
async function attachCopy(db, rid, studio, tasks) {
  const writer = studio.byRole.get('studio_copywriter');
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
