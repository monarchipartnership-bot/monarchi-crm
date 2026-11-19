// The numbers of the audit of a Meta account (step A4; document 1.2; structure from the audit of Lelior, see docs/strategy-references-digest.md, section 1).
// PURE: rows from Meta in, a structured result out. No network, no model: the same data always gives the same audit, and every sentence has its number.
// Judgement is against the thresholds of the Unit Economy (break-even and target ROAS). Where the sample is too small the audit says «мало даних», it does not guess.

export const OK_OBJECTIVES = new Set(['OUTCOME_SALES', 'CONVERSIONS', 'PRODUCT_CATALOG_SALES']);
const r2 = (x) => Math.round(x * 100) / 100;
const r0 = (x) => Math.round(x);
const sum = (rows, k) => rows.reduce((s, r) => s + (Number(r[k]) || 0), 0);
const money = (x, c = 'USD') => `${c === 'USD' ? '$' : ''}${Math.round(x).toLocaleString('en-US')}${c === 'USD' ? '' : ' ' + c}`;
const pct = (x) => `${r0(x * 100)}%`;

export function resultKindOf(rows) {
  if (sum(rows, 'purchases') > 0) return 'purchases';
  if (sum(rows, 'leads') > 0) return 'leads';
  if (sum(rows, 'messages') > 0) return 'messages';
  return 'none';
}
const RESULT_WORD = { purchases: 'покупок', leads: 'лідів', messages: 'звернень', none: 'результатів' };
const resultsOf = (rows, kind) => (kind === 'none' ? 0 : sum(rows, kind));

// A line of numbers from rows of the same kind.
export function agg(rows, kind) {
  const spend = r2(sum(rows, 'spend'));
  const results = resultsOf(rows, kind);
  const revenue = r2(sum(rows, 'revenue'));
  return { spend, impressions: sum(rows, 'impressions'), clicks: sum(rows, 'clicks'), results, revenue, roas: spend > 0 && revenue > 0 ? r2(revenue / spend) : null, cpr: results > 0 ? r2(spend / results) : null, aov: kind === 'purchases' && results > 0 && revenue > 0 ? r2(revenue / results) : null };
}

// good = at or above the target, ok = between break-even and target, bad = below break-even, few = too little spend to judge, none = nothing to compare with
export function verdictOf(line, th, minSpend, kind = 'purchases') {
  if (line.spend < minSpend) return 'few';
  if (!th || kind !== 'purchases') return 'none'; // the judgement is by ROAS, so it needs the thresholds and sales
  if (line.roas == null) return 'bad'; // enough was spent and nothing came back
  if (line.roas >= th.target_roas) return 'good';
  if (line.roas >= th.breakeven_roas) return 'ok';
  return 'bad';
}

const monthKey = (row) => String(row.period?.from_date || '').slice(0, 7);

export function monthsOf(monthlyRows, kind, th, minSpend) {
  return monthlyRows.filter((r) => monthKey(r)).map((r) => { const l = agg([r], kind); return { month: monthKey(r), ...l, verdict: verdictOf(l, th, minSpend, kind) }; }).sort((a, b) => a.month.localeCompare(b.month));
}
export function yearsOf(months) {
  const by = new Map();
  for (const m of months) { const y = m.month.slice(0, 4); if (!by.has(y)) by.set(y, []); by.get(y).push(m); }
  return [...by.entries()].map(([year, ms]) => {
    const spend = r2(sum(ms, 'spend')), results = sum(ms, 'results'), revenue = r2(sum(ms, 'revenue'));
    return { year, months: ms.filter((m) => m.spend > 0).length, spend, results, revenue, roas: spend > 0 && revenue > 0 ? r2(revenue / spend) : null, cpr: results > 0 ? r2(spend / results) : null, aov: results > 0 && revenue > 0 ? r2(revenue / results) : null };
  });
}

