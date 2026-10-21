import { fetchCustomMetrics, fetchReportColumns } from './api/projectReportStore';
import { fetchProjectById } from './api/projects';
import { fetchProjectAccounts } from './api/projectAccounts';
import { fetchAgent } from './api/projectAgents';
import { cleanColumns, missingColumns } from './platformColumns';

// What a saved report of a project needs to be drawn: the project, its accounts, custom metrics, the extra columns chosen per platform
// and the people who approve its reports.
export async function loadReportContext(projectId) {
  const [project, accounts, custom, columns, agent] = await Promise.all([
    fetchProjectById(projectId), fetchProjectAccounts(projectId), fetchCustomMetrics(projectId), fetchReportColumns(projectId), fetchAgent(projectId),
  ]);
  const approvers = (agent?.agent?.config?.approvers || []).map((e) => String(e).toLowerCase());
  return { project, accounts, custom, columns: columns || {}, approvers };
}

// The extra columns that are really in this report (the ones chosen for its platform and found in its numbers).
export function extraKeysOf(columns, row) {
  if (!row || row.platform === 'all') return [];
  return cleanColumns(row.platform, columns?.[row.platform]).filter((k) => !missingColumns(row.platform, [k], row.data?.platforms?.[row.platform]?.total).length);
}
