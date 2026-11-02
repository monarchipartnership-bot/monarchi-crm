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
//   columns    — extra report metrics to compute (keys of src/lib/metaColumns.js, e.g. mx_add_to_cart); only what they need is asked from Meta
//   raw        — true → also return Meta's untouched action lists (for checking the mapping)
//   list       — true → return every ad account the token can see (no accountId needed)
//   activities — true → the account's change history for timeRange (who changed what)
//   check      — true → only verify the token and return the account's name/status
import { createClient } from '@supabase/supabase-js';
import { formatRow, GRAPH, graphGet, LEVELS, listMetaAccounts, MAX_PAGES } from './_lib/metaAdsData.js';
import { metaErrorText } from '../src/lib/metaOnboarding.js';
import { cleanColumns, insightFieldsFor, unknownFieldOf } from '../src/lib/metaColumns.js';

const SUPA_URL = 'https://meyacsdlosuqbkbichsf.supabase.co';
const SUPA_KEY = 'sb_publishable_jnJ1vdEUtn8ytNdJ4KT5Eg_TVlzWYcA';

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

  const { accountId, level = 'account', datePreset = 'last_7d', timeRange, daily = false, check = false, raw = false, list = false, activities = false } = req.body || {};
  const columns = cleanColumns('meta', req.body?.columns);
  if (list) {
    try {
      res.status(200).json(await listMetaAccounts(metaToken));
    } catch (err) {
      res.status(err.status && err.status < 500 ? 400 : 502).json({ error: metaErrorText(err) || 'Meta API: ' + err.message, code: err.code });
    }
    return;
  }

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
    if (activities) {
      const range = timeRange?.since && timeRange?.until ? timeRange : null;
      if (!range) { res.status(400).json({ error: 'timeRange {since, until} обовʼязковий' }); return; }
      let url = GRAPH + act + '/activities?' + new URLSearchParams({
        fields: 'event_time,event_type,translated_event_type,object_name,object_type,object_id,extra_data,actor_name,application_name',
        since: range.since,
        until: range.until,
        limit: '200',
        access_token: metaToken,
      });
      const items = [];
      for (let page = 0; page < MAX_PAGES && url; page += 1) {
        const body = await graphGet(url, metaToken);
        items.push(...(body.data || []));
        url = body.paging?.next || null;
      }
      res.status(200).json({ account: act, count: items.length, truncated: Boolean(url), items });
      return;
    }

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
        'actions', 'action_values', 'date_start', 'date_stop', ...insightFieldsFor(columns),
      ].join(','),
      limit: '200',
      access_token: metaToken,
    };
    if (timeRange?.since && timeRange?.until) params.time_range = JSON.stringify({ since: timeRange.since, until: timeRange.until });
    else params.date_preset = datePreset;
    if (daily) params.time_increment = '1';

    let url = GRAPH + act + '/insights?' + new URLSearchParams(params);
    const rows = [];
    // a picked column whose field Meta does not know (an account or API version without it) must not break the whole report: it is dropped and named in `unavailable`
    const unavailable = [];
    for (let page = 0; page < MAX_PAGES && url; page += 1) {
      let body;
      for (let attempt = 0; ; attempt += 1) {
        try { body = await graphGet(url, metaToken); break; } catch (err) {
          const bad = page === 0 ? unknownFieldOf(err) : null;
          const list = params.fields.split(',');
          if (!bad || !list.includes(bad) || attempt >= 6) throw err;
          unavailable.push(bad);
          params.fields = list.filter((f) => f !== bad).join(',');
          url = GRAPH + act + '/insights?' + new URLSearchParams(params);
        }
      }
      rows.push(...(body.data || []));
      url = body.paging?.next || null;
    }
    res.status(200).json({ account: act, level, rows: rows.map((r) => formatRow(r, raw, columns)), truncated: Boolean(url), ...(unavailable.length ? { unavailable } : {}) });
  } catch (err) {
    res.status(err.status && err.status < 500 ? 400 : 502).json({ error: metaErrorText(err) || 'Meta API: ' + err.message, code: err.code });
  }
}
