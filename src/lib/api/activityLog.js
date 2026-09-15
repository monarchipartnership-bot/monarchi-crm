import { supabase } from '../supabaseClient';

export async function logActivity(tool, eventType, meta = {}, userEmail = null) {
  try {
    const { error } = await supabase.from('activity_log').insert({ tool, event_type: eventType, user_email: userEmail, meta });
    if (error) console.warn('logActivity failed', error);
  } catch (e) { console.warn('logActivity failed', e); }
}

// Raw rows since a timestamp — caller buckets by day/tool as needed.
export async function fetchActivitySince(sinceIso) {
  const { data, error } = await supabase.from('activity_log').select('tool, event_type, created_at').gte('created_at', sinceIso);
  if (error) { console.warn('fetchActivitySince failed', error); return []; }
  return data ?? [];
}

// Most recent activity rows for one person — powers the "Останні дії" feed
// on their own profile page.
export async function fetchRecentActivityForUser(email, limit = 6) {
  const { data, error } = await supabase.from('activity_log').select('*').eq('user_email', email).order('created_at', { ascending: false }).limit(limit);
  if (error) { console.warn('fetchRecentActivityForUser failed', error); return []; }
  return data ?? [];
}
