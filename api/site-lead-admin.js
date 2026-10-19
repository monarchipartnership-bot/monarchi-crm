// The Telegram side of the «Заявки з сайту» settings page, for a signed-in team member:
//   { action: 'status' }                       is the bot alive, is the webhook set (it is set here when missing), is the bot still in each chat
//   { action: 'chats' }                        the chats the bot has seen (to choose a chat without typing its id)
//   { action: 'members', chatId }              the people the bot knows in a chat (admins are refreshed from Telegram first)
//   { action: 'test', chatId, template?, showButton? }   sends the message form (a sample lead) to a chat
import { createClient } from '@supabase/supabase-js';
import { buildTelegramText, loadPings, SAMPLE } from './_lib/siteLead.js';
import { botInfo, getChatAdministrators, getChatMember, getWebhookInfo, hasToken, sendMessage, setWebhook, webhookSecret } from './_lib/telegram.js';

const SUPA_URL = 'https://meyacsdlosuqbkbichsf.supabase.co';
const SUPA_KEY = 'sb_publishable_jnJ1vdEUtn8ytNdJ4KT5Eg_TVlzWYcA';
const WEBHOOK_URL = `${process.env.CRM_BASE_URL || 'https://crm.monarchi.agency'}/api/telegram-webhook`;

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) { res.status(401).json({ error: 'Потрібна авторизація' }); return; }
  const { data, error } = await createClient(SUPA_URL, SUPA_KEY).auth.getUser(token);
  if (error || !data?.user) { res.status(401).json({ error: 'Сесія недійсна' }); return; }
  const db = createClient(SUPA_URL, SUPA_KEY, { global: { headers: { Authorization: 'Bearer ' + token } }, auth: { persistSession: false, autoRefreshToken: false } });

  const { action, chatId } = req.body || {};
  if (action === 'status') {
    if (!hasToken()) { res.status(200).json({ tokenSet: false }); return; }
    const me = await botInfo();
    if (!me.ok) { res.status(200).json({ tokenSet: true, ok: false, error: me.error }); return; }
    // the webhook is how the bot learns chats and people: it is switched on here, once, when missing or pointing somewhere else
    let hook = await getWebhookInfo();
    let webhook = { ok: hook.ok && hook.result?.url === WEBHOOK_URL, lastError: hook.result?.last_error_message || null };
    if (!webhook.ok) {
      const set = await setWebhook(WEBHOOK_URL, webhookSecret());
      webhook = { ok: set.ok, lastError: set.ok ? null : set.error, justSet: set.ok };
    }
    const settings = (await db.from('site_lead_settings').select('telegram_chat_ids').eq('id', 1).maybeSingle()).data;
    const checks = {};
    await Promise.all((settings?.telegram_chat_ids || []).map(async (id) => {
      const m = await getChatMember(id, me.result.id);
      checks[id] = m.ok ? { ok: ['member', 'administrator', 'creator'].includes(m.result.status), status: m.result.status } : { ok: false, error: m.error };
    }));
    res.status(200).json({ tokenSet: true, ok: true, bot: { username: me.result.username, name: me.result.first_name }, webhook, chats: checks });
    return;
  }
  if (action === 'chats') {
    const rows = (await db.from('tg_chats').select('*').order('last_seen_at', { ascending: false })).data || [];
    res.status(200).json({ chats: rows.map((c) => ({ id: c.chat_id, title: c.title, type: c.type, bot_status: c.bot_status })) });
    return;
  }
  if (action === 'members') {
    const id = String(chatId || '').trim();
    if (!id) { res.status(400).json({ error: 'Вкажіть чат.' }); return; }
    const admins = await getChatAdministrators(id);
    if (admins.ok) {
      await db.from('tg_chats').upsert({ chat_id: id, last_seen_at: new Date().toISOString() }, { onConflict: 'chat_id', ignoreDuplicates: true });
      const rows = (admins.result || []).filter((a) => !a.user.is_bot).map((a) => ({ chat_id: id, user_id: a.user.id, username: a.user.username || null, name: [a.user.first_name, a.user.last_name].filter(Boolean).join(' ') || a.user.username || null, is_admin: true, last_seen_at: new Date().toISOString() }));
      if (rows.length) await db.from('tg_members').upsert(rows, { onConflict: 'chat_id,user_id' });
    }
    const members = (await db.from('tg_members').select('*').eq('chat_id', id).order('name', { ascending: true })).data || [];
    res.status(200).json({ members, adminsError: admins.ok ? null : admins.error });
    return;
  }
  if (action === 'test') {
    const id = String(chatId || '').trim();
    if (!id) { res.status(400).json({ error: 'Вкажіть chat id.' }); return; }
    const { template, showButton, threadId } = req.body || {};
    const pings = (await loadPings(db))[id] || '';
    const text = buildTelegramText(SAMPLE, { template: typeof template === 'string' && template.trim() ? template : undefined, pings });
    const r = await sendMessage({ chatId: id, threadId: threadId || undefined, text: `🧪 <i>Тест форми повідомлення</i>\n\n${text}`, url: showButton === false ? undefined : (process.env.CRM_BASE_URL || 'https://crm.monarchi.agency') + '/reports/deals' });
    res.status(r.ok ? 200 : 502).json(r.ok ? { ok: true } : { error: r.error });
    return;
  }
  res.status(400).json({ error: 'Невідома дія' });
}
