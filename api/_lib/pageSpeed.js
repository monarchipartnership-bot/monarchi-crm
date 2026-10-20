// Google PageSpeed Insights (the public API, read-only) for the website analyst: how fast and how healthy the front page is for a phone
// and for a computer. The key is the environment variable PAGESPEED_API_KEY (never in the page or the chat). fetch and the clock are handed in,
// so scripts/check-core.mjs runs it against a stand-in network. One call takes 10-30 seconds, so it is never part of the quick overview.

const ENDPOINT = 'https://www.googleapis.com/pagespeedonline/v5/runPagespeed';

export const speedKeyFromEnv = (env = process.env) => String(env.PAGESPEED_API_KEY || '').trim();

// [good up to, poor from]: Google's own thresholds for the lab metrics
const METRICS = [
  { key: 'lcp', audit: 'largest-contentful-paint', label: 'Поява головного контенту (LCP)', good: 2500, poor: 4000, unit: 'ms' },
  { key: 'fcp', audit: 'first-contentful-paint', label: 'Перша поява контенту (FCP)', good: 1800, poor: 3000, unit: 'ms' },
  { key: 'tbt', audit: 'total-blocking-time', label: 'Блокування сторінки (TBT)', good: 200, poor: 600, unit: 'ms' },
  { key: 'cls', audit: 'cumulative-layout-shift', label: 'Стрибки верстки (CLS)', good: 0.1, poor: 0.25, unit: '' },
  { key: 'si', audit: 'speed-index', label: 'Індекс швидкості', good: 3400, poor: 5800, unit: 'ms' },
];
const rate = (v, good, poor) => (v <= good ? 'good' : v >= poor ? 'poor' : 'ok');
export const scoreRating = (s) => (s >= 90 ? 'good' : s >= 50 ? 'ok' : 'poor');
const fmtValue = (v, unit) => (unit === 'ms' ? `${(v / 1000).toFixed(1).replace('.', ',')} с` : String(Math.round(v * 1000) / 1000).replace('.', ','));

// the JSON of one PageSpeed run → the figures we show
export function parseSpeed(json) {
  const lh = json?.lighthouseResult;
  if (!lh?.categories) throw new Error('PageSpeed відповів без результатів перевірки.');
  const cat = (id) => (lh.categories[id]?.score == null ? null : Math.round(lh.categories[id].score * 100));
  const scores = { performance: cat('performance'), seo: cat('seo'), accessibility: cat('accessibility'), bestPractices: cat('best-practices') };
  const metrics = METRICS.map((m) => {
    const v = lh.audits?.[m.audit]?.numericValue;
    return v == null ? null : { key: m.key, label: m.label, value: v, display: fmtValue(v, m.unit), rating: rate(v, m.good, m.poor) };
  }).filter(Boolean);
  const opportunities = Object.values(lh.audits || {})
    .filter((a) => a?.details?.type === 'opportunity' && a.details.overallSavingsMs > 300)
    .sort((a, b) => b.details.overallSavingsMs - a.details.overallSavingsMs)
    .slice(0, 5)
    .map((a) => ({ title: String(a.title || '').replace(/\s*\[[^\]]*\]\([^)]*\)/g, '').slice(0, 140), savingsMs: Math.round(a.details.overallSavingsMs) }));
  const field = json.loadingExperience?.overall_category || null; // real visitors' data: only exists for sites with enough visits
  return { scores, metrics, opportunities, field };
}

async function runOne({ url, strategy, key, fetchFn, timeoutMs }) {
  const qs = new URLSearchParams({ url, strategy, key });
  ['performance', 'seo', 'accessibility', 'best-practices'].forEach((c) => qs.append('category', c));
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetchFn(`${ENDPOINT}?${qs}`, { signal: ctl.signal });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = String(json.error?.message || res.status).slice(0, 200);
      const hint = res.status === 429 ? ' Перевищено ліміт запитів, спробуйте пізніше.'
        : res.status === 400 && /key/i.test(msg) ? ' Ключ не підходить: перевірте, що він скопійований повністю.'
          : res.status === 403 ? ' Увімкніть PageSpeed Insights API у Google Cloud і перевірте обмеження ключа (API restrictions): там має бути саме PageSpeed Insights API.' : '';
      throw new Error(`PageSpeed: ${msg}.${hint}`);
    }
    return parseSpeed(json);
  } catch (e) {
    if (e?.name === 'AbortError') throw new Error(`PageSpeed не відповів за ${Math.round(timeoutMs / 1000)} с.`);
    throw e;
  } finally { clearTimeout(timer); }
}

// → { configured, url, mobile, desktop, errors: { mobile?, desktop? }, error?, checkedAt }. Never throws: no key or a failure is a result.
export async function collectSpeed({ url, key, fetchFn = fetch, now = () => new Date(), timeoutMs = 90000 }) {
  const out = { configured: Boolean(key), url, mobile: null, desktop: null, errors: {}, error: null, checkedAt: now().toISOString() };
  if (!key) { out.error = 'Ключ PageSpeed не додано: створіть його в Google Cloud і додайте у Vercel як PAGESPEED_API_KEY.'; return out; }
  const [m, d] = await Promise.allSettled(['mobile', 'desktop'].map((strategy) => runOne({ url, strategy, key, fetchFn, timeoutMs })));
  if (m.status === 'fulfilled') out.mobile = m.value; else out.errors.mobile = m.reason?.message || String(m.reason);
  if (d.status === 'fulfilled') out.desktop = d.value; else out.errors.desktop = d.reason?.message || String(d.reason);
  if (!out.mobile && !out.desktop) out.error = out.errors.mobile || out.errors.desktop;
  return out;
}

// findings and a hand-off for the SEO agent, made in code
export function speedFindings(speed) {
  const out = { findings: [], seo: [] };
  if (!speed) return out;
  if (speed.error) { out.findings.push({ kind: 'error', source: 'speed', text: speed.error }); return out; }
  [['mobile', 'телефона'], ['desktop', 'комп’ютера']].forEach(([k, who]) => {
    const r = speed[k];
    if (!r) return;
    const s = r.scores.performance;
    if (s != null && scoreRating(s) === 'poor') out.findings.push({ kind: 'down', source: 'speed', text: `Швидкість для ${who}: ${s} із 100, це повільно. Повільний сайт гірше в пошуку й втрачає відвідувачів.` });
    else if (s != null && scoreRating(s) === 'ok') out.findings.push({ kind: 'info', source: 'speed', text: `Швидкість для ${who}: ${s} із 100, є що покращити.` });
    else if (s != null) out.findings.push({ kind: 'info', source: 'speed', text: `Швидкість для ${who}: ${s} із 100, усе добре.` });
    if (k === 'mobile') r.opportunities.slice(0, 3).forEach((o) => out.seo.push(`Швидкість (телефон): «${o.title}», можна зекономити близько ${(o.savingsMs / 1000).toFixed(1).replace('.', ',')} с.`));
  });
  return out;
}
