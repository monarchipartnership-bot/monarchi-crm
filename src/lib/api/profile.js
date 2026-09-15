import { supabase } from '../supabaseClient';

export async function fetchProfile(email) {
  const { data, error } = await supabase.from('profiles').select('*').eq('email', email).maybeSingle();
  if (error) throw error;
  return data;
}

export async function saveProfile(payload) {
  const { error } = await supabase.from('profiles').upsert(payload, { onConflict: 'email' });
  if (error) throw error;
}

// Flipped once the user sets their own password (see SetPassword.jsx) — the
// hard login gate in AuthGate (App.jsx) checks this to decide whether to
// force them through that screen before the rest of the app.
export async function markPasswordSet(email) {
  await saveProfile({ email, password_set: true });
}

// Every known team profile — used to populate assignee pickers. Profiles only
// exist for people who've visited /account at least once, so callers should
// still fall back to the current session's own email if it's missing here.
export async function fetchAllProfiles() {
  const { data, error } = await supabase.from('profiles').select('*').order('first_name', { ascending: true });
  if (error) { console.warn('fetchAllProfiles failed', error); return []; }
  return data ?? [];
}

// Display name for a profile row — falls back to the email when no name is set.
export function profileLabel(p) {
  const full = `${p.first_name || ''} ${p.last_name || ''}`.trim();
  return full || p.email;
}

export async function fetchMyLeaveRequests(email) {
  const { data, error } = await supabase.from('leave_requests').select('*').eq('email', email).order('date_start', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function submitLeaveRequest({ email, type, start, end, reason }) {
  const { error } = await supabase.from('leave_requests').insert({
    email, type, date_start: start, date_end: end, reason: reason || null, status: 'pending',
  });
  if (error) throw error;
}

export async function cancelLeaveRequest(id) {
  const { error } = await supabase.from('leave_requests').delete().eq('id', id);
  if (error) throw error;
}

export async function fetchPendingQueue() {
  const { data, error } = await supabase.from('leave_requests').select('*').eq('status', 'pending').order('created_at', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function reviewLeaveRequest(id, status, reviewedBy) {
  const { error } = await supabase.from('leave_requests').update({ status, reviewed_by: reviewedBy, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) throw error;
}
