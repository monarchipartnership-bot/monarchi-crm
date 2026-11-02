import { supabase } from '../supabaseClient';
import { buildSpendReport, periodRange, spendRows } from '../agents/spendReport';

const PAGE = 1000;

// The server returns at most 1000 rows at a time, so a long period is read page by page.
async function readAll(build) {
  const out = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build().range(from, from + PAGE - 1);
    if (error) throw error;
    out.push(...(data || []));
    if ((data || []).length < PAGE) return out;
  }
}

// One read for the «Витрати» page: the tasks of the agents (Claude) and the ledger of pictures (Higgsfield) for the period and the one before it.
// → { report, campaigns, projects } where report = spendReport.buildSpendReport(...). kind: 'day' | 'month' | 'year'; anchor: a Kyiv date inside the period.
export async function fetchSpendReport(kind = 'month', anchor) {
  const range = periodRange(kind, anchor);
  const [tasks, spends, agents, campaigns] = await Promise.all([
    readAll(() => supabase.from('ag_tasks').select('id, agent_id, campaign_id, cost_usd, finished_at').gt('cost_usd', 0).gte('finished_at', range.prev.from).lt('finished_at', range.to).order('id')),
    readAll(() => supabase.from('ag_creative_spend').select('id, campaign_id, usd, created_at').gte('created_at', range.prev.from).lt('created_at', range.to).order('id')),
    readAll(() => supabase.from('ag_agents').select('id, role, name').order('id')),
    readAll(() => supabase.from('ag_campaigns').select('id, name, project_id').order('id')),
  ]);
  const projectIds = [...new Set(campaigns.map((c) => c.project_id).filter(Boolean))];
  const projects = projectIds.length ? await readAll(() => supabase.from('projects').select('id, name').in('id', projectIds).order('id')) : [];
  const agentById = new Map(agents.map((a) => [a.id, a]));
  const campaignById = new Map(campaigns.map((c) => [c.id, c]));
  const projectById = new Map(projects.map((p) => [p.id, p]));
  const rows = spendRows({ tasks, spends, agentKeyOf: (id) => agentById.get(id)?.role || null, projectOf: (cid) => campaignById.get(cid)?.project_id ?? null });
  const roleName = new Map(agents.map((a) => [a.role, a.name]));
  const report = buildSpendReport(rows, range, {
    agent: (key) => roleName.get(key) || key,
    campaign: (id) => { const c = campaignById.get(id); return c ? [projectById.get(c.project_id)?.name, c.name].filter(Boolean).join(' — ') : `Кампанія ${id}`; },
    project: (id) => projectById.get(id)?.name || `Проєкт ${id}`,
  });
  return { report, campaigns, projects };
}
