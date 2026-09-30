// System/user prompt construction for the Account Enrichment Agent
// ("Агент доповнення даних про клієнта"). Internal-facing extraction,
// same shape as jobPostAnalyzerPrompt.js — does not reuse the CORE+STYLE
// writing-rules architecture, there's no client-facing prose here.

export function buildAccountEnrichmentSystemPrompt() {
  return `Ти працюєш аналітиком для sales-команди перформанс-маркетингової агенції Mon'Archi. Тобі дають текст, отриманий з головної сторінки сайту клієнта (автоматично вичищений з HTML). Твоє завдання: визначити нішу компанії, орієнтовний розмір бізнесу та коротко його позиціонування, а потім скласти готовий абзац контексту, який менеджер зможе вставити в поле "Додатковий контекст" перед генерацією follow-up чи cover letter.

ЛОГІКА:
1. Визнач нішу/індустрію компанії з тексту сайту.
2. Оціни орієнтовний розмір бізнесу (стартап/малий бізнес/середній бізнес/велика компанія) — на основі мови сайту, згаданих команд, офісів, клієнтів, масштабу. Якщо оцінити неможливо, прямо напиши "неможливо оцінити з наявного тексту".
3. Коротко визнач позиціонування: чим компанія відрізняється, що продає, для кого.
4. Не вигадуй фактів, яких немає в тексті сайту. Якщо текст сайту порожній, нерелевантний або не завантажився — прямо напиши про це, не вигадуй компанію.

Відповідай СУВОРО у цьому форматі, без додаткових коментарів:
НІША: [ніша/індустрія]
РОЗМІР БІЗНЕСУ: [оцінка або "неможливо оцінити"]
ПОЗИЦІОНУВАННЯ: [1-2 речення]
---
[готовий абзац контексту для поля "Додатковий контекст", 2-4 речення, природною українською, без заголовків і без посилання на те, що це "текст із сайту"]`;
}

export function buildAccountEnrichmentUserMessage({ url, websiteText }) {
  if (!websiteText || !websiteText.trim()) {
    return `Сайт клієнта: ${url}\n\nТекст сайту порожній або не вдалося завантажити. Повідом про це у відповіді, не вигадуй компанію.`;
  }
  return `Сайт клієнта: ${url}\n\nТекст головної сторінки (вичищено з HTML):\n"""\n${websiteText}\n"""`;
}

// Splits the model's raw reply into the structured header fields and the
// ready-to-paste context paragraph.
export function parseAccountEnrichmentReply(fullText) {
  const parts = fullText.split('---');
  let headerPart = parts[0] || '';
  let contextPart = parts.slice(1).join('---').trim();

  if (!contextPart) {
    contextPart = fullText.trim();
    headerPart = '';
  }

  const nicheMatch = headerPart.match(/НІША:\s*(.+)/);
  const sizeMatch = headerPart.match(/РОЗМІР БІЗНЕСУ:\s*(.+)/);
  const positioningMatch = headerPart.match(/ПОЗИЦІОНУВАННЯ:\s*(.+)/);

  return {
    context: contextPart,
    niche: nicheMatch?.[1]?.trim() ?? null,
    companySize: sizeMatch?.[1]?.trim() ?? null,
    positioning: positioningMatch?.[1]?.trim() ?? null,
  };
}
