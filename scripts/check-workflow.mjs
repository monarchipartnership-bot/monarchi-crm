// Checks of the new orchestrator (step A2): the brain (machine.js) and the cycle (tick.js) on an in-memory twin of the storage.
// The database rules themselves (versions, leases, uniqueness, access) are checked in the database with the self-rolling-back blocks of the migrations.
// Run:  node scripts/check-workflow.mjs
import assert from 'node:assert/strict';
import { planNext, STAGE } from '../api/_lib/wf/machine.js';
import { createHandlers } from '../api/_lib/wf/agents.js';
import { planProject, processTick } from '../api/_lib/wf/tick.js';
import { createMemoryWfRepo } from './wfMemoryRepo.mjs';
import { computeUnitEconomy, renderUnitEconomy } from '../api/_lib/wf/skills/economics.js';
import { unitEconomy } from '../api/_lib/wf/skills/unitEconomyAgent.js';
import { briefGaps, contentFromForm, emptyForm, formFromContent, rowStatus } from '../src/lib/workflow/brief.js';
import { agentCards, buildQueue, nowCard, openProposals, sectionRows, signoffWanted } from '../src/lib/workflow/view.js';

let passed = 0;
const test = async (name, fn) => { try { await fn(); passed += 1; console.log('ok  ', name); } catch (e) { console.error('FAIL', name, '\n', e); process.exitCode = 1; } };

const clock = { t: new Date('2026-11-19T09:00:00Z') };
const advance = (ms) => { clock.t = new Date(clock.t.getTime() + ms); };
const HOUR = 3600e3;
const now = () => new Date(clock.t);

async function setup({ handlers = createHandlers(), stubHasData = true, validate } = {}) {
  const repo = createMemoryWfRepo({ now });
  const ctx = { repo, handlers, now, stubHasData, validate };
  await repo.ensureState(1);
  return { repo, ctx };
}
// ticks until nothing happens any more
async function drain(ctx, max = 40) {
  let last = null;
  for (let i = 0; i < max; i += 1) {
    last = await processTick(ctx);
    if (!last.claimed && !last.enqueued && !last.approvals) return last;
    advance(1000);
  }
  throw new Error('drain: still busy after ' + max + ' passes ' + JSON.stringify(last));
}
const human = (repo, key, body = 'brief') => repo.writeSectionVersion(1, key, { body, author_kind: 'human', author: 'manager@test' });
const runsOf = (repo, skill) => repo.T.runs.filter((r) => r.skill === skill);
const state = (repo) => repo.T.states.get(1);
const sec = (repo, key) => repo.T.sections.find((s) => s.project_id === 1 && s.key === key);
async function startProject(repo, ctx) {
  await human(repo, 'brief');
  Object.assign(state(repo), { paid_at: now().toISOString(), contracts_signed_at: now().toISOString() });
  await drain(ctx);
}
// brings a project to the point where the strategy waits for Апрув 1
async function toStrategyApproval(repo, ctx) {
  await startProject(repo, ctx);
  assert.equal(state(repo).stage, STAGE.STRATEGY);
  assert.ok(repo.pending(1, 'strategy'));
}
async function toOperating(repo, ctx) {
  await toStrategyApproval(repo, ctx);
  repo.decide(repo.pending(1, 'strategy').id, 'approved'); await drain(ctx);
  repo.recordClientSignoff(1, 'approved'); await drain(ctx);
  repo.decide(repo.pending(1, 'launch').id, 'approved'); await drain(ctx);
  assert.equal(state(repo).stage, STAGE.OPERATE);
}

