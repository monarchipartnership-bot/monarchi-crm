// Checks that the report engine runs in plain Node (no browser, no Vite) and gives sane results.
// Run:  node scripts/check-core.mjs
// The project AI agent runs this same code on the server, so this is its first safety net:
// if someone adds a browser-only import to the shared modules, this fails at once.
import assert from 'node:assert/strict';
import { makeInternalPost } from '../api/_lib/internalPost.js';
import { buildDeckFromReport } from '../src/lib/presentation/buildDeck.js';
import {
  buildWhatWasDone, comparisonInfo, comparisonPeriod, dueReportPeriod, pullReportData, reportPayload,
} from '../src/lib/reportEngine.js';

import { buildPrompts, nextMonday, parsePosts, scheduleFor, validRequest } from '../api/_lib/smmContent.js';
import { assertPublicUrl, pickPages, readHtml, readSite, robotsAllows } from '../api/_lib/siteReader.js';
import { buildAnalysisPrompts, insightLine, parseAnalysis } from '../api/_lib/competitorAnalysis.js';
import { runSmmWeekly, smmDue } from '../api/_lib/smmRun.js';
import { auditSite, crawlSite, parsePage } from '../api/_lib/seoAudit.js';
import { buildPlanPrompts, parsePlan } from '../api/_lib/seoPlan.js';
import { agentDue, chainStates, dependents } from '../src/lib/agents/chain.js';
import { composeSystem } from '../src/lib/agents/locked.js';
import { ensureSmmTeam } from '../src/lib/agents/smmTeam.js';
import { decideQc, feedbackFor, parseCopy, parseQc, parseStrategy, parseVisual, scheduleStrategy } from '../api/_lib/agentContent.js';
import { approvePlan, launchCampaign, pollAssets, processQueue, runNow } from '../api/_lib/agentEngine.js';
import { analyseSite, authFromEnv, collectSiteStats, serviceAccountFromEnv, siteOverview, windows as siteWindows } from '../api/_lib/googleSiteData.js';
import { generateKeyPairSync } from 'node:crypto';
import { buildMonths, canApprove, clientVisible, monthLabel, monthWeeks, reportActions, reviewPatch } from '../src/lib/projectHistory.js';
import { collectSpeed, parseSpeed, speedFindings, speedKeyFromEnv } from '../api/_lib/pageSpeed.js';
import { analyseLeads, applyExtras, checkUptime, leadSource, leadWindows, siteExtras } from '../api/_lib/siteExtras.js';
import { ancestorsOf } from '../src/lib/agents/chain.js';
import { ensureCampaignTeam, linksFor, participants } from '../src/lib/agents/campaignTeam.js';
import { fetchBlock, summaryOf } from '../api/_lib/campaignRun.js';
import { buildRequest, check as hfCheck, submit as hfSubmit } from '../api/_lib/higgsfield.js';
import { buildTelegramText, handleSiteLead, normalizeLead, runLeadReminders } from '../api/_lib/siteLead.js';
import { botInfo, escapeHtml, peopleFromUpdate, sendMessage as tgSend, webhookSecret } from '../api/_lib/telegram.js';
import { DEFAULT_TEMPLATE, mentionOf, renderMessage, safeTemplate } from '../src/lib/siteLeadMessage.js';
import { buildSnippet } from '../src/lib/siteLeadSnippet.js';
import { campaignKey as gKey, filterCampaigns, flatCampaigns, groupCampaignKeys, groupMatches, mergeCampaigns, scopeToGroup } from '../src/lib/campaignGroups.js';
import { groupCampaigns } from '../src/lib/periodReport.js';
import { accountPlatforms, accountsForTab, collapseStatuses, flatten, pickReportRow, reportScope } from '../src/lib/reportScope.js';
import { groupsForPlatform } from '../src/lib/campaignGroups.js';
import { META_METRICS, META_METRIC_LIST, cleanColumns, countsFor, extractCounts, insightFieldsFor, pickCounts } from '../src/lib/metaColumns.js';
import { GOOGLE_METRIC_LIST, extractGoogleCounts, googleMetricNamesFor, cleanGoogleColumns } from '../src/lib/googleColumns.js';
import { PLATFORM_COLUMNS, cleanColumns as cleanPlatformColumns, missingColumns } from '../src/lib/platformColumns.js';
import { buildReportMessage, reportAction, reportLink } from '../src/lib/projectReportMessage.js';
import { computeMetric, metricOptions, sumBase } from '../src/lib/reportMetrics.js';
import { visibleKeys } from '../src/lib/periodReport.js';

let passed = 0;
const ok = (name, fn) => Promise.resolve(fn()).then(() => { passed += 1; console.log('ok  ', name); });

// A stand-in for the platforms: the same paths the browser calls, tiny fixed answers.
const post = async (path, body) => {
  if (path === '/api/meta-ads-insights') {
    if (body.activities) return { items: [{ actor_name: 'Anna', event_type: 'create_campaign_group', object_name: 'Test RTS', extra_data: '{}' }] };
    if (body.level === 'campaign') return { rows: [{ name: 'Kinky Bang RTS', spend: 120, impressions: 5000, clicks: 200, reach: 4000, purchases: 4, revenue: 480 }] };
    return { rows: [{ spend: 300, impressions: 12000, clicks: 500, reach: 9000, purchases: 9, revenue: 1100 }] };
  }
  if (path === '/api/report-work-summary') return { text: '- Launched the Test RTS campaign.' };
  throw new Error('unexpected call ' + path);
};
const accounts = [{ platform: 'meta', account_id: '123', currency: 'USD', account_name: 'Test' }];

await ok('due weekly period (Thursday 8 Oct 2026 → week 1 of October, 1–4 Oct)', () => {
  const due = dueReportPeriod('weekly', '2026-10-08');
  assert.deepEqual([due.period.start, due.period.end], ['2026-10-01', '2026-10-04']);
  assert.deepEqual(due.picker, { year: 2026, month: 10, weekIndex: 1 });
});
await ok('due weekly period on a month edge (report weeks are clipped to their month: Sun 1 Nov 2026 is its own one-day week)', () => {
  assert.deepEqual([dueReportPeriod('weekly', '2026-11-02').period.start, dueReportPeriod('weekly', '2026-11-02').period.end], ['2026-11-01', '2026-11-01']);
  assert.deepEqual([dueReportPeriod('weekly', '2026-11-09').period.start, dueReportPeriod('weekly', '2026-11-09').period.end], ['2026-11-02', '2026-11-08']);
});
await ok('due monthly period (January → previous December)', () => {
  const due = dueReportPeriod('monthly', '2027-01-05');
  assert.deepEqual([due.period.start, due.period.end], ['2026-12-01', '2026-12-31']);
});
await ok('comparison periods', () => {
  const { picker, period } = dueReportPeriod('weekly', '2026-10-15');
  const cal = comparisonPeriod('weekly', picker, period, { mode: 'calendar' });
  const days = comparisonPeriod('weekly', picker, period, { mode: 'days' });
  assert.equal(comparisonPeriod('weekly', picker, period, null), null);
  assert.equal(days.end, '2026-10-04');
  assert.ok(cal.start < period.start);
  assert.equal(comparisonInfo(period, days).unequal, false);
});

let pulled;
await ok('pull numbers through an injected transport', async () => {
  const { picker, period } = dueReportPeriod('weekly', '2026-10-15');
  const prev = comparisonPeriod('weekly', picker, period, { mode: 'days' });
  pulled = await pullReportData({ accounts, kind: 'ecom', groups: [], period, prev, post });
  assert.equal(pulled.data.platforms.meta.total.spend, 300);
  assert.equal(pulled.data.platforms.meta.campaigns[0].name, 'Kinky Bang RTS');
  assert.ok(pulled.data.previous.platforms.meta);
  assert.deepEqual(pulled.errors, {});
});

let text;
await ok('«What was done» from change history', async () => {
  const { period } = dueReportPeriod('weekly', '2026-10-15');
  const r = await buildWhatWasDone({ source: 'history', periodType: 'weekly', period, accounts, projectName: 'Test', note: '', post });
  assert.equal(r.writer, 'ai');
  assert.ok(r.info.facts.length >= 1);
  text = r.text;
});

await ok('saved payload and deck from it, with the report text split into slides', () => {
  const { picker, period } = dueReportPeriod('weekly', '2026-10-15');
  const prev = comparisonPeriod('weekly', picker, period, { mode: 'days' });
  const payload = reportPayload({ kind: 'ecom', data: pulled.data, compare: { mode: 'days' }, period, prev, sections: { whatWasDone: text + '\n' + '- A long action that needs a few lines of text on the slide. '.repeat(12), conclusion: '', plans: '' } });
  assert.equal(payload.version, 1);
  assert.equal(payload.compare.unequal, false);
  const report = { id: 1, project_id: 3, period_type: 'weekly', period_start: period.start, period_end: period.end, data: payload };
  const deck = buildDeckFromReport({ project: { name: 'Test' }, report, platform: 'meta', style: 'brand-pulse', lang: 'en', custom: [], client: 'Test' });
  assert.ok(deck.slides.length >= 5);
  assert.ok(deck.slides.some((s) => s.type === 'bullets'));
});

await ok('server call adapter: runs a handler in-process with the agent token and keeps the error contract', async () => {
  const seen = [];
  const handlers = {
    '/api/good': async (req, res) => { seen.push(req.headers.authorization); res.status(200).json({ rows: [1] }); },
    '/api/bad': async (req, res) => { res.status(401).json({ error: 'Сесія недійсна' }); },
    '/api/unset': async (req, res) => { res.status(200).json({ configError: true, missing: ['META_ACCESS_TOKEN'] }); },
  };
  const agentPost = makeInternalPost('tok123', handlers);
  assert.deepEqual(await agentPost('/api/good', {}), { rows: [1] });
  assert.equal(seen[0], 'Bearer tok123');
  await assert.rejects(() => agentPost('/api/bad', {}), /Сесія недійсна/);
  await assert.rejects(() => agentPost('/api/unset', {}), /META_ACCESS_TOKEN/);
  await assert.rejects(() => agentPost('/api/nope', {}), /Невідомий/);
});

// ---- The shared model client: retries, cost, limits, usage log (stub SDK and stub database, no network)
const { createModelClient, BudgetError, ModelError, windowStart } = await import('../api/_lib/modelClient.js');
const { costUsd, worstCaseUsd } = await import('../api/_lib/aiPricing.js');

const reply = (text, usage = { input_tokens: 1000, output_tokens: 500 }, extra = {}) => ({ content: text ? [{ type: 'text', text }] : [{ type: 'thinking', thinking: '' }], stop_reason: 'end_turn', usage, ...extra });
const apiError = (status, headers = {}) => Object.assign(new Error('boom ' + status), { status, headers });
function harness({ script, limits = [], spent = 0, recordFails = false }) {
  const rows = [];
  const waits = [];
  const queue = [...script];
  const client = createModelClient({
    getSdk: () => ({ messages: { create: async () => { const next = queue.shift(); if (next instanceof Error) throw next; return next; } } }),
    store: {
      recordCall: async (r) => { if (recordFails) throw new Error('db down'); rows.push(r); },
      limits: async () => limits,
      spentSince: async () => spent,
    },
    sleep: async (ms) => { waits.push(ms); },
    random: () => 0,
  });
  return { client, rows, waits, calls: () => script.length - queue.length };
}
const P = { model: 'claude-sonnet-5', max_tokens: 1500, system: 'x', messages: [{ role: 'user', content: 'hi' }] };

await ok('model client: cost of a call is computed from the exact usage', async () => {
  assert.equal(costUsd('claude-sonnet-5', { input_tokens: 1000, output_tokens: 500 }), 0.007);
  assert.equal(costUsd('claude-sonnet-5', { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 1e6 }), 0.2);
  assert.ok(costUsd('some-new-model', { output_tokens: 1e6 }) >= 50, 'an unknown model is priced like the most expensive one');
  const h = harness({ script: [reply('- done')] });
  const r = await h.client.callModel({ agentKey: 'a', params: P });
  assert.equal(r.text, '- done');
  assert.equal(r.costUsd, 0.007);
  assert.equal(h.rows.length, 1);
  assert.equal(h.rows[0].status, 'ok');
  assert.equal(h.rows[0].output_tokens, 500);
});
await ok('model client: retries overload and honours retry-after, counts the retries', async () => {
  const h = harness({ script: [apiError(529), apiError(429, { 'retry-after': '3' }), reply('ok')] });
  const r = await h.client.callModel({ agentKey: 'a', params: P });
  assert.equal(r.retries, 2);
  assert.deepEqual(h.waits, [1800, 3000]);
  assert.equal(h.rows[0].retries, 2);
});
await ok('model client: gives up after the attempts, with a reason, and logs the failure', async () => {
  const h = harness({ script: [apiError(529), apiError(529), apiError(529), apiError(529)] });
  await assert.rejects(() => h.client.callModel({ agentKey: 'a', params: P }), (e) => e instanceof ModelError && e.reason === 'overloaded' && e.attempts === 4);
  assert.equal(h.rows[0].status, 'error');
  assert.equal(h.rows[0].retries, 3);
});
await ok('model client: a rejected request (400) is not retried', async () => {
  const h = harness({ script: [apiError(400), reply('never')] });
  await assert.rejects(() => h.client.callModel({ agentKey: 'a', params: P }), (e) => e.reason === 'rejected');
  assert.equal(h.calls(), 1);
});
await ok('model client: an answer with no text is an error that says why (the thinking-ate-the-tokens case)', async () => {
  const h = harness({ script: [reply('', { input_tokens: 10, output_tokens: 1500 }, { stop_reason: 'max_tokens' })] });
  await assert.rejects(() => h.client.callModel({ agentKey: 'a', params: P }), (e) => e.reason === 'empty' && /max_tokens/.test(e.message) && /thinking/.test(e.message));
  assert.equal(h.rows[0].status, 'empty');
});
await ok('model client: refuses a call that could exceed the per-call cap, before sending it', async () => {
  const h = harness({ script: [reply('never')] });
  const big = { ...P, model: 'claude-fable-5-1', max_tokens: 100000 };
  assert.ok(worstCaseUsd(big.model, big) > 0.5);
  await assert.rejects(() => h.client.callModel({ agentKey: 'a', params: big }), (e) => e instanceof BudgetError && e.kind === 'call');
  assert.equal(h.calls(), 0);
  assert.equal(h.rows[0].status, 'budget_stopped');
});
await ok('model client: stops when the day or month budget is used up; other agents’ limits do not apply', async () => {
  const h = harness({ script: [reply('never')], limits: [{ scope: 'global', period: 'day', limit_usd: 1 }], spent: 1.5 });
  await assert.rejects(() => h.client.callModel({ agentKey: 'a', params: P }), (e) => e instanceof BudgetError && e.kind === 'day');
  assert.equal(h.calls(), 0);
  const other = harness({ script: [reply('fine')], limits: [{ scope: 'agent:someone-else', period: 'month', limit_usd: 1 }], spent: 5 });
  assert.equal((await other.client.callModel({ agentKey: 'a', params: P })).text, 'fine');
});
await ok('model client: a failing usage log never breaks the call', async () => {
  const h = harness({ script: [reply('still works')], recordFails: true });
  assert.equal((await h.client.callModel({ agentKey: 'a', params: P })).text, 'still works');
});
await ok('budget windows start at midnight Kyiv time (summer UTC+3, winter UTC+2)', () => {
  assert.equal(windowStart('day', new Date('2026-07-15T10:00:00Z')), '2026-07-14T21:00:00.000Z');
  assert.equal(windowStart('month', new Date('2026-12-20T10:00:00Z')), '2026-11-30T22:00:00.000Z');
});

const { isCronRequest, signInAgent } = await import('../api/_lib/agentSession.js');
await ok('cron requests: only the exact secret passes; a missing or short secret never does', () => {
  const req = (auth) => ({ headers: { authorization: auth } });
  const secret = 'a-long-enough-secret-123';
  assert.equal(isCronRequest(req('Bearer ' + secret), secret), true);
  assert.equal(isCronRequest(req('Bearer wrong-secret-of-same-len'), secret), false);
  assert.equal(isCronRequest(req(undefined), secret), false);
  assert.equal(isCronRequest(req('Bearer undefined'), undefined), false);
  assert.equal(isCronRequest(req('Bearer short'), 'short'), false);
});
await ok('agent sign-in: returns a token, explains a missing setup, and reports a failed sign-in', async () => {
  const good = { auth: { signInWithPassword: async () => ({ data: { session: { access_token: 'tok' } }, error: null }) } };
  assert.deepEqual(await signInAgent({ email: 'agent@x.y', password: 'p', makeClient: () => good }), { accessToken: 'tok', email: 'agent@x.y' });
  await assert.rejects(() => signInAgent({ email: '', password: '' }), /AGENT_EMAIL/);
  const bad = { auth: { signInWithPassword: async () => ({ data: {}, error: { message: 'Invalid login credentials' } }) } };
  await assert.rejects(() => signInAgent({ email: 'a@b.c', password: 'p', makeClient: () => bad }), /Invalid login/);
});

// ---- The project agent's run (in-memory database, stub platforms)
const { runProjectReport } = await import('../api/_lib/projectAgentRun.js');
const { describeDynamics } = await import('../src/lib/reportDynamics.js');

function fakeRepo({ recentNotice = false, agent = { enabled: true, config: { platforms: [], deck: { style: 'brand-pulse', lang: 'en' } } }, existingReport = null, existingByScope = null, locked = true, existingDeck = null, projectAccounts = accounts, columnsPicked = {} } = {}) {
  const log = { runs: [], events: [], reports: [], decks: [], health: [], unlocked: 0, notifications: [] };
  return {
    log,
    startRun: async (r) => { const run = { id: 1, started_at: '2026-10-09T00:00:00Z', ...r }; log.runs.push(run); return run; },
    finishRun: async (id, patch) => { log.runs[0] = { ...log.runs[0], ...patch }; },
    costSince: async () => 0.004,
    getAgent: async () => agent,
    addNotifications: async (rows) => { log.notifications.push(...rows); },
    hasRecentNotification: async () => recentNotice,
    tryLock: async () => locked,
    unlock: async () => { log.unlocked += 1; },
    setAgentHealth: async (id, patch) => { log.health.push(patch); },
    addEvent: async (e) => { log.events.push(e); },
    getProject: async () => ({ id: 3, name: 'Mellowdiamond', business_type: null }),
    getAccounts: async () => projectAccounts,
    getGroups: async () => [],
    getCustomMetrics: async () => [],
    getColumns: async () => columnsPicked,
    getReport: async (projectId, periodType, start, scope) => (existingByScope ? existingByScope[scope] || null : existingReport),
    getReports: async () => [],
    saveReport: async ({ projectId, periodType, period, platform = 'all', source, status, data }) => { const row = { id: 10 + log.reports.length + 1, project_id: projectId, period_type: periodType, period_start: period.start, period_end: period.end, platform, source, status, data }; log.reports.push(row); return row; },
    getDeck: async () => existingDeck,
    saveDeck: async (d) => { log.decks.push(d); return { id: 21 + log.decks.length }; },
  };
}

// ---- Reports split by ad platform: Meta, Google, ... and «Разом»
const GOOGLE = { platform: 'google', account_id: 'g1', currency: 'USD', account_name: 'Test G' };
const postBoth = async (path, body) => {
  if (path === '/api/google-ads-accounts') {
    if (body.action === 'insights' && body.level === 'campaign') return { campaigns: [{ name: 'Brand Search', spend: 80, impressions: 4000, clicks: 160, conversions: 3, revenue: 300 }] };
    if (body.action === 'insights') return { row: { spend: 200, impressions: 9000, clicks: 400, conversions: 7, revenue: 700 } };
    return { items: [] };
  }
  return post(path, body);
};

