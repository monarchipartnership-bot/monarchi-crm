// The language of a client's report: English (the default, as it has always been) or Ukrainian. A report carries its own (`template.lang`); a report without one
// follows the project's («Мова звітів» in the project card). Pure code (no React): the screens read it through ClientReport/langContext.jsx.
export const LANGS = ['en', 'uk'];
export const normLang = (l) => (l === 'uk' ? 'uk' : 'en');
// The language of the client is the only language field of a project (owner, 2026-11-12): the reports follow it. A report exists in English and Ukrainian only, so every other
// language reads English; the column report_lang stays (the shared report page reads it in the database) and is written together with the client language, never on its own.
export const languagePatch = (code) => (code ? { client_language: code, report_lang: normLang(code) } : { client_language: null });
export const LANG_NAME = { en: 'English', uk: 'Українська' };
export const localeOf = (lang) => (normLang(lang) === 'uk' ? 'uk-UA' : 'en-US');

const MONTHS = {
  en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
  uk: ['Січень', 'Лютий', 'Березень', 'Квітень', 'Травень', 'Червень', 'Липень', 'Серпень', 'Вересень', 'Жовтень', 'Листопад', 'Грудень'],
};
const MONTHS_OF_UK = ['січня', 'лютого', 'березня', 'квітня', 'травня', 'червня', 'липня', 'серпня', 'вересня', 'жовтня', 'листопада', 'грудня']; // «відносно жовтня»
const SHORT_UK = ['Січ', 'Лют', 'Бер', 'Кві', 'Тра', 'Чер', 'Лип', 'Сер', 'Вер', 'Жов', 'Лис', 'Гру'];

// key: «2026-10»
const at = (key) => Number(String(key).slice(5, 7)) - 1;
export const monthNameIn = (key, lang = 'en') => MONTHS[normLang(lang)][at(key)];
export const monthShortIn = (key, lang = 'en') => (normLang(lang) === 'uk' ? SHORT_UK[at(key)] : MONTHS.en[at(key)].slice(0, 3));
export const monthOfIn = (key, lang = 'en') => (normLang(lang) === 'uk' ? MONTHS_OF_UK[at(key)] : MONTHS.en[at(key)]); // the month as «vs …» names it

// days: «1 day» / «3 days»; «1 день» / «3 дні» / «5 днів»
export function daysText(n, lang = 'en') {
  if (normLang(lang) !== 'uk') return `${n} ${n === 1 ? 'day' : 'days'}`;
  const m10 = n % 10; const m100 = n % 100;
  return `${n} ${m10 === 1 && m100 !== 11 ? 'день' : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? 'дні' : 'днів'}`;
}

