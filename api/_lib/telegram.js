// A thin Telegram Bot API client. The bot token (TELEGRAM_BOT_TOKEN) only lives in the server environment; it is never returned in a response
// or an error message. fetch is handed in, so scripts/check-core.mjs tests everything with a stand-in network.
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

// text: HTML (the caller escapes). url: an optional «open» button under the message.
export async function sendMessage({ chatId, text, url, buttonText = 'Відкрити в CRM' }, deps) {
  const payload = { chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true };
  if (url) payload.reply_markup = { inline_keyboard: [[{ text: buttonText, url }]] };
  return call('sendMessage', payload, deps);
}

export const botInfo = (deps) => call('getMe', {}, deps);

// The chats the bot has recently seen (it must be added to the chat and someone must write there): for picking a chat id without typing it.
export async function recentChats(deps) {
  const r = await call('getUpdates', { limit: 100, allowed_updates: ['message', 'channel_post', 'my_chat_member'] }, deps);
  if (!r.ok) return r;
  const seen = new Map();
  for (const u of r.result || []) {
    const chat = u.message?.chat || u.channel_post?.chat || u.my_chat_member?.chat;
    if (chat?.id != null) seen.set(String(chat.id), { id: String(chat.id), title: chat.title || [chat.first_name, chat.last_name].filter(Boolean).join(' ') || chat.username || String(chat.id), type: chat.type });
  }
  return { ok: true, chats: [...seen.values()] };
}

export const escapeHtml = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
