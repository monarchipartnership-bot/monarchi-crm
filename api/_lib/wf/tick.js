// One pass of the orchestrator (step A2): plan what is due for every active project, take the queued runs (a few at a time), run them, then plan again
// so that a finished run leads to the next step at once. The cron calls it about once a minute; a person's button can call it too.
// ctx = { repo, handlers, now?, validate?, config? }.  repo: createWfRepo(db) or the in-memory twin; handlers: createHandlers(...)
import { planNext } from './machine.js';

const monthStart = (d) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString();
const GUARD = /may not replace/;

async function applyActions(ctx, projectId, actions, stats) {
  const { repo } = ctx;
  for (const a of actions) {
    if (a.type === 'enqueue') { const row = await repo.enqueueRun({ project_id: projectId, agent: a.agent, skill: a.skill, input: a.input, priority: a.priority }); if (row) stats.enqueued += 1; }
    else if (a.type === 'approval') { const row = await repo.createApproval(projectId, a.kind, a.subject); if (row) stats.approvals += 1; }
    else if (a.type === 'set_stage') await repo.setStage(projectId, a.stage);
    else if (a.type === 'section_status') await repo.setSectionStatus(projectId, a.key, a.status);
    else if (a.type === 'journal') { const entry = { action: a.action, summary: a.summary, meta: a.meta }; if (a.once) await repo.journalOnce(projectId, entry); else await repo.journal(projectId, entry); }
  }
}

// Plans one project. → the number of actions applied
export async function planProject(ctx, projectId, stats = { enqueued: 0, approvals: 0 }) {
  const now = (ctx.now || (() => new Date()))();
  if (ctx.repo.resumeBlocked) await ctx.repo.resumeBlocked(projectId); // a run that waited for a section goes back to the queue when the section changed
  const snap = await ctx.repo.loadSnapshot(projectId);
  if (!snap.state) return 0;
  const checks = ctx.validate ? await ctx.validate({ projectId, ...snap }) : { ok: true, problems: [] };
  const actions = planNext({ now, ...snap, checks, config: ctx.config });
  await applyActions(ctx, projectId, actions, stats);
  return actions.length;
}

async function runOne(ctx, run, stats) {
  const { repo, handlers } = ctx;
  const now = ctx.now || (() => new Date());
  const snap = await repo.loadSnapshot(run.project_id);
  const cap = snap.state?.cost_cap_usd;
  if (cap != null && (await repo.projectCost(run.project_id, monthStart(now()))) >= Number(cap)) {
    await repo.finishRun(run.id, { status: 'waiting', error: `Досягнуто ліміт витрат проєкту ($${Number(cap).toFixed(2)}).` });
    await repo.journal(run.project_id, { action: 'cost_cap', subject: `${run.agent}/${run.skill}`, summary: 'Прогін зупинено: ліміт витрат проєкту.' });
    stats.waiting += 1;
    return;
  }
  const handler = handlers?.[run.agent]?.[run.skill];
  if (!handler) {
    await repo.finishRun(run.id, { status: 'failed', error: `Немає обробника для ${run.agent}/${run.skill}.` });
    stats.failed += 1;
    return;
  }
  try {
    const result = (await handler({ run, project: { id: run.project_id, state: snap.state }, ctx })) || {};
    for (const wr of result.writes || []) {
      const base = { body: wr.body, content: wr.content, author_kind: 'agent', author: run.agent, run_id: run.id, sources: wr.sources || [] };
      try { await repo.writeSectionVersion(run.project_id, wr.key, base); }
      catch (e) { // a human or approved version stays: the agent's text goes in as a proposal
        if (!GUARD.test(String(e?.message))) throw e;
        await repo.writeSectionVersion(run.project_id, wr.key, { ...base, is_proposal: true, note: 'Пропозиція: людська або затверджена версія не замінюється.' });
        await repo.journal(run.project_id, { actor_kind: 'agent', actor: run.agent, action: 'proposal', subject: wr.key, summary: 'Агент надіслав пропозицію замість заміни версії.' });
      }
    }
    for (const t of result.tasks || []) if (repo.addTask) await repo.addTask(run.project_id, { ...t, created_by: run.agent });
    if (result.blocked) { // the run cannot go on without something from a person: it waits, a task says what is needed, and a new version of the section wakes it up
      await repo.addSteps(run.id, result.steps || []);
      await repo.finishRun(run.id, { status: 'waiting', error: result.blocked.reason || null, state: { blocked_on: result.blocked.on, blocked_at: (ctx.now ? ctx.now() : new Date()).toISOString() } });
      await repo.journalOnce(run.project_id, { actor_kind: 'agent', actor: run.agent, action: 'blocked', subject: run.skill, summary: result.blocked.reason || 'Крок чекає на дані від людини.' });
      stats.waiting += 1;
      return;
    }
    if (result.stateUpdate) await repo.setProjectFlag(run.project_id, result.stateUpdate);
    for (const ap of result.approvals || []) await repo.createApproval(run.project_id, ap.kind, ap.subject, run.agent);
    await repo.addSteps(run.id, result.steps || []);
    await repo.finishRun(run.id, { status: 'done', output: result.output || null, costUsd: result.costUsd || 0 });
    await repo.journal(run.project_id, { actor_kind: 'agent', actor: run.agent, action: 'run_done', subject: run.skill, summary: `Готово: ${run.agent}/${run.skill}` });
    stats.done += 1;
  } catch (e) {
    await repo.finishRun(run.id, { status: 'failed', error: String(e?.message || e).slice(0, 600) });
    await repo.journal(run.project_id, { actor_kind: 'agent', actor: run.agent, action: 'run_failed', subject: run.skill, summary: String(e?.message || e).slice(0, 300) });
    stats.failed += 1;
  }
}

export async function processTick(ctx, { limit = 3, leaseMinutes = 10 } = {}) {
  const stats = { enqueued: 0, approvals: 0, claimed: 0, done: 0, failed: 0, waiting: 0 };
  const projects = await ctx.repo.listActiveProjects();
  for (const id of projects) await planProject(ctx, id, stats);
  const runs = await ctx.repo.claimRuns(limit, leaseMinutes);
  stats.claimed = runs.length;
  await Promise.all(runs.map((r) => runOne(ctx, r, stats)));
  const touched = [...new Set(runs.map((r) => r.project_id))];
  for (const id of touched) await planProject(ctx, id, stats); // a finished run leads to the next step in the same pass
  return stats;
}
