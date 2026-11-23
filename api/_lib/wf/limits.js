// The cost limits of the agents (step A11): the limit of one project (its own or the default of the system) and the limit of everything together.
// A run that is stopped by a limit waits (blocked_on: 'cost_cap') and wakes up when the numbers allow it again: a raised limit, or a new month.

export const monthStart = (d) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString();

// → { project: cap | null, total: cap | null } where a cap is the number of dollars
export function capsOf(state, settings) {
  return {
    project: state?.cost_cap_usd ?? settings?.project_cap_default_usd ?? null,
    total: settings?.monthly_cap_usd ?? null,
  };
}

// which limit is reached, if any: 'project' | 'total' | null
export function reached({ state, settings, projectSpent, totalSpent }) {
  const caps = capsOf(state, settings);
  if (caps.project != null && Number(projectSpent) >= Number(caps.project)) return 'project';
  if (caps.total != null && Number(totalSpent) >= Number(caps.total)) return 'total';
  return null;
}
