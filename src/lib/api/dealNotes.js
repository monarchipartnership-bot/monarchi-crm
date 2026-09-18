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

// Used by reportClientSync.js — a report's own autosave fires repeatedly
// while a manager is still typing "Інформація" (debounced, but still many
// times over the course of actually writing it out), so inserting a fresh
// note on every tick would flood the deal's history. `reportDate` tags
// which report day/week this note represents; re-syncing the same day just
// overwrites that one note's text instead of adding another.
export async function upsertDealNoteForDate(dealId, reportDate, text, createdBy) {
  const { data: existing, error: findError } = await supabase
    .from('deal_notes').select('id').eq('deal_id', dealId).eq('report_date', reportDate).maybeSingle();
  if (findError) { console.warn('upsertDealNoteForDate (find) failed', findError); return; }
  if (existing) {
    const { error } = await supabase.from('deal_notes').update({ text, created_by: createdBy || null }).eq('id', existing.id);
    if (error) console.warn('upsertDealNoteForDate (update) failed', error);
    return;
  }
  const { error } = await supabase.from('deal_notes').insert({ deal_id: dealId, text, created_by: createdBy || null, report_date: reportDate });
  if (error) console.warn('upsertDealNoteForDate (insert) failed', error);
}

export async function setNotePinned(id, pinned) {
  const { error } = await supabase.from('deal_notes').update({ pinned }).eq('id', id);
  if (error) throw error;
}

export async function deleteDealNote(id) {
  const { error } = await supabase.from('deal_notes').delete().eq('id', id);
  if (error) throw error;
}

// Most recent notes across every deal — for the Home dashboard's "recent
// activity" feed, unlike fetchDealNotes (scoped to one deal).
export async function fetchRecentDealNotes(limit = 5) {
  const { data, error } = await supabase
    .from('deal_notes')
    .select('*, deals(title, clients(name, company))')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) { console.warn('fetchRecentDealNotes failed', error); return []; }
  return data ?? [];
}
