import { supabase } from '../supabaseClient';

// The AI agent of a project (migration 20261010000000_project_agents.sql). The read helpers
// return null / [] (and warn) when the tables are not there yet, so the tab still opens and can
// say what is missing.

function nowIso() { return new Date().toISOString(); }

// What a freshly connected agent does until the manager changes it.
export const DEFAULT_AGENT_CONFIG = {
  tasks: { weeklyReport: true, monthlyReport: true, presentation: true },
  platforms: [],
  deck: { style: 'brand-pulse', lang: 'en' },
  schedule: { weeklyDay: 1, weeklyTime: '09:00', monthlyDay: 1, monthlyTime: '09:00' },
  notify: true,
  notifyEmails: [], // who gets the notification (emails of CRM users)
  note: '',
};

export async function fetchAgent(projectId) {
  const { data, error } = await supabase.from('project_agents').select('*').eq('project_id', projectId).maybeSingle();
  if (error) { console.warn('fetchAgent failed', error); return { agent: null, missing: true }; }
  return { agent: data, missing: false };
}

// Every project's agent in one read (for the dashboard's «потрібна увага»).
export async function fetchAgentsOverview() {
  const { data, error } = await supabase.from('project_agents').select('project_id, enabled, health, last_error, last_run_at, run_state');
  if (error) { console.warn('fetchAgentsOverview failed', error); return []; }
  return data ?? [];
}

export async function connectAgent(projectId, config, createdBy) {
  const { data, error } = await supabase.from('project_agents').insert({ project_id: projectId, enabled: false, config, created_by: createdBy || null }).select().single();
  if (error) throw error;
  return data;
}

export async function updateAgent(projectId, patch) {
  const { data, error } = await supabase.from('project_agents').update({ ...patch, updated_at: nowIso() }).eq('project_id', projectId).select().single();
  if (error) throw error;
  return data;
}

export async function disconnectAgent(projectId) {
  const { error } = await supabase.from('project_agents').delete().eq('project_id', projectId);
  if (error) throw error;
}

export async function fetchAgentEvents(projectId, limit = 100) {
  const { data, error } = await supabase.from('project_agent_events').select('*').eq('project_id', projectId).order('created_at', { ascending: false }).limit(limit);
  if (error) { console.warn('fetchAgentEvents failed', error); return []; }
  return data ?? [];
}

// A line of the history. People write kinds connected / enabled / disabled / config_changed /
// disconnected; the agent will write run_started / report_created / deck_created / run_finished / problem.
export async function addAgentEvent({ projectId, kind, status = 'info', message, details = null, actor = 'user', createdBy }) {
  const { error } = await supabase.from('project_agent_events').insert({ project_id: projectId, actor, kind, status, message, details, created_by: createdBy || null });
  if (error) console.warn('addAgentEvent failed', error);
}
