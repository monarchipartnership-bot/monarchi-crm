// Vercel Cron calls this every minute (see vercel.json): the queue of the agents must not wait. It proves itself with CRON_SECRET; no person is
// involved. It starts the reports that are due for the project agents that are switched on.
import { createClient } from '@supabase/supabase-js';
import { isCronRequest, signInAgent } from './_lib/agentSession.js';
import { createAgentRepo } from './_lib/agentRepo.js';
import { makeInternalPost } from './_lib/internalPost.js';
import { runProjectReport } from './_lib/projectAgentRun.js';
import { makeCreativesCollector } from './_lib/metaCreatives.js';
import { runDueAgents } from './_lib/agentTick.js';
import { getModelClient } from './_lib/ai.js';
import { processQueue } from './_lib/agentEngine.js';
import { runLeadReminders } from './_lib/siteLead.js';
import { hasToken, sendMessage } from './_lib/telegram.js';
import { runSpendNotices } from './_lib/spendNotify.js';
import { runMetaSync } from './_lib/metaOnboarding.js';
import { listMetaAccounts } from './_lib/metaAdsData.js';

const SUPA_URL = 'https://meyacsdlosuqbkbichsf.supabase.co';
const SUPA_KEY = 'sb_publishable_jnJ1vdEUtn8ytNdJ4KT5Eg_TVlzWYcA';

export default async function handler(req, res) {
  if (!isCronRequest(req)) { res.status(401).json({ error: 'Unauthorized' }); return; }
  try {
    const agent = await signInAgent();
    const db = createClient(SUPA_URL, SUPA_KEY, { global: { headers: { Authorization: 'Bearer ' + agent.accessToken } }, auth: { persistSession: false, autoRefreshToken: false } });
    const repo = createAgentRepo(db, agent.email);
    const post = makeInternalPost(agent.accessToken);
    // The heartbeat of the clock for the page «Стан системи»: once when the pass starts, once with its report (best effort: it must never break a pass).
    const startedAt = Date.now();
    const beat = (report) => db.from('ai_agent_settings').update(report ? { last_tick_at: new Date().toISOString(), last_tick_report: report } : { last_tick_at: new Date().toISOString() }).eq('id', 1).then(() => null, () => null);
    await beat();
    // The project agents and the SMM team are independent: a failure of one must not stop the other.
    let result = { checked: 0, due: 0, started: [], waiting: 0 };
    let projectsError = null;
    try {
      result = await runDueAgents({
        repo,
        runFor: ({ projectId, periodType, scheduledFor }) => runProjectReport({ repo, post, projectId, periodType, trigger: 'cron', today: scheduledFor, creatives: makeCreativesCollector(db, process.env.META_ACCESS_TOKEN), telegram: hasToken() ? { send: (m) => sendMessage(m) } : null, crmUrl: process.env.CRM_BASE_URL || 'https://crm.monarchi.agency' }),
      });
    } catch (e) { projectsError = e.message || String(e); }
    // The agent framework (the SMM team's agents): scheduled starts and the queued tasks of the agents that are on.
    let team = { processed: 0 };
    try { team = await processQueue({ db, model: getModelClient(agent.accessToken), email: agent.email, trigger: 'cron', now: () => new Date() }, { maxMs: 200000 }); } catch (e) { team = { error: e.message || String(e) }; }
    // Reminders about website leads nobody has taken yet (off until switched on in the settings).
    let reminders = { sent: 0 };
    try {
      const settings = (await db.from('site_lead_settings').select('*').eq('id', 1).maybeSingle()).data;
      reminders = await runLeadReminders({ db, settings, telegram: hasToken() ? { send: (m) => sendMessage(m) } : null, crmUrl: process.env.CRM_BASE_URL || 'https://crm.monarchi.agency' });
    } catch (e) { reminders = { error: e.message || String(e) }; }
    // Money notices: a notice for every few dollars of a campaign and the daily total.
    let spend = { steps: 0 };
    try { spend = await runSpendNotices({ db, telegram: hasToken() ? { send: (m) => sendMessage(m) } : null, now: new Date(), senderEmail: agent.email }); } catch (e) { spend = { error: e.message || String(e) }; }
    // New clients: the Meta accounts the CRM can see that have no project yet (once a day; the first run only learns what exists).
    let meta = { skipped: 'no token' };
    if (process.env.META_ACCESS_TOKEN) { try { meta = await runMetaSync({ db, listAccounts: async () => (await listMetaAccounts(process.env.META_ACCESS_TOKEN)).accounts, telegram: hasToken() ? { send: (m) => sendMessage(m) } : null, crmUrl: process.env.CRM_BASE_URL || 'https://crm.monarchi.agency', now: new Date(), email: agent.email }); } catch (e) { meta = { error: e.message || String(e) }; } }
    await beat({ ms: Date.now() - startedAt, processed: team.processed ?? 0, started: result.started?.length ?? 0, errors: [projectsError, team.error, reminders.error, spend.error, meta.error, ...(spend.errors || [])].filter(Boolean).map((e) => String(e).slice(0, 200)).slice(0, 5) });
    res.status(projectsError ? 500 : 200).json({ ...result, team, reminders, spend, meta, ...(projectsError ? { error: projectsError } : {}) });
  } catch (e) {
    res.status(500).json({ error: e.message || String(e) });
  }
}
