// The Researcher's skill «unit_economy» (step A4): reads the numbers of the brief, counts the economy (economics.js), writes the section «Unit Economy»
// and the thresholds that the optimiser uses later. Without a price and a product cost nothing can be counted: the run waits, and a task for the client says what is needed
// (document 1.4: «Якщо ні, у список «Потрібно від клієнта» лягає блокер, розрахунок відкладається»). A new version of the brief wakes the run up.
import { computeUnitEconomy, renderUnitEconomy } from './economics.js';

export async function unitEconomy({ run, ctx }) {
  const brief = await ctx.repo.readSection(run.project_id, 'brief');
  const res = computeUnitEconomy(brief?.version?.content?.economics || {});
  if (res.blocked) {
    return {
      blocked: { on: 'brief', reason: 'Unit Economy чекає на дані брифу: ціни та собівартість товарів.' },
      tasks: [{ type: 'client', owner: 'client', priority: 'high', title: 'Надати ціни та собівартість товарів', evidence: res.missing.join(' ') }],
      steps: [{ title: 'Прочитано бриф', detail: {} }, { title: 'Не вистачає цін і собівартості: розрахунок відкладено', status: 'info' }],
    };
  }
  const tasks = [];
  if (res.assumptions.length) tasks.push({ type: 'client', owner: 'manager', priority: 'medium', title: 'Підтвердити припущення в Unit Economy', evidence: res.assumptions.join(' ') });
  if (res.missing.length) tasks.push({ type: 'client', owner: 'client', priority: 'medium', title: 'Доповнити дані для Unit Economy', evidence: res.missing.join(' ') });
  return {
    writes: [{ key: 'unit_economy', body: renderUnitEconomy(res), content: { thresholds: res.thresholds, lines: res.lines, scenarios: res.scenarios, assumptions: res.assumptions, missing: res.missing, inputs: res.inputs, provisional: res.provisional }, sources: [{ title: 'Бриф', version: brief?.version?.version ?? null }] }],
    tasks,
    steps: [{ title: 'Прочитано бриф' }, { title: `Пораховано ліній: ${res.lines.filter((l) => !l.blocked).length}, сценаріїв: ${res.scenarios.length}` }, ...(res.provisional ? [{ title: 'Розрахунок попередній: є припущення', status: 'info' }] : [])],
    output: { thresholds: res.thresholds, provisional: res.provisional },
  };
}
