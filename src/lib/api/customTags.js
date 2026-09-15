import { supabase } from '../supabaseClient';

// Team-wide "learned" tag suggestions — when someone types a tag that isn't
// already a built-in suggestion, it's saved here so it shows up as a
// one-click suggestion for everyone from then on. `context` scopes the list
// per feature (e.g. 'sales_activity' for Daily/Weekly Report task tags) so
// unrelated areas don't share a vocabulary.
export async function fetchCustomTags(context) {
  const { data, error } = await supabase.from('custom_tags').select('tag').eq('context', context).order('tag');
  if (error) { console.warn('fetchCustomTags failed', error); return []; }
  return data?.map((r) => r.tag) ?? [];
}

export async function saveCustomTag(context, tag) {
  const { error } = await supabase.from('custom_tags').upsert({ context, tag }, { onConflict: 'context,tag' });
  if (error) console.warn('saveCustomTag failed', error);
}
