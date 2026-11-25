// Checks of the new orchestrator (step A2): the brain (machine.js) and the cycle (tick.js) on an in-memory twin of the storage.
// The database rules themselves (versions, leases, uniqueness, access) are checked in the database with the self-rolling-back blocks of the migrations.
// Run:  node scripts/check-workflow.mjs
import assert from 'node:assert/strict';
import { planNext, STAGE } from '../api/_lib/wf/machine.js';
import { otherPlatformsNote } from '../api/_lib/wf/skills/platforms.js';
import { createNotifier, digestMessage, noticeOf } from '../api/_lib/wf/notify.js';
import { buildOverview, digestText, filterRows, usage } from '../src/lib/workflow/overview.js';
import { reached } from '../api/_lib/wf/limits.js';
import { MAX_FAILURES, recentFailures } from '../api/_lib/wf/machine.js';
import { dueState, digest, filterCounts, filterTasks, groupTasks, hasDraft, isBlocker, parseEvidence, sourceLabel } from '../src/lib/workflow/tasks.js';
import { REMIND_DAYS, buildFeedbackPrompt, checkFeedback, draftOf, nextPayment, onboardingChecklist, parseFeedbackAnswer, profitability, renderFeedbackText } from '../api/_lib/wf/skills/supportEngine.js';
import { onboarding, paymentReminder, periodsOf, weeklyReport } from '../api/_lib/wf/skills/supportAgent.js';
import { analyse, judge, renderOptimizeText, SMALL, pickSmallActions } from '../api/_lib/wf/skills/optimizeEngine.js';
import { optimize } from '../api/_lib/wf/skills/optimizeAgent.js';
import { launchCheck } from '../api/_lib/wf/skills/launchCheck.js';
import { actId, countriesOf, createMetaWriter, hasEu, ctaType, landingUrl, minor, utmTags } from '../api/_lib/metaAdsWrite.js';
import { buildPlan, checkLaunch } from '../api/_lib/wf/skills/launchEngine.js';
import { launch } from '../api/_lib/wf/skills/launchAgent.js';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { PACK_BLOCKS, blockOfTarget, buildPack, plural, remarksText, reviewState } from '../src/lib/workflow/pack.js';
import { reworkCreatives } from '../api/_lib/wf/skills/creativesAgent.js';
import { allocate, budgetPlan, checkStrategy, gatherStrategyFacts, marginInfo, neededFromClient, optimisationRules, prioritySource } from '../api/_lib/wf/skills/strategyEngine.js';
import { strategy } from '../api/_lib/wf/skills/strategyAgent.js';
import { checkCards, gatherCreativeFacts, goalsOf, referencePool, tagOf } from '../api/_lib/wf/skills/creativesEngine.js';
import { firstCreatives } from '../api/_lib/wf/skills/creativesAgent.js';
import * as hfImage from '../api/_lib/hfImage.js';
import { SYSTEM_PROMPT as IDEAS_PROMPT, checkIdeas, checkMaterials, gatherIdeaFacts, inventoryOf, offerEconomics, renderIdeasText } from '../api/_lib/wf/skills/ideasEngine.js';
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
import { REAL } from '../api/_lib/wf/agents.js';
import { createHandlers } from '../api/_lib/wf/agents.js';
import { planProject, processTick } from '../api/_lib/wf/tick.js';
import { createMemoryWfRepo } from './wfMemoryRepo.mjs';
import { computeUnitEconomy, renderUnitEconomy } from '../api/_lib/wf/skills/economics.js';
import { intake } from '../api/_lib/wf/skills/intake.js';
import { unitEconomy } from '../api/_lib/wf/skills/unitEconomyAgent.js';
import { ROWS, briefGaps, contentFromForm, emptyForm, formFromContent, rowStatus } from '../src/lib/workflow/brief.js';
import { AGENTS, RERUN_SKILLS, SKILL_LABEL, STAGES, agentCards, buildQueue, nowCard, openProposals, sectionRows, signoffWanted } from '../src/lib/workflow/view.js';
import { readinessOf } from '../src/lib/workflow/readiness.js';
import { ACTIVE_AGENTS, INTEGRATED_SKILLS, mapIslands } from '../src/lib/workflow/registry.js';
import { sectionName } from '../src/lib/workflow/view.js';
import { agentFacts, agentStates, feedOf, podStates } from '../src/lib/workflow/mapLive.js';
import { monthsOffered, spendReport } from '../src/lib/workflow/spendStats.js';
import { durationText, filterRuns, runCounts, runRows } from '../src/lib/workflow/runsView.js';
import { connectionChecks } from '../api/_lib/wf/status.js';
import { periodReport } from '../api/_lib/wf/skills/periodReport.js';
import { brandDna, collectBrandAssets } from '../api/_lib/wf/skills/brandDnaAgent.js';
import { brandForCreator, brandGaps, buildBrandPrompt, checkBrand, dnaIsUsable, extractBrandSignals, manualNotes, normHex, parseBrandAnswer, tabooHits } from '../api/_lib/wf/skills/brandDnaEngine.js';
import { SYSTEM_PROMPT as CREATIVES_PROMPT } from '../api/_lib/wf/skills/creativesEngine.js';
import { BATCH_DEFAULT, BATCH_MAX, affordableCount, buildBatchGoals, clampCount, markDuplicates } from '../api/_lib/wf/skills/batchEngine.js';
import { batchCreatives } from '../api/_lib/wf/skills/creativesAgent.js';
import { MERGE_MAX, SYSTEM_PROMPT as SYSTEM_VARIATIONS, VAR_MAX, checkVariations, needsPicture, normalizeRequest } from '../api/_lib/wf/skills/variationsEngine.js';
import { adVariations } from '../api/_lib/wf/skills/variationsAgent.js';
import { DEFAULTS as CFG_DEFAULTS, SPEC as CFG_SPEC, applyChanges, checkValue, getPath as cfgGet, plannerConfig, resolveConfig, sourceOf as cfgSource } from '../src/lib/workflow/agentConfig.js';
import { SPEC as EX_SPEC, applyChosen, buildExtractPrompt, checkExtraction, conflictOf, currentValue, shapeValue } from '../src/lib/workflow/briefExtract.js';
import { docxText, isDocx, isPdf } from '../api/_lib/docText.js';
import { readFiles } from '../api/brief-extract.js';
import zlib from 'node:zlib';
import { FIELDS, SECTIONS as BS_SECTIONS, applyToBrief, checkBrief, geoHasEu, planWrite, unitInputsOk } from '../src/lib/workflow/briefSchema.js';
import { briefDraft } from '../api/_lib/wf/skills/briefDraftAgent.js';
import { VIDEO_MONTHLY_MAX, buildMotionPrompt, isTestimonial, normalizeVideoRequest, planVideos, renderVideosText, videosThisMonth } from '../api/_lib/wf/skills/videoEngine.js';
import { animateCreatives } from '../api/_lib/wf/skills/videoAgent.js';
import { buildVideoRequest, check as hfVideoCheck, isConfigured as hfVideoConfigured, missingConfig as hfVideoMissing, profileFromEnv as hfVideoProfile } from '../api/_lib/hfVideo.js';
import { buildBriefDraftPrompt, checkBriefDraft, corpusOf, detectCurrency, numbersSet, parseBriefDraftAnswer, priceLines, renderBriefDraftText } from '../api/_lib/wf/skills/briefDraftEngine.js';
import { QUICK_STEPS, nameFromSite, normalizeSite } from '../src/lib/workflow/quickStart.js';
import { enqueueReportRun, reportsViaOrchestrator } from '../api/_lib/wf/reportBridge.js';
import { dueFor, eventsFor, gatherPlanFacts, checkPlan, monthWindows, parsePlanAnswer, renderPlanText, summarizeLastMonth } from '../api/_lib/wf/skills/monthlyPlanEngine.js';
import { monthlyPlan } from '../api/_lib/wf/skills/monthlyPlanAgent.js';
import { HELP_CONTROLS, HELP_STAGES } from '../src/lib/workflow/helpContent.js';
import { headlineOf, historyOf, pendingCount, pendingItem, pendingList, roadOf } from '../src/lib/workflow/approvalsTab.js';

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
  assert.deepEqual(go.filter((a) => a.type === 'enqueue').map((a) => a.skill).sort(), ['audience', 'audit', 'brand_dna', 'competitors', 'onboarding', 'site', 'unit_economy']);
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
await test('screens: five agents, the dossier has thirteen sections, proposals not yet answered are open', () => {
  const cards = agentCards([{ id: 1, agent: 'researcher', skill: 'site', status: 'done' }, { id: 2, agent: 'creator', skill: 'materials_ideas', status: 'running' }]);
  assert.equal(cards.length, 5);
  assert.equal(cards.find((c) => c.key === 'creator').active, true);
  assert.equal(cards.find((c) => c.key === 'mediabuyer').status, 'Не активний');
  const rows = sectionRows([{ id: 9, key: 'brief', status: 'approved', current_version_id: 4, needs_reapproval: true }]);
  assert.equal(rows.length, 13);
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
  assert.equal(s.ctx.hf.calls.submit.length, 2); assert.match(s.ctx.hf.calls.submit[0].key, /^wf-1-/); assert.ok(s.ctx.hf.calls.submit.every((c) => /^[ -~]+$/.test(c.key)), 'the key of the request is ASCII even when the goal is Ukrainian'); assert.deepEqual(s.ctx.hf.calls.submit[0].request.body.refs, ['https://f.example/p0.jpg'], 'the reference is the product photo of the client');
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
// ---------------------------------------------------------------- the code and the database must agree (the in-memory twin of the storage has no constraints, the real tables have)
await test('database: every section key and every status written by the code is allowed by the check constraints of the migrations', () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : e.name.endsWith('.js') ? [path.join(d, e.name)] : []));
  const code = walk(path.join(root, 'api', '_lib', 'wf')).map((f) => fs.readFileSync(f, 'utf8')).join('\n');
  const used = new Set([...code.matchAll(/(?:key|readSection\([^,()]+,|setSectionStatus\([^,()]+,|type: 'section_status', key):?\s*'([a-z_]+)'/g)].map((m) => m[1]));
  const migrations = fs.readdirSync(path.join(root, 'supabase', 'migrations')).filter((f) => f.endsWith('.sql')).sort().map((f) => fs.readFileSync(path.join(root, 'supabase', 'migrations', f), 'utf8'));
  let allowed = null;
  for (const m of migrations) for (const x of m.matchAll(/wf_sections[\s\S]{0,400}?check \(key in \(([^)]*)\)\)/g)) allowed = new Set([...x[1].matchAll(/'([a-z_]+)'/g)].map((y) => y[1]));
  assert.ok(allowed && allowed.size >= 12, 'the constraint of the section keys is found in the migrations');
  const sections = [...used].filter((k) => !['stub', 'draft', 'needs_rework', 'on_approval', 'approved'].includes(k) && /^(brief|audit|site|audience|unit_economy|competitors|materials|ideas|strategy|creatives|launch|monthly_plan|[a-z_]*plan|report)$/.test(k));
  for (const k of sections) assert.ok(allowed.has(k), `section key «${k}» is written by the code but not allowed by the database`);
  for (const k of ['brief', 'creatives', 'launch', 'strategy', 'ideas', 'materials']) assert.ok(allowed.has(k), `«${k}» must be allowed`);
  // the task types and owners used by the skills
  const taskTypes = new Set([...code.matchAll(/type: '(site|creatives|ads|tracking|brand|client|[a-z_]+)',\s*owner/g)].map((m) => m[1]));
  for (const t of taskTypes) assert.ok(['site', 'creatives', 'ads', 'tracking', 'brand', 'client'].includes(t), `task type «${t}» is not allowed by the database`);
});
// ---------------------------------------------------------------- A8: the Media buyer's skill «launch» (the check before the launch, the writes to the cabinet, the snapshot)
const LA_NOW = () => new Date(clock.t);
const LA_DAY = () => LA_NOW().toISOString().slice(0, 10);
const LA_FRESH = () => new Date(clock.t.getTime() - 864e5).toISOString(); // the pixel fired yesterday (the test clock moves on through the file)
await test('meta write: the button, the countries, the money and the UTM tags are decided by code', () => {
  assert.deepEqual([ctaType('Купити').type, ctaType('Дізнатись більше').type, ctaType('Замовити зараз').type, ctaType('').type, ctaType('Хмм').type, ctaType('Хмм').known], ['SHOP_NOW', 'LEARN_MORE', 'ORDER_NOW', 'NO_BUTTON', 'LEARN_MORE', false]);
  assert.deepEqual(countriesOf('США, Україна'), { codes: ['US', 'UA'], unknown: [] }); assert.deepEqual(countriesOf('US, ua та Польща'), { codes: ['US', 'UA', 'PL'], unknown: [] });
  assert.deepEqual(countriesOf('Атлантида'), { codes: [], unknown: ['Атлантида'] }); assert.deepEqual(countriesOf(''), { codes: [], unknown: [] });
  assert.equal(minor(90), 9000); assert.equal(minor(33.335), 3334);
  assert.equal(utmTags({ campaign: 'Холодна: молоді родини · 2026-11-23', content: 'c1-v2' }), 'utm_source=facebook&utm_medium=paid&utm_campaign=%D1%85%D0%BE%D0%BB%D0%BE%D0%B4%D0%BD%D0%B0-%D0%BC%D0%BE%D0%BB%D0%BE%D0%B4%D1%96-%D1%80%D0%BE%D0%B4%D0%B8%D0%BD%D0%B8-2026-11-23&utm_content=c1-v2');
  assert.equal(landingUrl('shop.example/airplug?ref=1', 'utm_source=facebook&utm_medium=paid'), 'https://shop.example/airplug?ref=1&utm_source=facebook&utm_medium=paid');
});
await test('meta write: the requests have the shape of the Marketing API, nested values are JSON, the token never appears in an error, a read-only token is told apart', async () => {
  const seen = [];
  const fetchFn = async (url, init) => {
    seen.push({ url: String(url), method: init?.method || 'GET', body: init?.body ? Object.fromEntries(new URLSearchParams(init.body)) : null });
    const u = String(url);
    if (u.startsWith('https://store.example/')) return new Response(new Uint8Array([1, 2, 3]), { status: 200 });
    if (u.includes('/adimages')) return new Response(JSON.stringify({ images: { bytes: { hash: 'h123' } } }), { status: 200 });
    if (u.includes('/campaigns') && init?.body?.toString().includes('FAIL')) return new Response(JSON.stringify({ error: { message: 'Permission denied with TOKEN123', code: 200 } }), { status: 403 });
    if (u.endsWith('act_55?fields=name%2Caccount_status%2Ccurrency%2Cdisable_reason%2Ctimezone_name&access_token=TOKEN123') || u.includes('act_55?fields')) return new Response(JSON.stringify({ name: 'Monarchi', account_status: 1, currency: 'USD' }), { status: 200 });
    return new Response(JSON.stringify({ id: 'id' + seen.length }), { status: 200 });
  };
  const w = createMetaWriter({ token: 'TOKEN123', fetchFn });
  assert.deepEqual(await w.accountInfo({ accountId: 'act_55' }), { name: 'Monarchi', status: 1, currency: 'USD', disable_reason: null, timezone: null });
  await w.createCampaign({ accountId: '55', name: 'К1', status: 'ACTIVE' });
  const camp = seen.at(-1); assert.match(camp.url, /\/act_55\/campaigns$/); assert.equal(camp.method, 'POST'); assert.equal(camp.body.objective, 'OUTCOME_SALES'); assert.equal(camp.body.status, 'ACTIVE'); assert.equal(camp.body.special_ad_categories, '[]'); assert.equal(camp.body.access_token, 'TOKEN123');
  await w.createAdSet({ accountId: '55', campaignId: 'cmp1', name: 'Г1', dailyMinor: 9000, pixelId: 'px1', countries: ['US'] });
  const set = seen.at(-1).body; assert.equal(set.daily_budget, '9000'); assert.equal(set.optimization_goal, 'OFFSITE_CONVERSIONS'); assert.deepEqual(JSON.parse(set.promoted_object), { pixel_id: 'px1', custom_event_type: 'PURCHASE' }); assert.deepEqual(JSON.parse(set.targeting).geo_locations, { countries: ['US'] }); assert.equal(set.campaign_id, 'cmp1');
  assert.equal(await w.uploadImage({ accountId: '55', url: 'https://store.example/c1.png' }), 'h123'); assert.equal(seen.at(-1).body.bytes, Buffer.from([1, 2, 3]).toString('base64'), 'the picture is sent as bytes');
  await assert.rejects(() => w.uploadImage({ accountId: '55', url: 'http://insecure.example/a.png' }), /https/);
  await w.createAdCreative({ accountId: '55', name: 't', pageId: '777', link: 'https://shop.example/?utm_source=facebook', message: 'Текст', headline: 'Заголовок', imageHash: 'h123', cta: 'SHOP_NOW', urlTags: 'utm_source=facebook' });
  const cr = JSON.parse(seen.at(-1).body.object_story_spec); assert.equal(cr.page_id, '777'); assert.equal(cr.link_data.image_hash, 'h123'); assert.deepEqual(cr.link_data.call_to_action, { type: 'SHOP_NOW', value: { link: 'https://shop.example/?utm_source=facebook' } });
  await w.createAdCreative({ accountId: '55', name: 't', pageId: '777', link: 'https://s.example', message: 'm', headline: 'h', imageHash: 'h', cta: 'NO_BUTTON', urlTags: '' });
  assert.equal(JSON.parse(seen.at(-1).body.object_story_spec).link_data.call_to_action, undefined, 'no button, no call_to_action');
  await w.createAd({ accountId: '55', adsetId: 'set1', name: 'Оголошення', creativeId: 'cr1' }); assert.deepEqual(JSON.parse(seen.at(-1).body.creative), { creative_id: 'cr1' }); assert.equal(seen.at(-1).body.status, 'ACTIVE');
  const err = await w.createCampaign({ accountId: '55', name: 'FAIL' }).catch((e) => e);
  assert.match(err.message, /Permission denied with \*\*\*/); assert.doesNotMatch(err.message, /TOKEN123/); assert.match(err.message, /ads_management/); assert.equal(err.metaCode, 200);
  assert.throws(() => createMetaWriter({}), /META_ACCESS_TOKEN/);
});
// the world of the launch tests
const SHOP = { 'https://shop.example/': '<html><head><title>Shop</title></head><body><h1>AirPlug</h1><p>AirPlug + free 50 ml oil за 150 USD. Extrait 30 ml в наявності.</p></body></html>' };
const LA_ACC = { platform: 'meta', account_id: '55', account_name: 'Monarchi test', currency: 'USD' };
const LA_BRIEF = { content: { general: { goal: '60', geo: 'США', fb_page_id: '777000' }, economics: { ...LELIOR, offers: [{ name: 'AirPlug + free 50 ml oil', pays: 150, list_value: 150, extra_cost: 18, approved: true }] }, creative_goals: [] } };
const LA_STRAT = { version: 1, geo: 'США', budget_monthly: 4500, budget: { daily: 150, min_daily: 15 }, campaigns: [
  { name: 'Холодна: молоді родини', daily_budget: 90, ad_groups: [{ name: 'Молоді родини', segment: 'Молоді родини', creatives: [{ id: 'c1' }] }] },
  { name: 'Холодна: широка', daily_budget: 60, ad_groups: [{ name: 'Широка аудиторія', segment: '', creatives: [{ id: 'c2' }] }] }] };
const LA_CREATIVES = { items: [
  { id: 'c1', goal: 'Продати хіт', tag: 'Продати хіт · AirPlug · Молоді родини · подарунок · картинка 4:5 · AirPlug + free 50 ml oil · v1', product: 'AirPlug', offer: 'AirPlug + free 50 ml oil', headline: 'AirPlug і олія в подарунок', primary_text: 'Тихий сон за 150.', cta: 'Купити', status: 'ready', image_url: 'https://store.example/c1.png', version: 1 },
  { id: 'c2', goal: 'Розпродаж', tag: 'Розпродаж · Extrait 30 ml · усі · економія · картинка 9:16 · без оффера · v1', product: 'Extrait 30 ml', offer: '', headline: 'Спокійний сон', primary_text: 'Набір на літо.', cta: 'Дізнатись більше', status: 'ready', image_url: 'https://store.example/c2.png', version: 1 }] };
const laWriter = ({ failAt = null, status = 1 } = {}) => {
  const calls = []; let n = 0;
  const rec = (name, fn) => async (a) => { if (failAt === name && !rec.failed) { rec.failed = true; throw new Error('Meta: temporary error (#2)'); } calls.push([name, a]); n += 1; return fn(a); };
  return { calls, accountInfo: async () => ({ name: 'Monarchi', status, currency: 'USD', disable_reason: null }), createCampaign: rec('campaign', () => 'camp' + n), createAdSet: rec('adset', () => 'set' + n), uploadImage: rec('image', () => 'hash' + n), createAdCreative: rec('creative', () => 'cre' + n), createAd: rec('ad', () => 'ad' + n) };
};
const laSetup = async ({ pixels, account = LA_ACC, website = 'https://shop.example', brief = LA_BRIEF.content, strategy = LA_STRAT, creatives = LA_CREATIVES, writer, world = SHOP, approved = true } = {}) => {
  const s = await setup({ handlers: createHandlers({ mediabuyer: { launch } }) });
  if (approved) s.repo.T.approvals.push({ id: 900, project_id: 1, kind: 'launch', subject: {}, status: 'approved', requested_at: '2026-11-23T09:00:00Z', decided_at: '2026-11-23T09:30:00Z', decided_by: 'manager@test' }); // Апрув 2 is given, as the orchestrator would wait for it
  const net = fakeNet(world); Object.assign(s.ctx, net);
  if (account) s.repo.addAccount(1, account);
  if (website) s.repo.setWebsite(1, website);
  s.ctx.meta = { pixels: async () => pixels ?? [{ id: 'px1', name: 'Main', lastFired: LA_FRESH() }] };
  if (writer !== null) s.ctx.metaWrite = writer || laWriter();
  if (brief) await s.repo.writeSectionVersion(1, 'brief', { author_kind: 'human', author: 'm@x', body: '', content: brief });
  if (strategy) await s.repo.writeSectionVersion(1, 'strategy', { author_kind: 'agent', author: 'strategist', body: 's', content: strategy });
  if (creatives) await s.repo.writeSectionVersion(1, 'creatives', { author_kind: 'agent', author: 'creator', body: 'c', content: creatives });
  await s.repo.writeSectionVersion(1, 'unit_economy', { author_kind: 'agent', author: 'researcher', body: 'ue', content: { thresholds: { breakeven_cpa: 100, target_cpa: 70, breakeven_roas: 1.75, target_roas: 2.5 } } });
  await s.repo.enqueueRun({ project_id: 1, agent: 'mediabuyer', skill: 'launch' });
  return s;
};
await test('launch check: every thing the document lists blocks the launch with a reason and a task: cabinet, currency, tracking, page, site, geo, budgets, creatives, offer, stock', async () => {
  const siteOf = async (html) => collectSiteData({ website: 'shop.example', ...fakeNet({ 'https://shop.example/': html }) });
  const ok = await siteOf(SHOP['https://shop.example/']);
  const base = { accountInfo: { status: 1, currency: 'USD' }, accountCurrency: 'USD', pixels: [{ id: 'px1', name: 'Main', lastFired: LA_FRESH() }], brief: LA_BRIEF, strategy: LA_STRAT, creatives: LA_CREATIVES, siteData: ok, website: 'https://shop.example', now: LA_NOW() };
  const codes = (o) => checkLaunch({ ...base, ...o }).blockers.map((b) => b.code);
  assert.deepEqual(codes({}), [], 'everything in order: no blockers');
  assert.deepEqual(codes({ accountInfo: { status: 2, currency: 'USD', disable_reason: 1 } }), ['account']); assert.deepEqual(codes({ accountInfo: { status: 1, currency: 'EUR' } }), ['currency']);
  assert.deepEqual(codes({ pixels: [] }), ['pixel']); assert.deepEqual(codes({ pixels: [{ id: 'p', name: 'Old', lastFired: '2026-10-01T00:00:00Z' }] }), ['pixel']); assert.deepEqual(codes({ pixels: [{ id: 'p', name: 'New', lastFired: null }] }), ['pixel']);
  assert.deepEqual(codes({ website: '' }), ['site']); assert.deepEqual(codes({ siteData: { pages: [{ ok: false, error: 'HTTP 500' }], errors: [] } }), ['site']);
  assert.deepEqual(codes({ brief: { content: { ...LA_BRIEF.content, general: { geo: 'США' } } } }), ['page']);
  assert.deepEqual(codes({ strategy: { ...LA_STRAT, geo: 'Атлантида' }, brief: { content: { ...LA_BRIEF.content, general: { ...LA_BRIEF.content.general, geo: 'Атлантида' } } } }), ['geo']);
  assert.deepEqual(codes({ strategy: { ...LA_STRAT, campaigns: [{ ...LA_STRAT.campaigns[0], daily_budget: 300 }, LA_STRAT.campaigns[1]] } }), ['budget', 'budget'], 'more than the brief allows, and not what the strategy says');
  assert.deepEqual(codes({ creatives: { items: [{ ...LA_CREATIVES.items[0], status: 'needs_check', problems: ['число без джерела: 83'] }, LA_CREATIVES.items[1]] } }), ['creatives']);
  assert.deepEqual(codes({ creatives: { items: [{ ...LA_CREATIVES.items[0], image_url: '' }, LA_CREATIVES.items[1]] } }), ['creatives']);
  assert.deepEqual(codes({ strategy: { ...LA_STRAT, campaigns: [{ ...LA_STRAT.campaigns[0], ad_groups: [{ name: 'Порожня', creatives: [] }] }, LA_STRAT.campaigns[1]] } }), ['creatives']);
  assert.deepEqual(codes({ siteData: await siteOf('<html><body><p>AirPlug за 100 USD. Extrait 30 ml.</p></body></html>') }), ['offer'], 'the offer of the ad is not on the site');
  assert.deepEqual(codes({ siteData: await siteOf('<html><body><p>AirPlug + free 50 ml oil за 150 USD. Extrait 30 ml немає в наявності.</p></body></html>') }), ['stock']);
  const r = checkLaunch({ ...base, siteData: await siteOf('<html><body><p>AirPlug + free 50 ml oil за 150 USD.</p></body></html>'), creatives: { items: [LA_CREATIVES.items[0], { ...LA_CREATIVES.items[1], cta: 'Хмм' }] } });
  assert.deepEqual(r.blockers, []); assert.ok(r.warnings.some((w) => /Наявність товару «Extrait 30 ml» не вдалося перевірити/.test(w)) && r.warnings.some((w) => /Кнопка «Хмм»/.test(w)), 'what cannot be checked is a warning, not a blocker');
  assert.ok(checkLaunch({ ...base, pixels: [] }).blockers[0].task.type === 'tracking' && checkLaunch({ ...base, pixels: [] }).blockers[0].task.owner === 'client', 'every blocker comes with the task for the right person');
});
await test('launch plan: names with the date, budgets in cents (a campaign with several groups is split without losing a cent), links with UTM tags, the button types', () => {
  const plan = buildPlan({ strategy: { ...LA_STRAT, campaigns: [{ name: 'К', daily_budget: 100, ad_groups: [{ name: 'А', creatives: [{ id: 'c1' }] }, { name: 'Б', creatives: [{ id: 'c2' }] }, { name: 'В', creatives: [] }] }] }, creatives: LA_CREATIVES, website: 'https://shop.example', pageId: '777 000', pixelId: 'px1', now: LA_NOW() });
  assert.equal(plan.campaigns[0].name, 'К · ' + LA_DAY()); assert.deepEqual(plan.campaigns[0].adsets.map((a) => a.dailyMinor), [3334, 3333, 3333]); assert.equal(plan.campaigns[0].adsets.reduce((s, a) => s + a.dailyMinor, 0), 10000);
  assert.equal(plan.pageId, '777000'); assert.equal(plan.countries.join(), 'US');
  const ad = plan.campaigns[0].adsets[0].ads[0]; assert.equal(ad.cta, 'SHOP_NOW'); assert.match(ad.link, /^https:\/\/shop\.example\/\?utm_source=facebook&utm_medium=paid&utm_campaign=.+&utm_content=c1-v1$/); assert.equal(ad.key, 'c1-v1');
  const one = buildPlan({ strategy: LA_STRAT, creatives: LA_CREATIVES, website: 'shop.example', pageId: '7', pixelId: 'p', now: LA_NOW() });
  assert.deepEqual(one.campaigns.map((c) => c.adsets[0].dailyMinor), [9000, 6000]);
});
await test('launch: without a cabinet it waits and asks; a problem found by the check changes nothing in the cabinet, tells the reasons, and is checked again after half an hour', async () => {
  const a = await laSetup({ account: null }); await processTick(a.ctx);
  assert.equal(a.repo.T.runs[0].state.blocked_on, 'accounts:meta'); assert.equal(a.ctx.metaWrite.calls.length, 0);
  const b = await laSetup({ pixels: [] }); await processTick(b.ctx);
  const run = b.repo.T.runs[0];
  assert.equal(run.status, 'waiting'); assert.equal(run.state.blocked_on, 'launch_fix'); assert.match(run.error, /немає піксельного набору/); assert.equal(b.ctx.metaWrite.calls.length, 0, 'nothing was changed in the cabinet');
  assert.ok(b.repo.T.tasks.some((t) => t.type === 'tracking' && t.owner === 'client')); assert.equal((await b.repo.readSection(1, 'launch'))?.version ?? null, null);
  await processTick(b.ctx); assert.equal(b.repo.T.runs[0].status, 'waiting', 'before half an hour it is not checked again');
  advance(31 * 60000); b.ctx.meta.pixels = async () => [{ id: 'px1', name: 'Main', lastFired: new Date(clock.t.getTime() - 3600e3).toISOString() }]; // the pixel started to fire
  await processTick(b.ctx);
  assert.equal(b.repo.T.runs[0].status, 'done', b.repo.T.runs[0].error); assert.ok(b.ctx.metaWrite.calls.length > 0);
});
await test('launch: the approved package is created in the cabinet in the right order, ACTIVE at once, and the snapshot of the launch is written; a second run does nothing', async () => {
  const s = await laSetup(); await processTick(s.ctx);
  const run = s.repo.T.runs[0];
  assert.equal(run.status, 'done', run.error);
  const calls = s.ctx.metaWrite.calls;
  assert.deepEqual(calls.map((c) => c[0]), ['campaign', 'adset', 'image', 'creative', 'ad', 'campaign', 'adset', 'image', 'creative', 'ad']);
  assert.equal(calls[0][1].status, 'ACTIVE'); assert.equal(calls[0][1].name, 'Холодна: молоді родини · ' + LA_DAY()); assert.equal(calls[1][1].dailyMinor, 9000); assert.equal(calls[1][1].pixelId, 'px1'); assert.deepEqual(calls[1][1].countries, ['US']); assert.equal(calls[1][1].campaignId, 'camp1');
  assert.equal(calls[3][1].pageId, '777000'); assert.equal(calls[3][1].cta, 'SHOP_NOW'); assert.match(calls[3][1].link, /utm_source=facebook/); assert.equal(calls[3][1].imageHash, 'hash3'); assert.equal(calls[4][1].creativeId, 'cre4'); assert.equal(calls[4][1].adsetId, 'set2');
  const snap = (await s.repo.readSection(1, 'launch')).version;
  assert.equal(snap.content.status, 'done'); assert.equal(snap.content.campaigns.length, 2); assert.equal(snap.content.campaigns[0].adsets[0].ads[0].ad_id, 'ad5'); assert.equal(snap.content.targets.target_cpa, 70); assert.equal(snap.content.account.name, 'Monarchi test'); assert.equal(snap.content.strategy_version, 1);
  assert.match(snap.body, /Знімок запуску. Запущено/); assert.match(snap.body, /utm_content=c1-v1/); assert.match(snap.body, /цільовий CPA 70/);
  assert.ok(s.repo.T.journal.some((j) => j.action === 'launch' && /кампаній 2, оголошень 2, 150 на день \(ACTIVE\)/.test(j.summary)));
  await s.repo.enqueueRun({ project_id: 1, agent: 'mediabuyer', skill: 'launch' }); await processTick(s.ctx);
  assert.equal(s.ctx.metaWrite.calls.length, 10, 'a launched project is not launched twice'); assert.equal(s.repo.T.runs.filter((r) => r.skill === 'launch')[1].output.already_launched, true);
});
await test('launch: when Meta fails halfway the progress is saved, the run fails with the reason, and the next run goes on without making the same campaign again', async () => {
  const writer = laWriter({ failAt: 'creative' });
  const s = await laSetup({ writer }); await processTick(s.ctx);
  assert.equal(s.repo.T.runs[0].status, 'failed'); assert.match(s.repo.T.runs[0].error, /temporary error/);
  const part = (await s.repo.readSection(1, 'launch')).version.content;
  assert.equal(part.status, 'partial'); assert.equal(part.campaigns[0].id, 'camp1'); assert.equal(part.campaigns[0].adsets[0].id, 'set2'); assert.equal(part.campaigns[1].id, null);
  const before = writer.calls.length;
  advance(1000); await s.repo.enqueueRun({ project_id: 1, agent: 'mediabuyer', skill: 'launch' }); await processTick(s.ctx);
  assert.equal(s.repo.T.runs.filter((r) => r.skill === 'launch')[1].status, 'done', s.repo.T.runs.filter((r) => r.skill === 'launch')[1].error);
  assert.equal(writer.calls.filter((c) => c[0] === 'campaign').length, 2, 'two campaigns in all, the first one was not made again'); assert.equal(writer.calls.filter((c) => c[0] === 'adset').length, 2);
  assert.equal(writer.calls.slice(before)[0][0], 'image', 'it goes on with the picture of the first creative');
  assert.equal((await s.repo.readSection(1, 'launch')).version.content.status, 'done');
});
await test('launch: no right to write fails clearly and changes nothing; a closed cabinet and a broken strategy are told apart', async () => {
  const a = await laSetup({ writer: null }); await processTick(a.ctx);
  assert.equal(a.repo.T.runs[0].status, 'failed'); assert.match(a.repo.T.runs[0].error, /ads_management/);
  const b = await laSetup({ writer: laWriter({ status: 2 }) }); await processTick(b.ctx);
  assert.equal(b.repo.T.runs[0].status, 'waiting'); assert.match(b.repo.T.runs[0].error, /кабінет не активний/); assert.equal(b.ctx.metaWrite.calls.length, 0);
  const c = await laSetup({ strategy: null }); await processTick(c.ctx);
  assert.equal(c.repo.T.runs[0].status, 'failed'); assert.match(c.repo.T.runs[0].error, /Немає стратегії/);
});
await test('machine: a failed launch is tried again from the saved progress, three failures in a row stop it for a person', () => {
  const base = { now: new Date('2026-11-23T10:00:00Z'), state: { stage: 3, paused: false }, sections: {} };
  const run = (id, status) => ({ id, agent: 'mediabuyer', skill: 'launch', status, input: {} });
  const enq = (a) => a.filter((x) => x.type === 'enqueue').map((x) => `${x.agent}/${x.skill}`);
  assert.deepEqual(enq(planNext({ ...base, runs: [] })), ['mediabuyer/launch']);
  assert.deepEqual(enq(planNext({ ...base, runs: [run(2, 'failed'), run(1, 'failed')] })), ['mediabuyer/launch']);
  const stop = planNext({ ...base, runs: [run(3, 'failed'), run(2, 'failed'), run(1, 'failed')] });
  assert.deepEqual(enq(stop), []); assert.ok(stop.some((a) => a.action === 'launch_stopped' && a.once));
  assert.ok(planNext({ ...base, runs: [run(1, 'done')] }).some((a) => a.type === 'set_stage' && a.stage === 4), 'a finished launch moves on to the optimisation');
  assert.deepEqual(enq(planNext({ ...base, runs: [run(1, 'waiting')] })), [], 'a launch waiting for the check is not duplicated');
});
await test('brief: the page the ads are published from is a row of the brief sheet', () => {
  const f = formFromContent({ general: { fb_page_id: '777000', geo: 'США' } });
  assert.equal(f.values.fb_page_id, '777000'); assert.equal(contentFromForm(f).general.fb_page_id, '777000');
});
// ---------------------------------------------------------------- A9: the Media buyer's skill «optimize» (recommendations by the rules of the owner; nothing is changed in the cabinet)
const OP_TH = { breakeven_cpa: 100, target_cpa: 70, breakeven_roas: 1.75, target_roas: 2.5 };
const opDay = (n) => new Date(clock.t.getTime() + n * 864e5);
const opSnap = (daysAgo = 10) => ({ status: 'done', launched_at: opDay(-daysAgo).toISOString(), account: { id: '55', name: 'Monarchi test', currency: 'USD' }, targets: { ...OP_TH }, campaigns: [
  { key: 'k1', name: 'К1', id: 'camp1', daily: 90, adsets: [{ key: 'k1/g1', name: 'Г1', id: 'set1', daily: 90, ads: [{ key: 'c1-v1', tag: 'Креатив 1', ad_id: 'ad1' }, { key: 'c2-v1', tag: 'Креатив 2', ad_id: 'ad2' }] }] },
  { key: 'k2', name: 'К2', id: 'camp2', daily: 60, adsets: [{ key: 'k2/g2', name: 'Г2', id: 'set2', daily: 60, ads: [{ key: 'c3-v1', tag: 'Креатив 3', ad_id: 'ad3' }] }] }] });
