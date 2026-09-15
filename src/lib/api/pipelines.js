import { supabase } from '../supabaseClient';

// Every new pipeline gets its own copy of this default stage set (matching
// the one seeded for the original 8 platform pipelines) so it's immediately
// usable — pipelines never share stages with each other.
const DEFAULT_STAGE_TEMPLATE = [
  { label: 'Новий лід', is_won: false, is_lost: false, color: '#7C3AED' },
  { label: 'Комунікація', is_won: false, is_lost: false, color: '#2F80ED' },
  { label: 'Пропозиція', is_won: false, is_lost: false, color: '#B8860B' },
  { label: 'Переговори', is_won: false, is_lost: false, color: '#D97706' },
  { label: 'Виграно', is_won: true, is_lost: false, color: '#1E9E5D' },
  { label: 'Програно', is_won: false, is_lost: true, color: '#D14343' },
];

export async function fetchPipelines() {
  const { data, error } = await supabase.from('pipelines').select('*').order('position', { ascending: true });
  if (error) { console.warn('fetchPipelines failed', error); return []; }
  return data ?? [];
}

export async function createPipeline({ name, color }) {
  const pipelines = await fetchPipelines();
  const position = pipelines.length ? Math.max(...pipelines.map((p) => p.position)) + 1 : 1;
  const { data, error } = await supabase.from('pipelines').insert({ name, color: color || '#7C3AED', position }).select().single();
  if (error) throw error;
  const { error: stagesError } = await supabase
    .from('deal_stages')
    .insert(DEFAULT_STAGE_TEMPLATE.map((s, i) => ({ ...s, position: i + 1, pipeline_id: data.id })));
  if (stagesError) throw stagesError;
  return data;
}

export async function updatePipeline(id, patch) {
  const { error } = await supabase.from('pipelines').update(patch).eq('id', id);
  if (error) throw error;
}

// Refuses to delete a pipeline that still has deals in it — same guard
// pattern as deleteStage, to avoid silently orphaning deals.
export async function deletePipeline(id) {
  const { count, error: countError } = await supabase.from('deals').select('id', { count: 'exact', head: true }).eq('pipeline_id', id);
  if (countError) throw countError;
  if (count > 0) throw new Error(`Спершу перенесіть або видаліть ${count} ${count === 1 ? 'угоду' : 'угод(и)'} з цього pipeline`);
  const { error: stagesError } = await supabase.from('deal_stages').delete().eq('pipeline_id', id);
  if (stagesError) throw stagesError;
  const { error } = await supabase.from('pipelines').delete().eq('id', id);
  if (error) throw error;
}
