// Unit Economy (step A4; document «Робочий процес клієнта», 1.4; formulas from the reference strategy of Lelior, see docs/strategy-references-digest.md).
// PURE: numbers in, numbers and text out. No model, no network, so the result is always the same for the same brief.
//   contribution before ads = what the customer pays - product cost - payment fees - shipping and packaging - returns - extra cost of an offer
//   break-even CPA = contribution      break-even ROAS = price paid / contribution      target CPA = price paid / target ROAS
// The product cost stays on the LIST value: a discount does not make a bottle cheaper to make.

export const DEFAULTS = { target_roas: 2.5, min_campaign_daily: 15, growth_factor: 1.5, days: 30 };
const n = (v) => (v === '' || v == null ? null : Number(v));
const num = (v) => { const x = n(v); return x != null && Number.isFinite(x) ? x : null; };
const r2 = (x) => Math.round(x * 100) / 100;
const r0 = (x) => Math.round(x);

// A line = something that is sold for a price: the average order, a product or an offer.
// econ: { currency, cogs_pct, shipping_cost, fee_pct, returns_pct, target_roas, avg_order, products:[{name, price, cogs, cogs_pct}], offers:[{name, pays, list_value, extra_cost}],
//         budget_monthly, min_campaign_daily, site_cvr }
function lineOf({ name, pays, list, cogs, cogsPct, e, extra = 0, kind }) {
  const productCost = cogs != null ? cogs : cogsPct != null ? (cogsPct / 100) * list : null;
  if (pays == null || productCost == null) return { name, kind, blocked: true, missing: [pays == null ? 'ціна' : null, productCost == null ? 'собівартість' : null].filter(Boolean) };
  const fee = ((e.fee_pct || 0) / 100) * pays;
  const ret = ((e.returns_pct || 0) / 100) * pays;
  const ship = e.shipping_cost || 0;
  const contribution = pays - productCost - fee - ret - ship - extra;
  const targetRoas = e.target_roas;
  const row = {
    name, kind, pays: r2(pays), product_cost: r2(productCost), fees: r2(fee), returns: r2(ret), shipping: r2(ship), extra_cost: r2(extra),
    contribution: r2(contribution), breakeven_cpa: r2(Math.max(0, contribution)),
    breakeven_roas: contribution > 0 ? r2(pays / contribution) : null,
    target_cpa: r2(pays / targetRoas), margin_pct: pays ? r2((contribution / pays) * 100) : null,
    sellable_alone: contribution > 0,
  };
  // if the target CPA is above the break-even one, the target is below break-even: report it, do not hide it
  row.target_reachable = contribution > 0 && row.target_cpa <= row.breakeven_cpa;
  row.after_ads_at_target = r2(contribution - row.target_cpa); // what is left per order when the ads cost exactly the target CPA
  if (e.site_cvr != null) row.max_cpc_at_breakeven = r2(row.breakeven_cpa * e.site_cvr);
  return row;
}

export function normalizeInputs(econ = {}) {
  const e = {
    currency: econ.currency || 'USD',
    cogs_pct: num(econ.cogs_pct), shipping_cost: num(econ.shipping_cost), fee_pct: num(econ.fee_pct), returns_pct: num(econ.returns_pct),
    target_roas: num(econ.target_roas), avg_order: num(econ.avg_order), budget_monthly: num(econ.budget_monthly),
    min_campaign_daily: num(econ.min_campaign_daily), site_cvr: num(econ.site_cvr), // site_cvr as a fraction, 0.02 = 2%
    products: (econ.products || []).filter((p) => p && p.name).map((p) => ({ name: String(p.name), price: num(p.price), cogs: num(p.cogs), cogs_pct: num(p.cogs_pct) })),
    offers: (econ.offers || []).filter((o) => o && o.name).map((o) => ({ name: String(o.name), pays: num(o.pays), list_value: num(o.list_value), extra_cost: num(o.extra_cost) || 0, approved: o.approved !== false })),
  };
  return e;
}

const LABELS = { budget_monthly: 'Місячний бюджет', target_roas: 'Цільовий ROAS', avg_order: 'Середній чек', cogs_pct: 'Собівартість', shipping_cost: 'Доставка й пакування', fee_pct: 'Комісії платежів', returns_pct: 'Повернення', site_cvr: 'Конверсія сайту', min_campaign_daily: 'Мінімальний бюджет кампанії' };

