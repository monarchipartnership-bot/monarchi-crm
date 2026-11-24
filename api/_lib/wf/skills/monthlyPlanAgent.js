// The Strategist's skill «monthly_plan» (document, step 5). The orchestrator asks for it at the start of every month after the launch (and again after Апрув 3 returned a plan).
// Reads the dossier (brief, strategy, Unit Economy, the launch snapshot), the results of the LAST month from the ad account (read only), the last advice of the optimiser, the events
// of the calendar and the seasonality the client wrote; the code counts the results, the budgets inside the step of the rules and the dates; one model call says in words what worked and what did
// not and chooses among the campaigns and events; the code checks it and writes the section «План на місяць» (a new version on every run). The plan then goes to Апрув 3 (the orchestrator).
// Tasks for the client with a date come from the events; the goals of creatives for the events are given to the manager (the Creator makes creatives from the goals of the brief).
import { countriesOf } from '../../metaAdsWrite.js';
import { budgetPlan } from './strategyEngine.js';
import { buildPlanPrompt, checkPlan, eventsFor, gatherPlanFacts, monthWindows, parsePlanAnswer, renderPlanText, summarizeLastMonth } from './monthlyPlanEngine.js';

const OPEN_TASK = new Set(['proposed', 'approved', 'in_progress']);

export async function monthlyPlan({ run, ctx }) {
  const get = async (k) => (await ctx.repo.readSection(run.project_id, k))?.version || null;
  const [brief, strategySec, ueSec, launch] = await Promise.all(['brief', 'strategy', 'unit_economy', 'launch'].map(get));
  if (!brief) return { blocked: { on: 'brief', reason: 'План місяця чекає на бриф.' }, steps: [{ title: 'Брифу ще немає', status: 'info' }] };
  if (!strategySec?.content?.campaigns?.length) return { blocked: { on: 'strategy', reason: 'План місяця чекає на стратегію зі схемою кампаній.' }, steps: [{ title: 'Стратегії ще немає', status: 'info' }] };
  const plan = budgetPlan({ economics: brief.content?.economics || {}, unitEconomy: ueSec?.content || null });
  if (!ctx.ask) throw new Error('Немає доступу до моделі: у змінних середовища Vercel не задано ANTHROPIC_API_KEY.');

  const now = (ctx.now || (() => new Date()))();
  const win = monthWindows(now);
  const steps = [];
  // the results of the last month: from the cabinet, read only; without a launch or a reader there is nothing to read and the plan says so
  let last = null;
  const accounts = (await ctx.repo.listAdAccounts(run.project_id)).filter((a) => a.platform === 'meta');
  if (launch?.content?.status === 'done' && accounts.length && ctx.meta?.insights) {
    const accountId = accounts[0].account_id, timeRange = { since: win.prev.since, until: win.prev.until };
    const read = async (level) => (await ctx.meta.insights({ accountId, level, timeRange, maxPages: 10, limit: 500 })).rows || [];
    last = { period: `${win.prev.since} – ${win.prev.until}`, ...summarizeLastMonth({ campaignRows: await read('campaign'), adRows: await read('ad') }) };
    steps.push({ title: `Прочитано кабінет за ${last.period}: витрачено ${last.totals.spend}, покупок ${last.totals.purchases}` });
  } else steps.push({ title: 'Результатів минулого місяця немає: запуску не було або кабінет недоступний для читання', status: 'info' });

  const opt = ctx.repo.lastJournal ? await ctx.repo.lastJournal(run.project_id, 'optimize') : null;
  const materials = ctx.repo.readCreativeMaterials ? await ctx.repo.readCreativeMaterials(run.project_id) : null;
  const seasonality = materials?.settings?.inputs?.seasonality?.body || '';
  const geoCodes = countriesOf(brief.content?.general?.geo).codes;
  const events = eventsFor({ geoCodes, from: win.from, to: win.to });
  const openTasks = (ctx.repo.listTasks ? await ctx.repo.listTasks(run.project_id) : []).filter((t) => OPEN_TASK.has(t.status)).map((t) => t.title);
  const prev = await get('monthly_plan');
  const rework = run.input?.rework_of != null ? { comment: String(run.input.comment || '').slice(0, 800) } : null;

  const facts = gatherPlanFacts({ brief, strategy: strategySec.content, plan, last, thresholds: ueSec?.content?.thresholds || null, optimizer: opt ? { summary: opt.summary, actions: opt.meta?.actions } : null, events, seasonality, openTasks, month: win.key, rework });
  const project = await ctx.repo.readProject(run.project_id);
  const prompt = buildPlanPrompt({ facts, language: project?.client_language === 'en' ? 'en' : 'uk' });
  const answer = await ctx.ask({ projectId: run.project_id, runId: run.id, system: prompt.system, user: prompt.user, maxTokens: 5000 });
  const checked = checkPlan(parsePlanAnswer(answer.text), { facts, now });

  const version = prev ? Number(prev.content?.version || 1) + 1 : 1;
  const content = { schema: 1, version, month: win.key, rework: rework ? { of: run.input.rework_of, comment: rework.comment } : null, last_month: last, budget: plan ? { monthly: plan.monthly, daily: plan.daily, min_daily: plan.min_daily, currency: plan.currency } : null, ...checked, assumptions: ['Календар подій містить лише відомі дати для ваших ринків; події клієнта з брифу (сезонність) враховано текстом.'] };
  steps.push({ title: `Кампаній у плані: ${checked.campaigns.length}, подій: ${checked.events.length}, бюджет на день ${checked.total_daily}` });

  const tasks = checked.events.flatMap((e) => e.site_tasks.map((t) => ({ type: t.kind === 'banner' ? 'creatives' : 'site', owner: 'client', priority: 'normal', title: t.what.slice(0, 140), evidence: `Подія «${e.name}», ${e.date}. Потрібно до ${t.due}.`, due_date: t.due })));
  const goals = checked.events.filter((e) => e.creative_goal).map((e) => `«${e.creative_goal.goal}»${e.creative_goal.product ? ` (${e.creative_goal.product})` : ''} під «${e.name}»`);
  if (goals.length) tasks.push({ type: 'creatives', owner: 'manager', priority: 'normal', title: 'Додати в бриф цілі креативів під події місяця', evidence: `Креатор робить креативи з цілей брифу. Під події: ${goals.join('; ')}. Креативи погоджує клієнт.` });

  return {
    writes: [{ key: 'monthly_plan', body: renderPlanText(content), content, sources: [{ title: 'Бриф' }, { title: 'Стратегія' }, ...(ueSec ? [{ title: 'Unit Economy' }] : []), ...(last ? [{ title: `Кабінет Meta ${last.period}` }] : [])] }],
    tasks, steps,
    output: { version, month: win.key, campaigns: checked.campaigns.length, events: checked.events.length, warnings: checked.warnings.length },
    costUsd: answer.costUsd || 0,
  };
}
