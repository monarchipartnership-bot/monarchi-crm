import { supabase } from '../supabaseClient';

// A shared, deal-independent catalog of "Сервіс" tags (Meta Ads, Google Ads,
// SEO...) — same shape as Pipeline/Stage colors: one small table anyone can
// add a new colored tag to, and every deal just stores which tag ids it
// picked (`deals.service_tag_ids`) rather than duplicating label+color per
// deal.
export async function fetchServiceTags() {
  const { data, error } = await supabase.from('deal_service_tags').select('*').order('position', { ascending: true });
  if (error) { console.warn('fetchServiceTags failed', error); return []; }
  return data ?? [];
}

export async function createServiceTag(label, color) {
  const { data, error } = await supabase.from('deal_service_tags').insert({ label: label.trim(), color }).select('*').single();
  if (error) throw error;
  return data;
}
