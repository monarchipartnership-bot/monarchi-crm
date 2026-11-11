// Small helpers of the cards of the operations in the AI Agents section (the list of the projects is lib/agents/teamProjects.js). Pure code.
export const PLATFORM_LABEL = { meta: 'Meta', google: 'Google', tiktok: 'TikTok' };

export const TITLE_MAX = 100; // the longest own name of an operation (NameEdit)

// ---- «Налаштування агентів» of the project card: every agent of one operation in one list.
// team: { agents } the operation's own team (ag_agents rows: role, name, enabled, config, schedule, last_run_at); dept: { agents, links } the creative department
// and its links to this operation (ag_agent_clients rows: agent_id, enabled). The helpers are handed in so this file stays free of the registries.
// → [{ key, kind: 'campaign' | 'dept', role, name, short, working, mode, modeLabel, when, lastRunAt }] the working ones first, in the order of the chain
export function agentRows({ team = null, dept = null, shortOf = () => '', describeSchedule = () => '', modeOfAgent = (a) => (a.enabled ? 'auto' : 'paused'), modeText = {}, triggerText = {} } = {}) {
  const out = [];
  (team?.agents || []).forEach((a) => {
    const mode = modeOfAgent(a);
    const when = mode === 'paused' ? '' : describeSchedule(a.schedule) || triggerText[a.config?.trigger || 'upstream'] || '';
    out.push({ key: `c${a.id}`, kind: 'campaign', role: a.role, name: a.name, short: shortOf(a.role), working: mode !== 'paused', mode, modeLabel: modeText[mode] || mode, when, lastRunAt: a.last_run_at || null, sort: a.sort ?? 0 });
  });
  (dept?.agents || []).forEach((a) => {
    const link = (dept.links || []).find((l) => l.agent_id === a.id) || null;
    const on = !!(link && link.enabled && a.enabled !== false);
    const mode = on ? 'auto' : 'paused';
    out.push({ key: `d${a.id}`, kind: 'dept', role: a.role, name: a.name, short: [shortOf(a.role), 'відділ креативів'].filter(Boolean).join(' · '), working: on, mode, modeLabel: on ? 'Працює для клієнта' : link ? 'Вимкнено для клієнта' : 'Не підключено', when: on ? describeSchedule(a.schedule) || triggerText[a.config?.trigger || 'request'] || '' : '', lastRunAt: a.last_run_at || null, sort: 1000 + (a.sort ?? 0) });
  });
  return out.sort((x, y) => (x.working ? 0 : 1) - (y.working ? 0 : 1) || x.sort - y.sort).map(({ sort, ...r }) => r);
}
