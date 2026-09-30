// System/user prompt construction for the AI Account Manager Agent
// ("AI-акаунт-менеджер"). Unlike most agents so far, its input isn't
// pasted text — it's a deterministic aggregation of a client's existing
// CRM data (client record, deals, tasks, AI agent history), built by
// src/lib/api/accountManagerData.js. This module only turns that already-
// gathered digest into a narrative briefing.

function fmtMoney(amount, currency) {
  if (amount == null) return null;
  return `${Number(amount).toLocaleString('uk-UA')} ${currency || ''}`.trim();
}

function daysAgo(iso) {
  if (!iso) return null;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
}

export function buildAccountManagerSystemPrompt() {
  return `Ти працюєш AI-акаунт-менеджером для перформанс-маркетингової агенції Mon'Archi. Тобі дають зведення реальних даних про клієнта з CRM (угоди, задачі, історія роботи AI-агентів). Твоє завдання: скласти короткий брифінг для менеджера перед наступною взаємодією з цим клієнтом.

ЛОГІКА:
1. Спирайся ТІЛЬКИ на надані дані — не вигадуй фактів, яких там немає.
2. Визнач загальний стан відносин: активний клієнт, застояний, новий лід, чи є відкриті угоди.
3. Виділи, що потребує уваги найперше: прострочені задачі, угоди без активності, незавершені AI-розмови, що чекають перегляду.
4. Запропонуй один конкретний наступний крок.
5. Якщо даних дуже мало (немає угод, задач чи історії) — прямо напиши про це, не роздувай текст порожніми фразами.

Відповідай СУВОРО у цьому форматі, без markdown-форматування (без зірочок, без **жирного**) у рядках СТАТУС і ЩО ПОТРЕБУЄ УВАГИ:
СТАТУС: [короткий статус в 2-4 словах, напр. "Активна угода в переговорах" або "Немає активності 20+ днів"]
ЩО ПОТРЕБУЄ УВАГИ: [конкретний перелік, або "нічого термінового"]
---
[короткий брифінг для менеджера, 3-5 речень: загальна картина і рекомендований наступний крок]`;
}

export function buildAccountManagerUserMessage({ client, deals, tasks, conversations }) {
  const clientLines = [
    `Ім'я: ${client?.name || '—'}`,
    client?.company ? `Компанія: ${client.company}` : null,
    client?.niche ? `Ніша: ${client.niche}` : null,
    client?.country ? `Країна: ${client.country}` : null,
  ].filter(Boolean).join('\n');

  const dealsBlock = deals.length
    ? deals.map((d) => {
        const stale = daysAgo(d.updated_at);
        return `- ${d.title || d.clients?.company || 'Без назви'} — етап «${d.deal_stages?.label || '—'}», ${fmtMoney(d.amount, d.currency) || 'сума не вказана'}, оновлено ${stale != null ? stale + ' дн. тому' : '—'}`;
      }).join('\n')
    : 'Немає угод.';

  const openTasks = tasks.filter((t) => t.status !== 'done' && t.status !== 'completed');
  const tasksBlock = openTasks.length
    ? openTasks.map((t) => `- ${t.text || t.title || 'Без опису'} (статус: ${t.status || '—'}${t.scheduled_at ? ', заплановано на ' + new Date(t.scheduled_at).toLocaleDateString('uk-UA') : ''})`).join('\n')
    : 'Немає відкритих задач.';

  const convBlock = conversations.length
    ? conversations.slice(0, 5).map((c) => `- ${c.title || 'Розмова'} (${c.agent_key}, ${c.needs_review ? 'чекає перевірки' : 'переглянуто'})`).join('\n')
    : 'Немає історії роботи AI-агентів з цим клієнтом.';

  return `Дані про клієнта:
${clientLines}

Угоди:
${dealsBlock}

Відкриті задачі:
${tasksBlock}

Історія роботи AI-агентів (останні):
${convBlock}`;
}

export function parseAccountManagerReply(fullText) {
  const parts = fullText.split('---');
  let headerPart = parts[0] || '';
  let briefing = parts.slice(1).join('---').trim();

  if (!briefing) {
    briefing = fullText.trim();
    headerPart = '';
  }

  const statusMatch = headerPart.match(/СТАТУС:\s*(.+)/);
  const attentionMatch = headerPart.match(/ЩО ПОТРЕБУЄ УВАГИ:\s*([\s\S]+)/);
  // Defensive strip in case the model uses markdown bold/asterisks anyway —
  // don't rely solely on prompt compliance for formatting.
  const stripMarkdown = (s) => s?.trim().replace(/^\*+|\*+$/g, '').trim() ?? null;

  return {
    status: stripMarkdown(statusMatch?.[1]),
    attention: stripMarkdown(attentionMatch?.[1]),
    briefing,
  };
}
