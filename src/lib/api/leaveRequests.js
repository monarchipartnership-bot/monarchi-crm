import { supabase } from '../supabaseClient';

// Leave requests overlapping [monthStart, monthEnd] (both ISO dates).
export async function fetchLeaveForMonth(monthStart, monthEnd) {
  const { data, error } = await supabase
    .from('leave_requests')
    .select('*')
    .lte('date_start', monthEnd)
    .gte('date_end', monthStart)
    .order('date_start', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function fetchProfilesByEmails(emails) {
  if (!emails.length) return {};
  const { data, error } = await supabase.from('profiles').select('*').in('email', emails);
  if (error) { console.warn('fetchProfilesByEmails failed', error); return {}; }
  const byEmail = {};
  (data ?? []).forEach((p) => { byEmail[p.email] = p; });
  return byEmail;
}
