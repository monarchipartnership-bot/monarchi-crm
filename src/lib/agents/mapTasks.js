// The tasks that move on the 3D map of the AI team (the carriers that stand at the agent where a task is now): from the REAL tables, pure code (the page and the tests use it).
//   ag_tasks (agent_id, status, campaign_id, request_id, type, output.awaiting_pass), ag_agents (id, team, role), ag_campaigns (id, name, project_id), projects (id, name).
// A CAR is a cycle of a campaign (spec 2026-11-02): it stands at the agent where the cycle's most important open task is now, and shows the campaign, the cycle number and its progress.
// Open work that belongs to no open cycle (agents without a campaign, finished cycles) is shown as before: one carrier per agent, campaign and kind.
// A carrier is one agent's open work on one campaign: running (the agent works on it), queued (it waits for the agent), review (the agent finished and the result waits for the
// person's OK), failed (it failed and was not retried). Open tasks of the same campaign at the same agent are one carrier with a count.

// The role of an agent in the database → the key of the card on the map (the registry, src/data/aiAgentsData.js). The creative department keeps its own `deptAgent` roles.
export const ROLE_TO_AGENT = {
  // campaign teams
  business_research: 'business-research-agent', competitor_research: 'competitor-research-agent', audience_research: 'audience-research-agent', marketing_strategist: 'marketing-strategist',
  creative_strategist: 'creative-strategist', creative_performance_analyst: 'creative-performance-analyst', creative_brief: 'creative-brief-agent', performance_copywriter: 'performance-copywriter',
  quality_controller: 'ai-quality-controller', google_analyst: 'google-ads-analyst', google_optimizer: 'google-optimization-agent', meta_analyst: 'meta-ads-analyst', meta_optimizer: 'meta-optimization-agent',
  tracking_integrity: 'tracking-data-integrity-agent', cross_channel_report: 'cross-channel-reporting-insights-agent', account_manager: 'ai-account-manager',
  // the creative studio of a request
  studio_client_analyst: 'creative-performance-analyst', studio_competitor_analyst: 'competitor-research-agent', studio_brief_writer: 'creative-brief-agent', studio_copywriter: 'performance-copywriter', studio_producer: 'creative-producer-agent',
  // the creative department (the agents with their own page)
  creative_strategy: 'creative-strategist', creative_analyst: 'creative-performance-analyst', creative_maker: 'creative-producer-agent', creative_quality: 'ai-quality-controller', creative_copywriter: 'performance-copywriter',
  // the SMM team
  strategist: 'smm-content-strategist', copywriter: 'smm-copywriter', visual: 'smm-visual-agent', qc: 'smm-quality-control', publisher: 'smm-publisher', social_analyst: 'smm-social-analyst', competitors: 'smm-social-competitors', seo: 'seo-optimizer', site_analyst: 'site-analyst',
};

export const CARRIER_KINDS = { failed: 0, review: 1, running: 2, queued: 3 }; // the order of importance (a problem is shown first)
export const KIND_LABEL = { running: 'у роботі', queued: 'у черзі', review: 'чекає вашого OK', failed: 'помилка' };

const kindOf = (t) => (t.status === 'failed' ? 'failed' : t.status === 'done' && t.output && (t.output.awaiting_pass === true || t.output.awaiting_pass === 'true') ? 'review' : t.status === 'running' ? 'running' : t.status === 'queued' ? 'queued' : null);

