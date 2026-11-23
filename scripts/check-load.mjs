// Load check of the orchestrator (step A12): many projects at once, several workers running passes at the same time, the emergency stop in the middle.
// Stand-in handlers (no network), the in-memory twin of the storage. It checks the rules that must hold under load: one open run per project+agent+skill,
// no run taken twice, every project reaches the same place as it would alone, the stop really stops, and how many passes the whole crowd needs.
// Run:  node scripts/check-load.mjs
import assert from 'node:assert/strict';
import { createHandlers } from '../api/_lib/wf/agents.js';
import { processTick } from '../api/_lib/wf/tick.js';
import { createMemoryWfRepo } from './wfMemoryRepo.mjs';

const clock = { t: new Date('2026-11-23T09:00:00Z') };
const now = () => new Date(clock.t);
const advance = (ms) => { clock.t = new Date(clock.t.getTime() + ms); };
let passed = 0;
const test = async (name, fn) => { try { await fn(); passed += 1; console.log('ok  ', name); } catch (e) { console.error('FAIL', name, '\n', e); process.exitCode = 1; } };

const PROJECTS = 40, WORKERS = 3;
async function crowd(n = PROJECTS) {
  const repo = createMemoryWfRepo({ now });
  const ctx = { repo, handlers: createHandlers(), now, stubHasData: true };
  for (let id = 1; id <= n; id += 1) {
    await repo.ensureState(id);
    await repo.writeSectionVersion(id, 'brief', { body: 'brief', author_kind: 'human', author: 'manager@test' });
    await repo.setProjectFlag(id, { paid_at: now().toISOString(), contracts_signed_at: now().toISOString() });
  }
  return { repo, ctx };
}
// one minute of the cron: WORKERS passes at the same moment (the cron of the next minute starts before a long pass has finished)
const minute = async (ctx) => { const r = await Promise.all(Array.from({ length: WORKERS }, () => processTick(ctx, { limit: 3 }))); advance(60000); return r; };
const openKeys = (repo) => repo.T.runs.filter((r) => ['queued', 'running', 'waiting'].includes(r.status)).map((r) => `${r.project_id}/${r.agent}/${r.skill}`);

let minutes = 0, totals = null;
await test(`load: ${PROJECTS} projects and ${WORKERS} workers at once: nobody takes a run twice, no duplicate open runs, every project reaches Апрув 1`, async () => {
  const { repo, ctx } = await crowd();
  for (; minutes < 600; minutes += 1) {
    await minute(ctx);
    const keys = openKeys(repo);
    assert.equal(new Set(keys).size, keys.length, 'one open run per project, agent and skill');
    const running = repo.T.runs.filter((r) => r.status === 'running');
    assert.equal(new Set(running.map((r) => r.id)).size, running.length);
    if (repo.T.approvals.filter((a) => a.kind === 'strategy' && a.status === 'pending').length === PROJECTS && !openKeys(repo).length) break;
  }
  assert.ok(minutes < 600, 'the crowd finished');
  const pending = repo.T.approvals.filter((a) => a.kind === 'strategy' && a.status === 'pending');
  assert.equal(pending.length, PROJECTS, 'one Апрув 1 for each project, not more');
  assert.equal(repo.T.runs.filter((r) => r.status === 'failed').length, 0, 'nothing failed');
  const per = {}; for (const r of repo.T.runs) per[r.project_id] = (per[r.project_id] || 0) + 1;
  const counts = new Set(Object.values(per));
  assert.equal(counts.size, 1, 'every project got the same chain of runs: ' + [...counts].join(','));
  totals = { runsPerProject: [...counts][0], runs: repo.T.runs.length };
});
await test('load: a project alone and the same project in the crowd do exactly the same runs', async () => {
  const solo = await crowd(1);
  for (let i = 0; i < 200; i += 1) await minute(solo.ctx);
  const many = await crowd(PROJECTS);
  for (let i = 0; i < 600; i += 1) await minute(many.ctx);
  const names = (repo, id) => repo.T.runs.filter((r) => r.project_id === id).map((r) => `${r.agent}/${r.skill}`).sort();
  assert.deepEqual(names(many.repo, 17), names(solo.repo, 1));
});
await test('load: the emergency stop in the middle of the crowd stops everything at once and the work goes on after it is lifted', async () => {
  const { repo, ctx } = await crowd();
  for (let i = 0; i < 6; i += 1) await minute(ctx);
  const before = JSON.stringify([repo.T.runs.map((r) => [r.id, r.status]), repo.T.approvals.length, repo.T.journal.length]);
  repo.T.settings.stopped = true;
  for (let i = 0; i < 10; i += 1) { const rs = await minute(ctx); assert.ok(rs.every((r) => r.stopped === true)); }
  assert.equal(JSON.stringify([repo.T.runs.map((r) => [r.id, r.status]), repo.T.approvals.length, repo.T.journal.length]), before, 'nothing moved while stopped');
  repo.T.settings.stopped = false;
  for (let i = 0; i < 600; i += 1) await minute(ctx);
  assert.equal(repo.T.approvals.filter((a) => a.kind === 'strategy' && a.status === 'pending').length, PROJECTS, 'everyone finished after the stop was lifted');
});
await test('load: the general limit of the month stops the whole crowd, and raising it lets the crowd go on', async () => {
  const { repo, ctx } = await crowd(10);
  repo.T.settings.monthly_cap_usd = 0.5; repo.T.settings.project_cap_default_usd = 100;
  for (let i = 0; i < 4; i += 1) await minute(ctx);
  for (const r of repo.T.runs.filter((x) => x.status === 'done').slice(0, 5)) r.cost_usd = 1; // the first work cost money
  for (let i = 0; i < 20; i += 1) await minute(ctx);
  const waiting = repo.T.runs.filter((r) => r.status === 'waiting' && /загальний ліміт/.test(r.error || ''));
  assert.ok(waiting.length > 0, 'some runs wait for the general limit');
  repo.T.settings.monthly_cap_usd = 1000;
  for (let i = 0; i < 600; i += 1) await minute(ctx);
  assert.equal(repo.T.approvals.filter((a) => a.kind === 'strategy' && a.status === 'pending').length, 10, 'after the limit was raised all projects finished');
});

console.log(`\n${passed} load checks passed. The crowd of ${PROJECTS} projects needed ${minutes} minutes of the cron with ${WORKERS} passes each (${totals?.runsPerProject} runs per project, ${totals?.runs} runs in all).`);
