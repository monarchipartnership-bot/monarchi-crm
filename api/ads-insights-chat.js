// Server-side handler for the Ads Insights Analyst agent (see
// src/pages/AdsInsightsAnalyst/AdsInsightsAnalyst.jsx). Unlike
// api/anthropic.js (a generic open passthrough), this endpoint touches a
// paid external API and real client business data, so it requires a valid
// Supabase session before doing anything — never a public passthrough.
//
// Runs a small Claude tool-use loop: the model can call
// get_google_ads_report to pull real Google Ads numbers for the requested
// client's ad account (never invents figures itself), then answers in
// Ukrainian using only what the tool returned.
import { createClient } from '@supabase/supabase-js';
import { GoogleAdsApi } from 'google-ads-api';

const SUPA_URL = 'https://meyacsdlosuqbkbichsf.supabase.co';
const SUPA_KEY = 'sb_publishable_jnJ1vdEUtn8ytNdJ4KT5Eg_TVlzWYcA';

const MODEL = 'claude-sonnet-5';
const MAX_TOOL_ROUNDS = 6;
// A full audit is many get_google_ads_report calls (current period, prior
// period, per-campaign, per-device, per-keyword, ...) chained into one
// reply — the default budget above is deliberately small/cheap for normal
// chat, this one is only used when the request carries `auditInstructions`.
const MAX_AUDIT_ROUNDS = 25;

const REPORT_TOOL = {
  name: 'get_google_ads_report',
  description: 'Отримати реальні показники ефективності Google Ads клієнта за вказаний період: покази, кліки, витрати, конверсії, цінність конверсій, ROAS, CTR, середня ціна за клік, ціна за конверсію, конверсія кліків у дію, impression share (тільки для Search-кампаній, може бути відсутній для інших типів).',
  input_schema: {
    type: 'object',
    properties: {
      dateRange: { type: 'string', enum: ['LAST_7_DAYS', 'LAST_30_DAYS', 'THIS_MONTH', 'LAST_MONTH'], description: 'Період, за який потрібні дані.' },
      level: {
        type: 'string', enum: ['account', 'campaign', 'device', 'keyword', 'ad', 'network'],
        description: '"account" — сумарно по кабінету, "campaign" — по кожній кампанії, "device" — по типу пристрою (mobile/desktop/tablet), "keyword" — по ключових словах (включно з Quality Score), "ad" — по оголошеннях, "network" — по рекламній мережі (Search/Display/...).',
      },
    },
    required: ['dateRange', 'level'],
  },
};

// Terminal tools — unlike REPORT_TOOL these fetch nothing, they just
// package numbers Claude already pulled via get_google_ads_report earlier
// in this same turn into a shape the frontend can render as a real table
// or chart. Seeing one of these ends the loop immediately (see below).
const PRESENT_TABLE_TOOL = {
  name: 'present_table',
  description: 'Показати результат як таблицю в чаті (для розбивок по кампаніях/пристроях, порівняння періодів тощо) — тільки з цифр, які вже отримано через get_google_ads_report.',
  input_schema: {
    type: 'object',
    properties: {
      title: { type: 'string' },
      columns: { type: 'array', items: { type: 'string' } },
      rows: { type: 'array', items: { type: 'array', items: { type: ['string', 'number'] } } },
    },
    required: ['columns', 'rows'],
  },
};
const PRESENT_CHART_TOOL = {
  name: 'present_chart',
  description: 'Показати результат як графік у чаті (для порівнянь чи трендів, коли користувач просить графік/діаграму) — тільки з цифр, які вже отримано через get_google_ads_report.',
  input_schema: {
    type: 'object',
    properties: {
      title: { type: 'string' },
      type: { type: 'string', enum: ['bar', 'line'] },
      labels: { type: 'array', items: { type: 'string' } },
      datasets: {
        type: 'array',
        items: { type: 'object', properties: { label: { type: 'string' }, values: { type: 'array', items: { type: 'number' } } }, required: ['label', 'values'] },
      },
    },
    required: ['type', 'labels', 'datasets'],
  },
};

