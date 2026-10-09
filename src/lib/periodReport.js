import { authedPost } from './adAccounts.js';
import { BASE_FIELDS, METRICS, computeMetric, metricMeta, deltaPct, deltaTone, sumBase } from './reportMetrics.js';
import { computeWeeksForMonth, daysInMonth, isoDate, MONTH_NAMES } from './dateHelpers.js';

const iso = (d) => isoDate(d.getFullYear(), d.getMonth() + 1, d.getDate());
const ZERO = Object.fromEntries(BASE_FIELDS.map((f) => [f, 0]));

// ----- Periods ---------------------------------------------------------------
// Weekly = a Monday-start week clipped to its month, numbered within the month
// (the same weeks the report pickers and the managers' sheets use). Monthly = a
// whole calendar month.

// picker: { year, month, weekIndex }
export function periodFromPicker(periodType, picker) {
  const { year, month } = picker;
  if (periodType === 'monthly') {
    return { start: isoDate(year, month, 1), end: isoDate(year, month, daysInMonth(year, month)), label: `${MONTH_NAMES[month - 1]} ${year}` };
  }
  const weeks = computeWeeksForMonth(year, month);
  const w = weeks.find((x) => x.index === picker.weekIndex) || weeks[0];
  return { start: iso(w.start), end: iso(w.end), label: `Тиждень ${w.index} · ${MONTH_NAMES[month - 1]} ${year}` };
}

// The period right before the picked one (for the comparison column).
export function previousPicker(periodType, picker) {
  const { year, month } = picker;
  const prevMonth = month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };
  if (periodType === 'monthly') return prevMonth;
  if (picker.weekIndex > 1) return { year, month, weekIndex: picker.weekIndex - 1 };
  const weeks = computeWeeksForMonth(prevMonth.year, prevMonth.month);
  return { ...prevMonth, weekIndex: weeks.length };
}

// ----- Fetching --------------------------------------------------------------
function metaRow(r) {
  return {
    spend: r.spend || 0, impressions: r.impressions || 0, reach: r.reach || 0, clicks: r.clicks || 0,
    purchases: r.purchases || 0, leads: r.leads || 0, revenue: r.revenue || 0,
  };
}

// Google has one "conversions" number: sales for an e-commerce project, leads for a lead-gen one.
function googleRow(r, kind) {
  const conv = r.conversions || 0;
  return {
    spend: r.spend || 0, impressions: r.impressions || 0, reach: null, clicks: r.clicks || 0,
    purchases: kind === 'leadgen' ? 0 : conv, leads: kind === 'leadgen' ? conv : 0, revenue: r.revenue || 0,
  };
}

// One platform account for a date range: account totals + per-campaign rows.
// `post(path, body)` is how the platforms are called: the signed-in browser call by default, the server passes its own.
export async function fetchPlatformRange(platform, accountId, from, to, kind, post = authedPost) {
  if (platform === 'meta') {
    const range = { since: from, until: to };
    const [acc, camp] = await Promise.all([
      post('/api/meta-ads-insights', { accountId, level: 'account', timeRange: range }),
      post('/api/meta-ads-insights', { accountId, level: 'campaign', timeRange: range }),
    ]);
    return {
      total: acc.rows?.[0] ? metaRow(acc.rows[0]) : { ...ZERO },
      campaigns: (camp.rows || []).map((r) => ({ name: r.name || '—', ...metaRow(r) })),
    };
  }
  if (platform === 'google') {
    const [acc, camp] = await Promise.all([
      post('/api/google-ads-accounts', { action: 'insights', customerId: accountId, from, to }),
      post('/api/google-ads-accounts', { action: 'insights', customerId: accountId, from, to, level: 'campaign' }),
    ]);
    return {
      total: acc.row ? googleRow(acc.row, kind) : { ...ZERO },
      campaigns: (camp.campaigns || []).map((r) => ({ name: r.name || '—', ...googleRow(r, kind) })),
    };
  }
  return { total: { ...ZERO }, campaigns: [] };
}

// Bundles campaigns into the project's report columns by keywords in their
// names; whatever matches nothing goes to "Інше". No groups defined → no bundles.
export function groupCampaigns(campaigns, groups) {
  if (!groups?.length) return [];
  const buckets = groups.map((g) => ({ name: g.name, rows: [] }));
  const rest = [];
  campaigns.forEach((c) => {
    const lname = (c.name || '').toLowerCase();
    const i = groups.findIndex((g) => (g.keywords || []).some((k) => k && lname.includes(String(k).trim().toLowerCase())));
    (i >= 0 ? buckets[i].rows : rest).push(c);
  });
  const out = buckets.filter((b) => b.rows.length).map((b) => ({ name: b.name, ...sumBase(b.rows), campaignCount: b.rows.length }));
  if (rest.length) out.push({ name: 'Інше', ...sumBase(rest), campaignCount: rest.length });
  return out;
}

