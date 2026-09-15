import { supabase } from '../supabaseClient';
import { normText } from '../monthlyAggregation';
import { fetchWeeklyRowsBetween } from './weeklyReports';

// Canonical client directory — a synced index on top of what Weekly Report
// already saves into weekly_reports.data.clients, not a replacement of it.
// Matched by the same normalized-name rule Monthly's own aggregation
// already uses (see monthlyAggregation.js's normText/aggregateClientsFromWeeks),
// so "the same client" means the same thing everywhere in the app.

// Fire-and-forget from WeeklyCreate.jsx's autosave — never throws, just warns,
// so a directory hiccup never blocks the week's own save from completing.
// `name_key` (normText(name), the same normalization Monthly's own
// aggregation already matches clients by) is a plain stored column with a
// real unique constraint — Postgres' ON CONFLICT can't target an expression
// index, only an actual column, so the dedup key has to be materialized
// client-side rather than computed in SQL.
// Returns the upserted row (used by WeeklyCreate.jsx's autosave to also
// ensure the client has an open deal — see deals.js's fetchOpenDealForClient).
export async function upsertClientDirectoryEntry({ name, platform, leadType, manager }) {
  const trimmed = (name || '').trim();
  const key = normText(trimmed);
  if (!trimmed || !key) return null;
  const { data, error } = await supabase.from('clients').upsert(
    { name: trimmed, name_key: key, platform, lead_type: leadType, manager: manager || null, updated_at: new Date().toISOString() },
    { onConflict: 'name_key' },
  ).select().single();
  if (error) { console.warn('upsertClientDirectoryEntry failed', error); return null; }
  return data;
}

export async function fetchClientDirectory() {
  const { data, error } = await supabase.from('clients').select('*').order('updated_at', { ascending: false });
  if (error) { console.warn('fetchClientDirectory failed', error); return []; }
  return data ?? [];
}

export async function fetchClientById(id) {
  const { data, error } = await supabase.from('clients').select('*').eq('id', id).maybeSingle();
  if (error) { console.warn('fetchClientById failed', error); return null; }
  return data;
}

// Patches the client row and logs each changed field into client_changes,
// so the "Активність" tab has a real audit trail of manual edits (not just
// Weekly Report mentions). `before` is the row's state prior to the patch —
// caller passes it since this function doesn't re-fetch.
export async function updateClientDirectoryEntry(id, patch, before, changedBy) {
  const { error } = await supabase.from('clients').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) { console.warn('updateClientDirectoryEntry failed', error); return; }
  if (!before) return;
  const changes = Object.keys(patch)
    .filter((field) => before[field] !== patch[field])
    .map((field) => ({
      client_id: id,
      field,
      old_value: before[field] == null ? null : String(before[field]),
      new_value: patch[field] == null ? null : String(patch[field]),
      changed_by: changedBy || null,
    }));
  if (changes.length) {
    const { error: logError } = await supabase.from('client_changes').insert(changes);
    if (logError) console.warn('client_changes insert failed', logError);
  }
}

export async function fetchClientChangeLog(clientId) {
  const { data, error } = await supabase.from('client_changes').select('*').eq('client_id', clientId).order('changed_at', { ascending: false });
  if (error) { console.warn('fetchClientChangeLog failed', error); return []; }
  return data ?? [];
}

// A client's history: every saved week whose data.clients[] mentions them
// (by the same normalized-name match as Monthly's own aggregation), oldest
// first. Scans weekly_reports client-side rather than a dedicated mentions
// table — the row count is small enough that a live scan is simpler than
// keeping a second table in sync.
export async function fetchClientHistory(name) {
  const key = normText(name);
  if (!key) return [];
  const rows = await fetchWeeklyRowsBetween('2000-01-01', '2100-01-01');
  const entries = [];
  rows.forEach((row) => {
    (row.data?.clients || []).forEach((c) => {
      if (normText(c.name || c.text || '') === key) {
        entries.push({ weekStart: row.week_start, weekEnd: row.week_end, platform: c.platform, leadType: c.leadType, text: c.text });
      }
    });
  });
  return entries;
}
