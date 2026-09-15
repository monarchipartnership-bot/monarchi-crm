import { supabase } from '../supabaseClient';

// Each pipeline (platform) owns its own stage list — always scoped by
// `pipelineId`, never fetched globally.
export async function fetchDealStages(pipelineId) {
  const { data, error } = await supabase.from('deal_stages').select('*').eq('pipeline_id', pipelineId).order('position', { ascending: true });
  if (error) { console.warn('fetchDealStages failed', error); return []; }
  return data ?? [];
}

export async function createStage({ label, color, pipelineId }) {
  const stages = await fetchDealStages(pipelineId);
  const position = stages.length ? Math.max(...stages.map((s) => s.position)) + 1 : 1;
  const { data, error } = await supabase.from('deal_stages').insert({ label, color: color || '#7C3AED', position, pipeline_id: pipelineId }).select().single();
  if (error) { console.warn('createStage failed', error); return null; }
  return data;
}

export async function updateStage(id, patch) {
  const { error } = await supabase.from('deal_stages').update(patch).eq('id', id);
  if (error) throw error;
}

// Bulk position rewrite — `orderedIds` is the full stage list in its new order.
export async function reorderStages(orderedIds) {
  await Promise.all(orderedIds.map((id, i) => supabase.from('deal_stages').update({ position: i + 1 }).eq('id', id)));
}

// Refuses to delete a stage that still has deals in it — the caller is
// expected to show the count and ask the user to move them first, rather
// than silently orphaning deals or cascading a delete through them.
export async function deleteStage(id) {
  const { count, error: countError } = await supabase.from('deals').select('id', { count: 'exact', head: true }).eq('stage_id', id);
  if (countError) throw countError;
  if (count > 0) throw new Error(`Спершу перенесіть ${count} ${count === 1 ? 'угоду' : 'угод(и)'} з цього етапу`);
  const { error } = await supabase.from('deal_stages').delete().eq('id', id);
  if (error) throw error;
}