// ---------------------------------------------------------------------------------------------------------------- the brain
await test('brain: nothing happens for a paused project or one that does not exist', () => {
  assert.deepEqual(planNext({ state: null }), []);
  assert.deepEqual(planNext({ state: { stage: 0, paused: true, paid_at: 'x', contracts_signed_at: 'x', has_data: true }, sections: { brief: { hasCurrent: true } } }), []);
});
await test('brain: stage 0 waits for the brief, the payment and the contracts', () => {
  const base = { stage: 0, paused: false, paid_at: null, contracts_signed_at: null, has_data: true };
  assert.deepEqual(planNext({ state: base }), []);
  assert.deepEqual(planNext({ state: { ...base, has_data: null }, sections: { brief: { hasCurrent: true } } }).map((a) => a.skill), ['intake']);
  assert.deepEqual(planNext({ state: base, sections: { brief: { hasCurrent: true } } }), []); // brief, but no payment
  const go = planNext({ state: { ...base, paid_at: 'x', contracts_signed_at: 'x' }, sections: { brief: { hasCurrent: true } } });
  assert.ok(go.some((a) => a.type === 'set_stage' && a.stage === 1));
  assert.deepEqual(go.filter((a) => a.type === 'enqueue').map((a) => a.skill).sort(), ['audience', 'audit', 'competitors', 'onboarding', 'site', 'unit_economy']);
});
await test('brain: no data in the cabinets means no audit', () => {
  const go = planNext({ state: { stage: 0, paused: false, paid_at: 'x', contracts_signed_at: 'x', has_data: false }, sections: { brief: { hasCurrent: true } } });
  assert.ok(!go.some((a) => a.skill === 'audit'));
});
await test('brain: a returned approval is handled once and sends the strategy back', () => {
  const st = { stage: 2, paused: false };
  const sections = { strategy: { status: 'on_approval', hasCurrent: true } };
  const approvals = [{ id: 5, kind: 'strategy', status: 'returned', comment: 'budget' }];
  const a1 = planNext({ state: st, sections, approvals });
  assert.ok(a1.some((a) => a.type === 'section_status' && a.status === 'needs_rework'));
  assert.equal(a1.find((a) => a.type === 'enqueue').input.rework_of, 5);
  const runs = [{ id: 9, agent: 'strategist', skill: 'strategy', status: 'done', input: { rework_of: 5 } }];
  const a2 = planNext({ state: st, sections: { strategy: { status: 'needs_rework', hasCurrent: true } }, approvals, runs });
  assert.ok(a2.some((a) => a.type === 'section_status' && a.status === 'draft') || a2.some((a) => a.type === 'enqueue' && a.skill === 'first_creatives') || a2.some((a) => a.type === 'approval'));
  assert.ok(!a2.some((a) => a.type === 'enqueue' && a.skill === 'strategy')); // not sent back a second time
});

