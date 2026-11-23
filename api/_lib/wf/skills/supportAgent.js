// The Support agent's skills (step A10; document: stage 0 «Старт проєкту», «Супровід клієнта», «Прибутковість у звітах»). Everything here is a DRAFT or a TASK for the manager:
// the system never writes to a client. A draft lives in the pool of tasks (type «client», owner «manager», the text in the evidence).
//   onboarding        the checklist of the new project and the greeting draft
//   payment_reminder  daily: the date and the sum from the brief; when the payment is near or overdue, a reminder and a draft
//   weekly_report / monthly_report   the figures of the period from the cabinet, the profit after ads (code), a short explanation and the draft of the message (model)
import { agg } from './optimizeEngine.js';
import { REMIND_DAYS, buildFeedbackPrompt, checkFeedback, draftOf, feedbackFacts, nextPayment, onboardingChecklist, parseFeedbackAnswer, profitability, renderFeedbackText } from './supportEngine.js';

const DAY = 864e5;
export const DRAFT = 'Чернетка:\n'; // a task whose evidence begins with this is a draft of a message to the client (the page shows it in a box with «Скопіювати»)
const ymd = (d) => d.toISOString().slice(0, 10);
const nameOf = (p) => String(p?.client || p?.name || '').trim();

export async function onboarding({ run, ctx }) {
  const project = await ctx.repo.readProject(run.project_id);
  const accounts = await ctx.repo.listAdAccounts(run.project_id);
  const lang = project?.client_language === 'en' ? 'en' : 'uk';
  const tasks = onboardingChecklist({ hasAccount: accounts.length > 0, website: project?.website });
  tasks.push({ type: 'client', owner: 'manager', priority: 'medium', title: 'Надіслати клієнту вітання (чернетка)', evidence: DRAFT + draftOf('greet', lang, { client: nameOf(project), manager: project?.manager || '' }) });
  return { tasks, steps: [{ title: `Чеклист нового проєкту: пунктів ${tasks.length - 1}` }, { title: 'Підготовлено чернетку вітання для менеджера' }], output: { checklist: tasks.length - 1 } };
}

export async function paymentReminder({ run, ctx }) {
  const brief = (await ctx.repo.readSection(run.project_id, 'brief'))?.version?.content || null;
  const g = brief?.general || {};
  const next = nextPayment({ date: g.payment_next_date, period: g.payment_period }, (ctx.now || (() => new Date()))());
  if (!next) return { output: { skipped: true }, steps: [{ title: 'Дату наступної оплати в брифі не вказано: нагадувати нема про що', status: 'info' }] };
  if (next.daysLeft > REMIND_DAYS) return { output: { next: next.date, days_left: next.daysLeft }, steps: [{ title: `Найближча оплата ${next.date}: нагадування буде за ${REMIND_DAYS} дні` }] };
  const project = await ctx.repo.readProject(run.project_id);
  const lang = project?.client_language === 'en' ? 'en' : 'uk';
  const overdue = next.daysLeft < 0;
  const amount = String(g.payment_amount || '').trim();
  const title = overdue ? `Оплата прострочена (${next.date}): нагадати клієнту${amount ? ` про ${amount}` : ''}` : `Нагадати клієнту про оплату${amount ? ` ${amount}` : ''} до ${next.date}`;
  return {
    tasks: [{ type: 'client', owner: 'manager', priority: overdue || next.daysLeft <= 1 ? 'high' : 'medium', title, evidence: DRAFT + draftOf('pay', lang, { client: nameOf(project), amount, date: next.date, overdue }), due_date: next.date }],
    steps: [{ title: `Оплата ${next.date}${overdue ? ' прострочена' : ` через ${next.daysLeft} дн.`}: підготовлено нагадування й чернетку` }],
    output: { next: next.date, days_left: next.daysLeft, overdue },
  };
}

// the weekly report: the last 7 full days against the 7 before; the monthly one: the last full calendar month against the month before
export function periodsOf(kind, now) {
  const today = new Date(ymd(now) + 'T00:00:00Z');
  if (kind === 'month') {
    const first = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, 1)), last = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 0)), pFirst = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 2, 1)), pLast = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, 0));
    return { cur: { since: ymd(first), until: ymd(last) }, prev: { since: ymd(pFirst), until: ymd(pLast) }, label: `місяць ${ymd(first).slice(0, 7)}` };
  }
  const until = new Date(today - DAY), since = new Date(today - 7 * DAY), pUntil = new Date(today - 8 * DAY), pSince = new Date(today - 14 * DAY);
  return { cur: { since: ymd(since), until: ymd(until) }, prev: { since: ymd(pSince), until: ymd(pUntil) }, label: `тиждень ${ymd(since)} – ${ymd(until)}` };
}

