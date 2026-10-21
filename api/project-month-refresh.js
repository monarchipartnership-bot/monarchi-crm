// After a week of a project is approved (or its approval is withdrawn): pull the running total of the month again.
// POST { projectId, monthKey: 'YYYY-MM' } → { updated: [{ scope, end }], skipped: [text] }
// A signed-in CRM user starts it; the work is done as the agent user, like the agent's own runs.
import { createClient } from '@supabase/supabase-js';
import { signInAgent } from './_lib/agentSession.js';
import { createAgentRepo } from './_lib/agentRepo.js';
import { makeInternalPost } from './_lib/internalPost.js';
import { refreshMonthToDate } from './_lib/monthToDate.js';

const SUPA_URL = 'https://meyacsdlosuqbkbichsf.supabase.co';
const SUPA_KEY = 'sb_publishable_jnJ1vdEUtn8ytNdJ4KT5Eg_TVlzWYcA';

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) { res.status(401).json({ error: 'Потрібна авторизація' }); return; }
  const { data, error } = await createClient(SUPA_URL, SUPA_KEY).auth.getUser(token);
  if (error || !data?.user) { res.status(401).json({ error: 'Сесія недійсна' }); return; }
  const projectId = Number(req.body?.projectId);
  const monthKey = String(req.body?.monthKey || '');
  if (!Number.isInteger(projectId) || !/^\d{4}-\d{2}$/.test(monthKey)) { res.status(400).json({ error: 'projectId і monthKey (YYYY-MM) обовʼязкові' }); return; }
  try {
    const agent = await signInAgent();
    const db = createClient(SUPA_URL, SUPA_KEY, { global: { headers: { Authorization: 'Bearer ' + agent.accessToken } }, auth: { persistSession: false, autoRefreshToken: false } });
    res.status(200).json(await refreshMonthToDate({ repo: createAgentRepo(db, agent.email), post: makeInternalPost(agent.accessToken), projectId, monthKey }));
  } catch (e) {
    res.status(500).json({ error: e.message || String(e) });
  }
}
