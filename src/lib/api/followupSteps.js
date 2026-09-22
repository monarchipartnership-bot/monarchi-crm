import { supabase } from '../supabaseClient';

// Persisted history of a deal's FU1..FU5 series (see the
// deal_followup_steps migration for why this exists — without it, a step
// generated days after FU1 in a fresh tab has no way to know what earlier
// steps said or which case they used).

export async function fetchFollowupSteps(dealId) {
  if (!dealId) return {};
  const { data, error } = await supabase
    .from('deal_followup_steps')
    .select('step, message, case_used, created_at')
    .eq('deal_id', dealId);
  if (error) { console.warn('fetchFollowupSteps failed', error); return {}; }
  const byStep = {};
  for (const row of data ?? []) {
    byStep[row.step] = { message: row.message, caseUsed: row.case_used, createdAt: new Date(row.created_at) };
  }
  return byStep;
}

// Upserts on (deal_id, step) — regenerating a step overwrites its saved
// history instead of piling up duplicates.
export async function saveFollowupStep(dealId, step, message, caseUsed) {
  if (!dealId) return;
  const { error } = await supabase
    .from('deal_followup_steps')
    .upsert({ deal_id: dealId, step, message, case_used: caseUsed || null, updated_at: new Date().toISOString() }, { onConflict: 'deal_id,step' });
  if (error) console.warn('saveFollowupStep failed', error);
}
