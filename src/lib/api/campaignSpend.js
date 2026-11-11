import { supabase } from '../supabaseClient';

const must = ({ data, error }) => { if (error) throw error; return data || []; };

// What the page «Витрати» needs to add up the money of the campaigns: the campaigns, the paid steps of the agents (Claude) and the pictures (Higgsfield).
// The newest 5000 rows of each are read: far more than a team spends in a year of campaigns today.
export async function fetchCampaignSpend() {
  const [campaigns, tasks, spends, teamAgents] = await Promise.all([
    supabase.from('ag_campaigns').select('id, project_id, name, status, spend_cap_usd, notify_step_usd, launched_at'),
    supabase.from('ag_tasks').select('agent_id, campaign_id, cost_usd, created_at').gt('cost_usd', 0).order('created_at', { ascending: false }).limit(5000),
    supabase.from('ag_creative_spend').select('campaign_id, usd, kind, created_at').gt('usd', 0).order('created_at', { ascending: false }).limit(5000),
    supabase.from('ag_agents').select('id, scope_id').eq('team', 'campaign'),
  ]);
  // the agents of an operation of its own team (analytics, reports of cabinets) leave campaign_id of their tasks empty: they belong to the operation by their scope
  const own = new Map(must(teamAgents).map((a) => [a.id, Number(a.scope_id)]));
  return { campaigns: must(campaigns), tasks: must(tasks).map((t) => (t.campaign_id == null && own.has(t.agent_id) ? { ...t, campaign_id: own.get(t.agent_id) } : t)), spends: must(spends) };
}
