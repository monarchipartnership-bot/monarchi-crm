// The model of the client's public report page (/r/:token): what get_shared_report hands over → everything the page shows.
// Pure functions (no database, no network, no React), so scripts/check-core.mjs tests all of it. The page itself only draws this model.
//
// The client sees ONLY what the function returned: approved weeks plus the running total of the current month. Nothing here fetches or invents numbers.
import { METRICS, METRIC_SETS, computeMetric, deltaPct, deltaTone, sumBase } from './reportMetrics.js';
import { monthKey, monthRange, monthWeeks } from './projectHistory.js';
import { hiddenMetricsOf, metricKeysOf, reportBlocks } from './reportTemplate.js';

export const TOP_GROUPS = 5; // groups shown by name; the rest fold into «Other (N groups)» until the client asks to see all

const MONTHS_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const monthName = (key) => MONTHS_EN[Number(key.slice(5, 7)) - 1];
export const monthTitle = (key) => `${monthName(key)} ${key.slice(0, 4)}`;
export const monthShort = (key) => monthName(key).slice(0, 3);

const dm = (iso) => `${String(iso).slice(8, 10)}.${String(iso).slice(5, 7)}`;
export const dmy = (iso) => `${dm(iso)}.${String(iso).slice(0, 4)}`;
export const rangeText = (a, b) => `${dm(a)} – ${dm(b)}`;

// ---- numbers as the client reads them ----
const nf = (v, d = 0) => Number(v).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
const TWO_DECIMALS = new Set(['cpm', 'cpc']);

function money(v, currency, d) {
  try { return new Intl.NumberFormat('en-US', { style: 'currency', currency: currency || 'USD', minimumFractionDigits: d, maximumFractionDigits: d }).format(v); } catch { return nf(v, d); }
}

// key: the metric; format: its kind (number | money | percent | ratio). ROAS reads as a percentage, like in the client's own sheet.
export function fmtValue(key, value, format, currency) {
  if (value == null || !Number.isFinite(Number(value))) return '—';
  const v = Number(value);
  if (key === 'roas') return `${nf(v * 100)}%`;
  if (format === 'money') return money(v, currency, TWO_DECIMALS.has(key) ? 2 : 0);
  if (format === 'percent') return `${nf(v, 2)}%`;
  if (format === 'ratio') return `${nf(v, 2)}×`;
  return nf(v);
}

// An arrow and a percentage against the previous period; tone: good | bad | neu (costs: lower is better). null when there is nothing to compare.
export function change(key, cur, prev, goodWhen) {
  const d = deltaPct(cur, prev);
  if (d == null) return null;
  const t = deltaTone(d, goodWhen);
  return { arrow: d > 0.05 ? '▲' : d < -0.05 ? '▼' : '', pct: `${Math.abs(d).toFixed(1)}%`, tone: t === 'neutral' ? 'neu' : t, value: d };
}

// ---- one report → the scope the page shows ----
// The row of a scope (one platform, or «all» with several) → one total, the groups by name, the currency.
// Campaigns that belong to no group come as one column each (`single`) — or as the old «Інше». The client sees them as one «Other campaigns» group:
// no internal campaign names, and the table does not grow with every small campaign.
export const OTHER_CAMPAIGNS = 'Other campaigns';
export function foldSingles(groups) {
  const isOther = (g) => g.single || g.name === 'Інше' || g.name === OTHER_CAMPAIGNS; // the database already renamed them, the page folds them
  const named = groups.filter((g) => !isOther(g));
  const rest = groups.filter(isOther);
  if (!rest.length) return named;
  return [...named, { name: OTHER_CAMPAIGNS, ...sumBase(rest), campaignCount: rest.reduce((a, g) => a + (g.campaignCount || 1), 0) }];
}

export function scopeOf(platforms) {
  const keys = Object.keys(platforms || {});
  if (!keys.length) return null;
  if (keys.length === 1) {
    const p = platforms[keys[0]];
    return { currency: p.currency || 'USD', total: p.total || {}, groups: foldSingles((p.groups || []).map((g) => ({ ...g }))) };
  }
  const byName = new Map();
  keys.forEach((k) => foldSingles(platforms[k].groups || []).forEach((g) => byName.set(g.name, [...(byName.get(g.name) || []), g])));
  return {
    currency: platforms[keys[0]].currency || 'USD',
    total: sumBase(keys.map((k) => platforms[k].total || {})),
    groups: [...byName.entries()].map(([name, list]) => ({ name, ...sumBase(list) })),
  };
}

const bySpend = (a, b) => (Number(b.spend) || 0) - (Number(a.spend) || 0);
const active = (g) => (Number(g.spend) || 0) > 0 || (Number(g.impressions) || 0) > 0;