// meta = { <param>: { status: 'confirmed' | 'assumption', source } } from the brief: a number that is only an assumption is listed for confirmation.
export function computeUnitEconomy(econInput = {}, meta = {}) {
  const e0 = normalizeInputs(econInput);
  const assumptions = [];
  const e = { ...e0 };
  if (e.target_roas == null) { e.target_roas = DEFAULTS.target_roas; assumptions.push(`Цільовий ROAS не вказано: беремо ${DEFAULTS.target_roas} (підтвердіть з клієнтом).`); }
  for (const [k, label] of [['shipping_cost', 'Доставка й пакування'], ['fee_pct', 'Комісії платежів'], ['returns_pct', 'Повернення']]) {
    if (e[k] == null) { e[k] = 0; assumptions.push(`${label} не вказано: вважаємо 0, тому беззбитковий CPA може бути завищений.`); }
  }
  const unconfirmed = (key, label, value, extra = '') => { const m = meta?.[key]; if (m && m.status !== 'confirmed') assumptions.push(`${label}: ${value}${extra} — підтвердити${m.source ? ` (джерело: ${m.source})` : ''}.`); };
  for (const [k, label] of Object.entries(LABELS)) if (e0[k] != null) unconfirmed(k === 'site_cvr' ? 'site_cvr_pct' : k, label, k === 'site_cvr' ? `${r2(e0[k] * 100)}%` : e0[k]);
  for (const p of e0.products) unconfirmed('product:' + p.name, `Товар «${p.name}»`, p.price ?? 'ціни немає');
  for (const o of e0.offers) unconfirmed('offer:' + o.name, `Офер «${o.name}»`, o.pays ?? 'ціни немає');
  const campaignDaily = e.min_campaign_daily ?? DEFAULTS.min_campaign_daily;
  if (e.min_campaign_daily == null) assumptions.push(`Мінімальний бюджет кампанії не вказано: беремо ${DEFAULTS.min_campaign_daily} ${e.currency} на день.`);

  const lines = [];
  if (e.avg_order != null || e.cogs_pct != null) lines.push(lineOf({ name: 'Середнє замовлення', kind: 'average', pays: e.avg_order, list: e.avg_order, cogsPct: e.cogs_pct, e }));
  for (const p of e.products) lines.push(lineOf({ name: p.name, kind: 'product', pays: p.price, list: p.price, cogs: p.cogs, cogsPct: p.cogs_pct ?? e.cogs_pct, e }));
  for (const o of e.offers) lines.push({ ...lineOf({ name: o.name, kind: 'offer', pays: o.pays, list: o.list_value ?? o.pays, cogsPct: e.cogs_pct, e, extra: o.extra_cost }), approved: o.approved });

  const ok = lines.filter((l) => !l.blocked);
  const missing = [];
  if (!lines.length) missing.push('Ціни та собівартість товарів (або середній чек і відсоток собівартості).');
  for (const l of lines.filter((x) => x.blocked)) missing.push(`«${l.name}»: немає даних (${l.missing.join(', ')}).`);
  if (e.budget_monthly == null) missing.push('Місячний бюджет реклами (потрібен для сценаріїв).');

  // The line that the budget scenarios are counted on: the average order, else the first product that can be sold at all
  const main = ok.find((l) => l.kind === 'average') || ok.find((l) => l.sellable_alone) || ok[0] || null;
  let scenarios = [];
  if (main && e.budget_monthly != null && main.sellable_alone) {
    const mk = (name, monthly, note) => {
      const orders_be = monthly / main.breakeven_cpa;
      const orders_t = monthly / main.target_cpa;
      const s = { name, note, monthly_budget: r2(monthly), daily_budget: r2(monthly / DEFAULTS.days), orders_to_break_even: r0(orders_be), orders_at_target: r0(orders_t),
        revenue_at_target: r0(orders_t * main.pays), profit_after_ads_at_target: r0(orders_t * main.contribution - monthly) };
      if (e.site_cvr != null) { s.clicks_needed_at_target = r0(orders_t / e.site_cvr); }
      return s;
    };
    scenarios = [
      mk('Мінімальний', campaignDaily * DEFAULTS.days, `одна кампанія з мінімальним бюджетом ${campaignDaily} ${e.currency} на день`),
      mk('Базовий', e.budget_monthly, 'бюджет за брифом'),
      mk('Росту', e.budget_monthly * DEFAULTS.growth_factor, `бюджет ×${DEFAULTS.growth_factor}, якщо економіка тримається`),
    ];
  } else if (main && !main.sellable_alone) {
    missing.push(`Лінія «${main.name}» збиткова ще до реклами (внесок ${main.contribution}): сценарії не рахуємо, потрібні інші ціна, собівартість чи доставка.`);
  }

  const thresholds = main ? {
    currency: e.currency, basis: main.name, breakeven_cpa: main.breakeven_cpa, target_cpa: main.target_cpa, breakeven_roas: main.breakeven_roas, target_roas: e.target_roas,
    lines: ok.map((l) => ({ name: l.name, kind: l.kind, breakeven_cpa: l.breakeven_cpa, target_cpa: l.target_cpa, breakeven_roas: l.breakeven_roas })),
  } : null;
  const blocked = !main; // nothing can be counted without a price and a product cost
  return { blocked, provisional: assumptions.length > 0, currency: e.currency, target_roas: e.target_roas, lines, scenarios, thresholds, assumptions, missing, inputs: e };
}