// The last 90 days with delivery: ends on the last day of the last month that has spend (or the last day with data), starts 89 days before.
export function windowOf(monthlyRows) {
  const spending = monthlyRows.filter((r) => Number(r.spend) > 0 && r.period?.to_date).sort((a, b) => String(a.period.to_date).localeCompare(String(b.period.to_date)));
  if (!spending.length) return null;
  const until = spending[spending.length - 1].period.to_date;
  const d = new Date(until + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() - 89);
  return { since: d.toISOString().slice(0, 10), until };
}

// Best and worst of a list that spent enough to be judged. With thresholds: «best» = at or above break-even, «worst» = below it (so an ad is never in both).
// Without them: by ROAS when there are sales, otherwise by the cost of a result (no result = the worst); the two lists never share an item.
const rank = (lines, n, minSpend, dir, hasTh = false) => {
  const judged = lines.filter((l) => l.spend >= minSpend);
  const byRoas = judged.some((l) => l.roas != null);
  const score = byRoas ? (l) => l.roas ?? -1 : (l) => (l.cpr == null ? -1e12 : -l.cpr); // higher = better
  const sorted = [...judged].sort((a, b) => score(b) - score(a) || b.spend - a.spend); // best first
  if (hasTh && byRoas) return (dir === 'best' ? sorted.filter((l) => l.verdict === 'good' || l.verdict === 'ok') : sorted.filter((l) => l.verdict === 'bad').reverse()).slice(0, n);
  const top = sorted.slice(0, Math.min(n, Math.floor(sorted.length / 2)));
  return dir === 'best' ? top : sorted.slice(top.length).reverse().slice(0, n);
};
const lineOf = (row, kind, th, minSpend, nameKey = 'name') => { const l = agg([row], kind); return { id: row.ad_id || row.adset_id || row.campaign_id || null, name: row[nameKey] || row.name || '—', ...l, verdict: verdictOf(l, th, minSpend, kind) }; };

// Rows grouped by one key (age, placement...) → share of spend, results, ROAS, cost per result, verdict.
export function groupBy(rows, keyFn, kind, th, minSpend) {
  const by = new Map();
  for (const r of rows) { const k = keyFn(r); if (k == null) continue; if (!by.has(k)) by.set(k, []); by.get(k).push(r); }
  const total = sum(rows, 'spend');
  return [...by.entries()].map(([key, rs]) => { const l = agg(rs, kind); return { key, ...l, share: total > 0 ? r2(l.spend / total) : 0, verdict: verdictOf(l, th, minSpend, kind) }; }).sort((a, b) => b.spend - a.spend);
}

// How much spend an ad needed to bring its 1st..5th result, from daily rows of the window. Ads that started inside the window only.
export function testCurve(dailyRows, window, kind) {
  if (!dailyRows?.length || kind === 'none') return null;
  const byAd = new Map();
  for (const r of dailyRows) { const id = r.ad_id; if (!id) continue; if (!byAd.has(id)) byAd.set(id, []); byAd.get(id).push(r); }
  const ads = [];
  for (const [id, rs] of byAd) {
    rs.sort((a, b) => String(a.period?.from_date).localeCompare(String(b.period?.from_date)));
    const first = rs[0].period?.from_date;
    if (window && first && first <= window.since) continue; // it was running before the window: its start is unknown
    let cum = 0, n = 0; const at = [];
    for (const r of rs) { const prev = n; cum += Number(r.spend) || 0; n += Number(r[kind]) || 0; for (let k = prev + 1; k <= Math.min(n, 5); k += 1) at[k] = r2(cum); }
    ads.push({ id, spend: r2(sum(rs, 'spend')), results: n, at });
  }
  if (!ads.length) return null;
  const withResult = ads.filter((a) => a.results > 0);
  const firsts = withResult.map((a) => a.at[1]).filter((x) => x != null).sort((a, b) => a - b);
  const reached5 = ads.filter((a) => a.results >= 5);
  const never = ads.filter((a) => a.results === 0);
  return {
    launched: ads.length, with_result: withResult.length, share_with_result: r2(withResult.length / ads.length),
    median_first_spend: firsts.length ? firsts[Math.floor(firsts.length / 2)] : null,
    reached5: { count: reached5.length, max_first_spend: reached5.length ? Math.max(...reached5.map((a) => a.at[1] ?? 0)) : null },
    never: { count: never.length, spend: r2(sum(never, 'spend')), typical: never.length ? r2(sum(never, 'spend') / never.length) : 0, over100: never.filter((a) => a.spend > 100).length },
  };
}

