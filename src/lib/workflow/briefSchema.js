// THE ONE PLACE for what the agents need to know about a client (owner's rule 2026-11-26: one brief, no duplicates, nothing scattered).
// This registry names every fact, where it is kept (the brief, the project card, the cards of the creative materials, the linked cabinets, the state of the process),
// which agents need it and whether the process can go on without it. The pre-launch check, the brief page and the extraction of facts from words all read it.
// PURE: no network. The stores stay as they are (the agents read them as before); a person sees them as ONE brief.

export const SECTIONS = [
  { key: 'biz', name: 'Про бізнес' },
  { key: 'money', name: 'Цілі й гроші' },
  { key: 'products', name: 'Товари й офери' },
  { key: 'geo', name: 'ГЕО й мови' },
  { key: 'brand', name: 'Бренд і креативи' },
  { key: 'access', name: 'Доступи' },
  { key: 'pay', name: 'Оплата й договір' },
];

const num = (v) => { const x = Number(String(v ?? '').replace(/\s/g, '').replace(',', '.')); return v !== '' && v != null && Number.isFinite(x) ? x : null; };
const txt = (v) => String(v ?? '').trim();

// the countries of the European Union (an ad shown there needs the name of the advertiser; the same list as api/_lib/metaAdsWrite.js)
const EU = new Set(['AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE']);
const EU_WORDS = /польщ|poland|німеччин|germany|франц|france|італ|italy|іспані|spain|нідерланд|netherlands|чехі|czech|румун|romania|литв|lithuania|латві|latvia|естон|estonia|болгар|bulgaria|хорват|croatia|угорщин|hungary|австр|austria|бельгі|belgium|данія|denmark|фінлянд|finland|ірланд|ireland|греці|greece|португал|portugal|словач|slovakia|словен|slovenia|швеці|sweden|кіпр|cyprus|мальт|malta|люксембург|luxembourg|\b(AT|BE|BG|HR|CY|CZ|DK|EE|FI|FR|DE|GR|HU|IE|IT|LV|LT|LU|MT|NL|PL|PT|RO|SK|SI|ES|SE)\b/i;
export const geoHasEu = (geo) => EU_WORDS.test(String(geo || '')) || String(geo || '').split(/[,;/\s]+/).some((c) => EU.has(c.toUpperCase()));

