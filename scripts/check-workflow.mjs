// Checks of the new orchestrator (step A2): the brain (machine.js) and the cycle (tick.js) on an in-memory twin of the storage.
// The database rules themselves (versions, leases, uniqueness, access) are checked in the database with the self-rolling-back blocks of the migrations.
// Run:  node scripts/check-workflow.mjs
import assert from 'node:assert/strict';
import { planNext, STAGE } from '../api/_lib/wf/machine.js';
import { PACK_BLOCKS, blockOfTarget, buildPack, plural, remarksText, reviewState } from '../src/lib/workflow/pack.js';
import { reworkCreatives } from '../api/_lib/wf/skills/creativesAgent.js';
import { allocate, budgetPlan, checkStrategy, gatherStrategyFacts, marginInfo, neededFromClient, optimisationRules, prioritySource } from '../api/_lib/wf/skills/strategyEngine.js';
import { strategy } from '../api/_lib/wf/skills/strategyAgent.js';
import { checkCards, gatherCreativeFacts, goalsOf, referencePool, tagOf } from '../api/_lib/wf/skills/creativesEngine.js';
import { firstCreatives } from '../api/_lib/wf/skills/creativesAgent.js';
import { checkIdeas, checkMaterials, gatherIdeaFacts, inventoryOf, offerEconomics, renderIdeasText } from '../api/_lib/wf/skills/ideasEngine.js';
import { materialsIdeas } from '../api/_lib/wf/skills/materialsAgent.js';
import { checkSources, compareNumbers, createValidator, findDuplicateTasks, validateProject } from '../api/_lib/wf/check.js';
import { competitorCards, competitorHosts, siteAreaRows, siteCounts } from '../src/lib/workflow/sections.js';
import { adProblems } from '../src/lib/workflow/ads.js';
import { buildCompetitorsPrompt, checkCompetitors, compactSite, comparisonTasks, parseCompetitors, verifiedAds, withSiteAppendix } from '../api/_lib/wf/skills/competitorsEngine.js';
import { competitors } from '../api/_lib/wf/skills/competitorsAgent.js';
import { collectGa4Audience } from '../api/_lib/wf/skills/ga4Audience.js';
import { buildAudiencePrompt, checkSegments, gatherFacts, sourceNotes } from '../api/_lib/wf/skills/audienceEngine.js';
import { audience } from '../api/_lib/wf/skills/audienceAgent.js';
import { collectSiteData, pageSignals, pickCroPages, pickProductLink } from '../api/_lib/wf/skills/siteData.js';
import { AREAS, buildSitePrompt, checkFindings, parseSiteAnswer, renderSiteText, tasksFromFindings } from '../api/_lib/wf/skills/siteEngine.js';
import { site } from '../api/_lib/wf/skills/siteAgent.js';
import { readHtml } from '../api/_lib/siteReader.js';
import { computeAudit, renderAuditText, testCurve } from '../api/_lib/wf/skills/auditEngine.js';
import { audit } from '../api/_lib/wf/skills/auditAgent.js';
import { createHandlers } from '../api/_lib/wf/agents.js';
import { planProject, processTick } from '../api/_lib/wf/tick.js';
import { createMemoryWfRepo } from './wfMemoryRepo.mjs';
import { computeUnitEconomy, renderUnitEconomy } from '../api/_lib/wf/skills/economics.js';
import { intake } from '../api/_lib/wf/skills/intake.js';
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

// ---------------------------------------------------------------- A4: intake (is there data in the cabinet?)
const fakeMeta = (rows) => ({ insights: async ({ accountId }) => ({ account: 'act_' + accountId, rows }) });
await test('intake: spend in the Meta account means data, so an audit will be made', async () => {
  const { repo, ctx } = await setup({ handlers: createHandlers({ researcher: { intake } }) });
  repo.addAccount(1, { platform: 'meta', account_id: '123', account_name: 'Acc' });
  ctx.meta = fakeMeta([{ spend: 100, impressions: 5000, purchases: 3, period: { from_date: '2025-01-01', to_date: '2026-05-31' } }, { spend: 50.5, impressions: 100, period: { from_date: '2024-01-01', to_date: '2024-02-01' } }]);
  await repo.enqueueRun({ project_id: 1, agent: 'researcher', skill: 'intake' });
  await processTick(ctx);
  assert.equal(repo.T.states.get(1).has_data, true);
  const out = repo.T.runs[0].output;
  assert.equal(out.spend, 150.5); assert.equal(out.accounts[0].from, '2024-01-01'); assert.equal(out.accounts[0].to, '2026-05-31');
});
await test('intake: an account that never spent money means no data and no audit', async () => {
  const { repo, ctx } = await setup({ handlers: createHandlers({ researcher: { intake } }) });
  repo.addAccount(1, { platform: 'meta', account_id: '123' });
  ctx.meta = fakeMeta([]);
  await repo.enqueueRun({ project_id: 1, agent: 'researcher', skill: 'intake' });
  await processTick(ctx);
  assert.equal(repo.T.states.get(1).has_data, false);
});
await test('intake: no account linked: the run waits, a task for the manager, it wakes up when an account is linked', async () => {
  const { repo, ctx } = await setup({ handlers: createHandlers({ researcher: { intake } }) });
  ctx.meta = fakeMeta([{ spend: 10, period: {} }]);
  await repo.enqueueRun({ project_id: 1, agent: 'researcher', skill: 'intake' });
  await processTick(ctx);
  assert.equal(repo.T.runs[0].status, 'waiting'); assert.equal(repo.T.tasks[0].owner, 'manager');
  await processTick(ctx); assert.equal(repo.T.runs[0].status, 'waiting', 'still no account');
  repo.addAccount(1, { platform: 'google', account_id: '999' }); await processTick(ctx);
  assert.equal(repo.T.runs[0].status, 'waiting', 'a Google account does not count for the Meta check');
  repo.addAccount(1, { platform: 'meta', account_id: '123' }); await processTick(ctx);
  assert.equal(repo.T.runs[0].status, 'done'); assert.equal(repo.T.states.get(1).has_data, true);
});
await test('intake: without the Meta reader (no token) the run fails with a readable reason', async () => {
  const { repo, ctx } = await setup({ handlers: createHandlers({ researcher: { intake } }) });
  repo.addAccount(1, { platform: 'meta', account_id: '123' });
  await repo.enqueueRun({ project_id: 1, agent: 'researcher', skill: 'intake' });
  await processTick(ctx);
  assert.equal(repo.T.runs[0].status, 'failed'); assert.match(repo.T.runs[0].error, /META_ACCESS_TOKEN/);
});

// ---------------------------------------------------------------- A4: the audit of a Meta account
const mrow = (month, spend, purchases, revenue, extra = {}) => ({ spend, impressions: spend * 40, clicks: spend, purchases, leads: 0, messages: 0, revenue, period: { from_date: month + '-01', to_date: month + '-28' }, ...extra });
const TH = { breakeven_roas: 1.75, target_roas: 2.5, breakeven_cpa: 100, target_cpa: 70 };
const AUDIT_DATA = {
  currency: 'USD',
  monthly: [mrow('2024-04', 3000, 100, 6000), mrow('2025-03', 0, 0, 0), mrow('2025-04', 36700, 871, 25300), mrow('2025-05', 75000, 800, 80000), mrow('2026-05', 1000, 10, 900)],
  campaigns: [{ campaign_id: '1', name: 'Sales A', spend: 90000, purchases: 1500, revenue: 70000 }, { campaign_id: '2', name: 'Reach B', spend: 10000, purchases: 0, revenue: 0 }],
  campaignMeta: [{ id: '1', name: 'Sales A', objective: 'OUTCOME_SALES' }, { id: '2', name: 'Reach B', objective: 'OUTCOME_AWARENESS' }],
  windowAds: [{ ad_id: 'a1', name: 'Good ad', spend: 500, purchases: 10, revenue: 1500 }, { ad_id: 'a2', name: 'Bad ad', spend: 400, purchases: 1, revenue: 100 }, { ad_id: 'a3', name: 'Tiny', spend: 5, purchases: 0, revenue: 0 }],
  windowAdsets: [], windowCampaigns: [{ campaign_id: '1', name: 'Sales A', spend: 900, purchases: 11, revenue: 1600 }],
  breakdowns: { age: { life: [{ age: '25-34', spend: 6000, purchases: 120, revenue: 15600 }, { age: '55-64', spend: 4000, purchases: 20, revenue: 2000 }], recent: [] } },
  pixels: [{ id: '1', name: 'Pixel A', lastFired: '2026-05-30' }, { id: '2', name: 'Pixel B', lastFired: null }],
};
await test('audit: years, months, concentration and break-even come out right', () => {
  const a = computeAudit(AUDIT_DATA, TH);
  assert.equal(a.resultKind, 'purchases');
  assert.deepEqual(a.years.map((y) => [y.year, y.spend]), [['2024', 3000], ['2025', 111700], ['2026', 1000]]);
  assert.equal(a.overview.spend, 115700); assert.equal(a.overview.results, 1781);
  assert.deepEqual(a.above_breakeven, ['2024-04'], 'only the month at ROAS 2.0 is above 1.75');
  assert.equal(a.months.find((m) => m.month === '2024-04').verdict, 'ok'); assert.equal(a.months.find((m) => m.month === '2025-04').verdict, 'bad');
  assert.equal(a.months.find((m) => m.month === '2025-03').verdict, 'few');
  assert.deepEqual(a.concentration.top.map((t) => t.month), ['2025-05', '2025-04']); assert.ok(a.concentration.share > 0.9);
  assert.ok(a.findings.dynamics.some((f) => f.tone === 'r' && /сплесками/.test(f.text)));
  assert.ok(a.findings.dynamics.some((f) => f.tone === 'r' && /Жоден місяць із витратою/.test(f.text)));
});
await test('audit: objectives, best and worst ads (tiny spend is not judged), breakdowns, pixels', () => {
  const a = computeAudit(AUDIT_DATA, TH);
  const sales = a.objectives.find((o) => o.objective === 'OUTCOME_SALES');
  assert.equal(sales.spend, 90000); assert.equal(sales.share, 0.9);
  assert.equal(a.recent.ads.best[0].name, 'Good ad'); assert.equal(a.recent.ads.worst[0].name, 'Bad ad');
  assert.ok(![...a.recent.ads.best, ...a.recent.ads.worst].some((l) => l.name === 'Tiny'), 'below the minimum spend: no verdict');
  const age = a.breakdowns.age.life; assert.equal(age[0].key, '25-34'); assert.equal(age[0].verdict, 'good'); assert.equal(age[1].verdict, 'bad');
  assert.ok(a.findings.audiences.some((f) => f.tone === 'r' && /55-64/.test(f.text)));
  assert.equal(a.tracking.multiple, true); assert.deepEqual(a.tracking.never, ['Pixel B']);
  assert.ok(a.findings.tracking.some((f) => /кілька піксельних/.test(f.text)));
});
await test('audit: the test curve counts spend until the first results and ignores ads that started before the window', () => {
  const day = (ad, d, spend, purchases) => ({ ad_id: ad, spend, purchases, period: { from_date: d, to_date: d } });
  const w = { since: '2026-03-02', until: '2026-05-31' };
  const rows = [day('old', '2026-03-01', 50, 5),
    day('x', '2026-03-10', 40, 0), day('x', '2026-03-11', 40, 0), day('x', '2026-03-12', 40, 2), day('x', '2026-03-13', 40, 3),
    day('y', '2026-04-01', 60, 1), day('z', '2026-04-02', 30, 0), day('z', '2026-04-03', 90, 0)];
  const t = testCurve(rows, w, 'purchases');
  assert.equal(t.launched, 3, 'the ad that started before the window is skipped');
  assert.equal(t.with_result, 2); assert.equal(t.share_with_result, 0.67);
  assert.equal(t.reached5.count, 1); assert.equal(t.reached5.max_first_spend, 120, 'ad x: first purchase after 40+40+40 = 120');
  assert.equal(t.never.count, 1); assert.equal(t.never.spend, 120); assert.equal(t.never.over100, 1);
  assert.equal(testCurve([], w, 'purchases'), null);
});
await test('audit: without the thresholds nothing is called loss-making, and the text says why', () => {
  const a = computeAudit(AUDIT_DATA, null);
  assert.ok(a.months.every((m) => ['none', 'few'].includes(m.verdict)));
  assert.ok(a.open.some((o) => /Unit Economy ще не пораховано/.test(o)));
  assert.match(renderAuditText(a), /Аудит кабінету Meta/);
});
await test('audit: a cabinet with messages only is read by the cost of a message and says sales are unknown', () => {
  const a = computeAudit({ currency: 'UAH', monthly: [{ spend: 12789, impressions: 90000, clicks: 1300, purchases: 0, leads: 0, messages: 121, revenue: 0, period: { from_date: '2026-03-01', to_date: '2026-05-31' } }], campaigns: [], breakdowns: {} }, null);
  assert.equal(a.resultKind, 'messages'); assert.equal(a.overview.cpr, 105.69);
  assert.ok(a.open.some((o) => /лише звернень/.test(o)));
});
await test('audit: the skill reads Meta, judges against the Unit Economy and writes the section; without an account or a reader it waits or fails clearly', async () => {
  const handlers = createHandlers({ researcher: { audit } });
  const { repo, ctx } = await setup({ handlers });
  const calls = [];
  ctx.meta = {
    insights: async (o) => { calls.push(o.level + (o.breakdowns ? ':' + o.breakdowns.join('+') : '') + (o.increment ? ':inc' + o.increment : '')); return { account: 'act_1', rows: o.level === 'account' && !o.breakdowns && o.increment === 'monthly' ? AUDIT_DATA.monthly : [], truncated: false }; },
    campaigns: async () => AUDIT_DATA.campaignMeta, pixels: async () => AUDIT_DATA.pixels,
  };
  await repo.enqueueRun({ project_id: 1, agent: 'researcher', skill: 'audit' });
  await processTick(ctx);
  assert.equal(repo.T.runs[0].status, 'waiting', 'no account yet'); assert.equal(repo.T.tasks[0].title, 'Підключити рекламний кабінет Meta до проєкту');
  repo.addAccount(1, { platform: 'meta', account_id: '1', currency: 'USD' });
  await repo.writeSectionVersion(1, 'unit_economy', { author_kind: 'agent', author: 'researcher', body: 'ue', content: { thresholds: { breakeven_roas: 1.75, target_roas: 2.5, breakeven_cpa: 100, target_cpa: 70 } } });
  await processTick(ctx);
  assert.equal(repo.T.runs[0].status, 'done');
  const sec = await repo.readSection(1, 'audit');
  assert.equal(sec.version.content.thresholds.breakeven_roas, 1.75); assert.match(sec.version.body, /Аудит кабінету Meta/);
  assert.ok(calls.some((c) => c.includes('inc')), 'the monthly history was read');
  assert.ok(calls.includes('account:age'), 'breakdowns were read');
  const bad = await setup({ handlers });
  bad.repo.addAccount(1, { platform: 'meta', account_id: '1' });
  await bad.repo.enqueueRun({ project_id: 1, agent: 'researcher', skill: 'audit' });
  await processTick(bad.ctx);
  assert.equal(bad.repo.T.runs[0].status, 'failed'); assert.match(bad.repo.T.runs[0].error, /META_ACCESS_TOKEN/);
});
await test('audit: a part of Meta that cannot be read is named in the audit, the rest is kept', async () => {
  const { repo, ctx } = await setup({ handlers: createHandlers({ researcher: { audit } }) });
  repo.addAccount(1, { platform: 'meta', account_id: '1' });
  ctx.meta = { insights: async (o) => { if (o.breakdowns) throw new Error('(#100) breakdown not allowed'); return { rows: o.increment === 'monthly' ? AUDIT_DATA.monthly : [] }; }, campaigns: async () => { throw new Error('nope'); }, pixels: async () => [] };
  await repo.enqueueRun({ project_id: 1, agent: 'researcher', skill: 'audit' });
  await processTick(ctx);
  assert.equal(repo.T.runs[0].status, 'done');
  const sec = await repo.readSection(1, 'audit');
  assert.ok(sec.version.content.open.some((o) => /не вдалося прочитати/i.test(o) && /розбивка/.test(o)));
});

await test('audit: an ad is never both best and worst; with thresholds best = above break-even, worst = below it', () => {
  const ad = (id, spend, purchases, revenue) => ({ ad_id: id, name: id, spend, purchases, revenue });
  const a = computeAudit({ ...AUDIT_DATA, windowAds: [ad('A', 500, 10, 1000), ad('B', 500, 8, 600), ad('C', 500, 5, 400), ad('D', 500, 3, 250), ad('E', 900, 20, 1800)] }, TH);
  const best = a.recent.ads.best.map((l) => l.name), worst = a.recent.ads.worst.map((l) => l.name);
  assert.ok(best.every((n) => ['A', 'E'].includes(n)) && best.length === 2, 'only ROAS 2.0 is above 1.75');
  assert.ok(worst.every((n) => ['B', 'C', 'D'].includes(n)) && worst.length === 3);
  assert.equal(best.filter((n) => worst.includes(n)).length, 0);
  assert.equal(worst[0], 'D', 'the worst first');
});
await test('audit: the audit does not read the clock: stale pixels are judged against the date of the data', () => {
  const a = computeAudit({ ...AUDIT_DATA, now: '2026-06-10T00:00:00Z' }, TH);
  assert.deepEqual(a.tracking.stale, [], 'Pixel A fired on 30 May, 11 days before the given date');
  const b = computeAudit({ ...AUDIT_DATA, now: '2026-09-10T00:00:00Z' }, TH);
  assert.deepEqual(b.tracking.stale, ['Pixel A']);
  assert.deepEqual(computeAudit(AUDIT_DATA, TH), computeAudit(AUDIT_DATA, TH), 'same data, same audit');
});

