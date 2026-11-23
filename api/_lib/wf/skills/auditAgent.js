// The Researcher's skill «audit» (step A4; document 1.2): reads the Meta account (auditData.js), counts the audit against the thresholds of the Unit Economy
// (auditEngine.js) and writes the section «Аудит кабінету». The audit is made only when the account holds data (the stage decides that, see intake.js).
import { otherPlatformsNote } from './platforms.js';
import { collectAuditData } from './auditData.js';
import { computeAudit, renderAuditText } from './auditEngine.js';

export async function audit({ run, ctx }) {
  const allAccounts = await ctx.repo.listAdAccounts(run.project_id);
  const accounts = allAccounts.filter((a) => a.platform === 'meta');
  if (!accounts.length) return { blocked: { on: 'accounts:meta', reason: 'До проєкту не підключено рекламний кабінет Meta.' + otherPlatformsNote(allAccounts) }, tasks: [{ type: 'ads', owner: 'manager', priority: 'high', title: 'Підключити рекламний кабінет Meta до проєкту', evidence: 'Без кабінету аудит неможливий.' + otherPlatformsNote(allAccounts) }], steps: [{ title: 'Кабінет Meta не підключено', status: 'info' }] };
  if (!ctx.meta?.insights) throw new Error('Немає доступу до Meta: у змінних середовища Vercel не задано META_ACCESS_TOKEN.');
  // the thresholds of the Unit Economy: if that skill is still working, wait for it (the audit is judged against break-even); if it is itself waiting for the brief, go on without
  const snap = await ctx.repo.loadSnapshot(run.project_id);
  const ueBusy = snap.runs.some((r) => r.agent === 'researcher' && r.skill === 'unit_economy' && ['queued', 'running'].includes(r.status));
  const ue = await ctx.repo.readSection(run.project_id, 'unit_economy');
  const th = ue?.version?.content?.thresholds || null;
  if (!th && ueBusy) return { blocked: { on: 'unit_economy', reason: 'Аудит чекає на Unit Economy, щоб оцінювати проти беззбитковості.' }, steps: [{ title: 'Чекаємо Unit Economy', status: 'info' }] };

  const account = accounts[0];
  const data = await collectAuditData(ctx.meta, account);
  const thresholds = th ? { breakeven_roas: th.breakeven_roas, target_roas: th.target_roas, breakeven_cpa: th.breakeven_cpa, target_cpa: th.target_cpa } : null;
  const result = computeAudit({ ...data, now: (ctx.now ? ctx.now() : new Date()).toISOString() }, thresholds);
  if (data.errors.length) result.open.push(`Не вдалося прочитати частину даних Meta: ${data.errors.join('; ')}.`);
  if (!thresholds) result.open.push('Аудит зроблено без порогів Unit Economy: «збитково чи ні» не оцінювалось. Після розрахунку Unit Economy запустіть аудит ще раз.');
  return {
    writes: [{ key: 'audit', body: renderAuditText(result), content: result, sources: [{ title: `Meta Ads, кабінет act_${String(account.account_id).replace(/\D/g, '')}` }] }],
    steps: [{ title: `Прочитано кабінет Meta: ${data.monthly.length} місяців, ${data.campaigns.length} кампаній` }, { title: 'Пораховано аудит', detail: { kind: result.resultKind, judged_by_thresholds: !!thresholds } }],
    output: { kind: result.resultKind, errors: data.errors },
  };
}
