// The window «Підключення» of the AI Agents section: what the agents work with, and whether it works (written after the pilot, where most of the time went on access, not on the agents:
// a token without the right to write, a page that was not assigned, an app in the development mode). Secrets are NEVER returned: only the state and the NAMES of what is missing.
// Everything is injected (env, fetch, the notice settings), so scripts/check-workflow.mjs runs it without a network. The calls to Meta only read.
import { createMetaWriter } from '../metaAdsWrite.js';
import { missingConfig } from '../hfImage.js';
import { botInfo } from '../telegram.js';

const GOOGLE_OAUTH = ['GOOGLE_OAUTH_CLIENT_ID', 'GOOGLE_OAUTH_CLIENT_SECRET', 'GOOGLE_OAUTH_REFRESH_TOKEN'];
const GOOGLE_ADS = ['GOOGLE_ADS_DEVELOPER_TOKEN', 'GOOGLE_ADS_CLIENT_ID', 'GOOGLE_ADS_CLIENT_SECRET', 'GOOGLE_ADS_REFRESH_TOKEN'];
const missing = (env, names) => names.filter((k) => !String(env[k] || '').trim());
const has = (list, p) => list.includes(p);
const mk = (key, title, tone, text, details = []) => ({ key, title, tone, text, details });

// one token of Meta: who it is, which permissions it has. kind: 'read' (needs ads_read) | 'write' (needs ads_management and the permissions of pages)
async function metaCheck({ key, title, token, kind, fetchFn }) {
  if (!token) return mk(key, title, 'bad', kind === 'write' ? 'Не задано META_WRITE_TOKEN (і META_ACCESS_TOKEN для запасу): агенти не можуть писати в кабінети.' : 'Не задано META_ACCESS_TOKEN: агенти не читають кабінети.');
  let d;
  try { d = await createMetaWriter({ token, fetchFn }).diagnose(); } catch (e) { return mk(key, title, 'bad', 'Не вдалося перевірити токен: ' + String(e.message || e).slice(0, 160)); }
  if (d.error) return mk(key, title, 'bad', `Meta не прийняла токен: ${d.error}`);
  const perms = d.permissions || [];
  const details = [`Користувач токена: ${d.who || '—'}`, `Права: ${perms.join(', ') || 'немає'}`, `Сторінки, доступні користувачу: ${(d.pages || []).length}`];
  if (kind === 'read') return has(perms, 'ads_read') ? mk(key, title, 'ok', 'Токен читання працює.', details) : mk(key, title, 'bad', 'У токена немає права ads_read: кабінети не читаються.', details);
  if (!d.hasManagement) return mk(key, title, 'bad', 'У токена немає права ads_management: Медіабаєр не може створювати кампанії. Створіть токен користувача системи з цим правом і задайте його як META_WRITE_TOKEN.', details);
  const noPages = ['pages_show_list', 'pages_read_engagement'].filter((p) => !has(perms, p));
  if (noPages.length) return mk(key, title, 'warn', `Право запису є, але немає прав сторінок (${noPages.join(', ')}): реклама від імені сторінки може не створитися.`, details);
  return mk(key, title, 'ok', 'Токен запису має право керувати кампаніями. Доступ до кожного кабінету і сторінки перевіряє «Готовність до запуску» в проєкті.', details);
}

// → [{ key, title, tone: 'ok' | 'warn' | 'bad' | 'mute', text, details }]
export async function connectionChecks({ env = {}, fetchFn = fetch, settings = {}, now = new Date(), telegramInfo = botInfo } = {}) {
  const out = [];
  out.push(await metaCheck({ key: 'meta_read', title: 'Meta: читання кабінетів', token: env.META_ACCESS_TOKEN, kind: 'read', fetchFn }));
  out.push(await metaCheck({ key: 'meta_write', title: 'Meta: запис у кабінети', token: env.META_WRITE_TOKEN || env.META_ACCESS_TOKEN, kind: 'write', fetchFn }));
  const hf = missingConfig(env);
  out.push(hf.length ? mk('images', 'Генерація картинок (Higgsfield)', 'bad', `Не задано: ${hf.join(', ')}. Креатор робить тексти, але не картинки.`) : mk('images', 'Генерація картинок (Higgsfield)', 'ok', 'Ключі й модель задано. Ліміт картинок на проєкт береться з ліміту проєкту.'));
  out.push(String(env.ANTHROPIC_API_KEY || '').trim() ? mk('model', 'Модель (Anthropic)', 'ok', 'Ключ задано. Витрати дивіться у вікні «Витрати».') : mk('model', 'Модель (Anthropic)', 'bad', 'Не задано ANTHROPIC_API_KEY: агенти, що пишуть тексти, не працюють.'));
  // Telegram: the token, the bot, the chat of the notices
  if (!env.TELEGRAM_BOT_TOKEN) out.push(mk('telegram', 'Telegram-сповіщення', 'bad', 'Не задано TELEGRAM_BOT_TOKEN: сповіщення про апруви й зупинки не надсилаються.'));
  else {
    const info = await telegramInfo({ env, fetchFn }).catch((e) => ({ ok: false, error: String(e.message || e) }));
    const chat = settings.notify_chat || null;
    if (!info.ok) out.push(mk('telegram', 'Telegram-сповіщення', 'bad', `Бот не відповідає: ${String(info.error || '').slice(0, 140)}`));
    else if (!chat) out.push(mk('telegram', 'Telegram-сповіщення', 'warn', `Бот ${info.result?.username ? '@' + info.result.username : ''} працює, але чат для сповіщень не вказано.`));
    else out.push(mk('telegram', 'Telegram-сповіщення', 'ok', `Бот ${info.result?.username ? '@' + info.result.username : ''} працює, чат сповіщень вказано.`));
  }
  // the orchestrator: the clock of the cron
  const tick = settings.last_tick_at ? (now - new Date(settings.last_tick_at)) / 60000 : null;
  out.push(tick == null ? mk('orchestrator', 'Оркестратор (щохвилинний крон)', 'bad', 'Немає жодного проходу: крон не працює.') : tick < 3 ? mk('orchestrator', 'Оркестратор (щохвилинний крон)', 'ok', 'Крон працює, останній прохід менше 3 хвилин тому.') : tick < 15 ? mk('orchestrator', 'Оркестратор (щохвилинний крон)', 'warn', `Останній прохід ${Math.round(tick)} хв тому: крон повільний.`) : mk('orchestrator', 'Оркестратор (щохвилинний крон)', 'bad', `Останній прохід ${Math.round(tick)} хв тому: крон не працює.`));
  const ga = missing(env, GOOGLE_OAUTH);
  out.push(ga.length ? mk('ga4', 'Google Analytics (GA4)', 'warn', `Не задано: ${ga.join(', ')}. Дослідник не читає аудиторію з GA4.`) : mk('ga4', 'Google Analytics (GA4)', 'ok', 'Ключі задано. Доступ до кожного клієнта потрібен у брифі (GA4 Property ID).'));
  const gads = missing(env, GOOGLE_ADS);
  out.push(gads.length ? mk('google_ads', 'Google Ads', 'bad', `Не задано: ${gads.join(', ')}.`) : mk('google_ads', 'Google Ads', 'warn', 'Звіти читаються. Агентів для Google ще немає: чекаємо опис від фахівців.'));
  out.push(mk('tiktok', 'TikTok', 'mute', 'Не підключено: потрібен доступ до API, піксель і пробний проєкт.'));
  return out;
}
