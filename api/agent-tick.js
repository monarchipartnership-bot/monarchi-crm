// Vercel Cron calls this every 15 minutes (see vercel.json). It proves itself with CRON_SECRET; no person is
// involved. It starts the reports that are due for the project agents that are switched on.
import { createClient } from '@supabase/supabase-js';
import { isCronRequest, signInAgent } from './_lib/agentSession.js';
import { createAgentRepo } from './_lib/agentRepo.js';
import { makeInternalPost } from './_lib/internalPost.js';
import { runProjectReport } from './_lib/projectAgentRun.js';
import { runDueAgents } from './_lib/agentTick.js';
import { getModelClient } from './_lib/ai.js';
import { processQueue } from './_lib/agentEngine.js';

const SUPA_URL = 'https://meyacsdlosuqbkbichsf.supabase.co';
const SUPA_KEY = 'sb_publishable_jnJ1vdEUtn8ytNdJ4KT5Eg_TVlzWYcA';

export default async function handler(req, res) {
  if (!isCronRequest(req)) { res.status(401).json({ error: 'Unauthorized' }); return; }
  try {
    const agent = await signInAgent();
    const db = createClient(SUPA_URL, SUPA_KEY, { global: { headers: { Authorization: 'Bearer ' + agent.accessToken } }, auth: { persistSession: false, autoRefreshToken: false } });
    const repo = createAgentRepo(db, agent.email);
    const post = makeInternalPost(agent.accessToken);
    // The project agents and the SMM team are independent: a failure of one must not stop the other.
    let result = { checked: 0, due: 0, started: [], waiting: 0 };
    let projectsError = null;
    try {
      result = await runDueAgents({
        repo,
        runFor: ({ projectId, periodType, scheduledFor }) => runProjectReport({ repo, post, projectId, periodType, trigger: 'cron', today: scheduledFor }),
      });
    } catch (e) { projectsError = e.message || String(e); }
    // The agent framework (the SMM team's agents): scheduled starts and the queued tasks of the agents that are on.
    let team = { processed: 0 };
    try { team = await processQueue({ db, model: getModelClient(agent.accessToken), email: agent.email, trigger: 'cron', now: () => new Date() }, { maxMs: 200000 }); } catch (e) { team = { error: e.message || String(e) }; }
    res.status(projectsError ? 500 : 200).json({ ...result, team, ...(projectsError ? { error: projectsError } : {}) });
  } catch (e) {
    res.status(500).json({ error: e.message || String(e) });
  }
}
