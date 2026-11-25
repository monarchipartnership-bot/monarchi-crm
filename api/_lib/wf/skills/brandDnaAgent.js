// The Researcher's skill «brand_dna» (adopted from the study of Zeely, 2026-11-25): the brand profile of the client from its website, checked by a person.
// Code reads the site (text through siteData.js, the code of the home page and up to three style sheets through collectBrandAssets) and finds the colours, fonts and logo candidates ITSELF;
// one model call describes the style, tone and rules and may only CHOOSE among what the code found; brandDnaEngine.js checks the answer. The section «ДНК бренду» is written with
// the mark «з сайту, перевірте»: a person edits it, and after that the agent only proposes (the rule of every agent-written section).
import { lookup as dnsLookup } from 'node:dns/promises';
import { collectSiteData } from './siteData.js';
import { assertPublicUrl, fetchOne, readBody, robotsAllows } from '../../siteReader.js';
import { brandGaps, buildBrandPrompt, checkBrand, extractBrandSignals, manualNotes, parseBrandAnswer, renderBrandText } from './brandDnaEngine.js';
import { briefFacts } from './siteEngine.js';

const MAX_CSS = 3;

// the raw code of the home page and of its style sheets (public addresses only, robots.txt kept, a failed style sheet is skipped)
export async function collectBrandAssets({ url, fetchFn = fetch, lookup = dnsLookup, timeoutMs = 8000 }) {
  const opts = { fetchFn, lookup, timeoutMs };
  const home = await assertPublicUrl(url, lookup);
  let robots = '';
  try { const r = await fetchOne(home.origin + '/robots.txt', opts); if (r.res.ok) robots = (await readBody(r.res)).text; } catch { /* no robots.txt is fine */ }
  const out = { url: home.toString(), html: '', css: [], errors: [] };
  const r = await fetchOne(home.toString(), opts);
  if (!r.res.ok) { out.errors.push(`HTTP ${r.res.status}`); return out; }
  out.url = r.url;
  out.html = (await readBody(r.res)).text;
  const hrefs = [];
  for (const m of out.html.matchAll(/<link\b[^>]*>/gi)) {
    if (!/rel=["'][^"']*stylesheet/i.test(m[0])) continue;
    const h = m[0].match(/href=["']([^"']+)["']/i)?.[1];
    if (!h) continue;
    try { hrefs.push(new URL(h, r.url).toString()); } catch { /* skip */ }
  }
  for (const href of hrefs.slice(0, MAX_CSS)) {
    try {
      if (!robotsAllows(robots, new URL(href).pathname)) continue;
      const c = await fetchOne(href, opts);
      if (!c.res.ok) continue;
      out.css.push({ url: c.url, text: (await readBody(c.res)).text });
    } catch (e) { out.errors.push(`${href}: ${e.message || 'не прочитано'}`); }
  }
  return out;
}

export async function brandDna({ run, ctx }) {
  const project = await ctx.repo.readProject(run.project_id);
  const website = String(project?.website || '').trim();
  if (!website) {
    return {
      blocked: { on: 'site_url', reason: 'У картці проєкту не вказано сайт клієнта.' },
      tasks: [{ type: 'client', owner: 'manager', priority: 'high', title: 'Вказати сайт клієнта в картці проєкту', evidence: 'Без адреси сайту ДНК бренду скласти не можна.' }],
      steps: [{ title: 'Сайт не вказано', status: 'info' }],
    };
  }
  if (!ctx.ask) throw new Error('Немає доступу до моделі: у змінних середовища Vercel не задано ANTHROPIC_API_KEY.');

  const data = await collectSiteData({ website, fetchFn: ctx.fetchFn, lookup: ctx.lookup });
  if (data.blockedByRobots) {
    return { output: { blocked_by_robots: true }, tasks: [{ type: 'creatives', owner: 'manager', priority: 'medium', title: 'Заповнити ДНК бренду вручну', evidence: 'Сайт закритий для читання роботами (robots.txt): кольори, шрифти й тон потрібно вказати в картці проєкту.' }], steps: [{ title: 'Сайт закритий для роботів: ДНК бренду не складено', status: 'info' }] };
  }
  const read = data.pages.filter((p) => p.ok);
  if (!read.length) throw new Error(`Сайт не прочитано: ${data.errors[0] || data.pages[0]?.error || 'не відповідає'}. Адреса: ${data.url}`);

  const assets = await collectBrandAssets({ url: data.final_url || data.url, fetchFn: ctx.fetchFn, lookup: ctx.lookup });
  const signals = extractBrandSignals(assets);
  const notes = manualNotes(await ctx.repo.readCreativeMaterials(run.project_id));
  const brief = await ctx.repo.readSection(run.project_id, 'brief');
  const prompt = buildBrandPrompt({ signals, pages: read, notes, brief: brief?.version ? briefFacts({ content: brief.version.content }) : null, language: project?.client_language === 'en' ? 'en' : 'uk' });
  const answer = await ctx.ask({ projectId: run.project_id, runId: run.id, system: prompt.system, user: prompt.user, maxTokens: 4000 });
  const checked = checkBrand(parseBrandAnswer(answer.text), signals, notes);
  const gaps = brandGaps(checked.dna);
  const content = { ...checked.dna, signals: { colors: signals.colors.slice(0, 8), fonts: signals.fonts.slice(0, 6), logos: signals.logos, theme_color: signals.theme_color } };
  const tasks = [];
  if (gaps.length) tasks.push({ type: 'creatives', owner: 'manager', priority: 'medium', title: 'Перевірити й доповнити ДНК бренду', evidence: gaps.join(' ').slice(0, 600) });
  return {
    writes: [{ key: 'brand_dna', body: renderBrandText(checked.dna, { gaps, dropped: checked.dropped, url: assets.url }), content, sources: [{ title: 'Сайт клієнта', url: assets.url }, ...(notes.brand || notes.tone || notes.copy_rules || notes.restrictions ? [{ title: 'Нотатки менеджера в картці проєкту' }] : [])] }],
    tasks,
    steps: [
      { title: `Прочитано сайт: ${read.length} сторінок, файлів стилів: ${assets.css.length}` },
      { title: `Знайдено кольорів: ${signals.colors.length}, шрифтів: ${signals.fonts.length}, логотипів: ${signals.logos.length}` },
      { title: `У ДНК: кольорів ${checked.dna.identity.colors.length}, шрифтів ${checked.dna.identity.fonts.length}${checked.dropped.length ? `, відкинуто непідтвердженого: ${checked.dropped.length}` : ''}` },
    ],
    output: { colors: checked.dna.identity.colors.length, fonts: checked.dna.identity.fonts.length, gaps: gaps.length, dropped: checked.dropped.length },
    costUsd: answer.costUsd || 0,
  };
}
