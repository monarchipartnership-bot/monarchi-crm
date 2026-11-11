// Templates of operations, copying an operation to another project and the calendar of all schedules (spec 2026-11-02, §5). Pure code: the screens and the tests use it.
// A template is a SNAPSHOT of how an operation is set up, without anything that belongs to one client (its name, brief, goals, the client's own fields and the money already spent).
import { modeOfAgent, scheduleRows } from './campaignCycles.js';

export const TEMPLATE_VERSION = 1;
const clip = (s, n) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);

// campaign: the row of ag_campaigns; agents: the rows of ag_agents of its team (team 'campaign'). → the payload that is stored in ag_campaign_templates.payload
export function snapshotOperation({ campaign, agents = [], withInstructions = true }) {
  const cfg = campaign?.config || {};
  return {
    v: TEMPLATE_VERSION,
    mode: cfg.mode || 'full',
    platforms: [...(campaign?.platforms || [])],
    language: cfg.language || 'uk',
    creative: { enabled: !!cfg.creative?.enabled, roles: [...(cfg.creative?.roles || [])] },
    agents: agents.map((a) => ({ role: a.role, enabled: !!a.enabled, config: { ...(a.config || {}) }, schedule: a.schedule?.weekday ? { weekday: a.schedule.weekday, time: a.schedule.time || '09:00' } : Number(a.schedule?.everyDays) >= 1 ? { everyDays: Number(a.schedule.everyDays), time: a.schedule.time || '09:00' } : null })),
    instructions: withInstructions ? (cfg.instructions || []).map((i) => ({ role: i.role || null, text: clip(i.text, 1000) })).filter((i) => i.text) : [],
    spendCapUsd: campaign?.spend_cap_usd == null ? null : Number(campaign.spend_cap_usd),
    notifyStepUsd: campaign?.notify_step_usd == null ? 2 : Number(campaign.notify_step_usd),
  };
}

// A payload from the database may be old or damaged: → the clean one, or throws a message for the person.
export function cleanTemplate(p) {
  if (!p || typeof p !== 'object' || !Array.isArray(p.platforms)) throw new Error('Шаблон пошкоджено.');
  return {
    v: TEMPLATE_VERSION, mode: String(p.mode || 'full'), platforms: p.platforms.filter((x) => typeof x === 'string'), language: ['uk', 'ru', 'en'].includes(p.language) ? p.language : 'uk',
    creative: { enabled: !!p.creative?.enabled, roles: Array.isArray(p.creative?.roles) ? p.creative.roles.filter((x) => typeof x === 'string') : [] },
    agents: (Array.isArray(p.agents) ? p.agents : []).filter((a) => a && typeof a.role === 'string').map((a) => ({ role: a.role, enabled: !!a.enabled, config: a.config && typeof a.config === 'object' ? a.config : {}, schedule: a.schedule?.weekday ? { weekday: Number(a.schedule.weekday), time: String(a.schedule.time || '09:00') } : Number(a.schedule?.everyDays) >= 1 ? { everyDays: Number(a.schedule.everyDays), time: String(a.schedule.time || '09:00') } : null })),
    instructions: (Array.isArray(p.instructions) ? p.instructions : []).map((i) => ({ role: i?.role || null, text: clip(i?.text, 1000) })).filter((i) => i.text),
    spendCapUsd: p.spendCapUsd == null || !(Number(p.spendCapUsd) > 0) ? null : Number(p.spendCapUsd), notifyStepUsd: Number.isFinite(Number(p.notifyStepUsd)) && Number(p.notifyStepUsd) >= 0 ? Number(p.notifyStepUsd) : 2,
  };
}

// The platforms a project can really use: the template's channels that the project has a cabinet for (TikTok has no cabinet link, it is always allowed).
export function platformsFor(template, projectAccounts = []) {
  const have = new Set(projectAccounts.map((a) => a.platform));
  const usable = template.platforms.filter((p) => p === 'tiktok' || have.has(p));
  return { platforms: usable, dropped: template.platforms.filter((p) => !usable.includes(p)) };
}

// teamAgents: the agents of the NEW operation (ag_agents rows). → { config, patches: [{ id, enabled, config, schedule }], missing: [roles of the template that the new team has no agent for] }
export function planApply(template, teamAgents = [], { now = new Date(), by = null } = {}) {
  const byRole = new Map(teamAgents.map((a) => [a.role, a]));
  const patches = [];
  const missing = [];
  template.agents.forEach((a) => {
    const target = byRole.get(a.role);
    if (!target) { missing.push(a.role); return; }
    patches.push({ id: target.id, enabled: a.enabled, config: a.config, schedule: a.schedule });
  });
  const config = {
    language: template.language, mode: template.mode, modeApplied: `${template.mode}:${[...template.platforms].sort().join()}`, agentsConfigured: true,
    creative: template.creative, brief: '', goals: '',
    instructions: template.instructions.map((i) => ({ role: i.role, text: i.text, by, at: now.toISOString() })),
  };
  return { config, patches, missing };
}

// ---- the calendar of all schedules
// agents: ag_agents rows of the campaign teams { id, scope_id, role, name, enabled, config, schedule, sort }; campaigns: ag_campaigns rows; projects: [{ id, name }]
// → { days: [7 × [{ time, agent, campaign, project, campaignId, mode, nextAt }]] (Mon..Sun, by time), upcoming: the same items by the next run, first 12 }
export function buildCalendar({ agents = [], campaigns = [], projects = [], now = new Date() } = {}) {
  const days = Array.from({ length: 7 }, () => []);
  const upcoming = [];
  const campaignById = new Map(campaigns.map((c) => [String(c.id), c]));
  const byCampaign = new Map();
  agents.forEach((a) => { if (a.scope_id != null && campaignById.has(String(a.scope_id))) { const k = String(a.scope_id); (byCampaign.get(k) || byCampaign.set(k, []).get(k)).push(a); } });
  byCampaign.forEach((list, key) => {
    const camp = campaignById.get(key);
    if (camp.status === 'archived' || camp.status === 'draft') return;
    const project = projects.find((p) => p.id === camp.project_id)?.name || '';
    scheduleRows(list, now).forEach((r) => {
      if (!r.schedule?.weekday) return;
      const item = { time: r.schedule.time || '09:00', agent: r.name, role: r.role, campaign: camp.name, campaignId: camp.id, project, mode: r.mode, nextAt: r.nextAt, paused: r.mode === 'paused' || camp.status === 'paused' };
      days[r.schedule.weekday - 1].push(item);
      if (!item.paused && item.nextAt) upcoming.push(item);
    });
  });
  days.forEach((d) => d.sort((a, b) => a.time.localeCompare(b.time) || a.agent.localeCompare(b.agent, 'uk')));
  upcoming.sort((a, b) => a.nextAt.localeCompare(b.nextAt));
  return { days, upcoming: upcoming.slice(0, 12), total: days.reduce((s, d) => s + d.length, 0) };
}

export { modeOfAgent };