// Metrics the table shows: the project's set + its extra columns + its own formulas, each with the label and format.
export function metricKeys(kind, columns = [], custom = []) {
  return [...(METRIC_SETS[kind] || METRIC_SETS.ecom).filter((k) => METRICS[k]), ...columns.filter((k) => METRICS[k]), ...custom.map((c) => c.key)];
}
export function metricInfo(key, custom = [], platformLabel = '') {
  const m = METRICS[key];
  if (m) return { key, label: key === 'roas' && platformLabel ? `ROAS (${platformLabel})` : m.en || m.label, format: m.format, goodWhen: m.goodWhen };
  const c = custom.find((x) => x.key === key);
  return { key, label: c?.name || key, format: c?.format || 'number', goodWhen: 'up' };
}

const mergeBase = (list) => sumBase(list);

// A report row → what the page needs of it (total, groups, previous period).
export function reportView(report, ctx) {
  const cur = scopeOf(report.data?.platforms);
  if (!cur) return null;
  const prevScope = report.data?.previous ? scopeOf(report.data.previous.platforms) : null;
  const prevPeriod = report.data?.previous?.period || null;
  return {
    id: report.id, type: report.type, start: report.start, end: report.end, toDate: Boolean(report.toDate), status: report.status,
    updatedAt: report.updatedAt || null,
    currency: cur.currency,
    total: cur.total,
    groups: cur.groups.filter(active).sort(bySpend),
    prev: prevScope && prevPeriod ? { period: prevPeriod, total: prevScope.total, groups: prevScope.groups } : null,
    sections: report.data?.sections || {},
    // the text blocks of the template this report was made with, and only those the client may see; its own metric list, if it had one
    blocks: reportBlocks(report.data).filter((b) => b.client),
    templateMetrics: report.data?.template?.metrics || null,
    creatives: (report.data?.creatives || []).slice(0, report.type === 'monthly' ? 4 : 3),
    kind: report.data?.kind || ctx.kind, // the type the report was made with
    hiddenMetrics: hiddenMetricsOf(report.data), // what the client does not see (the team sees everything)
  };
}

// The metric rows of one report's table: its template's own list, else the standard set + the project's extra columns and formulas.
export function viewKeys(view, model, { all = false } = {}) {
  const keys = metricKeysOf({ metrics: view.templateMetrics }, metricKeys(view.kind || model.kind, model.columns, model.custom), [...model.columns, ...model.custom.map((c) => c.key)]);
  return all ? keys : keys.filter((k) => !(view.hiddenMetrics || []).includes(k));
}

// The name of the compared period: «August» for a month, «previous week» for a week.
export function prevName(view) {
  if (!view.prev) return '';
  if (view.type === 'monthly') return monthName(monthKey(view.prev.period.start));
  return 'previous week';
}

// ---- the KPI cards ----
const KPI_SETS = {
  ecom: [['spend', 'Spent', 'wallet'], ['revenue', 'Revenue', 'coin'], ['roas', 'ROAS', 'roas'], ['purchases', 'Purchases', 'cart'], ['cpp', 'Cost per purchase', 'pct'], ['reach', 'Reach', 'eye']],
  leadgen: [['spend', 'Spent', 'wallet'], ['leads', 'Leads', 'coin'], ['cpl', 'Cost per lead', 'pct'], ['clicks', 'Clicks', 'click'], ['ctr', 'CTR', 'roas'], ['reach', 'Reach', 'eye']],
};
// A metric switched off for the client takes its card with it (`all`: the team's own view).
export function kpiCards(view, { all = false } = {}) {
  return (KPI_SETS[view.kind] || KPI_SETS.ecom).filter(([key]) => all || !(view.hiddenMetrics || []).includes(key)).map(([key, label, icon]) => {
    const info = metricInfo(key);
    const cur = computeMetric(key, view.total);
    const prev = view.prev ? computeMetric(key, view.prev.total) : null;
    return { key, label, icon, value: fmtValue(key, cur, info.format, view.currency), change: change(key, cur, prev, info.goodWhen) };
  });
}

// ---- the table: general numbers + the groups (the top ones by name, the rest folded) ----
const hasValue = (v) => v != null && Number.isFinite(v) && v > 0;
function extreme(list, high) {
  const v = list.filter(hasValue);
  if (v.length < 2) return null;
  return high ? Math.max(...v) : Math.min(...v);
}

