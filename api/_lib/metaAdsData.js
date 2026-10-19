// Meta (Facebook / Instagram) ad-account insights: the row reading and the Graph access, shared by the endpoint
// (api/meta-ads-insights.js) and the campaign-team agents. The token (META_ACCESS_TOKEN, a system-user token with ads_read) only
// ever lives in the server environment; graphGet strips it from any error message.

import { extractCounts } from '../../src/lib/metaColumns.js';

export const GRAPH_VERSION = process.env.META_GRAPH_VERSION || 'v26.0';
export const GRAPH = `https://graph.facebook.com/${GRAPH_VERSION}/`;
export const LEVELS = ['account', 'campaign', 'adset', 'ad'];
export const MAX_PAGES = 5;

const PURCHASE_TYPES = ['purchase', 'omni_purchase', 'offsite_conversion.fb_pixel_purchase'];
const LEAD_TYPES = ['lead', 'onsite_conversion.lead_grouped', 'offsite_conversion.fb_pixel_lead'];

function round2(n) { return Math.round(n * 100) / 100; }
function num(v) { const n = Number(v); return Number.isFinite(n) ? n : 0; }

// Meta returns `actions` as [{action_type, value}]; take the first matching
// type only, because several aliases of the same event are reported together
// and summing them would double count.
function pickAction(list, types) {
  if (!Array.isArray(list)) return 0;
  for (const t of types) {
    const hit = list.find((a) => a.action_type === t);
    if (hit) return num(hit.value);
  }
  return 0;
}

// `columns` = the extra report metrics picked for the project (src/lib/metaColumns.js): their raw counts come back as x_<count>.
export function formatRow(row, includeRaw = false, columns = []) {
  const spend = num(row.spend);
  const impressions = num(row.impressions);
  const clicks = num(row.clicks);
  const purchases = pickAction(row.actions, PURCHASE_TYPES);
  const leads = pickAction(row.actions, LEAD_TYPES);
  const revenue = pickAction(row.action_values, PURCHASE_TYPES);
  return {
    name: row.campaign_name || row.adset_name || row.ad_name || undefined,
    date: row.date_start && row.date_stop && row.date_start === row.date_stop ? row.date_start : undefined,
    period: { from_date: row.date_start, to_date: row.date_stop },
    spend: round2(spend),
    impressions,
    reach: num(row.reach),
    clicks,
    ctr_pct: impressions > 0 ? round2((clicks / impressions) * 100) : null,
    cpc: clicks > 0 ? round2(spend / clicks) : null,
    cpm: impressions > 0 ? round2((spend / impressions) * 1000) : null,
    purchases,
    leads,
    revenue: round2(revenue),
    // Computed here (not trusted from purchase_roas) so it stays consistent
    // with the other numbers in the same row; null, not 0, when undefined.
    roas: spend > 0 && revenue > 0 ? round2(revenue / spend) : null,
    cost_per_purchase: purchases > 0 ? round2(spend / purchases) : null,
    cost_per_lead: leads > 0 ? round2(spend / leads) : null,
    // Debug aid: the untouched action lists, so a metric mapping can be checked against Meta.
    ...(columns.length ? extractCounts(row, columns) : {}),
    ...(includeRaw ? { raw_actions: row.actions || [], raw_action_values: row.action_values || [] } : {}),
  };
}

export async function graphGet(url, token) {
  const r = await fetch(url);
  const body = await r.json().catch(() => ({}));
  if (!r.ok || body.error) {
    const e = body.error || {};
    // The token goes in the query string, so make sure it never reaches the caller.
    const msg = String(e.message || `HTTP ${r.status}`).split(token).join('[token]');
    const err = new Error(msg);
    err.status = r.status;
    err.code = e.code;
    throw err;
  }
  return body;
}

// One insights request, read into plain rows. → { account, level, rows, truncated }. Throws an Error with .status and .code from Meta.
export async function fetchMetaInsights({ accountId, level = 'account', datePreset = 'last_7d', timeRange = null, daily = false, token }) {
  const digits = String(accountId || '').replace(/^act_/, '').replace(/\D/g, '');
  if (!digits) throw new Error('accountId обовʼязковий');
  const act = 'act_' + digits;
  const params = {
    level,
    fields: ['campaign_name', 'adset_name', 'ad_name', 'spend', 'impressions', 'reach', 'clicks', 'actions', 'action_values', 'date_start', 'date_stop'].join(','),
    limit: '200',
    access_token: token,
  };
  if (timeRange?.since && timeRange?.until) params.time_range = JSON.stringify({ since: timeRange.since, until: timeRange.until });
  else params.date_preset = datePreset;
  if (daily) params.time_increment = '1';
  let url = GRAPH + act + '/insights?' + new URLSearchParams(params);
  const rows = [];
  for (let page = 0; page < MAX_PAGES && url; page += 1) {
    const res = await graphGet(url, token);
    rows.push(...(res.data || []));
    url = res.paging?.next || null;
  }
  return { account: act, level, rows: rows.map((r) => formatRow(r)), truncated: Boolean(url) };
}
