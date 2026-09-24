import { supabase } from '../supabaseClient';

// A reusable library of audit frameworks (name + instructions text) for AI
// agents — global per agent, not per-client, so one saved framework runs
// against any client. Backs the agent chat's "Фреймворки" sidebar tab.
// Seeded by supabase/migrations/2026-09-26_ai_audit_frameworks.sql.

export async function fetchFrameworks(agentKey) {
  const { data, error } = await supabase
    .from('ai_audit_frameworks').select('*').eq('agent_key', agentKey).order('created_at', { ascending: true });
  if (error) { console.warn('fetchFrameworks failed', error); return []; }
  return data ?? [];
}

export async function createFramework(agentKey, { name, instructions }) {
  const { data, error } = await supabase
    .from('ai_audit_frameworks').insert({ agent_key: agentKey, name: name.trim(), instructions: instructions.trim() }).select().single();
  if (error) throw error;
  return data;
}

export async function updateFramework(id, { name, instructions }) {
  const { data, error } = await supabase
    .from('ai_audit_frameworks').update({ name: name.trim(), instructions: instructions.trim(), updated_at: new Date().toISOString() }).eq('id', id).select().single();
  if (error) throw error;
  return data;
}

export async function deleteFramework(id) {
  const { error } = await supabase.from('ai_audit_frameworks').delete().eq('id', id);
  if (error) throw error;
}
