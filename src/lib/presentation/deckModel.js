// The presentation as data. A deck is { version, meta, slides }; every slide is
// { id, type, hidden?, data } and everything the viewer sees (editor, thumbnails,
// PDF, PPTX) is drawn from it. Numbers in a deck are text copied from the report
// (computed in code, never typed through the rich-text editor).
import { text, listText } from './textModel';

export const DECK_VERSION = 1;

export const STYLES = [
  { id: 'brand-pulse', name: 'Brand Pulse', desc: 'Яскравий і динамічний стиль для звітів і результатів.' },
  { id: 'monarchi-impact', name: 'Monarchi Impact', desc: 'Сильний, контрастний стиль із вузьким шрифтом заголовків.' },
  { id: 'plum-editorial', name: 'Plum Editorial', desc: 'Журнальний мінімалізм із антиквою у заголовках.' },
];

export const PLATFORMS = [
  { id: 'meta', name: 'Meta Ads' },
  { id: 'google', name: 'Google Ads' },
];

export const platformName = (id) => PLATFORMS.find((p) => p.id === id)?.name || 'Ads';

let counter = 0;
export function uid() {
  counter += 1;
  return 's' + Date.now().toString(36) + counter.toString(36) + Math.random().toString(36).slice(2, 5);
}

// ----- Slide types ---------------------------------------------------------------
// category: basic | metrics | text (the filters of the "add slide" gallery).
export const SLIDE_TYPES = [
  { id: 'title', cat: 'basic', name: 'Титульний', desc: 'Обкладинка: назва звіту, клієнт і період.' },
  { id: 'agenda', cat: 'basic', name: 'План / зміст', desc: 'Нумерований перелік розділів звіту.' },
  { id: 'section', cat: 'basic', name: 'Акцентний', desc: 'Великий заголовок розділу з коротким текстом.' },
  { id: 'closing', cat: 'basic', name: 'Фінальний', desc: 'Подяка й контакти наприкінці презентації.' },
  { id: 'metricslist', cat: 'metrics', name: 'Загальні метрики', desc: 'Сітка показників із значеннями.' },
  { id: 'kpigrid', cat: 'metrics', name: 'KPI-картки', desc: 'Кілька ключових показників крупно.' },
  { id: 'campaignTable', cat: 'metrics', name: 'Метрики по кампаніях', desc: 'Таблиця: показники у рядках, кампанії у стовпцях.' },
  { id: 'dynamicsTable', cat: 'metrics', name: 'Динаміка за 2 періоди', desc: 'Показник, попередній період, зміна, поточний період.' },
  { id: 'table', cat: 'metrics', name: 'Довільна таблиця', desc: 'Таблиця з власними стовпцями й рядками.' },
  { id: 'bullets', cat: 'text', name: 'Список пунктів', desc: 'Маркований список із заголовком.' },
  { id: 'paragraph', cat: 'text', name: 'Текстовий блок', desc: 'Заголовок і абзаци тексту.' },
];

export const CATEGORIES = [
  { id: 'all', name: 'Усі' },
  { id: 'basic', name: 'Основні' },
  { id: 'metrics', name: 'Метрики' },
  { id: 'text', name: 'Текст' },
];

export const typeInfo = (type) => SLIDE_TYPES.find((t) => t.id === type) || { id: type, name: type, cat: 'text' };

