// Server-side reader for Meta (Facebook/Instagram) ad-account insights.
// Mirrors api/ads-insights-chat.js: touches a paid external API and real
// client data, so it requires a valid Supabase session, and the Meta token
// (META_ACCESS_TOKEN, a system-user token with ads_read) only ever lives in
// the server environment — never in a response or an error message.
//
// POST body: { accountId, level?, datePreset?, timeRange?, daily?, check? }
//   accountId  — "act_123…" or just the digits
//   level      — account (default) | campaign | adset | ad
//   datePreset — Meta preset, e.g. last_7d (default), last_30d, this_month, last_month
//   timeRange  — { since: 'YYYY-MM-DD', until: 'YYYY-MM-DD' } (wins over datePreset)
//   daily      — true → one row per day instead of one row for the whole period
//   raw        — true → also return Meta's untouched action lists (for checking the mapping)
//   check      — true → only verify the token and return the account's name/status
import { createClient } from '@supabase/supabase-js';

const SUPA_URL = 'https://meyacsdlosuqbkbichsf.supabase.co';
const SUPA_KEY = 'sb_publishable_jnJ1vdEUtn8ytNdJ4KT5Eg_TVlzWYcA';

const GRAPH_VERSION = process.env.META_GRAPH_VERSION || 'v26.0';
const GRAPH = `https://graph.facebook.com/${GRAPH_VERSION}/`;
const LEVELS = ['account', 'campaign', 'adset', 'ad'];
const MAX_PAGES = 5;

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

function formatRow(row, includeRaw = false) {
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
    ...(includeRaw ? { raw_actions: row.actions || [], raw_action_values: row.action_values || [] } : {}),
  };
}

async function graphGet(url, token) {
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

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) {
    res.status(401).json({ error: 'Не авторизовано' });
    return;
  }
  const authClient = createClient(SUPA_URL, SUPA_KEY);
  const { data: userData, error: authError } = await authClient.auth.getUser(token);
  if (authError || !userData?.user) {
    res.status(401).json({ error: 'Сесія недійсна' });
    return;
  }

  const metaToken = process.env.META_ACCESS_TOKEN;
  if (!metaToken) {
    res.status(200).json({ configError: true, missing: ['META_ACCESS_TOKEN'] });
    return;
  }

  const { accountId, level = 'account', datePreset = 'last_7d', timeRange, daily = false, check = false, raw = false } = req.body || {};
  const digits = String(accountId || '').replace(/^act_/, '').replace(/\D/g, '');
  if (!digits) {
    res.status(400).json({ error: 'accountId обовʼязковий' });
    return;
  }
  if (!LEVELS.includes(level)) {
    res.status(400).json({ error: 'level: ' + LEVELS.join(' | ') });
    return;
  }
  const act = 'act_' + digits;

  try {
    if (check) {
      const info = await graphGet(
        GRAPH + act + '?' + new URLSearchParams({ fields: 'name,account_status,currency,timezone_name', access_token: metaToken }),
        metaToken,
      );
      res.status(200).json({ ok: true, account: { id: act, name: info.name, status: info.account_status, currency: info.currency, timezone: info.timezone_name } });
      return;
    }

    const params = {
      level,
      fields: [
        'campaign_name', 'adset_name', 'ad_name', 'spend', 'impressions', 'reach', 'clicks',
        'actions', 'action_values', 'date_start', 'date_stop',
      ].join(','),
      limit: '200',
      access_token: metaToken,
    };
    if (timeRange?.since && timeRange?.until) params.time_range = JSON.stringify({ since: timeRange.since, until: timeRange.until });
    else params.date_preset = datePreset;
    if (daily) params.time_increment = '1';

    let url = GRAPH + act + '/insights?' + new URLSearchParams(params);
    const rows = [];
    for (let page = 0; page < MAX_PAGES && url; page += 1) {
      const body = await graphGet(url, metaToken);
      rows.push(...(body.data || []));
      url = body.paging?.next || null;
    }
    res.status(200).json({ account: act, level, rows: rows.map((r) => formatRow(r, raw)), truncated: Boolean(url) });
  } catch (err) {
    res.status(err.status && err.status < 500 ? 400 : 502).json({ error: 'Meta API: ' + err.message, code: err.code });
  }
}
