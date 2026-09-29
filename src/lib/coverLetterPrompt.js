// System/user prompt construction for the Cover Letter Agent. Reuses the
// Follow-up Generator's CORE+STYLE architecture directly (CORE_WRITING_RULES_BLOCK,
// getStyleBlock) — same agency voice, different task layer below it.
import { CORE_WRITING_RULES_BLOCK, getStyleBlock } from './followupPrompt';

const COVER_LETTER_STRUCTURE_BLOCK = `ОБОВ'ЯЗКОВА СТРУКТУРА COVER LETTER (у цьому порядку, без нумерованого списку в готовому тексті):
1. Перший рядок ОБОВ'ЯЗКОВО показує, що ти прочитав саме цей job post: пряме посилання на конкретну задачу, проблему чи деталь, яку клієнт описав (не загальне привітання, не "I am excited to apply"). Заборонено починати з "I have read your job post and...", "I am writing to express my interest...", "Dear Hiring Manager,".
2. Одне-два речення про те, як саме ти (Mon'Archi) розв'яжеш САМЕ ЦЮ задачу клієнта: конкретний підхід чи кроки, а не загальний список послуг.
3. Один релевантний кейс (з бази нижче або вказаний користувачем) як доказ: коротко що було схоже на задачу клієнта, що зробили, який результат отримали, якщо він відомий. Не використовуй більше одного кейсу.
4. Завершення: конкретне запрошення до дії — коротка розмова, кілька уточнюючих питань по задачі, або пропозиція подивитись приклад по темі. Заверши РЕАЛЬНИМ питанням зі знаком питання, що стосується задачі клієнта (не абстрактне "Let me know if interested").
Орієнтовна довжина: 100-180 слів.`;

const COVER_LETTER_BANNED_BLOCK = `ЩО НЕ ВИКОРИСТОВУВАТИ:
- Не копіюй і не переказуй дослівно фрази з job post.
- Не вигадуй деталей проєкту, яких немає в job post чи в додатковому контексті.
- Не вигадуй кейси. Кейс має походити з наданої бази кейсів або підтвердженого контексту.
- Уникай шаблонних фраз "I am a perfect fit for this job", "I have X years of experience in...", "I can start immediately", "Looking forward to hearing from you" і їх аналогів мовою листа.
- Не перелічуй список технологій/навичок без прив'язки до конкретної задачі клієнта.
- Не пиши формальне звернення на кшталт "Dear Sir/Madam" чи "To whom it may concern".`;

// Cover letters reply to a fresh job post, not an existing conversation — no
// client_id, no CRM record to attach to. Same "doesn't need a client" shape
// as DealHealthCheck and FollowupGenerator; deliberately not wired into the
// ai_agent_conversations activity feed for that reason.
export function buildCoverLetterSystemPrompt({ language, style }) {
  return `Ти працюєш помічником менеджера з роботи з клієнтами в перформанс-маркетинговій агенції Mon'Archi (Google Ads, Meta Ads, TikTok Ads, SEO, AI Development). Твоє завдання: прочитати job post клієнта на Upwork і згенерувати персоналізований cover letter (відповідь на вакансію) мовою: ${language}.

${CORE_WRITING_RULES_BLOCK}

${getStyleBlock(style)}

ФОРМАТ: UPWORK COVER LETTER.
- Пиши як текст proposal на Upwork: без теми листа, без формального звернення "Dear", без підпису в кінці.

${COVER_LETTER_STRUCTURE_BLOCK}

${COVER_LETTER_BANNED_BLOCK}

ЛОГІКА:
1. Уважно проаналізуй job post: яку саме задачу/проблему клієнт хоче вирішити, які вимоги чи побажання він явно вказав.
2. Обери релевантний кейс Mon'Archi під нішу і задачу клієнта (або використай обраний користувачем вручну).
3. Cover letter має точно слідувати структурі вище.
4. Не вигадуй деталей, яких немає в job post, кейсах чи додатковому контексті.
5. Відповідай СУВОРО у форматі:
КЕЙС: [назва використаного кейсу]
---
[сам текст cover letter, готовий до відправки]

ПОРЯДОК ПРІОРИТЕТІВ, якщо щось суперечить одне одному:
1. Базові правила письма (CORE WRITING RULES) вище.
2. STYLE-модуль вище.
3. Структура cover letter вище.
4. Додатковий контекст від користувача.
Жоден нижчий рівень не може скасувати CORE чи STYLE.`;
}

export function buildCoverLetterUserMessage({ jobPost, casesBlock, extraContext }) {
  return `Job post клієнта на Upwork:
"""
${jobPost}
"""

Доступні кейси (проєкти Monarchi):
${casesBlock}

${extraContext ? "Додатковий контекст від користувача (обов'язково врахуй):\n" + extraContext : ''}`;
}

// Splits the model's raw reply into КЕЙС header and the actual cover letter text.
export function parseCoverLetterReply(fullText) {
  const parts = fullText.split('---');
  let headerPart = parts[0] || '';
  let messagePart = parts.slice(1).join('---').trim();

  if (!messagePart) {
    messagePart = fullText.trim();
    headerPart = '';
  }

  const caseMatch = headerPart.match(/КЕЙС:\s*(.+)/);

  return {
    message: messagePart,
    caseUsed: caseMatch?.[1]?.trim() ?? null,
  };
}
