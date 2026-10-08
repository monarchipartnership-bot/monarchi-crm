import { supabase } from '../supabaseClient';

export async function fetchProjects() {
  const { data, error } = await supabase.from('projects').select('*').order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function fetchProjectById(id) {
  const { data, error } = await supabase.from('projects').select('*').eq('id', id).single();
  if (error) throw error;
  return data;
}

// Returns the created row so the caller can attach ad accounts to its id.
export async function createProject(payload, createdBy) {
  const { data, error } = await supabase.from('projects').insert({ ...payload, status: 'active', created_by: createdBy }).select().single();
  if (error) throw error;
  return data;
}

// A contact's projects with their linked ad accounts, for the "Проекти" tab on
// the contact card. Falls back to no accounts if project_ad_accounts doesn't
// exist yet; and to [] if projects.client_id doesn't exist yet.
export async function fetchProjectsForClient(clientId) {
  let res = await supabase.from('projects').select('*, project_ad_accounts(platform, account_id, account_name, account_status)').eq('client_id', clientId).order('created_at', { ascending: false });
  if (res.error) res = await supabase.from('projects').select('*').eq('client_id', clientId).order('created_at', { ascending: false });
  if (res.error) { console.warn('fetchProjectsForClient failed', res.error); return []; }
  return res.data ?? [];
}

export async function updateProject(id, payload) {
  const { error } = await supabase.from('projects').update(payload).eq('id', id);
  if (error) throw error;
}

export async function deleteProject(id) {
  const { error } = await supabase.from('projects').delete().eq('id', id);
  if (error) throw error;
}
