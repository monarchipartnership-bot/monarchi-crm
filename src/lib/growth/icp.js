// The ideal client of Mon'Archi and the score of a lead (docs/growth-workflow.md, section 8.1). PURE: the code counts, the model only describes.
// A lead is a plain object (see normalizeLead). The result tells every point so the page can show «чому підходить» in plain words.

export const THRESHOLDS = { ok: 70, ask: 40 };
export const MIN_BUDGET_USD = 1500; // the owner's assumption of 2026-11-25 (open in the document, 8.7)
export const RICH_BUDGET_USD = 3000;

// rough rates to USD; the budget of a lead is a hint from the lead's own words, so «approximately» is enough
export const USD_RATE = { USD: 1, EUR: 1.08, GBP: 1.27, CAD: 0.73, AUD: 0.65, PLN: 0.25, UAH: 0.024 };
export const toUsd = (amount, currency = 'USD') => {
  const n = Number(amount);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * (USD_RATE[String(currency || 'USD').toUpperCase()] ?? 1));
};

const TIER1 = ['us', 'usa', 'united states', 'сша', 'canada', 'канада', 'australia', 'австралія', 'uk', 'united kingdom', 'great britain', 'британія', 'великобританія'];
const TIER2 = ['ua', 'ukraine', 'україна', 'pl', 'poland', 'польща', 'de', 'germany', 'німеччина', 'france', 'франція', 'netherlands', 'нідерланди', 'spain', 'іспанія', 'italy', 'італія', 'ireland', 'ірландія', 'austria', 'австрія', 'belgium', 'бельгія', 'sweden', 'швеція', 'czechia', 'czech republic', 'чехія', 'portugal', 'португалія', 'denmark', 'данія', 'finland', 'фінляндія', 'lithuania', 'литва', 'latvia', 'латвія', 'estonia', 'естонія', 'romania', 'румунія'];
export const marketOf = (country) => {
  const c = String(country || '').trim().toLowerCase();
  if (!c) return 'unknown';
  if (TIER1.includes(c)) return 'tier1';
  if (TIER2.includes(c)) return 'tier2';
  return 'other';
};
export const MARKET_LABEL = { tier1: 'США, Канада, Австралія, Британія', tier2: 'Україна, Польща, Німеччина, ЄС', other: 'інші ринки', unknown: 'країна не вказана' };

// the niches the model may answer with; anything else becomes «other»
export const NICHES = {
  ecommerce: 'Інтернет-магазин', leadgen: 'Лідогенерація, послуги', education: 'Освіта, інфобізнес', other: 'Інша ніша', excluded: 'Ринок, з яким ми не працюємо',
};
// what the lead sells, for the choice of the case
export const SUBNICHES = ['fashion', 'beauty', 'jewelry', 'furniture', 'home', 'other_ecom', 'services', 'events', 'education', 'info', 'other'];

// the grey and black markets (the profile: «white market only»); checked in the name of the company, the title of the job and the niche the model gave
const EXCLUDED_RE = /\b(casino|gambling|betting|bookmaker|poker|crypto(currency)?|bitcoin|forex|binary options|adult|porn\w*|escort|mlm|network marketing|pyramid|cbd|vape|weapons?)\b|казино|ставки на спорт|букмекер|крипт\w*|форекс|18\+/i;
export const isExcludedText = (text) => EXCLUDED_RE.test(String(text || ''));
const GUARANTEE_RE = /(guarantee[sd]?|гаранту\w*)\s+(roas|results?|sales|результат\w*|продаж\w*|окупн\w*)|\b100%\s*(results?|roi|roas)\b/i;
const OUT_OF_SCOPE_RE = /\b(logo (design)?|website (from scratch|development)|build (me )?a website|wordpress (developer|site)|mobile app)\b|розробк\w* (сайт|застосунк)\w*|логотип/i;

export function normalizeLead(raw = {}) {
  const n = (v) => (v === undefined || v === null || v === '' ? null : v);
  const budgetUsd = raw.budgetUsd != null ? Number(raw.budgetUsd) : toUsd(raw.budget_amount ?? raw.budgetAmount, raw.budget_currency ?? raw.budgetCurrency);
  const paysAds = ['yes', 'no', 'unknown'].includes(raw.paysAds ?? raw.pays_ads) ? (raw.paysAds ?? raw.pays_ads) : 'unknown';
  const niche = Object.keys(NICHES).includes(raw.niche) ? raw.niche : 'other';
  return {
    name: String(raw.name || raw.company || '').trim(),
    source: ['site', 'linkedin', 'upwork', 'manual'].includes(raw.source) ? raw.source : 'manual',
    country: String(raw.country || '').trim(),
    niche, subniche: SUBNICHES.includes(raw.subniche) ? raw.subniche : 'other',
    paysAds, budgetUsd: Number.isFinite(budgetUsd) && budgetUsd > 0 ? budgetUsd : null,
    hasSite: raw.hasSite ?? raw.has_site ?? false, siteHasCheckout: raw.siteHasCheckout ?? raw.site_has_checkout ?? false, problemNamed: raw.problemNamed ?? raw.problem_named ?? false,
    asksGuarantee: !!(raw.asksGuarantee ?? raw.asks_guarantee), outOfScope: !!(raw.outOfScope ?? raw.out_of_scope),
    text: String(raw.text || '').slice(0, 20000),
    upwork: raw.upwork ? {
      paymentVerified: raw.upwork.paymentVerified ?? raw.upwork.payment_verified ?? null, totalSpentUsd: n(raw.upwork.totalSpentUsd ?? raw.upwork.total_spent_usd),
      rating: n(raw.upwork.rating), proposals: n(raw.upwork.proposals),
    } : null,
  };
}