// ---------------------------------------------------------------- A4: the site skill (a CRO review of the client's website)
const HOME_HTML = `<html><head><title>Меблі Лоза: стільці й столи</title><meta name="description" content="Стільці та столи з дерева"><meta name="viewport" content="width=device-width">
<script type="application/ld+json">{"@graph":[{"@type":"Organization"},{"@type":["Product","Thing"]}]}</script></head>
<body><nav><a href="/catalog/">Каталог</a><a href="/delivery">Доставка й оплата</a><a href="/contacts">Контакти</a><a href="/blog/post-1">Блог</a><a href="https://other.example/catalog">Партнер</a><a href="/files/price.pdf">Прайс</a></nav>
<h1>Стільці з дубу ручної роботи</h1><h2>Безкоштовна доставка від 5000 грн</h2><p>Виготовляємо меблі з натурального дерева. Стілець Лоза коштує 3200 грн.</p>
<a class="btn" href="/catalog/">Дивитись каталог</a><button>Купити в 1 клік</button><a href="tel:+380501112233">Подзвонити</a><a href="https://t.me/lozashop">Telegram</a>
<form><input type="email" name="email"><button>Підписатись</button></form><footer>© Лоза, Київ, вул. Дубова 1</footer></body></html>`;
const CATALOG_HTML = `<html><head><title>Каталог</title></head><body><h1>Каталог</h1><a href="/catalog/chair-oak">Стілець Дуб</a><a href="/catalog/page/2">Далі</a><p>Ціни від 2900 грн</p></body></html>`;
const PRODUCT_HTML = `<html><head><title>Стілець Дуб</title><meta name="viewport" content="width=device-width"></head><body><h1>Стілець Дуб</h1><p>Ціна 3200 грн. В наявності. Є відгуки покупців.</p><button>Додати в кошик</button></body></html>`;
const DELIVERY_HTML = `<html><head><title>Доставка й оплата</title></head><body><h1>Доставка</h1><p>Нова пошта 2-3 дні. Оплата карткою Visa або післяплатою.</p></body></html>`;
const CONTACTS_HTML = `<html><head><title>Контакти</title></head><body><h1>Контакти</h1><p>Київ, вул. Дубова 1. Щодня з 9 до 18.</p></body></html>`;
const SITE = { 'https://loza.example/': HOME_HTML, 'https://loza.example/catalog/': CATALOG_HTML, 'https://loza.example/catalog/chair-oak': PRODUCT_HTML, 'https://loza.example/delivery': DELIVERY_HTML, 'https://loza.example/contacts': CONTACTS_HTML };
const fakeNet = (pages = SITE, robots = '') => {
  const hits = [];
  const fetchFn = async (url) => {
    hits.push(url);
    if (url.endsWith('/robots.txt')) return robots ? new Response(robots, { status: 200, headers: { 'content-type': 'text/plain' } }) : new Response('', { status: 404 });
    return pages[url] != null ? new Response(pages[url], { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } }) : new Response('nope', { status: 404, headers: { 'content-type': 'text/html' } });
  };
  return { fetchFn, hits, lookup: async () => [{ address: '93.184.216.34' }] };
};
await test('site: the pages worth reading are chosen by kind, one each, only on the same site and never files', () => {
  const links = [['https://loza.example/catalog/', 'Каталог'], ['https://loza.example/catalog/sofas', 'Дивани'], ['https://loza.example/delivery', 'Доставка'], ['https://other.example/contacts', 'Контакти'], ['https://loza.example/files/x.pdf', 'Прайс'], ['https://loza.example/contacts', 'Контакти'], ['https://loza.example/zzz', 'Різне']].map(([url, label]) => ({ url, label }));
  const picked = pickCroPages(links, 'https://loza.example/');
  assert.deepEqual(picked.map((p) => p.kind), ['catalog', 'delivery', 'contacts']);
  assert.equal(picked.find((p) => p.kind === 'catalog').url, 'https://loza.example/catalog/');
  assert.equal(pickProductLink([{ url: 'https://loza.example/catalog/chair-oak', label: 'x' }, { url: 'https://loza.example/catalog/page/2', label: 'p' }], 'https://loza.example/catalog/', 'https://loza.example/'), 'https://loza.example/catalog/chair-oak');
});
await test('site: signals are hard facts counted from the HTML', () => {
  const home = readHtml(HOME_HTML, 'https://loza.example/');
  const s = pageSignals(HOME_HTML, home.text);
  assert.equal(s.viewport, true); assert.deepEqual(s.h1, ['Стільці з дубу ручної роботи']);
  assert.deepEqual(s.structured.sort(), ['Organization', 'Product', 'Thing']);
  assert.equal(s.phone_link, true); assert.deepEqual(s.messengers, ['t.me']); assert.equal(s.forms, 1); assert.equal(s.email_inputs, 1);
  assert.ok(s.buttons.includes('Купити в 1 клік') && s.buttons.includes('Дивитись каталог'));
  assert.ok(s.price_samples.some((p) => /3200 грн/.test(p))); assert.equal(s.search, false);
  assert.deepEqual(pageSignals('<html><body><input type="search"></body></html>', '').search, true);
  assert.ok(s.delivery_words.includes('безкоштовна доставка'));
});
await test('site: the collector reads the home page, the key pages and a product from the catalog; a missing page is a fact, robots.txt is obeyed', async () => {
  const net = fakeNet();
  const d = await collectSiteData({ website: 'loza.example', ...net });
  assert.deepEqual(d.pages.map((p) => p.kind), ['home', 'catalog', 'delivery', 'contacts', 'product']);
  assert.ok(d.pages.every((p) => p.ok)); assert.equal(d.pages[0].signals.https, true);
  assert.ok(d.pages.find((p) => p.kind === 'product').url.endsWith('/catalog/chair-oak'));
  const withGap = await collectSiteData({ website: 'loza.example', ...fakeNet({ ...SITE, 'https://loza.example/delivery': undefined }) });
  assert.equal(withGap.pages.find((p) => p.kind === 'delivery').ok, false); assert.equal(withGap.pages.find((p) => p.kind === 'delivery').error, 'HTTP 404');
  const closed = await collectSiteData({ website: 'loza.example', ...fakeNet(SITE, 'User-agent: *\nDisallow: /') });
  assert.equal(closed.blockedByRobots, true); assert.equal(closed.pages.length, 0);
  const some = await collectSiteData({ website: 'loza.example', ...fakeNet(SITE, 'User-agent: *\nDisallow: /delivery') });
  assert.equal(some.pages.find((p) => p.kind === 'delivery').error, 'Заборонено robots.txt');
  await assert.rejects(() => collectSiteData({ website: 'http://localhost/', ...net }), /Внутрішні/);
});
await test('site: the prompt carries the facts, the rules and no competitors', async () => {
  const d = await collectSiteData({ website: 'loza.example', ...fakeNet() });
  const p = buildSitePrompt({ data: d, speed: null, brief: { content: { general: { goal: 'Продаж стільців', geo: 'Україна' }, economics: { products: ['Стілець Дуб'] } } } });
  assert.match(p.system, /ALONE/); assert.match(p.system, /Never invent numbers/);
  assert.match(p.user, /Продаж стільців/); assert.match(p.user, /Безкоштовна доставка від 5000 грн/); assert.match(p.user, /Put "speed" in not_checked/);
  assert.ok(AREAS.length === 11 && AREAS.every((a) => p.user.includes(a.key)));
});
await test('site: a finding is trusted only when its quote and numbers stand in what was read', async () => {
  const d = await collectSiteData({ website: 'loza.example', ...fakeNet() });
  const f = (o) => ({ area: 'first_screen', severity: 'high', page: 'https://loza.example/', seen: 'Є заголовок.', why: 'Бо так.', change: 'Змінити.', acceptance: 'Перевірити.', evidence: { kind: 'quote', quote: 'Безкоштовна доставка від 5000 грн' }, ...o });
  const raw = { findings: [
    f({}),
    f({ evidence: { kind: 'quote', quote: 'Знижка 50% лише сьогодні' } }),
    f({ seen: 'Поріг безкоштовної доставки 5000 грн, а конверсія 4,7%.' }),
    f({ area: 'terms', evidence: { kind: 'absence' }, seen: 'Умов повернення на прочитаних сторінках немає.', severity: 'medium' }),
    f({ area: 'mobile', evidence: { kind: 'signal', signal: 'viewport' }, severity: 'low' }),
    f({ area: 'mobile', evidence: { kind: 'signal', signal: 'nonexistent' } }),
    f({ area: 'weather' }), f({ change: '' }),
  ], ok_areas: [{ area: 'contact', note: 'Є телефон і Telegram.' }, { area: 'bogus', note: 'x' }], not_checked: [{ area: 'speed', reason: 'Немає PageSpeed.' }] };
  const r = checkFindings(raw, d, null);
  assert.equal(r.dropped, 2, 'unknown area and a missing field');
  assert.equal(r.findings.filter((x) => x.verified).length, 3);
  const bad = r.findings.filter((x) => !x.verified).map((x) => x.problem);
  assert.ok(bad.some((p) => /цитати немає/.test(p)) && bad.some((p) => /число без джерела: 4,7/.test(p)) && bad.some((p) => /такого показника/.test(p)));
  assert.equal(r.findings[0].verified, true, 'verified first'); assert.equal(r.ok_areas.length, 1); assert.equal(r.not_checked[0].area_name, 'Швидкість');
  const tasks = tasksFromFindings(r.findings);
  assert.equal(tasks.length, 2, 'only verified, and the low one stays in the section'); assert.ok(tasks.every((t) => t.type === 'site' && t.owner === 'client_dev'));
  const text = renderSiteText(r, { url: d.url, pages: d.pages, speedChecked: false });
  assert.match(text, /Не підтверджено \(3\)/); assert.match(text, /Критерій приймання/); assert.match(text, /Швидкість не перевірялась/);
});
await test('site: the answer of the model is read from JSON, a fence is tolerated, garbage is a clear error', () => {
  assert.equal(parseSiteAnswer('```json\n{"findings":[]}\n```').findings.length, 0);
  assert.equal(parseSiteAnswer('Ось: {"findings":[{"area":"trust"}]} Готово').findings.length, 1);
  assert.throws(() => parseSiteAnswer('Вибачте, не можу'), /не у форматі JSON/);
  assert.throws(() => parseSiteAnswer('{"findings": "x"}'), /немає списку/);
});
await test('site: the skill waits for the website address, then reads the site, asks the model, writes the section and the tasks', async () => {
  const handlers = createHandlers({ researcher: { site } });
  const { repo, ctx } = await setup({ handlers });
  const net = fakeNet(); Object.assign(ctx, net);
  const asked = [];
  ctx.ask = async (o) => { asked.push(o); return { costUsd: 0.04, text: JSON.stringify({ findings: [
    { area: 'terms', severity: 'high', page: 'https://loza.example/delivery', seen: 'Нова пошта 2-3 дні, умов повернення немає.', evidence: { kind: 'absence' }, why: 'Покупець боїться купити без повернення.', change: 'Додати сторінку «Повернення».', acceptance: 'Є сторінка і посилання в підвалі.' },
    { area: 'first_screen', severity: 'medium', page: 'https://loza.example/', seen: 'Головна кнопка веде в каталог.', evidence: { kind: 'quote', quote: 'Безкоштовна доставка від 5000 грн' }, why: 'Оффер не на першому плані.', change: 'Винести оффер у заголовок.', acceptance: 'Оффер видно без прокрутки.' },
    { area: 'upsell', severity: 'high', page: '', seen: 'Допродажів не видно.', evidence: { kind: 'quote', quote: 'Купуйте разом зі знижкою 30%' }, why: 'x', change: 'Додати блок.', acceptance: 'Є блок.' }], ok_areas: [{ area: 'contact', note: 'Телефон і Telegram є.' }], not_checked: [{ area: 'speed', reason: 'Немає PageSpeed.' }] }) }; };
  await repo.enqueueRun({ project_id: 1, agent: 'researcher', skill: 'site' });
  await processTick(ctx);
  assert.equal(repo.T.runs[0].status, 'waiting'); assert.equal(repo.T.runs[0].state.blocked_on, 'site_url');
  assert.equal(repo.T.tasks[0].title, 'Вказати сайт клієнта в картці проєкту'); assert.equal(asked.length, 0, 'no site, no model call');
  repo.setWebsite(1, 'https://loza.example');
  await processTick(ctx);
  assert.equal(repo.T.runs[0].status, 'done', repo.T.runs[0].error);
  assert.equal(asked.length, 1); assert.match(asked[0].user, /Стільці з дубу ручної роботи/); assert.equal(asked[0].projectId, 1);
  const sec = await repo.readSection(1, 'site');
  const c = sec.version.content;
  assert.equal(c.findings.length, 3); assert.equal(c.findings.filter((f) => f.verified).length, 2); assert.equal(c.speed, null);
  assert.ok(c.open.some((o) => /ключ PageSpeed не додано/.test(o)));
  assert.match(sec.version.body, /Не підтверджено \(1\)/); assert.match(sec.version.body, /без порівняння з конкурентами/);
  const siteTasks = repo.T.tasks.filter((t) => t.type === 'site');
  assert.equal(siteTasks.length, 2); assert.equal(siteTasks[0].priority, 'high'); assert.equal(siteTasks[0].owner, 'client_dev');
  assert.equal(repo.T.runs[0].cost_usd, 0.04, 'the cost of the model call is written to the run (the project cost cap counts it)');
  assert.equal(repo.T.runs[0].output.verified, 2);
});
await test('site: speed is added when a key is set, and a PageSpeed failure is a note, not a failure of the skill', async () => {
  const handlers = createHandlers({ researcher: { site } });
  const lh = { lighthouseResult: { categories: { performance: { score: 0.42 }, seo: { score: 0.9 } }, audits: { 'largest-contentful-paint': { numericValue: 5200 } } } };
  for (const [ok, expectSpeed] of [[true, true], [false, false]]) {
    const { repo, ctx } = await setup({ handlers });
    const net = fakeNet(); repo.setWebsite(1, 'loza.example');
    const fetchFn = async (url, init) => (String(url).includes('pagespeedonline') ? (ok ? new Response(JSON.stringify(lh), { status: 200 }) : new Response(JSON.stringify({ error: { message: 'quota' } }), { status: 429 })) : net.fetchFn(url, init));
    Object.assign(ctx, { fetchFn, lookup: net.lookup, speedKey: 'k' });
    let prompt = ''; ctx.ask = async (o) => { prompt = o.user; return { text: '{"findings":[],"ok_areas":[],"not_checked":[]}' }; };
    await repo.enqueueRun({ project_id: 1, agent: 'researcher', skill: 'site' });
    await processTick(ctx);
    assert.equal(repo.T.runs[0].status, 'done', repo.T.runs[0].error);
    const c = (await repo.readSection(1, 'site')).version.content;
    assert.equal(!!c.speed, expectSpeed); assert.match(prompt, expectSpeed ? /PAGESPEED \(Google lab test/ : /PAGESPEED: not available/);
    if (!expectSpeed) assert.ok(c.open.some((o) => /Швидкість не перевірено/.test(o)));
  }
});
await test('site: no model, a closed site and an unreadable site are told apart', async () => {
  const handlers = createHandlers({ researcher: { site } });
  const a = await setup({ handlers }); a.repo.setWebsite(1, 'loza.example'); Object.assign(a.ctx, fakeNet());
  await a.repo.enqueueRun({ project_id: 1, agent: 'researcher', skill: 'site' }); await processTick(a.ctx);
  assert.equal(a.repo.T.runs[0].status, 'failed'); assert.match(a.repo.T.runs[0].error, /ANTHROPIC_API_KEY/);
  const b = await setup({ handlers }); b.repo.setWebsite(1, 'loza.example'); Object.assign(b.ctx, fakeNet(SITE, 'User-agent: *\nDisallow: /')); b.ctx.ask = async () => { throw new Error('must not be called'); };
  await b.repo.enqueueRun({ project_id: 1, agent: 'researcher', skill: 'site' }); await processTick(b.ctx);
  assert.equal(b.repo.T.runs[0].status, 'done'); assert.equal(b.repo.T.runs[0].output.blocked_by_robots, true); assert.match(b.repo.T.tasks[0].title, /robots\.txt/);
  const c = await setup({ handlers }); c.repo.setWebsite(1, 'loza.example'); Object.assign(c.ctx, fakeNet({})); c.ctx.ask = async () => { throw new Error('must not be called'); };
  await c.repo.enqueueRun({ project_id: 1, agent: 'researcher', skill: 'site' }); await processTick(c.ctx);
  assert.equal(c.repo.T.runs[0].status, 'failed'); assert.match(c.repo.T.runs[0].error, /Сайт не прочитано/);
  const d = await setup({ handlers }); d.repo.setWebsite(1, 'loza.example'); Object.assign(d.ctx, fakeNet()); d.ctx.ask = async () => ({ text: 'Вибачте, не можу' });
  await d.repo.enqueueRun({ project_id: 1, agent: 'researcher', skill: 'site' }); await processTick(d.ctx);
  assert.equal(d.repo.T.runs[0].status, 'failed'); assert.match(d.repo.T.runs[0].error, /не у форматі JSON/);
  assert.equal(await d.repo.readSection(1, 'site').then((s) => s?.version ?? null), null, 'nothing is written from a bad answer');
});
// ---------------------------------------------------------------- A4: the audience skill (segments by the situation of buying)
const gaResp = (rows) => ({ rows: rows.map(([k, u, s, p, r]) => ({ dimensionValues: [{ value: k }], metricValues: [{ value: String(u) }, { value: String(s ?? u) }, { value: String(p ?? 0) }, { value: String(r ?? 0) }] })) });
const fakeGa4 = ({ demographics = true, fail = null } = {}) => {
  const calls = [];
  return { calls, runReport: async ({ propertyId, body }) => {
    calls.push({ propertyId, dim: body.dimensions[0].name, range: body.dateRanges[0] });
    const dim = body.dimensions[0].name;
    if (fail) throw new Error(fail);
    if (dim === 'userAgeBracket') return demographics ? gaResp([['25-34', 600, 700, 30, 3000], ['35-44', 300, 350, 10, 900], ['unknown', 100]]) : gaResp([['unknown', 1000]]);
    if (dim === 'userGender') return demographics ? gaResp([['female', 700, 800, 35, 3500], ['male', 300]]) : gaResp([['unknown', 1000]]);
    if (dim === 'country') return gaResp([['Ukraine', 900], ['Poland', 100]]);
    if (dim === 'city') return gaResp([['Kyiv', 400], ['Lviv', 200], ['(not set)', 50]]);
    if (dim === 'deviceCategory') return gaResp([['mobile', 800], ['desktop', 200]]);
    if (dim === 'newVsReturning') return gaResp([['new', 700], ['returning', 300]]);
    if (dim === 'sessionDefaultChannelGroup') return gaResp([['Paid Social', 500], ['Organic Search', 300]]);
    if (dim === 'eventName') return { rows: [['view_item', 5000], ['add_to_cart', 600], ['purchase', 90]].map(([e, n]) => ({ dimensionValues: [{ value: e }], metricValues: [{ value: String(n) }] })) };
    return { rows: [] };
  } };
};
const AUD_BRIEF = { content: { general: { geo: 'Україна', goal: '60 замовлень на місяць', audience: 'Жінки, які купують меблі для першої квартири, та молоді родини', ga4_property: 'properties/123456789' }, economics: { products: [{ name: 'Стілець Дуб' }], offers: [] } }, body: '' };
const AUD_AUDIT = { resultKind: 'purchases', currency: 'USD', breakdowns: { age: { life: [{ key: '25-34', share: 0.6, results: 120, roas: 2.4, cpr: 40, verdict: 'good' }, { key: '55-64', share: 0.2, results: 10, roas: 0.9, cpr: 120, verdict: 'bad' }], recent: [] }, gender: { life: [{ key: 'female', share: 0.8, results: 100, roas: 2.2, cpr: 45, verdict: 'good' }], recent: [] }, device: { life: [], recent: [] } } };
const SEG = (o) => ({ name: 'Молоді родини', who: 'Пари, які облаштовують першу квартиру', situation: 'Переїзд, потрібні стільці й стіл', wants: 'Міцне дерево за розумну ціну', pains: 'Дешеві меблі ламаються', blockers: 'Не бачать матеріал вживу', convincers: 'Відгуки й гарантія', message: 'Меблі на роки', formats: 'Відео-огляд', products: 'Стілець Дуб', targeting: 'Інтереси: ремонт, дизайн інтер’єру', angles: ['Стілець, який переживе переїзд'], confirmed_by: [{ source: 'brief', ref: 'молоді родини' }, { source: 'meta', ref: '25-34' }, { source: 'ga4', ref: 'mobile' }], ...o });
await test('audience: GA4 is read for the client property, demographics are checked, unknown values are kept out of the shares', async () => {
  const ga = fakeGa4();
  const d = await collectGa4Audience(ga, 'properties/123456789', new Date('2026-11-19T10:00:00Z'));
  assert.equal(d.property, '123456789'); assert.deepEqual(d.window, { start: '2026-08-21', end: '2026-11-18' });
  assert.equal(d.demographics, true); assert.equal(d.reports.age.rows[0].key, '25-34'); assert.equal(d.reports.age.rows[0].share, 0.667, '600 of 900 known users');
  assert.equal(d.reports.age.unknown_users, 100); assert.equal(d.reports.city.rows.length, 2, '(not set) is not a city');
  assert.deepEqual(d.funnel.map((f) => f.event), ['view_item', 'add_to_cart', 'purchase']);
  assert.ok(ga.calls.every((c) => c.propertyId === '123456789'));
  const off = await collectGa4Audience(fakeGa4({ demographics: false }), '1', new Date('2026-11-19T10:00:00Z'));
  assert.equal(off.demographics, false, 'no age and gender in this GA4: they are skipped, the client is not asked');
  const bad = await collectGa4Audience(fakeGa4({ fail: 'GA4: permission denied' }), '1', new Date('2026-11-19T10:00:00Z'));
  assert.equal(Object.keys(bad.reports).length, 0); assert.ok(bad.errors.length >= 8);
});
await test('audience: confirmations are accepted only when the quote or key stands in the named source; invented numbers are flagged', async () => {
  const ga = await collectGa4Audience(fakeGa4(), '1', new Date('2026-11-19T10:00:00Z'));
  const facts = gatherFacts({ brief: AUD_BRIEF, audit: AUD_AUDIT, ga4: ga });
  assert.equal(facts.meta.breakdowns.age[0].spend_share_pct, 60); assert.equal(facts.ga4.age[0].users_share_pct, 67); assert.ok(!('device' in facts.meta.breakdowns), 'empty breakdowns are left out');
  const raw = { segments: [
    SEG({}),
    SEG({ name: 'Гіпотеза', confirmed_by: [] }),
    SEG({ name: 'Вигадка', confirmed_by: [{ source: 'brief', ref: 'студенти' }, { source: 'meta', ref: '65+' }, { source: 'ga4', ref: 'tablet' }] }),
    SEG({ name: 'Із цифрою', who: 'Покупці, яких у 3 рази більше, ніж інших, 74% з них жінки' }),
    SEG({ name: '' }),
  ], questions: ['Хто найчастіше купує: той, хто користується, чи той, хто дарує?'] };
  const r = checkSegments(raw, facts);
  assert.equal(r.dropped, 1);
  const by = Object.fromEntries(r.segments.map((s) => [s.name, s]));
  assert.equal(by['Молоді родини'].status, 'confirmed'); assert.equal(by['Молоді родини'].confirmed_by.length, 3);
  assert.equal(by['Гіпотеза'].status, 'hypothesis');
  assert.equal(by['Вигадка'].status, 'hypothesis'); assert.equal(by['Вигадка'].rejected.length, 3, 'none of the three refs is in its source');
  assert.equal(by['Із цифрою'].status, 'unverified'); assert.match(by['Із цифрою'].problem, /74/);
  assert.equal(r.questions.length, 1);
  const noGa = checkSegments({ segments: [SEG({ confirmed_by: [{ source: 'ga4', ref: 'mobile' }] })], questions: [] }, gatherFacts({ brief: AUD_BRIEF, audit: null, ga4: null }));
  assert.equal(noGa.segments[0].status, 'hypothesis', 'a source that does not exist confirms nothing');
});
await test('audience: the prompt says what sources exist and that a missing one is null; the notes say what was skipped and why', async () => {
  const facts = gatherFacts({ brief: AUD_BRIEF, audit: null, ga4: null });
  const p = buildAudiencePrompt({ facts });
  assert.match(p.system, /SITUATION OF BUYING/); assert.match(p.system, /Never invent numbers/); assert.match(p.user, /"meta": null/); assert.match(p.user, /молоді родини/);
  const n = sourceNotes({ facts, ga4: null, hasAudit: false, propertyGiven: false });
  assert.ok(n.skipped.some((x) => /аудиту кабінету немає/.test(x)) && n.skipped.some((x) => /Property ID/.test(x)) && n.skipped.some((x) => /Відгуки/.test(x)));
  const ga = await collectGa4Audience(fakeGa4({ demographics: false }), '1', new Date('2026-11-19T10:00:00Z'));
  assert.ok(sourceNotes({ facts: gatherFacts({ brief: AUD_BRIEF, audit: AUD_AUDIT, ga4: ga }), ga4: ga, hasAudit: true, propertyGiven: true }).used.some((x) => /без віку й статі/.test(x)));
});
await test('audience: the skill waits for the brief and for the audit, reads all sources, writes the section, angles and the questions for the client', async () => {
  const slowAudit = async () => { await new Promise((r) => setTimeout(r, 30)); return { writes: [{ key: 'audit', body: 'a', content: AUD_AUDIT }] }; };
  const handlers = createHandlers({ researcher: { audience, audit: slowAudit } });
  const { repo, ctx } = await setup({ handlers });
  const asked = []; ctx.ga4 = fakeGa4();
  ctx.ask = async (o) => { asked.push(o); return { costUsd: 0.05, text: JSON.stringify({ segments: [SEG({}), SEG({ name: 'Подарунки', who: 'Ті, хто купує подарунок на новосілля', situation: 'Новосілля друзів', confirmed_by: [{ source: 'meta', ref: 'female' }] })], questions: ['Хто ухвалює рішення про покупку?'] }) }; };
  await repo.enqueueRun({ project_id: 1, agent: 'researcher', skill: 'audience' });
  await processTick(ctx);
  assert.equal(repo.T.runs[0].status, 'waiting'); assert.equal(repo.T.runs[0].state.blocked_on, 'brief'); assert.equal(asked.length, 0);
  advance(1000); // the brief is written after the run began to wait
  await repo.writeSectionVersion(1, 'brief', { author_kind: 'human', author: 'm@x', body: '', content: AUD_BRIEF.content });
  await repo.enqueueRun({ project_id: 1, agent: 'researcher', skill: 'audit' }); // the audit is working: the audience must wait for it
  await processTick(ctx);
  assert.equal(repo.T.runs.find((r) => r.skill === 'audit').status, 'done');
  assert.equal(asked.length, 0, 'the model is not asked before the audit is there');
  await processTick(ctx); // the audit section exists now: the audience wakes up and goes on
  assert.equal(repo.T.runs.find((r) => r.skill === 'audience').status, 'done', repo.T.runs.find((r) => r.skill === 'audience').error);
  assert.equal(asked.length, 1); assert.match(asked[0].user, /"25-34"/); assert.match(asked[0].user, /Kyiv/);
  const c = (await repo.readSection(1, 'audience')).version.content;
  assert.equal(c.segments.length, 2); assert.equal(c.segments[0].status, 'confirmed'); assert.equal(c.angles.length, 2);
  assert.ok(c.sources.used.some((u) => /GA4/.test(u)) && c.sources.used.some((u) => /Кабінет Meta/.test(u)));
  assert.equal(repo.T.tasks.find((t) => /Уточнити в клієнта/.test(t.title)).owner, 'manager');
  assert.equal(repo.T.runs.find((r) => r.skill === 'audience').cost_usd, 0.05);
});
await test('audience: without GA4 or an audit it still works on the brief alone, and a failing GA4 becomes a task and a note', async () => {
  const handlers = createHandlers({ researcher: { audience } });
  const a = await setup({ handlers });
  await a.repo.writeSectionVersion(1, 'brief', { author_kind: 'human', author: 'm@x', body: '', content: { general: { goal: '60 замовлень на місяць' }, economics: {} } });
  a.ctx.ask = async () => ({ text: '```json\n' + JSON.stringify({ segments: [SEG({ confirmed_by: [{ source: 'brief', ref: '60 замовлень' }] })], questions: ['Опишіть покупця.', 'Хто вирішує?'] }) + '\n```' });
  await a.repo.enqueueRun({ project_id: 1, agent: 'researcher', skill: 'audience' });
  await processTick(a.ctx);
  assert.equal(a.repo.T.runs[0].status, 'done', a.repo.T.runs[0].error);
  const sec = await a.repo.readSection(1, 'audience');
  assert.equal(sec.version.content.segments[0].status, 'confirmed'); assert.ok(sec.version.content.sources.skipped.some((x) => /Property ID/.test(x)));
  const b = await setup({ handlers });
  await b.repo.writeSectionVersion(1, 'brief', { author_kind: 'human', author: 'm@x', body: '', content: AUD_BRIEF.content });
  b.ctx.ga4 = fakeGa4({ fail: 'GA4: The caller does not have permission' }); b.ctx.ask = async () => ({ text: JSON.stringify({ segments: [SEG({ confirmed_by: [] })], questions: [] }) });
  await b.repo.enqueueRun({ project_id: 1, agent: 'researcher', skill: 'audience' });
  await processTick(b.ctx);
  assert.equal(b.repo.T.runs[0].status, 'done', b.repo.T.runs[0].error);
  assert.ok(b.repo.T.tasks.some((t) => /доступ до GA4/.test(t.title))); assert.ok((await b.repo.readSection(1, 'audience')).version.content.open.some((o) => /GA4/.test(o)));
});
await test('audience: no model and a useless answer fail clearly and write nothing', async () => {
  const handlers = createHandlers({ researcher: { audience } });
  const a = await setup({ handlers }); await a.repo.writeSectionVersion(1, 'brief', { author_kind: 'human', author: 'm@x', body: '', content: AUD_BRIEF.content });
  await a.repo.enqueueRun({ project_id: 1, agent: 'researcher', skill: 'audience' }); await processTick(a.ctx);
  assert.equal(a.repo.T.runs[0].status, 'failed'); assert.match(a.repo.T.runs[0].error, /ANTHROPIC_API_KEY/);
  for (const [text, re] of [['Вибачте', /не у форматі JSON/], [JSON.stringify({ segments: [{ name: 'x' }] }), /жодного придатного сегмента/]]) {
    const b = await setup({ handlers }); await b.repo.writeSectionVersion(1, 'brief', { author_kind: 'human', author: 'm@x', body: '', content: AUD_BRIEF.content });
    b.ctx.ask = async () => ({ text });
    await b.repo.enqueueRun({ project_id: 1, agent: 'researcher', skill: 'audience' }); await processTick(b.ctx);
    assert.equal(b.repo.T.runs[0].status, 'failed'); assert.match(b.repo.T.runs[0].error, re);
    assert.equal((await b.repo.readSection(1, 'audience'))?.version ?? null, null);
  }
});
// ---------------------------------------------------------------- A4: the competitors skill (sites read by the agent, ads confirmed by the manager)
const RIVAL_HOME = `<html><head><title>Дуб і Ко: меблі</title><meta name="viewport" content="width=device-width"></head><body><h1>Меблі з дуба від виробника</h1><nav><a href="/catalog/">Каталог</a><a href="/delivery">Доставка</a></nav><p>Стілець Класик від 2500 грн. Подарунок до кожного замовлення.</p><button>Замовити</button></body></html>`;
const RIVAL_CATALOG = `<html><head><title>Каталог</title></head><body><h1>Каталог</h1><p>Відгуки покупців: 4,8 з 5. Гарантія 5 років.</p></body></html>`;
const RIVAL_DELIVERY = `<html><head><title>Доставка</title></head><body><p>Безкоштовна доставка по Україні, оплата при отриманні.</p></body></html>`;
const WORLD = { ...SITE, 'https://rival.example/': RIVAL_HOME, 'https://rival.example/catalog/': RIVAL_CATALOG, 'https://rival.example/delivery': RIVAL_DELIVERY };
const COMP_BRIEF = { general: { goal: 'Продаж стільців', competitors: 'rival.example\nhttps://www.loza.example/, rival.example; not a site, https://closed.example' }, economics: {} };
const LIB = 'https://www.facebook.com/ads/library/?id=111';
await test('competitors: the brief list is cleaned: own site and repeats are dropped, junk is ignored, at most four', () => {
  assert.deepEqual(parseCompetitors(COMP_BRIEF.general.competitors, 'https://loza.example').map((c) => c.host), ['rival.example', 'closed.example']);
  assert.equal(parseCompetitors('a.com b.com c.com d.com e.com f.com').length, 4);
  assert.deepEqual(parseCompetitors('', 'x.com'), []);
});
await test('competitors: an ad counts only with a Library link, an «active since» date and the name of the person who checked it', () => {
  const { ads, skipped } = verifiedAds({ ads: [
    { competitor: 'Дуб і Ко', library_url: LIB, active_since: '2026-10-01', verified_by: 'm@x', screenshot_url: 'https://img.example/a.png', note: 'відео' },
    { competitor: 'Дуб і Ко', library_url: 'https://example.com/ad', active_since: '2026-10-01', verified_by: 'm@x' },
    { competitor: 'Дуб і Ко', library_url: LIB, active_since: 'вчора', verified_by: 'm@x' },
    { competitor: 'Дуб і Ко', library_url: LIB, active_since: '2026-10-01', verified_by: '' },
    { library_url: LIB, active_since: '2026-10-01', verified_by: 'm@x' }] });
  assert.equal(ads.length, 1); assert.equal(ads[0].id, 'ad1'); assert.equal(skipped.length, 4);
  assert.ok(skipped[0].problems.includes('немає посилання на Бібліотеку реклами') && skipped[1].problems.includes('немає дати «активно з»'));
  assert.deepEqual(verifiedAds(null), { ads: [], skipped: [] });
});
await test('competitors: rows are trusted only when the quote is from THAT competitor and numbers stand in its text; comparison needs both quotes; ads need a known id', async () => {
  const rd = await collectSiteData({ website: 'rival.example', ...fakeNet(WORLD) });
  const ld = await collectSiteData({ website: 'loza.example', ...fakeNet(WORLD) });
  const competitors = [{ host: 'rival.example', pages: compactSite(rd) }], client = compactSite(ld);
  const ads = [{ id: 'ad1', competitor: 'Дуб і Ко', library_url: LIB, active_since: '2026-10-01', verified_by: 'm@x', screenshot_url: 'https://img.example/a.png', note: '' }, { id: 'ad2', competitor: 'Х', library_url: LIB, active_since: '2026-10-01', verified_by: 'm@x', screenshot_url: '', note: '' }];
  const row = (o) => ({ competitor: 'https://www.rival.example/', products: 'Стільці', prices: 'Від 2500 грн', offers: 'Подарунок до кожного замовлення', angles: 'Виробник', approach: 'Прямий виробник', evidence: { quote: 'Подарунок до кожного замовлення' }, ...o });
  const raw = { table: [row({}), row({ evidence: { quote: 'Знижка 70%' } }), row({ prices: 'Від 1900 грн' }), row({ competitor: 'ghost.example' }), row({ evidence: { quote: 'Безкоштовна доставка від 5000 грн' } })],
    site_comparison: [
      { area: 'terms', competitor: 'rival.example', better_theirs: 'Безкоштовна доставка без порога', worse_theirs: '', competitor_quote: 'Безкоштовна доставка по Україні', client_quote: 'Безкоштовна доставка від 5000 грн' },
      { area: 'trust', competitor: 'rival.example', better_theirs: 'Гарантія 5 років', worse_theirs: '', competitor_quote: 'Гарантія 5 років', client_quote: 'Гарантія 10 років' },
      { area: 'trust', competitor: 'rival.example', better_theirs: 'Рейтинг 4,8', worse_theirs: '', competitor_quote: 'вигадана цитата', client_quote: '' },
      { area: 'nonsense', competitor: 'rival.example', better_theirs: 'x', competitor_quote: 'x' }, { area: 'terms', competitor: 'rival.example', competitor_quote: 'x' }],
    ads: [{ id: 'ad1', angle: 'Прямий виробник', offer: 'Подарунок', format: 'відео', idea: 'Показати цех' }, { id: 'ad2', angle: 'x' }, { id: 'ad9', angle: 'x' }],
    ideas: [{ approach: 'Виробник', idea: 'Відео з цеху' }, { approach: '', idea: 'x' }] };
  const r = checkCompetitors(raw, { competitors, client, ads });
  assert.equal(r.table.length, 4, 'the unknown competitor is dropped'); assert.deepEqual(r.table.map((x) => x.verified), [true, false, false, false]);
  assert.match(r.table[1].problem, /цитати немає/); assert.match(r.table[2].problem, /число без джерела: 1900/);
  assert.equal(r.table[3].verified, false, 'a quote from the CLIENT site is not a quote from the competitor');
  assert.deepEqual(r.comparison.map((c) => c.verified), [true, false, false]); assert.match(r.comparison[1].problem, /клієнта/); assert.match(r.comparison[2].problem, /конкурента/);
  assert.equal(r.dropped, 1 + 2 + 2, 'the ghost row, two comparisons without an area or text, two ads without a screenshot or a known id');
  assert.equal(r.ads.length, 1); assert.equal(r.ads[0].label, 'Конкурент: Дуб і Ко'); assert.equal(r.ideas.length, 1);
  const tasks = comparisonTasks(r.comparison); assert.equal(tasks.length, 1); assert.equal(tasks[0].owner, 'client_dev');
  const once = withSiteAppendix('Рекомендації.', r.comparison), twice = withSiteAppendix(once, r.comparison);
  assert.equal(once, twice, 'the appendix is replaced, not repeated'); assert.match(once, /Порівняння з сайтами конкурентів/); assert.equal(withSiteAppendix('Рекомендації.', []), 'Рекомендації.');
  const p = buildCompetitorsPrompt({ client, competitors, ads: ads.slice(0, 2), goal: 'Продаж стільців' });
  assert.deepEqual(p.images, [{ id: 'ad1', url: 'https://img.example/a.png' }]); assert.match(p.user, /Безкоштовна доставка/);
});
await test('competitors: the skill needs the brief list, waits for the site review, reads sites and ads, writes the section, the appendix to «Сайт», ideas and tasks', async () => {
  const slowSite = async () => { await new Promise((r) => setTimeout(r, 30)); return { writes: [{ key: 'site', body: 'Рекомендації по сайту.', content: { findings: [] } }] }; };
  const handlers = createHandlers({ researcher: { competitors, site: slowSite } });
  const { repo, ctx } = await setup({ handlers });
  const net = fakeNet(WORLD, ''); Object.assign(ctx, net);
  repo.setWebsite(1, 'https://loza.example');
  const asked = [];
  ctx.ask = async (o) => { asked.push(o); return { costUsd: 0.12, text: JSON.stringify({
    table: [{ competitor: 'rival.example', products: 'Стільці', prices: 'Від 2500 грн', offers: 'Подарунок до кожного замовлення', angles: 'Виробник', approach: 'Прямий виробник', evidence: { quote: 'Подарунок до кожного замовлення' } }],
    site_comparison: [{ area: 'terms', competitor: 'rival.example', better_theirs: 'Безкоштовна доставка без порога', worse_theirs: '', competitor_quote: 'Безкоштовна доставка по Україні', client_quote: 'Безкоштовна доставка від 5000 грн' }],
    ads: (o.images || []).map((im) => ({ id: im.id, angle: 'Виробник', offer: 'Подарунок', format: 'відео', idea: 'Показати цех' })), ideas: [{ approach: 'Прямий виробник', idea: 'Відео з цеху' }] }) }; };
  await repo.enqueueRun({ project_id: 1, agent: 'researcher', skill: 'competitors' });
  await processTick(ctx);
  assert.equal(repo.T.runs[0].state.blocked_on, 'brief'); assert.equal(asked.length, 0);
  advance(1000);
  await repo.writeSectionVersion(1, 'brief', { author_kind: 'human', author: 'm@x', body: '', content: { general: { goal: 'Продаж стільців' }, economics: {} } });
  await processTick(ctx);
  assert.equal(repo.T.runs[0].state.blocked_on, 'brief', 'the brief has no competitors yet'); assert.ok(repo.T.tasks.some((t) => /сайти конкурентів/.test(t.title)));
  advance(1000);
  await repo.writeSectionVersion(1, 'brief', { author_kind: 'human', author: 'm@x', body: '', content: COMP_BRIEF });
  await repo.enqueueRun({ project_id: 1, agent: 'researcher', skill: 'site' }); // the site review is working: competitors must wait for it
  await processTick(ctx);
  assert.equal(repo.T.runs.find((r) => r.skill === 'site').status, 'done'); assert.equal(asked.length, 0);
  await processTick(ctx);
  const run = repo.T.runs.find((r) => r.skill === 'competitors');
  assert.equal(run.status, 'done', run.error);
  assert.equal(asked.length, 1); assert.deepEqual(asked[0].images, [], 'no ad is confirmed yet');
  const sec = await repo.readSection(1, 'competitors');
  assert.equal(sec.version.content.table.length, 1); assert.equal(sec.version.content.table[0].verified, true);
  assert.deepEqual(sec.version.content.competitors.map((c) => c.host), ['rival.example', 'closed.example'].filter((h) => h === 'rival.example'), 'closed.example does not exist in the fake world');
  assert.equal(sec.version.content.failed[0].host, 'closed.example');
  assert.match(sec.version.body, /немає підтверджених менеджером оголошень/);
  const site = await repo.readSection(1, 'site');
  assert.match(site.version.body, /Рекомендації по сайту\./); assert.match(site.version.body, /Порівняння з сайтами конкурентів/); assert.equal(site.version.content.competitors_compare.length, 1);
  assert.equal(repo.T.tasks.filter((t) => t.type === 'site').length, 1); assert.equal(run.cost_usd, 0.12);

  // the manager confirms one ad (a human version of the section), the agent runs again and reads its screenshot
  advance(1000);
  await repo.writeSectionVersion(1, 'competitors', { author_kind: 'human', author: 'm@x', body: sec.version.body, content: { ...sec.version.content, ads: [{ competitor: 'Дуб і Ко', library_url: LIB, active_since: '2026-10-01', verified_by: 'm@x', screenshot_url: 'https://img.example/a.png' }, { competitor: 'Дуб і Ко', library_url: 'https://example.com/x', active_since: '2026-10-01', verified_by: 'm@x', screenshot_url: 'https://img.example/b.png' }] } });
  await repo.enqueueRun({ project_id: 1, agent: 'researcher', skill: 'competitors' });
  await processTick(ctx);
  const run2 = repo.T.runs.filter((r) => r.skill === 'competitors')[1];
  assert.equal(run2.status, 'done', run2.error);
  assert.deepEqual(asked[1].images, [{ id: 'ad1', url: 'https://img.example/a.png' }], 'only the confirmed ad is read');
  const cur = await repo.readSection(1, 'competitors');
  assert.equal(cur.version.author_kind, 'human', 'a person\'s version is not replaced by the agent');
  const prop = repo.T.versions.filter((v) => v.is_proposal).pop();
  assert.ok(prop, 'the new analysis comes as a proposal'); assert.equal(prop.content.ads_analysis[0].label, 'Конкурент: Дуб і Ко'); assert.equal(prop.content.ads.length, 2, 'the manager\'s entries travel with the proposal'); assert.equal(prop.content.ads_skipped.length, 1);
  assert.match(prop.body, /Реклама конкурентів, підтверджена менеджером \(1\)/); assert.match(prop.body, /Конкурент: Дуб і Ко · активно з 2026-10-01/);
});
await test('competitors: no model, no readable competitor site and a useless answer fail clearly and write nothing', async () => {
  const handlers = createHandlers({ researcher: { competitors } });
  const mk = async (briefContent = COMP_BRIEF, world = WORLD) => { const s = await setup({ handlers }); Object.assign(s.ctx, fakeNet(world)); await s.repo.writeSectionVersion(1, 'brief', { author_kind: 'human', author: 'm@x', body: '', content: briefContent }); await s.repo.enqueueRun({ project_id: 1, agent: 'researcher', skill: 'competitors' }); return s; };
  const a = await mk(); await processTick(a.ctx);
  assert.equal(a.repo.T.runs[0].status, 'failed'); assert.match(a.repo.T.runs[0].error, /ANTHROPIC_API_KEY/);
  const b = await mk(COMP_BRIEF, {}); b.ctx.ask = async () => { throw new Error('must not be called'); }; await processTick(b.ctx);
  assert.equal(b.repo.T.runs[0].status, 'failed'); assert.match(b.repo.T.runs[0].error, /Жодного сайту конкурента не прочитано/);
  const c = await mk(); c.ctx.ask = async () => ({ text: 'Вибачте' }); await processTick(c.ctx);
  assert.equal(c.repo.T.runs[0].status, 'failed'); assert.match(c.repo.T.runs[0].error, /не у форматі JSON/);
  assert.equal((await c.repo.readSection(1, 'competitors'))?.version ?? null, null);
});
// ---------------------------------------------------------------- A4: the pages of the Researcher's sections (pure helpers behind them)
await test('screens: the 11 areas of the site come worst first; a state follows the verified findings, then the notes of the agent', () => {
  const f = (area, severity, verified = true) => ({ area, severity, verified });
  const rows = siteAreaRows({ findings: [f('terms', 'high'), f('first_screen', 'medium'), f('upsell', 'low'), f('contact', 'high', false)], ok_areas: [{ area: 'mobile', note: 'viewport є' }, { area: 'terms', note: 'ignored: a finding wins' }], not_checked: [{ area: 'speed', reason: 'немає ключа' }], competitors_compare: [{ area: 'trust', competitor: 'r.example', verified: true }] });
  assert.equal(rows.length, 11);
  assert.deepEqual(rows.slice(0, 4).map((r) => [r.key, r.state]), [['terms', 'bad'], ['first_screen', 'warn'], ['upsell', 'warn'], ['contact', 'warn']]);
  assert.equal(rows.find((r) => r.key === 'contact').label, 'Не підтверджено', 'only an unverified finding: not a problem yet');
  assert.equal(rows.find((r) => r.key === 'mobile').state, 'ok'); assert.equal(rows.find((r) => r.key === 'speed').label, 'Не перевірено'); assert.equal(rows.find((r) => r.key === 'speed').note, 'немає ключа');
  assert.equal(rows.find((r) => r.key === 'checkout').label, 'Не оцінено');
  assert.equal(rows.find((r) => r.key === 'trust').comparisons.length, 1);
  assert.deepEqual(siteCounts({ findings: [f('a', 'high'), f('b', 'low', false)], not_checked: [1, 2] }), { verified: 1, unverified: 1, notChecked: 2 });
  assert.equal(siteAreaRows(null).length, 11, 'an empty content does not break the page');
});
await test('screens: competitor cards carry their comparisons; the ad rule is one for the agent and the screen', () => {
  const cards = competitorCards({ table: [{ competitor: 'a.example' }, { competitor: 'b.example' }], comparison: [{ competitor: 'a.example', area: 'terms' }] });
  assert.deepEqual(cards.map((c) => c.comparisons.length), [1, 0]);
  assert.deepEqual(competitorHosts({ competitors: [{ host: 'a.example' }], failed: [{ host: 'z.example' }, { host: 'a.example' }] }), ['a.example', 'z.example']);
  const ok = { competitor: 'a.example', library_url: 'https://www.facebook.com/ads/library/?id=1', screenshot_url: 'https://img.example/a.png', active_since: '2026-10-01', verified_by: 'm@x' };
  assert.deepEqual(adProblems(ok), []);
  assert.deepEqual(adProblems({ ...ok, screenshot_url: '' }), ['немає скриншота']);
  assert.equal(adProblems({}).length, 5);
  assert.equal(verifiedAds({ ads: [ok, { ...ok, screenshot_url: '' }] }).ads.length, 1, 'the agent and the screen agree on what counts');
});
// ---------------------------------------------------------------- A5: the automatic check before an approval
const V = (content, o = {}) => ({ version: { content, created_at: '2026-11-19T09:00:00Z', author_kind: 'agent', ...o } });
const UE_OF = (e, extra = {}) => V({ inputs: e, thresholds: { breakeven_roas: 1.75, target_roas: 2.5, breakeven_cpa: 100, target_cpa: 70 }, ...extra });
await test('check: the numbers of the brief and of the Unit Economy must be the same; a stale agent section is asked to be redone, a person\'s is not', () => {
  const brief = V({ economics: LELIOR, general: { geo: 'Україна' } }, { created_at: '2026-11-19T10:00:00Z', author_kind: 'human' });
  const ok = compareNumbers({ brief, unit_economy: UE_OF(LELIOR, {}) });
  assert.deepEqual(ok, { problems: [], rerun: [] });
  const stale = compareNumbers({ brief: V({ economics: { ...LELIOR, budget_monthly: 6000 } }, { created_at: '2026-11-19T10:00:00Z', author_kind: 'human' }), unit_economy: UE_OF(LELIOR) });
  assert.match(stale.problems[0], /місячний бюджет: у брифі 6000, в Unit Economy 4500/); assert.deepEqual(stale.rerun, [{ agent: 'researcher', skill: 'unit_economy' }]);
  const human = compareNumbers({ brief: V({ economics: { ...LELIOR, budget_monthly: 6000 } }, { created_at: '2026-11-19T10:00:00Z' }), unit_economy: { version: { ...UE_OF(LELIOR).version, author_kind: 'human' } } });
  assert.equal(human.problems.length, 1); assert.deepEqual(human.rerun, [], 'a person\'s section is not redone by an agent');
  const old = compareNumbers({ brief: V({ economics: { ...LELIOR, budget_monthly: 6000 } }, { created_at: '2026-11-19T08:00:00Z' }), unit_economy: UE_OF(LELIOR) });
  assert.equal(old.problems.length, 1); assert.deepEqual(old.rerun, [], 'the Unit Economy is newer than the brief: a rerun would change nothing, so no loop');
  const prod = compareNumbers({ brief: V({ economics: { ...LELIOR, products: [{ name: 'AirPlug', price: 160 }, { name: 'Extrait 30 ml', price: 200 }] } }, { created_at: '2026-11-19T10:00:00Z' }), unit_economy: UE_OF(LELIOR) });
  assert.match(prod.problems[0], /товари або офери/);
  assert.deepEqual(compareNumbers({}), { problems: [], rerun: [] }, 'nothing to compare is not a problem');
});
await test('check: the audit is judged by the thresholds of the current Unit Economy, the currency is one, the strategy repeats the budget and the geo of the brief', () => {
  const brief = V({ economics: LELIOR, general: { geo: 'Україна' } });
  const th = { breakeven_roas: 1.75, target_roas: 2.5, breakeven_cpa: 100, target_cpa: 70 };
  const ue = UE_OF(LELIOR, {}); ue.version.created_at = '2026-11-19T10:00:00Z';
  const au = (t, extra = {}) => V({ thresholds: t, currency: 'USD', ...extra }, { created_at: '2026-11-19T09:00:00Z' });
  assert.deepEqual(compareNumbers({ brief, unit_economy: ue, audit: au(th) }).problems, []);
  const wrong = compareNumbers({ brief, unit_economy: ue, audit: au({ ...th, breakeven_roas: 2 }) });
  assert.match(wrong.problems[0], /за іншими порогами/); assert.deepEqual(wrong.rerun, [{ agent: 'researcher', skill: 'audit' }]);
  const none = compareNumbers({ brief, unit_economy: ue, audit: au(null) });
  assert.match(none.problems[0], /без порогів/);
  assert.match(compareNumbers({ brief, audit: au(th, { currency: 'EUR' }) }).problems[0], /Валюта брифу USD, а кабінету EUR/);
  const strat = compareNumbers({ brief, strategy: V({ budget_monthly: 5000, geo: 'Польща' }) });
  assert.equal(strat.problems.length, 2); assert.match(strat.problems[0], /Бюджет у стратегії \(5000\).*\(4500\)/); assert.match(strat.problems[1], /Географія.*Польща.*Україна/);
  assert.deepEqual(compareNumbers({ brief, strategy: V({ budget_monthly: 4500, geo: ' україна ' }) }).problems, []);
});
await test('check: nothing is «підтверджено» without a proof (a problem); what is unproven but marked goes to the warnings the manager sees before approving', () => {
  const sections = {
    site: V({ findings: [{ verified: true, evidence: { kind: 'quote', quote: '' } }, { verified: true, evidence: { kind: 'absence' } }, { verified: false }] }),
    audience: V({ segments: [{ status: 'confirmed', confirmed_by: [] }, { status: 'hypothesis' }, { status: 'unverified' }, { status: 'confirmed', confirmed_by: [{ source: 'brief' }] }] }),
    competitors: V({ table: [{ verified: true, evidence: { quote: '' } }, { verified: false }], ads_skipped: [{}, {}], ads_analysis: [{ library_url: '', active_since: '2026-10-01' }] }),
    unit_economy: V({ provisional: true }),
  };
  const r = checkSources(sections);
  assert.equal(r.problems.length, 4);
  assert.ok(r.problems.some((p) => /Сайт: 1 знахідок позначено підтвердженими без доказу/.test(p)) && r.problems.some((p) => /Аудиторія: 1 сегментів/.test(p)) && r.problems.some((p) => /Конкуренти: 1 рядків/.test(p)) && r.problems.some((p) => /без посилання на Бібліотеку/.test(p)));
  assert.ok(r.warnings.some((w) => /Сайт: непідтверджених знахідок 1/.test(w)) && r.warnings.some((w) => /гіпотезою, 1/.test(w)) && r.warnings.some((w) => /2 оголошень/.test(w)) && r.warnings.some((w) => /Unit Economy попередній/.test(w)));
  assert.deepEqual(checkSources({}), { problems: [], warnings: [] });
});
await test('check: one list of tasks: the same problem found by two agents is one task with the higher priority and both pieces of evidence; a person\'s or approved task is never touched', () => {
  const T = (id, title, o = {}) => ({ id, type: 'site', title, evidence: 'доказ ' + id, priority: 'medium', status: 'proposed', created_by_kind: 'agent', ...o });
  const tasks = [
    T(1, 'Сайт: Додати сторінку «Повернення» і посилання в підвалі', { priority: 'medium' }),
    T(2, 'Сайт: перейняти в rival.example: сторінка повернення товару з посиланням у підвалі', { priority: 'high' }),
    T(3, 'Сайт: Винести оффер у заголовок першого екрана'),
    T(4, 'Сайт: Додати сторінку Повернення і посилання в підвалі', { created_by_kind: 'human' }),
    T(5, 'Сайт: Додати сторінку Повернення і посилання в підвалі', { status: 'approved' }),
    T(6, 'Додати сторінку Повернення і посилання в підвалі', { type: 'creatives' }),
  ];
  const g = findDuplicateTasks(tasks);
  assert.equal(g.length, 1); assert.equal(g[0].keep, 2, 'the higher priority wins'); assert.deepEqual(g[0].drop, [1]); assert.equal(g[0].priority, 'high');
  assert.match(g[0].evidence, /доказ 2/); assert.match(g[0].evidence, /Те саме знайшов інший агент: доказ 1/);
  assert.deepEqual(findDuplicateTasks([T(1, 'Сайт: Винести оффер у заголовок'), T(2, 'Сайт: Додати блок допродажів у картку')]), [], 'different problems stay two tasks');
});
await test('check: a stale Unit Economy holds the research, is made again once, and the stage moves on; a person\'s Unit Economy holds it and is not touched', async () => {
  for (const humanUe of [false, true]) {
    const handlers = createHandlers({ researcher: { unit_economy: unitEconomy } });
    const { repo, ctx } = await setup({ handlers });
    ctx.validate = createValidator(repo);
    await repo.writeSectionVersion(1, 'brief', { author_kind: 'human', author: 'm@x', body: 'Бриф', content: { economics: LELIOR } });
    await repo.enqueueRun({ project_id: 1, agent: 'researcher', skill: 'unit_economy' });
    await processTick(ctx);
    if (humanUe) { const s = await repo.readSection(1, 'unit_economy'); advance(1000); await repo.writeSectionVersion(1, 'unit_economy', { author_kind: 'human', author: 'm@x', body: s.version.body, content: s.version.content }); }
    for (const k of ['site', 'audience', 'competitors', 'materials', 'ideas']) await repo.writeSectionVersion(1, k, { author_kind: 'agent', author: 'x', body: 'x', content: { stub: true } });
    await repo.setProjectFlag(1, { has_data: false }); await repo.setStage(1, 1);
    advance(1000);
    await repo.writeSectionVersion(1, 'brief', { author_kind: 'human', author: 'm@x', body: 'Бриф', content: { economics: { ...LELIOR, budget_monthly: 6000 } } });
    for (let i = 0; i < 4; i += 1) { await processTick(ctx); advance(1000); }
    const ueRuns = repo.T.runs.filter((r) => r.skill === 'unit_economy');
    const failed = repo.T.journal.filter((j) => j.action === 'check_failed');
    assert.equal(failed.length, 1, 'the failure is written once'); assert.match(failed[0].summary, /місячний бюджет: у брифі 6000, в Unit Economy 4500/);
    if (!humanUe) {
      assert.equal(ueRuns.length, 2, 'the Unit Economy was made again, once'); assert.equal((await repo.readSection(1, 'unit_economy')).version.content.inputs.budget_monthly, 6000);
      assert.equal(repo.T.states.get(1).stage, 2, 'with the numbers in agreement the research is finished');
    } else {
      assert.equal(ueRuns.length, 1, 'a person\'s section is not redone by an agent'); assert.equal(repo.T.states.get(1).stage, 1, 'the stage waits for the manager');
    }
  }
});
await test('check: the stage message carries the warnings, the check does not hold stages after the approvals, and duplicate tasks are merged on the way', async () => {
  const { repo, ctx } = await setup();
  ctx.validate = createValidator(repo);
  await repo.addTask(1, { type: 'site', title: 'Сайт: Додати сторінку «Повернення» і посилання в підвалі', priority: 'medium', evidence: 'агент 1' });
  await repo.addTask(1, { type: 'site', title: 'Сайт: перейняти сторінка повернення товару з посиланням у підвалі', priority: 'high', evidence: 'агент 2' });
  const r = await validateProject({ repo, projectId: 1 });
  assert.equal(r.merged, 1); assert.equal(repo.T.tasks.filter((t) => t.status === 'proposed').length, 1); assert.equal(repo.T.tasks.find((t) => t.status === 'rejected').result, 'Дубль задачі #2');
  assert.ok(repo.T.journal.some((j) => j.action === 'tasks_merged'));
  assert.deepEqual(await createValidator(repo)({ projectId: 1, state: { stage: 4 } }), { ok: true, problems: [], warnings: [], rerun: [], merged: 0 });
});
// ---------------------------------------------------------------- A6.1: the Creator's skill «materials_ideas» (materials of the client, shoot brief, bank of ideas)
const MAT_BRIEF = { content: { general: { goal: 'Продаж AirPlug', geo: 'США' }, economics: { ...LELIOR, offers: [{ name: 'AirPlug + free 50 ml oil', pays: 150, list_value: 150, extra_cost: 18, approved: true }, { name: 'Set $280', pays: 280, list_value: 350, approved: false }] } } };
const MAT_COMP = { table: [{ competitor: 'rival.example', approach: 'Прямий виробник', angles: 'Виробник', offers: 'Подарунок до замовлення', verified: true }, { competitor: 'shaky.example', approach: 'x', verified: false }], ads_analysis: [{ label: 'Конкурент: rival.example', angle: 'Прямий виробник', offer: 'Подарунок', format: 'відео', idea: 'Показати цех' }] };
const MAT_AUD = { segments: [{ name: 'Молоді родини', who: 'Пари', situation: 'Переїзд', message: 'Меблі на роки', formats: 'Відео', angles: ['Переїзд'], status: 'confirmed' }] };
const MAT_AUDIT = { recent: { ads: { best: [{ name: 'Відео цеху', roas: 2.4, results: 30 }], worst: [{ name: 'Статика знижка', roas: 0.8 }] } } };
const PHOTO = (n) => Array.from({ length: n }, (_, i) => ({ kind: 'product', name: `p${i}.jpg`, url: `https://f.example/p${i}.jpg` }));
const IDEA = (o) => ({ hook: 'Подарунок до першого замовлення', angle: 'подарунок', format: 'відео 9:16', segment: 'Молоді родини', source: 'competitor', reference: 'rival.example', example: 'Розпаковка подарунка', offer: null, ...o });
const ANSWER = (o = {}) => JSON.stringify({ materials: { verdict: 'enough', reason: 'Є фото продукту й приклади.', have: ['Фото продукту'], missing: [], shoot_list: [] }, ideas: [IDEA({}), IDEA({ hook: 'Безкоштовна олія в подарунок', angle: 'подарунок', format: 'статика', source: 'own', reference: '', segment: '', offer: { name: 'AirPlug + free 50 ml oil', pays: 150, list_value: 150, extra_cost: 18 } })], ...o });
await test('materials: the inventory is counted from the project card; no product photo is a basic gap; notes and brand are named', () => {
  const inv = inventoryOf({ settings: { figma_url: 'https://figma.com/x', cta_text: 'Купити', inputs: { tone: { body: 'Тепло' }, brand: { body: '#112233' } } }, assets: [...PHOTO(2), { kind: 'logo', name: 'l.png', url: 'u' }] });
  assert.deepEqual(inv.count, { logo: 1, product: 2, style: 0, creative: 0, other: 0 }); assert.equal(inv.brand.figma, true); assert.equal(inv.brand.tone, true); assert.equal(inv.brand.copy_rules, false); assert.deepEqual(inv.hard_gaps, []);
  assert.match(inventoryOf({}).hard_gaps[0], /Немає жодного фото продукту/); assert.equal(inventoryOf(null).count.product, 0);
});
await test('materials: the verdict cannot be «enough» without the basics; a shoot brief only when not enough; the hard gaps come first in «missing»', () => {
  const gap = inventoryOf({ assets: [] });
  const forced = checkMaterials({ materials: { verdict: 'enough', reason: 'Так', have: [], missing: ['Відео'], shoot_list: [{ what: 'Товар', format: 'фото' }] } }, gap);
  assert.equal(forced.verdict, 'not_enough'); assert.equal(forced.forced, true); assert.match(forced.reason, /Немає жодного фото продукту/); assert.equal(forced.missing[0], gap.hard_gaps[0]); assert.equal(forced.shoot_list.length, 1);
  const ok = checkMaterials({ materials: { verdict: 'enough', shoot_list: [{ what: 'Зайве', format: 'відео' }] } }, inventoryOf({ assets: PHOTO(1) }));
  assert.equal(ok.verdict, 'enough'); assert.equal(ok.forced, false); assert.deepEqual(ok.shoot_list, [], 'nothing to shoot when the materials are enough');
  const bad = checkMaterials({ materials: { verdict: 'not_enough', shoot_list: [{ what: '', format: 'x' }, { what: 'Y', format: '' }, { what: 'Z', format: 'відео', why: 'бо', reference: 'rival.example' }] } }, inventoryOf({ assets: PHOTO(1) }));
  assert.equal(bad.shoot_list.length, 1);
});
await test('materials: what we earn or lose on an offer is counted by the code from the Unit Economy', () => {
  const e = offerEconomics(MAT_BRIEF.content.economics, { name: 'x', pays: 150, list_value: 150, extra_cost: 18 });
  assert.equal(e.breakeven_cpa, 66, 'the same as the line «AirPlug + free 50 ml oil» of the Unit Economy'); assert.equal(e.contribution, 66); assert.equal(e.vs_average, -34, 'against the average order (100 before ads)');
  assert.equal(offerEconomics(MAT_BRIEF.content.economics, { name: 'x', pays: 150 }), null, 'no list value: nothing is counted');
  assert.equal(offerEconomics({ currency: 'USD' }, { name: 'x', pays: 150, list_value: 150 }), null, 'no product cost in the brief: nothing is counted');
});
await test('materials: an idea names its source or becomes our own; an offer of ours is a recommendation until the client approves it; a number without a source is flagged', () => {
  const facts = gatherIdeaFacts({ brief: MAT_BRIEF, materials: { assets: PHOTO(1) }, audit: MAT_AUDIT, competitors: MAT_COMP, audience: MAT_AUD, unitEconomy: { thresholds: { breakeven_cpa: 100, target_cpa: 70, breakeven_roas: 1.75 } } });
  assert.deepEqual(facts.approved_offers, ['AirPlug + free 50 ml oil']); assert.equal(facts.competitors.approaches.length, 1, 'only verified rows of the competitors are given'); assert.equal(facts.past_creatives.best[0].name, 'Відео цеху');
  const raw = { ideas: [
    IDEA({}),
    IDEA({ source: 'competitor', reference: 'ghost.example', hook: 'Від привидів' }),
    IDEA({ source: 'competitor', reference: 'Конкурент: rival.example', hook: 'З реклами конкурента' }),
    IDEA({ source: 'audience', segment: 'Невідомі', reference: '', hook: 'Для нікого' }),
    IDEA({ source: 'own', reference: '', hook: 'Знижка 83% тільки сьогодні' }),
    IDEA({ source: 'own', hook: 'Схвалений оффер', offer: { name: 'AirPlug + free 50 ml oil', pays: 150, list_value: 150, extra_cost: 18 } }),
    IDEA({ source: 'own', hook: 'Новий сет', offer: { name: 'Set $280', pays: 280, list_value: 350 } }),
    IDEA({ hook: '' }), IDEA({ format: '' }),
  ] };
  const r = checkIdeas(raw, { facts, economics: MAT_BRIEF.content.economics });
  assert.equal(r.dropped, 2); assert.equal(r.items.length, 7);
  const by = (h) => r.items.find((i) => i.hook === h);
  assert.equal(by('Подарунок до першого замовлення').source, 'competitor'); assert.equal(by('Від привидів').source, 'own'); assert.match(by('Від привидів').note, /Конкурента з такою назвою немає/);
  assert.equal(by('З реклами конкурента').source, 'competitor'); assert.equal(by('Для нікого').source, 'own');
  assert.equal(by('Знижка 83% тільки сьогодні').status, 'unverified'); assert.match(by('Знижка 83% тільки сьогодні').problem, /число без джерела: 83/);
  const ok = by('Схвалений оффер'), set = by('Новий сет');
  assert.equal(ok.offer.approved, true); assert.equal(ok.recommendation, false); assert.equal(ok.offer.economics.breakeven_cpa, 66);
  assert.equal(set.offer.approved, false); assert.equal(set.recommendation, true); assert.equal(set.offer.economics.breakeven_cpa, 146.2, 'counted even though not approved: the manager sees what the recommendation would earn');
  const text = renderIdeasText(r.items, { notCovered: ['x'] });
  assert.match(text, /Рекомендація, потрібне погодження клієнта/); assert.match(text, /Погоджено клієнтом/); assert.match(text, /\(-34 проти середнього замовлення\)/);
});
await test('materials: the skill reads the card, waits for the research, writes both sections, a shoot brief and tasks; the basics are forced by the code', async () => {
  const slow = async () => { await new Promise((r) => setTimeout(r, 30)); return { writes: [{ key: 'competitors', body: 'c', content: MAT_COMP }] }; };
  const handlers = createHandlers({ researcher: { competitors: slow }, creator: { materials_ideas: materialsIdeas } });
  const { repo, ctx } = await setup({ handlers });
  repo.setMaterials(1, { settings: { inputs: { tone: { body: 'Тепло' } } }, assets: [] });
  const asked = [];
  ctx.ask = async (o) => { asked.push(o); return { costUsd: 0.2, text: ANSWER({ materials: { verdict: 'enough', reason: 'Все є.', have: [], missing: [], shoot_list: [{ what: 'Товар на білому тлі', format: 'фото', why: 'для візуалів', reference: 'rival.example' }] } }) }; };
  await repo.enqueueRun({ project_id: 1, agent: 'creator', skill: 'materials_ideas' });
  await processTick(ctx);
  assert.equal(repo.T.runs[0].state.blocked_on, 'brief'); assert.equal(asked.length, 0);
  advance(1000);
  await repo.writeSectionVersion(1, 'brief', { author_kind: 'human', author: 'm@x', body: '', content: MAT_BRIEF.content });
  await repo.writeSectionVersion(1, 'audience', { author_kind: 'agent', author: 'researcher', body: 'a', content: MAT_AUD });
  await repo.enqueueRun({ project_id: 1, agent: 'researcher', skill: 'competitors' }); // still working: the Creator waits
  await processTick(ctx);
  assert.equal(asked.length, 0, 'not before the competitors are there');
  await processTick(ctx);
  const run = repo.T.runs.find((r) => r.skill === 'materials_ideas');
  assert.equal(run.status, 'done', run.error);
  assert.equal(asked.length, 1); assert.match(asked[0].user, /"hard_gaps"/); assert.match(asked[0].user, /Прямий виробник/); assert.doesNotMatch(asked[0].user, /shaky/);
  const m = (await repo.readSection(1, 'materials')).version, i = (await repo.readSection(1, 'ideas')).version;
  assert.equal(m.content.verdict, 'not_enough'); assert.equal(m.content.forced, true); assert.equal(m.content.shoot_list.length, 1);
  assert.match(m.body, /ТЗ на зйомку/); assert.match(m.body, /Відео клієнта в системі не зберігаються/);
  assert.equal(i.content.items.length, 2); assert.match(i.body, /Банк ідей/); assert.match(i.body, /Звідки: від конкурента \(rival\.example\)/);
  assert.ok(repo.T.tasks.some((t) => t.title === 'Надати фото продукту' && t.owner === 'client' && t.type === 'creatives'));
  assert.ok(repo.T.tasks.some((t) => t.title === 'Відзняти матеріали за ТЗ'));
  assert.equal(run.cost_usd, 0.2);
});
await test('materials: materials that are enough give ideas and no shoot brief; no model, no shoot brief when it is needed, and no ideas fail clearly and write nothing', async () => {
  const handlers = createHandlers({ creator: { materials_ideas: materialsIdeas } });
  const mk = async () => { const s = await setup({ handlers }); s.repo.setMaterials(1, { settings: {}, assets: PHOTO(2) }); await s.repo.writeSectionVersion(1, 'brief', { author_kind: 'human', author: 'm@x', body: '', content: MAT_BRIEF.content }); await s.repo.enqueueRun({ project_id: 1, agent: 'creator', skill: 'materials_ideas' }); return s; };
  const a = await mk(); a.ctx.ask = async () => ({ text: ANSWER() }); await processTick(a.ctx);
  assert.equal(a.repo.T.runs[0].status, 'done', a.repo.T.runs[0].error);
  assert.equal((await a.repo.readSection(1, 'materials')).version.content.verdict, 'enough'); assert.equal(a.repo.T.tasks.length, 0);
  const b = await mk(); await processTick(b.ctx);
  assert.equal(b.repo.T.runs[0].status, 'failed'); assert.match(b.repo.T.runs[0].error, /ANTHROPIC_API_KEY/);
  const c = await mk(); c.ctx.ask = async () => ({ text: ANSWER({ materials: { verdict: 'not_enough', reason: 'мало', shoot_list: [] } }) }); await processTick(c.ctx);
  assert.equal(c.repo.T.runs[0].status, 'failed'); assert.match(c.repo.T.runs[0].error, /не склала ТЗ/);
  const d = await mk(); d.ctx.ask = async () => ({ text: ANSWER({ ideas: [{ hook: 'x' }] }) }); await processTick(d.ctx);
  assert.equal(d.repo.T.runs[0].status, 'failed'); assert.match(d.repo.T.runs[0].error, /жодної придатної ідеї/);
  assert.equal((await d.repo.readSection(1, 'ideas'))?.version ?? null, null);
});
// ---------------------------------------------------------------- A6.2: the Creator's skill «first_creatives» (cards from the goals of the manager, pictures within the limit of the project)
const CR_BRIEF = { content: { general: { goal: 'Продаж AirPlug' }, economics: { ...LELIOR, offers: [{ name: 'AirPlug + free 50 ml oil', pays: 150, list_value: 150, extra_cost: 18, approved: true }, { name: 'Set $280', pays: 280, list_value: 350, approved: false }] }, creative_goals: [{ goal: 'Продати хіт', product: 'AirPlug' }, { goal: 'Розпродаж літа', product: '' }] } };
const CR_MATERIALS = { settings: { cta_mode: 'always', cta_text: 'Купити\nДізнатись більше', inputs: { tone: { body: 'Тепло, на «ви»' } } }, assets: [{ kind: 'logo', name: 'l.png', url: 'https://f.example/l.png' }, ...PHOTO(2)] };
const CR_IDEAS = { items: [{ id: 'i1', hook: 'Подарунок до замовлення', angle: 'подарунок', format: 'статика', segment: 'Молоді родини', status: 'ok', offer: { name: 'AirPlug + free 50 ml oil', approved: true } }, { id: 'i2', hook: 'Дивна', angle: 'х', status: 'unverified' }] };
const CARD = (o) => ({ goal_index: 1, product: 'AirPlug', segment: 'Молоді родини', idea_id: 'i1', angle: 'подарунок', format: '4:5', offer: 'AirPlug + free 50 ml oil', headline: 'AirPlug і олія в подарунок', primary_text: 'Тихий сон за 150: дарунок до замовлення.', cta: 'Купити', visual_prompt: 'A calm bedroom, the earplug case on a night table', references: [1], ...o });
const CR_ANSWER = (cards) => JSON.stringify({ cards: cards || [CARD({}), CARD({ goal_index: 2, product: '', idea_id: '', segment: '', offer: '', headline: 'Літній розпродаж', primary_text: 'Спокійний сон у спеку.', cta: 'Дізнатись більше', angle: 'економія', format: '9:16', references: [2] })] });
const fakeHf = ({ price = 0.5, states = {}, submitFail = false } = {}) => {
  const calls = { estimate: 0, submit: [], check: [] };
  return { calls, buildImageRequest: (c) => ({ path: 'fake/model', body: { prompt: c.prompt, ratio: c.ratio, refs: c.references } }), profile: () => ({}),
    estimate: async () => { calls.estimate += 1; return price; },
    submit: async ({ request, key }) => { if (submitFail) throw new Error('Higgsfield: rejected'); calls.submit.push({ request, key }); return { jobId: 'job' + calls.submit.length, statusUrl: 'https://api.higgsfield.ai/requests/job' + calls.submit.length + '/status' }; },
    check: async ({ statusUrl }) => { calls.check.push(statusUrl); return states[statusUrl] || { state: 'ready', url: 'https://cdn.hf.example/' + statusUrl.split('/').slice(-2)[0] + '.png' }; } };
};
const crSetup = async (opts = {}) => {
  const s = await setup({ handlers: createHandlers({ creator: { first_creatives: firstCreatives } }) });
  s.repo.setMaterials(1, opts.materials || CR_MATERIALS);
  await s.repo.writeSectionVersion(1, 'brief', { author_kind: 'human', author: 'm@x', body: '', content: opts.brief || CR_BRIEF.content });
  await s.repo.writeSectionVersion(1, 'ideas', { author_kind: 'agent', author: 'creator', body: 'i', content: CR_IDEAS });
  await s.repo.writeSectionVersion(1, 'audience', { author_kind: 'agent', author: 'researcher', body: 'a', content: MAT_AUD });
  await s.repo.writeSectionVersion(1, 'materials', { author_kind: 'agent', author: 'creator', body: 'm', content: { verdict: opts.verdict || 'enough' } });
  s.ctx.ask = opts.ask === undefined ? async (o) => { s.asked.push(o); return { costUsd: 0.1, text: CR_ANSWER() }; } : opts.ask;
  s.asked = []; s.ctx.hf = opts.hf === undefined ? fakeHf() : opts.hf; s.ctx.imageWaitMs = 0;
  await s.repo.enqueueRun({ project_id: 1, agent: 'creator', skill: 'first_creatives' });
  return s;
};
await test('creatives: the goals come from the brief, the pictures only from the files of the client, the tag has the seven parts of the document', () => {
  assert.deepEqual(goalsOf(CR_BRIEF), [{ goal: 'Продати хіт', product: 'AirPlug' }, { goal: 'Розпродаж літа', product: '' }]); assert.deepEqual(goalsOf(null), []);
  const pool = referencePool(CR_MATERIALS);
  assert.deepEqual(pool.map((p) => [p.n, p.kind]), [[1, 'product'], [2, 'product'], [3, 'logo']], 'product photos first, then the logo');
  assert.equal(tagOf({ goal: 'Продати хіт', product: 'AirPlug', segment: 'Молоді родини', angle: 'подарунок', format_label: 'картинка 4:5', offer: 'AirPlug + free 50 ml oil', version: 1 }), 'Продати хіт · AirPlug · Молоді родини · подарунок · картинка 4:5 · AirPlug + free 50 ml oil · v1');
  assert.equal(tagOf({ goal: 'x', format_label: 'картинка 1:1' }), 'x · без товару · усі · — · картинка 1:1 · без оффера · v1');
});
await test('creatives: the checks of a card: an offer only if approved, the button of the client, numbers from the brief, the product of the brief, files of the client, the format', () => {
  const goals = goalsOf(CR_BRIEF);
  const facts = gatherCreativeFacts({ brief: CR_BRIEF, materials: CR_MATERIALS, ideas: CR_IDEAS, audience: MAT_AUD, goals });
  assert.deepEqual(facts.ideas.map((i) => i.id), ['i1'], 'an unverified idea is not offered to the maker'); assert.deepEqual(facts.approved_offers.map((o) => o.name), ['AirPlug + free 50 ml oil']); assert.deepEqual(facts.brand.cta_wordings, ['Купити', 'Дізнатись більше']);
  const pool = referencePool(CR_MATERIALS);
  const ok = checkCards([CARD({})], { facts, pool }).cards[0];
  assert.equal(ok.status, 'planned'); assert.equal(ok.offer, 'AirPlug + free 50 ml oil'); assert.equal(ok.tag, 'Продати хіт · AirPlug · Молоді родини · подарунок · картинка 4:5 · AirPlug + free 50 ml oil · v1'); assert.deepEqual(ok.references.map((r) => r.n), [1]);
  const bad = checkCards([CARD({ offer: 'Set $280', cta: 'Замовити зараз', product: 'Нічого', segment: 'Привиди', idea_id: 'i9', format: '3:1', headline: 'Знижка 83%', references: [99, 3] })], { facts, pool }).cards[0];
  assert.equal(bad.offer, '', 'an offer the client did not approve is not used'); assert.equal(bad.cta, 'Купити', 'the button is one of the wordings of the client'); assert.equal(bad.product, 'AirPlug', 'the manager\'s product wins over the model');
  assert.equal(bad.segment, ''); assert.equal(bad.idea_id, ''); assert.equal(bad.ratio, '4:5'); assert.equal(bad.status, 'needs_check'); assert.match(bad.problems[0], /число без джерела: 83/);
  assert.deepEqual(bad.references.map((r) => r.n), [1, 3], 'a made-up number is dropped, a product photo is added first');
  assert.ok(bad.notes.some((n) => /не погоджений клієнтом/.test(n)) && bad.notes.some((n) => /не з варіантів клієнта/.test(n)) && bad.notes.some((n) => /Формат не з дозволених/.test(n)));
  const r = checkCards([CARD({}), CARD({ headline: 'Дубль' }), CARD({ goal_index: 7 })], { facts, pool });
  assert.equal(r.cards.length, 1, 'one card per goal, unknown goals ignored'); assert.deepEqual(r.missing, ['Розпродаж літа']);
  const noBtn = gatherCreativeFacts({ brief: CR_BRIEF, materials: { ...CR_MATERIALS, settings: { cta_mode: 'none' } }, ideas: CR_IDEAS, audience: MAT_AUD, goals });
  assert.equal(checkCards([CARD({})], { facts: noBtn, pool }).cards[0].cta, '', 'the client wants no button');
  assert.equal(checkCards([CARD({})], { facts, pool: [] }).cards[0].problems.includes('немає жодної картинки клієнта для референсу'), true);
});
await test('creatives: not enough materials is branch B (nothing is made, no model, no money); no goals wait for the manager with a task, and the goal wakes the run', async () => {
  const b = await crSetup({ verdict: 'not_enough', ask: async () => { throw new Error('must not be called'); } });
  await processTick(b.ctx);
  assert.equal(b.repo.T.runs[0].status, 'done'); const sec = (await b.repo.readSection(1, 'creatives')).version;
  assert.equal(sec.content.branch, 'B'); assert.deepEqual(sec.content.items, []); assert.match(sec.body, /матеріалів недостатньо/); assert.equal(b.repo.T.runs[0].cost_usd, 0);
  const n = await crSetup({ brief: { ...CR_BRIEF.content, creative_goals: [] } });
  await processTick(n.ctx);
  assert.equal(n.repo.T.runs[0].status, 'waiting'); assert.equal(n.repo.T.runs[0].state.blocked_on, 'brief'); assert.equal(n.repo.T.tasks[0].title, 'Вказати цілі перших креативів у брифі'); assert.equal(n.asked.length, 0);
  advance(1000);
  await n.repo.writeSectionVersion(1, 'brief', { author_kind: 'human', author: 'm@x', body: '', content: CR_BRIEF.content });
  await processTick(n.ctx);
  assert.equal(n.repo.T.runs[0].status, 'done', n.repo.T.runs[0].error);
});
await test('creatives: branch A makes a card per goal, the pictures through Higgsfield inside the limit, copies them to our storage and counts the cost', async () => {
  const s = await crSetup();
  await processTick(s.ctx);
  const run = s.repo.T.runs[0];
  assert.equal(run.status, 'done', run.error);
  const c = (await s.repo.readSection(1, 'creatives')).version.content;
  assert.equal(c.branch, 'A'); assert.equal(c.items.length, 2); assert.deepEqual(c.items.map((x) => x.status), ['ready', 'ready']);
  assert.match(c.items[0].image_url, /^https:\/\/store\.example\//, 'the picture is our copy, not the address of the provider'); assert.ok(c.items[0].path.startsWith('projects/1/creatives/'));
  assert.equal(c.spent_usd, 1); assert.equal(c.limit_usd, 5, 'no cap on the project: the default limit'); assert.equal(run.cost_usd, 1.1, 'the model 0.1 and two pictures 0.5');
  assert.equal(s.ctx.hf.calls.submit.length, 2); assert.match(s.ctx.hf.calls.submit[0].key, /^wf-1-/); assert.deepEqual(s.ctx.hf.calls.submit[0].request.body.refs, ['https://f.example/p0.jpg'], 'the reference is the product photo of the client');
  assert.equal(s.asked.length, 1); assert.match(s.asked[0].user, /"goal_index": 2/); assert.match((await s.repo.readSection(1, 'creatives')).version.body, /Продати хіт · AirPlug/);
  // a second run changes nothing: no new cards, no new pictures, no new questions to the model
  await s.repo.enqueueRun({ project_id: 1, agent: 'creator', skill: 'first_creatives' });
  await processTick(s.ctx);
  assert.equal(s.asked.length, 1); assert.equal(s.ctx.hf.calls.submit.length, 2); assert.equal(s.repo.T.runs[1].cost_usd, 0);
});
await test('creatives: the limit is the cost cap of the PROJECT: what does not fit stays planned with the reason; a picture still producing is followed on the next run; a failed one is not charged', async () => {
  const s = await crSetup({ hf: fakeHf({ price: 0.5 }) });
  await s.repo.setProjectFlag(1, { cost_cap_usd: 0.7 });
  await processTick(s.ctx);
  let c = (await s.repo.readSection(1, 'creatives')).version.content;
  assert.deepEqual(c.items.map((x) => x.status), ['ready', 'planned']); assert.match(c.items[1].note, /не вміщується в ліміт проєкту/); assert.equal(c.limit_usd, 0.7); assert.equal(s.ctx.hf.calls.submit.length, 1);
  // a slow picture and a failed one
  const slow = fakeHf({ price: 0.4, states: { 'https://api.higgsfield.ai/requests/job1/status': { state: 'pending' }, 'https://api.higgsfield.ai/requests/job2/status': { state: 'failed', error: 'Higgsfield: moderated' } } });
  const t = await crSetup({ hf: slow });
  await processTick(t.ctx);
  c = (await t.repo.readSection(1, 'creatives')).version.content;
  assert.deepEqual(c.items.map((x) => x.status), ['producing', 'failed']); assert.equal(c.items[1].note, 'Higgsfield: moderated'); assert.equal(c.items[1].cost_usd, 0, 'a moderated picture is not charged'); assert.equal(t.repo.T.runs[0].cost_usd, 0.5, 'the model 0.1 and the one picture that is still in work 0.4');
  assert.ok(c.open.some((o) => /ще генерується/.test(o)));
  slow.check = async () => ({ state: 'ready', url: 'https://cdn.hf.example/late.png' }); // the next run follows the job, does not pay again
  await t.repo.enqueueRun({ project_id: 1, agent: 'creator', skill: 'first_creatives' });
  await processTick(t.ctx);
  c = (await t.repo.readSection(1, 'creatives')).version.content;
  assert.equal(c.items[0].status, 'ready'); assert.equal(t.asked.length, 1, 'the model is not asked again');
});
await test('creatives: without Higgsfield the texts are made and the picture is told as missing; a failing submit is a note on the card; no model fails clearly', async () => {
  const a = await crSetup({ hf: null });
  await processTick(a.ctx);
  const c = (await a.repo.readSection(1, 'creatives')).version.content;
  assert.deepEqual(c.items.map((x) => x.status), ['planned', 'planned']); assert.ok(c.open.some((o) => /Higgsfield не налаштовано/.test(o))); assert.equal(a.repo.T.runs[0].cost_usd, 0.1);
  const b = await crSetup({ hf: fakeHf({ submitFail: true }) });
  await processTick(b.ctx);
  const cb = (await b.repo.readSection(1, 'creatives')).version.content;
  assert.deepEqual(cb.items.map((x) => x.status), ['failed', 'failed']); assert.match(cb.items[0].note, /rejected/); assert.equal(b.repo.T.runs[0].cost_usd, 0.1, 'nothing was submitted, nothing is spent');
  const d = await crSetup({ ask: null }); await processTick(d.ctx);
  assert.equal(d.repo.T.runs[0].status, 'failed'); assert.match(d.repo.T.runs[0].error, /ANTHROPIC_API_KEY/);
  const e = await crSetup({ ask: async () => ({ text: 'Вибачте' }) }); await processTick(e.ctx);
  assert.equal(e.repo.T.runs[0].status, 'failed'); assert.match(e.repo.T.runs[0].error, /не у форматі JSON/);
  const f = await crSetup({ ask: async () => ({ text: JSON.stringify({ cards: [{ goal_index: 9 }] }) }) }); await processTick(f.ctx);
  assert.equal(f.repo.T.runs[0].status, 'failed'); assert.match(f.repo.T.runs[0].error, /жодного придатного креатива/);
});
await test('brief: the goals of the first creatives are part of the brief sheet and come back unchanged', () => {
  const form = formFromContent(CR_BRIEF.content);
  assert.deepEqual(form.goals, [{ goal: 'Продати хіт', product: 'AirPlug' }, { goal: 'Розпродаж літа', product: '' }]);
  assert.deepEqual(contentFromForm({ ...form, goals: [...form.goals, { goal: '  ', product: 'x' }] }).creative_goals, CR_BRIEF.content.creative_goals, 'an empty goal is dropped');
  assert.deepEqual(formFromContent({}).goals, []);
});
// ---------------------------------------------------------------- A7.1: the Strategist's skill «strategy» (the budget by code, the structure by the model inside the limits)
const ST_ECON = { ...LELIOR, products: [{ name: 'AirPlug', price: 150 }, { name: 'Extrait 30 ml', price: 200 }, { name: 'Cheap', price: 20, cogs: 19 }], offers: [] };
const ST_UE = computeUnitEconomy(ST_ECON);
const ST_BRIEF = { content: { general: { goal: '60 замовлень на місяць', geo: 'США', priority: '' }, economics: ST_ECON, creative_goals: [{ goal: 'Продати хіт', product: 'AirPlug' }] } };
const ST_CREATIVES = { branch: 'A', items: [{ id: 'c1', tag: 'Продати хіт · AirPlug · Молоді родини · подарунок · картинка 4:5 · без оффера · v1', product: 'AirPlug', segment: 'Молоді родини', goal: 'Продати хіт', status: 'ready' }, { id: 'c2', tag: 'Розпродаж · Extrait 30 ml · усі · економія · картинка 9:16 · без оффера · v1', product: 'Extrait 30 ml', segment: '', goal: 'Розпродаж', status: 'ready' }] };
const ST_ANSWER = (o = {}) => JSON.stringify({ summary: 'У першому місяці продаємо AirPlug молодим родинам і перевіряємо другий товар.', priorities: [{ product: 'AirPlug', reason: 'Найкраща маржа.' }, { product: 'Cheap', reason: 'Дешевий товар.' }], campaigns: [
  { name: 'Холодна: молоді родини', segments: ['Молоді родини'], products: ['AirPlug'], share_pct: 60, why: 'Основний сегмент.', ad_groups: [{ name: 'Молоді родини', segment: 'Молоді родини', creative_ids: ['c1'] }] },
  { name: 'Холодна: широка', segments: [], products: ['Extrait 30 ml'], share_pct: 40, why: 'Перевірка другого товару.', ad_groups: [{ name: 'Широка аудиторія', segment: '', creative_ids: ['c2', 'c9'] }] }],
  remarketing: { visitors: 'Нагадуємо про товар.', cart: 'Нагадуємо про кошик.', checkout: 'Допомагаємо завершити замовлення.', note: 'Лише від відповідного бюджету.' }, seasonal: [{ what: 'Чорна п’ятниця', when: '29 листопада' }, { what: 'Вигадана акція', when: '12 березня' }], ...o });
await test('strategy: the budget is counted by code: the daily budget, how many campaigns it allows, the shares become budgets that reach the minimum', () => {
  const plan = budgetPlan({ economics: ST_ECON, unitEconomy: ST_UE });
  assert.equal(plan.daily, 150); assert.equal(plan.max_campaigns, 10); assert.equal(plan.remarketing_from_daily, 60); assert.equal(plan.scenarios.length, 3);
  const tiny = budgetPlan({ economics: { ...ST_ECON, budget_monthly: 300 }, unitEconomy: ST_UE });
  assert.equal(tiny.daily, 10); assert.equal(tiny.max_campaigns, 1); assert.equal(tiny.below_minimum, true);
  assert.equal(budgetPlan({ economics: { currency: 'USD' }, unitEconomy: null }), null);
  const a = allocate([{ name: 'A', share_pct: 50 }, { name: 'B', share_pct: 30 }, { name: 'C', share_pct: 20 }], plan);
  assert.deepEqual(a.campaigns.map((c) => c.daily_budget), [75, 45, 30]); assert.equal(a.campaigns.reduce((s, c) => s + c.daily_budget, 0), 150);
  const two = allocate([{ name: 'A', share_pct: 90 }, { name: 'B', share_pct: 5 }, { name: 'C', share_pct: 5 }], { daily: 100, min_daily: 30, max_campaigns: 3 });
  assert.deepEqual(two.campaigns.map((c) => [c.name, c.daily_budget]), [['A', 100]]); assert.deepEqual(two.dropped.sort(), ['B', 'C'], 'the weakest are dropped until each campaign reaches the minimum');
  const cap = allocate([{ name: 'A', share_pct: 1 }, { name: 'B', share_pct: 1 }, { name: 'C', share_pct: 1 }], { daily: 90, min_daily: 15, max_campaigns: 2 });
  assert.equal(cap.campaigns.length, 2); assert.deepEqual(cap.dropped, ['C']);
});
await test('strategy: margins, the source of the priorities, what the client owes us with dates, the rules of the optimisation with the numbers of the Unit Economy', () => {
  const m = marginInfo(ST_UE.lines ? { lines: ST_UE.lines } : {});
  assert.equal(m.airplug.low, false); assert.equal(m.cheap.low, true, 'a product that cannot be sold alone is a low margin one');
  assert.equal(prioritySource({ content: { general: { priority: 'Лише AirPlug' } } }).source, 'client'); assert.equal(prioritySource({ content: { general: { priority: 'Усі' } } }).source, 'margin'); assert.equal(prioritySource(null).source, 'margin');
  const now = new Date('2026-11-19T10:00:00Z');
  const need = neededFromClient({ audit: { tracking: { pixels: [{ name: 'P' }], stale: ['P'], never: [] } }, materials: { verdict: 'not_enough', shoot_list: [{}, {}] }, tasks: [{ type: 'site', priority: 'high', status: 'proposed', title: 'Сайт: Додати сторінку Повернення' }, { type: 'site', priority: 'low', status: 'proposed', title: 'Сайт: дрібниця' }], now });
  assert.deepEqual(need.map((x) => [x.due, /піксель|матеріали|сайту/.exec(x.what)[0]]), [['2026-11-22', 'піксель'], ['2026-11-26', 'матеріали'], ['2026-11-29', 'сайту']]);
  assert.deepEqual(neededFromClient({ audit: { tracking: { pixels: [{ name: 'P' }], stale: [], never: [] } }, materials: { verdict: 'enough' }, tasks: [], now }), [], 'a working pixel and enough materials: nothing is owed');
  const o = optimisationRules({ breakeven_roas: 1.75, target_roas: 2.5, breakeven_cpa: 100, target_cpa: 70 });
  assert.equal(o.thresholds.min_spend_for_verdict, 105); assert.ok(o.rules.some((r) => /не менше 105/.test(r)) && o.rules.some((r) => /Апрува 3/.test(r)) && o.rules.some((r) => /беззбиткової \(1\.75\)/.test(r)));
});
await test('strategy: the structure of the model is checked: segments, products, creatives, shares; low margin and the client\'s wish; a made-up number or date', () => {
  const plan = budgetPlan({ economics: ST_ECON, unitEconomy: ST_UE }), margins = marginInfo({ lines: ST_UE.lines });
  const audience = { segments: [{ name: 'Молоді родини', who: 'Пари', status: 'confirmed' }] };
  const facts = gatherStrategyFacts({ brief: ST_BRIEF, plan, margins, priority: { source: 'margin', instruction: '' }, ue: ST_UE, audience, ideas: null, creatives: ST_CREATIVES, materials: { verdict: 'enough' }, audit: null, rework: null });
  const byMargin = checkStrategy(JSON.parse(ST_ANSWER()), { facts, plan, margins, priority: { source: 'margin', instruction: '' } });
  assert.deepEqual(byMargin.priorities.map((p) => p.product), ['AirPlug'], 'a low margin product is not pushed on its own when the client gave no wish');
  assert.ok(byMargin.notes.some((n) => /«Cheap»: низька маржа/.test(n)));
  assert.deepEqual(byMargin.campaigns.map((c) => c.daily_budget), [90, 60]); assert.deepEqual(byMargin.campaigns[1].ad_groups[0].creatives.map((x) => x.id), ['c2'], 'c9 does not exist: dropped');
  assert.equal(byMargin.remarketing.enabled, true, '150 a day is above 60'); assert.deepEqual(byMargin.seasonal.map((s) => s.when), ['29 листопада'].filter(() => false), 'a date that is not in the input is not accepted');
  const wish = checkStrategy(JSON.parse(ST_ANSWER()), { facts, plan, margins, priority: { source: 'client', instruction: 'Cheap і AirPlug' } });
  assert.deepEqual(wish.priorities.map((p) => p.product), ['AirPlug', 'Cheap']); assert.match(wish.priorities[1].warning, /маржа товару низька/); assert.ok(wish.warnings.some((w) => /«Cheap»/.test(w)), 'the client may insist, but is warned');
  const ghost = checkStrategy({ summary: 'Ціна 777 для всіх.', campaigns: [{ name: 'X', segments: ['Невідомий', 'Молоді родини'], products: ['Нічого', 'AirPlug'], share_pct: 100, why: 'Знижка 83%', ad_groups: [] }], priorities: [{ product: 'Привид' }] }, { facts, plan, margins, priority: { source: 'margin', instruction: '' } });
  assert.deepEqual(ghost.campaigns[0].segments, ['Молоді родини']); assert.deepEqual(ghost.campaigns[0].products, ['AirPlug']); assert.equal(ghost.campaigns[0].ad_groups[0].name, 'Широка аудиторія', 'a campaign always has a group');
  assert.ok(ghost.warnings.some((w) => /числа, яких немає у вхідних даних: .*777/.test(w) && /83/.test(w)) && ghost.warnings.some((w) => /Пріоритетні товари не визначено/.test(w)));
  assert.ok(byMargin.notes.some((n) => /Креативи без групи/.test(n)) === false);
  const unplaced = checkStrategy({ campaigns: [{ name: 'Y', share_pct: 1, ad_groups: [{ name: 'g', creative_ids: ['c1'] }] }] }, { facts, plan, margins, priority: { source: 'margin', instruction: '' } });
  assert.ok(unplaced.notes.some((n) => /Креативи без групи: c2/.test(n)));
  assert.throws(() => checkStrategy({ campaigns: [{ name: '' }] }, { facts, plan, margins, priority: { source: 'margin', instruction: '' } }), /жодної придатної кампанії/);
  const tinyPlan = budgetPlan({ economics: { ...ST_ECON, budget_monthly: 300 }, unitEconomy: ST_UE });
  assert.ok(checkStrategy(JSON.parse(ST_ANSWER()), { facts: { ...facts, budget: null }, plan: tinyPlan, margins, priority: { source: 'margin', instruction: '' } }).warnings.some((w) => /нижчий за мінімальний бюджет кампанії/.test(w)));
});
await test('strategy: the skill waits for the brief, the Unit Economy and the budget, then writes a strategy that the check accepts; a return makes version 2 with the comment', async () => {
  const handlers = createHandlers({ strategist: { strategy } });
  const UE_CONTENT = { lines: ST_UE.lines, scenarios: ST_UE.scenarios, thresholds: ST_UE.thresholds, inputs: ST_ECON };
  const fresh = async ({ brief = ST_BRIEF.content, ue = true, extra = true } = {}) => {
    const s = await setup({ handlers }); s.asked = []; s.ctx.ask = async (o) => { s.asked.push(o); return { costUsd: 0.3, text: ST_ANSWER() }; };
    if (brief) await s.repo.writeSectionVersion(1, 'brief', { author_kind: 'human', author: 'm@x', body: '', content: brief });
    if (ue) await s.repo.writeSectionVersion(1, 'unit_economy', { author_kind: 'agent', author: 'researcher', body: 'ue', content: UE_CONTENT });
    if (extra) {
      for (const [k, c] of [['audience', { segments: [{ name: 'Молоді родини', who: 'Пари', status: 'confirmed' }] }], ['creatives', ST_CREATIVES], ['materials', { verdict: 'enough' }]]) await s.repo.writeSectionVersion(1, k, { author_kind: 'agent', author: 'x', body: 'x', content: c });
      await s.repo.writeSectionVersion(1, 'audit', { author_kind: 'agent', author: 'x', body: 'a', content: { tracking: { pixels: [{ name: 'P' }], stale: [], never: ['P'] } } });
    }
    await s.repo.enqueueRun({ project_id: 1, agent: 'strategist', skill: 'strategy' });
    return s;
  };
  const a = await fresh({ brief: null, ue: false, extra: false }); await processTick(a.ctx);
  assert.equal(a.repo.T.runs[0].state.blocked_on, 'brief'); assert.equal(a.asked.length, 0);
  const b = await fresh({ ue: false, extra: false }); await processTick(b.ctx);
  assert.equal(b.repo.T.runs[0].state.blocked_on, 'unit_economy');
  const c = await fresh({ brief: { ...ST_BRIEF.content, economics: { currency: 'USD' } }, extra: false }); await processTick(c.ctx);
  assert.equal(c.repo.T.runs[0].state.blocked_on, 'brief'); assert.ok(c.repo.T.tasks.some((t) => /місячний бюджет/.test(t.title))); assert.equal(c.asked.length, 0);
  const { repo, ctx, asked } = await fresh();
  await processTick(ctx);
  const run = repo.T.runs[0];
  assert.equal(run.status, 'done', run.error);
  const v1 = (await repo.readSection(1, 'strategy')).version;
  assert.equal(v1.content.version, 1); assert.equal(v1.content.budget_monthly, 4500); assert.equal(v1.content.geo, 'США'); assert.equal(v1.content.campaigns.reduce((s, x) => s + x.daily_budget, 0), 150);
  assert.match(v1.body, /Схема першого місяця/); assert.match(v1.body, /за маржею з Unit Economy/); assert.match(v1.body, /Як оптимізуємо/); assert.equal(run.cost_usd, 0.3);
  assert.ok(repo.T.tasks.some((t) => t.type === 'tracking' && /піксель/i.test(t.title) && t.owner === 'client'));
  assert.deepEqual((await validateProject({ repo, projectId: 1 })).problems.filter((p) => /Бюджет у стратегії|Географія/.test(p)), [], 'the automatic check agrees with the budget and the geo of the strategy');
  // a return: the same skill with the comment of the manager
  advance(1000);
  await repo.enqueueRun({ project_id: 1, agent: 'strategist', skill: 'strategy', input: { rework_of: 5, comment: 'Зменшити частку другого товару' } });
  await processTick(ctx);
  const v2 = (await repo.readSection(1, 'strategy')).version;
  assert.equal(v2.content.version, 2); assert.equal(v2.content.rework.comment, 'Зменшити частку другого товару'); assert.match(v2.body, /доопрацювання за коментарем/);
  assert.match(asked.at(-1).user, /Зменшити частку другого товару/); assert.match(asked.at(-1).user, /"previous"/);
});
await test('strategy: no model and a useless answer fail clearly and write nothing', async () => {
  const handlers = createHandlers({ strategist: { strategy } });
  const mk = async () => { const s = await setup({ handlers }); await s.repo.writeSectionVersion(1, 'brief', { author_kind: 'human', author: 'm@x', body: '', content: ST_BRIEF.content }); await s.repo.writeSectionVersion(1, 'unit_economy', { author_kind: 'agent', author: 'r', body: 'ue', content: { lines: ST_UE.lines, scenarios: ST_UE.scenarios, thresholds: ST_UE.thresholds } }); await s.repo.enqueueRun({ project_id: 1, agent: 'strategist', skill: 'strategy' }); return s; };
  const a = await mk(); await processTick(a.ctx); assert.equal(a.repo.T.runs[0].status, 'failed'); assert.match(a.repo.T.runs[0].error, /ANTHROPIC_API_KEY/);
  const b = await mk(); b.ctx.ask = async () => ({ text: 'Вибачте' }); await processTick(b.ctx); assert.match(b.repo.T.runs[0].error, /не у форматі JSON/);
  const c = await mk(); c.ctx.ask = async () => ({ text: JSON.stringify({ campaigns: [{ name: '' }] }) }); await processTick(c.ctx); assert.match(c.repo.T.runs[0].error, /жодної придатної кампанії/);
  assert.equal((await c.repo.readSection(1, 'strategy'))?.version ?? null, null);
});
await test('machine: the creatives are made first, the strategist follows; the automatic check stands before Апрув 1 and its warnings go with the approval', () => {
  const base = { now: new Date('2026-11-19T10:00:00Z'), state: { stage: 2, paused: false } };
  const run = (agent, skill, status = 'done') => ({ id: 1, agent, skill, status, input: {} });
  const acts = (o) => planNext({ ...base, ...o });
  assert.deepEqual(acts({ sections: {}, runs: [] }).filter((a) => a.type === 'enqueue').map((a) => `${a.agent}/${a.skill}`), ['creator/first_creatives']);
  assert.deepEqual(acts({ sections: {}, runs: [run('creator', 'first_creatives', 'waiting')] }).filter((a) => a.type === 'enqueue'), [], 'waiting for the goals of the manager: nothing else starts');
  assert.deepEqual(acts({ sections: {}, runs: [run('creator', 'first_creatives')] }).filter((a) => a.type === 'enqueue').map((a) => `${a.agent}/${a.skill}`), ['strategist/strategy']);
  const draft = { sections: { strategy: { status: 'draft', hasCurrent: true } }, runs: [run('creator', 'first_creatives'), run('strategist', 'strategy')] };
  const held = acts({ ...draft, checks: { ok: false, problems: ['Бюджет у стратегії (5000) не збігається'], rerun: [{ agent: 'strategist', skill: 'strategy' }] } });
  assert.ok(!held.some((a) => a.type === 'approval'), 'no approval while the check finds problems'); assert.ok(held.some((a) => a.action === 'check_failed' && a.once)); assert.ok(held.some((a) => a.type === 'enqueue' && a.skill === 'strategy'));
  const ok = acts({ ...draft, checks: { ok: true, problems: [], warnings: ['Сайт: непідтверджених знахідок 1.'] } });
  assert.deepEqual(ok.find((a) => a.type === 'approval').subject, { section: 'strategy', warnings: ['Сайт: непідтверджених знахідок 1.'] });
});
// ---------------------------------------------------------------- A7.2: remarks pinned to blocks of the package; only the returned creatives are made again
await test('machine: remarks on creatives go to the Creator first, then the strategist refreshes the scheme; remarks on other blocks go to the strategist; no remarks work as before', () => {
  const base = { now: new Date('2026-11-23T10:00:00Z'), state: { stage: 2, paused: false }, sections: { strategy: { status: 'on_approval', hasCurrent: true } } };
  const done = [{ id: 1, agent: 'creator', skill: 'first_creatives', status: 'done', input: {} }, { id: 2, agent: 'strategist', skill: 'strategy', status: 'done', input: {} }];
  const ret = (remarks, id = 7) => ({ id, kind: 'strategy', status: 'returned', comment: 'коментар', subject: { section: 'strategy', remarks } });
  const enq = (a) => a.filter((x) => x.type === 'enqueue').map((x) => `${x.agent}/${x.skill}`);
  const mixed = planNext({ ...base, runs: done, approvals: [ret([{ target: 'creative:c2', text: 'Прибрати слово спека' }, { target: 'budget', text: 'Менше на широку' }])] });
  assert.deepEqual(enq(mixed), ['creator/rework_creatives']); assert.deepEqual(mixed.find((x) => x.type === 'enqueue').input.remarks, [{ target: 'creative:c2', text: 'Прибрати слово спека' }]);
  const waiting = planNext({ ...base, runs: [...done, { id: 3, agent: 'creator', skill: 'rework_creatives', status: 'running', input: { rework_of: 7 } }], approvals: [ret([{ target: 'creative:c2', text: 'x' }])] });
  assert.deepEqual(enq(waiting), [], 'the strategist waits for the Creator');
  const after = planNext({ ...base, runs: [...done, { id: 3, agent: 'creator', skill: 'rework_creatives', status: 'done', input: { rework_of: 7 } }], approvals: [ret([{ target: 'creative:c2', text: 'x' }, { target: 'budget', text: 'Менше на широку' }])] });
  const s = after.find((x) => x.type === 'enqueue'); assert.equal(`${s.agent}/${s.skill}`, 'strategist/strategy'); assert.deepEqual(s.input.remarks, [{ target: 'budget', text: 'Менше на широку' }]); assert.deepEqual(s.input.creatives_reworked, ['c2']); assert.equal(s.input.rework_of, 7);
  assert.deepEqual(enq(planNext({ ...base, runs: done, approvals: [ret([{ target: 'budget', text: 'x' }])] })), ['strategist/strategy'], 'no creative remarks: straight to the strategist');
  const plain = planNext({ ...base, runs: done, approvals: [{ id: 7, kind: 'strategy', status: 'returned', comment: 'Усе переробити', subject: { section: 'strategy' } }] });
  assert.deepEqual(enq(plain), ['strategist/strategy']); assert.equal(plain.find((x) => x.type === 'enqueue').input.comment, 'Усе переробити');
  const handled = planNext({ ...base, runs: [...done, { id: 4, agent: 'strategist', skill: 'strategy', status: 'queued', input: { rework_of: 7 } }], approvals: [ret([{ target: 'creative:c2', text: 'x' }])] });
  assert.ok(!handled.some((x) => x.type === 'enqueue' && x.skill === 'rework_creatives'), 'a handled return is not handled twice');
});
await test('creatives: only the returned creative is made again (version 2, the comment kept, a new picture), the others stay as they were', async () => {
  const handlers = createHandlers({ creator: { first_creatives: firstCreatives, rework_creatives: reworkCreatives } });
  const s = await setup({ handlers }); s.asked = [];
  s.repo.setMaterials(1, CR_MATERIALS);
  await s.repo.writeSectionVersion(1, 'brief', { author_kind: 'human', author: 'm@x', body: '', content: CR_BRIEF.content });
  await s.repo.writeSectionVersion(1, 'ideas', { author_kind: 'agent', author: 'creator', body: 'i', content: CR_IDEAS });
  await s.repo.writeSectionVersion(1, 'audience', { author_kind: 'agent', author: 'researcher', body: 'a', content: MAT_AUD });
  await s.repo.writeSectionVersion(1, 'materials', { author_kind: 'agent', author: 'creator', body: 'm', content: { verdict: 'enough' } });
  s.ctx.hf = fakeHf(); s.ctx.imageWaitMs = 0;
  s.ctx.ask = async (o) => { s.asked.push(o); return { costUsd: 0.1, text: s.asked.length === 1 ? CR_ANSWER() : JSON.stringify({ cards: [CARD({ goal_index: 1, product: '', idea_id: '', segment: '', offer: '', headline: 'Спокійний сон узимку', primary_text: 'Лаконічний набір на холодну пору.', cta: 'Дізнатись більше', angle: 'економія', format: '9:16', references: [2] })] }) }; };
  await s.repo.enqueueRun({ project_id: 1, agent: 'creator', skill: 'first_creatives' });
  await processTick(s.ctx);
  const first = (await s.repo.readSection(1, 'creatives')).version.content.items.map((x) => ({ ...x }));
  assert.equal(first.length, 2); assert.equal(s.ctx.hf.calls.submit.length, 2);
  advance(1000);
  await s.repo.enqueueRun({ project_id: 1, agent: 'creator', skill: 'rework_creatives', input: { rework_of: 9, remarks: [{ target: 'creative:c2', text: 'Прибрати слово спека, у нас зима' }, { target: 'creative:c9', text: 'такого немає' }, { target: 'budget', text: 'не креатив' }] } });
  await processTick(s.ctx);
  const run = s.repo.T.runs.find((r) => r.skill === 'rework_creatives');
  assert.equal(run.status, 'done', run.error);
  const items = (await s.repo.readSection(1, 'creatives')).version.content.items;
  assert.deepEqual(items[0], first[0], 'the first creative is untouched: the same texts, the same picture');
  assert.equal(items[1].id, 'c2'); assert.equal(items[1].version, 2); assert.match(items[1].tag, /· v2$/); assert.equal(items[1].headline, 'Спокійний сон узимку'); assert.equal(items[1].status, 'ready');
  assert.notEqual(items[1].image_url, first[1].image_url, 'a new picture'); assert.deepEqual(items[1].rework, [{ from_version: 1, comment: 'Прибрати слово спека, у нас зима' }]);
  assert.equal(s.asked.length, 2); assert.match(s.asked[1].user, /"rework"/); assert.match(s.asked[1].user, /Прибрати слово спека/); assert.match(s.asked[1].user, /"goal_index": 1/); assert.doesNotMatch(s.asked[1].user, /Продати хіт/, 'the other goals are not asked again');
  assert.equal(s.ctx.hf.calls.submit.length, 3); assert.match(s.ctx.hf.calls.submit[2].key, /-v2-1$/, 'a new key: the version is part of it');
  assert.equal(run.cost_usd, 0.6, 'the model 0.1 and one picture 0.5: only the returned one is paid');
  // nothing to do: no model call
  const before = s.asked.length;
  await s.repo.enqueueRun({ project_id: 1, agent: 'creator', skill: 'rework_creatives', input: { rework_of: 10, remarks: [{ target: 'creative:c9', text: 'x' }] } });
  await processTick(s.ctx);
  assert.equal(s.asked.length, before); assert.equal(s.repo.T.runs.filter((r) => r.skill === 'rework_creatives')[1].status, 'done');
});
// ---------------------------------------------------------------- A7.2: the package of the first launch (blocks, steps of the review, remarks)
await test('package: the review state: approve only when every block is marked good and nothing is remarked; return only with a remark; a remark on a creative counts for the scheme', () => {
  const all = Object.fromEntries(PACK_BLOCKS.map((b) => [b.key, true]));
  assert.deepEqual([reviewState({}, []).answered, reviewState({}, []).canApprove, reviewState({}, []).canReturn], [0, false, false]);
  assert.equal(reviewState(all, []).canApprove, true); assert.equal(reviewState(all, []).canReturn, false);
  const withRemark = reviewState(all, [{ target: 'money', text: 'x' }]);
  assert.equal(withRemark.canApprove, false, 'a remark has to be dealt with first'); assert.equal(withRemark.canReturn, true);
  const part = reviewState({ summary: true }, [{ target: 'creative:c2', text: 'x' }]);
  assert.equal(part.answered, 2, 'summary marked, scheme has a remark on a creative'); assert.deepEqual(part.pending, ['priorities', 'money', 'timeline', 'optimisation']); assert.equal(part.canReturn, true);
  assert.equal(blockOfTarget('creative:c7'), 'scheme'); assert.equal(blockOfTarget('budget'), 'budget');
  assert.equal(PACK_BLOCKS.length, 6);
});
await test('package: the text of the remarks names the block or the creative by its goal', () => {
  const t = remarksText([{ target: 'money', text: ' Менше на широку ' }, { target: 'creative:c2', text: 'Прибрати слово спека' }, { target: 'scheme', text: '' }], [{ id: 'c2', goal: 'Розпродаж літа' }]);
  assert.equal(t, 'Гроші: Менше на широку\nКреатив «Розпродаж літа»: Прибрати слово спека');
  assert.equal(remarksText([], []), '');
  assert.deepEqual([1, 2, 4, 5, 11, 12, 21, 22, 25].map((n) => plural(n, 'зауваження', 'зауваження', 'зауважень')), ['зауваження', 'зауваження', 'зауваження', 'зауважень', 'зауважень', 'зауважень', 'зауваження', 'зауваження', 'зауважень']);
});
await test('package: the blocks are built from the strategy and the creatives: ads in their groups, the rest apart, the timeline with the dates of the client', () => {
  const strategy = { version: 2, rework: { comment: 'Менше на широку' }, budget_monthly: 4500, currency: 'USD', geo: 'США', summary: 'Текст', goal: { text: '60 замовлень', base: { orders_at_target: 64, orders_to_break_even: 45 } },
    priority_source: 'margin', priorities: [{ product: 'AirPlug', margin_pct: 52 }], notes: ['«Cheap»: низька маржа, окремо не рекламуємо', 'інше'], warnings: ['w1'], assumptions: ['a1'],
    budget: { daily: 150, monthly: 4500, min_daily: 15, max_campaigns: 10, scenarios: [{ name: 'Базовий' }] }, remarketing: { enabled: true }, seasonal: [],
    campaigns: [{ name: 'К1', daily_budget: 90, ad_groups: [{ name: 'Г1', creatives: [{ id: 'c1', tag: 't1' }, { id: 'c9', tag: 'gone' }] }] }, { name: 'К2', daily_budget: 60, ad_groups: [{ name: 'Г2', creatives: [] }] }],
    needed_from_client: [{ what: 'Налаштувати піксель', due: '2026-11-26', source: 'x' }], optimisation: { rules: ['r1'], assumptions: ['a'] } };
  const creatives = { branch: 'A', items: [{ id: 'c1', tag: 't1', headline: 'H' }, { id: 'c2', tag: 't2' }] };
  const p = buildPack(strategy, creatives);
  assert.equal(p.version, 2); assert.equal(p.summary.daily, 150); assert.equal(p.summary.campaigns, 2); assert.equal(p.summary.base.orders_at_target, 64);
  assert.equal(p.scheme.campaigns[0].groups[0].ads[0].headline, 'H'); assert.equal(p.scheme.campaigns[0].groups[0].ads[1].missing, true, 'a creative that is gone is shown as missing, not hidden');
  assert.deepEqual(p.scheme.unplaced.map((c) => c.id), ['c2']); assert.deepEqual(p.priorities.notes, ['«Cheap»: низька маржа, окремо не рекламуємо']);
  assert.equal(p.timeline.milestones[0].client, true); assert.equal(p.timeline.milestones[0].date, '2026-11-26'); assert.ok(p.timeline.milestones.some((m) => m.title === 'Тиждень 2'), 'remarketing week only when it is on');
  assert.equal(buildPack({ ...strategy, remarketing: { enabled: false } }, creatives).timeline.milestones.some((m) => m.title === 'Тиждень 2'), false);
  assert.deepEqual(p.money.campaigns, [{ name: 'К1', daily_budget: 90 }, { name: 'К2', daily_budget: 60 }]); assert.deepEqual(p.warnings, ['w1']);
  const empty = buildPack(null, null); assert.deepEqual(empty.scheme.campaigns, []); assert.equal(empty.summary.daily, null);
});
console.log(`\n${passed} workflow checks passed`);
