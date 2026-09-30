// System/user prompt construction for the AI Quality Controller Agent
// ("Контролер якості AI"). Reuses CORE_WRITING_RULES_BLOCK from
// followupPrompt.js directly — that block is already the agency's own
// definition of "good writing," so this agent's job is literally to
// check any AI-generated text against the same bar every other
// text-generating agent (Cover Letter, Follow-up, Job Post Analyzer's
// summary) is supposed to meet, rather than inventing a second, possibly
// inconsistent set of quality criteria.
import { CORE_WRITING_RULES_BLOCK } from './followupPrompt';

export function buildQualityControllerSystemPrompt() {
  return `Ти працюєш незалежним контролером якості для sales/маркетингової агенції Mon'Archi. Тобі дають текст, згенерований іншим AI-агентом (лист, follow-up, sales brief тощо), і, за наявності, оригінальний контекст/задачу, під яку цей текст був згенерований. Твоє завдання: незалежно перевірити текст перед тим, як людина його використає чи відправить.

ПЕРЕВІР ЗА ЦИМИ КРИТЕРІЯМИ:
1. Базові правила письма агенції (нижче) — чи дотримано їх.
2. Ризик галюцинації: чи є в тексті факти, цифри, назви компаній, результати чи твердження, які НЕ підтверджуються наданим оригінальним контекстом. Якщо оригінальний контекст не надано, познач це і оціни лише внутрішню логічність тексту.
3. Тон і професійність: чи відповідає тон діловому спілкуванню агенції, чи немає зайвої фамільярності, надмірного тиску, порожніх обіцянок.
4. Точність: чи немає внутрішніх суперечностей у самому тексті (наприклад, різні цифри для одного й того самого показника).

${CORE_WRITING_RULES_BLOCK}

Відповідай СУВОРО у цьому форматі:
ВЕРДИКТ: [ГОТОВО / ПОТРЕБУЄ ПРАВОК / КРИТИЧНО]
ЗНАЙДЕНІ ПРОБЛЕМИ: [конкретний перелік, або "не знайдено" якщо все гаразд]
---
[короткий підсумок для людини, 2-4 речення: чи можна відправляти текст як є, і якщо ні — що саме виправити]`;
}

export function buildQualityControllerUserMessage({ outputToReview, originalContext }) {
  return `Текст на перевірку:
"""
${outputToReview}
"""

${originalContext ? 'Оригінальний контекст/задача, під яку це було згенеровано:\n"""\n' + originalContext + '\n"""' : 'Оригінальний контекст не надано — оціни лише внутрішню логічність і дотримання базових правил письма.'}`;
}

export function parseQualityControllerReply(fullText) {
  const parts = fullText.split('---');
  let headerPart = parts[0] || '';
  let summary = parts.slice(1).join('---').trim();

  if (!summary) {
    summary = fullText.trim();
    headerPart = '';
  }

  const verdictMatch = headerPart.match(/ВЕРДИКТ:\s*(.+)/);
  const issuesMatch = headerPart.match(/ЗНАЙДЕНІ ПРОБЛЕМИ:\s*([\s\S]+)/);

  return {
    verdict: verdictMatch?.[1]?.trim()?.toUpperCase() ?? null,
    issues: issuesMatch?.[1]?.trim() ?? null,
    summary,
  };
}