// ---------------------------------------------------------------------------------------------------------------- the whole chain
await test('chain: from the brief to optimisation with three manager approvals and the sign-off of the client', async () => {
  const { repo, ctx } = await setup();
  await human(repo, 'brief');
  await drain(ctx);
  assert.equal(state(repo).stage, 0, 'no payment yet');
  assert.equal(state(repo).has_data, true, 'the intake found out about the cabinets');
  Object.assign(state(repo), { paid_at: now().toISOString(), contracts_signed_at: now().toISOString() });
  await drain(ctx);
  assert.equal(state(repo).stage, STAGE.STRATEGY);
  for (const k of ['audit', 'site', 'audience', 'unit_economy', 'competitors', 'materials', 'ideas', 'strategy']) assert.ok(sec(repo, k)?.current_version_id, 'section ' + k);
  assert.equal(sec(repo, 'strategy').status, 'on_approval');
  assert.ok(repo.pending(1, 'strategy'), 'Апрув 1 is asked for');
  assert.equal(repo.pending(1, 'launch'), null);
  repo.decide(repo.pending(1, 'strategy').id, 'approved'); await drain(ctx);
  assert.equal(sec(repo, 'strategy').status, 'approved');
  assert.equal(repo.pending(1, 'launch'), null, 'waits for the client');
  repo.recordClientSignoff(1, 'approved'); await drain(ctx);
  assert.ok(repo.pending(1, 'launch'), 'Апрув 2 is asked for after the client');
  assert.equal(state(repo).stage, STAGE.STRATEGY, 'nothing is launched before Апрув 2');
  repo.decide(repo.pending(1, 'launch').id, 'approved'); await drain(ctx);
  assert.equal(state(repo).stage, STAGE.OPERATE);
  assert.equal(runsOf(repo, 'launch').length, 1);
  assert.ok(runsOf(repo, 'optimize').length >= 1, 'optimisation is scheduled');
  assert.ok(repo.T.journal.some((j) => j.action === 'stage'), 'the journal has the stages');
});
await test('chain: a project without data in the cabinets goes without an audit', async () => {
  const { repo, ctx } = await setup({ stubHasData: false });
  await startProject(repo, ctx);
  assert.equal(runsOf(repo, 'audit').length, 0);
  assert.equal(state(repo).stage, STAGE.STRATEGY);
});
await test('chain: the strategy returned by the manager is redone and asked for again, once per return', async () => {
  const { repo, ctx } = await setup();
  await toStrategyApproval(repo, ctx);
  repo.decide(repo.pending(1, 'strategy').id, 'returned', 'change the budget split');
  await drain(ctx);
  const redo = runsOf(repo, 'strategy').filter((r) => r.input?.rework_of);
  assert.equal(redo.length, 1, 'redone exactly once');
  assert.equal(redo[0].input.comment, 'change the budget split');
  assert.ok(repo.pending(1, 'strategy'), 'asked for the approval again');
  assert.equal(sec(repo, 'strategy').status, 'on_approval');
  assert.equal(repo.T.versions.filter((v) => v.section_id === sec(repo, 'strategy').id).length, 2, 'two versions of the strategy');
  await drain(ctx);
  assert.equal(runsOf(repo, 'strategy').filter((r) => r.input?.rework_of).length, 1, 'no endless loop');
});
await test('chain: the client who asks for changes sends the strategy back to the start of the approvals', async () => {
  const { repo, ctx } = await setup();
  await toStrategyApproval(repo, ctx);
  repo.decide(repo.pending(1, 'strategy').id, 'approved'); await drain(ctx);
  repo.recordClientSignoff(1, 'returned', 'client wants another offer'); await drain(ctx);
  assert.equal(runsOf(repo, 'strategy').filter((r) => r.input?.rework_of).length, 1);
  assert.ok(repo.pending(1, 'strategy'), 'a new Апрув 1');
  assert.equal(repo.pending(1, 'launch'), null);
  assert.equal(state(repo).stage, STAGE.STRATEGY);
});
await test('chain: Апрув 2 returned also sends the strategy back', async () => {
  const { repo, ctx } = await setup();
  await toStrategyApproval(repo, ctx);
  repo.decide(repo.pending(1, 'strategy').id, 'approved'); await drain(ctx);
  repo.recordClientSignoff(1, 'approved'); await drain(ctx);
  repo.decide(repo.pending(1, 'launch').id, 'returned', 'not now'); await drain(ctx);
  assert.equal(state(repo).stage, STAGE.STRATEGY);
  assert.ok(repo.pending(1, 'strategy'));
});