// ----- Interface strings of the slides (the deck language) ---------------------------
export const LABELS = {
  en: {
    reportTitle: 'Performance Report',
    agenda: 'Agenda', keyMetrics: 'Key metrics', kpi: 'Key results', byGroups: 'Metrics by campaign group', byCampaigns: 'Metrics by campaign',
    dynamics: 'Dynamics vs previous period', whatWasDone: 'What was done', conclusion: 'Conclusion', plans: 'Plans for the next period',
    metric: 'Metric', previous: 'Previous period', change: 'Change', current: 'Current period', other: 'Other',
    thanks: 'Thank you', thanksBody: 'Ready to answer your questions.', footer: "Mon'Archi", vsPrev: 'vs previous period',
    part: (n, total) => (total > 1 ? ` (${n}/${total})` : ''),
  },
  uk: {
    reportTitle: 'Звіт ефективності',
    agenda: 'План звіту', keyMetrics: 'Загальні метрики', kpi: 'Ключові результати', byGroups: 'Метрики по групах кампаній', byCampaigns: 'Метрики по кампаніях',
    dynamics: 'Динаміка до попереднього періоду', whatWasDone: 'Виконана робота', conclusion: 'Висновки', plans: 'Плани на наступний період',
    metric: 'Показник', previous: 'Попередній період', change: 'Зміна', current: 'Поточний період', other: 'Інше',
    thanks: 'Дякуємо за увагу', thanksBody: 'Готові відповісти на ваші запитання.', footer: "Mon'Archi", vsPrev: 'до попереднього періоду',
    part: (n, total) => (total > 1 ? ` (${n}/${total})` : ''),
  },
};

export const labels = (lang) => LABELS[lang] || LABELS.en;

const MONTHS = {
  en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
  uk: ['січня', 'лютого', 'березня', 'квітня', 'травня', 'червня', 'липня', 'серпня', 'вересня', 'жовтня', 'листопада', 'грудня'],
};
const MONTHS_NOM_UK = ['Січень', 'Лютий', 'Березень', 'Квітень', 'Травень', 'Червень', 'Липень', 'Серпень', 'Вересень', 'Жовтень', 'Листопад', 'Грудень'];

// "05 – 11 October 2026", "28 September – 04 October 2026", or "October 2026" for a month.
export function periodLabel(periodType, startIso, endIso, lang = 'en') {
  const [sy, sm, sd] = startIso.split('-').map(Number);
  const [ey, em, ed] = endIso.split('-').map(Number);
  const dd = (n) => String(n).padStart(2, '0');
  const names = MONTHS[lang] || MONTHS.en;
  if (periodType === 'monthly') return `${lang === 'uk' ? MONTHS_NOM_UK[sm - 1] : names[sm - 1]} ${sy}`;
  if (sy === ey && sm === em) return `${dd(sd)} – ${dd(ed)} ${names[sm - 1]} ${sy}`;
  if (sy === ey) return `${dd(sd)} ${names[sm - 1]} – ${dd(ed)} ${names[em - 1]} ${sy}`;
  return `${dd(sd)} ${names[sm - 1]} ${sy} – ${dd(ed)} ${names[em - 1]} ${ey}`;
}

// ----- Slide factories -------------------------------------------------------------
// Blank layouts (the "add ready slide" gallery): real structure, no invented figures.
const blankItem = () => ({ label: '', value: '', delta: '' });

export function blankSlide(type, lang = 'en') {
  const L = labels(lang);
  const id = uid();
  const base = { id, type };
  switch (type) {
    case 'title': return { ...base, data: { title1: text(''), title2: text(L.reportTitle) } };
    case 'agenda': return { ...base, data: { heading: text(L.agenda), items: listText(['', '', ''], 'number') } };
    case 'section': return { ...base, data: { heading: text(''), body: text('') } };
    case 'closing': return { ...base, data: { heading: text(L.thanks), body: text(L.thanksBody) } };
    case 'metricslist': return { ...base, data: { heading: text(L.keyMetrics), items: [blankItem(), blankItem(), blankItem(), blankItem()] } };
    case 'kpigrid': return { ...base, data: { heading: text(L.kpi), cards: [blankItem(), blankItem(), blankItem(), blankItem()] } };
    case 'campaignTable': return { ...base, data: { heading: text(L.byCampaigns), corner: L.metric, columns: ['', '', ''], rows: [{ label: '', cells: ['', '', ''] }, { label: '', cells: ['', '', ''] }, { label: '', cells: ['', '', ''] }] } };
    case 'dynamicsTable': return { ...base, data: { heading: text(L.dynamics), headers: [L.metric, L.previous, L.change, L.current], rows: [{ label: '', prev: '', change: '', cur: '' }, { label: '', prev: '', change: '', cur: '' }, { label: '', prev: '', change: '', cur: '' }] } };
    case 'table': return { ...base, data: { heading: text(''), header: ['', '', ''], rows: [['', '', ''], ['', '', ''], ['', '', '']] } };
    case 'bullets': return { ...base, data: { heading: text(''), list: listText(['', '', ''], 'bullet') } };
    case 'paragraph': return { ...base, data: { heading: text(''), body: text('') } };
    default: return { ...base, data: { heading: text('') } };
  }
}