// ---------------------------------------------------------------------------------------------------------------------------------------------
// data = { currency, monthly, campaigns, campaignMeta, window, windowCampaigns, windowAdsets, windowAds, dailyAds, dailyTruncated, breakdowns: { age: { life, recent }, ... }, pixels }
// th   = { breakeven_roas, target_roas, breakeven_cpa, target_cpa } from the Unit Economy, or null
export function computeAudit(data, th = null) {
  const c = data.currency || 'USD';
  const monthlyRows = data.monthly || [];
  const kind = resultKindOf(monthlyRows.length ? monthlyRows : data.campaigns || []);
  const minSpend = th?.target_cpa ? r2(th.target_cpa * 1.5) : 50;
  const months = monthsOf(monthlyRows, kind, th, minSpend);
  const years = yearsOf(months);
  const total = agg(monthlyRows, kind);
  const win = data.window || windowOf(monthlyRows);
  const spendMonths = months.filter((m) => m.spend > 0);

  const sortedBySpend = [...spendMonths].sort((a, b) => b.spend - a.spend);
  const topTwo = sortedBySpend.slice(0, 2);
  const concentration = { top: topTwo.map((m) => ({ month: m.month, spend: m.spend, share: total.spend ? r2(m.spend / total.spend) : 0 })), share: total.spend ? r2(sum(topTwo, 'spend') / total.spend) : 0 };
  const bigMonths = spendMonths.filter((m) => m.spend >= 5000);
  const aboveBreakeven = th ? spendMonths.filter((m) => m.roas != null && m.roas >= th.breakeven_roas) : [];

  // by objective
  const objOf = new Map((data.campaignMeta || []).map((m) => [String(m.id), m.objective]));
  const objectives = (() => {
    const camps = data.campaigns || [];
    const by = new Map();
    for (const r of camps) { const o = objOf.get(String(r.campaign_id)) || 'UNKNOWN'; if (!by.has(o)) by.set(o, []); by.get(o).push(r); }
    const totalSpend = sum(camps, 'spend');
    return [...by.entries()].map(([objective, rs]) => { const l = agg(rs, kind); return { objective, campaigns: rs.length, ...l, share: totalSpend ? r2(l.spend / totalSpend) : 0 }; }).sort((a, b) => b.spend - a.spend);
  })();
  const salesSpend = sum(objectives.filter((o) => OK_OBJECTIVES.has(o.objective)), 'spend');
  const campaignsCount = (data.campaignMeta || []).length || (data.campaigns || []).length;

  // the recent window
  const wc = (data.windowCampaigns || []).map((r) => lineOf(r, kind, th, minSpend));
  const was = (data.windowAdsets || []).map((r) => lineOf(r, kind, th, minSpend));
  const wads = (data.windowAds || []).map((r) => lineOf(r, kind, th, minSpend));
  const recentTotals = agg(data.windowCampaigns || [], kind);
  const recent = win ? { window: win, totals: recentTotals, adsets: { count: was.length, best: rank(was, 3, minSpend, 'best', !!th), worst: rank(was, 3, minSpend, 'worst', !!th) }, ads: { count: wads.length, best: rank(wads, 5, minSpend, 'best', !!th), worst: rank(wads, 5, minSpend, 'worst', !!th) }, campaigns: wc.sort((a, b) => b.spend - a.spend).slice(0, 8) } : null;

  const test = testCurve(data.dailyAds, win, kind);
  const bd = {};
  for (const [name, v] of Object.entries(data.breakdowns || {})) {
    const key = name === 'placement' ? (r) => `${r.publisher_platform || ''} ${r.platform_position || ''}`.trim() : name === 'region' ? (r) => r.region || r.country : (r) => r[name === 'device' ? 'device_platform' : name];
    bd[name] = { life: groupBy(v.life || [], key, kind, th, minSpend), recent: groupBy(v.recent || [], key, kind, th, minSpend) };
  }
  const pixels = data.pixels || [];
  const nowMs = data.now ? new Date(data.now).getTime() : win ? new Date(win.until).getTime() : Date.now(); // the audit does not read the clock by itself: the same data gives the same audit
  const tracking = { pixels, multiple: pixels.length > 1, stale: pixels.filter((p) => p.lastFired && (nowMs - new Date(p.lastFired)) > 30 * 864e5).map((p) => p.name), never: pixels.filter((p) => !p.lastFired).map((p) => p.name) };

  // ---- findings: numbered sentences, red = problem, green = good. Each one carries its number; nothing is said without data.
  const F = { summary: [], dynamics: [], structure: [], creatives: [], audiences: [], tracking: [] };
  const add = (list, tone, text) => list.push({ tone, text });
  const W = RESULT_WORD[kind];
  if (th && total.roas != null) add(F.summary, total.roas >= th.breakeven_roas ? 'g' : 'r', `За весь час витрачено ${money(total.spend, c)}, ROAS ${total.roas} при беззбитковому ${th.breakeven_roas}.`);
  else if (total.spend > 0) add(F.summary, 'g', `За весь час витрачено ${money(total.spend, c)}${total.results ? `, ${total.results} ${W}, ціна одного ${money(total.cpr, c)}` : ''}.`);
  if (th && kind === 'purchases') {
    if (!aboveBreakeven.length) add(F.dynamics, 'r', 'Жоден місяць не досяг беззбиткового ROAS.');
    else add(F.dynamics, 'g', `Вище беззбиткового ROAS ${th.breakeven_roas} були місяці: ${aboveBreakeven.map((m) => `${m.month} (${m.roas}, витрати ${money(m.spend, c)})`).join(', ')}.`);
    const bigAbove = bigMonths.filter((m) => m.roas != null && m.roas >= th.breakeven_roas);
    if (bigMonths.length && !bigAbove.length) add(F.dynamics, 'r', `Жоден місяць із витратою від ${money(5000, c)} не досяг беззбитковості.`);
  }
  if (concentration.share >= 0.4 && concentration.top.length === 2) add(F.dynamics, 'r', `Витрати йшли сплесками: ${concentration.top[0].month} і ${concentration.top[1].month} забрали ${pct(concentration.share)} усіх витрат.`);
  if (win && recentTotals.spend > 0) add(F.dynamics, th && recentTotals.roas != null && recentTotals.roas < th.breakeven_roas ? 'r' : 'g', `Останні 90 днів із показами (${win.since} – ${win.until}): ${money(recentTotals.spend, c)}${recentTotals.results ? `, ${recentTotals.results} ${W}` : ''}${recentTotals.roas != null ? `, ROAS ${recentTotals.roas}` : ''}.`);
  if (objectives.length && campaignsCount) add(F.structure, 'g', `Кампаній у кабінеті: ${campaignsCount}. На продажі припадає ${pct(sum(objectives, 'spend') ? salesSpend / sum(objectives, 'spend') : 0)} витрат. Кампанії з іншою метою (охоплення, трафік, повідомлення) оцінюємо за їхньою метою.`);
  for (const l of (objectives.length ? (data.campaigns || []).map((r) => lineOf(r, kind, th, minSpend)).filter((l) => l.verdict === 'bad').sort((a, b) => b.spend - a.spend).slice(0, 3) : [])) add(F.structure, 'r', `Кампанія «${l.name}»: ${money(l.spend, c)}${l.roas != null ? `, ROAS ${l.roas}` : ''}${l.results ? `, ${l.results} ${W}` : ', без результатів'}.`);
  if (test) {
    add(F.structure, 'g', `Оголошень, запущених у вікні: ${test.launched}. Результат мали ${test.with_result} (${pct(test.share_with_result)}); типовий перший результат з'являвся після ${money(test.median_first_spend ?? 0, c)} витрат.`);
    if (test.reached5.count) add(F.structure, 'g', `Оголошень, що дійшли до 5 результатів: ${test.reached5.count}. У всіх перший результат з'явився не пізніше ніж після ${money(test.reached5.max_first_spend, c)} витрат: це основа для правила «коли вимикати».`);
    if (test.never.count) add(F.structure, 'r', `Оголошень без жодного результату: ${test.never.count}, разом ${money(test.never.spend, c)} (типове ${money(test.never.typical, c)}). Понад ${money(100, c)} витратили лише ${test.never.over100}, тож багато концепцій не отримали справжнього тесту.`);
  }
  for (const l of recent?.ads.best.slice(0, 3) || []) add(F.creatives, 'g', `«${l.name}»: ${money(l.spend, c)}, ${l.results} ${W}${l.roas != null ? `, ROAS ${l.roas}` : ''}.`);
  for (const l of recent?.ads.worst.slice(0, 3) || []) add(F.creatives, 'r', `«${l.name}»: ${money(l.spend, c)}, ${l.results ? `${l.results} ${W}` : 'без результатів'}${l.roas != null ? `, ROAS ${l.roas}` : ''}.`);
  for (const [name, label] of [['age', 'Вік'], ['gender', 'Стать'], ['placement', 'Плейсмент'], ['device', 'Пристрій'], ['region', 'Регіон']]) {
    const rows = (bd[name]?.life || []).filter((r) => r.verdict !== 'few');
    const best = [...rows].sort((a, b) => (b.roas ?? -1) - (a.roas ?? -1))[0];
    const worst = [...rows].sort((a, b) => (a.roas ?? 99) - (b.roas ?? 99))[0];
    if (best && best.roas != null && rows.length > 1) add(F.audiences, 'g', `${label}: найкраще «${best.key}», ROAS ${best.roas}, ${pct(best.share)} витрат.`);
    if (worst && worst.roas != null && rows.length > 1 && worst.key !== best?.key && worst.verdict === 'bad') add(F.audiences, 'r', `${label}: найгірше «${worst.key}», ROAS ${worst.roas}, ${pct(worst.share)} витрат.`);
  }
  if (tracking.multiple) add(F.tracking, 'r', `До кабінету підключено кілька піксельних наборів (${pixels.length}): ${pixels.map((p) => p.name).join(', ')}. Дані можуть розходитись, для реклами потрібен один.`);
  else if (pixels.length === 1) add(F.tracking, 'g', `Піксель «${pixels[0].name}»${pixels[0].lastFired ? `, остання подія ${String(pixels[0].lastFired).slice(0, 10)}` : ''}.`);
  if (!pixels.length) add(F.tracking, 'r', 'У кабінеті не знайдено пікселя.');
  if (tracking.never.length) add(F.tracking, 'r', `Набори без жодної події: ${tracking.never.join(', ')}.`);
  if (tracking.stale.length) add(F.tracking, 'r', `Давно без подій (понад 30 днів): ${tracking.stale.join(', ')}.`);

  // ---- «what we change»: only what the findings above support
  const change = [];
  if (th && kind === 'purchases' && !aboveBreakeven.length) change.push('Оффери й креативи: кожен оффер оцінюється проти власного беззбиткового ROAS, а не лише за ціною покупки.');
  if (concentration.share >= 0.4) change.push('Витрати рівніше за місяцями: не розганяти бюджет сплеском; підвищувати кроками до 20% не частіше ніж раз на 72 години.');
  if (test?.reached5.count) change.push(`Тести: нове оголошення зупиняти, якщо воно не дало результату до ~${money(test.reached5.max_first_spend, c)} витрат (за історією кабінету).`);
  if (test?.never.count > 5) change.push('Менше оголошень на групу й менше нових оголошень за раз, щоб кожне отримувало справжній тест.');
  if (tracking.multiple) change.push('Трекінг: лишити один піксельний набір для реклами, решту прибрати з сайту.');
  if ((bd.placement?.life || []).some((r) => r.verdict === 'bad' && r.share >= 0.1)) change.push('Плейсменти: вимкнути ті, що були збитковими при помітній частці витрат.');
  const open = [];
  if (!th) open.push('Unit Economy ще не пораховано: оцінка «збитково чи ні» відкладена, поки не буде беззбиткового ROAS.');
  if (kind === 'none') open.push('У кабінеті немає результатів у реєстрованих подіях: перевірте налаштування цілі й пікселя.');
  if (kind === 'messages' || kind === 'leads') open.push(`Meta бачить лише ${W}, а не продажі: скільки з них стали замовленнями, невідомо. Потрібні дані продажів клієнта.`);
  if (data.dailyTruncated) open.push('Денні дані по оголошеннях прочитано не повністю (обмеження обсягу): криву тестування рахували за частиною оголошень.');

  return {
    version: 1, currency: c, resultKind: kind, thresholds: th ? { breakeven_roas: th.breakeven_roas, target_roas: th.target_roas } : null, min_spend: minSpend,
    overview: { ...total, campaigns: campaignsCount, from: months[0]?.month || null, to: months[months.length - 1]?.month || null, active_months: spendMonths.length },
    years, months, concentration, above_breakeven: aboveBreakeven.map((m) => m.month), objectives, recent, test, breakdowns: bd, tracking,
    findings: F, change, open,
    not_covered: ['Зміни бюджету й реакція ROAS на підвищення', 'Типи аудиторій (широка, lookalike, інтереси)', 'Якість збігів подій (Events Manager)', 'Зображення креативів'],
  };
}

