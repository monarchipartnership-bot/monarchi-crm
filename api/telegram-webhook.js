// Telegram calls this for everything that happens around the bot (a message in a chat, the bot added or removed, a person joining).
// It only LEARNS: which chats the bot is in and who the people are, so the settings page can offer them (choose a chat, tick who is
// mentioned). Telegram proves itself with a secret header derived from the bot token; anything else gets 401.
import { createClient } from '@supabase/supabase-js';
import { timingSafeEqual } from 'node:crypto';
import { signInAgent } from './_lib/agentSession.js';
import { hasToken, peopleFromUpdate, webhookSecret } from './_lib/telegram.js';

const SUPA_URL = 'https://meyacsdlosuqbkbichsf.supabase.co';
const SUPA_KEY = 'sb_publishable_jnJ1vdEUtn8ytNdJ4KT5Eg_TVlzWYcA';

const same = (a, b) => { const x = Buffer.from(String(a || '')); const y = Buffer.from(String(b || '')); return x.length === y.length && timingSafeEqual(x, y); };

export default async function handler(req, res) {
  if (req.method !== 'POST' || !hasToken()) { res.status(404).json({ ok: false }); return; }
  if (!same(req.headers['x-telegram-bot-api-secret-token'], webhookSecret())) { res.status(401).json({ ok: false }); return; }
  try {
    let update = req.body;
    if (typeof update === 'string') { try { update = JSON.parse(update); } catch { update = {}; } }
    const { chat, members, topic } = peopleFromUpdate(update || {});
    if (chat && chat.type !== 'private') {
      const agent = await signInAgent();
      const db = createClient(SUPA_URL, SUPA_KEY, { global: { headers: { Authorization: 'Bearer ' + agent.accessToken } }, auth: { persistSession: false, autoRefreshToken: false } });
      const now = new Date().toISOString();
      await db.from('tg_chats').upsert({ ...chat, last_seen_at: now }, { onConflict: 'chat_id' });
      if (topic) {
        // a known title is never overwritten by a message that does not carry one
        await db.from('tg_topics').upsert({ chat_id: topic.chat_id, thread_id: topic.thread_id, ...(topic.name ? { name: topic.name } : {}), last_seen_at: now }, { onConflict: 'chat_id,thread_id' });
      }
      if (members.length) {
        // the `ping` flag is not in these rows, so a person who is already ticked stays ticked
        await db.from('tg_members').upsert(members.map((m) => ({ chat_id: chat.chat_id, ...m, last_seen_at: now })), { onConflict: 'chat_id,user_id' });
      }
    }
  } catch (e) {
    console.error('telegram-webhook failed', e?.message || e);
  }
  res.status(200).json({ ok: true }); // always 200: Telegram would otherwise retry the same update again and again
}
