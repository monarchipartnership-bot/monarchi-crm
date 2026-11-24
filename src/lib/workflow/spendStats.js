// The window «Витрати» of the AI Agents section: what the agents cost, by month, project, agent, skill and day, against the limits; and the other spend of the AI in the CRM.
// PURE: rows of wf_runs (cost_usd = the model AND the pictures of the run), ai_calls (the model calls, run_id = the run), wf_project_state, wf_settings.
import { ACTIVE_AGENTS } from './registry.js';
import { SKILL_LABEL } from './view.js';

const r4 = (x) => Math.round(x * 10000) / 10000;
export const monthKey = (d) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
const bounds = (key) => { const [y, m] = key.split('-').map(Number); return { from: new Date(Date.UTC(y, m - 1, 1)), to: new Date(Date.UTC(y, m, 1)), days: new Date(Date.UTC(y, m, 0)).getUTCDate() }; };
export const monthLabel = (key) => { const { from } = bounds(key); return from.toLocaleDateString('uk-UA', { month: 'long', year: 'numeric', timeZone: 'UTC' }); };

// the spend of the AI that is not the work of the five agents (the report agent of a project, the old creative studio, ...): by the key of the caller
export const otherLabel = (key = '') => (key.startsWith('creative-') ? 'Креативний відділ (старий)' : key === 'report-work-summary' ? 'Резюме роботи для звітів' : key.startsWith('report') ? 'Агент звітів проєкту' : key || 'Невідомо');

export function spendReport({ month, now = new Date(), runs = [], calls = [], projects = {}, states = [], settings = {} } = {}) {
  const key = month || monthKey(now);
  const { from, to, days } = bounds(key);
  const inMonth = (iso) => { const t = new Date(iso); return t >= from && t < to; };
  const mine = runs.filter((r) => inMonth(r.created_at));
  const current = key === monthKey(now);
  const daysPassed = current ? Math.min(days, now.getUTCDate()) : days;
  const spent = r4(mine.reduce((s, r) => s + Number(r.cost_usd || 0), 0));
  // the model part of the agents' runs is what ai_calls says about them (agent_key «wf-…»); the rest of the run cost is the pictures
  const wfCalls = calls.filter((c) => String(c.agent_key || '').startsWith('wf-') && inMonth(c.created_at));
  const modelCost = r4(Math.min(spent, wfCalls.reduce((s, c) => s + Number(c.cost_usd || 0), 0)));
  const stateOf = Object.fromEntries(states.map((s) => [s.project_id, s]));

  const perProject = [...new Set(mine.map((r) => r.project_id))].map((id) => {
    const rows = mine.filter((r) => r.project_id === id);
    const own = stateOf[id]?.cost_cap_usd ?? null;
    const cap = own ?? settings.project_cap_default_usd ?? null;
    const sp = r4(rows.reduce((s, r) => s + Number(r.cost_usd || 0), 0));
    return { id, name: projects[id]?.name || `Проєкт ${id}`, spent: sp, cap, ownCap: own, runs: rows.length, pct: cap > 0 ? Math.min(100, Math.round((sp / cap) * 100)) : 0, hot: cap > 0 && sp / cap >= 0.8 };
  }).sort((a, b) => b.spent - a.spent || a.name.localeCompare(b.name, 'uk'));

  const perAgent = ACTIVE_AGENTS.map((a) => {
    const rows = mine.filter((r) => r.agent === a.key);
    return { key: a.key, name: a.name, spent: r4(rows.reduce((s, r) => s + Number(r.cost_usd || 0), 0)), runs: rows.length, failed: rows.filter((r) => r.status === 'failed').length };
  });
  const perSkill = [...new Set(mine.map((r) => `${r.agent}/${r.skill}`))].map((k) => {
    const rows = mine.filter((r) => `${r.agent}/${r.skill}` === k);
    return { key: k, agent: rows[0].agent, skill: rows[0].skill, label: SKILL_LABEL[rows[0].skill] || rows[0].skill, spent: r4(rows.reduce((s, r) => s + Number(r.cost_usd || 0), 0)), runs: rows.length };
  }).sort((a, b) => b.spent - a.spent || b.runs - a.runs).slice(0, 12);

  const perDay = Array.from({ length: days }, (_, i) => {
    const d = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), i + 1));
    const iso = d.toISOString().slice(0, 10);
    return { date: iso, day: i + 1, spent: r4(mine.filter((r) => String(r.created_at).slice(0, 10) === iso).reduce((s, r) => s + Number(r.cost_usd || 0), 0)), future: current && i + 1 > daysPassed };
  });

  const topRuns = [...mine].filter((r) => Number(r.cost_usd) > 0).sort((a, b) => Number(b.cost_usd) - Number(a.cost_usd)).slice(0, 8)
    .map((r) => ({ id: r.id, at: r.created_at, project: projects[r.project_id]?.name || `Проєкт ${r.project_id}`, agent: r.agent, label: SKILL_LABEL[r.skill] || r.skill, cost: Number(r.cost_usd) }));

  const others = {};
  for (const c of calls.filter((x) => !String(x.agent_key || '').startsWith('wf-') && inMonth(x.created_at))) { const k = otherLabel(c.agent_key); (others[k] ||= { label: k, spent: 0, calls: 0 }); others[k].spent += Number(c.cost_usd || 0); others[k].calls += 1; }
  const other = Object.values(others).map((o) => ({ ...o, spent: r4(o.spent) })).sort((a, b) => b.spent - a.spent);

  const cap = settings.monthly_cap_usd ?? null;
  return {
    month: key, label: monthLabel(key), current, days, daysPassed, spent, modelCost, picturesCost: r4(Math.max(0, spent - modelCost)), cap,
    pct: cap > 0 ? Math.min(100, Math.round((spent / cap) * 100)) : 0, hot: cap > 0 && spent / cap >= 0.8,
    forecast: current && daysPassed > 0 ? r4((spent / daysPassed) * days) : null,
    perProject, perAgent, perSkill, perDay, topRuns, other, otherTotal: r4(other.reduce((s, o) => s + o.spent, 0)), runs: mine.length,
  };
}

// the months the window offers: this one and the two before
export function monthsOffered(now = new Date()) {
  return [0, 1, 2].map((i) => monthKey(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1))));
}
