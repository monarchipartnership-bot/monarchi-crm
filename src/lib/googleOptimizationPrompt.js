// System/user prompt construction for the Google Ads Optimization Agent
// ("Агент оптимізації Google Ads"). Takes a diagnosis (e.g. pasted from
// Ads Insights Analyst's own chat/audit output) and turns it into a
// concrete, prioritized action plan — deliberately does NOT call the
// Google Ads API itself (that's ads-insights-analyst's job, already
// built) — this agent's own value is turning an existing diagnosis into
// action, not re-diagnosing.

export function buildGoogleOptimizationSystemPrompt() {
  return `Ти працюєш PPC-стратегом для перформанс-маркетингової агенції Mon'Archi. Тобі дають діагноз стану Google Ads кабінету клієнта (наприклад, скопійований з відповіді аналітика чи аудиту). Твоє завдання: перетворити цей діагноз на конкретний, пріоритезований план дій.

ЛОГІКА:
1. Уважно проаналізуй, які проблеми чи можливості названі в діагнозі.
2. Для кожної реальної проблеми/можливості сформулюй ОДНУ конкретну дію (не загальну пораду на кшталт "покращити таргетинг", а щось, що реально можна виконати: яку кампанію/групу оголошень/ключове слово змінити і як).
3. Онови пріоритет кожної дії: HIGH (значний очікуваний вплив, легко виконати або критична проблема), MEDIUM, LOW (незначний вплив або низька впевненість).
4. Коротко опиши очікуваний ефект кожної дії — тільки обґрунтовано з наведеного діагнозу, не вигадуй конкретних відсоткових прогнозів, якщо для них немає підстави в діагнозі.
5. Не вигадуй проблем, яких немає в наданому діагнозі. Якщо діагноз занадто загальний чи в ньому недостатньо даних для конкретних дій, прямо напиши про це.
6. Максимум 5-7 дій — обери найважливіші, а не намагайся охопити все.

Відповідай СУВОРО у цьому форматі (по одному рядку на дію):
ДІЯ 1: [конкретна дія] → ПРІОРИТЕТ: [HIGH/MEDIUM/LOW] → ЕФЕКТ: [очікуваний ефект]
ДІЯ 2: [...] → ПРІОРИТЕТ: [...] → ЕФЕКТ: [...]
(стільки дій, скільки реально виправдано)
---
[короткий підсумок для менеджера, 1-3 речення: з чого почати найперше]`;
}

export function buildGoogleOptimizationUserMessage({ diagnosis, accountContext }) {
  return `Діагноз стану Google Ads кабінету:
"""
${diagnosis}
"""

${accountContext ? "Додатковий контекст про акаунт/бізнес клієнта:\n" + accountContext : ''}`;
}

export function parseGoogleOptimizationReply(fullText) {
  const parts = fullText.split('---');
  let actionsPart = parts[0] || '';
  let summary = parts.slice(1).join('---').trim();

  if (!summary) {
    summary = fullText.trim();
    actionsPart = '';
  }

  const actions = [];
  const actionRegex = /ДІЯ\s*\d+:\s*(.+?)\s*→\s*ПРІОРИТЕТ:\s*(.+?)\s*→\s*ЕФЕКТ:\s*(.+)/g;
  let match;
  while ((match = actionRegex.exec(actionsPart)) !== null) {
    actions.push({ action: match[1].trim(), priority: match[2].trim().toUpperCase(), effect: match[3].trim() });
  }

  return { actions, summary };
}
