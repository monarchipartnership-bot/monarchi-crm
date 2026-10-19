// «Показники за період», «Тижневий» and «Місячний звіт» are split by ad platform: a tab per platform linked to the project and, always last,
// «Разом» (all of them together). A tab is a platform id or 'total'. Pure code, shared by the pages and the AI agent.
export const TOTAL_TAB = 'total';

// The distinct platforms of the project's ad accounts, in the order they were linked.
export const accountPlatforms = (accounts) => [...new Set((accounts || []).map((a) => a.platform))];

// The accounts a tab works with: one platform's, or all of them for «Разом».
export const accountsForTab = (accounts, tab) => (tab === TOTAL_TAB ? accounts || [] : (accounts || []).filter((a) => a.platform === tab));

// Where a tab's saved reports live (project_reports.platform): the platform itself, or 'all' for «Разом».
// A project with a single platform has no separate «Разом»: it is the same report as that platform's.
export function reportScope(tab, accounts) {
  if (tab !== TOTAL_TAB) return tab;
  const platforms = accountPlatforms(accounts);
  return platforms.length === 1 ? platforms[0] : 'all';
}

// The report of a period for a presentation of `platform`: that platform's own report first, else a combined one that has the platform.
export function pickReportRow(rows, periodStart, platform) {
  const same = (rows || []).filter((r) => r.period_start === periodStart);
  return same.find((r) => r.platform === platform) || same.find((r) => (r.platform || 'all') === 'all' && r.data?.platforms?.[platform]) || null;
}

// A project has a report per platform now: the project counts as only as far along as its least finished report.
const STATUS_ORDER = { draft: 0, reviewed: 1, final: 2 };
export function collapseStatuses(rows) {
  const by = new Map();
  rows.forEach((r) => {
    const prev = by.get(r.project_id);
    if (!prev || (STATUS_ORDER[r.status] ?? 0) < (STATUS_ORDER[prev.status] ?? 0)) by.set(r.project_id, r);
  });
  return [...by.values()];
}

// A platform can sit in two reports of one period (its own and «Разом»): its own is the one counted.
export function flatten(rows, extra) {
  const own = new Set(rows.filter((r) => r.platform && r.platform !== 'all').map((r) => `${r.project_id}|${r.period_start}|${r.platform}`));
  return rows.flatMap((r) => Object.entries(r.data?.platforms || {})
    .filter(([platform]) => r.platform !== 'all' || !own.has(`${r.project_id}|${r.period_start}|${platform}`))
    .map(([platform, p]) => ({ project_id: r.project_id, platform, data: p.total || {}, ...extra(r) })));
}
