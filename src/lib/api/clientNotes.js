import { supabase } from '../supabaseClient';

// Multiple timestamped notes per client, with pinning — same shape as
// deal_notes (dealNotes.js), replacing the single `clients.notes` text field.
export async function fetchClientNotes(clientId) {
  const { data, error } = await supabase
    .from('client_notes')
    .select('*')
    .eq('client_id', clientId)
    .order('pinned', { ascending: false })
    .order('created_at', { ascending: false });
  if (error) { console.warn('fetchClientNotes failed', error); return []; }
  return data ?? [];
}

export async function addClientNote(clientId, text, createdBy) {
  const { data, error } = await supabase.from('client_notes').insert({ client_id: clientId, text, created_by: createdBy || null }).select().single();
  if (error) throw error;
  return data;
}

export async function setClientNotePinned(id, pinned) {
  const { error } = await supabase.from('client_notes').update({ pinned }).eq('id', id);
  if (error) throw error;
}

export async function deleteClientNote(id) {
  const { error } = await supabase.from('client_notes').delete().eq('id', id);
  if (error) throw error;
}
