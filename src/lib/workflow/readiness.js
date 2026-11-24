// «Готовність до запуску» (a card of «Огляд»): the result of the skill mediabuyer/launch_check for a project, in words of the manager. PURE.
// run = the latest wf_runs row of the skill (status, error, output), steps = its wf_run_steps (title, status).
export function readinessOf({ run, steps = [] } = {}) {
  if (!run) return { tone: 'mute', title: 'Ще не перевірялось', lines: [], busy: false };
  if (['queued', 'running', 'waiting'].includes(run.status)) return { tone: 'info', title: 'Перевіряється…', lines: [], busy: true };
  if (run.status === 'failed') return { tone: 'bad', title: 'Є проблема', lines: [{ tone: 'bad', text: run.error || 'Перевірка не вдалася.' }], busy: false };
  const out = run.output || {};
  const lines = steps.map((s) => ({ tone: s.status === 'info' ? 'info' : 'ok', text: s.title }));
  const pageProblem = Array.isArray(out.pages) && out.page_ok === false;
  const readOnly = out.read_only === true;
  return {
    tone: pageProblem ? 'warn' : 'ok',
    title: pageProblem ? 'Перевірка пройдена, є що уточнити' : readOnly ? 'Кабінет і сторінка доступні (запис не перевірявся)' : 'Кабінет, право запису і сторінка в порядку',
    lines, busy: false,
  };
}
