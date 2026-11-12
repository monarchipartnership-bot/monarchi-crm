import { supabase } from '../supabaseClient';
import { createCampaign, deleteCampaign, launchCampaign, loadCampaignTeam, setAgentsEnabled, updateCampaign } from './campaigns';
import { kickQueue, saveAgent, startIntel } from './agents';
import { saveCreativeSetup } from './creatives';
import { fetchProjectCreative } from './projectCreative';
import { DEFAULT_AGENT_CONFIG, addAgentEvent, connectAgent, disconnectAgent, fetchAgent, updateAgent } from './projectAgents';
import { modeRoles } from '../agents/campaignModes';
import { CREATIVE_OPTIONAL, CREATIVE_REQUIRED } from '../agents/creativeTeam';
import { cleanSchedule } from '../agents/campaignCycles';
import { cleanRegular } from '../agents/operationCycles';
import { runRegularNow, saveRegular } from './operationCycles';
import { teamDef, teamsOf } from '../agents/teams';

// The AI teams of a project (lib/agents/teams.js): the reading of everything the section «Запуск AI команди» shows, the launch of a team and its stop and resume.
const must = ({ data, error }) => { if (error) throw error; return data; };
const nowIso = () => new Date().toISOString();

// One read for the section: the operations of the project, the report agent, the card of the project for the check and the cabinets.
export async function fetchTeamsData(projectId) {
  const [campaigns, agent, creative, accounts, project] = await Promise.all([
    supabase.from('ag_campaigns').select('*').eq('project_id', projectId).order('created_at', { ascending: false }).then(must),
    fetchAgent(projectId).then((r) => r.agent || null),
    fetchProjectCreative(projectId).catch(() => ({ settings: {}, assets: [] })),
    supabase.from('project_ad_accounts').select('project_id, platform, account_id, account_name, account_status').eq('project_id', projectId).then(must),
    supabase.from('projects').select('id, name, client, website, status, client_language').eq('id', projectId).maybeSingle().then(must),
  ]);
  return { campaigns: campaigns || [], agent, settings: creative.settings || {}, assets: creative.assets || [], accounts: accounts || [], project };
}

const channels = (accounts) => ['meta', 'google'].filter((p) => accounts.some((a) => a.platform === p));

// Launches a team. teamKey: 'creative' | 'analytics' | 'reports'.
//   plan: [{ role, enabled, schedule }] the agents of a team of a campaign with the schedules chosen (analytics)   optional: the optional agents of the creative department that are wanted
//   creativeTask: { brief: { goal, count, ratios, texts, language }, schedule: { weekday | everyDays, time }, startNow } the regular task of the creative team: launching the team IS making it
//   capUsd: the monthly limit of the money of the operation (or null)   reports: { weekly: { weekday, time } | null, monthly: { day, time } | null, tasks }
// → { campaignId } or { reports: true }. The agents start at once where their schedule says so (the cron and the queue do the work).
export async function launchTeam({ teamKey, project, accounts = [], existing = [], plan = [], optional = [], creativeTask = null, capUsd = null, goals = '', reports = null, email = null }) {
  const def = teamDef(teamKey);
  if (!def) throw new Error('Невідома команда.');
  if (teamKey === 'reports') return launchReports({ projectId: project.id, reports, email });
  if (teamsOf({ campaigns: existing }).teams.find((t) => t.key === teamKey)?.state !== 'none') throw new Error(`Команда «${def.title}» у цього проєкту вже працює.`);
  if (teamKey === 'creative' && creativeTask) cleanRegular({ ...creativeTask.schedule, ...(creativeTask.title ? { title: creativeTask.title } : {}), brief: creativeTask.brief }, { by: email }); // a task that cannot be saved is refused BEFORE anything is made
  const have = channels(accounts);
  const platforms = have.length ? have : ['tiktok'];
  let c = await createCampaign({ project, platforms, name: `${project.name} · ${def.title}`, email });
  // anything that goes wrong from here on removes the unfinished operation, so no half-made team is left in the list
  try {
  let team = await loadCampaignTeam(c, email);
  const roles = modeRoles(def.mode, platforms);
  const wanted = (r) => (teamKey === 'analytics' ? roles.includes(r.role) && plan.find((p) => p.role === r.role)?.enabled !== false : false);
  const on = team.agents.filter(wanted).map((a) => a.id);
  const off = team.agents.filter((a) => !wanted(a)).map((a) => a.id);
  await Promise.all([setAgentsEnabled(on, true), setAgentsEnabled(off, false)]);
  // the schedules and the modes the person chose; an agent that has no schedule of its own starts after the agents it waits for
  for (const item of plan) {
    const agent = team.agents.find((a) => a.role === item.role);
    if (!agent || item.shared) continue;
    await saveAgent(agent.id, { schedule: item.schedule ? cleanSchedule(item.schedule) : null }, email);
  }
  c = await updateCampaign(c.id, { config: { ...(c.config || {}), mode: def.mode, modeApplied: `${def.mode}:${[...platforms].sort().join()}`, agentsConfigured: true, language: 'uk', goals: String(goals || ''), team: teamKey }, spend_cap_usd: capUsd > 0 ? capUsd : null });
  if (teamKey === 'creative') await saveCreativeSetup(c, { enabled: true, roles: [...CREATIVE_REQUIRED, ...CREATIVE_OPTIONAL.filter((r) => optional.includes(r))], autoGenerate: creativeTask?.autoGenerate, maxUsd: creativeTask?.maxUsd }, email); // the client is linked to the chosen agents of the department
  await launchCampaign(c.id);
  // the scout studies the site and the cabinet of the client right after the launch (owner, 2026-11-12); the first task waits for the profile. Not a reason to undo a launch.
  if (teamKey === 'creative') await startIntel(c.id).catch((e) => console.warn('startIntel failed:', e?.message || e));
  let startError = '';
  if (teamKey === 'creative' && creativeTask) {
    const { campaign: saved, regular } = await saveRegular(c.id, { enabled: true, ...creativeTask.schedule, ...(creativeTask.title ? { title: creativeTask.title } : {}), brief: creativeTask.brief }, email);
    // the team stays launched even if the first run cannot start: the person is told why and the schedule goes on
    if (creativeTask.startNow) { try { await runRegularNow(saved, regular, email); } catch (e) { startError = e?.message || 'Перший запуск не вдалося почати.'; } }
  }
  kickQueue().catch(() => {});
  return { campaignId: c.id, startError };
  } catch (e) {
    await deleteCampaign(c.id).catch(() => {});
    throw e;
  }
}

