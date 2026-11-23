// The Support agent (step A10; document: «Супровід клієнта: що ще робить система» and «Прибутковість у звітах»). PURE: no network, no model, no clock.
// Everything is prepared as a DRAFT or a TASK for the manager: «Усе готується як чернетка, клієнту відправляє людина». A draft lives in the pool of tasks (type «client», owner «manager»,
// the text in the evidence), so there is ONE list for a person, not a new place.
//   onboarding        → the checklist of a new project and the greeting draft (templates: no model, so nothing can be invented)
//   payment reminder  → the date and the sum come from the BRIEF (one place for everything the manager fills in); the draft and the reminder for the manager
//   weekly / monthly  → the numbers of the cabinet and the PROFIT after ads and all costs (counted by code, document: «рахує прибуток після реклами і всіх витрат, на одиницю і загалом»),
//                       a short plain explanation of the results as a specialist would give it, and the draft of the message to the client (model, checked against the numbers)
const clip = (s, n) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const norm = (s) => String(s || '').toLowerCase().replace(/[«»"“”„'’`]/g, '').replace(/\s+/g, ' ').trim();
const numbersOf = (s) => (String(s || '').match(/\d[\d.,]*\d|\d/g) || []).map((n) => n.replace(/[.,]$/, ''));
const num = (v) => { const x = Number(v); return v !== '' && v != null && Number.isFinite(x) ? x : null; };
const r2 = (x) => Math.round(x * 100) / 100;
const DAY = 864e5;

// ---------------------------------------------------------------- the payment calendar
// the brief says the date of the next payment and how often it repeats («щомісяця» or one-time). → { date: 'YYYY-MM-DD', daysLeft } or null
export function nextPayment({ date, period }, now) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || ''))) return null;
  let d = new Date(date + 'T00:00:00Z');
  if (Number.isNaN(d.getTime())) return null;
  const today = new Date(now.toISOString().slice(0, 10) + 'T00:00:00Z');
  const monthly = /щомісяц|monthly|кожн.* місяц/i.test(String(period || ''));
  if (monthly) { let n = 0; while (d < today && n < 240) { d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate())); n += 1; } }
  return { date: d.toISOString().slice(0, 10), daysLeft: Math.round((d - today) / DAY), monthly };
}
export const REMIND_DAYS = 3; // a reminder is prepared this many days before the payment (and every time the payment is overdue)

// ---------------------------------------------------------------- the drafts (templates, the language of the client)
const T = {
  uk: {
    greet: ({ client, manager }) => `Добрий день${client ? `, ${client}` : ''}!\n\nВітаємо вас у Mon'Archi. Ми розпочинаємо роботу над вашим проєктом${manager ? `, ваш менеджер ${manager}` : ''}. Найближчими днями ми ознайомимося з вашими матеріалами й рекламним кабінетом, підготуємо стратегію запуску й надішлемо її вам на погодження.\n\nЩоб почати, нам знадобляться доступи до рекламного кабінету й аналітики сайту та матеріали вашого бренду (логотип, фото й відео товарів). Якщо щось із цього вже є, надішліть, будь ласка, в цей чат.\n\nГарного дня!`,
    pay: ({ client, amount, date, overdue }) => `Добрий день${client ? `, ${client}` : ''}!\n\n${overdue ? `Нагадуємо, що оплата${amount ? ` у розмірі ${amount}` : ''} мала надійти ${date}. Якщо ви вже оплатили, дякуємо і просимо пробачення за повідомлення.` : `Нагадуємо, що ${date} очікується оплата${amount ? ` у розмірі ${amount}` : ''} за послуги по проєкту.`}\n\nЯкщо потрібен рахунок або є запитання, напишіть нам.\n\nДякуємо!`,
  },
  en: {
    greet: ({ client, manager }) => `Hello${client ? `, ${client}` : ''}!\n\nWelcome to Mon'Archi. We are starting work on your project${manager ? `; your manager is ${manager}` : ''}. In the next few days we will study your materials and ad account, prepare the launch strategy and send it to you for approval.\n\nTo begin, we will need access to your ad account and website analytics and your brand materials (logo, product photos and videos). If you already have any of this, please send it to this chat.\n\nHave a great day!`,
    pay: ({ client, amount, date, overdue }) => `Hello${client ? `, ${client}` : ''}!\n\n${overdue ? `A reminder: the payment${amount ? ` of ${amount}` : ''} was due on ${date}. If you have already paid, thank you, and please ignore this message.` : `A reminder that a payment${amount ? ` of ${amount}` : ''} is expected on ${date} for the services on the project.`}\n\nIf you need an invoice or have questions, please write to us.\n\nThank you!`,
  },
};
export const draftOf = (kind, lang, data) => (T[lang === 'en' ? 'en' : 'uk'][kind])(data);

