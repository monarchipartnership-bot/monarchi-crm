import { supabase } from '../supabaseClient';
import { agentAction } from './agents';
import { createCampaign, loadCampaignTeam, setAgentsEnabled, updateCampaign } from './campaigns';
export { ONEOFF } from '../agents/teams';

// One-off tasks of a project (owner, 2026-11-11): a person asks for a piece of work any time, outside the team that works by its schedule: the way a report is made by hand
// for any period next to the report agent that works every week and every month.
// The agents of the research are run from a quiet operation of the project that is never launched: its agents are all switched off and a manual run works for a
// switched-off agent, so nothing starts by itself and the result lands in «Готові матеріали» of the project like any other result.
const must = ({ data, error }) => { if (error) throw error; return data; };

// The quiet operation of the project for the one-off runs; made at the first one.
async function workbench(project, accounts, email) {
  const rows = must(await supabase.from('ag_campaigns').select('*').eq('project_id', project.id).eq('config->>team', 'oneoff').limit(1)) || [];
  if (rows[0]) return rows[0];
  const have = ['meta', 'google'].filter((p) => accounts.some((a) => a.platform === p));
  let c = await createCampaign({ project, platforms: have.length ? have : ['meta'], name: `${project.name} · Разові завдання`, email });
  const team = await loadCampaignTeam(c, email);
  await setAgentsEnabled(team.agents.map((a) => a.id), false);
  c = await updateCampaign(c.id, { config: { ...(c.config || {}), mode: 'full', team: 'oneoff', hidden: true } });
  return c;
}

// Runs one of ONEOFF now. → the answer of the server ({ status: 'done' | 'failed', ... }); the report is also in «Готові матеріали».
export async function runOneOff({ project, accounts = [], role, email = null }) {
  const c = await workbench(project, accounts, email);
  const team = await loadCampaignTeam(c, email);
  const agent = team.agents.find((a) => a.role === role);
  if (!agent) throw new Error('Агента для цього завдання не знайдено.');
  return agentAction('run_agent', { agentId: agent.id });
}
