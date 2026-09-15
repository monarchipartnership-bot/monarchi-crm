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

export async function createProject(payload, createdBy) {
  const { error } = await supabase.from('projects').insert({ ...payload, status: 'active', created_by: createdBy });
  if (error) throw error;
}

export async function updateProject(id, payload) {
  const { error } = await supabase.from('projects').update(payload).eq('id', id);
  if (error) throw error;
}

export async function deleteProject(id) {
  const { error } = await supabase.from('projects').delete().eq('id', id);
  if (error) throw error;
}
