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

console.log(`\n${passed} checks passed`);
