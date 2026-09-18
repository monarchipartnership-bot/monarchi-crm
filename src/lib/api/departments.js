import { supabase } from '../supabaseClient';

// Every new department gets its own copy of this default stage set —
// same convention as pipelines.js's DEFAULT_STAGE_TEMPLATE for deals, just
// is_done/is_cancelled instead of is_won/is_lost. Stages never shared
// across departments.
const DEFAULT_STAGE_TEMPLATE = [
  { label: 'До виконання', is_done: false, is_cancelled: false, color: '#7C3AED' },
  { label: 'В роботі', is_done: false, is_cancelled: false, color: '#2F80ED' },
  { label: 'На перевірці', is_done: false, is_cancelled: false, color: '#B8860B' },
  { label: 'Виконано', is_done: true, is_cancelled: false, color: '#1E9E5D' },
  { label: 'Скасовано', is_done: false, is_cancelled: true, color: '#D14343' },
];

export async function fetchDepartments() {
  const { data, error } = await supabase.from('departments').select('*').order('position', { ascending: true });
  if (error) { console.warn('fetchDepartments failed', error); return []; }
  return data ?? [];
}

export async function createDepartment({ name, color, icon }) {
  const departments = await fetchDepartments();
  const position = departments.length ? Math.max(...departments.map((d) => d.position)) + 1 : 1;
  const { data, error } = await supabase.from('departments').insert({ name, color: color || '#7C3AED', icon: icon || null, position }).select().single();
  if (error) throw error;
  const { error: stagesError } = await supabase
    .from('task_stages')
    .insert(DEFAULT_STAGE_TEMPLATE.map((s, i) => ({ ...s, position: i + 1, department_id: data.id })));
  if (stagesError) throw stagesError;
  return data;
}

// Resolves a department's real id by its seeded name — for the handful of
// call sites (Home widgets, Automation/Dashboard.jsx) that used to rely on
// the implicit 'automation'/'sales' string default and now need the real
// department_id instead.
export async function fetchDepartmentIdByName(name) {
  const { data, error } = await supabase.from('departments').select('id').eq('name', name).maybeSingle();
  if (error) { console.warn('fetchDepartmentIdByName failed', error); return null; }
  return data?.id ?? null;
}

export async function updateDepartment(id, patch) {
  const { error } = await supabase.from('departments').update(patch).eq('id', id);
  if (error) throw error;
}

// Refuses to delete a department that still has tasks assigned to it — same
// guard pattern as deletePipeline, to avoid silently orphaning tasks.
export async function deleteDepartment(id) {
  const { count, error: countError } = await supabase.from('tasks').select('id', { count: 'exact', head: true }).eq('department_id', id);
  if (countError) throw countError;
  if (count > 0) throw new Error(`Спершу перенесіть або видаліть ${count} ${count === 1 ? 'задачу' : 'задач(і)'} з цього відділу`);
  const { error: stagesError } = await supabase.from('task_stages').delete().eq('department_id', id);
  if (stagesError) throw stagesError;
  const { error: categoriesError } = await supabase.from('task_categories').delete().eq('department_id', id);
  if (categoriesError) throw categoriesError;
  const { error } = await supabase.from('departments').delete().eq('id', id);
  if (error) throw error;
}
