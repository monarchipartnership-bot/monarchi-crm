// The Strategist's skill «monthly_plan» (document, step 5 «Місячний план і події»): the part around the model call. PURE: no network, no model, no clock.
// The document: at the start of the month the plan says what worked and what did not last month, the goals and tasks of the month, which campaigns go on and which are new, and the
// events and holidays (separate creatives that the client approves, tasks for the client with a date). The plan goes to Апрув 3.
// WHO DOES WHAT: the CODE counts the results of the last month (from the cabinet), keeps the budget inside the strategy and the step of a change, gives the dates of the events from a calendar
// and the dates of the tasks; the MODEL only says in words what worked and what did not, and chooses among the campaigns and events it is given.
import { hasEu } from '../../metaAdsWrite.js';
import { PARAMS } from './strategyEngine.js';
import { agg } from './optimizeEngine.js';

const clip = (s, n) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const norm = (s) => String(s || '').toLowerCase().replace(/[«»"“”„'’`]/g, '').replace(/\s+/g, ' ').trim();
const numbersOf = (s) => (String(s || '').match(/\d[\d.,]*\d|\d/g) || []).map((n) => n.replace(/[.,]$/, ''));
const num = (v) => { const x = Number(v); return v !== '' && v != null && Number.isFinite(x) ? x : null; };
const r2 = (x) => Math.round(x * 100) / 100;
const DAY = 864e5;
const ymd = (d) => d.toISOString().slice(0, 10);

// ---------------------------------------------------------------- the months and the calendar of events
// → the month of the plan (the month of `now`) and the month before it, as UTC dates
export function monthWindows(now) {
  const y = now.getUTCFullYear(), m = now.getUTCMonth();
  const from = new Date(Date.UTC(y, m, 1)), to = new Date(Date.UTC(y, m + 1, 0)), prevFrom = new Date(Date.UTC(y, m - 1, 1)), prevTo = new Date(Date.UTC(y, m, 0));
  return { key: ymd(from).slice(0, 7), from, to, prev: { key: ymd(prevFrom).slice(0, 7), since: ymd(prevFrom), until: ymd(prevTo) } };
}
const nth = (y, m, wd, n) => { const first = new Date(Date.UTC(y, m - 1, 1)); return new Date(Date.UTC(y, m - 1, 1 + ((wd - first.getUTCDay() + 7) % 7) + (n - 1) * 7)); };
function easter(y) { const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451), mo = Math.floor((h + l - 7 * m + 114) / 31), da = ((h + l - 7 * m + 114) % 31) + 1; return new Date(Date.UTC(y, mo - 1, da)); }
const blackFriday = (y) => new Date(nth(y, 11, 4, 4).getTime() + DAY);
// well-known dated events by market (US, EU = the countries of the European Union, UA); only dates that do not depend on a guess
export const CALENDAR = [
  { key: 'new_year', name: 'Новий рік', markets: ['US', 'EU', 'UA'], date: (y) => new Date(Date.UTC(y, 0, 1)) },
  { key: 'valentines', name: 'День святого Валентина', markets: ['US', 'EU', 'UA'], date: (y) => new Date(Date.UTC(y, 1, 14)) },
  { key: 'womens_day', name: '8 Березня', markets: ['UA'], date: (y) => new Date(Date.UTC(y, 2, 8)) },
  { key: 'easter', name: 'Великдень (західний)', markets: ['US', 'EU'], date: easter },
  { key: 'mothers_day', name: 'День матері', markets: ['US', 'UA'], date: (y) => nth(y, 5, 0, 2) },
  { key: 'july4', name: 'День незалежності США', markets: ['US'], date: (y) => new Date(Date.UTC(y, 6, 4)) },
  { key: 'halloween', name: 'Гелловін', markets: ['US', 'EU'], date: (y) => new Date(Date.UTC(y, 9, 31)) },
  { key: 'black_friday', name: 'Чорна п’ятниця', markets: ['US', 'EU', 'UA'], date: blackFriday },
  { key: 'cyber_monday', name: 'Кібер-понеділок', markets: ['US', 'EU'], date: (y) => new Date(blackFriday(y).getTime() + 3 * DAY) },
  { key: 'christmas', name: 'Різдво', markets: ['US', 'EU', 'UA'], date: (y) => new Date(Date.UTC(y, 11, 25)) },
];
export function marketsOf(codes = []) {
  const set = new Set();
  for (const c of codes) { const u = String(c).toUpperCase(); if (u === 'US') set.add('US'); if (u === 'UA') set.add('UA'); if (hasEu([u])) set.add('EU'); }
  return set;
}
// the events of the plan month and of the two weeks after it (they are prepared in advance); without known markets every market is meant
export function eventsFor({ geoCodes = [], from, to }) {
  const markets = marketsOf(geoCodes);
  const end = new Date(to.getTime() + 14 * DAY);
  const out = [];
  for (const y of [from.getUTCFullYear(), from.getUTCFullYear() + 1]) {
    for (const e of CALENDAR) {
      if (markets.size && !e.markets.some((m) => markets.has(m))) continue;
      const d = e.date(y);
      if (d >= from && d <= end) out.push({ key: e.key, name: e.name, date: ymd(d) });
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}
// the date of a task for the client: before the event; not in the past
const LEAD = { site: PARAMS.due_days.site, banner: PARAMS.due_days.materials, prices: PARAMS.due_days.materials };
export const dueFor = (kind, eventDate, now) => { const t = new Date(eventDate + 'T00:00:00Z').getTime() - (LEAD[kind] || 7) * DAY; return ymd(new Date(Math.max(t, now.getTime() + 2 * DAY))); };

// ---------------------------------------------------------------- the results of the last month (by code)
export function summarizeLastMonth({ campaignRows = [], adRows = [] }) {
  const group = (rows, key, label) => [...new Set(rows.map((r) => String(r[key] ?? '')))].filter(Boolean).map((id) => { const rs = rows.filter((r) => String(r[key] ?? '') === id); return { id, name: clip(rs[0][label] || id, 90), ...agg(rs) }; });
  const byCampaign = group(campaignRows, 'campaign_id', 'campaign_name').sort((a, b) => b.spend - a.spend);
  const ads = group(adRows, 'ad_id', 'ad_name').filter((a) => a.spend > 0);
  const ranked = ads.filter((a) => a.purchases > 0 && a.roas != null).sort((a, b) => b.roas - a.roas);
  return {
    totals: agg(campaignRows.length ? campaignRows : adRows),
    by_campaign: byCampaign.map(({ id, name, spend, purchases, cpa, roas }) => ({ id, name, spend, purchases, cpa, roas })),
    best_ads: ranked.slice(0, 3).map(({ name, spend, purchases, roas }) => ({ tag: name, spend, purchases, roas })),
    worst_ads: ads.filter((a) => !a.purchases).sort((a, b) => b.spend - a.spend).slice(0, 3).map(({ name, spend }) => ({ tag: name, spend, purchases: 0 })),
  };
}

// ---------------------------------------------------------------- the facts the model may use
export function gatherPlanFacts({ brief, strategy, plan, last, thresholds, optimizer, events, seasonality, openTasks = [], month, rework }) {
  const b = brief?.content || {};
  return {
    month, geo: String(b.general?.geo || '').trim(), currency: plan?.currency || b.economics?.currency || null,
    goal: String(b.general?.goal || '').trim(), products: (b.economics?.products || []).map((p) => p.name).filter(Boolean),
    client_seasonality: clip(seasonality, 700) || null,
    budget: plan ? { monthly: plan.monthly, daily: plan.daily, min_daily: plan.min_daily } : null,
    campaigns: (strategy?.campaigns || []).map((c) => ({ name: c.name, daily_budget: c.daily_budget ?? null, products: c.products || [], segments: c.segments || [] })),
    last_month: last || null, thresholds: thresholds || null,
    optimizer_last: optimizer ? { summary: clip(optimizer.summary, 400), actions: (optimizer.actions || []).slice(0, 8) } : null,
    events: events || [], open_tasks: openTasks.map((t) => clip(t, 120)).slice(0, 12),
    rework: rework || null,
  };
}

export const SYSTEM_PROMPT = `You are the strategist of an advertising agency. You write the PLAN OF THE NEXT MONTH of ONE client after the first month of work (or any later month). You are given only facts: the brief, the strategy with its campaigns and daily budgets, the results of the last month from the ad account (totals, by campaign, the best and the worst ads), the thresholds of the Unit Economy, the last advice of the optimiser, the events of the calendar and the seasonality the client wrote, the open tasks. Work ONLY from this. A source that is null does not exist.
Write:
1. "summary": two or three plain sentences for the client: how the last month went and what we do now.
2. "worked" and "not_worked": up to four short items each: what worked and what did not last month, with the reason from the data. If there is no data (the ads did not run), say so in one item and do not guess.
3. "goals": up to four goals and tasks of the month, each one short sentence.
4. "campaigns": a decision for every campaign of the strategy: "keep", "change" (give a new "daily_budget" inside the step the rules allow) or "stop"; you may propose at most one NEW campaign (decision "new", a name, a "daily_budget", a reason). A new campaign needs the approval of the client, say so in the reason.
5. "events": choose among the events you are given (by their "key"); for each one a short "what" (what we do), at most one "creative_goal" {"goal","product"} (the product from the brief) and up to three "site_tasks" for the client: {"what","kind"} where kind is site, banner or prices. Take only events that fit the client's market and products.
Rules: never invent a number, a date, a price, a result or a promise. A number may appear in a text only if it stands in the input. If "rework" is given, the manager returned the previous plan: "comment" is what to fix, change only that. Do not mention the thresholds as promises. Write all text values in Ukrainian. Answer with ONE JSON object and nothing else (no markdown fence):
{"summary":"","worked":[""],"not_worked":[""],"goals":[""],"campaigns":[{"name":"","decision":"keep|change|stop|new","daily_budget":0,"reason":""}],"events":[{"key":"","what":"","creative_goal":{"goal":"","product":""},"site_tasks":[{"what":"","kind":"site"}]}]}`;

export function buildPlanPrompt({ facts, language = 'uk' }) {
  return { system: SYSTEM_PROMPT, user: ['FACTS BY SOURCE (null = the source does not exist):', JSON.stringify(facts, null, 1), '', `Write the values in ${language === 'en' ? 'English' : 'Ukrainian'}.`].join('\n') };
}

export function parsePlanAnswer(text) {
  const src = String(text || '').replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '');
  const a = src.indexOf('{'), b = src.lastIndexOf('}');
  if (a < 0 || b <= a) throw new Error('Модель відповіла не у форматі JSON: план місяця не прочитано.');
  let o; try { o = JSON.parse(src.slice(a, b + 1)); } catch { throw new Error('Модель повернула пошкоджений JSON: план місяця не прочитано.'); }
  if (!Array.isArray(o.campaigns)) throw new Error('У відповіді моделі немає рішень по кампаніях.');
  return o;
}

// ---------------------------------------------------------------- checking the answer (the code owns the limits)
const DECISIONS = new Set(['keep', 'change', 'stop', 'new']);
export function checkPlan(raw, { facts, now }) {
  const notes = [], warnings = [];
  const corpus = norm(JSON.stringify(facts)), nums = new Set(numbersOf(corpus));
  const stray = (text) => numbersOf(text).filter((n) => n.length > 1 && !nums.has(n));
  const step = PARAMS.budget_step_pct / 100;
  const min = num(facts.budget?.min_daily) ?? 0, cap = num(facts.budget?.daily);
  const known = new Map(facts.campaigns.map((c) => [norm(c.name), c]));

  // campaigns: the current ones keep their names; a change of the budget stays inside the step of the rules
  const camps = [], seen = new Set();
  for (const c of (Array.isArray(raw.campaigns) ? raw.campaigns : []).slice(0, 14)) {
    const decision = DECISIONS.has(c?.decision) ? c.decision : 'keep';
    const name = clip(c?.name, 90);
    if (!name || seen.has(norm(name))) continue;
    const cur = known.get(norm(name));
    if (!cur && decision !== 'new') { notes.push(`Кампанії «${name}» немає в стратегії: рішення про неї відкинуто.`); continue; }
    if (cur) {
      seen.add(norm(name));
      const was = num(cur.daily_budget);
      let to = decision === 'stop' ? 0 : was;
      if (decision === 'change') {
        const asked = num(c.daily_budget);
        if (asked == null || was == null) { to = was; notes.push(`«${name}»: нового бюджету не вказано, лишається ${was}.`); }
        else { const lo = r2(was * (1 - step)), hi = r2(was * (1 + step)); to = Math.min(hi, Math.max(lo, asked)); if (to !== asked) notes.push(`«${name}»: бюджет ${asked} виходить за крок ${PARAMS.budget_step_pct}% від ${was}, взято ${to}.`); if (to < min && to > 0) { to = Math.max(min, to); } }
      }
      camps.push({ name: cur.name, decision, was, daily_budget: to, reason: clip(c.reason, 300), is_new: false, needs_client_approval: false });
    } else {
      if (camps.some((x) => x.is_new)) { notes.push('Нова кампанія лише одна за місяць: решту відкинуто.'); continue; }
      const d = num(c.daily_budget);
      if (d == null || d < min) { notes.push(`Нова кампанія «${name}»: бюджет нижчий за мінімум ${min} або не вказаний, відкинуто.`); continue; }
      seen.add(norm(name));
      camps.push({ name, decision: 'new', was: null, daily_budget: d, reason: clip(c.reason, 300), is_new: true, needs_client_approval: true });
    }
  }
  // the campaigns the model did not mention go on as they are
  for (const [k, c] of known) if (!seen.has(k)) camps.push({ name: c.name, decision: 'keep', was: num(c.daily_budget), daily_budget: num(c.daily_budget), reason: 'Без змін.', is_new: false, needs_client_approval: false });
  if (!camps.length) throw new Error('У плані немає жодної кампанії.');
  const total = r2(camps.reduce((s, c) => s + (c.daily_budget || 0), 0));
  if (cap != null && total > cap * 1.0001) warnings.push(`Сума денних бюджетів плану (${total}) більша за бюджет стратегії на день (${cap}): менеджеру варто це узгодити.`);
  if (camps.some((c) => c.is_new)) warnings.push('У плані нова кампанія: вона йде на погодження клієнта до запуску.');

  // events: only from the calendar; the dates are the calendar's, the dates of the tasks are counted by code
  const evByKey = new Map(facts.events.map((e) => [e.key, e]));
  const products = new Map((facts.products || []).map((p) => [norm(p), p]));
  const events = [];
  for (const e of (Array.isArray(raw.events) ? raw.events : []).slice(0, 6)) {
    const ev = evByKey.get(String(e?.key || ''));
    if (!ev || events.some((x) => x.key === ev.key)) continue;
    const g = e.creative_goal && clip(e.creative_goal.goal, 160) ? { goal: clip(e.creative_goal.goal, 160), product: products.get(norm(e.creative_goal.product)) || '' } : null;
    const site = (Array.isArray(e.site_tasks) ? e.site_tasks : []).slice(0, 3).map((t) => ({ what: clip(t?.what, 160), kind: ['site', 'banner', 'prices'].includes(t?.kind) ? t.kind : 'site' })).filter((t) => t.what).map((t) => ({ ...t, due: dueFor(t.kind, ev.date, now) }));
    events.push({ key: ev.key, name: ev.name, date: ev.date, what: clip(e.what, 240), creative_goal: g, site_tasks: site });
  }
  const summary = clip(raw.summary, 600);
  const list = (x, n) => (Array.isArray(x) ? x : []).map((t) => clip(t, 220)).filter(Boolean).slice(0, n);
  const worked = list(raw.worked, 4), notWorked = list(raw.not_worked, 4), goals = list(raw.goals, 4);
  const bad = [summary, ...worked, ...notWorked, ...goals, ...camps.map((c) => c.reason), ...events.map((e) => e.what), ...events.flatMap((e) => e.site_tasks.map((t) => t.what))].flatMap((t) => stray(t));
  if (bad.length) warnings.push(`У текстах є числа, яких немає у вхідних даних: ${[...new Set(bad)].slice(0, 4).join(', ')}. Менеджеру варто перевірити.`);
  return { summary, worked, not_worked: notWorked, goals, campaigns: camps, events, total_daily: total, notes, warnings };
}

// ---------------------------------------------------------------- the text of the section
const DEC = { keep: 'без змін', change: 'змінити бюджет', stop: 'зупинити', new: 'нова кампанія' };
export function renderPlanText(p) {
  const out = [`План на ${p.month} (версія ${p.version}).`, '', p.summary];
  const lm = p.last_month;
  out.push('', 'Підсумки попереднього місяця');
  if (lm && lm.totals && lm.totals.spend > 0) {
    out.push(`Витрачено ${lm.totals.spend}, покупок ${lm.totals.purchases}${lm.totals.cpa != null ? `, ціна покупки ${lm.totals.cpa}` : ''}${lm.totals.roas != null ? `, ROAS ${lm.totals.roas}` : ''} (${lm.period}).`);
    for (const c of lm.by_campaign.slice(0, 6)) out.push(`• ${c.name}: витрачено ${c.spend}, покупок ${c.purchases}${c.roas != null ? `, ROAS ${c.roas}` : ''}`);
  } else out.push('Реклама в минулому місяці не працювала або даних немає.');
  if (p.worked.length) { out.push('', 'Що спрацювало'); p.worked.forEach((t) => out.push(`• ${t}`)); }
  if (p.not_worked.length) { out.push('', 'Що не спрацювало'); p.not_worked.forEach((t) => out.push(`• ${t}`)); }
  if (p.goals.length) { out.push('', 'Цілі й задачі на місяць'); p.goals.forEach((t) => out.push(`• ${t}`)); }
  out.push('', 'Кампанії');
  for (const c of p.campaigns) out.push(`• ${c.name}: ${DEC[c.decision]}${c.daily_budget != null ? `, на день ${c.daily_budget}${c.was != null && c.was !== c.daily_budget ? ` (було ${c.was})` : ''}` : ''}${c.needs_client_approval ? ' [потрібне погодження клієнта]' : ''}. ${c.reason}`.trim());
  if (p.events.length) {
    out.push('', 'Події і свята');
    for (const e of p.events) {
      out.push(`• ${e.name}, ${e.date}: ${e.what}`);
      if (e.creative_goal) out.push(`   Креатив: ${e.creative_goal.goal}${e.creative_goal.product ? ` (${e.creative_goal.product})` : ''}`);
      for (const t of e.site_tasks) out.push(`   Клієнту до ${t.due}: ${t.what}`);
    }
  }
  if (p.warnings.length) { out.push('', 'Увага'); p.warnings.forEach((w) => out.push(`• ${w}`)); }
  if (p.notes.length) { out.push('', 'Примітки'); p.notes.forEach((w) => out.push(`• ${w}`)); }
  return out.join('\n');
}