// → { columns: [{ id, label, kind }], rows: [{ key, label, cells: [{ text, change, isNew, cls }] }], hidden, folded }
// `showAll`: every group by name. Otherwise the top TOP_GROUPS and one «Other (N groups)» column (its numbers are the sum of the rest, no arrows).
export function metricTable(view, { keys, custom = [], platformLabel = '', showAll = false }) {
  const groups = view.groups;
  const folded = !showAll && groups.length > TOP_GROUPS + 1; // «Other» of a single group would be that group
  const shown = folded ? groups.slice(0, TOP_GROUPS) : groups;
  const rest = folded ? groups.slice(TOP_GROUPS) : [];
  const prevByName = view.prev ? new Map(view.prev.groups.map((g) => [g.name, g])) : null;
  const columns = [{ id: 'general', label: 'General advertising metrics', kind: 'general' }, ...shown.map((g) => ({ id: g.name, label: g.name, kind: 'group' }))];
  const bases = [view.total, ...shown];
  if (rest.length) { columns.push({ id: '__other', label: `Other (${rest.length} groups)`, kind: 'other' }); bases.push(mergeBase(rest)); }
  const prevs = [view.prev ? view.prev.total : null, ...shown.map((g) => (prevByName ? prevByName.get(g.name) || 'new' : null))];
  if (rest.length) prevs.push(null);
  // the best / the weakest group cells (only among the groups shown by name)
  const groupBases = shown;
  const roasOf = (b) => computeMetric('roas', b);
  const best = { roas: extreme(groupBases.map(roasOf), true), cpp: extreme(groupBases.map((b) => computeMetric('cpp', b)), false), ctr: extreme(groupBases.map((b) => computeMetric('ctr', b)), true) };
  const roases = groupBases.map(roasOf).filter(hasValue);
  const worst = roases.length > 2 ? Math.min(...roases) : null;

  const rows = keys.map((key) => {
    const info = metricInfo(key, custom, platformLabel);
    return {
      key, label: info.label,
      cells: bases.map((b, i) => {
        const v = computeMetric(key, b);
        const p = prevs[i];
        const isGroup = columns[i].kind === 'group';
        let cls = '';
        if (isGroup && v != null) {
          if (key === 'roas' && v === best.roas) cls = 'best';
          else if (key === 'roas' && hasValue(v) && v === worst) cls = 'worst';
          else if (key === 'cpp' && v === best.cpp) cls = 'best';
          else if (key === 'ctr' && v === best.ctr) cls = 'best';
        }
        return { text: fmtValue(key, v, info.format, view.currency), change: p && p !== 'new' ? change(key, v, computeMetric(key, p), info.goodWhen) : null, isNew: p === 'new', cls };
      }),
    };
  });
  return { columns, rows, hidden: rest.length, folded, total: groups.length };
}

// ---- charts of a month / a week ----
// Slices of the spend by group: the top ones and «Other».
export function spendSlices(view, top = TOP_GROUPS) {
  const g = view.groups.filter((x) => (Number(x.spend) || 0) > 0);
  const named = g.length > top + 1 ? g.slice(0, top) : g;
  const rest = g.length > top + 1 ? g.slice(top) : [];
  const out = named.map((x) => ({ label: x.name, value: Math.round(Number(x.spend) || 0) }));
  if (rest.length) out.push({ label: `Other (${rest.length} groups)`, value: Math.round(rest.reduce((a, x) => a + (Number(x.spend) || 0), 0)) });
  return out;
}
// ROAS of the groups, best first (the top ones by spend; the rest are not drawn as bars).
export function roasBars(view, top = TOP_GROUPS) {
  return view.groups.filter((x) => (Number(x.spend) || 0) > 0).slice(0, top).map((x) => ({ label: x.name, value: computeMetric('roas', x) })).filter((x) => x.value != null).sort((a, b) => b.value - a.value);
}

// The address a client opens (the token is the only secret in it: long, random, never shown anywhere else).
export const shareUrl = (origin, token) => `${String(origin).replace(/\/+$/, '')}/r/${token}`;

// ---- the «Конструктор звіту»: the report as the layout will make it ----
// A view for the live preview. Without `data` it is the skeleton: the project's groups as columns, every number a dash. With `data` (a fetched
// period: { platforms, previous }) the same view carries real numbers. The text blocks, creatives and hidden metrics always come from the draft layout.
export function builderView({ layout, periodType = 'weekly', kind, groupNames = [], data = null, period = null }) {
  const real = data ? reportView({ id: 0, type: periodType, start: period?.start || '', end: period?.end || '', status: 'final', data: { kind, platforms: data.platforms, previous: data.previous || null } }, { kind }) : null;
  const base = real || { id: 0, type: periodType, start: '', end: '', toDate: false, status: 'final', updatedAt: null, currency: 'USD', total: {}, groups: groupNames.map((name) => ({ name })), prev: null, sections: {}, kind };
  const blocks = (layout.blocks || []).filter((b) => b[periodType === 'monthly' ? 'monthly' : 'weekly']).map((b) => ({ key: b.key, title: b.title, client: b.client !== false }));
  return { ...base, kind, blocks, hiddenMetrics: layout.hiddenMetrics || [], templateMetrics: null, creatives: [], sections: base.sections || {} };
}