// All linked accounts of a project for one date range. `accounts` are
// project_ad_accounts rows. A platform that fails is reported in `errors`, the
// others still come back.
export async function fetchProjectRange(accounts, from, to, kind, groups, post = authedPost) {
  const platforms = {};
  const errors = {};
  const settled = await Promise.allSettled(accounts.map((a) => fetchPlatformRange(a.platform, a.account_id, from, to, kind, post)));
  settled.forEach((res, i) => {
    const a = accounts[i];
    if (res.status === 'fulfilled') {
      platforms[a.platform] = { currency: a.currency, accountName: a.account_name, ...res.value, groups: groupCampaigns(res.value.campaigns, groups) };
    } else {
      errors[a.platform] = res.reason?.message || 'Не вдалося отримати дані.';
    }
  });
  return { platforms, errors };
}

// "Разом": platforms added up. Only meaningful when they share one currency;
// reach is a plain sum here, so people reached by both are counted twice.
export function combinePlatforms(platforms) {
  const keys = Object.keys(platforms);
  const currencies = new Set(keys.map((k) => platforms[k].currency));
  if (keys.length < 2 || currencies.size !== 1) return null;
  return { currency: [...currencies][0], total: sumBase(keys.map((k) => platforms[k].total)) };
}

// ----- Table model -----------------------------------------------------------
// Rows for the metrics table: one row per metric with value, previous value,
// change and how to colour the change.
export function metricRows(keys, cur, prev, custom, currency) {
  return keys.map((key) => {
    const m = metricMeta(key, custom);
    const value = cur ? computeMetric(key, cur, custom) : null;
    const before = prev ? computeMetric(key, prev, custom) : null;
    const delta = deltaPct(value, before);
    return { key, label: m.label, en: m.en, format: m.format, currency, value, before, delta, tone: deltaTone(delta, m.goodWhen) };
  });
}

// Which metric keys to show: the project type's default set, plus all of the
// project's custom metrics at the end.
export function visibleKeys(defaults, custom) {
  return [...defaults.filter((k) => METRICS[k]), ...custom.map((c) => c.key)];
}

// Re-bundles already fetched campaigns after the project's groups changed, so
// the tables update without asking the platforms again.
export function regroupData(data, groups) {
  const regroup = (platforms) => Object.fromEntries(Object.entries(platforms || {}).map(([k, p]) => [k, { ...p, groups: groupCampaigns(p.campaigns || [], groups) }]));
  return { ...data, platforms: regroup(data.platforms), previous: data.previous ? { ...data.previous, platforms: regroup(data.previous.platforms) } : data.previous };
}

// Whole days in an ISO range, both ends included.
export function daysInRange(startIso, endIso) {
  const [ay, am, ad] = startIso.split('-').map(Number);
  const [by, bm, bd] = endIso.split('-').map(Number);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86400000) + 1;
}

// The period right before `startIso`, as long as `days` (for "previous N days" comparison).
export function precedingDays(startIso, days) {
  const [y, m, d] = startIso.split('-').map(Number);
  const end = new Date(Date.UTC(y, m - 1, d - 1));
  const start = new Date(Date.UTC(y, m - 1, d - days));
  const f = (x) => `${x.getUTCFullYear()}-${String(x.getUTCMonth() + 1).padStart(2, '0')}-${String(x.getUTCDate()).padStart(2, '0')}`;
  return { start: f(start), end: f(end) };
}

// The latest report week (Monday-start, clipped to its month) that has already
// ended by `todayIso` — what a weekly report is due for.
export function lastCompletedWeek(todayIso) {
  const [y, m] = todayIso.split('-').map(Number);
  const pick = (year, month) => computeWeeksForMonth(year, month)
    .map((w) => ({ start: iso(w.start), end: iso(w.end) }))
    .filter((w) => w.end < todayIso);
  const here = pick(y, m);
  if (here.length) return here[here.length - 1];
  const prev = m === 1 ? pick(y - 1, 12) : pick(y, m - 1);
  return prev[prev.length - 1];
}
