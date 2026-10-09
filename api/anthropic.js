// Server-side proxy for the AI agents' calls to the Anthropic API.
// Browsers can't call api.anthropic.com directly (no CORS, and the key must never ship in client code),
// so the agents post their request here. The real key comes from the server's environment
// (ANTHROPIC_API_KEY, set in Vercel, never committed).
//
// Since 2026-10-09 this endpoint
//  - requires a signed-in CRM user (it used to be open to anyone who knew the URL, i.e. to anyone able to
//    spend our key);
//  - goes through the shared model client, so every call is retried on overload, logged in ai_calls
//    (tokens, estimated cost, retries) and checked against the spending limits in ai_budgets.
// The answer keeps the Anthropic message shape, which is what the agents already read.
import { createClient } from '@supabase/supabase-js';
import { getModelClient } from './_lib/ai.js';
import { BudgetError, ModelError } from './_lib/modelClient.js';

const SUPA_URL = 'https://meyacsdlosuqbkbichsf.supabase.co';
const SUPA_KEY = 'sb_publishable_jnJ1vdEUtn8ytNdJ4KT5Eg_TVlzWYcA';

const fail = (res, status, message) => res.status(status).json({ error: { message } });

export default async function handler(req, res) {
  if (req.method !== 'POST') { fail(res, 405, 'Method not allowed'); return; }

  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) { fail(res, 401, 'Потрібна авторизація'); return; }
  const { data: userData, error: authError } = await createClient(SUPA_URL, SUPA_KEY).auth.getUser(token);
  if (authError || !userData?.user) { fail(res, 401, 'Сесія недійсна'); return; }

  if (!process.env.ANTHROPIC_API_KEY) { fail(res, 500, 'ANTHROPIC_API_KEY is not configured on the server'); return; }

  const params = req.body || {};
  if (!params.model || !params.max_tokens || !Array.isArray(params.messages)) { fail(res, 400, 'model, max_tokens і messages обовʼязкові'); return; }
  if (params.stream) { fail(res, 400, 'stream не підтримується'); return; }

  const agentKey = String(req.headers['x-agent-key'] || 'proxy').slice(0, 60);
  try {
    const result = await getModelClient(token).callModel({ agentKey, trigger: 'user', actor: userData.user.email || null, params });
    res.status(200).json(result.message);
  } catch (err) {
    if (err instanceof BudgetError) { fail(res, 429, err.message); return; }
    if (err instanceof ModelError) { fail(res, err.status && err.status < 500 && err.status !== 429 ? 400 : 502, err.message); return; }
    fail(res, 502, 'Failed to reach Anthropic API: ' + err.message);
  }
}