// ---------------------------------------------------------------------------------------------------------------- safety
await test('safety: an agent never replaces a human version: its text goes in as a proposal and the journal says so', async () => {
  const { repo, ctx } = await setup();
  await toStrategyApproval(repo, ctx);
  await human(repo, 'strategy', 'manager edited the strategy'); // a human edit
  const before = sec(repo, 'strategy').current_version_id;
  await repo.enqueueRun({ project_id: 1, agent: 'strategist', skill: 'strategy', input: {} });
  await processTick(ctx);
  assert.equal(sec(repo, 'strategy').current_version_id, before, 'the current version stays');
  assert.ok(repo.T.versions.some((v) => v.section_id === sec(repo, 'strategy').id && v.is_proposal), 'a proposal exists');
  assert.ok(repo.T.journal.some((j) => j.action === 'proposal'));
});
await test('safety: a paused project starts nothing', async () => {
  const { repo, ctx } = await setup();
  await human(repo, 'brief');
  state(repo).paused = true;
  const r = await processTick(ctx);
  assert.deepEqual([r.enqueued, r.claimed], [0, 0]);
});
await test('safety: the cost cap of a project stops its runs and says why', async () => {
  const { repo, ctx } = await setup();
  await human(repo, 'brief');
  state(repo).cost_cap_usd = 1;
  await repo.enqueueRun({ project_id: 1, agent: 'researcher', skill: 'intake' });
  repo.T.runs[0].cost_usd = 5; // already spent more than the cap this month
  await repo.enqueueRun({ project_id: 1, agent: 'researcher', skill: 'site' });
  const r = await processTick(ctx);
  assert.ok(r.waiting >= 1);
  assert.ok(repo.T.journal.some((j) => j.action === 'cost_cap'));
  assert.ok(repo.T.runs.some((r2) => r2.status === 'waiting' && /ліміт/.test(r2.error)));
});
await test('safety: the same work is never started twice, even by two passes at the same time', async () => {
  const { repo, ctx } = await setup();
  await human(repo, 'brief');
  Object.assign(state(repo), { paid_at: 'x', contracts_signed_at: 'x', has_data: true });
  await Promise.all([planProject(ctx, 1), planProject(ctx, 1), processTick(ctx), processTick(ctx)]);
  const open = repo.T.runs.filter((r) => ['queued', 'running'].includes(r.status));
  const keys = open.map((r) => r.agent + '/' + r.skill);
  assert.equal(new Set(keys).size, keys.length, 'no duplicates: ' + keys);
  const claimed = repo.T.runs.filter((r) => r.attempt > 0);
  assert.ok(claimed.every((r) => r.attempt === 1), 'a run is taken once');
});
await test('safety: a run whose worker died is taken again after the lease and fails after three tries', async () => {
  const { repo } = await setup();
  await repo.enqueueRun({ project_id: 1, agent: 'researcher', skill: 'site' });
  for (let i = 1; i <= 3; i += 1) { const got = await repo.claimRuns(1, 10); assert.equal(got.length, 1); assert.equal(got[0].attempt, i); advance(11 * 60000); }
  assert.equal((await repo.claimRuns(1, 10)).length, 0, 'not taken a fourth time');
  assert.equal(repo.T.runs[0].status, 'failed');
});
await test('safety: a failing agent fails its run, writes the journal and does not move the stage', async () => {
  const handlers = createHandlers({ researcher: { site: async () => { throw new Error('boom'); } } });
  const { repo, ctx } = await setup({ handlers });
  await startProject(repo, ctx);
  assert.equal(runsOf(repo, 'site')[0].status, 'failed');
  assert.ok(repo.T.journal.some((j) => j.action === 'run_failed' && /boom/.test(j.summary)));
  assert.equal(state(repo).stage, STAGE.RESEARCH, 'stays in research');
  assert.equal(repo.pending(1, 'strategy'), null);
});
await test('safety: a problem found by the automatic check holds the stage and is written once', async () => {
  const validate = async () => ({ ok: false, problems: ['budget differs between sections'] });
  const { repo, ctx } = await setup({ validate });
  await startProject(repo, ctx);
  assert.equal(state(repo).stage, STAGE.RESEARCH);
  for (let i = 0; i < 4; i += 1) await processTick(ctx);
  assert.equal(repo.T.journal.filter((j) => j.action === 'check_failed').length, 1, 'once, not on every pass');
  ctx.validate = async () => ({ ok: true, problems: [] });
  await drain(ctx);
  assert.equal(state(repo).stage, STAGE.STRATEGY);
});
await test('safety: a skill without a handler fails clearly', async () => {
  const { repo, ctx } = await setup({ handlers: { researcher: {} } });
  await repo.enqueueRun({ project_id: 1, agent: 'researcher', skill: 'site' });
  await processTick(ctx);
  assert.match(repo.T.runs[0].error, /Немає обробника/);
});