await ok('report scope: tabs map to accounts and to where the saved reports live', () => {
  const both = [{ platform: 'meta' }, { platform: 'google' }, { platform: 'meta' }];
  assert.deepEqual(accountPlatforms(both), ['meta', 'google']);
  assert.deepEqual(accountsForTab(both, 'google'), [{ platform: 'google' }]);
  assert.equal(accountsForTab(both, 'total').length, 3);
  assert.equal(reportScope('meta', both), 'meta');
  assert.equal(reportScope('total', both), 'all');
  assert.equal(reportScope('total', [{ platform: 'meta' }]), 'meta'); // one platform: «Разом» is that platform's own report
});
await ok('report scope: a presentation takes the platform\'s own report, else a combined one that has it', () => {
  const rows = [
    { id: 1, period_start: '2026-10-01', platform: 'all', data: { platforms: { meta: {}, google: {} } } },
    { id: 2, period_start: '2026-10-01', platform: 'meta', data: { platforms: { meta: {} } } },
  ];
  assert.equal(pickReportRow(rows, '2026-10-01', 'meta').id, 2);
  assert.equal(pickReportRow(rows, '2026-10-01', 'google').id, 1);
  assert.equal(pickReportRow(rows, '2026-10-08', 'meta'), null);
  assert.equal(pickReportRow(rows, '2026-10-01', 'tiktok'), null);
});
await ok('report scope: dashboards count a platform once (own report beats «Разом») and a project by its least finished report', () => {
  const rows = [
    { project_id: 3, period_start: '2026-10-01', platform: 'all', data: { platforms: { meta: { total: { spend: 999 } }, google: { total: { spend: 50 } } } } },
    { project_id: 3, period_start: '2026-10-01', platform: 'meta', data: { platforms: { meta: { total: { spend: 100 } } } } },
  ];
  const flat = flatten(rows, () => ({}));
  assert.equal(flat.filter((r) => r.platform === 'meta').length, 1);
  assert.equal(flat.find((r) => r.platform === 'meta').data.spend, 100);
  assert.equal(flat.find((r) => r.platform === 'google').data.spend, 50);
  const one = collapseStatuses([{ project_id: 3, status: 'final' }, { project_id: 3, status: 'draft' }, { project_id: 4, status: 'reviewed' }]);
  assert.equal(one.find((r) => r.project_id === 3).status, 'draft');
  assert.equal(one.length, 2);
});
await ok('campaign groups: a group lives in one platform tab, none in «Разом»; an old group (no platform) shows everywhere', () => {
  const groups = [{ id: 1, name: 'M', platform: 'meta', campaigns: ['meta|A'] }, { id: 2, name: 'G', platform: 'google', campaigns: ['google|B'] }, { id: 3, name: 'Old', keywords: ['x'] }];
  assert.deepEqual(groupsForPlatform(groups, 'meta').map((g) => g.id), [1, 3]);
  assert.deepEqual(groupsForPlatform(groups, 'google').map((g) => g.id), [2, 3]);
  assert.deepEqual(groupsForPlatform(groups, 'total'), []);
  // a Meta group never bundles Google campaigns, even when its old keyword matches
  const kw = [{ id: 9, name: 'Catalog', platform: 'meta', keywords: ['catalog'] }];
  assert.equal(groupCampaigns([{ name: 'Catalog Search', spend: 5 }], kw, 'google').length, 0);
  assert.equal(groupCampaigns([{ name: 'Catalog Search', spend: 5 }], kw, 'meta')[0].name, 'Catalog');
});
await ok('agent run (two platforms): one draft report and deck per platform plus «Разом»', async () => {
  const repo = fakeRepo({ projectAccounts: [accounts[0], GOOGLE] });
  const r = await runProjectReport({ repo, post: postBoth, projectId: 3, periodType: 'weekly', trigger: 'manual', startedBy: 'me@x.y', today: '2026-10-15' });
  assert.equal(r.status, 'ok');
  assert.deepEqual(repo.log.reports.map((x) => x.platform), ['meta', 'google', 'all']);
  assert.deepEqual(Object.keys(repo.log.reports[0].data.platforms), ['meta']);
  assert.deepEqual(Object.keys(repo.log.reports[1].data.platforms), ['google']);
  assert.deepEqual(Object.keys(repo.log.reports[2].data.platforms), ['meta', 'google']);
  assert.match(repo.log.reports[0].data.sections.conclusion, /^Meta Ads: /);
  assert.match(repo.log.reports[1].data.sections.conclusion, /^Google Ads: /);
  assert.deepEqual(repo.log.decks.map((d) => d.platform), ['meta', 'google']);
  assert.ok(repo.log.reports.every((x) => x.source === 'agent' && x.status === 'draft'));
});
await ok('agent run (two platforms): a scope a person already made is left alone, the others are still made', async () => {
  const repo = fakeRepo({ projectAccounts: [accounts[0], GOOGLE], existingByScope: { google: { id: 5, source: 'manual', status: 'draft' } } });
  const r = await runProjectReport({ repo, post: postBoth, projectId: 3, periodType: 'weekly', today: '2026-10-15' });
  assert.equal(r.status, 'ok');
  assert.deepEqual(repo.log.reports.map((x) => x.platform), ['meta', 'all']);
  assert.ok(r.notes.some((n) => /Google Ads: звіт створений вручну/.test(n)));
  assert.deepEqual(repo.log.decks.map((d) => d.platform), ['meta']);
  const all = fakeRepo({ projectAccounts: [accounts[0], GOOGLE], existingByScope: { meta: { id: 1, source: 'manual', status: 'draft' }, google: { id: 2, source: 'manual', status: 'draft' }, all: { id: 3, source: 'manual', status: 'draft' } } });
  assert.equal((await runProjectReport({ repo: all, post: postBoth, projectId: 3, periodType: 'weekly', today: '2026-10-15' })).status, 'skipped');
  assert.equal(all.log.reports.length, 0);
});

// ---- Extra Meta columns («Стовпці»)
await ok('meta columns: a picked metric asks Meta only for what it needs and reads counts from fields and action lists', () => {
  assert.deepEqual(cleanColumns('meta', ['mx_add_to_cart', 'bogus', 'mx_add_to_cart']), ['mx_add_to_cart']);
  assert.deepEqual(cleanColumns('google', ['mx_add_to_cart']), []);
  assert.deepEqual(insightFieldsFor(['mx_add_to_cart']), []); // actions are always asked for
  assert.deepEqual(insightFieldsFor(['mx_cost_link_click', 'mx_hold_rate']).sort(), ['inline_link_clicks', 'video_thruplay_watched_actions']);
  assert.deepEqual(countsFor(['mx_hold_rate']).sort(), ['thruplay', 'video_3s']);
  const row = { actions: [{ action_type: 'omni_add_to_cart', value: '7' }, { action_type: 'add_to_cart', value: '7' }, { action_type: 'video_view', value: '300' }], inline_link_clicks: '120', video_thruplay_watched_actions: [{ action_type: 'video_view', value: '90' }] };
  assert.deepEqual(extractCounts(row, ['mx_add_to_cart', 'mx_link_clicks', 'mx_hold_rate']), { x_add_to_cart: 7, x_link_clicks: 120, x_thruplay: 90, x_video_3s: 300 });
  assert.deepEqual(extractCounts(row, []), {});
  assert.deepEqual(pickCounts({ spend: 1, x_add_to_cart: 7, x_gone: null }), { x_add_to_cart: 7 });
});
await ok('meta columns: counts add up across campaigns, ratios are computed from the sums, a never-fetched column is — not 0', () => {
  const total = sumBase([{ spend: 100, impressions: 10000, reach: 5000, clicks: 200, x_add_to_cart: 4, x_link_clicks: 150 }, { spend: 50, impressions: 5000, reach: 2500, clicks: 100, x_add_to_cart: 1, x_link_clicks: 50 }]);
  assert.equal(total.x_add_to_cart, 5);
  assert.equal(computeMetric('mx_cost_add_to_cart', total), 30);
  assert.equal(computeMetric('mx_link_ctr', total), (200 / 15000) * 100);
  assert.equal(computeMetric('mx_frequency', total), 2);
  const plain = sumBase([{ spend: 10, impressions: 100, reach: 50, clicks: 5 }]);
  assert.equal(computeMetric('mx_cost_add_to_cart', plain), null);
  assert.equal(computeMetric('mx_link_ctr', plain), null);
  assert.equal(computeMetric('mx_add_to_cart', plain), null);
  assert.equal(computeMetric('mx_cost_add_to_cart', { spend: 10, x_add_to_cart: 0 }), null); // no divide by zero
  assert.equal(computeMetric('mx_cart_to_purchase', { purchases: 2, x_add_to_cart: 8 }), 25);
});
await ok('meta columns: only picked columns are shown, and only they can be used in a formula', () => {
  assert.ok(!visibleKeys(['spend'], [], []).includes('mx_add_to_cart'));
  assert.deepEqual(visibleKeys(['spend'], [{ key: 'custom_x' }], ['mx_add_to_cart']), ['spend', 'mx_add_to_cart', 'custom_x']);
  assert.ok(!metricOptions([]).some((o) => o.key.startsWith('mx_')));
  assert.ok(metricOptions([], ['mx_add_to_cart']).some((o) => o.key === 'mx_add_to_cart'));
  assert.ok(META_METRIC_LIST.every((m) => META_METRICS[m.key] === m && m.label && m.en && ['number', 'money', 'percent', 'ratio'].includes(m.format)));
  assert.equal(new Set(META_METRIC_LIST.map((m) => m.key)).size, META_METRIC_LIST.length);
});
await ok('agent run: the extra columns picked for the project are asked of the platform', async () => {
  const seen = [];
  const spy = async (path, body) => { if (path === '/api/meta-ads-insights' && body.level) seen.push(body.columns); return post(path, body); };
  const repo = fakeRepo({ columnsPicked: { meta: ['mx_add_to_cart'] } });
  await runProjectReport({ repo, post: spy, projectId: 3, periodType: 'weekly', today: '2026-10-15' });
  assert.ok(seen.length >= 2 && seen.every((c) => c?.[0] === 'mx_add_to_cart'));
});

// ---- Extra Google Ads columns
await ok('google columns: only picked metrics are asked of Google; counts come from one campaign row; shares become additive impressions', () => {
  assert.deepEqual(cleanGoogleColumns(['mx_g_interactions', 'mx_add_to_cart', 'x']), ['mx_g_interactions']);
  assert.deepEqual(cleanPlatformColumns('google', ['mx_g_interactions', 'mx_add_to_cart']), ['mx_g_interactions']);
  assert.deepEqual(cleanPlatformColumns('meta', ['mx_g_interactions', 'mx_add_to_cart']), ['mx_add_to_cart']);
  assert.deepEqual(cleanPlatformColumns('tiktok', ['mx_add_to_cart']), []);
  assert.deepEqual(googleMetricNamesFor(['mx_g_interactions']), ['metrics.interactions']);
  assert.deepEqual(googleMetricNamesFor([]), []);
  const names = googleMetricNamesFor(['mx_g_lost_budget_is']);
  assert.ok(names.includes('metrics.search_budget_lost_impression_share') && names.includes('metrics.search_impression_share') && names.includes('metrics.impressions'));
  const m = { impressions: 800, interactions: 40, search_impression_share: 0.5, search_budget_lost_impression_share: 0.3, search_rank_lost_impression_share: 0.2 };
  const c = extractGoogleCounts(m, ['mx_g_search_is', 'mx_g_lost_budget_is', 'mx_g_interactions']);
  assert.deepEqual(c, { x_g_search_impr: 800, x_g_search_eligible: 1600, x_g_lost_budget: 480, x_g_interactions: 40 });
  // a campaign with no share (display, video) adds nothing to the share, never a zero share
  assert.deepEqual(extractGoogleCounts({ impressions: 5000 }, ['mx_g_search_is']), { x_g_search_impr: 0, x_g_search_eligible: 0 });
});
await ok('google columns: campaigns add up to the account share correctly and a never-fetched column is —', () => {
  const a = extractGoogleCounts({ impressions: 800, search_impression_share: 0.5, search_budget_lost_impression_share: 0.3 }, ['mx_g_search_is', 'mx_g_lost_budget_is']);
  const b = extractGoogleCounts({ impressions: 200, search_impression_share: 1, search_budget_lost_impression_share: 0 }, ['mx_g_search_is', 'mx_g_lost_budget_is']);
  const display = extractGoogleCounts({ impressions: 9000 }, ['mx_g_search_is', 'mx_g_lost_budget_is']);
  const total = sumBase([{ spend: 100, impressions: 800, clicks: 40, ...a }, { spend: 50, impressions: 200, clicks: 10, ...b }, { spend: 10, impressions: 9000, clicks: 5, ...display }]);
  assert.equal(computeMetric('mx_g_search_is', total), (1000 / 1800) * 100); // impressions of search campaigns / what they could have had
  assert.equal(computeMetric('mx_g_lost_budget_is', total), (480 / 1800) * 100);
  // a top share is weighted by its own denominator: a single campaign gives back exactly its own share
  const topOne = extractGoogleCounts({ impressions: 1000, top_impression_percentage: 0.6, search_impression_share: 0.5, search_top_impression_share: 0.75 }, ['mx_g_search_top_is']);
  assert.equal(computeMetric('mx_g_search_top_is', topOne), 75);
  assert.equal(computeMetric('mx_g_search_top_is', sumBase([topOne, extractGoogleCounts({ impressions: 9000 }, ['mx_g_search_top_is'])])), 75); // a campaign with no share changes nothing
  assert.equal(computeMetric('mx_g_search_is', { impressions: 5 }), null);
  assert.equal(computeMetric('mx_g_conv_rate', { purchases: 0, leads: 6, clicks: 200 }), 3);
  assert.equal(computeMetric('mx_cost_g_interaction', { spend: 90, x_g_interactions: 30 }), 3);
  assert.ok(computeMetric('mx_g_view_rate', { impressions: 1000, x_g_video_views: 250 }) === 25);
});
await ok('google columns: the catalog is consistent and every platform column has a label, a format and the counts it needs', () => {
  assert.ok(GOOGLE_METRIC_LIST.length >= 20);
  assert.equal(new Set(GOOGLE_METRIC_LIST.map((m) => m.key)).size, GOOGLE_METRIC_LIST.length);
  assert.ok(Object.values(PLATFORM_COLUMNS).flat().every((m) => m.label && m.en && m.group && ['number', 'money', 'percent', 'ratio'].includes(m.format)));
  assert.ok(META_METRIC_LIST.every((m) => !GOOGLE_METRIC_LIST.some((g) => g.key === m.key))); // no key shared between platforms
  assert.ok(GOOGLE_METRIC_LIST.filter((m) => m.needs.length).every((m) => googleMetricNamesFor([m.key]).length > 0));
});

// ---- The assistant keeps the picked columns
await ok('assistant: picked columns are asked of the platform at every run, so a change is picked up at the next run and never dropped', async () => {
  const seen = [];
  const spy = async (path, body) => { if (path === '/api/meta-ads-insights' && body.level) seen.push((body.columns || []).join(',')); return post(path, body); };
  await runProjectReport({ repo: fakeRepo({ columnsPicked: { meta: ['mx_add_to_cart'] } }), post: spy, projectId: 3, periodType: 'weekly', today: '2026-10-15' });
  await runProjectReport({ repo: fakeRepo({ columnsPicked: { meta: ['mx_add_to_cart', 'mx_link_clicks'] } }), post: spy, projectId: 3, periodType: 'weekly', today: '2026-10-15' });
  await runProjectReport({ repo: fakeRepo({ columnsPicked: {} }), post: spy, projectId: 3, periodType: 'weekly', today: '2026-10-15' });
  assert.ok(seen.slice(0, 4).every((c) => c === 'mx_add_to_cart'));
  assert.ok(seen.slice(4, 8).every((c) => c === 'mx_add_to_cart,mx_link_clicks'));
  assert.ok(seen.slice(8).every((c) => c === '')); // removed in the CRM → gone from the next run
});
await ok('assistant: the presentation it makes carries the picked columns and formulas', async () => {
  const repo = fakeRepo({ columnsPicked: { meta: ['mx_add_to_cart', 'mx_cost_add_to_cart'] } });
  await runProjectReport({ repo, post, projectId: 3, periodType: 'weekly', today: '2026-10-15' });
  const text = JSON.stringify(repo.log.decks[0].deck.slides);
  assert.ok(text.includes('Adds to cart') && text.includes('Cost per add to cart'));
  const plain = fakeRepo();
  await runProjectReport({ repo: plain, post, projectId: 3, periodType: 'weekly', today: '2026-10-15' });
  assert.ok(!JSON.stringify(plain.log.decks[0].deck.slides).includes('Adds to cart'));
  const report = { id: 1, project_id: 3, period_type: 'weekly', period_start: '2026-10-05', period_end: '2026-10-11', data: { kind: 'ecom', platforms: { meta: { currency: 'USD', total: { spend: 100, impressions: 1000, clicks: 10, reach: 800, purchases: 2, revenue: 300, x_add_to_cart: 5 }, campaigns: [], groups: [] } }, previous: null, sections: {} } };
  const withExtra = JSON.stringify(buildDeckFromReport({ project: { name: 'P' }, report, platform: 'meta', extraKeys: ['mx_cost_add_to_cart'] }).slides);
  assert.ok(withExtra.includes('Cost per add to cart'));
});
await ok('assistant: a report made before a column was picked says which columns have no numbers yet', () => {
  assert.deepEqual(missingColumns('meta', ['mx_add_to_cart', 'mx_frequency'], { spend: 1 }), ['mx_add_to_cart']); // a ratio of standard numbers is never missing
  assert.deepEqual(missingColumns('meta', ['mx_add_to_cart'], { x_add_to_cart: 0 }), []); // zero is a number
  assert.deepEqual(missingColumns('google', ['mx_g_search_is'], { x_g_search_impr: 1 }), ['mx_g_search_is']); // needs both counts
});

// ---- The report goes to a Telegram chat
await ok('report message: project, date, type, status, action and the open button; nothing from outside is markup', () => {
  const m = buildReportMessage({ projectName: 'A & <b>B</b>', period: { start: '2026-10-12', end: '2026-10-18' }, periodType: 'weekly', status: 'draft', action: reportAction(['«Plans»']), links: [{ label: 'Meta Ads', url: 'https://x.y/p' }] });
  assert.match(m.text, /<b>Проєкт:<\/b> A &amp; &lt;b&gt;B&lt;\/b&gt;/);
  assert.match(m.text, /<b>Дата:<\/b> 12\.10\.2026 – 18\.10\.2026/);
  assert.match(m.text, /<b>Тип звіту:<\/b> Тижневий/);
  assert.match(m.text, /<b>Статус:<\/b> Чернетка/);
  assert.match(m.text, /<b>Потрібна дія:<\/b> Перевірити цифри, заповнити «Plans», /);
  assert.deepEqual(m.buttons, [{ text: 'Відкрити звіт', url: 'https://x.y/p' }]); // one report: a plain button
  const many = buildReportMessage({ projectName: 'P', period: { start: '2026-10-01', end: '2026-10-31' }, periodType: 'monthly', links: [{ label: 'Meta Ads', url: 'u1' }, { label: 'Разом', url: 'u2' }] });
  assert.deepEqual(many.buttons.map((b) => b.text), ['Meta Ads', 'Разом']);
  assert.match(many.text, /Місячний/);
  assert.equal(reportLink('https://crm.x/', 3, 'weekly', 'all'), 'https://crm.x/projects/3?tab=weekly&platform=total');
  assert.equal(reportLink('https://crm.x', 3, 'monthly', 'google'), 'https://crm.x/projects/3?tab=monthly&platform=google');
  assert.match(buildReportMessage({ projectName: 'P', periodType: 'weekly', links: [] }).text, /Дата:<\/b> —/);
});
await ok('telegram: several link buttons go in one row', async () => {
  let body = null;
  const fetchFn = async (url, init) => { body = JSON.parse(init.body); return { ok: true, json: async () => ({ ok: true, result: {} }) }; };
  await tgSend({ chatId: '-1', text: 't', buttons: [{ text: 'A', url: 'https://a' }, { text: 'B', url: 'https://b' }] }, { env: { TELEGRAM_BOT_TOKEN: 'tok' }, fetchFn });
  assert.deepEqual(body.reply_markup.inline_keyboard, [[{ text: 'A', url: 'https://a' }, { text: 'B', url: 'https://b' }]]);
  await tgSend({ chatId: '-1', text: 't', url: 'https://c' }, { env: { TELEGRAM_BOT_TOKEN: 'tok' }, fetchFn });
  assert.equal(body.reply_markup.inline_keyboard[0][0].url, 'https://c'); // the old single button still works
});
await ok('agent run: the chosen chat gets one message with a button per report; off, no bot or a failed send never spoil the run', async () => {
  const tg = (chatId = '-100') => ({ enabled: true, config: { platforms: [], deck: { style: 'brand-pulse', lang: 'en' }, telegram: { enabled: true, chatId } } });
  const sent = [];
  const telegram = { send: async (m) => { sent.push(m); return { ok: true }; } };
  const two = fakeRepo({ agent: tg(), projectAccounts: [accounts[0], GOOGLE] });
  const r = await runProjectReport({ repo: two, post: postBoth, projectId: 3, periodType: 'weekly', today: '2026-10-15', telegram, crmUrl: 'https://crm.test' });
  assert.equal(r.status, 'ok');
  assert.equal(sent.length, 1); // one message for the run, not one per report
  assert.equal(sent[0].chatId, '-100');
  assert.match(sent[0].text, /Проєкт:<\/b> Mellowdiamond/);
  assert.match(sent[0].text, /Тип звіту:<\/b> Тижневий/);
  assert.deepEqual(sent[0].buttons.map((b) => b.text), ['Meta Ads', 'Google Ads', 'Разом']);
  assert.equal(sent[0].buttons[0].url, 'https://crm.test/projects/3?tab=weekly&platform=meta');
  assert.equal(sent[0].buttons[2].url, 'https://crm.test/projects/3?tab=weekly&platform=total');
  assert.ok(two.log.events.some((e) => e.kind === 'telegram_sent'));
  // one platform: a plain «Відкрити звіт»
  sent.length = 0;
  await runProjectReport({ repo: fakeRepo({ agent: tg() }), post, projectId: 3, periodType: 'monthly', today: '2026-10-15', telegram });
  assert.deepEqual(sent[0].buttons.map((b) => b.text), ['Відкрити звіт']);
  // switched off, or no chat chosen: nothing is sent
  sent.length = 0;
  await runProjectReport({ repo: fakeRepo(), post, projectId: 3, periodType: 'weekly', today: '2026-10-15', telegram });
  await runProjectReport({ repo: fakeRepo({ agent: tg('') }), post, projectId: 3, periodType: 'weekly', today: '2026-10-15', telegram });
  assert.equal(sent.length, 0);
  // the bot is not set up / Telegram refuses: the report is still made, and the run says so
  const noBot = await runProjectReport({ repo: fakeRepo({ agent: tg() }), post, projectId: 3, periodType: 'weekly', today: '2026-10-15', telegram: null });
  assert.equal(noBot.status, 'ok');
  assert.ok(noBot.notes.some((n) => /Telegram: бота не налаштовано/.test(n)));
  const refused = fakeRepo({ agent: tg() });
  const bad = await runProjectReport({ repo: refused, post, projectId: 3, periodType: 'weekly', today: '2026-10-15', telegram: { send: async () => ({ ok: false, error: 'chat not found' }) } });
  assert.equal(bad.status, 'ok');
  assert.equal(refused.log.reports.length, 1);
  assert.ok(bad.notes.some((n) => /chat not found/.test(n)));
  assert.ok(refused.log.events.some((e) => e.kind === 'telegram_failed' && e.status === 'problem'));
});