const feedback = (kind) => async ({ run, ctx }) => {
  const accounts = (await ctx.repo.listAdAccounts(run.project_id)).filter((a) => a.platform === 'meta');
  const snap = (await ctx.repo.readSection(run.project_id, 'launch'))?.version?.content || null;
  if (!accounts.length || snap?.status !== 'done') return { output: { skipped: true }, steps: [{ title: 'Запуску ще немає: звітувати нема про що', status: 'info' }] };
  if (!ctx.meta?.insights) throw new Error('Немає доступу до Meta: у змінних середовища Vercel не задано META_ACCESS_TOKEN.');
  if (!ctx.ask) throw new Error('Немає доступу до моделі: у змінних середовища Vercel не задано ANTHROPIC_API_KEY.');
  const now = (ctx.now || (() => new Date()))();
  const p = periodsOf(kind, now);
  const accountId = accounts[0].account_id;
  const read = async (w) => (await ctx.meta.insights({ accountId, level: 'ad', timeRange: w, maxPages: 10, limit: 500 })).rows;
  const curRows = await read(p.cur), prevRows = await read(p.prev);
  const cur = agg(curRows), prev = agg(prevRows);
  const brief = (await ctx.repo.readSection(run.project_id, 'brief'))?.version?.content || null;
  const econ = brief?.economics || {};
  const profit = profitability(cur, econ), profitPrev = profitability(prev, econ);
  const byAd = new Map(); for (const r of curRows) { const k = r.ad_id; if (!byAd.has(k)) byAd.set(k, { name: r.name || k, rows: [] }); byAd.get(k).rows.push(r); }
  const ads = [...byAd.values()].map((x) => ({ name: x.name, ...agg(x.rows) })).filter((x) => x.spend > 0);
  const best = ads.filter((x) => x.purchases > 0).sort((a, b) => a.cpa - b.cpa).map((x) => ({ name: x.name, orders: x.purchases, cpa: x.cpa, roas: x.roas }));
  const worst = ads.filter((x) => x.purchases === 0).sort((a, b) => b.spend - a.spend).map((x) => ({ name: x.name, spend: x.spend, orders: 0 }));
  const last = ctx.repo.lastJournal ? await ctx.repo.lastJournal(run.project_id, 'optimize') : null;
  const advice = (last?.meta?.actions || []).slice(0, 3).map((a) => `${a.name}: ${a.reason}`);
  const facts = feedbackFacts({ now, period: p.label, cur, prev, profit, profitPrev, thresholds: snap.targets, best, worst, advice, currency: snap.account?.currency });
  const project = await ctx.repo.readProject(run.project_id);
  const prompt = buildFeedbackPrompt({ facts, language: project?.client_language === 'en' ? 'en' : 'uk' });
  const answer = await ctx.ask({ projectId: run.project_id, runId: run.id, system: prompt.system, user: prompt.user, maxTokens: 2500 });
  const fb = checkFeedback(parseFeedbackAnswer(answer.text), facts);
  const text = renderFeedbackText({ period: p.label, facts, profit, fb });
  return {
    tasks: [{ type: 'client', owner: 'manager', priority: 'medium', title: `Фідбек за ${p.label}: перевірити й надіслати клієнту`, evidence: text }],
    steps: [{ title: `Прочитано кабінет: ${p.label}, витрачено ${cur.spend}, покупок ${cur.purchases}` }, { title: profit.available ? `Прибуток після реклами: ${profit.profit_total} (${profit.profitable ? 'прибутково' : 'збитково'})` : `Прибуток не пораховано: ${profit.reason}`, status: profit.available ? undefined : 'info' }, { title: fb.stray.length ? `Чернетку підготовлено, але в тексті числа без джерела: ${fb.stray.length}` : 'Підготовлено чернетку листа клієнту', status: fb.stray.length ? 'info' : undefined }],
    output: { period: p.label, profit: profit.available ? profit.profit_total : null, stray: fb.stray.length },
    costUsd: answer.costUsd || 0,
  };
};
export const weeklyReport = feedback('week');
export const monthlyReport = feedback('month');
