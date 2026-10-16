// SEO audit of a PUBLIC website (Monarchi's own), as pure code plus a polite crawler:
//  - parsePage: what a page says about itself (title, description, h1, canonical, noindex, alt texts, structured data, words, links);
//  - auditSite: the checks, as a list of findings with a severity, the pages concerned and how to fix it (all written by code,
//    so the facts are never invented; the model only turns them into a priority plan afterwards);
//  - crawlSite: reads up to ~25 pages (from sitemap.xml, else from the home page links), honours robots.txt, checks the internal
//    links it met for broken ones. Network and DNS are handed in, so scripts/check-core.mjs tests everything offline.
import { assertPublicUrl, fetchOne, readBody, robotsAllows } from './siteReader.js';
import { lookup as dnsLookup } from 'node:dns/promises';

const MAX_PAGES = 25;
const MAX_LINK_CHECKS = 30;
const SLOW_MS = 2500;
const decode = (s) => String(s).replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&nbsp;/g, ' ').replace(/&[#a-z0-9]+;/gi, ' ');
const text = (s) => decode(String(s).replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
const attr = (tag, name) => decode(tag.match(new RegExp(`${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'))?.slice(2).find((x) => x != null) ?? '');

export function parsePage(html, url, { status = 200, ms = 0, bytes = 0, xRobots = '' } = {}) {
  const src = String(html || '');
  const head = src.slice(0, src.search(/<\/head>/i) > 0 ? src.search(/<\/head>/i) : 60000);
  const metas = [...head.matchAll(/<meta\b[^>]*>/gi)].map((m) => m[0]);
  const meta = (key) => { const t = metas.find((m) => new RegExp(`(name|property)\\s*=\\s*["']${key}["']`, 'i').test(m)); return t ? attr(t, 'content') : ''; };
  const canonicalTag = head.match(/<link\b[^>]*rel\s*=\s*["']canonical["'][^>]*>/i)?.[0];
  const body = src.replace(/<(script|style|noscript|svg|template)\b[\s\S]*?<\/\1>/gi, ' ').replace(/<!--[\s\S]*?-->/g, ' ');
  const imgs = [...body.matchAll(/<img\b[^>]*>/gi)].map((m) => m[0]);
  const links = [];
  for (const m of body.matchAll(/<a\b[^>]*href\s*=\s*["']([^"'#]+)["'][^>]*>/gi)) {
    try { const u = new URL(decode(m[1]), url); if (/^https?:$/.test(u.protocol)) links.push(u.toString()); } catch { /* skip */ }
  }
  const main = body.replace(/<(nav|footer|header|aside)\b[\s\S]*?<\/\1>/gi, ' ');
  return {
    url, status, ms, bytes,
    title: text(head.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || ''),
    description: meta('description'),
    h1: [...body.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi)].map((m) => text(m[1])).filter(Boolean),
    h2Count: (body.match(/<h2\b/gi) || []).length,
    canonical: canonicalTag ? attr(canonicalTag, 'href') : '',
    robotsMeta: meta('robots').toLowerCase(), xRobots: String(xRobots || '').toLowerCase(),
    lang: attr(src.match(/<html\b[^>]*>/i)?.[0] || '', 'lang'),
    viewport: Boolean(meta('viewport')),
    ogTitle: Boolean(meta('og:title')), ogImage: Boolean(meta('og:image')),
    jsonLd: (src.match(/<script\b[^>]*application\/ld\+json/gi) || []).length,
    images: { total: imgs.length, noAlt: imgs.filter((t) => !/\balt\s*=\s*["'][^"']+["']/i.test(t)).length },
    words: text(main).split(' ').filter(Boolean).length,
    excerpt: text(main).slice(0, 900),
    links: [...new Set(links)],
  };
}

const sevOrder = { high: 0, medium: 1, low: 2 };
const dupes = (pages, key) => { const m = new Map(); pages.filter((p) => p[key]).forEach((p) => { const k = p[key].toLowerCase(); m.set(k, [...(m.get(k) || []), p.url]); }); return [...m.values()].filter((v) => v.length > 1).flat(); };

// pages: parsePage results (ok pages only count for content checks); ctx: { robots: string|null, sitemap: { found, urls }, httpRedirectsToHttps: bool|null, brokenLinks: [{ url, status, from: [] }] }
export function auditSite(pages, ctx = {}) {
  const f = [];
  const add = (id, severity, title, detail, fix, urls = []) => { if (urls.length || id.startsWith('site_')) f.push({ id, severity, title, detail, fix, count: urls.length, pages: urls.slice(0, 10) }); };
  const ok = pages.filter((p) => p.status >= 200 && p.status < 300);
  const names = (list) => list.map((p) => p.url);
  add('status', 'high', 'Сторінки відповідають помилкою', 'Ці сторінки з sitemap або внутрішніх посилань не відкриваються.', 'Виправте адресу, налаштуйте редирект 301 на потрібну сторінку або приберіть посилання.', names(pages.filter((p) => p.status >= 400 || p.status === 0)));
  add('noindex', 'high', 'Сторінка закрита від індексації', 'У meta robots або заголовку X-Robots-Tag стоїть noindex: пошуковики її не покажуть.', 'Якщо сторінка має приводити трафік, приберіть noindex (у WordPress це налаштування SEO-плагіна або «Не показувати в пошуку» в Читанні).', names(ok.filter((p) => /noindex/.test(p.robotsMeta) || /noindex/.test(p.xRobots))));
  add('title_missing', 'high', 'Немає title', 'У сторінки немає заголовка в <title>.', 'Додайте унікальний title 30-60 символів із головною темою сторінки.', names(ok.filter((p) => !p.title)));
  add('title_dup', 'medium', 'Однакові title на різних сторінках', 'Пошуковик не розрізняє ці сторінки за заголовком.', 'Зробіть title унікальним для кожної сторінки.', dupes(ok, 'title'));
  add('title_len', 'low', 'Title надто короткий або задовгий', 'Оптимально 30-60 символів: довший обрізається у видачі, коротший не використовує місце.', 'Перепишіть title у межах 30-60 символів.', names(ok.filter((p) => p.title && (p.title.length < 25 || p.title.length > 65))));
  add('desc_missing', 'medium', 'Немає meta description', 'Пошуковик сам вибере уривок для сніпета, часто невдалий.', 'Додайте опис 120-160 символів, який пояснює вигоду сторінки.', names(ok.filter((p) => !p.description)));
  add('desc_dup', 'medium', 'Однакові meta description', 'Однакові описи на різних сторінках.', 'Напишіть унікальний опис для кожної сторінки.', dupes(ok, 'description'));
  add('desc_len', 'low', 'Опис надто короткий або задовгий', 'Оптимально 120-160 символів.', 'Перепишіть опис у межах 120-160 символів.', names(ok.filter((p) => p.description && (p.description.length < 70 || p.description.length > 170))));
  add('h1_missing', 'high', 'Немає заголовка H1', 'У сторінки немає головного заголовка.', 'Додайте один H1 із головною темою сторінки.', names(ok.filter((p) => p.h1.length === 0)));
  add('h1_multi', 'low', 'Кілька H1 на сторінці', 'Структура заголовків нечітка.', 'Залиште один H1, решту зробіть H2.', names(ok.filter((p) => p.h1.length > 1)));
  add('canonical_missing', 'low', 'Немає canonical', 'Без canonical пошуковик може вважати дублями версії адреси з параметрами.', 'Додайте canonical на себе (SEO-плагіни WordPress роблять це автоматично).', names(ok.filter((p) => !p.canonical)));
  add('canonical_other', 'medium', 'Canonical веде на іншу сторінку', 'Ця сторінка просить пошуковик вважати головною іншу адресу.', 'Перевірте, що так і задумано; інакше виправте canonical.', names(ok.filter((p) => p.canonical && stripSlash(p.canonical) !== stripSlash(p.url))));
  add('thin', 'medium', 'Мало тексту на сторінці', 'Менше 250 слів основного тексту: сторінці важко ранжуватись.', 'Додайте корисний текст: відповіді на питання клієнта, кейси, FAQ.', names(ok.filter((p) => p.words < 250)));
  add('alt', 'low', 'Зображення без alt', 'Alt допомагає пошуку по картинках і доступності.', 'Додайте короткі описові alt-тексти до змістовних зображень.', names(ok.filter((p) => p.images.total > 0 && p.images.noAlt / p.images.total > 0.3)));
  add('viewport', 'high', 'Немає meta viewport', 'Сторінка погано відображається на телефоні, а Google ранжує за мобільною версією.', 'Додайте <meta name="viewport" content="width=device-width, initial-scale=1">.', names(ok.filter((p) => !p.viewport)));
  add('lang', 'low', 'Не вказана мова сторінки', 'Атрибут lang допомагає пошуковикам і читалкам екрана.', 'Додайте lang на тег <html>.', names(ok.filter((p) => !p.lang)));
  add('og', 'low', 'Немає Open Graph', 'Посилання на сторінку в соцмережах виглядатиме бідно (без картинки та заголовка).', 'Додайте og:title і og:image (SEO-плагіни роблять це автоматично).', names(ok.filter((p) => !p.ogTitle || !p.ogImage)));
  const home = ok[0];
  if (home && !home.jsonLd) add('schema_home', 'low', 'Немає структурованих даних на головній', 'Schema.org Organization / LocalBusiness допомагає розширеним сніпетам.', 'Додайте JSON-LD Organization (назва, логотип, посилання на соцмережі).', [home.url]);
  add('slow', 'medium', 'Повільна відповідь сервера', `Відповідь довша за ${SLOW_MS / 1000} с.`, 'Увімкніть кеш, перевірте хостинг і важкі плагіни.', names(ok.filter((p) => p.ms > SLOW_MS)));
  add('heavy', 'low', 'Дуже важка сторінка', 'HTML більший за 1.5 МБ.', 'Приберіть зайві вбудовані скрипти та стилі, відкладіть завантаження важкого контенту.', names(ok.filter((p) => p.bytes >= 1_400_000)));
  add('broken_links', 'high', 'Биті внутрішні посилання', 'Ці адреси, на які ведуть сторінки сайту, відповідають помилкою.', 'Оновіть посилання або налаштуйте редирект 301.', (ctx.brokenLinks || []).map((b) => `${b.url} (${b.status}) ← ${b.from.slice(0, 2).join(', ')}`));
  if (ctx.robots === null) add('site_robots', 'medium', 'Немає robots.txt', 'Файл robots.txt не знайдено.', 'Додайте robots.txt зі вказівкою на sitemap.', []);
  if (ctx.sitemap && !ctx.sitemap.found) add('site_sitemap', 'medium', 'Немає sitemap.xml', 'Файл sitemap.xml не знайдено за стандартною адресою.', 'Увімкніть sitemap в SEO-плагіні й додайте його в Search Console.', []);
  if (ctx.httpRedirectsToHttps === false) add('site_https', 'high', 'HTTP не перенаправляє на HTTPS', 'Версія сайту без шифрування відкривається окремо.', 'Налаштуйте редирект 301 з http на https.', []);
  f.sort((a, b) => sevOrder[a.severity] - sevOrder[b.severity] || b.count - a.count);
  const h = f.filter((x) => x.severity === 'high').length, m = f.filter((x) => x.severity === 'medium').length, l = f.filter((x) => x.severity === 'low').length;
  return { findings: f, summary: { pages: pages.length, ok: ok.length, high: h, medium: m, low: l } };
}
const stripSlash = (u) => String(u).replace(/\/+$/, '').replace(/^https?:\/\/(www\.)?/, '');

// ---------------------------------------------------------------------------------------- the crawler
function sitemapUrls(xml) { return [...String(xml || '').matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => decode(m[1])); }

// → { pages: parsePage[], ctx } ; throws a readable Error for an unusable address.
export async function crawlSite(website, { fetchFn = fetch, lookup = dnsLookup, timeoutMs = 9000, maxPages = MAX_PAGES } = {}) {
  const home = await assertPublicUrl(website, lookup);
  const opts = { fetchFn, lookup, timeoutMs };
  const getText = async (url) => {
    try { const r = await fetchOne(url, opts); if (!r.res.ok) return { status: r.res.status, text: null, url: r.url }; return { status: r.res.status, text: (await readBody(r.res)).text, url: r.url }; } catch { return { status: 0, text: null, url }; }
  };
  const robots = await getText(home.origin + '/robots.txt');
  const robotsTxt = robots.text;
  const smap = await getText(home.origin + '/sitemap.xml');
  let smapUrls = smap.text ? sitemapUrls(smap.text) : [];
  // a sitemap index lists other sitemaps: read the first couple of them
  if (smapUrls.length && smapUrls.every((u) => /\.xml(\?|$)/i.test(u))) {
    const nested = [];
    for (const u of smapUrls.slice(0, 3)) { const t = (await getText(u)).text; if (t) nested.push(...sitemapUrls(t)); }
    smapUrls = nested;
  }
  const sameSite = (u) => { try { return new URL(u).hostname.replace(/^www\./, '') === home.hostname.replace(/^www\./, ''); } catch { return false; } };
  const queue = [home.toString(), ...smapUrls.filter(sameSite)];
  const allowed = (u) => robotsAllows(robotsTxt || '', new URL(u).pathname);

  const pages = [];
  const seen = new Set();
  const internal = new Map(); // link target -> pages that link to it
  async function visit(url) {
    const t0 = Date.now();
    let r;
    try { r = await fetchOne(url, opts); } catch (e) { pages.push({ url, status: 0, ms: Date.now() - t0, bytes: 0, title: '', description: '', h1: [], h2Count: 0, canonical: '', robotsMeta: '', xRobots: '', lang: '', viewport: true, ogTitle: true, ogImage: true, jsonLd: 1, images: { total: 0, noAlt: 0 }, words: 999, links: [], error: e.message }); return; }
    const ms = Date.now() - t0;
    if (!r.res.ok) { pages.push({ url, status: r.res.status, ms, bytes: 0, title: '', description: '', h1: [], h2Count: 0, canonical: '', robotsMeta: '', xRobots: '', lang: '', viewport: true, ogTitle: true, ogImage: true, jsonLd: 1, images: { total: 0, noAlt: 0 }, words: 999, links: [] }); return; }
    const body = await readBody(r.res);
    if (!/html/i.test(body.type)) return;
    pages.push(parsePage(body.text, r.url, { status: r.res.status, ms, bytes: body.text.length, xRobots: r.res.headers.get('x-robots-tag') || '' }));
  }
  for (let i = 0; i < queue.length && pages.length < maxPages;) {
    const batch = [];
    while (i < queue.length && batch.length < 3 && pages.length + batch.length < maxPages) {
      const key = stripSlash(queue[i]).split('#')[0];
      i += 1;
      if (seen.has(key) || /\.(pdf|jpe?g|png|gif|webp|svg|zip|mp4|css|js|xml)(\?|$)/i.test(key) || !allowed(queue[i - 1])) continue;
      seen.add(key); batch.push(queue[i - 1]);
    }
    await Promise.all(batch.map(visit));
    // after the home page, the links found there extend the queue when there was no sitemap
    if (!smapUrls.length) pages.forEach((p) => p.links.filter(sameSite).forEach((l) => { if (!seen.has(stripSlash(l)) && !queue.includes(l)) queue.push(l); }));
  }
  pages.forEach((p) => p.links.filter(sameSite).forEach((l) => { const k = stripSlash(l); if (!seen.has(k)) internal.set(l, [...(internal.get(l) || []), p.url]); }));

  // broken internal links among the ones that were not crawled (a limited number, one request each)
  const broken = [];
  for (const [url, from] of [...internal.entries()].slice(0, MAX_LINK_CHECKS)) {
    if (/\.(jpe?g|png|gif|webp|svg|css|js)(\?|$)/i.test(url) || !allowed(url)) continue;
    const r = await getText(url);
    if (r.status >= 400 || r.status === 0) broken.push({ url, status: r.status || 'немає відповіді', from });
  }
  // does plain http redirect to https?
  let httpRedirectsToHttps = null;
  if (home.protocol === 'https:') {
    try {
      const r = await fetchFn('http://' + home.hostname + '/', { redirect: 'manual', headers: { 'user-agent': 'MonarchiSMMBot/1.0' } });
      httpRedirectsToHttps = r.status >= 300 && r.status < 400 && /^https:/i.test(r.headers.get('location') || '');
    } catch { httpRedirectsToHttps = null; }
  }
  return { pages, ctx: { robots: robots.status === 200 ? robotsTxt : null, sitemap: { found: smap.status === 200 && smapUrls.length > 0, urls: smapUrls.length }, httpRedirectsToHttps, brokenLinks: broken } };
}
