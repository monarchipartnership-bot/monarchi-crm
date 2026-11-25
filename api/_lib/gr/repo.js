// The storage of the growth team (tables gr_*), written with the token of the signed-in person, so the normal row-level security applies.
// The same methods exist in scripts/grMemoryRepo.mjs for the checks. Nothing here decides anything: it only reads and writes.
import { createClient } from '@supabase/supabase-js';

const SUPA_URL = 'https://meyacsdlosuqbkbichsf.supabase.co';
const SUPA_KEY = 'sb_publishable_jnJ1vdEUtn8ytNdJ4KT5Eg_TVlzWYcA';
const must = (r) => { if (r.error) throw new Error(r.error.message || String(r.error)); return r.data; };

// the first day of the month in Kyiv time as an ISO instant (the budget of the month is counted from it, like the other budgets of the system)
export function monthStartIso(now = new Date()) {
  const ymd = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Kyiv', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  return new Date(`${ymd.slice(0, 8)}01T00:00:00+02:00`).toISOString();
}

export function createGrRepo(accessToken, { now = () => new Date() } = {}) {
  const db = createClient(SUPA_URL, SUPA_KEY, { global: { headers: { Authorization: 'Bearer ' + accessToken } }, auth: { persistSession: false, autoRefreshToken: false } });
  return {
    db,
    async getLead(id) { return must(await db.from('gr_leads').select('*').eq('id', id).maybeSingle()); },
    async insertLead(row) { return must(await db.from('gr_leads').insert(row).select().single()); },
    async updateLead(id, patch) { return must(await db.from('gr_leads').update({ ...patch, updated_at: now().toISOString() }).eq('id', id).select().single()); },
    async insertDraft(row) { return must(await db.from('gr_drafts').insert(row).select().single()); },
    async insertRun(row) { must(await db.from('gr_runs').insert(row)); },
    async getSettings() {
      const s = must(await db.from('gr_settings').select('*').eq('id', 1).maybeSingle()) || { stopped: false, monthly_budget_usd: 30 };
      let global = false;
      try { global = !!must(await db.from('wf_settings').select('stopped').eq('id', 1).maybeSingle())?.stopped; } catch { /* the global stop is read when it can be */ }
      return { ...s, stopped: !!s.stopped || global };
    },
    async monthSpend() {
      const rows = must(await db.from('gr_runs').select('cost_usd').gte('created_at', monthStartIso(now())));
      return (rows || []).reduce((s, r) => s + Number(r.cost_usd || 0), 0);
    },
    async getBrand() { try { return must(await db.from('smm_brand').select('voice, dos, donts').limit(1).maybeSingle()); } catch { return null; } },
  };
}
