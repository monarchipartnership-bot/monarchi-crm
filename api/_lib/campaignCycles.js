// The engine of the cycles of a campaign and of the manager's control over it (spec 2026-11-02, §3 and §5):
//   openCycle / syncCycles   a cycle is opened when a campaign launches, when its agents start on schedule and when a creative request starts; its status and
//                            progress are recomputed from the tasks it contains (src/lib/agents/campaignCycles.js decides the state)
//   setAgentSchedule / setAgentMode / addInstruction / removeInstruction / editOutput   what the person can change while the campaign works
// db is the Supabase client of whoever acts (a person's own session, or the agent user in the cron).
import { capReached } from '../../src/lib/agents/spendNotices.js';
import { STALE_CYCLE_DAYS, addInstruction as pushInstruction, cleanInstruction, cleanSchedule, cycleState } from '../../src/lib/agents/campaignCycles.js';
import { CAMPAIGN_TEAM } from '../../src/lib/agents/campaignTeam.js';

const must = (r, what) => { if (r.error) throw new Error(`${what}: ${r.error.message}`); return r.data; };
const iso = (d) => d.toISOString();
const nowOf = (ctx) => (ctx.now ? ctx.now() : new Date());

// → the cycle row. A cycle of a request belongs to that request; a cycle of a scheduled pass is shared by everything that starts in it (and a pass that is
// still «running» after several days did not finish: it is closed as a problem and a new one begins).
export async function openCycle(ctx, campaignId, { requestId = null } = {}) {
  const { db } = ctx;
  const now = nowOf(ctx);
  const rows = must(await db.from('ag_cycles').select('*').eq('campaign_id', campaignId).order('number', { ascending: false }).limit(50), 'cycles') || [];
  if (requestId) { const own = rows.find((c) => c.request_id === requestId); if (own) return own; }
  else {
    const open = rows.find((c) => c.status === 'running' && !c.request_id);
    if (open) {
      if (now.getTime() - new Date(open.started_at || open.created_at).getTime() < STALE_CYCLE_DAYS * 86400000) return open;
      must(await db.from('ag_cycles').update({ status: 'problem', finished_at: iso(now) }).eq('id', open.id), 'cycle');
    }
  }
  const number = (rows[0]?.number || 0) + 1;
  return must(await db.from('ag_cycles').insert({ campaign_id: campaignId, number, status: 'running', request_id: requestId, progress: 0, started_at: iso(now) }).select().single(), 'cycle');
}

// Recomputes the cycles that are not finished. → { checked, changed }
export async function syncCycles(ctx) {
  const { db } = ctx;
  const cycles = must(await db.from('ag_cycles').select('*').in('status', ['queued', 'running', 'review', 'problem']).order('id', { ascending: false }).limit(100), 'cycles') || [];
  let changed = 0;
  const agentsOf = new Map();
  for (const cycle of cycles) {
    let tasks = [];
    let request = null;
    let expected = 0;
    if (cycle.request_id) {
      tasks = must(await db.from('ag_tasks').select('agent_id, status, output').eq('request_id', cycle.request_id), 'tasks') || [];
      request = (await db.from('ag_creative_requests').select('status').eq('id', cycle.request_id).maybeSingle()).data || null;
    } else {
      if (!agentsOf.has(cycle.campaign_id)) agentsOf.set(cycle.campaign_id, must(await db.from('ag_agents').select('id, enabled').eq('team', CAMPAIGN_TEAM).eq('scope_id', String(cycle.campaign_id)), 'agents') || []);
      const agents = agentsOf.get(cycle.campaign_id);
      const ids = agents.map((a) => a.id);
      expected = agents.filter((a) => a.enabled).length;
      tasks = ids.length ? must(await db.from('ag_tasks').select('agent_id, status, output').in('agent_id', ids).gte('created_at', cycle.started_at || cycle.created_at).limit(500), 'tasks') || [] : [];
    }
    const s = cycleState({ cycle, tasks, expectedAgents: expected, request });
    if (s.status === cycle.status && Math.abs(s.progress - Number(cycle.progress || 0)) < 0.005) continue;
    const finished = ['done', 'cancelled'].includes(s.status) ? iso(nowOf(ctx)) : null;
    must(await db.from('ag_cycles').update({ status: s.status, progress: s.progress, finished_at: finished }).eq('id', cycle.id), 'cycle');
    changed += 1;
  }
  return { checked: cycles.length, changed };
}

// The campaigns whose money cap is reached: nothing new starts for them until the cap is raised (the work that is already running is not cut in half). → Set of ids as strings
export async function cappedCampaigns(db) {
  const withCap = must(await db.from('ag_campaigns').select('id, spend_cap_usd').not('spend_cap_usd', 'is', null), 'campaigns') || [];
  if (!withCap.length) return new Set();
  const spent = must(await db.from('ag_campaign_spend').select('campaign_id, claude_usd, higgsfield_usd').in('campaign_id', withCap.map((c) => c.id)), 'spend') || [];
  const total = new Map(spent.map((r) => [r.campaign_id, (Number(r.claude_usd) || 0) + (Number(r.higgsfield_usd) || 0)]));
  return new Set(withCap.filter((c) => capReached(c, total.get(c.id) || 0)).map((c) => String(c.id)));
}

