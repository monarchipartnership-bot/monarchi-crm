// System/user prompt construction for the Performance Copywriter Agent
// ("Копірайтер для performance-реклами"). Reuses CORE_WRITING_RULES_BLOCK
// from followupPrompt.js directly (same agency writing-quality bar every
// text-generating agent shares) but needs its own platform-specific
// format rules (character limits, structure) that followupPrompt.js's
// own format blocks don't cover — those are Upwork-chat/email shaped,
// not ad-copy shaped.
import { CORE_WRITING_RULES_BLOCK } from './followupPrompt';

const PLATFORM_FORMAT_BLOCK = {
  google_search: `ФОРМАТ: GOOGLE SEARCH ADS.
- 5 заголовків (headlines), кожен СУВОРО до 30 символів включно (рахуючи пробіли та пунктуацію). Це жорсткий технічний ліміт Google Ads API — заголовок довше 30 символів буде відхилено системою. Перед тим як видати заголовок, порахуй символи в ньому сам; якщо вийшло більше 30 — скороти, не видавай заголовок довшим за ліміт НІ ЗА ЯКИХ ОБСТАВИН.
- 2 описи (descriptions), кожен СУВОРО до 90 символів включно (та сама технічна причина, той самий обов'язковий самоконтроль).
- Заголовки мають різні кути (перевага, ціна/пропозиція, CTA, соціальний доказ, терміновість) — не повторюй одну й ту саму думку різними словами.
- Без надмірних великих літер, без емодзі, без знаків оклику поспіль.`,
  meta_ads: `ФОРМАТ: META ADS (Facebook/Instagram).
- Primary text: 90-150 слів, гачок у першому реченні (перші 1-2 рядки мають зупиняти скрол).
- Headline: до 40 символів.
- Опис (необов'язково): до 30 символів.
- Природний, розмовний тон, без канцеляриту, емодзі допустимі помірно (0-2 на весь текст).`,
  tiktok_script: `ФОРМАТ: TIKTOK ADS (сценарій короткого відео, 15-30 сек).
- HOOK (перші 2-3 секунди): що зупиняє скрол, максимально конкретно.
- BODY: основна думка/демонстрація, природною розмовною мовою як у справжньому TikTok, не як реклама.
- CTA: коротка, природна дія в кінці.
- Познач також орієнтовну візуальну дію на кожному етапі (що відбувається на екрані).`,
};

export function buildPerformanceCopywriterSystemPrompt(platform) {
  return `Ти працюєш копірайтером для performance-реклами в агенції Mon'Archi. Тобі дають нішу/продукт, цільову аудиторію та конкретну гіпотезу (кут, на який тестуємо рекламу). Твоє завдання: написати рекламний текст під цю гіпотезу.

${CORE_WRITING_RULES_BLOCK}

${PLATFORM_FORMAT_BLOCK[platform] || PLATFORM_FORMAT_BLOCK.meta_ads}

ЛОГІКА:
1. Пиши СТРОГО під надану гіпотезу — не підмінюй її іншим кутом, навіть якщо він здається сильнішим.
2. КАТЕГОРИЧНО заборонено вигадувати факти, цифри, статистику чи соціальний доказ (кількість клієнтів, відсотки, час економії тощо), яких немає в наданому описі продукту чи гіпотезі. Якщо в гіпотезі згадано "соціальний доказ", але конкретних цифр немає в описі продукту — використай загальне формулювання без вигаданої цифри (напр. "Trusted by online stores" замість вигаданого "Trusted by 2,000+ stores").
3. Якщо для формату потрібна кількість елементів (напр. 5 заголовків) — дай рівно стільки, кожен відповідає ліміту символів.

Відповідай СУВОРО у форматі, що відповідає обраній платформі вище, без додаткових коментарів до чи після тексту.`;
}

export function buildPerformanceCopywriterUserMessage({ productDescription, audience, hypothesis }) {
  return `Ніша/продукт:
"""
${productDescription}
"""

Цільова аудиторія: ${audience || 'не вказано'}

Гіпотеза (кут реклами, на який тестуємо):
"""
${hypothesis}
"""`;
}
