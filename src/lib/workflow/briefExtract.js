// «Розкажіть про клієнта своїми словами» (owner's idea 2026-11-26): the manager writes, dictates or attaches a file; the model finds the FACTS and puts each one under the right field
// of the brief; the CODE checks every fact (the quote must stand in the text, a number must stand in the quote, a value must have the right shape); a person accepts what goes in.
// PURE: the prompt, the reading of the answer, the checks and the application to the form of the brief. The call to the model is in api/brief-extract.js.

// the facts the model may fill. kind: text | long | number | url | digits | date | currency | lang
export const SPEC = {
  geo: { label: 'Країни показу (ГЕО)', kind: 'text', hint: 'countries or regions where the ads are shown' },
  goal: { label: 'Ціль у цифрах', kind: 'text', hint: 'what the client wants to get, with numbers (for example 60 purchases a month)' },
  audience: { label: 'Цільова аудиторія', kind: 'long', hint: 'who buys, as the client describes them' },
  competitors: { label: 'Сайти конкурентів', kind: 'long', hint: 'addresses of competitor sites, one per line (only real addresses from the text)' },
  priority: { label: 'Акцент на товари', kind: 'long', hint: 'which products to push first' },
  budget_monthly: { label: 'Місячний бюджет реклами', kind: 'number', hint: 'monthly ad budget, a number without the currency' },
  currency: { label: 'Валюта', kind: 'currency', hint: 'three-letter code: USD, EUR, UAH, PLN' },
  avg_order: { label: 'Середній чек', kind: 'number', hint: 'average order value, a number' },
  cogs_pct: { label: 'Собівартість, % від ціни', kind: 'number', hint: 'cost of goods as a percent of the price, a number without %' },
  shipping_cost: { label: 'Доставка й пакування за замовлення', kind: 'number', hint: 'delivery and packing cost per order, a number' },
  fee_pct: { label: 'Комісії платежів, %', kind: 'number', hint: 'payment fees, percent' },
  returns_pct: { label: 'Повернення, %', kind: 'number', hint: 'returns, percent' },
  site_cvr_pct: { label: 'Конверсія сайту, %', kind: 'number', hint: 'site conversion rate, percent' },
  target_roas: { label: 'Цільовий ROAS', kind: 'number', hint: 'target return on ad spend, a number' },
  min_campaign_daily: { label: 'Мін. бюджет кампанії на день', kind: 'number', hint: 'minimum daily budget of a campaign' },
  fb_page_id: { label: 'Сторінка Facebook', kind: 'digits', hint: 'numeric id of the Facebook page, only digits' },
  dsa_name: { label: 'Назва рекламодавця для ЄС', kind: 'text', hint: 'legal name of the advertiser for ads in the EU' },
  ga4_property: { label: 'GA4 Property ID', kind: 'digits', hint: 'numeric GA4 property id' },
  payment_amount: { label: 'Сума оплати за послуги', kind: 'text', hint: 'amount the client pays the agency, with the currency' },
  payment_next_date: { label: 'Дата наступної оплати', kind: 'date', hint: 'next payment date, YYYY-MM-DD' },
  payment_period: { label: 'Оплата: щомісяця чи разово', kind: 'text', hint: 'monthly or one-time' },
  website: { label: 'Сайт клієнта', kind: 'url', hint: 'address of the client website, full https address' },
  client_language: { label: 'Мова текстів', kind: 'lang', hint: 'language of the ad texts: uk or en' },
  about: { label: 'Чим займається клієнт', kind: 'long', hint: 'what the company does, 2-3 sentences' },
  offer: { label: 'Оффер і відмінності', kind: 'long', hint: 'the main offer and how the client differs; only what is certain' },
  tone: { label: 'Тон і стиль бренду', kind: 'long', hint: 'how the brand speaks' },
  copy_rules: { label: 'Правила до текстів', kind: 'long', hint: 'what must be in ad headlines and texts: slogan, disclaimer' },
  seasonality: { label: 'Сезонність і події', kind: 'long', hint: 'peak demand, sales, dates' },
  examples: { label: 'Посилання на готові креативи', kind: 'long', hint: 'links to ready ads' },
  restrictions: { label: 'Заборонені слова й обмеження', kind: 'long', hint: 'words, claims and topics that must NOT appear in the ads' },
};
export const labelOf = (k) => SPEC[k]?.label || k;
const BRIEF_KEYS = new Set(['geo', 'goal', 'audience', 'competitors', 'priority', 'budget_monthly', 'currency', 'avg_order', 'cogs_pct', 'shipping_cost', 'fee_pct', 'returns_pct', 'site_cvr_pct', 'target_roas', 'min_campaign_daily', 'fb_page_id', 'dsa_name', 'ga4_property', 'payment_amount', 'payment_next_date', 'payment_period']);
export const storeOf = (k) => (BRIEF_KEYS.has(k) ? 'brief' : 'extra');

