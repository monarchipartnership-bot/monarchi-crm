import { supabase } from '../supabaseClient';

// Saved client presentations (migration 20261009000000_project_decks.sql). The read
// helpers return []/null (and warn) if the table isn't there yet, so the page still opens.

export async function fetchDeck(projectId, periodType, periodStart, platform) {
  const { data, error } = await supabase
    .from('project_decks').select('*')
    .eq('project_id', projectId).eq('period_type', periodType).eq('period_start', periodStart).eq('platform', platform)
    .maybeSingle();
  if (error) { console.warn('fetchDeck failed', error); return null; }
  return data;
}

// Which platforms already have a saved deck for a period (for the platform switcher).
export async function fetchDecksForPeriod(projectId, periodType, periodStart) {
  const { data, error } = await supabase
    .from('project_decks').select('id, platform, status, updated_at')
    .eq('project_id', projectId).eq('period_type', periodType).eq('period_start', periodStart);
  if (error) { console.warn('fetchDecksForPeriod failed', error); return []; }
  return data ?? [];
}

export async function fetchProjectDecks(projectId) {
  const { data, error } = await supabase
    .from('project_decks').select('id, period_type, period_start, period_end, platform, style, status, source, updated_at')
    .eq('project_id', projectId).order('period_start', { ascending: false });
  if (error) { console.warn('fetchProjectDecks failed', error); return []; }
  return data ?? [];
}

export async function saveDeck({ projectId, reportId, periodType, periodStart, periodEnd, platform, style, lang, status = 'draft', source = 'manual', deck, createdBy }) {
  const { data, error } = await supabase.from('project_decks').upsert({
    project_id: projectId, report_id: reportId || null, period_type: periodType, period_start: periodStart, period_end: periodEnd,
    platform, style, lang, status, source, deck, created_by: createdBy || null, updated_at: new Date().toISOString(),
  }, { onConflict: 'project_id,period_type,period_start,platform' }).select().single();
  if (error) throw error;
  return data;
}

export async function deleteDeck(id) {
  const { error } = await supabase.from('project_decks').delete().eq('id', id);
  if (error) throw error;
}