async function launchReports({ projectId, reports, email }) {
  const w = reports?.weekly, m = reports?.monthly;
  const config = {
    ...DEFAULT_AGENT_CONFIG,
    tasks: { weeklyReport: !!w, monthlyReport: !!m, presentation: reports?.tasks?.presentation !== false },
    schedule: { weeklyDay: w?.weekday || 1, weeklyTime: w?.time || '09:00', monthlyDay: m?.day || 1, monthlyTime: m?.time || '09:00' },
  };
  if (!config.tasks.weeklyReport && !config.tasks.monthlyReport) throw new Error('Оберіть хоча б один звіт: тижневий або місячний.');
  const { agent } = await fetchAgent(projectId);
  if (!agent) { await connectAgent(projectId, config, email); await addAgentEvent({ projectId, kind: 'connected', status: 'ok', message: 'Агента підключено до проєкту.', createdBy: email }); }
  else await updateAgent(projectId, { config: { ...(agent.config || {}), tasks: config.tasks, schedule: config.schedule } });
  await updateAgent(projectId, { enabled: true, enabled_since: nowIso() });
  await addAgentEvent({ projectId, kind: 'enabled', status: 'info', message: 'Команду «Звіти» запущено.', createdBy: email });
  return { reports: true };
}

// Deletes a team for good: the operation with its agents, tasks, cycles and requests (creative, analytics) or the connection of the report agent (reports).
export async function deleteTeam(team, email = null) {
  if (team.key === 'reports') {
    const projectId = team.agent.project_id;
    await addAgentEvent({ projectId, kind: 'disconnected', status: 'info', message: 'Команду «Звіти» видалено.', createdBy: email }).catch(() => {});
    await disconnectAgent(projectId);
    return;
  }
  await deleteCampaign(team.campaign.id);
}

// Stop or resume a team (its agents do not start until it is resumed; nothing is deleted).
export async function setTeamRunning(team, running, email = null) {
  if (team.key === 'reports') {
    const projectId = team.agent.project_id;
    await updateAgent(projectId, { enabled: running, enabled_since: running ? nowIso() : null });
    await addAgentEvent({ projectId, kind: running ? 'enabled' : 'disabled', status: 'info', message: running ? 'Команду «Звіти» відновлено.' : 'Команду «Звіти» зупинено.', createdBy: email });
    return;
  }
  await updateCampaign(team.campaign.id, { status: running ? 'active' : 'paused' });
  if (running) kickQueue().catch(() => {});
}
