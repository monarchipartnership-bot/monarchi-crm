// The in-memory twin of api/_lib/gr/repo.js for scripts/check-growth.mjs: the same methods, the data in plain arrays.
export function createMemoryGrRepo({ now = () => new Date(), settings = {}, brand = null } = {}) {
  const T = { leads: [], drafts: [], runs: [], settings: { stopped: false, monthly_budget_usd: 30, autonomy: {}, ...settings } };
  let n = 0;
  const iso = () => now().toISOString();
  return {
    T,
    async getLead(id) { return T.leads.find((l) => l.id === id) || null; },
    async insertLead(row) { const l = { id: 'lead-' + (++n), status: 'new', created_at: iso(), updated_at: iso(), findings: [], score_parts: [], flags: [], missing: [], ...row }; T.leads.push(l); return { ...l }; },
    async updateLead(id, patch) { const l = T.leads.find((x) => x.id === id); Object.assign(l, patch, { updated_at: iso() }); return { ...l }; },
    async insertDraft(row) { const d = { id: T.drafts.length + 1, created_at: iso(), ...row }; T.drafts.push(d); return { ...d }; },
    async insertRun(row) { T.runs.push({ id: T.runs.length + 1, created_at: iso(), ...row }); },
    async getSettings() { return { ...T.settings }; },
    async monthSpend() { return T.runs.reduce((s, r) => s + Number(r.cost_usd || 0), 0); },
    async getBrand() { return brand; },
  };
}
