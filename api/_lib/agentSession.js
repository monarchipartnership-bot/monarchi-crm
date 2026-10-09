// Who the project AI agent is when it runs without a person: a normal CRM user created for it
// (AGENT_EMAIL / AGENT_PASSWORD in the server environment). It signs in like anyone else, so the usual
// row-level security and every endpoint's session check apply to it; nothing bypasses them.
// A scheduled run is started by Vercel's cron, which proves itself with CRON_SECRET.
import { createClient } from '@supabase/supabase-js';
import { timingSafeEqual } from 'node:crypto';

const SUPA_URL = 'https://meyacsdlosuqbkbichsf.supabase.co';
const SUPA_KEY = 'sb_publishable_jnJ1vdEUtn8ytNdJ4KT5Eg_TVlzWYcA';

// True when the request carries the cron secret ("Authorization: Bearer <CRON_SECRET>", which Vercel adds to cron calls).
export function isCronRequest(req, secret = process.env.CRON_SECRET) {
  if (!secret || secret.length < 16) return false; // a missing or short secret never authorises anything
  const given = Buffer.from(String(req.headers?.authorization || ''));
  const wanted = Buffer.from('Bearer ' + secret);
  return given.length === wanted.length && timingSafeEqual(given, wanted);
}

// → { accessToken, email } of the agent user, or throws a readable error.
export async function signInAgent({ email = process.env.AGENT_EMAIL, password = process.env.AGENT_PASSWORD, makeClient = () => createClient(SUPA_URL, SUPA_KEY, { auth: { persistSession: false, autoRefreshToken: false } }) } = {}) {
  if (!email || !password) throw new Error('Не налаштовано користувача агента: потрібні AGENT_EMAIL та AGENT_PASSWORD у змінних середовища Vercel.');
  const { data, error } = await makeClient().auth.signInWithPassword({ email, password });
  if (error || !data?.session?.access_token) throw new Error('Агент не зміг увійти: ' + (error?.message || 'порожня сесія'));
  return { accessToken: data.session.access_token, email };
}
