// «Стан системи» (spec 2026-11-02, §8): one honest list of what keeps the AI agents working — the clock (cron), the keys, the queue, the notices.
// Pure code over what the server read; a check is { key, label, status: 'ok' | 'warn' | 'bad', detail }. Nothing here ever contains a key's value, only whether it is set.

// What each key is for, and how bad it is when it is missing (bad: nothing works; warn: one part does not work).
export const KEYS = [
  { env: 'ANTHROPIC_API_KEY', label: 'Claude (мозок агентів)', level: 'bad' },
  { env: 'CRON_SECRET', label: 'Секрет годинника (cron)', level: 'bad' },
  { env: 'AGENT_EMAIL', label: 'Користувач агентів', level: 'bad' },
  { env: 'HF_API_KEY_ID', label: 'Higgsfield: ключ (id)', level: 'warn' },
  { env: 'HF_API_KEY_SECRET', label: 'Higgsfield: ключ (secret)', level: 'warn' },
  { env: 'HF_IMAGE_MODEL', label: 'Higgsfield: модель картинок', level: 'warn' },
  { env: 'TELEGRAM_BOT_TOKEN', label: 'Telegram-бот', level: 'warn' },
  { env: 'META_ACCESS_TOKEN', label: 'Meta: доступ до кабінетів', level: 'warn' },
  { env: 'FIGMA_TOKEN', label: 'Figma: макети клієнтів', level: 'warn' },
];

const MIN = 60000;
const worst = (list) => (list.some((c) => c.status === 'bad') ? 'bad' : list.some((c) => c.status === 'warn') ? 'warn' : 'ok');

// env: { NAME: boolean } (set or not); settings: the ai_agent_settings row; tasks: [{ status, created_at, lease_until, finished_at }] of the last 2 days.
// → { status, checks: [{ key, label, status, detail }] }
export function buildSystemState({ env = {}, settings = null, tasks = [], now = new Date() } = {}) {
  const checks = [];
  const t = now.getTime();

  // the clock
  const tick = settings?.last_tick_at ? new Date(settings.last_tick_at).getTime() : null;
  if (tick == null) checks.push({ key: 'cron', label: 'Годинник агентів (щохвилини)', status: 'warn', detail: 'Ще не було жодного запуску.' });
  else {
    const age = Math.round((t - tick) / MIN);
    const errs = settings?.last_tick_report?.errors?.length || 0;
    checks.push({ key: 'cron', label: 'Годинник агентів (щохвилини)', status: age <= 3 ? (errs ? 'warn' : 'ok') : age <= 15 ? 'warn' : 'bad', detail: age <= 3 ? `Останній запуск ${age} хв тому${errs ? `, з помилками: ${errs}` : ''}.` : `Останній запуск ${age} хв тому, годинник не працює як треба.` });
  }

  // the keys
  KEYS.forEach((k) => checks.push({ key: `key:${k.env}`, label: k.label, status: env[k.env] ? 'ok' : k.level, detail: env[k.env] ? 'Налаштовано.' : 'Не налаштовано на сервері.' }));

  // the queue
  const stuck = tasks.filter((x) => x.status === 'running' && x.lease_until && new Date(x.lease_until).getTime() < t - 10 * MIN).length;
  const waiting = tasks.filter((x) => x.status === 'queued' && t - new Date(x.created_at).getTime() > 15 * MIN).length;
  const failed = tasks.filter((x) => x.status === 'failed' && x.finished_at && t - new Date(x.finished_at).getTime() < 24 * 60 * MIN).length;
  checks.push({ key: 'stuck', label: 'Завдання, що зависли', status: stuck ? 'bad' : 'ok', detail: stuck ? `${stuck} працюють понад 10 хв після закінчення броні: їх можна перезапустити.` : 'Немає.' });
  checks.push({ key: 'waiting', label: 'Черга', status: waiting ? 'warn' : 'ok', detail: waiting ? `${waiting} чекають понад 15 хв.` : 'Черга рухається.' });
  checks.push({ key: 'failed', label: 'Помилки за добу', status: failed ? 'warn' : 'ok', detail: failed ? `${failed} завдань не вдалося за останню добу.` : 'Немає.' });

  // the notices
  const people = (settings?.notify_emails || []).length;
  checks.push({
    key: 'notices', label: 'Сповіщення про витрати й увагу',
    status: !settings?.enabled ? 'warn' : people || settings.tg_chat_id ? 'ok' : 'warn',
    detail: !settings?.enabled ? 'Вимкнені.' : settings.tg_chat_id ? 'У дзвінок CRM і в Telegram.' : people ? 'Тільки в дзвінок CRM (Telegram-групу не вказано).' : 'Нікому надсилати: не вказано ні людей, ні групи.',
  });

  return { status: worst(checks), checks };
}

// The agents whose work hangs: a task still «running» more than 10 minutes after its booking ended (the worker died). tasks: [{ agent_id, status, lease_until }]
// → the ids of the agents to restart (each once)
export function stuckAgents(tasks = [], now = new Date()) {
  const t = now.getTime();
  return [...new Set(tasks.filter((x) => x.status === 'running' && x.lease_until && new Date(x.lease_until).getTime() < t - 10 * MIN).map((x) => x.agent_id).filter((id) => id != null))];
}

// The test message of the page «Стан системи»: which topic it goes to and what it says.
export function telegramTest(settings, thread = 'attention', by = '') {
  const chatId = String(settings?.tg_chat_id || '').trim();
  if (!chatId) throw new Error('Чат Telegram не вказано: заповніть його в «Сповіщення» і збережіть.');
  const threadId = thread === 'spend' ? settings.spend_thread_id : settings.attention_thread_id;
  return { chatId, threadId: threadId || undefined, text: `✅ <b>Перевірка сповіщень AI Agents</b>\nГілка: ${thread === 'spend' ? 'витрати' : 'потрібна увага'}.${by ? `\nНадіслав: ${String(by).replace(/[<>&]/g, '')}` : ''}` };
}
