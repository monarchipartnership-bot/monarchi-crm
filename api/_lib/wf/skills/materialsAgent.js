// The Creator's skill «materials_ideas» (step A6.1; document 1.6). Reads the materials and the brand of the client (the project card), the audit, the competitors and the audience,
// asks the model for a verdict on the materials, a shoot brief if they are not enough, and a bank of ideas; the code checks the verdict, the sources of the ideas and the
// numbers, counts the economics of every offer of ours, and writes the two sections «Креативи (матеріали)» and «Банк ідей». ctx.ask is the model (api/wf-tick.js).
import { buildIdeasPrompt, checkIdeas, checkMaterials, gatherIdeaFacts, inventoryOf, parseIdeasAnswer, renderIdeasText, renderMaterialsText } from './ideasEngine.js';

const NAME = { audience: 'Аудиторія', competitors: 'Ринок і конкуренти' };

export async function materialsIdeas({ run, ctx }) {
  const brief = await ctx.repo.readSection(run.project_id, 'brief');
  if (!brief?.version) return { blocked: { on: 'brief', reason: 'Матеріали й ідеї чекають на бриф.' }, steps: [{ title: 'Брифу ще немає', status: 'info' }] };
  if (!ctx.ask) throw new Error('Немає доступу до моделі: у змінних середовища Vercel не задано ANTHROPIC_API_KEY.');

  // «Крок 1.6 використовує 1.3 і 1.5»: the audience and the competitors come first; if either is still working, wait for it
  const snap = await ctx.repo.loadSnapshot(run.project_id);
  const sec = {};
  for (const k of ['audience', 'competitors', 'audit', 'unit_economy']) sec[k] = (await ctx.repo.readSection(run.project_id, k))?.version || null;
  for (const k of ['audience', 'competitors']) {
    if (!sec[k] && snap.runs.some((r) => r.agent === 'researcher' && r.skill === k && ['queued', 'running'].includes(r.status))) {
      return { blocked: { on: k, reason: `Матеріали й ідеї чекають на розділ «${NAME[k]}».` }, steps: [{ title: 'Чекаємо дослідження', status: 'info' }] };
    }
  }
  const materials = await ctx.repo.readCreativeMaterials(run.project_id);
  const inventory = inventoryOf(materials);
  const facts = gatherIdeaFacts({ brief: brief.version, materials, audit: sec.audit?.content || null, competitors: sec.competitors?.content || null, audience: sec.audience?.content || null, unitEconomy: sec.unit_economy?.content || null });

  const project = await ctx.repo.readProject(run.project_id);
  const prompt = buildIdeasPrompt({ facts, language: project?.client_language === 'en' ? 'en' : 'uk' });
  const answer = await ctx.ask({ projectId: run.project_id, runId: run.id, system: prompt.system, user: prompt.user, maxTokens: 7000 });
  const raw = parseIdeasAnswer(answer.text);
  const m = checkMaterials(raw, inventory);
  if (m.verdict === 'not_enough' && !m.shoot_list.length) throw new Error('Матеріалів недостатньо, але модель не склала ТЗ на зйомку. Запуск буде повторено.');
  const ideas = checkIdeas(raw, { facts, economics: brief.version.content?.economics || null });
  if (!ideas.items.length) throw new Error('Модель не повернула жодної придатної ідеї.');

  const notCovered = ['Реклама цієї ж ніші на інших ринках: джерело для неї ще не вибрано (відкрите питання документа), тож ідеї беруться з конкурентів, аудиторії та власні.'];
  const open = [];
  if (!sec.competitors) open.push('Розділу «Ринок і конкуренти» немає: ідеї без прикладів конкурентів.');
  if (!sec.audience) open.push('Розділу «Аудиторія» немає: ідеї без сегментів.');
  open.push('Відео клієнта в системі не зберігаються: враховано лише завантажені картинки й посилання з поля «Посилання на готові креативи».');
  if (ideas.dropped) open.push(`Відкинуто ідей без обов’язкових полів: ${ideas.dropped}.`);
  const unverified = ideas.items.filter((x) => x.status === 'unverified').length, recs = ideas.items.filter((x) => x.recommendation).length;

  const tasks = [];
  inventory.hard_gaps.forEach((g) => tasks.push({ type: 'creatives', owner: 'client', priority: 'high', title: g.includes('фото продукту') ? 'Надати фото продукту' : 'Надати базові матеріали', evidence: g }));
  if (m.verdict === 'not_enough' && m.shoot_list.length) tasks.push({ type: 'creatives', owner: 'client', priority: 'high', title: 'Відзняти матеріали за ТЗ', evidence: m.shoot_list.map((s, i) => `${i + 1}. ${s.what} (${s.format})`).join(' ').slice(0, 600) });

  const matBody = renderMaterialsText(inventory, m, { assetsSeen: 'Файли беремо з картки проєкту («Креативи»): логотип, фото продукту, приклади стилю й готові креативи.' }) + '\n\nВідкриті питання\n' + open.map((o) => `• ${o}`).join('\n');
  const ideasBody = renderIdeasText(ideas.items, { notCovered });
  const from = (list) => list.filter(([, on]) => on).map(([title]) => ({ title }));
  return {
    writes: [
      { key: 'materials', body: matBody, content: { schema: 1, inventory: { count: inventory.count, brand: inventory.brand, hard_gaps: inventory.hard_gaps }, verdict: m.verdict, forced: m.forced, reason: m.reason, have: m.have, missing: m.missing, shoot_list: m.shoot_list, open }, sources: [{ title: 'Картка проєкту: матеріали' }, ...from([['Ринок і конкуренти', sec.competitors], ['Аудиторія', sec.audience]])] },
      { key: 'ideas', body: ideasBody, content: { schema: 1, items: ideas.items, not_covered: notCovered }, sources: [...from([['Ринок і конкуренти', sec.competitors], ['Аудиторія', sec.audience]]), { title: 'Unit Economy (розрахунок оферів)' }] },
    ],
    tasks,
    steps: [{ title: `Матеріалів: ${m.verdict === 'enough' ? 'достатньо' : 'недостатньо'}${m.forced ? ' (за правилом коду)' : ''}${m.shoot_list.length ? `, у ТЗ пунктів: ${m.shoot_list.length}` : ''}` }, { title: `Ідей: ${ideas.items.length} (рекомендацій з оффером: ${recs}, не підтверджено: ${unverified})` }, ...(tasks.length ? [{ title: `Задач: ${tasks.length}` }] : [])],
    output: { verdict: m.verdict, ideas: ideas.items.length, recommendations: recs },
    costUsd: answer.costUsd || 0,
  };
}