const opRow = (ad, spend, purchases, extra = {}) => ({ ad_id: ad, spend, purchases, revenue: purchases * 150, impressions: extra.impressions ?? spend * 40, clicks: extra.clicks ?? spend * 0.6, reach: extra.reach ?? spend * 30 });
const OP_LIFE = [opRow('ad1', 300, 5), opRow('ad2', 400, 3), opRow('ad3', 200, 0)];
await test('optimize: the verdict asks for time and enough spend first, then judges by the economics of the client', () => {
  const m = (spend, purchases) => ({ spend, purchases, cpa: purchases ? spend / purchases : null });
  assert.equal(judge(m(500, 9), OP_TH, 2).state, 'wait'); assert.match(judge(m(500, 9), OP_TH, 2).reason, /Перші 3 дні/);
  assert.equal(judge(m(60, 0), OP_TH, 10).state, 'wait'); assert.match(judge(m(60, 0), OP_TH, 10).reason, /Витрачено 60 з 105/);
  assert.equal(judge(m(120, 0), OP_TH, 10).state, 'off'); assert.match(judge(m(120, 0), OP_TH, 10).reason, /без жодної покупки/);
  assert.equal(judge(m(400, 3), OP_TH, 10).state, 'off'); assert.equal(judge(m(450, 5), OP_TH, 10).state, 'keep'); assert.equal(judge(m(300, 5), OP_TH, 10).state, 'scale');
  assert.equal(judge(m(500, 9), {}, 10).state, 'wait', 'without the thresholds nothing is judged');
});
await test('optimize: from the bottom up: a losing ad is off unless it is the last one of its group, a group off when all its ads are, a campaign off (through Апрув 3) when all its groups are', () => {
  const r = analyse({ snapshot: opSnap(), thresholds: OP_TH, rows: { life: OP_LIFE, recent: [], prior: [] }, now: opDay(0) });
  const find = (level, id) => r.actions.filter((a) => a.level === level && a.id === id);
  assert.equal(find('ad', 'ad2')[0].action, 'off'); assert.match(find('ad', 'ad2')[0].reason, /133.*вища за беззбитковий 100/); assert.equal(find('ad', 'ad2')[0].significant, false);
  assert.equal(find('ad', 'ad1')[0].action, 'keep'); assert.match(find('ad', 'ad1')[0].reason, /Працює добре/);
  assert.equal(find('ad', 'ad3')[0].action, 'replace'); assert.equal(find('ad', 'ad3')[0].significant, true, 'the last ad of a group is replaced, not switched off');
  assert.equal(find('adset', 'set1')[0].action, 'keep'); assert.equal(find('adset', 'set2')[0].action, 'off');
  assert.equal(find('campaign', 'camp2')[0].action, 'off'); assert.equal(find('campaign', 'camp2')[0].significant, true); assert.equal(find('campaign', 'camp1').length, 0);
  assert.deepEqual(r.significant.map((a) => `${a.level}:${a.id}`).sort(), ['ad:ad3', 'campaign:camp2']);
  assert.equal(r.thresholds.min_spend_for_verdict, 105); assert.equal(r.totals.spend, 900);
  const young = analyse({ snapshot: opSnap(2), thresholds: OP_TH, rows: { life: OP_LIFE, recent: [], prior: [] }, now: opDay(0) });
  assert.ok(young.actions.every((a) => a.action === 'wait'), 'the first days only observe'); assert.equal(young.significant.length, 0);
});
await test('optimize: a worse neighbour that still earns stays; a pause by hand is respected; the scale is a step of 20% and not more often than every 72 hours', () => {
  const snap = opSnap(); snap.campaigns[0].adsets[0].ads.push({ key: 'c4-v1', tag: 'Креатив 4', ad_id: 'ad4' });
  const life = [opRow('ad1', 300, 6), opRow('ad2', 400, 8), opRow('ad4', 200, 2), opRow('ad3', 50, 1)];
  const r = analyse({ snapshot: snap, thresholds: OP_TH, rows: { life, recent: [], prior: [] }, now: opDay(0) });
  const worse = r.actions.find((a) => a.id === 'ad4' && a.level === 'ad'); assert.equal(worse.action, 'keep'); assert.match(worse.reason, /Суттєво гірший за сусідів/);
  const scale = analyse({ snapshot: snap, thresholds: OP_TH, rows: { life: [opRow('ad1', 300, 5), opRow('ad2', 300, 5), opRow('ad3', 50, 1)], recent: [], prior: [] }, now: opDay(0), objects: { adsets: new Map([['set1', { status: 'ACTIVE', daily: 100 }]]) } });
  const s = scale.actions.find((a) => a.level === 'adset' && a.id === 'set1'); assert.equal(s.action, 'scale'); assert.equal(s.to_daily, 120, '100 + 20%, from the real budget in the cabinet'); assert.match(s.effect, /\+0\.33 покупок на день/);
  const soon = analyse({ snapshot: snap, thresholds: OP_TH, rows: { life: [opRow('ad1', 300, 5), opRow('ad2', 300, 5)], recent: [], prior: [] }, now: opDay(0), lastScaleAt: opDay(-1).toISOString() });
  assert.equal(soon.actions.find((a) => a.level === 'adset' && a.id === 'set1').action, 'keep'); assert.match(soon.actions.find((a) => a.level === 'adset' && a.id === 'set1').reason, /не минуло 72 годин/);
  const later = analyse({ snapshot: snap, thresholds: OP_TH, rows: { life: [opRow('ad1', 300, 5), opRow('ad2', 300, 5)], recent: [], prior: [] }, now: opDay(0), lastScaleAt: opDay(-4).toISOString() });
  assert.equal(later.actions.find((a) => a.level === 'adset' && a.id === 'set1').action, 'scale');
  const paused = analyse({ snapshot: snap, thresholds: OP_TH, rows: { life: OP_LIFE, recent: [], prior: [] }, now: opDay(0), objects: { ads: new Map([['ad2', { status: 'PAUSED' }]]) } });
  assert.ok(!paused.actions.some((a) => a.id === 'ad2'), 'what is already off is not judged again');
});
await test('optimize: it earned before and not now means a new creative; tired creatives (frequency up, CTR down) ask for a new one; ads fine but no sales means the site and the tracking', () => {
  const good = [opRow('ad1', 300, 5), opRow('ad2', 300, 4), opRow('ad3', 120, 2)];
  const bad = analyse({ snapshot: opSnap(), thresholds: OP_TH, rows: { life: good, recent: [opRow('ad1', 120, 0), opRow('ad2', 100, 2)], prior: [] }, now: opDay(0) });
  const rep = bad.actions.find((a) => a.id === 'ad1' && a.action === 'replace'); assert.ok(rep && rep.significant); assert.match(rep.reason, /Раніше окупалось.*за останні 3 дні витрачено 120 без покупок/);
  const tired = analyse({ snapshot: opSnap(), thresholds: OP_TH, rows: { life: good, recent: [{ ...opRow('ad1', 120, 2), impressions: 4000, clicks: 20, reach: 1000 }], prior: [{ ...opRow('ad1', 120, 2), impressions: 4000, clicks: 40, reach: 2000 }] }, now: opDay(0) });
  const t = tired.actions.find((a) => a.action === 'new_creative'); assert.ok(t && t.significant); assert.match(t.reason, /частота 2 → 4, CTR 1% → 0\.5%/);
  const noSales = analyse({ snapshot: opSnap(), thresholds: OP_TH, rows: { life: [opRow('ad1', 300, 0), opRow('ad2', 300, 0), opRow('ad3', 300, 0)], recent: [], prior: [] }, now: opDay(0) });
  assert.equal(noSales.tasks.length, 1); assert.equal(noSales.tasks[0].type, 'tracking'); assert.match(noSales.tasks[0].title, /перевірити сайт і трекінг/); assert.ok(noSales.notes.some((n) => /проблема на сайті або в трекінгу/.test(n)));
  assert.equal(analyse({ snapshot: opSnap(), thresholds: OP_TH, rows: { life: OP_LIFE, recent: [], prior: [] }, now: opDay(0) }).tasks.length, 0, 'with sales there is no such task');
  assert.match(renderOptimizeText(analyse({ snapshot: opSnap(), thresholds: OP_TH, rows: { life: OP_LIFE, recent: [], prior: [] }, now: opDay(0) }), { period: 'a – b', accountName: 'M' }), /Кампанія «К2»: вимкнути \(через Апрув 3\)/);
});
const opMeta = (rowsFor) => ({ insights: async ({ timeRange, level }) => { assert.equal(level, 'ad'); const since = timeRange.since; return { rows: rowsFor(since) }; }, objects: async ({ level }) => (level === 'adset' ? [{ id: 'set1', status: 'ACTIVE', daily: 90 }, { id: 'set2', status: 'ACTIVE', daily: 60 }] : [{ id: 'ad1', status: 'ACTIVE' }, { id: 'ad2', status: 'ACTIVE' }, { id: 'ad3', status: 'ACTIVE' }]) });
const opSetup = async ({ snap = opSnap(), meta, launched = true } = {}) => {
  const s = await setup({ handlers: createHandlers({ mediabuyer: { optimize } }) });
  s.repo.addAccount(1, LA_ACC);
  if (launched) await s.repo.writeSectionVersion(1, 'launch', { author_kind: 'agent', author: 'mediabuyer', body: 'l', content: snap });
  await s.repo.writeSectionVersion(1, 'unit_economy', { author_kind: 'agent', author: 'researcher', body: 'ue', content: { thresholds: OP_TH } });
  s.ctx.meta = meta === undefined ? opMeta((since) => (since === snap.launched_at.slice(0, 10) ? OP_LIFE : [])) : meta;
  await s.repo.enqueueRun({ project_id: 1, agent: 'mediabuyer', skill: 'optimize' });
  return s;
};
await test('optimize: the skill reads three periods, writes the advice with the numbers into the journal and the steps, sends the significant changes to Апрув 3 once, and changes nothing in the cabinet', async () => {
  const s = await opSetup(); const periods = []; const inner = s.ctx.meta.insights; s.ctx.meta.insights = async (o) => { periods.push(o.timeRange); return inner(o); };
  await processTick(s.ctx);
  const run = s.repo.T.runs.find((r) => r.skill === 'optimize');
  assert.equal(run.status, 'done', run.error);
  assert.equal(periods.length, 3); assert.equal(periods[0].since, opDay(-10).toISOString().slice(0, 10)); assert.equal(periods[1].since, opDay(-3).toISOString().slice(0, 10)); assert.equal(periods[1].until, opDay(-1).toISOString().slice(0, 10)); assert.equal(periods[2].since, opDay(-7).toISOString().slice(0, 10)); assert.equal(periods[2].until, opDay(-4).toISOString().slice(0, 10));
  const j = s.repo.T.journal.find((x) => x.action === 'optimize'); assert.match(j.summary, /рекомендацій 4/); assert.ok(j.meta.actions.some((a) => a.level === 'campaign' && a.name === 'Кампанія «К2»'));
  const ap = s.repo.T.approvals.filter((a) => a.kind === 'changes'); assert.equal(ap.length, 1); assert.equal(ap[0].subject.actions.length, 2); assert.equal(ap[0].subject.source, 'optimize');
  assert.ok(s.repo.T.steps.some((st) => st.detail?.actions?.length), 'the advice is in the steps of the run');
  advance(24 * 3600e3); await s.repo.enqueueRun({ project_id: 1, agent: 'mediabuyer', skill: 'optimize' }); await processTick(s.ctx);
  assert.equal(s.repo.T.approvals.filter((a) => a.kind === 'changes').length, 1, 'while Апрув 3 is open, a second one is not made');
});
await test('optimize: the scale advice is given once in 72 hours; no launch means nothing to do; no reader fails clearly; a reader of the states that fails is a note', async () => {
  const snap = opSnap(); const life = [opRow('ad1', 300, 5), opRow('ad2', 300, 5), opRow('ad3', 300, 5)];
  const s = await opSetup({ meta: opMeta((since) => (since === snap.launched_at.slice(0, 10) ? life : [])) });
  await processTick(s.ctx);
  assert.ok(s.repo.T.journal.some((j) => j.action === 'optimize_scale'), 'the advice to scale is remembered');
  advance(24 * 3600e3); await s.repo.enqueueRun({ project_id: 1, agent: 'mediabuyer', skill: 'optimize' }); await processTick(s.ctx);
  const second = s.repo.T.journal.filter((j) => j.action === 'optimize').at(-1);
  assert.ok(!second.meta.actions.some((a) => a.action === 'scale'), 'a day later the same advice is not repeated');
  const n = await opSetup({ launched: false }); await processTick(n.ctx);
  assert.equal(n.repo.T.runs.find((r) => r.skill === 'optimize').status, 'done'); assert.equal(n.repo.T.runs.find((r) => r.skill === 'optimize').output.skipped, true);
  const m = await opSetup({ meta: null }); await processTick(m.ctx);
  assert.equal(m.repo.T.runs.find((r) => r.skill === 'optimize').status, 'failed'); assert.match(m.repo.T.runs.find((r) => r.skill === 'optimize').error, /META_ACCESS_TOKEN/);
  const o = await opSetup({ meta: { ...opMeta((since) => (since === snap.launched_at.slice(0, 10) ? OP_LIFE : [])), objects: async () => { throw new Error('(#200) no access'); } } }); await processTick(o.ctx);
  assert.equal(o.repo.T.runs.find((r) => r.skill === 'optimize').status, 'done'); assert.ok(o.repo.T.steps.some((st) => /Стан груп і оголошень не вдалося прочитати/.test(st.title)));
});
// ---------------------------------------------------------------- A10: the Support agent (drafts and tasks for the manager; the profit after ads by code)
await test('support: the payment calendar: a monthly payment rolls forward, a one-time one stays, a wrong date is nothing', () => {
  const now = new Date('2026-11-23T10:00:00Z');
  assert.deepEqual(nextPayment({ date: '2026-11-25', period: 'щомісяця' }, now), { date: '2026-11-25', daysLeft: 2, monthly: true });
  assert.deepEqual(nextPayment({ date: '2026-08-05', period: 'щомісяця' }, now), { date: '2026-12-05', daysLeft: 12, monthly: true }, 'the months that passed are skipped');
  assert.deepEqual(nextPayment({ date: '2026-11-20', period: 'разово' }, now), { date: '2026-11-20', daysLeft: -3, monthly: false }, 'a one-time payment stays overdue');
  assert.equal(nextPayment({ date: '25.11.2026' }, now), null); assert.equal(nextPayment({}, now), null);
  assert.equal(nextPayment({ date: '2026-01-31', period: 'щомісяця' }, new Date('2026-02-10T00:00:00Z')).date, '2026-03-03', 'the end of a month does not break the roll');
});
await test('support: the drafts are templates in the language of the client and say only what is known; the checklist depends on what is already there', () => {
  const g = draftOf('greet', 'uk', { client: 'Лоза', manager: 'Олена' }); assert.match(g, /Добрий день, Лоза!/); assert.match(g, /ваш менеджер Олена/);
  assert.match(draftOf('greet', 'en', { client: 'Loza', manager: '' }), /^Hello, Loza!/); assert.doesNotMatch(draftOf('greet', 'en', { client: 'Loza', manager: '' }), /your manager is/);
  assert.match(draftOf('pay', 'uk', { client: 'Лоза', amount: '500 USD', date: '2026-11-25', overdue: false }), /2026-11-25 очікується оплата у розмірі 500 USD/);
  assert.match(draftOf('pay', 'uk', { client: '', amount: '', date: '2026-11-20', overdue: true }), /мала надійти 2026-11-20/); assert.doesNotMatch(draftOf('pay', 'uk', { client: '', amount: '', date: 'x', overdue: true }), /у розмірі/);
  const all = onboardingChecklist({ hasAccount: false, website: '' }); assert.equal(all.length, 6); assert.ok(all.every((t) => t.owner === 'manager' && t.type === 'client'));
  assert.equal(onboardingChecklist({ hasAccount: true, website: 'https://x.example' }).length, 4);
});
await test('support: the profit after ads and all costs, per order and in total, counted by code from the cabinet and the costs of the brief', () => {
  const econ = { cogs_pct: 30, fee_pct: 3, returns_pct: 3, shipping_cost: 12 };
  const p = profitability({ spend: 1000, purchases: 20, revenue: 3000 }, econ);
  assert.deepEqual([p.aov, p.cost_per_order, p.contribution_per_order, p.ad_cost_per_order, p.profit_per_order, p.profit_total, p.roas, p.profitable], [150, 66, 84, 50, 34, 680, 3, true]);
  assert.equal(profitability({ spend: 2000, purchases: 20, revenue: 3000 }, econ).profitable, false, 'the ads cost more than the orders earn');
  assert.match(profitability({ spend: 100, purchases: 0, revenue: 0 }, econ).reason, /немає покупок/); assert.match(profitability({ spend: 100, purchases: 5, revenue: 500 }, {}).reason, /немає собівартості/);
  assert.equal(profitability({ spend: 100, purchases: 5, revenue: 500 }, { cogs_pct: 40 }).profit_total, 200, 'fees, returns and shipping default to zero: 5 × 60 − 100');
});
await test('support: the feedback: the answer of the model is read, the numbers that are not in the facts are listed, the text is rendered with the profit', () => {
  const facts = { now: { spend: 1000, orders: 20, cpa: 50, roas: 3 }, profit: { profit_total: 680 } };
  const ok = checkFeedback({ explanation: 'За тиждень витрачено 1000, покупок 20, прибуток 680.', highlights: ['Ціна покупки 50'], next_steps: ['Лишаємо як є'], draft: 'Добрий день! Результат: 20 покупок.' }, facts);
  assert.deepEqual(ok.stray, []);
  const bad = checkFeedback({ explanation: 'Продажі зросли на 340%, а ROAS 9.', highlights: [], next_steps: [], draft: 'Привіт, 340% росту!' }, facts);
  assert.deepEqual(bad.stray.sort(), ['340']); // 9 is a single digit and not checked, like everywhere else
  const text = renderFeedbackText({ period: 'тиждень', facts: { now: { spend: 1000, orders: 20, cpa: 50, roas: 3 } }, profit: profitability({ spend: 1000, purchases: 20, revenue: 3000 }, { cogs_pct: 30, fee_pct: 3, returns_pct: 3, shipping_cost: 12 }), fb: { ...bad } });
  assert.match(text, /Прибуток після реклами й усіх витрат: 680 \(34 на замовлення; внесок до реклами 84, реклама 50 на замовлення\)\. Реклама прибуткова\./); assert.match(text, /Увага: у тексті є числа, яких немає в даних \(340\)/);
  assert.throws(() => parseFeedbackAnswer('Вибачте'), /не у форматі JSON/); assert.throws(() => parseFeedbackAnswer('{"explanation":"","draft":""}'), /немає пояснення або чернетки/);
  const w = periodsOf('week', new Date('2026-11-23T10:00:00Z')); assert.deepEqual([w.cur.since, w.cur.until, w.prev.since, w.prev.until], ['2026-11-16', '2026-11-22', '2026-11-09', '2026-11-15']);
  const m = periodsOf('month', new Date('2026-12-01T00:30:00Z')); assert.deepEqual([m.cur.since, m.cur.until, m.prev.since, m.prev.until, m.label], ['2026-11-01', '2026-11-30', '2026-10-01', '2026-10-31', 'місяць 2026-11']);
});
await test('support: onboarding makes the checklist and the greeting draft as tasks for the manager, once', async () => {
  const s = await setup({ handlers: createHandlers({ support: { onboarding } }) });
  s.repo.setProjectInfo(1, { client: 'Меблі Лоза', manager: 'Олена', client_language: 'uk' });
  await s.repo.enqueueRun({ project_id: 1, agent: 'support', skill: 'onboarding' }); await processTick(s.ctx);
  assert.equal(s.repo.T.runs[0].status, 'done', s.repo.T.runs[0].error);
  const tasks = s.repo.T.tasks; assert.equal(tasks.length, 7); assert.ok(tasks.every((t) => t.owner === 'manager'));
  const greet = tasks.find((t) => /вітання/.test(t.title)); assert.match(greet.evidence, /Добрий день, Меблі Лоза!/); assert.match(greet.evidence, /ваш менеджер Олена/);
  assert.ok(tasks.some((t) => /Отримати доступ до рекламного кабінету/.test(t.title)) && tasks.some((t) => /Вказати сайт клієнта/.test(t.title)));
  advance(1000); await s.repo.enqueueRun({ project_id: 1, agent: 'support', skill: 'onboarding' }); await processTick(s.ctx);
  assert.equal(s.repo.T.tasks.length, 7, 'the same open task is not made twice');
});
await test('support: the payment reminder: nothing without a date, nothing while it is far, a draft and a task when it is near or overdue, the monthly payment rolls', async () => {
  const mk = async (general) => { const s = await setup({ handlers: createHandlers({ support: { payment_reminder: paymentReminder } }) }); s.repo.setProjectInfo(1, { client: 'Лоза', client_language: 'uk' }); await s.repo.writeSectionVersion(1, 'brief', { author_kind: 'human', author: 'm@x', body: '', content: { general, economics: {} } }); await s.repo.enqueueRun({ project_id: 1, agent: 'support', skill: 'payment_reminder' }); return s; };
  const day = (n) => new Date(clock.t.getTime() + n * 864e5).toISOString().slice(0, 10);
  const none = await mk({}); await processTick(none.ctx); assert.equal(none.repo.T.tasks.length, 0); assert.equal(none.repo.T.runs[0].output.skipped, true);
  const far = await mk({ payment_next_date: day(20), payment_amount: '500 USD' }); await processTick(far.ctx); assert.equal(far.repo.T.tasks.length, 0); assert.equal(far.repo.T.runs[0].output.days_left, 20);
  const near = await mk({ payment_next_date: day(2), payment_amount: '500 USD', payment_period: 'разово' }); await processTick(near.ctx);
  assert.equal(near.repo.T.tasks.length, 1); assert.match(near.repo.T.tasks[0].title, /Нагадати клієнту про оплату 500 USD до/); assert.equal(near.repo.T.tasks[0].priority, 'medium'); assert.match(near.repo.T.tasks[0].evidence, /очікується оплата у розмірі 500 USD/);
  const late = await mk({ payment_next_date: day(-3), payment_amount: '500 USD', payment_period: 'разово' }); await processTick(late.ctx);
  assert.match(late.repo.T.tasks[0].title, /Оплата прострочена/); assert.equal(late.repo.T.tasks[0].priority, 'high'); assert.match(late.repo.T.tasks[0].evidence, /мала надійти/);
  advance(1000); await late.repo.enqueueRun({ project_id: 1, agent: 'support', skill: 'payment_reminder' }); await processTick(late.ctx); assert.equal(late.repo.T.tasks.length, 1, 'one task for one overdue payment, not one a day');
  const rolled = await mk({ payment_next_date: day(-60), payment_period: 'щомісяця' }); await processTick(rolled.ctx); assert.ok(rolled.repo.T.runs[0].output.days_left > -1, 'a monthly payment is never overdue: it rolls to the next date');
});
const spMeta = () => ({ insights: async ({ timeRange }) => ({ rows: timeRange.since === periodsOf('week', LA_NOW()).cur.since ? [{ ad_id: 'ad1', name: 'Креатив 1', spend: 600, purchases: 15, revenue: 2250, impressions: 20000, clicks: 400, reach: 8000 }, { ad_id: 'ad3', name: 'Креатив 3', spend: 400, purchases: 0, revenue: 0, impressions: 12000, clicks: 100, reach: 6000 }] : [{ ad_id: 'ad1', name: 'Креатив 1', spend: 700, purchases: 10, revenue: 1500, impressions: 22000, clicks: 300, reach: 9000 }] }) });
await test('support: the weekly feedback reads the cabinet, counts the profit, and leaves a draft for the manager with the figures checked; no launch or no model is told clearly', async () => {
  const snap = { status: 'done', targets: { breakeven_cpa: 100, target_cpa: 70, breakeven_roas: 1.75, target_roas: 2.5 }, account: { currency: 'USD' } };
  const mk = async ({ launched = true, ask } = {}) => {
    const s = await setup({ handlers: createHandlers({ support: { weekly_report: weeklyReport } }) });
    s.repo.addAccount(1, LA_ACC); s.repo.setProjectInfo(1, { client: 'Лоза', client_language: 'uk' }); s.ctx.meta = spMeta(); s.asked = [];
    if (launched) await s.repo.writeSectionVersion(1, 'launch', { author_kind: 'agent', author: 'mediabuyer', body: 'l', content: snap });
    await s.repo.writeSectionVersion(1, 'brief', { author_kind: 'human', author: 'm@x', body: '', content: { general: {}, economics: { cogs_pct: 30, fee_pct: 3, returns_pct: 3, shipping_cost: 12 } } });
    await s.repo.journal(1, { actor_kind: 'agent', actor: 'mediabuyer', action: 'optimize', summary: 'x', meta: { actions: [{ name: 'Креатив 3', reason: 'Витрачено 400 без жодної покупки.' }] } });
    if (ask !== null) s.ctx.ask = ask || (async (o) => { s.asked.push(o); return { costUsd: 0.05, text: JSON.stringify({ explanation: 'За тиждень витрачено 1000, покупок 15, ціна покупки 66.67.', highlights: ['Креатив 1 працює'], next_steps: ['Вимкнути Креатив 3'], draft: 'Добрий день! За тиждень 15 покупок, зростання на 500%.' }) }; });
    await s.repo.enqueueRun({ project_id: 1, agent: 'support', skill: 'weekly_report' }); return s;
  };
  const s = await mk(); await processTick(s.ctx);
  const run = s.repo.T.runs[0]; assert.equal(run.status, 'done', run.error);
  const facts = JSON.parse(s.asked[0].user.slice(s.asked[0].user.indexOf('{'), s.asked[0].user.lastIndexOf('}') + 1));
  assert.equal(facts.now.spend, 1000); assert.equal(facts.now.orders, 15); assert.equal(facts.before.orders, 10); assert.equal(facts.change_pct.orders, 50); assert.equal(facts.best_ads[0].name, 'Креатив 1'); assert.equal(facts.worst_ads[0].name, 'Креатив 3'); assert.deepEqual(facts.optimizer_advice, ['Креатив 3: Витрачено 400 без жодної покупки.']);
  assert.equal(facts.profit.profit_total, 260, 'profit comes from the code: 15 orders × 84 − 1000'); assert.equal(facts.profit.profitable, true);
  const t = s.repo.T.tasks.find((x) => /Фідбек за тиждень/.test(x.title)); assert.equal(t.owner, 'manager'); assert.match(t.evidence, /Прибуток після реклами й усіх витрат: 260/); assert.match(t.evidence, /Увага: у тексті є числа, яких немає в даних \(500\)/); assert.match(t.evidence, /Чернетка листа клієнту/);
  assert.equal(run.cost_usd, 0.05); assert.equal(run.output.stray, 1);
  const n = await mk({ launched: false, ask: null }); await processTick(n.ctx); assert.equal(n.repo.T.runs[0].status, 'done'); assert.equal(n.repo.T.runs[0].output.skipped, true);
  const m = await mk({ ask: null }); await processTick(m.ctx); assert.equal(m.repo.T.runs[0].status, 'failed'); assert.match(m.repo.T.runs[0].error, /ANTHROPIC_API_KEY/);
});
await test('machine: after the launch the weekly feedback is made every 7 days and the payment calendar is looked at every day', () => {
  const base = { now: new Date('2026-11-23T10:00:00Z'), state: { stage: 4, paused: false }, sections: {} };
  const enq = (a) => a.filter((x) => x.type === 'enqueue').map((x) => `${x.agent}/${x.skill}`);
  const run = (skill, h) => ({ id: 1, agent: 'support', skill, status: 'done', input: {}, finished_at: new Date(base.now.getTime() - h * 3600e3).toISOString() });
  const launched = { id: 9, agent: 'mediabuyer', skill: 'launch', status: 'done', input: {}, created_at: base.now.toISOString(), finished_at: base.now.toISOString() }; // this month is covered by the strategy: no monthly planning in this test
  assert.deepEqual(enq(planNext({ ...base, runs: [launched] })).filter((x) => x.startsWith('support')), ['support/weekly_report', 'support/payment_reminder']);
  assert.deepEqual(enq(planNext({ ...base, runs: [launched, run('weekly_report', 24 * 3), run('payment_reminder', 3)] })).filter((x) => x.startsWith('support')), [], 'not yet due');
  assert.deepEqual(enq(planNext({ ...base, runs: [launched, run('weekly_report', 24 * 8), run('payment_reminder', 25)] })).filter((x) => x.startsWith('support')), ['support/weekly_report', 'support/payment_reminder']);
});
await test('brief: the payment calendar is part of the brief sheet', () => {
  const f = formFromContent({ general: { payment_amount: '500 USD', payment_next_date: '2026-12-01', payment_period: 'щомісяця' } });
  assert.deepEqual([f.values.payment_amount, f.values.payment_next_date, f.values.payment_period], ['500 USD', '2026-12-01', 'щомісяця']); assert.equal(contentFromForm(f).general.payment_period, 'щомісяця');
});
// ---------------------------------------------------------------- the pool of tasks page («Мій день» with the block of blockers)
const TK = (id, o = {}) => ({ id, project_id: 1, type: 'client', title: 'Задача ' + id, evidence: '', priority: 'medium', owner: 'manager', status: 'proposed', created_by_kind: 'agent', created_by: 'support/onboarding', due_date: null, created_at: '2026-11-20T09:00:00Z', ...o });
const TODAY = new Date('2026-11-23T10:00:00Z');
await test('tasks page: the evidence is a note, a draft, or a note with a draft; the source of a task is named; what the check before the launch and the strategy made blocks the launch', () => {
  assert.deepEqual(parseEvidence('Умов повернення на сторінках немає.'), { note: 'Умов повернення на сторінках немає.', draft: '' });
  assert.deepEqual(parseEvidence('Чернетка:\nДобрий день!\n\nДякуємо!'), { note: '', draft: 'Добрий день!\n\nДякуємо!' });
  assert.deepEqual(parseEvidence('Цифри: 100.\n\nПрибуток 5.\n\nЧернетка листа клієнту\nДобрий день! 15 покупок.'), { note: 'Цифри: 100.\n\nПрибуток 5.', draft: 'Добрий день! 15 покупок.' });
  assert.deepEqual(parseEvidence(null), { note: '', draft: '' });
  assert.equal(sourceLabel(TK(1, { created_by: 'mediabuyer/launch' })), 'Перевірка перед запуском'); assert.equal(sourceLabel(TK(1, { created_by: 'creator/first_creatives' })), 'Креативи (готові)');
  assert.equal(sourceLabel(TK(1, { created_by_kind: 'human', created_by: 'm@x' })), 'Додано вручну'); assert.equal(sourceLabel(TK(1, { created_by: 'x/y' })), 'x/y');
  assert.equal(isBlocker(TK(1, { created_by: 'mediabuyer/launch' })), true); assert.equal(isBlocker(TK(1, { created_by: 'strategist/strategy' })), true);
  assert.equal(isBlocker(TK(1, { created_by: 'mediabuyer/optimize' })), false, 'the advice of the optimiser does not stop a launch that already happened');
  assert.equal(isBlocker(TK(1, { created_by: 'mediabuyer/launch', status: 'done' })), false); assert.equal(isBlocker(TK(1, { created_by: 'mediabuyer/launch', created_by_kind: 'human' })), false);
});
await test('tasks page: the due date is overdue, today or soon; the feed is grouped the way a manager works and sorted by urgency; the digest says what to do and whom we wait for', () => {
  assert.deepEqual(['2026-11-20', '2026-11-23', '2026-11-25', '2026-11-30', null].map((d) => dueState(TK(1, { due_date: d }), TODAY)), ['overdue', 'today', 'soon', null, null]);
  assert.equal(dueState(TK(1, { due_date: '2026-11-20', status: 'done' }), TODAY), null, 'a closed task has no deadline');
  const tasks = [
    TK(1, { priority: 'high', title: 'Вказати ID сторінки' }), TK(2, { priority: 'low', due_date: '2026-11-23', title: 'Дрібниця сьогодні' }), TK(3, { priority: 'medium', title: 'Просто зробити' }),
    TK(4, { owner: 'client', priority: 'high', title: 'Піксель' }), TK(5, { owner: 'client_dev', title: 'Сторінка повернення' }), TK(6, { status: 'done' }), TK(7, { status: 'rejected' }),
  ];
  const g = groupTasks(tasks, TODAY);
  assert.deepEqual(g.map((x) => [x.key, x.items.map((t) => t.id)]), [['hot', [1, 2]], ['week', [3]], ['waiting', [4, 5]], ['done', [7, 6]]]);
  assert.equal(digest(tasks, TODAY), 'Сьогодні варто: Вказати ID сторінки; Дрібниця сьогодні. Чекаємо: клієнта 1, розробника клієнта 1.');
  assert.equal(digest([TK(1, { priority: 'low' })], TODAY), 'Сьогодні нічого не горить.');
  assert.equal(digest([TK(1, { title: 'a', priority: 'high' }), TK(2, { title: 'b', priority: 'high' }), TK(3, { title: 'c', priority: 'high' }), TK(4, { title: 'd', priority: 'high' })], TODAY), 'Сьогодні варто: a; b; c (ще 1).');
  assert.deepEqual(groupTasks([], TODAY), []);
});
await test('tasks page: the filters and their counts: mine, blockers, drafts', () => {
  const tasks = [TK(1, { created_by: 'mediabuyer/launch', owner: 'client' }), TK(2), TK(3, { evidence: 'Чернетка:\nТекст' }), TK(4, { evidence: 'Чернетка:\nТекст', status: 'done' }), TK(5, { owner: 'client' })];
  assert.deepEqual(filterCounts(tasks), { all: 5, mine: 2, blockers: 1, drafts: 1 });
  assert.deepEqual(filterTasks(tasks, 'blockers').map((t) => t.id), [1]); assert.deepEqual(filterTasks(tasks, 'drafts').map((t) => t.id), [3]); assert.deepEqual(filterTasks(tasks, 'mine').map((t) => t.id), [2, 3]);
  assert.equal(hasDraft(TK(1, { evidence: 'Чернетка:\nx' })), true); assert.equal(hasDraft(TK(1, { evidence: 'x' })), false);
});
await test('tasks (backend): a task remembers the skill that made it and its due date; the check before the launch and the strategy mark what blocks the launch; the drafts are marked', async () => {
  const b = await laSetup({ pixels: [] }); await processTick(b.ctx);
  const t = b.repo.T.tasks.find((x) => x.type === 'tracking'); assert.equal(t.created_by, 'mediabuyer/launch'); assert.equal(isBlocker({ ...t, created_by_kind: 'agent' }), true);
  const handlers = createHandlers({ support: { payment_reminder: paymentReminder, onboarding } });
  const s = await setup({ handlers }); s.repo.setProjectInfo(1, { client: 'Лоза' });
  const due = new Date(clock.t.getTime() + 2 * 864e5).toISOString().slice(0, 10);
  await s.repo.writeSectionVersion(1, 'brief', { author_kind: 'human', author: 'm@x', body: '', content: { general: { payment_next_date: due, payment_amount: '500 USD', payment_period: 'разово' }, economics: {} } });
  await s.repo.enqueueRun({ project_id: 1, agent: 'support', skill: 'payment_reminder' }); await s.repo.enqueueRun({ project_id: 1, agent: 'support', skill: 'onboarding' }); await processTick(s.ctx);
  const pay = s.repo.T.tasks.find((x) => /оплату/.test(x.title)); assert.equal(pay.due_date, due); assert.equal(pay.created_by, 'support/payment_reminder'); assert.ok(pay.evidence.startsWith('Чернетка:\n')); assert.match(parseEvidence(pay.evidence).draft, /^Добрий день, Лоза!/);
  assert.equal(parseEvidence(s.repo.T.tasks.find((x) => /вітання/.test(x.title)).evidence).draft.startsWith('Добрий день, Лоза!'), true);
});
// ---------------------------------------------------------------- found by the end-to-end run: a skill that cannot succeed must not be started again for ever
await test('machine: a skill that failed three times in a row since its last success is not started again; the journal says so once; a success or a manual run starts the count again', () => {
  const base = { now: new Date('2026-11-23T10:00:00Z'), state: { stage: 2, paused: false }, sections: {} };
  const run = (id, agent, skill, status) => ({ id, agent, skill, status, input: {} });
  const enq = (a) => a.filter((x) => x.type === 'enqueue').map((x) => `${x.agent}/${x.skill}`);
  const done = run(1, 'creator', 'first_creatives', 'done');
  const f = (id) => run(id, 'strategist', 'strategy', 'failed');
  assert.deepEqual(enq(planNext({ ...base, runs: [done, f(2), f(3)] })), ['strategist/strategy'], 'two failures: one more try');
  const stopped = planNext({ ...base, runs: [done, f(2), f(3), f(4)] });
  assert.deepEqual(enq(stopped), []); assert.ok(stopped.some((a) => a.action === 'skill_stopped' && a.once && a.meta.skill === 'strategist/strategy' && /3 рази поспіль/.test(a.summary)));
  assert.equal(recentFailures([f(2), run(3, 'strategist', 'strategy', 'done'), f(4)], 'strategist', 'strategy'), 1, 'a success in between starts the count again');
  assert.deepEqual(enq(planNext({ ...base, runs: [done, f(2), f(3), f(4), run(5, 'strategist', 'strategy', 'queued')] })), [], 'nothing new while a run is open');
  assert.equal(MAX_FAILURES, 3);
});
// ---------------------------------------------------------------- found by the end-to-end run (scripts/check-e2e.mjs)
await test('e2e finding: the audit keeps all four thresholds, so the automatic check accepts an audit made by the real skill (it used to keep two and the research of every client with a history stalled for ever)', () => {
  const th = { breakeven_roas: 1.75, target_roas: 2.5, breakeven_cpa: 100, target_cpa: 70 };
  const a = computeAudit(AUDIT_DATA, th);
  assert.deepEqual(a.thresholds, th);
  const r = compareNumbers({ brief: V({ economics: LELIOR }), unit_economy: UE_OF(LELIOR), audit: V({ ...a, currency: 'USD' }) });
  assert.deepEqual(r.problems, [], 'what the audit skill really writes agrees with the Unit Economy');
  assert.equal(computeAudit(AUDIT_DATA, null).thresholds, null);
});
await test('e2e finding: the card «Зараз» does not call a waiting run «працює» and does not say «усе виконано» when the process is stopped by the check or by a skill that failed three times', () => {
  const state = { stage: 1, paused: false };
  const wait = nowCard({ state, runs: [{ id: 3, agent: 'researcher', skill: 'competitors', status: 'waiting', error: 'У брифі не вказано сайти конкурентів.' }] });
  assert.equal(wait.tone, 'warn'); assert.match(wait.title, /Чекає: Дослідник/); assert.equal(wait.text, 'У брифі не вказано сайти конкурентів.'); assert.equal(wait.action, 'tasks');
  const working = nowCard({ state, runs: [{ id: 3, agent: 'researcher', skill: 'competitors', status: 'waiting' }, { id: 4, agent: 'researcher', skill: 'site', status: 'running' }] });
  assert.equal(working.tone, 'info', 'while something works, the card says what works');
  const stopped = nowCard({ state, runs: [{ id: 5, agent: 'researcher', skill: 'site', status: 'done' }], journal: [{ id: 9, action: 'check_failed', summary: 'Автоматична перевірка знайшла проблеми: бюджет.' }, { id: 4, action: 'stage', summary: 'Старт' }] });
  assert.equal(stopped.tone, 'bad'); assert.equal(stopped.title, 'Процес зупинено'); assert.match(stopped.text, /бюджет/);
  const moved = nowCard({ state, runs: [{ id: 5, agent: 'researcher', skill: 'site', status: 'done' }], journal: [{ id: 11, action: 'stage', summary: 'Дослідження завершено' }, { id: 9, action: 'check_failed', summary: 'x' }] });
  assert.equal(moved.tone, 'ok', 'a stop that was followed by a stage change is old news');
});
// ---------------------------------------------------------------- A11: the overview of all projects, the global stop and the limits
await test('stop: while the global stop is on, a pass plans nothing, takes nothing and writes nothing; when it is off the work goes on', async () => {
  const { repo, ctx } = await setup();
  await human(repo, 'brief');
  repo.T.settings.stopped = true;
  const r = await processTick(ctx);
  assert.equal(r.stopped, true);
  assert.deepEqual([r.enqueued, r.claimed, r.done], [0, 0, 0]);
  assert.equal(repo.T.runs.length, 0); assert.equal(repo.T.journal.length, 0);
  repo.T.settings.stopped = false;
  const r2 = await processTick(ctx);
  assert.ok(!r2.stopped && r2.enqueued > 0, 'after the stop is lifted the agents work again');
});
await test('limits: the default limit of the system works for a project without its own; the stopped run says why and wakes when the limit is raised', async () => {
  const { repo, ctx } = await setup();
  await human(repo, 'brief');
  repo.T.settings.project_cap_default_usd = 1;
  await repo.enqueueRun({ project_id: 1, agent: 'researcher', skill: 'intake' });
  repo.T.runs[0].cost_usd = 5;
  await processTick(ctx);
  const stopped = repo.T.runs.find((x) => x.status === 'waiting');
  assert.ok(stopped && /ліміт витрат проєкту/.test(stopped.error) && stopped.state.blocked_on === 'cost_cap', 'stopped by the default limit');
  assert.equal(repo.T.runs[0].cost_usd, 5, 'a run that waits keeps what it already spent');
  await processTick(ctx);
  assert.ok(repo.T.runs.some((x) => x.status === 'waiting' && x.state?.blocked_on === 'cost_cap'), 'nothing changed: still waiting');
  assert.equal(repo.T.journal.filter((j) => j.action === 'cost_cap').length, 1, 'the journal says it once');
  repo.T.settings.project_cap_default_usd = 100;
  await processTick(ctx);
  assert.ok(!repo.T.runs.some((x) => x.status === 'waiting' && /ліміт/.test(x.error || '')), 'the limit was raised: the run goes on');
  state(repo).cost_cap_usd = 2; repo.T.settings.project_cap_default_usd = 100; // an own limit beats the default
  await repo.enqueueRun({ project_id: 1, agent: 'researcher', skill: 'site' });
  await processTick(ctx);
  assert.ok(repo.T.runs.some((x) => x.skill === 'site' && x.status === 'waiting' && /\$2\.00/.test(x.error || '')), 'the own limit of the project counts');
});
await test('limits: the general limit of the month stops every project and says it is the general one', async () => {
  const { repo, ctx } = await setup();
  await human(repo, 'brief');
  repo.T.settings.monthly_cap_usd = 2; repo.T.settings.project_cap_default_usd = 100;
  await repo.enqueueRun({ project_id: 1, agent: 'researcher', skill: 'intake' });
  repo.T.runs[0].cost_usd = 3;
  await repo.enqueueRun({ project_id: 1, agent: 'researcher', skill: 'site' });
  await processTick(ctx);
  assert.ok(repo.T.runs.filter((x) => x.status === 'waiting').every((x) => /загальний ліміт/.test(x.error)) && repo.T.runs.some((x) => x.status === 'waiting'));
});
await test('limits: reached() looks at the own limit first, then at the general one; no limit means no stop', () => {
  const s = { project_cap_default_usd: 10, monthly_cap_usd: 60 };
  assert.equal(reached({ state: {}, settings: s, projectSpent: 9.99, totalSpent: 10 }), null);
  assert.equal(reached({ state: {}, settings: s, projectSpent: 10, totalSpent: 10 }), 'project');
  assert.equal(reached({ state: { cost_cap_usd: 3 }, settings: s, projectSpent: 3, totalSpent: 3 }), 'project');
  assert.equal(reached({ state: { cost_cap_usd: 30 }, settings: s, projectSpent: 12, totalSpent: 60 }), 'total');
  assert.equal(reached({ state: {}, settings: {}, projectSpent: 1e6, totalSpent: 1e6 }), null);
});
const OV_NOW = new Date('2026-11-23T10:00:00Z');
const ovData = () => ({
  now: OV_NOW,
  projects: { 1: { name: 'Меблі Лоза' }, 2: { name: 'TM BYME' }, 3: { name: 'Mellowdiamond' }, 4: { name: 'OystersXO' }, 5: { name: 'Дім Світла' }, 6: { name: 'Лаванда' }, 7: { name: 'Fresh Nails' } },
  states: [
    { project_id: 1, stage: 2, paused: false, updated_at: '2026-11-21T10:00:00Z' },
    { project_id: 2, stage: 3, paused: false, updated_at: '2026-11-20T10:00:00Z' },
    { project_id: 3, stage: 1, paused: false, updated_at: '2026-11-18T10:00:00Z' },
    { project_id: 4, stage: 4, paused: false, updated_at: '2026-11-10T10:00:00Z' },
    { project_id: 5, stage: 4, paused: true, paused_reason: 'Клієнт у відпустці', updated_at: '2026-11-17T10:00:00Z' },
    { project_id: 6, stage: 4, paused: false, cost_cap_usd: 3, updated_at: '2026-11-22T10:00:00Z' },
    { project_id: 7, stage: 0, paused: false, paid_at: null, updated_at: '2026-11-22T10:00:00Z' },
  ],
  approvals: [{ id: 1, project_id: 1, kind: 'strategy', status: 'pending', requested_at: '2026-11-21T10:00:00Z' }],
  runs: [
    { id: 1, project_id: 3, agent: 'researcher', skill: 'competitors', status: 'waiting', error: 'У брифі не вказано сайти конкурентів.', state: { blocked_at: '2026-11-18T10:00:00Z' }, cost_usd: 0.5, created_at: '2026-11-18T09:00:00Z' },
    { id: 2, project_id: 4, agent: 'mediabuyer', skill: 'optimize', status: 'running', cost_usd: 1.2, created_at: '2026-11-22T09:00:00Z' },
    { id: 3, project_id: 4, agent: 'mediabuyer', skill: 'optimize', status: 'done', cost_usd: 9, created_at: '2026-10-30T09:00:00Z', finished_at: '2026-10-30T09:05:00Z' },
    { id: 4, project_id: 6, agent: 'mediabuyer', skill: 'optimize', status: 'waiting', error: 'Досягнуто ліміт витрат проєкту ($3.00).', state: { blocked_at: '2026-11-22T10:00:00Z', blocked_on: 'cost_cap' }, cost_usd: 3, created_at: '2026-11-22T09:00:00Z' },
  ],
  tasks: [{ id: 1, project_id: 3, owner: 'client', status: 'proposed' }, { id: 2, project_id: 3, owner: 'client', status: 'done' }],
  journal: [{ id: 5, project_id: 2, at: '2026-11-20T10:00:00Z', action: 'skill_stopped', summary: 'Стратегія не вдалася 3 рази поспіль.' }],
  briefs: [1, 2, 3, 4, 5, 6, 7],
  settings: { stopped: false, monthly_cap_usd: 60, project_cap_default_usd: 10 },
});
await test('overview: every project is one of five kinds (error, your action, waiting, pause, works), with who waits and how many days', () => {
  const ov = buildOverview(ovData());
  const by = (id) => ov.rows.find((r) => r.id === id);
  assert.deepEqual(ov.rows.map((r) => r.kind), ['failed', 'action', 'action', 'action', 'wait', 'paused', 'ok'], 'errors first, then what needs you, then waiting, pause, works');
  assert.equal(by(2).kind, 'failed'); assert.equal(by(2).what, 'Процес зупинено'); assert.equal(by(2).age, 3);
  assert.deepEqual([by(1).kind, by(1).who, by(1).age, by(1).actLabel], ['action', 'Менеджер', 2, 'Відкрити апрув']);
  assert.equal(ov.rows[1].id, 1, 'the oldest request of the manager is first');
  assert.deepEqual([by(3).kind, by(3).who, by(3).age], ['wait', 'Клієнт', 5], 'the run waits for a task of the client');
  assert.equal(by(4).kind, 'ok'); assert.equal(by(5).kind, 'paused'); assert.equal(by(5).age, 6);
  assert.deepEqual([by(6).kind, by(6).who], ['action', 'Менеджер'], 'a run stopped by a limit waits for the manager to raise it');
  assert.deepEqual([by(6).what, by(3).what], ['Ліміт витрат вичерпано', 'Чекаємо дані від клієнта'], 'the two most common waits are said plainly');
  assert.equal(by(7).kind, 'action'); assert.equal(by(7).act, 'brief'); assert.match(by(7).last, /оплату/);
  assert.deepEqual(ov.counts, { all: 7, action: 3, failed: 1, wait: 1, paused: 1, ok: 1, needYou: 4 });
});
await test('overview: the waiting run goes to the manager when the manager holds an open task, and only closed tasks of the client do not count', () => {
  const d = ovData();
  d.tasks = [{ id: 1, project_id: 3, owner: 'client', status: 'proposed' }, { id: 3, project_id: 3, owner: 'manager', status: 'proposed' }];
  assert.equal(buildOverview(d).rows.find((r) => r.id === 3).kind, 'action');
  d.tasks = [{ id: 2, project_id: 3, owner: 'client', status: 'done' }];
  const r = buildOverview(d).rows.find((x) => x.id === 3);
  assert.deepEqual([r.kind, r.who], ['action', 'Менеджер'], 'nobody else can fix it');
});
await test('overview: the spend is this month only; the limit is the own one or the default; the bar warns from 80%', () => {
  const ov = buildOverview(ovData());
  const by = (id) => ov.rows.find((r) => r.id === id);
  assert.equal(by(4).cost, 1.2, 'the 9 dollars of October are not counted');
  assert.equal(ov.spent.toFixed(2), '4.70'); assert.equal(ov.cap, 60);
  assert.deepEqual([by(6).cap, by(6).ownCap, by(4).cap, by(4).ownCap], [3, 3, 10, null]);
  assert.deepEqual(usage(4.7, 60), { pct: 8, hot: false, over: false });
  assert.deepEqual(usage(48, 60), { pct: 80, hot: true, over: false });
  assert.deepEqual(usage(61, 60), { pct: 100, hot: true, over: true });
  assert.deepEqual(usage(5, null), { pct: 0, hot: false, over: false });
});
await test('overview: filters, an empty list and a project that was never started', () => {
  const ov = buildOverview(ovData());
  assert.equal(filterRows(ov.rows, 'all').length, 7); assert.deepEqual(filterRows(ov.rows, 'wait').map((r) => r.id), [3]); assert.equal(filterRows(ov.rows, 'paused').length, 1);
  const none = buildOverview({ now: OV_NOW, projects: { 1: { name: 'x' } } });
  assert.deepEqual([none.rows.length, none.counts.all, none.spent], [0, 0, 0]);
  assert.equal(buildOverview({ ...ovData(), states: [{ project_id: 99, stage: 1, paused: false }] }).rows[0].name, 'Проєкт 99');
});
await test('overview: the digest says what to do, whom we wait for, the spend, and warns when everything is stopped', () => {
  const ov = buildOverview(ovData());
  const t = digestText(ov);
  assert.match(t, /^Доброго ранку! Сьогодні вам потрібно:/);
  assert.match(t, /• Меблі Лоза: Чекає на вас: Апрув 1 \(2 дні\)/);
  assert.match(t, /• TM BYME: зупинено, Процес зупинено \(3 дні\)/);
  assert.match(t, /Чекаємо на клієнтів: Mellowdiamond \(5 дн\.\)\./);
  assert.match(t, /На паузі: Дім Світла\./);
  assert.match(t, /\$4\.70 з \$60\.00\. Помилок: 1\./);
  assert.ok(!/Увага: усі агенти зупинено/.test(t));
  const stopped = digestText(buildOverview({ ...ovData(), settings: { stopped: true, monthly_cap_usd: 60, project_cap_default_usd: 10 } }));
  assert.match(stopped, /Увага: усі агенти зупинено\./);
  const quiet = digestText(buildOverview({ ...ovData(), states: [ovData().states[3]], runs: [], approvals: [], journal: [], tasks: [] }));
  assert.match(quiet, /Від вас сьогодні нічого не потрібно\./); assert.match(quiet, /Помилок немає\./);
});
await test('guard: the columns of the settings that the code reads and writes exist in the migration of the settings table; the real storage and its twin offer the same methods', async () => {
  const sql = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '../supabase/migrations/20261071000000_workflow_settings.sql'), 'utf8');
  for (const col of ['stopped', 'stopped_reason', 'stopped_by', 'stopped_at', 'monthly_cap_usd', 'project_cap_default_usd', 'updated_at']) assert.ok(new RegExp(`\\b${col}\\b`).test(sql), `wf_settings.${col} is in the migration`);
  assert.match(sql, /check \(id = 1\)/, 'one row only');
  const { createWfRepo } = await import('../api/_lib/wf/repo.js');
  const real = Object.keys(createWfRepo({})).sort();
  const twin = Object.keys(createMemoryWfRepo({ now })).sort();
  assert.deepEqual(real.filter((k) => !twin.includes(k)), [], 'every method of the real storage exists in the twin, so the tests exercise what production runs');
});
// ---------------------------------------------------------------- A11: notices and the digest in Telegram
await test('notices: the text says who, what and where to go; names are escaped; the digest is a quiet message with a button', () => {
  const a = noticeOf({ kind: 'approval', project: 'Меблі <Лоза>', approvalKind: 'strategy' });
  assert.match(a.text, /^🟣 <b>Меблі &lt;Лоза&gt;<\/b>: чекає на вас Апрув 1\./); assert.equal(a.path, '/projects/approvals');
  const s = noticeOf({ kind: 'stopped', project: 'TM BYME', summary: 'Стратегія не вдалася 3 рази поспіль.' });
  assert.match(s.text, /^🔴 <b>TM BYME<\/b>: процес зупинено\.\nСтратегія/); assert.equal(s.path, '/projects/overview');
  assert.match(noticeOf({ kind: 'cost_cap', project: 'X', summary: 'ліміт проєкту $100.00 на місяць' }).text, /^🟠 <b>X<\/b>: досягнуто ліміт витрат агентів \(ліміт проєкту \$100\.00 на місяць\)/);
  const m = digestMessage({ chatId: '-100', threadId: 8 }, 'Доброго ранку <все>');
  assert.deepEqual([m.chatId, m.threadId, m.silent, m.url], ['-100', 8, true, 'https://crm.monarchi.agency/projects/overview']); assert.equal(m.text, 'Доброго ранку &lt;все&gt;');
});
await test('notices: the orchestrator tells the manager once about a new approval, a stopped process and a reached limit; nothing without a chat; a failed send never breaks the work', async () => {
  const sent = [];
  const mk = async (target = { chatId: '-1', threadId: 8 }, fail = false) => {
    const { repo, ctx } = await setup();
    repo.T.notifyTarget = target; repo.setProjectInfo(1, { name: 'Проєкт А', client: 'Клієнт А' });
    ctx.notify = createNotifier({ repo, send: async (m) => { sent.push(m); if (fail) throw new Error('network'); return { ok: true }; } });
    return { repo, ctx };
  };
  // 1) a handler asks for a decision
  let { repo, ctx } = await mk();
  await repo.enqueueRun({ project_id: 1, agent: 'strategist', skill: 'strategy' });
  ctx.handlers = { strategist: { strategy: async () => ({ approvals: [{ kind: 'strategy', subject: { x: 1 } }] }) } };
  await processTick(ctx);
  assert.equal(sent.filter((m) => /чекає на вас Апрув 1/.test(m.text)).length, 1, 'one notice for one approval');
  assert.deepEqual([sent[0].chatId, sent[0].threadId], ['-1', 8]); assert.match(sent[0].text, /Клієнт А/);
  await processTick(ctx);
  assert.equal(sent.filter((m) => /Апрув 1/.test(m.text)).length, 1, 'the next pass does not repeat it');
  // 2) a limit is reached
  sent.length = 0;
  ({ repo, ctx } = await mk());
  repo.T.settings.project_cap_default_usd = 1;
  await repo.enqueueRun({ project_id: 1, agent: 'researcher', skill: 'intake' });
  repo.T.runs[0].cost_usd = 5;
  await processTick(ctx); await processTick(ctx);
  assert.equal(sent.filter((m) => /досягнуто ліміт/.test(m.text)).length, 1, 'the limit is told once');
  // 3) no chat: nothing is sent, the work is done
  sent.length = 0;
  ({ repo, ctx } = await mk(null));
  repo.T.settings.project_cap_default_usd = 1;
  await repo.enqueueRun({ project_id: 1, agent: 'researcher', skill: 'intake' }); repo.T.runs[0].cost_usd = 5;
  await processTick(ctx);
  assert.equal(sent.length, 0); assert.ok(repo.T.runs.some((x) => x.status === 'waiting'));
  // 4) the send fails: the pass still finishes
  ({ repo, ctx } = await mk({ chatId: '-1' }, true));
  repo.T.settings.project_cap_default_usd = 1;
  await repo.enqueueRun({ project_id: 1, agent: 'researcher', skill: 'intake' }); repo.T.runs[0].cost_usd = 5;
  const r = await processTick(ctx);
  assert.equal(r.waiting, 1, 'the work went on although the notice could not be sent');
});
await test('notices: a stopped process (the skill failed three times) is told once', async () => {
  const sent = [];
  const { repo, ctx } = await setup();
  repo.T.notifyTarget = { chatId: '-1' };
  ctx.notify = createNotifier({ repo, send: async (m) => { sent.push(m); return { ok: true }; } });
  await human(repo, 'brief');
  ctx.handlers = { ...createHandlers(), researcher: { ...createHandlers().researcher, intake: async () => { throw new Error('boom'); } } };
  for (let i = 0; i < 8; i += 1) { await processTick(ctx); advance(1000); }
  const stops = sent.filter((m) => /процес зупинено/.test(m.text));
  assert.ok(stops.length >= 1 && stops.length <= 2, 'told, and not on every pass');
  assert.equal(new Set(stops.map((m) => m.text)).size, stops.length, 'no identical notice twice');
});
await test('digest endpoint and cron: the file exists, the cron is daily, the settings are read from the shared loader', () => {
  const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
  const vercel = JSON.parse(fs.readFileSync(path.join(root, 'vercel.json'), 'utf8'));
  assert.ok(vercel.crons.some((c) => c.path === '/api/wf-digest' && c.schedule === '0 * * * *'), 'the cron comes every hour, the digest goes out once a day at the hour of the settings (Kyiv time)');
  const code = fs.readFileSync(path.join(root, 'api/wf-digest.js'), 'utf8');
  assert.match(code, /loadOverviewData/); assert.match(code, /no started projects/);
});
// ---------------------------------------------------------------- A13 guard: a project with cabinets of other platforms does not wait in silence
await test('platforms: a project with only Google or TikTok cabinets is told plainly that the agents work with Meta only; with a Meta cabinet nothing changes', async () => {
  assert.equal(otherPlatformsNote([]), ''); assert.equal(otherPlatformsNote([{ platform: 'meta' }]), '');
  assert.match(otherPlatformsNote([{ platform: 'google' }, { platform: 'tiktok' }, { platform: 'google' }]), /кабінети Google, TikTok, але автоматизації для них ще немає/);
  const { repo, ctx } = await setup();
  repo.addAccount(1, { platform: 'google', account_id: '555' });
  for (const [fn, skill] of [[intake, 'intake'], [audit, 'audit'], [launch, 'launch']]) {
    const r = await fn({ run: { id: 1, project_id: 1, agent: 'x', skill }, ctx });
    assert.equal(r.blocked.on, 'accounts:meta'); assert.match(r.blocked.reason, /Google, але автоматизації/); assert.match(r.tasks[0].evidence, /Google/);
  }
  const { repo: r2, ctx: c2 } = await setup();
  const plain = await intake({ run: { id: 1, project_id: 1, agent: 'x', skill: 'intake' }, ctx: c2 });
  assert.ok(!/Google|TikTok/.test(plain.blocked.reason), 'no other platforms: the old plain reason');
});
// ---------------------------------------------------------------- A13/A14: «Запустити ще раз» after a skill failed three times
await test('rerun: the stopped-process card of a failed skill carries the way to start it again, and a manual run really goes through after the stop', async () => {
  const jr = [{ id: 9, action: 'skill_stopped', summary: 'Крок researcher/intake не вдався 3 рази поспіль.', meta: { skill: 'researcher/intake' } }];
  const card = nowCard({ state: { stage: 1, paused: false }, runs: [{ id: 5, agent: 'researcher', skill: 'intake', status: 'failed' }], journal: jr });
  assert.equal(card.title, 'Процес зупинено'); assert.deepEqual(card.rerun, { agent: 'researcher', skill: 'intake' });
  const check = nowCard({ state: { stage: 1, paused: false }, runs: [], journal: [{ id: 9, action: 'check_failed', summary: 'x', meta: {} }] });
  assert.equal(check.rerun, undefined, 'a failed check is fixed in the data, not by a rerun');
  // the real chain: the skill fails three times, the orchestrator stops, then the manager reruns it by hand and the work goes on
  const { repo, ctx } = await setup();
  await human(repo, 'brief');
  const good = createHandlers();
  let broken = true;
  ctx.handlers = { ...good, researcher: { ...good.researcher, intake: async (a) => { if (broken) throw new Error('boom'); return good.researcher.intake(a); } } };
  for (let i = 0; i < 8; i += 1) { await processTick(ctx); advance(1000); }
  assert.ok(repo.T.journal.some((j) => j.action === 'skill_stopped' && j.meta?.skill === 'researcher/intake'), 'stopped');
  const failedBefore = repo.T.runs.filter((r) => r.skill === 'intake' && r.status === 'failed').length;
  broken = false;
  await repo.enqueueRun({ project_id: 1, agent: 'researcher', skill: 'intake', trigger: 'manual', priority: 50 });
  for (let i = 0; i < 4; i += 1) { await processTick(ctx); advance(1000); }
  assert.ok(repo.T.runs.some((r) => r.skill === 'intake' && r.status === 'done'), 'the manual run was taken and finished although the skill was stopped');
  assert.equal(repo.T.runs.filter((r) => r.skill === 'intake' && r.status === 'failed').length, failedBefore, 'no new failures');
});
// ---------------------------------------------------------------- A14: the help «Як це працює»
await test('help: the map has the same six stages as the process, every stage is fully written, every button leads to a real page, the page and the menu entry exist', () => {
  const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
  assert.equal(HELP_STAGES.length, STAGES.length);
  const app = fs.readFileSync(path.join(root, 'src/App.jsx'), 'utf8');
  HELP_STAGES.forEach((h, i) => {
    assert.equal(h.n, STAGES[i].n); assert.equal(h.title, STAGES[i].title); assert.equal(h.hint, STAGES[i].hint, 'the same words as the stepper');
    assert.ok(String(h.who).trim().length >= 2, `${h.title}: who`);
    for (const k of ['what', 'you', 'see', 'wrong', 'tip']) assert.ok(String(h[k]).trim().length > 10, `${h.title}: ${k}`);
    assert.ok(h.go.label && app.includes(`path="${h.go.to}"`), `${h.title}: the page ${h.go.to} exists`);
  });
  for (const c of HELP_CONTROLS) assert.ok(c.title && c.text && c.where);
  // owner's rule (2026-11-24): the pages about the agents are WINDOWS of the section «AI Agents», not pages of the CRM menu; the old addresses lead to the windows
  const side = fs.readFileSync(path.join(root, 'src/components/Sidebar/sidebarData.js'), 'utf8');
  for (const k of ['help', 'overview', 'approvals']) { assert.ok(!side.includes(`to: '/projects/${k}'`), `${k} is not in the menu of the CRM`); assert.ok(app.includes(`path="/projects/${k}" element={<Navigate to="/ai-agents?window=${k}" replace />}`), `the old address of ${k} leads to its window`); }
  const home = fs.readFileSync(path.join(root, 'src/pages/AiAgents/AiAgentsHome.jsx'), 'utf8');
  assert.match(home, /WINDOWS = \{ approvals:/); assert.match(home, /overview:/); assert.match(home, /help:/); assert.match(home, /<AiWindow /);
  assert.match(HELP_STAGES[3].wrong, /Запустити ще раз/, 'the way out of a stopped launch is told');
  assert.match(HELP_STAGES[2].you, /вкладку «Апруви»/); assert.match(HELP_STAGES[3].you, /Готовність до запуску/); assert.match(HELP_STAGES[2].wrong, /картці Креатора/);
});
// ---------------------------------------------------------------- found by the pilot (project 27): a failed skill of the research or of the Creator stood for ever
await test('machine: a research skill or the Creator that failed is started again (three failures in a row stop it, the journal says so, and the manager can start it by hand)', () => {
  const base = { now: new Date('2026-11-24T10:00:00Z'), paused: false };
  const run = (id, agent, skill, status) => ({ id, agent, skill, status, input: {} });
  const enq = (a) => a.filter((x) => x.type === 'enqueue').map((x) => `${x.agent}/${x.skill}`);
  const sections = { brief: { hasCurrent: true }, site: { hasCurrent: true }, audience: { hasCurrent: true }, unit_economy: { hasCurrent: true }, brand_dna: { hasCurrent: true } };
  const f = (id) => run(id, 'researcher', 'competitors', 'failed');
  const st = { stage: 1, paused: false, has_data: false };
  assert.deepEqual(enq(planNext({ ...base, state: st, sections, runs: [f(1)] })), ['researcher/competitors'], 'one failure: one more try');
  assert.deepEqual(enq(planNext({ ...base, state: st, sections, runs: [f(1), f(2)] })), ['researcher/competitors']);
  const stopped = planNext({ ...base, state: st, sections, runs: [f(1), f(2), f(3)] });
  assert.deepEqual(enq(stopped), []); assert.ok(stopped.some((a) => a.action === 'skill_stopped' && a.meta.skill === 'researcher/competitors'));
  assert.deepEqual(enq(planNext({ ...base, state: st, sections, runs: [f(1), run(2, 'researcher', 'competitors', 'queued')] })), [], 'nothing new while a run is open');
  assert.deepEqual(enq(planNext({ ...base, state: st, sections: { ...sections, competitors: { hasCurrent: true } }, runs: [f(1)] })).filter((x) => x === 'researcher/competitors'), [], 'a skill whose section exists is not repeated');
  // the audit is retried only when the cabinets hold data
  assert.deepEqual(enq(planNext({ ...base, state: { ...st, has_data: true }, sections: { ...sections, competitors: { hasCurrent: true } }, runs: [run(1, 'researcher', 'audit', 'failed')] })).filter((x) => x.startsWith('researcher')), ['researcher/audit']);
  assert.deepEqual(enq(planNext({ ...base, state: st, sections: { ...sections, competitors: { hasCurrent: true } }, runs: [run(1, 'researcher', 'audit', 'failed')] })).filter((x) => x.startsWith('researcher')), []);
  // the Creator of the first creatives
  const s2 = { stage: 2, paused: false };
  assert.deepEqual(enq(planNext({ ...base, state: s2, sections: {}, runs: [run(1, 'creator', 'first_creatives', 'failed')] })), ['creator/first_creatives']);
  assert.deepEqual(enq(planNext({ ...base, state: s2, sections: { strategy: { hasCurrent: true, status: 'draft' } }, runs: [run(1, 'creator', 'first_creatives', 'failed')] })), ['creator/first_creatives']);
});
// ---------------------------------------------------------------- owner's choice A (2026-11-24): static pictures are made from one product photo and brand basics
await test('materials: the verdict rule is «one product photo + brand basics» for static pictures (the pilot showed the old wording asked for video and ready creatives); the code still forbids «enough» without a product photo', () => {
  assert.match(IDEAS_PROMPT, /STATIC IMAGES/); assert.match(IDEAS_PROMPT, /at least one product photo AND the basics of the brand/);
  assert.match(IDEAS_PROMPT, /does NOT make it "not_enough"/);
  const inv = inventoryOf({ assets: [], settings: { inputs: { brand: { body: 'кольори' } } } });
  assert.equal(inv.hard_gaps.length, 1, 'no product photo is still a hard gap');
  const ok = inventoryOf({ assets: [{ kind: 'product', name: 'a', url: 'u' }], settings: { inputs: { tone: { body: 'спокійний' } } } });
  assert.equal(ok.hard_gaps.length, 0); assert.equal(ok.brand.tone, true);
});
await test('materials: «not enough» from the model is lifted to «enough» when there is a product photo and brand basics; not lifted without a photo or without any brand basics', () => {
  const raw = (verdict) => ({ materials: { verdict, reason: 'немає відео', have: ['фото'], missing: ['відео'], shoot_list: [{ what: 'Відео', format: '9:16', why: 'рілс', reference: '' }] } });
  const photo = { assets: [{ kind: 'product', name: 'a', url: 'u' }], settings: { inputs: { tone: { body: 'спокійний' } } } };
  const lifted = checkMaterials(raw('not_enough'), inventoryOf(photo));
  assert.equal(lifted.verdict, 'enough'); assert.equal(lifted.lifted, true); assert.deepEqual(lifted.shoot_list, []); assert.match(lifted.reason, /статичні картинки/); assert.match(lifted.reason, /немає відео/);
  assert.equal(checkMaterials(raw('enough'), inventoryOf(photo)).lifted, false, 'an honest «enough» is not marked as lifted');
  const noBrand = checkMaterials(raw('not_enough'), inventoryOf({ assets: [{ kind: 'product', name: 'a', url: 'u' }], settings: {} }));
  assert.equal(noBrand.verdict, 'not_enough'); assert.equal(noBrand.shoot_list.length, 1);
  const noPhoto = checkMaterials(raw('not_enough'), inventoryOf({ assets: [], settings: { inputs: { tone: { body: 'x' } } } }));
  assert.equal(noPhoto.verdict, 'not_enough');
});
await test('higgsfield: a Cyrillic idempotency key never reaches the HTTP header as it is (found by the pilot: the picture failed with «Cannot convert argument to a ByteString»)', async () => {
  const sent = [];
  const fetchFn = async (url, init) => { sent.push(init.headers); return { ok: true, json: async () => ({ request_id: 'r1', status_url: 'https://api.higgsfield.ai/requests/r1/status' }) }; };
  const env = { HF_API_KEY_ID: 'a', HF_API_KEY_SECRET: 'b' };
  await hfImage.submit({ request: { path: 'm', body: {} }, key: 'wf-27-залучити заявки-v1-1', env, fetchFn });
  assert.match(sent[0]['Idempotency-Key'], /^[ -~]+$/); assert.notEqual(sent[0]['Idempotency-Key'], 'wf-27-залучити заявки-v1-1');
  await hfImage.submit({ request: { path: 'm', body: {} }, key: 'wf-1-abc-v1-1', env, fetchFn });
  assert.equal(sent[1]['Idempotency-Key'], 'wf-1-abc-v1-1', 'an ASCII key is left as it is');
  await hfImage.submit({ request: { path: 'm', body: {} }, key: 'ключ', env, fetchFn }); await hfImage.submit({ request: { path: 'm', body: {} }, key: 'ключ', env, fetchFn });
  assert.equal(sent[2]['Idempotency-Key'], sent[3]['Idempotency-Key'], 'the same key gives the same header: a repeat stays harmless');
});
// ---------------------------------------------------------------- found by the pilot: Meta refused to create a campaign (#100/33) and the manager did not know why
await test('launch: when Meta refuses a write the error says WHY (token without ads_management, or the cabinet not assigned to the user of the token); the diagnosis calls only read endpoints', async () => {
  const mk = (perms) => ({ ...laWriter(), createCampaign: async () => { const e = new Error('Meta: Unsupported post request (#100/33)'); e.metaCode = 100; throw e; }, diagnose: async () => perms });
  const noRight = await laSetup({ writer: mk({ permissions: ['ads_read', 'business_management'], hasManagement: false, who: 'CRM (1)', error: null }) }); await processTick(noRight.ctx);
  const e1 = noRight.repo.T.runs.find((r) => r.skill === 'launch').error;
  assert.match(e1, /#100\/33/); assert.match(e1, /ads_read, business_management/); assert.match(e1, /Потрібне право ads_management/);
  const hasRight = await laSetup({ writer: mk({ permissions: ['ads_read', 'ads_management'], hasManagement: true, who: 'CRM (1)', error: null }) }); await processTick(hasRight.ctx);
  assert.match(hasRight.repo.T.runs.find((r) => r.skill === 'launch').error, /не призначено цей кабінет із правом керувати кампаніями/);
  // the writer: the diagnosis reads /me/permissions and /me only
  const seen = [];
  const w = createMetaWriter({ token: 'TOKEN123', fetchFn: async (url, init) => { seen.push({ url: String(url), method: init?.method || 'GET' }); return new Response(JSON.stringify(String(url).includes('me/permissions') ? { data: [{ permission: 'ads_read', status: 'granted' }, { permission: 'ads_management', status: 'declined' }] } : { id: '1', name: 'CRM' }), { status: 200 }); } });
  const d = await w.diagnose(); assert.deepEqual(d.permissions, ['ads_read']); assert.equal(d.hasManagement, false); assert.equal(d.who, 'CRM (1)');
  assert.ok(seen.every((c) => c.method === 'GET'), 'nothing is written while diagnosing');
});
// ---------------------------------------------------------------- launch_check: «can we write?» without creating anything
await test('launch_check: confirms the right to write through validate_only and creates nothing; a refusal says why; no cabinet or no writer is a plain error', async () => {
  const mk = async (writer) => {
    const s = await setup({ handlers: createHandlers({ mediabuyer: { launch_check: launchCheck } }) });
    s.repo.addAccount(1, LA_ACC); if (writer) s.ctx.metaWrite = writer;
    await s.repo.enqueueRun({ project_id: 1, agent: 'mediabuyer', skill: 'launch_check', trigger: 'manual' });
    await processTick(s.ctx); return s;
  };
  const ok = laWriter(); ok.validateWrite = async () => ({ success: true });
  const a = await mk(ok); const ra = a.repo.T.runs.find((r) => r.skill === 'launch_check');
  assert.equal(ra.status, 'done'); assert.equal(ra.output.writable, true); assert.deepEqual(ok.calls, [], 'nothing was created');
  const bad = laWriter(); bad.validateWrite = async () => { const e = new Error('Meta: Unsupported post request (#100/33)'); e.metaCode = 100; throw e; };
  bad.diagnose = async () => ({ permissions: ['ads_read'], hasManagement: false, who: 'HUB (1)', error: null });
  const b = await mk(bad); const rb = b.repo.T.runs.find((r) => r.skill === 'launch_check');
  assert.notEqual(rb.status, 'done'); assert.match(rb.error, /НЕ підтверджено/); assert.match(rb.error, /ads_read/); assert.match(rb.error, /Нічого не створено/); assert.deepEqual(bad.calls, []);
  const c = await mk(null); assert.match(c.repo.T.runs.find((r) => r.skill === 'launch_check').error, /META_WRITE_TOKEN/);
  // the writer: validate_only is sent, as a POST that Meta will not execute
  const seen = [];
  const w = createMetaWriter({ token: 'TOKEN123', fetchFn: async (url, init) => { seen.push({ url: String(url), body: String(init?.body || '') }); return new Response(JSON.stringify({ success: true }), { status: 200 }); } });
  await w.validateWrite({ accountId: '55' });
  assert.match(seen[0].url, /\/act_55\/campaigns$/); assert.match(decodeURIComponent(seen[0].body), /execution_options=\["validate_only"\]/); assert.match(seen[0].body, /status=PAUSED/);
});
await test('launch: a launch asked for as PAUSED creates every object switched off and says so in the snapshot; the default stays ACTIVE', async () => {
  const paused = await laSetup(); paused.repo.T.runs[0].input = { status: 'PAUSED' }; await processTick(paused.ctx);
  const w = paused.ctx.metaWrite;
  assert.ok(w.calls.length > 0); assert.ok(w.calls.filter(([n]) => ['campaign', 'adset', 'ad'].includes(n)).every(([, a]) => a.status === 'PAUSED'), 'campaign, ad set and ad are all PAUSED');
  const snap = (await paused.repo.readSection(1, 'launch')).version.content;
  assert.equal(snap.status, 'done'); assert.ok(snap.warnings.some((x) => /PAUSED/.test(x) && /не витрачаються/.test(x)));
  const normal = await laSetup(); await processTick(normal.ctx);
  assert.ok(normal.ctx.metaWrite.calls.filter(([n]) => ['campaign', 'adset', 'ad'].includes(n)).every(([, a]) => a.status === 'ACTIVE'));
});
// ---------------------------------------------------------------- found by the pilot: Poland in the GEO and Meta wanted the advertiser and payer (DSA)
await test('launch: a country of the EU needs the advertiser name (DSA): the check blocks without it, the ad set carries it, other countries are left as they were, and an unrelated #100 error gets no permission diagnosis', async () => {
  const siteOf = async (html) => collectSiteData({ website: 'shop.example', ...fakeNet({ 'https://shop.example/': html }) });
  const ok = await siteOf(SHOP['https://shop.example/']);
  const base = { accountInfo: { status: 1, currency: 'USD' }, accountCurrency: 'USD', pixels: [{ id: 'px1', name: 'Main', lastFired: LA_FRESH() }], brief: LA_BRIEF, strategy: LA_STRAT, creatives: LA_CREATIVES, siteData: ok, website: 'https://shop.example', now: clock.t };
  const eu = (general) => ({ ...LA_BRIEF, content: { ...LA_BRIEF.content, general: { ...LA_BRIEF.content.general, geo: 'Україна, Польща', ...general } } });
  const euStrat = { ...LA_STRAT, geo: 'Україна, Польща' };
  const without = checkLaunch({ ...base, brief: eu({}), strategy: euStrat }).blockers.map((b) => b.code);
  assert.ok(without.includes('dsa'), 'Poland without the name blocks the launch');
  assert.ok(!checkLaunch({ ...base, brief: eu({ dsa_name: "Mon'Archi" }), strategy: euStrat }).blockers.map((b) => b.code).includes('dsa'));
  assert.ok(!checkLaunch(base).blockers.map((b) => b.code).includes('dsa'), 'a non-EU geo is not asked');
  assert.equal(hasEu(['UA', 'PL']), true); assert.equal(hasEu(['UA', 'US']), false);
  const seen = [];
  const w = createMetaWriter({ token: 'TOKEN123', fetchFn: async (url, init) => { seen.push(String(init?.body || '')); return new Response(JSON.stringify({ id: 'set1' }), { status: 200 }); } });
  await w.createAdSet({ accountId: '55', campaignId: 'c1', name: 'Г', dailyMinor: 9000, pixelId: 'px', countries: ['UA', 'PL'], dsaName: "Mon'Archi" });
  assert.match(decodeURIComponent(seen[0]), /dsa_beneficiary=Mon'Archi/); assert.match(decodeURIComponent(seen[0]), /dsa_payor=Mon'Archi/);
  await w.createAdSet({ accountId: '55', campaignId: 'c1', name: 'Г', dailyMinor: 9000, pixelId: 'px', countries: ['UA'], dsaName: "Mon'Archi" });
  assert.ok(!/dsa_/.test(seen[1]), 'outside the EU the fields are not sent');
  // an error with code 100 that is not «no right to write» keeps its own text
  const wr = laWriter(); wr.createCampaign = async () => { const e = new Error('Meta: Вкажіть рекламодавця (#100/3858081)'); e.metaCode = 100; throw e; }; wr.diagnose = async () => { throw new Error('must not be called'); };
  const s = await laSetup({ writer: wr }); await processTick(s.ctx);
  assert.match(s.repo.T.runs.find((r) => r.skill === 'launch').error, /3858081/); assert.ok(!/Діагностика/.test(s.repo.T.runs.find((r) => r.skill === 'launch').error));
});
// ---------------------------------------------------------------- found by the pilot: Meta refused the Facebook page of the brief
await test('launch_check: the page of the brief must be among the pages the cabinet may promote; the answer lists them when it is not; nothing is created', async () => {
  const mk = async (pages) => {
    const s = await setup({ handlers: createHandlers({ mediabuyer: { launch_check: launchCheck } }) });
    s.repo.addAccount(1, LA_ACC);
    await s.repo.writeSectionVersion(1, 'brief', { author_kind: 'human', author: 'm@x', body: '', content: { general: { fb_page_id: '777' }, economics: {} } });
    const w = laWriter(); w.validateWrite = async () => ({ success: true }); w.promotePages = async () => pages; s.ctx.metaWrite = w;
    await s.repo.enqueueRun({ project_id: 1, agent: 'mediabuyer', skill: 'launch_check', trigger: 'manual' }); await processTick(s.ctx);
    return { run: s.repo.T.runs.find((r) => r.skill === 'launch_check'), w };
  };
  const good = await mk([{ id: '777', name: 'Моя сторінка' }]);
  assert.equal(good.run.status, 'done'); assert.equal(good.run.output.page_ok, true); assert.deepEqual(good.w.calls, []);
  const bad = await mk([{ id: '555', name: 'Інша сторінка' }]);
  assert.notEqual(bad.run.status, 'done'); assert.match(bad.run.error, /777.*НЕ доступна/); assert.match(bad.run.error, /Інша сторінка \(555\)/); assert.deepEqual(bad.w.calls, []);
  const none = await mk([]);
  assert.match(none.run.error, /жодної/);
});
// ---------------------------------------------------------------- the creative can be opened in a large format (owner's remark 2026-11-24)
await test('creatives: every picture of an ad is a button that opens the large viewer (dialog, arrows, Esc); the viewer and its styles exist, and only ads with a picture are in it', () => {
  const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
  const src = fs.readFileSync(path.join(root, 'src/components/Workflow/Package.jsx'), 'utf8');
  assert.match(src, /function Lightbox/); assert.match(src, /className="wf-zoom"/); assert.match(src, /role="dialog"/); assert.match(src, /useDialogA11y\(box, onClose/);
  assert.match(src, /ArrowLeft/); assert.match(src, /ArrowRight/); assert.match(src, /withPicture\(/);
  assert.equal((src.match(/onZoom=\{onZoom\}/g) || []).length >= 3, true, 'the package and the page of the creatives both pass the viewer to every ad');
  const css = fs.readFileSync(path.join(root, 'src/styles/workflowHub.css'), 'utf8');
  assert.match(css, /\.wf-lb-box/); assert.match(css, /\.wf-zoom/);
});
// ---------------------------------------------------------------- the tab «Апруви» of a project (owner's choice A, 2026-11-24)
await test('approvals tab: what waits, the road of four steps, the counter and the history; the route gives the project id as a string and it still works', () => {
  const st = { project_id: 3, stage: 2, paused: false };
  const ap = (id, kind, status, extra = {}) => ({ id, project_id: 3, kind, status, subject: {}, requested_at: '2026-11-24T10:00:00Z', ...extra });
  // nothing yet: no state, no rows
  assert.deepEqual(pendingList({ projectId: '3', state: null, approvals: [] }), []); assert.equal(headlineOf(null).tone, 'mute');
  // Апрув 1 waits
  const a1 = [ap(9, 'strategy', 'pending')];
  assert.equal(pendingCount({ projectId: '3', state: st, approvals: a1 }), 1); assert.equal(pendingItem({ projectId: '3', state: st, approvals: a1 }).kind, 'strategy');
  assert.deepEqual(roadOf({ projectId: '3', state: st, approvals: a1 }).map((r) => r.status), ['current', 'todo', 'todo', 'todo']);
  assert.match(headlineOf(pendingItem({ projectId: 3, state: st, approvals: a1 })).title, /Чекає на вас: Апрув 1/);
  // Апрув 1 approved: the client answer waits to be recorded (a virtual item)
  const a2 = [ap(9, 'strategy', 'approved', { decided_at: '2026-11-24T11:00:00Z', decided_by: 'Олексій', comment: 'ок' })];
  const p2 = pendingItem({ projectId: 3, state: st, approvals: a2 }); assert.equal(p2.kind, 'client'); assert.equal(p2.virtual, true);
  assert.deepEqual(roadOf({ projectId: 3, state: st, approvals: a2 }).map((r) => r.status), ['done', 'current', 'todo', 'todo']);
  // returned strategy, then a new round: the old one is returned, the new one current
  const a3 = [ap(11, 'strategy', 'pending'), ap(9, 'strategy', 'returned', { decided_at: '2026-11-24T11:00:00Z' })];
  assert.equal(roadOf({ projectId: 3, state: st, approvals: a3 })[0].status, 'current');
  assert.equal(roadOf({ projectId: 3, state: st, approvals: [ap(9, 'strategy', 'returned', { decided_at: '2026-11-24T11:00:00Z' })] })[0].status, 'returned');
  // rows of other projects do not count
  assert.equal(pendingCount({ projectId: 3, state: st, approvals: [{ ...ap(5, 'strategy', 'pending'), project_id: 4 }] }), 0);
  // the history: only decided ones, the newest first, with who and the comment
  const h = historyOf([ap(1, 'strategy', 'approved', { decided_at: '2026-11-24T11:00:00Z', decided_by: 'A', comment: 'x' }), ap(2, 'launch', 'returned', { decided_at: '2026-11-24T12:00:00Z', decided_by: 'B', comment: 'y' }), ap(3, 'changes', 'pending')]);
  assert.deepEqual(h.map((x) => x.id), [2, 1]); assert.equal(h[0].title, 'Апрув 2'); assert.equal(h[0].who, 'B'); assert.equal(h[1].comment, 'x');
});
await test('approvals tab: the tab is in the card of the project with the counter, the decision lives there and «Огляд» only leads to it', () => {
  const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
  const card = fs.readFileSync(path.join(root, 'src/pages/Projects/ProjectDetail.jsx'), 'utf8');
  assert.match(card, /key: 'approvals', label: 'Апруви'/); assert.match(card, /<ApprovalsTab /); assert.match(card, /pendingCount\(/); assert.match(card, /t\.key === 'approvals' && approvalCount > 0/);
  assert.ok(card.indexOf("TABS.find((x) => x.key === 'tasks')") < card.indexOf("TABS.find((x) => x.key === 'approvals')"), 'the tab stands after «Задачі»');
  const ov = fs.readFileSync(path.join(root, 'src/components/Workflow/ProcessOverview.jsx'), 'utf8');
  assert.ok(!/import Decision/.test(ov), 'the decision is not shown twice'); assert.match(ov, /onGo\?\.\('approvals'\)/);
  const tab = fs.readFileSync(path.join(root, 'src/components/Workflow/ApprovalsTab.jsx'), 'utf8');
  assert.match(tab, /<Decision /); assert.match(tab, /Історія рішень/);
});
await test('launch_check: in read-only mode (a real client) nothing is sent to the write endpoints; it still names the token and lists the pages the cabinet may promote', async () => {
  const s = await setup({ handlers: createHandlers({ mediabuyer: { launch_check: launchCheck } }) });
  s.repo.addAccount(1, LA_ACC);
  await s.repo.writeSectionVersion(1, 'brief', { author_kind: 'human', author: 'm@x', body: '', content: { general: {}, economics: {} } });
  const w = laWriter(); let validated = 0; w.validateWrite = async () => { validated += 1; return {}; }; w.promotePages = async () => [{ id: '9', name: 'Сторінка клієнта' }]; s.ctx.metaWrite = w;
  await s.repo.enqueueRun({ project_id: 1, agent: 'mediabuyer', skill: 'launch_check', trigger: 'manual', input: { read_only: true } }); await processTick(s.ctx);
  const r = s.repo.T.runs.find((x) => x.skill === 'launch_check');
  assert.equal(r.status, 'done'); assert.equal(validated, 0, 'validate_only was not even called'); assert.equal(r.output.read_only, true); assert.equal(r.output.writable, null);
  assert.deepEqual(w.calls, []); assert.match(JSON.stringify(r.output.pages), /Сторінка клієнта/);
});
await test('launch: the skill itself refuses to write to a cabinet without an approved Апрув 2 (a manual run cannot bypass the rule); with Апрув 2 it works as before', async () => {
  const no = await laSetup({ approved: false }); await processTick(no.ctx);
  const r = no.repo.T.runs.find((x) => x.skill === 'launch');
  assert.notEqual(r.status, 'done'); assert.match(r.error, /лише після Апрува 2/); assert.deepEqual(no.ctx.metaWrite.calls, [], 'nothing was written');
  const pend = await laSetup({ approved: false }); pend.repo.T.approvals.push({ id: 901, project_id: 1, kind: 'launch', subject: {}, status: 'pending', requested_at: '2026-11-23T09:00:00Z' }); await processTick(pend.ctx);
  assert.deepEqual(pend.ctx.metaWrite.calls, [], 'a pending Апрув 2 is not enough');
  const ok = await laSetup(); await processTick(ok.ctx); assert.ok(ok.ctx.metaWrite.calls.length > 0);
});
// ---------------------------------------------------------------- «Готовність до запуску» and the rerun of a finished step (a plan of 2026-11-24)
await test('readiness card: the result of launch_check in words of the manager; a rerun is offered for finished steps but never for the launch', () => {
  assert.equal(readinessOf({}).tone, 'mute'); assert.equal(readinessOf({ run: { status: 'running' } }).busy, true);
  const failed = readinessOf({ run: { status: 'failed', error: 'Сторінка НЕ доступна' } }); assert.equal(failed.tone, 'bad'); assert.match(failed.lines[0].text, /НЕ доступна/);
  const ok = readinessOf({ run: { status: 'done', output: { read_only: true, pages: [{ id: '1', name: 'П' }], page_ok: true } }, steps: [{ title: 'Кабінет активний', status: 'info' }, { title: 'Сторінка доступна', status: 'done' }] });
  assert.equal(ok.tone, 'ok'); assert.match(ok.title, /запис не перевірявся/); assert.deepEqual(ok.lines.map((l) => l.tone), ['info', 'ok']);
  assert.equal(readinessOf({ run: { status: 'done', output: { read_only: true, pages: [], page_ok: false } } }).tone, 'warn');
  assert.match(readinessOf({ run: { status: 'done', output: { read_only: false, writable: true, pages: [{ id: '1' }], page_ok: true } } }).title, /право запису/);
  const cards = agentCards([{ id: 1, agent: 'creator', skill: 'first_creatives', status: 'done' }, { id: 2, agent: 'mediabuyer', skill: 'launch', status: 'done' }, { id: 3, agent: 'researcher', skill: 'site', status: 'failed' }, { id: 4, agent: 'strategist', skill: 'strategy', status: 'running' }]);
  const by = (k) => cards.find((c) => c.key === k);
  assert.equal(by('creator').rerun, 'first_creatives'); assert.equal(by('researcher').rerun, 'site'); assert.ok(!by('mediabuyer').rerun, 'the launch is never rerun from a card'); assert.ok(!by('strategist').rerun, 'nothing is rerun while a run is open');
  assert.equal(RERUN_SKILLS.has('launch'), false); assert.equal(RERUN_SKILLS.has('launch_check'), false);
  const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
  const ov = fs.readFileSync(path.join(root, 'src/components/Workflow/ProcessOverview.jsx'), 'utf8');
  assert.match(ov, /<Readiness /); assert.match(ov, /read_only: true/); assert.match(ov, /a\.rerun &&/);
});
// ---------------------------------------------------------------- the registry of the agents is the one source of the team (owner's decision of 2026-11-24)
await test('registry: the skills that the orchestrator runs are exactly the skills of the registry; only the Media buyer may write to a cabinet; the map has the team and four archived departments that do not overlap', () => {
  const real = Object.entries(REAL).flatMap(([a, sk]) => Object.keys(sk).map((k) => `${a}/${k}`)).sort();
  assert.deepEqual(real, [...INTEGRATED_SKILLS].sort(), 'a skill is in the code and not in the registry, or the other way round');
  assert.deepEqual(ACTIVE_AGENTS.map((a) => a.key), ['researcher', 'creator', 'strategist', 'mediabuyer', 'support']);
  assert.deepEqual(ACTIVE_AGENTS.filter((a) => a.rights === 'write').map((a) => a.key), ['mediabuyer']);
  for (const a of ACTIVE_AGENTS) { assert.ok(a.name && a.does && a.skills.length && a.reads.length && a.writes.length, a.key); }
  assert.ok(ACTIVE_AGENTS.find((a) => a.key === 'support').skills.some((s) => s.key === 'period_report' && s.integrated !== false), 'the report agent is a skill of the Support agent');
  assert.deepEqual(ACTIVE_AGENTS.flatMap((x) => x.skills.filter((s) => s.stub).map((s) => `${x.key}/${s.key}`)), [], 'no stand-ins are left: the month plan is a real skill since 2026-11-25');
  assert.equal(AGENTS.length, 5); assert.equal(SKILL_LABEL.launch, 'запускає кампанії');
  const isl = mapIslands();
  assert.equal(isl.length, 5); assert.equal(isl[0].archived, false); assert.equal(isl[0].agents.length, 5);
  assert.deepEqual(isl.slice(1).map((x) => x.key), ['service', 'sales', 'seo', 'smm']); assert.ok(isl.slice(1).every((x) => x.archived && /в архіві/.test(x.label)));
  const rad = (n) => Math.max(3.9, (n * 4.4) / (2 * Math.PI)) + 1.45 + 0.55; // the radius of an island as the scene makes it
  for (let i = 0; i < isl.length; i += 1) for (let j = i + 1; j < isl.length; j += 1) assert.ok(Math.hypot(isl[i].p[0] - isl[j].p[0], isl[i].p[1] - isl[j].p[1]) > rad(isl[i].agents.length) + rad(isl[j].agents.length) + 1, `${isl[i].key} and ${isl[j].key} overlap`);
});
// ---------------------------------------------------------------- the map of the AI Agents: live states, facts of an agent, the feed (restored 2026-11-24)
await test('map live: the state of every agent (problem, work, a decision that waits, ready, inactive), the pods of archived departments are inactive, the feed speaks in words of the manager', () => {
  const now = new Date('2026-11-24T22:00:00Z');
  const run = (id, agent, skill, status, extra = {}) => ({ id, project_id: 3, agent, skill, status, created_at: '2026-11-24T20:00:00Z', finished_at: '2026-11-24T20:05:00Z', cost_usd: 0.1, ...extra });
  const st = [{ project_id: 3, stage: 2, paused: false }];
  const none = agentStates({ runs: [], approvals: [], states: [], now }); assert.deepEqual(Object.values(none), ['inactive', 'inactive', 'inactive', 'inactive', 'inactive']);
  const runs = [run(1, 'researcher', 'site', 'done'), run(2, 'creator', 'first_creatives', 'running'), run(3, 'mediabuyer', 'launch', 'failed'), run(4, 'support', 'onboarding', 'done', { finished_at: '2026-11-01T00:00:00Z', created_at: '2026-11-01T00:00:00Z' })];
  const s = agentStates({ runs, approvals: [{ id: 9, project_id: 3, kind: 'strategy', status: 'pending' }], states: st, now });
  assert.equal(s.researcher, 'waiting'); assert.equal(s.creator, 'working'); assert.equal(s.mediabuyer, 'problem'); assert.equal(s.support, 'inactive', 'nothing for a week');
  assert.equal(s.strategist, 'paused', 'the approval of the strategy waits for the manager');
  // a failure that a later success of the same work followed is old news; a failed readiness check is not a problem of the system
  const s2 = agentStates({ runs: [run(1, 'mediabuyer', 'launch', 'failed'), run(2, 'mediabuyer', 'launch', 'done'), run(3, 'mediabuyer', 'launch_check', 'failed')], approvals: [], states: st, now });
  assert.equal(s2.mediabuyer, 'waiting');
  const isl = mapIslands(); const pods = podStates(isl, s);
  assert.equal(pods.creator, 'working'); assert.ok(isl.filter((x) => x.archived).flatMap((x) => x.agents).every((a) => pods[a.key] === 'inactive'));
  // the facts of an agent
  const f = agentFacts({ agent: 'creator', runs: [run(5, 'creator', 'first_creatives', 'running'), run(6, 'creator', 'materials_ideas', 'done', { cost_usd: 0.3 })], projects: { 3: { name: 'Mellow' } }, now, since: '2026-11-01T00:00:00Z' });
  assert.equal(f.open.length, 1); assert.equal(f.open[0].project, 'Mellow'); assert.equal(f.recent[0].id, 6, 'the newest first'); assert.equal(f.open[0].id, 5); assert.equal(Math.round(f.cost * 100) / 100, 0.4); assert.equal(f.runs, 2);
  // the feed: no small events, newest first, the tab to open
  const feed = feedOf({ projects: { 3: { name: 'Mellow' } }, journal: [{ id: 1, project_id: 3, at: 'a', action: 'run_done', summary: 'Готово' }, { id: 2, project_id: 3, at: 'b', action: 'approval', summary: 'Апрув 1 чекає' }, { id: 3, project_id: 3, at: 'c', action: 'run_failed', summary: 'Помилка' }, { id: 4, project_id: null, at: 'd', action: 'state', summary: 'x' }] });
  assert.deepEqual(feed.map((x) => x.id), [3, 2]); assert.equal(feed[0].bad, true); assert.equal(feed[1].tab, 'approvals'); assert.equal(feed[1].project, 'Mellow');
});
await test('map page: /ai-agents is the full-screen map (immersive layout), fed by the registry and the live rows; the scene takes its islands from the registry and draws a route to every island', () => {
  const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
  const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
  assert.match(read('src/components/Layout/Layout.jsx'), /IMMERSIVE_PREFIXES = \[[^\]]*'\/ai-agents'/);
  const page = read('src/pages/AiAgents/AiAgentsHome.jsx');
  assert.match(page, /<AgentMap3D /); assert.match(page, /mapIslands\(\)/); assert.match(page, /fetchAgentsLive/); assert.match(page, /Аварійна зупинка/); assert.match(page, /Виконати крок зараз/); assert.match(page, /Що зараз/);
  const scene = read('src/pages/AiAgents/map/createAgentMap.js');
  assert.match(scene, /opts\.islands/); assert.ok(!/const LAYOUT = \[/.test(scene), 'no fixed layout of eight islands any more');
  assert.match(read('src/pages/AiAgents/map/room.js'), /for \(const isl of islands\) \{ const dir/, 'one route from the hub to every island');
  assert.match(scene, /Оркестратор/);
});
// ---------------------------------------------------------------- the window «Витрати» (restored on the new data)
await test('spend: the month against the limits, by project, agent, skill and day; the model apart from the pictures; the forecast; the other spend of the AI; another month does not mix in', () => {
  const now = new Date('2026-11-24T22:00:00Z');
  const run = (id, project_id, agent, skill, cost, at, status = 'done') => ({ id, project_id, agent, skill, status, cost_usd: cost, created_at: at });
  const runs = [run(1, 3, 'creator', 'first_creatives', 0.5, '2026-11-24T10:00:00Z'), run(2, 3, 'researcher', 'site', 0.04, '2026-11-24T09:00:00Z'), run(3, 27, 'strategist', 'strategy', 0.02, '2026-11-23T09:00:00Z'), run(4, 27, 'mediabuyer', 'launch', 0, '2026-11-23T10:00:00Z', 'failed'), run(5, 3, 'creator', 'first_creatives', 9, '2026-10-30T10:00:00Z')];
  const calls = [{ run_id: '1', agent_key: 'wf-researcher', cost_usd: 0.1, created_at: '2026-11-24T10:00:00Z' }, { run_id: '2', agent_key: 'wf-researcher', cost_usd: 0.04, created_at: '2026-11-24T09:00:00Z' }, { run_id: '3', agent_key: 'wf-researcher', cost_usd: 0.02, created_at: '2026-11-23T09:00:00Z' },
    { run_id: null, agent_key: 'report-work-summary', cost_usd: 0.017, created_at: '2026-11-23T10:00:00Z' }, { run_id: null, agent_key: 'creative-creative_strategy', cost_usd: 0.139, created_at: '2026-11-18T10:00:00Z' }, { run_id: null, agent_key: 'report-work-summary', cost_usd: 5, created_at: '2026-10-01T10:00:00Z' }];
  const projects = { 3: { name: 'Mellow' }, 27: { name: 'Mon-Archi' } };
  const rep = spendReport({ now, runs, calls, projects, states: [{ project_id: 27, cost_cap_usd: 0.05 }], settings: { monthly_cap_usd: 1000, project_cap_default_usd: 100 } });
  assert.equal(rep.month, '2026-11'); assert.equal(rep.spent, 0.56, 'October does not mix in'); assert.equal(rep.runs, 4);
  assert.equal(rep.modelCost, 0.16); assert.equal(rep.picturesCost, 0.4, 'what is not the model is the pictures');
  assert.equal(rep.cap, 1000); assert.equal(rep.pct, 0); assert.equal(rep.hot, false);
  assert.equal(rep.daysPassed, 24); assert.equal(Math.round(rep.forecast * 1000) / 1000, 0.7, 'the spend so far / days passed × days of the month');
  assert.deepEqual(rep.perProject.map((p) => p.name), ['Mellow', 'Mon-Archi']); assert.equal(rep.perProject[0].cap, 100); assert.equal(rep.perProject[1].cap, 0.05); assert.equal(rep.perProject[1].ownCap, 0.05); assert.equal(rep.perProject[1].hot, false);
  assert.equal(rep.perAgent.length, 5); assert.equal(rep.perAgent.find((a) => a.key === 'creator').spent, 0.5); assert.equal(rep.perAgent.find((a) => a.key === 'mediabuyer').failed, 1);
  assert.equal(rep.perSkill[0].label, 'робить перші креативи');
  assert.equal(rep.perDay.length, 30); assert.equal(rep.perDay[23].spent, 0.54); assert.equal(rep.perDay[24].future, true); assert.equal(rep.perDay[22].spent, 0.02);
  assert.deepEqual(rep.topRuns.map((r) => r.id), [1, 2, 3]);
  assert.deepEqual(rep.other.map((o) => o.label), ['Креативний відділ (старий)', 'Супровід: резюме роботи для звітів']); assert.equal(rep.otherTotal, 0.156);
  // the limit of a project reached, and a month in the past
  const hot = spendReport({ now, runs: [run(9, 27, 'strategist', 'strategy', 0.045, '2026-11-23T09:00:00Z')], states: [{ project_id: 27, cost_cap_usd: 0.05 }], settings: {} });
  assert.equal(hot.perProject[0].hot, true); assert.equal(hot.perProject[0].pct, 90);
  const oct = spendReport({ now, month: '2026-10', runs, calls, projects, settings: {} }); assert.equal(oct.spent, 9); assert.equal(oct.current, false); assert.equal(oct.forecast, null); assert.equal(oct.otherTotal, 5);
  assert.deepEqual(monthsOffered(now), ['2026-11', '2026-10', '2026-09']);
});
await test('spend: the window is wired into the section (button, tab, the number on the map opens it; the limits are changed in the overview)', () => {
  const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
  const home = fs.readFileSync(path.join(root, 'src/pages/AiAgents/AiAgentsHome.jsx'), 'utf8');
  assert.match(home, /spend: \{ title: 'Витрати'/); assert.match(home, /openWin\('spend'\)/); assert.match(home, /<Page onOpen=\{openWin\} \/>/);
  const win = fs.readFileSync(path.join(root, 'src/pages/AiAgents/Spend.jsx'), 'utf8');
  assert.match(win, /Змінити ліміти/); assert.match(win, /Інші витрати ШІ/); assert.match(win, /fetchSpendData/);
});
// ---------------------------------------------------------------- the skill «План на місяць» (Стратег; document, step 5): the stand-in is replaced by the real skill
await test('monthly plan engine: the calendar gives the dates, the results of the last month are counted by code, the budget stays inside the step, unknown campaigns and events are dropped, a new campaign needs the client', () => {
  const now = new Date('2026-11-23T09:00:00Z');
  const win = monthWindows(now);
  assert.equal(win.key, '2026-11'); assert.deepEqual([win.prev.since, win.prev.until], ['2026-10-01', '2026-10-31']);
  const ev = eventsFor({ geoCodes: ['US'], from: win.from, to: win.to });
  assert.deepEqual(ev.map((e) => `${e.key}:${e.date}`), ['black_friday:2026-11-27', 'cyber_monday:2026-11-30'], 'the dates of the calendar, not of the model');
  const dec = eventsFor({ geoCodes: ['UA'], ...monthWindows(new Date('2026-12-02T09:00:00Z')) });
  assert.deepEqual(dec.map((e) => e.key), ['christmas', 'new_year'], 'Ukraine: no cyber monday; the New Year after the month is prepared in advance');
  assert.ok(!eventsFor({ geoCodes: ['UA'], from: win.from, to: win.to }).some((e) => e.key === 'cyber_monday'));
  assert.equal(dueFor('site', '2026-11-27', now), '2026-11-25', 'ten days before is in the past: two days from now');
  assert.equal(dueFor('banner', '2026-12-25', now), '2026-12-18');
  // the results of the last month
  const last = summarizeLastMonth({ campaignRows: [{ campaign_id: 'c1', campaign_name: 'А', spend: 300, purchases: 6, revenue: 1500 }, { campaign_id: 'c2', campaign_name: 'Б', spend: 100, purchases: 0, revenue: 0 }], adRows: [{ ad_id: 'a1', ad_name: 'тег 1', spend: 200, purchases: 5, revenue: 1200 }, { ad_id: 'a2', ad_name: 'тег 2', spend: 150, purchases: 0, revenue: 0 }] });
  assert.equal(last.totals.spend, 400); assert.equal(last.totals.purchases, 6); assert.equal(last.by_campaign[0].name, 'А'); assert.equal(last.best_ads[0].tag, 'тег 1'); assert.equal(last.worst_ads[0].tag, 'тег 2');
  // the facts and the check
  const facts = gatherPlanFacts({ brief: { content: { general: { geo: 'США', goal: 'продажі' }, economics: { products: [{ name: 'Товар' }], currency: 'USD' } } }, strategy: { campaigns: [{ name: 'Кампанія А', daily_budget: 100 }, { name: 'Кампанія Б', daily_budget: 50 }] }, plan: { monthly: 4500, daily: 150, min_daily: 20, currency: 'USD' }, last, events: ev, month: win.key });
  const raw = { summary: 'Минулий місяць пройшов добре.', worked: ['Креатив «тег 1» дав 5 покупок'], not_worked: ['«тег 2» витратив 150 без покупок'], goals: ['Підготувати акцію до Чорної п’ятниці'],
    campaigns: [{ name: 'Кампанія А', decision: 'change', daily_budget: 400, reason: 'Результат кращий за цільовий' }, { name: 'Кампанія Б', decision: 'stop', reason: 'Без покупок' }, { name: 'Вигадана', decision: 'keep' }, { name: 'Нова', decision: 'new', daily_budget: 30, reason: 'Ремаркетинг, потрібне погодження клієнта' }, { name: 'Друга нова', decision: 'new', daily_budget: 30 }],
    events: [{ key: 'black_friday', what: 'Акція', creative_goal: { goal: 'Продати хіт зі знижкою', product: 'Товар' }, site_tasks: [{ what: 'Оновити банер', kind: 'banner' }, { what: 'Вказати ціни', kind: 'prices' }] }, { key: 'prom', what: 'Вигадана подія' }, { key: 'black_friday', what: 'Дубль' }] };
  const c = checkPlan(raw, { facts, now });
  const byName = Object.fromEntries(c.campaigns.map((x) => [x.name, x]));
  assert.equal(byName['Кампанія А'].daily_budget, 120, 'a change is limited to the step of the rules (20%)'); assert.equal(byName['Кампанія А'].was, 100);
  assert.equal(byName['Кампанія Б'].daily_budget, 0); assert.equal(byName['Кампанія Б'].decision, 'stop');
  assert.ok(!byName['Вигадана'], 'a campaign that is not in the strategy is dropped'); assert.equal(byName['Нова'].needs_client_approval, true); assert.ok(!byName['Друга нова'], 'one new campaign a month');
  assert.deepEqual(c.events.map((e) => e.key), ['black_friday']); assert.equal(c.events[0].date, '2026-11-27'); assert.equal(c.events[0].site_tasks[0].due, '2026-11-25'); assert.equal(c.events[0].creative_goal.product, 'Товар');
  assert.ok(c.notes.some((n) => /виходить за крок/.test(n)) && c.notes.some((n) => /немає в стратегії/.test(n)));
  assert.ok(c.warnings.some((w) => /нова кампанія/i.test(w)), 'the client is told about a new campaign');
  assert.ok(c.warnings.some((w) => /числа, яких немає/.test(w)) === false, 'numbers that stand in the facts are fine');
  const strayCheck = checkPlan({ ...raw, summary: 'Виросли продажі на 87%.' }, { facts, now }); assert.ok(strayCheck.warnings.some((w) => /87/.test(w)), 'a number from nowhere is flagged');
  assert.throws(() => parsePlanAnswer('не json'), /не у форматі JSON/); assert.throws(() => parsePlanAnswer('{"summary":"x"}'), /немає рішень/);
  const text = renderPlanText({ ...c, month: '2026-11', version: 1, last_month: { ...last, period: '2026-10-01 – 2026-10-31' }, summary: c.summary });
  assert.match(text, /План на 2026-11 \(версія 1\)/); assert.match(text, /Витрачено 400, покупок 6/); assert.match(text, /Чорна п’ятниця, 2026-11-27/); assert.match(text, /Клієнту до 2026-11-25: Оновити банер/); assert.match(text, /потрібне погодження клієнта/);
});
await test('monthly plan skill: reads the last month from the cabinet, writes the section and the tasks of the client, is blocked without a strategy; the stand-in is gone', async () => {
  assert.equal(typeof REAL.strategist.monthly_plan, 'function', 'the real skill is registered');
  clock.t = new Date('2026-11-23T09:00:00Z'); // the plan is made at the start of November; the tests before this one moved the clock
  const mk = async ({ strategy = true, launch = true } = {}) => {
    const s = await setup({ handlers: createHandlers({ strategist: { monthly_plan: monthlyPlan } }) });
    s.repo.addAccount(1, { platform: 'meta', account_id: '55' });
    await s.repo.writeSectionVersion(1, 'brief', { author_kind: 'human', author: 'm@x', body: '', content: { general: { geo: 'США', goal: 'продажі' }, economics: { currency: 'USD', budget_monthly: 4500, min_campaign_daily: 20, avg_order: 100, cogs_pct: 40, products: [{ name: 'Товар', price: 100, cogs: 40 }] } } });
    if (strategy) await s.repo.writeSectionVersion(1, 'strategy', { author_kind: 'agent', author: 'strategist', body: 's', content: { campaigns: [{ name: 'Кампанія А', daily_budget: 100 }, { name: 'Кампанія Б', daily_budget: 50 }] } });
    if (launch) await s.repo.writeSectionVersion(1, 'launch', { author_kind: 'agent', author: 'mediabuyer', body: 'l', content: { status: 'done', launched_at: '2026-10-05T00:00:00Z', campaigns: [] } });
    const reads = []; s.ctx.meta = { insights: async (o) => { reads.push(o); return { rows: o.level === 'campaign' ? [{ campaign_id: 'c1', campaign_name: 'Кампанія А', spend: 300, purchases: 6, revenue: 1500 }] : [{ ad_id: 'a1', ad_name: 'тег 1', spend: 300, purchases: 6, revenue: 1500 }] }; } };
    s.asked = []; s.ctx.ask = async (a) => { s.asked.push(a); return { text: JSON.stringify({ summary: 'Минулий місяць був вдалим.', worked: ['«тег 1» дав покупки'], not_worked: [], goals: ['Підготуватись до Чорної п’ятниці'], campaigns: [{ name: 'Кампанія А', decision: 'change', daily_budget: 110, reason: 'Добрий результат' }], events: [{ key: 'black_friday', what: 'Акція', creative_goal: { goal: 'Хіт зі знижкою', product: 'Товар' }, site_tasks: [{ what: 'Оновити банер на сайті', kind: 'banner' }] }] }), costUsd: 0.03 }; };
    s.reads = reads;
    await s.repo.enqueueRun({ project_id: 1, agent: 'strategist', skill: 'monthly_plan' }); await processTick(s.ctx);
    return s;
  };
  const s = await mk();
  const run = s.repo.T.runs.find((r) => r.skill === 'monthly_plan'); assert.equal(run.status, 'done', run.error); assert.equal(run.cost_usd, 0.03);
  assert.deepEqual(s.reads.map((r) => r.level).sort(), ['ad', 'campaign']); assert.deepEqual(s.reads[0].timeRange, { since: '2026-10-01', until: '2026-10-31' }, 'the last month, read only');
  const sec = await s.repo.readSection(1, 'monthly_plan'); const c = sec.version.content;
  assert.equal(c.version, 1); assert.equal(c.month, '2026-11'); assert.equal(c.last_month.totals.spend, 300); assert.equal(c.campaigns.find((x) => x.name === 'Кампанія А').daily_budget, 110);
  assert.match(sec.version.body, /План на 2026-11/); assert.match(sec.version.body, /Чорна п’ятниця/);
  assert.ok(s.repo.T.tasks.some((t) => t.owner === 'client' && /банер/.test(t.title) && t.due_date === '2026-11-25'), 'a task for the client with a date');
  assert.ok(s.repo.T.tasks.some((t) => t.owner === 'manager' && /цілі креативів/.test(t.title)), 'the goals of the creatives go to the manager');
  assert.match(s.asked[0].user, /black_friday/); assert.ok(!/Вигадана подія/.test(s.asked[0].user));
  const none = await mk({ strategy: false }); const r2 = none.repo.T.runs.find((r) => r.skill === 'monthly_plan'); assert.notEqual(r2.status, 'done'); assert.equal(none.asked.length, 0, 'the model is not asked without a strategy');
  const nolaunch = await mk({ launch: false }); assert.equal(nolaunch.reads.length, 0, 'without a launch nothing is read from the cabinet'); assert.equal(nolaunch.repo.T.runs.find((r) => r.skill === 'monthly_plan').status, 'done'); assert.equal((await nolaunch.repo.readSection(1, 'monthly_plan')).version.content.last_month, null);
});
// ---------------------------------------------------------------- the windows «Прогони» and «Підключення» (item 3 of the plan)
await test('runs view: rows, filters, counts; a rerun is offered for finished work but never for the launch or for an open run', () => {
  const runs = [{ id: 3, project_id: 3, agent: 'creator', skill: 'first_creatives', status: 'done', cost_usd: 0.25, trigger: 'manual', created_at: '2026-11-24T10:00:00Z', finished_at: '2026-11-24T10:01:30Z' },
    { id: 2, project_id: 27, agent: 'mediabuyer', skill: 'launch', status: 'failed', error: 'Meta: помилка', cost_usd: 0, created_at: '2026-11-24T09:00:00Z', finished_at: '2026-11-24T09:00:05Z' },
    { id: 1, project_id: 27, agent: 'researcher', skill: 'site', status: 'running', cost_usd: 0, created_at: '2026-11-24T08:00:00Z', finished_at: null }];
  const rows = runRows({ runs, projects: { 3: { name: 'Mellow' }, 27: { name: 'Mon' } } });
  assert.deepEqual(rows.map((r) => r.id), [3, 2, 1], 'the newest first');
  assert.equal(rows[0].project, 'Mellow'); assert.equal(rows[0].duration, '1 хв 30 с'); assert.equal(rows[0].manual, true); assert.equal(rows[0].canRerun, true);
  assert.equal(rows[1].canRerun, false, 'the launch is not rerun from the list'); assert.equal(rows[1].error, 'Meta: помилка'); assert.equal(rows[1].tone, 'bad');
  assert.equal(rows[2].canRerun, false, 'nothing is rerun while it runs'); assert.equal(rows[2].open, true); assert.equal(rows[2].duration, '');
  assert.deepEqual(runCounts(rows), { all: 3, failed: 1, open: 1, done: 1 });
  assert.deepEqual(filterRuns(rows, { status: 'failed' }).map((r) => r.id), [2]); assert.deepEqual(filterRuns(rows, { status: 'open' }).map((r) => r.id), [1]);
  assert.deepEqual(filterRuns(rows, { agent: 'creator' }).map((r) => r.id), [3]); assert.deepEqual(filterRuns(rows, { project: '27' }).map((r) => r.id), [2, 1]);
  assert.equal(durationText(45), '45 с'); assert.equal(durationText(3720), '1 год 2 хв'); assert.equal(durationText(0.2), 'менше секунди');
});
await test('connections: every check says its state in words, secrets never come out, a token without the right to write is a problem with the way to fix it, a slow cron is told', async () => {
  const meta = (perms, who = 'HUB (1)', pages = []) => async (url) => {
    const u = String(url); const body = u.includes('me/permissions') ? { data: perms.map((p) => ({ permission: p, status: 'granted' })) } : u.includes('me/accounts') ? { data: pages } : { id: '1', name: who.split(' ')[0] };
    return new Response(JSON.stringify(body), { status: 200 });
  };
  const SECRET = 'SECRET-TOKEN-VALUE';
  const env = { META_ACCESS_TOKEN: SECRET, META_WRITE_TOKEN: SECRET + '2', HF_API_KEY_ID: 'a', HF_API_KEY_SECRET: 'b', HF_IMAGE_MODEL: 'm', ANTHROPIC_API_KEY: 'k', TELEGRAM_BOT_TOKEN: 't', GOOGLE_OAUTH_CLIENT_ID: 'x', GOOGLE_OAUTH_CLIENT_SECRET: 'y', GOOGLE_OAUTH_REFRESH_TOKEN: 'z', GOOGLE_ADS_DEVELOPER_TOKEN: 'd', GOOGLE_ADS_CLIENT_ID: 'c', GOOGLE_ADS_CLIENT_SECRET: 's', GOOGLE_ADS_REFRESH_TOKEN: 'r' };
  const now = new Date('2026-11-24T22:00:00Z');
  const telegramInfo = async () => ({ ok: true, result: { username: 'mon_bot' } });
  const good = await connectionChecks({ env, fetchFn: meta(['ads_read', 'ads_management', 'pages_show_list', 'pages_read_engagement']), settings: { notify_chat: '-100', last_tick_at: '2026-11-24T21:59:30Z' }, now, telegramInfo });
  const by = (l) => Object.fromEntries(l.map((c) => [c.key, c]));
  const g = by(good);
  assert.deepEqual(['meta_read', 'meta_write', 'images', 'model', 'telegram', 'orchestrator', 'ga4', 'google_ads', 'tiktok'], good.map((c) => c.key));
  assert.equal(g.meta_read.tone, 'ok'); assert.equal(g.meta_write.tone, 'ok'); assert.equal(g.images.tone, 'ok'); assert.equal(g.model.tone, 'ok'); assert.equal(g.telegram.tone, 'ok'); assert.match(g.telegram.text, /@mon_bot/); assert.equal(g.orchestrator.tone, 'ok');
  assert.equal(g.google_ads.tone, 'warn'); assert.match(g.google_ads.text, /Агентів для Google ще немає/); assert.equal(g.tiktok.tone, 'mute');
  assert.ok(!JSON.stringify(good).includes(SECRET), 'a secret never comes out');
  // the pilot's own case: the token reads, but cannot write
  const ro = by(await connectionChecks({ env: { ...env, META_WRITE_TOKEN: undefined }, fetchFn: meta(['ads_read', 'public_profile']), settings: { notify_chat: '-1', last_tick_at: '2026-11-24T21:50:00Z' }, now, telegramInfo }));
  assert.equal(ro.meta_read.tone, 'ok'); assert.equal(ro.meta_write.tone, 'bad'); assert.match(ro.meta_write.text, /ads_management/); assert.match(ro.meta_write.text, /META_WRITE_TOKEN/); assert.match(ro.meta_write.details.join(' '), /ads_read, public_profile/);
  assert.equal(ro.orchestrator.tone, 'warn');
  const nopages = by(await connectionChecks({ env, fetchFn: meta(['ads_read', 'ads_management']), settings: {}, now, telegramInfo }));
  assert.equal(nopages.meta_write.tone, 'warn'); assert.match(nopages.meta_write.text, /pages_show_list/); assert.equal(nopages.telegram.tone, 'warn', 'no chat for the notices'); assert.equal(nopages.orchestrator.tone, 'bad', 'no pass of the cron at all');
  // nothing set
  const none = by(await connectionChecks({ env: {}, fetchFn: meta([]), settings: {}, now }));
  assert.equal(none.meta_read.tone, 'bad'); assert.equal(none.meta_write.tone, 'bad'); assert.match(none.images.text, /HF_API_KEY_ID/); assert.equal(none.model.tone, 'bad'); assert.equal(none.telegram.tone, 'bad'); assert.equal(none.ga4.tone, 'warn');
  // Meta refuses the token
  const refused = by(await connectionChecks({ env, fetchFn: async () => new Response(JSON.stringify({ error: { message: 'Invalid OAuth access token', code: 190 } }), { status: 400 }), settings: {}, now, telegramInfo }));
  assert.equal(refused.meta_read.tone, 'bad'); assert.match(refused.meta_read.text, /не прийняла токен/);
});
await test('the windows «Прогони» and «Підключення» are wired into the section; the endpoint wants the session of a person and has a time limit', () => {
  const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
  const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
  const home = read('src/pages/AiAgents/AiAgentsHome.jsx');
  assert.match(home, /runs: \{ title: 'Прогони'/); assert.match(home, /connections: \{ title: 'Підключення'/); assert.match(home, /openWin\('runs'\)/); assert.match(home, /openWin\('connections'\)/);
  const ep = read('api/wf-status.js'); assert.match(ep, /Method not allowed/); assert.match(ep, /Потрібна авторизація/); assert.match(ep, /getUser\(token\)/);
  assert.match(read('vercel.json'), /"api\/wf-status.js": \{ "maxDuration": 60 \}/);
  assert.match(read('src/pages/AiAgents/Runs.jsx'), /Запустити ще раз/); assert.match(read('src/pages/AiAgents/Connections.jsx'), /Перевірити знову/);
});
// ---------------------------------------------------------------- the report agent of a project merges into the Support agent (item 4 of the plan; owner's decision of 2026-11-24)
await test('period_report: the report agent is a skill of the Support agent; a problem fails the run with its reason, a skipped report is a note, the cost goes to the run; the orchestrator makes it even for a project without a started process', async () => {
  const mk = async (result, input = { periodType: 'weekly', scheduledFor: '2026-11-23' }, withReports = true, projectId = 1) => {
    const s = await setup({ handlers: createHandlers({ support: { period_report: periodReport } }) });
    s.calls = []; if (withReports) s.ctx.reports = { run: async (a) => { s.calls.push(a); return result; } };
    await s.repo.enqueueRun({ project_id: projectId, agent: 'support', skill: 'period_report', input, trigger: 'cron' }); await processTick(s.ctx);
    return { s, run: s.repo.T.runs.find((r) => r.skill === 'period_report') };
  };
  const ok = await mk({ status: 'ok', message: 'Створено 2 звіти', reportId: 7, deckIds: [3], notes: ['Креативи не знайдено для Google'], costUsd: 0.012 });
  assert.equal(ok.run.status, 'done'); assert.equal(ok.run.cost_usd, 0.012); assert.deepEqual(ok.s.calls, [{ projectId: 1, periodType: 'weekly', scheduledFor: '2026-11-23' }]);
  assert.equal(ok.run.output.report_id, 7); assert.match(ok.s.repo.T.steps.map((x) => x.title).join(' | '), /Чернетка звіту \(тижневий\) готова: Створено 2 звіти/); assert.match(ok.s.repo.T.steps.map((x) => x.title).join(' | '), /Креативи не знайдено/);
  const skipped = await mk({ status: 'skipped', message: 'Звіт уже зроблено людиною', notes: [] }, { periodType: 'monthly', scheduledFor: '2026-11-01' });
  assert.equal(skipped.run.status, 'done'); assert.match(skipped.s.repo.T.steps.map((x) => x.title).join(' | '), /Звіт пропущено: Звіт уже зроблено людиною/);
  const problem = await mk({ status: 'problem', message: 'Meta не відповіла' });
  assert.notEqual(problem.run.status, 'done'); assert.match(problem.run.error, /Звіт не вдалося зробити: Meta не відповіла/);
  assert.match((await mk({ status: 'ok' }, {})).run.error, /Не вказано тип звіту/);
  assert.match((await mk({ status: 'ok' }, undefined, false)).run.error, /Агент звітів не підключено/);
  const noState = await mk({ status: 'ok', message: 'ok', notes: [] }, undefined, true, 2);
  assert.equal(noState.run.status, 'done', 'a project that has no started process also gets its reports through the orchestrator'); assert.equal(noState.s.calls[0].projectId, 2);
});
await test('report bridge: the switch, the queue entry of a due report, a report that is already waiting is not queued twice, a real failure is not hidden', async () => {
  assert.equal(reportsViaOrchestrator({}), false); assert.equal(reportsViaOrchestrator({ REPORTS_VIA_ORCHESTRATOR: '1' }), true); assert.equal(reportsViaOrchestrator({ REPORTS_VIA_ORCHESTRATOR: '0' }), false); assert.equal(reportsViaOrchestrator({ REPORTS_VIA_ORCHESTRATOR: 'true' }), false, 'only «1» switches it on');
  const rows = []; const db = (error) => ({ from: (t) => ({ insert: async (row) => { rows.push([t, row]); return { error }; } }) });
  const q = await enqueueReportRun(db(null))({ projectId: 5, periodType: 'monthly', scheduledFor: '2026-11-01' });
  assert.deepEqual(q, { status: 'queued', message: 'Звіт поставлено в чергу оркестратора.' }); assert.equal(rows[0][0], 'wf_runs');
  assert.deepEqual([rows[0][1].project_id, rows[0][1].agent, rows[0][1].skill, rows[0][1].trigger, rows[0][1].input], [5, 'support', 'period_report', 'cron', { periodType: 'monthly', scheduledFor: '2026-11-01' }]);
  assert.match((await enqueueReportRun(db({ code: '23505', message: 'dup' }))({ projectId: 5, periodType: 'weekly', scheduledFor: 'x' })).message, /уже в черзі/);
  await assert.rejects(enqueueReportRun(db({ code: '42501', message: 'denied' }))({ projectId: 5, periodType: 'weekly', scheduledFor: 'x' }), /Не вдалося поставити звіт у чергу: denied/);
  const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
  const tickSrc = fs.readFileSync(path.join(root, 'api/agent-tick.js'), 'utf8'); assert.match(tickSrc, /runFor: reportsViaOrchestrator\(process\.env, reportsSetting\) \? enqueueReportRun\(db\) : /, 'without the switch the clock makes the report itself');
  assert.match(fs.readFileSync(path.join(root, 'api/wf-tick.js'), 'utf8'), /const reports = \{ run: /);
});
// ---------------------------------------------------------------- Zeely item 1 (owner's decision 2026-11-25): the profile «ДНК бренду», made from the website, checked by a person, used by the Creator
const BRAND_CSS = `:root{--brand-primary:#c2185b;--text:#222222;--bg:#ffffff;--accent-color:#ff9800} @font-face{font-family:"Playfair Display";src:url(x.woff2)} h1,h2{font-family:"Playfair Display",serif} body{font-family:Inter,Arial,sans-serif;color:#222} .btn{background:#c2185b;color:rgb(255,255,255)} .grey{color:#888888} .btn2{background:#c2185b}`;
const BRAND_HOME = `<html><head><title>Меблі Лоза</title><meta name="theme-color" content="#C2185B"><link rel="stylesheet" href="/s.css"><link rel="stylesheet" href="https://cdn.example/lib.css"><link rel="icon" href="/fav.png">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;700&family=Playfair+Display&display=swap" rel="stylesheet"><meta property="og:image" content="https://loza.example/og.jpg"><style>.x{color:#00aa88}</style></head>
<body><img class="site-logo" src="/img/logo.svg" alt="Лоза"><h1>Стільці з дубу</h1><p>Меблі з натурального дерева, зроблені вручну.</p></body></html>`;
const BRAND_SITE = { ...SITE, 'https://loza.example/': BRAND_HOME, 'https://loza.example/s.css': BRAND_CSS, 'https://cdn.example/lib.css': '.l{color:#123456}' };
const BRAND_ANSWER = (o = {}) => JSON.stringify({
  identity: { colors: [{ hex: '#c2185b', role: 'primary' }, { hex: '#FF9800', role: 'accent' }, { hex: '#00ff00', role: 'secondary' }, { hex: '#c2185b', role: 'accent' }], fonts: [{ name: 'Playfair Display', role: 'headings' }, { name: 'Comic Sans', role: 'body' }, { name: 'inter', role: 'body' }], logo_url: 'https://loza.example/img/logo.svg', style: 'Тепла, ремісницька, натуральне дерево.', visual_donts: ['пластик'] },
  branding: { overview: 'Виробник меблів з дубу.', values: ['натуральність', 'ручна робота'], tagline: 'Дуб, який служить' },
  communication: { tone: 'Тепло, на «ви»', taboo_words: ['дешевий', 'акція'], taboo_claims: ['найкращі в Україні'], headline_avoid: ['крик капсом'] }, rules: ['Показувати дерево крупним планом'], ...o });
await test('brand dna: colours, fonts and logos are found by code in the page and its style sheets (named variables weigh more, grey is not a brand colour, generic fonts are skipped)', async () => {
  const net = fakeNet(BRAND_SITE);
  const assets = await collectBrandAssets({ url: 'https://loza.example/', ...net });
  assert.equal(assets.css.length, 2, 'the style sheets of the page are read, at most three'); assert.ok(net.hits.some((u) => u.endsWith('/s.css')));
  const s = extractBrandSignals(assets);
  assert.equal(s.theme_color, '#c2185b'); assert.equal(s.colors[0].hex, '#c2185b');
  assert.ok(s.colors.find((c) => c.hex === '#ff9800') && s.colors.find((c) => c.hex === '#00aa88'), 'a named variable and an inline style are read');
  assert.equal(s.colors.find((c) => c.hex === '#888888').chromatic, false); assert.equal(s.colors.find((c) => c.hex === '#c2185b').chromatic, true);
  assert.deepEqual(s.fonts.map((f) => f.name).sort(), ['Inter', 'Playfair Display'], 'Arial and serif are generic and skipped; a Google font and a font-face are found');
  assert.deepEqual(s.logos.map((l) => l.url), ['https://loza.example/img/logo.svg', 'https://loza.example/fav.png', 'https://loza.example/og.jpg']);
  assert.equal(normHex('#ABC'), '#aabbcc'); assert.equal(normHex('red'), null);
  const closed = await collectBrandAssets({ url: 'https://loza.example/', ...fakeNet({ ...BRAND_SITE, 'https://loza.example/s.css': undefined }) });
  assert.equal(closed.css.length, 1, 'a style sheet that does not load is skipped, the rest is read');
  await assert.rejects(() => collectBrandAssets({ url: 'http://localhost/', ...net }), /Внутрішні/);
});
await test('brand dna: the check keeps only what the code of the site confirms; nothing invented stays', async () => {
  const s = extractBrandSignals(await collectBrandAssets({ url: 'https://loza.example/', ...fakeNet(BRAND_SITE) }));
  const r = checkBrand(parseBrandAnswer('```json\n' + BRAND_ANSWER() + '\n```'), s, {});
  assert.deepEqual(r.dna.identity.colors, [{ hex: '#c2185b', role: 'primary' }, { hex: '#ff9800', role: 'accent' }], 'an invented colour and a repeat are dropped, the hex is normalised');
  assert.deepEqual(r.dna.identity.fonts, [{ name: 'Playfair Display', role: 'headings' }, { name: 'Inter', role: 'body' }], 'an invented font is dropped, a name is matched without case');
  assert.equal(r.dna.identity.logo_url, 'https://loza.example/img/logo.svg');
  assert.equal(r.dropped.length, 2); assert.match(r.dropped.join(' '), /#00ff00/); assert.match(r.dropped.join(' '), /Comic Sans/);
  assert.equal(checkBrand(parseBrandAnswer(BRAND_ANSWER({ identity: { logo_url: 'https://evil.example/x.png', colors: [], fonts: [] } })), s, {}).dna.identity.logo_url, '', 'a logo address that was not on the page is dropped');
  assert.equal(r.dna.reviewed, false); assert.equal(r.dna.source, 'site');
  assert.throws(() => parseBrandAnswer('Вибачте'), /не у форматі JSON/); assert.throws(() => parseBrandAnswer('{"a":'), /не у форматі JSON|пошкоджений/);
  const empty = checkBrand({}, s, {});
  assert.equal(brandGaps(empty.dna).length, 5, 'every empty field is a question to the manager'); assert.equal(dnaIsUsable(empty.dna), false); assert.equal(dnaIsUsable(r.dna), true);
});
await test('brand dna: the prompt forbids inventing; the notes of a person win over the profile, the profile fills only what the notes leave empty', async () => {
  const s = extractBrandSignals(await collectBrandAssets({ url: 'https://loza.example/', ...fakeNet(BRAND_SITE) }));
  const p = buildBrandPrompt({ signals: s, pages: [{ kind: 'home', title: 'Лоза', text: 'Меблі з дерева' }], notes: { tone: 'Строго', restrictions: 'Без слова «дешево»' } });
  assert.match(p.system, /ONLY from "signals.colors"/); assert.match(p.system, /Never invent/); assert.match(p.user, /#c2185b/); assert.match(p.user, /Строго/); assert.match(p.user, /Без слова/);
  const dna = checkBrand(parseBrandAnswer(BRAND_ANSWER()), s, {}).dna;
  const mine = brandForCreator(dna, { tone: 'Строго, на «ви»', brand: '', copy_rules: '' });
  assert.equal(mine.tone, 'Строго, на «ви»', 'the manager\'s tone wins'); assert.match(mine.colors_and_fonts, /primary #c2185b/); assert.match(mine.colors_and_fonts, /Playfair Display \(headings\)/);
  assert.deepEqual(mine.taboo_words, ['дешевий', 'акція']); assert.equal(brandForCreator({ identity: { colors: [], fonts: [] }, communication: {}, branding: {} }, {}), null, 'an empty profile gives nothing');
  assert.equal(manualNotes({ settings: { restrictions: 'не обіцяти знижок', inputs: { tone: { body: 'тепло' } } } }).restrictions, 'не обіцяти знижок');
});
await test('brand dna: banned words and claims are found in a text by whole words and phrases (never inside another word)', () => {
  const t = { taboo_words: ['дешевий', 'акція'], taboo_claims: ['найкращі в Україні'] };
  assert.deepEqual(tabooHits('Дешевий стілець! Акція — тільки сьогодні.', t), ['дешевий', 'акція']);
  assert.deepEqual(tabooHits('Ми — найкращі в Україні.', t), ['найкращі в Україні']);
  assert.deepEqual(tabooHits('Акційний стілець і дешевизна', t), [], 'a part of another word is not a hit');
  assert.deepEqual(tabooHits('Нічого', {}), []);
});
await test('brand dna: the skill reads the site, asks the model once, writes the section with the mark «потребує перевірки», makes a task for the gaps, costs are counted; without a site it waits', async () => {
  const { repo, ctx } = await setup({ handlers: createHandlers({ researcher: { brand_dna: brandDna } }) });
  Object.assign(ctx, fakeNet(BRAND_SITE)); const asked = [];
  ctx.ask = async (o) => { asked.push(o); return { costUsd: 0.03, text: BRAND_ANSWER() }; };
  repo.setMaterials(1, { settings: { restrictions: 'Не обіцяти знижок', inputs: {} }, assets: [] });
  await repo.enqueueRun({ project_id: 1, agent: 'researcher', skill: 'brand_dna' });
  await processTick(ctx);
  assert.equal(repo.T.runs[0].status, 'waiting'); assert.equal(asked.length, 0, 'no site, no model call');
  repo.setWebsite(1, 'https://loza.example');
  await processTick(ctx);
  assert.equal(repo.T.runs[0].status, 'done', repo.T.runs[0].error);
  assert.equal(asked.length, 1); assert.match(asked[0].user, /Не обіцяти знижок/);
  const s = await repo.readSection(1, 'brand_dna'); const c = s.version.content;
  assert.equal(c.identity.colors.length, 2); assert.equal(c.reviewed, false); assert.equal(c.has_manual_notes, true); assert.ok(c.signals.colors.length >= 3);
  assert.match(s.version.body, /потребує перевірки менеджером/); assert.match(s.version.body, /Відкинуто, бо не підтверджено кодом сайту/);
  assert.equal(repo.T.runs[0].cost_usd, 0.03); assert.equal(repo.T.runs[0].output.colors, 2);
  assert.ok(!repo.T.tasks.some((t) => t.title === 'Перевірити й доповнити ДНК бренду'), 'a complete profile makes no task');
  const gap = await setup({ handlers: createHandlers({ researcher: { brand_dna: brandDna } }) });
  Object.assign(gap.ctx, fakeNet(BRAND_SITE)); gap.ctx.ask = async () => ({ costUsd: 0, text: '{}' }); gap.repo.setWebsite(1, 'https://loza.example');
  await gap.repo.enqueueRun({ project_id: 1, agent: 'researcher', skill: 'brand_dna' }); await processTick(gap.ctx);
  assert.equal(gap.repo.T.runs[0].status, 'done'); assert.ok(gap.repo.T.tasks.some((t) => t.title === 'Перевірити й доповнити ДНК бренду' && /Кольори бренду не визначено/.test(t.evidence)), 'what is missing is a task of the manager, not an invention');
  const closed = await setup({ handlers: createHandlers({ researcher: { brand_dna: brandDna } }) });
  Object.assign(closed.ctx, fakeNet(BRAND_SITE, 'User-agent: *\nDisallow: /')); closed.ctx.ask = async () => { throw new Error('must not be called'); }; closed.repo.setWebsite(1, 'https://loza.example');
  await closed.repo.enqueueRun({ project_id: 1, agent: 'researcher', skill: 'brand_dna' }); await processTick(closed.ctx);
  assert.equal(closed.repo.T.runs[0].status, 'done'); assert.equal(closed.repo.T.runs[0].output.blocked_by_robots, true); assert.ok(closed.repo.T.tasks.some((t) => /вручну/.test(t.title)));
});
await test('brand dna and the Creator: the profile counts as the basics of the brand, fills the notes the card leaves empty, and the code rejects a text with a banned word', async () => {
  const dna = checkBrand(parseBrandAnswer(BRAND_ANSWER()), extractBrandSignals(await collectBrandAssets({ url: 'https://loza.example/', ...fakeNet(BRAND_SITE) })), {}).dna;
  const bare = { settings: { cta_mode: 'always', cta_text: 'Купити', inputs: {} }, assets: [{ kind: 'product', name: 'p.png', url: 'https://f.example/p.png' }] };
  assert.equal(inventoryOf(bare).brand.dna, false); assert.equal(inventoryOf(bare, dna).brand.dna, true);
  const inv = inventoryOf(bare, dna);
  assert.match(inv.notes.tone, /Тепло/); assert.match(inv.notes.brand, /c2185b/);
  const raw = { verdict: 'not_enough', reason: 'Немає відео', have: [], missing: [], shoot_list: [{ what: 'відео', format: '9:16' }] };
  assert.equal(checkMaterials({ materials: raw }, inventoryOf(bare)).verdict, 'not_enough', 'without the profile and without any notes the model\'s verdict stays');
  assert.equal(checkMaterials({ materials: raw }, inv).verdict, 'enough', 'a product photo and the profile are enough for static pictures');
  const goals = goalsOf(CR_BRIEF);
  const facts = gatherCreativeFacts({ brief: CR_BRIEF, materials: CR_MATERIALS, ideas: CR_IDEAS, audience: MAT_AUD, goals, brandDna: dna });
  assert.deepEqual(facts.brand.taboo_words, ['дешевий', 'акція']); assert.deepEqual(facts.brand.visual_donts, ['пластик']); assert.equal(facts.brand.tone, 'Тепло, на «ви»', 'the tone of the card wins');
  assert.equal(gatherCreativeFacts({ brief: CR_BRIEF, materials: CR_MATERIALS, ideas: CR_IDEAS, audience: MAT_AUD, goals }).brand.taboo_words, undefined, 'without a profile nothing changes');
  const pool = referencePool(CR_MATERIALS);
  const ok = checkCards(JSON.parse(CR_ANSWER()).cards, { facts, pool });
  assert.equal(ok.cards[0].status, 'planned');
  const bad = checkCards([CARD({ headline: 'Акція на AirPlug', primary_text: 'Дешевий сон за 150.' })], { facts, pool });
  assert.equal(bad.cards[0].status, 'needs_check'); assert.match(bad.cards[0].problems.join(' '), /заборонене клієнтом слово або твердження: дешевий, акція/);
  assert.match(CREATIVES_PROMPT, /taboo_words/); assert.match(CREATIVES_PROMPT, /visual_donts/);
});
await test('brand dna: the orchestrator makes it at the start of the research, the ideas wait only while it is being made, a failed or missing one never stops the stage', () => {
  const base = { now: new Date('2026-11-25T10:00:00Z'), paused: false };
  const enq = (a) => a.filter((x) => x.type === 'enqueue').map((x) => `${x.agent}/${x.skill}`);
  const run = (id, status) => ({ id, agent: 'researcher', skill: 'brand_dna', status, input: {} });
  const secs = { brief: { hasCurrent: true }, site: { hasCurrent: true }, audience: { hasCurrent: true }, competitors: { hasCurrent: true }, unit_economy: { hasCurrent: true } };
  const st = { stage: 1, paused: false, has_data: false };
  assert.deepEqual(enq(planNext({ ...base, state: st, sections: secs, runs: [] })), ['researcher/brand_dna'], 'a project already in the research gets it too, and the ideas wait for it');
  assert.deepEqual(enq(planNext({ ...base, state: st, sections: secs, runs: [run(1, 'running')] })), [], 'the ideas wait while it is made');
  assert.deepEqual(enq(planNext({ ...base, state: st, sections: { ...secs, brand_dna: { hasCurrent: true } }, runs: [run(1, 'done')] })), ['creator/materials_ideas'], 'when it is ready the ideas start');
  assert.deepEqual(enq(planNext({ ...base, state: st, sections: secs, runs: [run(1, 'failed'), run(2, 'failed'), run(3, 'failed')] })), ['creator/materials_ideas'], 'three failures stop it and the ideas are not blocked');
  const need = planNext({ ...base, state: st, sections: { ...secs, materials: { hasCurrent: true }, ideas: { hasCurrent: true } }, runs: [run(1, 'failed'), run(2, 'failed'), run(3, 'failed')] });
  assert.ok(need.some((a) => a.type === 'set_stage' && a.stage === 2), 'the stage goes on without the profile');
});
await test('brand dna: the section is in the dossier, the skill is the Researcher\'s, and the migration allows the key', () => {
  assert.equal(sectionName('brand_dna'), 'ДНК бренду');
  assert.ok(ACTIVE_AGENTS.find((a) => a.key === 'researcher').skills.some((s) => s.key === 'brand_dna') && ACTIVE_AGENTS.find((a) => a.key === 'researcher').writes.includes('ДНК бренду'));
  const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
  assert.match(fs.readFileSync(path.join(root, 'supabase/migrations/20261072000000_workflow_brand_dna.sql'), 'utf8'), /'monthly_plan','brand_dna'/);
});
await test('brand dna page: the dossier shows the profile as a card (variant A) and edits it in a form (variant B) that keeps the source of every field and never lets the agent overwrite a human version', () => {
  const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
  const dossier = fs.readFileSync(path.join(root, 'src/components/Workflow/Dossier.jsx'), 'utf8');
  const view = fs.readFileSync(path.join(root, 'src/components/Workflow/BrandDnaView.jsx'), 'utf8');
  assert.match(dossier, /BrandDnaView/); assert.match(dossier, /BrandDnaEditor/); assert.match(dossier, /sec\.key === 'brand_dna' && !!current\?\.content\?\.identity/);
  assert.match(dossier, /saveHumanVersion\(projectId, 'brand_dna'/, 'a human version is saved by the person');
  assert.match(view, /next\.edited = /); assert.match(view, /reviewed: true/); assert.match(view, /з сайту/); assert.match(view, /ваше/);
});
// ---------------------------------------------------------------- Zeely item 2 (owner's decision 2026-11-25): a batch of static ads for one product, as many as the image limit of the project allows
await test('batch: the count is clamped to 20, cut to what the limit pays for, every card gets its own idea and a format by the cycle, names continue where the last batch stopped', () => {
  assert.equal(clampCount(undefined), BATCH_DEFAULT); assert.equal(clampCount('x'), BATCH_DEFAULT); assert.equal(clampCount(0), BATCH_DEFAULT); assert.equal(clampCount(7.9), 7); assert.equal(clampCount(500), BATCH_MAX);
  assert.deepEqual(affordableCount({ count: 10, remaining: 3, perImage: 0.5 }), { count: 6, limitedBy: 'limit', can: 6 });
  assert.deepEqual(affordableCount({ count: 4, remaining: 3, perImage: 0.5 }), { count: 4, limitedBy: null });
  assert.equal(affordableCount({ count: 4, remaining: 0.4, perImage: 0.5 }).count, 0); assert.equal(affordableCount({ count: 4, remaining: 0, perImage: null }).count, 4, 'no generator: the texts cost nothing');
  assert.equal(affordableCount({ count: 3, remaining: 1.5, perImage: 0.5 }).count, 3, 'a price that divides the rest exactly still fits (no rounding loss)');
  const ideas = [{ id: 'i1' }, { id: 'i2' }, { id: 'i3' }];
  const g = buildBatchGoals({ product: 'AirPlug', count: 5, ideas, existing: [{ product: 'AirPlug', idea_id: 'i1', goal: 'Продати хіт' }] });
  assert.deepEqual(g.map((x) => x.assigned_idea), ['i2', 'i3', 'i1', 'i2', 'i3'], 'ideas that were not used for this product come first, then the cycle goes on');
  assert.deepEqual(g.map((x) => x.format_hint), ['4:5', '9:16', '1:1', '4:5', '9:16']); assert.equal(g[0].goal, 'Пакет «AirPlug» №1');
  const next = buildBatchGoals({ product: 'AirPlug', count: 2, ideas, existing: g.map((x) => ({ ...x, idea_id: x.assigned_idea })) });
  assert.deepEqual(next.map((x) => x.goal), ['Пакет «AirPlug» №6', 'Пакет «AirPlug» №7'], 'the numbers go on'); assert.equal(next[0].format_hint, '1:1', 'the format cycle goes on too: five cards used 4:5, 9:16, 1:1, 4:5, 9:16');
  assert.equal(buildBatchGoals({ product: 'X', count: 1, ideas: [] })[0].assigned_idea, '', 'no ideas: the card is the model\'s own');
  const cards = markDuplicates([{ headline: 'Тиша вдома!', tag: 'a' }, { headline: 'тиша вдома', tag: 'b' }, { headline: 'Інше', tag: 'c' }], [{ headline: 'Інше', tag: 'старе' }]);
  assert.equal(cards[0].status, undefined); assert.equal(cards[1].status, 'needs_check'); assert.match(cards[1].problems[0], /повторює інший креатив: «a»/); assert.equal(cards[2].status, 'needs_check'); assert.match(cards[2].problems[0], /«старе»/);
});
await test('batch: the plan of the code (idea, format) wins over the answer of the model; without a plan the old behaviour stays', () => {
  const goals = [{ goal: 'Пакет «AirPlug» №1', product: 'AirPlug', assigned_idea: 'i1', format_hint: '9:16' }];
  const facts = gatherCreativeFacts({ brief: CR_BRIEF, materials: CR_MATERIALS, ideas: CR_IDEAS, audience: MAT_AUD, goals });
  const r = checkCards([CARD({ idea_id: '', format: '1:1' })], { facts, pool: referencePool(CR_MATERIALS) }).cards[0];
  assert.equal(r.idea_id, 'i1'); assert.equal(r.ratio, '9:16'); assert.ok(!r.notes.some((n) => /Формат/.test(n)));
  assert.match(CREATIVES_PROMPT, /assigned_idea/); assert.match(CREATIVES_PROMPT, /never repeat a headline/);
  const plain = checkCards([CARD({ idea_id: '', format: '1:1' })], { facts: gatherCreativeFacts({ brief: CR_BRIEF, materials: CR_MATERIALS, ideas: CR_IDEAS, audience: MAT_AUD, goals: goalsOf(CR_BRIEF) }), pool: referencePool(CR_MATERIALS) }).cards[0];
  assert.equal(plain.ratio, '1:1'); assert.equal(plain.idea_id, '');
});
const batchSetup = async (opts = {}) => {
  const s = await setup({ handlers: createHandlers({ creator: { batch_creatives: batchCreatives } }) });
  s.repo.setMaterials(1, CR_MATERIALS);
  await s.repo.writeSectionVersion(1, 'brief', { author_kind: 'human', author: 'm@x', body: '', content: CR_BRIEF.content });
  await s.repo.writeSectionVersion(1, 'ideas', { author_kind: 'agent', author: 'creator', body: 'i', content: CR_IDEAS });
  await s.repo.writeSectionVersion(1, 'audience', { author_kind: 'agent', author: 'researcher', body: 'a', content: MAT_AUD });
  await s.repo.writeSectionVersion(1, 'materials', { author_kind: 'agent', author: 'creator', body: 'm', content: { verdict: opts.verdict || 'enough' } });
  s.asked = [];
  s.ctx.ask = opts.ask === undefined ? async (o) => {
    s.asked.push(o);
    const f = JSON.parse(o.user.slice(o.user.indexOf('{'), o.user.lastIndexOf('}') + 1));
    return { costUsd: 0.2, text: JSON.stringify({ cards: f.goals.map((g) => CARD({ goal_index: g.goal_index, idea_id: '', format: '1:1', headline: opts.sameHeadline ? 'Один заголовок' : `Заголовок ${g.goal}`, angle: `кут ${g.goal_index}` })) }) };
  } : opts.ask;
  s.ctx.hf = opts.hf === undefined ? fakeHf() : opts.hf; s.ctx.imageWaitMs = 0;
  if (opts.cap != null) await s.repo.setProjectFlag(1, { cost_cap_usd: opts.cap });
  await s.repo.enqueueRun({ project_id: 1, agent: 'creator', skill: 'batch_creatives', input: opts.input || { product: 'AirPlug', count: 4 }, trigger: 'manual' });
  return s;
};
await test('batch: the skill makes the cards of one product with their own ideas and formats, pictures inside the limit, and writes them to the creatives section with a log of the batch', async () => {
  const s = await batchSetup({ cap: 100 });
  await processTick(s.ctx);
  const run = s.repo.T.runs[0]; assert.equal(run.status, 'done', run.error);
  const c = (await s.repo.readSection(1, 'creatives')).version.content;
  assert.equal(c.items.length, 4); assert.deepEqual(c.items.map((x) => x.goal), [1, 2, 3, 4].map((n) => `Пакет «AirPlug» №${n}`));
  assert.deepEqual(c.items.map((x) => x.ratio), ['4:5', '9:16', '1:1', '4:5'], 'the format is the plan of the code, whatever the model wrote');
  assert.ok(c.items.every((x) => x.idea_id === 'i1' && x.status === 'ready' && x.image_url), 'every card has its idea and its picture'); assert.deepEqual(c.items.map((x) => x.id), ['c1', 'c2', 'c3', 'c4']);
  assert.equal(c.batches.length, 1); assert.equal(c.batches[0].asked, 4); assert.equal(c.batches[0].made, 4); assert.equal(c.batches[0].limited_by, null);
  assert.equal(s.ctx.hf.calls.submit.length, 4); assert.equal(run.cost_usd, 0.2 + 4 * 0.5, 'the model and the pictures are charged to the run');
  assert.equal(s.asked.length, 1, 'one model call for the whole batch'); assert.ok(s.asked[0].maxTokens >= 1500 + 520 * 4);
  // a second batch continues the numbering and keeps the cards that exist
  await s.repo.enqueueRun({ project_id: 1, agent: 'creator', skill: 'batch_creatives', input: { product: 'airplug', count: 2 }, trigger: 'manual' });
  await processTick(s.ctx);
  assert.equal(s.repo.T.runs[1].status, 'done', s.repo.T.runs[1].error);
  const c2 = (await s.repo.readSection(1, 'creatives')).version.content;
  assert.equal(c2.items.length, 6); assert.equal(c2.items[4].goal, 'Пакет «AirPlug» №5'); assert.equal(c2.batches.length, 2); assert.equal(c2.items[4].id, 'c5');
  assert.ok(c2.items.slice(4).every((x) => /заголовок повторює/.test((x.problems || []).join(' ')) === false), 'different headlines are not repeats');
});
await test('batch: the limit of the project cuts the batch (20 asked, 10 paid), nothing is made when not even one picture fits, a product not in the brief is an error, a repeated headline goes to the manager', async () => {
  const cut = await batchSetup({ cap: 5.4, input: { product: 'AirPlug', count: 50 } });
  await processTick(cut.ctx);
  const c = (await cut.repo.readSection(1, 'creatives')).version.content;
  assert.equal(c.items.length, 10, 'a limit of 5.4 at 0.5 per picture pays for 10 cards, 20 were the most that could be asked');
  assert.equal(c.batches[0].asked, 20); assert.equal(c.batches[0].limited_by, 'limit'); assert.ok(cut.repo.T.steps.some((x) => /Ліміт проєкту дозволяє 10 з 20/.test(x.title)));
  assert.equal(cut.ctx.hf.calls.submit.length, 10);
  const none = await batchSetup({ cap: 0.3 });
  await processTick(none.ctx);
  assert.equal(none.repo.T.runs[0].status, 'done'); assert.equal(none.asked.length, 0, 'no money, no model call'); assert.equal(none.repo.T.runs[0].output.limited, true);
  assert.ok(none.repo.T.tasks.some((t) => t.title === 'Підняти ліміт витрат проєкту на картинки'));
  const noProduct = await batchSetup({ input: { product: 'Чужий товар', count: 3 } });
  await processTick(noProduct.ctx);
  assert.notEqual(noProduct.repo.T.runs[0].status, 'done'); assert.match(noProduct.repo.T.runs[0].error, /Товару «Чужий товар» немає в брифі/); assert.equal(noProduct.asked.length, 0);
  const none2 = await batchSetup({ input: {} });
  await processTick(none2.ctx); assert.match(none2.repo.T.runs[0].error, /Не вказано товар/);
  const same = await batchSetup({ cap: 100, sameHeadline: true });
  await processTick(same.ctx);
  const sc = (await same.repo.readSection(1, 'creatives')).version.content;
  assert.deepEqual(sc.items.map((x) => x.status), ['ready', 'needs_check', 'needs_check', 'needs_check']);
  assert.match(sc.items[1].problems.join(' '), /заголовок повторює інший креатив/);
});
await test('batch: without the materials it waits, without the model it fails clearly, without a generator the texts are made and no limit is applied', async () => {
  const b = await batchSetup({ verdict: 'not_enough', ask: async () => { throw new Error('must not be called'); } });
  await processTick(b.ctx); assert.equal(b.repo.T.runs[0].status, 'waiting'); assert.equal(b.repo.T.runs[0].state.blocked_on, 'materials');
  const m = await batchSetup({ ask: null }); await processTick(m.ctx); assert.equal(m.repo.T.runs[0].status, 'failed'); assert.match(m.repo.T.runs[0].error, /ANTHROPIC_API_KEY/);
  const t = await batchSetup({ hf: null, input: { product: 'AirPlug', count: 3 } }); await processTick(t.ctx);
  assert.equal(t.repo.T.runs[0].status, 'done', t.repo.T.runs[0].error);
  const tc = (await t.repo.readSection(1, 'creatives')).version.content;
  assert.equal(tc.items.length, 3); assert.ok(tc.items.every((x) => x.status === 'planned' && !x.image_url)); assert.match(tc.open.join(' '), /Higgsfield не налаштовано/);
});
await test('batch: the skill is the Creator\'s, a person starts it from the section of the creatives (product and count), the panel stops while an agent proposal waits', () => {
  assert.ok(ACTIVE_AGENTS.find((a) => a.key === 'creator').skills.some((s) => s.key === 'batch_creatives'));
  const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
  const dossier = fs.readFileSync(path.join(root, 'src/components/Workflow/Dossier.jsx'), 'utf8'), panel = fs.readFileSync(path.join(root, 'src/components/Workflow/BatchPanel.jsx'), 'utf8');
  assert.match(dossier, /BatchPanel/); assert.match(dossier, /sec\.key === 'creatives'/); assert.match(panel, /requestRun\(projectId, 'creator', 'batch_creatives'/); assert.match(panel, /BATCH_MAX/); assert.match(panel, /proposals/);
});
// ---------------------------------------------------------------- Zeely item 3 (owner's decision 2026-11-25): variations of an ad that worked (vary / merge / localize)
const VSRC = (id, o = {}) => ({ id, goal: 'Продати хіт', product: 'AirPlug', segment: 'Молоді родини', idea_id: 'i1', angle: 'подарунок', ratio: '4:5', format_label: 'картинка 4:5', offer: 'AirPlug + free 50 ml oil', headline: 'AirPlug і олія в подарунок', primary_text: 'Тихий сон за 150: дарунок до замовлення.', cta: 'Купити', visual_prompt: 'A calm bedroom, the earplug case on a nightstand', references: [{ n: 1, kind: 'product', url: 'https://f.example/p1.png' }], image_url: `https://img.example/${id}.png`, path: `p/${id}.png`, status: 'ready', version: 1, job: null, cost_usd: 0.5, tag: 'x', ...o });
const VFACTS = () => { const f = gatherCreativeFacts({ brief: CR_BRIEF, materials: CR_MATERIALS, ideas: CR_IDEAS, audience: MAT_AUD, goals: [{ goal: 'Продати хіт', product: 'AirPlug' }] }); f.brand.taboo_words = ['дешевий']; return f; };
await test('variations: the request is checked in words of the manager (what to do, how many sources, which elements may change, which language); counts are clamped', () => {
  assert.throws(() => normalizeRequest({}), /Не вказано, що робити/);
  assert.throws(() => normalizeRequest({ mode: 'vary', source: 'c1', vary: [] }), /хоча б один елемент/); assert.throws(() => normalizeRequest({ mode: 'vary', vary: ['headline'] }), /один креатив-джерело/);
  assert.throws(() => normalizeRequest({ mode: 'merge', sources: ['c1'] }), /рівно два різні/); assert.throws(() => normalizeRequest({ mode: 'merge', sources: ['c1', 'c1'] }), /рівно два різні/);
  assert.throws(() => normalizeRequest({ mode: 'localize', source: 'c1', language: 'xx' }), /Оберіть мову/);
  assert.deepEqual(normalizeRequest({ mode: 'vary', source: 'c1', vary: ['headline', 'bogus', 'cta'], count: 99 }), { mode: 'vary', sources: ['c1'], vary: ['headline', 'cta'], count: VAR_MAX, language: '' });
  assert.equal(normalizeRequest({ mode: 'vary', source: 'c1', vary: ['angle'] }).count, 3); assert.equal(normalizeRequest({ mode: 'merge', sources: ['c1', 'c2'], count: 9 }).count, MERGE_MAX);
  assert.deepEqual(normalizeRequest({ mode: 'localize', source: 'c1', language: 'en', count: 5 }), { mode: 'localize', sources: ['c1'], vary: ['headline', 'primary_text'], count: 1, language: 'en' });
  assert.equal(needsPicture(normalizeRequest({ mode: 'vary', source: 'c1', vary: ['headline', 'angle', 'cta'] })), false); assert.equal(needsPicture(normalizeRequest({ mode: 'vary', source: 'c1', vary: ['format'] })), true);
  assert.equal(needsPicture(normalizeRequest({ mode: 'merge', sources: ['c1', 'c2'] })), true); assert.equal(needsPicture(normalizeRequest({ mode: 'localize', source: 'c1', language: 'pl' })), false);
});
await test('variations: what is locked comes from the source whatever the model wrote; numbers, banned words, a copy of the source and a repeat are caught; a variant without a new picture keeps the picture of the source', () => {
  const facts = VFACTS(), src = VSRC('c1');
  const req = normalizeRequest({ mode: 'vary', source: 'c1', vary: ['headline', 'angle'], count: 4 });
  const raw = [
    { headline: 'Тиша вдома', angle: 'спокій', primary_text: 'ЗМІНЕНО', cta: 'Дізнатись більше', format: '9:16', visual_prompt: 'other scene', offer: 'Set $280' },
    { headline: 'Тиша вдома', angle: 'сон' },
    { headline: 'Дешевий сон', angle: 'економія' },
    { headline: src.headline, angle: src.angle },
    { headline: 'Ще один', angle: 'ще' },
  ];
  const r = checkVariations(raw, { req, sources: [src], facts, existing: [] });
  assert.equal(r.cards.length, 4, 'at most the asked count');
  const a = r.cards[0];
  assert.equal(a.headline, 'Тиша вдома'); assert.equal(a.angle, 'спокій');
  assert.equal(a.primary_text, src.primary_text); assert.equal(a.cta, 'Купити'); assert.equal(a.ratio, '4:5'); assert.equal(a.visual_prompt, src.visual_prompt); assert.equal(a.offer, src.offer, 'locked fields are the source\'s, not the model\'s');
  assert.equal(a.status, 'ready'); assert.equal(a.image_url, src.image_url); assert.equal(a.variation.of[0], 'c1'); assert.match(a.tag, /вар\. 1 від c1$/);
  assert.equal(r.cards[1].status, 'needs_check'); assert.match(r.cards[1].problems.join(' '), /заголовок повторює інший креатив/, 'two variants with the same headline');
  assert.match(r.cards[2].problems.join(' '), /заборонене клієнтом слово або твердження: дешевий/);
  assert.match(r.cards[3].problems.join(' '), /нічим не відрізняється від джерела/);
  const stray = checkVariations([{ headline: 'Сон', primary_text: 'Тихий сон за 999.', angle: 'x' }], { req: normalizeRequest({ mode: 'vary', source: 'c1', vary: ['primary_text'] }), sources: [src], facts, existing: [] }).cards[0];
  assert.match(stray.problems.join(' '), /число без джерела: 999/); assert.equal(stray.headline, src.headline);
  const fmt = checkVariations([{ format: '9:16', cta: 'Дізнатись більше' }], { req: normalizeRequest({ mode: 'vary', source: 'c1', vary: ['format', 'cta'] }), sources: [src], facts, existing: [] }).cards[0];
  assert.equal(fmt.ratio, '9:16'); assert.equal(fmt.cta, 'Дізнатись більше'); assert.equal(fmt.status, 'planned', 'a new format needs a new picture'); assert.equal(fmt.image_url, ''); assert.match(fmt.tag, /картинка 9:16/);
  const badCta = checkVariations([{ cta: 'Беріть!', format: '7:7' }], { req: normalizeRequest({ mode: 'vary', source: 'c1', vary: ['format', 'cta'] }), sources: [src], facts, existing: [] }).cards[0];
  assert.equal(badCta.cta, 'Купити'); assert.equal(badCta.ratio, '4:5'); assert.equal(badCta.notes.length, 2);
  const loc = checkVariations([{ headline: 'AirPlug and oil as a gift', primary_text: 'Quiet sleep for 150: a gift with the order.' }], { req: normalizeRequest({ mode: 'localize', source: 'c1', language: 'en' }), sources: [src], facts, existing: [] }).cards[0];
  assert.equal(loc.status, 'ready'); assert.equal(loc.image_url, src.image_url); assert.equal(loc.language, 'en'); assert.equal(loc.cta, 'Купити'); assert.match(loc.tag, /мова en$/); assert.deepEqual(loc.problems, []);
  const badLoc = checkVariations([{ headline: 'AirPlug as a gift', primary_text: 'Quiet sleep for 190.' }], { req: normalizeRequest({ mode: 'localize', source: 'c1', language: 'en' }), sources: [src], facts, existing: [] }).cards[0];
  assert.match(badLoc.problems.join(' '), /числа в перекладі не збігаються/);
  const src2 = VSRC('c2', { references: [{ n: 2, kind: 'product', url: 'https://f.example/p2.png' }, { n: 3, kind: 'logo', url: 'https://f.example/l.png' }], ratio: '9:16', format_label: 'картинка 9:16' });
  const mg = checkVariations([{ headline: 'Тиша разом', primary_text: 'Сон за 150 для всієї родини.', angle: 'родина', visual_prompt: 'Family asleep' }], { req: normalizeRequest({ mode: 'merge', sources: ['c1', 'c2'] }), sources: [src, src2], facts, existing: [] }).cards[0];
  assert.deepEqual(mg.references.map((x) => x.n), [1, 2, 3]); assert.equal(mg.status, 'planned'); assert.equal(mg.image_url, ''); assert.deepEqual(mg.variation.of, ['c1', 'c2']); assert.match(mg.tag, /злиття c1\+c2$/);
  assert.match(SYSTEM_VARIATIONS, /localize/); assert.match(SYSTEM_VARIATIONS, /never repeat a headline/);
});
const varSetup = async (opts = {}) => {
  const s = await setup({ handlers: createHandlers({ creator: { ad_variations: adVariations } }) });
  s.repo.setMaterials(1, CR_MATERIALS);
  await s.repo.writeSectionVersion(1, 'brief', { author_kind: 'human', author: 'm@x', body: '', content: CR_BRIEF.content });
  await s.repo.writeSectionVersion(1, 'ideas', { author_kind: 'agent', author: 'creator', body: 'i', content: CR_IDEAS });
  await s.repo.writeSectionVersion(1, 'audience', { author_kind: 'agent', author: 'researcher', body: 'a', content: MAT_AUD });
  await s.repo.writeSectionVersion(1, 'creatives', { author_kind: 'agent', author: 'creator', body: 'c', content: { schema: 1, branch: 'A', items: opts.items || [VSRC('c1'), VSRC('c2', { headline: 'Тиша за 150', segment: '', idea_id: '' })], spent_usd: 1, limit_usd: 5, open: [] } });
  s.asked = [];
  s.ctx.ask = opts.ask === undefined ? async (o) => {
    s.asked.push(o);
    const f = JSON.parse(o.user.slice(o.user.indexOf('{'), o.user.lastIndexOf('}') + 1));
    const cards = Array.from({ length: f.count }, (_, i) => ({ headline: f.mode === 'localize' ? 'AirPlug and oil as a gift' : `Заголовок ${i + 1}`, primary_text: f.mode === 'localize' ? 'Quiet sleep for 150: a gift with the order.' : 'Тихий сон за 150, кожну ніч.', angle: `кут ${i + 1}`, cta: 'Купити', visual_prompt: `Scene ${i + 1}`, format: '9:16' }));
    return { costUsd: 0.1, text: JSON.stringify({ cards }) };
  } : opts.ask;
  s.ctx.hf = opts.hf === undefined ? fakeHf() : opts.hf; s.ctx.imageWaitMs = 0;
  if (opts.cap != null) await s.repo.setProjectFlag(1, { cost_cap_usd: opts.cap });
  await s.repo.enqueueRun({ project_id: 1, agent: 'creator', skill: 'ad_variations', input: opts.input, trigger: 'manual' });
  return s;
};
await test('variations: texts only (no new picture) cost nothing but the model; the cards keep the picture, the lock and a log of what was changed', async () => {
  const s = await varSetup({ input: { mode: 'vary', source: 'c1', vary: ['headline', 'angle'], count: 3 } });
  await processTick(s.ctx);
  const run = s.repo.T.runs[0]; assert.equal(run.status, 'done', run.error);
  const c = (await s.repo.readSection(1, 'creatives')).version.content;
  assert.equal(c.items.length, 5); const n = c.items.slice(2);
  assert.deepEqual(n.map((x) => x.id), ['c3', 'c4', 'c5']); assert.ok(n.every((x) => x.status === 'ready' && x.image_url === 'https://img.example/c1.png' && x.primary_text === VSRC('c1').primary_text && x.variation.of[0] === 'c1'));
  assert.deepEqual(n.map((x) => x.headline), ['Заголовок 1', 'Заголовок 2', 'Заголовок 3']);
  assert.equal(s.ctx.hf.calls.submit.length, 0, 'no picture is bought'); assert.equal(run.cost_usd, 0.1); assert.equal(c.batches[0].mode, 'vary'); assert.deepEqual(c.batches[0].changed, ['headline', 'angle']);
  assert.match(s.asked[0].system, /Mode "vary"/); assert.match(s.asked[0].user, /"write"/);
  // the picture of the winner is not asked for again, and a second round of variations numbers on
  await s.repo.enqueueRun({ project_id: 1, agent: 'creator', skill: 'ad_variations', input: { mode: 'vary', source: 'c1', vary: ['headline'], count: 1 }, trigger: 'manual' });
  await processTick(s.ctx);
  const c2 = (await s.repo.readSection(1, 'creatives')).version.content;
  assert.equal(c2.items.length, 6); assert.match(c2.items[5].tag, /вар\. 4 від c1$/);
  assert.equal(c2.items[5].headline, 'Заголовок 1'); assert.equal(c2.items[5].status, 'needs_check', 'the same headline as the first round is sent to the manager');
});
await test('variations: a new scene or format needs pictures: they are cut to the image limit; a merge builds on two cards; a localization keeps the picture; not even one picture fits → nothing is made', async () => {
  const cut = await varSetup({ cap: 1.3, input: { mode: 'vary', source: 'c1', vary: ['visual_prompt', 'headline'], count: 5 } });
  await processTick(cut.ctx);
  const c = (await cut.repo.readSection(1, 'creatives')).version.content;
  assert.equal(c.items.length, 4, 'two old cards and two new ones: 1.3 at 0.5 per picture pays for two'); assert.equal(c.batches[0].asked, 5); assert.equal(c.batches[0].limited_by, 'limit');
  assert.ok(c.items.slice(2).every((x) => x.status === 'ready' && x.image_url && x.image_url !== 'https://img.example/c1.png'), 'new pictures were made'); assert.equal(cut.ctx.hf.calls.submit.length, 2);
  assert.ok(cut.repo.T.steps.some((x) => /Ліміт проєкту дозволяє 2 з 5/.test(x.title)));
  const mg = await varSetup({ cap: 100, input: { mode: 'merge', sources: ['c1', 'c2'], count: 2 } });
  await processTick(mg.ctx);
  assert.equal(mg.repo.T.runs[0].status, 'done', mg.repo.T.runs[0].error);
  const m = (await mg.repo.readSection(1, 'creatives')).version.content;
  assert.equal(m.items.length, 4); assert.ok(m.items.slice(2).every((x) => x.variation.mode === 'merge' && x.variation.of.join() === 'c1,c2' && x.image_url && x.image_url !== 'https://img.example/c1.png'));
  assert.match(mg.asked[0].user, /"id": "c2"/);
  const lo = await varSetup({ input: { mode: 'localize', source: 'c1', language: 'en' } });
  await processTick(lo.ctx);
  const l = (await lo.repo.readSection(1, 'creatives')).version.content;
  assert.equal(l.items.length, 3); assert.equal(l.items[2].language, 'en'); assert.equal(l.items[2].image_url, 'https://img.example/c1.png'); assert.equal(l.items[2].status, 'ready'); assert.equal(lo.ctx.hf.calls.submit.length, 0);
  assert.match(lo.asked[0].user, /англійська \(en\)/);
  const none = await varSetup({ cap: 0.3, input: { mode: 'vary', source: 'c1', vary: ['format'], count: 2 } });
  await processTick(none.ctx);
  assert.equal(none.repo.T.runs[0].output.limited, true); assert.equal(none.asked.length, 0, 'no money, no model call'); assert.ok(none.repo.T.tasks.some((t) => t.title === 'Підняти ліміт витрат проєкту на картинки'));
});
await test('variations: a missing card, a card without words, a bad request and a missing model are clear errors; the identical picture request of two variants never shares one job key', async () => {
  const lost = await varSetup({ input: { mode: 'vary', source: 'c9', vary: ['headline'] } }); await processTick(lost.ctx);
  assert.notEqual(lost.repo.T.runs[0].status, 'done'); assert.match(lost.repo.T.runs[0].error, /Креатива c9 немає/); assert.equal(lost.asked.length, 0);
  const bare = await varSetup({ items: [VSRC('c1', { headline: '' })], input: { mode: 'vary', source: 'c1', vary: ['headline'] } }); await processTick(bare.ctx); assert.match(bare.repo.T.runs[0].error, /без заголовка чи тексту/);
  const bad = await varSetup({ input: { mode: 'merge', sources: ['c1'] } }); await processTick(bad.ctx); assert.match(bad.repo.T.runs[0].error, /рівно два різні/);
  const nom = await varSetup({ ask: null, input: { mode: 'vary', source: 'c1', vary: ['headline'] } }); await processTick(nom.ctx); assert.match(nom.repo.T.runs[0].error, /ANTHROPIC_API_KEY/);
  const s = await varSetup({ cap: 100, input: { mode: 'vary', source: 'c1', vary: ['visual_prompt'], count: 3 } }); await processTick(s.ctx);
  const keys = s.ctx.hf.calls.submit.map((x) => x.key);
  assert.equal(new Set(keys).size, 3, 'three variants of one goal have three different keys (Higgsfield would give them one picture otherwise)'); assert.ok(keys.every((k) => /^[\x20-\x7e]+$/.test(k)));
});
await test('variations: the skill is the Creator\'s and a person starts it from the section of the creatives (mode, sources, locks, count, language)', () => {
  assert.ok(ACTIVE_AGENTS.find((a) => a.key === 'creator').skills.some((s) => s.key === 'ad_variations'));
  const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
  const dossier = fs.readFileSync(path.join(root, 'src/components/Workflow/Dossier.jsx'), 'utf8'), panel = fs.readFileSync(path.join(root, 'src/components/Workflow/VariationsPanel.jsx'), 'utf8');
  assert.match(dossier, /VariationsPanel/); assert.match(panel, /requestRun\(projectId, 'creator', 'ad_variations'/); assert.match(panel, /VAR_MAX/); assert.match(panel, /LANGS/); assert.match(panel, /ELEMENTS/); assert.match(panel, /proposals/);
});
// ---------------------------------------------------------------- Zeely item 4 (owner's decision 2026-11-25): «швидкий старт»: a link is enough, the brief is DRAFTED from the site, the first launch is PAUSED
await test('quick start: the address is cleaned and refused when it cannot be a public site; the project gets a name from the address', () => {
  assert.equal(normalizeSite('loza.example'), 'https://loza.example'); assert.equal(normalizeSite(' https://www.loza.example/shop/ '), 'https://www.loza.example/shop');
  assert.equal(normalizeSite('http://loza.example/?a=1'), 'http://loza.example');
  for (const bad of ['', 'loza', 'ftp://loza.example', 'http://user:pw@loza.example', 'http://127.0.0.1/', 'два слова.com', 'javascript:alert(1)']) assert.equal(normalizeSite(bad), null, bad);
  assert.equal(nameFromSite('https://www.loza-mebli.com.ua'), 'Loza mebli'); assert.equal(nameFromSite('nope'), '');
  assert.equal(QUICK_STEPS.length, 5); assert.match(QUICK_STEPS.join(' '), /PAUSED/);
});
await test('brief draft: the currency, the price lines and the numbers are counted by code from the pages', async () => {
  assert.equal(detectCurrency('Ціна 3200 грн, акція 2900 ₴, $5'), 'UAH'); assert.equal(detectCurrency('only $5 and $7'), 'USD'); assert.equal(detectCurrency('нічого'), null);
  assert.equal(detectCurrency('10 грн і 10 $'), null, 'a tie is unknown: the manager says');
  const d = await collectSiteData({ website: 'loza.example', ...fakeNet() });
  const lines = priceLines(d.pages); assert.ok(lines.length >= 3 && lines.every((l) => /\d/.test(l.line))); assert.ok(lines.some((l) => /3200 грн/.test(l.line)));
  const n = numbersSet('Ціна 3 200 грн, було 3,200.00 і 2900,50'); assert.ok(n.has(3200) && n.has(2900.5));
});
const DRAFT_ANSWER = (o = {}) => JSON.stringify({ products: [{ name: 'Стілець Дуб', price: 3200 }, { name: 'Диван Хмара', price: 5000 }, { name: 'Стілець Лоза', price: 4100 }, { name: 'стілець дуб', price: 3200 }], audience: 'Ті, хто шукає меблі з натурального дерева.', geo: 'Україна', goals: [{ goal: 'Продати Стілець Дуб', product: 'Стілець Дуб' }, { goal: 'Привести покупців на каталог', product: 'Чужий товар' }, { goal: '', product: '' }], ...o });
await test('brief draft: only products and prices the site shows go in, the rest stays empty and becomes a task; everything is an assumption with a source', async () => {
  const d = await collectSiteData({ website: 'loza.example', ...fakeNet() });
  const r = checkBriefDraft(parseBriefDraftAnswer('```json\n' + DRAFT_ANSWER() + '\n```'), { corpus: corpusOf(d.pages), currency: 'UAH', project: {} });
  assert.deepEqual(r.content.economics.products, [{ name: 'Стілець Дуб', price: 3200, cogs: null }, { name: 'Стілець Лоза', price: null, cogs: null }], 'a product that is not on the site and a repeat are dropped; a price that is not on the site is dropped');
  assert.ok(r.notes.some((n) => /Диван Хмара/.test(n)) && r.notes.some((n) => /Ціну 4100/.test(n)));
  assert.deepEqual(r.content.creative_goals, [{ goal: 'Продати Стілець Дуб', product: 'Стілець Дуб' }, { goal: 'Привести покупців на каталог', product: '' }], 'a goal about an unknown product keeps the words, not the product; an empty goal is dropped');
  assert.equal(r.content.economics.currency, 'UAH'); assert.equal(r.content.economics_meta['product:Стілець Дуб'].status, 'assumption'); assert.match(r.content.economics_meta['product:Стілець Лоза'].source, /уточніть/);
  assert.equal(r.content.general.geo, 'Україна'); assert.equal(r.content.draft_from_site, true); assert.equal(r.found.priced, 1);
  assert.deepEqual(Object.keys(r.content.economics).sort(), ['currency', 'offers', 'products'], 'no budget, margin or ROAS is made up');
  assert.ok(r.missing.includes('місячний бюджет') && r.missing.includes('ID сторінки Facebook'));
  const noCur = checkBriefDraft({ products: [] }, { corpus: 'x', currency: null, project: { country: 'Польща' } });
  assert.equal(noCur.content.economics.currency, 'USD'); assert.ok(noCur.notes.some((n) => /Валюту цін не визначено/.test(n))); assert.equal(noCur.content.general.geo, 'Польща', 'the country of the project card wins');
  assert.match(renderBriefDraftText({ content: r.content, notes: r.notes, missing: r.missing, url: 'https://loza.example' }), /Це припущення[\s\S]*Стілець Дуб: 3200 UAH[\s\S]*Стілець Лоза: ціни на сайті немає[\s\S]*заповніть вручну/);
  assert.match(buildBriefDraftPrompt({ pages: d.pages, project: { name: 'Лоза' }, currency: 'UAH' }).system, /Never calculate or guess/);
  assert.throws(() => parseBriefDraftAnswer('нічого'), /не у форматі JSON/);
});
const ROBOTS_CLOSED = ['User-agent: *', 'Disallow: /'].join('\n');
await test('brief draft: the skill drafts the brief from the site, flags it for confirmation and asks for the numbers; an existing brief is never touched; no site waits; no model fails clearly', async () => {
  const mk = async (o = {}) => {
    const s = await setup({ handlers: createHandlers({ researcher: { brief_draft: briefDraft } }) });
    Object.assign(s.ctx, fakeNet(o.pages, o.robots)); s.asked = [];
    s.ctx.ask = o.ask === undefined ? async (x) => { s.asked.push(x); return { costUsd: 0.02, text: DRAFT_ANSWER() }; } : o.ask;
    if (o.site !== false) s.repo.setWebsite(1, 'https://loza.example');
    if (o.brief) await human(s.repo, 'brief', 'мій бриф');
    await s.repo.enqueueRun({ project_id: 1, agent: 'researcher', skill: 'brief_draft', trigger: 'manual' }); await processTick(s.ctx);
    return s;
  };
  const s = await mk();
  assert.equal(s.repo.T.runs[0].status, 'done', s.repo.T.runs[0].error);
  const b = await s.repo.readSection(1, 'brief');
  assert.equal(b.version.author_kind, 'agent'); assert.equal(b.version.content.economics.products.length, 2); assert.equal(b.version.content.draft_from_site, true); assert.match(b.version.body, /Це припущення/);
  assert.equal(s.repo.T.states.get(1).brief_pending, true, 'the process waits for a person'); assert.equal(s.repo.T.runs[0].cost_usd, 0.02);
  assert.ok(s.repo.T.tasks.some((t) => t.title === 'Перевірити чернетку брифу й заповнити цифри' && /місячний бюджет/.test(t.evidence)));
  assert.match(s.asked[0].user, /price_lines/); assert.match(s.asked[0].user, /"detected_currency": "UAH"/);
  const kept = await mk({ brief: true, ask: async () => { throw new Error('must not be called'); } });
  assert.equal(kept.repo.T.runs[0].status, 'done'); assert.equal(kept.repo.T.runs[0].output.skipped, true); assert.equal((await kept.repo.readSection(1, 'brief')).version.body, 'мій бриф'); assert.notEqual(kept.repo.T.states.get(1).brief_pending, true);
  const none = await mk({ site: false }); assert.equal(none.repo.T.runs[0].status, 'waiting'); assert.equal(none.repo.T.runs[0].state.blocked_on, 'site_url');
  const nom = await mk({ ask: null }); assert.equal(nom.repo.T.runs[0].status, 'failed'); assert.match(nom.repo.T.runs[0].error, /ANTHROPIC_API_KEY/);
  const closed = await mk({ robots: ROBOTS_CLOSED, ask: async () => { throw new Error('must not be called'); } });
  assert.equal(closed.repo.T.runs[0].status, 'done'); assert.equal(closed.repo.T.runs[0].output.blocked_by_robots, true); assert.ok(closed.repo.T.tasks.some((x) => x.title === 'Заповнити бриф вручну')); assert.notEqual(closed.repo.T.states.get(1).brief_pending, true);
});
await test('quick start: a brief that waits for confirmation does not start the process; the first launch of a quick-start project is PAUSED, the others are as before', () => {
  const base = { stage: 0, paused: false, paid_at: 'x', contracts_signed_at: 'x', has_data: false };
  const secs = { brief: { hasCurrent: true } };
  assert.ok(!planNext({ state: { ...base, brief_pending: true }, sections: secs }).some((a) => a.type === 'set_stage'), 'a draft brief is not a brief until confirmed');
  assert.ok(planNext({ state: { ...base, brief_pending: false }, sections: secs }).some((a) => a.type === 'set_stage' && a.stage === 1));
  assert.ok(planNext({ state: base, sections: secs }).some((a) => a.type === 'set_stage'), 'an ordinary project is not affected');
  const launch = (flag) => planNext({ state: { stage: 3, paused: false, launch_paused: flag }, runs: [] }).find((a) => a.type === 'enqueue' && a.skill === 'launch');
  assert.deepEqual(launch(true).input, { status: 'PAUSED' }); assert.deepEqual(launch(false).input, {}); assert.deepEqual(launch(undefined).input, {});
  const retry = planNext({ state: { stage: 3, paused: false, launch_paused: true }, runs: [{ id: 1, agent: 'mediabuyer', skill: 'launch', status: 'failed', input: {} }] }).find((a) => a.type === 'enqueue');
  assert.deepEqual(retry.input, { status: 'PAUSED' }, 'a retry stays paused too');
});
await test('quick start: the button on the page of projects, the dialog, the calls (project, process, flags, draft of the brief) and the confirmation of the brief in the overview exist; the migration adds the two flags', () => {
  const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
  const rd = (f) => fs.readFileSync(path.join(root, f), 'utf8');
  assert.match(rd('src/pages/Projects/Projects.jsx'), /QuickStartModal/); assert.match(rd('src/pages/Projects/Projects.jsx'), /Швидкий старт/);
  const api = rd('src/lib/api/quickStart.js');
  assert.match(api, /createProject\(/); assert.match(api, /startProcess\(/); assert.match(api, /launch_paused: true, brief_pending: true/); assert.match(api, /requestRun\(project\.id, 'researcher', 'brief_draft'/);
  assert.match(rd('src/components/Projects/QuickStartModal.jsx'), /useDialogA11y/); assert.match(rd('src/components/Projects/QuickStartModal.jsx'), /normalizeSite/);
  assert.match(rd('src/components/Workflow/ProcessOverview.jsx'), /brief_pending: false/); assert.match(rd('src/components/Workflow/ProcessOverview.jsx'), /Підтвердити бриф/);
  const mig = rd('supabase/migrations/20261073000000_workflow_quick_start.sql'); assert.match(mig, /brief_pending boolean/); assert.match(mig, /launch_paused boolean/);
  assert.ok(ACTIVE_AGENTS.find((a) => a.key === 'researcher').skills.some((s) => s.key === 'brief_draft'));
});
// ---------------------------------------------------------------- Zeely item 5 (owner's decisions 2026-11-25): videos from the pictures of ready creatives
await test('video: the request is cleaned (3 sources at most, 4-10 seconds, resolution, quality, sound mode, motion) and a voice-over needs a language', () => {
  assert.throws(() => normalizeVideoRequest({}), /хоча б один готовий креатив/); assert.throws(() => normalizeVideoRequest({ source: 'c1', audio: 'voice' }), /оберіть мову/);
  assert.deepEqual(normalizeVideoRequest({ sources: ['c1', 'c1', 'c2', 'c3', 'c4'], duration: 99, resolution: '4k', quality: 'x', audio: 'sound', motion: 'orbit' }), { sources: ['c1', 'c2', 'c3'], duration: 10, resolution: '720p', quality: 'fast', audio: 'sound', language: '', motion: 'orbit' });
  assert.equal(normalizeVideoRequest({ source: 'c1', duration: 1 }).duration, 4); assert.equal(normalizeVideoRequest({ source: 'c1' }).duration, 10);
  assert.deepEqual(normalizeVideoRequest({ source: 'c1', audio: 'voice', language: 'uk', resolution: '1080p', quality: 'std' }), { sources: ['c1'], duration: 10, resolution: '1080p', quality: 'std', audio: 'voice', language: 'uk', motion: 'push_in' });
  assert.equal(VIDEO_MONTHLY_MAX, 3);
});
await test('video: the prompt keeps the product unchanged and forbids text in the frame; the voice-over is the creative\'s own text; a line that speaks as a customer is refused', () => {
  const card = VSRC('c1');
  const base = normalizeVideoRequest({ source: 'c1' });
  const p = buildMotionPrompt({ card, req: base });
  assert.match(p, /exactly as in the image/); assert.match(p, /No text, subtitles, captions/); assert.match(p, /push-in/); assert.ok(!/voice-over/.test(p) && !/ambient/.test(p), 'silent: nothing about sound');
  assert.match(buildMotionPrompt({ card, req: normalizeVideoRequest({ source: 'c1', audio: 'sound' }) }), /No speech/);
  assert.match(buildMotionPrompt({ card, req: normalizeVideoRequest({ source: 'c1', audio: 'voice', language: 'pl' }) }), /voice-over in польська says: "Тихий сон за 150: дарунок до замовлення\."/);
  for (const t of ['Я купила це місяць тому і дуже рада', 'Мені допомогло заснути', 'I bought it and I love it', 'As a customer I recommend']) assert.equal(isTestimonial(t), true, t);
  for (const t of ['Тихий сон за 150: дарунок до замовлення.', 'Замовляйте сьогодні', 'Купуйте беруші і спіть спокійно']) assert.equal(isTestimonial(t), false, t);
  const now = new Date('2026-11-25T10:00:00Z');
  const items = [VSRC('c1'), VSRC('c2', { primary_text: 'Я купив і задоволений' }), VSRC('c3', { status: 'producing', image_url: '' })];
  assert.throws(() => planVideos({ req: normalizeVideoRequest({ source: 'c2', audio: 'voice', language: 'uk' }), items, now }), /звучить як відгук покупця/);
  assert.equal(planVideos({ req: normalizeVideoRequest({ source: 'c2', audio: 'sound' }), items, now }).videos.length, 1, 'without a voice-over the picture is enough');
  assert.throws(() => planVideos({ req: normalizeVideoRequest({ source: 'c3' }), items, now }), /ще без готової картинки/); assert.throws(() => planVideos({ req: normalizeVideoRequest({ source: 'c9' }), items, now }), /Креатива c9 немає/);
  const old = [{ id: 'v1', of: 'c1', month: '2026-11', status: 'ready' }, { id: 'v2', of: 'c1', month: '2026-11', status: 'failed' }, { id: 'v3', of: 'c1', month: '2026-10', status: 'ready' }];
  assert.equal(videosThisMonth(old, now), 1, 'a failed video and another month are not counted');
  const two = planVideos({ req: normalizeVideoRequest({ sources: ['c1', 'c2'] }), items, videos: [...old, { id: 'v4', of: 'c2', month: '2026-11', status: 'ready' }], now });
  assert.equal(two.videos.length, 1); assert.deepEqual(two.skipped, ['c2'], 'only what the monthly limit of 3 allows is planned'); assert.equal(two.videos[0].start_url, VSRC('c1').image_url);
  assert.match(renderVideosText([{ id: 'v1', of: 'c1', duration: 10, resolution: '720p', audio_mode: 'sound', status: 'ready', video_url: 'https://s/x.mp4' }]), /v1 з креатива c1: 10 с, 720p, зі звуком і музикою, без мови \[готово\] · https:\/\/s\/x\.mp4/);
});
await test('video: the request to Higgsfield is built from the profile (model path, start frame parameter) and the status is read from the video fields; the config is checked', async () => {
  const profile = hfVideoProfile({ HF_VIDEO_MODEL: '/vendor/model/i2v', HF_VIDEO_START_PARAM: 'start_image', HF_VIDEO_EXTRA: '{"genre":"auto"}' });
  assert.equal(profile.path, 'vendor/model/i2v');
  const r = buildVideoRequest({ prompt: 'Animate', aspect_ratio: '9:16', duration: 10, resolution: '720p', quality: 'fast', audio: false, start_url: 'https://img.example/c1.png' }, profile);
  assert.deepEqual(r, { path: 'vendor/model/i2v', body: { genre: 'auto', prompt: 'Animate', aspect_ratio: '9:16', duration: 10, resolution: '720p', mode: 'fast', generate_audio: false, start_image: 'https://img.example/c1.png' } });
  assert.equal(buildVideoRequest({ prompt: 'x', duration: 5, resolution: '720p', quality: 'std', audio: true, start_url: 'http://insecure/x.png' }, profile).body.start_image, undefined, 'only https frames');
  assert.deepEqual(hfVideoMissing({}), ['HF_API_KEY_ID', 'HF_API_KEY_SECRET', 'HF_VIDEO_MODEL']); assert.equal(hfVideoConfigured({ HF_API_KEY_ID: 'a', HF_API_KEY_SECRET: 'b', HF_VIDEO_MODEL: 'm' }), true);
  const st = (json, ok = true) => async () => ({ ok, json: async () => json });
  const url = 'https://api.higgsfield.ai/requests/1/status';
  assert.deepEqual(await hfVideoCheck({ statusUrl: url, env: {}, fetchFn: st({ status: 'completed', video: { url: 'https://v/1.mp4' } }) }), { state: 'ready', url: 'https://v/1.mp4' });
  assert.equal((await hfVideoCheck({ statusUrl: url, env: {}, fetchFn: st({ status: 'completed', videos: [{ url: 'https://v/2.mp4' }] }) })).url, 'https://v/2.mp4');
  assert.equal((await hfVideoCheck({ statusUrl: url, env: {}, fetchFn: st({ status: 'completed' }) })).state, 'failed');
  assert.match((await hfVideoCheck({ statusUrl: url, env: {}, fetchFn: st({ status: 'nsfw' }) })).error, /модерацією/); assert.equal((await hfVideoCheck({ statusUrl: url, env: {}, fetchFn: st({ status: 'in_progress' }) })).state, 'pending');
  assert.equal((await hfVideoCheck({ statusUrl: url, env: {}, fetchFn: st({}, false) })).state, 'pending'); assert.equal((await hfVideoCheck({ statusUrl: 'https://evil.example/x', env: {} })).state, 'failed');
});
const fakeHfv = ({ price = 1.5, states = {}, estimateFail = false, submitFail = false } = {}) => {
  const calls = { estimate: [], submit: [], check: [] };
  return { calls, profile: () => ({ path: 'fake/video', startParam: 'start_image', extra: {} }), buildVideoRequest: (v, p) => ({ path: p.path, body: { prompt: v.prompt, duration: v.duration, resolution: v.resolution, mode: v.quality, generate_audio: v.audio, start_image: v.start_url } }),
    estimate: async ({ request }) => { calls.estimate.push(request); if (estimateFail) throw new Error('Higgsfield: wrong parameter'); return price; },
    submit: async ({ request, key }) => { if (submitFail) throw new Error('Higgsfield: rejected'); calls.submit.push({ request, key }); return { jobId: 'vj' + calls.submit.length, statusUrl: 'https://api.higgsfield.ai/requests/vj' + calls.submit.length + '/status' }; },
    check: async ({ statusUrl }) => { calls.check.push(statusUrl); return states[statusUrl] || { state: 'ready', url: 'https://cdn.hf.example/' + statusUrl.split('/').slice(-2)[0] + '.mp4' }; } };
};
const vidSetup = async (opts = {}) => {
  const s = await setup({ handlers: createHandlers({ creator: { animate_creatives: animateCreatives } }) });
  await s.repo.writeSectionVersion(1, 'creatives', { author_kind: 'agent', author: 'creator', body: 'c', content: { schema: 1, branch: 'A', items: opts.items || [VSRC('c1'), VSRC('c2', { headline: 'Тиша', segment: '' })], spent_usd: 1, limit_usd: 5, open: [], batches: [{ run: 1 }], ...(opts.videos ? { videos: opts.videos } : {}) } });
  s.ctx.hfv = opts.hfv === undefined ? fakeHfv() : opts.hfv; s.ctx.videoWaitMs = 0;
  if (opts.cap != null) await s.repo.setProjectFlag(1, { cost_cap_usd: opts.cap });
  await s.repo.enqueueRun({ project_id: 1, agent: 'creator', skill: 'animate_creatives', input: opts.input || { sources: ['c1', 'c2'] }, trigger: 'manual' });
  return s;
};
await test('video: the skill estimates first, makes the videos of the chosen cards inside the money of the project, copies them into our storage, and keeps the cards and the batches of the section', async () => {
  const s = await vidSetup({ cap: 100, input: { sources: ['c1', 'c2'], duration: 10, resolution: '1080p', quality: 'std', audio: 'sound', motion: 'orbit' } });
  await processTick(s.ctx);
  const run = s.repo.T.runs[0]; assert.equal(run.status, 'done', run.error);
  const c = (await s.repo.readSection(1, 'creatives')).version.content;
  assert.equal(c.items.length, 2); assert.equal(c.batches.length, 1, 'the cards and the log of the batches stay'); assert.equal(c.videos.length, 2);
  assert.deepEqual(c.videos.map((v) => [v.id, v.of, v.status, v.video_url]), [['v1', 'c1', 'ready', 'https://store.example/v1.mp4'], ['v2', 'c2', 'ready', 'https://store.example/v2.mp4']]);
  assert.equal(s.ctx.hfv.calls.estimate.length, 2, 'the price is asked before the video is made'); assert.equal(s.ctx.hfv.calls.submit.length, 2);
  const body = s.ctx.hfv.calls.submit[0].request.body; assert.equal(body.duration, 10); assert.equal(body.resolution, '1080p'); assert.equal(body.mode, 'std'); assert.equal(body.generate_audio, true); assert.equal(body.start_image, VSRC('c1').image_url); assert.match(body.prompt, /orbits/);
  assert.ok(s.ctx.hfv.calls.submit.every((x) => /^[\x20-\x7e]+$/.test(x.key)) && new Set(s.ctx.hfv.calls.submit.map((x) => x.key)).size === 2, 'ASCII and different keys');
  assert.equal(run.cost_usd, 3); assert.match((await s.repo.readSection(1, 'creatives')).version.body, /Відео[\s\S]*v1 з креатива c1/);
  // a second request the same month counts against the limit of three
  await s.repo.enqueueRun({ project_id: 1, agent: 'creator', skill: 'animate_creatives', input: { sources: ['c1', 'c2'] }, trigger: 'manual' });
  await processTick(s.ctx);
  const c2 = (await s.repo.readSection(1, 'creatives')).version.content;
  assert.equal(c2.videos.length, 3, 'only one more fits into three a month'); assert.ok(s.repo.T.steps.some((x) => /не вміщається в місячний ліміт: c2/.test(x.title)));
  await s.repo.enqueueRun({ project_id: 1, agent: 'creator', skill: 'animate_creatives', input: { sources: ['c1'] }, trigger: 'manual' });
  await processTick(s.ctx);
  assert.equal(s.repo.T.runs[2].output.limited, 'month'); assert.equal(s.ctx.hfv.calls.submit.length, 3, 'nothing is made over the limit');
});
await test('video: a video that does not fit the money of the project stays planned with the reason; a failed or moderated one is not charged; a wrong parameter is found by the free estimate', async () => {
  const tight = await vidSetup({ cap: 2, hfv: fakeHfv({ price: 1.5 }) });
  await processTick(tight.ctx);
  const t = (await tight.repo.readSection(1, 'creatives')).version.content;
  assert.deepEqual(t.videos.map((v) => v.status), ['ready', 'planned'], 'the first fits (1.5 of 2), the second does not'); assert.match(t.videos[1].note, /не вміщається в ліміт проєкту/); assert.equal(tight.ctx.hfv.calls.submit.length, 1);
  const bad = await vidSetup({ cap: 100, hfv: fakeHfv({ states: { 'https://api.higgsfield.ai/requests/vj1/status': { state: 'failed', error: 'Higgsfield відхилив результат модерацією. Змініть сцену.' } } }) });
  await processTick(bad.ctx);
  const b = (await bad.repo.readSection(1, 'creatives')).version.content;
  assert.equal(b.videos[0].status, 'failed'); assert.match(b.videos[0].note, /модерацією/); assert.equal(b.videos[0].cost_usd, 0); assert.equal(bad.repo.T.runs[0].cost_usd, 1.5, 'only the video that was made is charged');
  const wrong = await vidSetup({ cap: 100, hfv: fakeHfv({ estimateFail: true }) });
  await processTick(wrong.ctx);
  const w = (await wrong.repo.readSection(1, 'creatives')).version.content;
  assert.ok(w.videos.every((v) => v.status === 'failed' && /wrong parameter/.test(v.note))); assert.equal(wrong.ctx.hfv.calls.submit.length, 0, 'nothing is submitted when the estimate fails'); assert.equal(wrong.repo.T.runs[0].cost_usd, 0);
});
await test('video: a video still being made is picked up by a second run («Забрати готові відео»); no generator, no cards, a card without a picture, a customer-like voice-over are clear errors', async () => {
  const pend = { 'https://api.higgsfield.ai/requests/vj1/status': { state: 'pending' } };
  const s = await vidSetup({ cap: 100, input: { sources: ['c1'] }, hfv: fakeHfv({ states: pend }) });
  await processTick(s.ctx);
  const c = (await s.repo.readSection(1, 'creatives')).version.content;
  assert.equal(c.videos[0].status, 'producing'); assert.ok(c.videos[0].job.statusUrl); assert.match(c.open.join(' '), /Забрати готові відео/);
  delete pend['https://api.higgsfield.ai/requests/vj1/status']; // the video is ready now
  await s.repo.enqueueRun({ project_id: 1, agent: 'creator', skill: 'animate_creatives', input: { follow: true }, trigger: 'manual' });
  await processTick(s.ctx);
  const d = (await s.repo.readSection(1, 'creatives')).version.content;
  assert.equal(d.videos.length, 1, 'a follow-up makes no new video'); assert.equal(d.videos[0].status, 'ready'); assert.equal(d.videos[0].video_url, 'https://store.example/v1.mp4'); assert.equal(s.ctx.hfv.calls.submit.length, 1, 'the job is not submitted twice');
  assert.ok(!(d.open || []).some((o) => /Забрати готові відео/.test(o)));
  const none = await vidSetup({ hfv: null }); await processTick(none.ctx); assert.notEqual(none.repo.T.runs[0].status, 'done'); assert.match(none.repo.T.runs[0].error, /HF_VIDEO_MODEL/);
  const bare = await vidSetup({ items: [] }); await processTick(bare.ctx); assert.equal(bare.repo.T.runs[0].status, 'done'); assert.match(bare.repo.T.steps.map((x) => x.title).join(' '), /Креативів ще немає/);
  const nopic = await vidSetup({ items: [VSRC('c1', { status: 'planned', image_url: '' })], input: { sources: ['c1'] } }); await processTick(nopic.ctx); assert.match(nopic.repo.T.runs[0].error, /ще без готової картинки/);
  const talk = await vidSetup({ items: [VSRC('c1', { primary_text: 'Я купила і дуже рада' })], input: { sources: ['c1'], audio: 'voice', language: 'uk' } }); await processTick(talk.ctx); assert.match(talk.repo.T.runs[0].error, /звучить як відгук покупця/); assert.equal(talk.ctx.hfv.calls.estimate.length, 0);
});
await test('video: the pictures skills keep the videos of the section (a batch must not lose them); the skill is the Creator\'s; the panel is in the section of the creatives', async () => {
  const s = await batchSetup({ cap: 100 });
  await s.repo.writeSectionVersion(1, 'creatives', { author_kind: 'agent', author: 'creator', body: 'c', content: { schema: 1, branch: 'A', items: [], spent_usd: 0, limit_usd: 5, open: [], videos: [{ id: 'v1', of: 'c1', status: 'ready', video_url: 'https://s/v1.mp4' }] } });
  await processTick(s.ctx);
  assert.equal(s.repo.T.runs[0].status, 'done', s.repo.T.runs[0].error);
  assert.deepEqual((await s.repo.readSection(1, 'creatives')).version.content.videos.map((v) => v.id), ['v1']);
  assert.ok(ACTIVE_AGENTS.find((a) => a.key === 'creator').skills.some((x) => x.key === 'animate_creatives'));
  const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
  const dossier = fs.readFileSync(path.join(root, 'src/components/Workflow/Dossier.jsx'), 'utf8'), panel = fs.readFileSync(path.join(root, 'src/components/Workflow/VideoPanel.jsx'), 'utf8');
  assert.match(dossier, /VideoPanel/); assert.match(panel, /requestRun\(projectId, 'creator', 'animate_creatives'/); assert.match(panel, /follow: true/); assert.match(panel, /VIDEO_MONTHLY_MAX/); assert.match(panel, /<video/);
});
// ---------------------------------------------------------------- Zeely item 5: a ready video of a creative becomes one more ad of the same group; Meta takes the video from our address and processes it first
await test('video launch: the Meta writer sends the video by address, reads its processing state, and makes a video ad (video_data with the picture as the cover, a destination even without a button)', async () => {
  const seen = [];
  const fetchFn = async (url, init) => {
    const u = String(url); seen.push({ url: u, method: init?.method || 'GET', body: Object.fromEntries(new URLSearchParams(init?.body?.toString() || '')) });
    if (u.includes('/advideos')) return new Response(JSON.stringify({ id: 4242 }), { status: 200 });
    if (u.includes('/4242?')) return new Response(JSON.stringify({ status: { video_status: seen.filter((x) => x.url.includes('/4242?')).length < 2 ? 'processing' : 'ready' } }), { status: 200 });
    if (u.includes('/9?')) return new Response(JSON.stringify({ status: { video_status: 'error', processing_progress: 'bad codec' } }), { status: 200 });
    return new Response(JSON.stringify({ id: 'cr1' }), { status: 200 });
  };
  const w = createMetaWriter({ token: 'TOKEN123', fetchFn });
  assert.equal(await w.uploadVideo({ accountId: '55', url: 'https://store.example/v1.mp4', title: 'Відео v1' }), '4242');
  assert.match(seen.at(-1).url, /\/act_55\/advideos$/); assert.equal(seen.at(-1).body.file_url, 'https://store.example/v1.mp4'); assert.equal(seen.at(-1).method, 'POST');
  await assert.rejects(() => w.uploadVideo({ accountId: '55', url: 'http://insecure.example/v.mp4' }), /https/);
  assert.equal((await w.videoReady({ videoId: '4242' })).state, 'pending'); assert.equal((await w.videoReady({ videoId: '4242' })).state, 'ready');
  const bad = await w.videoReady({ videoId: '9' }); assert.equal(bad.state, 'failed'); assert.match(bad.error, /bad codec/);
  await w.createAdCreative({ accountId: '55', name: 't', pageId: '777', link: 'https://shop.example/?u=1', message: 'Текст', headline: 'Заголовок', imageHash: 'h1', cta: 'SHOP_NOW', urlTags: 'u=1', videoId: '4242' });
  const spec = JSON.parse(seen.at(-1).body.object_story_spec);
  assert.equal(spec.link_data, undefined); assert.deepEqual(spec.video_data, { video_id: '4242', image_hash: 'h1', message: 'Текст', title: 'Заголовок', call_to_action: { type: 'SHOP_NOW', value: { link: 'https://shop.example/?u=1' } } });
  await w.createAdCreative({ accountId: '55', name: 't', pageId: '777', link: 'https://s.example', message: 'm', headline: 'h', imageHash: 'h', cta: 'NO_BUTTON', urlTags: '', videoId: '4242' });
  assert.equal(JSON.parse(seen.at(-1).body.object_story_spec).video_data.call_to_action.type, 'LEARN_MORE', 'a video ad always has a destination');
});
const LA_VIDEO = (o = {}) => ({ id: 'v1', of: 'c1', status: 'ready', video_url: 'https://store.example/v1.mp4', start_url: LA_CREATIVES.items[0].image_url, duration: 10, ...o });
await test('video launch: only a READY video made from the picture the card has now becomes an ad of the same group, with its own key and UTM', () => {
  const plan = (videos) => buildPlan({ strategy: LA_STRAT, creatives: { ...LA_CREATIVES, videos }, website: 'shop.example', pageId: '7', pixelId: 'p', now: LA_NOW() });
  const ads = plan([LA_VIDEO()]).campaigns[0].adsets[0].ads;
  assert.equal(ads.length, 2); assert.equal(ads[0].video, undefined); assert.equal(ads[1].video.id, 'v1'); assert.match(ads[1].key, /^c1-v1-v1$/); assert.match(ads[1].name, /· відео v1$/); assert.match(ads[1].link, /utm_content=c1-v1-v1/); assert.equal(ads[1].creative.id, 'c1');
  assert.equal(plan([]).campaigns[0].adsets[0].ads.length, 1, 'without videos nothing changes');
  for (const bad of [LA_VIDEO({ status: 'producing' }), LA_VIDEO({ video_url: '' }), LA_VIDEO({ video_url: 'http://x/v.mp4' }), LA_VIDEO({ start_url: 'https://old.example/old.png' }), LA_VIDEO({ of: 'c9' })]) assert.equal(plan([bad]).campaigns[0].adsets[0].ads.length, 1, JSON.stringify(bad));
  assert.equal(plan([LA_VIDEO(), LA_VIDEO({ id: 'v2' })]).campaigns[0].adsets[0].ads.length, 3);
});
const laVideoWriter = ({ states = ['ready'], failUpload = false } = {}) => {
  const w = laWriter(); let i = 0;
  w.uploadVideo = async (a) => { if (failUpload) throw new Error('Meta: bad video (#100)'); w.calls.push(['video', a]); return 'vid77'; };
  w.videoReady = async (a) => { w.calls.push(['videoReady', a]); const st = states[Math.min(i, states.length - 1)]; i += 1; return { state: st, error: st === 'failed' ? 'bad codec' : null }; };
  const base = w.createAdCreative; w.createAdCreative = async (a) => { const r = await base(a); return r; };
  return w;
};
await test('video launch: the video is uploaded, waited for until Meta has processed it, and its ad is made after the picture ad; the PAUSED launch creates it switched off', async () => {
  const w = laVideoWriter({ states: ['pending', 'pending', 'ready'] });
  const s = await laSetup({ writer: w, creatives: { ...LA_CREATIVES, videos: [LA_VIDEO()] } }); s.ctx.videoReadyStepMs = 0; s.ctx.sleep = async () => {};
  s.repo.T.runs.length = 0; await s.repo.enqueueRun({ project_id: 1, agent: 'mediabuyer', skill: 'launch', input: { status: 'PAUSED' } }); await processTick(s.ctx);
  const run = s.repo.T.runs.at(-1); assert.equal(run.status, 'done', run.error);
  const names = w.calls.map((c) => c[0]);
  assert.deepEqual(names, ['campaign', 'adset', 'image', 'creative', 'ad', 'video', 'videoReady', 'videoReady', 'videoReady', 'creative', 'ad', 'campaign', 'adset', 'image', 'creative', 'ad']);
  const vid = w.calls.find((c) => c[0] === 'video')[1]; assert.equal(vid.url, 'https://store.example/v1.mp4'); assert.match(vid.title, /відео v1/);
  const creatives = w.calls.filter((c) => c[0] === 'creative').map((c) => c[1]); assert.equal(creatives[0].videoId, null); assert.equal(creatives[1].videoId, 'vid77'); assert.equal(creatives[1].imageHash, 'hash3', 'the same cover picture, uploaded once'); assert.match(creatives[1].link, /utm_content=c1-v1-v1/);
  assert.ok(w.calls.filter((c) => c[0] === 'ad').every((c) => c[1].status === 'PAUSED'));
  const snap = (await s.repo.readSection(1, 'launch')).version.content; assert.equal(snap.campaigns[0].adsets[0].ads.length, 2); assert.match(snap.campaigns[0].adsets[0].ads[1].tag, /відео v1/);
  assert.ok(s.repo.T.journal.some((j) => j.action === 'launch' && /оголошень 3/.test(j.summary)));
});
await test('video launch: a video that Meta cannot process, or has not processed in time, stops the launch with the reason and keeps what is made; a failed upload says why', async () => {
  const slow = laVideoWriter({ states: ['pending'] });
  const a = await laSetup({ writer: slow, creatives: { ...LA_CREATIVES, videos: [LA_VIDEO()] } }); a.ctx.videoReadyWaitMs = 10; a.ctx.videoReadyStepMs = 5; a.ctx.sleep = async () => {};
  await processTick(a.ctx);
  assert.equal(a.repo.T.runs[0].status, 'failed'); assert.match(a.repo.T.runs[0].error, /Meta ще обробляє відео v1/); assert.ok(slow.calls.some((c) => c[0] === 'ad'), 'the picture ad that was made stays');
  const broken = laVideoWriter({ states: ['failed'] });
  const b = await laSetup({ writer: broken, creatives: { ...LA_CREATIVES, videos: [LA_VIDEO()] } }); await processTick(b.ctx);
  assert.match(b.repo.T.runs[0].error, /Meta не обробила відео v1: bad codec/);
  const up = laVideoWriter({ failUpload: true });
  const c = await laSetup({ writer: up, creatives: { ...LA_CREATIVES, videos: [LA_VIDEO()] } }); await processTick(c.ctx);
  assert.match(c.repo.T.runs[0].error, /bad video/);
});
// ---------------------------------------------------------------- the queue of the owner: «дрібні дії» of the optimiser (OFF by default; a closed list; only the Media buyer; only in a project that allows it)
const SM_ACTIVE = (...ids) => new Map(ids.map((id) => [id, { status: 'ACTIVE' }]));
await test('small actions: a weak ad is paused only when it is not the last working one of its group, one per group a pass, at most three a pass; unknown states are never touched', () => {
  const snap = opSnap(); snap.campaigns[0].adsets[0].ads.push({ key: 'c4-v1', tag: 'Креатив 4', ad_id: 'ad4' });
  const off = (id, spend, extra = {}) => ({ level: 'ad', id, name: 'Оголошення ' + id, action: 'off', reason: 'збиткове', metrics: { spend }, significant: false, ...extra });
  const objects = { ads: SM_ACTIVE('ad1', 'ad2', 'ad3', 'ad4'), adsets: new Map() };
  const p = pickSmallActions({ actions: [off('ad2', 400), off('ad4', 500)], snapshot: snap, objects });
  assert.deepEqual(p.apply.map((x) => x.id), ['ad4'], 'only one ad of a group is paused in a pass, the one that spent more'); assert.equal(p.apply[0].after, 'PAUSED'); assert.match(p.skipped[0].why, /вже призупинено одне/);
  const last = pickSmallActions({ actions: [off('ad3', 200)], snapshot: snap, objects }); assert.deepEqual(last.apply, []); assert.match(last.skipped[0].why, /останнє працююче/);
  const unknown = pickSmallActions({ actions: [off('ad2', 400)], snapshot: snap, objects: { ads: SM_ACTIVE('ad1'), adsets: new Map() } }); assert.deepEqual(unknown.apply, []); assert.match(unknown.skipped[0].why, /невідомий/);
  const already = pickSmallActions({ actions: [off('ad2', 400)], snapshot: snap, objects: { ads: new Map([['ad1', { status: 'ACTIVE' }], ['ad2', { status: 'PAUSED' }]]), adsets: new Map() } }); assert.deepEqual(already.apply, []);
  const sig = pickSmallActions({ actions: [off('ad2', 400, { significant: true }), { level: 'campaign', id: 'camp2', action: 'off', significant: true }, { level: 'ad', id: 'ad3', action: 'replace', significant: true }], snapshot: snap, objects }); assert.deepEqual(sig.apply, [], 'significant changes, campaigns and replacements are never small');
  const many = opSnap(); many.campaigns = [0, 1, 2, 3].map((i) => ({ key: 'k' + i, name: 'К' + i, id: 'camp' + i, adsets: [{ key: 'g' + i, name: 'Г' + i, id: 'set' + i, ads: [{ ad_id: 'a' + i }, { ad_id: 'b' + i }] }] }));
  const four = pickSmallActions({ actions: [0, 1, 2, 3].map((i) => off('a' + i, 100 + i)), snapshot: many, objects: { ads: SM_ACTIVE('a0', 'b0', 'a1', 'b1', 'a2', 'b2', 'a3', 'b3'), adsets: new Map() } });
  assert.equal(four.apply.length, SMALL.max_ad_pauses); assert.match(four.skipped[0].why, /ліміт 3 пауз/);
});
await test('small actions: a budget is raised by the agreed step only inside the budget of the brief, from the real budget of the cabinet, a few a pass; without the facts nothing is raised', () => {
  const snap = opSnap();
  const sc = (id, to) => ({ level: 'adset', id, name: 'Група ' + id, action: 'scale', reason: 'працює добре', to_daily: to, significant: false });
  const objects = { ads: new Map(), adsets: new Map([['set1', { status: 'ACTIVE', daily: 90 }], ['set2', { status: 'ACTIVE', daily: 60 }]]) };
  const room = pickSmallActions({ actions: [sc('set1', 108), sc('set2', 72)], snapshot: snap, objects, dailyCap: 200 });
  assert.deepEqual(room.apply.map((x) => [x.kind, x.id, x.from, x.to]), [['adset_scale', 'set1', 90, 108], ['adset_scale', 'set2', 60, 72]]);
  const tight = pickSmallActions({ actions: [sc('set1', 108), sc('set2', 72)], snapshot: snap, objects, dailyCap: 170 });
  assert.deepEqual(tight.apply.map((x) => x.id), ['set1'], 'the second would pass the budget of the brief'); assert.match(tight.skipped[0].why, /вийшла б за бюджет із брифу \(170 на день\)/);
  assert.deepEqual(pickSmallActions({ actions: [sc('set1', 108)], snapshot: snap, objects, dailyCap: 150 }).apply, [], 'the budget of the brief is already used: no headroom');
  assert.match(pickSmallActions({ actions: [sc('set1', 108)], snapshot: snap, objects, dailyCap: null }).skipped[0].why, /немає місячного бюджету/);
  assert.match(pickSmallActions({ actions: [sc('set1', 108)], snapshot: snap, objects: { ads: new Map(), adsets: new Map() }, dailyCap: 500 }).skipped[0].why, /невідомий/);
  assert.equal(pickSmallActions({ actions: [sc('set1', 500)], snapshot: snap, objects, dailyCap: 1000 }).apply[0].to, 108, 'never more than the step (20%) whatever the advice says');
  const three = opSnap(); three.campaigns[1].adsets.push({ key: 'g3', name: 'Г3', id: 'set3', ads: [{ ad_id: 'ad9' }] }); const o3 = { ads: new Map(), adsets: new Map([['set1', { status: 'ACTIVE', daily: 90 }], ['set2', { status: 'ACTIVE', daily: 60 }], ['set3', { status: 'ACTIVE', daily: 30 }]]) };
  assert.equal(pickSmallActions({ actions: [sc('set1', 108), sc('set2', 72), sc('set3', 36)], snapshot: three, objects: o3, dailyCap: 1000 }).apply.length, SMALL.max_scales);
  assert.deepEqual(SMALL, { max_ad_pauses: 3, max_scales: 2, headroom_pct: 0 });
});
await test('small actions: the writer can only PAUSE an ad (never switch one on) and set the daily budget of a group in the smallest unit', async () => {
  const seen = [];
  const w = createMetaWriter({ token: 'TOKEN123', fetchFn: async (url, init) => { seen.push({ url: String(url), body: Object.fromEntries(new URLSearchParams(init?.body?.toString() || '')) }); return new Response(JSON.stringify({ success: true }), { status: 200 }); } });
  await w.setAdStatus({ adId: 'ad_555', status: 'PAUSED' }); assert.match(seen.at(-1).url, /\/555$/); assert.equal(seen.at(-1).body.status, 'PAUSED');
  await assert.rejects(() => w.setAdStatus({ adId: '555', status: 'ACTIVE' }), /лише призупиняти/); assert.equal(seen.length, 1, 'nothing was sent for a refused status');
  await w.setAdsetDaily({ adsetId: '777', dailyMinor: 10800 }); assert.match(seen.at(-1).url, /\/777$/); assert.equal(seen.at(-1).body.daily_budget, '10800');
  await assert.rejects(() => w.setAdsetDaily({ adsetId: '777', dailyMinor: 0 }), /більше нуля/);
});
const smSetup = async ({ flag = true, writer, meta, brief = 6000, life = OP_LIFE } = {}) => {
  const snap = opSnap();
  const s = await opSetup({ snap, meta: meta === undefined ? opMeta((since) => (since === snap.launched_at.slice(0, 10) ? life : [])) : meta });
  await s.repo.setProjectFlag(1, { auto_small_actions: flag });
  if (brief != null) await s.repo.writeSectionVersion(1, 'brief', { author_kind: 'human', author: 'm@x', body: '', content: { economics: { budget_monthly: brief } } });
  const calls = []; s.calls = calls;
  if (writer !== null) s.ctx.metaWrite = writer || { setAdStatus: async (a) => { calls.push(['pause', a]); return true; }, setAdsetDaily: async (a) => { calls.push(['daily', a]); return true; } };
  return s;
};
await test('small actions: OFF by default nothing is changed in the cabinet; ON the weak ad is paused with a journal line that says how to undo it, and the big changes still go to Апрув 3', async () => {
  const off = await smSetup({ flag: false }); await processTick(off.ctx);
  assert.equal(off.calls.length, 0, 'a project that did not switch it on is never touched'); assert.equal(off.repo.T.runs.find((r) => r.skill === 'optimize').output.auto_enabled, false);
  const on = await smSetup(); await processTick(on.ctx);
  const run = on.repo.T.runs.find((r) => r.skill === 'optimize'); assert.equal(run.status, 'done', run.error);
  assert.deepEqual(on.calls, [['pause', { adId: 'ad2', status: 'PAUSED' }]], 'ad2 (133 against the break-even 100) is paused; ad3 is the last of its group and is NOT paused');
  const j = on.repo.T.journal.find((x) => x.action === 'optimize_auto'); assert.match(j.summary, /Автоматично призупинено оголошення «Креатив 2»[\s\S]*Відкотити/); assert.deepEqual(j.meta.undo, { set_status: 'ACTIVE' }); assert.equal(j.meta.before, 'ACTIVE');
  assert.equal(run.output.applied, 1); assert.ok(on.repo.T.steps.some((x) => /Автоматично призупинено оголошення «Креатив 2»/.test(x.title)));
  assert.equal(on.repo.T.approvals.filter((a) => a.kind === 'changes').length, 1, 'the campaign off and the replacement still go to Апрув 3');
  assert.ok(!on.repo.T.approvals[0].subject.actions.some((a) => a.id === 'ad2'), 'what the agent did itself is not asked again');
});
await test('small actions: a good group gets its budget raised by the step inside the brief; the 72 hours start; no brief budget, no writer, no read of the cabinet and a failing write are notes, never a crash', async () => {
  const good = [opRow('ad1', 300, 5), opRow('ad2', 300, 5), opRow('ad3', 300, 5)];
  const s = await smSetup({ life: good }); await processTick(s.ctx);
  assert.deepEqual(s.calls, [['daily', { adsetId: 'set1', dailyMinor: 10800 }], ['daily', { adsetId: 'set2', dailyMinor: 7200 }]], '90 +20% and 60 +20%, in cents');
  assert.ok(s.repo.T.journal.some((j) => j.action === 'optimize_auto' && /піднято бюджет «Група «Г1»»: 90 → 108/.test(j.summary))); assert.ok(s.repo.T.journal.some((j) => j.action === 'optimize_scale'));
  const tight = await smSetup({ life: good, brief: 4500 }); await processTick(tight.ctx); assert.equal(tight.calls.length, 0, 'the budget of the brief is fully used: no room'); assert.ok(tight.repo.T.steps.some((x) => /вийшла б за бюджет із брифу/.test(x.title)));
  const nobrief = await smSetup({ life: good, brief: null }); await processTick(nobrief.ctx); assert.equal(nobrief.calls.length, 0); assert.ok(nobrief.repo.T.steps.some((x) => /немає місячного бюджету/.test(x.title)));
  const nowriter = await smSetup({ writer: null }); await processTick(nowriter.ctx); assert.equal(nowriter.repo.T.runs.find((r) => r.skill === 'optimize').status, 'done'); assert.ok(nowriter.repo.T.steps.some((x) => /запису в кабінет немає: лише рекомендації/.test(x.title)));
  const snapAll = opSnap(); const blind = await smSetup({ meta: { insights: async ({ timeRange }) => ({ rows: timeRange.since === snapAll.launched_at.slice(0, 10) ? OP_LIFE : [] }), objects: async () => { throw new Error('Meta: 500'); } } }); await processTick(blind.ctx);
  assert.equal(blind.calls.length, 0, 'a cabinet that was not read is never changed blindly'); assert.ok(blind.repo.T.steps.some((x) => /стан оголошень у кабінеті не прочитано/.test(x.title)));
  const bad = await smSetup({ writer: { setAdStatus: async () => { throw new Error('Meta: Permission denied (#200)'); }, setAdsetDaily: async () => true } }); await processTick(bad.ctx);
  const br = bad.repo.T.runs.find((r) => r.skill === 'optimize'); assert.equal(br.status, 'done', 'a refused write does not fail the run'); assert.equal(br.output.auto_failed, 1); assert.ok(bad.repo.T.steps.some((x) => /Дрібні дії не вдалися \(1\)[\s\S]*Permission denied/.test(x.title))); assert.ok(!bad.repo.T.journal.some((j) => j.action === 'optimize_auto'));
});
await test('small actions: the switch is per project, off by default, in the overview of the project (after the launch), with the migration; the card of the Media buyer says it', () => {
  const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
  const rd = (f) => fs.readFileSync(path.join(root, f), 'utf8');
  assert.match(rd('supabase/migrations/20261074000000_workflow_small_actions.sql'), /auto_small_actions boolean not null default false/);
  const ov = rd('src/components/Workflow/ProcessOverview.jsx'), page = rd('src/pages/AiAgents/AgentSettings.jsx'); assert.match(page, /Дрібні дії оптимізатора/); assert.match(page, /setSmallActions\(project/); assert.match(ov, /Налаштування агентів/); assert.match(ov, /onGo\?\.\('settings'\)/); assert.match(ov, /state\.stage >= 3/);
  assert.match(ACTIVE_AGENTS.find((a) => a.key === 'mediabuyer').note, /дрібні дії/);
  assert.equal(ACTIVE_AGENTS.find((a) => a.key === 'mediabuyer').rights, 'write'); assert.deepEqual(ACTIVE_AGENTS.filter((a) => a.rights === 'write').map((a) => a.key), ['mediabuyer'], 'still the only agent that writes to a cabinet');
});
// ---------------------------------------------------------------- the owner's rule of 2026-11-26: ONE brief, one list of what the agents need, asked for before the launch
const BS_FULL = () => ({
  brief: { general: { geo: 'Україна', goal: '60 покупок на місяць', competitors: 'a.com\nb.com', fb_page_id: '107633047825429', audience: 'Родини' }, economics: { currency: 'USD', budget_monthly: 4500, avg_order: 175, cogs_pct: 30, target_roas: 2.5, products: [{ name: 'Стілець', price: 3200, cogs: 1000 }] }, creative_goals: [{ goal: 'Продати хіт', product: '' }] },
  project: { website: 'https://shop.example', country: 'Україна', client_language: 'uk' },
  card: { settings: { inputs: { tone: { body: 'Тепло' }, about: { body: 'Меблі' } } }, assets: [{ kind: 'product', name: 'p.png', url: 'https://f/p.png' }] },
  accounts: [{ platform: 'meta' }], state: { paid_at: '2026-11-20', contracts_signed_at: '2026-11-21' },
});
await test('brief schema: every fact has one place, one section and a level; the sections are the ones of the brief page; no key repeats', () => {
  assert.equal(new Set(FIELDS.map((f) => f.key)).size, FIELDS.length);
  assert.deepEqual(BS_SECTIONS.map((s) => s.key), ['biz', 'money', 'products', 'geo', 'brand', 'access', 'pay']);
  for (const f of FIELDS) { assert.ok(BS_SECTIONS.some((s) => s.key === f.section), f.key); assert.ok(['required', 'recommended'].includes(f.level), f.key); assert.ok(f.store && f.label && f.why, f.key); assert.ok(Array.isArray(f.needFor) && f.needFor.length, f.key); }
  assert.ok(FIELDS.filter((f) => f.level === 'required').length >= 12, 'what the process cannot do without is marked');
});
await test('brief schema: the check reads ONE brief from the brief, the project, the card, the cabinets and the state; a full client has nothing missing, an empty one lists everything with the inputs to ask', () => {
  const full = checkBrief(BS_FULL());
  assert.equal(full.ready, true); assert.equal(full.required.ok, full.required.total); assert.deepEqual(full.items.filter((i) => !i.ok && i.level === 'required'), []);
  assert.ok(!full.items.some((i) => i.key === 'dsa_name'), 'the name of the advertiser is asked only for the EU');
  const empty = checkBrief({});
  assert.equal(empty.ready, false); assert.ok(empty.required.total >= 12 && empty.required.ok === 0);
  const budget = empty.items.find((i) => i.key === 'budget_monthly'); assert.equal(budget.ok, false); assert.equal(budget.ask.kind, 'number'); assert.match(budget.why, /розподілити гроші/); assert.deepEqual(budget.needFor, ['Стратег', 'Медіабаєр']);
  assert.equal(empty.items.find((i) => i.key === 'product_photo').ask.kind, 'files'); assert.equal(empty.items.find((i) => i.key === 'cabinet_meta').ask.kind, 'cabinet'); assert.equal(empty.items.find((i) => i.key === 'paid').ask.kind, 'flag');
  const part = BS_FULL(); delete part.brief.general.fb_page_id; part.card.assets = []; part.accounts = []; part.state.paid_at = null;
  assert.deepEqual(checkBrief(part).items.filter((i) => !i.ok && i.level === 'required').map((i) => i.key), ['product_photo', 'cabinet_meta', 'fb_page_id', 'paid']);
  assert.equal(checkBrief(part).ready, false);
});
await test('brief schema: the Unit Economy needs a price and a cost per product OR the average order and the cost percent; the name of the advertiser is asked for the EU only', () => {
  const noUnit = BS_FULL(); delete noUnit.brief.economics.avg_order; delete noUnit.brief.economics.cogs_pct; noUnit.brief.economics.products = [{ name: 'Стілець', price: 3200 }];
  assert.deepEqual(checkBrief(noUnit).items.filter((i) => !i.ok && i.level === 'required').map((i) => i.key), ['avg_order', 'cogs_pct']);
  noUnit.brief.economics.products = [{ name: 'Стілець', price: 3200, cogs: 1000 }];
  assert.equal(checkBrief(noUnit).ready, true, 'every product with its own price and cost is enough');
  assert.equal(unitInputsOk({ values: { avg_order: '175', cogs_pct: '30' }, products: [] }), true); assert.equal(unitInputsOk({ values: {}, products: [] }), false);
  const eu = BS_FULL(); eu.brief.general.geo = 'Україна, Польща';
  assert.deepEqual(checkBrief(eu).items.filter((i) => !i.ok && i.level === 'required').map((i) => i.key), ['dsa_name']); eu.brief.general.dsa_name = 'Lelior Sp. z o.o.'; assert.equal(checkBrief(eu).ready, true);
  for (const g of ['Польща', 'Germany', 'PL', 'США, DE', 'Литва']) assert.equal(geoHasEu(g), true, g);
  for (const g of ['США', 'Україна', 'UA, US', '']) assert.equal(geoHasEu(g), false, g);
});
await test('brief schema: a typed fact is written to the store it belongs to; a bad value is refused in words of the manager; the brief gets a human, confirmed value and loses the mark «з сайту»', () => {
  assert.deepEqual(planWrite('budget_monthly', '4 500'), { store: 'brief', group: 'economics', key: 'budget_monthly', value: 4500 });
  assert.throws(() => planWrite('budget_monthly', 'багато'), /потрібне число/); assert.throws(() => planWrite('goal', '  '), /Введіть значення/);
  assert.deepEqual(planWrite('fb_page_id', '1076 3304 7825 429'), { store: 'brief', group: 'general', key: 'fb_page_id', value: '107633047825429' }); assert.throws(() => planWrite('fb_page_id', 'my page'), /лише цифри/);
  assert.deepEqual(planWrite('website', 'https://x.example'), { store: 'project', key: 'website', value: 'https://x.example' }); assert.throws(() => planWrite('website', 'x'), /адресу сайту повністю/);
  assert.deepEqual(planWrite('tone', 'Тепло'), { store: 'card_input', key: 'tone', value: 'Тепло' }); assert.deepEqual(planWrite('creative_goals', 'Продати хіт'), { store: 'goal', value: 'Продати хіт' });
  assert.deepEqual(planWrite('currency', 'usd'), { store: 'brief', group: 'economics', key: 'currency', value: 'USD' }); assert.throws(() => planWrite('paid', 'x'), /окремо/); assert.throws(() => planWrite('nope', 'x'), /Невідоме поле/);
  const base = { schema: 1, draft_from_site: true, general: { geo: 'Україна' }, economics: { products: [{ name: 'Стілець', price: 1 }] }, economics_meta: {}, creative_goals: [] };
  const c = applyToBrief(base, planWrite('budget_monthly', '4500'));
  assert.equal(c.economics.budget_monthly, 4500); assert.equal(c.economics_meta.budget_monthly.status, 'confirmed'); assert.equal(c.draft_from_site, undefined); assert.deepEqual(c.economics.products, base.economics.products, 'the rest of the brief stays'); assert.equal(base.economics.budget_monthly, undefined, 'the old version is not touched');
  assert.equal(applyToBrief(base, planWrite('goal', '60 покупок')).general.goal, '60 покупок'); assert.equal(applyToBrief(null, planWrite('geo', 'Польща')).general.geo, 'Польща');
  assert.deepEqual(applyToBrief(base, planWrite('creative_goals', 'Продати хіт')).creative_goals, [{ goal: 'Продати хіт', product: '' }]);
  const after = BS_FULL(); delete after.brief.economics.budget_monthly; assert.equal(checkBrief(after).ready, false); after.brief = applyToBrief(after.brief, planWrite('budget_monthly', '4500')); assert.equal(checkBrief(after).ready, true, 'what was typed counts at once');
});
await test('brief schema: the overview of a project before the launch shows the check, the missing facts are typed in place and saved through the one store, the files and the cabinet are links', () => {
  const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
  const rd = (f) => fs.readFileSync(path.join(root, f), 'utf8');
  const ov = rd('src/components/Workflow/ProcessOverview.jsx'), pf = rd('src/components/Workflow/Preflight.jsx'), st = rd('src/lib/api/briefStore.js');
  assert.match(ov, /<Preflight /); assert.match(ov, /state\.stage < 3/);
  assert.match(pf, /checkBrief/); assert.match(pf, /saveFact\(projectId/); assert.match(pf, /Підтвердити/); assert.match(pf, /Додати фото/); assert.match(pf, /Підключити кабінет/);
  assert.match(st, /saveHumanVersion\(projectId, 'brief'/); assert.match(st, /saveInput\(projectId/); assert.match(st, /updateProject\(projectId/);
});
// ---------------------------------------------------------------- «Налаштування агентів»: one place for when they work, how much they spend, what they do alone, when they tell a person
await test('agent settings: every setting has a type, limits, a scope and a default; a value out of limits is refused in words; the step of the budget can never be more than 20%', () => {
  for (const path of Object.keys(CFG_SPEC)) { assert.notEqual(cfgGet(CFG_DEFAULTS, path), undefined, 'default for ' + path); assert.ok(['project', 'global'].includes(CFG_SPEC[path].scope), path); assert.ok(CFG_SPEC[path].label, path); }
  assert.deepEqual(checkValue('optimize.every_hours', '12'), { value: 12 }); assert.match(checkValue('optimize.every_hours', '0').error, /Від 1 до 168/); assert.match(checkValue('optimize.every_hours', '1.5').error, /ціле/); assert.match(checkValue('optimize.every_hours', 'часто').error, /число/);
  assert.deepEqual(checkValue('thresholds.min_spend_factor', '1,5'), { value: 1.5 }); assert.match(checkValue('thresholds.budget_step_pct', 35).error, /Від 5 до 20/, 'a bigger step is always a decision of the manager');
  assert.deepEqual(checkValue('optimize.skip_weekends', true), { value: true }); assert.match(checkValue('optimize.skip_weekends', 'так').error, /так або ні/); assert.match(checkValue('nope', 1).error, /Невідоме/);
});
await test('agent settings: the defaults, then the settings of all projects, then the settings of the project; a project cannot change what is common to all; bad stored values are ignored', () => {
  const d = resolveConfig();
  assert.deepEqual(d, CFG_DEFAULTS); assert.equal(d.optimize.every_hours, 24); assert.equal(d.notify.waiting, true);
  const g = { optimize: { every_hours: 12 }, notify: { digest_hour: 8 }, thresholds: { learning_days: 5 } };
  const p = { optimize: { at_hour: 14 }, thresholds: { learning_days: 2 }, notify: { digest_hour: 1 }, small_actions: { max_pauses: 99 } };
  const r = resolveConfig(g, p);
  assert.equal(r.optimize.every_hours, 12, 'common to all projects'); assert.equal(r.optimize.at_hour, 14, 'its own'); assert.equal(r.thresholds.learning_days, 2, 'the project wins over all projects');
  assert.equal(r.notify.digest_hour, 8, 'a project cannot change a notice: it is the same chat for all'); assert.equal(r.small_actions.max_pauses, 3, 'out of limits: ignored');
  assert.equal(cfgSource('optimize.every_hours', g, p), 'global'); assert.equal(cfgSource('optimize.at_hour', g, p), 'project'); assert.equal(cfgSource('optimize.skip_weekends', g, p), 'default');
  assert.deepEqual(plannerConfig(r), { optimizeEveryHours: 12, optimizeAtHour: 14, skipWeekends: false, monthStartDay: 1 });
  const original = JSON.stringify(g); resolveConfig(g, p); assert.equal(JSON.stringify(g), original, 'the stored settings are not changed');
});
await test('agent settings: a change from the page keeps only the values that differ, null goes back to the level above, errors say which setting and why, the digest mark of the cron survives', () => {
  const a = applyChanges({}, { 'optimize.every_hours': 12, 'optimize.skip_weekends': true }, 'project');
  assert.deepEqual(a.config, { optimize: { every_hours: 12, skip_weekends: true } }); assert.deepEqual(a.errors, []);
  const b = applyChanges(a.config, { 'optimize.every_hours': null, 'month_plan.day': 40 }, 'project');
  assert.deepEqual(b.config, { optimize: { skip_weekends: true } }, 'back to the default'); assert.deepEqual(applyChanges({ optimize: { every_hours: 12 } }, { 'optimize.every_hours': null }, 'project').config, {}, 'an emptied group is not stored (found on the live run)'); assert.deepEqual(b.errors, [{ path: 'month_plan.day', error: 'Від 1 до 28.' }]);
  const c = applyChanges({}, { 'notify.digest_hour': 7 }, 'project'); assert.deepEqual(c.config, {}); assert.match(c.errors[0].error, /для всіх проєктів/);
  const d = applyChanges({ _digest_on: '2026-11-26', optimize: { at_hour: 9 } }, { 'notify.digest_hour': 7 }, 'global');
  assert.deepEqual(d.config, { optimize: { at_hour: 9 }, notify: { digest_hour: 7 }, _digest_on: '2026-11-26' });
});
await test('agent settings: the optimisation runs at the chosen hour (Kyiv time), not at the weekend when asked, not more often than chosen; the first one goes at once', () => {
  const op = (finished, cfg, now) => planNext({ now: new Date(now), state: { stage: 4, paused: false }, runs: [{ id: 1, agent: 'mediabuyer', skill: 'optimize', status: 'done', input: {}, created_at: finished, finished_at: finished }], config: cfg }).some((a) => a.type === 'enqueue' && a.skill === 'optimize');
  const cfg = { optimizeEveryHours: 24, optimizeAtHour: 10, skipWeekends: true };
  assert.equal(op('2026-11-26T08:00:00Z', cfg, '2026-11-27T07:30:00Z'), false, '09:30 in Kyiv is before the chosen 10:00');
  assert.equal(op('2026-11-26T08:00:00Z', cfg, '2026-11-27T08:30:00Z'), true, '10:30 in Kyiv: due');
  assert.equal(op('2026-11-26T06:00:00Z', cfg, '2026-11-27T06:30:00Z'), false, '24 hours passed but it is 08:30 in Kyiv'); assert.equal(op('2026-11-26T06:00:00Z', { ...cfg, optimizeAtHour: null }, '2026-11-27T06:30:00Z'), true, 'no hour chosen: as soon as the time has passed');
  assert.equal(op('2026-11-26T08:00:00Z', cfg, '2026-11-27T07:30:00Z'), false);
  assert.equal(op('2026-11-26T08:00:00Z', { ...cfg, optimizeEveryHours: 12 }, '2026-11-27T06:30:00Z'), true, 'more often than once a day: the hour does not apply');
  assert.equal(op('2026-11-27T08:00:00Z', cfg, '2026-11-28T09:00:00Z'), false, 'Saturday: the weekend is off'); assert.equal(op('2026-11-27T08:00:00Z', { ...cfg, skipWeekends: false }, '2026-11-28T09:00:00Z'), true);
  assert.equal(op('2026-11-27T08:00:00Z', cfg, '2026-11-29T09:00:00Z'), false, 'Sunday'); assert.equal(op('2026-11-27T08:00:00Z', cfg, '2026-11-30T09:00:00Z'), true, 'Monday 11:00 in Kyiv');
  assert.equal(planNext({ now: new Date('2026-11-28T09:00:00Z'), state: { stage: 4, paused: false }, runs: [], config: cfg }).some((a) => a.type === 'enqueue' && a.skill === 'optimize'), true, 'the first check after the launch is not postponed');
  assert.equal(planNext({ now: new Date('2026-11-05T09:00:00Z'), state: { stage: 4, paused: false }, runs: [{ id: 1, agent: 'mediabuyer', skill: 'launch', status: 'done', input: {}, created_at: '2026-10-20T09:00:00Z' }], config: { monthStartDay: 10 } }).some((a) => a.type === 'set_stage'), false, 'the plan for the month waits for the chosen day');
});
await test('agent settings: the orchestrator reads them (global, then the project) and gives them to the skills; the thresholds, the limits of small actions and the videos per month follow them', async () => {
  const s = await opSetup({}); s.repo.T.settings.config = { thresholds: { learning_days: 14 } };
  await processTick(s.ctx);
  const first = s.repo.T.runs.find((r) => r.skill === 'optimize'); assert.equal(first.status, 'done', first.error);
  assert.ok(!s.repo.T.journal.some((j) => j.action === 'optimize' && /Витрачено/.test(j.summary) && /off \d/.test(j.summary)), 'with 14 days of learning nothing is judged yet: no «off»');
  assert.match(s.repo.T.journal.find((j) => j.action === 'optimize').summary, /wait/);
  const lim = await smSetup(); lim.repo.T.settings.config = { small_actions: { max_pauses: 0 } }; await processTick(lim.ctx);
  assert.equal(lim.calls.length, 0, 'the limit of pauses of the settings is 0: the agent changes nothing alone');
  const own = await smSetup(); own.repo.T.settings.config = { small_actions: { max_pauses: 0 } }; own.repo.T.states.get(1).config = { small_actions: { max_pauses: 3 } }; await processTick(own.ctx);
  assert.deepEqual(own.calls.map((c) => c[0]), ['pause'], 'the project has its own setting and it wins');
  const v = await vidSetup({ cap: 100, input: { sources: ['c1', 'c2'] } }); v.repo.T.settings.config = { video_per_month: 1 }; await processTick(v.ctx);
  assert.equal((await v.repo.readSection(1, 'creatives')).version.content.videos.length, 1, 'one video a month by the settings');
});
await test('agent settings: a step that waits for data longer than chosen is told once in Telegram; a notice that is switched off is not sent; short waits are not told', async () => {
  const mk = async (config) => {
    const s = await setup({ handlers: createHandlers({ researcher: { site: async () => ({ blocked: { on: 'site_url', reason: 'У картці проєкту не вказано сайт клієнта.' } }) } }) });
    s.events = []; s.ctx.notify = async (e) => { s.events.push(e); }; if (config) s.repo.T.settings.config = config;
    await s.repo.enqueueRun({ project_id: 1, agent: 'researcher', skill: 'site' }); await processTick(s.ctx);
    return s;
  };
  const s = await mk();
  assert.equal(s.repo.T.runs[0].status, 'waiting'); assert.equal(s.events.filter((e) => e.kind === 'waiting').length, 0, 'not yet: less than an hour');
  advance(61 * 60e3); await processTick(s.ctx);
  assert.deepEqual(s.events.filter((e) => e.kind === 'waiting').map((e) => [e.projectId, e.summary]), [[1, 'У картці проєкту не вказано сайт клієнта.']]);
  advance(60e3); await processTick(s.ctx); advance(3600e3); await processTick(s.ctx);
  assert.equal(s.events.filter((e) => e.kind === 'waiting').length, 1, 'once for a run');
  const off = await mk({ notify: { waiting: false } }); advance(3 * 3600e3); await processTick(off.ctx); assert.equal(off.events.filter((e) => e.kind === 'waiting').length, 0, 'switched off');
  const fast = await mk({ notify: { waiting_after_min: 15 } }); advance(16 * 60e3); await processTick(fast.ctx); assert.equal(fast.events.filter((e) => e.kind === 'waiting').length, 1, 'the person chose 15 minutes');
  const noApp = await setup({}); noApp.events = []; noApp.ctx.notify = async (e) => { noApp.events.push(e); }; noApp.repo.T.settings.config = { notify: { approvals: false } };
  await human(noApp.repo, 'brief'); Object.assign(state(noApp.repo), { paid_at: now().toISOString(), contracts_signed_at: now().toISOString() }); await drain(noApp.ctx, 60);
  assert.ok(noApp.repo.T.approvals.length > 0 && noApp.events.filter((e) => e.kind === 'approval').length === 0, 'the approval exists, the notice is switched off');
  assert.match(noticeOf({ kind: 'waiting', project: 'Лоза', projectId: 7, summary: 'Немає сайту' }).text, /крок чекає на ваші дані[\s\S]*Немає сайту/); assert.equal(noticeOf({ kind: 'waiting', project: 'Лоза', projectId: 7 }).path, '/projects/7?tab=process');
});
await test('agent settings: the report switch works from the settings or the old variable; the digest comes out once a day at the hour of the settings; the cron is hourly', () => {
  assert.equal(reportsViaOrchestrator({}, false), false); assert.equal(reportsViaOrchestrator({}, true), true); assert.equal(reportsViaOrchestrator({ REPORTS_VIA_ORCHESTRATOR: '1' }, false), true); assert.equal(reportsViaOrchestrator({ REPORTS_VIA_ORCHESTRATOR: '1' }), true);
  const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
  const dg = fs.readFileSync(path.join(root, 'api/wf-digest.js'), 'utf8');
  assert.match(dg, /resolveConfig\(stored\)/); assert.match(dg, /cfg\.notify\.digest_hour/); assert.match(dg, /_digest_on/); assert.match(dg, /cfg\.notify\.digest\b/);
  assert.match(fs.readFileSync(path.join(root, 'api/agent-tick.js'), 'utf8'), /reports_via_orchestrator/);
  assert.match(fs.readFileSync(path.join(root, 'supabase/migrations/20261075000000_workflow_config.sql'), 'utf8'), /wf_settings add column if not exists config jsonb[\s\S]*wf_project_state add column if not exists config jsonb/);
});
await test('agent settings page: ONE page with two entrances (a tab in the card of a project and a window of AI Agents), the limits and the stop live there and not in a second place, the page saves only through the rules of agentConfig', () => {
  const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
  const rd = (f) => fs.readFileSync(path.join(root, f), 'utf8');
  const page = rd('src/pages/AiAgents/AgentSettings.jsx'), api = rd('src/lib/api/agentSettings.js'), pd = rd('src/pages/Projects/ProjectDetail.jsx'), home = rd('src/pages/AiAgents/AiAgentsHome.jsx'), ovw = rd('src/pages/Projects/Overview.jsx');
  assert.match(pd, /key: 'settings', label: 'Налаштування агентів'/); assert.match(pd, /<AgentSettings key=\{'settings-' \+ id\} projectId=\{id\} \/>/); assert.match(pd, /TABS\.find\(\(x\) => x\.key === 'settings'\)/);
  assert.match(home, /settings: \{ title: 'Налаштування агентів', Page: AgentSettings \}/); assert.match(home, /openWin\('settings'\)/);
  assert.match(api, /applyChanges\(stored, changes, scope\)/); assert.match(api, /throw new Error\(errors\.map/); assert.match(api, /wf_project_state'\)\.update\(\{ config/); assert.match(api, /wf_settings'\)\.update\(\{ config/);
  for (const part of ['Коли працюють', 'Скільки можуть витрачати', 'Що роблять самі', 'Пороги рішень', 'Про що повідомляти в Telegram', 'Аварійна зупинка всіх агентів', 'Пауза проєкту', 'Зберегти зміни', 'Скинути']) assert.ok(page.includes(part), part);
  assert.match(page, /saveLimits\(/); assert.match(page, /setGlobalStop\(/); assert.match(page, /setProjectCap\(/); assert.match(page, /setSmallActions\(project/); assert.match(page, /resolveConfig\(/); assert.match(page, /sourceOf\(/);
  assert.ok(!/saveLimits\(/.test(ovw) && /window=settings/.test(ovw), 'the window «Мої проєкти» no longer edits the limits: it leads to the settings');
  for (const path of Object.keys(CFG_SPEC)) assert.ok(page.includes(path), 'the page shows ' + path);
});
await test('one brief: a tab «Бриф» in the card of the project and NOT a second copy in the dossier; every fact of the brief page is a fact of the registry or of the old sheet; nothing of the old sheet is lost (scalars, products, offers, goals, free text)', () => {
  const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
  const rd = (f) => fs.readFileSync(path.join(root, f), 'utf8');
  const pd = rd('src/pages/Projects/ProjectDetail.jsx'), dos = rd('src/components/Workflow/Dossier.jsx'), page = rd('src/components/Workflow/BriefPage.jsx'), lists = rd('src/components/Workflow/BriefLists.jsx');
  assert.match(pd, /key: 'brief', label: 'Бриф'/); assert.match(pd, /<BriefPage key=\{'brief-' \+ id\} projectId=\{id\}/); assert.match(pd, /TABS\.find\(\(x\) => x\.key === 'brief'\)/);
  assert.match(pd, /next0 === 'dossier' && section0 === 'brief' \? \['brief', undefined\]/, 'the old links «досьє → бриф» lead to the tab');
  assert.match(pd, /const INFO_SECTIONS = \[\['main', 'Основне'\]\]/, 'the old sections of the info tab are merged into the brief');
  assert.ok(!/ProjectCreativeTab key=\{'info-'/.test(pd) && !/<InfoSummary /.test(pd));
  assert.ok(!/BriefPage/.test(dos), 'the dossier no longer holds a second copy of the brief page'); assert.match(dos, /filter\(\(s\) => s\.key !== 'brief'\)/, 'the brief is not a section of the dossier list'); assert.match(dos, /initialKey !== 'brief'/); assert.ok(!fs.existsSync(path.join(root, 'src/components/Workflow/BriefSheet.jsx')), 'one sheet, not two');
  for (const k of ROWS.map((r) => r.key)) assert.ok(page.includes(`'${k}'`), 'the brief page has the scalar ' + k);
  for (const k of ['website', 'about', 'offer', 'tone', 'copy_rules', 'restrictions', 'seasonality', 'examples', 'figma_url', 'client_language']) assert.ok(page.includes(`'${k}'`), k);
  for (const part of ['Товари', 'Офери', 'Цілі перших креативів']) assert.ok(lists.includes(part), part);
  for (const f of FIELDS.filter((x) => !['product_photo', 'cabinet_meta', 'paid', 'contracts', 'creative_goals'].includes(x.key))) assert.ok(page.includes(`'${f.key}'`), 'the registry fact is on the page: ' + f.key);
  assert.match(page, /saveHumanVersion\(projectId, 'brief'/); assert.match(page, /saveInput\(projectId, k/); assert.match(page, /saveSettings\(projectId/); assert.match(page, /updateProject\(projectId, proj\)/); assert.match(page, /uploadAsset\(projectId/); assert.match(page, /brief_pending: false/);
  assert.match(page, /Зберегти бриф/); assert.match(page, /Підтвердити бриф/); assert.match(page, /checkBrief\(ctx\)/);
  assert.match(rd('src/components/Workflow/Preflight.jsx'), /tab=brief/); assert.match(rd('src/components/Workflow/ProcessOverview.jsx'), /onGo\?\.\('brief'\)/);
});
await test('one brief: the form of the brief keeps what the old sheet kept: a saved brief gives back the same content (scalars, products, offers, goals), numbers stay numbers, the mark «з сайту» is gone after a person saves', () => {
  const content = { schema: 1, draft_from_site: true, general: { geo: 'Україна', goal: '60', fb_page_id: '1076330478' }, economics: { currency: 'USD', budget_monthly: 4500, avg_order: 175, cogs_pct: 30, site_cvr: 0.02, products: [{ name: 'Стілець', price: 3200, cogs: null }], offers: [{ name: 'Дарунок', pays: 150, list_value: 150, extra_cost: 18, approved: true }] }, economics_meta: { goal: { status: 'confirmed', source: 'клієнт' } }, creative_goals: [{ goal: 'Продати хіт', product: 'Стілець' }] };
  const form = formFromContent(content, 'Бриф Лоза');
  assert.equal(form.values.budget_monthly, '4500'); assert.equal(form.values.site_cvr_pct, '2'); assert.equal(form.text, 'Бриф Лоза');
  form.values.budget_monthly = '5000'; form.values.audience = 'Родини';
  const back = contentFromForm(form);
  assert.equal(back.economics.budget_monthly, 5000); assert.equal(back.economics.site_cvr, 0.02); assert.equal(back.general.audience, 'Родини'); assert.equal(back.general.goal, '60');
  assert.deepEqual(back.economics.products, [{ name: 'Стілець', price: 3200, cogs: null }]); assert.deepEqual(back.creative_goals, [{ goal: 'Продати хіт', product: 'Стілець' }]); assert.equal(back.economics.offers[0].approved, true);
  assert.equal(back.economics_meta.goal.status, 'confirmed'); assert.equal(back.draft_from_site, undefined, 'a brief saved by a person is no longer a draft from the site');
  assert.equal(checkBrief({ brief: back, project: { website: 'https://x.example' }, card: { settings: { inputs: {} }, assets: [] }, accounts: [], state: {} }).items.find((i) => i.key === 'budget_monthly').ok, true, 'what the page saved counts in the check');
});
// ---------------------------------------------------------------- «Розкажіть про клієнта своїми словами»: the model finds the facts, the CODE checks them, a person accepts them into the form of the brief
const EX_TEXT = 'Клієнт продає меблі з дуба. Доставка по Україні й до Польщі. Бюджет на рекламу близько 4500 доларів на місяць. Хочемо 60 покупок на місяць. Середній чек 175, собівартість 30%. Стілець Дуб коштує 3200 грн. Слова «дешевий» і «акція» не вживати. Сторінка Facebook 107633047825429.';
const EX_ANSWER = (o = {}) => JSON.stringify({
  facts: [
    { key: 'budget_monthly', value: '4500 USD', quote: 'Бюджет на рекламу близько 4500 доларів на місяць' },
    { key: 'goal', value: '60 покупок на місяць', quote: 'Хочемо 60 покупок на місяць' },
    { key: 'avg_order', value: '175', quote: 'Середній чек 175' },
    { key: 'cogs_pct', value: '30%', quote: 'собівартість 30%' },
    { key: 'geo', value: 'Україна, Польща', quote: 'Доставка по Україні й до Польщі' },
    { key: 'restrictions', value: 'не вживати слова «дешевий» і «акція»', quote: 'Слова «дешевий» і «акція» не вживати' },
    { key: 'fb_page_id', value: '107633047825429', quote: 'Сторінка Facebook 107633047825429' },
    { key: 'target_roas', value: '9', quote: 'ROAS дев’ять' },
    { key: 'nonsense', value: 'x', quote: 'x' },
    { key: 'budget_monthly', value: '9999', quote: 'Бюджет на рекламу близько 4500 доларів' },
    { key: 'fee_pct', value: 'багато', quote: 'комісії' },
    { key: 'tone', value: 'Тепло, на «ви»', quote: 'Тон спілкування теплий' },
  ],
  products: [{ name: 'Стілець Дуб', price: 3200, cogs: null, quote: 'Стілець Дуб коштує 3200 грн' }, { name: 'Диван Хмара', price: 5000, cogs: null, quote: 'Диван Хмара за 5000' }],
  offers: [{ name: 'Безкоштовна доставка', pays: null, quote: 'Доставка по Україні' }], goals: [{ goal: 'Продати Стілець Дуб', product: 'Стілець Дуб', quote: 'Хочемо 60 покупок на місяць' }], unplaced: ['клієнт з Києва'], ...o });
await test('brief extraction: every fact is checked by code: the quote must stand in the text, a number must stand in the quote, the shape must fit the field; invented keys, bad values and repeats are dropped; what the code could not confirm is marked «перевірте»', () => {
  const r = checkExtraction(EX_ANSWER(), { text: EX_TEXT });
  const by = Object.fromEntries(r.facts.map((f) => [f.key, f]));
  assert.deepEqual(['budget_monthly', 'goal', 'avg_order', 'cogs_pct', 'geo', 'restrictions', 'fb_page_id'].map((k) => by[k].state), Array(7).fill('ok'));
  assert.equal(by.budget_monthly.value, '4500', 'a number without the currency'); assert.equal(by.cogs_pct.value, '30'); assert.equal(by.fb_page_id.value, '107633047825429');
  assert.equal(by.target_roas.state, 'check'); assert.match(by.target_roas.why, /цитати немає в тексті/); assert.equal(by.tone.state, 'check');
  assert.ok(!r.facts.some((f) => f.key === 'nonsense'), 'an unknown key is dropped'); assert.equal(r.facts.filter((f) => f.key === 'budget_monthly').length, 1, 'a repeat is dropped');
  assert.ok(r.dropped.some((d) => /невідоме поле «nonsense»/.test(d)) && r.dropped.some((d) => /Комісії платежів, %: не число/.test(d)));
  assert.equal(r.products.find((p) => p.name === 'Стілець Дуб').state, 'ok'); assert.equal(r.products.find((p) => p.name === 'Диван Хмара').state, 'check');
  assert.equal(r.goals[0].state, 'ok'); assert.deepEqual(r.unplaced, ['клієнт з Києва']);
  const wrongNumber = checkExtraction(JSON.stringify({ facts: [{ key: 'budget_monthly', value: '7000', quote: 'Бюджет на рекламу близько 4500 доларів на місяць' }] }), { text: EX_TEXT }).facts[0];
  assert.equal(wrongNumber.state, 'check'); assert.match(wrongNumber.why, /числа немає в тексті/, 'the number is not in the text: the model made it up');
  const pdf = checkExtraction(EX_ANSWER(), { text: 'коротка примітка', unreadable: ['offer.pdf'] });
  assert.ok(pdf.facts.every((f) => f.state === 'check') && /offer\.pdf/.test(pdf.facts[0].why), 'what comes from a PDF cannot be checked by code: a person looks');
  assert.throws(() => checkExtraction('Вибачте', { text: 'x' }), /Не вдалося розібрати відповідь/); assert.deepEqual(checkExtraction('{"facts":[]}', { text: 'x' }).facts, []);
  assert.deepEqual(checkExtraction('```json\n' + EX_ANSWER({ facts: [] }) + '\n```', { text: EX_TEXT }).facts, []);
});
await test('brief extraction: the values are shaped by the kind of the field (numbers, digits, dates, currency, language, address)', () => {
  assert.deepEqual(shapeValue('budget_monthly', '4 500 USD'), { value: '4500' }); assert.deepEqual(shapeValue('avg_order', '175,5 грн'), { value: '175.5' }); assert.match(shapeValue('avg_order', 'багато').error, /не число/);
  assert.deepEqual(shapeValue('fb_page_id', '1076 3304 7825 429'), { value: '107633047825429' }); assert.match(shapeValue('fb_page_id', 'моя сторінка').error, /цифри/);
  assert.deepEqual(shapeValue('payment_next_date', '2026-12-01'), { value: '2026-12-01' }); assert.match(shapeValue('payment_next_date', '1 грудня').error, /РРРР-ММ-ДД/);
  assert.deepEqual(shapeValue('currency', 'usd'), { value: 'USD' }); assert.match(shapeValue('currency', 'долар').error, /трьох літер/); assert.deepEqual(shapeValue('client_language', 'EN'), { value: 'en' }); assert.match(shapeValue('client_language', 'pl').error, /uk або en/);
  assert.deepEqual(shapeValue('website', 'https://loza.example'), { value: 'https://loza.example' }); assert.match(shapeValue('website', 'loza').error, /адреса сайту/);
  assert.match(shapeValue('geo', '').error, /порожнє/); assert.equal(shapeValue('tone', 'Тепло,   на «ви»').value, 'Тепло, на «ви»'); assert.equal(shapeValue('about', 'Рядок 1\nРядок 2').value, 'Рядок 1\nРядок 2', 'a long text keeps its lines');
  assert.ok(Object.keys(EX_SPEC).every((k) => EX_SPEC[k].label && EX_SPEC[k].hint), 'every fact has a label and a hint for the model');
});
const EX_BASE = () => ({ form: formFromContent({ general: { geo: 'Україна' }, economics: { currency: 'USD', products: [{ name: 'Стілець Дуб', price: null }] }, creative_goals: [] }, ''), extra: { tone: '', restrictions: 'не обіцяти знижок', about: '' } });
await test('brief extraction: a fact that differs from what the brief holds is a conflict that is NOT replaced by default; accepted facts fill the form as assumptions with their source, products and goals are merged, an offer is never approved by itself, nothing old is touched', () => {
  const base = EX_BASE(); const snapshot = JSON.stringify(base);
  const geo = { key: 'geo', value: 'Україна, Польща' }, budget = { key: 'budget_monthly', value: '4500' }, restr = { key: 'restrictions', value: 'не вживати слова «дешевий»' };
  assert.equal(conflictOf(geo, base.form, base.extra), 'Україна'); assert.equal(conflictOf(budget, base.form, base.extra), ''); assert.equal(conflictOf({ key: 'geo', value: ' україна ' }, base.form, base.extra), '', 'the same value is no conflict');
  assert.equal(currentValue('restrictions', base.form, base.extra), 'не обіцяти знижок');
  const r = applyChosen(base, { facts: [{ ...geo, mode: 'set' }, { ...budget, mode: 'set' }, { ...restr, mode: 'append' }, { key: 'tone', value: 'Тепло', mode: 'set' }], products: [{ name: 'стілець дуб', price: 3200, cogs: null }, { name: 'Диван', price: 5000, cogs: null }], offers: [{ name: 'Подарунок', pays: 150 }], goals: [{ goal: 'Продати Диван', product: 'Диван' }, { goal: 'Привести покупців', product: 'Чужий' }], notes: ['клієнт з Києва'] }, 'commercial-offer.pdf');
  assert.equal(r.form.values.geo, 'Україна, Польща'); assert.equal(r.form.values.budget_monthly, '4500'); assert.deepEqual(r.form.meta.budget_monthly, { status: 'assumption', source: 'commercial-offer.pdf' });
  assert.equal(r.extra.restrictions, 'не обіцяти знижок\nне вживати слова «дешевий»'); assert.equal(r.extra.tone, 'Тепло');
  assert.equal(r.form.products.length, 2); assert.equal(r.form.products[0].price, '3200', 'a price is added to a product that has none'); assert.deepEqual(r.form.products[1], { name: 'Диван', price: '5000', cogs: '', status: 'assumption', source: 'commercial-offer.pdf' });
  assert.equal(r.form.offers[0].approved, false, 'an offer is never approved by the client by itself');
  assert.deepEqual(r.form.goals, [{ goal: 'Продати Диван', product: 'Диван' }, { goal: 'Привести покупців', product: '' }], 'a goal about an unknown product keeps the words, not the product');
  assert.match(r.form.text, /Не розкладено з розповіді:\n• клієнт з Києва/); assert.ok(r.applied >= 9);
  assert.equal(JSON.stringify(base), snapshot, 'the old form is not touched');
  assert.equal(applyChosen(base, { facts: [{ key: 'nope', value: 'x', mode: 'set' }] }).applied, 0, 'an unknown key never enters');
  const again = applyChosen(r, { products: [{ name: 'Диван', price: 1, cogs: null }], goals: [{ goal: 'Продати Диван', product: 'Диван' }] }); assert.equal(again.form.products.length, 2); assert.equal(again.form.goals.length, 2, 'the same product and goal are not added twice');
});
await test('brief extraction: the whole road with a stand-in model: the words go in, the facts are checked and accepted, the check of the readiness now has what it lacked', () => {
  const p = buildExtractPrompt({ text: EX_TEXT, fileNames: ['offer.pdf'], language: 'uk' });
  assert.match(p.system, /Never invent a fact/); assert.match(p.system, /exact words from the source/); assert.match(p.system, /"fb_page_id" \(numeric id/); assert.match(p.user, /TEXT OF THE MANAGER/); assert.match(p.user, /offer\.pdf/); assert.ok(p.user.includes('Бюджет на рекламу'));
  const checked = checkExtraction(EX_ANSWER(), { text: EX_TEXT });
  const start = EX_BASE();
  const before = checkBrief({ brief: contentFromForm(start.form), project: { website: 'https://shop.example' }, card: { settings: { inputs: {} }, assets: [] }, accounts: [], state: {} });
  const missing = before.items.filter((i) => !i.ok && i.level === 'required').map((i) => i.key);
  assert.ok(['budget_monthly', 'goal', 'avg_order', 'cogs_pct', 'fb_page_id', 'competitors'].every((k) => k === 'competitors' || missing.includes(k)));
  const chosen = { facts: checked.facts.filter((f) => f.state === 'ok').map((f) => ({ key: f.key, value: f.value, mode: conflictOf(f, start.form, start.extra) ? 'skip' : 'set' })), products: [], offers: [], goals: checked.goals.map((g) => ({ goal: g.goal, product: g.product })), notes: [] };
  const done = applyChosen(start, chosen, 'Розповідь менеджера');
  const after = checkBrief({ brief: contentFromForm(done.form), project: { website: 'https://shop.example' }, card: { settings: { inputs: {} }, assets: [] }, accounts: [], state: {} });
  const still = after.items.filter((i) => !i.ok && i.level === 'required').map((i) => i.key);
  for (const k of ['budget_monthly', 'goal', 'avg_order', 'cogs_pct', 'fb_page_id', 'creative_goals']) assert.ok(!still.includes(k), k + ' came from the words');
  assert.ok(still.includes('competitors') && still.includes('product_photo'), 'what the words did not say is still asked for');
  assert.equal(contentFromForm(done.form).general.geo, 'Україна', 'the geo conflict was not replaced: the person did not choose «Замінити»');
});
const makeZip = (entries) => {
  const locals = [], centrals = []; let offset = 0;
  for (const [name, data, deflate] of entries) {
    const nameB = Buffer.from(name), raw = Buffer.from(data), comp = deflate ? zlib.deflateRawSync(raw) : raw;
    const lh = Buffer.alloc(30); lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(deflate ? 8 : 0, 8); lh.writeUInt32LE(comp.length, 18); lh.writeUInt32LE(raw.length, 22); lh.writeUInt16LE(nameB.length, 26);
    const ch = Buffer.alloc(46); ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(deflate ? 8 : 0, 10); ch.writeUInt32LE(comp.length, 20); ch.writeUInt32LE(raw.length, 24); ch.writeUInt16LE(nameB.length, 28); ch.writeUInt32LE(offset, 42);
    locals.push(lh, nameB, comp); centrals.push(ch, nameB); offset += 30 + nameB.length + comp.length;
  }
  const cd = Buffer.concat(centrals), end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10); end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, end]);
};
await test('brief files: the text of a Word file, a text file and markdown is read by code (so quotes can be checked), a PDF is left to the model; wrong types, too many files, too big and empty files are refused in words', () => {
  const xml = '<w:document><w:body><w:p><w:r><w:t>Бюджет 4500 &amp; доставка</w:t></w:r></w:p><w:p><w:r><w:t>Тон:</w:t></w:r><w:tab/><w:r><w:t>теплий</w:t></w:r></w:p><w:tbl><w:tr><w:tc><w:p><w:r><w:t>ROAS</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>2.5</w:t></w:r></w:p></w:tc></w:tr></w:tbl></w:body></w:document>';
  for (const deflate of [true, false]) { const t = docxText(makeZip([['[Content_Types].xml', '<x/>', true], ['word/document.xml', xml, deflate]])); assert.match(t, /Бюджет 4500 & доставка\nТон:\tтеплий/); assert.match(t, /ROAS \| 2\.5/); }
  assert.throws(() => docxText(makeZip([['other.xml', '<x/>', true]])), /Не вдалося прочитати Word-файл/); assert.throws(() => docxText(Buffer.from('not a zip')), /Не вдалося прочитати Word-файл/);
  const b64 = (s) => Buffer.from(s).toString('base64');
  const r = readFiles([{ name: 'brief.docx', type: '', data: makeZip([['word/document.xml', xml, true]]).toString('base64') }, { name: 'note.txt', type: 'text/plain', data: b64('Тон теплий') }, { name: 'offer.pdf', type: 'application/pdf', data: b64('%PDF-1.4 x') }]);
  assert.deepEqual(r.files.map((f) => [f.name, f.read]), [['brief.docx', 'text'], ['note.txt', 'text'], ['offer.pdf', 'pdf']]);
  assert.match(r.text, /\[Файл brief\.docx\][\s\S]*Бюджет 4500/); assert.match(r.text, /\[Файл note\.txt\]\nТон теплий/); assert.equal(r.pdfBlocks.length, 1); assert.equal(r.pdfBlocks[0].source.media_type, 'application/pdf'); assert.deepEqual(r.unreadable, ['offer.pdf']);
  assert.throws(() => readFiles([{ name: 'a.exe', type: 'application/x-msdownload', data: b64('x') }]), /підходять PDF, Word/); assert.throws(() => readFiles([{ name: 'e.txt', type: 'text/plain', data: '' }]), /порожній/);
  assert.throws(() => readFiles(Array(4).fill({ name: 'a.txt', type: 'text/plain', data: b64('x') })), /до 3/); assert.throws(() => readFiles([{ name: 'big.txt', type: 'text/plain', data: 'A'.repeat(4_100_000) }]), /завеликі/);
  assert.match(readFiles([{ name: 'rules.md', type: '', data: b64('# Правила') }]).text, /\[Файл rules\.md\][\s\S]*# Правила/); assert.deepEqual(readFiles(undefined).files, []); assert.equal(isPdf('X.PDF', ''), true); assert.equal(isDocx('a.DOCX', ''), true);
});
await test('brief extraction: the endpoint needs a person, writes nothing, asks the model once and checks the answer by code; the page has the dictation, the files, the quotes and the choice for a conflict, and the accepted facts only fill the form', () => {
  const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
  const rd = (f) => fs.readFileSync(path.join(root, f), 'utf8');
  const api = rd('api/brief-extract.js'), imp = rd('src/components/Workflow/BriefImport.jsx'), page = rd('src/components/Workflow/BriefPage.jsx'), client = rd('src/lib/api/briefExtract.js');
  assert.match(api, /auth\.getUser\(token\)/); assert.match(api, /callModel\(/); assert.match(api, /checkExtraction\(/); assert.ok(!/\.insert\(|\.update\(|\.upsert\(/.test(api), 'nothing is written by the endpoint');
  assert.match(rd('vercel.json'), /"api\/brief-extract\.js": \{ "maxDuration": 90 \}/);
  for (const part of ['Розкажіть про клієнта своїми словами', 'Розібрати і розставити', 'Надиктувати', 'Прикріпити файл', 'цитата є в тексті', 'Залишити поточне', 'Замінити', 'Дописати', 'Додати вибране', 'Зберегти бриф', 'SpeechRecognition']) assert.ok((imp + page).includes(part), part);
  assert.match(imp, /conflictOf\(f, form, extra\)/); assert.match(imp, /mode: c \? 'skip'/); assert.match(page, /applyChosen\(\{ form, extra \}, chosen, source\)/); assert.match(page, /<BriefImport /);
  assert.match(client, /authedPost\('\/api\/brief-extract'/); assert.match(client, /MAX_TOTAL_BYTES = 3 \* 1024 \* 1024/);
});
await test('one brief: an action that is saved at once (a button wording, a file, the payment) must not wipe the edits the person has not saved yet (found by the test of 2026-11-26)', () => {
  const page = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src/components/Workflow/BriefPage.jsx'), 'utf8');
  assert.match(page, /const run = async \(fn, msg, key = 'save', keepDraft = false\)/); assert.match(page, /if \(keepDraft\) setCtx\(await loadBriefContext\(projectId\)\); else await load\(\)/);
  for (const part of ["null, 'cta', true)", "'file:' + kind, true)", "null, 'del', true)", "null, k, true)"]) assert.ok(page.includes(part), 'keeps the draft: ' + part);
  assert.ok(/saveAll\(\) \{\s*await run\(async \(\) => \{[\s\S]*?\}, 'Бриф збережено\.'\);/.test(page), 'the save of the page itself reloads the form from the store');
});
console.log(`\n${passed} workflow checks passed`);
