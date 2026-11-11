// The language of a client (owner, 2026-11-12): chosen in the card of the project, it decides what language everything meant for the client is written in (texts on the
// creatives, ad texts, captions, client reports). What is meant for the team (summaries, questions, analysis) is always Ukrainian. Pure code: the card, the wizard, the server
// and the tests use it. `script` says whether the system can put such words over a picture itself (latin, cyrillic and greek letters: yes; other scripts need their own fonts and,
// for right-to-left languages, another layout, so their texts are handed over apart from the picture).
const L = (code, en, uk, native, script = 'latin', rtl = false) => ({ code, en, uk, native, script, rtl });

export const LANGUAGES = [
  L('uk', 'Ukrainian', 'Українська', 'Українська', 'cyrillic'), L('en', 'English', 'Англійська', 'English'), L('ru', 'Russian', 'Російська', 'Русский', 'cyrillic'),
  L('af', 'Afrikaans', 'Африкаанс', 'Afrikaans'), L('sq', 'Albanian', 'Албанська', 'Shqip'), L('ar', 'Arabic', 'Арабська', 'العربية', 'arabic', true),
  L('hy', 'Armenian', 'Вірменська', 'Հայերեն', 'armenian'), L('az', 'Azerbaijani', 'Азербайджанська', 'Azərbaycan'), L('be', 'Belarusian', 'Білоруська', 'Беларуская', 'cyrillic'),
  L('bn', 'Bengali', 'Бенгальська', 'বাংলা', 'bengali'), L('bs', 'Bosnian', 'Боснійська', 'Bosanski'), L('bg', 'Bulgarian', 'Болгарська', 'Български', 'cyrillic'),
  L('ca', 'Catalan', 'Каталанська', 'Català'), L('zh', 'Chinese', 'Китайська', '中文', 'han'), L('hr', 'Croatian', 'Хорватська', 'Hrvatski'),
  L('cs', 'Czech', 'Чеська', 'Čeština'), L('da', 'Danish', 'Данська', 'Dansk'), L('nl', 'Dutch', 'Нідерландська', 'Nederlands'),
  L('et', 'Estonian', 'Естонська', 'Eesti'), L('fil', 'Filipino', 'Філіппінська', 'Filipino'), L('fi', 'Finnish', 'Фінська', 'Suomi'),
  L('fr', 'French', 'Французька', 'Français'), L('ka', 'Georgian', 'Грузинська', 'ქართული', 'georgian'), L('de', 'German', 'Німецька', 'Deutsch'),
  L('el', 'Greek', 'Грецька', 'Ελληνικά', 'greek'), L('he', 'Hebrew', 'Іврит', 'עברית', 'hebrew', true), L('hi', 'Hindi', 'Гінді', 'हिन्दी', 'devanagari'),
  L('hu', 'Hungarian', 'Угорська', 'Magyar'), L('is', 'Icelandic', 'Ісландська', 'Íslenska'), L('id', 'Indonesian', 'Індонезійська', 'Bahasa Indonesia'),
  L('ga', 'Irish', 'Ірландська', 'Gaeilge'), L('it', 'Italian', 'Італійська', 'Italiano'), L('ja', 'Japanese', 'Японська', '日本語', 'han'),
  L('kk', 'Kazakh', 'Казахська', 'Қазақша', 'cyrillic'), L('ko', 'Korean', 'Корейська', '한국어', 'hangul'), L('lv', 'Latvian', 'Латвійська', 'Latviešu'),
  L('lt', 'Lithuanian', 'Литовська', 'Lietuvių'), L('mk', 'Macedonian', 'Македонська', 'Македонски', 'cyrillic'), L('ms', 'Malay', 'Малайська', 'Bahasa Melayu'),
  L('mt', 'Maltese', 'Мальтійська', 'Malti'), L('no', 'Norwegian', 'Норвезька', 'Norsk'), L('fa', 'Persian', 'Перська', 'فارسی', 'arabic', true),
  L('pl', 'Polish', 'Польська', 'Polski'), L('pt', 'Portuguese', 'Португальська', 'Português'), L('ro', 'Romanian', 'Румунська', 'Română'),
  L('sr', 'Serbian', 'Сербська', 'Српски', 'cyrillic'), L('sk', 'Slovak', 'Словацька', 'Slovenčina'), L('sl', 'Slovenian', 'Словенська', 'Slovenščina'),
  L('es', 'Spanish', 'Іспанська', 'Español'), L('sw', 'Swahili', 'Суахілі', 'Kiswahili'), L('sv', 'Swedish', 'Шведська', 'Svenska'),
  L('ta', 'Tamil', 'Тамільська', 'தமிழ்', 'tamil'), L('th', 'Thai', 'Тайська', 'ไทย', 'thai'), L('tr', 'Turkish', 'Турецька', 'Türkçe'),
  L('ur', 'Urdu', 'Урду', 'اردو', 'arabic', true), L('uz', 'Uzbek', 'Узбецька', 'Oʻzbek'), L('vi', 'Vietnamese', 'Вʼєтнамська', 'Tiếng Việt'),
];
const BY_CODE = new Map(LANGUAGES.map((l) => [l.code, l]));
const SAFE_SCRIPTS = new Set(['latin', 'cyrillic', 'greek']);

export const isValidLanguage = (code) => BY_CODE.has(String(code || ''));
export const languageOf = (code) => BY_CODE.get(String(code || '')) || null;
// the English name for the prompts of the agents («German»), or null for no / an unknown code
export const languageEnglish = (code) => languageOf(code)?.en || null;
// the name in the interface: «Німецька (Deutsch)», for Ukrainian just «Українська»
export const languageLabel = (code) => { const l = languageOf(code); return !l ? '' : l.native === l.uk || l.code === 'uk' ? l.uk : `${l.uk} (${l.native})`; };
// can the system put words of this language over a picture? (the other languages get their texts apart from the picture)
export const overlaySafe = (code) => SAFE_SCRIPTS.has(languageOf(code)?.script || 'latin');
// the options of a list: the three the team works in first, then the others in the order of the Ukrainian alphabet
export function languageOptions() {
  const first = ['uk', 'en', 'ru'];
  const rest = LANGUAGES.filter((l) => !first.includes(l.code)).sort((a, b) => a.uk.localeCompare(b.uk, 'uk'));
  return [...first.map((c) => BY_CODE.get(c)), ...rest].map((l) => ({ value: l.code, label: languageLabel(l.code) }));
}