// ---- the whole page ----
// payload = get_shared_report(...) → { project, platform, months: [...], history: [...], asOf }
export function buildClientModel(payload) {
  if (!payload) return null;
  const ctx = { kind: payload.project?.kind || 'ecom' };
  const views = (payload.reports || []).map((r) => reportView(r, ctx)).filter(Boolean);
  const kind = views.length ? views[views.length - 1].kind : ctx.kind; // the page follows the type of the newest report
  const hidden = views.length ? views[views.length - 1].hiddenMetrics : [];
  const keys = [...new Set(views.map((v) => monthKey(v.start)))].sort();
  const months = keys.map((key) => {
    const range = monthRange(key);
    const planned = monthWeeks(key);
    const weeks = views.filter((v) => v.type === 'weekly' && monthKey(v.start) === key && v.end <= range.end).sort((a, b) => a.start.localeCompare(b.start))
      .map((v, i) => ({ n: (planned.find((w) => w.start === v.start) || { n: i + 1 }).n, label: rangeText(v.start, v.end), view: v }));
    const monthly = views.find((v) => v.type === 'monthly' && v.start === `${key}-01`) || null;
    const stamps = [...weeks.map((w) => w.view.updatedAt), monthly?.updatedAt].filter(Boolean).sort();
    return {
      key, title: monthTitle(key), name: monthName(key), short: monthShort(key), ...range,
      weeks, monthly, running: Boolean(monthly && monthly.toDate && monthly.status !== 'final'),
      weeksApproved: weeks.length, weeksTotal: planned.length,
      asOf: stamps.length ? stamps[stamps.length - 1].slice(0, 10) : null,
    };
  });
  const history = months.filter((m) => m.monthly).map((m) => {
    const t = m.monthly.total;
    const val = (k) => computeMetric(k, t);
    return { key: m.key, short: m.short, partial: m.running, spend: val('spend'), revenue: val('revenue'), purchases: val('purchases'), leads: val('leads'), ctr: val('ctr'), cpm: val('cpm'), cpa: val('cpp'), cpl: val('cpl'), aov: val('aov'), roas: val('roas'), currency: m.monthly.currency };
  });
  const stamps = months.map((m) => m.asOf).filter(Boolean).sort();
  return { project: payload.project || { name: '' }, platform: payload.platform, kind, hidden, columns: payload.columns || [], custom: payload.custom || [], months, history, asOf: stamps.length ? stamps[stamps.length - 1] : null };
}

// ---- what the agent writes a custom block of the report template from ----
// The report's numbers as plain lines for the model: the total and the top groups, with the change against the previous period.
export function figuresText(data, kind = 'ecom') {
  const cur = scopeOf(data?.platforms);
  if (!cur) return '';
  const prev = data?.previous ? scopeOf(data.previous.platforms) : null;
  const keys = kind === 'leadgen' ? ['spend', 'leads', 'cpl', 'clicks', 'ctr', 'reach'] : ['spend', 'revenue', 'roas', 'purchases', 'cpp', 'aov', 'ctr', 'cpm'];
  const line = (name, base, before) => {
    const parts = keys.map((k) => {
      const v = computeMetric(k, base);
      if (v == null) return null;
      const m = METRICS[k];
      let text = `${m.en || m.label} ${fmtValue(k, v, m.format, cur.currency)}`;
      const c = before ? change(k, v, computeMetric(k, before), m.goodWhen) : null;
      if (c) text += ` (${c.arrow === '▲' ? '+' : c.arrow === '▼' ? '-' : ''}${c.pct})`;
      return text;
    }).filter(Boolean);
    return `${name}: ${parts.join(', ')}`;
  };
  const prevByName = prev ? new Map(prev.groups.map((g) => [g.name, g])) : new Map();
  const groups = cur.groups.filter((g) => (Number(g.spend) || 0) > 0).sort((a, b) => (Number(b.spend) || 0) - (Number(a.spend) || 0)).slice(0, 8);
  return [line('Total', cur.total, prev?.total), ...groups.map((g) => `- ${line(g.name, g, prevByName.get(g.name))}`)].join('\n');
}
