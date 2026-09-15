import { supabase } from '../supabaseClient';

// Additional contacts on a deal beyond its primary `client_id` — mirrors
// Pipedrive's "participants" concept. Managed only from the deal detail
// view, after the deal already exists.
export async function fetchDealParticipants(dealId) {
  const { data, error } = await supabase
    .from('deal_participants')
    .select('id, client_id, clients(id, name, company)')
    .eq('deal_id', dealId)
    .order('created_at', { ascending: true });
  if (error) { console.warn('fetchDealParticipants failed', error); return []; }
  return data ?? [];
}

export async function addDealParticipant(dealId, clientId) {
  const { error } = await supabase.from('deal_participants').insert({ deal_id: dealId, client_id: clientId });
  if (error) throw error;
}

export async function removeDealParticipant(id) {
  const { error } = await supabase.from('deal_participants').delete().eq('id', id);
  if (error) throw error;
}