// Sample content for the gallery previews only (never inserted into a deck).
export function sampleSlide(type, lang = 'en') {
  const s = blankSlide(type, lang);
  const d = s.data;
  switch (type) {
    case 'title': d.title1 = text('Meta Ads'); break;
    case 'agenda': d.items = listText(['Section name', 'Section name', 'Section name', 'Section name'], 'number'); break;
    case 'section': d.heading = text('Slide title'); d.body = text('A short line with the key message of this slide.'); break;
    case 'metricslist': d.items = [['Spend', '$2,400'], ['Clicks', '12,000'], ['CTR', '5.0%'], ['Revenue', '$9,000']].map(([label, value]) => ({ label, value, delta: '' })); break;
    case 'kpigrid': d.cards = [['CPA', '$12.50'], ['ROAS', '6.0x'], ['Conversions', '150'], ['CPC', '$0.25']].map(([label, value]) => ({ label, value, delta: '' })); break;
    case 'campaignTable': d.columns = ['Campaign 1', 'Campaign 2', 'Campaign 3']; d.rows = [['Spend'], ['Clicks'], ['CTR']].map(([label]) => ({ label, cells: ['—', '—', '—'] })); break;
    case 'dynamicsTable': d.rows = [['Spend', '$2,400', '+25%', '$3,000'], ['Clicks', '4,800', '+25%', '6,000'], ['CTR', '4.0%', '+0.1%', '4.1%']].map(([label, prev, change, cur]) => ({ label, prev, change, cur })); break;
    case 'table': d.heading = text('Table title'); d.header = ['Column', 'Column', 'Column']; d.rows = [['Row', '—', '—'], ['Row', '—', '—'], ['Row', '—', '—']]; break;
    case 'bullets': d.heading = text('List of points'); d.list = listText(['First point of the list', 'Second point of the list', 'Third point of the list'], 'bullet'); break;
    case 'paragraph': d.heading = text('Slide title'); d.body = text('A short description of the key result. Add the main message and underline the important thought.'); break;
    default: break;
  }
  return s;
}

export function emptyDeck(opts = {}) {
  const lang = opts.lang || 'en';
  return {
    version: DECK_VERSION,
    meta: {
      projectId: opts.projectId || null, reportId: opts.reportId || null, periodType: opts.periodType || 'weekly',
      periodStart: opts.periodStart || '', periodEnd: opts.periodEnd || '',
      platform: opts.platform || 'meta', style: opts.style || 'brand-pulse', lang, kind: opts.kind || 'ecom', currency: opts.currency || 'USD',
      client: text(opts.client || ''), period: text(opts.period || ''),
    },
    slides: [],
  };
}

// Deck that is safe to render whatever was saved earlier (older versions, missing fields).
export function ensureDeck(deck) {
  if (!deck || !Array.isArray(deck.slides)) return emptyDeck();
  const base = emptyDeck();
  return { ...deck, meta: { ...base.meta, ...(deck.meta || {}) } };
}

export const visibleSlides = (deck) => deck.slides.filter((s) => !s.hidden);