// the checklist of a new project (document, stage 0: «Створено чат проєкту», доступи до кабінетів, паралельна розробка бота); each item is a task for the manager
export function onboardingChecklist({ hasAccount, website }) {
  const items = [
    ['Створити чат проєкту й додати клієнта', 'Умова старту з документа: чат проєкту створено.'],
    ['Записати в картці проєкту, чи йде паралельно розробка бота', 'Якщо йде, це зазначається в картці (процес описано в адаптації проєкту).'],
    ['Узгодити з клієнтом спосіб зв’язку й день тижневого звіту', 'Від цього залежать листи за звітом.'],
    ['Попросити в клієнта доступ до аналітики сайту (GA4)', 'Без нього аудиторія береться лише з брифу й кабінету.'],
  ];
  if (!hasAccount) items.unshift(['Отримати доступ до рекламного кабінету клієнта й підключити його до проєкту', 'Якщо клієнт уже рекламувався, агент-дослідник читає кабінет.']);
  if (!String(website || '').trim()) items.unshift(['Вказати сайт клієнта в картці проєкту', 'Без сайту не можна зробити огляд сайту й посилання з UTM-мітками.']);
  return items.map(([title, evidence]) => ({ type: 'client', owner: 'manager', priority: 'medium', title, evidence }));
}

// ---------------------------------------------------------------- the profit after ads (document: «Прибутковість у звітах»)
// rows: totals of the period from the cabinet { spend, purchases, revenue }; economics: the brief's numbers (cogs_pct, fee_pct, returns_pct, shipping_cost)
// → null when something that is needed is missing, else per order and total
export function profitability(totals, economics) {
  const e = economics || {};
  const spend = num(totals?.spend), orders = num(totals?.purchases), revenue = num(totals?.revenue);
  if (spend == null || !orders || !revenue || num(e.cogs_pct) == null) return { available: false, reason: !orders ? 'У періоді немає покупок за даними кабінету.' : num(e.cogs_pct) == null ? 'У брифі немає собівартості: прибуток порахувати не можна.' : 'Немає виручки за даними кабінету.' };
  const aov = revenue / orders;
  const cogs = (num(e.cogs_pct) / 100) * aov, fees = ((num(e.fee_pct) || 0) / 100) * aov, ret = ((num(e.returns_pct) || 0) / 100) * aov, ship = num(e.shipping_cost) || 0;
  const contribution = aov - cogs - fees - ret - ship;
  const total = contribution * orders - spend;
  return { available: true, orders, revenue: r2(revenue), spend: r2(spend), aov: r2(aov), cost_per_order: r2(cogs + fees + ret + ship), contribution_per_order: r2(contribution), ad_cost_per_order: r2(spend / orders), profit_per_order: r2(total / orders), profit_total: r2(total), roas: r2(revenue / spend), profitable: total > 0 };
}

// ---------------------------------------------------------------- the feedback by results: the facts, the prompt, the check
export function feedbackFacts({ now, period, cur, prev, profit, profitPrev, thresholds, best, worst, advice, currency }) {
  const change = (a, b) => (a != null && b != null && b > 0 ? Math.round(((a - b) / b) * 100) : null);
  return {
    period, currency, thresholds: { breakeven_cpa: thresholds?.breakeven_cpa ?? null, target_cpa: thresholds?.target_cpa ?? null, breakeven_roas: thresholds?.breakeven_roas ?? null, target_roas: thresholds?.target_roas ?? null },
    now: { spend: cur.spend, orders: cur.purchases, revenue: cur.revenue, roas: cur.roas, cpa: cur.cpa, ctr_pct: cur.ctr },
    before: prev ? { spend: prev.spend, orders: prev.purchases, roas: prev.roas, cpa: prev.cpa } : null,
    change_pct: prev ? { spend: change(cur.spend, prev.spend), orders: change(cur.purchases, prev.purchases), cpa: change(cur.cpa, prev.cpa) } : null,
    profit: profit.available ? { profit_total: profit.profit_total, profit_per_order: profit.profit_per_order, contribution_per_order: profit.contribution_per_order, profitable: profit.profitable, roas: profit.roas } : { unavailable: profit.reason },
    profit_before: profitPrev?.available ? { profit_total: profitPrev.profit_total } : null,
    best_ads: best.slice(0, 3), worst_ads: worst.slice(0, 2), optimizer_advice: advice || [],
  };
}

