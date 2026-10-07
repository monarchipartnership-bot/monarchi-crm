// Real agent status wording for the map (text badges, counters, footer).
// status values come straight from aiAgentsData.js; nothing is derived from
// decoration or animation.
export const STATUS_TEXT = {
  live: 'Live',
  in_development: 'У розробці',
  not_started: 'Заплановано',
};

export function countStatuses(agents) {
  const out = { total: agents.length, live: 0, in_development: 0, not_started: 0 };
  agents.forEach((a) => { if (out[a.status] !== undefined) out[a.status] += 1; });
  return out;
}
