// What the Researcher's skill «site» (step A4; document 1.2) can SEE on the client's website, collected in code, with no model:
// the home page and the pages that decide a sale (catalog, product, cart, delivery, returns, contacts, ...), the visible text of each,
// and hard facts read from the raw HTML (viewport, h1, structured data, phone/messenger links, forms, prices, payment and delivery words).
// The model only reads this and writes recommendations; every quote it gives is checked against this text afterwards (siteEngine.js).
// Network and DNS are handed in (like in siteReader.js), so scripts/check-workflow.mjs runs it without the internet. The safety rules of the
// reader (public addresses only, robots.txt, size and time limits) are those of siteReader.js: this file only adds WHICH pages to read and WHAT to count.
import { lookup as dnsLookup } from 'node:dns/promises';
import { assertPublicUrl, fetchOne, readBody, readHtml, robotsAllows } from '../../siteReader.js';

// page kinds in the order we want them; the first link of each kind on the home page is read
export const PAGE_KINDS = [
  ['catalog', /catalog|category|shop|store|каталог|категор|магазин/i],
  ['product', /\/product|\/products|\/tovar|\/item|\/p\/|товар/i],
  ['cart', /cart|basket|кошик|корзин/i],
  ['checkout', /checkout|order|оформлен|замовлен/i],
  ['delivery', /deliver|shipping|payment|доставк|оплат/i],
  ['returns', /return|refund|exchange|поверн|обмін/i],
  ['contacts', /contact|контакт/i],
  ['about', /about|про-нас|pro-nas|про нас|о нас|company/i],
  ['reviews', /review|testimonial|відгук|отзыв/i],
  ['faq', /faq|help|питання|довідк/i],
];
const FILE = /\.(pdf|jpe?g|png|gif|webp|svg|zip|mp4|css|js|xml)$/i;
const EXTRA_PAGES = 6;

const sameHost = (a, b) => a.replace(/^www\./, '') === b.replace(/^www\./, '');
const cleanUrl = (u) => u.origin + u.pathname;

// → [{ url, kind }]: the pages worth reading next, at most one per kind, in the order of PAGE_KINDS
export function pickCroPages(links, homeUrl, limit = EXTRA_PAGES) {
  const home = new URL(homeUrl);
  const seen = new Set([cleanUrl(home).replace(/\/$/, '')]);
  const byKind = new Map();
  for (const l of links) {
    let u; try { u = new URL(l.url); } catch { continue; }
    if (!sameHost(u.hostname, home.hostname) || FILE.test(u.pathname) || u.pathname === '/' || u.search.length > 40) continue;
    const key = cleanUrl(u).replace(/\/$/, '');
    if (seen.has(key)) continue;
    const hay = decodeURIComponent(u.pathname) + ' ' + l.label;
    const kind = PAGE_KINDS.find(([, re]) => re.test(hay))?.[0];
    if (!kind || byKind.has(kind)) continue;
    byKind.set(kind, cleanUrl(u));
    seen.add(key);
  }
  return PAGE_KINDS.filter(([k]) => byKind.has(k)).slice(0, limit).map(([k]) => ({ url: byKind.get(k), kind: k }));
}

// a product link from a catalog page: same site, deeper than the catalog itself, not a file or a filter
export function pickProductLink(links, catalogUrl, homeUrl) {
  let cat, home; try { cat = new URL(catalogUrl); home = new URL(homeUrl); } catch { return null; }
  for (const l of links) {
    let u; try { u = new URL(l.url); } catch { continue; }
    if (!sameHost(u.hostname, home.hostname) || FILE.test(u.pathname) || u.search.length > 40) continue;
    const segs = u.pathname.split('/').filter(Boolean), catSegs = cat.pathname.split('/').filter(Boolean);
    if (u.pathname === cat.pathname || segs.length <= catSegs.length || !u.pathname.startsWith(cat.pathname.replace(/\/$/, '') + '/')) continue;
    if (/page|filter|sort|tag|category/i.test(u.pathname)) continue;
    return cleanUrl(u);
  }
  return null;
}

