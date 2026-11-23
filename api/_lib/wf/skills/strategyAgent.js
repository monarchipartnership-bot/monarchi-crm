// The Strategist's skill «strategy» (step A7.1; document, step 2). Reads the whole dossier of stage 1, the creatives of the Creator, the Unit Economy; the code counts the
// budget and its limits, the margins, the needs of the client and the rules of optimisation; one model call chooses the structure of the first month and writes the
// explanations; the code checks the structure and writes the section «Стратегія» (a new version on every run: v1, then v2 after a return, with the comment of the person).
// The strategy repeats `budget_monthly` and `geo` of the brief: the automatic check compares them. ctx.ask is the model.
import { PARAMS, budgetPlan, buildStrategyPrompt, checkStrategy, gatherStrategyFacts, marginInfo, neededFromClient, optimisationRules, parseStrategyAnswer, prioritySource, renderStrategyText } from './strategyEngine.js';

export async function strategy({ run, ctx }) {
  const brief = await ctx.repo.readSection(run.project_id, 'brief');
  if (!brief?.version) return { blocked: { on: 'brief', reason: 'Стратегія чекає на бриф.' }, steps: [{ title: 'Брифу ще немає', status: 'info' }] };
  const ueSec = (await ctx.repo.readSection(run.project_id, 'unit_economy'))?.version || null;
  if (!ueSec) return { blocked: { on: 'unit_economy', reason: 'Стратегія чекає на Unit Economy: бюджети й пороги беруться з нього.' }, steps: [{ title: 'Чекаємо Unit Economy', status: 'info' }] };
  const economics = brief.version.content?.economics || {};
  const plan = budgetPlan({ economics, unitEconomy: ueSec.content });
  if (!plan) {
    return { blocked: { on: 'brief', reason: 'У брифі не вказано місячний бюджет.' }, tasks: [{ type: 'client', owner: 'manager', priority: 'high', title: 'Вказати місячний бюджет реклами в брифі', evidence: 'Без бюджету неможливо порахувати кількість кампаній і розподіл.' }], steps: [{ title: 'Бюджету немає', status: 'info' }] };
  }
  if (!ctx.ask) throw new Error('Немає доступу до моделі: у змінних середовища Vercel не задано ANTHROPIC_API_KEY.');

  const get = async (k) => (await ctx.repo.readSection(run.project_id, k))?.version || null;
  const [audience, ideas, creatives, materials, audit, prev] = await Promise.all(['audience', 'ideas', 'creatives', 'materials', 'audit', 'strategy'].map(get));
  const tasks = ctx.repo.listTasks ? await ctx.repo.listTasks(run.project_id) : [];
  const now = (ctx.now || (() => new Date()))();
  const margins = marginInfo(ueSec.content);
  const priority = prioritySource(brief.version);
  const rework = run.input?.rework_of != null ? { comment: String(run.input.comment || '').slice(0, 800), remarks: (run.input.remarks || []).map((r) => ({ block: String(r.target || '').slice(0, 40), text: String(r.text || '').slice(0, 400) })), creatives_reworked: run.input.creatives_reworked || [], previous: prev ? { summary: prev.content?.summary || '', campaigns: (prev.content?.campaigns || []).map((c) => ({ name: c.name, daily_budget: c.daily_budget, segments: c.segments })), priorities: (prev.content?.priorities || []).map((p) => p.product) } : null } : null;

  const facts = gatherStrategyFacts({ brief: brief.version, plan, margins, priority, ue: ueSec.content, audience: audience?.content, ideas: ideas?.content, creatives: creatives?.content, materials: materials?.content, audit: audit?.content, rework });
  const project = await ctx.repo.readProject(run.project_id);
  const prompt = buildStrategyPrompt({ facts, language: project?.client_language === 'en' ? 'en' : 'uk' });
  const answer = await ctx.ask({ projectId: run.project_id, runId: run.id, system: prompt.system, user: prompt.user, maxTokens: 7000 });
  const checked = checkStrategy(parseStrategyAnswer(answer.text), { facts, plan, margins, priority });

  const opt = optimisationRules(ueSec.content?.thresholds);
  const base = plan.scenarios.find((s) => /Базов/i.test(s.name)) || plan.scenarios[1] || null;
  const needed = neededFromClient({ audit: audit?.content || null, materials: materials?.content || null, tasks, now });
  const assumptions = [...opt.assumptions, `Ремаркетинг вмикаємо від бюджету на день ${plan.remarketing_from_daily} (мінімум кампанії ×${PARAMS.remarketing_min_daily_factor}): це припущення, документ залишає питання відкритим.`, 'Дати в списку «Потрібно від клієнта» запропоновані системою (піксель +3 дні, матеріали +7, правки сайту +10), узгодьте їх з клієнтом.', ...(ueSec.content?.provisional ? ['Unit Economy попередній: частина цифр брифу лишається припущенням, бюджети й пороги можуть змінитися.'] : [])];
  const version = (prev ? Number(prev.content?.version || 1) + 1 : 1);
  const content = {
    schema: 1, version, rework: rework ? { of: run.input.rework_of, comment: rework.comment } : null,
    budget_monthly: plan.monthly, geo: String(brief.version.content?.general?.geo || '').trim(), currency: plan.currency,
    summary: checked.summary, goal: { text: String(brief.version.content?.general?.goal || '').trim(), base },
    priority_source: priority.source, priority_instruction: priority.instruction, priorities: checked.priorities,
    budget: { monthly: plan.monthly, daily: plan.daily, min_daily: plan.min_daily, max_campaigns: plan.max_campaigns, scenarios: plan.scenarios },
    campaigns: checked.campaigns.map(({ share, ...c }) => c), remarketing: checked.remarketing, seasonal: checked.seasonal,
    needed_from_client: needed, optimisation: opt, warnings: checked.warnings, notes: checked.notes, assumptions,
    creatives_branch: creatives?.content?.branch || null,
  };
  const tasksOut = needed.map((x) => ({ type: /піксель/i.test(x.what) ? 'tracking' : /матеріал/i.test(x.what) ? 'creatives' : 'site', owner: 'client', priority: 'high', title: x.what.slice(0, 140), evidence: `Потрібно до ${x.due}. Джерело: ${x.source}.` })).filter((t) => t.type !== 'site');
  return {
    writes: [{ key: 'strategy', body: renderStrategyText({ ...content, goal: content.goal }), content, sources: [{ title: 'Бриф' }, { title: 'Unit Economy' }, ...(audience ? [{ title: 'Аудиторія' }] : []), ...(creatives ? [{ title: 'Креативи' }] : [])] }],
    tasks: tasksOut,
    steps: [{ title: `Бюджет: ${plan.daily} на день, кампаній до ${plan.max_campaigns}` }, { title: `Кампаній у схемі: ${checked.campaigns.length}, пріоритетних товарів: ${checked.priorities.length}${rework ? ' (доопрацювання)' : ''}` }, ...(checked.warnings.length ? [{ title: `Попереджень: ${checked.warnings.length}`, status: 'info' }] : [])],
    output: { version, campaigns: checked.campaigns.length, warnings: checked.warnings.length },
    costUsd: answer.costUsd || 0,
  };
}