const money = (x, c) => (x == null ? '—' : `${x < 0 ? '−' : ''}${Math.abs(x).toLocaleString('en-US', { maximumFractionDigits: 2 })} ${c}`);

// The text of the section «Unit Economy». Plain text with short lines: the dossier shows it as it is.
export function renderUnitEconomy(res) {
  const c = res.currency;
  const out = [];
  if (res.blocked) {
    out.push('Unit Economy поки не пораховано: для розрахунку потрібні ціна й собівартість.', '', 'Потрібно від клієнта:');
    res.missing.forEach((m) => out.push(`• ${m}`));
    return out.join('\n');
  }
  const t = res.thresholds;
  out.push(`Підсумок. На «${t.basis}» беззбитковий CPA ${money(t.breakeven_cpa, c)} (ROAS ${t.breakeven_roas}), цільовий CPA ${money(t.target_cpa, c)} (ROAS ${t.target_roas}). Реклама, яка коштує дорожче за беззбитковий CPA, збиткова; ці числа використовує оптимізація.`);
  if (res.provisional) out.push('Розрахунок попередній: є припущення (нижче). Підтвердьте їх, і числа уточняться.');
  out.push('', 'Беззбитковість і ціль по кожній лінії', 'Формула: внесок до реклами = ціна − собівартість − комісії − доставка − повернення; беззбитковий CPA = внесок; беззбитковий ROAS = ціна / внесок; цільовий CPA = ціна / цільовий ROAS.');
  for (const l of res.lines) {
    if (l.blocked) { out.push(`• ${l.name}: не пораховано (немає: ${l.missing.join(', ')}).`); continue; }
    const warn = !l.sellable_alone ? ' ЗБИТКОВА ДО РЕКЛАМИ: окремо не рекламуємо.' : !l.target_reachable ? ' Ціль нижча за беззбитковість: перевірте цільовий ROAS.' : '';
    out.push(`• ${l.name}${l.kind === 'offer' ? (l.approved ? ' (офер погоджено)' : ' (рекомендація, потрібне погодження)') : ''}: клієнт платить ${money(l.pays, c)}, внесок ${money(l.contribution, c)} (${l.margin_pct}%), беззбитковий CPA ${money(l.breakeven_cpa, c)}, беззбитковий ROAS ${l.breakeven_roas ?? '—'}, цільовий CPA ${money(l.target_cpa, c)}.${l.max_cpc_at_breakeven != null ? ` Макс. ціна кліка при беззбитковості ${money(l.max_cpc_at_breakeven, c)}.` : ''}${warn}`);
  }
  if (res.scenarios.length) {
    out.push('', `Три сценарії бюджету (рахуємо на «${t.basis}»)`);
    for (const s of res.scenarios) out.push(`• ${s.name} (${s.note}): ${money(s.monthly_budget, c)} на місяць, ${money(s.daily_budget, c)} на день. До беззбитковості ${s.orders_to_break_even} замовлень, на цілі ${s.orders_at_target} замовлень і виторг ${money(s.revenue_at_target, c)}; після реклами залишається ${money(s.profit_after_ads_at_target, c)}${s.clicks_needed_at_target != null ? `; потрібно близько ${s.clicks_needed_at_target} кліків` : ''}.`);
  }
  if (res.assumptions.length) { out.push('', 'Припущення (підтвердити)'); res.assumptions.forEach((a) => out.push(`• ${a}`)); }
  if (res.missing.length) { out.push('', 'Не вистачає'); res.missing.forEach((m) => out.push(`• ${m}`)); }
  return out.join('\n');
}
