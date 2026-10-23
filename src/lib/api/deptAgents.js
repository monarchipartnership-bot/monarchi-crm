import { supabase } from '../supabaseClient';
import { ensureCreativeDepartment, requestRoles } from '../agents/creativeTeam';
import { agentAction } from './agents';

// The page of an agent of a department (the agent is ONE worker with a queue of clients, see docs/agent-model-spec.md): its clients, its tasks with
// progress, the restart and the trial run. Reads go through row-level security as the signed-in person.
const nowIso = () => new Date().toISOString();
const must = ({ data, error }) => { if (error) throw error; return data; };

// The department (created on first use) with the open tasks per agent, in the shape the agent pages expect.
export async function loadDeptTeam(email) {
  const { agents, links } = await ensureCreativeDepartment(supabase, email);
  const open = agents.length ? must(await supabase.from('ag_tasks').select('agent_id, status').in('agent_id', agents.map((a) => a.id)).in('status', ['queued', 'running', 'failed'])) || [] : [];
  const counts = {};
  open.forEach((t) => { (counts[t.agent_id] ||= { queued: 0, running: 0, failed: 0 })[t.status] += 1; });
  return { agents, links, counts };
}

// The clients of an agent: the link rows with the campaign and project names, in the order of the queue (priority, then oldest link).
export async function fetchAgentClients(agentId) {
  const links = must(await supabase.from('ag_agent_clients').select('*').eq('agent_id', agentId)) || [];
  if (!links.length) return [];
  const campaigns = must(await supabase.from('ag_campaigns').select('id, name, project_id, status, platforms').in('id', links.map((l) => l.campaign_id))) || [];
  const projects = campaigns.length ? must(await supabase.from('projects').select('id, name, client').in('id', campaigns.map((c) => c.project_id))) || [] : [];
  return links.map((l) => {
    const campaign = campaigns.find((c) => c.id === l.campaign_id) || null;
    return { ...l, campaign, project: projects.find((p) => p.id === campaign?.project_id) || null };
  }).sort((a, b) => a.priority - b.priority || a.id - b.id);
}

export async function updateClientLink(id, patch) {
  return must(await supabase.from('ag_agent_clients').update({ ...patch, updated_at: nowIso() }).eq('id', id).select().single());
}

// Moves a client one place up or down the queue: priorities are renumbered 10, 20, 30... in the new order.
export async function moveClient(agentId, linkId, direction) {
  const rows = await fetchAgentClients(agentId);
  const i = rows.findIndex((r) => r.id === linkId);
  const j = i + (direction === 'up' ? -1 : 1);
  if (i < 0 || j < 0 || j >= rows.length) return;
  [rows[i], rows[j]] = [rows[j], rows[i]];
  for (let k = 0; k < rows.length; k += 1) {
    if (rows[k].priority !== (k + 1) * 10) await updateClientLink(rows[k].id, { priority: (k + 1) * 10 });
  }
}

// The recent tasks of an agent (newest first) with a short result line, plus the progress of the requests they belong to.
export async function fetchAgentTasks(agentId, limit = 80) {
  const tasks = must(await supabase.from('ag_tasks').select('id, status, campaign_id, request_id, created_at, started_at, finished_at, cost_usd, error, summary:output->>summary').eq('agent_id', agentId).order('id', { ascending: false }).limit(limit)) || [];
  const rids = [...new Set(tasks.map((t) => t.request_id).filter(Boolean))];
  const requests = rids.length ? must(await supabase.from('ag_creative_requests').select('id, title, status, campaign_id').in('id', rids)) || [] : [];
  return { tasks, progress: await progressOf(requests) };
}

// How far each request is: the steps of its chain that are done out of the steps that take part for its client.
async function progressOf(requests) {
  if (!requests.length) return {};
  const rids = requests.map((r) => r.id);
  const steps = must(await supabase.from('ag_tasks').select('request_id, agent_id, status').in('request_id', rids).eq('status', 'done')) || [];
  const cids = [...new Set(requests.map((r) => r.campaign_id))];
  const clientLinks = must(await supabase.from('ag_agent_clients').select('agent_id, campaign_id, enabled, mode').in('campaign_id', cids)) || [];
  const agents = must(await supabase.from('ag_agents').select('id, role, enabled').eq('team', 'creative')) || [];
  const wanted = new Set(requestRoles());
  const progress = {};
  requests.forEach((r) => {
    const total = agents.filter((a) => wanted.has(a.role) && a.enabled && clientLinks.some((l) => l.agent_id === a.id && l.campaign_id === r.campaign_id && l.enabled && l.mode !== 'paused')).length;
    const done = new Set(steps.filter((s) => s.request_id === r.id).map((s) => s.agent_id)).size;
    progress[r.id] = { title: r.title, status: r.status, done: Math.min(done, total || done), total: total || done };
  });
  return progress;
}

// The requests of the department that are alive (in work, waiting for the person's review, stuck on a problem), with the client and the progress: the map shows them.
export async function fetchOpenRequests(limit = 6) {
  const requests = must(await supabase.from('ag_creative_requests').select('id, title, status, campaign_id, updated_at').in('status', ['running', 'review', 'problem']).order('updated_at', { ascending: false }).limit(limit)) || [];
  if (!requests.length) return [];
  const campaigns = must(await supabase.from('ag_campaigns').select('id, name, project_id').in('id', [...new Set(requests.map((r) => r.campaign_id))])) || [];
  const projects = campaigns.length ? must(await supabase.from('projects').select('id, name').in('id', campaigns.map((c) => c.project_id))) || [] : [];
  const progress = await progressOf(requests);
  return requests.map((r) => {
    const c = campaigns.find((x) => x.id === r.campaign_id);
    return { ...r, client: projects.find((p) => p.id === c?.project_id)?.name || c?.name || '', done: progress[r.id]?.done ?? 0, total: progress[r.id]?.total ?? 0 };
  });
}

// The clients' requests (for the trial run: an agent below the strategist works from the results of a request).
export async function fetchClientRequests(campaignId) {
  return must(await supabase.from('ag_creative_requests').select('id, title, status').eq('campaign_id', campaignId).order('created_at', { ascending: false }).limit(30)) || [];
}

// Cost of the last 30 days and the average length of a task, from the tasks of the agent.
export function loadOf(tasks) {
  const month = Date.now() - 30 * 86400000;
  const recent = tasks.filter((t) => new Date(t.created_at).getTime() >= month);
  const done = recent.filter((t) => t.status === 'done' && t.started_at && t.finished_at);
  const avg = done.length ? done.reduce((s, t) => s + (new Date(t.finished_at) - new Date(t.started_at)), 0) / done.length / 1000 : null;
  return { cost30: recent.reduce((s, t) => s + Number(t.cost_usd || 0), 0), avgSeconds: avg, queued: tasks.filter((t) => t.status === 'queued').length, running: tasks.filter((t) => t.status === 'running').length, failed: tasks.filter((t) => t.status === 'failed').length, done30: recent.filter((t) => t.status === 'done').length };
}

export const restartAgent = (agentId) => agentAction('restart_agent', { agentId });
export const dryRunAgent = (agentId, { campaignId, requestId, promptBody }) => agentAction('dry_run', { agentId, campaignId, requestId, promptBody });
export const runForClient = (agentId, campaignId, requestId = null) => agentAction('run_agent', { agentId, brief: { campaignId, requestId } });
