// The rules of a message to a prospect, checked by CODE after the model wrote it (docs/growth-workflow.md, 8.2 and 8.3 + the «donts» of the brand profile).
// The model writes; this file decides whether the text may go to the manager. PURE.
import { CASES, allClientNames } from './cases.js';

export const MAX_WORDS = 120, MIN_WORDS = 25;
export const FOLLOW_UP_DAYS = [3, 7]; // at most two follow-ups, then stop

// ukrainian for Ukraine, english for the rest (8.3); a lead that wrote in Ukrainian or English keeps its own language
export const languageFor = ({ country = '', leadLanguage = null } = {}) => {
  if (leadLanguage === 'uk' || leadLanguage === 'en') return leadLanguage;
  const c = String(country).trim().toLowerCase();
  return ['ua', 'ukraine', 'україна'].includes(c) ? 'uk' : 'en';
};

export const wordCount = (text) => (String(text || '').match(/[\p{L}\p{N}’'-]+/gu) || []).length;

const GUARANTEE_RE = /(guarantee[sd]?|гаранту\w*)|\bwe promise\b|обіцяємо результат/i;
const PRICE_WORDS_RE = /\b(discount|our (price|prices|pricing|fees?|rates?))\b|знижк\w*|наші (ціни|тарифи)|(безкоштовн\w*)\s+місяц/i;
const EMOJI_RE = /\p{Extended_Pictographic}/u;
const UNIT_AFTER_RE = /^\s*[-–]?\s*(min(ute)?s?|мін\w*|хв\w*|day|days|дн\w*|word|слів|week|тижн\w*)/i;

const numbersOf = (text) => (String(text || '').match(/\d[\d\s,.]*\d|\d/g) || []).map((s) => s.replace(/[\s,]/g, '').replace(/\.$/, ''));
// numbers of «0.67», «6.67 → 9.31» etc. are compared as written, without spaces and thousand separators
const allowedNumbers = (texts) => new Set(texts.flatMap(numbersOf));

// → { ok, issues: [{ code, text }], words }   args.allowedText: everything the writer may quote (the case figures, the observation of the analyst, the lead's own words)
export function checkDraft(body, { caseKey = null, allowedText = [], channel = 'email', kind = 'letter' } = {}) {
  const text = String(body || '').trim();
  const issues = [];
  const words = wordCount(text);
  const push = (code, msg) => issues.push({ code, text: msg });
  if (words > MAX_WORDS) push('too_long', `Текст довший за ${MAX_WORDS} слів (${words}).`);
  if (words < MIN_WORDS && kind !== 'followup') push('too_short', `Текст закороткий (${words} слів).`);
  if (GUARANTEE_RE.test(text)) push('guarantee', 'Є обіцянка або гарантія результату: ми їх не даємо.');
  if (PRICE_WORDS_RE.test(text)) push('price', 'Є згадка цін або знижок: у першому повідомленні їх не називаємо.');
  if (EMOJI_RE.test(text)) push('emoji', 'Є емодзі: у діловому повідомленні їх не використовуємо.');
  if ((text.match(/!/g) || []).length > 1) push('exclaim', 'Забагато знаків оклику.');
  if ((text.match(/\b[A-ZА-ЯІЇЄҐ]{4,}\b/g) || []).length >= 3) push('caps', 'Забагато слів великими літерами.');

  const chosen = caseKey ? CASES[caseKey] : null;
  const others = allClientNames().filter((n) => !chosen || n !== chosen.client);
  const named = others.filter((n) => new RegExp(`\\b${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(text));
  if (named.length) push('other_client', `Названо клієнта, якого немає в обраному кейсі: ${named.join(', ')}.`);
  if (!chosen) {
    const any = allClientNames().filter((n) => new RegExp(`\\b${n}\\b`, 'i').test(text));
    if (any.length) push('case_not_allowed', `Для цього ліда кейс не обрано, а в тексті названо ${any.join(', ')}.`);
  }

  const allowed = allowedNumbers([chosen?.uk, chosen?.en, ...allowedText].filter(Boolean));
  const bad = [];
  const re = /\d[\d\s,.]*\d|\d/g; let m;
  while ((m = re.exec(text))) {
    const raw = m[0].replace(/[\s,]/g, '').replace(/\.$/, '');
    const after = text.slice(m.index + m[0].length, m.index + m[0].length + 14);
    if (allowed.has(raw)) continue;
    if (Number(raw) <= 10 && /^\d+$/.test(raw)) continue; // «5 pitfalls», «one»
    if (UNIT_AFTER_RE.test(after)) continue; // «15-minute call», «3 days»
    bad.push(m[0].trim());
  }
  if (bad.length) push('numbers', `Числа, яких немає в наших фактах: ${[...new Set(bad)].join(', ')}.`);

  if (channel === 'email' && kind !== 'reply' && !/unsubscribe|reply ["“«]?no|відпис|не актуально/i.test(text)) { /* the footer is added by code, see withFooter */ }
  return { ok: issues.length === 0, issues, words };
}

// the opt-out line of an email is added by code, so the model cannot forget it and it does not count in the words of the message
export const FOOTERS = { uk: 'Якщо це не актуально, просто дайте знати, і я більше не писатиму.', en: 'If this is not relevant, just reply "no" and I will not write again.' };
export function withFooter(body, { channel = 'email', lang = 'en' } = {}) {
  if (channel !== 'email') return body;
  return `${String(body).trim()}\n\n${FOOTERS[lang === 'uk' ? 'uk' : 'en']}`;
}
// the text without the opt-out line: the rules of a message are checked on the part the Author wrote
export function stripFooter(text) {
  let t = String(text || '').trim();
  for (const f of Object.values(FOOTERS)) if (t.endsWith(f)) t = t.slice(0, -f.length).trim();
  return t;
}

// dates of the follow-ups counted from the day the message was sent
export function followUpDates(sentAt) {
  const d = new Date(sentAt);
  if (Number.isNaN(d.getTime())) return [];
  return FOLLOW_UP_DAYS.map((n) => new Date(d.getTime() + n * 86400000).toISOString().slice(0, 10));
}

// things that must ALWAYS be decided by a person, whatever level is set (8.3): prices, discounts, contract terms, complaints, money
const SENSITIVE_RE = /\b(price|pricing|discount|invoice|contract|refund|complain\w*|lawsuit|payment terms|retainer|fee)\b|ціна|ціни|знижк\w*|договір|рахунок|повернення коштів|скарг\w*|оплат\w*/i;
export const isSensitive = (text) => SENSITIVE_RE.test(String(text || ''));