function dateRangeToBounds(dateRange) {
  const fmt = (d) => d.toISOString().slice(0, 10);
  const today = new Date();
  const start = new Date(today);
  if (dateRange === 'LAST_7_DAYS') {
    start.setUTCDate(start.getUTCDate() - 7);
    return { from_date: fmt(start), to_date: fmt(today) };
  }
  if (dateRange === 'LAST_30_DAYS') {
    start.setUTCDate(start.getUTCDate() - 30);
    return { from_date: fmt(start), to_date: fmt(today) };
  }
  if (dateRange === 'THIS_MONTH') {
    start.setUTCDate(1);
    return { from_date: fmt(start), to_date: fmt(today) };
  }
  // LAST_MONTH
  const lastMonthEnd = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 0));
  const lastMonthStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, 1));
  return { from_date: fmt(lastMonthStart), to_date: fmt(lastMonthEnd) };
}

const METRICS = [
  'metrics.impressions', 'metrics.clicks', 'metrics.cost_micros', 'metrics.conversions',
  'metrics.conversions_value', 'metrics.cost_per_conversion', 'metrics.ctr', 'metrics.average_cpc',
  'metrics.search_impression_share',
];

function round2(n) { return Math.round(n * 100) / 100; }

function formatRow(row) {
  const m = row.metrics || {};
  const clicks = m.clicks ?? 0;
  const conversions = m.conversions ?? 0;
  const cost = m.cost_micros != null ? round2(m.cost_micros / 1e6) : 0;
  const conversions_value = m.conversions_value != null ? round2(m.conversions_value) : 0;
  return {
    impressions: m.impressions ?? 0,
    clicks,
    cost,
    conversions,
    conversions_value,
    // ROAS/conversion rate computed here rather than trusted from a raw API
    // field, so they're always internally consistent with the other numbers
    // in this same row (and simply absent, not a wrong 0, when undefined).
    roas: cost > 0 ? round2(conversions_value / cost) : null,
    conversion_rate_pct: clicks > 0 ? round2((conversions / clicks) * 100) : null,
    cost_per_conversion: m.cost_per_conversion != null ? round2(m.cost_per_conversion / 1e6) : null,
    ctr_pct: m.ctr != null ? round2(m.ctr * 100) : null,
    avg_cpc: m.average_cpc != null ? round2(m.average_cpc / 1e6) : null,
    // Search-only metric — absent (not zero) for non-Search campaign types.
    search_impression_share_pct: m.search_impression_share != null ? round2(m.search_impression_share * 100) : null,
  };
}

const DEVICE_LABEL = {
  MOBILE: 'мобільні', DESKTOP: 'десктоп', TABLET: 'планшети', CONNECTED_TV: 'Connected TV', OTHER: 'інше',
};
const NETWORK_LABEL = {
  SEARCH: 'Search', SEARCH_PARTNERS: 'Search Partners', CONTENT: 'Display', YOUTUBE_SEARCH: 'YouTube Search',
  YOUTUBE_WATCH: 'YouTube Watch', MIXED: 'Mixed',
};