// ---- Telegram topics
await ok('telegram topics: a message in a topic tells the bot the topic; a message goes into the chosen topic only', async () => {
  const inTopic = peopleFromUpdate({ message: { message_id: 50, message_thread_id: 7, is_topic_message: true, chat: { id: -100, title: 'G', type: 'supergroup', is_forum: true }, from: { id: 5, first_name: 'A' }, text: '/start@bot', reply_to_message: { message_id: 7, forum_topic_created: { name: 'Нові клієнти' } } } });
  assert.deepEqual(inTopic.topic, { chat_id: '-100', thread_id: 7, name: 'Нові клієнти' });
  assert.deepEqual(peopleFromUpdate({ message: { message_id: 9, message_thread_id: 9, is_topic_message: true, chat: { id: -100, title: 'G', type: 'supergroup', is_forum: true }, from: { id: 5, first_name: 'A' }, text: 'x' } }).topic, { chat_id: '-100', thread_id: 9, name: null }); // title unknown: the id is still learned
  assert.deepEqual(peopleFromUpdate({ message: { message_id: 12, forum_topic_created: { name: 'Звіти' }, chat: { id: -100, title: 'G', type: 'supergroup', is_forum: true } } }).topic, { chat_id: '-100', thread_id: 12, name: 'Звіти' }); // the service message that creates a topic
  assert.equal(peopleFromUpdate({ message: { message_id: 3, chat: { id: -100, title: 'G', type: 'supergroup', is_forum: true }, from: { id: 5, first_name: 'A' }, text: 'x' } }).topic, null); // General has no id
  assert.equal(peopleFromUpdate({ message: { message_id: 3, message_thread_id: 2, chat: { id: -200, title: 'Plain', type: 'supergroup' }, from: { id: 5, first_name: 'A' }, text: 'reply' } }).topic, null); // a reply thread of a normal group is not a topic
  let body = null;
  const fetchFn = async (url, init) => { body = JSON.parse(init.body); return { ok: true, json: async () => ({ ok: true, result: {} }) }; };
  await tgSend({ chatId: '-100', text: 't', threadId: '7' }, { env: { TELEGRAM_BOT_TOKEN: 'tok' }, fetchFn });
  assert.equal(body.message_thread_id, 7);
  await tgSend({ chatId: '-100', text: 't' }, { env: { TELEGRAM_BOT_TOKEN: 'tok' }, fetchFn });
  assert.ok(!('message_thread_id' in body));
});
await ok('telegram topics: website leads, their reminders and the agent report each go to their own topic', async () => {
  const sent = [];
  const telegram = { send: async (m) => { sent.push(m); return { ok: true, result: { message_id: 1 } }; } };
  const agent = { enabled: true, config: { platforms: [], deck: { style: 'brand-pulse', lang: 'en' }, telegram: { enabled: true, chatId: '-100', threadId: '8' } } };
  await runProjectReport({ repo: fakeRepo({ agent }), post, projectId: 3, periodType: 'weekly', today: '2026-10-15', telegram });
  assert.equal(sent.length, 1);
  assert.deepEqual([sent[0].chatId, sent[0].threadId], ['-100', '8']);
  sent.length = 0;
  await runProjectReport({ repo: fakeRepo({ agent: { ...agent, config: { ...agent.config, telegram: { enabled: true, chatId: '-100', threadId: '' } } } }), post, projectId: 3, periodType: 'weekly', today: '2026-10-15', telegram });
  assert.equal(sent[0].threadId, undefined); // no topic chosen: the General topic
});

await ok('telegram topics: a website lead goes into the topic chosen for its chat', async () => {
  const tables = { site_leads: [], clients: [], deals: [], deal_activity: [], notifications: [], pipelines: [{ id: 7, name: 'Website', position: 7 }], deal_stages: [{ id: 22, pipeline_id: 7, position: 4 }, { id: 19, pipeline_id: 7, position: 1 }] };
  const db = fakeDb(tables);
  const sent = [];
  const telegram = { send: async (m) => { sent.push(m); return m.chatId === '-200' ? { ok: false, error: 'chat not found' } : { ok: true }; } };
  const settings = { enabled: true, pipeline_id: 7, manager: 'Anna', telegram_chat_ids: ['-100', '-200'], notify_emails: ['A@x.com', 'a@x.com'] };
  const t0 = new Date('2026-10-19T10:00:00Z');
  const run = (body, o = {}) => handleSiteLead({ db, settings: { ...settings, ...(o.settings || {}) }, body, ip: o.ip || '1.2.3.4', telegram: o.telegram === undefined ? telegram : o.telegram, now: () => o.now || t0 });
  const form = { name: 'Ann Lee', email: 'ann@example.com', phone: '+380501234567', link: 'https://shop.example', services: ['service1'], message: 'Need ads', page_url: 'https://www.monarchi.agency/' };
  const topicSettings = { ...settings, telegram_chat_ids: ['-100', '-300'], telegram_topics: { '-100': 7 } };
  const r = await handleSiteLead({ db, settings: topicSettings, body: form, ip: '9.9.9.9', telegram, now: () => t0 });
  assert.equal(r.status, 'created');
  assert.deepEqual(sent.map((m) => [m.chatId, m.threadId]), [['-100', 7], ['-300', undefined]]); // the chat with a chosen topic gets it there, the other one stays as it was
});

// ---- The website analyst (GA4 + Search Console)
const siteKey = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey.export({ type: 'pkcs8', format: 'pem' });
const siteAccount = { client_email: 'reader@proj.iam.gserviceaccount.com', private_key: siteKey };
function siteFetch({ gaFail = false, gscFail = false, big = false } = {}) {
  const log = [];
  const fetchFn = async (url, init = {}) => {
    const body = init.body && typeof init.body === 'string' && init.body.startsWith('{') ? JSON.parse(init.body) : init.body;
    log.push({ url, body, auth: init.headers?.Authorization });
    const res = (status, json) => ({ ok: status < 400, status, json: async () => json });
    if (url.includes('oauth2.googleapis.com')) return res(200, { access_token: 'tok123' });
    if (url.includes('analyticsdata.googleapis.com')) {
      if (gaFail) return res(403, { error: { message: 'User does not have access' } });
      const m = (v) => ({ value: String(v) });
      const dims = body.dimensions?.map((d) => d.name) || [];
      const headers = [...dims.map((name) => ({ name })), { name: 'dateRange' }];
      const row = (d, range, vals) => ({ dimensionValues: [...d.map((v) => ({ value: v })), { value: range }], metricValues: vals.map(m) });
      if (!dims.length) return res(200, { dimensionHeaders: headers, rows: [row([], 'cur', big ? [400, 520, 900, 0.62, 3000, 12] : [28, 33, 60, 0.5, 136, 0]), row([], 'prev', big ? [300, 400, 700, 0.6, 2500, 9] : [31, 36, 70, 0.48, 150, 0])] });
      if (dims[0] === 'sessionSource') return res(200, { dimensionHeaders: headers, rows: [row(['google', 'organic'], 'cur', [20, 18, 0]), row(['google', 'organic'], 'prev', [25, 22, 0]), row(['(direct)', '(none)'], 'cur', [13, 10, 0]), row(['(direct)', '(none)'], 'prev', [11, 9, 0]), row(['instagram', 'social'], 'cur', [4, 3, 0])] });
      if (dims[0] === 'date') return res(200, { dimensionHeaders: [{ name: 'date' }], rows: [{ dimensionValues: [{ value: '20260901' }], metricValues: [m(5), m(9)] }, { dimensionValues: [{ value: '20261012' }], metricValues: [m(10), m(20)] }, { dimensionValues: [{ value: '20261013' }], metricValues: [m(4), m(7)] }, { dimensionValues: [{ value: '20250101' }], metricValues: [m(99), m(99)] }] });
      if (dims[0] === 'country') return res(200, { dimensionHeaders: headers, rows: [row(['Ukraine'], 'cur', [20]), row(['Ukraine'], 'prev', [24]), row(['Poland'], 'cur', [5]), row(['Poland'], 'prev', [3])] });
      if (dims[0] === 'deviceCategory') return res(200, { dimensionHeaders: headers, rows: [row(['mobile'], 'cur', [18]), row(['mobile'], 'prev', [15]), row(['desktop'], 'cur', [10]), row(['desktop'], 'prev', [16])] });
      if (dims[0] === 'sessionDefaultChannelGroup') return res(200, { dimensionHeaders: headers, rows: [row(['Organic Search'], 'cur', [20, 18]), row(['Organic Search'], 'prev', [25, 22]), row(['Direct'], 'cur', [13, 10]), row(['Direct'], 'prev', [11, 9])] });
      return res(200, { dimensionHeaders: headers, rows: [row(['/services/'], 'cur', big ? [80, 50] : [10, 6]), row(['/services/'], 'prev', big ? [200, 90] : [14, 8]), row(['/'], 'cur', [30, 20]), row(['/'], 'prev', [28, 19])] });
    }
    if (url.includes('searchAnalytics/query')) {
      if (gscFail) return res(403, { error: { message: 'Forbidden' } });
      if (!body.dimensions) return res(200, { rows: [body.startDate < '2026-09-19' ? { clicks: big ? 60 : 4, impressions: big ? 900 : 70, ctr: 0.04, position: 12 } : { clicks: big ? 90 : 5, impressions: big ? 1300 : 80, ctr: 0.05, position: 11 }] });
      if (body.dimensions.length === 2) return res(200, { rows: [{ keys: ['seo агенція', 'https://www.monarchi.agency/seo/'], clicks: 0, impressions: 300, ctr: 0, position: 9.5 }, { keys: ['monarchi', 'https://www.monarchi.agency/'], clicks: 30, impressions: 60, ctr: 0.5, position: 1.2 }] });
      if (body.dimensions[0] === 'query' && body.startDate < '2026-09-19') return res(200, { rows: [{ keys: ['seo агенція'], clicks: 0, impressions: 150, ctr: 0, position: 9 }, { keys: ['ppc'], clicks: 4, impressions: 100, ctr: 0.04, position: 12 }, { keys: ['monarchi'], clicks: 20, impressions: 50, ctr: 0.4, position: 1.1 }] });
      if (body.dimensions[0] === 'query') return res(200, { rows: [{ keys: ['seo агенція'], clicks: 0, impressions: 400, ctr: 0, position: 9.2 }, { keys: ['monarchi'], clicks: 30, impressions: 60, ctr: 0.5, position: 1.2 }, { keys: ['ppc'], clicks: 1, impressions: 300, ctr: 0.003, position: 15 }] });
      return res(200, { rows: [{ keys: ['https://www.monarchi.agency/services/'], clicks: 9, impressions: 500, ctr: 0.018, position: 8 }] });
    }
    if (url.startsWith('https://www.monarchi.agency')) return res(200, {});
    return res(404, {});
  };
  return { fetchFn, log };
}
const SITE_NOW = () => new Date('2026-10-19T09:00:00Z');

