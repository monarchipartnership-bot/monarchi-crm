// "White" business niches for the deal's "Ніша бізнесу" field — legitimate
// categories accepted without restriction by mainstream ad platforms (Meta,
// Google, TikTok), as opposed to "grey"/"black" niches (gambling, adult,
// crypto schemes, unlicensed pharma, etc.) that face special ad policies.
export const BUSINESS_NICHES = [
  'E-commerce / Інтернет-магазини',
  "Здоров'я та велнес",
  'Краса та косметика',
  'Мода та одяг',
  'Фітнес та спорт',
  'Нерухомість',
  'Будівництво та ремонт',
  'Автомобілі та автопослуги',
  'Подорожі та туризм',
  'Освіта та онлайн-курси',
  'Фінанси та інвестиції',
  'Страхування',
  'Юридичні послуги',
  'Консалтинг та B2B послуги',
  'IT та технології',
  'SaaS та софт',
  'Розваги та ігри',
  'Їжа та напої (HoReCa)',
  'Домашні тварини',
  'Дитячі товари',
  'Меблі та інтер’єр',
  'Електроніка та гаджети',
  'Ювелірні вироби та аксесуари',
  'Логістика та транспорт',
  'Виробництво',
  'Сільське господарство',
  'Енергетика та еко-рішення',
  'Телекомунікації',
  'Медіа та видавництво',
  'Некомерційні організації',
  'Івенти та організація заходів',
  'HR та рекрутинг',
];

// Two-level model for the deal's / contact's business: a broad category first
// (an online shop vs. a lead-generation project), then the niche inside it.
// The same niche label may exist under both categories (health, beauty,
// fitness...); `niche` is stored as plain text next to `business_category`.
export const CATEGORY_ECOMMERCE = 'E-commerce';
export const CATEGORY_LEADGEN = 'Проєкти лідогенерації';
export const BUSINESS_CATEGORIES = [CATEGORY_ECOMMERCE, CATEGORY_LEADGEN];

export const NICHES_BY_CATEGORY = {
  [CATEGORY_ECOMMERCE]: [
    'Мода та одяг',
    'Краса та косметика',
    "Здоров'я та велнес",
    'Фітнес та спорт',
    'Електроніка та гаджети',
    'Меблі та інтер’єр',
    'Дитячі товари',
    'Домашні тварини',
    'Ювелірні вироби та аксесуари',
    'Їжа та напої',
    'Автотовари та аксесуари',
    'Товари для дому та саду',
    'Інше',
  ],
  [CATEGORY_LEADGEN]: [
    'Нерухомість',
    'Будівництво та ремонт',
    'Автомобілі та автопослуги',
    'Подорожі та туризм',
    'Освіта та онлайн-курси',
    'Фінанси та інвестиції',
    'Страхування',
    'Юридичні послуги',
    'Консалтинг та B2B послуги',
    'IT та технології',
    'SaaS та софт',
    "Здоров'я та велнес",
    'Краса та косметика',
    'Фітнес та спорт',
    'Їжа та напої (HoReCa)',
    'Розваги та ігри',
    'Логістика та транспорт',
    'Виробництво',
    'Сільське господарство',
    'Енергетика та еко-рішення',
    'Телекомунікації',
    'Медіа та видавництво',
    'Некомерційні організації',
    'Івенти та організація заходів',
    'HR та рекрутинг',
    'Інше',
  ],
};

export const CATEGORY_OPTIONS = BUSINESS_CATEGORIES.map((c) => ({ value: c, label: c }));

// Options for the niche picker. With a category chosen only its niches are
// offered; with none, every niche is (so nothing is hidden from a contact that
// has no category yet). A stored value that isn't in the list (legacy data,
// e.g. the old "E-commerce / Інтернет-магазини") is kept visible instead of
// silently blanking the field.
export function nicheOptionsFor(category, current) {
  const list = NICHES_BY_CATEGORY[category] || [...new Set([...BUSINESS_NICHES, ...BUSINESS_CATEGORIES.flatMap((c) => NICHES_BY_CATEGORY[c])])];
  const withCurrent = current && !list.includes(current) ? [current, ...list] : list;
  return withCurrent.map((n) => ({ value: n, label: n }));
}
