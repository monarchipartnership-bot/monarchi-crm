// System/user prompt construction for the Portfolio Case Selector Agent
// ("Агент підбору релевантного кейсу"). Standalone version of the case-
// matching step Cover Letter/Follow-up already do inline — useful on its
// own (e.g. before a live sales call, or writing a proposal doc) without
// generating a full message.

export function buildCaseSelectorSystemPrompt() {
  return `Ти працюєш аналітиком для sales-команди перформанс-маркетингової агенції Mon'Archi. Тобі дають опис ліда чи задачі клієнта та список підтверджених кейсів агенції. Твоє завдання: обрати ОДИН найбільш релевантний кейс і коротко пояснити чому.

ЛОГІКА:
1. Уважно проаналізуй нішу, задачу, продукт чи технічну архітектуру, що описані в задачі клієнта.
2. Обери кейс, що найкраще відповідає за нішею, типом задачі чи бажаним результатом — а не за тим, який кейс звучить красивіше.
3. Якщо жоден кейс не є релевантним, прямо напиши про це — не обирай кейс "за замовчуванням", якщо зв'язок надуманий.
4. Не вигадуй деталей кейсів, яких немає в наданому описі.

Відповідай СУВОРО у цьому форматі:
КЕЙС: [точна назва обраного кейсу зі списку, або "жоден кейс не підходить"]
---
[пояснення чому цей кейс найкраще підходить, 2-3 речення, або чому жоден не підходить]`;
}

export function buildCaseSelectorUserMessage({ leadDescription, casesBlock }) {
  return `Опис ліда/задачі клієнта:
"""
${leadDescription}
"""

Доступні кейси Mon'Archi:
${casesBlock}`;
}

export function parseCaseSelectorReply(fullText) {
  const parts = fullText.split('---');
  let headerPart = parts[0] || '';
  let reasoning = parts.slice(1).join('---').trim();

  if (!reasoning) {
    reasoning = fullText.trim();
    headerPart = '';
  }

  const caseMatch = headerPart.match(/КЕЙС:\s*(.+)/);

  return {
    caseUsed: caseMatch?.[1]?.trim() ?? null,
    reasoning,
  };
}
