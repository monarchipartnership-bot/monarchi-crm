import { supabase } from '../supabaseClient';

// The usage log and spending limits of the model calls (migration 20261012000000_ai_usage.sql).
// Reads return [] (and warn) if the tables are not there yet.

const PAGE = 1000;

// Every call since `sinceIso`, newest first (the server limits one answer to 1000 rows, so it is read in pages).
export async function fetchAiCalls(sinceIso, maxPages = 12) {
  const rows = [];
  for (let page = 0; page < maxPages; page += 1) {
    const { data, error } = await supabase.from('ai_calls').select('*').gte('created_at', sinceIso).order('created_at', { ascending: false }).range(page * PAGE, page * PAGE + PAGE - 1);
    if (error) { console.warn('fetchAiCalls failed', error); break; }
    rows.push(...(data || []));
    if (!data || data.length < PAGE) break;
  }
  return rows;
}

export async function fetchBudgets() {
  const { data, error } = await supabase.from('ai_budgets').select('*').order('scope', { ascending: true }).order('period', { ascending: true });
  if (error) { console.warn('fetchBudgets failed', error); return []; }
  return data ?? [];
}

// One limit: scope 'global' or 'agent:<key>', period 'day' | 'month'.
export async function saveBudget({ scope, period, limitUsd, enabled = true, email }) {
  const { error } = await supabase.from('ai_budgets').upsert({ scope, period, limit_usd: limitUsd, enabled, updated_by: email || null, updated_at: new Date().toISOString() }, { onConflict: 'scope,period' });
  if (error) throw error;
}
