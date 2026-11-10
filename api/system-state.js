// POST → { status, checks } — the page «Стан системи». A signed-in person only. It reads the heartbeat and the queue and tells which keys are set (never their values).
import { createClient } from '@supabase/supabase-js';
import { KEYS, buildSystemState, telegramTest } from '../src/lib/agents/systemState.js';
import { hasToken, sendMessage } from './_lib/telegram.js';

const SUPA_URL = 'https://meyacsdlosuqbkbichsf.supabase.co';
const SUPA_KEY = 'sb_publishable_jnJ1vdEUtn8ytNdJ4KT5Eg_TVlzWYcA';

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) { res.status(401).json({ error: 'Потрібна авторизація' }); return; }
  const { data, error } = await createClient(SUPA_URL, SUPA_KEY).auth.getUser(token);
  if (error || !data?.user) { res.status(401).json({ error: 'Сесія недійсна' }); return; }
  try {
    const db = createClient(SUPA_URL, SUPA_KEY, { global: { headers: { Authorization: 'Bearer ' + token } }, auth: { persistSession: false, autoRefreshToken: false } });
    if (req.body?.action === 'telegram_test') { // «Надіслати тестове»: one message to the chosen topic, so the person sees the notices really arrive
      if (!hasToken()) { res.status(400).json({ error: 'TELEGRAM_BOT_TOKEN не налаштовано на сервері.' }); return; }
      const row = (await db.from('ai_agent_settings').select('*').eq('id', 1).maybeSingle()).data;
      let msg;
      try { msg = telegramTest(row, req.body.thread === 'spend' ? 'spend' : 'attention', data.user.email); } catch (e) { res.status(400).json({ error: e.message }); return; }
      const r = await sendMessage(msg).catch((e) => ({ ok: false, error: String(e.message || e) }));
      if (r && r.ok === false) { res.status(502).json({ error: `Telegram не прийняв повідомлення: ${r.error || r.description || 'невідома помилка'}` }); return; }
      res.status(200).json({ ok: true });
      return;
    }
    const since = new Date(Date.now() - 2 * 86400000).toISOString();
    const [settings, tasks] = await Promise.all([
      db.from('ai_agent_settings').select('*').eq('id', 1).maybeSingle(),
      db.from('ag_tasks').select('status, created_at, lease_until, finished_at').gte('created_at', since).order('id', { ascending: false }).limit(1000),
    ]);
    const env = Object.fromEntries(KEYS.map((k) => [k.env, !!String(process.env[k.env] || '').trim()]));
    res.status(200).json(buildSystemState({ env, settings: settings.data, tasks: tasks.data || [], now: new Date() }));
  } catch (e) {
    res.status(500).json({ error: e.message || String(e) });
  }
}
