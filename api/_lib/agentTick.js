// What the scheduler does every few minutes: look at the project agents that are switched on, work out which
// reports are due by their own schedule (Kyiv time), and start a small batch of runs. Everything outside is
// handed in, so this is tested without a database or a network.
import { dueReportPeriod } from '../../src/lib/reportEngine.js';
import { isDue } from '../../src/lib/agentSchedule.js';

const TYPES = ['weekly', 'monthly'];

// repo: { listEnabledAgents(), getRecentRuns(projectId, periodType) }
// runFor({ projectId, periodType, scheduledFor }): does one run (see projectAgentRun.js).
// → { checked, due: [{ projectId, periodType, scheduledFor }], started: [...results], waiting: n }
export async function runDueAgents({ repo, runFor, now = new Date(), batch = 4 }) {
  const agents = await repo.listEnabledAgents();
  const due = [];
  for (const agent of agents) {
    for (const periodType of TYPES) {
      const runs = await repo.getRecentRuns(agent.project_id, periodType);
      const verdict = isDue({ periodType, agent, runs, now, dueStartOf: (date) => dueReportPeriod(periodType, date)?.period.start });
      if (verdict.due) due.push({ projectId: agent.project_id, periodType, scheduledFor: verdict.scheduledFor });
    }
  }
  const chosen = due.slice(0, batch);
  // At most `batch` runs per tick, a couple at a time: the rest are picked up by the next tick.
  const started = [];
  for (let i = 0; i < chosen.length; i += 2) {
    const results = await Promise.all(chosen.slice(i, i + 2).map(async (job) => {
      try { return { ...job, ...(await runFor(job)) }; } catch (e) { return { ...job, status: 'problem', message: e?.message || String(e) }; }
    }));
    started.push(...results);
  }
  return { checked: agents.length, due: due.length, started, waiting: Math.max(0, due.length - chosen.length) };
}