const clip = (s, n) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const norm = (s) => String(s || '').toLowerCase().replace(/[«»"“”„'’`‘]/g, '').replace(/[–—]/g, '-').replace(/\s+/g, ' ').trim();
const canon = (s) => { const n = parseFloat(String(s).replace(/\s/g, '').replace(/,(\d{3})(?!\d)/g, '$1').replace(',', '.')); return Number.isFinite(n) ? n : null; };
const numbersOf = (s) => (String(s || '').match(/\d[\d\s.,]*\d|\d/g) || []).map(canon).filter((n) => n != null);

export const SYSTEM_PROMPT = `You fill in the BRIEF of an advertising agency's new client from what the account manager wrote or said (it may be dictated: expect small errors, repetitions, mixed Ukrainian, Russian and English) and from the attached documents.
Find FACTS and put each under one key. Use ONLY what the source says. Never invent a fact, a number, a price, a name or an address; never calculate. If the source says nothing about a key, leave it out.
Every fact has a "quote": the exact words from the source that state it (at most 200 characters, copied letter for letter). A fact without a real quote is worthless.
Write a value in the form the key wants (see the list). Numbers are plain numbers exactly as the source gives them (no currency sign, no percent sign). Keep the client's own words for texts.
Keys: ${Object.entries(SPEC).map(([k, s]) => `"${k}" (${s.hint})`).join('; ')}.
Also give: "products" (things the client sells: name, price if stated, cost if stated), "offers" (a promotion: name and what the customer pays if stated), "goals" (goals of the first ad creatives: a short action like "Продати <product>", and the product it is about if clear). Each of them also has a "quote".
Put the parts that fit nowhere into "unplaced" (short quotes), so nothing is lost silently.
Answer with ONE JSON object and nothing else (no markdown fence): {"facts":[{"key":"","value":"","quote":""}],"products":[{"name":"","price":null,"cogs":null,"quote":""}],"offers":[{"name":"","pays":null,"quote":""}],"goals":[{"goal":"","product":"","quote":""}],"unplaced":[""]}`;

export function buildExtractPrompt({ text = '', fileNames = [], language = 'uk' } = {}) {
  const parts = [];
  if (text.trim()) parts.push(`TEXT OF THE MANAGER:\n"""\n${String(text).slice(0, 20000)}\n"""`);
  if (fileNames.length) parts.push(`The documents are attached: ${fileNames.join(', ')}.`);
  parts.push(`The manager's main language is "${language}". Write the values in the language of the source.`);
  return { system: SYSTEM_PROMPT, user: parts.join('\n\n') };
}

const readJson = (raw) => {
  const t = String(raw || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  try { return JSON.parse(t); } catch { const a = t.indexOf('{'), b = t.lastIndexOf('}'); if (a < 0 || b <= a) return null; try { return JSON.parse(t.slice(a, b + 1)); } catch { return null; } }
};

// the value in the shape of its kind, or an error in words of the manager
export function shapeValue(key, raw) {
  const s = SPEC[key]; const v = clip(raw, 3000);
  if (!s || !v) return { error: 'порожнє значення' };
  if (s.kind === 'number') { const n = canon(v.replace(/[%$€£₴]|грн|usd|eur|uah|pln/gi, '')); return n == null ? { error: 'не число' } : { value: String(n) }; }
  if (s.kind === 'digits') { const d = v.replace(/\s/g, ''); return /^\d{5,}$/.test(d) ? { value: d } : { error: 'має бути лише цифри' }; }
  if (s.kind === 'date') return /^\d{4}-\d{2}-\d{2}$/.test(v) ? { value: v } : { error: 'дата має бути РРРР-ММ-ДД' };
  if (s.kind === 'currency') return /^[A-Za-z]{3}$/.test(v) ? { value: v.toUpperCase() } : { error: 'код валюти з трьох літер' };
  if (s.kind === 'lang') return ['uk', 'en'].includes(v.toLowerCase()) ? { value: v.toLowerCase() } : { error: 'мова: uk або en' };
  if (s.kind === 'url') return /^https?:\/\/[^\s]+\.[^\s]+$/i.test(v) ? { value: v } : { error: 'потрібна адреса сайту повністю' };
  return { value: s.kind === 'long' ? String(raw).replace(/[ \t]+/g, ' ').trim().slice(0, 3000) : v.slice(0, 300) };
}

// source = { text: string the code can read (typed text, txt, md, docx), unreadable: [names of files only the model has read (pdf)] }
// → { facts: [{ key, label, value, quote, state: 'ok' | 'check', why }], products, offers, goals, unplaced, dropped }
// 'check' = a person looks closer: the quote is not in the text, or a number is not in the quote, or the facts come from a file the code cannot read.
export function checkExtraction(raw, { text = '', unreadable = [] } = {}) {
  const j = readJson(raw);
  if (!j || typeof j !== 'object') throw new Error('Не вдалося розібрати відповідь. Спробуйте ще раз або скоротіть текст.');
  const haystack = norm(text);
  const nums = new Set(numbersOf(text));
  const codeReads = haystack.length > 0;
  const dropped = [];
  const verdict = (quote, { number = null } = {}) => {
    const q = clip(quote, 240);
    if (!q) return { state: 'check', why: 'модель не навела цитату' };
    if (codeReads && haystack.includes(norm(q))) {
      if (number != null && !numbersOf(q).includes(number) && !nums.has(number)) return { state: 'check', why: 'числа немає в тексті' };
      return { state: 'ok', why: '' };
    }
    return unreadable.length ? { state: 'check', why: `з файлу ${unreadable.join(', ')}: код не може звірити цитату` } : { state: 'check', why: 'цитати немає в тексті' };
  };
  const facts = [], seen = new Set();
  for (const f of Array.isArray(j.facts) ? j.facts : []) {
    const key = String(f?.key || '');
    if (!SPEC[key]) { dropped.push(`невідоме поле «${key}»`); continue; }
    if (seen.has(key)) continue;
    const shaped = shapeValue(key, f.value);
    if (shaped.error) { dropped.push(`${labelOf(key)}: ${shaped.error}`); continue; }
    const num = SPEC[key].kind === 'number' ? Number(shaped.value) : null;
    seen.add(key);
    facts.push({ key, label: labelOf(key), value: shaped.value, quote: clip(f.quote, 240), ...verdict(f.quote, { number: num }) });
  }
  const products = (Array.isArray(j.products) ? j.products : []).map((p) => ({ name: clip(p?.name, 80), price: p?.price == null || p.price === '' ? null : canon(p.price), cogs: p?.cogs == null || p.cogs === '' ? null : canon(p.cogs), quote: clip(p?.quote, 240) })).filter((p) => p.name).slice(0, 12)
    .map((p) => ({ ...p, ...verdict(p.quote, { number: p.price }) }));
  const offers = (Array.isArray(j.offers) ? j.offers : []).map((o) => ({ name: clip(o?.name, 120), pays: o?.pays == null || o.pays === '' ? null : canon(o.pays), quote: clip(o?.quote, 240) })).filter((o) => o.name).slice(0, 6)
    .map((o) => ({ ...o, ...verdict(o.quote, { number: o.pays }) }));
  const goals = (Array.isArray(j.goals) ? j.goals : []).map((g) => ({ goal: clip(g?.goal, 200), product: clip(g?.product, 80), quote: clip(g?.quote, 240) })).filter((g) => g.goal).slice(0, 5)
    .map((g) => ({ ...g, ...verdict(g.quote) }));
  const unplaced = (Array.isArray(j.unplaced) ? j.unplaced : []).map((u) => clip(u, 200)).filter(Boolean).slice(0, 12);
  return { facts, products, offers, goals, unplaced, dropped };
}

// ---------------------------------------------------------------- what is in the brief now (to show conflicts) and how the accepted facts go into the form
export function currentValue(key, form, extra) { return storeOf(key) === 'brief' ? String(form.values?.[key] ?? '').trim() : String(extra?.[key] ?? '').trim(); }

// a fact that has a value in the brief already is a conflict: by default it is NOT replaced (the person decides)
export function conflictOf(fact, form, extra) {
  const cur = currentValue(fact.key, form, extra);
  return cur && norm(cur) !== norm(fact.value) ? cur : '';
}

// chosen = { facts: [{ key, value, mode: 'set' | 'append' }], products: [...], offers: [...], goals: [...] }; source = a label for the column «Джерело»
// → { form, extra, applied: number } (new objects; the old ones are not touched)
export function applyChosen({ form, extra }, chosen, source = 'Розповідь менеджера') {
  const f = JSON.parse(JSON.stringify(form)), e = { ...extra };
  f.values ||= {}; f.meta ||= {}; f.products ||= []; f.offers ||= []; f.goals ||= [];
  let applied = 0;
  for (const c of chosen.facts || []) {
    if (!SPEC[c.key] || c.mode === 'skip') continue;
    if (storeOf(c.key) === 'brief') { f.values[c.key] = c.mode === 'append' && f.values[c.key] ? `${f.values[c.key]}\n${c.value}` : c.value; f.meta[c.key] = { status: 'assumption', source }; }
    else e[c.key] = c.mode === 'append' && String(e[c.key] || '').trim() ? `${String(e[c.key]).trim()}\n${c.value}` : c.value;
    applied += 1;
  }
  for (const p of chosen.products || []) {
    const hit = f.products.find((x) => norm(x.name) === norm(p.name));
    if (hit) { if ((hit.price === '' || hit.price == null) && p.price != null) { hit.price = String(p.price); applied += 1; } if ((hit.cogs === '' || hit.cogs == null) && p.cogs != null) { hit.cogs = String(p.cogs); applied += 1; } continue; }
    f.products.push({ name: p.name, price: p.price != null ? String(p.price) : '', cogs: p.cogs != null ? String(p.cogs) : '', status: 'assumption', source }); applied += 1;
  }
  for (const o of chosen.offers || []) {
    if (f.offers.some((x) => norm(x.name) === norm(o.name))) continue;
    f.offers.push({ name: o.name, pays: o.pays != null ? String(o.pays) : '', list_value: '', extra_cost: '', approved: false, status: 'assumption', source }); applied += 1; // an offer is never «погоджений клієнтом» by itself
  }
  for (const g of chosen.goals || []) {
    if (f.goals.some((x) => norm(x.goal) === norm(g.goal))) continue;
    const product = g.product && f.products.some((x) => norm(x.name) === norm(g.product)) ? f.products.find((x) => norm(x.name) === norm(g.product)).name : '';
    f.goals.push({ goal: g.goal, product }); applied += 1;
  }
  if ((chosen.notes || []).length) { f.text = `${f.text ? f.text + '\n\n' : ''}Не розкладено з розповіді:\n${chosen.notes.map((n) => '• ' + n).join('\n')}`; applied += 1; }
  return { form: f, extra: e, applied };
}
