// The Telegram side of the «Заявки з сайту» settings page, for a signed-in team member:
//   { action: 'status' }                 is the bot token set on the server, and which bot is it
//   { action: 'chats' }                  the chats the bot has recently seen (to pick a chat id without typing it)
//   { action: 'test', chatId }           sends a test message to a chat
import { createClient } from '@supabase/supabase-js';
import { botInfo, hasToken, recentChats, sendMessage } from './_lib/telegram.js';

const SUPA_URL = 'https://meyacsdlosuqbkbichsf.supabase.co';
const SUPA_KEY = 'sb_publishable_jnJ1vdEUtn8ytNdJ4KT5Eg_TVlzWYcA';

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) { res.status(401).json({ error: 'Потрібна авторизація' }); return; }
  const { data, error } = await createClient(SUPA_URL, SUPA_KEY).auth.getUser(token);
  if (error || !data?.user) { res.status(401).json({ error: 'Сесія недійсна' }); return; }

  const { action, chatId } = req.body || {};
  if (action === 'status') {
    if (!hasToken()) { res.status(200).json({ tokenSet: false }); return; }
    const me = await botInfo();
    res.status(200).json({ tokenSet: true, ok: me.ok, bot: me.ok ? { username: me.result.username, name: me.result.first_name } : null, error: me.ok ? null : me.error });
    return;
  }
  if (action === 'chats') {
    const r = await recentChats();
    res.status(r.ok ? 200 : 502).json(r.ok ? { chats: r.chats } : { error: r.error });
    return;
  }
  if (action === 'test') {
    const id = String(chatId || '').trim();
    if (!id) { res.status(400).json({ error: 'Вкажіть chat id.' }); return; }
    const r = await sendMessage({ chatId: id, text: '✅ <b>Тест Mon\'Archi CRM</b>\nСюди надходитимуть нові заявки з сайту.' });
    res.status(r.ok ? 200 : 502).json(r.ok ? { ok: true } : { error: r.error });
    return;
  }
  res.status(400).json({ error: 'Невідома дія' });
}
