// The Researcher's skill «site» (step A4; document 1.2): a CRO review of the client's website done ALONE (no competitors).
// Code reads the site (siteData.js) and, when a key is set, runs PageSpeed; one model call writes the recommendations; code checks every quote and number
// against what was read (siteEngine.js) and only then writes the section «Сайт» and the tasks. ctx.ask is the model (injected by api/wf-tick.js).
import { collectSiteData } from './siteData.js';
import { buildSitePrompt, checkFindings, parseSiteAnswer, renderSiteText, tasksFromFindings } from './siteEngine.js';
import { collectSpeed } from '../../pageSpeed.js';

export async function site({ run, ctx }) {
  const project = await ctx.repo.readProject(run.project_id);
  const website = String(project?.website || '').trim();
  if (!website) {
    return {
      blocked: { on: 'site_url', reason: 'У картці проєкту не вказано сайт клієнта.' },
      tasks: [{ type: 'client', owner: 'manager', priority: 'high', title: 'Вказати сайт клієнта в картці проєкту', evidence: 'Без адреси сайту рекомендації по сайту неможливі.' }],
      steps: [{ title: 'Сайт не вказано', status: 'info' }],
    };
  }
  if (!ctx.ask) throw new Error('Немає доступу до моделі: у змінних середовища Vercel не задано ANTHROPIC_API_KEY.');

  const data = await collectSiteData({ website, fetchFn: ctx.fetchFn, lookup: ctx.lookup });
  if (data.blockedByRobots) {
    return { output: { blocked_by_robots: true }, tasks: [{ type: 'site', owner: 'manager', priority: 'medium', title: 'Сайт закритий для читання роботами (robots.txt): переглянути сайт вручну', evidence: `Агент поважає robots.txt і не читає ${data.url}.` }], steps: [{ title: 'Сайт забороняє читання (robots.txt)', status: 'info' }] };
  }
  const read = data.pages.filter((p) => p.ok);
  if (!read.length) throw new Error(`Сайт не прочитано: ${data.errors[0] || data.pages[0]?.error || 'не відповідає'}. Адреса: ${data.url}`);

  // speed: the key is optional, a failure of the test is a fact in the section, not a failure of the skill
  const speed = ctx.speedKey ? await collectSpeed({ url: data.final_url || data.url, key: ctx.speedKey, fetchFn: ctx.fetchFn || fetch, now: ctx.now }) : null;
  const speedOk = !!(speed && (speed.mobile || speed.desktop));

  const brief = await ctx.repo.readSection(run.project_id, 'brief');
  const prompt = buildSitePrompt({ data, speed: speedOk ? speed : null, brief: brief?.version || null, language: project?.client_language === 'en' ? 'en' : 'uk' });
  const answer = await ctx.ask({ projectId: run.project_id, runId: run.id, system: prompt.system, user: prompt.user, maxTokens: 6000 });
  const checked = checkFindings(parseSiteAnswer(answer.text), data, speedOk ? speed : null);
  const open = [];
  if (!speedOk) open.push(speed ? `Швидкість не перевірено: ${speed.error || 'PageSpeed не відповів'}` : 'Швидкість не перевірено: ключ PageSpeed не додано.');
  if (checked.dropped) open.push(`Відкинуто знахідок без обов’язкових полів: ${checked.dropped}.`);
  data.pages.filter((p) => !p.ok).forEach((p) => open.push(`Не прочитано сторінку «${p.kind}»: ${p.error}.`));
  const content = { schema: 1, url: data.final_url || data.url, pages: data.pages.map((p) => ({ url: p.url, kind: p.kind, ok: p.ok, error: p.error || null, title: p.title || null })), speed: speedOk ? { mobile: speed.mobile?.scores || null, desktop: speed.desktop?.scores || null } : null, findings: checked.findings, ok_areas: checked.ok_areas, not_checked: checked.not_checked, open };
  const tasks = tasksFromFindings(checked.findings);
  return {
    writes: [{ key: 'site', body: renderSiteText(checked, { url: content.url, pages: data.pages, speedChecked: speedOk }) + (open.length ? '\n\nВідкриті питання\n' + open.map((o) => `• ${o}`).join('\n') : ''), content, sources: [{ title: `Сайт ${content.url}` }] }],
    tasks,
    steps: [
      { title: `Прочитано сайт: ${read.length} сторінок` },
      { title: speedOk ? 'Перевірено швидкість (PageSpeed)' : 'Швидкість не перевірялась', status: speedOk ? undefined : 'info' },
      { title: `Знахідок: ${checked.findings.filter((f) => f.verified).length}, не підтверджено: ${checked.findings.filter((f) => !f.verified).length}, задач: ${tasks.length}` },
    ],
    output: { findings: checked.findings.length, verified: checked.findings.filter((f) => f.verified).length, tasks: tasks.length },
    costUsd: answer.costUsd || 0,
  };
}
