import { supabase } from '../supabaseClient';

// A lightweight per-deal timeline — logs only the things the "Нотатки та
// задачі" tab actually does (note saved, task added/completed), shown back
// as "Історія угоди" underneath it. Not a full field-change audit trail.
export async function fetchDealActivity(dealId) {
  const { data, error } = await supabase.from('deal_activity').select('*').eq('deal_id', dealId).order('created_at', { ascending: false });
  if (error) { console.warn('fetchDealActivity failed', error); return []; }
  return data ?? [];
}

export async function logDealActivity({ dealId, eventType, text, createdBy }) {
  const { error } = await supabase.from('deal_activity').insert({ deal_id: dealId, event_type: eventType, text, created_by: createdBy || null });
  if (error) console.warn('logDealActivity failed', error);
}
