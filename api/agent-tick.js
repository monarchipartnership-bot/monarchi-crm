// Vercel Cron calls this every 15 minutes (see vercel.json). It proves itself with CRON_SECRET; no person is
// involved. It starts the reports that are due for the project agents that are switched on.
import { createClient } from '@supabase/supabase-js';
import { isCronRequest, signInAgent } from './_lib/agentSession.js';
import { createAgentRepo } from './_lib/agentRepo.js';
import { makeInternalPost } from './_lib/internalPost.js';
import { runProjectReport } from './_lib/projectAgentRun.js';
import { runDueAgents } from './_lib/agentTick.js';
import { getModelClient } from './_lib/ai.js';
import { runSmmWeekly, smmDue } from './_lib/smmRun.js';

const SUPA_URL = 'https://meyacsdlosuqbkbichsf.supabase.co';
const SUPA_KEY = 'sb_publishable_jnJ1vdEUtn8ytNdJ4KT5Eg_TVlzWYcA';

export default async function handler(req, res) {
  if (!isCronRequest(req)) { res.status(401).json({ error: 'Unauthorized' }); return; }
  try {
    const agent = await signInAgent();
    const db = createClient(SUPA_URL, SUPA_KEY, { global: { headers: { Authorization: 'Bearer ' + agent.accessToken } }, auth: { persistSession: false, autoRefreshToken: false } });
    const repo = createAgentRepo(db, agent.email);
    const post = makeInternalPost(agent.accessToken);
    // The project agents and the SMM autopilot are independent: a failure of one must not stop the other.
    let result = { checked: 0, due: 0, started: [], waiting: 0 };
    let projectsError = null;
    try {
      result = await runDueAgents({
        repo,
        runFor: ({ projectId, periodType, scheduledFor }) => runProjectReport({ repo, post, projectId, periodType, trigger: 'cron', today: scheduledFor }),
      });
    } catch (e) { projectsError = e.message || String(e); }
    // The SMM team's weekly autopilot (switched off until a person turns it on in the SMM section).
    let smm = { due: false, reason: 'не перевірено' };
    try {
      const { data: settings } = await db.from('smm_settings').select('*').eq('id', 1).maybeSingle();
      const verdict = smmDue({ settings });
      smm = verdict.due ? { ...verdict, ...(await runSmmWeekly({ db, model: getModelClient(agent.accessToken), settings, scheduledFor: verdict.scheduledFor, email: agent.email })) } : verdict;
    } catch (e) { smm = { due: false, reason: 'помилка: ' + (e.message || e) }; }
    res.status(projectsError ? 500 : 200).json({ ...result, smm, ...(projectsError ? { error: projectsError } : {}) });
  } catch (e) {
    res.status(500).json({ error: e.message || String(e) });
  }
}
