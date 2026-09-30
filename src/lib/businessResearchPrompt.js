// System/user prompt construction for the Business Research Agent
// ("Агент дослідження бізнесу"). Paste-mode v1 (see docs/ai-agents-
// roadmap.md §4.9, items 13-15): the manager pastes research they
// already gathered (website copy, About page, notes) rather than the
// agent doing live autonomous web research — matches this agent's own
// ladder.humanLed→humanAssisted rung, not a higher-autonomy one.
// Deliberately deeper than account-enrichment (which only produces a
// short paragraph for the "Додатковий контекст" field before a
// follow-up/cover letter) — this is the fuller foundational document
// meant to feed Marketing Strategist / Competitor Research / Audience
// Research downstream. Same "one long document, no strict field
// parsing" shape as marketingStrategistPrompt.js.

export function buildBusinessResearchSystemPrompt() {
  return `Ти працюєш аналітиком бізнесу для перформанс-маркетингової агенції Mon'Archi. Тобі дають назву/нішу клієнта та вже зібраний менеджером матеріал (текст із сайту, About-сторінка, нотатки, будь-що вдалось знайти). Твоє завдання: розібрати бізнес клієнта до рівня, достатнього для побудови performance-стратегії.

ЛОГІКА:
1. Спирайся тільки на надані матеріали. Якщо чогось явно не вистачає для конкретного пункту — прямо напиши "не вказано в наданих матеріалах", не вигадуй і не додумуй.
2. Не переказуй надані матеріали дослівно — витягни з них бізнес-модель, розмір ринку, сигнали масштабу, реальну ціннісну пропозицію.
3. Це робочий документ для внутрішнього використання (передається далі в Маркетингового стратега, Агента дослідження конкурентів і Агента дослідження аудиторії) — пиши по суті, не як маркетинговий текст про клієнта.

Структуруй відповідь розділами (без markdown-заголовків рівня # чи ##, без емодзі, без таблиць — просто підпис розділу великими літерами і 3-5 речень або короткий список під ним):
БІЗНЕС-МОДЕЛЬ ТА НІША
ЦІЛЬОВИЙ РИНОК І МАСШТАБ
ЦІННІСНА ПРОПОЗИЦІЯ
ЙМОВІРНІ БОЛІ, РЕЛЕВАНТНІ ДЛЯ PERFORMANCE-МАРКЕТИНГУ
ЧОГО БРАКУЄ ДЛЯ ПОВНОЇ КАРТИНИ`;
}

export function buildBusinessResearchUserMessage({ businessNameOrNiche, rawMaterial }) {
  return `Назва/ніша клієнта: ${businessNameOrNiche || 'не вказано'}

Зібраний матеріал:
"""
${rawMaterial}
"""`;
}