export const CAP_MESSAGE = 'Операція досягла ліміту витрат: нові запуски зупинено, поки ви не підвищите ліміт.';

// ---------------------------------------------------------------------------------------------------- what the person changes
async function campaignAgent(db, agentId) {
  const agent = must(await db.from('ag_agents').select('*').eq('id', agentId).maybeSingle(), 'agent');
  if (!agent) throw new Error('Агента не знайдено.');
  if (agent.team !== CAMPAIGN_TEAM) throw new Error('Розклад і режим змінюються в агентах операції.');
  return agent;
}

// A new day or time: the agent does not run for a moment that was before the change (the next one counts).
export async function setAgentSchedule(ctx, agentId, input) {
  const { db } = ctx;
  const agent = await campaignAgent(db, agentId);
  const schedule = cleanSchedule(input);
  must(await db.from('ag_agents').update({ schedule, enabled_since: iso(nowOf(ctx)), attempts: 0, last_scheduled: null, updated_by: ctx.email || null }).eq('id', agent.id), 'agent');
  return { ok: true, schedule };
}

// auto: works and passes on; confirm: works, then waits for the person's OK; paused: does not work (and does not run late when switched on again).
export async function setAgentMode(ctx, agentId, mode) {
  const { db } = ctx;
  if (!['auto', 'confirm', 'paused'].includes(mode)) throw new Error('Невідомий режим агента.');
  const agent = await campaignAgent(db, agentId);
  const patch = { enabled: mode !== 'paused', config: { ...(agent.config || {}), confirm_before_pass: mode === 'confirm' }, updated_by: ctx.email || null };
  if (!agent.enabled && mode !== 'paused') { patch.enabled_since = iso(nowOf(ctx)); patch.attempts = 0; }
  must(await db.from('ag_agents').update(patch).eq('id', agent.id), 'agent');
  return { ok: true, mode };
}

async function loadCampaign(db, campaignId) {
  const c = must(await db.from('ag_campaigns').select('id, config').eq('id', campaignId).maybeSingle(), 'campaign');
  if (!c) throw new Error('Операцію не знайдено.');
  return c;
}

export async function addInstruction(ctx, campaignId, { role = null, text }) {
  const { db } = ctx;
  const c = await loadCampaign(db, campaignId);
  const item = cleanInstruction({ role, text }, ctx.email || null, nowOf(ctx));
  const list = pushInstruction(c.config?.instructions || [], item);
  must(await db.from('ag_campaigns').update({ config: { ...(c.config || {}), instructions: list }, updated_at: iso(nowOf(ctx)) }).eq('id', campaignId), 'campaign');
  return { ok: true, instructions: list };
}

export async function removeInstruction(ctx, campaignId, at) {
  const { db } = ctx;
  const c = await loadCampaign(db, campaignId);
  const list = (c.config?.instructions || []).filter((i) => i.at !== at);
  must(await db.from('ag_campaigns').update({ config: { ...(c.config || {}), instructions: list }, updated_at: iso(nowOf(ctx)) }).eq('id', campaignId), 'campaign');
  return { ok: true, instructions: list };
}

// The person corrects a result before the next agents read it. The first text is kept (output.original_text) and the edit is written to the memory of the client.
export async function editOutput(ctx, taskId, text) {
  const { db } = ctx;
  const body = String(text || '').trim();
  if (body.length < 3) throw new Error('Текст результату порожній.');
  if (body.length > 60000) throw new Error('Текст завеликий (понад 60 000 символів).');
  const task = must(await db.from('ag_tasks').select('*').eq('id', taskId).maybeSingle(), 'task');
  if (!task || task.status !== 'done') throw new Error('Редагувати можна лише завершений результат.');
  const now = nowOf(ctx);
  const output = { ...(task.output || {}), text: body, original_text: task.output?.original_text ?? task.output?.text ?? null, edited: { by: ctx.email || null, at: iso(now) } };
  must(await db.from('ag_tasks').update({ output }).eq('id', taskId), 'task');
  const agent = (await db.from('ag_agents').select('name, team, scope_id').eq('id', task.agent_id).maybeSingle()).data;
  const campaignId = task.campaign_id || (agent?.team === CAMPAIGN_TEAM ? Number(agent.scope_id) : null);
  const campaign = campaignId ? (await db.from('ag_campaigns').select('project_id').eq('id', campaignId).maybeSingle()).data : null;
  if (campaign?.project_id) await db.from('ag_client_events').insert({ project_id: campaign.project_id, campaign_id: campaignId, kind: 'note', subject: `Правка результату: ${agent?.name || 'агент'}`, body: 'Менеджер відредагував результат агента вручну; далі агенти читають виправлений текст.', actor: ctx.email || null, meta: { task_id: taskId } });
  return { ok: true };
}
