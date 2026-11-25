// The Researcher's skill «brief_draft» (Zeely item 4, «швидкий старт»: a link is enough to begin; owner's decision 2026-11-25): a DRAFT of the brief made from the website of the client.
// What a site can honestly say goes in: products with the prices it shows, the currency, a short description of the audience, the countries it serves, up to three goals for the first creatives.
// What a site cannot say (budget, margin, target ROAS, average order, payment, the Facebook page) stays EMPTY and becomes a task of the manager. Everything is marked «припущення» with its source
// until a person confirms it. PURE: no network, no model, no clock.

const clip = (s, n) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const norm = (s) => String(s || '').toLowerCase().replace(/[«»"“”„'’`]/g, '').replace(/\s+/g, ' ').trim();

// ---------------------------------------------------------------- facts counted by code
const CURRENCIES = [['UAH', /₴|грн|\buah\b/gi], ['USD', /\$|\busd\b/gi], ['EUR', /€|\beur\b/gi], ['PLN', /zł|\bpln\b/gi], ['GBP', /£|\bgbp\b/gi], ['CZK', /kč|\bczk\b/gi]];
const PRICE = /(?:\d[\d\s.,]*\d|\d)\s*(?:₴|грн|uah|\$|usd|€|eur|zł|pln|£|kč)|(?:\$|€|£)\s*\d[\d\s.,]*/i;

export const corpusOf = (pages) => pages.filter((p) => p.ok).map((p) => `${p.title || ''}\n${p.description || ''}\n${p.text || ''}`).join('\n');

// the currency the prices are shown in: the one that is met most, and clearly more than any other; otherwise unknown (the manager says)
export function detectCurrency(text) {
  const found = CURRENCIES.map(([code, re]) => [code, (String(text).match(re) || []).length]).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);
  if (!found.length) return null;
  return found.length === 1 || found[0][1] > found[1][1] ? found[0][0] : null;
}
// the lines of the pages that carry a price, with the page kind: what the model reads the products and prices from
export function priceLines(pages, max = 40) {
  const out = [];
  for (const p of pages.filter((x) => x.ok)) {
    for (const line of String(p.text || '').split('\n')) if (PRICE.test(line) && out.length < max) out.push({ page: p.kind, line: clip(line, 160) });
  }
  return out;
}
// every number a text carries, in one form (3 200 = 3200 = 3,200.00), to compare a price of the model with the page
const canon = (s) => { const n = parseFloat(String(s).replace(/\s/g, '').replace(/,(\d{3})(?!\d)/g, '$1').replace(',', '.')); return Number.isFinite(n) ? n : null; };
export const numbersSet = (text) => new Set((String(text).match(/\d[\d\s.,]*\d|\d/g) || []).map(canon).filter((n) => n != null));

// ---------------------------------------------------------------- the prompt
export const SYSTEM_PROMPT = `You are an account strategist of an advertising agency. You prepare a DRAFT brief for a new client from its website, so that the manager only has to check it.
You are given the TEXT of the site's pages, the lines of the pages that carry a price, the currency the code detected, and what the manager already knows about the project (name, country).
Rules:
1. Use ONLY what the site says. A product is a thing the site sells; give its name exactly as the site writes it. A price is the number the site shows for it, or null if the site shows none. Never calculate or guess a price, a margin, a budget, a conversion or any number.
2. "audience": one sentence about who the site speaks to, from its text. "geo": the countries or regions the site says it delivers to or works in, otherwise an empty string.
3. "goals": at most 3 goals for the first ad creatives, each about ONE product from your list or about the shop as a whole ("product" is empty). Write a goal as a short action in Ukrainian, for example "Продати <product>" or "Привести покупців на каталог". Prefer the products the site puts first.
4. At most 8 products. If the site is not a shop (services), list the services as products with null prices.
5. Never invent facts. Anything the site does not say is an empty string, null or an empty list.
Answer with ONE JSON object and nothing else (no markdown fence):
{"products":[{"name":"","price":null}],"audience":"","geo":"","goals":[{"goal":"","product":""}]}`;

export function buildBriefDraftPrompt({ pages, project = {}, currency = null, language = 'uk' }) {
  const facts = {
    pages: pages.filter((p) => p.ok).slice(0, 6).map((p) => ({ kind: p.kind, title: clip(p.title, 160), description: clip(p.description, 300), text: String(p.text || '').slice(0, 2600) })),
    price_lines: priceLines(pages), detected_currency: currency, project: { name: project.name || '', country: project.country || '' },
  };
  return { system: SYSTEM_PROMPT, user: ['FACTS (empty = does not exist):', JSON.stringify(facts, null, 1), '', `Write the text fields in ${language === 'en' ? 'English' : 'Ukrainian'}; keep product names as the site writes them.`].join('\n') };
}

export function parseBriefDraftAnswer(text) {
  const src = String(text || '').replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '');
  const a = src.indexOf('{'), b = src.lastIndexOf('}');
  if (a < 0 || b <= a) throw new Error('Модель відповіла не у форматі JSON: чернетку брифу не прочитано.');
  try { return JSON.parse(src.slice(a, b + 1)); } catch { throw new Error('Модель повернула пошкоджений JSON: чернетку брифу не прочитано.'); }
}

