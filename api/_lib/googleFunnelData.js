// Google funnel data from the cabinet (read-only): the conversion actions of the account with their counts for a period, and the counts of the actions
// the manager chose for the funnel stages (src/lib/googleFunnel.js). The count of an action is `all_conversions`: the cart and the view are usually secondary
// actions, which `conversions` (primary only) does not count.
import { enums } from 'google-ads-api';
import { enumName } from './googleProbe.js';
import { funnelCountsFromRows } from '../../src/lib/googleFunnel.js';

const round2 = (n) => Math.round(Number(n || 0) * 100) / 100;

// [{ name, conversions }] of the account for the dates (YYYY-MM-DD), summed by the action's name
export async function conversionRows(target, { from_date, to_date }) {
  const rows = await target.query(`SELECT segments.conversion_action_name, metrics.all_conversions FROM customer WHERE segments.date BETWEEN '${from_date}' AND '${to_date}'`);
  const by = new Map();
  rows.forEach((r) => {
    const name = String(r.segments?.conversion_action_name || '').trim();
    if (name) by.set(name, (by.get(name) || 0) + Number(r.metrics?.all_conversions || 0));
  });
  return [...by.entries()].map(([name, conversions]) => ({ name, conversions }));
}

// { x_g_fn_<step>: count } for the chosen actions (none chosen → no query at all)
export async function funnelCounts(target, range, actions) {
  if (!actions || !Object.keys(actions).length) return {};
  return funnelCountsFromRows(await conversionRows(target, range), actions);
}

// every active conversion action of the account with its count for the period, for the selects of the funnel setup: the most used first
export async function listConversionActions(target, range) {
  const [defs, counts] = await Promise.all([
    target.query("SELECT conversion_action.name, conversion_action.type, conversion_action.category, conversion_action.status, conversion_action.primary_for_goal FROM conversion_action WHERE conversion_action.status = 'ENABLED'"),
    conversionRows(target, range),
  ]);
  const countOf = new Map(counts.map((c) => [c.name, c.conversions]));
  return defs
    .map((r) => {
      const name = String(r.conversion_action?.name || '').trim();
      return { name, type: enumName(enums.ConversionActionType, r.conversion_action?.type), category: enumName(enums.ConversionActionCategory, r.conversion_action?.category), primary: Boolean(r.conversion_action?.primary_for_goal), count: round2(countOf.get(name) || 0) };
    })
    .filter((a) => a.name)
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}
