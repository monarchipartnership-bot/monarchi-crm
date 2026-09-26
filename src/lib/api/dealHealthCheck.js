import { fetchAllDeals } from './deals';

const MS_PER_DAY = 1000 * 60 * 60 * 24;

function daysSince(iso) {
  if (!iso) return null;
  return Math.floor((Date.now() - new Date(iso).getTime()) / MS_PER_DAY);
}

// Core logic for the "Агент контролю стану угод" (deal-health-check, see
// aiAgentsData.js) — human-assisted: it only ever proposes a list, the
// human decides what to do with each deal (theHuman: "Менеджер вирішує,
// що робити з кожною угодою зі списку"). Scoped to deals still open
// (neither won nor lost) with no update in at least `minDays` — matches
// the agent's own description exactly, no other signal yet (tasks
// cross-referencing is listed as "Планується" in wiredInto, not v1).
export function findStaleDeals(deals, minDays = 7) {
  return deals
    .filter((d) => !d.deal_stages?.is_won && !d.deal_stages?.is_lost)
    .map((d) => ({ ...d, daysStale: daysSince(d.updated_at) }))
    .filter((d) => d.daysStale !== null && d.daysStale >= minDays)
    .sort((a, b) => b.daysStale - a.daysStale);
}

export async function runDealHealthCheck(minDays = 7) {
  const deals = await fetchAllDeals();
  return findStaleDeals(deals, minDays);
}