// ---------------------------------------------------------------------------------------------------------------- operation
await test('operation: optimisation repeats on schedule, not before', async () => {
  const { repo, ctx } = await setup();
  await toOperating(repo, ctx);
  const n = runsOf(repo, 'optimize').length;
  assert.equal(n, 1);
  advance(2 * HOUR); await drain(ctx);
  assert.equal(runsOf(repo, 'optimize').length, 1, 'not due after 2 hours');
  advance(25 * HOUR); await drain(ctx);
  assert.equal(runsOf(repo, 'optimize').length, 2, 'due after a day');
});
await test('operation: the month of the launch is covered by the strategy; the next month starts planning and ends with Апрув 3', async () => {
  const { repo, ctx } = await setup();
  await toOperating(repo, ctx);
  assert.equal(runsOf(repo, 'monthly_plan').length, 0, 'no plan in the month of the launch');
  clock.t = new Date('2026-12-02T09:00:00Z');
  await drain(ctx);
  assert.equal(state(repo).stage, STAGE.MONTH);
  assert.equal(runsOf(repo, 'monthly_plan').length, 1);
  assert.equal(runsOf(repo, 'monthly_report').length, 1);
  const ap = repo.pending(1, 'changes');
  assert.ok(ap && ap.subject.section === 'monthly_plan', 'Апрув 3 for the plan');
  repo.decide(ap.id, 'approved'); await drain(ctx);
  assert.equal(state(repo).stage, STAGE.OPERATE);
  assert.equal(runsOf(repo, 'monthly_plan').length, 1, 'planned once');
});
await test('operation: a monthly plan returned by the manager is redone and approved again', async () => {
  const { repo, ctx } = await setup();
  await toOperating(repo, ctx);
  clock.t = new Date('2027-01-05T09:00:00Z');
  await drain(ctx);
  repo.decide(repo.pending(1, 'changes').id, 'returned', 'too aggressive');
  await drain(ctx);
  assert.equal(runsOf(repo, 'monthly_plan').filter((r) => r.input?.rework_of).length, 1);
  assert.ok(repo.pending(1, 'changes'), 'asked again');
});
await test('operation: the optimiser may ask for Апрув 3 for a significant change', async () => {
  const handlers = createHandlers({ mediabuyer: { optimize: async () => ({ output: { actions: 1 }, approvals: [{ kind: 'changes', subject: { action: 'raise budget 15%' } }] }) } });
  const { repo, ctx } = await setup({ handlers });
  await toOperating(repo, ctx);
  assert.ok(repo.T.approvals.some((a) => a.kind === 'changes' && a.subject.action === 'raise budget 15%' && a.status === 'pending'));
});

