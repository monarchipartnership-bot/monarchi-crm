import { supabase } from '../supabaseClient';

// Each department owns its own category/tag list — replaces the old global
// BASE_TAGS (src/lib/tagColors.js), which stays only as a fallback for
// deal-tied tasks (DealTasksPage.jsx), which have no department.
export async function fetchTaskCategories(departmentId) {
  const { data, error } = await supabase.from('task_categories').select('*').eq('department_id', departmentId).order('label', { ascending: true });
  if (error) { console.warn('fetchTaskCategories failed', error); return []; }
  return data ?? [];
}

export async function createTaskCategory({ label, color, departmentId }) {
  const { data, error } = await supabase.from('task_categories').insert({ label, color: color || '#7C3AED', department_id: departmentId }).select().single();
  if (error) { console.warn('createTaskCategory failed', error); return null; }
  return data;
}

export async function updateTaskCategory(id, patch) {
  const { error } = await supabase.from('task_categories').update(patch).eq('id', id);
  if (error) throw error;
}

export async function deleteTaskCategory(id) {
  const { error } = await supabase.from('task_categories').delete().eq('id', id);
  if (error) throw error;
}
