// The brief as a sheet (step A4, variant B of the mockup): every number has a value, a status («підтверджено» / «припущення») and a source.
// The agents read it from the version of the section «Бриф»: content = { general, economics, economics_meta, products, offers }.
// PURE: the screen turns a form into this content and back; api/_lib/wf/skills/economics.js counts from content.economics.

export const GENERAL = [
  { key: 'geo', label: 'GEO' },
  { key: 'goal', label: 'Ціль у цифрах' },
  { key: 'priority', label: 'Акцент на товари (на певні чи на всі)' },
  { key: 'audience', label: 'Цільова аудиторія (як її описує клієнт)' },
  { key: 'competitors', label: 'Конкуренти (сайти, по одному в рядку)' },
  { key: 'fb_page_id', label: 'ID сторінки Facebook, від імені якої йде реклама (цифри)' },
  { key: 'dsa_name', label: 'Для показу в країнах ЄС: назва рекламодавця (хто отримує вигоду від реклами і хто за неї платить)' },
  { key: 'payment_amount', label: 'Сума оплати за послуги (з валютою)' },
  { key: 'payment_next_date', label: 'Дата наступної оплати (РРРР-ММ-ДД)' },
  { key: 'payment_period', label: 'Оплата: щомісяця чи разово' },
  { key: 'ga4_property', label: 'GA4 Property ID клієнта (лише цифри)' },
];
export const PARAMS = [
  { key: 'budget_monthly', label: 'Місячний бюджет' },
  { key: 'currency', label: 'Валюта', text: true },
  { key: 'target_roas', label: 'Цільовий ROAS' },
  { key: 'avg_order', label: 'Середній чек' },
  { key: 'cogs_pct', label: 'Собівартість, % від ціни' },
  { key: 'shipping_cost', label: 'Доставка й пакування за замовлення' },
  { key: 'fee_pct', label: 'Комісії платежів, %' },
  { key: 'returns_pct', label: 'Повернення, %' },
  { key: 'site_cvr_pct', label: 'Конверсія сайту, %' },
  { key: 'min_campaign_daily', label: 'Мін. бюджет кампанії на день' },
];
export const ROWS = [...GENERAL.map((g) => ({ ...g, text: true })), ...PARAMS];
export const STATUS_LABEL = { confirmed: 'Підтверджено', assumption: 'Припущення', empty: 'Порожньо' };
export const STATUS_TONE = { confirmed: 'ok', assumption: 'warn', empty: 'mute' };

const blank = (v) => v == null || String(v).trim() === '';
const numOrNull = (v) => { if (blank(v)) return null; const x = Number(String(v).replace(/\s/g, '').replace(',', '.')); return Number.isFinite(x) ? x : null; };

export const emptyForm = () => ({ values: { currency: 'USD' }, meta: {}, products: [], offers: [], goals: [], text: '' });

// The status that is drawn: no value = «Порожньо»; a value without a mark is a assumption until a person confirms it.
export const rowStatus = (value, meta) => (blank(value) ? 'empty' : meta?.status === 'confirmed' ? 'confirmed' : 'assumption');

export function formFromContent(content = {}, body = '') {
  const c = content || {};
  const values = {};
  for (const g of GENERAL) if (c.general?.[g.key] != null) values[g.key] = String(c.general[g.key]);
  const e = c.economics || {};
  for (const p of PARAMS) {
    if (p.key === 'site_cvr_pct') { if (e.site_cvr != null) values[p.key] = String(Math.round(e.site_cvr * 10000) / 100); }
    else if (e[p.key] != null) values[p.key] = String(e[p.key]);
  }
  if (blank(values.currency)) values.currency = 'USD';
  return {
    values, meta: { ...(c.economics_meta || {}) },
    products: (e.products || []).map((p) => ({ name: p.name || '', price: p.price ?? '', cogs: p.cogs ?? '', status: (c.economics_meta?.['product:' + p.name]?.status) || 'assumption', source: c.economics_meta?.['product:' + p.name]?.source || '' })),
    offers: (e.offers || []).map((o) => ({ name: o.name || '', pays: o.pays ?? '', list_value: o.list_value ?? '', extra_cost: o.extra_cost ?? '', approved: o.approved === true, status: (c.economics_meta?.['offer:' + o.name]?.status) || 'assumption', source: c.economics_meta?.['offer:' + o.name]?.source || '' })),
    goals: (c.creative_goals || []).map((g) => ({ goal: g.goal || '', product: g.product || '' })),
    text: body || '',
  };
}

export function contentFromForm(form) {
  const v = form.values || {};
  const general = {};
  for (const g of GENERAL) if (!blank(v[g.key])) general[g.key] = String(v[g.key]).trim();
  const economics = { currency: blank(v.currency) ? 'USD' : String(v.currency).trim().toUpperCase() };
  for (const p of PARAMS) {
    if (p.text) continue;
    const n = numOrNull(v[p.key]);
    if (n == null) continue;
    if (p.key === 'site_cvr_pct') economics.site_cvr = n / 100; else economics[p.key] = n;
  }
  economics.products = (form.products || []).filter((p) => !blank(p.name)).map((p) => ({ name: p.name.trim(), price: numOrNull(p.price), cogs: numOrNull(p.cogs) }));
  economics.offers = (form.offers || []).filter((o) => !blank(o.name)).map((o) => ({ name: o.name.trim(), pays: numOrNull(o.pays), list_value: numOrNull(o.list_value), extra_cost: numOrNull(o.extra_cost) ?? 0, approved: !!o.approved }));
  const meta = {};
  for (const r of ROWS) if (!blank(v[r.key])) meta[r.key] = { status: form.meta?.[r.key]?.status === 'confirmed' ? 'confirmed' : 'assumption', source: (form.meta?.[r.key]?.source || '').trim() };
  for (const p of economics.products) { const f = form.products.find((x) => x.name.trim() === p.name); meta['product:' + p.name] = { status: f?.status === 'confirmed' ? 'confirmed' : 'assumption', source: (f?.source || '').trim() }; }
  for (const o of economics.offers) { const f = form.offers.find((x) => x.name.trim() === o.name); meta['offer:' + o.name] = { status: f?.status === 'confirmed' ? 'confirmed' : 'assumption', source: (f?.source || '').trim() }; }
  // the goals of the first creatives are entered here too (document: «ціль кожного креатива вказує менеджер»): everything the manager fills in about the project is in one sheet
  const creative_goals = (form.goals || []).filter((g) => !blank(g.goal)).map((g) => ({ goal: g.goal.trim().slice(0, 200), product: blank(g.product) ? '' : String(g.product).trim() }));
  return { schema: 1, general, economics, economics_meta: meta, creative_goals };
}

// What the researcher still has to ask: the rows that are empty and the numbers that are only assumptions.
export function briefGaps(content = {}) {
  const f = formFromContent(content);
  const empty = ROWS.filter((r) => blank(f.values[r.key])).map((r) => r.label);
  const assumptions = Object.entries(content.economics_meta || {}).filter(([, m]) => m.status !== 'confirmed').length;
  return { empty, assumptions };
}
