// Meta (Facebook / Instagram) ad-account insights: the row reading and the Graph access, shared by the endpoint
// (api/meta-ads-insights.js) and the campaign-team agents. The token (META_ACCESS_TOKEN, a system-user token with ads_read) only
// ever lives in the server environment; graphGet strips it from any error message.

import { extractCounts } from '../../src/lib/metaColumns.js';

export const GRAPH_VERSION = process.env.META_GRAPH_VERSION || 'v26.0';
export const GRAPH = `https://graph.facebook.com/${GRAPH_VERSION}/`;
export const LEVELS = ['account', 'campaign', 'adset', 'ad'];
export const MAX_PAGES = 5;

const PURCHASE_TYPES = ['purchase', 'omni_purchase', 'offsite_conversion.fb_pixel_purchase'];
const MESSAGE_TYPES = ['onsite_conversion.messaging_conversation_started_7d'];
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
  const messages = pickAction(row.actions, MESSAGE_TYPES);
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
    messages,
    revenue: round2(revenue),
    // Computed here (not trusted from purchase_roas) so it stays consistent
    // with the other numbers in the same row; null, not 0, when undefined.
    roas: spend > 0 && revenue > 0 ? round2(revenue / spend) : null,
    cost_per_purchase: purchases > 0 ? round2(spend / purchases) : null,
    cost_per_lead: leads > 0 ? round2(spend / leads) : null,
    cost_per_message: messages > 0 ? round2(spend / messages) : null,
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

// Every ad account the token can see (`me/adaccounts`) in the shape the pages use. → { accounts: [{ id: 'act_…', name, status (Meta's number), currency, timezone, created }], truncated }
export async function listMetaAccounts(token) {
  let url = GRAPH + 'me/adaccounts?' + new URLSearchParams({ fields: 'account_id,name,account_status,currency,timezone_name,created_time', limit: '200', access_token: token });
  const accounts = [];
  for (let page = 0; page < MAX_PAGES && url; page += 1) {
    const body = await graphGet(url, token);
    accounts.push(...(body.data || []));
    url = body.paging?.next || null;
  }
  return { accounts: accounts.map((a) => ({ id: 'act_' + a.account_id, name: a.name, status: a.account_status, currency: a.currency, timezone: a.timezone_name, created: a.created_time })), truncated: Boolean(url) };
}

// One insights request, read into plain rows. → { account, level, rows, truncated }. Throws an Error with .status and .code from Meta.
// Extras for the audit of the new agent system: increment ('monthly' or 1 = per day), breakdowns (['age', 'gender', ...]), maxPages and limit for big reads.
// Every row also carries the ids of its campaign, ad set and ad, and the breakdown values, so rows can be joined and grouped without guessing by name.
const BREAKDOWN_KEYS = ['age', 'gender', 'publisher_platform', 'platform_position', 'device_platform', 'impression_device', 'region', 'country'];
export async function fetchMetaInsights({ accountId, level = 'account', datePreset = 'last_7d', timeRange = null, daily = false, increment = null, breakdowns = null, maxPages = MAX_PAGES, limit = 200, token }) {
  const digits = String(accountId || '').replace(/^act_/, '').replace(/\D/g, '');
  if (!digits) throw new Error('accountId обовʼязковий');
  const act = 'act_' + digits;
  const params = {
    level,
    fields: ['campaign_id', 'campaign_name', 'adset_id', 'adset_name', 'ad_id', 'ad_name', 'spend', 'impressions', 'reach', 'clicks', 'actions', 'action_values', 'date_start', 'date_stop'].join(','),
    limit: String(limit),
    access_token: token,
  };
  if (timeRange?.since && timeRange?.until) params.time_range = JSON.stringify({ since: timeRange.since, until: timeRange.until });
  else params.date_preset = datePreset;
  if (increment) params.time_increment = String(increment);
  else if (daily) params.time_increment = '1';
  if (breakdowns?.length) params.breakdowns = breakdowns.join(',');
  let url = GRAPH + act + '/insights?' + new URLSearchParams(params);
  const rows = [];
  for (let page = 0; page < maxPages && url; page += 1) {
    const res = await graphGet(url, token);
    rows.push(...(res.data || []));
    url = res.paging?.next || null;
  }
  const extra = (r) => ({ campaign_id: r.campaign_id, adset_id: r.adset_id, ad_id: r.ad_id, ...Object.fromEntries(BREAKDOWN_KEYS.filter((k) => r[k] != null).map((k) => [k, r[k]])) });
  return { account: act, level, rows: rows.map((r) => ({ ...formatRow(r), ...extra(r) })), truncated: Boolean(url) };
}

// The campaigns of an account with their objective and status: [{ id, name, objective, status, created }]. Reads only.
export async function fetchMetaCampaigns({ accountId, token, maxPages = MAX_PAGES }) {
  const digits = String(accountId || '').replace(/^act_/, '').replace(/\D/g, '');
  if (!digits) throw new Error('accountId обовʼязковий');
  let url = GRAPH + 'act_' + digits + '/campaigns?' + new URLSearchParams({ fields: 'id,name,objective,status,effective_status,created_time', limit: '200', access_token: token });
  const out = [];
  for (let page = 0; page < maxPages && url; page += 1) {
    const res = await graphGet(url, token);
    out.push(...(res.data || []));
    url = res.paging?.next || null;
  }
  return out.map((c) => ({ id: String(c.id), name: c.name, objective: c.objective || null, status: c.effective_status || c.status || null, created: c.created_time || null }));
}

// The pixels (datasets) of an account: [{ id, name, lastFired, unavailable, created }]. Reads only.
export async function fetchMetaPixels({ accountId, token }) {
  const digits = String(accountId || '').replace(/^act_/, '').replace(/\D/g, '');
  if (!digits) throw new Error('accountId обовʼязковий');
  const res = await graphGet(GRAPH + 'act_' + digits + '/adspixels?' + new URLSearchParams({ fields: 'id,name,last_fired_time,is_unavailable,creation_time', limit: '50', access_token: token }), token);
  return (res.data || []).map((p) => ({ id: String(p.id), name: p.name, lastFired: p.last_fired_time || null, unavailable: !!p.is_unavailable, created: p.creation_time || null }));
}
