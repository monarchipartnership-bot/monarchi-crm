import { supabase } from '../supabaseClient';
import { agentAction } from './agents';
import { scheduleRows } from '../agents/campaignCycles';

const must = ({ data, error }) => { if (error) throw error; return data; };

// What the card of a campaign shows about its work: the cycles (newest first), when each agent works next and in which mode, and the manager's instructions.
export async function fetchCampaignControl(campaignId) {
  const [cycles, agents, campaign] = await Promise.all([
    supabase.from('ag_cycles').select('*').eq('campaign_id', campaignId).order('number', { ascending: false }).limit(30),
    supabase.from('ag_agents').select('id, role, name, sort, enabled, config, schedule, last_run_at, last_status').eq('team', 'campaign').eq('scope_id', String(campaignId)).order('sort'),
    supabase.from('ag_campaigns').select('id, config, spend_cap_usd, notify_step_usd').eq('id', campaignId).maybeSingle(),
  ]);
  const c = must(campaign);
  return { cycles: must(cycles) || [], agents: scheduleRows(must(agents) || []), instructions: c?.config?.instructions || [], spendCapUsd: c?.spend_cap_usd ?? null, notifyStepUsd: c?.notify_step_usd ?? 2 };
}

// The manager's control. weekday 1..7 + time 'HH:MM' (Kyiv), or null to take the agent off the schedule; mode: 'auto' | 'confirm' | 'paused'.
export const setAgentSchedule = (agentId, schedule) => agentAction('set_agent_schedule', { agentId, schedule });
export const setAgentMode = (agentId, mode) => agentAction('set_agent_mode', { agentId, mode });
export const addInstruction = (campaignId, text, role = null) => agentAction('add_instruction', { campaignId, text, role });
export const removeInstruction = (campaignId, at) => agentAction('remove_instruction', { campaignId, at });
export const editOutput = (taskId, text) => agentAction('edit_output', { taskId, text });
export const passOnResult = (taskId) => agentAction('pass_on', { taskId });

// A campaign cap and the step of the money notices are plain columns of the campaign; empty cap = no cap.
export async function saveCampaignMoney(campaignId, { capUsd, stepUsd }) {
  const patch = {};
  if (capUsd !== undefined) { const v = capUsd === '' || capUsd == null ? null : Number(String(capUsd).replace(',', '.')); if (v != null && (!Number.isFinite(v) || v <= 0)) throw new Error('Ліміт — сума в доларах, наприклад 20, або порожньо, якщо без ліміту.'); patch.spend_cap_usd = v; }
  if (stepUsd !== undefined) { const v = Number(String(stepUsd).replace(',', '.')); if (!Number.isFinite(v) || v < 0) throw new Error('Крок сповіщень — сума в доларах (0 вимикає сповіщення).'); patch.notify_step_usd = v; }
  must(await supabase.from('ag_campaigns').update(patch).eq('id', campaignId).select());
  return patch;
}
