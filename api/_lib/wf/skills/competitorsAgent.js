// The Researcher's skill «competitors» (step A4; document 1.5). Reads the sites of the competitors named in the brief, compares them with the client's site,
// reads the competitor ads that the MANAGER confirmed in the Meta Ad Library (the agent never adds an ad itself; see competitorsEngine.js for why),
// and writes the section «Ринок і конкуренти», ideas for the creative team, tasks, and an appendix to the section «Сайт».
import { collectSiteData } from './siteData.js';
import { buildCompetitorsPrompt, checkCompetitors, compactSite, comparisonTasks, parseCompetitorsAnswer, parseCompetitors, renderCompetitorsText, verifiedAds, withSiteAppendix } from './competitorsEngine.js';

const readSite = async (website, ctx) => {
  try {
    const d = await collectSiteData({ website, fetchFn: ctx.fetchFn, lookup: ctx.lookup });
    if (d.blockedByRobots) return { error: 'закрито robots.txt' };
    if (!d.pages.some((p) => p.ok)) return { error: d.errors[0] || d.pages[0]?.error || 'не відповідає' };
    return { data: d };
  } catch (e) { return { error: String(e?.message || e).slice(0, 120) }; }
};

export async function competitors({ run, ctx }) {
  const brief = await ctx.repo.readSection(run.project_id, 'brief');
  if (!brief?.version) return { blocked: { on: 'brief', reason: 'Конкуренти чекають на бриф.' }, steps: [{ title: 'Брифу ще немає', status: 'info' }] };
  const project = await ctx.repo.readProject(run.project_id);
  const list = parseCompetitors(brief.version.content?.general?.competitors, project?.website);
  if (!list.length) {
    return {
      blocked: { on: 'brief', reason: 'У брифі не вказано сайти конкурентів.' },
      tasks: [{ type: 'client', owner: 'manager', priority: 'medium', title: 'Вказати сайти конкурентів у брифі', evidence: 'Конкурентів у цій версії беремо лише з брифу: додайте їхні сайти в рядок «Конкуренти».' }],
      steps: [{ title: 'Конкурентів у брифі немає', status: 'info' }],
    };
  }
  if (!ctx.ask) throw new Error('Немає доступу до моделі: у змінних середовища Vercel не задано ANTHROPIC_API_KEY.');

  // the section «Сайт» comes first (document: «Дослідник: сайт, потім конкуренти»): wait for it if that skill is working
  const snap = await ctx.repo.loadSnapshot(run.project_id);
  const siteSec = await ctx.repo.readSection(run.project_id, 'site');
  if (!siteSec?.version && snap.runs.some((r) => r.agent === 'researcher' && r.skill === 'site' && ['queued', 'running'].includes(r.status))) {
    return { blocked: { on: 'site', reason: 'Конкуренти чекають на огляд сайту клієнта.' }, steps: [{ title: 'Чекаємо огляд сайту клієнта', status: 'info' }] };
  }

  const prev = await ctx.repo.readSection(run.project_id, 'competitors');
  const { ads, skipped: skippedAds } = verifiedAds(prev?.version?.content);

  const read = [], failed = [];
  for (const c of list) {
    const r = await readSite(c.url, ctx);
    if (r.data) read.push({ host: c.host, url: c.url, data: r.data, pages: compactSite(r.data) }); else failed.push({ host: c.host, error: r.error });
  }
  if (!read.length) throw new Error(`Жодного сайту конкурента не прочитано: ${failed.map((f) => `${f.host} (${f.error})`).join('; ')}.`);
  let client = [];
  if (project?.website) { const r = await readSite(project.website, ctx); if (r.data) client = compactSite(r.data); }

  const prompt = buildCompetitorsPrompt({ client, competitors: read, ads, goal: brief.version.content?.general?.goal });
  const answer = await ctx.ask({ projectId: run.project_id, runId: run.id, system: prompt.system, user: prompt.user, images: prompt.images, maxTokens: 7000 });
  const checked = checkCompetitors(parseCompetitorsAnswer(answer.text), { competitors: read, client, ads });
  const tasks = client.length ? comparisonTasks(checked.comparison) : [];

  const open = [];
  if (!client.length) open.push(project?.website ? 'Сайт клієнта не прочитався: порівняння з ним не робилось.' : 'У картці проєкту не вказано сайт клієнта: порівняння з ним не робилось.');
  if (checked.dropped) open.push(`Відкинуто рядків без обов’язкових полів або з невідомим конкурентом: ${checked.dropped}.`);
  open.push('Нових конкурентів у тій самій ніші агент не шукає: у цій версії лише ті, кого вказано в брифі.');
  const content = {
    schema: 1, competitors: read.map((c) => ({ host: c.host, url: c.url, pages: c.data.pages.filter((p) => p.ok).map((p) => p.kind) })), failed,
    table: checked.table, comparison: checked.comparison, ads: Array.isArray(prev?.version?.content?.ads) ? prev.version.content.ads : [], ads_analysis: checked.ads, ads_skipped: skippedAds, ideas: checked.ideas, open,
  };
  const writes = [{ key: 'competitors', body: renderCompetitorsText(checked, { competitors: read, failed, skippedAds }) + '\n\nВідкриті питання\n' + open.map((o) => `• ${o}`).join('\n'), content, sources: read.map((c) => ({ title: `Сайт ${c.host}` })).concat(checked.ads.map((a) => ({ title: `Бібліотека реклами: ${a.competitor}`, url: a.library_url }))) }];
  // the appendix to «Сайт»: the other skill's section is added to, not replaced; only verified items go in
  const appendix = withSiteAppendix(siteSec?.version?.body, checked.comparison);
  if (siteSec?.version && client.length && appendix !== String(siteSec.version.body || '')) writes.push({ key: 'site', body: appendix, content: { ...(siteSec.version.content || {}), competitors_compare: checked.comparison.filter((c) => c.verified) }, sources: [{ title: 'Сайти конкурентів' }] });
  const ok = (a) => a.filter((x) => x.verified).length;
  return {
    writes, tasks,
    steps: [{ title: `Прочитано сайтів конкурентів: ${read.length}${failed.length ? `, не вдалося: ${failed.length}` : ''}` }, { title: `Таблиця: ${ok(checked.table)} підтверджено з ${checked.table.length}; порівнянь ${ok(checked.comparison)}; реклама від менеджера: ${checked.ads.length}` }, ...(tasks.length ? [{ title: `Задач на сайт: ${tasks.length}` }] : [])],
    output: { competitors: read.length, table: checked.table.length, ads: checked.ads.length, tasks: tasks.length },
    costUsd: answer.costUsd || 0,
  };
}
