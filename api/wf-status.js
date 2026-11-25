// «Підключення» of the AI Agents section: the state of everything the agents work with (Meta, pictures, the model, Telegram, the cron, Google, TikTok). POST with the session of a person.
// Secrets never leave the server: the answer holds only the state and the names of what is missing.
import { createClient } from '@supabase/supabase-js';
import { connectionChecks } from './_lib/wf/status.js';

const SUPA_URL = 'https://meyacsdlosuqbkbichsf.supabase.co';
const SUPA_KEY = 'sb_publishable_jnJ1vdEUtn8ytNdJ4KT5Eg_TVlzWYcA';
const bad = (res, code, error) => res.status(code).json({ error });
// a slow answer of Meta must not hang the page: every call gets its own limit of time
const timed = (ms) => async (url, init) => { const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), ms); try { return await fetch(url, { ...init, signal: ctl.signal }); } finally { clearTimeout(t); } };

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') { bad(res, 405, 'Method not allowed'); return; }
    const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    if (!token) { bad(res, 401, 'Потрібна авторизація'); return; }
    const { data, error } = await createClient(SUPA_URL, SUPA_KEY).auth.getUser(token);
    if (error || !data?.user) { bad(res, 401, 'Сесія недійсна'); return; }
    const db = createClient(SUPA_URL, SUPA_KEY, { global: { headers: { Authorization: 'Bearer ' + token } }, auth: { persistSession: false, autoRefreshToken: false } });
    const [wf, ai] = await Promise.all([db.from('wf_settings').select('notify_telegram_chat').eq('id', 1).maybeSingle(), db.from('ai_agent_settings').select('last_tick_at, tg_chat_id').eq('id', 1).maybeSingle()]);
    const settings = { notify_chat: wf.data?.notify_telegram_chat || ai.data?.tg_chat_id || null, last_tick_at: ai.data?.last_tick_at || null };
    const checks = await connectionChecks({ env: process.env, fetchFn: timed(8000), settings });
    res.status(200).json({ ok: true, at: new Date().toISOString(), checks });
  } catch (e) {
    console.error('wf-status failed:', e?.message || e);
    bad(res, 500, e?.message || 'Помилка перевірки підключень');
  }
}
