import { supabase } from '../supabaseClient';
import { ensureCampaignTeam, participants, PLATFORM_KEYS } from '../agents/campaignTeam';
import { agentAction } from './agents';

// Campaign teams (migration 20261023000000_ag_campaigns.sql): one team of agents per client campaign.
const nowIso = () => new Date().toISOString();
const must = ({ data, error }) => { if (error) throw error; return data; };

// The clients (projects) that have an ad account in the CRM, with the platforms they run.
export async function fetchClientsForCampaigns() {
  const [projects, accounts] = await Promise.all([
    supabase.from('projects').select('id, name, client, client_id').order('name', { ascending: true }),
    supabase.from('project_ad_accounts').select('project_id, platform, account_id, account_name, account_status'),
  ]);
  const accs = must(accounts) || [];
  return (must(projects) || []).map((p) => ({ ...p, accounts: accs.filter((a) => a.project_id === p.id) }));
}

export async function fetchCampaigns() {
  const { data, error } = await supabase.from('ag_campaigns').select('*').order('created_at', { ascending: false });
  if (error) { console.warn('fetchCampaigns failed', error); return null; }
  return data ?? [];
}

export async function createCampaign({ project, platforms, name, email }) {
  const row = must(await supabase.from('ag_campaigns').insert({
    project_id: project.id, name: name || `${project.name} · ${platforms.map((p) => ({ meta: 'Meta', google: 'Google', tiktok: 'TikTok' }[p])).join(' + ')}`,
    platforms, status: 'draft', config: { language: 'uk', brief: '', goals: '' }, created_by: email || null,
  }).select().single());
  await ensureCampaignTeam(supabase, row, email);
  return row;
}

export async function updateCampaign(id, patch) {
  return must(await supabase.from('ag_campaigns').update({ ...patch, updated_at: nowIso() }).eq('id', id).select().single());
}

// A campaign with the platforms changed gets the agents of the new ones (the agents of removed ones stay, switched off).
export async function changeCampaignPlatforms(campaign, platforms, email) {
  const row = await updateCampaign(campaign.id, { platforms });
  const team = await ensureCampaignTeam(supabase, row, email);
  const keep = new Set(participants(platforms).map((r) => r.role));
  const drop = team.agents.filter((a) => !keep.has(a.role));
  if (drop.length) must(await supabase.from('ag_agents').update({ enabled: false }).in('id', drop.map((a) => a.id)).select());
  return { campaign: row, team };
}

export async function loadCampaignTeam(campaign, email) {
  const { agents, links } = await ensureCampaignTeam(supabase, campaign, email);
  const keep = new Set(participants(campaign.platforms).map((r) => r.role));
  const mine = agents.filter((a) => keep.has(a.role));
  const ids = mine.map((a) => a.id);
  const open = ids.length ? must(await supabase.from('ag_tasks').select('agent_id, status').in('agent_id', ids).in('status', ['queued', 'running', 'failed'])) || [] : [];
  const counts = {};
  open.forEach((t) => { (counts[t.agent_id] ||= { queued: 0, running: 0, failed: 0 })[t.status] += 1; });
  const idSet = new Set(ids);
  return { agents: mine, links: links.filter((l) => idSet.has(l.from_agent_id) && idSet.has(l.to_agent_id)), counts };
}

// The latest finished result of each agent of a campaign (for the campaign page and the reports).
export async function fetchLatestOutputs(agentIds) {
  if (!agentIds.length) return {};
  const rows = must(await supabase.from('ag_tasks').select('id, agent_id, output, finished_at').in('agent_id', agentIds).eq('status', 'done').order('id', { ascending: false }).limit(300)) || [];
  const out = {};
  rows.forEach((r) => { if (!out[r.agent_id] && r.output?.text) out[r.agent_id] = r; });
  return out;
}

export async function setAgentsEnabled(ids, enabled) {
  if (!ids.length) return;
  const patch = enabled ? { enabled: true, updated_at: nowIso() } : { enabled: false, updated_at: nowIso() };
  must(await supabase.from('ag_agents').update(patch).in('id', ids).select());
}

export const launchCampaign = (campaignId) => agentAction('launch_campaign', { campaignId });
export const deleteCampaign = async (id) => {
  must(await supabase.from('ag_agents').delete().eq('team', 'campaign').eq('scope_id', String(id)).select());
  must(await supabase.from('ag_campaigns').delete().eq('id', id).select());
};
export { PLATFORM_KEYS };
