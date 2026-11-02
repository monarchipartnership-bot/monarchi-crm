// POST { action } — the page side of the Meta onboarding (docs/project-reports-tasks.md, «Новые клиенты»). A signed-in person only; the Meta token stays on the server.
//   status                the settings, the last check and the accounts that wait for a person (the banner «Нові кабінети в Meta»)
//   run                   check now (not only once a day)
//   import  { accountId } make a project of one waiting account
//   ignore  { accountId } leave an account out for good (the agency's own, tests);  unignore  { accountId }
//   settings { enabled?, autoCreate? }
import { createClient } from '@supabase/supabase-js';
import { importAccount, runMetaSync, waitingAccounts } from './_lib/metaOnboarding.js';
import { listMetaAccounts } from './_lib/metaAdsData.js';
import { digitsOf, metaErrorText } from '../src/lib/metaOnboarding.js';
import { hasToken, sendMessage } from './_lib/telegram.js';

const SUPA_URL = 'https://meyacsdlosuqbkbichsf.supabase.co';
const SUPA_KEY = 'sb_publishable_jnJ1vdEUtn8ytNdJ4KT5Eg_TVlzWYcA';

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) { res.status(401).json({ error: 'Не авторизовано' }); return; }
  const { data, error } = await createClient(SUPA_URL, SUPA_KEY).auth.getUser(token);
  if (error || !data?.user) { res.status(401).json({ error: 'Сесія недійсна' }); return; }
  const metaToken = process.env.META_ACCESS_TOKEN;
  if (!metaToken) { res.status(200).json({ configError: true, missing: ['META_ACCESS_TOKEN'] }); return; }
  const email = data.user.email || null;
  const db = createClient(SUPA_URL, SUPA_KEY, { global: { headers: { Authorization: 'Bearer ' + token } }, auth: { persistSession: false, autoRefreshToken: false } });
  const listAccounts = async () => (await listMetaAccounts(metaToken)).accounts;
  const body = req.body || {};
  try {
    const action = String(body.action || 'status');
    const settingsRow = async () => (await db.from('meta_sync_settings').select('*').eq('id', 1).maybeSingle()).data || {};
    const update = async (patch) => { const { error: e } = await db.from('meta_sync_settings').update({ ...patch, updated_by: email, updated_at: new Date().toISOString() }).eq('id', 1); if (e) throw new Error(e.message); };
    if (action === 'status') {
      const s = await settingsRow();
      res.status(200).json({ enabled: s.enabled !== false, autoCreate: s.auto_create !== false, baselineDone: !!s.baseline_done, ignored: s.ignored_ids || [], lastRunAt: s.last_run_at || null, lastReport: s.last_report || {}, waiting: await waitingAccounts({ db, listAccounts }) });
    } else if (action === 'run') {
      res.status(200).json(await runMetaSync({ db, listAccounts, telegram: hasToken() ? { send: (m) => sendMessage(m) } : null, crmUrl: process.env.CRM_BASE_URL || 'https://crm.monarchi.agency', force: true, email }));
    } else if (action === 'import') {
      const id = digitsOf(body.accountId);
      const account = (await listAccounts()).find((a) => digitsOf(a.id) === id);
      if (!account) { res.status(404).json({ error: 'Цього кабінету немає серед доступних CRM у Meta.' }); return; }
      res.status(200).json({ project: await importAccount({ db, account, email }) });
    } else if (action === 'ignore' || action === 'unignore') {
      const id = digitsOf(body.accountId);
      if (!id) { res.status(400).json({ error: 'Вкажіть кабінет.' }); return; }
      const list = ((await settingsRow()).ignored_ids || []).map(digitsOf).filter((x) => x !== id);
      await update({ ignored_ids: action === 'ignore' ? [...list, id] : list });
      res.status(200).json({ ok: true });
    } else if (action === 'settings') {
      const patch = {};
      if (typeof body.enabled === 'boolean') patch.enabled = body.enabled;
      if (typeof body.autoCreate === 'boolean') patch.auto_create = body.autoCreate;
      await update(patch);
      res.status(200).json({ ok: true });
    } else res.status(400).json({ error: 'Невідома дія' });
  } catch (e) {
    res.status(e.status && e.status < 500 ? 400 : 500).json({ error: metaErrorText(e) || e.message || String(e), code: e.code });
  }
}
