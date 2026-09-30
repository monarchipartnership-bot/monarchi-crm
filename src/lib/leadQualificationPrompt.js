// System/user prompt construction for the Lead Qualification Agent
// ("Агент кваліфікації лідів"). Deliberately does NOT hardcode ICP
// criteria (target niche, budget thresholds, disqualifying factors) —
// no such definition exists anywhere in this codebase to reuse, and
// inventing one would mean fabricating a business rule nobody actually
// set. The ICP criteria are a required input the manager supplies
// themselves (their own real, current definition), same "human supplies
// the constraint, agent applies it consistently" shape as the ladder
// concept already in aiAgentsData.js.

export function buildLeadQualificationSystemPrompt() {
  return `Ти працюєш аналітиком кваліфікації лідів для перформанс-маркетингової агенції Mon'Archi. Тобі дають дані реальної угоди з CRM і критерії ICP (ideal customer profile), які визначив менеджер. Твоє завдання: оцінити, наскільки ця угода відповідає заданим критеріям.

ЛОГІКА:
1. Порівняй дані угоди з КОЖНИМ наданим критерієм ICP окремо.
2. Не вигадуй даних про угоду, яких не надано — якщо якогось поля немає (напр. бюджет не вказано), прямо познач це як невідомо, не вважай це автоматично проблемою чи перевагою.
3. Онови вердикт: КВАЛІФІКОВАНО (добре відповідає більшості критеріїв), ПІД ПИТАННЯМ (відповідає частково або бракує даних для впевненості), НЕ КВАЛІФІКОВАНО (явно не відповідає одному чи більше критеріям).
4. Для кожного критерію коротко напиши, відповідає угода чи ні (або невідомо) і чому.

Відповідай СУВОРО у цьому форматі, без markdown-форматування (без зірочок, без **жирного**):
ВЕРДИКТ: [КВАЛІФІКОВАНО / ПІД ПИТАННЯМ / НЕ КВАЛІФІКОВАНО]
ОЦІНКА ЗА КРИТЕРІЯМИ: [по одному критерію на рядок, без маркерів списку "-": критерій — відповідність — коротке пояснення]
---
[короткий підсумок для менеджера, 2-3 речення: чи варто витрачати час на цю угоду і чому]`;
}

export function buildLeadQualificationUserMessage({ deal, icpCriteria }) {
  const dealLines = [
    `Назва: ${deal.title || deal.clients?.company || deal.clients?.name || 'Без назви'}`,
    `Етап: ${deal.deal_stages?.label || '—'}`,
    `Сума: ${deal.amount != null ? Number(deal.amount).toLocaleString('uk-UA') + ' ' + (deal.currency || '') : 'не вказано'}`,
    `Джерело: ${deal.source || 'не вказано'}`,
    `Ніша: ${deal.niche || 'не вказано'}`,
    `Країна: ${deal.country || 'не вказано'}`,
  ].join('\n');

  return `Дані угоди:
${dealLines}

Критерії ICP, задані менеджером:
"""
${icpCriteria}
"""`;
}

export function parseLeadQualificationReply(fullText) {
  const parts = fullText.split('---');
  let headerPart = parts[0] || '';
  let summary = parts.slice(1).join('---').trim();

  if (!summary) {
    summary = fullText.trim();
    headerPart = '';
  }

  const verdictMatch = headerPart.match(/ВЕРДИКТ:\s*(.+)/);
  const criteriaMatch = headerPart.match(/ОЦІНКА ЗА КРИТЕРІЯМИ:\s*([\s\S]+)/);
  // Defensive strip in case the model uses markdown bold/asterisks anyway —
  // don't rely solely on prompt compliance for formatting (see the same
  // fix in accountManagerPrompt.js).
  const stripMarkdown = (s) => s?.trim().replace(/^\*+|\*+$/g, '').trim() ?? null;

  return {
    verdict: stripMarkdown(verdictMatch?.[1]),
    criteriaAssessment: criteriaMatch?.[1]?.trim().replace(/^[-*]\s*/gm, '').replace(/\*\*/g, '') ?? null,
    summary: summary.replace(/\*\*/g, ''),
  };
}
