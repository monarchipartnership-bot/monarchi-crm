// What the website analyst reads that is NOT from Google: the leads the site's form brought into the CRM (the log site_leads) and a plain
// check that the site opens. Both work without any new access, and neither depends on Google being connected.
// The database and fetch are handed in, so scripts/check-core.mjs runs all of it against stand-ins. Nothing here writes anywhere.

const DAY = 86400000;
const iso = (d) => d.toISOString().slice(0, 10);
const pct = (cur, prev) => (prev > 0 ? Math.round(((cur - prev) / prev) * 1000) / 10 : null);

// Leads are not delayed like Search Console, so the window ends today: the last `days` days and the same number before them.
export function leadWindows(now = new Date(), days = 28) {
  const curStart = new Date(now.getTime() - (days - 1) * DAY);
  const prevEnd = new Date(curStart.getTime() - DAY);
  const prevStart = new Date(prevEnd.getTime() - (days - 1) * DAY);
  return { cur: { start: iso(curStart), end: iso(now) }, prev: { start: iso(prevStart), end: iso(prevEnd) }, days };
}

const pathOf = (url) => {
  if (!url) return '(невідомо)';
  try { const u = new URL(url); return u.pathname || '/'; } catch { return String(url).slice(0, 80); }
};
const hostOf = (url) => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; } };

// Where a lead came from: the utm source (and medium) of the link, else the site it came from, else nothing is known.
export function leadSource(row) {
  const utm = row.utm && typeof row.utm === 'object' ? row.utm : {};
  if (utm.utm_source) return utm.utm_medium ? `${utm.utm_source} / ${utm.utm_medium}` : String(utm.utm_source);
  const host = hostOf(row.referrer);
  return host || 'без джерела (прямий візит)';
}

function tally(rows, keyOf, limit) {
  const m = new Map();
  rows.forEach((r) => { const k = keyOf(r); m.set(k, (m.get(k) || 0) + 1); });
  return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit);
}

// rows of site_leads (received_at, status, page_url, referrer, utm, deal_id) → figures
export function analyseLeads(rows, w) {
  const inCur = (r) => String(r.received_at).slice(0, 10) >= w.cur.start;
  const part = (list) => ({
    leads: list.filter((r) => r.status === 'new').length,
    duplicates: list.filter((r) => r.status === 'duplicate').length,
    spam: list.filter((r) => r.status === 'spam').length,
    deals: list.filter((r) => r.status === 'new' && r.deal_id).length,
  });
  const cur = rows.filter(inCur);
  const prev = rows.filter((r) => !inCur(r));
  const real = cur.filter((r) => r.status === 'new');
  const realPrev = prev.filter((r) => r.status === 'new');
  const c = part(cur);
  const p = part(prev);
  const enough = (c.leads + p.leads) / 2 >= 5; // a percentage of 2 leads against 1 means nothing
  const prevCount = (key, keyOf) => realPrev.filter((r) => keyOf(r) === key).length;
  return {
    period: w,
    cur: c,
    prev: p,
    delta: enough ? pct(c.leads, p.leads) : null,
    enough,
    sources: tally(real, leadSource, 8).map(([name, count]) => ({ name, count, prevCount: prevCount(name, leadSource) })),
    pages: tally(real, (r) => pathOf(r.page_url), 8).map(([path, count]) => ({ path, count })),
    campaigns: tally(real.filter((r) => r.utm?.utm_campaign), (r) => r.utm.utm_campaign, 6).map(([name, count]) => ({ name, count })),
  };
}

export async function collectLeads({ db, now = () => new Date(), days = 28 }) {
  const w = leadWindows(now(), days);
  const res = await db.from('site_leads').select('received_at, status, page_url, referrer, utm, deal_id').gte('received_at', `${w.prev.start}T00:00:00Z`).order('received_at', { ascending: false }).limit(5000);
  if (res.error) throw new Error(/site_leads/.test(res.error.message || '') ? 'Журнал заявок із сайту (site_leads) недоступний: перевірте міграцію форми сайту.' : `Не вдалося прочитати заявки: ${res.error.message}`);
  return analyseLeads(res.data || [], w);
}

