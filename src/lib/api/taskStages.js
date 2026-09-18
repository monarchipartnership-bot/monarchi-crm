import { supabase } from '../supabaseClient';

function nowIso() {
  return new Date().toISOString();
}

// Each department owns its own stage list — always scoped by
// `departmentId`, never fetched globally. Direct analog of dealStages.js.
export async function fetchTaskStages(departmentId) {
  const { data, error } = await supabase.from('task_stages').select('*').eq('department_id', departmentId).order('position', { ascending: true });
  if (error) { console.warn('fetchTaskStages failed', error); return []; }
  return data ?? [];
}

export async function createTaskStage({ label, color, departmentId }) {
  const stages = await fetchTaskStages(departmentId);
  const position = stages.length ? Math.max(...stages.map((s) => s.position)) + 1 : 1;
  const { data, error } = await supabase.from('task_stages').insert({ label, color: color || '#7C3AED', position, department_id: departmentId }).select().single();
  if (error) { console.warn('createTaskStage failed', error); return null; }
  return data;
}

export async function updateTaskStage(id, patch) {
  const { error } = await supabase.from('task_stages').update(patch).eq('id', id);
  if (error) throw error;
}

// Bulk position rewrite — `orderedIds` is the full stage list in its new order.
export async function reorderTaskStages(orderedIds) {
  await Promise.all(orderedIds.map((id, i) => supabase.from('task_stages').update({ position: i + 1 }).eq('id', id)));
}

// Refuses to delete a stage that still has tasks on it — same guard as
// dealStages.js's deleteStage.
export async function deleteTaskStage(id) {
  const { count, error: countError } = await supabase.from('tasks').select('id', { count: 'exact', head: true }).eq('stage_id', id);
  if (countError) throw countError;
  if (count > 0) throw new Error(`Спершу перенесіть ${count} ${count === 1 ? 'задачу' : 'задач(і)'} з цього етапу`);
  const { error } = await supabase.from('task_stages').delete().eq('id', id);
  if (error) throw error;
}

// Moves a task onto a new stage, keeping the legacy `status`/`completed_at`/
// `cancel_reason` columns in sync — direct analog of deals.js's
// moveDealStage, so any code still reading the old string fields (or a row
// that never got backfilled to stage_id) keeps working during the
// transition. `reason` only applies when landing on an is_cancelled stage.
export async function moveTaskStage(id, stage, reason) {
  const payload = {
    stage_id: stage.id,
    status: stage.is_done ? 'done' : stage.is_cancelled ? 'cancelled' : 'pending',
    completed_at: stage.is_done ? nowIso() : null,
    cancel_reason: stage.is_cancelled ? (reason || null) : null,
    updated_at: nowIso(),
  };
  const { error } = await supabase.from('tasks').update(payload).eq('id', id);
  if (error) throw error;
}
