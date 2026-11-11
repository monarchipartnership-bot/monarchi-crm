import { supabase } from '../supabaseClient';

const must = ({ data, error }) => { if (error) throw error; return data; };

// What the page «Проєкти» of the AI Agents section needs: the operations that work or are paused, the report agents, the cabinets and the CRM cards of those projects.
// → { campaigns, agents, accounts, projects }
export async function fetchTeamProjectsData() {
  const [campaigns, agents, accounts] = await Promise.all([
    supabase.from('ag_campaigns').select('id, project_id, name, status, config, created_at, updated_at').in('status', ['active', 'paused']),
    supabase.from('project_agents').select('project_id, enabled, last_run_at, updated_at'),
    supabase.from('project_ad_accounts').select('project_id, platform'),
  ]);
  const ops = must(campaigns) || [];
  const ag = must(agents) || [];
  const ids = [...new Set([...ops.map((c) => c.project_id), ...ag.map((a) => a.project_id)].filter((x) => x != null))];
  const projects = ids.length ? must(await supabase.from('projects').select('id, name, client').in('id', ids)) || [] : [];
  return { campaigns: ops, agents: ag, accounts: must(accounts) || [], projects };
}
