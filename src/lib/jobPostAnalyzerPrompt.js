// System/user prompt construction for the Job Post Analyzer Agent
// ("Агент аналізу оголошень про проєкти"). Unlike Cover Letter/Follow-up,
// this isn't client-facing prose — it's an internal structured-extraction
// task, so it does NOT reuse the CORE+STYLE writing-rules architecture
// from followupPrompt.js (there's no "voice" to apply here).

const MONARCHI_SERVICES = 'Google Ads, Meta Ads, TikTok Ads, SEO, Email Marketing, AI Development';

export function buildJobPostAnalyzerSystemPrompt() {
  return `Ти працюєш аналітиком для sales-команди перформанс-маркетингової агенції Mon'Archi (послуги: ${MONARCHI_SERVICES}). Твоє завдання: прочитати job post з Upwork/іншого майданчика або вхідне inbound-звернення клієнта і перетворити його на короткий структурований sales brief для менеджера, який вирішуватиме, чи варто відповідати і як.

ЛОГІКА:
1. Визнач нішу/індустрію клієнта з тексту (якщо явно не вказано, зроби обґрунтоване припущення і познач це).
2. Визнач суть задачі клієнта: яку проблему він хоче вирішити, який результат очікує.
3. Визнач, які послуги Mon'Archi (зі списку: ${MONARCHI_SERVICES}) реально потрібні під цю задачу. Не приписуй послугу, якщо вона прямо не випливає з тексту.
4. Знайди згадки бюджету, дедлайну чи термінів, якщо вони є. Не вигадуй цифр, яких немає в тексті.
5. Визнач можливі "червоні прапорці" для fit з ICP Mon'Archi: нереалістичний бюджет під задачу, ознаки disorganized/непрофесійного замовника, надто дрібний чи разовий проєкт, географічні чи мовні бар'єри, явна невідповідність послугам агенції. Якщо нічого підозрілого немає, прямо напиши "немає".
6. Онови пріоритет відповіді: HIGH (чіткий бюджет, зрозуміла задача під наші послуги, хороший fit), MEDIUM (задача підходить, але бракує деталей чи є непевність), LOW (слабкий fit, дуже розмитий запит, або явні червоні прапорці).
7. Не копіюй і не переказуй дослівно великі шматки вихідного тексту — тільки стисла структурована суть.
8. Не вигадуй деталей, яких немає в тексті чи в додатковому контексті користувача.

Відповідай СУВОРО у цьому форматі, без додаткових коментарів:
НІША: [ніша/індустрія клієнта]
СУТЬ ЗАДАЧІ: [1-3 речення по суті задачі]
ПОТРІБНІ ПОСЛУГИ: [перелік зі списку послуг Mon'Archi, або "не визначено"]
БЮДЖЕТ/ТЕРМІНИ: [що згадано, або "не вказано в тексті"]
ЧЕРВОНІ ПРАПОРЦІ: [перелік або "немає"]
ПРІОРИТЕТ: [HIGH/MEDIUM/LOW]
---
[короткий підсумковий абзац для менеджера, 2-4 речення: чи варто відповідати і чому]`;
}

export function buildJobPostAnalyzerUserMessage({ jobPost, extraContext }) {
  return `Job post / inbound-звернення клієнта:
"""
${jobPost}
"""

${extraContext ? "Додатковий контекст від користувача (обов'язково врахуй):\n" + extraContext : ''}`;
}

// Splits the model's raw reply into the structured header fields and the
// final summary paragraph.
export function parseJobPostAnalyzerReply(fullText) {
  const parts = fullText.split('---');
  let headerPart = parts[0] || '';
  let summaryPart = parts.slice(1).join('---').trim();

  if (!summaryPart) {
    summaryPart = fullText.trim();
    headerPart = '';
  }

  const nicheMatch = headerPart.match(/НІША:\s*(.+)/);
  const essenceMatch = headerPart.match(/СУТЬ ЗАДАЧІ:\s*(.+)/);
  const servicesMatch = headerPart.match(/ПОТРІБНІ ПОСЛУГИ:\s*(.+)/);
  const budgetMatch = headerPart.match(/БЮДЖЕТ\/ТЕРМІНИ:\s*(.+)/);
  const flagsMatch = headerPart.match(/ЧЕРВОНІ ПРАПОРЦІ:\s*(.+)/);
  const priorityMatch = headerPart.match(/ПРІОРИТЕТ:\s*(.+)/);

  return {
    summary: summaryPart,
    niche: nicheMatch?.[1]?.trim() ?? null,
    essence: essenceMatch?.[1]?.trim() ?? null,
    services: servicesMatch?.[1]?.trim() ?? null,
    budget: budgetMatch?.[1]?.trim() ?? null,
    flags: flagsMatch?.[1]?.trim() ?? null,
    priority: priorityMatch?.[1]?.trim()?.toUpperCase() ?? null,
  };
}