// ---------------------------------------------------------------- the screens (step A3): what the overview, the dossier and the queue show
const ap = (id, kind, status, extra = {}) => ({ id, project_id: 1, kind, status, requested_at: '2026-11-19T08:00:00Z', decided_at: status === 'pending' ? null : '2026-11-19T08:30:00Z', subject: {}, ...extra });
await test('screens: the client sign-off is wanted only after an approved Апрув 1 at the stage «Стратегія»', () => {
  const st = { project_id: 1, stage: 2, paused: false };
  assert.equal(signoffWanted(st, [ap(1, 'strategy', 'pending')]), null);
  assert.equal(signoffWanted(st, [ap(1, 'strategy', 'approved')])?.id, 1);
  assert.equal(signoffWanted(st, [ap(1, 'strategy', 'approved'), ap(2, 'client', 'approved')]), null, 'answered');
  assert.equal(signoffWanted(st, [ap(1, 'strategy', 'approved'), ap(2, 'client', 'returned', { comment: 'x' }), ap(3, 'strategy', 'approved')])?.id, 3, 'a new Апрув 1 asks for a new answer');
  assert.equal(signoffWanted({ ...st, stage: 1 }, [ap(1, 'strategy', 'approved')]), null);
  assert.equal(signoffWanted({ ...st, paused: true }, [ap(1, 'strategy', 'approved')]), null);
});
await test('screens: the queue holds pending approvals and sign-offs of all projects, oldest first', () => {
  const q = buildQueue({
    projects: { 1: { name: 'Oxygen' }, 2: { name: 'Lelior' } },
    states: [{ project_id: 1, stage: 2, paused: false }, { project_id: 2, stage: 2, paused: false }],
    approvals: [ap(5, 'launch', 'pending', { project_id: 1, requested_at: '2026-11-19T10:00:00Z' }), ap(6, 'strategy', 'approved', { project_id: 2, decided_at: '2026-11-19T07:00:00Z' }), ap(7, 'strategy', 'approved', { project_id: 1 })],
  });
  assert.deepEqual(q.map((x) => [x.projectId, x.kind, x.virtual]), [[2, 'client', true], [1, 'client', true], [1, 'launch', false]]);
  assert.equal(q[0].project, 'Lelior');
});
await test('screens: the card «Зараз» tells what is next', () => {
  assert.equal(nowCard({ state: null }).action, 'start');
  assert.equal(nowCard({ state: { stage: 1, paused: true } }).action, 'resume');
  assert.equal(nowCard({ state: { stage: 2 }, approvals: [ap(1, 'strategy', 'pending')] }).action, 'decide');
  assert.equal(nowCard({ state: { stage: 2 }, approvals: [ap(1, 'strategy', 'approved')] }).action, 'signoff');
  const s0 = nowCard({ state: { stage: 0 }, hasBrief: false });
  assert.match(s0.text, /бриф/); assert.match(s0.text, /оплат/); assert.match(s0.text, /договор/);
  assert.equal(nowCard({ state: { stage: 0, paid_at: 'x', contracts_signed_at: 'x' }, hasBrief: true, runs: [{ id: 1, agent: 'researcher', skill: 'intake', status: 'running' }] }).tone, 'info');
  assert.equal(nowCard({ state: { stage: 1 }, runs: [{ id: 3, agent: 'creator', skill: 'strategy', status: 'failed', error: 'boom' }] }).tone, 'bad');
  assert.equal(nowCard({ state: { stage: 1 }, runs: [{ id: 3, agent: 'creator', skill: 'strategy', status: 'failed' }, { id: 4, agent: 'creator', skill: 'strategy', status: 'done' }] }).tone, 'ok', 'a later run of the same step clears the error');
});
await test('screens: five agents, the dossier has ten sections, proposals not yet answered are open', () => {
  const cards = agentCards([{ id: 1, agent: 'researcher', skill: 'site', status: 'done' }, { id: 2, agent: 'creator', skill: 'materials_ideas', status: 'running' }]);
  assert.equal(cards.length, 5);
  assert.equal(cards.find((c) => c.key === 'creator').active, true);
  assert.equal(cards.find((c) => c.key === 'mediabuyer').status, 'Не активний');
  const rows = sectionRows([{ id: 9, key: 'brief', status: 'approved', current_version_id: 4, needs_reapproval: true }]);
  assert.equal(rows.length, 10);
  assert.equal(rows[0].label, 'Затверджено'); assert.equal(rows[0].needsReapproval, true); assert.equal(rows[1].status, 'empty');
  const vs = [{ id: 1, version: 1, is_proposal: false }, { id: 2, version: 2, is_proposal: true }, { id: 3, version: 3, is_proposal: true }];
  assert.deepEqual(openProposals(vs, new Set([2])).map((v) => v.id), [3]);
});

// ---------------------------------------------------------------- A4: Unit Economy (numbers checked against the reference page of Lelior)
const LELIOR = { currency: 'USD', avg_order: 175, cogs_pct: 30, shipping_cost: 12, fee_pct: 3, returns_pct: 3, target_roas: 2.5, budget_monthly: 4500, min_campaign_daily: 15, site_cvr: 0.02,
  products: [{ name: 'AirPlug', price: 150 }, { name: 'Extrait 30 ml', price: 200 }],
  offers: [{ name: 'AirPlug + free 50 ml oil', pays: 150, list_value: 150, extra_cost: 18 }, { name: 'AirPlug + two oils, set $280', pays: 280, list_value: 350, approved: false }] };
