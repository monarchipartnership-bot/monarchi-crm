import { supabase } from '../supabaseClient';
import { authedPost } from '../adAccounts';
import { actionOfChannel, emptyRecord, recordDecision, UNLOCK_AFTER } from '../growth/autonomy';
import { wordCount } from '../growth/draftRules';

// The data of the window «Зростання» (tables gr_*, migration 20261076). The person's decisions are written here under the row-level security;
// only the model work goes through the endpoint /api/gr. The page talks to ONE object (`api`), the dev fixture has the same shape (lib/growth/fixtureApi.js).
const must = (r, what) => { if (r.error) throw new Error(`${what}: ${r.error.message}`); return r.data; };
const nowIso = () => new Date().toISOString();
const KYIV_MONTH = () => { const ymd = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Kyiv', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()); return new Date(`${ymd.slice(0, 8)}01T00:00:00+02:00`).toISOString(); };

async function updateAutonomy(settings, key, fn) {
  const cur = settings?.autonomy || {};
  const next = { ...cur, [key]: fn(cur[key] || emptyRecord()) };
  must(await supabase.from('gr_settings').update({ autonomy: next, updated_at: nowIso() }).eq('id', 1), 'Налаштування');
}

export const api = {
  // → { leads, drafts, settings, spent }
  async load() {
    const [leads, settings, runs] = await Promise.all([
      supabase.from('gr_leads').select('*').order('created_at', { ascending: false }).limit(300),
      supabase.from('gr_settings').select('*').eq('id', 1).maybeSingle(),
      supabase.from('gr_runs').select('cost_usd').gte('created_at', KYIV_MONTH()),
    ]);
    const ls = must(leads, 'Ліди');
    const ids = ls.filter((l) => !['rejected', 'skipped', 'failed'].includes(l.status)).map((l) => l.id);
    const drafts = ids.length ? must(await supabase.from('gr_drafts').select('*').in('lead_id', ids).order('created_at', { ascending: false }), 'Листи') : [];
    return { leads: ls, drafts, settings: must(settings, 'Налаштування') || { stopped: false, monthly_budget_usd: 30, autonomy: {} }, spent: (must(runs, 'Журнал') || []).reduce((s, r) => s + Number(r.cost_usd || 0), 0) };
  },
  add: (payload) => authedPost('/api/gr', { action: 'add', ...payload }),
  run: (leadId) => authedPost('/api/gr', { action: 'run', leadId }),
  approveLead: (leadId) => authedPost('/api/gr', { action: 'approve_lead', leadId }),
  makeDraft: (leadId, kind = 'letter', incoming = '') => authedPost('/api/gr', { action: 'draft', leadId, kind, incoming }),

  // the person approves a text (as it was, or edited): the lead is ready to be sent, and the record of this kind of action grows or breaks
  async approveDraft({ draft, body, edited, by, settings }) {
    must(await supabase.from('gr_drafts').update({ status: 'approved', body, words: wordCount(body), edited, issues: [], decided_by: by, decided_at: nowIso() }).eq('id', draft.id), 'Лист');
    must(await supabase.from('gr_leads').update({ status: draft.kind === 'reply' ? 'replied' : 'ready', decided_by: by, updated_at: nowIso() }).eq('id', draft.lead_id), 'Лід');
    await updateAutonomy(settings, actionOfChannel(draft.channel), (r) => recordDecision(r, { approved: true, edited }));
  },
  async skipDraft({ draft, by, settings }) {
    must(await supabase.from('gr_drafts').update({ status: 'skipped', decided_by: by, decided_at: nowIso() }).eq('id', draft.id), 'Лист');
    await updateAutonomy(settings, actionOfChannel(draft.channel), (r) => recordDecision(r, { approved: false, edited: false }));
  },
  async markSent({ lead, draft }) {
    if (draft) must(await supabase.from('gr_drafts').update({ status: 'sent' }).eq('id', draft.id), 'Лист');
    must(await supabase.from('gr_leads').update({ status: 'sent', sent_at: nowIso(), updated_at: nowIso() }).eq('id', lead.id), 'Лід');
  },
  async markReplied(leadId) { must(await supabase.from('gr_leads').update({ status: 'replied', replied_at: nowIso(), updated_at: nowIso() }).eq('id', leadId), 'Лід'); },
  async markWon(leadId) { must(await supabase.from('gr_leads').update({ status: 'won', updated_at: nowIso() }).eq('id', leadId), 'Лід'); },
  async endLead(leadId, status, by) { must(await supabase.from('gr_leads').update({ status, decided_by: by, updated_at: nowIso() }).eq('id', leadId), 'Лід'); }, // 'rejected' | 'skipped'
  async setStopped(stopped, by) { must(await supabase.from('gr_settings').update({ stopped, stopped_by: by, stopped_at: nowIso(), stopped_reason: stopped ? 'Зупинено на вікні «Зростання»' : null, updated_at: nowIso() }).eq('id', 1), 'Налаштування'); },
  async setBudget(usd) { must(await supabase.from('gr_settings').update({ monthly_budget_usd: usd, updated_at: nowIso() }).eq('id', 1), 'Налаштування'); },
  async setLevel({ key, level, settings }) { await updateAutonomy(settings, key, (r) => ({ ...r, level })); },
  async unlockAuto({ key, settings }) { await updateAutonomy(settings, key, (r) => ((r.streak || 0) >= UNLOCK_AFTER ? { ...r, unlockedAuto: true } : r)); },

  // how many decisions wait (for the badge of the menu); never throws: before the migration is applied the badge is simply absent
  async waiting() {
    try {
      const a = await supabase.from('gr_leads').select('id', { count: 'exact', head: true }).eq('status', 'scored').eq('verdict', 'ask');
      const b = await supabase.from('gr_drafts').select('id', { count: 'exact', head: true }).eq('status', 'pending');
      return (a.count || 0) + (b.count || 0);
    } catch { return 0; }
  },
};

// the dev fixture: the same functions on data in memory, only with `?fixture` in the address of a dev server (see Growth.jsx)
export async function pickApi() {
  if (import.meta.env.DEV && typeof location !== 'undefined' && new URLSearchParams(location.search).has('fixture')) return (await import('../growth/fixtureApi.js')).fixtureApi();
  return api;
}
