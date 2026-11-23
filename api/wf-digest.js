// The daily digest of the overview of all projects, sent to the Telegram chat of the notices (step A11).
//   GET with the cron secret (Vercel cron, once a day) or POST with the session of a person («Надіслати дайджест зараз»).
// The cron sends nothing when no project has been started yet; a person's button always sends.
import { createClient } from '@supabase/supabase-js';
import { isCronRequest, signInAgent } from './_lib/agentSession.js';
import { createWfRepo } from './_lib/wf/repo.js';
import { digestMessage } from './_lib/wf/notify.js';
import { hasToken, sendMessage } from './_lib/telegram.js';
import { loadOverviewData } from '../src/lib/workflow/overviewData.js';
import { buildOverview, digestText } from '../src/lib/workflow/overview.js';

const SUPA_URL = 'https://meyacsdlosuqbkbichsf.supabase.co';
const SUPA_KEY = 'sb_publishable_jnJ1vdEUtn8ytNdJ4KT5Eg_TVlzWYcA';
const bad = (res, code, error) => res.status(code).json({ error });

export default async function handler(req, res) {
  try {
    const cron = isCronRequest(req);
    let token;
    if (cron) token = (await signInAgent()).accessToken;
    else {
      if (req.method !== 'POST') { bad(res, 405, 'Method not allowed'); return; }
      token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
      if (!token) { bad(res, 401, 'Потрібна авторизація'); return; }
      const { data, error } = await createClient(SUPA_URL, SUPA_KEY).auth.getUser(token);
      if (error || !data?.user) { bad(res, 401, 'Сесія недійсна'); return; }
    }
    if (!hasToken()) { bad(res, 400, 'TELEGRAM_BOT_TOKEN не налаштовано на сервері.'); return; }
    const db = createClient(SUPA_URL, SUPA_KEY, { global: { headers: { Authorization: 'Bearer ' + token } }, auth: { persistSession: false, autoRefreshToken: false } });
    const target = await createWfRepo(db).readNotifyTarget();
    if (!target?.chatId) { bad(res, 400, 'Чат Telegram не вказано: заповніть його в «Сповіщення» AI Agents.'); return; }
    const ov = buildOverview({ ...(await loadOverviewData(db)), now: new Date() });
    if (cron && !ov.rows.length) { res.status(200).json({ ok: true, sent: false, reason: 'no started projects' }); return; }
    const r = await sendMessage(digestMessage(target, digestText(ov)));
    if (!r.ok) { bad(res, 502, `Telegram не прийняв повідомлення: ${r.error}`); return; }
    res.status(200).json({ ok: true, sent: true, projects: ov.rows.length });
  } catch (e) {
    console.error('wf-digest failed:', e?.message || e);
    bad(res, 500, e?.message || 'Помилка дайджесту');
  }
}
