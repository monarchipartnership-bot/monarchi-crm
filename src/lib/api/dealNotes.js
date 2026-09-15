import { supabase } from '../supabaseClient';

// Multiple timestamped notes per deal, with pinning — replaces the single
// `deals.notes` text field (kept in the schema, no longer read/written).
export async function fetchDealNotes(dealId) {
  const { data, error } = await supabase
    .from('deal_notes')
    .select('*')
    .eq('deal_id', dealId)
    .order('pinned', { ascending: false })
    .order('created_at', { ascending: false });
  if (error) { console.warn('fetchDealNotes failed', error); return []; }
  return data ?? [];
}

export async function addDealNote(dealId, text, createdBy) {
  const { data, error } = await supabase.from('deal_notes').insert({ deal_id: dealId, text, created_by: createdBy || null }).select().single();
  if (error) throw error;
  return data;
}

export async function setNotePinned(id, pinned) {
  const { error } = await supabase.from('deal_notes').update({ pinned }).eq('id', id);
  if (error) throw error;
}

export async function deleteDealNote(id) {
  const { error } = await supabase.from('deal_notes').delete().eq('id', id);
  if (error) throw error;
}