await ok('site analyst: the service account key is read from the environment (JSON or base64) and a bad one says what is wrong', () => {
  const json = JSON.stringify({ client_email: 'a@b.iam.gserviceaccount.com', private_key: '-----BEGIN PRIVATE KEY-----\\nabc\\n-----END PRIVATE KEY-----\\n' });
  assert.equal(serviceAccountFromEnv({ GOOGLE_SERVICE_ACCOUNT_JSON: json }).client_email, 'a@b.iam.gserviceaccount.com');
  assert.match(serviceAccountFromEnv({ GOOGLE_SERVICE_ACCOUNT_JSON: json }).private_key, /BEGIN PRIVATE KEY-----\nabc\n/);
  assert.equal(serviceAccountFromEnv({ GOOGLE_SERVICE_ACCOUNT_JSON: Buffer.from(json).toString('base64') }).client_email, 'a@b.iam.gserviceaccount.com');
  assert.throws(() => serviceAccountFromEnv({}), /GOOGLE_SERVICE_ACCOUNT_JSON/);
  assert.throws(() => serviceAccountFromEnv({ GOOGLE_SERVICE_ACCOUNT_JSON: '{"nope":1}' }), /невірний формат/);
});
await ok('site analyst: two 28-day windows end 3 days back (Search Console is that late) and never overlap', () => {
  const w = siteWindows(new Date('2026-10-19T09:00:00Z'));
  assert.deepEqual([w.cur.start, w.cur.end, w.prev.start, w.prev.end], ['2026-09-19', '2026-10-16', '2026-08-22', '2026-09-18']);
});
await ok('site analyst: a signed token is requested once, GA4 and Search Console are only ever READ with it', async () => {
  const { fetchFn, log } = siteFetch();
  const raw = await collectSiteStats({ account: siteAccount, fetchFn, now: SITE_NOW });
  const tokenCall = log.find((l) => l.url.includes('oauth2'));
  assert.match(String(tokenCall.body), /grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer/);
  const assertion = new URLSearchParams(String(tokenCall.body)).get('assertion').split('.');
  assert.equal(assertion.length, 3);
  assert.equal(JSON.parse(Buffer.from(assertion[1], 'base64url').toString()).iss, 'reader@proj.iam.gserviceaccount.com');
  assert.ok(log.filter((l) => !l.url.includes('oauth2')).every((l) => l.auth === 'Bearer tok123'));
  assert.ok(log.some((l) => l.url.includes('/properties/503944052:runReport')));
  assert.ok(log.some((l) => l.url.includes(encodeURIComponent('sc-domain:monarchi.agency'))));
  assert.deepEqual([raw.ga4.total.cur.activeUsers, raw.ga4.total.prev.activeUsers, raw.gsc.total.cur.clicks, raw.gsc.total.prev.clicks], [28, 31, 5, 4]);
  assert.equal(raw.ga4.channels[0].name, 'Organic Search');
  assert.equal(raw.gsc.queries.length, 3);
});
await ok('site analyst: without a service account key the OAuth refresh token of a person works, and the message says which variables are missing', async () => {
  const env = { GOOGLE_OAUTH_CLIENT_ID: 'cid', GOOGLE_OAUTH_CLIENT_SECRET: 'sec', GOOGLE_OAUTH_REFRESH_TOKEN: 'rtok' };
  assert.equal(authFromEnv(env).kind, 'oauth');
  assert.equal(authFromEnv({ ...env, GOOGLE_SERVICE_ACCOUNT_JSON: JSON.stringify({ client_email: 'a@b', private_key: 'k' }) }).kind, 'service_account'); // the key wins
  assert.throws(() => authFromEnv({ GOOGLE_OAUTH_CLIENT_ID: 'cid' }), /GOOGLE_OAUTH_REFRESH_TOKEN/);
  const { fetchFn, log } = siteFetch();
  const wrap = async (url, init) => { if (url.includes('oauth2') && String(init.body).includes('refresh_token')) { log.push({ url, refresh: String(init.body) }); return { ok: true, status: 200, json: async () => ({ access_token: 'tok123' }) }; } return fetchFn(url, init); };
  const raw = await collectSiteStats({ auth: authFromEnv(env), fetchFn: wrap, now: SITE_NOW });
  assert.match(log.find((l) => l.refresh).refresh, /grant_type=refresh_token.*client_id=cid.*refresh_token=rtok/);
  assert.equal(raw.ga4.total.cur.activeUsers, 28);
  const dead = async () => ({ ok: false, status: 400, json: async () => ({ error: 'invalid_grant', error_description: 'Token has been expired or revoked.' }) });
  await assert.rejects(() => collectSiteStats({ auth: authFromEnv(env), fetchFn: dead, now: SITE_NOW }), /прострочений або відкликаний.*7 днів/);
});
await ok('site analyst: a failure of one source does not lose the other, both failing is one clear error', async () => {
  const half = await collectSiteStats({ account: siteAccount, fetchFn: siteFetch({ gaFail: true }).fetchFn, now: SITE_NOW });
  assert.equal(half.ga4, null);
  assert.match(half.errors.ga4, /GA4: User does not have access.*читачем у GA4/);
  assert.ok(half.gsc);
  await assert.rejects(() => collectSiteStats({ account: siteAccount, fetchFn: siteFetch({ gaFail: true, gscFail: true }).fetchFn, now: SITE_NOW }), /Не вдалося прочитати ні GA4, ні Search Console/);
});
await ok('site analyst: the overview page reports the connection of each source and the live figures, and says plainly when nothing is set up', async () => {
  const env = { GOOGLE_OAUTH_CLIENT_ID: 'cid', GOOGLE_OAUTH_CLIENT_SECRET: 'sec', GOOGLE_OAUTH_REFRESH_TOKEN: 'rtok' };
  const full = await siteOverview({ env, fetchFn: siteFetch().fetchFn, now: SITE_NOW });
  assert.equal(full.status.configured, true);
  assert.equal(full.status.auth.kind, 'oauth');
  assert.deepEqual([full.status.ga4.ok, full.status.gsc.ok], [true, true]);
  assert.equal(full.status.ga4.propertyId, '503944052');
  assert.ok(full.analysis.ga4.metrics.length && full.analysis.gsc.metrics.length);
  const half = await siteOverview({ env, fetchFn: siteFetch({ gaFail: true }).fetchFn, now: SITE_NOW });
  assert.deepEqual([half.status.ga4.ok, half.status.gsc.ok], [false, true]);
  assert.match(half.status.ga4.error, /GA4/);
  assert.equal(half.analysis.ga4, null);
  assert.ok(half.analysis.gsc);
  const both = await siteOverview({ env, fetchFn: siteFetch({ gaFail: true, gscFail: true }).fetchFn, now: SITE_NOW });
  assert.equal(both.analysis, null);
  assert.match(both.status.error, /ні GA4, ні Search Console/);
  assert.equal(both.extras.uptime.ok, true); // the site check does not need Google
  const none = await siteOverview({ env: {}, now: SITE_NOW, fetchFn: siteFetch().fetchFn });
  assert.equal(none.status.configured, false);
  assert.equal(none.analysis, null);
  assert.ok(none.status.error);
  assert.equal((await siteOverview({ env, config: { ga4PropertyId: '42' }, fetchFn: siteFetch().fetchFn, now: SITE_NOW })).status.ga4.propertyId, '42'); // the agent's own settings win over the default
});
await ok('site analyst: more figures of GA4 (sources, weeks, countries, devices) and Search Console (risers, fallers, query to page) are read and analysed in code', async () => {
  const a = analyseSite(await collectSiteStats({ account: siteAccount, fetchFn: siteFetch().fetchFn, now: SITE_NOW }));
  assert.deepEqual(a.ga4.sources.map((x) => [x.name, x.sessions, x.prevSessions]), [['google / organic', 20, 25], ['(direct) / (none)', 13, 11], ['instagram / social', 4, 0]]);
  assert.equal(a.ga4.weekly.length, 8);
  assert.equal(a.ga4.weekly[1].sessions, 5); // 1 Sep falls into the second week of the 56 days
  assert.equal(a.ga4.weekly[7].sessions, 14); // 12 and 13 Oct: the last week; a day far outside the window is ignored
  assert.equal(a.ga4.weekly.reduce((s, w) => s + w.sessions, 0), 19);
  assert.deepEqual(a.ga4.devices.map((d) => [d.name, d.share]), [['mobile', 64], ['desktop', 36]]);
  assert.equal(a.ga4.countries[0].name, 'Ukraine');
  assert.equal(a.gsc.movers.risers[0].query, 'seo агенція'); // 150 -> 400 shown
  assert.equal(a.gsc.movers.risers[0].prevImpressions, 150);
  assert.ok(a.gsc.movers.fallers.some((q) => q.query === 'ppc' && q.clicks === 1 && q.prevClicks === 4));
  assert.ok(!a.gsc.movers.risers.concat(a.gsc.movers.fallers).some((q) => /monarchi/i.test(q.query))); // our own name is not a topic
  assert.deepEqual(a.gsc.queryPages.map((q) => [q.query, q.page]), [['seo агенція', '/seo/']]);
  assert.ok(a.handoff.seo.some((l) => /«ppc» просів/.test(l)));
  // an extra report that fails alone does not lose the main figures
  const partial = async (url, init) => { const b = JSON.parse(init?.body && String(init.body).startsWith('{') ? init.body : '{}'); if (url.includes('analyticsdata') && b.dimensions?.[0]?.name === 'country') return { ok: false, status: 500, json: async () => ({}) }; return siteFetch().fetchFn(url, init); };
  const p = await collectSiteStats({ account: siteAccount, fetchFn: partial, now: SITE_NOW });
  assert.equal(p.ga4.countries, null);
  assert.equal(p.ga4.total.cur.activeUsers, 28);
});
await ok('site leads for the analyst: counted from the CRM log by source and page, spam and duplicates apart, small numbers get no percentage', async () => {
  const w = leadWindows(new Date('2026-10-20T10:00:00Z'));
  assert.deepEqual([w.cur.start, w.cur.end, w.prev.start, w.prev.end], ['2026-09-23', '2026-10-20', '2026-08-26', '2026-09-22']);
  assert.equal(leadSource({ utm: { utm_source: 'google', utm_medium: 'cpc' } }), 'google / cpc');
  assert.equal(leadSource({ referrer: 'https://www.facebook.com/x' }), 'facebook.com');
  assert.match(leadSource({}), /без джерела/);
  const lead = (day, status, extra = {}) => ({ received_at: `${day}T08:00:00Z`, status, page_url: 'https://www.monarchi.agency/contact/', referrer: null, utm: null, deal_id: null, ...extra });
  const rows = [lead('2026-10-18', 'new', { utm: { utm_source: 'google', utm_medium: 'cpc', utm_campaign: 'brand' }, deal_id: 'd1' }), lead('2026-10-10', 'new', { page_url: 'https://www.monarchi.agency/seo/' }), lead('2026-10-09', 'duplicate'), lead('2026-10-08', 'spam'), lead('2026-09-01', 'new'), lead('2026-09-02', 'spam')];
  const a = analyseLeads(rows, w);
  assert.deepEqual([a.cur.leads, a.cur.duplicates, a.cur.spam, a.cur.deals, a.prev.leads, a.prev.spam], [2, 1, 1, 1, 1, 1]);
  assert.equal(a.delta, null); // 2 against 1: noise
  assert.equal(a.sources[0].name, 'google / cpc');
  assert.deepEqual(a.pages.map((p) => p.path).sort(), ['/contact/', '/seo/']);
  assert.deepEqual(a.campaigns, [{ name: 'brand', count: 1 }]);
  const many = analyseLeads([...Array(12).fill(0).map((_, i) => lead('2026-10-1' + (i % 9), 'new')), ...Array(6).fill(0).map(() => lead('2026-09-10', 'new'))], w);
  assert.equal(many.delta, 100); // 12 against 6, enough to say
});
await ok('site analyst: the site check and the leads are added to findings, the hand-off and a GA4 «not tracked» note is replaced when the CRM counts the leads', async () => {
  const tables = { site_leads: [{ received_at: '2026-10-18T08:00:00Z', status: 'new', page_url: 'https://www.monarchi.agency/seo/', referrer: null, utm: { utm_source: 'google' }, deal_id: null }], smm_settings: [{ id: 1, site_url: 'https://www.monarchi.agency' }] };
  const db = fakeDb(tables);
  const extras = await siteExtras({ db, fetchFn: siteFetch().fetchFn, now: () => new Date('2026-10-20T10:00:00Z') });
  assert.equal(extras.leads.cur.leads, 1);
  assert.equal(extras.uptime.ok, true);
  assert.ok(extras.handoff.strategist.some((l) => /\/seo\//.test(l)));
  const analysis = applyExtras(analyseSite(await collectSiteStats({ account: siteAccount, fetchFn: siteFetch().fetchFn, now: SITE_NOW })), extras);
  assert.ok(!analysis.findings.some((f) => f.kind === 'setup'));
  assert.ok(analysis.findings.some((f) => f.source === 'ga4' && /рахуємо з CRM/.test(f.text)));
  assert.equal(analysis.extras.leads.cur.leads, 1);
  // the site is down: said first-class, and a slow answer is called slow
  const down = await checkUptime({ url: 'https://x.test', fetchFn: async () => { throw new Error('ENOTFOUND'); } });
  assert.deepEqual([down.ok, down.status], [false, null]);
  assert.match(down.error, /недоступний.*ENOTFOUND/);
  const err500 = await checkUptime({ url: 'https://x.test', fetchFn: async () => ({ status: 503 }) });
  assert.match(err500.error, /503/);
  const hung = await checkUptime({ url: 'https://x.test', timeoutMs: 20, fetchFn: (u, init) => new Promise((_, rej) => init.signal.addEventListener('abort', () => rej(Object.assign(new Error('x'), { name: 'AbortError' })))) });
  assert.match(hung.error, /не відповів/);
  const downExtras = await siteExtras({ db, fetchFn: async () => ({ status: 500 }), now: () => new Date('2026-10-20T10:00:00Z') });
  assert.ok(downExtras.findings.some((f) => f.kind === 'error' && f.source === 'site'));
  // a missing log table is reported, the site check still runs
  const broken = { from: () => ({ select: () => ({ gte: () => ({ order: () => ({ limit: async () => ({ data: null, error: { message: 'relation site_leads does not exist' } }) }) }) }), eq: () => ({ maybeSingle: async () => ({ data: null }) }) }) };
  const partial = await siteExtras({ db: broken, fetchFn: siteFetch().fetchFn });
  assert.equal(partial.leads, null);
  assert.match(partial.leadsError, /site_leads/);
  assert.equal(partial.uptime.ok, true);
});
const lhJson = (perf, extra = {}) => ({ lighthouseResult: { categories: { performance: { score: perf }, seo: { score: 0.92 }, accessibility: { score: 0.81 }, 'best-practices': { score: 1 } }, audits: { 'largest-contentful-paint': { numericValue: 4800 }, 'first-contentful-paint': { numericValue: 1500 }, 'total-blocking-time': { numericValue: 350 }, 'cumulative-layout-shift': { numericValue: 0.02 }, 'speed-index': { numericValue: 3000 }, 'render-blocking-resources': { title: 'Eliminate render-blocking resources', details: { type: 'opportunity', overallSavingsMs: 1250 } }, 'uses-optimized-images': { title: 'Efficiently encode images [Learn more](https://web.dev/x)', details: { type: 'opportunity', overallSavingsMs: 2100 } }, 'tiny': { title: 'Tiny', details: { type: 'opportunity', overallSavingsMs: 100 } }, 'other': { title: 'Not an opportunity', details: { type: 'table' } } } }, ...extra });
const speedFetch = ({ fail = null } = {}) => { const log = []; return { log, fetchFn: async (url) => { log.push(url); if (fail) return { ok: false, status: fail.status, json: async () => ({ error: { message: fail.message } }) }; return { ok: true, status: 200, json: async () => (url.includes('strategy=mobile') ? lhJson(0.42) : lhJson(0.95)) }; } }; };
await ok('pagespeed: scores, metrics with ratings and the biggest fixes are read from the Google answer, the key never leaves the server', async () => {
  assert.equal(speedKeyFromEnv({ PAGESPEED_API_KEY: '  abc  ' }), 'abc');
  assert.equal(speedKeyFromEnv({}), '');
  const r = parseSpeed(lhJson(0.42));
  assert.deepEqual(r.scores, { performance: 42, seo: 92, accessibility: 81, bestPractices: 100 });
  assert.deepEqual(r.metrics.map((m) => [m.key, m.rating]), [['lcp', 'poor'], ['fcp', 'good'], ['tbt', 'ok'], ['cls', 'good'], ['si', 'good']]);
  assert.equal(r.metrics[0].display, '4,8 с');
  assert.deepEqual(r.opportunities.map((o) => [o.title, o.savingsMs]), [['Efficiently encode images', 2100], ['Eliminate render-blocking resources', 1250]]); // the biggest first, tiny and non-opportunities left out, links cut from titles
  assert.throws(() => parseSpeed({}), /без результатів/);
  const { fetchFn, log } = speedFetch();
  const s1 = await collectSpeed({ url: 'https://www.monarchi.agency', key: 'KEY1', fetchFn, now: SITE_NOW });
  assert.equal(log.length, 2);
  assert.ok(log.every((u) => u.startsWith('https://www.googleapis.com/pagespeedonline/v5/runPagespeed?') && u.includes('key=KEY1') && u.includes('category=seo')));
  assert.deepEqual([s1.mobile.scores.performance, s1.desktop.scores.performance, s1.error], [42, 95, null]);
  const f = speedFindings(s1);
  assert.ok(f.findings.some((x) => x.kind === 'down' && /телефона: 42/.test(x.text)));
  assert.ok(f.findings.some((x) => x.kind === 'info' && /комп’ютера: 95/.test(x.text) && /усе добре/.test(x.text)));
  assert.equal(f.seo.length, 2); // fixes of the phone version go to the SEO agent
});
await ok('pagespeed: no key, a wrong key and a limit are results with the reason, never an exception; one strategy failing keeps the other', async () => {
  const none = await collectSpeed({ url: 'https://x.test', key: '', fetchFn: async () => { throw new Error('must not be called'); } });
  assert.equal(none.configured, false);
  assert.match(none.error, /PAGESPEED_API_KEY/);
  const forbidden = await collectSpeed({ url: 'https://x.test', key: 'k', fetchFn: speedFetch({ fail: { status: 403, message: 'API has not been used' } }).fetchFn });
  assert.match(forbidden.error, /PageSpeed Insights API/);
  const limited = await collectSpeed({ url: 'https://x.test', key: 'k', fetchFn: speedFetch({ fail: { status: 429, message: 'Quota exceeded' } }).fetchFn });
  assert.match(limited.error, /ліміт/);
  const half = await collectSpeed({ url: 'https://x.test', key: 'k', fetchFn: async (url) => (url.includes('strategy=desktop') ? { ok: false, status: 500, json: async () => ({}) } : { ok: true, status: 200, json: async () => lhJson(0.8) }) });
  assert.ok(half.mobile && !half.desktop);
  assert.equal(half.error, null);
  assert.ok(half.errors.desktop);
  assert.deepEqual(speedFindings(none).findings.map((x) => x.kind), ['error']);
});
await ok('pagespeed: the analyst run measures speed when a key is set, saves it with the report and tells the SEO agent', async () => {
  const tables = { smm_brand: [{ id: 1 }], smm_competitors: [], smm_competitor_reports: [], smm_site_audits: [], smm_posts: [], smm_plans: [], smm_site_stats: [], site_leads: [], smm_settings: [{ id: 1, site_url: 'https://www.monarchi.agency' }], ag_agents: [], ag_links: [], ag_prompts: [], ag_prompt_versions: [] };
  const db = fakeDb(tables);
  await ensureSmmTeam(db, 'a@x.com');
  const analyst = tables.ag_agents.find((a) => a.role === 'site_analyst');
  const site = async () => collectSiteStats({ account: siteAccount, fetchFn: siteFetch().fetchFn, now: SITE_NOW });
  const good = { callModel: async (args) => ({ text: 'Звіт.', usage: { input_tokens: 1, output_tokens: 1 }, costUsd: 0.001, agentKey: args.agentKey }) };
  const net = async (url, init) => (url.includes('pagespeedonline') ? speedFetch().fetchFn(url) : siteFetch().fetchFn(url, init));
  const r = await runNow({ db, model: good, email: 'a@x.com', trigger: 'user', hf: null, site, extrasFetch: net, env: { PAGESPEED_API_KEY: 'KEY1' }, now: SITE_NOW }, analyst.id);
  assert.equal(r.status, 'done');
  const saved = tables.smm_site_stats[0].data;
  assert.equal(saved.extras.speed.mobile.scores.performance, 42);
  assert.ok(saved.handoff.seo.some((l) => /Швидкість \(телефон\)/.test(l)));
  assert.ok(saved.findings.some((x) => x.source === 'speed' && x.kind === 'down'));
  // without a key the run still works and says the key is missing, nothing is fetched from PageSpeed
  const noKey = await runNow({ db, model: good, email: 'a@x.com', trigger: 'user', hf: null, site, extrasFetch: async (url, init) => { assert.ok(!url.includes('pagespeedonline')); return siteFetch().fetchFn(url, init); }, env: {}, now: SITE_NOW }, analyst.id);
  assert.equal(noKey.status, 'done');
  assert.equal(tables.smm_site_stats[1].data.extras.speed.configured, false);
});
await ok('project history: weeks are cut at the month borders (Monday to Sunday, the first and the last short)', () => {
  assert.deepEqual(monthWeeks('2026-09').map((w) => [w.n, w.start, w.end]), [[1, '2026-09-01', '2026-09-06'], [2, '2026-09-07', '2026-09-13'], [3, '2026-09-14', '2026-09-20'], [4, '2026-09-21', '2026-09-27'], [5, '2026-09-28', '2026-09-30']]);
  assert.deepEqual(monthWeeks('2026-10').map((w) => [w.start, w.end]), [['2026-10-01', '2026-10-04'], ['2026-10-05', '2026-10-11'], ['2026-10-12', '2026-10-18'], ['2026-10-19', '2026-10-25'], ['2026-10-26', '2026-10-31']]);
  assert.equal(monthLabel('2026-09'), 'Вересень 2026');
});
await ok('project history: reports are grouped into month cards, the current month is always there, strays are kept apart', () => {
  const r = (id, type, start, end, status, extra = {}) => ({ id, period_type: type, period_start: start, period_end: end, status, platform: 'meta', updated_at: `2026-10-0${id}T10:00:00Z`, ...extra });
  const rows = [r(1, 'weekly', '2026-09-01', '2026-09-06', 'final'), r(2, 'weekly', '2026-09-07', '2026-09-13', 'reviewed'), r(3, 'monthly', '2026-09-01', '2026-09-30', 'draft'), r(4, 'weekly', '2026-08-31', '2026-09-06', 'final'), r(5, 'custom', '2026-09-10', '2026-09-12', 'draft')];
  const months = buildMonths(rows, '2026-10-21');
  assert.deepEqual(months.map((m) => m.key), ['2026-10', '2026-09', '2026-08']); // newest first, October is there with nothing in it
  const sep = months[1];
  assert.deepEqual([sep.counts.approved, sep.counts.pending, sep.counts.missing, sep.counts.total], [1, 1, 3, 5]);
  assert.equal(sep.weeks[0].row.id, 1);
  assert.equal(sep.monthly.id, 3);
  assert.deepEqual(sep.others.map((o) => o.id), [5]); // a custom period is kept, not lost
  assert.equal(months[2].others[0].id, 4); // an old Monday-based week belongs to the month it starts in
  assert.equal(sep.complete, false);
  assert.equal(months[0].counts.missing, 5);
  const all = [1, 2, 3, 4, 5].map((n, i) => r(10 + n, 'weekly', monthWeeks('2026-09')[i].start, monthWeeks('2026-09')[i].end, 'final'));
  const done = buildMonths([...all, r(20, 'monthly', '2026-09-01', '2026-09-30', 'final')], '2026-10-21').find((m) => m.key === '2026-09');
  assert.equal(done.complete, true);
});
await ok('project history: who may approve, what a person can do in each status, and the review notes', () => {
  assert.equal(canApprove('a@x.com', []), true); // nobody chosen yet: anyone with access, as before
  assert.equal(canApprove('A@X.com', ['a@x.com']), true);
  assert.equal(canApprove('b@x.com', ['a@x.com']), false);
  assert.deepEqual(reportActions('draft', false).map((a) => a.action), ['send']); // anyone may send a draft for approval
  assert.deepEqual(reportActions('reviewed', false), []);
  assert.deepEqual(reportActions('reviewed', true).map((a) => a.action), ['approve', 'return']);
  assert.deepEqual(reportActions('final', true).map((a) => a.action), ['reopen']);
  assert.deepEqual(reportActions('final', false), []);
  const at = '2026-10-21T10:00:00Z';
  let row = { status: 'draft', data: {} };
  let p = reviewPatch(row, 'send', 'm@x.com', '', at);
  assert.deepEqual([p.status, p.review.sentBy], ['reviewed', 'm@x.com']);
  p = reviewPatch({ status: 'reviewed', data: { review: p.review } }, 'return', 'a@x.com', '  add the plans  ', at);
  assert.deepEqual([p.status, p.review.returnedNote, p.review.sentBy], ['draft', 'add the plans', 'm@x.com']);
  p = reviewPatch({ status: 'reviewed', data: {} }, 'approve', 'a@x.com', '', at);
  assert.deepEqual([p.status, p.review.approvedBy], ['final', 'a@x.com']);
  p = reviewPatch({ status: 'final', data: { review: p.review } }, 'reopen', 'a@x.com', '', at);
  assert.deepEqual([p.status, p.review.approvedBy], ['reviewed', null]); // withdrawn: the client stops seeing it until it is approved again
  assert.throws(() => reviewPatch(row, 'nope', 'a'), /Невідома дія/);
  assert.deepEqual(clientVisible([{ id: 1, status: 'draft' }, { id: 2, status: 'reviewed' }, { id: 3, status: 'final' }]).map((x) => x.id), [3]); // only approved reports reach a client
});
await ok('site analyst: small numbers get no percentages, missing conversions are reported, and the hand-off is made in code', async () => {
  const small = analyseSite(await collectSiteStats({ account: siteAccount, fetchFn: siteFetch().fetchFn, now: SITE_NOW }));
  const users = small.ga4.metrics.find((m) => m.key === 'users');
  assert.deepEqual([users.cur, users.prev, users.enough, users.delta], [28, 31, false, null]); // 28 people: no «-9.7%»
  assert.ok(small.findings.some((f) => f.kind === 'low' && f.source === 'ga4'));
  assert.ok(small.findings.some((f) => f.kind === 'low' && f.source === 'gsc'));
  assert.ok(small.findings.some((f) => f.kind === 'setup' && /Ключових подій/.test(f.text)));
  // queries with shown-but-unclicked results (impressions, CTR under 2%, position 4-20) go to the SEO agent
  assert.deepEqual(small.gsc.opportunities.map((o) => o.query), ['seo агенція', 'ppc']);
  assert.ok(small.handoff.seo.some((l) => /seo агенція/.test(l)));
  assert.ok(small.handoff.strategist.length > 0);
  assert.ok(!small.handoff.strategist.some((l) => /«monarchi»/.test(l))); // a search for our own name is not a topic
  assert.ok(!small.handoff.strategist.some((l) => /\(0%\)/.test(l)));
  const big = analyseSite(await collectSiteStats({ account: siteAccount, fetchFn: siteFetch({ big: true }).fetchFn, now: SITE_NOW }));
  assert.equal(big.ga4.metrics.find((m) => m.key === 'users').delta, 33.3); // 400 vs 300
  assert.ok(big.findings.some((f) => f.kind === 'up' && f.source === 'ga4'));
  assert.ok(!big.findings.some((f) => f.kind === 'setup')); // conversions exist now
  assert.ok(big.handoff.seo.some((l) => /\/services\//.test(l) && /-60%/.test(l))); // 80 vs 200 views
});
await ok('site analyst: the agent run saves the report, hands the lines on and still works when the model fails', async () => {
  const tables = { smm_brand: [{ id: 1 }], smm_competitors: [], smm_competitor_reports: [], smm_site_audits: [], smm_posts: [], smm_plans: [], smm_site_stats: [], ag_agents: [], ag_links: [], ag_prompts: [], ag_prompt_versions: [], ag_tasks: [], ag_runs: [], notifications: [] };
  const db = fakeDb(tables);
  await ensureSmmTeam(db, 'a@x.com');
  const analyst = tables.ag_agents.find((a) => a.role === 'site_analyst');
  assert.equal(analyst.config.ga4PropertyId, '503944052');
  let siteCalls = 0;
  const site = async ({ config }) => { siteCalls += 1; assert.equal(config.gscSiteUrl, 'sc-domain:monarchi.agency'); return collectSiteStats({ account: siteAccount, fetchFn: siteFetch().fetchFn, now: SITE_NOW }); };
  const good = { callModel: async (args) => ({ text: 'Звіт: даних мало.', usage: { input_tokens: 1, output_tokens: 1 }, costUsd: 0.001, agentKey: args.agentKey }) };
  const extrasFetch = siteFetch().fetchFn;
  const r = await runNow({ db, model: good, email: 'a@x.com', trigger: 'user', hf: null, site, extrasFetch, now: SITE_NOW }, analyst.id);
  assert.equal(r.status, 'done');
  assert.equal(siteCalls, 1);
  assert.equal(tables.smm_site_stats.length, 1);
  assert.equal(tables.smm_site_stats[0].report, 'Звіт: даних мало.');
  assert.ok(tables.smm_site_stats[0].data.handoff.seo.length > 0);
  // the model is down: the report is built from the findings and the run still succeeds
  const bad = { callModel: async () => { throw new Error('overloaded'); } };
  const r2 = await runNow({ db, model: bad, email: 'a@x.com', trigger: 'user', hf: null, site, extrasFetch, now: SITE_NOW }, analyst.id);
  assert.equal(r2.status, 'done');
  assert.match(tables.smm_site_stats[1].report, /Мало даних/);
  assert.match(tables.smm_site_stats[1].model_error, /overloaded/);
  // no key on the server: a clear message, no report
  const r3 = await runNow({ db, model: good, email: 'a@x.com', trigger: 'user', hf: null, env: {}, now: SITE_NOW }, analyst.id);
  assert.equal(r3.status, 'failed');
  assert.match(r3.error, /GOOGLE_SERVICE_ACCOUNT_JSON/);
  assert.equal(tables.smm_site_stats.length, 2);
});

await ok('dynamics: neutral wording from the figures only, ratios only when the periods differ in length', () => {
  const platforms = { meta: { currency: 'USD', total: { spend: 1200, impressions: 100000, clicks: 3000, purchases: 20, revenue: 4800, leads: 0 } } };
  const previous = { period: { start: '2026-09-24', end: '2026-09-30' }, platforms: { meta: { total: { spend: 1000, impressions: 90000, clicks: 2700, purchases: 25, revenue: 4500, leads: 0 } } } };
  const t = describeDynamics({ platforms, previous, kind: 'ecom', names: { meta: 'Meta Ads' } });
  assert.match(t, /^Meta Ads: compared with 24\.09–30\.09, /);
  assert.match(t, /ad spend rose by 20% to \$1,200/);
  assert.match(t, /sales fell by 20% to 20/);
  assert.match(t, /CTR remained stable|Ctr remained stable|CTR/);
  assert.doesNotMatch(t, /good|bad|improv|worse|success|because/i);
  const u = describeDynamics({ platforms, previous, kind: 'ecom', names: { meta: 'Meta Ads' }, unequal: true });
  assert.doesNotMatch(u, /ad spend rose/);
  assert.match(u, /differ in length/);
  assert.match(describeDynamics({ platforms, previous: null, kind: 'ecom', names: { meta: 'Meta Ads' } }), /during the period, ad spend was \$1,200/);
  assert.match(describeDynamics({ platforms: { google: { total: { spend: 0, impressions: 0, clicks: 0 } } }, previous: null, names: { google: 'Google Ads' } }), /no ad delivery/);
});

await ok('agent run: makes a draft report with the dynamics text, a deck, an event, and unlocks', async () => {
  const repo = fakeRepo();
  const r = await runProjectReport({ repo, post, projectId: 3, periodType: 'weekly', trigger: 'manual', startedBy: 'me@x.y', today: '2026-10-15' });
  assert.equal(r.status, 'ok');
  assert.equal(repo.log.reports[0].source, 'agent');
  assert.equal(repo.log.reports[0].status, 'draft');
  assert.match(repo.log.reports[0].data.sections.conclusion, /^Meta Ads: /);
  assert.equal(repo.log.reports[0].data.sections.plans, '');
  assert.match(repo.log.reports[0].data.sections.whatWasDone, /Test RTS/);
  assert.equal(repo.log.decks.length, 1);
  assert.equal(repo.log.decks[0].platform, 'meta');
  assert.ok(repo.log.decks[0].deck.slides.length >= 5);
  assert.ok(repo.log.events.some((e) => e.kind === 'report_created' && e.status === 'ok'));
  assert.equal(repo.log.runs[0].status, 'ok');
  assert.equal(repo.log.unlocked, 1);
});
await ok('agent run: a report made by hand or already reviewed is never touched', async () => {
  const repo = fakeRepo({ existingReport: { id: 5, source: 'manual', status: 'draft' } });
  const r = await runProjectReport({ repo, post, projectId: 3, periodType: 'weekly', today: '2026-10-15' });
  assert.equal(r.status, 'skipped');
  assert.equal(repo.log.reports.length, 0);
  const reviewed = fakeRepo({ existingReport: { id: 5, source: 'agent', status: 'reviewed' } });
  assert.equal((await runProjectReport({ repo: reviewed, post, projectId: 3, periodType: 'weekly', today: '2026-10-15' })).status, 'skipped');
});
await ok('agent run: an earlier agent draft is regenerated; a hand-made deck is kept', async () => {
  const repo = fakeRepo({ existingReport: { id: 5, source: 'agent', status: 'draft' }, existingDeck: { id: 9, source: 'manual' } });
  const r = await runProjectReport({ repo, post, projectId: 3, periodType: 'weekly', today: '2026-10-15' });
  assert.equal(r.status, 'ok');
  assert.equal(repo.log.reports.length, 1);
  assert.equal(repo.log.decks.length, 0);
  assert.ok(r.notes.some((n) => /створена вручну/.test(n)));
});
await ok('agent run: skips when another run holds the project, or when the cron finds it switched off', async () => {
  assert.equal((await runProjectReport({ repo: fakeRepo({ locked: false }), post, projectId: 3, periodType: 'weekly', today: '2026-10-15' })).status, 'skipped');
  const off = fakeRepo({ agent: { enabled: false, config: {} } });
  assert.equal((await runProjectReport({ repo: off, post, projectId: 3, periodType: 'weekly', trigger: 'cron', today: '2026-10-15' })).status, 'skipped');
  assert.equal(off.log.unlocked, 0);
});
await ok('agent run: when no platform answers it ends as a problem, says why, marks the agent unhealthy and still unlocks', async () => {
  const repo = fakeRepo();
  const broken = async () => { throw new Error('Сесія недійсна'); };
  const r = await runProjectReport({ repo, post: broken, projectId: 3, periodType: 'weekly', today: '2026-10-15' });
  assert.equal(r.status, 'problem');
  assert.match(r.message, /Не вдалося отримати дані/);
  assert.equal(repo.log.reports.length, 0);
  assert.equal(repo.log.health.at(-1).health, 'problem');
  assert.equal(repo.log.unlocked, 1);
});

// ---- The schedule and the scheduler tick
const { kyivParts, lastScheduled, nextScheduled, isDue } = await import('../src/lib/agentSchedule.js');
const { runDueAgents } = await import('../api/_lib/agentTick.js');
const SCHED = { weeklyDay: 1, weeklyTime: '09:00', monthlyDay: 1, monthlyTime: '09:00' };

await ok('schedule: the latest scheduled moment is read on the Kyiv clock', () => {
  assert.deepEqual(kyivParts(new Date('2026-10-08T12:00:00Z')), { date: '2026-10-08', weekday: 4, minutes: 15 * 60 });
  assert.equal(lastScheduled('weekly', SCHED, new Date('2026-10-08T12:00:00Z')).date, '2026-10-05'); // Thursday → this Monday
  assert.equal(lastScheduled('weekly', SCHED, new Date('2026-10-05T05:00:00Z')).date, '2026-09-28'); // Monday 08:00 Kyiv, before 09:00 → last Monday
  assert.equal(lastScheduled('weekly', SCHED, new Date('2026-10-05T07:00:00Z')).date, '2026-10-05'); // Monday 10:00 Kyiv → today
  assert.equal(lastScheduled('monthly', SCHED, new Date('2026-10-08T12:00:00Z')).date, '2026-10-01');
  assert.equal(lastScheduled('monthly', SCHED, new Date('2026-10-01T05:00:00Z')).date, '2026-09-01');
  assert.equal(lastScheduled('monthly', { ...SCHED, monthlyDay: 15 }, new Date('2026-01-10T12:00:00Z')).date, '2025-12-15');
  assert.equal(lastScheduled('weekly', SCHED, new Date('2026-10-05T07:00:00Z')).at.toISOString(), '2026-10-05T06:00:00.000Z'); // 09:00 Kyiv summer = 06:00 UTC
});
await ok('schedule: the next scheduled moment', () => {
  assert.equal(nextScheduled('weekly', SCHED, new Date('2026-10-08T12:00:00Z')).date, '2026-10-12');
  assert.equal(nextScheduled('monthly', SCHED, new Date('2026-10-08T12:00:00Z')).date, '2026-11-01');
  assert.equal(nextScheduled('weekly', { ...SCHED, weeklyDay: 5, weeklyTime: '17:30' }, new Date('2026-10-08T12:00:00Z')).date, '2026-10-09');
});

const startOf = (type, date) => dueReportPeriod(type, date).period.start;
const NOW = new Date('2026-10-08T12:00:00Z'); // Thursday afternoon; the weekly report was due on Monday 5 Oct for week 1–4 Oct
const agentRow = (over = {}) => ({ project_id: 3, enabled: true, enabled_since: '2026-09-01T00:00:00Z', config: { tasks: { weeklyReport: true, monthlyReport: true }, schedule: SCHED }, ...over });
await ok('isDue: due once its moment has passed, not before the agent was switched on, not when already done', () => {
  const dueStartOf = (d) => startOf('weekly', d);
  assert.equal(isDue({ periodType: 'weekly', agent: agentRow(), runs: [], now: NOW, dueStartOf }).due, true);
  assert.equal(isDue({ periodType: 'weekly', agent: agentRow({ enabled_since: '2026-10-07T00:00:00Z' }), runs: [], now: NOW, dueStartOf }).due, false);
  assert.equal(isDue({ periodType: 'weekly', agent: agentRow({ enabled: false }), runs: [], now: NOW, dueStartOf }).due, false);
  assert.equal(isDue({ periodType: 'weekly', agent: agentRow({ config: { tasks: { weeklyReport: false }, schedule: SCHED } }), runs: [], now: NOW, dueStartOf }).due, false);
  const p = startOf('weekly', '2026-10-05');
  assert.equal(isDue({ periodType: 'weekly', agent: agentRow(), runs: [{ status: 'ok', period_start: p }], now: NOW, dueStartOf }).due, false);
  assert.equal(isDue({ periodType: 'weekly', agent: agentRow(), runs: [{ status: 'skipped', period_start: p }], now: NOW, dueStartOf }).due, false);
  assert.equal(isDue({ periodType: 'weekly', agent: agentRow(), runs: [{ status: 'running', period_start: p, started_at: '2026-10-08T11:55:00Z' }], now: NOW, dueStartOf }).due, false);
  assert.equal(isDue({ periodType: 'weekly', agent: agentRow(), runs: [{ status: 'running', period_start: p, started_at: '2026-10-08T09:00:00Z' }], now: NOW, dueStartOf }).due, true, 'a run that crashed hours ago does not block');
});
await ok('isDue: a failed run is retried after an hour, at most three times', () => {
  const dueStartOf = (d) => startOf('weekly', d);
  const p = startOf('weekly', '2026-10-05');
  const fail = (finished) => ({ status: 'problem', period_start: p, started_at: finished, finished_at: finished });
  assert.equal(isDue({ periodType: 'weekly', agent: agentRow(), runs: [fail('2026-10-08T11:50:00Z')], now: NOW, dueStartOf }).due, false);
  assert.equal(isDue({ periodType: 'weekly', agent: agentRow(), runs: [fail('2026-10-08T09:00:00Z')], now: NOW, dueStartOf }).due, true);
  assert.equal(isDue({ periodType: 'weekly', agent: agentRow(), runs: [fail('2026-10-06T09:00:00Z'), fail('2026-10-07T09:00:00Z'), fail('2026-10-08T09:00:00Z')], now: NOW, dueStartOf }).due, false);
});
await ok('tick: starts due reports with the scheduled day as their date, a few per tick, leaves the rest for the next one', async () => {
  const agents = [3, 4, 5, 6, 7].map((id) => agentRow({ project_id: id, config: { tasks: { weeklyReport: true, monthlyReport: false }, schedule: SCHED } }));
  const started = [];
  const repo = { listEnabledAgents: async () => agents, getRecentRuns: async () => [] };
  const r = await runDueAgents({ repo, now: NOW, batch: 4, runFor: async (job) => { started.push(job); return { status: 'ok', message: 'done' }; } });
  assert.equal(r.checked, 5);
  assert.equal(r.due, 5);
  assert.equal(r.started.length, 4);
  assert.equal(r.waiting, 1);
  assert.ok(started.every((j) => j.periodType === 'weekly' && j.scheduledFor === '2026-10-05'));
  const none = await runDueAgents({ repo: { listEnabledAgents: async () => [], getRecentRuns: async () => [] }, now: NOW, runFor: async () => { throw new Error('must not run'); } });
  assert.deepEqual([none.checked, none.due, none.started.length], [0, 0, 0]);
  const boom = await runDueAgents({ repo: { listEnabledAgents: async () => [agents[0]], getRecentRuns: async () => [] }, now: NOW, runFor: async () => { throw new Error('x'); } });
  assert.equal(boom.started[0].status, 'problem');
});

await ok('notifications: a finished draft and a problem go to the chosen people, not to the one who started the run, and a problem is not repeated', async () => {
  const withPeople = { enabled: true, config: { notify: true, notifyEmails: ['Boss@x.y', 'me@x.y', 'boss@x.y'] } };
  const repo = fakeRepo({ agent: withPeople });
  await runProjectReport({ repo, post, projectId: 3, periodType: 'weekly', trigger: 'manual', startedBy: 'me@x.y', today: '2026-10-15' });
  assert.deepEqual(repo.log.notifications.map((n) => n.recipient_email), ['boss@x.y']);
  assert.equal(repo.log.notifications[0].type, 'project_report');
  assert.equal(repo.log.notifications[0].link, '/projects/3?tab=weekly&platform=meta');
  assert.match(repo.log.notifications[0].body, /^Mellowdiamond: Створено чернетку/);

  const cron = fakeRepo({ agent: withPeople });
  await runProjectReport({ repo: cron, post, projectId: 3, periodType: 'monthly', trigger: 'cron', today: '2026-10-15' });
  assert.equal(cron.log.notifications.length, 2);
  assert.equal(cron.log.notifications[0].link, '/projects/3?tab=monthly&platform=meta');

  const broken = async () => { throw new Error('Сесія недійсна'); };
  const bad = fakeRepo({ agent: withPeople });
  await runProjectReport({ repo: bad, post: broken, projectId: 3, periodType: 'weekly', trigger: 'cron', today: '2026-10-15' });
  assert.equal(bad.log.notifications[0].type, 'project_agent_problem');
  assert.equal(bad.log.notifications[0].link, '/projects/3?tab=agent');
  const quiet = fakeRepo({ agent: withPeople, recentNotice: true });
  await runProjectReport({ repo: quiet, post: broken, projectId: 3, periodType: 'weekly', trigger: 'cron', today: '2026-10-15' });
  assert.equal(quiet.log.notifications.length, 0);

  const off = fakeRepo({ agent: { enabled: true, config: { notify: false, notifyEmails: ['boss@x.y'] } } });
  await runProjectReport({ repo: off, post, projectId: 3, periodType: 'weekly', trigger: 'cron', today: '2026-10-15' });
  assert.equal(off.log.notifications.length, 0);
  const nobody = fakeRepo({ agent: { enabled: true, config: {} } });
  await runProjectReport({ repo: nobody, post, projectId: 3, periodType: 'weekly', trigger: 'cron', today: '2026-10-15' });
  assert.equal(nobody.log.notifications.length, 0);
  const skipped = fakeRepo({ agent: withPeople, existingReport: { id: 5, source: 'manual', status: 'draft' } });
  await runProjectReport({ repo: skipped, post, projectId: 3, periodType: 'weekly', trigger: 'cron', today: '2026-10-15' });
  assert.equal(skipped.log.notifications.length, 0);
});

const { summarize, windows } = await import('../src/lib/aiUsageStats.js');
await ok('spend stats: totals by window, agent, project and day on the Kyiv clock; problems listed', () => {
  const now = new Date('2026-10-09T10:00:00Z'); // Fri 13:00 Kyiv
  const c = (iso, agent, cost, extra = {}) => ({ id: iso + agent, created_at: iso, agent_key: agent, project_id: null, status: 'ok', input_tokens: 1000, output_tokens: 100, cache_read_tokens: 0, cache_write_tokens: 0, cost_usd: cost, retries: 0, duration_ms: 2000, ...extra });
  const calls = [
    c('2026-10-09T08:00:00Z', 'followup', 0.02),
    c('2026-10-09T08:30:00Z', 'project-report', 0.01, { project_id: 3, retries: 2 }),
    c('2026-10-08T21:30:00Z', 'followup', 0.5), // 9 Oct 00:30 Kyiv: still "today"
    c('2026-10-08T20:30:00Z', 'followup', 1), // 8 Oct 23:30 Kyiv: yesterday, same week and month
    c('2026-10-02T10:00:00Z', 'followup', 2), // within 7 days? 2 Oct is 7 days back: outside the 7-day window
    c('2026-09-20T10:00:00Z', 'followup', 4, { status: 'error', error: 'overloaded' }), // last month
  ];
  const s = summarize(calls, { now });
  assert.equal(windows(now).today.toISOString(), '2026-10-08T21:00:00.000Z');
  assert.equal(s.total.today.cost, 0.53);
  assert.equal(s.total.today.calls, 3);
  assert.equal(s.total.week.cost, 1.53);
  assert.equal(s.total.month.cost, 3.53);
  assert.equal(s.total.month.retries, 2);
  assert.deepEqual(s.byAgent.map((a) => [a.key, a.calls]), [['followup', 4], ['project-report', 1]]);
  assert.equal(s.byAgent[1].name, 'AI-агент проєктів');
  assert.equal(s.byProject[0].id, 3);
  assert.equal(s.byDay.length, 30);
  assert.equal(s.byDay.at(-1).cost, 0.53);
  assert.equal(s.problems.length, 1);
  assert.equal(s.problems[0].error, 'overloaded');
  assert.equal(s.spent.day, 0.53);
});

await ok('smm: request validation caps the run and rejects nonsense', () => {
  assert.ok(validRequest({ platforms: [], weekStart: '2026-10-19' }).errors.length);
  assert.ok(validRequest({ platforms: [{ platform: 'myspace', count: 2 }], weekStart: '2026-10-19' }).errors.length);
  assert.ok(validRequest({ platforms: [{ platform: 'instagram', count: 7 }, { platform: 'linkedin', count: 7 }], weekStart: '2026-10-19' }).errors.length);
  const v = validRequest({ platforms: [{ platform: 'instagram', count: 3 }, { platform: 'linkedin', count: 2 }], weekStart: '2026-10-19', language: 'xx' });
  assert.deepEqual(v.errors, []);
  assert.equal(v.language, 'en');
});

await ok('smm: the prompt carries the safety rules, the brand and the counts', () => {
  const { system, user } = buildPrompts({ brand: { voice: 'Direct, calm', materials: 'We run Meta and Google ads.' }, competitors: [{ name: 'Acme', notes: 'loud' }], platforms: [{ platform: 'instagram', count: 2 }, { platform: 'threads', count: 1 }], language: 'uk', focus: 'reporting', weekStart: '2026-10-19', recentTopics: ['Old topic'] });
  assert.match(system, /Never invent facts/);
  assert.match(system, /Never present an invented event/);
  assert.match(system, /retell a case[\s\S]*ONLY the figures/);
  assert.match(system, /Ukrainian/);
  assert.match(user, /2 for Instagram, 1 for Threads \(3 posts\)/);
  assert.match(user, /Direct, calm/);
  assert.match(user, /Old topic/);
  assert.match(buildPrompts({ platforms: [{ platform: 'threads', count: 1 }], weekStart: '2026-10-19', rejections: ['too salesy'] }).user, /rejected earlier posts[\s\S]*too salesy/);
  assert.match(buildPrompts({ platforms: [{ platform: 'linkedin', count: 1 }], weekStart: '2026-10-19' }).user, /brand profile is still empty/);
});

await ok('smm: the answer is read back strictly (fences, extra text, wrong network, short body, per-network cap)', () => {
  const raw = '```json\n' + JSON.stringify({ posts: [
    { platform: 'instagram', format: 'carousel', topic: 'A', body: 'x'.repeat(60), hashtags: '#a', visual_brief: 'slides', day: 1, time: '9:05' },
    { platform: 'instagram', format: 'weird', topic: 'B', body: 'y'.repeat(60), day: 9 },
    { platform: 'instagram', topic: 'C', body: 'z'.repeat(60) },
    { platform: 'tiktok', topic: 'D', body: 'w'.repeat(60) },
    { platform: 'threads', topic: 'E', body: 'short' },
  ] }) + '\n```';
  const posts = parsePosts(raw, [{ platform: 'instagram', count: 2 }, { platform: 'threads', count: 1 }]);
  assert.equal(posts.length, 2); // 3rd instagram over the cap, tiktok not requested, threads body too short
  assert.equal(posts[0].format, 'carousel');
  assert.equal(posts[0].time, '09:05');
  assert.equal(posts[1].format, 'image'); // unknown format falls back
  assert.equal(posts[1].day, null);
  assert.deepEqual(parsePosts('nothing useful', [{ platform: 'instagram', count: 1 }]), []);
  assert.equal(parsePosts('Here you go: ' + JSON.stringify({ posts: [{ platform: 'linkedin', body: 'q'.repeat(40) }] }) + ' enjoy', [{ platform: 'linkedin', count: 1 }]).length, 1);
});

await ok('smm: posts are scheduled on the Kyiv clock, the next week starts on Monday', () => {
  const [a, b] = scheduleFor([{ platform: 'instagram', day: 1, time: '18:00' }, { platform: 'linkedin', day: null, time: '09:30' }], '2026-10-19');
  assert.equal(a.scheduled_for, '2026-10-20T15:00:00.000Z'); // 18:00 Kyiv (UTC+3 in October) on Tuesday
  assert.equal(b.scheduled_for, '2026-10-20T06:30:00.000Z'); // no day given: spread over the week by order (2nd post -> Tuesday)
  assert.equal(nextMonday('2026-10-13', 2), '2026-10-19'); // Tuesday -> next Monday
  assert.equal(nextMonday('2026-10-12', 1), '2026-10-19'); // Monday -> a week ahead
  assert.equal(nextMonday('2026-10-18', 7), '2026-10-19'); // Sunday
});

await ok('competitors: internal and unsafe addresses are refused (before and after DNS)', async () => {
  const pub = async () => [{ address: '93.184.216.34' }];
  for (const bad of ['http://localhost/x', 'http://127.0.0.1/', 'http://10.0.0.5/', 'http://169.254.169.254/latest/meta-data', 'http://[::1]/', 'ftp://example.com', 'https://user:pw@example.com', 'https://example.com:8080', 'http://intranet', 'http://foo.internal']) {
    await assert.rejects(() => assertPublicUrl(bad, pub), undefined, bad);
  }
  await assert.rejects(() => assertPublicUrl('https://sneaky.example.com', async () => [{ address: '192.168.1.10' }]), /Внутрішні/);
  await assert.rejects(() => assertPublicUrl('https://dual.example.com', async () => [{ address: '93.184.216.34' }, { address: '10.1.1.1' }]), /Внутрішні/);
  assert.equal((await assertPublicUrl('example.com', pub)).toString(), 'https://example.com/');
});

await ok('competitors: robots.txt is honoured (disallow, longer allow wins, own group first)', () => {
  const txt = 'User-agent: *\nDisallow: /private\nAllow: /private/open\n\nUser-agent: MonarchiSMMBot\nDisallow: /blog\n';
  assert.equal(robotsAllows(txt, '/blog/post'), false);
  assert.equal(robotsAllows(txt, '/private'), true); // our own group applies, not "*"
  assert.equal(robotsAllows('User-agent: *\nDisallow: /private\nAllow: /private/open\n', '/private/open/x'), true);
  assert.equal(robotsAllows('User-agent: *\nDisallow: /private\n', '/private/a'), false);
  assert.equal(robotsAllows('User-agent: *\nDisallow: /\n', '/'), false);
  assert.equal(robotsAllows('', '/anything'), true);
});

await ok('competitors: a page is read to text, links, and the right extra pages are picked', () => {
  const html = '<html><head><title>Acme &amp; Co</title><meta name="description" content="We grow shops"><style>.x{}</style></head><body><nav><a href="/menu">Menu</a></nav><h1>Paid ads for shops</h1><p>We run Meta ads.</p><script>alert(1)</script><a href="/blog/why-roas">Blog: why ROAS</a><a href="/blog/why-roas">dup</a><a href="/services/meta">Services</a><a href="https://other.com/blog/x">out</a><a href="/files/deck.pdf">pdf</a><a href="/contact">Contact</a><footer>Copyright</footer></body></html>';
  const p = readHtml(html, 'https://acme.example/');
  assert.equal(p.title, 'Acme & Co');
  assert.equal(p.description, 'We grow shops');
  assert.match(p.text, /Paid ads for shops/);
  assert.doesNotMatch(p.text, /alert|Copyright|Menu/);
  assert.deepEqual(pickPages(p.links, 'https://acme.example/'), ['https://acme.example/blog/why-roas', 'https://acme.example/services/meta']);
});

await ok('competitors: a whole site is read with a stand-in network, redirects to private hosts are stopped', async () => {
  const headers = (o) => ({ get: (k) => o[k.toLowerCase()] ?? null });
  const empty = { status: 404, ok: false, headers: headers({}), arrayBuffer: async () => new ArrayBuffer(0) };
  const page = (body, status = 200) => ({ status, ok: status < 400, headers: headers({ 'content-type': 'text/html' }), arrayBuffer: async () => new TextEncoder().encode(body).buffer });
  const site = {
    'https://acme.example/': page('<title>Home</title><h1>Hello</h1><a href="/blog/a">Blog</a><a href="/about">About</a>'),
    'https://acme.example/blog/a': page('<title>Post A</title><p>All about ads</p>'),
    'https://acme.example/about': page('nope', 500),
  };
  const fetchFn = async (url) => site[url] || empty;
  const lookup = async () => [{ address: '93.184.216.34' }];
  const r = await readSite('acme.example', { fetchFn, lookup });
  assert.equal(r.blockedByRobots, false);
  assert.deepEqual(r.pages.map((p) => [p.url, p.ok]), [['https://acme.example/', true], ['https://acme.example/blog/a', true], ['https://acme.example/about', false]]);
  assert.match(r.pages[1].text, /All about ads/);
  // a redirect to an internal address must be refused
  const evil = async (url) => (url.endsWith('robots.txt') ? empty : { status: 302, ok: false, headers: headers({ location: 'http://169.254.169.254/' }), arrayBuffer: async () => new ArrayBuffer(0) });
  await assert.rejects(() => readSite('evil.example', { fetchFn: evil, lookup }), /Внутрішні/);
  // robots.txt that forbids everything
  const closed = async (url) => (url.endsWith('robots.txt') ? { status: 200, ok: true, headers: headers({ 'content-type': 'text/plain' }), arrayBuffer: async () => new TextEncoder().encode('User-agent: *\nDisallow: /').buffer } : page('x'));
  assert.equal((await readSite('closed.example', { fetchFn: closed, lookup })).blockedByRobots, true);
});

await ok('competitors: the analysis answer is read back and summed up for the strategist', () => {
  const a = parseAnalysis('Sure:\n```json\n' + JSON.stringify({ positioning: 'Ads for shops', offers: ['Meta ads', 'Reporting'], content_themes: ['ROAS', 'Creatives'], weaknesses: ['No cases'], post_ideas: [{ topic: 'ROAS myths', angle: 'with a real checklist' }, { angle: 'no topic' }], limits: 'no prices' }) + '\n```');
  assert.equal(a.post_ideas.length, 1);
  assert.deepEqual(a.offers, ['Meta ads', 'Reporting']);
  assert.equal(parseAnalysis('nothing'), null);
  assert.equal(parseAnalysis('{"foo": 1}'), null);
  const line = insightLine('Acme', a);
  assert.equal(line, 'Acme: positioning: Ads for shops | they write about: ROAS; Creatives | gaps: No cases | ideas for us: ROAS myths (with a real checklist)');
  assert.equal(insightLine('X', null), '');
  const { user } = buildPrompts({ competitors: [{ name: 'Acme', insight: line }], platforms: [{ platform: 'threads', count: 1 }], weekStart: '2026-10-19' });
  assert.match(user, /competitor agent learned[\s\S]*ROAS myths/);
  const prompt = buildAnalysisPrompts({ name: 'Acme', website: 'acme.example' }, [{ ok: true, url: 'https://acme.example/', title: 'Home', text: 'Hello' }, { ok: false, url: 'https://acme.example/x' }]);
  assert.match(prompt.user, /Page 1: https:\/\/acme.example\//);
  assert.doesNotMatch(prompt.user, /Page 2/);
});

// ---- a tiny in-memory stand-in for the Supabase client: just the calls the SMM run uses
function fakeDb(tables) {
  const T = (n) => (tables[n] ||= []);
  const splitTop = (str) => { const out = []; let depth = 0; let cur = ''; for (const ch of str) { if (ch === '(') depth += 1; if (ch === ')') depth -= 1; if (ch === ',' && depth === 0) { out.push(cur); cur = ''; } else cur += ch; } out.push(cur); return out; };
  const matchOr = (row, clause) => splitTop(clause).some((part) => {
    if (part.startsWith('and(')) return splitTop(part.slice(4, -1)).every((p) => matchOr(row, p));
    const [col, op, ...rest] = part.split('.');
    const val = rest.join('.');
    return op === 'eq' ? String(row[col]) === val : op === 'lt' ? row[col] != null && new Date(row[col]) < new Date(val) : false;
  });
  return {
    from(name) {
      const q = { mode: 'select', filters: [], patch: null, rows: null, limitN: null, order: null };
      const run = () => {
        const rows = T(name);
        const pass = (r) => q.filters.every((f) => f(r));
        if (q.mode === 'insert') { const made = q.rows.map((r, i) => ({ id: rows.length + i + 1, ...r })); rows.push(...made); return { data: made, error: null }; }
        if (q.mode === 'update') { const hit = rows.filter(pass); hit.forEach((r) => Object.assign(r, q.patch)); return { data: hit, error: null }; }
        let out = rows.filter(pass);
        if (q.order && q.asc) out = [...out].sort((a, b) => (String(a[q.order]) > String(b[q.order]) ? 1 : String(a[q.order]) < String(b[q.order]) ? -1 : 0));
        else if (q.order) out = [...out].sort((a, b) => (String(b[q.order]) > String(a[q.order]) ? 1 : -1));
        if (q.limitN) out = out.slice(0, q.limitN);
        return { data: out, error: null };
      };
      const api = {
        select() { return api; },
        insert(r) { q.mode = 'insert'; q.rows = Array.isArray(r) ? r : [r]; return api; },
        update(p) { q.mode = 'update'; q.patch = p; return api; },
        eq(c, v) { q.filters.push((r) => r[c] === v); return api; },
        neq(c, v) { q.filters.push((r) => r[c] !== v); return api; },
        in(c, vs) { q.filters.push((r) => vs.includes(r[c])); return api; },
        not(c, op, v) { q.filters.push((r) => (op === 'is' && v === null ? r[c] != null : true)); return api; },
        or(clause) { q.filters.push((r) => matchOr(r, clause)); return api; },
        gte(c, v) { q.filters.push((r) => r[c] != null && String(r[c]) >= String(v)); return api; },
        ilike(c, v) { q.filters.push((r) => String(r[c] || '').toLowerCase() === String(v).toLowerCase()); return api; },
        order(c, o) { q.order = c; q.asc = o?.ascending === true; return api; },
        limit(n) { q.limitN = n; return api; },
        single() { const r = run(); return Promise.resolve({ data: r.data[0] || null, error: r.data[0] ? null : { message: 'no row' } }); },
        maybeSingle() { const r = run(); return Promise.resolve({ data: r.data[0] || null, error: null }); },
        then(res, rej) { return Promise.resolve(run()).then(res, rej); },
      };
      return api;
    },
  };
}
const goodPost = (platform, n) => ({ platform, format: 'text', topic: `Topic ${platform} ${n}`, body: `A useful post number ${n} for ${platform}, long enough to pass the check.`, hashtags: '#a', visual_brief: '', fact_check: '', day: n % 5, time: '10:00' });
const fakeModel = (answer) => ({ calls: [], async callModel(args) { this.calls.push(args.agentKey); return { text: answer(args) }; } });

await ok('smm autopilot: when is it due (weekday and time on the Kyiv clock, enabled_since, retries, lease)', () => {
  const base = { enabled: true, weekday: 5, time: '12:00', enabled_since: '2026-10-12T00:00:00Z', last_scheduled: null, attempts: 0, last_status: null, run_state: 'idle' };
  const fri13 = new Date('2026-10-16T10:00:00Z'); // 13:00 Kyiv on Friday
  const fri11 = new Date('2026-10-16T08:00:00Z'); // 11:00 Kyiv on Friday, the moment has not come yet
  assert.equal(smmDue({ settings: { ...base, enabled: false }, now: fri13 }).due, false);
  assert.deepEqual(smmDue({ settings: base, now: fri13 }), { due: true, scheduledFor: '2026-10-16' });
  assert.equal(smmDue({ settings: base, now: fri11 }).due, false); // it was before the autopilot was switched on
  assert.equal(smmDue({ settings: { ...base, last_scheduled: '2026-10-16', last_status: 'ok' }, now: fri13 }).due, false);
  const failed = { ...base, last_scheduled: '2026-10-16', last_status: 'problem', attempts: 1, last_attempt_at: '2026-10-16T09:40:00Z' };
  assert.equal(smmDue({ settings: failed, now: fri13 }).due, false); // 20 minutes after a failure: wait
  assert.equal(smmDue({ settings: { ...failed, last_attempt_at: '2026-10-16T08:30:00Z' }, now: fri13 }).due, true); // an hour later: retry
  assert.equal(smmDue({ settings: { ...failed, attempts: 3, last_attempt_at: '2026-10-16T05:00:00Z' }, now: fri13 }).due, false); // out of tries
  assert.equal(smmDue({ settings: { ...base, run_state: 'running', lease_until: '2026-10-16T10:05:00Z' }, now: fri13 }).due, false);
  assert.equal(smmDue({ settings: { ...base, run_state: 'running', lease_until: '2026-10-16T09:00:00Z' }, now: fri13 }).due, true); // a crashed run's claim has expired
});

await ok('smm autopilot: one run refreshes a stale competitor, writes next week into the queue, notifies, and records the outcome', async () => {
  const tables = {
    smm_settings: [{ id: 1, enabled: true, run_state: 'idle', lease_until: null, weekday: 5, time: '12:00', language: 'en', counts: { linkedin: 2, instagram: 1, threads: 0, facebook: 0, tiktok: 0 }, refresh_competitors: true, notify_emails: ['A@x.com', 'a@x.com', 'b@x.com'], last_scheduled: null, attempts: 0 }],
    smm_brand: [{ id: 1, voice: 'Direct', materials: 'Fact one.' }],
    smm_competitors: [{ id: 7, name: 'Acme', website: 'acme.example', notes: '' }, { id: 8, name: 'NoSite', website: '', notes: '' }],
    smm_competitor_reports: [], smm_posts: [], notifications: [],
  };
  const db = fakeDb(tables);
  const model = fakeModel((a) => (a.agentKey === 'smm-competitors'
    ? JSON.stringify({ positioning: 'Ads for shops', offers: ['Meta ads'], content_themes: ['ROAS'], post_ideas: [{ topic: 'ROAS myths', angle: 'a checklist' }] })
    : JSON.stringify({ posts: [goodPost('linkedin', 1), goodPost('linkedin', 2), goodPost('instagram', 3)] })));
  const read = async () => ({ pages: [{ url: 'https://acme.example/', title: 'Home', ok: true, text: 'We sell ads.' }], blockedByRobots: false });
  const r = await runSmmWeekly({ db, model, settings: tables.smm_settings[0], scheduledFor: '2026-10-16', email: 'agent@x.com', now: new Date('2026-10-16T10:00:00Z'), read });
  assert.equal(r.status, 'ok');
  assert.equal(r.weekStart, '2026-10-19'); // the Monday after the scheduled Friday
  assert.deepEqual(model.calls, ['smm-competitors', 'smm-content']); // the competitor with a site was refreshed first, the one without a site was skipped
  assert.equal(tables.smm_competitor_reports.length, 1);
  assert.equal(tables.smm_posts.length, 3);
  assert.ok(tables.smm_posts.every((p) => p.status === 'needs_review' && p.source === 'agent' && p.created_by === 'agent@x.com' && p.language === 'en'));
  assert.deepEqual(tables.notifications.map((n) => n.recipient_email).sort(), ['a@x.com', 'b@x.com']); // de-duplicated, lower-cased
  assert.equal(tables.notifications[0].link, '/automation/smm?tab=queue');
  const s = tables.smm_settings[0];
  assert.deepEqual([s.run_state, s.last_status, s.last_scheduled, s.attempts], ['idle', 'ok', '2026-10-16', 1]);
  // the same instant a second time: the claim is free again, but smmDue says it is already done
  assert.equal(smmDue({ settings: s, now: new Date('2026-10-16T10:30:00Z') }).due, false);
});

await ok('smm autopilot: a bad model answer is a problem, retried later, and people are told only after the last try', async () => {
  const tables = {
    smm_settings: [{ id: 1, enabled: true, run_state: 'idle', lease_until: null, weekday: 5, time: '12:00', language: 'en', counts: { linkedin: 1 }, refresh_competitors: false, notify_emails: ['a@x.com'], last_scheduled: null, attempts: 0 }],
    smm_brand: [{ id: 1 }], smm_competitors: [], smm_competitor_reports: [], smm_posts: [], notifications: [],
  };
  const db = fakeDb(tables);
  const model = fakeModel(() => 'Sorry, I cannot do that.');
  const t = (iso) => new Date(iso);
  let r = await runSmmWeekly({ db, model, settings: tables.smm_settings[0], scheduledFor: '2026-10-16', email: 'agent@x.com', now: t('2026-10-16T10:00:00Z'), read: async () => ({ pages: [] }) });
  assert.equal(r.status, 'problem');
  assert.equal(tables.smm_posts.length, 0);
  assert.equal(tables.notifications.length, 0); // first failure: quiet, a retry follows
  assert.equal(tables.smm_settings[0].attempts, 1);
  r = await runSmmWeekly({ db, model, settings: { ...tables.smm_settings[0] }, scheduledFor: '2026-10-16', email: 'agent@x.com', now: t('2026-10-16T11:10:00Z'), read: async () => ({ pages: [] }) });
  r = await runSmmWeekly({ db, model, settings: { ...tables.smm_settings[0] }, scheduledFor: '2026-10-16', email: 'agent@x.com', now: t('2026-10-16T12:20:00Z'), read: async () => ({ pages: [] }) });
  assert.equal(tables.smm_settings[0].attempts, 3);
  assert.equal(tables.notifications.length, 1); // told once, after the third failure
  assert.equal(tables.notifications[0].type, 'project_agent_problem');
  // while a run holds the claim, a second one does not start
  tables.smm_settings[0].run_state = 'running'; tables.smm_settings[0].lease_until = '2026-10-16T13:00:00Z';
  const blocked = await runSmmWeekly({ db, model, settings: tables.smm_settings[0], scheduledFor: '2026-10-23', email: 'agent@x.com', now: t('2026-10-16T12:30:00Z'), read: async () => ({ pages: [] }) });
  assert.equal(blocked.status, 'skipped');
});

await ok('seo: a page is read for what search engines look at', () => {
  const html = '<!doctype html><html lang="uk"><head><title>Мій  сайт &amp; сервіс</title><meta name="description" content="Опис сторінки"><meta name="viewport" content="width=device-width"><meta name="robots" content="NOINDEX, follow"><link rel="canonical" href="https://a.example/page/"><meta property="og:title" content="t"><script type="application/ld+json">{}</script></head><body><nav><a href="/menu">menu</a></nav><h1>Головний заголовок</h1><h2>Підзаголовок</h2><p>Текст сторінки з кількома словами</p><img src="a.jpg" alt="Опис"><img src="b.jpg"><img src="c.jpg" alt=""><a href="/about/">About</a><a href="https://other.com/x">out</a><a href="mailto:a@b.c">mail</a><footer>fine print</footer></body></html>';
  const p = parsePage(html, 'https://a.example/page/', { status: 200, ms: 120, bytes: html.length, xRobots: 'NoIndex' });
  assert.equal(p.title, 'Мій сайт & сервіс');
  assert.equal(p.description, 'Опис сторінки');
  assert.deepEqual(p.h1, ['Головний заголовок']);
  assert.equal(p.canonical, 'https://a.example/page/');
  assert.equal(p.robotsMeta, 'noindex, follow');
  assert.equal(p.xRobots, 'noindex');
  assert.equal(p.lang, 'uk');
  assert.equal(p.viewport, true);
  assert.equal(p.ogTitle, true);
  assert.equal(p.ogImage, false);
  assert.equal(p.jsonLd, 1);
  assert.deepEqual(p.images, { total: 3, noAlt: 2 });
  assert.ok(p.links.includes('https://a.example/about/') && p.links.includes('https://other.com/x') && !p.links.some((l) => l.startsWith('mailto')));
  assert.doesNotMatch(p.excerpt, /fine print|menu/);
});

await ok('seo: the checks find missing and duplicated things and sort by importance', () => {
  const page = (url, o = {}) => ({ url, status: 200, ms: 300, bytes: 5000, title: 'A good page title that is long enough ok', description: 'x'.repeat(130), h1: ['H'], h2Count: 2, canonical: url, robotsMeta: '', xRobots: '', lang: 'en', viewport: true, ogTitle: true, ogImage: true, jsonLd: 1, images: { total: 4, noAlt: 0 }, words: 600, links: [], ...o });
  const pages = [
    page('https://s.example/'),
    page('https://s.example/a/', { title: '', h1: [], description: '', words: 100, robotsMeta: 'noindex' }),
    page('https://s.example/b/', { title: 'Same title for two pages here ok', description: 'y'.repeat(130) }),
    page('https://s.example/c/', { title: 'Same title for two pages here ok', description: 'y'.repeat(130), images: { total: 10, noAlt: 9 }, ms: 4000 }),
    page('https://s.example/gone/', { status: 404 }),
  ];
  const a = auditSite(pages, { robots: null, sitemap: { found: false, urls: 0 }, httpRedirectsToHttps: false, brokenLinks: [{ url: 'https://s.example/x', status: 404, from: ['https://s.example/'] }] });
  const ids = a.findings.map((f) => f.id);
  for (const id of ['status', 'noindex', 'title_missing', 'title_dup', 'desc_missing', 'desc_dup', 'h1_missing', 'thin', 'alt', 'slow', 'broken_links', 'site_robots', 'site_sitemap', 'site_https']) assert.ok(ids.includes(id), id);
  assert.ok(!ids.includes('viewport') && !ids.includes('lang') && !ids.includes('canonical_missing'));
  const sev = a.findings.map((f) => f.severity);
  assert.deepEqual(sev, [...sev].sort((x, y) => ({ high: 0, medium: 1, low: 2 }[x] - { high: 0, medium: 1, low: 2 }[y]))); // high first
  assert.deepEqual(a.findings.find((f) => f.id === 'title_dup').pages.sort(), ['https://s.example/b/', 'https://s.example/c/']);
  assert.equal(a.summary.pages, 5);
  assert.equal(a.summary.ok, 4);
  assert.equal(auditSite([page('https://s.example/')], { robots: 'User-agent: *', sitemap: { found: true, urls: 3 }, httpRedirectsToHttps: true, brokenLinks: [] }).findings.length, 0); // a clean site has no findings
});

await ok('seo: the crawler follows the sitemap, honours robots.txt, finds a broken link, and refuses internal hosts', async () => {
  const headers = (o) => ({ get: (k) => o[k.toLowerCase()] ?? null });
  const html = (body) => ({ status: 200, ok: true, headers: headers({ 'content-type': 'text/html' }), arrayBuffer: async () => new TextEncoder().encode(body).buffer });
  const plain = (body, type = 'text/plain') => ({ status: 200, ok: true, headers: headers({ 'content-type': type }), arrayBuffer: async () => new TextEncoder().encode(body).buffer });
  const nope = { status: 404, ok: false, headers: headers({}), arrayBuffer: async () => new ArrayBuffer(0) };
  const calls = [];
  const site = {
    'https://s.example/robots.txt': plain('User-agent: *\nDisallow: /private\n'),
    'https://s.example/sitemap.xml': plain('<urlset><url><loc>https://s.example/</loc></url><url><loc>https://s.example/a/</loc></url><url><loc>https://s.example/private/x/</loc></url></urlset>', 'application/xml'),
    'https://s.example/': html('<html lang="en"><head><title>Home</title></head><body><h1>Home</h1><a href="/a/">A</a><a href="/missing/">Gone</a></body></html>'),
    'https://s.example/a/': html('<html lang="en"><head><title>A</title></head><body><h1>A</h1></body></html>'),
    'https://s.example/private/x/': html('<html><body>secret</body></html>'),
  };
  const fetchFn = async (url, init) => { calls.push(url); if (url === 'http://s.example/') return { status: 301, ok: false, headers: headers({ location: 'https://s.example/' }), arrayBuffer: async () => new ArrayBuffer(0) }; return site[url] || nope; };
  const r = await crawlSite('https://s.example', { fetchFn, lookup: async () => [{ address: '93.184.216.34' }] });
  assert.deepEqual(r.pages.map((p) => p.url), ['https://s.example/', 'https://s.example/a/']); // the private page was not read
  assert.ok(!calls.includes('https://s.example/private/x/'));
  assert.deepEqual(r.ctx.sitemap, { found: true, urls: 3 });
  assert.equal(r.ctx.httpRedirectsToHttps, true);
  assert.deepEqual(r.ctx.brokenLinks.map((b) => [b.url, b.status]), [['https://s.example/missing/', 404]]);
  await assert.rejects(() => crawlSite('http://127.0.0.1', { fetchFn, lookup: async () => [{ address: '127.0.0.1' }] }), /Внутрішні/);
});

await ok('seo: the plan answer is read back strictly', () => {
  const plan = parsePlan('Here:\n```json\n' + JSON.stringify({ summary: 'Mostly fine.', priorities: [{ title: 'Add H1', why: 'Missing', action: 'Add one', effort: 'low' }, { title: '', why: 'x' }, { title: 'Alt texts', effort: 'weird' }], rewrites: [{ url: 'https://s.example/a/', field: 'title', current: '', proposed: 'A clear title for page A' }, { url: 'u', field: 'h1', proposed: 'no' }, { url: 'u2', field: 'description' }], notes: 'n' }) + '\n```');
  assert.equal(plan.priorities.length, 2);
  assert.equal(plan.priorities[1].effort, 'medium');
  assert.equal(plan.rewrites.length, 1); // only title/description rewrites that propose something
  assert.equal(parsePlan('nothing'), null);
  const { user } = buildPlanPrompts('https://s.example', { findings: [{ id: 'title_missing', severity: 'high', title: 'Немає title', count: 1, pages: ['https://s.example/a/'] }], summary: { pages: 2, high: 1, medium: 0, low: 0 } }, [{ url: 'https://s.example/a/', status: 200, title: '', description: '', h1: [], excerpt: 'About A page' }]);
  assert.match(user, /Немає title[\s\S]*Page text: About A page/);
});

// ---- the agent framework: chain rules, schedule, prompts, readers, and a whole production run on the stand-in database
await ok('agents: an agent is stopped by its own switch or by a REQUIRED upstream agent, never by an optional one', () => {
  const A = (id, enabled) => ({ id, enabled });
  const agents = [A(1, true), A(2, true), A(3, true), A(4, true)];
  const links = [{ from_agent_id: 1, to_agent_id: 2, required: true }, { from_agent_id: 2, to_agent_id: 3, required: true }, { from_agent_id: 4, to_agent_id: 3, required: false }];
  assert.deepEqual(Object.values(chainStates(agents, links)).map((s) => s.state), ['on', 'on', 'on', 'on']);
  agents[0].enabled = false; // 1 off: 2 and, through 2, 3 stop; 4 (an optional input of 3) is unaffected
  const st = chainStates(agents, links);
  assert.deepEqual([st[1].state, st[2].state, st[3].state, st[4].state], ['off', 'blocked', 'blocked', 'on']);
  assert.equal(st[2].blockedBy.id, 1);
  assert.equal(st[3].blockedBy.id, 1); // the reason is the agent to switch back on
  assert.deepEqual(dependents(1, links).sort(), [2, 3]);
  agents[0].enabled = true; agents[3].enabled = false; // an optional upstream agent off: nothing stops
  assert.equal(chainStates(agents, links)[3].state, 'on');
});

await ok('agents: an agent with a schedule is due once per moment, retried after an hour, three tries in all', () => {
  const base = { schedule: { weekday: 3, time: '09:00' }, last_scheduled: null, attempts: 0, last_status: null };
  const wed10 = new Date('2026-10-21T07:00:00Z'); // 10:00 Kyiv on Wednesday
  assert.equal(agentDue({ agent: { ...base, schedule: null }, now: wed10 }).due, false);
  assert.deepEqual(agentDue({ agent: base, now: wed10 }), { due: true, scheduledFor: '2026-10-21' });
  assert.equal(agentDue({ agent: base, now: new Date('2026-10-21T05:00:00Z') }).scheduledFor, '2026-10-14'); // 08:00 Kyiv: the last moment was a week ago
  assert.equal(agentDue({ agent: { ...base, enabled_since: '2026-10-21T06:30:00Z' }, now: wed10 }).due, false); // switched on after 09:00 Kyiv: that moment is not made up for
  assert.equal(agentDue({ agent: { ...base, enabled_since: '2026-10-20T06:30:00Z' }, now: wed10 }).due, true);
  assert.equal(agentDue({ agent: { ...base, last_scheduled: '2026-10-21', last_status: 'ok' }, now: wed10 }).due, false);
  const failed = { ...base, last_scheduled: '2026-10-21', last_status: 'problem', attempts: 1, last_attempt_at: '2026-10-21T06:40:00Z' };
  assert.equal(agentDue({ agent: failed, now: wed10 }).due, false);
  assert.equal(agentDue({ agent: { ...failed, last_attempt_at: '2026-10-21T05:50:00Z' }, now: wed10 }).due, true);
  assert.equal(agentDue({ agent: { ...failed, attempts: 3, last_attempt_at: '2026-10-21T01:00:00Z' }, now: wed10 }).due, false);
});

await ok('agents: the system prompt is the editable instruction plus the locked rules and the answer format of the role', () => {
  const s = composeSystem('copywriter', 'MY EDITABLE TEXT', { language: 'English', platformRules: ['- LinkedIn: rule'] });
  assert.match(s, /^MY EDITABLE TEXT/);
  assert.match(s, /Never invent facts/);
  assert.match(s, /- LinkedIn: rule/);
  assert.match(s, /"body":/);
  const v = composeSystem('visual', 'TEMPLATE');
  assert.match(v, /readable text, logos/); // the visual guardrails are locked, the facts rules are for texts
  assert.doesNotMatch(v, /Never invent facts/);
  assert.equal(composeSystem('seo', 'extra only'), 'extra only'); // roles with their own system prompt: the instruction alone
});

await ok('agents: the readers of the strategist, copywriter, visual agent and controller are strict', () => {
  const platforms = [{ platform: 'linkedin', count: 1 }, { platform: 'instagram', count: 1 }];
  const plan = parseStrategy('```json\n' + JSON.stringify({ summary: 'Week', posts: [
    { platform: 'linkedin', format: 'text', topic: 'Audit first', angle: 'Why audits come first', key_points: ['a', 'b'], day: 1, time: '9:30' },
    { platform: 'linkedin', topic: 'Over the count' }, { platform: 'tiktok', topic: 'Not requested' },
    { platform: 'instagram', format: 'carousel', topic: 'Three checks', angle: 'x', visual_brief: 'slides', day: 9 }] }) + '\n```', platforms);
  assert.deepEqual(plan.posts.map((p) => p.platform), ['linkedin', 'instagram']);
  assert.equal(plan.posts[0].needs_visual, false); // a LinkedIn text post needs no picture
  assert.equal(plan.posts[1].needs_visual, true); // Instagram always does
  assert.equal(plan.posts[0].time, '09:30');
  assert.equal(plan.posts[1].day, null); // an invalid day is dropped, the schedule spreads it
  assert.equal(scheduleStrategy(plan.posts, '2026-10-19')[0].scheduled_for, '2026-10-20T06:30:00.000Z'); // Tuesday 09:30 Kyiv
  assert.equal(parseStrategy('nope', platforms), null);
  assert.equal(parseCopy('{"body":"too short"}'), null);
  assert.equal(parseCopy('{"body":"A text of the post that is long enough.","hashtags":"#a"}').hashtags, '#a');
  const v = parseVisual('{"mode":"video","prompt":"A long enough generation prompt for the model to use.","aspect_ratio":"7:3","duration_seconds":99}', { platform: 'tiktok' });
  assert.deepEqual([v.mode, v.aspect_ratio, v.duration_seconds], ['video', '9:16', 15]);
  assert.equal(parseVisual('{"prompt":"short"}'), null);
  // the controller's rule is in code: a high issue, or three medium ones, is a revise whatever the model says
  assert.equal(parseQc('{"verdict":"pass","issues":[{"target":"text","severity":"high","comment":"Invented figure"}]}').verdict, 'revise');
  assert.equal(parseQc('{"verdict":"pass","issues":[{"severity":"medium","comment":"a"},{"severity":"medium","comment":"b"},{"severity":"medium","comment":"c"}]}').verdict, 'revise');
  assert.equal(parseQc('{"verdict":"pass","issues":[{"severity":"medium","comment":"a"},{"severity":"medium","comment":"b"}]}').verdict, 'pass'); // two medium points are noted, not a reason to send back
  assert.equal(parseQc('{"verdict":"pass","issues":[{"severity":"low","comment":"nit"}]}').verdict, 'pass');
  assert.equal(parseQc('{"verdict":"maybe"}'), null);
  const qc = parseQc('{"verdict":"revise","issues":[{"target":"visual","severity":"high","comment":"No text in the image"},{"target":"text","severity":"low","comment":"nit"}]}');
  assert.deepEqual(decideQc({ qc, rounds: 0, maxRounds: 2, hasVisual: true }), { action: 'rework', targets: ['visual'], unresolved: false });
  assert.deepEqual(decideQc({ qc, rounds: 2, maxRounds: 2, hasVisual: true }), { action: 'to_review', targets: [], unresolved: true }); // out of rounds: the person decides
  assert.deepEqual(feedbackFor(qc, 'text'), []);
  assert.deepEqual(feedbackFor(qc, 'visual'), ['No text in the image']);
});

await ok('agents: a whole run: plan -> approval -> text and visual in parallel -> control -> rework -> the person; switches stop the chain', async () => {
  const tables = { smm_brand: [{ id: 1, voice: 'Direct', materials: 'Fact one.' }], smm_competitors: [], smm_competitor_reports: [], smm_site_audits: [], smm_posts: [], smm_plans: [], ag_agents: [], ag_links: [], ag_prompts: [], ag_prompt_versions: [], ag_tasks: [], ag_runs: [], notifications: [], smm_settings: [] };
  const db = fakeDb(tables);
  const team1 = await ensureSmmTeam(db, 'a@x.com');
  assert.equal(team1.agents.length, 9);
  assert.equal(team1.links.length, 11);
  assert.equal(tables.ag_prompts.length, 9);
  await ensureSmmTeam(db, 'a@x.com'); // idempotent
  assert.deepEqual([tables.ag_agents.length, tables.ag_links.length, tables.ag_prompts.length], [9, 11, 9]);

  const model = {
    calls: [],
    async callModel(args) {
      this.calls.push(args.agentKey);
      const user = args.params.messages[0].content;
      const out = {
        'smm-strategist': { summary: 'A calm week.', posts: [
          { platform: 'linkedin', format: 'text', topic: 'Audit first', angle: 'Why audits come first', key_points: ['one', 'two'], cta: 'Ask a question', day: 1, time: '09:30' },
          { platform: 'instagram', format: 'image', topic: 'Three checks', angle: 'A quick checklist', key_points: ['x'], visual_brief: 'a desk with a laptop', day: 2, time: '18:00' }] },
        'smm-copywriter': { body: /Fix exactly/.test(user) ? 'SECOND DRAFT of the post text, now correct and clear.' : 'FIRST DRAFT of the post text, with a flaw in it.', hashtags: '#a', fact_check: '' },
        'smm-visual': { mode: 'image', prompt: 'A tidy desk with a laptop and a notebook, soft window light, shallow depth of field, muted palette.', negative_prompt: 'text', aspect_ratio: '4:5', style_tags: ['clean'], alt_text: 'A desk' },
        'smm-qc': /FIRST DRAFT/.test(user) && /Instagram/.test(user) ? { verdict: 'revise', summary: 'A flaw', issues: [{ target: 'text', severity: 'high', comment: 'Remove the flaw' }] } : { verdict: 'pass', summary: 'Fine', issues: [] },
      }[args.agentKey];
      return { text: JSON.stringify(out), usage: { input_tokens: 10, output_tokens: 5 }, costUsd: 0.01 };
    },
  };
  const ctx = { db, model, email: 'a@x.com', trigger: 'user', hf: null, now: () => new Date('2026-10-16T10:00:00Z') };
  const on = (...roles) => tables.ag_agents.forEach((a) => { a.enabled = roles.includes(a.role); });
  const role = (r) => tables.ag_agents.find((a) => a.role === r);
  role('strategist').config = { counts: { linkedin: 1, instagram: 1 }, language: 'en', requirePlanApproval: true, notifyEmails: ['p@x.com'] };

  // nothing is on: the queue does nothing
  on();
  let q = await processQueue(ctx);
  assert.equal(q.processed, 0);

  // the strategist is run by hand (it works even while switched off) and waits for the person's OK
  const r = await runNow(ctx, role('strategist').id, { weekStart: '2026-10-19' });
  assert.equal(r.status, 'done');
  assert.equal(tables.smm_plans[0].status, 'awaiting_approval');
  assert.deepEqual(tables.smm_posts.map((p) => p.status), ['planned', 'planned']);
  assert.deepEqual(tables.smm_posts.map((p) => p.needs_visual), [false, true]);
  assert.equal(tables.ag_tasks.filter((t) => t.agent_id !== role('strategist').id).length, 0); // no work for the others before the OK
  assert.equal(tables.notifications[0].recipient_email, 'p@x.com');
  assert.match(tables.ag_runs[0].system_prompt, /^You are the content strategist/); // the editable prompt first...
  assert.match(tables.ag_runs[0].system_prompt, /Never invent facts/); // ...then the locked rules
  assert.match(tables.ag_runs[0].user_prompt, /Week starting 2026-10-19/);

  // the OK: 2 texts + 1 visual are queued
  assert.equal((await approvePlan(ctx, tables.smm_plans[0].id)).started, 2);
  assert.deepEqual(tables.smm_posts.map((p) => p.status), ['producing', 'producing']);
  assert.deepEqual(tables.ag_tasks.filter((t) => t.status === 'queued').map((t) => t.type).sort(), ['visual', 'write', 'write']);

  // the strategist is switched off: the copywriter and the visual agent REQUIRE it, so they stop and their tasks wait
  on('copywriter', 'visual', 'qc');
  q = await processQueue(ctx);
  assert.deepEqual([q.processed, q.waiting], [0, 3]);

  // everything on: the chain runs to the end
  on('strategist', 'copywriter', 'visual', 'qc');
  q = await processQueue(ctx);
  assert.equal(q.failed, 0);
  assert.equal(q.left, 0);
  const li = tables.smm_posts.find((p) => p.platform === 'linkedin');
  const ig = tables.smm_posts.find((p) => p.platform === 'instagram');
  assert.equal(li.status, 'needs_review'); // passed on the first review
  assert.match(li.body, /FIRST DRAFT/);
  assert.equal(li.qc.verdict, 'pass');
  assert.equal(ig.status, 'needs_review'); // sent back once, then passed
  assert.equal(ig.rounds, 1);
  assert.match(ig.body, /SECOND DRAFT/);
  assert.equal(ig.qc.round, 2);
  assert.equal(ig.qc.history[0].verdict, 'revise'); // the first round is kept
  assert.equal(ig.visual_prompt.aspect_ratio, '4:5');
  assert.equal(ig.asset_status, 'none'); // no generator is connected in this run
  const copyRuns = tables.ag_runs.filter((x) => x.agent_id === role('copywriter').id);
  assert.match(copyRuns.find((x) => /Fix exactly/.test(x.user_prompt)).user_prompt, /Remove the flaw/); // the controller's comment reached the copywriter
  assert.ok(tables.ag_tasks.every((t) => t.status === 'done'));
  assert.ok(tables.ag_tasks.filter((t) => t.agent_id === role('copywriter').id).every((t) => t.prompt_version === 1));

  // the schedule: a competitors agent on Wednesday 09:00 starts by itself once
  role('competitors').schedule = { weekday: 3, time: '09:00' };
  on('competitors');
  const wed = { ...ctx, now: () => new Date('2026-10-21T07:00:00Z') };
  q = await processQueue(wed);
  assert.deepEqual(q.started, ['competitors']);
  assert.equal(role('competitors').last_status, 'ok');
  q = await processQueue(wed);
  assert.deepEqual(q.started, []); // not again
});

await ok('higgsfield: requests are built from the visual, status is read, a finished file is kept, failures are reported', async () => {
  const img = buildRequest({ mode: 'image', prompt: 'A desk', negative_prompt: 'text', aspect_ratio: '4:5' });
  assert.equal(img.path, 'higgsfield-ai/soul/standard');
  assert.deepEqual([img.body.aspect_ratio, img.body.resolution], ['3:4', '1080p']); // Soul has no 4:5: the nearest
  assert.match(img.body.prompt, /Avoid: text/);
  const vid = buildRequest({ mode: 'video', prompt: 'A pan', aspect_ratio: '9:16', duration_seconds: 99 });
  assert.deepEqual([vid.path, vid.body.duration, vid.body.aspect_ratio, vid.body.sound], ['kling-video/v3.0/std/text-to-video', 15, '9:16', 'off']);
  const env = { HF_API_KEY_ID: 'id', HF_API_KEY_SECRET: 'sec' };
  const seen = [];
  const fetchFn = async (url, init) => {
    seen.push([url, init?.headers?.Authorization, init?.headers?.['Idempotency-Key']]);
    if (init?.method === 'POST') return { ok: true, status: 200, json: async () => ({ request_id: 'r1', status: 'queued', status_url: 'https://api.higgsfield.ai/requests/r1/status' }) };
    return { ok: true, status: 200, json: async () => (url.endsWith('r1/status') ? { status: 'completed', images: [{ url: 'https://cdn.example/a.png' }] } : { status: 'failed', error: 'bad' }) };
  };
  const job = await hfSubmit({ post: { id: 5, rounds: 0 }, visual: { mode: 'image', prompt: 'A desk', aspect_ratio: '1:1' }, env, fetchFn });
  assert.deepEqual([job.jobId, job.status], ['r1', 'pending']);
  assert.equal(seen[0][1], 'Key id:sec');
  assert.match(seen[0][2], /^smm-post-5-/); // an idempotency key: a retried submit does not pay twice
  assert.deepEqual(await hfCheck({ statusUrl: job.statusUrl, kind: 'image', env, fetchFn }), { state: 'ready', url: 'https://cdn.example/a.png' });
  assert.equal((await hfCheck({ statusUrl: 'https://api.higgsfield.ai/requests/r2/status', kind: 'image', env, fetchFn })).state, 'failed');
  assert.equal((await hfCheck({ statusUrl: 'https://evil.example/x', kind: 'image', env, fetchFn })).state, 'failed'); // only the provider's own host
  // the engine: a pending post becomes ready (file kept via persist) or failed
  const tables = { smm_posts: [
    { id: 1, asset_status: 'pending', asset_kind: 'image', visual_prompt: { prompt: 'p', generation: { status_url: 'u1', at: '2026-10-16T09:50:00Z' } }, updated_at: '2026-10-16T09:50:00Z' },
    { id: 2, asset_status: 'pending', asset_kind: 'image', visual_prompt: { prompt: 'p', generation: { status_url: 'u2', at: '2026-10-16T09:50:00Z' } }, updated_at: '2026-10-16T09:50:00Z' },
    { id: 3, asset_status: 'pending', asset_kind: 'image', visual_prompt: { prompt: 'p', generation: { status_url: 'u3', at: '2026-10-16T08:00:00Z' } }, updated_at: '2026-10-16T08:00:00Z' }] };
  const hf = { async check({ statusUrl }) { return statusUrl === 'u1' ? { state: 'ready', url: 'https://cdn.example/a.png' } : statusUrl === 'u2' ? { state: 'failed', error: 'nsfw' } : { state: 'pending' }; }, async persist({ url, postId }) { return `https://store.example/${postId}.png`; } };
  const n = await pollAssets({ db: fakeDb(tables), hf, now: () => new Date('2026-10-16T10:00:00Z') });
  assert.equal(n, 3);
  assert.deepEqual(tables.smm_posts.map((p) => p.asset_status), ['ready', 'failed', 'failed']); // the third waited more than 45 minutes
  assert.equal(tables.smm_posts[0].asset_url, 'https://store.example/1.png');
  assert.equal(tables.smm_posts[1].visual_prompt.generation_error, 'nsfw');
});

await ok('campaign team: only the agents of the chosen platforms take part, the chain follows the links', () => {
  const names = (pl) => participants(pl).map((r) => r.role);
  assert.ok(names(['meta']).includes('meta_analyst') && !names(['meta']).includes('google_analyst') && !names(['meta']).includes('tiktok_analyst'));
  assert.ok(names(['google']).includes('google_optimizer') && !names(['google']).includes('creative_strategist')); // creative work is Meta / TikTok
  assert.ok(names(['tiktok']).includes('tiktok_analyst') && !names(['tiktok']).includes('tracking_integrity')); // no connection to check
  assert.equal(names(['meta', 'google', 'tiktok']).length, 16);
  assert.ok(linksFor(['google']).every((l) => names(['google']).includes(l.from) && names(['google']).includes(l.to))); // no link to an agent that is not there
  const agents = [1, 2, 3, 4].map((id) => ({ id }));
  const links = [{ from_agent_id: 1, to_agent_id: 2 }, { from_agent_id: 2, to_agent_id: 3 }, { from_agent_id: 4, to_agent_id: 3 }];
  assert.deepEqual(ancestorsOf(3, links).sort(), [1, 2, 4]);
  assert.deepEqual(ancestorsOf(1, links), []);
  assert.match(summaryOf('## Підсумок\nМета: CPA виріс на 20%.\n\n## Деталі\nтекст'), /^Мета: CPA виріс/);
  assert.equal(summaryOf('# Звіт Meta\n\n## Підсумок\n\nCPA виріс.\n\n---\n\n## Деталі\nдовгий текст'), 'CPA виріс.'); // a title above the summary does not swallow it
  assert.equal(summaryOf('Просто текст без заголовків.'), 'Просто текст без заголовків.');
  assert.equal(summaryOf('### Перша секція\nтіло\n\n## Друга\nінше'), 'тіло');
});

await ok('campaign team: ad-account inputs never throw, skip what is not connected and name what failed', async () => {
  const accounts = { google: '222' };
  const g = await fetchBlock('google:campaign:LAST_7_DAYS', accounts, { google: async () => ({ period: { from_date: 'a', to_date: 'b' }, campaigns: [{ name: 'Low', cost: 1 }, { name: 'High', cost: 50 }] }) });
  assert.equal(g.ok, true);
  assert.ok(g.text.indexOf('High') < g.text.indexOf('Low')); // the biggest spend first
  assert.match(g.title, /Google Ads · кампанії · останні 7 днів/);
  const noMeta = await fetchBlock('meta:account:last_7d', accounts, {});
  assert.deepEqual([noMeta.ok, noMeta.skipped], [false, true]);
  const bad = await fetchBlock('google:account:LAST_30_DAYS', accounts, { google: async () => { throw new Error('API access blocked'); } });
  assert.deepEqual([bad.ok, bad.error], [false, 'API access blocked']);
  const noToken = await fetchBlock('meta:account:last_7d', { meta: '111' }, { metaToken: '' });
  assert.match(noToken.error, /META_ACCESS_TOKEN/);
});

await ok('campaign team: launch -> research -> strategy -> analysts -> optimizers and creative -> copy -> control -> report -> client message; pause stops it', async () => {
  const tables = {
    projects: [{ id: 5, name: 'Acme Shop', client: 'Acme LLC' }],
    project_ad_accounts: [{ project_id: 5, platform: 'meta', account_id: '111' }, { project_id: 5, platform: 'google', account_id: '222' }],
    ag_campaigns: [{ id: 1, project_id: 5, name: 'Acme autumn', platforms: ['meta', 'google'], status: 'draft', config: { brief: 'Furniture store, sells in the US.', goals: 'More sales', language: 'uk' } }],
    ag_agents: [], ag_links: [], ag_prompts: [], ag_prompt_versions: [], ag_tasks: [], ag_runs: [],
  };
  const db = fakeDb(tables);
  const team = await ensureCampaignTeam(db, tables.ag_campaigns[0], 'a@x.com');
  assert.equal(team.agents.length, 15); // Meta + Google: 8 common + 5 Meta/shared + 2 Google
  assert.equal(tables.ag_prompts.length, 15);
  await ensureCampaignTeam(db, tables.ag_campaigns[0], 'a@x.com');
  assert.deepEqual([tables.ag_agents.length, tables.ag_prompts.length], [15, 15]); // idempotent
  const A = (r) => tables.ag_agents.find((a) => a.role === r);
  tables.ag_agents.forEach((a) => { a.enabled = true; });
  A('competitor_research').config = { ...A('competitor_research').config, competitors: 'Rival https://rival.example', extra: 'Never compare prices.' };
  A('meta_analyst').config = { ...A('meta_analyst').config, kpi: 'CPA under 12 dollars' };

  const model = { calls: [], async callModel(args) {
    this.calls.push(args.agentKey);
    return { text: `## Підсумок\nSummary of ${args.agentKey}.\n\n## Деталі\nbody`, usage: { input_tokens: 10, output_tokens: 5 }, costUsd: 0.01 };
  } };
  const read = async () => ({ pages: [{ ok: true, url: 'https://rival.example/', title: 'Rival', text: 'We sell sofas.' }], blockedByRobots: false });
  const campaignDeps = { metaToken: 't', meta: async () => ({ account: 'act_111', rows: [{ name: 'M1', spend: 10 }], truncated: false }), google: async (id, { level }) => ({ period: {}, [level === 'account' ? 'account' : 'rows']: level === 'account' ? { cost: 5 } : [{ name: 'G1', cost: 5 }] }) };
  const ctx = { db, model, email: 'a@x.com', trigger: 'user', hf: null, read, campaignDeps, now: () => new Date('2026-10-19T08:00:00Z') };

  // before the launch nothing runs (the campaign is a draft)
  tables.ag_tasks.push({ id: 900, agent_id: A('meta_analyst').id, type: 'report', status: 'queued', brief: {} });
  assert.equal((await processQueue(ctx)).processed, 0);
  tables.ag_tasks.length = 0;

  const l = await launchCampaign(ctx, 1);
  assert.equal(l.started, 7); // 3 researchers + meta/google analysts + creative analyst + tracking
  assert.equal(tables.ag_campaigns[0].status, 'active');
  let q = await processQueue(ctx);
  assert.equal(q.failed, 0, JSON.stringify(tables.ag_tasks.filter((t) => t.status === 'failed').map((t) => t.error)));
  assert.equal(q.left, 0);
  const done = (r) => tables.ag_tasks.filter((t) => t.agent_id === A(r).id && t.status === 'done');
  for (const a of tables.ag_agents) assert.equal(done(a.role).length, 1, a.role); // every agent worked exactly once
  const order = (r) => done(r)[0].id;
  assert.ok(order('marketing_strategist') > Math.max(order('business_research'), order('competitor_research'), order('audience_research'))); // waits for all researchers
  assert.ok(order('meta_optimizer') > order('meta_analyst') && order('meta_optimizer') > order('marketing_strategist'));
  assert.ok(order('performance_copywriter') > order('creative_strategist'));
  assert.ok(order('quality_controller') > Math.max(order('performance_copywriter'), order('meta_optimizer'), order('google_optimizer'))); // checks the finished work
  assert.ok(order('cross_channel_report') > order('quality_controller') && order('account_manager') > order('cross_channel_report'));
  // prompts: editable + client instruction + locked rules; inputs: brief, accounts, the pages of the rival, upstream results
  const run = (role) => tables.ag_runs.find((r) => r.agent_id === A(role).id);
  assert.match(run('competitor_research').system_prompt, /^You are the competitor researcher/);
  assert.match(run('competitor_research').system_prompt, /Never compare prices/);
  assert.match(run('competitor_research').system_prompt, /Never invent numbers/);
  assert.match(run('competitor_research').system_prompt, /Ukrainian/);
  assert.match(run('competitor_research').user_prompt, /We sell sofas/);
  assert.match(run('meta_analyst').user_prompt, /Meta Ads · кампанії · останні 7 днів[\s\S]*M1/);
  assert.match(run('meta_analyst').user_prompt, /CPA under 12 dollars/);
  assert.match(run('google_analyst').user_prompt, /Google Ads · ключові слова/);
  assert.match(run('meta_optimizer').user_prompt, /Результат агента «Аналітик Meta Ads»[\s\S]*Summary of campaign-meta_analyst/);
  assert.match(run('account_manager').user_prompt, /Результат агента «Міжканальний звіт»/);
  assert.match(run('cross_channel_report').user_prompt, /Результат агента «Аналітик Google Ads»/);

  // a paused campaign stops all of its agents at once
  tables.ag_campaigns[0].status = 'paused';
  tables.ag_tasks.push({ id: 901, agent_id: A('meta_analyst').id, type: 'report', status: 'queued', brief: {} });
  q = await processQueue(ctx);
  assert.deepEqual([q.processed, q.waiting], [0, 1]);
  // a manual run of an agent works regardless, and a missing required input is a readable failure
  const r2 = await runNow(ctx, A('tiktok_analyst')?.id ?? -1, {}).catch((e) => e);
  assert.ok(r2 instanceof Error); // TikTok is not part of this campaign
});

await ok('site leads: the form data is read strictly (services, phone, e-mail, honeypot, UTM, control characters)', () => {
  const r = normalizeLead({ name: '  Ann\u0000 Lee ', email: 'ANN@Example.COM', phone: '+38 (050) 123-45-67', link: 'https://shop.example', services: ['service1', 'service6', 'Custom'], message: 'Hi', utm: { utm_source: 'google', utm_medium: 'cpc', evil: 'x' }, page_url: 'https://www.monarchi.agency/' });
  assert.deepEqual([r.lead.name, r.lead.email, r.lead.phone], ['Ann Lee', 'ann@example.com', '+380501234567']);
  assert.deepEqual(r.lead.services, ['Google Ads', 'SEO', 'Custom']);
  assert.deepEqual(r.lead.utm, { utm_source: 'google', utm_medium: 'cpc' });
  assert.equal(r.spam, false);
  assert.deepEqual(normalizeLead({ name: 'X', email: 'not-an-email', phone: '12' }).errors, ['Потрібен e-mail або телефон.']);
  assert.equal(normalizeLead({ email: 'a@b.co', hp: 'bot' }).spam, true);
  assert.equal(normalizeLead({ email: 'a@b.co', message: 'http://a http://b http://c http://d' }).spam, true);
  assert.deepEqual(normalizeLead(JSON.stringify({ email: 'a@b.co', services: 'service2,service3' })).lead.services, ['Meta Ads', 'TikTok Ads']); // text/plain bodies and comma lists
  assert.equal(escapeHtml('<b>&'), '&lt;b&gt;&amp;');
  assert.match(buildTelegramText({ name: 'A<b>', email: '', phone: '', link: '', services: [], message: '<script>', page_url: '', utm: {} }), /A&lt;b&gt;[\s\S]*&lt;script&gt;/); // nothing from the form is sent to Telegram as markup
});

await ok('site leads: a submission becomes a contact and a deal, tells the chats, and survives every failure', async () => {
  const tables = { site_leads: [], clients: [], deals: [], deal_activity: [], notifications: [], pipelines: [{ id: 7, name: 'Website', position: 7 }], deal_stages: [{ id: 22, pipeline_id: 7, position: 4 }, { id: 19, pipeline_id: 7, position: 1 }] };
  const db = fakeDb(tables);
  const sent = [];
  const telegram = { send: async (m) => { sent.push(m); return m.chatId === '-200' ? { ok: false, error: 'chat not found' } : { ok: true }; } };
  const settings = { enabled: true, pipeline_id: 7, manager: 'Anna', telegram_chat_ids: ['-100', '-200'], notify_emails: ['A@x.com', 'a@x.com'] };
  const t0 = new Date('2026-10-19T10:00:00Z');
  const run = (body, o = {}) => handleSiteLead({ db, settings: { ...settings, ...(o.settings || {}) }, body, ip: o.ip || '1.2.3.4', telegram: o.telegram === undefined ? telegram : o.telegram, now: () => o.now || t0 });
  const form = { name: 'Ann Lee', email: 'ann@example.com', phone: '+380501234567', link: 'https://shop.example', services: ['service1'], message: 'Need ads', page_url: 'https://www.monarchi.agency/' };

  let r = await run(form);
  assert.equal(r.status, 'created');
  assert.deepEqual([tables.clients.length, tables.deals.length], [1, 1]);
  assert.deepEqual([tables.clients[0].name, tables.clients[0].last_name, tables.clients[0].source, tables.clients[0].status, tables.clients[0].manager], ['Ann', 'Lee', 'Website', 'Новий', 'Anna']);
  assert.deepEqual([tables.deals[0].stage_id, tables.deals[0].pipeline_id, tables.deals[0].source], [19, 7, 'Website']); // the FIRST stage, not the first in the table
  assert.match(tables.deals[0].notes, /Need ads[\s\S]*Google Ads/);
  assert.equal(tables.deal_activity.length, 1);
  assert.equal(sent.length, 2);
  assert.match(sent[0].url, /\/reports\/deals\?open=/);
  assert.deepEqual(Object.keys(tables.site_leads[0].telegram_messages || {}), []); // the stand-in returns no message ids: nothing is invented
  assert.equal(tables.site_leads[0].telegram_status, 'sent'); // one chat worked
  assert.equal(tables.site_leads[0].telegram_error, 'chat not found'); // the failing one is recorded, the lead is not lost
  assert.deepEqual(tables.notifications.map((n) => n.recipient_email), ['a@x.com']); // de-duplicated, lower-cased
  assert.equal(tables.site_leads[0].deal_id, tables.deals[0].id);

  // the same person again, a minute later: one request, no second deal or message
  r = await run(form, { now: new Date(t0.getTime() + 60000), ip: '5.6.7.8' });
  assert.equal(r.status, 'duplicate');
  assert.deepEqual([tables.deals.length, sent.length], [1, 2]);

  // the same person, a day later: the contact is reused, a new deal opens
  r = await run({ ...form, email: 'ANN@example.com', message: 'Another idea' }, { now: new Date(t0.getTime() + 86400000), ip: '9.9.9.9' });
  assert.deepEqual([r.status, r.returning, tables.clients.length, tables.deals.length], ['created', true, 1, 2]);

  // another person with the same name gets their own contact (the name key is unique in the CRM)
  r = await run({ ...form, email: 'ann.other@example.com', phone: '+4915112345678' }, { now: new Date(t0.getTime() + 2 * 86400000), ip: '8.8.8.8' });
  assert.deepEqual([r.status, tables.clients.length], ['created', 2]);
  assert.notEqual(tables.clients[0].name_key, tables.clients[1].name_key);

  // spam, invalid, disabled, no Telegram
  const before = tables.deals.length;
  assert.equal((await run({ ...form, email: 'x@y.co', hp: 'bot' }, { ip: '4.4.4.4' })).status, 'spam');
  assert.equal(tables.site_leads.at(-1).status, 'spam');
  assert.equal((await run({ name: 'No contact' })).status, 'invalid');
  assert.equal((await run(form, { settings: { enabled: false } })).status, 'disabled');
  r = await run({ ...form, email: 'new@example.com', phone: '' }, { telegram: null, ip: '3.3.3.3', now: new Date(t0.getTime() + 3 * 86400000) });
  assert.deepEqual([r.status, tables.site_leads.at(-1).telegram_status], ['created', 'skipped']);
  assert.equal(tables.deals.length, before + 1); // only the last one made a deal

  // a flood from one address is stopped
  for (let i = 0; i < 6; i += 1) tables.site_leads.push({ id: 900 + i, ip_hash: tables.site_leads[0].ip_hash, received_at: t0.toISOString() });
  assert.equal((await run({ ...form, email: 'flood@example.com' }, { ip: '1.2.3.4' })).status, 'limited');

  // a broken pipeline is an `error` row with the reason, never an exception
  tables.deal_stages.length = 0;
  r = await run({ ...form, email: 'err@example.com' }, { ip: '2.2.2.2', now: new Date(t0.getTime() + 5 * 86400000) });
  assert.equal(r.status, 'error');
  assert.match(tables.site_leads.at(-1).error, /етапів/);
});

await ok('telegram: the token never leaks, messages carry the open button, reply and silence', async () => {
  const env = { TELEGRAM_BOT_TOKEN: '123:SECRET' };
  const calls = [];
  const fetchFn = async (url, init) => {
    calls.push([url, JSON.parse(init.body)]);
    if (url.endsWith('/sendMessage') && init.body.includes('bad')) return { ok: false, status: 400, json: async () => ({ ok: false, description: 'chat not found for 123:SECRET' }) };
    return { ok: true, json: async () => ({ ok: true, result: { username: 'monarchi_bot', message_id: 77 } }) };
  };
  assert.equal((await botInfo({ env, fetchFn })).result.username, 'monarchi_bot');
  const sent = await tgSend({ chatId: '1', text: 'hi', url: 'https://crm.example/deal', replyTo: 55, silent: true }, { env, fetchFn });
  assert.equal(sent.result.message_id, 77);
  assert.equal(calls.at(-1)[1].reply_markup.inline_keyboard[0][0].url, 'https://crm.example/deal');
  assert.deepEqual([calls.at(-1)[1].parse_mode, calls.at(-1)[1].reply_parameters.message_id, calls.at(-1)[1].disable_notification], ['HTML', 55, true]);
  const bad = await tgSend({ chatId: 'bad', text: 'hi' }, { env, fetchFn });
  assert.equal(bad.ok, false);
  assert.doesNotMatch(bad.error, /SECRET/); // the token is stripped from error messages
  assert.equal((await tgSend({ chatId: '1', text: 'hi' }, { env: {}, fetchFn })).ok, false); // no token: a readable failure, no call
  assert.match(webhookSecret(env), /^[0-9a-f]{40}$/);
  assert.notEqual(webhookSecret(env), webhookSecret({ TELEGRAM_BOT_TOKEN: 'other' })); // derived from the token, never the token itself
});

await ok('telegram: the bot learns chats and people from what happens around it', () => {
  const m = peopleFromUpdate({ message: { chat: { id: -100, title: 'Leads', type: 'group' }, from: { id: 5, first_name: 'Anna', last_name: 'K', username: 'anna_k' }, new_chat_members: [{ id: 6, first_name: 'Bot', is_bot: true }, { id: 7, first_name: 'Ivan' }] } });
  assert.deepEqual(m.chat, { chat_id: '-100', title: 'Leads', type: 'group' });
  assert.deepEqual(m.members.map((x) => [x.user_id, x.username, x.name]), [[5, 'anna_k', 'Anna K'], [7, null, 'Ivan']]); // bots are not people
  const added = peopleFromUpdate({ my_chat_member: { chat: { id: -100, title: 'Leads', type: 'group' }, from: { id: 5, first_name: 'Anna' }, new_chat_member: { status: 'administrator' } } });
  assert.equal(added.chat.bot_status, 'administrator');
  const joined = peopleFromUpdate({ chat_member: { chat: { id: -100, title: 'Leads', type: 'supergroup' }, new_chat_member: { status: 'administrator', user: { id: 9, first_name: 'Olga' } } } });
  assert.deepEqual([joined.members[0].user_id, joined.members[0].is_admin], [9, true]);
  assert.deepEqual(peopleFromUpdate({ edited_message: {} }), { chat: null, members: [] });
  assert.equal(mentionOf({ user_id: 5, username: 'anna_k', name: 'Anna' }), '@anna_k');
  assert.equal(mentionOf({ user_id: 7, username: null, name: 'Iv<an>' }), '<a href="tg://user?id=7">Iv&lt;an&gt;</a>'); // no username: a link by id
});

await ok('site leads: the message form is a template, empty fields vanish with their label, nothing from a visitor is markup', () => {
  const lead = { name: 'Ann <b>', email: '', phone: '+380501112233', link: '', services: ['SEO'], message: 'Hi & bye', page_url: '', utm: {} };
  const std = buildTelegramText(lead, { pings: '@a @b' });
  assert.match(std, /Нова заявка з сайту[\s\S]*Ann &lt;b&gt;[\s\S]*\+380501112233[\s\S]*SEO[\s\S]*Hi &amp; bye[\s\S]*@a @b$/);
  assert.doesNotMatch(std, /E-mail|Проєкт|Сторінка|UTM/); // empty fields leave no label behind
  const mine = buildTelegramText(lead, { template: '<b>Лід</b> {name} / {phone}\n<script>x</script> {ping}', pings: '@a' });
  assert.equal(mine, '<b>Лід</b> Ann &lt;b&gt; / +380501112233\n&lt;script&gt;x&lt;/script&gt; @a'); // only b, i, u, s, code stay as tags
  assert.equal(safeTemplate('<a href="x">t</a> <i>k</i>'), '&lt;a href="x"&gt;t&lt;/a&gt; <i>k</i>');
  assert.match(renderMessage('{name} {unknown}', { name: 'A' }), /A \{unknown\}/); // an unknown placeholder is left as it is, visible
  assert.match(renderMessage('x', { name: 'A', ping: '@z' }), /x\n@z$/); // no {ping} in the template: the people are added at the end
  assert.ok(DEFAULT_TEMPLATE.includes('{ping}'));
});

await ok('site leads: reminders only for leads nobody took, at the chosen interval, as a reply, then they stop', async () => {
  const t0 = new Date('2026-10-19T10:00:00Z');
  const mk = (id, extra = {}) => ({ id, status: 'new', deal_id: 'd' + id, name: 'Lead ' + id, phone: '+380', received_at: t0.toISOString(), telegram_messages: { '-1': 500 + id }, reminders_sent: 0, last_reminder_at: null, ...extra });
  const tables = {
    site_leads: [mk(1), mk(2), mk(3), mk(4, { reminders_sent: 3 }), mk(5, { status: 'spam' })],
    deals: [{ id: 'd1', stage_id: 19, pipeline_id: 7 }, { id: 'd2', stage_id: 20, pipeline_id: 7 }, { id: 'd3', stage_id: 19, pipeline_id: 7, archived: true }, { id: 'd4', stage_id: 19, pipeline_id: 7 }],
    deal_stages: [{ id: 19, pipeline_id: 7, position: 1 }, { id: 20, pipeline_id: 7, position: 2 }],
    tg_members: [{ chat_id: '-1', user_id: 5, username: 'anna_k', name: 'Anna', ping: true }, { chat_id: '-1', user_id: 6, username: 'ivan', name: 'Ivan', ping: false }],
  };
  const db = fakeDb(tables);
  const sent = [];
  const telegram = { send: async (m) => { sent.push(m); return { ok: true }; } };
  const settings = { reminders_enabled: true, reminder_minutes: 30, reminder_max: 3, telegram_chat_ids: ['-1'], show_button: true };
  const at = (min) => () => new Date(t0.getTime() + min * 60000);
  assert.equal((await runLeadReminders({ db, settings, telegram, now: at(20) })).sent, 0); // too early
  assert.equal((await runLeadReminders({ db, settings: { ...settings, reminders_enabled: false }, telegram, now: at(40) })).sent, 0); // switched off
  let r = await runLeadReminders({ db, settings, telegram, now: at(40) });
  assert.equal(r.sent, 1); // lead 1 only: 2 was taken (moved from the first stage), 3 archived, 4 out of reminders, 5 spam
  assert.deepEqual([sent[0].chatId, sent[0].replyTo], ['-1', 501]); // a reply to the original message
  assert.match(sent[0].text, /ще не взято[\s\S]*Lead 1[\s\S]*@anna_k/); // mentions the ticked person only
  assert.doesNotMatch(sent[0].text, /@ivan/);
  assert.equal(tables.site_leads[0].reminders_sent, 1);
  assert.equal((await runLeadReminders({ db, settings, telegram, now: at(50) })).sent, 0); // 10 minutes after the last one: wait for the interval
  assert.equal((await runLeadReminders({ db, settings, telegram, now: at(75) })).sent, 1); // second reminder
  assert.equal((await runLeadReminders({ db, settings, telegram, now: at(110) })).sent, 1); // third
  assert.equal((await runLeadReminders({ db, settings, telegram, now: at(150) })).sent, 0); // the maximum is reached: it stops
  assert.equal((await runLeadReminders({ db, settings, telegram: null, now: at(500) })).sent, 0); // no bot: nothing, no crash
});

await ok('site leads: the snippet for the website carries the endpoint and key and only listens to the contact forms', () => {
  const js = buildSnippet({ endpoint: 'https://crm.example/api/site-lead', key: 'k123' });
  assert.match(js, /https:\/\/crm\.example\/api\/site-lead/);
  assert.match(js, /k123/);
  assert.match(js, /contact-section__form/);
  assert.match(js, /sendBeacon/);
  assert.doesNotMatch(js, /TELEGRAM|SECRET/);
  assert.doesNotThrow(() => new Function(js.replace(/<[/]?script>/g, ''))); // it is valid JavaScript
});

await ok('campaign groups: a group is a chosen set of campaigns, a report narrows to it, old keyword groups still work', () => {
  const camp = (name, spend, clicks = 10) => ({ name, spend, impressions: spend * 100, reach: spend * 50, clicks, purchases: 1, leads: 0, revenue: spend * 3 });
  const data = {
    platforms: {
      meta: { currency: 'USD', total: camp('acc', 600), campaigns: [camp('Catalog RTS', 100), camp('Hybrid Wig', 200), camp('MTO | broad', 300)], groups: [] },
      google: { currency: 'USD', total: camp('acc', 70), campaigns: [camp('Catalog RTS', 30), camp('Brand', 40)], groups: [] },
    },
    previous: { platforms: { meta: { currency: 'USD', total: camp('acc', 500), campaigns: [camp('Catalog RTS', 80), camp('Hybrid Wig', 120)], groups: [] } } },
  };
  const mine = { id: 1, name: 'Каталог', campaigns: [gKey('meta', 'Catalog RTS'), gKey('google', 'Catalog RTS'), gKey('meta', 'MTO | broad')], keywords: [] };
  assert.equal(groupMatches(mine, 'meta', 'Catalog RTS'), true);
  assert.equal(groupMatches(mine, 'meta', 'Hybrid Wig'), false);
  assert.equal(groupMatches(mine, 'google', 'Brand'), false);
  assert.equal(groupMatches({ campaigns: [], keywords: ['hybrid'] }, 'meta', 'HYBRID Wig RTS'), true); // an old keyword group, any case
  const s = scopeToGroup(data, mine);
  assert.deepEqual(Object.keys(s.platforms), ['meta', 'google']);
  assert.deepEqual(s.platforms.meta.campaigns.map((c) => c.name), ['Catalog RTS', 'MTO | broad']);
  assert.equal(s.platforms.meta.total.spend, 400); // the total is the sum of the group's campaigns, not of the account
  assert.equal(s.platforms.google.total.spend, 30);
  assert.equal(s.previous.platforms.meta.total.spend, 80); // the previous period is narrowed the same way
  assert.deepEqual(s.platforms.meta.groups, []);
  assert.equal(data.platforms.meta.total.spend, 600); // the original is not touched
  assert.deepEqual(Object.keys(scopeToGroup(data, { campaigns: [gKey('google', 'Brand')] }).platforms), ['google']); // a platform with none of the group disappears
  assert.equal(scopeToGroup(data, null), data); // no group: everything as it was
  assert.deepEqual(groupCampaignKeys(mine, flatCampaigns(data)), ['meta|Catalog RTS', 'meta|MTO | broad', 'google|Catalog RTS']);
  // the group table: first group wins, the rest is «Інше», platform matters
  const cols = groupCampaigns(data.platforms.meta.campaigns, [mine, { name: 'Wigs', campaigns: [], keywords: ['wig'] }], 'meta');
  assert.deepEqual(cols.map((c) => [c.name, c.campaignCount, c.spend]), [['Каталог', 2, 400], ['Wigs', 1, 200]]);
  // a campaign in no group is a column of its own (nothing hides behind «Інше»), biggest spend first
  const gcols = groupCampaigns(data.platforms.google.campaigns, [mine], 'google');
  assert.ok(!gcols.some((c) => c.name === 'Інше'));
  assert.ok(gcols.filter((c) => c.single).every((c) => c.campaignCount === 1));
  assert.equal(gcols.at(-1).name, 'Brand');
  assert.deepEqual(groupCampaigns([], [], 'meta'), []);
  // the picker of the form
  const list = mergeCampaigns([{ platform: 'meta', name: 'A', spend: 5 }], [{ platform: 'meta', name: 'A', spend: 9 }, { platform: 'google', name: 'A', spend: 1 }, { platform: 'meta', name: 'B', spend: 0 }]);
  assert.equal(list.length, 3); // same name on another platform is another campaign
  assert.equal(list.find((c) => c.platform === 'meta' && c.name === 'A').spend, 9);
  assert.deepEqual(filterCampaigns(list, 'a').map((c) => [c.platform, c.name]), [['meta', 'A'], ['google', 'A']]); // by spend, filtered by text
});

console.log(`\n${passed} checks passed`);
