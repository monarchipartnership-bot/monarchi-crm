// What the map of the AI Agents shows live, from the rows of the wf_* tables. PURE functions (the page and the tests use them).
// The states are the ones the 3D scene knows: working (green) · paused (a decision of a person is awaited) · waiting (ready, nothing to do now) · inactive · problem.
import { ACTIVE_AGENTS } from './registry.js';
import { APPROVAL_KIND, SKILL_LABEL, agentName, buildQueue } from './view.js';

const OPEN = new Set(['queued', 'running', 'waiting']);
const DAY = 864e5;
// which agent's work waits for a decision of the manager
const AGENT_OF_APPROVAL = { strategy: 'strategist', client: 'strategist', launch: 'mediabuyer', changes: 'strategist' };

// → { agentKey: state } for the five agents. Priority: a problem, then work, then a decision that waits, then «ready», then inactive.
export function agentStates({ runs = [], approvals = [], states = [], now = new Date() } = {}) {
  const out = Object.fromEntries(ACTIVE_AGENTS.map((a) => [a.key, 'inactive']));
  const pending = buildQueue({ states, approvals });
  for (const a of ACTIVE_AGENTS) {
    const mine = runs.filter((r) => r.agent === a.key);
    // the latest run of every kind of work (project + skill): a failure that was followed by a success is old news
    const latest = new Map();
    for (const r of mine.filter((x) => x.skill !== 'launch_check').sort((x, y) => x.id - y.id)) latest.set(`${r.project_id}/${r.skill}`, r);
    const problem = [...latest.values()].some((r) => r.status === 'failed' && now - new Date(r.finished_at || r.created_at) < 7 * DAY);
    const working = mine.some((r) => r.status === 'running' || r.status === 'queued');
    const waitsForPerson = mine.some((r) => r.status === 'waiting') || pending.some((p) => AGENT_OF_APPROVAL[p.kind] === a.key);
    const recent = mine.some((r) => now - new Date(r.finished_at || r.created_at) < 7 * DAY);
    out[a.key] = problem ? 'problem' : working ? 'working' : waitsForPerson ? 'paused' : recent ? 'waiting' : 'inactive';
  }
  return out;
}

// the states for every pod of the map: the five agents as computed, every pod of an archived department is inactive
export function podStates(islands, live) {
  const out = {};
  for (const isl of islands) for (const ag of isl.agents) out[ag.key] = isl.archived ? 'inactive' : live[ag.key] || 'inactive';
  return out;
}

// what one agent is doing now, how it went lately, what it cost this month: for the panel of an island's pod
export function agentFacts({ agent, runs = [], projects = {}, now = new Date(), since }) {
  const mine = runs.filter((r) => r.agent === agent).sort((a, b) => b.id - a.id);
  const open = mine.filter((r) => OPEN.has(r.status));
  const inMonth = mine.filter((r) => !since || r.created_at >= since);
  return {
    open: open.map((r) => ({ id: r.id, project: projects[r.project_id]?.name || `Проєкт ${r.project_id}`, skill: SKILL_LABEL[r.skill] || r.skill, status: r.status })),
    recent: mine.slice(0, 5).map((r) => ({ id: r.id, project: projects[r.project_id]?.name || `Проєкт ${r.project_id}`, skill: SKILL_LABEL[r.skill] || r.skill, status: r.status, error: r.error || '', at: r.finished_at || r.created_at })),
    runs: inMonth.length, failed: inMonth.filter((r) => r.status === 'failed').length,
    cost: inMonth.reduce((s, r) => s + Number(r.cost_usd || 0), 0),
    last7: mine.filter((r) => now - new Date(r.created_at) < 7 * DAY).length,
  };
}

// «Що зараз»: the latest events of all projects in words of the manager, with the tab of the project they lead to
const FEED_TAB = { approval: 'approvals', approved: 'approvals', returned: 'approvals', blocked: 'tasks', run_failed: 'process', skill_stopped: 'process', launch_stopped: 'process', check_failed: 'process', stage: 'process', launch: 'dossier' };
const FEED_HIDE = new Set(['run_done', 'run_requested', 'state', 'task', 'edit']); // too small for a feed
export function feedOf({ journal = [], projects = {}, limit = 8 } = {}) {
  return journal
    .filter((j) => j.project_id != null && !FEED_HIDE.has(j.action))
    .sort((a, b) => b.id - a.id).slice(0, limit)
    .map((j) => ({ id: j.id, at: j.at, projectId: j.project_id, project: projects[j.project_id]?.name || `Проєкт ${j.project_id}`, text: j.summary, tab: FEED_TAB[j.action] || 'process', bad: ['run_failed', 'skill_stopped', 'launch_stopped', 'check_failed', 'blocked'].includes(j.action) }));
}

export const approvalWord = (kind) => APPROVAL_KIND[kind]?.title || kind;
export { agentName };
