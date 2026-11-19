// The door of the new orchestrator (step A2). One pass: plan what is due for every project that was started, take the queued runs, run them.
//   GET with the cron secret (Vercel cron) or POST with the session of a person.
// NOT wired to the cron yet: it is switched on only with the owner's word. It touches only projects that have a row in wf_project_state, and until the
// real agents of the steps A4-A10 are connected the handlers are stand-ins (api/_lib/wf/agents.js).
import { createClient } from '@supabase/supabase-js';
import { isCronRequest, signInAgent } from './_lib/agentSession.js';
import { createHandlers } from './_lib/wf/agents.js';
import { createWfRepo } from './_lib/wf/repo.js';
import { processTick } from './_lib/wf/tick.js';

const SUPA_URL = 'https://meyacsdlosuqbkbichsf.supabase.co';
const SUPA_KEY = 'sb_publishable_jnJ1vdEUtn8ytNdJ4KT5Eg_TVlzWYcA';
const bad = (res, code, error) => res.status(code).json({ error });

export default async function handler(req, res) {
  try {
    let token;
    if (isCronRequest(req)) token = (await signInAgent()).accessToken;
    else {
      if (req.method !== 'POST') { bad(res, 405, 'Method not allowed'); return; }
      token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
      if (!token) { bad(res, 401, 'Потрібна авторизація'); return; }
      const { data, error } = await createClient(SUPA_URL, SUPA_KEY).auth.getUser(token);
      if (error || !data?.user) { bad(res, 401, 'Сесія недійсна'); return; }
    }
    const db = createClient(SUPA_URL, SUPA_KEY, { global: { headers: { Authorization: 'Bearer ' + token } }, auth: { persistSession: false, autoRefreshToken: false } });
    const stats = await processTick({ repo: createWfRepo(db), handlers: createHandlers() });
    res.status(200).json({ ok: true, ...stats });
  } catch (e) {
    console.error('wf-tick failed:', e?.message || e);
    bad(res, 500, e?.message || 'Помилка оркестратора');
  }
}
