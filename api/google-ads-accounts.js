// Server-side account lookup for Google Ads, used when creating a project from
// an ad account and for the project page's live numbers. Same rules as
// api/ads-insights-chat.js: a valid Supabase session is required and the
// Google credentials only ever live in the server environment.
//
// POST body: { action, customerId?, datePreset? }
//   action 'list'     — every client account under the manager (MCC) account
//   action 'info'     — name / currency / time zone / status of one account
//   action 'changes'  — the account's change history (change_event, Google keeps ~30 days): body also takes from/to as YYYY-MM-DD
//   action 'insights' — numbers for a period: a preset (last_7d | last_30d | this_month | last_month) or from/to; level 'account' (default) or 'campaign'
import { createClient } from '@supabase/supabase-js';
import { GoogleAdsApi } from 'google-ads-api';

const SUPA_URL = 'https://meyacsdlosuqbkbichsf.supabase.co';
const SUPA_KEY = 'sb_publishable_jnJ1vdEUtn8ytNdJ4KT5Eg_TVlzWYcA';

const STATUS_BY_NUMBER = { 2: 'ENABLED', 3: 'CANCELED', 4: 'SUSPENDED', 5: 'CLOSED' };
// Normalised to the same vocabulary the Meta side and the DB column use.
const NORMALISED = { ENABLED: 'active', CANCELED: 'closed', SUSPENDED: 'disabled', CLOSED: 'closed' };

function round2(n) { return Math.round(n * 100) / 100; }

function normaliseStatus(raw) {
  const key = typeof raw === 'number' ? STATUS_BY_NUMBER[raw] : String(raw || '');
  return NORMALISED[key] || 'unknown';
}

function periodBounds(preset) {
  const fmt = (d) => d.toISOString().slice(0, 10);
  const today = new Date();
  const start = new Date(today);
  if (preset === 'last_30d') { start.setUTCDate(start.getUTCDate() - 30); return { from_date: fmt(start), to_date: fmt(today) }; }
  if (preset === 'this_month') { start.setUTCDate(1); return { from_date: fmt(start), to_date: fmt(today) }; }
  if (preset === 'last_month') {
    return {
      from_date: fmt(new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, 1))),
      to_date: fmt(new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 0))),
    };
  }
  start.setUTCDate(start.getUTCDate() - 7);
  return { from_date: fmt(start), to_date: fmt(today) };
}

function managerCustomer() {
  const client = new GoogleAdsApi({
    client_id: process.env.GOOGLE_ADS_CLIENT_ID,
    client_secret: process.env.GOOGLE_ADS_CLIENT_SECRET,
    developer_token: process.env.GOOGLE_ADS_DEVELOPER_TOKEN || 'unused',
  });
  const loginId = process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID;
  return {
    client,
    loginId,
    customer: client.Customer({ customer_id: loginId.replace(/-/g, ''), login_customer_id: loginId.replace(/-/g, ''), refresh_token: process.env.GOOGLE_ADS_REFRESH_TOKEN }),
  };
}

const CLIENT_FIELDS = 'customer_client.id, customer_client.descriptive_name, customer_client.currency_code, customer_client.time_zone, customer_client.status, customer_client.manager, customer_client.level';