const strip = (s) => String(s || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
const MONEY = /(\d[\d\s.,]{0,9}\d|\d)\s?(грн|₴|uah|usd|\$|€|eur|zł|pln)/gi;
const WORDS = {
  payment: /visa|mastercard|apple\s?pay|google\s?pay|liqpay|monobank|paypal|stripe|накладен|післяплат|оплата частинами|cash on delivery|klarna/gi,
  delivery: /нова пошта|укрпошта|justin|meest|доставк|shipping|delivery|самовивіз|безкоштовна доставка|free shipping/gi,
  returns: /поверн|обмін|повернення коштів|return policy|refund|exchange|30 днів|14 днів/gi,
  reviews: /відгук|review|trustpilot|рейтинг|rating|★|⭐|testimonial/gi,
  guarantee: /гарант|warranty|guarantee|сертифікат/gi,
  urgency: /залишилось|в наявності|out of stock|немає в наявності|обмежен|limited/gi,
  upsell: /разом з цим|з цим товаром|схожі товари|recommend|you may also|related|також купують|бестселер|bestseller/gi,
};
const countWords = (text, re) => (text.match(re) || []).length;

// Hard facts of ONE page from its raw HTML. Pure, deterministic: the same html gives the same signals.
export function pageSignals(html, text = '') {
  const src = String(html || '');
  const lower = (text || '').toLowerCase();
  const heading = (n) => [...src.matchAll(new RegExp(`<h${n}\\b[^>]*>([\\s\\S]*?)</h${n}>`, 'gi'))].map((m) => strip(m[1])).filter(Boolean);
  const ldTypes = new Set();
  for (const m of src.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const walk = (n) => { if (!n || typeof n !== 'object') return; if (Array.isArray(n)) return n.forEach(walk); if (n['@type']) [].concat(n['@type']).forEach((t) => ldTypes.add(String(t))); Object.values(n).forEach(walk); };
      walk(JSON.parse(m[1]));
    } catch { /* broken structured data is a fact too, but not worth a flag */ }
  }
  const buttons = [...src.matchAll(/<button\b[^>]*>([\s\S]*?)<\/button>/gi)].map((m) => strip(m[1]))
    .concat([...src.matchAll(/<a\b[^>]*class=["'][^"']*(?:btn|button|cta)[^"']*["'][^>]*>([\s\S]*?)<\/a>/gi)].map((m) => strip(m[1])))
    .filter((t) => t && t.length < 60);
  const nav = [...src.matchAll(/<nav\b[\s\S]*?<\/nav>/gi)].flatMap((n) => [...n[0].matchAll(/<a\b[^>]*>([\s\S]*?)<\/a>/gi)].map((m) => strip(m[1]))).filter((t) => t && t.length < 40);
  const footer = strip(src.match(/<footer\b[\s\S]*?<\/footer>/i)?.[0] || '').slice(0, 700);
  const prices = [...(text.match(MONEY) || [])];
  const forms = [...src.matchAll(/<form\b[\s\S]*?<\/form>/gi)].map((m) => m[0]);
  const found = (re) => [...new Set((text.match(re) || []).map((x) => x.toLowerCase()))].slice(0, 8);
  return {
    https: null, // filled by the collector (it knows the final address)
    viewport: /<meta[^>]+name=["']viewport["']/i.test(src),
    h1: heading(1).slice(0, 3),
    h2: heading(2).slice(0, 8),
    buttons: [...new Set(buttons)].slice(0, 12),
    nav: [...new Set(nav)].slice(0, 16),
    footer,
    structured: [...ldTypes].slice(0, 12),
    phone_link: /href=["']tel:/i.test(src),
    email_link: /href=["']mailto:/i.test(src),
    messengers: [...new Set([...src.matchAll(/href=["'][^"']*(t\.me|wa\.me|api\.whatsapp|viber:|m\.me|messenger\.com|instagram\.com\/direct)[^"']*["']/gi)].map((m) => m[1].toLowerCase()))],
    search: /<input[^>]+(type=["']search["']|name=["'](s|q|search)["']|placeholder=["'][^"']*(пошук|search|поиск))/i.test(src) || /role=["']search["']/i.test(src),
    cart_link: /href=["'][^"']*(cart|checkout|basket|кошик|корзин)[^"']*["']/i.test(src),
    forms: forms.length,
    email_inputs: forms.filter((f) => /type=["']email["']|name=["'][^"']*email/i.test(f)).length,
    phone_inputs: forms.filter((f) => /type=["']tel["']|name=["'][^"']*(phone|tel)/i.test(f)).length,
    subscribe: /підпис|subscribe|newsletter|розсилк/i.test(lower),
    price_mentions: prices.length, price_samples: prices.slice(0, 4),
    payment_words: found(WORDS.payment), delivery_words: found(WORDS.delivery), returns_words: found(WORDS.returns),
    review_words: found(WORDS.reviews), guarantee_words: found(WORDS.guarantee), stock_words: found(WORDS.urgency), upsell_words: found(WORDS.upsell),
    images: (src.match(/<img\b/gi) || []).length,
    lazy_images: (src.match(/<img\b[^>]*loading=["']lazy["']/gi) || []).length,
  };
}

// → { url, final_url, pages: [{ url, kind, ok, error?, title, description, text, signals }], blockedByRobots, errors: [] }
// Never throws for a site that is down or refuses: that is a result. It does throw for an unsafe or malformed address (the person must fix it).
export async function collectSiteData({ website, fetchFn = fetch, lookup = dnsLookup, timeoutMs = 8000 }) {
  const home = await assertPublicUrl(website, lookup);
  const opts = { fetchFn, lookup, timeoutMs };
  const out = { url: home.toString(), final_url: null, pages: [], blockedByRobots: false, errors: [] };
  let robots = '';
  try { const r = await fetchOne(home.origin + '/robots.txt', opts); if (r.res.ok) robots = (await readBody(r.res)).text; } catch { /* no robots.txt is fine */ }
  if (!robotsAllows(robots, home.pathname || '/')) { out.blockedByRobots = true; return out; }

  const readPage = async (url, kind) => {
    if (!robotsAllows(robots, new URL(url).pathname)) { out.pages.push({ url, kind, ok: false, error: 'Заборонено robots.txt' }); return null; }
    try {
      const r = await fetchOne(url, opts);
      if (!r.res.ok) { out.pages.push({ url, kind, ok: false, error: `HTTP ${r.res.status}` }); return null; }
      const b = await readBody(r.res);
      if (!/html|text/i.test(b.type)) { out.pages.push({ url, kind, ok: false, error: 'Не HTML-сторінка.' }); return null; }
      const p = readHtml(b.text, r.url);
      const signals = pageSignals(b.text, p.text);
      signals.https = new URL(r.url).protocol === 'https:';
      const page = { url: r.url, kind, ok: true, title: p.title, description: p.description, text: p.text, signals };
      out.pages.push(page);
      return { page, links: p.links };
    } catch (e) {
      if (/Внутрішні|Нестандартні|Некоректна|http і https|логін/.test(e.message) && kind === 'home') throw e;
      out.pages.push({ url, kind, ok: false, error: e.name === 'AbortError' ? 'Час очікування вичерпано.' : (e.message || 'Сайт не відповідає.') });
      return null;
    }
  };

  const first = await readPage(home.toString(), 'home');
  if (!first) { out.errors.push(out.pages[0]?.error || 'Головна сторінка не прочиталась.'); return out; }
  out.final_url = first.page.url;
  const picked = pickCroPages(first.links, first.page.url);
  const read = new Map();
  for (const p of picked) read.set(p.kind, await readPage(p.url, p.kind));
  // a product page: from the catalog if the home page did not link one directly
  if (!read.get('product') && read.get('catalog')) {
    const link = pickProductLink(read.get('catalog').links, read.get('catalog').page.url, first.page.url);
    if (link && out.pages.length < EXTRA_PAGES + 2) await readPage(link, 'product');
  }
  return out;
}