// ---------------------------------------------------------------- the check and the content of the brief (the shape of src/lib/workflow/brief.js)
export const EMPTY_FOR_MANAGER = [
  ['budget_monthly', 'місячний бюджет'], ['goal', 'ціль у цифрах'], ['target_roas', 'цільовий ROAS'], ['avg_order', 'середній чек'], ['cogs_pct', 'собівартість'],
  ['fb_page_id', 'ID сторінки Facebook'], ['payment_amount', 'сума оплати за послуги'],
];

export function checkBriefDraft(raw, { corpus, currency, project = {} }) {
  const text = norm(corpus), nums = numbersSet(corpus);
  const notes = [];
  const products = [], seen = new Set();
  for (const p of Array.isArray(raw?.products) ? raw.products : []) {
    const name = clip(p?.name, 80);
    if (!name || seen.has(norm(name))) continue;
    if (!text.includes(norm(name))) { notes.push(`Товар «${name}» не знайдено в тексті сайту: не взято.`); continue; }
    seen.add(norm(name));
    let price = p?.price == null || p.price === '' ? null : canon(p.price);
    if (price != null && !nums.has(price)) { notes.push(`Ціну ${price} для «${name}» не знайдено на сторінках сайту: ціну не взято.`); price = null; }
    products.push({ name, price });
    if (products.length >= 8) break;
  }
  const names = new Set(products.map((p) => norm(p.name)));
  const goals = (Array.isArray(raw?.goals) ? raw.goals : []).map((g) => ({ goal: clip(g?.goal, 200), product: names.has(norm(g?.product)) ? products.find((p) => norm(p.name) === norm(g.product)).name : '' })).filter((g) => g.goal).slice(0, 3);
  const geoSite = clip(raw?.geo, 120), country = clip(project.country, 80);
  const audience = clip(raw?.audience, 300);
  const meta = {};
  const general = {};
  if (country || geoSite) { general.geo = country || geoSite; meta.geo = { status: 'assumption', source: country ? 'Картка проєкту' : 'Сайт клієнта' }; }
  if (audience) { general.audience = audience; meta.audience = { status: 'assumption', source: 'Сайт клієнта' }; }
  const economics = { currency: currency || 'USD', products: products.map((p) => ({ name: p.name, price: p.price, cogs: null })), offers: [] };
  if (!currency) notes.push('Валюту цін не визначено однозначно: вказано USD, змініть, якщо це не так.');
  meta.currency = { status: 'assumption', source: currency ? 'Сайт клієнта' : 'Не визначено: перевірте' };
  for (const p of products) meta['product:' + p.name] = { status: 'assumption', source: p.price != null ? 'Сайт клієнта (ціна знайдена на сторінці)' : 'Сайт клієнта (ціни на сторінках немає: уточніть)' };
  const content = { schema: 1, general, economics, economics_meta: meta, creative_goals: goals, draft_from_site: true };
  const missing = EMPTY_FOR_MANAGER.map(([, label]) => label);
  return { content, notes, missing, found: { products: products.length, priced: products.filter((p) => p.price != null).length, goals: goals.length } };
}

export function renderBriefDraftText({ content, notes, missing, url }) {
  const e = content.economics, out = ['Чернетку брифу складено з сайту. Це припущення: перевірте кожне поле й підтвердьте бриф.'];
  if (url) out.push(`Сайт: ${url}`);
  out.push('', 'Товари');
  if (!e.products.length) out.push('• Товарів на сайті не знайдено: додайте їх вручну.');
  e.products.forEach((p) => out.push(`• ${p.name}: ${p.price != null ? `${p.price} ${e.currency}` : 'ціни на сайті немає'}`));
  if (content.general.audience) out.push('', `Аудиторія (з сайту): ${content.general.audience}`);
  if (content.general.geo) out.push(`GEO: ${content.general.geo}`);
  if (content.creative_goals.length) { out.push('', 'Цілі перших креативів'); content.creative_goals.forEach((g) => out.push(`• ${g.goal}${g.product ? ` (товар: ${g.product})` : ''}`)); }
  out.push('', 'Що сайт сказати не може: заповніть вручну', ...missing.map((m) => `• ${m}`));
  if (notes.length) { out.push('', 'Відкриті питання'); notes.forEach((n) => out.push(`• ${n}`)); }
  return out.join('\n');
}