async function runGoogleAdsReport(customerId, { dateRange, level }) {
  const { from_date, to_date } = dateRangeToBounds(dateRange);
  const client = new GoogleAdsApi({
    client_id: process.env.GOOGLE_ADS_CLIENT_ID,
    client_secret: process.env.GOOGLE_ADS_CLIENT_SECRET,
    developer_token: process.env.GOOGLE_ADS_DEVELOPER_TOKEN || 'unused',
  });
  const customer = client.Customer({
    customer_id: customerId.replace(/-/g, ''),
    login_customer_id: process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID,
    refresh_token: process.env.GOOGLE_ADS_REFRESH_TOKEN,
  });

  if (level === 'campaign') {
    const rows = await customer.report({
      entity: 'campaign',
      attributes: ['campaign.id', 'campaign.name'],
      metrics: METRICS,
      from_date,
      to_date,
    });
    return { period: { from_date, to_date }, campaigns: rows.map((r) => ({ name: r.campaign?.name, ...formatRow(r) })) };
  }

  if (level === 'device') {
    const rows = await customer.report({
      entity: 'customer',
      metrics: METRICS,
      segments: ['segments.device'],
      from_date,
      to_date,
    });
    return {
      period: { from_date, to_date },
      devices: rows.map((r) => ({ device: DEVICE_LABEL[r.segments?.device] || r.segments?.device, ...formatRow(r) })),
    };
  }

  if (level === 'network') {
    const rows = await customer.report({
      entity: 'customer',
      metrics: METRICS,
      segments: ['segments.ad_network_type'],
      from_date,
      to_date,
    });
    return {
      period: { from_date, to_date },
      networks: rows.map((r) => ({ network: NETWORK_LABEL[r.segments?.ad_network_type] || r.segments?.ad_network_type, ...formatRow(r) })),
    };
  }

  if (level === 'keyword') {
    const rows = await customer.report({
      entity: 'keyword_view',
      attributes: ['ad_group_criterion.keyword.text', 'ad_group_criterion.keyword.match_type', 'ad_group_criterion.quality_info.quality_score'],
      metrics: METRICS,
      from_date,
      to_date,
    });
    return {
      period: { from_date, to_date },
      keywords: rows.map((r) => ({
        keyword: r.ad_group_criterion?.keyword?.text,
        match_type: r.ad_group_criterion?.keyword?.match_type,
        quality_score: r.ad_group_criterion?.quality_info?.quality_score ?? null,
        ...formatRow(r),
      })),
    };
  }

  if (level === 'ad') {
    const rows = await customer.report({
      entity: 'ad_group_ad',
      attributes: ['ad_group.name', 'ad_group_ad.ad.id'],
      metrics: METRICS,
      from_date,
      to_date,
    });
    return {
      period: { from_date, to_date },
      ads: rows.map((r) => ({ ad_group: r.ad_group?.name, ad_id: r.ad_group_ad?.ad?.id, ...formatRow(r) })),
    };
  }

  const rows = await customer.report({
    entity: 'customer',
    metrics: METRICS,
    from_date,
    to_date,
  });
  // A `customer` entity report with no segments is always exactly one row.
  const empty = { impressions: 0, clicks: 0, cost: 0, conversions: 0, conversions_value: 0, roas: null, conversion_rate_pct: null, cost_per_conversion: null, ctr_pct: null, avg_cpc: null, search_impression_share_pct: null };
  return { period: { from_date, to_date }, account: rows[0] ? formatRow(rows[0]) : empty };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const authHeader = req.headers.authorization || '';
  const token = authHeader.replace(/^Bearer\s+/i, '');
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

  const { customerId, messages, auditInstructions } = req.body || {};
  if (!customerId || !Array.isArray(messages) || !messages.length) {
    res.status(400).json({ error: 'customerId і messages обовʼязкові' });
    return;
  }

  const missing = ['GOOGLE_ADS_CLIENT_ID', 'GOOGLE_ADS_CLIENT_SECRET', 'GOOGLE_ADS_REFRESH_TOKEN', 'GOOGLE_ADS_LOGIN_CUSTOMER_ID']
    .filter((key) => !process.env[key]);
  if (missing.length) {
    res.status(200).json({ reply: null, configError: true, missing });
    return;
  }
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: 'ANTHROPIC_API_KEY is not configured on the server' });
    return;
  }

  const systemPrompt = `Ти — Ads Insights Analyst, AI-асистент маркетингового агентства Mon'Archi. Ти аналізуєш ефективність Google Ads кабінету клієнта і відповідаєш на питання менеджера природною українською мовою.

Правила:
- Перед тим як відповідати на будь-яке питання про показники, ЗАВЖДИ викликай get_google_ads_report — ніколи не вигадуй і не оцінюй цифри самостійно.
- Відповідай коротко, по суті, конкретними цифрами з відповіді інструменту.
- Витрати вказуй у валюті кабінету без символу (просто число), CTR/conversion_rate_pct/search_impression_share_pct — у відсотках.
- Якщо якесь поле в відповіді інструменту null (наприклад search_impression_share_pct для не-Search кампанії, або roas коли витрат ще нема) — так і скажи, що воно недоступне, не підставляй 0 і не вигадуй причину.
- Якщо треба порівняти два періоди — виклич інструмент двічі (по одному на кожен період) і сам зведи різницю.
- Якщо дані порожні (немає показів/кліків за період) — так і скажи, не вигадуй пояснень.
- Для розбивки по кампаніях/пристроях/ключових словах/оголошеннях/мережах або порівняння періодів — використай present_table замість тексту з рисками. Якщо просять графік/діаграму, або йдеться про тренд/динаміку — використай present_chart. Для одного простого числа (просто "скільки витрачено") таблиця не потрібна, відповідай текстом. І table, і chart будуй лише з цифр, які реально повернув get_google_ads_report у цій розмові — ніколи не вигадуй рядки.`
    + (auditInstructions ? `\n\nФРЕЙМВОРК АУДИТУ — дотримуйся його структури й порядку, виклич get_google_ads_report стільки разів, скільки потрібно для всіх його пунктів:\n${auditInstructions}` : '');

  const anthropicMessages = messages.map((m) => ({ role: m.role, content: m.content }));
  const maxRounds = auditInstructions ? MAX_AUDIT_ROUNDS : MAX_TOOL_ROUNDS;

  try {
    let round = 0;
    while (round < maxRounds) {
      round += 1;
      const upstream = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({
          model: MODEL,
          max_tokens: auditInstructions ? 4000 : 1200,
          system: systemPrompt,
          tools: [REPORT_TOOL, PRESENT_TABLE_TOOL, PRESENT_CHART_TOOL],
          messages: anthropicMessages,
        }),
      });
      if (!upstream.ok) {
        const errText = await upstream.text();
        res.status(upstream.status).json({ error: 'Anthropic API error: ' + errText });
        return;
      }
      const data = await upstream.json();

      if (data.stop_reason !== 'tool_use') {
        const textBlock = (data.content || []).find((b) => b.type === 'text');
        res.status(200).json({ reply: textBlock ? textBlock.text : '' });
        return;
      }

      const toolUseBlocks = data.content.filter((b) => b.type === 'tool_use');

      const presentBlock = toolUseBlocks.find((b) => b.name === 'present_table' || b.name === 'present_chart');
      if (presentBlock) {
        const textBlock = data.content.find((b) => b.type === 'text');
        // `kind` (not `type`) is the table/chart discriminator, deliberately —
        // present_chart's own input already has a `type` field ('bar'/'line'),
        // spreading it after a `type` wrapper key would silently clobber it.
        const visual = { kind: presentBlock.name === 'present_table' ? 'table' : 'chart', ...presentBlock.input };
        res.status(200).json({ reply: textBlock ? textBlock.text : '', visual });
        return;
      }

      anthropicMessages.push({ role: 'assistant', content: data.content });
      const toolResults = [];
      for (const block of toolUseBlocks) {
        try {
          const result = await runGoogleAdsReport(customerId, block.input);
          toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: JSON.stringify(result) });
        } catch (err) {
          toolResults.push({ type: 'tool_result', tool_use_id: block.id, is_error: true, content: 'Google Ads API error: ' + (err?.message || String(err)) });
        }
      }
      anthropicMessages.push({ role: 'user', content: toolResults });
    }
    res.status(200).json({ reply: 'Не вдалося отримати повну відповідь за відведену кількість кроків. Спробуйте уточнити питання.' });
  } catch (err) {
    res.status(502).json({ error: 'Failed to reach Anthropic API: ' + err.message });
  }
}
