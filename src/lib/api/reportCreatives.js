import { authedPost } from '../adAccounts';
import { supabase } from '../supabaseClient';

// The «Most effective creatives» of a saved report (api/report-creatives.js). Meta only for now.

export async function suggestCreatives({ projectId, start, end, count }) {
  const r = await authedPost('/api/report-creatives', { action: 'suggest', projectId, start, end, count });
  return r.items || [];
}
export async function fetchCreativeCandidates({ projectId, start, end }) {
  const r = await authedPost('/api/report-creatives', { action: 'candidates', projectId, start, end });
  return r.candidates || [];
}
export async function pickCreativeItem({ projectId, start, end, adId }) {
  const r = await authedPost('/api/report-creatives', { action: 'pick', projectId, start, end, adId });
  return r.item;
}

// Saves the creatives of a report (kept in data.creatives): the rest of the report is not touched.
export async function saveReportCreatives(id, items, count) {
  const { data: row, error } = await supabase.from('project_reports').select('id, data').eq('id', id).single();
  if (error) throw error;
  const creatives = { count: count || items.length, items, source: 'manual', at: new Date().toISOString() };
  const { error: e2 } = await supabase.from('project_reports').update({ data: { ...(row.data || {}), creatives }, updated_at: new Date().toISOString() }).eq('id', id);
  if (e2) throw e2;
}
