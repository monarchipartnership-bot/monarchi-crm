// System/user prompt construction for the Reply Analyzer Agent
// ("Агент аналізу відповідей"). Same standalone paste-text shape as
// job-post-analyzer — classifies an inbound client reply and suggests a
// concrete next step. No markdown formatting instruction + defensive
// strip baked in from the start (see accountManagerPrompt.js/
// leadQualificationPrompt.js for the bug this avoids).

export function buildReplyAnalyzerSystemPrompt() {
  return `Ти працюєш аналітиком відповідей клієнтів для перформанс-маркетингової агенції Mon'Archi. Тобі дають вхідну відповідь клієнта (і, за наявності, наше попереднє повідомлення, на яке клієнт відповідає). Твоє завдання: визначити тип відповіді і запропонувати конкретний наступний крок.

ЛОГІКА:
1. Визнач тип відповіді: ЗАЦІКАВЛЕНІСТЬ (готовий рухатись далі), ПОТРІБНО БІЛЬШЕ ІНФОРМАЦІЇ (питання, уточнення), ЗАПЕРЕЧЕННЯ (ціна, час, довіра тощо), НЕ АКТУАЛЬНО (відмова чи втрата інтересу), НЕЙТРАЛЬНО/НЕВИЗНАЧЕНО (розмита відповідь без чіткого сигналу).
2. Якщо є заперечення — визнач яке саме (ціна, терміни, довіра, вже працюють з кимось іншим, невизначений бюджет тощо).
3. Запропонуй ОДИН конкретний наступний крок — не загальну пораду, а те, що менеджер реально може зробити просто зараз.
4. Не вигадуй деталей, яких немає в тексті відповіді клієнта.

Відповідай СУВОРО у цьому форматі, без markdown-форматування (без зірочок, без **жирного**, без маркерів списку):
ТИП ВІДПОВІДІ: [ЗАЦІКАВЛЕНІСТЬ / ПОТРІБНО БІЛЬШЕ ІНФОРМАЦІЇ / ЗАПЕРЕЧЕННЯ / НЕ АКТУАЛЬНО / НЕЙТРАЛЬНО]
ЗАПЕРЕЧЕННЯ: [конкретне заперечення, або "немає"]
---
[короткий наступний крок для менеджера, 1-3 речення]`;
}

export function buildReplyAnalyzerUserMessage({ clientReply, ourPreviousMessage }) {
  return `${ourPreviousMessage ? 'Наше попереднє повідомлення:\n"""\n' + ourPreviousMessage + '\n"""\n\n' : ''}Відповідь клієнта:
"""
${clientReply}
"""`;
}

function stripMarkdown(s) {
  return s?.trim().replace(/\*\*/g, '').replace(/^[-*]\s*/gm, '').replace(/^\*+|\*+$/g, '').trim() ?? null;
}

export function parseReplyAnalyzerReply(fullText) {
  const parts = fullText.split('---');
  let headerPart = parts[0] || '';
  let nextStep = parts.slice(1).join('---').trim();

  if (!nextStep) {
    nextStep = fullText.trim();
    headerPart = '';
  }

  const typeMatch = headerPart.match(/ТИП ВІДПОВІДІ:\s*(.+)/);
  const objectionMatch = headerPart.match(/ЗАПЕРЕЧЕННЯ:\s*(.+)/);

  return {
    replyType: stripMarkdown(typeMatch?.[1])?.toUpperCase() ?? null,
    objection: stripMarkdown(objectionMatch?.[1]),
    nextStep: stripMarkdown(nextStep),
  };
}
