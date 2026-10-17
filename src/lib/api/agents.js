import { supabase } from '../supabaseClient';
import { authedPost } from '../adAccounts';
import { nextScheduled } from '../agentSchedule';
import { ensureSmmTeam } from '../agents/smmTeam';

// The agent framework (migration 20261020000000_agent_framework.sql): the agents of a team, the links between them, their prompt
// libraries, tasks and the log of every model call. The server side is api/agent-queue.js (+ api/_lib/agentEngine.js).

const nowIso = () => new Date().toISOString();
const must = ({ data, error }) => { if (error) throw error; return data; };

// Creates the team in the database the first time (only adds what is missing) and returns it.
export async function loadTeam(email) {
  const { agents, links } = await ensureSmmTeam(supabase, email);
  const open = must(await supabase.from('ag_tasks').select('agent_id, status').in('status', ['queued', 'running', 'failed'])) || [];
  const counts = {};
  open.forEach((t) => { (counts[t.agent_id] ||= { queued: 0, running: 0, failed: 0 })[t.status] += 1; });
  return { agents: agents.sort((a, b) => a.sort - b.sort), links, counts };
}

// Switch an agent on or off. Switching on starts the clock: a scheduled moment that has already passed is not made up for.
export async function setAgentEnabled(agent, enabled, email) {
  const patch = { enabled, updated_by: email || null, updated_at: nowIso() };
  if (enabled && !agent.enabled) { patch.enabled_since = nowIso(); patch.attempts = 0; }
  return must(await supabase.from('ag_agents').update(patch).eq('id', agent.id).select().single());
}

export async function saveAgent(id, patch, email) {
  return must(await supabase.from('ag_agents').update({ ...patch, updated_by: email || null, updated_at: nowIso() }).eq('id', id).select().single());
}

export async function setLinkRequired(linkId, required) {
  return must(await supabase.from('ag_links').update({ required }).eq('id', linkId).select().single());
}

// ---------------------------------------------------------------------------------------------------- prompts
export async function fetchPrompts(agentId) {
  return must(await supabase.from('ag_prompts').select('*').eq('agent_id', agentId).order('created_at', { ascending: true })) || [];
}
export async function fetchPromptVersions(promptId) {
  return must(await supabase.from('ag_prompt_versions').select('*').eq('prompt_id', promptId).order('version', { ascending: false })) || [];
}
export async function createPrompt(agentId, { name, body, note = '' }, email) {
  const p = must(await supabase.from('ag_prompts').insert({ agent_id: agentId, name: name.trim() || 'Новий промт', body, note, is_default: false, current_version: 1, created_by: email || null }).select().single());
  must(await supabase.from('ag_prompt_versions').insert({ prompt_id: p.id, version: 1, body, note: note || 'Створено', created_by: email || null }));
  return p;
}
// Saving a changed body is a NEW version (every version is kept and can be restored). A conditional update on the version number
// keeps two people from silently overwriting each other.
export async function savePrompt(prompt, { name, body, note }, email) {
  const changedBody = body !== prompt.body;
  const next = changedBody ? prompt.current_version + 1 : prompt.current_version;
  const rows = must(await supabase.from('ag_prompts').update({ name: name.trim() || prompt.name, body, current_version: next, updated_at: nowIso() }).eq('id', prompt.id).eq('current_version', prompt.current_version).select());
  if (!rows?.length) throw new Error('Промт змінили в іншому місці. Оновіть сторінку й повторіть.');
  if (changedBody) must(await supabase.from('ag_prompt_versions').insert({ prompt_id: prompt.id, version: next, body, note: (note || '').trim(), created_by: email || null }));
  return rows[0];
}
export async function setDefaultPrompt(agentId, promptId) {
  must(await supabase.from('ag_prompts').update({ is_default: false }).eq('agent_id', agentId));
  must(await supabase.from('ag_prompts').update({ is_default: true }).eq('id', promptId));
}
export async function deletePrompt(promptId) {
  must(await supabase.from('ag_prompts').delete().eq('id', promptId));
}

// ---------------------------------------------------------------------------------------------------- tasks, history
export async function fetchTasks(agentId, limit = 40) {
  return must(await supabase.from('ag_tasks').select('*').eq('agent_id', agentId).order('created_at', { ascending: false }).limit(limit)) || [];
}
export async function fetchRuns(agentId, limit = 30) {
  return must(await supabase.from('ag_runs').select('*').eq('agent_id', agentId).order('created_at', { ascending: false }).limit(limit)) || [];
}
// Failed and open tasks of the posts that are in production (what the queue page shows next to each post).
export async function fetchPostTasks(postIds) {
  if (!postIds.length) return [];
  return must(await supabase.from('ag_tasks').select('id, agent_id, type, status, error, post_id, created_at').in('post_id', postIds).in('status', ['queued', 'running', 'failed']).order('created_at', { ascending: false })) || [];
}
export async function fetchPlans() {
  return must(await supabase.from('smm_plans').select('*').order('created_at', { ascending: false }).limit(20)) || [];
}

// ---------------------------------------------------------------------------------------------------- the server
export const agentAction = (action, payload = {}) => authedPost('/api/agent-queue', { action, ...payload });

// Runs the queue until nothing is left to run (each call works up to ~3 minutes on the server). Fire and forget from the page.
export async function kickQueue(onProgress) {
  for (let i = 0; i < 8; i += 1) {
    const r = await agentAction('process');
    onProgress?.(r);
    if (!r.left) return r;
  }
  return null;
}

export const nextRunOf = (agent) => (agent.schedule?.weekday ? nextScheduled('weekly', { weeklyDay: agent.schedule.weekday, weeklyTime: agent.schedule.time }) : null);

// What the server has connected (for the visual agent's page).
export const fetchServerStatus = () => agentAction('status');
