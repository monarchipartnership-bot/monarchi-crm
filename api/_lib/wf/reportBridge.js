// The bridge between the clock of the report agent (api/agent-tick.js decides WHAT is due, by its own schedule in Kyiv time) and the orchestrator (WHERE it runs).
// With the switch REPORTS_VIA_ORCHESTRATOR=1 a due report is not made inside the clock but queued as a run «support/period_report»; the orchestrator does it within a minute.
// Without the switch nothing changes: the clock makes the report itself, as before. The queue keeps one open run per project, so a report that is still waiting is not queued twice.
const UNIQUE = '23505';

export const reportsViaOrchestrator = (env = process.env) => String(env.REPORTS_VIA_ORCHESTRATOR || '').trim() === '1';

// db: a signed-in Supabase client. → a function with the signature of runFor of runDueAgents: ({ projectId, periodType, scheduledFor }) → { status, message }
export function enqueueReportRun(db) {
  return async ({ projectId, periodType, scheduledFor }) => {
    const r = await db.from('wf_runs').insert({ project_id: projectId, agent: 'support', skill: 'period_report', input: { periodType, scheduledFor }, trigger: 'cron', priority: 90, created_by: 'report-clock' });
    if (r.error) {
      if (r.error.code === UNIQUE) return { status: 'queued', message: 'Звіт уже в черзі оркестратора.' };
      throw new Error('Не вдалося поставити звіт у чергу: ' + r.error.message);
    }
    return { status: 'queued', message: 'Звіт поставлено в чергу оркестратора.' };
  };
}
