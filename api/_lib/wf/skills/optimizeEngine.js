// The Media buyer's skill «optimize» (step A9; document, step 4 «Оптимізація»): the numbers. PURE: no network, no model, no clock; the same data gives the same advice.
// The first stage of the owner's decision (2026-11-19): RECOMMENDATIONS ONLY. The code looks at the cabinet by levels, from the bottom up (ad → ad set → campaign), judges every
// element by the economics of the client (break-even and target CPA from the Unit Economy), asks for enough data first, compares with the neighbours, looks at the trend and
// at the signs of tiredness, and says what to do and WHY with the numbers. Nothing is changed in the cabinet here.
//   · the draft of the rules was confirmed by the owner; its numbers are PARAMS in strategyEngine.js and are shown as assumptions: «Конкретні пороги затверджуються і перевіряються на практиці»
//   · a significant change (switching off a campaign, new creatives, a budget change above the agreed step) goes to Апрув 3; the small ones are recorded in the journal
import { PARAMS } from './strategyEngine.js';

const r2 = (x) => Math.round(x * 100) / 100;
const num = (v) => { const x = Number(v); return v !== '' && v != null && Number.isFinite(x) ? x : null; };
const DAY = 864e5;

// a line of numbers from rows of the same kind
export function agg(rows) {
  const sum = (k) => rows.reduce((s, r) => s + (num(r[k]) || 0), 0);
  const spend = r2(sum('spend')), purchases = sum('purchases'), revenue = r2(sum('revenue')), impressions = sum('impressions'), clicks = sum('clicks'), reach = sum('reach');
  return { spend, purchases, revenue, impressions, clicks, cpa: purchases > 0 ? r2(spend / purchases) : null, roas: spend > 0 && revenue > 0 ? r2(revenue / spend) : null, ctr: impressions > 0 ? r2((clicks / impressions) * 100) : null, frequency: reach > 0 ? r2(impressions / reach) : null };
}

// thresholds: { breakeven_cpa, target_cpa, breakeven_roas, target_roas }. → { state: 'wait' | 'off' | 'keep' | 'scale', reason }
export function judge(m, th, daysLive, P = PARAMS) {
  const be = num(th.breakeven_cpa), tg = num(th.target_cpa) ?? be;
  const min = tg != null ? r2(tg * P.min_spend_factor) : null;
  if (be == null || min == null) return { state: 'wait', reason: 'Немає порогів Unit Economy: оцінювати нічим.', min };
  if (daysLive < P.learning_days) return { state: 'wait', reason: `Перші ${P.learning_days} дні лише спостерігаємо (минуло ${Math.max(0, Math.floor(daysLive))}).`, min };
  if (m.spend < min) return { state: 'wait', reason: `Витрачено ${m.spend} з ${min}, потрібних для вердикту (1.5× цільового CPA ${tg}).`, min };
  if (!m.purchases) return { state: 'off', reason: `Витрачено ${m.spend} (не менше ${min}) без жодної покупки.`, min };
  if (m.cpa > be) return { state: 'off', reason: `Ціна покупки ${m.cpa} вища за беззбитковий ${be}: кожна покупка в збиток.`, min };
  if (m.cpa <= tg) return { state: 'scale', reason: `Ціна покупки ${m.cpa} не вища за цільову ${tg}.`, min };
  return { state: 'keep', reason: `Ціна покупки ${m.cpa} між цільовою ${tg} і беззбитковою ${be}.`, min };
}

