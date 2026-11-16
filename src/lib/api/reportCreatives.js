import { authedPost } from '../adAccounts';
import { supabase } from '../supabaseClient';

// The «Most effective creatives» of a saved report (api/report-creatives.js). Meta by default; platform 'google' takes the best asset groups of Google Ads (plan 2.14): only the
// automatic choice, the choice by hand («Замінити», «Додати») is Meta only so far.

export async function suggestCreatives({ projectId, start, end, count, platform = 'meta' }) {
  const r = await authedPost('/api/report-creatives', { action: 'suggest', projectId, start, end, count, ...(platform === 'google' ? { platform: 'google' } : {}) });
  if (r.configError) throw new Error(platform === 'google' ? 'На сервері не задано доступ до Google Ads.' : 'На сервері не задано доступ до Meta (META_ACCESS_TOKEN).');
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
