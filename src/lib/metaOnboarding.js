// A new client's Meta ad account reaches the CRM by itself (docs/project-reports-tasks.md, «Новые клиенты»): once a day the server lists the accounts the CRM's Meta
// token can see and turns the ones that have no project yet into projects. Pure code: what to do with the list, and how an error is told to a person.
//   - the FIRST run only learns: every account that has no project at that moment is remembered as «seen» (the agency may have left some out on purpose), nothing is created
//   - after that, an account that appears and is not linked, not seen and not ignored becomes a project (when auto_create is on) or waits in the list for a person
//   - closed accounts and accounts the person chose to ignore are skipped

const META_STATUS = { 1: 'active', 2: 'disabled', 3: 'unsettled', 7: 'review', 8: 'unsettled', 9: 'grace', 100: 'closed', 101: 'closed', 201: 'active', 202: 'closed' };
const ALIVE = new Set(['active', 'unsettled', 'review', 'grace']); // a disabled or closed account does not become a project by itself

export const digitsOf = (v) => String(v ?? '').replace(/^act_/, '').replace(/\D/g, '');

// The row of Meta's `me/adaccounts` (as api/meta-ads-insights.js lists it, or Graph's own field names) → { id (digits), name, currency, timezone, status }
export function normalizeMetaAccount(a) {
  return {
    id: digitsOf(a.id ?? a.account_id),
    name: String(a.name || '').trim() || null,
    currency: a.currency || null,
    timezone: a.timezone || a.timezone_name || null,
    status: typeof a.status === 'string' ? a.status : META_STATUS[a.status ?? a.account_status] || 'unknown',
  };
}

// accounts: what Meta lists; linked: ids already in project_ad_accounts (platform meta); settings: { baseline_done, auto_create, seen_ids, ignored_ids }
// → { baseline: [ids to remember], create: [accounts to turn into projects], waiting: [accounts a person decides about], skipped: [{ id, reason }] }
export function planMetaSync({ accounts = [], linked = [], settings = {} }) {
  const have = new Set(linked.map(digitsOf));
  const seen = new Set((settings.seen_ids || []).map(digitsOf));
  const ignored = new Set((settings.ignored_ids || []).map(digitsOf));
  const out = { baseline: [], create: [], waiting: [], skipped: [] };
  const list = accounts.map(normalizeMetaAccount).filter((a) => a.id);
  list.forEach((a) => {
    if (have.has(a.id)) return;
    if (ignored.has(a.id)) { out.skipped.push({ id: a.id, reason: 'ignored' }); return; }
    if (!settings.baseline_done) { out.baseline.push(a.id); return; } // the first run only learns
    if (seen.has(a.id)) { if (ALIVE.has(a.status)) out.waiting.push(a); else out.skipped.push({ id: a.id, reason: a.status }); return; } // known from before: a person decides
    if (!ALIVE.has(a.status)) { out.skipped.push({ id: a.id, reason: a.status }); return; }
    if (settings.auto_create === false) out.waiting.push(a); else out.create.push(a);
  });
  return out;
}

// The fields of the project made from an account (the same shape the «створити проєкт» form writes).
export function projectFromAccount(a, today = new Date().toISOString().slice(0, 10)) {
  return { name: a.name || `Meta ${a.id}`, status: 'active', services: ['Meta Ads'], start_date: today, timezone: null };
}

// Meta's own errors, told to a person in Ukrainian with what to do. → the text, or null when there is nothing to improve.
export function metaErrorText(err) {
  const code = Number(err?.code);
  const msg = String(err?.message || '');
  if (code === 200 || /NOT grant ads_management or ads_read/i.test(msg)) {
    return 'Системний користувач CRM ще не має доступу до цього кабінету. У Meta Business Suite: Налаштування бізнесу → Системні користувачі → користувач CRM → «Призначити обʼєкти» → Рекламні акаунти → оберіть кабінет і дайте доступ «Перегляд ефективності». Якщо клієнт ще не надав доступ агентству, спершу попросіть його додати Mon\'Archi як партнера.';
  }
  if (code === 190) return 'Токен Meta недійсний або прострочений: створіть новий токен системного користувача й оновіть META_ACCESS_TOKEN у Vercel.';
  if (code === 4 || code === 17 || code === 32 || code === 613) return 'Meta тимчасово обмежила кількість запитів. Спробуйте за кілька хвилин.';
  return null;
}

export const newAccountMessage = (project, account) => ({
  title: `Новий кабінет: ${project.name}`,
  body: `Кабінет Meta «${account.name || account.id}» (${account.currency || '—'}) зʼявився в доступі CRM, проєкт створено автоматично. Перевірте менеджера й послуги.`,
});