await test('economics: the numbers of the Lelior page come out the same', () => {
  const r = computeUnitEconomy(LELIOR);
  const by = (name) => r.lines.find((l) => l.name === name);
  assert.equal(by('Середнє замовлення').contribution, 100); assert.equal(by('Середнє замовлення').breakeven_roas, 1.75); assert.equal(by('Середнє замовлення').target_cpa, 70);
  assert.equal(by('AirPlug').breakeven_cpa, 84); assert.equal(by('Extrait 30 ml').breakeven_cpa, 116);
  assert.equal(by('AirPlug + free 50 ml oil').breakeven_cpa, 66);
  assert.equal(by('AirPlug + two oils, set $280').breakeven_cpa, 146.2);
  assert.equal(by('Середнє замовлення').max_cpc_at_breakeven, 2);
  assert.equal(r.provisional, false); assert.equal(r.thresholds.breakeven_cpa, 100); assert.equal(r.thresholds.target_cpa, 70);
});
await test('economics: three budget scenarios (45 orders to break even and 64 at target on 4 500)', () => {
  const r = computeUnitEconomy(LELIOR);
  assert.deepEqual(r.scenarios.map((s) => s.name), ['Мінімальний', 'Базовий', 'Росту']);
  const base = r.scenarios[1];
  assert.equal(base.orders_to_break_even, 45); assert.equal(base.orders_at_target, 64); assert.equal(base.profit_after_ads_at_target, 1929);
  assert.equal(r.scenarios[0].monthly_budget, 450); assert.equal(r.scenarios[2].monthly_budget, 6750);
});
await test('economics: nothing is invented, missing parts are named, a loss-making line is flagged', () => {
  const none = computeUnitEconomy({});
  assert.equal(none.blocked, true); assert.ok(none.missing.length > 0);
  assert.match(renderUnitEconomy(none), /Потрібно від клієнта/);
  const part = computeUnitEconomy({ avg_order: 100, cogs_pct: 40 });
  assert.equal(part.blocked, false); assert.equal(part.provisional, true);
  assert.ok(part.assumptions.some((a) => /Доставка/.test(a))); assert.ok(part.missing.some((m) => /бюджет/.test(m)));
  assert.equal(part.scenarios.length, 0, 'no budget, no scenarios');
  const loss = computeUnitEconomy({ avg_order: 50, cogs_pct: 70, shipping_cost: 15, budget_monthly: 1000 });
  assert.equal(loss.lines[0].sellable_alone, false); assert.equal(loss.scenarios.length, 0);
  assert.match(renderUnitEconomy(loss), /ЗБИТКОВА/);
  const noCogs = computeUnitEconomy({ avg_order: 100 });
  assert.equal(noCogs.blocked, true, 'a price without a product cost cannot be counted');
  const text = renderUnitEconomy(computeUnitEconomy(LELIOR));
  assert.match(text, /беззбитковий CPA 100 USD/); assert.match(text, /Три сценарії бюджету/);
});
await test('economics: without the brief numbers the run waits, a task is made, a new brief wakes it up', async () => {
  const { repo, ctx } = await setup({ handlers: createHandlers({ researcher: { unit_economy: unitEconomy } }) });
  await repo.enqueueRun({ project_id: 1, agent: 'researcher', skill: 'unit_economy' });
  let st = await processTick(ctx);
  assert.equal(st.waiting, 1);
  const run = repo.T.runs[0];
  assert.equal(run.status, 'waiting'); assert.equal(run.state.blocked_on, 'brief');
  assert.equal(repo.T.tasks.length, 1); assert.equal(repo.T.tasks[0].owner, 'client');
  await processTick(ctx); assert.equal(repo.T.runs[0].status, 'waiting', 'nothing changed, still waiting'); assert.equal(repo.T.tasks.length, 1, 'the task is not added twice');
  assert.equal(repo.T.journal.filter((j) => j.action === 'blocked').length, 1, 'written once');
  advance(60000);
  await repo.writeSectionVersion(1, 'brief', { author_kind: 'human', author: 'm@x', body: 'Бриф', content: { economics: LELIOR } });
  await processTick(ctx);
  assert.equal(repo.T.runs[0].status, 'done');
  const ue = await repo.readSection(1, 'unit_economy');
  assert.equal(ue.version.content.thresholds.breakeven_cpa, 100); assert.equal(ue.version.author_kind, 'agent');
});
await test('economics: when the brief changes later, the agent proposes, the person keeps the text', async () => {
  const { repo, ctx } = await setup({ handlers: createHandlers({ researcher: { unit_economy: unitEconomy } }) });
  await repo.writeSectionVersion(1, 'brief', { author_kind: 'human', author: 'm@x', body: 'Бриф', content: { economics: LELIOR } });
  await repo.enqueueRun({ project_id: 1, agent: 'researcher', skill: 'unit_economy' });
  await processTick(ctx);
  await repo.writeSectionVersion(1, 'unit_economy', { author_kind: 'human', author: 'm@x', body: 'Моя правка', content: {} });
  await repo.enqueueRun({ project_id: 1, agent: 'researcher', skill: 'unit_economy' });
  await processTick(ctx);
  const ue = await repo.readSection(1, 'unit_economy');
  assert.equal(ue.version.body, 'Моя правка');
  assert.ok(repo.T.versions.some((v) => v.is_proposal && v.author === 'researcher'));
});