function formatClient(row) {
  const c = row.customer_client || {};
  return {
    id: String(c.id),
    name: c.descriptive_name || null,
    currency: c.currency_code || null,
    timezone: c.time_zone || null,
    status: normaliseStatus(c.status),
    isManager: Boolean(c.manager),
  };
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

  const missing = ['GOOGLE_ADS_CLIENT_ID', 'GOOGLE_ADS_CLIENT_SECRET', 'GOOGLE_ADS_REFRESH_TOKEN', 'GOOGLE_ADS_LOGIN_CUSTOMER_ID'].filter((k) => !process.env[k]);
  if (missing.length) {
    res.status(200).json({ configError: true, missing });
    return;
  }

  const { action = 'list', customerId, datePreset = 'last_7d', from, to, level = 'account' } = req.body || {};
  const digits = String(customerId || '').replace(/\D/g, '');

  try {
    const { customer, client, loginId } = managerCustomer();

    if (action === 'list') {
      const rows = await customer.query(`SELECT ${CLIENT_FIELDS} FROM customer_client WHERE customer_client.level <= 1`);
      const accounts = rows.map(formatClient).filter((a) => !a.isManager);
      res.status(200).json({ accounts });
      return;
    }

    if (!digits) {
      res.status(400).json({ error: 'customerId обовʼязковий' });
      return;
    }

    if (action === 'info') {
      const rows = await customer.query(`SELECT ${CLIENT_FIELDS} FROM customer_client WHERE customer_client.id = ${digits}`);
      if (!rows.length) {
        res.status(404).json({ error: 'Кабінет не знайдено серед акаунтів менеджера (MCC)' });
        return;
      }
      res.status(200).json({ ok: true, account: formatClient(rows[0]) });
      return;
    }

    if (action === 'changes') {
      const target = client.Customer({ customer_id: digits, login_customer_id: loginId.replace(/-/g, ''), refresh_token: process.env.GOOGLE_ADS_REFRESH_TOKEN });
      const okDate = (d) => /^\d{4}-\d{2}-\d{2}$/.test(d || '');
      if (!okDate(from) || !okDate(to)) { res.status(400).json({ error: 'from/to у форматі YYYY-MM-DD' }); return; }
      const rows = await target.query(`SELECT change_event.change_date_time, change_event.change_resource_type, change_event.resource_change_operation, change_event.changed_fields, change_event.user_email, change_event.client_type, change_event.campaign, change_event.ad_group, change_event.old_resource, change_event.new_resource FROM change_event WHERE change_event.change_date_time >= '${from} 00:00:00' AND change_event.change_date_time <= '${to} 23:59:59' ORDER BY change_event.change_date_time DESC LIMIT 300`);
      const clip = (v) => { try { return JSON.stringify(v).slice(0, 500); } catch { return null; } };
      res.status(200).json({
        account: digits,
        count: rows.length,
        items: rows.map((r) => {
          const c = r.change_event || {};
          return {
            time: c.change_date_time,
            type: c.change_resource_type,
            operation: c.resource_change_operation,
            fields: c.changed_fields?.paths || c.changed_fields,
            user: c.user_email,
            client: c.client_type,
            campaign: c.campaign,
            old: clip(c.old_resource),
            next: clip(c.new_resource),
          };
        }),
      });
      return;
    }

    if (action === 'insights') {
      const target = client.Customer({ customer_id: digits, login_customer_id: loginId.replace(/-/g, ''), refresh_token: process.env.GOOGLE_ADS_REFRESH_TOKEN });
      // A preset, or an exact from/to range (YYYY-MM-DD) — the range wins.
      const okDate = (d) => /^\d{4}-\d{2}-\d{2}$/.test(d || '');
      const { from_date, to_date } = okDate(from) && okDate(to) ? { from_date: from, to_date: to } : periodBounds(datePreset);
      const metrics = ['metrics.impressions', 'metrics.clicks', 'metrics.cost_micros', 'metrics.conversions', 'metrics.conversions_value'];
      const shape = (m) => {
        const spend = m.cost_micros != null ? round2(m.cost_micros / 1e6) : 0;
        const clicks = m.clicks ?? 0;
        const impressions = m.impressions ?? 0;
        const conversions = m.conversions != null ? round2(m.conversions) : 0;
        const revenue = m.conversions_value != null ? round2(m.conversions_value) : 0;
        return {
          spend, impressions, clicks, conversions, revenue,
          ctr_pct: impressions > 0 ? round2((clicks / impressions) * 100) : null,
          cpc: clicks > 0 ? round2(spend / clicks) : null,
          roas: spend > 0 && revenue > 0 ? round2(revenue / spend) : null,
        };
      };

      if (level === 'campaign') {
        const rows = await target.report({
          entity: 'campaign',
          attributes: ['campaign.id', 'campaign.name'],
          metrics,
          from_date,
          to_date,
        });
        res.status(200).json({
          account: digits,
          period: { from_date, to_date },
          campaigns: rows.map((r) => ({ id: String(r.campaign?.id), name: r.campaign?.name, ...shape(r.metrics || {}) })),
        });
        return;
      }

      const rows = await target.report({ entity: 'customer', metrics, from_date, to_date });
      res.status(200).json({ account: digits, period: { from_date, to_date }, row: shape(rows[0]?.metrics || {}) });
      return;
    }

    res.status(400).json({ error: 'action: list | info | insights' });
  } catch (err) {
    res.status(502).json({ error: 'Google Ads API: ' + (err?.errors?.[0]?.message || err?.message || String(err)) });
  }
}