// the facts, in the order a manager thinks in. level: 'required' (the process cannot go on / launch without it) | 'recommended' (the result is better with it).
// store: where it lives. needFor: the agents that read it (for the hint «навіщо»).
export const FIELDS = [
  { key: 'website', section: 'biz', label: 'Сайт клієнта', level: 'required', store: 'project', needFor: ['Дослідник', 'Креатор'], why: 'Агенти читають сайт самі: товари, ціни, тон, ДНК бренду.', ph: 'https://example.com', kind: 'url' },
  { key: 'about', section: 'biz', label: 'Чим займається клієнт', level: 'recommended', store: 'card', needFor: ['Дослідник', 'Стратег'], why: 'Коротко, 2-3 речення. Сайт вносити не треба.', ph: 'Що продає, кому, де працює', kind: 'long' },
  { key: 'offer', section: 'biz', label: 'Оффер і відмінності', level: 'recommended', store: 'card', needFor: ['Креатор'], why: 'Головна пропозиція та акції, лише те, що точно є.', ph: 'Чим клієнт відрізняється', kind: 'long' },
  { key: 'audience', section: 'biz', label: 'Цільова аудиторія', level: 'recommended', store: 'brief.general', needFor: ['Дослідник', 'Стратег'], why: 'Як аудиторію описує клієнт; дослідження доповнить її даними.', ph: 'Хто купує', kind: 'long' },
  { key: 'competitors', section: 'biz', label: 'Сайти конкурентів', level: 'required', store: 'brief.general', needFor: ['Дослідник'], why: 'Без списку дослідження конкурентів не стартує. Адреси по одній у рядок.', ph: 'competitor.com', kind: 'long' },
  { key: 'goal', section: 'money', label: 'Ціль у цифрах', level: 'required', store: 'brief.general', needFor: ['Стратег', 'Медіабаєр'], why: 'З неї рахується цільова ціна покупки.', ph: 'наприклад 60 покупок на місяць', kind: 'text' },
  { key: 'budget_monthly', section: 'money', label: 'Місячний бюджет реклами', level: 'required', store: 'brief.economics', needFor: ['Стратег', 'Медіабаєр'], why: 'Без нього не можна розподілити гроші по кампаніях.', ph: 'наприклад 4500', kind: 'number' },
  { key: 'currency', section: 'money', label: 'Валюта', level: 'recommended', store: 'brief.economics', needFor: ['Стратег'], why: 'Валюта цін і бюджету.', ph: 'USD', kind: 'text' },
  { key: 'avg_order', section: 'money', label: 'Середній чек', level: 'required', store: 'brief.economics', needFor: ['Дослідник'], why: 'Потрібен для економіки (або ціни кожного товару нижче).', ph: 'наприклад 175', kind: 'number', unit: true },
  { key: 'cogs_pct', section: 'money', label: 'Собівартість, % від ціни', level: 'required', store: 'brief.economics', needFor: ['Дослідник'], why: 'Потрібна для беззбиткової ціни покупки (або собівартість кожного товару).', ph: 'наприклад 30', kind: 'number', unit: true },
  { key: 'target_roas', section: 'money', label: 'Цільовий ROAS', level: 'recommended', store: 'brief.economics', needFor: ['Дослідник', 'Медіабаєр'], why: 'Без нього візьмемо 2.5 і позначимо як припущення.', ph: '2.5', kind: 'number' },
  { key: 'creative_goals', section: 'products', label: 'Цілі перших креативів', level: 'required', store: 'brief.goals', needFor: ['Креатор'], why: 'Що рекламуємо і що хочемо отримати. Без цілі креативи не створюються.', ph: 'наприклад Продати хіт сезону', kind: 'goal' },
  { key: 'geo', section: 'geo', label: 'Країни показу (ГЕО)', level: 'required', store: 'brief.general', needFor: ['Стратег', 'Медіабаєр'], why: 'Куди показуємо рекламу.', ph: 'Україна, Польща', kind: 'text' },
  { key: 'tone', section: 'brand', label: 'Тон і стиль бренду', level: 'recommended', store: 'card', needFor: ['Креатор'], why: 'Як бренд говорить: на «ви» чи «ти», слова, яких уникати.', ph: 'Тепло, на «ви»', kind: 'long' },
  { key: 'copy_rules', section: 'brand', label: 'Правила до текстів', level: 'recommended', store: 'card', needFor: ['Креатор'], why: 'Що має бути в заголовку й тексті: слоган, дисклеймер.', ph: 'Слоган, акція, дисклеймер', kind: 'long' },
  { key: 'product_photo', section: 'brand', label: 'Фото продукту', level: 'required', store: 'assets', needFor: ['Креатор'], why: 'Креативи роблять із фото товару. Завантажте у блоці «Файли».', kind: 'files' },
  { key: 'seasonality', section: 'brand', label: 'Сезонність і події', level: 'recommended', store: 'card', needFor: ['Стратег'], why: 'Для плану на місяць: розпродажі, пік попиту.', ph: 'Чорна п’ятниця, Різдво', kind: 'long' },
  { key: 'cabinet_meta', section: 'access', label: 'Рекламний кабінет Meta', level: 'required', store: 'accounts', needFor: ['Дослідник', 'Медіабаєр'], why: 'Без кабінету нема чого аналізувати й нікуди запускати.', kind: 'cabinet' },
  { key: 'fb_page_id', section: 'access', label: 'Сторінка Facebook', level: 'required', store: 'brief.general', needFor: ['Медіабаєр'], why: 'Від імені цієї сторінки йде реклама (ID цифрами).', ph: 'ID сторінки', kind: 'text' },
  { key: 'dsa_name', section: 'access', label: 'Назва рекламодавця для ЄС', level: 'required', when: (v) => geoHasEu(v.geo), store: 'brief.general', needFor: ['Медіабаєр'], why: 'Для показу в країнах ЄС Meta вимагає назву рекламодавця й платника.', ph: 'Як юридично називається клієнт', kind: 'text' },
  { key: 'ga4_property', section: 'access', label: 'GA4 Property ID', level: 'recommended', store: 'brief.general', needFor: ['Дослідник'], why: 'З нього беремо вік і місто аудиторії. Лише цифри.', ph: 'необов’язково', kind: 'text' },
  { key: 'paid', section: 'pay', label: 'Оплату підтверджено', level: 'required', store: 'state', needFor: ['Оркестратор'], why: 'Процес стартує після оплати.', kind: 'flag' },
  { key: 'contracts', section: 'pay', label: 'Договори підписано', level: 'required', store: 'state', needFor: ['Оркестратор'], why: 'Процес стартує після підписання договорів.', kind: 'flag' },
];
export const FIELD = Object.fromEntries(FIELDS.map((f) => [f.key, f]));

// ---------------------------------------------------------------- reading the values of ONE brief from the stores
// ctx = { brief: content of the current version of «Бриф» | null, project: row, card: { settings, assets }, accounts: [rows], state: row }. → { values, products, goals }
export function collectValues({ brief = null, project = null, card = null, accounts = [], state = null } = {}) {
  const g = brief?.general || {}, e = brief?.economics || {};
  const inputs = card?.settings?.inputs || {};
  const body = (k) => txt(inputs[k]?.body);
  const values = {
    website: txt(project?.website), about: body('about'), offer: body('offer'), audience: txt(g.audience), competitors: txt(g.competitors),
    goal: txt(g.goal), budget_monthly: e.budget_monthly != null ? String(e.budget_monthly) : '', currency: txt(e.currency), avg_order: e.avg_order != null ? String(e.avg_order) : '',
    cogs_pct: e.cogs_pct != null ? String(e.cogs_pct) : '', target_roas: e.target_roas != null ? String(e.target_roas) : '',
    geo: txt(g.geo), tone: body('tone'), copy_rules: body('copy_rules'), seasonality: body('seasonality'),
    fb_page_id: txt(g.fb_page_id), dsa_name: txt(g.dsa_name), ga4_property: txt(g.ga4_property),
  };
  const products = (e.products || []).filter((p) => txt(p?.name));
  const goals = (brief?.creative_goals || []).filter((x) => txt(x?.goal));
  const assets = card?.assets || [];
  return {
    values, products, goals,
    flags: { product_photo: assets.some((a) => a.kind === 'product'), cabinet_meta: accounts.some((a) => a.platform === 'meta'), paid: !!state?.paid_at, contracts: !!state?.contracts_signed_at },
  };
}

