// What the scheduler does every few minutes: look at the project agents that are switched on, work out which
// reports are due by their own schedule (Kyiv time), and start a small batch of runs. Everything outside is
// handed in, so this is tested without a database or a network.
import { dueReportPeriod } from '../../src/lib/reportEngine.js';
import { isDue } from '../../src/lib/agentSchedule.js';

const TYPES = ['weekly', 'monthly'];

// repo: { listEnabledAgents(), getRecentRuns(projectId, periodType) }
// runFor({ projectId, periodType, scheduledFor }): does one run (see projectAgentRun.js).
// → { checked, due: [{ projectId, periodType, scheduledFor }], started: [...results], waiting: n }
export async function runDueAgents({ repo, runFor, now = new Date(), batch = 4, budgetMs = 150000, clock = () => Date.now() }) {
  const began = clock();
  const agents = await repo.listEnabledAgents();
  const due = [];
  for (const agent of agents) {
    for (const periodType of TYPES) {
      const runs = await repo.getRecentRuns(agent.project_id, periodType);
      // A weekly report is a whole Monday-to-Sunday week (13.11), so it is due on its own Monday only: a week no longer ends with the month. The same period asked
      // twice in one tick is started once.
      const schedTypes = [periodType];
      for (const schedType of schedTypes) {
        const verdict = isDue({ periodType, schedType, agent, runs, now, dueStartOf: (date) => dueReportPeriod(periodType, date)?.period.start });
        if (verdict.due && !due.some((d) => d.projectId === agent.project_id && d.periodType === periodType && d.periodStart === verdict.periodStart)) due.push({ projectId: agent.project_id, periodType, scheduledFor: verdict.scheduledFor, periodStart: verdict.periodStart });
      }
    }
  }
  const chosen = due.slice(0, batch);
  // At most `batch` runs per tick, a couple at a time (never two of the same project at once: they share one lock, the second would only leave an empty «already working» run
  // every minute). A new pair is not started when the pass has used its share of the function's time: the rest are picked up by the next tick.
  const started = [];
  const left = [...chosen];
  while (left.length && (started.length === 0 || clock() - began < budgetMs)) {
    const wave = [];
    for (let i = 0; i < left.length && wave.length < 2;) {
      if (wave.some((j) => j.projectId === left[i].projectId)) { i += 1; continue; }
      wave.push(left.splice(i, 1)[0]);
    }
    const results = await Promise.all(wave.map(async (job) => {
      try { return { ...job, ...(await runFor(job)) }; } catch (e) { return { ...job, status: 'problem', message: e?.message || String(e) }; }
    }));
    started.push(...results);
  }
  return { checked: agents.length, due: due.length, started, waiting: Math.max(0, due.length - started.length) };
}