// → { score, parts: [{ key, label, points, max, good }], verdict: 'ok'|'ask'|'no', reject: string|null, flags: string[], missing: string[] }
export function scoreLead(raw) {
  const l = normalizeLead(raw);
  const parts = [];
  const flags = [], missing = [];
  const add = (key, label, points, max, good = points >= max * 0.5) => parts.push({ key, label, points, max, good });

  // hard refusals first: no points are counted for them
  let reject = null;
  if (l.niche === 'excluded' || isExcludedText(l.name) || (isExcludedText(l.text.slice(0, 400)) && l.niche !== 'ecommerce')) reject = 'Ринок, з яким ми не працюємо (сірий або чорний ринок)';
  else if (!l.hasSite) reject = 'Немає сайту: нічого аудитувати й рекламувати';
  else if (l.asksGuarantee || GUARANTEE_RE.test(l.text)) reject = 'Вимагає гарантій результату: ми їх не даємо';
  else if (l.outOfScope || OUT_OF_SCOPE_RE.test(l.text)) reject = 'Просить те, що ми не продаємо (логотип, сайт під ключ, застосунок)';
  else if (l.source === 'upwork' && l.upwork && l.upwork.paymentVerified === false) reject = 'Upwork: оплата замовника не верифікована';
  if (reject) return { score: 0, parts: [], verdict: 'no', reject, flags, missing, lead: l };

  add('niche', l.niche === 'ecommerce' ? 'Інтернет-магазин: наша головна ніша' : l.niche === 'leadgen' ? 'Лідогенерація: друга за важливістю ніша' : l.niche === 'education' ? 'Освіта: друга за важливістю ніша' : 'Інша ніша', l.niche === 'ecommerce' ? 30 : l.niche === 'other' ? 5 : 20, 30);
  add('pays_ads', l.paysAds === 'yes' ? 'Уже платить за рекламу' : l.paysAds === 'no' ? 'Реклами ще не веде' : 'Невідомо, чи вже запускали рекламу', l.paysAds === 'yes' ? 25 : l.paysAds === 'unknown' ? 10 : 0, 25, l.paysAds === 'yes');
  if (l.paysAds === 'unknown') missing.push('чи вже запускали рекламу');
  if (l.budgetUsd == null) { add('budget', 'Бюджет не вказано', 0, 25, false); missing.push('рекламний бюджет'); }
  else if (l.budgetUsd >= RICH_BUDGET_USD) add('budget', `Бюджет від $${RICH_BUDGET_USD.toLocaleString('en-US')} на місяць`, 25, 25);
  else if (l.budgetUsd >= MIN_BUDGET_USD) add('budget', `Бюджет від $${MIN_BUDGET_USD.toLocaleString('en-US')} на місяць`, 15, 25);
  else add('budget', `Бюджет нижче $${MIN_BUDGET_USD.toLocaleString('en-US')} на місяць`, 0, 25, false);
  const mk = marketOf(l.country);
  add('market', mk === 'tier1' ? `Ринок: ${l.country}` : mk === 'tier2' ? `Ринок: ${l.country}` : mk === 'unknown' ? 'Країну не вказано' : `Ринок: ${l.country}`, mk === 'tier1' ? 15 : mk === 'tier2' ? 10 : 5, 15, mk !== 'other' && mk !== 'unknown');
  if (mk === 'unknown') missing.push('країна');
  const siteOk = l.hasSite && l.siteHasCheckout, problem = !!l.problemNamed;
  add('site', siteOk && problem ? 'Є сайт з оплатою, названа проблема' : siteOk ? 'Є сайт з оплатою' : problem ? 'Названа проблема' : 'Сайт без оплати, проблема не названа', (siteOk ? 3 : 0) + (problem ? 2 : 0), 5);

  const score = parts.reduce((s, p) => s + p.points, 0);
  let verdict = score >= THRESHOLDS.ok ? 'ok' : score >= THRESHOLDS.ask ? 'ask' : 'no';
  // Upwork signals: a weak client is never «ok» on its own
  if (l.source === 'upwork' && l.upwork) {
    const u = l.upwork;
    if (u.totalSpentUsd === 0) flags.push('Upwork: у замовника немає історії витрат');
    if (u.rating != null && Number(u.rating) < 4) flags.push('Upwork: рейтинг замовника нижче 4');
    if (u.proposals != null && Number(u.proposals) >= 15) flags.push('Upwork: на вакансію вже 15 і більше відгуків');
    if (flags.length && verdict === 'ok') verdict = 'ask';
  }
  return { score, parts, verdict, reject: null, flags, missing, lead: l };
}

export const VERDICT_LABEL = { ok: 'Підходить', ask: 'Уточнити', no: 'Не підходить', pending: 'Оцінюється' };