export const SYSTEM_PROMPT = `You are a media buyer of an advertising agency writing a short, plain-spoken feedback on the results of ONE client's Meta ads for the period given, the way an experienced specialist explains it to a business owner who is not a marketer.
You are given only facts: the figures of the period and of the previous one, the thresholds of the client's economics, the profit after ads (counted for you), the best and worst ads, and the advice of the optimiser. Work ONLY from this. Never invent a figure, a cause, a result or a plan. If the data is too small to say something, say so plainly.
Produce:
1. "explanation": 3 to 5 short sentences: how the period went, is it profitable (say the profit if it is given), what is better or worse than before, and the main reason you can SEE in the data. No jargon without a plain word next to it.
2. "highlights": up to 3 short points (what worked, what did not).
3. "next_steps": up to 3 short points of what we will do next, taken from the advice of the optimiser; do not promise results.
4. "draft": a short message to the client for the manager to send: a greeting, the explanation in plain words, the next steps, and a polite closing. Do not make promises or guarantees.
Write all text values in Ukrainian. A figure may appear in a text only if it stands in the input.
Answer with ONE JSON object and nothing else (no markdown fence):
{"explanation":"","highlights":[""],"next_steps":[""],"draft":""}`;

export function buildFeedbackPrompt({ facts, language = 'uk' }) {
  return { system: SYSTEM_PROMPT, user: ['FACTS:', JSON.stringify(facts, null, 1), '', `Write the values in ${language === 'en' ? 'English' : 'Ukrainian'}.`].join('\n') };
}

export function parseFeedbackAnswer(text) {
  const src = String(text || '').replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '');
  const a = src.indexOf('{'), b = src.lastIndexOf('}');
  if (a < 0 || b <= a) throw new Error('Модель відповіла не у форматі JSON: фідбек не прочитано.');
  let o; try { o = JSON.parse(src.slice(a, b + 1)); } catch { throw new Error('Модель повернула пошкоджений JSON: фідбек не прочитано.'); }
  if (!clip(o.explanation, 10) || !clip(o.draft, 10)) throw new Error('У відповіді моделі немає пояснення або чернетки.');
  return o;
}

// a figure in a text must stand in the facts; what does not is listed, and the draft is marked for the manager
export function checkFeedback(raw, facts) {
  const nums = new Set(numbersOf(norm(JSON.stringify(facts))));
  const arr = (x, n) => (Array.isArray(x) ? x : []).map((t) => clip(t, 220)).filter(Boolean).slice(0, n);
  const out = { explanation: clip(raw.explanation, 900), highlights: arr(raw.highlights, 3), next_steps: arr(raw.next_steps, 3), draft: String(raw.draft || '').trim().slice(0, 2500) };
  const stray = [...new Set(numbersOf(`${out.explanation} ${out.highlights.join(' ')} ${out.next_steps.join(' ')} ${out.draft}`).filter((n) => n.length > 1 && !nums.has(n)))];
  return { ...out, stray };
}

export function renderFeedbackText({ period, facts, profit, fb }) {
  const out = [`Фідбек за результатами: ${period}.`];
  out.push(`Цифри: витрачено ${facts.now.spend}, покупок ${facts.now.orders}${facts.now.cpa != null ? `, ціна покупки ${facts.now.cpa}` : ''}${facts.now.roas != null ? `, ROAS ${facts.now.roas}` : ''}.`);
  out.push(profit.available ? `Прибуток після реклами й усіх витрат: ${profit.profit_total} (${profit.profit_per_order} на замовлення; внесок до реклами ${profit.contribution_per_order}, реклама ${profit.ad_cost_per_order} на замовлення). ${profit.profitable ? 'Реклама прибуткова.' : 'Реклама поки збиткова.'}` : `Прибуток не пораховано: ${profit.reason}`);
  out.push('', fb.explanation);
  if (fb.highlights.length) out.push('', 'Головне', ...fb.highlights.map((h) => `• ${h}`));
  if (fb.next_steps.length) out.push('', 'Що далі', ...fb.next_steps.map((h) => `• ${h}`));
  if (fb.stray.length) out.push('', `Увага: у тексті є числа, яких немає в даних (${fb.stray.slice(0, 4).join(', ')}): перевірте перед відправкою.`);
  out.push('', 'Чернетка листа клієнту', fb.draft);
  return out.join('\n');
}
