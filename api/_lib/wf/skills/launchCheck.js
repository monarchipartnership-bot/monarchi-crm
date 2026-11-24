// The Media buyer's skill «launch_check»: «can the agents WRITE to this cabinet?» WITHOUT creating anything (found by the pilot: the launch failed on the first real write because the
// token only read). Meta's own mode validate_only runs the whole permission check of a campaign creation and creates nothing. Started by hand (never by the orchestrator).
import { otherPlatformsNote } from './platforms.js';

export async function launchCheck({ run, ctx }) {
  const all = await ctx.repo.listAdAccounts(run.project_id);
  const accounts = all.filter((a) => a.platform === 'meta');
  if (!accounts.length) throw new Error('До проєкту не підключено рекламний кабінет Meta.' + otherPlatformsNote(all));
  if (!ctx.metaWrite) throw new Error('Немає права запису в кабінет: у Vercel не задано META_WRITE_TOKEN (або META_ACCESS_TOKEN) з правом ads_management. Нічого не змінено.');
  const accountId = accounts[0].account_id;
  let info = null; try { info = await ctx.metaWrite.accountInfo({ accountId }); } catch { info = null; }
  try {
    await ctx.metaWrite.validateWrite({ accountId });
  } catch (e) {
    let why = '';
    try { const d = typeof ctx.metaWrite.diagnose === 'function' ? await ctx.metaWrite.diagnose() : null; if (d) why = d.error ? ` Діагностика не вдалася: ${d.error}` : d.hasManagement ? ` Токен${d.who ? ' ' + d.who : ''} має право ads_management, отже користувачу токена не призначено цей кабінет із правом керувати кампаніями.` : ` Токен${d.who ? ' ' + d.who : ''} має лише права: ${d.permissions.join(', ') || 'немає'}; потрібне ads_management.`; } catch { /* the original error stays */ }
    throw new Error(`Право запису в кабінет НЕ підтверджено: ${e.message}${why} Нічого не створено.`);
  }
  return {
    output: { writable: true, account: accountId, name: info?.name || null },
    steps: [{ title: `Право запису в кабінет ${info?.name || accountId} підтверджено (перевірка без створення кампаній)`, status: 'done' }],
  };
}
