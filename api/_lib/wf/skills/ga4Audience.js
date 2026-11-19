// What the Researcher's skill «audience» reads from the CLIENT's Google Analytics 4 (document 1.3): who visits the site (age, gender, country, city,
// device, new and returning, channels) and how people walk to a purchase (view item → cart → checkout → purchase). Read only, last 90 days.
// Age and gender exist only if demographics are switched on in the client's GA4: the collector CHECKS and says so; the client is not asked.
// ga4 = { runReport({ propertyId, body }) }. A report that fails is listed in errors; the rest is kept.
import { cleanPropertyId } from '../../ga4Client.js';

const METRICS = ['activeUsers', 'sessions', 'ecommercePurchases', 'purchaseRevenue'];
const REPORTS = { age: 'userAgeBracket', gender: 'userGender', country: 'country', city: 'city', device: 'deviceCategory', visitor: 'newVsReturning', channel: 'sessionDefaultChannelGroup' };
const FUNNEL_EVENTS = ['view_item', 'add_to_cart', 'begin_checkout', 'add_payment_info', 'purchase'];
const UNKNOWN = /^(unknown|\(not set\)|\(other\)|не визначено|)$/i;
const iso = (d) => d.toISOString().slice(0, 10);
const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const r1 = (x) => Math.round(x * 1000) / 1000;

export function windowFor(now, days = 90) { const end = new Date(now.getTime() - 864e5); return { start: iso(new Date(end.getTime() - (days - 1) * 864e5)), end: iso(end) }; }

// one report response → [{ key, users, sessions, purchases, revenue, share }] biggest first; share = of the users that have a known value
export function parseReport(resp) {
  const rows = (resp?.rows || []).map((r) => ({ key: String(r.dimensionValues?.[0]?.value ?? ''), users: num(r.metricValues?.[0]?.value), sessions: num(r.metricValues?.[1]?.value), purchases: num(r.metricValues?.[2]?.value), revenue: r1(num(r.metricValues?.[3]?.value)) }));
  const known = rows.filter((r) => !UNKNOWN.test(r.key));
  const total = known.reduce((s, r) => s + r.users, 0);
  return { rows: known.sort((a, b) => b.users - a.users).map((r) => ({ ...r, share: total > 0 ? r1(r.users / total) : 0 })), unknown_users: rows.filter((r) => UNKNOWN.test(r.key)).reduce((s, r) => s + r.users, 0), known_users: total };
}

export async function collectGa4Audience(ga4, propertyRaw, now = new Date()) {
  const propertyId = cleanPropertyId(propertyRaw);
  const window = windowFor(now);
  const out = { property: propertyId, window, demographics: false, reports: {}, funnel: null, errors: [] };
  const base = { dateRanges: [{ startDate: window.start, endDate: window.end }] };
  const run = async (label, body) => { try { return await ga4.runReport({ propertyId, body: { ...base, ...body } }); } catch (e) { out.errors.push(`${label}: ${String(e?.message || e).slice(0, 200)}`); return null; } };
  for (const [name, dim] of Object.entries(REPORTS)) {
    const resp = await run(name, { dimensions: [{ name: dim }], metrics: METRICS.map((m) => ({ name: m })), orderBys: [{ metric: { metricName: 'activeUsers' }, desc: true }], limit: name === 'city' ? 12 : 10 });
    if (resp) out.reports[name] = parseReport(resp);
  }
  out.demographics = !!(out.reports.age?.known_users > 0 || out.reports.gender?.known_users > 0);
  const f = await run('воронка', { dimensions: [{ name: 'eventName' }], metrics: [{ name: 'eventCount' }], dimensionFilter: { filter: { fieldName: 'eventName', inListFilter: { values: FUNNEL_EVENTS } } }, limit: 10 });
  if (f) {
    const by = Object.fromEntries((f.rows || []).map((r) => [r.dimensionValues?.[0]?.value, num(r.metricValues?.[0]?.value)]));
    out.funnel = FUNNEL_EVENTS.filter((e) => by[e] > 0).map((e) => ({ event: e, count: by[e] }));
    if (!out.funnel.length) out.funnel = null;
  }
  return out;
}
