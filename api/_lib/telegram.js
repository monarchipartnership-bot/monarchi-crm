// A thin Telegram Bot API client. The bot token (TELEGRAM_BOT_TOKEN) only lives in the server environment; it is never returned in a response
// or an error message. fetch is handed in, so scripts/check-core.mjs tests everything with a stand-in network.
import { createHmac } from 'node:crypto';
import { escapeHtml } from '../../src/lib/siteLeadMessage.js';

export { escapeHtml };
const API = 'https://api.telegram.org/bot';

export const hasToken = (env = process.env) => !!env.TELEGRAM_BOT_TOKEN;

async function call(method, payload, { env = process.env, fetchFn = fetch } = {}) {
  const token = env.TELEGRAM_BOT_TOKEN;
  if (!token) return { ok: false, error: 'TELEGRAM_BOT_TOKEN не налаштовано на сервері' };
  try {
    const res = await fetchFn(`${API}${token}/${method}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload || {}) });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json.ok) return { ok: false, error: String(json.description || `Telegram: помилка ${res.status}`).split(token).join('[token]').slice(0, 300) };
    return { ok: true, result: json.result };
  } catch (e) {
    return { ok: false, error: 'Немає звʼязку з Telegram: ' + String(e.message || e).split(token).join('[token]').slice(0, 200) };
  }
}

// text: HTML (the caller escapes). url: an optional «open» button under the message. replyTo: a message id in the same chat (a reminder
// replies to the original lead message). silent: no sound for the people in the chat.
export async function sendMessage({ chatId, text, url, buttonText = 'Відкрити в CRM', replyTo, silent }, deps) {
  const payload = { chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true };
  if (url) payload.reply_markup = { inline_keyboard: [[{ text: buttonText, url }]] };
  if (replyTo) payload.reply_parameters = { message_id: Number(replyTo), allow_sending_without_reply: true };
  if (silent) payload.disable_notification = true;
  return call('sendMessage', payload, deps);
}

export const botInfo = (deps) => call('getMe', {}, deps);
export const getChatMember = (chatId, userId, deps) => call('getChatMember', { chat_id: chatId, user_id: userId }, deps);
export const getChat = (chatId, deps) => call('getChat', { chat_id: chatId }, deps);
export const getChatAdministrators = (chatId, deps) => call('getChatAdministrators', { chat_id: chatId }, deps);
export const getWebhookInfo = (deps) => call('getWebhookInfo', {}, deps);
export const setWebhook = (url, secret, deps) => call('setWebhook', { url, secret_token: secret, allowed_updates: ['message', 'channel_post', 'my_chat_member', 'chat_member'], max_connections: 5 }, deps);

// The secret Telegram sends back in a header with every webhook call, derived from the token, so nothing else has to be stored.
export const webhookSecret = (env = process.env) => createHmac('sha256', env.TELEGRAM_BOT_TOKEN || '').update('monarchi-tg-webhook').digest('hex').slice(0, 40);

// What an update tells us about chats and people (the Bot API cannot list a group's members, so the bot learns them as they appear).
// → { chat: { chat_id, title, type, bot_status? } | null, members: [{ user_id, username, name, is_admin? }] }
export function peopleFromUpdate(u) {
  const msg = u.message || u.channel_post || null;
  const mcm = u.my_chat_member || null;
  const cm = u.chat_member || null;
  const raw = msg?.chat || mcm?.chat || cm?.chat;
  if (!raw || raw.id == null) return { chat: null, members: [] };
  const person = (x) => (x && !x.is_bot && x.id != null ? { user_id: x.id, username: x.username || null, name: [x.first_name, x.last_name].filter(Boolean).join(' ') || x.username || null } : null);
  const members = [];
  if (msg) { members.push(person(msg.from)); (msg.new_chat_members || []).forEach((m) => members.push(person(m))); }
  if (mcm) members.push(person(mcm.from));
  if (cm) { const p = person(cm.new_chat_member?.user); if (p) members.push({ ...p, is_admin: ['administrator', 'creator'].includes(cm.new_chat_member?.status) }); }
  const chat = { chat_id: String(raw.id), title: raw.title || [raw.first_name, raw.last_name].filter(Boolean).join(' ') || raw.username || String(raw.id), type: raw.type };
  if (mcm?.new_chat_member?.status) chat.bot_status = mcm.new_chat_member.status;
  return { chat, members: members.filter(Boolean) };
}
