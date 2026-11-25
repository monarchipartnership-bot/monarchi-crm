// The Researcher's skill «brief_draft» (Zeely item 4, «швидкий старт»): reads the website, asks the model for products, audience, geo and goals, and the code checks every product and every
// price against the text of the site (briefDraftEngine.js). It writes the section «Бриф» as a DRAFT of the agent and sets the flag «brief_pending»: the process does not start until a person
// confirms the brief. A brief that already exists is never touched. ctx.ask is the model (api/wf-tick.js).
import { collectSiteData } from './siteData.js';
import { buildBriefDraftPrompt, checkBriefDraft, corpusOf, detectCurrency, parseBriefDraftAnswer, renderBriefDraftText } from './briefDraftEngine.js';

export async function briefDraft({ run, ctx }) {
  const project = await ctx.repo.readProject(run.project_id);
  const website = String(project?.website || '').trim();
  if (!website) {
    return {
      blocked: { on: 'site_url', reason: 'У картці проєкту не вказано сайт клієнта.' },
      tasks: [{ type: 'client', owner: 'manager', priority: 'high', title: 'Вказати сайт клієнта в картці проєкту', evidence: 'Без адреси сайту чернетку брифу скласти не можна.' }],
      steps: [{ title: 'Сайт не вказано', status: 'info' }],
    };
  }
  const existing = await ctx.repo.readSection(run.project_id, 'brief');
  if (existing?.version) return { output: { skipped: true }, steps: [{ title: 'Бриф уже є: чернетку не створено, щоб не перезаписати його', status: 'info' }] };
  if (!ctx.ask) throw new Error('Немає доступу до моделі: у змінних середовища Vercel не задано ANTHROPIC_API_KEY.');

  const data = await collectSiteData({ website, fetchFn: ctx.fetchFn, lookup: ctx.lookup });
  if (data.blockedByRobots) {
    return { output: { blocked_by_robots: true }, tasks: [{ type: 'client', owner: 'manager', priority: 'high', title: 'Заповнити бриф вручну', evidence: 'Сайт закритий для читання роботами (robots.txt): чернетку з сайту скласти не можна.' }], steps: [{ title: 'Сайт закритий для роботів: чернетку не складено', status: 'info' }] };
  }
  const read = data.pages.filter((p) => p.ok);
  if (!read.length) throw new Error(`Сайт не прочитано: ${data.errors[0] || data.pages[0]?.error || 'не відповідає'}. Адреса: ${data.url}`);

  const corpus = corpusOf(data.pages);
  const currency = detectCurrency(corpus);
  const prompt = buildBriefDraftPrompt({ pages: data.pages, project, currency, language: project?.client_language === 'en' ? 'en' : 'uk' });
  const answer = await ctx.ask({ projectId: run.project_id, runId: run.id, system: prompt.system, user: prompt.user, maxTokens: 3000 });
  const checked = checkBriefDraft(parseBriefDraftAnswer(answer.text), { corpus, currency, project });
  const url = data.final_url || data.url;
  return {
    writes: [{ key: 'brief', body: renderBriefDraftText({ content: checked.content, notes: checked.notes, missing: checked.missing, url }), content: checked.content, sources: [{ title: 'Сайт клієнта', url }] }],
    stateUpdate: { brief_pending: true },
    tasks: [{ type: 'client', owner: 'manager', priority: 'high', title: 'Перевірити чернетку брифу й заповнити цифри', evidence: `Чернетку складено з сайту. Заповніть вручну: ${checked.missing.join(', ')}. Потім підтвердьте бриф на сторінці проєкту.` }],
    steps: [
      { title: `Прочитано сайт: ${read.length} сторінок` },
      { title: `У чернетці товарів ${checked.found.products} (з цінами ${checked.found.priced}), цілей креативів ${checked.found.goals}${currency ? `, валюта ${currency}` : ', валюту не визначено'}` },
      ...(checked.notes.length ? [{ title: `Не взято, бо немає на сайті: ${checked.notes.length}`, status: 'info' }] : []),
    ],
    output: { ...checked.found, currency },
    costUsd: answer.costUsd || 0,
  };
}