// → [{ id, agentKey, kind, count, campaignId, campaign, project, requestId, since, cycleId?, cycleNumber?, progress? }] the most important first
// cycles: ag_cycles rows that are not finished ({ id, campaign_id, number, status, progress, request_id, started_at }).
export function buildMapTasks({ tasks = [], agents = [], campaigns = [], projects = [], cycles = [], knownKeys = null }) {
  const agentById = new Map(agents.map((a) => [a.id, a]));
  const campaignById = new Map(campaigns.map((c) => [c.id, c]));
  const projectById = new Map(projects.map((p) => [p.id, p]));
  const OPEN = ['queued', 'running', 'review', 'problem'];
  const open = tasks.map((t) => {
    const kind = kindOf(t);
    const ag = agentById.get(t.agent_id);
    const agentKey = ag ? ROLE_TO_AGENT[ag.role] : null;
    return kind && agentKey && (!knownKeys || knownKeys.has(agentKey)) ? { t, kind, agentKey } : null;
  }).filter(Boolean);
  const rank = (x, y) => CARRIER_KINDS[x.kind] - CARRIER_KINDS[y.kind] || String(x.t.created_at || '').localeCompare(String(y.t.created_at || ''));
  const taken = new Set();
  const out = [];

  // the cars: one per open cycle that has open work
  cycles.filter((c) => OPEN.includes(c.status)).forEach((c) => {
    const mine = open.filter((x) => !taken.has(x) && x.t.campaign_id === c.campaign_id && (c.request_id ? x.t.request_id === c.request_id : !x.t.request_id && String(x.t.created_at || '') >= String(c.started_at || '')));
    if (!mine.length) return;
    mine.forEach((x) => taken.add(x));
    const main = [...mine].sort(rank)[0];
    out.push({ id: `cycle:${c.id}`, cycleId: c.id, cycleNumber: c.number, progress: Number(c.progress) || 0, agentKey: main.agentKey, kind: main.kind, count: mine.length, campaignId: c.campaign_id, requestId: c.request_id ?? null, since: c.started_at || main.t.created_at || null });
  });

  // everything else, as before
  const carriers = new Map();
  open.filter((x) => !taken.has(x)).forEach(({ t, kind, agentKey }) => {
    const id = `${agentKey}:${t.campaign_id ?? 'x'}:${kind}`;
    const cur = carriers.get(id) || { id, agentKey, kind, count: 0, campaignId: t.campaign_id ?? null, requestId: t.request_id ?? null, since: t.started_at || t.created_at || null };
    cur.count += 1;
    if (t.created_at && (!cur.since || t.created_at < cur.since)) cur.since = t.created_at;
    carriers.set(id, cur);
  });
  return [...out, ...carriers.values()].map((c) => {
    const camp = c.campaignId != null ? campaignById.get(c.campaignId) : null;
    return { ...c, campaign: camp?.name || '', project: (camp && projectById.get(camp.project_id)?.name) || '' };
  }).sort((a, b) => CARRIER_KINDS[a.kind] - CARRIER_KINDS[b.kind] || String(a.since).localeCompare(String(b.since)));
}

// The label of a carrier on the map: «Mellow · у роботі» / «Mellow · 3 у черзі»; a car adds the cycle: «Mellow · цикл 2 · 40% · у роботі»
export const carrierLabel = (c) => (c.cycleNumber
  ? `${c.project || c.campaign || 'Операція'} · цикл ${c.cycleNumber} · ${Math.round((c.progress || 0) * 100)}% · ${KIND_LABEL[c.kind]}`
  : `${c.project || c.campaign || 'Завдання'} · ${c.count > 1 ? `${c.count} ` : ''}${KIND_LABEL[c.kind]}`);

// ---- «Рух задачі»: the path of one car — the agents of its cycle in the order they started, each with the state of its latest task.
// tasks: every task of the cycle (any status) { agent_id, status, output, created_at }; agents: ag_agents rows { id, role, name }.
// → [{ agentKey, role, name, state: 'done' | 'running' | 'queued' | 'review' | 'failed' | 'cancelled', at }] ; the step where the car stands is the first that is not 'done'
export function buildTaskPath({ tasks = [], agents = [] } = {}) {
  const agentById = new Map(agents.map((a) => [a.id, a]));
  const steps = new Map();
  [...tasks].sort((a, b) => String(a.created_at || '').localeCompare(String(b.created_at || ''))).forEach((t) => {
    const ag = agentById.get(t.agent_id);
    if (!ag) return;
    const state = kindOf(t) || (t.status === 'done' ? 'done' : t.status === 'cancelled' ? 'cancelled' : 'queued');
    const cur = steps.get(ag.id);
    if (cur) { cur.state = state; cur.count += 1; } // the latest task of the agent decides (a retry after a failure)
    else steps.set(ag.id, { agentKey: ROLE_TO_AGENT[ag.role] || null, role: ag.role, name: ag.name || ag.role, state, at: t.created_at || null, count: 1 });
  });
  return [...steps.values()];
}

export const PATH_STATE_LABEL = { done: 'готово', running: 'працює', queued: 'у черзі', review: 'чекає вашого OK', failed: 'помилка', cancelled: 'скасовано' };
export const currentStep = (path = []) => path.findIndex((s) => s.state !== 'done' && s.state !== 'cancelled');