// are the inputs of the Unit Economy there: a price and a cost of every product, or the average order and the cost percent
export function unitInputsOk({ values, products }) {
  const perProduct = products.length > 0 && products.every((p) => num(p.price) != null && num(p.cogs) != null);
  return perProduct || (num(values.avg_order) != null && num(values.cogs_pct) != null);
}

// ---------------------------------------------------------------- the pre-launch check: ONE list of what is there and what is missing
// → { items: [{ key, label, level, ok, why, needFor, ask }], required: { total, ok }, recommended: { total, ok }, ready }. `ask` = the inputs to show for a missing fact.
export function checkBrief(ctx) {
  const c = collectValues(ctx);
  const items = [];
  for (const f of FIELDS) {
    if (f.when && !f.when(c.values)) continue;
    let ok;
    if (f.kind === 'flag' || f.kind === 'files' || f.kind === 'cabinet') ok = !!c.flags[f.key];
    else if (f.key === 'creative_goals') ok = c.goals.length > 0;
    else if (f.unit) ok = unitInputsOk(c); // the average order and the cost percent only matter when the products do not carry their own numbers
    else ok = txt(c.values[f.key]) !== '';
    items.push({ key: f.key, label: f.label, level: f.level, ok, why: f.why, needFor: f.needFor, section: f.section, kind: f.kind, ask: ok ? null : askFor(f), value: f.kind === 'text' || f.kind === 'long' || f.kind === 'number' || f.kind === 'url' ? c.values[f.key] || '' : '' });
  }
  const sum = (level) => ({ total: items.filter((i) => i.level === level).length, ok: items.filter((i) => i.level === level && i.ok).length });
  const required = sum('required'), recommended = sum('recommended');
  return { items, required, recommended, ready: required.ok === required.total, ...c };
}
const askFor = (f) => (['flag', 'files', 'cabinet'].includes(f.kind) ? { kind: f.kind } : { kind: f.kind, placeholder: f.ph || '' });

// ---------------------------------------------------------------- writing one fact back: which store changes (the caller does the calls)
// → { store: 'brief' | 'project' | 'card_input' | 'goal', ... } or throws a readable Error for an unusable value
export function planWrite(key, value) {
  const f = FIELD[key];
  if (!f) throw new Error('Невідоме поле: ' + key);
  const v = txt(value);
  if (!v) throw new Error('Введіть значення.');
  if (f.kind === 'number') { if (num(v) == null) throw new Error(`«${f.label}»: потрібне число.`); return { store: 'brief', group: 'economics', key, value: num(v) }; }
  if (f.store === 'brief.general') {
    if (key === 'fb_page_id' || key === 'ga4_property') { if (!/^\d{5,}$/.test(v.replace(/\s/g, ''))) throw new Error(`«${f.label}»: лише цифри.`); return { store: 'brief', group: 'general', key, value: v.replace(/\s/g, '') }; }
    return { store: 'brief', group: 'general', key, value: v };
  }
  if (f.store === 'brief.economics') return { store: 'brief', group: 'economics', key, value: v.toUpperCase() };
  if (f.store === 'brief.goals') return { store: 'goal', value: v.slice(0, 200) };
  if (f.store === 'project') {
    if (key === 'website' && !/^https?:\/\/[^\s]+\.[^\s]+$/i.test(v)) throw new Error('Вкажіть адресу сайту повністю, наприклад https://example.com');
    return { store: 'project', key, value: v };
  }
  if (f.store === 'card') return { store: 'card_input', key, value: v };
  throw new Error(`«${f.label}» вводиться окремо.`);
}

// → the new content of the brief with one fact written (a person typed it: the status is «підтверджено»)
export function applyToBrief(content, plan) {
  const c = JSON.parse(JSON.stringify(content || { schema: 1, general: {}, economics: {}, economics_meta: {}, creative_goals: [] }));
  c.general ||= {}; c.economics ||= {}; c.economics_meta ||= {}; c.creative_goals ||= [];
  if (plan.store === 'goal') { c.creative_goals.push({ goal: plan.value, product: '' }); return c; }
  c[plan.group][plan.key] = plan.value;
  c.economics_meta[plan.key] = { status: 'confirmed', source: 'Менеджер' };
  delete c.draft_from_site; // a person has touched it
  return c;
}
