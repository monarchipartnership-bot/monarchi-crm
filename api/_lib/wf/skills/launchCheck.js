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
  // run.input.read_only: for a real client's cabinet nothing is sent to the write endpoints at all, only reads (who the token is, which pages the cabinet may promote)
  const readOnly = run.input?.read_only === true;
  try {
    if (!readOnly) await ctx.metaWrite.validateWrite({ accountId });
  } catch (e) {
    let why = '';
    try { const d = typeof ctx.metaWrite.diagnose === 'function' ? await ctx.metaWrite.diagnose() : null; if (d) why = d.error ? ` Діагностика не вдалася: ${d.error}` : d.hasManagement ? ` Токен${d.who ? ' ' + d.who : ''} має право ads_management, отже користувачу токена не призначено цей кабінет із правом керувати кампаніями.` : ` Токен${d.who ? ' ' + d.who : ''} має лише права: ${d.permissions.join(', ') || 'немає'}; потрібне ads_management.`; } catch { /* the original error stays */ }
    throw new Error(`Право запису в кабінет НЕ підтверджено: ${e.message}${why} Нічого не створено.`);
  }
  // the page the ads are published from must be one the cabinet may promote
  const brief = (await ctx.repo.readSection(run.project_id, 'brief'))?.version?.content || {};
  const pageId = String(brief.general?.fb_page_id || '').replace(/\D/g, '');
  let pages = null;
  if (typeof ctx.metaWrite.promotePages === 'function') { try { pages = await ctx.metaWrite.promotePages({ accountId }); } catch (e) { pages = null; } }
  const steps = [readOnly ? { title: `Кабінет ${info?.name || accountId}${info?.status === 1 ? ' активний' : ''}: право запису не перевірялось (режим лише читання)`, status: 'info' } : { title: `Право запису в кабінет ${info?.name || accountId} підтверджено (перевірка без створення кампаній)`, status: 'done' }];
  if (pages) {
    const found = pages.find((p) => p.id === pageId);
    const list = pages.map((p) => `${p.name || '—'} (${p.id})`).join('; ') || 'жодної';
    if (!pageId) steps.push({ title: `ID сторінки Facebook у брифі не вказано. Кабінет може рекламувати: ${list}`, status: 'info' });
    else if (found) steps.push({ title: `Сторінка ${found.name || pageId} доступна для реклами з цього кабінету`, status: 'done' });
    else {
      let who = ''; try { const d = typeof ctx.metaWrite.diagnose === 'function' ? await ctx.metaWrite.diagnose() : null; if (d) who = ` Токен: ${d.who || '—'}; права: ${d.permissions.join(', ') || '—'}; сторінки, доступні користувачу токена: ${(d.pages || []).map((p) => `${p.name} (${p.id}; ${(p.tasks || []).join(', ') || 'без прав'})`).join('; ') || (d.pagesError ? 'не вдалося прочитати: ' + d.pagesError : 'жодної')}.`; } catch { /* only a hint */ }
      throw new Error(`Сторінка ${pageId} з брифу НЕ доступна для реклами з цього кабінету. Кабінет може рекламувати: ${list}.${who} Або вкажіть у брифі ID зі списку, або призначте сторінку цьому кабінету та користувачу токена (Business Settings → Сторінки → Додати людей/Призначити партнерів).`);
    }
  }
  return { output: { writable: readOnly ? null : true, read_only: readOnly, account: accountId, name: info?.name || null, page_ok: pages ? !!pages.find((p) => p.id === pageId) : null, pages: pages || null }, steps };
}
