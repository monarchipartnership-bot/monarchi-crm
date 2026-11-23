// The door of the new orchestrator (step A2). One pass: plan what is due for every project that was started, take the queued runs, run them.
//   GET with the cron secret (Vercel cron) or POST with the session of a person.
// NOT wired to the cron yet: it is switched on only with the owner's word. It touches only projects that have a row in wf_project_state, and until the
// real agents of the steps A4-A10 are connected the handlers are stand-ins (api/_lib/wf/agents.js).
import { createClient } from '@supabase/supabase-js';
import { isCronRequest, signInAgent } from './_lib/agentSession.js';
import { createRealHandlers } from './_lib/wf/agents.js';
import { createWfRepo } from './_lib/wf/repo.js';
import { createValidator } from './_lib/wf/check.js';
import { processTick } from './_lib/wf/tick.js';
import { getModelClient } from './_lib/ai.js';
import { createGa4Reader } from './_lib/ga4Client.js';
import { createMetaWriter } from './_lib/metaAdsWrite.js';
import { speedKeyFromEnv } from './_lib/pageSpeed.js';
import { fetchMetaCampaigns, fetchMetaInsights, fetchMetaObjects, fetchMetaPixels } from './_lib/metaAdsData.js';

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
    const metaToken = process.env.META_ACCESS_TOKEN;
    const meta = metaToken ? { insights: (o) => fetchMetaInsights({ ...o, token: metaToken }), campaigns: (o) => fetchMetaCampaigns({ ...o, token: metaToken }), pixels: (o) => fetchMetaPixels({ ...o, token: metaToken }), objects: (o) => fetchMetaObjects({ ...o, token: metaToken }) } : null; // the Meta reader for the agents; its token never leaves the server
    // the model for the skills that write text (site, audience, ...): every call is logged and held to the budgets by the shared client
    const trigger = isCronRequest(req) ? 'cron' : 'user';
    const ask = process.env.ANTHROPIC_API_KEY ? async ({ projectId = null, runId = null, system, user, images = [], maxTokens = 4000 }) => {
      const r = await getModelClient(token).callModel({ agentKey: 'wf-researcher', projectId, runId, trigger, params: { model: 'claude-sonnet-5', max_tokens: maxTokens, thinking: { type: 'disabled' }, system, messages: [{ role: 'user', content: images.length ? [{ type: 'text', text: user }, ...images.flatMap((im) => [{ type: 'text', text: `[${im.id}]` }, { type: 'image', source: { type: 'url', url: im.url } }])] : user }] } });
      return { text: r.text, costUsd: r.costUsd };
    } : null;
    const repo = createWfRepo(db);
    const stats = await processTick({ repo, validate: createValidator(repo), handlers: createRealHandlers(), meta, ask, speedKey: speedKeyFromEnv(), ga4: createGa4Reader(), metaWrite: metaToken ? createMetaWriter({ token: metaToken }) : null });
    res.status(200).json({ ok: true, ...stats });
  } catch (e) {
    console.error('wf-tick failed:', e?.message || e);
    bad(res, 500, e?.message || 'Помилка оркестратора');
  }
}
