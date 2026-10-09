// «Is the project AI agent set up?» — for the CRM (agent tab) and for checks after changing its settings.
// Needs a signed-in CRM user. Tries to sign the agent user in and answers { ok, email } or { ok: false, error }.
// It never returns a token or a password.
import { createClient } from '@supabase/supabase-js';
import { signInAgent } from './_lib/agentSession.js';

const SUPA_URL = 'https://meyacsdlosuqbkbichsf.supabase.co';
const SUPA_KEY = 'sb_publishable_jnJ1vdEUtn8ytNdJ4KT5Eg_TVlzWYcA';

export default async function handler(req, res) {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) { res.status(401).json({ error: 'Потрібна авторизація' }); return; }
  const { data, error } = await createClient(SUPA_URL, SUPA_KEY).auth.getUser(token);
  if (error || !data?.user) { res.status(401).json({ error: 'Сесія недійсна' }); return; }

  const checks = {
    agentUser: Boolean(process.env.AGENT_EMAIL && process.env.AGENT_PASSWORD),
    cronSecret: Boolean(process.env.CRON_SECRET && process.env.CRON_SECRET.length >= 16),
    anthropicKey: Boolean(process.env.ANTHROPIC_API_KEY),
    metaToken: Boolean(process.env.META_ACCESS_TOKEN),
    googleAds: ['GOOGLE_ADS_CLIENT_ID', 'GOOGLE_ADS_CLIENT_SECRET', 'GOOGLE_ADS_REFRESH_TOKEN', 'GOOGLE_ADS_DEVELOPER_TOKEN', 'GOOGLE_ADS_LOGIN_CUSTOMER_ID'].every((k) => Boolean(process.env[k])),
  };
  try {
    const agent = await signInAgent();
    res.status(200).json({ ok: true, email: agent.email, checks });
  } catch (e) {
    res.status(200).json({ ok: false, error: e.message, checks });
  }
}