// One plain visit of the site's front page: does it answer, with what code, how fast.
export async function checkUptime({ url, fetchFn = fetch, now = () => new Date(), timeoutMs = 10000 }) {
  const out = { url, ok: false, status: null, ms: null, slow: false, error: null, checkedAt: now().toISOString() };
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  const t0 = Date.now();
  try {
    const res = await fetchFn(url, { method: 'GET', redirect: 'follow', signal: ctl.signal, headers: { 'User-Agent': 'MonarchiSiteCheck/1.0' } });
    out.status = res.status;
    out.ok = res.status >= 200 && res.status < 400;
    out.ms = Date.now() - t0;
    out.slow = out.ms > 3000;
    if (!out.ok) out.error = `Сайт відповів кодом ${res.status}.`;
  } catch (e) {
    out.error = e?.name === 'AbortError' ? `Сайт не відповів за ${Math.round(timeoutMs / 1000)} с.` : `Сайт недоступний: ${String(e?.message || e).slice(0, 120)}`;
  } finally { clearTimeout(timer); }
  return out;
}

export async function siteUrlOf(db) {
  try { return String((await db.from('smm_settings').select('site_url').eq('id', 1).maybeSingle()).data?.site_url || '').trim() || 'https://www.monarchi.agency'; } catch { return 'https://www.monarchi.agency'; }
}

// → { leads, leadsError, uptime, findings, handoff: { strategist } }. Never throws: each part fails alone.
export async function siteExtras({ db, fetchFn = fetch, now = () => new Date(), siteUrl } = {}) {
  const out = { leads: null, leadsError: null, uptime: null, findings: [], handoff: { strategist: [] } };
  if (db) {
    try { out.leads = await collectLeads({ db, now }); } catch (e) { out.leadsError = e.message; }
  }
  const url = siteUrl || (db ? await siteUrlOf(db) : 'https://www.monarchi.agency');
  out.uptime = await checkUptime({ url, fetchFn, now });

  const L = out.leads;
  if (L) {
    if (L.cur.leads === 0 && L.prev.leads === 0) out.findings.push({ kind: 'info', source: 'crm', text: `Заявок із форми сайту за ${L.period.days} днів немає (і в попередні ${L.period.days} теж).` });
    else {
      const trend = L.delta != null ? ` Це ${L.delta > 0 ? 'більше' : L.delta < 0 ? 'менше' : 'стільки ж'}${L.delta ? ` на ${Math.abs(L.delta)}%` : ''}: було ${L.prev.leads}.` : ` Було ${L.prev.leads}; при такій кількості відсотки змін не рахуємо.`;
      out.findings.push({ kind: L.delta != null && L.delta > 0 ? 'up' : L.delta != null && L.delta < 0 ? 'down' : 'info', source: 'crm', text: `Заявок із форми сайту за ${L.period.days} днів: ${L.cur.leads}.${trend}` });
      if (L.sources[0]) out.findings.push({ kind: 'info', source: 'crm', text: `Найбільше заявок дає джерело «${L.sources[0].name}»: ${L.sources[0].count} із ${L.cur.leads}.` });
      if (L.pages[0]) out.handoff.strategist.push(`Найбільше заявок приходить зі сторінки ${L.pages[0].path}: ${L.pages[0].count} із ${L.cur.leads}.`);
    }
    if (L.cur.spam > 0 && L.cur.spam >= L.cur.leads) out.findings.push({ kind: 'info', source: 'crm', text: `Спаму в формі за ${L.period.days} днів: ${L.cur.spam}, не менше, ніж справжніх заявок. Він відсіюється й у заявки не потрапляє.` });
  } else if (out.leadsError) out.findings.push({ kind: 'error', source: 'crm', text: out.leadsError });

  const U = out.uptime;
  if (!U.ok) out.findings.push({ kind: 'error', source: 'site', text: `${U.error} Адреса: ${U.url}.` });
  else if (U.slow) out.findings.push({ kind: 'down', source: 'site', text: `Головна сторінка сайту відкрилась за ${(U.ms / 1000).toFixed(1)} с: це повільно (норма до 3 с). Повільний сайт гірше в пошуку.` });
  return out;
}

// Puts the extras into an analysis: their findings and hand-off lines join the others, and a conversion that is counted in the CRM
// replaces the «form is not tracked in GA4» note (it would be misleading once the leads are known).
export function applyExtras(analysis, extras) {
  if (!analysis || !extras) return analysis;
  analysis.extras = { leads: extras.leads, leadsError: extras.leadsError, uptime: extras.uptime };
  const L = extras.leads;
  if (L && (L.cur.leads > 0 || L.prev.leads > 0)) {
    analysis.findings = analysis.findings.filter((f) => !(f.kind === 'setup' && f.source === 'ga4'));
    analysis.findings.push({ kind: 'info', source: 'ga4', text: `У GA4 відправка форми не фіксується як подія, тому заявки рахуємо з CRM (${L.cur.leads} за ${L.period.days} днів).` });
  }
  analysis.findings.push(...extras.findings);
  analysis.handoff.strategist.push(...extras.handoff.strategist);
  return analysis;
}