// English text → Ukrainian. The English text is the key, so the screens keep their wording in the code; a text that is not here is shown as it is.
// {name} marks a value put in by the screen.
const UK = {
  // page
  'Loading the report…': 'Завантажуємо звіт…',
  'The report could not be loaded. Please check your connection and reload the page.': 'Не вдалося завантажити звіт. Перевірте зʼєднання та оновіть сторінку.',
  'This link is no longer active.': 'Це посилання більше не діє.',
  "Please ask your Mon'Archi manager for the current link to the report.": "Будь ласка, попросіть менеджера Mon'Archi надіслати актуальне посилання на звіт.",
  "This report is not available any more. Please ask your Mon'Archi manager for a new link.": "Цей звіт більше недоступний. Попросіть менеджера Mon'Archi надіслати нове посилання.",
  'Meta Ads report': 'Звіт Meta Ads',
  'Google Ads report': 'Звіт Google Ads',
  'Advertising report': 'Рекламний звіт',
  '{name} · Advertising report': '{name} · Рекламний звіт',
  "Mon'Archi report": "Звіт Mon'Archi",
  'Months': 'Місяці',
  'All months': 'Усі місяці',
  'Open the week': 'Відкрити тиждень',
  'Page {n} of {N}': 'Сторінка {n} з {N}',
  'Creatives and notes': 'Креативи й нотатки',
  'Every metric, group by group': 'Усі метрики за групами',
  'Now': 'Зараз',
  'All platforms': 'Усі платформи',
  'Report': 'Звіт',
  'Weekly report': 'Тижневий звіт',
  'Monthly report': 'Місячний звіт',
  'Hide the week': 'Згорнути тиждень',
  'Previous month': 'Попередній місяць',
  'Next month': 'Наступний місяць',
  'Complete': 'Завершено',
  'The first report will appear here as soon as it is approved. This page updates itself — you can keep the link.': 'Перший звіт зʼявиться тут, щойно його буде затверджено. Сторінка оновлюється сама, тож посилання можна зберегти.',
  // a month, a week
  'Week {n}': 'Тиждень {n}',
  'Approved': 'Затверджено',
  'Data as of': 'Дані станом на',
  'Weeks approved': 'Затверджено тижнів',
  '{a} of {b}': '{a} з {b}',
  'Month report': 'Звіт за місяць',
  'not ready': 'не готовий',
  'to date': 'на сьогодні',
  'final': 'фінальний',
  'Weeks of {month}': 'Тижні: {month}',
  'Spend and leads': 'Витрати та ліди',
  'Spend, revenue and ROAS': 'Витрати, дохід і ROAS',
  'Leads': 'Ліди',
  'Revenue': 'Дохід',
  'Spend': 'Витрати',
  'W{n}': 'Т{n}',
  'W{n} ROAS': 'ROAS Т{n}',
  'Spend by campaign group': 'Витрати за групами кампаній',
  'ROAS by campaign group': 'ROAS за групами кампаній',
  'ad spend': 'рекламні витрати',
  '{month} so far': '{month}: на сьогодні',
  '{month} summary': '{month}: підсумок',
  'To date': 'На сьогодні',
  'Final': 'Фінальний',
  'Reach of the month ({a}) is counted for the whole month, not summed from the weeks ({b}): the same person is seen in several weeks.': 'Охоплення місяця ({a}) рахується за весь місяць, а не сумою тижнів ({b}): одну й ту саму людину могли побачити в кількох тижнях.',
  'The summary of {month} appears here once the first week is approved and the month totals are calculated.': 'Підсумок місяця ({month}) зʼявиться тут, щойно буде затверджено перший тиждень і пораховано підсумки.',
  'vs': 'відносно',
  'previous week': 'попереднього тижня',
  'previous period': 'попереднього періоду',
  // tables and hints
  'General advertising metrics': 'Загальні рекламні показники',
  '{name} · group total': '{name} · разом по групі',
  'Other ({n} groups)': 'Інші ({n} груп)',
  'Other campaigns': 'Інші кампанії',
  'new': 'нова',
  'Show top groups only': 'Показати лише головні групи',
  'Show all {n} groups': 'Показати всі групи ({n})',
  'Arrows compare with {name}': 'Стрілки показують зміну відносно {name}',
  'Arrows compare with the previous week ({range})': 'Стрілки показують зміну відносно попереднього тижня ({range})',
  'Arrows compare with the previous period ({range})': 'Стрілки показують зміну відносно попереднього періоду ({range})',
  ': green is better, red is worse, grey is neutral (costs: lower is better). ': ': зелений — краще, червоний — гірше, сірий — нейтрально (для витрат: менше — краще). ',
  'Green cell is the best campaign group (ROAS, CPP, CTR), red is the weakest ROAS.': 'Зелена клітинка — найкраща група кампаній (ROAS, CPP, CTR), червона — найслабший ROAS.',
  ' Small groups are folded into «Other».': ' Дрібні групи обʼєднано в «Інші».',
  // creatives
  'Most effective creatives': 'Найефективніші креативи',
  'Enlarge: {name}': 'Збільшити: {name}',
  'No preview': 'Немає превʼю',
  'Close': 'Закрити',
  // KPI and metric names of the client's own sheet
  'Spent': 'Витрачено',
  'Purchases': 'Покупки',
  'Cost per purchase': 'Ціна покупки',
  'Reach': 'Охоплення',
  'Cost per lead': 'Ціна ліда',
  'Clicks': 'Кліки',
  // all months
  'The month-by-month comparison appears here as soon as two months have a report.': 'Порівняння по місяцях зʼявиться, щойно буде звіт за два місяці.',
  'Whole period': 'Весь період',
  'New months are added automatically once a month report is approved': 'Нові місяці додаються автоматично після затвердження місячного звіту',
  '* {month} is month to date': '* {month}: місяць ще не завершено',
  'Spend and leads by month': 'Витрати та ліди за місяцями',
  'Spend, revenue and ROAS by month': 'Витрати, дохід і ROAS за місяцями',
  'Spend in money, leads under the chart': 'Витрати в грошах, ліди під графіком',
  'Spend and revenue in money, ROAS under the chart': 'Витрати й дохід у грошах, ROAS під графіком',
  '{m} (to date)': '{m} (на сьогодні)',
  'Revenue by month': 'Дохід за місяцями',
  'revenue': 'дохід',
  'Month by month': 'Місяць за місяцем',
  'ROAS (Meta)': 'ROAS (Meta)',
  'Number of sales': 'Кількість продажів',
  'Average order value': 'Середній чек',
  // the funnel
  'Funnel': 'Воронка',
  'Where the customers drop off': 'Де клієнти відвалюються',
  'biggest drop': 'найбільше падіння',
  'go on to {label}': 'доходять до: {label}',
  'more than at the step before': 'більше, ніж на попередньому кроці',
  'more than before': 'більше, ніж було',
  '{p} go on': '{p} доходять',
  'Overall: {p} go all the way': 'Загалом: {p} доходять до кінця',
  'Example: the real numbers appear with the data': 'Приклад: реальні числа зʼявляться разом із даними',
  'Funnel of the stages with the share that goes on at every step': 'Воронка етапів із часткою, що йде далі на кожному кроці',
  // the workbook
  'Metric': 'Показник',
  'compared with {name}': 'відносно {name}',
  'Custom period': 'Довільний період',
  'purchases': 'покупок',
  'spent': 'витрачено',
  // one report
  'Period': 'Період',
  'Report for the period': 'Звіт за період',
  // the structure of the page (the header chips, the ribbon of sections, the headings of the sections)
  'Month': 'Місяць',
  'Sections': 'Розділи',
  'Overview': 'Огляд',
  'Spend & ROAS': 'Витрати та ROAS',
  'Weeks': 'Тижні',
  'Details': 'Деталі',
  'Notes': 'Нотатки',
  'Creatives': 'Креативи',
  'The result of the period at a glance': 'Результат періоду одним поглядом',
  'Where the budget went and what it returned': 'Куди пішов бюджет і що він повернув',
  'Every metric by campaign group': 'Усі показники за групами кампаній',
  'Notes from your manager': 'Нотатки менеджера',
  'What we did, what we concluded and what is next': 'Що зроблено, які висновки і що далі',
  'Ranked by ROAS': 'За ROAS',
  'Results': 'Результат',
  'Delivery': 'Показ і трафік',
  'Funnel steps': 'Етапи воронки',
  'Custom metrics': 'Власні метрики',
  'Each approved week with its own numbers': 'Кожен затверджений тиждень зі своїми цифрами',
  'Sales': 'Продажі',
};

// → a function: t('Week {n}', { n: 2 })
export function trFor(lang) {
  const uk = normLang(lang) === 'uk';
  return (text, vars) => {
    const base = uk && UK[text] != null ? UK[text] : text;
    return vars ? base.replace(/\{(\w+)\}/g, (m, k) => (vars[k] != null ? String(vars[k]) : m)) : base;
  };
}
