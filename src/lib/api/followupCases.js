import { supabase } from '../supabaseClient';

// Follow-up Generator's own case-study database — replaces the old Google
// Sheets + MCP-connector read (an expensive AI-mediated call just to fetch
// a spreadsheet). Plain CRUD, managed directly in the "Кейси для follow-up"
// modal.
export async function fetchFollowupCases() {
  const { data, error } = await supabase.from('followup_cases').select('*').order('position', { ascending: true });
  if (error) { console.warn('fetchFollowupCases failed', error); return []; }
  return data ?? [];
}

export async function createFollowupCase({ name, description }) {
  const cases = await fetchFollowupCases();
  const position = cases.length ? Math.max(...cases.map((c) => c.position)) + 1 : 1;
  const { data, error } = await supabase
    .from('followup_cases')
    .insert({ name: name.trim(), description: description.trim(), position })
    .select().single();
  if (error) throw error;
  return data;
}

export async function updateFollowupCase(id, patch) {
  const { error } = await supabase.from('followup_cases').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) throw error;
}

export async function deleteFollowupCase(id) {
  const { error } = await supabase.from('followup_cases').delete().eq('id', id);
  if (error) throw error;
}