// The text of the section (also the fallback view in the dossier): short lines with numbers.
export function renderAuditText(a) {
  const c = a.currency, W = RESULT_WORD[a.resultKind];
  const out = [];
  out.push(`Аудит кабінету Meta. Період даних: ${a.overview.from || '—'} – ${a.overview.to || '—'}, місяців із витратами ${a.overview.active_months}, кампаній ${a.overview.campaigns}.`);
  out.push(`Підсумок: витрачено ${money(a.overview.spend, c)}${a.overview.results ? `, ${a.overview.results} ${W}` : ''}${a.overview.roas != null ? `, ROAS ${a.overview.roas}` : ''}${a.thresholds ? ` (беззбитковий ${a.thresholds.breakeven_roas}, цільовий ${a.thresholds.target_roas})` : ''}.`);
  for (const [title, key] of [['Динаміка', 'dynamics'], ['Структура й тестування', 'structure'], ['Креативи', 'creatives'], ['Аудиторії й плейсменти', 'audiences'], ['Трекінг', 'tracking']]) {
    const list = a.findings[key];
    if (!list.length) continue;
    out.push('', title);
    list.forEach((f, i) => out.push(`${i + 1} ${f.tone === 'r' ? 'червоне' : 'зелене'}. ${f.text}`));
  }
  if (a.change.length) { out.push('', 'Що змінюємо'); a.change.forEach((t, i) => out.push(`${i + 1}. ${t}`)); }
  if (a.open.length) { out.push('', 'Відкриті питання'); a.open.forEach((t) => out.push(`• ${t}`)); }
  if (a.not_covered.length) { out.push('', 'У цій версії аудиту не рахується'); a.not_covered.forEach((t) => out.push(`• ${t}`)); }
  return out.join('\n');
}
