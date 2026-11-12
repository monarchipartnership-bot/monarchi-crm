// The work of the scout of the creative department (owner, 2026-11-12): studies the client BEFORE the first creative: reads the site (the home page and the shop pages: products, prices,
// tone, pictures), looks at the best ads of the Meta cabinet, asks the model to look at it all and writes one profile per project (ag_project_intel) that the other agents read.
// Every real event is written as a live step (ag_task_steps). Never invents: what could not be read goes to «gaps». The network, the model and the database are handed in.
import { composeCreativeSystem } from '../../src/lib/agents/creativePrompts.js';
import { MAX_ADS, MAX_SITE_PAGES, MAX_SITE_PHOTOS, imagesOf, intelBlock, intelSummaryLine, parseIntel, pickPhotos, pickShopPages } from '../../src/lib/agents/clientIntel.js';
import { readJson } from './agentContent.js';
import { assertPublicUrl, fetchOne, readBody, readHtml, robotsAllows } from './siteReader.js';
import { collectCreatives, copyImage } from './metaCreatives.js';
import { stepsOf } from './taskSteps.js';

const MODEL = 'claude-sonnet-5';
const clip = (v, n) => String(v ?? '').trim().slice(0, n);
const pathOf = (url) => { try { const u = new URL(url); return decodeURIComponent(u.pathname) || '/'; } catch { return url; } };
const hostOf = (url) => { try { return new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`).hostname.replace(/^www\./, ''); } catch { return String(url || ''); } };
const isoDay = (d) => d.toISOString().slice(0, 10);

// The home page and the pages of the shop → { pages: [{ url, title, description, text, images, ok }], blockedByRobots, error? }. The same careful rules as the competitor reader (public addresses
// only, robots.txt, size and time limits); the pages are picked by what a shop shows (categories, products, about), and the pictures of every page are collected.
export async function readShop(website, { onStep = async () => {}, fetchFn = fetch, lookup, timeoutMs = 8000, maxPages = MAX_SITE_PAGES } = {}) {
  const home = await assertPublicUrl(website, lookup);
  const opts = { fetchFn, lookup, timeoutMs };
  let robots = '';
  try { const r = await fetchOne(home.origin + '/robots.txt', opts); if (r.res.ok) robots = (await readBody(r.res)).text; } catch { /* no robots.txt is fine */ }
  if (!robotsAllows(robots, home.pathname || '/')) return { pages: [], blockedByRobots: true };
  let first;
  try { first = await fetchOne(home.toString(), opts); } catch (e) { return { pages: [], error: e.name === 'AbortError' ? 'сайт не відповів вчасно' : (e.message || 'сайт не відповідає') }; }
  if (!first.res.ok) return { pages: [], error: `сайт відповів помилкою HTTP ${first.res.status}` };
  const body = await readBody(first.res);
  if (!/html|text/i.test(body.type)) return { pages: [], error: 'головна сторінка не є HTML' };
  const homePage = readHtml(body.text, first.url);
  const pages = [{ url: first.url, title: homePage.title, description: homePage.description, text: homePage.text, images: imagesOf(body.text, first.url), ok: true }];
  const urls = pickShopPages(homePage.links, first.url, maxPages - 1);
  for (let i = 0; i < urls.length; i += 1) {
    const url = urls[i];
    await onStep(`Вивчаю сторінку ${i + 2} з ${urls.length + 1}: ${pathOf(url)}`, 'running');
    if (!robotsAllows(robots, new URL(url).pathname)) { pages.push({ url, ok: false, error: 'заборонено robots.txt', images: [] }); continue; }
    try {
      const r = await fetchOne(url, opts);
      if (!r.res.ok) { pages.push({ url, ok: false, error: `HTTP ${r.res.status}`, images: [] }); continue; }
      const b = await readBody(r.res);
      if (!/html|text/i.test(b.type)) { pages.push({ url, ok: false, error: 'не HTML', images: [] }); continue; }
      const p = readHtml(b.text, r.url);
      pages.push({ url: r.url, title: p.title, description: p.description, text: p.text, images: imagesOf(b.text, r.url), ok: true });
    } catch (e) { pages.push({ url, ok: false, error: e.name === 'AbortError' ? 'час очікування вичерпано' : e.message, images: [] }); }
  }
  const catalog = await readCatalog(home, { fetchFn, lookup, timeoutMs, robots });
  return { pages, catalog, blockedByRobots: false, linksOnHome: homePage.links.length, shopPagesFound: urls.length };
}

// A Shopify shop publishes its catalogue at /products.json (public, no key): the real names, types, prices and pictures. Read only when robots.txt allows it; null for any other site.
export async function readCatalog(home, { fetchFn = fetch, lookup, timeoutMs = 8000, robots = '', limit = 40 } = {}) {
  if (!robotsAllows(robots, '/products.json')) return null;
  try {
    const r = await fetchOne(`${home.origin}/products.json?limit=${limit}`, { fetchFn, lookup, timeoutMs });
    if (!r.res.ok) return null;
    const body = await readBody(r.res);
    const j = JSON.parse(body.text);
    const list = Array.isArray(j?.products) ? j.products : [];
    return list.slice(0, limit).map((x) => ({
      title: clip(x.title, 120), type: clip(x.product_type, 60), price: clip(x.variants?.[0]?.price, 20), url: `${home.origin}/products/${clip(x.handle, 120)}`,
      image: clip(x.images?.[0]?.src || x.image?.src, 600),
    })).filter((x) => x.title);
  } catch { return null; }
}

// The task of the scout. → { output, summary } like every handler of the department.
export async function scoutRun({ ctx, agent, task, prompt, rec, campaign, project, accounts = [] }) {
  const { db } = ctx;
  const step = stepsOf(ctx, { id: task.id, request_id: task.request_id || null, campaign_id: campaign.id, role: agent.role });
  const site = String(project.website || '').trim();
  const gaps = [];
  const sources = { site: null, ads: null };
  const now = ctx.now ? ctx.now() : new Date();
  // a profile that already exists stays readable while it is made again; only a first run marks the row «running» (the work of the strategist waits for exactly that)
  const before = (await db.from('ag_project_intel').select('summary').eq('project_id', project.id).maybeSingle()).data;
  if (!ctx.dryRun && !before?.summary) await db.from('ag_project_intel').upsert({ project_id: project.id, status: 'running', site_url: site || null, task_id: task.id, updated_at: now.toISOString() }, { onConflict: 'project_id' });
  await step('Починаю розвідку клієнта: сайт, товари, реклама з кабінету', 'info');

  // ------------------------------------------------------------------------------------------------ the site
  let shop = { pages: [] };
  if (!site) {
    gaps.push('Сайт клієнта не вказано в картці проєкту.');
    await step('Сайт у картці не вказано, пропускаю', 'failed');
  } else {
    await step(`Читаю сайт ${hostOf(site)}: головна сторінка`, 'running');
    try {
      shop = await (ctx.readShop || readShop)(site, { onStep: step });
      if (shop.blockedByRobots) { gaps.push('Сайт забороняє автоматичне читання (robots.txt).'); await step('Сайт забороняє автоматичне читання (robots.txt)', 'failed'); }
      else if (shop.error) { gaps.push(`Сайт не вдалося прочитати: ${shop.error}.`); await step(`Сайт не вдалося прочитати: ${shop.error}`, 'failed'); }
      else {
        const okPages = shop.pages.filter((p) => p.ok);
        const imgs = shop.pages.reduce((n, p) => n + (p.images?.length || 0), 0);
        sources.site = { pages: okPages.length, images: imgs, host: hostOf(site) };
        if (shop.shopPagesFound === 0) gaps.push('На головній не знайдено посилань на каталог чи товари (можливо, сайт будується скриптом): товари вказано лише з того, що видно в тексті головної.');
        await step(`Прочитано сторінок: ${okPages.length}, знайдено зображень: ${imgs}`, 'done');
      }
    } catch (e) { gaps.push(`Сайт не вдалося прочитати: ${clip(e.message || e, 160)}`); await step(`Сайт не вдалося прочитати: ${clip(e.message || e, 120)}`, 'failed'); }
  }

  // ------------------------------------------------------------------------------------------------ the ads of the cabinet
  let ads = [];
  const metaTokenOk = !!(ctx.metaToken || process.env.META_ACCESS_TOKEN);
  const metaAccounts = accounts.filter((a) => a.platform === 'meta');
  if (!metaAccounts.length) {
    gaps.push('До проєкту не підключено кабінет Meta: реклами, що вже були, не вивчено. З кабінету Google Ads картинки реклам не читаються.');
    await step('Кабінет Meta не підключено: пропускаю аналіз креативів', 'info');
  } else if (!metaTokenOk) {
    gaps.push('Не налаштовано доступ до Meta на сервері: реклами не вивчено.');
    await step('Доступ до Meta не налаштовано на сервері: пропускаю аналіз креативів', 'failed');
  } else {
    await step(`Дивлюся ${MAX_ADS} найкращих реклам у кабінеті Meta (за 90 днів)`, 'running');
    try {
      const end = isoDay(now); const start = isoDay(new Date(now.getTime() - 90 * 86400000));
      ads = await (ctx.collectAds || collectCreatives)({ db, token: ctx.metaToken || process.env.META_ACCESS_TOKEN, accounts: metaAccounts, projectId: project.id, period: { start, end }, count: MAX_ADS });
      ads = ads.filter((a) => a.imageUrl);
      sources.ads = { seen: ads.length, period: `${start} – ${end}` };
      if (!ads.length) gaps.push('У кабінеті Meta за 90 днів немає реклам з витратами й картинкою: що працювало, невідомо.');
      await step(ads.length ? `Знайдено реклам із картинками: ${ads.length}` : 'У кабінеті немає реклам із витратами за 90 днів', ads.length ? 'done' : 'info');
    } catch (e) { gaps.push(`Кабінет Meta не вдалося прочитати: ${clip(e.message || e, 160)}`); await step(`Кабінет Meta не вдалося прочитати: ${clip(e.message || e, 120)}`, 'failed'); }
  }

  // ------------------------------------------------------------------------------------------------ nothing to look at
  const pages = shop.pages.filter((p) => p.ok);
  const catalog = Array.isArray(shop.catalog) ? shop.catalog : [];
  if (catalog.length) { sources.catalog = catalog.length; await step('Знайдено каталог магазину: товарів ' + catalog.length, 'done'); }
  // the pictures of the products of the catalogue come first (they show the goods), then the pictures of the pages
  let photos = pickPhotos([{ url: site, images: catalog.filter((x) => x.image).slice(0, MAX_SITE_PHOTOS).map((x) => ({ url: x.image, alt: x.title, logo: false })) }, ...shop.pages], MAX_SITE_PHOTOS);
  if (photos.length && !ctx.dryRun) {
    await step('Зберігаю зображення сайту у власне сховище: ' + photos.length, 'running');
    const copied = [];
    for (let i = 0; i < photos.length; i += 1) {
      const own = await (ctx.copyImage || copyImage)({ db, url: photos[i].url, path: 'scout/' + project.id + '/site-' + Date.now().toString(36) + '-' + (i + 1) });
      if (own) copied.push({ ...photos[i], url: own, own: true });
    }
    photos = copied;
    await step(photos.length ? 'Зображень збережено: ' + photos.length : 'Зображення сайту не вдалося зберегти', photos.length ? 'done' : 'info');
  }
  if (!pages.length && !ads.length) {
    const profile = parseIntel({ gaps }, {});
    if (!ctx.dryRun && !before?.summary) await db.from('ag_project_intel').upsert({ project_id: project.id, status: 'failed', summary: '', profile, photos: [], sources, site_url: site || null, task_id: task.id, cost_usd: rec.state.cost, updated_at: new Date().toISOString() }, { onConflict: 'project_id' });
    await step('Розвідка нічого не знайшла: профіль клієнта порожній, агенти працюватимуть за карткою проєкту', 'failed');
    return { output: { text: `## Підсумок\nНічого не вдалося вивчити.\n${gaps.map((g) => `- ${g}`).join('\n')}`, summary: 'Нічого не вдалося вивчити', json: profile, campaignId: campaign.id, empty: true }, summary: 'Нічого не вдалося вивчити' };
  }

  // ------------------------------------------------------------------------------------------------ the model looks at everything
  const card = [project.name && `Project: ${project.name}`, project.business_type && `Business type: ${project.business_type}`, project.country && `Country: ${project.country}`, project.notes && `Notes: ${clip(project.notes, 800)}`, project.additional_info && `More: ${clip(project.additional_info, 800)}`].filter(Boolean).join('\n');
  const text = [
    '### Project card', card || '(empty)',
    catalog.length ? `### Catalogue of the shop (its public product list; prices as published, currency of the shop)\n${catalog.map((x) => `- ${x.title}${x.type ? ` | ${x.type}` : ''}${x.price ? ` | ${x.price}` : ''}`).join('\n')}` : '',
    ...pages.flatMap((p) => [`### Site page: ${p.title || p.url} (${p.url})`, clip(`${p.description ? `${p.description}\n` : ''}${p.text}`, 3200)]),
    ads.length ? `### Past ads of the client (the best by spend and results)\n${ads.map((a, i) => `${i + 1}. ${a.caption}; spend ${a.metrics?.spend ?? '?'}, purchases ${a.metrics?.purchases ?? '?'}, ROAS ${a.metrics?.roas ?? '?'}, CTR ${a.metrics?.ctr ?? '?'}`).join('\n')}` : '### Past ads of the client\nNone available.',
    gaps.length ? `### Already known gaps\n${gaps.map((g) => `- ${g}`).join('\n')}` : '',
  ].filter(Boolean).join('\n\n');
  const system = composeCreativeSystem('creative_scout', prompt.body, '', null);
  const ask = (content) => rec.callModel({ agentKey: 'creative-creative_scout', params: { model: agent.model || MODEL, max_tokens: 5200, thinking: { type: 'disabled' }, system, messages: [{ role: 'user', content }] } });
  const withImages = (sitePics, adPics) => {
    const parts = [{ type: 'text', text }];
    sitePics.forEach((im, i) => parts.push({ type: 'text', text: `[Site picture ${i + 1}: ${im.alt || im.page || 'no description'}${im.logo ? ' (looks like a logo)' : ''}]` }, { type: 'image', source: { type: 'url', url: im.url } }));
    adPics.forEach((a, i) => parts.push({ type: 'text', text: `[Past ad ${i + 1}: ${a.caption}]` }, { type: 'image', source: { type: 'url', url: a.imageUrl } }));
    return parts;
  };
  await step(`Аналізую побачене: сторінок ${pages.length}, зображень сайту ${photos.length}, реклам ${ads.length}`, 'running');
  let result;
  try { result = await ask(withImages(photos, ads)); } catch (e) {
    // a picture the model could not fetch (a protected site) must not stop the profile: first without the site pictures, then the text alone
    if (!/image|url|media/i.test(String(e?.message || e))) throw e;
    await step('Моделі не вдалося завантажити зображення сайту: аналізую без них', 'info');
    gaps.push('Зображення сайту модель не змогла завантажити: фото-референси з сайту не відібрано.');
    photos = [];
    try { result = await ask(withImages([], ads)); } catch (e2) {
      if (!/image|url|media/i.test(String(e2?.message || e2))) throw e2;
      ads = [];
      result = await ask(`${text}\n\n### Pictures\nNone could be loaded: judge by the text only and say so in "gaps".`);
    }
  }
  const parsed = parseIntel(readJson(result.text), { photos, ads });
  if (!parsed.summary && !parsed.products.length) throw new Error('Розвідник не склав профіль: модель відповіла не за форматом. Спробуйте «Оновити».');
  parsed.gaps = [...new Set([...gaps, ...parsed.gaps])].slice(0, 10);

  // ------------------------------------------------------------------------------------------------ keep the product photos (the sites' own links may stop working)
  const kept = [];
  if (parsed.photos.length) {
    await step(`Зберігаю фото товарів із сайту: ${parsed.photos.length}`, 'running');
    for (let i = 0; i < parsed.photos.length; i += 1) {
      const p = parsed.photos[i];
      const own = ctx.dryRun || p.own !== false ? p.url : await (ctx.copyImage || copyImage)({ db, url: p.url, path: `scout/${project.id}/site-${Date.now().toString(36)}-${i + 1}` });
      if (own) kept.push({ ...p, url: own });
    }
    parsed.photos = kept;
    await step(`Збережено фото: ${kept.length}`, 'done');
  }

  const status = parsed.gaps.length && (!pages.length || !parsed.products.length) ? 'partial' : 'ready';
  const finalRow = { project_id: project.id, status, summary: parsed.summary, profile: parsed, photos: kept, sources, site_url: site || null, task_id: task.id, cost_usd: rec.state.cost, updated_at: new Date().toISOString() };
  if (!ctx.dryRun) await db.from('ag_project_intel').upsert(finalRow, { onConflict: 'project_id' });
  const line = intelSummaryLine({ status, profile: parsed });
  await step(`Готово: профіль клієнта збережено${line ? ` (${line})` : ''}`, 'done');
  const block = intelBlock({ ...finalRow, updated_at: finalRow.updated_at }, now);
  return { output: { text: block ? `${block.title}\n\n${block.text}` : parsed.summary, summary: parsed.summary.slice(0, 400), json: parsed, campaignId: campaign.id, requestId: task.request_id || null }, summary: parsed.summary.slice(0, 300) || 'Профіль клієнта готовий' };
}

// A scout that failed for good: a row that was never filled must not stay «running» (the next request would wait for a profile that will never come). A profile that already
// exists is left as it is.
export async function scoutFailed(ctx, projectId) {
  try {
    const row = (await ctx.db.from('ag_project_intel').select('summary').eq('project_id', projectId).maybeSingle()).data;
    if (row && !row.summary) await ctx.db.from('ag_project_intel').update({ status: 'failed', updated_at: new Date().toISOString() }).eq('project_id', projectId);
  } catch { /* best effort */ }
}
