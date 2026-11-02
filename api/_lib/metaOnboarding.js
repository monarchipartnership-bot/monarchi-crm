// The daily check of the Meta ad accounts the CRM's token can see (src/lib/metaOnboarding.js decides what to do). Runs from the cron, once per Kyiv day after 08:00, or on demand
// («Перевірити зараз»). db is the Supabase client of whoever acts; listAccounts() → the rows of `me/adaccounts`; telegram = { send } or null.
import { kyivParts } from '../../src/lib/agentSchedule.js';
import { newAccountMessage, metaErrorText, normalizeMetaAccount, planMetaSync, projectFromAccount } from '../../src/lib/metaOnboarding.js';

const must = (r, what) => { if (r.error) throw new Error(`${what}: ${r.error.message}`); return r.data; };
const uniq = (list) => [...new Set(list)];
const STARTS_AT = 8 * 60; // not before 08:00 Kyiv

export async function runMetaSync({ db, listAccounts, telegram = null, crmUrl = '', now = new Date(), force = false, email = null }) {
  const settings = (await db.from('meta_sync_settings').select('*').eq('id', 1).maybeSingle()).data;
  if (!settings) return { skipped: 'no settings' };
  if (!force && !settings.enabled) return { skipped: 'off' };
  const k = kyivParts(now);
  if (!force) {
    if (k.minutes < STARTS_AT || (settings.last_run_date && String(settings.last_run_date) >= k.date)) return { skipped: 'not due' };
    // claim the day first, so two overlapping passes never both run
    let claim = db.from('meta_sync_settings').update({ last_run_date: k.date }).eq('id', 1);
    if (settings.last_run_date) claim = claim.lt('last_run_date', k.date);
    if (!must(await claim.select('id'), 'claim').length) return { skipped: 'taken' };
  } else must(await db.from('meta_sync_settings').update({ last_run_date: k.date }).eq('id', 1), 'settings');

  const report = { listed: 0, created: [], waiting: 0, failed: [] };
  const tell = async (n, projectId = null) => {
    const emails = (settings.notify_emails || []).filter(Boolean);
    if (emails.length) await db.from('notifications').insert(emails.map((to) => ({ recipient_email: to, sender_email: email || 'meta-sync', type: 'meta_account', title: n.title, body: n.body.slice(0, 400), link: projectId ? `/projects/${projectId}` : '/projects', project_id: projectId })));
    if (telegram && settings.tg_chat_id) await telegram.send({ chatId: settings.tg_chat_id, threadId: settings.tg_thread_id || undefined, text: `🆕 <b>${n.title.replace(/[<>&]/g, '')}</b>\n${n.body.replace(/[<>&]/g, '')}`, url: projectId && crmUrl ? `${crmUrl}/projects/${projectId}` : undefined }).catch(() => null);
  };

  let accounts = [];
  try { accounts = await listAccounts(); } catch (e) {
    const text = metaErrorText(e) || `Meta API: ${e.message || e}`;
    await db.from('meta_sync_settings').update({ last_run_at: now.toISOString(), last_report: { ...report, error: text } }).eq('id', 1);
    await tell({ title: 'Не вдалося перевірити кабінети Meta', body: text });
    return { ...report, error: text };
  }
  report.listed = accounts.length;
  const linked = (must(await db.from('project_ad_accounts').select('account_id').eq('platform', 'meta'), 'links') || []).map((r) => r.account_id);
  const plan = planMetaSync({ accounts, linked, settings });

  if (plan.baseline.length || !settings.baseline_done) {
    must(await db.from('meta_sync_settings').update({ baseline_done: true, seen_ids: uniq([...(settings.seen_ids || []), ...plan.baseline]) }).eq('id', 1), 'baseline');
    report.baselineLearned = plan.baseline.length;
  }
  for (const a of plan.create) {
    let project = null;
    try {
      project = must(await db.from('projects').insert({ ...projectFromAccount(a, k.date), created_by: email || 'meta-sync' }).select().single(), 'project');
      must(await db.from('project_ad_accounts').insert({ project_id: project.id, platform: 'meta', account_id: a.id, account_name: a.name, currency: a.currency, timezone: a.timezone, account_status: a.status, synced_at: now.toISOString(), created_by: email || 'meta-sync' }), 'link');
      report.created.push(project.name);
      await tell(newAccountMessage(project, a), project.id);
    } catch (e) {
      if (project) await db.from('projects').delete().eq('id', project.id); // no project without its cabinet
      report.failed.push(`${a.name || a.id}: ${e.message}`);
    }
  }
  report.waiting = plan.waiting.length;
  await db.from('meta_sync_settings').update({ last_run_at: now.toISOString(), last_report: report }).eq('id', 1);
  return report;
}

// For the banner «Нові кабінети в Meta»: the accounts that wait for a person. → [{ id, name, currency, status }]
export async function waitingAccounts({ db, listAccounts }) {
  const settings = (await db.from('meta_sync_settings').select('*').eq('id', 1).maybeSingle()).data || {};
  const linked = (must(await db.from('project_ad_accounts').select('account_id').eq('platform', 'meta'), 'links') || []).map((r) => r.account_id);
  const accounts = await listAccounts();
  // before the first run nothing is «waiting»: everything unlinked would be remembered, so show it as waiting too (a person may import any of them)
  return planMetaSync({ accounts, linked, settings: { ...settings, baseline_done: true, seen_ids: accounts.map((a) => normalizeMetaAccount(a).id), auto_create: false } }).waiting;
}

// A person chooses to import one waiting account now.
export async function importAccount({ db, account, email, now = new Date() }) {
  const a = normalizeMetaAccount(account);
  const project = must(await db.from('projects').insert({ ...projectFromAccount(a, kyivParts(now).date), created_by: email || null }).select().single(), 'project');
  try {
    must(await db.from('project_ad_accounts').insert({ project_id: project.id, platform: 'meta', account_id: a.id, account_name: a.name, currency: a.currency, timezone: a.timezone, account_status: a.status, synced_at: now.toISOString(), created_by: email || null }), 'link');
  } catch (e) {
    await db.from('projects').delete().eq('id', project.id);
    throw new Error(e.message.includes('23505') || /duplicate|unique/i.test(e.message) ? 'Цей кабінет уже привʼязано до проєкту.' : e.message);
  }
  return project;
}