// ---------------------------------------------------------------- A4: the brief as a sheet
await test('brief sheet: a form becomes content for the agents and comes back unchanged', () => {
  const form = emptyForm();
  form.values = { ...form.values, geo: 'Florida', budget_monthly: '30000', target_roas: '2,5', avg_order: '175', cogs_pct: '30', shipping_cost: '12', fee_pct: '3', returns_pct: '3', site_cvr_pct: '2', min_campaign_daily: '' };
  form.meta = { avg_order: { status: 'confirmed', source: 'Shopify' }, cogs_pct: { source: 'оцінка клієнта' } };
  form.products = [{ name: 'AirPlug', price: '150', cogs: '', status: 'confirmed', source: 'сайт' }, { name: '', price: '1' }];
  form.offers = [{ name: 'Набір', pays: '280', list_value: '350', extra_cost: '', approved: false, status: 'assumption', source: '' }];
  const c = contentFromForm(form);
  assert.equal(c.economics.target_roas, 2.5, 'a comma is a decimal point');
  assert.equal(c.economics.site_cvr, 0.02, 'percent becomes a fraction');
  assert.equal(c.economics.min_campaign_daily, undefined, 'an empty field is not a zero');
  assert.equal(c.economics.products.length, 1, 'a row without a name is dropped');
  assert.equal(c.economics_meta.avg_order.status, 'confirmed'); assert.equal(c.economics_meta.cogs_pct.status, 'assumption', 'unmarked = assumption');
  assert.equal(c.general.geo, 'Florida');
  const back = formFromContent(c, 'текст');
  assert.equal(back.values.site_cvr_pct, '2'); assert.equal(back.values.avg_order, '175'); assert.equal(back.products[0].status, 'confirmed'); assert.equal(back.text, 'текст');
  assert.equal(rowStatus('', {}), 'empty'); assert.equal(rowStatus('1', { status: 'confirmed' }), 'confirmed'); assert.equal(rowStatus('1', {}), 'assumption');
  assert.ok(briefGaps(c).empty.includes('Мін. бюджет кампанії на день'));
});
await test('brief sheet: numbers that are only assumptions are listed in the Unit Economy', () => {
  const form = emptyForm();
  form.values = { ...form.values, budget_monthly: '3000', avg_order: '100', cogs_pct: '40', shipping_cost: '5', fee_pct: '3', returns_pct: '2', target_roas: '3', min_campaign_daily: '15' };
  form.meta = { avg_order: { status: 'confirmed' }, cogs_pct: { status: 'assumption', source: 'оцінка клієнта' } };
  const c = contentFromForm(form);
  const r = computeUnitEconomy(c.economics, c.economics_meta);
  assert.ok(r.assumptions.some((a) => /Собівартість/.test(a) && /оцінка клієнта/.test(a)));
  assert.ok(!r.assumptions.some((a) => /Середній чек/.test(a)), 'a confirmed number is not an assumption');
  assert.equal(r.provisional, true);
  assert.equal(r.thresholds.breakeven_cpa, computeUnitEconomy(c.economics).thresholds.breakeven_cpa, 'statuses do not change the numbers');
});

console.log(`\n${passed} workflow checks passed`);