const median = (a) => { const s = a.filter((x) => x != null).sort((x, y) => x - y); if (!s.length) return null; const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const byKey = (rows, k) => { const m = new Map(); for (const r of rows) { const id = String(r[k] ?? ''); if (!id) continue; if (!m.has(id)) m.set(id, []); m.get(id).push(r); } return m; };

// snapshot = content of the section «Знімок запуску» (campaigns → adsets → ads with Meta ids); rows = { life, recent, prior } at the level of ads
// objects = { adsets: Map id → { status, daily }, ads: Map id → { status } } (what is really on in the cabinet); lastScaleAt = ISO of the last recommended scale (72 hours between)
export function analyse({ snapshot, thresholds, rows, objects = {}, now, lastScaleAt = null, params = {} }) {
  const P = { ...PARAMS, ...params }; // the thresholds of the settings of the agents (src/lib/workflow/agentConfig.js) over the defaults
  const th = thresholds || {};
  const launched = new Date(snapshot.launched_at);
  const daysLive = (now - launched) / DAY;
  const life = byKey(rows.life || [], 'ad_id'), recent = byKey(rows.recent || [], 'ad_id'), prior = byKey(rows.prior || [], 'ad_id');
  const isOn = (map, id) => String(map?.get?.(String(id))?.status || 'ACTIVE').toUpperCase() === 'ACTIVE'; // only an ACTIVE object works; a missing record means we have no news, so it is taken as on
  const actions = [], notes = [], tasks = [];
  const act = (a) => actions.push({ significant: false, ...a });

  // ---- ads
  const adInfo = [];
  for (const c of snapshot.campaigns) for (const a of c.adsets) for (const x of a.ads) {
    if (!x.ad_id) continue;
    const m = agg(life.get(String(x.ad_id)) || []), rec = agg(recent.get(String(x.ad_id)) || []), pri = agg(prior.get(String(x.ad_id)) || []);
    adInfo.push({ campaign: c, adset: a, ad: x, m, rec, pri, on: isOn(objects.ads, x.ad_id), verdict: judge(m, th, daysLive, P) });
  }
  for (const a of snapshot.campaigns.flatMap((c) => c.adsets)) {
    const sibs = adInfo.filter((i) => i.adset === a && i.on);
    const medianCpa = median(sibs.filter((s) => s.verdict.state !== 'wait').map((s) => s.m.cpa));
    for (const i of sibs) {
      const label = i.ad.tag || i.ad.ad_id;
      const working = sibs.filter((s) => s !== i && s.verdict.state !== 'off');
      if (i.verdict.state === 'off') {
        if (!working.length) act({ level: 'ad', id: i.ad.ad_id, name: label, action: 'replace', reason: `${i.verdict.reason} Це останнє працююче оголошення групи: спершу потрібна заміна, а не вимкнення.`, metrics: i.m, significant: true, effect: 'Група лишиться без показів, якщо просто вимкнути: потрібен новий креатив (Апрув 3, погодження клієнта).' });
        else act({ level: 'ad', id: i.ad.ad_id, name: label, action: 'off', reason: i.verdict.reason, metrics: i.m, effect: `Зупиняє витрати ${r2(i.rec.spend / 3)} на день, що не окупаються.` });
      } else if (i.verdict.state === 'wait') act({ level: 'ad', id: i.ad.ad_id, name: label, action: 'wait', reason: i.verdict.reason, metrics: i.m });
      else {
        let note = '';
        if (i.verdict.state === 'keep' && medianCpa != null && i.m.cpa > medianCpa * P.much_worse_factor && i.m.cpa <= num(th.breakeven_cpa)) note = ` Суттєво гірший за сусідів (ціна ${i.m.cpa} проти медіани ${r2(medianCpa)}), але вище беззбиткового: лишаємо, стежимо.`;
        // the budget lives at the level of the ad set, so a good ad is only «лишити»: the advice to scale is given for its group
        act({ level: 'ad', id: i.ad.ad_id, name: label, action: 'keep', reason: (i.verdict.state === 'scale' ? 'Працює добре. ' : '') + i.verdict.reason + note, metrics: i.m });
      }
      // «Раніше приносило, а тепер ні»: the whole period is fine, the last days are not
      const minHalf = (i.verdict.min || 0) / 2, be = num(th.breakeven_cpa);
      if (['keep', 'scale'].includes(i.verdict.state) && i.rec.spend >= minHalf && (i.rec.purchases === 0 || (i.rec.cpa != null && be != null && i.rec.cpa > be))) {
        act({ level: 'ad', id: i.ad.ad_id, name: label, action: 'replace', significant: true, reason: `Раніше окупалось (ціна ${i.m.cpa}), але за останні 3 дні ${i.rec.purchases ? `ціна ${i.rec.cpa} вища за беззбитковий ${be}` : `витрачено ${i.rec.spend} без покупок`}: міняємо креатив, а не чекаємо.`, metrics: i.rec, effect: 'Потрібен новий креатив (Апрув 3, погодження клієнта).' });
      }
      // signs of tiredness: the frequency grows and the CTR falls
      if (i.rec.ctr != null && i.pri.ctr != null && i.rec.spend >= minHalf && i.pri.spend >= minHalf && i.rec.ctr <= i.pri.ctr * 0.8 && i.rec.frequency != null && i.pri.frequency != null && i.rec.frequency >= i.pri.frequency * 1.2) {
        act({ level: 'ad', id: i.ad.ad_id, name: label, action: 'new_creative', significant: true, reason: `Ознаки втоми креатива: частота ${i.pri.frequency} → ${i.rec.frequency}, CTR ${i.pri.ctr}% → ${i.rec.ctr}%.`, metrics: i.rec, effect: 'Новий креатив у цю групу, поки результат не просів (Апрув 3, погодження клієнта).' });
      }
    }
  }

  // ---- ad sets (from the sums of their ads; a group is off when it is bad itself or when all its ads are off)
  const adsetInfo = [];
  for (const c of snapshot.campaigns) for (const a of c.adsets) {
    if (!a.id) continue;
    const mine = adInfo.filter((i) => i.adset === a);
    const m = agg(mine.flatMap((i) => life.get(String(i.ad.ad_id)) || []));
    const on = isOn(objects.adsets, a.id);
    const v = judge(m, th, daysLive, P);
    const allOff = mine.length > 0 && mine.filter((i) => i.on).every((i) => actions.some((x) => x.id === i.ad.ad_id && x.action === 'off'));
    adsetInfo.push({ campaign: c, adset: a, m, on, v, allOff, budget: num(objects.adsets?.get?.(String(a.id))?.daily) ?? num(a.daily) });
  }
  const scaleReady = !lastScaleAt || now - new Date(lastScaleAt) >= P.budget_step_hours * 3600e3;
  for (const s of adsetInfo.filter((x) => x.on)) {
    const label = `Група «${s.adset.name}»`;
    if (s.v.state === 'off' || s.allOff) act({ level: 'adset', id: s.adset.id, name: label, action: 'off', reason: s.allOff ? 'Усі оголошення групи вимикаються за порогом.' : s.v.reason, metrics: s.m, effect: 'Зупиняє витрати групи, що не окупаються.' });
    else if (s.v.state === 'scale') {
      const next = s.budget != null ? r2(s.budget * (1 + P.budget_step_pct / 100)) : null;
      if (!scaleReady) act({ level: 'adset', id: s.adset.id, name: label, action: 'keep', reason: `${s.v.reason} Масштабувати можна, але з останньої зміни бюджету ще не минуло ${P.budget_step_hours} годин.`, metrics: s.m });
      else act({ level: 'adset', id: s.adset.id, name: label, action: 'scale', reason: `${s.v.reason} Піднімаємо бюджет кроком ${P.budget_step_pct}%${next != null ? `: ${s.budget} → ${next} на день` : ''}.`, metrics: s.m, to_daily: next, effect: s.m.cpa && next != null ? `Орієнтовно +${r2((next - s.budget) / s.m.cpa)} покупок на день при тій самій ціні (оцінка, ціна може вирости).` : '' });
    } else act({ level: 'adset', id: s.adset.id, name: label, action: s.v.state, reason: s.v.reason, metrics: s.m });
  }

  // ---- campaigns: only when every group of it is off
  for (const c of snapshot.campaigns) {
    const sets = adsetInfo.filter((s) => s.campaign === c && s.on);
    if (!sets.length) continue;
    const m = agg(sets.flatMap((s) => s.adset.ads.flatMap((x) => life.get(String(x.ad_id)) || [])));
    const off = sets.every((s) => actions.some((x) => x.level === 'adset' && x.id === s.adset.id && x.action === 'off'));
    if (off) act({ level: 'campaign', id: c.id, name: `Кампанія «${c.name}»`, action: 'off', significant: true, reason: `Усі групи кампанії вимикаються за порогом. Разом витрачено ${m.spend}, покупок ${m.purchases}.`, metrics: m, effect: 'Зупиняє кампанію, що не окупається; вимкнення кампанії погоджує менеджер (Апрув 3).' });
  }

  // ---- ads are in order but there are no sales: the site and the tracking come first (document: «перевіряємо сайт і трекінг»)
  const all = agg(adInfo.flatMap((i) => life.get(String(i.ad.ad_id)) || []));
  const min = judge(all, th, 99, P).min;
  if (min != null && daysLive >= P.learning_days && all.spend >= min * 2 && all.purchases === 0 && all.ctr != null && all.ctr >= 0.5) {
    tasks.push({ type: 'tracking', owner: 'manager', priority: 'high', title: 'Реклама в нормі, продажів немає: перевірити сайт і трекінг', evidence: `Витрачено ${all.spend}, кліків ${all.clicks}, CTR ${all.ctr}%, покупок 0. Перевірте піксель, події покупки й оформлення замовлення.` });
    notes.push('Продажів немає при нормальному CTR: ймовірно, проблема на сайті або в трекінгу, а не в рекламі. Створено задачу.');
  }
  if (all.purchases > 0 && (all.purchases / Math.max(1, adsetInfo.length)) < 50 * (daysLive / 7)) notes.push('Для навчання Meta потрібно близько 50 подій на тиждень на групу: подій поки менше, результат нестабільний.');

  const significant = actions.filter((a) => a.significant);
  return { actions, significant, tasks, notes, totals: all, days_live: r2(daysLive), thresholds: { breakeven_cpa: th.breakeven_cpa ?? null, target_cpa: th.target_cpa ?? null, min_spend_for_verdict: min } };
}

// ---------------------------------------------------------------- «дрібні дії»: what the Media buyer may do ALONE in a project that allows it (default: nobody does anything alone)
// The list is CLOSED: pause one weak ad (never the last working one of a group), raise the budget of a good ad group by the agreed step inside the budget of the brief. Everything else
// (a campaign or a group off, a replacement, a new creative, any budget above the step) stays a recommendation or goes to Апрув 3. The numbers are assumptions until management confirms them.
export const SMALL = { max_ad_pauses: 3, max_scales: 2, headroom_pct: 0 }; // headroom_pct: how far above the daily budget of the brief the total may go (0 = never)

// actions = analyse().actions; objects = what is on in the cabinet now; dailyCap = the daily budget of the brief (or null: no scaling). → { apply: [...], skipped: [{ name, why }] }
export function pickSmallActions({ actions, snapshot, objects = {}, dailyCap = null, limits = SMALL, params = {} }) {
  const P = { ...PARAMS, ...params };
  const apply = [], skipped = [];
  const adsetOfAd = new Map();
  for (const c of snapshot?.campaigns || []) for (const a of c.adsets || []) for (const x of a.ads || []) if (x.ad_id) adsetOfAd.set(String(x.ad_id), a);
  const status = (map, id) => String(map?.get?.(String(id))?.status || '').toUpperCase();
  const activeAds = (adset) => (adset.ads || []).filter((x) => x.ad_id && status(objects.ads, x.ad_id) === 'ACTIVE');

  const pauses = actions.filter((a) => a.level === 'ad' && a.action === 'off' && !a.significant).sort((x, y) => (y.metrics?.spend || 0) - (x.metrics?.spend || 0));
  const touched = new Set();
  for (const a of pauses) {
    const adset = adsetOfAd.get(String(a.id));
    if (!objects.ads?.get?.(String(a.id))) { skipped.push({ name: a.name, why: 'стан оголошення в кабінеті невідомий' }); continue; }
    if (status(objects.ads, a.id) !== 'ACTIVE') { skipped.push({ name: a.name, why: 'оголошення вже не працює' }); continue; }
    if (!adset || activeAds(adset).filter((x) => String(x.ad_id) !== String(a.id)).length < 1) { skipped.push({ name: a.name, why: 'це останнє працююче оголошення групи' }); continue; }
    if (touched.has(adset)) { skipped.push({ name: a.name, why: 'в цій групі вже призупинено одне оголошення за цей прохід' }); continue; }
    if (apply.filter((x) => x.kind === 'ad_off').length >= limits.max_ad_pauses) { skipped.push({ name: a.name, why: `ліміт ${limits.max_ad_pauses} пауз за прохід` }); continue; }
    touched.add(adset);
    apply.push({ kind: 'ad_off', id: String(a.id), name: a.name, reason: a.reason, before: 'ACTIVE', after: 'PAUSED' });
  }

  const scales = actions.filter((a) => a.level === 'adset' && a.action === 'scale' && a.to_daily != null);
  const total = (snapshot?.campaigns || []).flatMap((c) => c.adsets || []).filter((s) => s.id && status(objects.adsets, s.id) === 'ACTIVE').reduce((t, s) => t + (num(objects.adsets.get(String(s.id)).daily) || 0), 0);
  let running = total;
  for (const a of scales) {
    const cur = num(objects.adsets?.get?.(String(a.id))?.daily);
    if (cur == null) { skipped.push({ name: a.name, why: 'поточний бюджет групи в кабінеті невідомий' }); continue; }
    if (dailyCap == null) { skipped.push({ name: a.name, why: 'у брифі немає місячного бюджету: ліміту для підняття немає' }); continue; }
    const next = r2(Math.min(num(a.to_daily), cur * (1 + P.budget_step_pct / 100)));
    if (!(next > cur)) { skipped.push({ name: a.name, why: 'підняття не більше за поточний бюджет' }); continue; }
    if (running - cur + next > dailyCap * (1 + limits.headroom_pct / 100) + 1e-9) { skipped.push({ name: a.name, why: `сума денних бюджетів вийшла б за бюджет із брифу (${r2(dailyCap)} на день)` }); continue; }
    if (apply.filter((x) => x.kind === 'adset_scale').length >= limits.max_scales) { skipped.push({ name: a.name, why: `ліміт ${limits.max_scales} підняттів за прохід` }); continue; }
    running = r2(running - cur + next);
    apply.push({ kind: 'adset_scale', id: String(a.id), name: a.name, reason: a.reason, from: cur, to: next });
  }
  return { apply, skipped };
}

const LABEL = { off: 'вимкнути', scale: 'масштабувати', keep: 'лишити', wait: 'чекати', replace: 'замінити креатив', new_creative: 'новий креатив' };
export function renderOptimizeText(r, { period, accountName }) {
  const out = [`Оптимізація (лише рекомендації). Період даних: ${period}. Кабінет: ${accountName || '—'}. Днів з запуску: ${r.days_live}.`];
  out.push(`Разом: витрачено ${r.totals.spend}, покупок ${r.totals.purchases}${r.totals.cpa != null ? `, ціна покупки ${r.totals.cpa}` : ''}${r.totals.roas != null ? `, ROAS ${r.totals.roas}` : ''}. Пороги: беззбитковий CPA ${r.thresholds.breakeven_cpa ?? '—'}, цільовий ${r.thresholds.target_cpa ?? '—'}, мінімум витрат для вердикту ${r.thresholds.min_spend_for_verdict ?? '—'}.`);
  for (const [title, lvl] of [['Кампанії', 'campaign'], ['Групи оголошень', 'adset'], ['Оголошення', 'ad']]) {
    const list = r.actions.filter((a) => a.level === lvl);
    if (!list.length) continue;
    out.push('', title);
    list.forEach((a) => out.push(`• ${a.name}: ${LABEL[a.action] || a.action}${a.significant ? ' (через Апрув 3)' : ''}. ${a.reason}${a.effect ? ' Ефект: ' + a.effect : ''}`));
  }
  if (r.notes.length) { out.push('', 'Примітки'); r.notes.forEach((n) => out.push(`• ${n}`)); }
  return out.join('\n');
}
