// The Strategist's skill «strategy» (step A7.1; document, step 2): the part around the model call. PURE: no network, no model, no clock.
// Sections of the strategy (document: «Зміст стратегії»): what we want to get · priorities · the budget · the scheme of the first month (campaigns → ad groups →
// creatives) · what we switch on later · what we need from the client before the launch · how we optimise.
// WHO DOES WHAT: the CODE counts everything that is a number (the daily budget, how many campaigns the budget allows, what each gets, the scenarios from the
// Unit Economy, the margin of each product, the dates of the client's tasks, the thresholds of the optimisation) and checks the structure. The MODEL chooses the
// structure inside those limits (which segments and products go to which campaign, which creatives into which group) and writes the explanations.
// The strategy repeats the budget and the geography of the brief in `budget_monthly` and `geo`: the automatic check (check.js) compares them.
import { briefFacts } from './siteEngine.js';

const clip = (s, n) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const norm = (s) => String(s || '').toLowerCase().replace(/[«»"“”„'’`]/g, '').replace(/\s+/g, ' ').trim();
const numbersOf = (s) => (String(s || '').match(/\d[\d.,]*\d|\d/g) || []).map((n) => n.replace(/[.,]$/, ''));
const num = (v) => { const x = Number(v); return v !== '' && v != null && Number.isFinite(x) ? x : null; };
const r2 = (x) => Math.round(x * 100) / 100;

// Parameters the document leaves open («Ремаркетинг: від якого бюджету», «Правила оптимізації»). They are ASSUMPTIONS and are shown as such in the strategy.
export const PARAMS = {
  days: 30,
  remarketing_min_daily_factor: 4, // remarketing is switched on when the daily budget is at least this many minimal campaign budgets (the cold campaigns must feed the audiences first)
  low_margin_factor: 0.5, // a product whose margin is below this share of the margin of the average order is a «low margin» product
  due_days: { pixel: 3, materials: 7, site: 10 },
  budget_step_pct: 20, budget_step_hours: 72, learning_days: 3, much_worse_factor: 1.5, min_spend_factor: 1.5,
};

// ---------------------------------------------------------------- the budget (counted by code)
// → { monthly, daily, min_daily, max_campaigns, below_minimum, scenarios, source }
export function budgetPlan({ economics, unitEconomy }) {
  const monthly = num(economics?.budget_monthly);
  const minDaily = num(economics?.min_campaign_daily) ?? 15;
  if (monthly == null) return null;
  const daily = r2(monthly / PARAMS.days);
  const max = Math.floor(daily / minDaily);
  return { monthly, daily, min_daily: minDaily, max_campaigns: Math.max(1, max), below_minimum: max < 1, currency: economics?.currency || 'USD', scenarios: unitEconomy?.scenarios || [], remarketing_from_daily: r2(minDaily * PARAMS.remarketing_min_daily_factor) };
}

// the campaigns the model proposed, with shares → daily budgets that sum to the daily budget and each reach the minimum (the weakest are dropped until they do)
export function allocate(campaigns, plan) {
  let list = campaigns.map((c) => ({ ...c, share: Math.max(1, num(c.share_pct) ?? 1) }));
  const dropped = [];
  list = list.slice(0, plan.max_campaigns).concat([]);
  campaigns.slice(plan.max_campaigns).forEach((c) => dropped.push(c.name));
  for (;;) {
    const total = list.reduce((s, c) => s + c.share, 0);
    const withDaily = list.map((c) => ({ ...c, daily_budget: r2((plan.daily * c.share) / total) }));
    const low = withDaily.filter((c) => c.daily_budget + 1e-9 < plan.min_daily).sort((a, b) => a.daily_budget - b.daily_budget)[0];
    if (!low || list.length === 1) return { campaigns: withDaily, dropped };
    list = list.filter((c) => c.name !== low.name);
    dropped.push(low.name);
  }
}

// ---------------------------------------------------------------- priorities
// the margin of every product from the Unit Economy; «low margin» = not sellable alone, or a margin below half of the average order's
export function marginInfo(unitEconomy) {
  const lines = unitEconomy?.lines || [];
  const avg = lines.find((l) => l.kind === 'average' && !l.blocked);
  const out = {};
  for (const l of lines.filter((x) => x.kind === 'product' && !x.blocked)) {
    const low = !l.sellable_alone || (avg?.margin_pct != null && l.margin_pct != null && l.margin_pct < avg.margin_pct * PARAMS.low_margin_factor);
    out[norm(l.name)] = { name: l.name, margin_pct: l.margin_pct, contribution: l.contribution, low };
  }
  return out;
}
const SAYS_ALL = /^(усі|всі|на всі|all|без акценту|—|-)$/i;
// → { source: 'client' | 'margin', instruction }; the client's instruction (the brief row) is the base; without it the margin decides
export const prioritySource = (brief) => { const t = clip(brief?.content?.general?.priority, 300); return !t || SAYS_ALL.test(t) ? { source: 'margin', instruction: '' } : { source: 'client', instruction: t }; };

// ---------------------------------------------------------------- what the client still owes us (counted by code from the dossier and the pool of tasks)
export function neededFromClient({ audit, materials, tasks, now }) {
  const day = (n) => new Date(now.getTime() + n * 864e5).toISOString().slice(0, 10);
  const out = [];
  const t = audit?.tracking;
  const pixelOk = t && (t.pixels || []).length && !(t.stale || []).length && !(t.never || []).length;
  if (!pixelOk) out.push({ what: t?.pixels?.length ? 'Перевірити піксель і події: піксель не спрацьовує або застарів' : 'Налаштувати піксель і події покупки', due: day(PARAMS.due_days.pixel), source: t ? 'аудит кабінету' : 'правило запуску' });
  if (materials?.verdict === 'not_enough') out.push({ what: `Відзняти й передати матеріали за ТЗ${(materials.shoot_list || []).length ? ` (пунктів: ${materials.shoot_list.length})` : ''}`, due: day(PARAMS.due_days.materials), source: 'Креативи (матеріали)' });
  const site = (tasks || []).filter((x) => x.type === 'site' && ['high', 'medium'].includes(x.priority) && ['proposed', 'approved', 'in_progress'].includes(x.status)).slice(0, 3);
  if (site.length) out.push({ what: `Правки сайту: ${site.map((x) => x.title.replace(/^Сайт:\s*/i, '')).join('; ')}`, due: day(PARAMS.due_days.site), source: 'розділ «Сайт»' });
  return out;
}

// ---------------------------------------------------------------- the rules of optimisation (document: «Як оптимізуємо (коротко для клієнта)»; the draft confirmed by the owner 2026-11-19)
export function optimisationRules(thresholds) {
  const th = thresholds || {};
  const be = th.breakeven_cpa, tg = th.target_cpa;
  const spend = tg != null ? r2(tg * PARAMS.min_spend_factor) : null;
  return {
    thresholds: { breakeven_roas: th.breakeven_roas ?? null, target_roas: th.target_roas ?? null, breakeven_cpa: be ?? null, target_cpa: tg ?? null, min_spend_for_verdict: spend, budget_step_pct: PARAMS.budget_step_pct, budget_step_hours: PARAMS.budget_step_hours, learning_days: PARAMS.learning_days },
    rules: [
      `Рівень рішень: окупність (ROAS) проти беззбиткової${th.breakeven_roas != null ? ` (${th.breakeven_roas})` : ''} і цільової${th.target_roas != null ? ` (${th.target_roas})` : ''} з Unit Economy; якщо продажів на сайті немає, ціна результату проти цільової.`,
      `Три стани: вимкнути (нижче беззбиткового після достатньої вибірки), лишити (між беззбитковим і цільовою), масштабувати (на цільовій або вище).`,
      `Вибірка перед вердиктом: оголошення працює близько ${PARAMS.learning_days} днів${spend != null ? ` і витратило не менше ${spend}` : ''}; перші ${PARAMS.learning_days} дні кампанії лише спостерігаємо.`,
      `Рух знизу вгору: оголошення, потім група, потім кампанія; працюючі й нерентабельні вимикаються, робочі лишаються.`,
      `Масштабування кроками до ${PARAMS.budget_step_pct}% не частіше ніж раз на ${PARAMS.budget_step_hours} години; зміна бюджету більше ${PARAMS.budget_step_pct}% або вимкнення кампанії потребує Апрува 3.`,
      `Кожне рішення записується в журнал з причиною й цифрами. Спершу система лише рекомендує, а вмикає після вашого погодження.`,
    ],
    assumptions: ['Правила оптимізації це чернетка, яку перевіряють спеціалісти: поріг «суттєво гірші» (1.5× від медіани сусідів) і вибірка перед вердиктом можуть змінитися.'],
  };
}

// ---------------------------------------------------------------- the facts the model may use
export function gatherStrategyFacts({ brief, plan, margins, priority, ue, audience, ideas, creatives, materials, audit, rework }) {
  const b = brief?.content || {};
  const segs = (audience?.segments || []).map((s) => ({ name: s.name, who: s.who, situation: s.situation, status: s.status }));
  const items = (creatives?.items || []).map((c) => ({ id: c.id, tag: c.tag, product: c.product, segment: c.segment, goal: c.goal, status: c.status }));
  const mg = Object.values(margins).map((m) => ({ product: m.name, margin_pct: m.margin_pct, low_margin: m.low }));
  const best = audit?.recent?.ads?.best?.slice(0, 3).map((l) => ({ name: l.name, roas: l.roas })) || null;
  return {
    brief: { ...briefFacts({ content: b }), seasonality: null },
    budget: plan ? { monthly: plan.monthly, daily: plan.daily, currency: plan.currency, min_campaign_daily: plan.min_daily, max_campaigns: plan.max_campaigns, below_minimum: plan.below_minimum, remarketing_from_daily: plan.remarketing_from_daily, scenarios: plan.scenarios.map((s) => ({ name: s.name, monthly_budget: s.monthly_budget, orders_at_target: s.orders_at_target })) } : null,
    priority: { source: priority.source, client_instruction: priority.instruction || null, margins: mg },
    segments: segs, ideas: (ideas?.items || []).filter((x) => x.status === 'ok').slice(0, 10).map((x) => ({ id: x.id, angle: x.angle, hook: x.hook })),
    creatives: { branch: creatives?.branch || null, items }, materials_verdict: materials?.verdict || null, past_best_ads: best,
    thresholds: ue?.thresholds ? { breakeven_cpa: ue.thresholds.breakeven_cpa, target_cpa: ue.thresholds.target_cpa } : null,
    rework: rework || null,
  };
}

export const SYSTEM_PROMPT = `You are the media strategist of an advertising agency. You prepare the STRATEGY of the first month for ONE client (Meta ads), as a structure that the manager approves.
You are given only facts: the brief, the budget with the number of campaigns it allows (counted for you), the margin of each product, the segments of the audience, the bank of ideas, the creatives that exist, the thresholds of the economics. Work ONLY from this. A source that is null does not exist.
You decide the STRUCTURE inside the limits that are given; you never count the money yourself:
1. "campaigns": at most budget.max_campaigns. Each has a name, the segments and products it serves, a "share_pct" of the daily budget (whole numbers, the shares are normalised by the code), a short "why", and "ad_groups": each group is for ONE segment (or "широка аудиторія" when the budget is small), with the ids of the creatives from "creatives.items" that go into it. With a small budget prefer one wide ad group per campaign and an optimisation for purchase.
2. "priorities": the products to push first. If priority.source is "client", follow the client's instruction (client_instruction) and use only products from the brief; if a chosen product has low_margin true, still follow the client but add the warning about the economics in "reason". If the source is "margin", choose products with a good margin and do NOT push a low_margin product separately.
3. "remarketing": for each funnel stage give the message: "visitors" (visited the site, did not buy), "cart" (added to the cart, did not buy), "checkout" (reached checkout, did not buy). Remarketing starts only when the daily budget reaches budget.remarketing_from_daily; say so in "note".
4. "seasonal": seasonal actions only with dates that stand in the input; otherwise an empty list.
5. "summary": two or three sentences for the client in plain words: what we do in the first month and why.
Rules: never invent a number, a date, a price, a result or a promise. A number may appear in a text only if it stands in the input. If "rework" is given, the manager or the client returned the previous strategy with a comment: change what the comment asks and keep the rest.
Write all text values in Ukrainian. Answer with ONE JSON object and nothing else (no markdown fence):
{"summary":"","priorities":[{"product":"","reason":""}],"campaigns":[{"name":"","segments":[""],"products":[""],"share_pct":50,"why":"","ad_groups":[{"name":"","segment":"","creative_ids":["c1"]}]}],"remarketing":{"visitors":"","cart":"","checkout":"","note":""},"seasonal":[{"what":"","when":""}]}`;

export function buildStrategyPrompt({ facts, language = 'uk' }) {
  return { system: SYSTEM_PROMPT, user: ['FACTS BY SOURCE (null = the source does not exist):', JSON.stringify(facts, null, 1), '', `Write the values in ${language === 'en' ? 'English' : 'Ukrainian'}.`].join('\n') };
}

export function parseStrategyAnswer(text) {
  const src = String(text || '').replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '');
  const a = src.indexOf('{'), b = src.lastIndexOf('}');
  if (a < 0 || b <= a) throw new Error('Модель відповіла не у форматі JSON: стратегію не прочитано.');
  let o; try { o = JSON.parse(src.slice(a, b + 1)); } catch { throw new Error('Модель повернула пошкоджений JSON: стратегію не прочитано.'); }
  if (!Array.isArray(o.campaigns)) throw new Error('У відповіді моделі немає кампаній.');
  return o;
}

// ---------------------------------------------------------------- checking the structure (the code owns the limits)
export function checkStrategy(raw, { facts, plan, margins, priority }) {
  const notes = [], warnings = [];
  const segNames = new Map((facts.segments || []).map((s) => [norm(s.name), s.name]));
  const prodNames = new Map((facts.brief.products || []).map((p) => [norm(p), p]));
  const creatives = new Map((facts.creatives.items || []).map((c) => [c.id, c]));
  const corpus = norm(JSON.stringify(facts)), nums = new Set(numbersOf(corpus));
  const stray = (text) => numbersOf(text).filter((n) => n.length > 1 && !nums.has(n));

  // campaigns: names, valid segments and products, groups with real creatives
  const camps = [];
  for (const c of raw.campaigns.slice(0, 12)) {
    const name = clip(c?.name, 80);
    if (!name || camps.some((x) => norm(x.name) === norm(name))) continue;
    const segments = [...new Set((Array.isArray(c.segments) ? c.segments : []).map((s) => segNames.get(norm(s))).filter(Boolean))];
    const products = [...new Set((Array.isArray(c.products) ? c.products : []).map((p) => prodNames.get(norm(p))).filter(Boolean))];
    const groups = (Array.isArray(c.ad_groups) ? c.ad_groups : []).slice(0, 6).map((g) => {
      const seg = segNames.get(norm(g?.segment)) || '';
      const ids = [...new Set((Array.isArray(g?.creative_ids) ? g.creative_ids : []).filter((id) => creatives.has(id)))];
      return { name: clip(g?.name, 80) || (seg ? `Аудиторія: ${seg}` : 'Широка аудиторія'), segment: seg, creatives: ids.map((id) => ({ id, tag: creatives.get(id).tag })) };
    });
    if (!groups.length) groups.push({ name: 'Широка аудиторія', segment: '', creatives: [] });
    camps.push({ name, segments, products, share_pct: num(c.share_pct), why: clip(c.why, 300), ad_groups: groups });
  }
  if (!camps.length) throw new Error('Модель не повернула жодної придатної кампанії.');
  const alloc = plan ? allocate(camps, plan) : { campaigns: camps.map((c) => ({ ...c, daily_budget: null })), dropped: [] };
  if (alloc.dropped.length) notes.push(`Кампаній більше, ніж дозволяє бюджет (до ${plan.max_campaigns}) або вони нижчі за мінімум ${plan.min_daily}: прибрано ${alloc.dropped.join(', ')}.`);
  if (plan?.below_minimum) warnings.push(`Бюджет на день (${plan.daily}) нижчий за мінімальний бюджет кампанії (${plan.min_daily}): одна кампанія працює нижче мінімуму, результат непередбачуваний.`);
  const created = new Set(alloc.campaigns.flatMap((c) => c.ad_groups.flatMap((g) => g.creatives.map((x) => x.id))));
  const unplaced = [...creatives.values()].filter((c) => ['ready', 'planned'].includes(c.status) && !created.has(c.id));
  if (unplaced.length) notes.push(`Креативи без групи: ${unplaced.map((c) => c.id).join(', ')}.`);

  // priorities: only products of the brief; the margin and the warning are added by code
  const pri = [];
  for (const p of (Array.isArray(raw.priorities) ? raw.priorities : []).slice(0, 8)) {
    const product = prodNames.get(norm(p?.product));
    if (!product) continue;
    const m = margins[norm(product)] || null;
    if (priority.source === 'margin' && m?.low) { notes.push(`«${product}»: низька маржа, окремо не рекламуємо (за правилом документа).`); continue; }
    const warn = priority.source === 'client' && m?.low ? `Увага: маржа товару низька (${m.margin_pct}%). Клієнт просить акцент, рішення за клієнтом, але економіка слабка.` : '';
    if (warn) warnings.push(`«${product}»: ${warn}`);
    pri.push({ product, reason: clip(p.reason, 300), margin_pct: m?.margin_pct ?? null, low_margin: !!m?.low, warning: warn });
  }
  if (!pri.length) warnings.push('Пріоритетні товари не визначено: перегляньте бриф (рядок про акцент на товари) і ціни.');

  const rem = raw.remarketing && typeof raw.remarketing === 'object' ? raw.remarketing : {};
  const on = plan ? plan.daily >= plan.remarketing_from_daily : false;
  const stages = [['visitors', 'Відвідувачі сайту, які не купили'], ['cart', 'Додали в кошик, але не купили'], ['checkout', 'Дійшли до оформлення, але не купили']].map(([k, label]) => ({ stage: k, label, message: clip(rem[k], 240) }));
  const seasonal = (Array.isArray(raw.seasonal) ? raw.seasonal : []).map((s) => ({ what: clip(s?.what, 160), when: clip(s?.when, 80) })).filter((s) => s.what && s.when && !stray(`${s.what} ${s.when}`).length).slice(0, 6);

  const summary = clip(raw.summary, 600);
  const bad = [summary, ...alloc.campaigns.map((c) => c.why), ...pri.map((p) => p.reason), ...stages.map((s) => s.message)].flatMap((t) => stray(t));
  if (bad.length) warnings.push(`У текстах є числа, яких немає у вхідних даних: ${[...new Set(bad)].slice(0, 4).join(', ')}. Менеджеру варто перевірити.`);
  return { summary, priorities: pri, campaigns: alloc.campaigns, remarketing: { enabled: on, from_daily: plan?.remarketing_from_daily ?? null, note: clip(rem.note, 240), stages }, seasonal, notes, warnings };
}

// ---------------------------------------------------------------- the text of the section
export function renderStrategyText(s) {
  const out = ['Стратегія першого місяця (версія ' + (s.version || 1) + ').'];
  if (s.rework) out.push(`Це доопрацювання за коментарем: «${s.rework.comment}».`);
  if (s.summary) out.push('', s.summary);
  out.push('', 'Що хочемо отримати', `Ціль із брифу: ${s.goal.text || 'не вказано'}.`);
  if (s.goal.base) out.push(`Базовий сценарій (бюджет ${s.goal.base.monthly_budget} ${s.currency}): близько ${s.goal.base.orders_at_target} замовлень при цільовому CPA, беззбиткових ${s.goal.base.orders_to_break_even}.`);
  out.push('', `Пріоритети (${s.priority_source === 'client' ? 'за вказівкою клієнта' : 'за маржею з Unit Economy'})`);
  s.priorities.forEach((p, i) => out.push(`${i + 1}. ${p.product}${p.margin_pct != null ? ` (маржа ${p.margin_pct}%)` : ''}: ${p.reason}${p.warning ? ' ' + p.warning : ''}`));
  if (!s.priorities.length) out.push('Не визначено.');
  out.push('', 'Бюджет');
  if (s.budget) {
    out.push(`${s.budget.monthly} ${s.currency} на місяць, ${s.budget.daily} на день; мінімум на кампанію ${s.budget.min_daily}; бюджет дозволяє кампаній: до ${s.budget.max_campaigns}.`);
    s.budget.scenarios.forEach((x) => out.push(`• ${x.name}: ${x.monthly_budget} на місяць, ${x.orders_at_target} замовлень при цільовому CPA.`));
  } else out.push('Місячний бюджет не вказано.');
  out.push('', 'Схема першого місяця: кампанії → групи оголошень → креативи');
  s.campaigns.forEach((c, i) => {
    out.push(`${i + 1}. ${c.name}${c.daily_budget != null ? ` · ${c.daily_budget} на день` : ''}${c.products.length ? ` · товари: ${c.products.join(', ')}` : ''}`, c.why ? `   Навіщо: ${c.why}` : '');
    c.ad_groups.forEach((g) => out.push(`   Група «${g.name}»: ${g.creatives.length ? g.creatives.map((x) => x.tag).join(' | ') : 'креативів поки немає'}`));
  });
  out.push('', 'Що вмикаємо пізніше');
  out.push(s.remarketing.enabled ? 'Ремаркетинг: бюджет достатній, вмикаємо після того, як холодні кампанії наберуть аудиторію.' : `Ремаркетинг: поки не вмикаємо, бюджет на день менший за ${s.remarketing.from_daily ?? '—'} (мінімум кампанії ×${PARAMS.remarketing_min_daily_factor}, припущення).`);
  s.remarketing.stages.filter((x) => x.message).forEach((x) => out.push(`• ${x.label}: ${x.message}`));
  s.seasonal.forEach((x) => out.push(`• Сезонне: ${x.what} (${x.when})`));
  out.push('Нові креативи: беруться з банку ідей і погоджуються клієнтом перед запуском. Каталожна реклама: пізніше, потрібен каталог товарів.');
  out.push('', 'Що потрібно від клієнта до запуску (дати запропоновано, узгодьте з клієнтом)');
  s.needed_from_client.forEach((x) => out.push(`• ${x.what} · до ${x.due} (${x.source})`));
  if (!s.needed_from_client.length) out.push('• Нічого: піксель працює, матеріалів достатньо.');
  out.push('', 'Як оптимізуємо', ...s.optimisation.rules.map((r) => `• ${r}`));
  if (s.notes.length || s.warnings.length) { out.push('', 'Увага'); [...s.warnings, ...s.notes].forEach((t) => out.push(`• ${t}`)); }
  if (s.assumptions.length) { out.push('', 'Припущення'); s.assumptions.forEach((t) => out.push(`• ${t}`)); }
  return out.filter((l, i, a) => !(l === '' && a[i - 1] === '')).join('\n');
}
