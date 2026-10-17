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
import { getModelClient } from './_lib/ai.js';
import { BudgetError, ModelError } from './_lib/modelClient.js';
import { runGoogleAdsReport } from './_lib/googleAdsData.js';

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
      // Through the shared client: retries, usage log, spending limits.
      const { message: data } = await getModelClient(token).callModel({
        agentKey: 'ads-insights-analyst', trigger: 'user', actor: userData.user.email || null,
        params: {
          model: MODEL,
          max_tokens: auditInstructions ? 4000 : 1200,
          system: systemPrompt,
          tools: [REPORT_TOOL, PRESENT_TABLE_TOOL, PRESENT_CHART_TOOL],
          messages: anthropicMessages,
        },
      });

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
    if (err instanceof BudgetError) { res.status(429).json({ error: err.message }); return; }
    res.status(502).json({ error: err instanceof ModelError ? err.message : 'Failed to reach Anthropic API: ' + err.message });
  }
}
