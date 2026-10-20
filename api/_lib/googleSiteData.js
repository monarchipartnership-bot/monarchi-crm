// What the website analyst reads: Google Analytics 4 (the Data API) and Google Search Console (the Search Analytics API) of Monarchi's site.
// Two ways to sign in, both read-only and both with the secret only in the server environment:
//   1. a Google SERVICE ACCOUNT: GOOGLE_SERVICE_ACCOUNT_JSON (plain JSON or base64 of it); its e-mail is a reader in GA4 and Search Console;
//   2. an OAuth refresh token of a person who can see both: GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET, GOOGLE_OAUTH_REFRESH_TOKEN
//      (for organisations that forbid service account keys). The service account wins when both are set. Nothing here ever writes to Google. fetch and the clock are handed in,
// so scripts/check-core.mjs runs all of it against a stand-in network.
//
// Two layers: collectSiteStats() fetches the raw numbers; analyseSite() turns them into figures, changes and findings IN CODE (the model
// only phrases the report afterwards; it never computes). A change is shown only when the volume is big enough to mean something: the
// site has very little search traffic, and "+200%" from 1 click to 3 is noise.
import { createSign } from 'node:crypto';
import { applyExtras, siteExtras } from './siteExtras.js';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SCOPES = ['https://www.googleapis.com/auth/analytics.readonly', 'https://www.googleapis.com/auth/webmasters.readonly'];
const GA4 = 'https://analyticsdata.googleapis.com/v1beta/properties/';
const GSC = 'https://www.googleapis.com/webmasters/v3/sites/';

export const DEFAULT_SITE = { ga4PropertyId: '503944052', gscSiteUrl: 'sc-domain:monarchi.agency' };
export const THRESHOLDS = { minUsers: 30, minClicks: 20, minImpressions: 100, minPageViews: 15 };
// queries that are just people looking for us by name: not a content topic for the strategist
export const BRAND_TERMS = ['monarchi', 'mon archi', "mon'archi", 'archi agency'];
const isBrand = (q) => BRAND_TERMS.some((t) => String(q || '').toLowerCase().includes(t));

// The key from the environment → { client_email, private_key }. Accepts the JSON file as it is, or base64 of it.
export function serviceAccountFromEnv(env = process.env) {
  const raw = String(env.GOOGLE_SERVICE_ACCOUNT_JSON || '').trim();
  if (!raw) throw new Error('Потрібен ключ сервісного акаунта Google: додайте змінну GOOGLE_SERVICE_ACCOUNT_JSON у Vercel (вміст JSON-ключа) і додайте пошту акаунта читачем у GA4 та Search Console.');
  let json = null;
  try { json = JSON.parse(raw); } catch { try { json = JSON.parse(Buffer.from(raw, 'base64').toString('utf8')); } catch { json = null; } }
  if (!json?.client_email || !json?.private_key) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON має невірний формат: потрібен JSON-ключ сервісного акаунта з client_email і private_key.');
  return { client_email: json.client_email, private_key: String(json.private_key).replace(/\\n/g, '\n') };
}

// The sign-in the environment offers → { kind: 'service_account', account } | { kind: 'oauth', clientId, clientSecret, refreshToken }.
export function authFromEnv(env = process.env) {
  if (String(env.GOOGLE_SERVICE_ACCOUNT_JSON || '').trim()) return { kind: 'service_account', account: serviceAccountFromEnv(env) };
  const clientId = String(env.GOOGLE_OAUTH_CLIENT_ID || '').trim();
  const clientSecret = String(env.GOOGLE_OAUTH_CLIENT_SECRET || '').trim();
  const refreshToken = String(env.GOOGLE_OAUTH_REFRESH_TOKEN || '').trim();
  if (clientId && clientSecret && refreshToken) return { kind: 'oauth', clientId, clientSecret, refreshToken };
  throw new Error('Потрібен доступ до Google: додайте у Vercel або ключ сервісного акаунта (GOOGLE_SERVICE_ACCOUNT_JSON), або три змінні GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET, GOOGLE_OAUTH_REFRESH_TOKEN.');
}

