// The Researcher's skill «intake» (step A4; document 1.1 «Перевіряє, чи є дані в кабінетах: від цього залежить, чи буде аудит»).
// It looks at the Meta ad account linked to the project: was money ever spent there? The answer (has_data) decides whether the audit is made.
// No account linked: the run waits and a task asks the manager to link it (it wakes up when an account appears).
// ctx.meta = { insights({ accountId, level, datePreset, timeRange }) } is the Meta reader (api/_lib/metaAdsData.js); the tests give a fake one.

// rows of the lifetime insights → { spend, impressions, purchases, from, to }
export function summarizeLifetime(rows = []) {
  const sum = (k) => rows.reduce((s, r) => s + (Number(r[k]) || 0), 0);
  const from = rows.map((r) => r.period?.from_date).filter(Boolean).sort()[0] || null;
  const to = rows.map((r) => r.period?.to_date).filter(Boolean).sort().pop() || null;
  return { spend: Math.round(sum('spend') * 100) / 100, impressions: sum('impressions'), purchases: sum('purchases'), leads: sum('leads'), from, to };
}

export async function intake({ run, ctx }) {
  const accounts = (await ctx.repo.listAdAccounts(run.project_id)).filter((a) => a.platform === 'meta');
  if (!accounts.length) {
    return {
      blocked: { on: 'accounts:meta', reason: 'До проєкту не підключено рекламний кабінет Meta.' },
      tasks: [{ type: 'ads', owner: 'manager', priority: 'high', title: 'Підключити рекламний кабінет Meta до проєкту', evidence: 'Без кабінету не можна перевірити, чи є дані для аудиту. Підключіть кабінет у картці проєкту (Інформація про проєкт, кабінети).' }],
      steps: [{ title: 'Кабінет Meta не підключено: перевірку відкладено', status: 'info' }],
    };
  }
  if (!ctx.meta?.insights) throw new Error('Немає доступу до Meta: у змінних середовища Vercel не задано META_ACCESS_TOKEN.');
  const found = [];
  for (const a of accounts) {
    const res = await ctx.meta.insights({ accountId: a.account_id, level: 'account', datePreset: 'maximum' });
    found.push({ account: res.account || 'act_' + a.account_id, ...summarizeLifetime(res.rows) });
  }
  const spend = Math.round(found.reduce((s, x) => s + x.spend, 0) * 100) / 100;
  const hasData = spend > 0;
  return {
    stateUpdate: { has_data: hasData },
    steps: [
      { title: `Перевірено кабінетів Meta: ${found.length}`, detail: { accounts: found } },
      { title: hasData ? `У кабінеті є дані (витрачено ${spend}): буде аудит` : 'У кабінеті немає витрат: аудиту не буде', status: 'info' },
    ],
    output: { has_data: hasData, spend, accounts: found },
  };
}
