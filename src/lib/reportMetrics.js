import { formatMoney } from './adAccounts.js';

// Every platform row is normalised to these base numbers; everything else a
// report shows is computed from them (in code, never by the AI model).
export const BASE_FIELDS = ['spend', 'impressions', 'reach', 'clicks', 'purchases', 'leads', 'revenue'];

// goodWhen: which direction is an improvement (costs: lower is better).
export const METRICS = {
  spend: { label: 'Витрати', en: 'Spent', format: 'money', goodWhen: 'neutral' },
  revenue: { label: 'Дохід', en: 'Revenue', format: 'money', goodWhen: 'up' },
  impressions: { label: 'Покази', en: 'Impressions', format: 'number', goodWhen: 'up' },
  reach: { label: 'Охоплення', en: 'Reach', format: 'number', goodWhen: 'up' },
  clicks: { label: 'Кліки', en: 'Clicks', format: 'number', goodWhen: 'up' },
  purchases: { label: 'Продажі', en: 'Number of sales', format: 'number', goodWhen: 'up' },
  leads: { label: 'Ліди', en: 'Leads', format: 'number', goodWhen: 'up' },
  cpm: { label: 'CPM', en: 'CPM', format: 'money', goodWhen: 'down', calc: (b) => ratio(b.spend, b.impressions, 1000) },
  ctr: { label: 'CTR', en: 'CTR', format: 'percent', goodWhen: 'up', calc: (b) => ratio(b.clicks, b.impressions, 100) },
  cpc: { label: 'CPC', en: 'CPC', format: 'money', goodWhen: 'down', calc: (b) => ratio(b.spend, b.clicks) },
  cpp: { label: 'CPP (ціна продажу)', en: 'CPP', format: 'money', goodWhen: 'down', calc: (b) => ratio(b.spend, b.purchases) },
  cpl: { label: 'CPL (ціна ліда)', en: 'CPL', format: 'money', goodWhen: 'down', calc: (b) => ratio(b.spend, b.leads) },
  roas: { label: 'ROAS', en: 'ROAS', format: 'ratio', goodWhen: 'up', calc: (b) => ratio(b.revenue, b.spend) },
  aov: { label: 'AOV (середній чек)', en: 'AOV', format: 'money', goodWhen: 'up', calc: (b) => ratio(b.revenue, b.purchases) },
};

function ratio(a, b, k = 1) {
  const x = Number(a);
  const y = Number(b);
  if (!Number.isFinite(x) || !Number.isFinite(y) || y === 0) return null;
  return (x / y) * k;
}

// Which metrics a report shows by default, by project type (the project's
// "Тип бізнесу"): e-commerce is the default, lead-generation projects swap sales
// for leads.
export const METRIC_SETS = {
  ecom: ['spend', 'revenue', 'cpm', 'ctr', 'cpc', 'clicks', 'impressions', 'reach', 'purchases', 'cpp', 'roas', 'aov'],
  leadgen: ['spend', 'impressions', 'reach', 'clicks', 'ctr', 'cpc', 'cpm', 'leads', 'cpl'],
};

export function projectKind(project) {
  return project?.business_type === 'Проєкти лідогенерації' ? 'leadgen' : 'ecom';
}

export const FORMAT_LABELS = { number: 'Число', money: 'Гроші', percent: 'Відсотки', ratio: 'Множник (×)' };
export const OPERATIONS = [
  { value: '/', label: '÷ ділити на' },
  { value: '*', label: '× множити на' },
  { value: '+', label: '+ додати' },
  { value: '-', label: '− відняти' },
];

// All metrics available to build a custom one from (built-in + other custom).
export function metricOptions(customMetrics = []) {
  return [
    ...Object.entries(METRICS).map(([key, m]) => ({ key, label: m.label })),
    ...customMetrics.map((c) => ({ key: c.key, label: c.name })),
  ];
}

export function slugKey(name) {
  const base = String(name || '').toLowerCase().replace(/[^a-z0-9а-яіїєґ]+/gi, '_').replace(/^_+|_+$/g, '');
  return 'custom_' + (base || Date.now());
}

function operand(v, base, custom, depth) {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return v;
  if (/^-?\d+(\.\d+)?$/.test(String(v))) return Number(v);
  return computeMetric(String(v), base, custom, depth + 1);
}

// A metric's value from a row of base numbers: a base field, a built-in
// formula, or a custom formula {a, op, b}. `null` means "can't be computed"
// (no data, divide by zero, circular reference).
export function computeMetric(key, base, custom = [], depth = 0) {
  if (depth > 6 || !base) return null;
  if (BASE_FIELDS.includes(key)) return base[key] == null ? null : Number(base[key]);
  const builtin = METRICS[key];
  if (builtin?.calc) return builtin.calc(base);
  const c = custom.find((m) => m.key === key);
  if (!c?.formula) return null;
  const a = operand(c.formula.a, base, custom, depth);
  const b = operand(c.formula.b, base, custom, depth);
  if (a == null || b == null) return null;
  switch (c.formula.op) {
    case '/': return b === 0 ? null : a / b;
    case '*': return a * b;
    case '+': return a + b;
    case '-': return a - b;
    default: return null;
  }
}

export function metricMeta(key, custom = []) {
  if (METRICS[key]) return { ...METRICS[key], key };
  const c = custom.find((m) => m.key === key);
  return c ? { key, label: c.name, en: c.name, format: c.format || 'number', goodWhen: 'up' } : { key, label: key, en: key, format: 'number', goodWhen: 'neutral' };
}

export function formatMetric(value, format, currency) {
  if (value == null || !Number.isFinite(value)) return '—';
  if (format === 'money') return formatMoney(value, currency);
  if (format === 'percent') return value.toLocaleString('uk-UA', { maximumFractionDigits: 2 }) + '%';
  if (format === 'ratio') return value.toLocaleString('uk-UA', { maximumFractionDigits: 2 }) + 'x';
  return value.toLocaleString('uk-UA', { maximumFractionDigits: 2 });
}

// Change vs the previous period, in percent. null when there is nothing to compare.
export function deltaPct(cur, prev) {
  if (cur == null || prev == null || !Number.isFinite(cur) || !Number.isFinite(prev) || prev === 0) return null;
  return ((cur - prev) / Math.abs(prev)) * 100;
}

// 'good' | 'bad' | 'neutral' for colouring a delta.
export function deltaTone(delta, goodWhen) {
  if (delta == null || goodWhen === 'neutral' || Math.abs(delta) < 0.05) return 'neutral';
  const up = delta > 0;
  return (goodWhen === 'up') === up ? 'good' : 'bad';
}

// Adds rows of base numbers. A field that no row has (e.g. reach for Google, which
// doesn't report it) stays null instead of turning into a misleading 0.
export function sumBase(rows) {
  const out = Object.fromEntries(BASE_FIELDS.map((f) => [f, null]));
  rows.forEach((r) => BASE_FIELDS.forEach((f) => {
    if (r?.[f] == null) return;
    out[f] = (out[f] || 0) + (Number(r[f]) || 0);
  }));
  return out;
}
