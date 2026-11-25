// The Support agent's skill «period_report»: the REPORT AGENT of a project (weekly and monthly reports as drafts, api/_lib/projectAgentRun.js) as a run of the orchestrator
// (owner's decision of 2026-11-24: the report agent merges into the Support agent). The work itself is the same code and the same rules: the numbers are counted by the report engine,
// the model only phrases «What was done», nothing is sent to a client, a report a person made is never touched. What the merge changes is where it is SEEN: the run lands in the one journal
// of all runs («Прогони»), its cost in the spend of the agents, its failure in the card of the project, its state on the map.
// ctx.reports.run({ projectId, periodType, scheduledFor }) is handed in by the door (api/wf-tick.js), so the skill is tested without a network.

export async function periodReport({ run, ctx }) {
  if (!ctx.reports?.run) throw new Error('Агент звітів не підключено на сервері: звіт не зроблено.');
  const { periodType, scheduledFor } = run.input || {};
  if (!['weekly', 'monthly'].includes(periodType)) throw new Error('Не вказано тип звіту (тижневий чи місячний).');
  const r = await ctx.reports.run({ projectId: run.project_id, periodType, scheduledFor });
  if (r.status === 'problem') throw new Error(`Звіт не вдалося зробити: ${r.message || 'причина не вказана'}`);
  const label = periodType === 'weekly' ? 'тижневий' : 'місячний';
  return {
    output: { status: r.status, period_type: periodType, report_id: r.reportId || null, deck_ids: r.deckIds || [] },
    steps: [
      { title: r.status === 'skipped' ? `Звіт пропущено: ${r.message || 'немає чого робити'}` : `Чернетка звіту (${label}) готова${r.message ? `: ${r.message}` : ''}`, status: r.status === 'skipped' ? 'info' : undefined },
      ...(r.notes || []).slice(0, 4).map((n) => ({ title: String(n).slice(0, 200), status: 'info' })),
    ],
    costUsd: r.costUsd || 0,
  };
}