const b64u = (x) => Buffer.from(typeof x === 'string' ? x : JSON.stringify(x)).toString('base64url');

// A signed one-hour access token for the scopes above (the standard JWT bearer flow, signed with RS256 by node's crypto: no extra library).
export async function accessToken({ account, auth, fetchFn = fetch, now = () => new Date() }) {
  const a = auth || { kind: 'service_account', account };
  if (a.kind === 'oauth') {
    const res = await fetchFn(TOKEN_URL, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'refresh_token', client_id: a.clientId, client_secret: a.clientSecret, refresh_token: a.refreshToken }) });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json.access_token) throw new Error('Google не видав доступ за токеном оновлення: ' + String(json.error_description || json.error || res.status).slice(0, 200) + (json.error === 'invalid_grant' ? ' Токен прострочений або відкликаний: отримайте новий (якщо застосунок у режимі «Testing», токен живе лише 7 днів: опублікуйте його).' : ''));
    return json.access_token;
  }
  account = a.account;
  const iat = Math.floor(now().getTime() / 1000);
  const claims = { iss: account.client_email, scope: SCOPES.join(' '), aud: TOKEN_URL, iat, exp: iat + 3600 };
  const unsigned = `${b64u({ alg: 'RS256', typ: 'JWT' })}.${b64u(claims)}`;
  const signature = createSign('RSA-SHA256').update(unsigned).sign(account.private_key).toString('base64url');
  const res = await fetchFn(TOKEN_URL, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${unsigned}.${signature}` }) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.access_token) throw new Error('Google не видав доступ: ' + String(json.error_description || json.error || res.status).slice(0, 200));
  return json.access_token;
}

async function post(url, token, body, fetchFn, what) {
  const res = await fetchFn(url, { method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = String(json.error?.message || res.status).slice(0, 240);
    const hint = res.status === 403 ? ' Додайте пошту сервісного акаунта читачем у ' + what + ' і перевірте, що відповідний API увімкнено в Google Cloud.' : '';
    throw new Error(`${what}: ${msg}.${hint}`);
  }
  return json;
}

const iso = (d) => d.toISOString().slice(0, 10);
const addDays = (d, n) => new Date(d.getTime() + n * 86400000);

// The two windows: the last `days` days that Search Console already has (its newest data is ~3 days old) and the same number before them.
export function windows(now = new Date(), days = 28, lag = 3) {
  const end = addDays(now, -lag);
  const start = addDays(end, -(days - 1));
  const prevEnd = addDays(start, -1);
  const prevStart = addDays(prevEnd, -(days - 1));
  return { cur: { start: iso(start), end: iso(end) }, prev: { start: iso(prevStart), end: iso(prevEnd) }, days };
}

const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const GA_METRICS = ['activeUsers', 'sessions', 'screenPageViews', 'engagementRate', 'eventCount', 'keyEvents'];

// GA4 rows with two date ranges carry the range name as the last dimension: → [{ dims: [..], cur: {metric: n}, prev: {...} }]
function ga4Rows(resp, metrics) {
  const dimNames = (resp.dimensionHeaders || []).map((h) => h.name);
  const di = dimNames.indexOf('dateRange');
  const out = new Map();
  (resp.rows || []).forEach((r) => {
    const dv = (r.dimensionValues || []).map((x) => x.value);
    const range = di >= 0 ? dv[di] : 'cur';
    const dims = dv.filter((_, i) => i !== di);
    const key = dims.join('\u0001');
    if (!out.has(key)) out.set(key, { dims, cur: {}, prev: {} });
    const target = out.get(key)[range === 'prev' ? 'prev' : 'cur'];
    metrics.forEach((m, i) => { target[m] = num(r.metricValues?.[i]?.value); });
  });
  return [...out.values()];
}

// → { period, ga4: { total, channels, pages } | null, gsc: { total, queries, pages } | null, errors: { ga4?, gsc? } }
export async function collectSiteStats({ account, auth, config = {}, fetchFn = fetch, now = () => new Date(), days = 28 }) {
  const cfg = { ...DEFAULT_SITE, ...Object.fromEntries(Object.entries(config).filter(([, v]) => v)) };
  const period = windows(now(), days);
  const token = await accessToken({ account, auth, fetchFn, now });
  const errors = {};
  const ranges = [{ startDate: period.cur.start, endDate: period.cur.end, name: 'cur' }, { startDate: period.prev.start, endDate: period.prev.end, name: 'prev' }];
  const ga = (extra) => post(`${GA4}${cfg.ga4PropertyId}:runReport`, token, { dateRanges: ranges, ...extra }, fetchFn, 'GA4');
  const metrics = GA_METRICS.map((name) => ({ name }));
  const soft = (p) => p.catch(() => null); // the extra reports may fail alone: the main figures still count
  const byMetric = (name) => [{ metric: { metricName: name }, desc: true }];
  const [gaRes, gscRes] = await Promise.allSettled([
    Promise.all([
      ga({ metrics }),
      ga({ dimensions: [{ name: 'sessionDefaultChannelGroup' }], metrics: [{ name: 'sessions' }, { name: 'activeUsers' }], orderBys: byMetric('sessions'), limit: 10 }),
      ga({ dimensions: [{ name: 'pagePath' }], metrics: [{ name: 'screenPageViews' }, { name: 'activeUsers' }], orderBys: byMetric('screenPageViews'), limit: 15 }),
      soft(ga({ dimensions: [{ name: 'sessionSource' }, { name: 'sessionMedium' }], metrics: [{ name: 'sessions' }, { name: 'activeUsers' }, { name: 'keyEvents' }], orderBys: byMetric('sessions'), limit: 12 })),
      soft(post(`${GA4}${cfg.ga4PropertyId}:runReport`, token, { dateRanges: [{ startDate: period.prev.start, endDate: period.cur.end }], dimensions: [{ name: 'date' }], metrics: [{ name: 'sessions' }, { name: 'screenPageViews' }], orderBys: [{ dimension: { dimensionName: 'date' } }], limit: 200 }, fetchFn, 'GA4')),
      soft(ga({ dimensions: [{ name: 'country' }], metrics: [{ name: 'activeUsers' }], orderBys: byMetric('activeUsers'), limit: 8 })),
      soft(ga({ dimensions: [{ name: 'deviceCategory' }], metrics: [{ name: 'activeUsers' }], orderBys: byMetric('activeUsers'), limit: 5 })),
    ]),
    Promise.all(['cur', 'prev'].map((r) => post(`${GSC}${encodeURIComponent(cfg.gscSiteUrl)}/searchAnalytics/query`, token, { startDate: period[r].start, endDate: period[r].end }, fetchFn, 'Search Console')))
      .then(async (totals) => {
        const q = (dimensions, limit, win = 'cur') => post(`${GSC}${encodeURIComponent(cfg.gscSiteUrl)}/searchAnalytics/query`, token, { startDate: period[win].start, endDate: period[win].end, dimensions, rowLimit: limit }, fetchFn, 'Search Console');
        const [queries, pages, prevQueries, queryPages] = await Promise.all([q(['query'], 250), q(['page'], 25), soft(q(['query'], 250, 'prev')), soft(q(['query', 'page'], 100))]);
        return { totals, queries, pages, prevQueries, queryPages };
      }),
  ]);

  let ga4 = null;
  if (gaRes.status === 'fulfilled') {
    const [total, channels, pages, sources, daily, countries, devices] = gaRes.value;
    const t = ga4Rows(total, GA_METRICS)[0] || { cur: {}, prev: {} };
    const named = (resp, metrics) => (resp ? ga4Rows(resp, metrics).map((r) => ({ name: r.dims[0] || '(не визначено)', cur: r.cur, prev: r.prev })) : null);
    ga4 = {
      total: { cur: t.cur, prev: t.prev },
      channels: ga4Rows(channels, ['sessions', 'activeUsers']).map((r) => ({ name: r.dims[0] || '(не визначено)', cur: r.cur, prev: r.prev })),
      pages: ga4Rows(pages, ['screenPageViews', 'activeUsers']).map((r) => ({ path: r.dims[0], cur: r.cur, prev: r.prev })),
      sources: sources ? ga4Rows(sources, ['sessions', 'activeUsers', 'keyEvents']).map((r) => ({ name: `${r.dims[0] || '(не визначено)'} / ${r.dims[1] || '(не визначено)'}`, cur: r.cur, prev: r.prev })) : null,
      daily: daily ? ga4Rows(daily, ['sessions', 'screenPageViews']).map((r) => ({ date: r.dims[0], sessions: r.cur.sessions || 0, views: r.cur.screenPageViews || 0 })) : null,
      countries: named(countries, ['activeUsers']),
      devices: named(devices, ['activeUsers']),
    };
  } else errors.ga4 = gaRes.reason?.message || String(gaRes.reason);

  let gsc = null;
  if (gscRes.status === 'fulfilled') {
    const row = (x) => ({ clicks: num(x?.clicks), impressions: num(x?.impressions), ctr: num(x?.ctr), position: num(x?.position) });
    const { totals, queries, pages, prevQueries, queryPages } = gscRes.value;
    gsc = {
      total: { cur: row(totals[0].rows?.[0]), prev: row(totals[1].rows?.[0]) },
      queries: (queries.rows || []).map((r) => ({ query: r.keys?.[0], ...row(r) })),
      pages: (pages.rows || []).map((r) => ({ page: r.keys?.[0], ...row(r) })),
      prevQueries: prevQueries ? (prevQueries.rows || []).map((r) => ({ query: r.keys?.[0], ...row(r) })) : null,
      queryPages: queryPages ? (queryPages.rows || []).map((r) => ({ query: r.keys?.[0], page: r.keys?.[1], ...row(r) })) : null,
    };
  } else errors.gsc = gscRes.reason?.message || String(gscRes.reason);

  if (!ga4 && !gsc) throw new Error(`Не вдалося прочитати ні GA4, ні Search Console. GA4: ${errors.ga4}. Search Console: ${errors.gsc}`);
  return { period, ga4, gsc, errors, config: cfg };
}

// ---- analysis: figures, changes, findings, and what is handed on. Pure.
const pct = (cur, prev) => (prev > 0 ? Math.round(((cur - prev) / prev) * 1000) / 10 : null);
function metric(key, label, cur, prev, min, unit = '') {
  const enough = (cur + prev) / 2 >= min; // the average of the two windows: one lucky window does not make a trend
  return { key, label, cur, prev, delta: enough ? pct(cur, prev) : null, enough, unit };
}
const short = (u) => String(u || '').replace(/^https?:\/\/[^/]+/, '') || '/';

// 56 days (two windows) in weekly buckets, the oldest first: a trend instead of one number.
function weekly(daily, period) {
  const start = Date.parse(`${period.prev.start}T00:00:00Z`);
  const n = Math.round((period.days * 2) / 7);
  const weeks = Array.from({ length: n }, (_, k) => ({ start: iso2(start + k * 7 * 86400000), end: iso2(start + (k * 7 + 6) * 86400000), sessions: 0, views: 0 }));
  daily.forEach((d) => {
    const t = Date.parse(`${d.date.slice(0, 4)}-${d.date.slice(4, 6)}-${d.date.slice(6, 8)}T00:00:00Z`);
    const k = Math.floor((t - start) / (7 * 86400000));
    if (k >= 0 && k < n) { weeks[k].sessions += d.sessions; weeks[k].views += d.views; }
  });
  return weeks;
}
const iso2 = (ms) => new Date(ms).toISOString().slice(0, 10);

// Queries that gained or lost the most against the previous window (our own name excluded: that is not a topic).
function movers(cur, prev) {
  const before = new Map((prev || []).map((q) => [q.query, q]));
  const seen = new Set();
  const rows = [];
  cur.forEach((q) => { seen.add(q.query); const p = before.get(q.query); rows.push({ query: q.query, clicks: q.clicks, impressions: q.impressions, position: Math.round(q.position * 10) / 10, prevClicks: p ? p.clicks : 0, prevImpressions: p ? p.impressions : 0, isNew: !p }); });
  (prev || []).forEach((p) => { if (!seen.has(p.query)) rows.push({ query: p.query, clicks: 0, impressions: 0, position: null, prevClicks: p.clicks, prevImpressions: p.impressions, isNew: false }); });
  const d = (r) => [r.clicks - r.prevClicks, r.impressions - r.prevImpressions];
  const useful = rows.filter((r) => !isBrand(r.query));
  const risers = useful.filter((r) => d(r)[0] > 0 || (d(r)[0] === 0 && d(r)[1] >= 20)).sort((a, b) => d(b)[0] - d(a)[0] || d(b)[1] - d(a)[1]).slice(0, 5);
  const fallers = useful.filter((r) => d(r)[0] < 0 || (d(r)[0] === 0 && d(r)[1] <= -20)).sort((a, b) => d(a)[0] - d(b)[0] || d(a)[1] - d(b)[1]).slice(0, 5);
  return { risers, fallers };
}

export function analyseSite(raw, thresholds = THRESHOLDS) {
  const T = { ...THRESHOLDS, ...thresholds };
  const out = { period: raw.period, ga4: null, gsc: null, findings: [], handoff: { seo: [], strategist: [] }, errors: raw.errors || {} };

  if (raw.ga4) {
    const c = raw.ga4.total.cur;
    const p = raw.ga4.total.prev;
    out.ga4 = {
      metrics: [
        metric('users', 'Активні користувачі', c.activeUsers || 0, p.activeUsers || 0, T.minUsers),
        metric('sessions', 'Сеанси', c.sessions || 0, p.sessions || 0, T.minUsers),
        metric('views', 'Перегляди сторінок', c.screenPageViews || 0, p.screenPageViews || 0, T.minUsers),
        { key: 'engagement', label: 'Частка залучених сеансів', cur: Math.round((c.engagementRate || 0) * 1000) / 10, prev: Math.round((p.engagementRate || 0) * 1000) / 10, delta: null, enough: true, unit: '%' },
        metric('keyEvents', 'Ключові події (конверсії)', c.keyEvents || 0, p.keyEvents || 0, 5),
      ],
      channels: raw.ga4.channels.map((ch) => ({ name: ch.name, sessions: ch.cur.sessions || 0, prevSessions: ch.prev.sessions || 0 })).filter((ch) => ch.sessions || ch.prevSessions),
      pages: raw.ga4.pages.map((pg) => ({ path: pg.path, views: pg.cur.screenPageViews || 0, prevViews: pg.prev.screenPageViews || 0, delta: ((pg.cur.screenPageViews || 0) + (pg.prev.screenPageViews || 0)) / 2 >= T.minPageViews ? pct(pg.cur.screenPageViews || 0, pg.prev.screenPageViews || 0) : null })),
    };
    const total = (list) => list.reduce((s, x) => s + x.users, 0) || 1;
    const share = (list) => list.map((x) => ({ ...x, share: Math.round((x.users / total(list)) * 100) }));
    const usersOf = (list) => (list ? list.map((x) => ({ name: x.name, users: x.cur.activeUsers || 0, prevUsers: x.prev.activeUsers || 0 })).filter((x) => x.users || x.prevUsers) : null);
    out.ga4.sources = raw.ga4.sources ? raw.ga4.sources.map((x) => ({ name: x.name, sessions: x.cur.sessions || 0, prevSessions: x.prev.sessions || 0, users: x.cur.activeUsers || 0, keyEvents: x.cur.keyEvents || 0 })).filter((x) => x.sessions || x.prevSessions) : null;
    out.ga4.weekly = raw.ga4.daily ? weekly(raw.ga4.daily, raw.period) : null;
    out.ga4.countries = usersOf(raw.ga4.countries) && share(usersOf(raw.ga4.countries));
    out.ga4.devices = usersOf(raw.ga4.devices) && share(usersOf(raw.ga4.devices));
    const mobile = out.ga4.devices?.find((d) => d.name === 'mobile');
    if (mobile && c.activeUsers >= T.minUsers) out.findings.push({ kind: 'info', source: 'ga4', text: `З телефонів приходить ${mobile.share}% відвідувачів${mobile.share >= 55 ? ': мобільна версія сайту має бути не гіршою за настільну' : ''}.` });
    const users = out.ga4.metrics[0];
    if (!users.enough) out.findings.push({ kind: 'low', source: 'ga4', text: `Мало даних у GA4: ${users.cur} користувачів за ${raw.period.days} днів (було ${users.prev}). Відсотки змін не показуємо: при таких числах вони випадкові.` });
    else if (users.delta != null && Math.abs(users.delta) >= 15) out.findings.push({ kind: users.delta > 0 ? 'up' : 'down', source: 'ga4', text: `Користувачів ${users.delta > 0 ? 'більше' : 'менше'} на ${Math.abs(users.delta)}%: ${users.cur} проти ${users.prev}.` });
    if ((c.keyEvents || 0) === 0 && (p.keyEvents || 0) === 0) out.findings.push({ kind: 'setup', source: 'ga4', text: 'Ключових подій (конверсій) у GA4 немає: відправка форми на сайті не відстежується, тому не видно, які сторінки й канали приводять заявки.' });
    const top = [...out.ga4.channels].sort((a, b) => b.sessions - a.sessions)[0];
    if (top && users.cur > 0 && c.sessions > 0) out.findings.push({ kind: 'info', source: 'ga4', text: `Головний канал: ${top.name}, ${Math.round((top.sessions / c.sessions) * 100)}% сеансів.` });
    const fell = out.ga4.pages.filter((pg) => pg.delta != null && pg.delta <= -40 && pg.prevViews >= T.minPageViews).slice(0, 5);
    fell.forEach((pg) => out.handoff.seo.push(`Сторінка ${pg.path}: переглядів ${pg.views} проти ${pg.prevViews} (${pg.delta}%). Перевірте title, description і внутрішні посилання.`));
    out.ga4.pages.filter((pg) => pg.views >= T.minPageViews).slice(0, 5).forEach((pg) => out.handoff.strategist.push(`Сторінка ${pg.path} приводить читачів: ${pg.views} переглядів${pg.delta ? ` (${pg.delta > 0 ? '+' : ''}${pg.delta}%)` : ''}.`));
  }

  if (raw.gsc) {
    const c = raw.gsc.total.cur;
    const p = raw.gsc.total.prev;
    out.gsc = {
      metrics: [
        metric('clicks', 'Кліки з пошуку', c.clicks, p.clicks, T.minClicks),
        metric('impressions', 'Покази в пошуку', c.impressions, p.impressions, T.minImpressions),
        { key: 'ctr', label: 'CTR', cur: Math.round(c.ctr * 1000) / 10, prev: Math.round(p.ctr * 1000) / 10, delta: null, enough: true, unit: '%' },
        { key: 'position', label: 'Середня позиція', cur: Math.round(c.position * 10) / 10, prev: Math.round(p.position * 10) / 10, delta: null, enough: true, unit: '' },
      ],
      opportunities: raw.gsc.queries.filter((q) => q.impressions >= Math.max(20, T.minImpressions / 5) && q.ctr < 0.02 && q.position >= 4 && q.position <= 20).sort((a, b) => b.impressions - a.impressions).slice(0, 10)
        .map((q) => ({ query: q.query, impressions: q.impressions, clicks: q.clicks, position: Math.round(q.position * 10) / 10 })),
      topQueries: raw.gsc.queries.slice().sort((a, b) => b.clicks - a.clicks || b.impressions - a.impressions).slice(0, 10).map((q) => ({ query: q.query, clicks: q.clicks, impressions: q.impressions, position: Math.round(q.position * 10) / 10 })),
      pages: raw.gsc.pages.slice(0, 10).map((pg) => ({ page: short(pg.page), clicks: pg.clicks, impressions: pg.impressions, position: Math.round(pg.position * 10) / 10 })),
    };
    out.gsc.movers = raw.gsc.prevQueries ? movers(raw.gsc.queries, raw.gsc.prevQueries) : null;
    out.gsc.queryPages = raw.gsc.queryPages ? raw.gsc.queryPages.filter((q) => !isBrand(q.query)).sort((a, b) => b.impressions - a.impressions).slice(0, 10).map((q) => ({ query: q.query, page: short(q.page), clicks: q.clicks, impressions: q.impressions, position: Math.round(q.position * 10) / 10 })) : null;
    (out.gsc.movers?.fallers || []).filter((q) => q.prevClicks >= 2).slice(0, 3).forEach((q) => out.handoff.seo.push(`Запит «${q.query}» просів: ${q.clicks} кліків проти ${q.prevClicks}, показів ${q.impressions} проти ${q.prevImpressions}. Перевірте сторінку під цей запит.`));
    (out.gsc.movers?.risers || []).filter((q) => q.clicks >= 2 || q.impressions >= 30).slice(0, 3).forEach((q) => out.handoff.strategist.push(`Запит «${q.query}» росте: ${q.clicks} кліків, ${q.impressions} показів (було ${q.prevClicks} і ${q.prevImpressions}). Тема цікавить людей.`));
    const clicks = out.gsc.metrics[0];
    if (!clicks.enough) out.findings.push({ kind: 'low', source: 'gsc', text: `Мало даних у Search Console: ${clicks.cur} кліків за ${raw.period.days} днів (було ${clicks.prev}). Тренд за такими числами не рахуємо.` });
    else if (clicks.delta != null && Math.abs(clicks.delta) >= 15) out.findings.push({ kind: clicks.delta > 0 ? 'up' : 'down', source: 'gsc', text: `Кліків із пошуку ${clicks.delta > 0 ? 'більше' : 'менше'} на ${Math.abs(clicks.delta)}%: ${clicks.cur} проти ${clicks.prev}.` });
    if (out.gsc.opportunities.length) {
      out.findings.push({ kind: 'opportunity', source: 'gsc', text: `Є ${out.gsc.opportunities.length} запитів із показами, але майже без кліків (позиції 4–20): їх можна посилити заголовком, описом і текстом.` });
      out.gsc.opportunities.slice(0, 6).forEach((q) => out.handoff.seo.push(`Запит «${q.query}»: ${q.impressions} показів, ${q.clicks} кліків, позиція ${q.position}. Підсильте сторінку під цей запит.`));
    }
    out.gsc.topQueries.filter((q) => q.impressions >= 10 && !isBrand(q.query)).slice(0, 6).forEach((q) => out.handoff.strategist.push(`Запит «${q.query}»: ${q.clicks} кліків, ${q.impressions} показів. Люди шукають цю тему.`));
  }

  Object.entries(out.errors).forEach(([k, v]) => out.findings.push({ kind: 'error', source: k, text: `${k === 'ga4' ? 'GA4' : 'Search Console'} недоступні: ${v}` }));
  return out;
}

// The agent's main page: is the connection healthy, and the live figures. One read of both services, no model, nothing saved.
// → { status: { configured, auth, ga4: { ok, propertyId, error, hint }, gsc: { ok, siteUrl, error, hint }, error?, warnings: [], checkedAt }, analysis | null }
export async function siteOverview({ config = {}, env = process.env, fetchFn = fetch, now = () => new Date(), db = null, siteUrl = null, extrasFetch = null } = {}) {
  const cfg = { ...DEFAULT_SITE, ...Object.fromEntries(Object.entries(config).filter(([, v]) => v)) };
  const status = { configured: false, auth: null, ga4: { ok: false, propertyId: cfg.ga4PropertyId, error: null }, gsc: { ok: false, siteUrl: cfg.gscSiteUrl, error: null }, error: null, warnings: [], checkedAt: now().toISOString() };
  const extrasP = siteExtras({ db, fetchFn: extrasFetch || fetchFn, now, siteUrl }); // leads and the site check do not need Google
  let auth;
  try {
    auth = authFromEnv(env);
  } catch (e) {
    status.error = e.message;
    return { status, analysis: null, extras: await extrasP };
  }
  status.configured = true;
  status.auth = auth.kind === 'service_account' ? { kind: 'service_account', label: `Сервісний акаунт ${auth.account.client_email}` } : { kind: 'oauth', label: 'Токен облікового запису Google (OAuth)' };
  let raw;
  try {
    raw = await collectSiteStats({ auth, config: cfg, fetchFn, now });
  } catch (e) {
    status.error = e.message;
    return { status, analysis: null, extras: await extrasP };
  }
  status.ga4 = { ...status.ga4, ok: !!raw.ga4, error: raw.errors.ga4 || null };
  status.gsc = { ...status.gsc, ok: !!raw.gsc, error: raw.errors.gsc || null };
  if (raw.ga4 && !(raw.ga4.total.cur.activeUsers > 0) && !(raw.ga4.total.prev.activeUsers > 0)) status.warnings.push('GA4 підключено, але за ці 56 днів у ньому немає жодного користувача: перевірте, чи працює тег на сайті.');
  if (raw.gsc && !(raw.gsc.total.cur.impressions > 0) && !(raw.gsc.total.prev.impressions > 0)) status.warnings.push('Search Console підключено, але показів у пошуку немає: ресурс могли додати нещодавно або вказано не той.');
  const extras = await extrasP;
  return { status, analysis: applyExtras(analyseSite(raw), extras), extras };
}

// The prompt data for the model: the analysed figures only, trimmed.
export const reportInput = (analysis) => JSON.stringify({ period: analysis.period, ga4: analysis.ga4 && { metrics: analysis.ga4.metrics, channels: analysis.ga4.channels.slice(0, 6), sources: analysis.ga4.sources?.slice(0, 6), weekly: analysis.ga4.weekly, devices: analysis.ga4.devices, countries: analysis.ga4.countries?.slice(0, 5), pages: analysis.ga4.pages.slice(0, 8) }, gsc: analysis.gsc && { metrics: analysis.gsc.metrics, opportunities: analysis.gsc.opportunities, topQueries: analysis.gsc.topQueries, movers: analysis.gsc.movers, queryPages: analysis.gsc.queryPages?.slice(0, 6), pages: analysis.gsc.pages }, leads: analysis.extras?.leads && { cur: analysis.extras.leads.cur, prev: analysis.extras.leads.prev, delta: analysis.extras.leads.delta, sources: analysis.extras.leads.sources.slice(0, 5), pages: analysis.extras.leads.pages.slice(0, 5) }, siteCheck: analysis.extras?.uptime && { ok: analysis.extras.uptime.ok, status: analysis.extras.uptime.status, ms: analysis.extras.uptime.ms }, findings: analysis.findings }, null, 1);

// Lines for the strategist's research section.
export const strategistLines = (analysis) => (analysis ? [...analysis.findings.filter((f) => ['up', 'down', 'info', 'low', 'opportunity'].includes(f.kind)).map((f) => f.text), ...analysis.handoff.strategist].slice(0, 8) : []);
