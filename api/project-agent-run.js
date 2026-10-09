// «Запустити зараз» on a project's AI Агент tab: the agent makes the report (and presentation) for the
// period that is due, as a draft. A signed-in CRM user starts it; the work itself is done as the agent user.
// POST { projectId, periodType: 'weekly' | 'monthly' } → { status, message, runId, reportId, deckIds, notes, costUsd }
import { createClient } from '@supabase/supabase-js';
import { signInAgent } from './_lib/agentSession.js';
import { createAgentRepo } from './_lib/agentRepo.js';
import { makeInternalPost } from './_lib/internalPost.js';
import { runProjectReport } from './_lib/projectAgentRun.js';

const SUPA_URL = 'https://meyacsdlosuqbkbichsf.supabase.co';
const SUPA_KEY = 'sb_publishable_jnJ1vdEUtn8ytNdJ4KT5Eg_TVlzWYcA';

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) { res.status(401).json({ error: 'Потрібна авторизація' }); return; }
  const { data, error } = await createClient(SUPA_URL, SUPA_KEY).auth.getUser(token);
  if (error || !data?.user) { res.status(401).json({ error: 'Сесія недійсна' }); return; }

  const projectId = Number(req.body?.projectId);
  const periodType = req.body?.periodType;
  if (!Number.isInteger(projectId) || !['weekly', 'monthly'].includes(periodType)) { res.status(400).json({ error: 'projectId і periodType (weekly | monthly) обовʼязкові' }); return; }

  try {
    const agent = await signInAgent();
    const db = createClient(SUPA_URL, SUPA_KEY, { global: { headers: { Authorization: 'Bearer ' + agent.accessToken } }, auth: { persistSession: false, autoRefreshToken: false } });
    const result = await runProjectReport({
      repo: createAgentRepo(db, agent.email), post: makeInternalPost(agent.accessToken),
      projectId, periodType, trigger: 'manual', startedBy: data.user.email || null,
    });
    res.status(200).json(result);
  } catch (e) {
    res.status(500).json({ error: e.message || String(e) });
  }
}
