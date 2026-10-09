// Vercel Cron calls this every 15 minutes (see vercel.json). It proves itself with CRON_SECRET; no person is
// involved. It starts the reports that are due for the project agents that are switched on.
import { createClient } from '@supabase/supabase-js';
import { isCronRequest, signInAgent } from './_lib/agentSession.js';
import { createAgentRepo } from './_lib/agentRepo.js';
import { makeInternalPost } from './_lib/internalPost.js';
import { runProjectReport } from './_lib/projectAgentRun.js';
import { runDueAgents } from './_lib/agentTick.js';

const SUPA_URL = 'https://meyacsdlosuqbkbichsf.supabase.co';
const SUPA_KEY = 'sb_publishable_jnJ1vdEUtn8ytNdJ4KT5Eg_TVlzWYcA';

export default async function handler(req, res) {
  if (!isCronRequest(req)) { res.status(401).json({ error: 'Unauthorized' }); return; }
  try {
    const agent = await signInAgent();
    const db = createClient(SUPA_URL, SUPA_KEY, { global: { headers: { Authorization: 'Bearer ' + agent.accessToken } }, auth: { persistSession: false, autoRefreshToken: false } });
    const repo = createAgentRepo(db, agent.email);
    const post = makeInternalPost(agent.accessToken);
    const result = await runDueAgents({
      repo,
      runFor: ({ projectId, periodType, scheduledFor }) => runProjectReport({ repo, post, projectId, periodType, trigger: 'cron', today: scheduledFor }),
    });
    res.status(200).json(result);
  } catch (e) {
    res.status(500).json({ error: e.message || String(e) });
  }
}
