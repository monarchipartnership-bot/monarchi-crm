// Vercel Cron calls this every minute (see vercel.json). It proves itself with CRON_SECRET; no person is involved.
// It starts the reports that are due for the project agents that are switched on, and once a day looks for new Meta accounts without a project.
// (The queue of the old agent teams, the website-lead reminders and the campaign spend notices were moved out of the project, see docs/ARCHIVE.md.)
import { createClient } from '@supabase/supabase-js';
import { isCronRequest, signInAgent } from './_lib/agentSession.js';
import { createAgentRepo } from './_lib/agentRepo.js';
import { makeInternalPost } from './_lib/internalPost.js';
import { runProjectReport } from './_lib/projectAgentRun.js';
import { makeCreativesCollector } from './_lib/metaCreatives.js';
import { makeGoogleCreativesCollector } from './_lib/googleCreatives.js';
import { runDueAgents } from './_lib/agentTick.js';
import { enqueueReportRun, reportsViaOrchestrator } from './_lib/wf/reportBridge.js';
import { hasToken, sendMessage } from './_lib/telegram.js';
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
    let result = { checked: 0, due: 0, started: [], waiting: 0 };
    let projectsError = null;
    try {
      result = await runDueAgents({
        repo,
        // with REPORTS_VIA_ORCHESTRATOR=1 a due report is queued as a run of the Support agent (the orchestrator makes it); without the switch the clock makes it itself, as before
        runFor: reportsViaOrchestrator() ? enqueueReportRun(db) : ({ projectId, periodType, scheduledFor }) => runProjectReport({ repo, post, projectId, periodType, trigger: 'cron', today: scheduledFor, creativesGoogle: makeGoogleCreativesCollector(db), creatives: makeCreativesCollector(db, process.env.META_ACCESS_TOKEN), telegram: hasToken() ? { send: (m) => sendMessage(m) } : null, crmUrl: process.env.CRM_BASE_URL || 'https://crm.monarchi.agency' }),
      });
    } catch (e) { projectsError = e.message || String(e); }
    // New clients: the Meta accounts the CRM can see that have no project yet (once a day; the first run only learns what exists).
    let meta = { skipped: 'no token' };
    if (process.env.META_ACCESS_TOKEN) { try { meta = await runMetaSync({ db, listAccounts: async () => (await listMetaAccounts(process.env.META_ACCESS_TOKEN)).accounts, telegram: hasToken() ? { send: (m) => sendMessage(m) } : null, crmUrl: process.env.CRM_BASE_URL || 'https://crm.monarchi.agency', now: new Date(), email: agent.email }); } catch (e) { meta = { error: e.message || String(e) }; } }
    await beat({ ms: Date.now() - startedAt, processed: 0, started: result.started?.length ?? 0, errors: [projectsError, meta.error].filter(Boolean).map((e) => String(e).slice(0, 200)).slice(0, 5) });
    res.status(projectsError ? 500 : 200).json({ ...result, meta, ...(projectsError ? { error: projectsError } : {}) });
  } catch (e) {
    res.status(500).json({ error: e.message || String(e) });
  }
}
