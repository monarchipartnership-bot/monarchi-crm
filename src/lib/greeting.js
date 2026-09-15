// Time-of-day greeting text + sun/moon icon, and a "quote of the day" that
// stays the same all day (picked deterministically from the date) but
// changes daily — used by the Home page greeting banner.

const PERIODS = [
  { from: 0, to: 5, text: 'Доброї ночі' },
  { from: 5, to: 11, text: 'Доброго ранку' },
  { from: 11, to: 17, text: 'Доброго дня' },
  { from: 17, to: 22, text: 'Доброго вечора' },
  { from: 22, to: 24, text: 'Доброї ночі' },
];

// Finer-grained than the greeting text — the sun visibly moves across the
// sky over the course of the day instead of jumping between two states.
const SUN_STAGES = [
  { from: 0, to: 5, icon: '\u{1F319}' },  // night
  { from: 5, to: 7, icon: '\u{1F305}' },  // sunrise
  { from: 7, to: 10, icon: '\u{1F324}️' }, // early morning sun
  { from: 10, to: 15, icon: '☀️' }, // midday sun
  { from: 15, to: 18, icon: '⛅' },   // afternoon sun
  { from: 18, to: 20, icon: '\u{1F307}' }, // sunset
  { from: 20, to: 22, icon: '\u{1F306}' }, // dusk
  { from: 22, to: 24, icon: '\u{1F319}' }, // night
];

function stageFor(list, hour) {
  return list.find((s) => hour >= s.from && hour < s.to) ?? list[0];
}

export function greetingText(date = new Date()) {
  return stageFor(PERIODS, date.getHours()).text;
}

export function sunIcon(date = new Date()) {
  return stageFor(SUN_STAGES, date.getHours()).icon;
}

const WISHES = [
  'Великі результати починаються з маленьких, але системних дій.',
  'Найкращий день для прогресу — сьогодні.',
  'Одна якісна дія варта десяти поспішних.',
  'Стабільність важливіша за швидкість — тримайте темп.',
  'Найкращі команди роблять складне простим.',
  'Уточнене питання клієнту — вже половина рішення.',
  'Маленький крок сьогодні — менше проблем завтра.',
  'Порядок у задачах — порядок у результатах.',
  'Кожен зачинений тикет наближає до великої мети.',
  'Довіра клієнта будується щоденною увагою до деталей.',
  'Гарний день — це кілька вчасно зроблених дрібниць.',
  'Фокус на головному — решта додасться сама.',
  'Ваша уважність сьогодні — це спокій команди завтра.',
  'Найкращий спосіб рухати проєкт — почати з найважчого.',
  'Системність перемагає натхнення щоразу.',
];

// Day-of-year, stable within a single calendar day regardless of timezone
// shifts during the day.
function dayOfYear(date) {
  const start = new Date(date.getFullYear(), 0, 0);
  return Math.floor((date - start) / 86400000);
}

export function wishOfTheDay(date = new Date()) {
  return WISHES[dayOfYear(date) % WISHES.length];
}

const MONTHS = [
  'січня', 'лютого', 'березня', 'квітня', 'травня', 'червня',
  'липня', 'серпня', 'вересня', 'жовтня', 'листопада', 'грудня',
];
const WEEKDAYS = ['неділя', 'понеділок', 'вівторок', 'середа', 'четвер', "п'ятниця", 'субота'];

export function formatFullDate(date = new Date()) {
  return `Сьогодні, ${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
}

export function formatWeekdayTime(date = new Date()) {
  const weekday = WEEKDAYS[date.getDay()];
  const capitalized = weekday.charAt(0).toUpperCase() + weekday.slice(1);
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  return `${capitalized}, ${hh}:${mm}`;
}
