// The page «Проєкти» of the AI Agents section (owner, 2026-11-12): only the projects for which AI teams are launched. A project is a card in the CRM (the Hub); the teams
// are launched and controlled in its tab «Запуск AI команди», so here a project is only a row that leads there. Pure code: the page, the hook and the tests use it.
import { teamsOf } from './teams.js';

export const SORTS = [
  { key: 'attention', label: 'Спершу ті, що чекають вас' },
  { key: 'updated', label: 'Останні зміни' },
  { key: 'name', label: 'За назвою клієнта' },
  { key: 'working', label: 'Спершу з працюючими командами' },
];
export const PLATFORM_LABEL = { meta: 'Meta', google: 'Google', tiktok: 'TikTok' };
const PLATFORM_ORDER = ['meta', 'google', 'tiktok'];
const RANK = { problem: 0, attention: 1, ok: 2 };
const at = (v) => { const t = new Date(v).getTime(); return Number.isNaN(t) ? 0 : t; };

// campaigns: ag_campaigns rows (active / paused ones are enough); agents: project_agents rows (the report agent); projects: [{ id, name, client }];
// accounts: [{ project_id, platform }]; cockpits: the cabinets of the operations by campaign id ({ waiting, tone, updatedAt }) from useProjectCockpit.
// → [{ id (the CRM project), client, name, teams: [{ key, title, state: 'running' | 'paused' }], running, platforms, waiting, tone, updatedAt }] only projects that have a team
export function buildTeamProjectRows({ campaigns = [], agents = [], projects = [], accounts = [], cockpits = {} } = {}) {
  const ids = new Set();
  campaigns.forEach((c) => { if (c.project_id != null && ['active', 'paused'].includes(c.status) && !c.config?.hidden) ids.add(c.project_id); });
  agents.forEach((a) => { if (a.project_id != null && (a.enabled || a.last_run_at)) ids.add(a.project_id); }); // a report agent that was never switched on is not a launched team
  const projectById = new Map(projects.map((p) => [p.id, p]));
  const rows = [];
  ids.forEach((pid) => {
    const mine = campaigns.filter((c) => c.project_id === pid && !c.config?.hidden);
    const agent = agents.find((a) => a.project_id === pid && (a.enabled || a.last_run_at)) || null;
    const teams = teamsOf({ campaigns: mine, agent }).teams.filter((t) => t.state !== 'none').map((t) => ({ key: t.key, title: t.def.title, state: t.state }));
    if (!teams.length) return;
    const live = mine.map((c) => cockpits[c.id]).filter(Boolean).sort((x, y) => RANK[x.tone] - RANK[y.tone] || at(y.updatedAt) - at(x.updatedAt));
    const p = projectById.get(pid) || {};
    const updated = Math.max(0, ...mine.map((c) => at(c.updated_at || c.created_at)), ...live.map((c) => at(c.updatedAt)), at(agent?.last_run_at || agent?.updated_at));
    rows.push({
      id: pid, client: p.client || p.name || `Проєкт ${pid}`, name: p.name || '', teams, running: teams.filter((t) => t.state === 'running').length,
      platforms: PLATFORM_ORDER.filter((k) => accounts.some((x) => x.project_id === pid && x.platform === k)),
      waiting: live.reduce((s, c) => s + (c.waiting || 0), 0), tone: live[0] ? live[0].tone : 'ok', updatedAt: updated ? new Date(updated).toISOString() : null,
    });
  });
  return rows;
}

// filter: 'all' | 'waiting' (something waits for the person) | 'working' (a team works now); query: a part of the client's or the project's name; sort: a key of SORTS
export function filterSortTeamProjects(rows = [], { filter = 'all', query = '', sort = 'attention' } = {}) {
  const q = String(query || '').trim().toLowerCase();
  const shown = rows.filter((r) => filter === 'all' || (filter === 'waiting' ? r.waiting > 0 : r.running > 0))
    .filter((r) => !q || `${r.client} ${r.name}`.toLowerCase().includes(q));
  const byName = (a, b) => a.client.localeCompare(b.client, 'uk') || a.name.localeCompare(b.name, 'uk');
  const cmp = {
    attention: (a, b) => RANK[a.tone] - RANK[b.tone] || b.waiting - a.waiting || at(b.updatedAt) - at(a.updatedAt),
    updated: (a, b) => at(b.updatedAt) - at(a.updatedAt),
    name: byName,
    working: (a, b) => b.running - a.running || byName(a, b),
  }[sort] || (() => 0);
  return [...shown].sort((a, b) => cmp(a, b) || byName(a, b));
}

export const teamProjectCounts = (rows = []) => ({ all: rows.length, waiting: rows.filter((r) => r.waiting > 0).length, working: rows.filter((r) => r.running > 0).length, stopped: rows.filter((r) => r.running === 0).length });

// where a click on a project leads: its card in the Hub, the tab of the teams
export const teamsLink = (projectId) => `/projects/${projectId}?tab=teams`;
