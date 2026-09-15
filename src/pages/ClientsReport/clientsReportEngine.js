// Clients Report canvas/slide engine — ported from clients_report.html's inline
// <script> (report-type CSV/SEO parsing, slide templates, drag-and-drop slide
// list, contenteditable slide editing, PDF export). Parsing and slide-building
// logic is untouched; PapaParse/html2canvas/jsPDF are now real npm imports
// instead of bundled minified globals, and the outer wrapper is an exported
// init function so React can call it after the DOM (matching element ids) is
// mounted, and clean up its window/document listeners on unmount.
import Papa from 'papaparse';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';

// `api`, if passed, is populated with methods React can call after mount —
// see loadFromProjectReport below. The function's own return value stays a
// bare cleanup function (React effect cleanup contract), so any outward API
// has to be handed out this way rather than via the return value.
export function initClientsReport(api){

/* ---------------------------------------------------------- BRAND ASSETS */
var LOGO_BADGE_PURPLE = '<svg viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg"><path d="M20.0225 39.9375C31.028 39.9375 39.9497 31.0112 39.9497 20C39.9497 8.98882 31.028 0.0625 20.0225 0.0625C9.01696 0.0625 0.0952148 8.98882 0.0952148 20C0.0952148 31.0112 9.01696 39.9375 20.0225 39.9375Z" fill="#421342"/><path d="M18.998 17.1502C18.998 17.1502 14.5034 15.5033 12.5638 15.0033C12.5638 15.0033 12.5622 15.0033 12.5607 15.0033C12.4701 14.9861 12.3764 14.9783 12.2811 14.9783C12.1796 14.9783 12.0797 14.9877 11.9829 15.0064C11.7439 15.0533 11.5237 15.1533 11.3348 15.2971C11.1942 15.4049 11.0724 15.5361 10.9724 15.683C10.9724 15.683 10.8194 15.9752 10.8194 15.9768C8.89538 19.6955 6.35293 28.1377 6.30608 28.2486C6.25142 28.3736 6.12649 28.4596 5.98281 28.4596C5.78604 28.4596 5.62675 28.3002 5.62831 28.1033C5.62831 28.0971 6.5747 16.5861 7.86778 11.7518C8.18637 10.5924 9.24832 9.73926 10.5086 9.73926C11.0412 9.73926 11.5378 9.89082 11.9579 10.1549C12.011 10.1877 12.025 10.1939 12.1156 10.2549C14.7268 12.1424 19.0027 17.1486 19.0027 17.1486L18.998 17.1502Z" fill="white"/><path d="M34.4229 27.1923C34.3933 27.9095 33.8014 28.4813 33.0768 28.4813C32.8847 28.4813 32.702 28.4407 32.5364 28.3688C31.4666 27.8313 22.6477 19.711 22.6477 19.711C22.6477 19.711 29.3427 23.6626 30.5125 24.2173C30.678 24.2954 30.8529 24.3595 30.9357 24.372C31.2105 24.4142 31.4573 24.1704 31.426 23.8845C31.3011 22.7454 29.7941 17.1735 29.2678 15.9423C29.0741 15.3813 28.5416 14.9798 27.9169 14.9798C27.7108 14.9798 27.514 15.0235 27.336 15.1032C25.9023 15.7017 14.9611 22.386 14.9611 22.1688C14.9611 22.0657 24.8435 12.3782 28.109 10.2438C28.5588 9.97197 29.1007 9.71729 29.6972 9.71729C30.8794 9.71729 31.8805 10.4892 32.2225 11.5563C32.2225 11.5563 32.2225 11.5569 32.2225 11.5579C32.4646 12.2532 34.1699 22.1001 34.412 26.9392C34.4151 27.0235 34.4198 27.1079 34.4229 27.1923Z" fill="white"/><path d="M24.0002 18.5249L27.2469 16.5733C27.5452 16.3937 27.9341 16.539 28.0434 16.8702L29.5676 21.5405C29.6035 21.6499 29.4864 21.7468 29.3865 21.6905L24.0033 18.678C23.9439 18.6452 23.9439 18.5608 24.0002 18.5265V18.5249Z" fill="white"/></svg>';

var LOGO_BADGE_WHITE = '<svg viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg"><path d="M20.0225 39.9375C31.028 39.9375 39.9497 31.0112 39.9497 20C39.9497 8.98882 31.028 0.0625 20.0225 0.0625C9.01696 0.0625 0.0952148 8.98882 0.0952148 20C0.0952148 31.0112 9.01696 39.9375 20.0225 39.9375Z" fill="#ffffff"/><path d="M18.998 17.1502C18.998 17.1502 14.5034 15.5033 12.5638 15.0033C12.5638 15.0033 12.5622 15.0033 12.5607 15.0033C12.4701 14.9861 12.3764 14.9783 12.2811 14.9783C12.1796 14.9783 12.0797 14.9877 11.9829 15.0064C11.7439 15.0533 11.5237 15.1533 11.3348 15.2971C11.1942 15.4049 11.0724 15.5361 10.9724 15.683C10.9724 15.683 10.8194 15.9752 10.8194 15.9768C8.89538 19.6955 6.35293 28.1377 6.30608 28.2486C6.25142 28.3736 6.12649 28.4596 5.98281 28.4596C5.78604 28.4596 5.62675 28.3002 5.62831 28.1033C5.62831 28.0971 6.5747 16.5861 7.86778 11.7518C8.18637 10.5924 9.24832 9.73926 10.5086 9.73926C11.0412 9.73926 11.5378 9.89082 11.9579 10.1549C12.011 10.1877 12.025 10.1939 12.1156 10.2549C14.7268 12.1424 19.0027 17.1486 19.0027 17.1486L18.998 17.1502Z" fill="#421342"/><path d="M34.4229 27.1923C34.3933 27.9095 33.8014 28.4813 33.0768 28.4813C32.8847 28.4813 32.702 28.4407 32.5364 28.3688C31.4666 27.8313 22.6477 19.711 22.6477 19.711C22.6477 19.711 29.3427 23.6626 30.5125 24.2173C30.678 24.2954 30.8529 24.3595 30.9357 24.372C31.2105 24.4142 31.4573 24.1704 31.426 23.8845C31.3011 22.7454 29.7941 17.1735 29.2678 15.9423C29.0741 15.3813 28.5416 14.9798 27.9169 14.9798C27.7108 14.9798 27.514 15.0235 27.336 15.1032C25.9023 15.7017 14.9611 22.386 14.9611 22.1688C14.9611 22.0657 24.8435 12.3782 28.109 10.2438C28.5588 9.97197 29.1007 9.71729 29.6972 9.71729C30.8794 9.71729 31.8805 10.4892 32.2225 11.5563C32.2225 11.5563 32.2225 11.5569 32.2225 11.5579C32.4646 12.2532 34.1699 22.1001 34.412 26.9392C34.4151 27.0235 34.4198 27.1079 34.4229 27.1923Z" fill="#421342"/><path d="M24.0002 18.5249L27.2469 16.5733C27.5452 16.3937 27.9341 16.539 28.0434 16.8702L29.5676 21.5405C29.6035 21.6499 29.4864 21.7468 29.3865 21.6905L24.0033 18.678C23.9439 18.6452 23.9439 18.5608 24.0002 18.5265V18.5249Z" fill="#421342"/></svg>';

var ICONS = {
  dollar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="1" x2="12" y2="23"></line><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path></svg>',
  eye: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>',
  cursor: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z"></path></svg>',
  percent: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="5" x2="5" y2="19"></line><circle cx="6.5" cy="6.5" r="2.5"></circle><circle cx="17.5" cy="17.5" r="2.5"></circle></svg>',
  trend: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"></polyline><polyline points="17 6 23 6 23 12"></polyline></svg>',
  users: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>',
  target: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><circle cx="12" cy="12" r="6"></circle><circle cx="12" cy="12" r="2"></circle></svg>',
  bag: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2l1.5 4h9L18 2"></path><path d="M3.5 8h17l-1.4 12.6a2 2 0 0 1-2 1.8H6.9a2 2 0 0 1-2-1.8L3.5 8z"></path></svg>',
  chart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"></line><line x1="12" y1="20" x2="12" y2="4"></line><line x1="6" y1="20" x2="6" y2="14"></line></svg>'
};
function pickIcon(label){
  var l = (label||'').toLowerCase();
  if(/spend|cost|cpc|cpa|cpm|value|revenue|бюджет|расход/.test(l)) return 'dollar';
  if(/impress|показ/.test(l)) return 'eye';
  if(/click|клик/.test(l)) return 'cursor';
  if(/ctr|%|rate|частот/.test(l)) return 'percent';
  if(/roas|romi|roi/.test(l)) return 'trend';
  if(/lead|sale|purchase|deal|qualif|лид|продаж/.test(l)) return 'users';
  if(/reach|frequency|охват/.test(l)) return 'target';
  if(/aov/.test(l)) return 'bag';
  return 'chart';
}

/* Mon'Archi's core mark is purple (#421342 dark / #B544B5 bright) — "purple" is the exact
   brand color, and orchid/plum/violet/midnight are all variations within that same purple
   family (brighter, deeper/more muted, cooler/blue-leaning, near-black) so every theme still
   reads as on-brand. blue/green/sunset/slate are kept for clients whose own brand needs a
   different accent, but the purple family is the recommended default set. */
var THEMES = [
  {name:'purple',   start:'#B544B5', end:'#661466', dark:'#3d0f40', accent:'#883288', tint:'#f8eef8'},
  {name:'orchid',   start:'#E355E3', end:'#8B1A8B', dark:'#4a0f4a', accent:'#C13FC1', tint:'#fbeafb'},
  {name:'plum',     start:'#9C5B9A', end:'#3d1f3d', dark:'#241224', accent:'#6b3a69', tint:'#f5eef5'},
  {name:'violet',   start:'#7B4FE0', end:'#3d2166', dark:'#221040', accent:'#5c3aa8', tint:'#efeafb'},
  {name:'midnight', start:'#7a2a7a', end:'#150515', dark:'#0d030d', accent:'#5c1a5c', tint:'#efe5ef'},
  {name:'blue',   start:'#4A7FE0', end:'#1B2E6B', dark:'#101c40', accent:'#3557A6', tint:'#eaf0fb'},
  {name:'green',  start:'#3FBF8F', end:'#0F5C46', dark:'#0b3b2e', accent:'#1F8F6B', tint:'#e8f7f1'},
  {name:'sunset', start:'#FF8A5B', end:'#C1272D', dark:'#5c1414', accent:'#E0563A', tint:'#fff0ea'},
  {name:'slate',  start:'#6B7280', end:'#1F2430', dark:'#14171f', accent:'#4B5563', tint:'#f0f1f3'}
];
/* Scoped to .clients-report-page (not document.documentElement/:root) so the
   theme variables never leak into the rest of the CRM's UI — the app already
   has its own global --muted design token, among others. */
function applyTheme(name){
  var t = THEMES.filter(function(x){return x.name===name;})[0] || THEMES[0];
  var rootEl = document.querySelector('.clients-report-page');
  if(!rootEl) return;
  var root = rootEl.style;
  root.setProperty('--grad-start', t.start);
  root.setProperty('--grad-end', t.end);
  root.setProperty('--dark', t.dark);
  root.setProperty('--accent', t.accent);
  root.setProperty('--tint', t.tint);
  Array.prototype.forEach.call(document.querySelectorAll('.theme-dot'), function(d){
    d.classList.toggle('active', d.dataset.theme===name);
  });
}
function buildThemeRow(){
  var row = document.getElementById('themeRow');
  row.innerHTML = '';
  THEMES.forEach(function(t){
    var d = document.createElement('div');
    d.className = 'theme-dot';
    d.dataset.theme = t.name;
    d.style.background = 'linear-gradient(135deg,' + t.start + ',' + t.end + ')';
    d.title = t.name;
    d.addEventListener('click', function(){ applyTheme(t.name); });
    row.appendChild(d);
  });
}

/* ---------------------------------------------------------- TEMPLATES */
/* Templates change fonts, decoration and slide-component treatment (light vs dark
   backgrounds, shapes, spacing) — pure CSS, scoped under a ".tpl-X" class applied to
   #stage (see the "TEMPLATES" CSS section). They never change the underlying slide HTML,
   so switching templates re-skins the current deck instantly without rebuilding it, and
   any of the 9 color themes above can be combined with any of the 5 templates. */
var TEMPLATES = [
  { key:'classic', name:'Класичний', desc:'Насичені градієнти, м’які форми', swatch:'classic' },
  { key:'elegant', name:'Елегантний', desc:'Серифи, світлий фон, тонкі лінії', swatch:'elegant' },
  { key:'modern', name:'Сучасний', desc:'Геометрія, діагоналі, контраст', swatch:'modern' },
  { key:'minimal', name:'Мінімалістичний', desc:'Багато повітря, тонкі акценти', swatch:'minimal' },
  { key:'playful', name:'Грайливий', desc:'Округлі форми, м’який пастельний фон', swatch:'playful' }
];
function applyTemplate(key){
  var found = TEMPLATES.filter(function(t){ return t.key===key; })[0];
  var k = found ? key : TEMPLATES[0].key;
  state.template = k;
  if(stage) stage.className = 'tpl-'+k;
  Array.prototype.forEach.call(document.querySelectorAll('.template-card'), function(c){
    c.classList.toggle('active', c.dataset.template===k);
  });
}
function buildTemplateGrid(){
  var grid = document.getElementById('templateGrid');
  grid.innerHTML = '';
  TEMPLATES.forEach(function(t){
    var card = document.createElement('div');
    card.className = 'template-card';
    card.dataset.template = t.key;
    card.innerHTML = '<span class="template-swatch swatch-'+t.swatch+'"><span></span><span></span><span></span></span>' +
      '<span class="template-info"><span class="template-name">'+t.name+'</span><span class="template-desc">'+t.desc+'</span></span>';
    card.addEventListener('click', function(){ applyTemplate(t.key); });
    grid.appendChild(card);
  });
}

/* ---------------------------------------------------------- REPORT TYPES */
var SLIDE_I18N = {
  en: {
    platformLabel: { google_ecom:'Google Ads · E-commerce', google_leadgen:'Google Ads · Lead Generation', meta_ecom:'Meta Ads · E-commerce', meta_leadgen:'Meta Ads · Lead Generation', seo:'SEO', custom:'Marketing Report' },
    reportTitle: { google_ecom:'Google Ads Performance Report', google_leadgen:'Google Ads Lead Generation Report', meta_ecom:'Meta Ads Performance Report', meta_leadgen:'Meta Ads Lead Generation Report', seo:'SEO Optimization Report', custom:'Marketing Report' },
    agendaTitle: 'Report Overview',
    generalMetrics: 'General Metrics',
    campaignMetrics: 'Metrics for each advertising campaign',
    dynamics: 'Dynamics of results for the last 2 months',
    completedWork: 'Completed work',
    effectiveCreatives: 'Most effective creatives',
    conclusion: 'Conclusion',
    plansNext: 'Plans for the next period',
    whatWorked: 'What worked',
    whatDidntWork: "What didn't work",
    closingMsg: 'Thank you! Let’s keep growing — Mon’Archi',
    lookerLink: 'Looker Studio →',
    tblMetric:'Metric', tblOverall:'Overall metrics', tblDelta:'Δ%', tblPrev:'Previous period', tblPercent:'%', tblCurrent:'Current period',
    period1:'Period 1', period2:'Period 2',
    newColumn:'Column', newCampaign:'Campaign',
    clientPh:'Client name', titlePh:'Report title', periodPh:'Report period', sectionTitlePh:'Title', sectionTextPh:'Description',
    demoTitle:'Report Title', demoAgendaItems:['Item 1','Item 2','Item 3'],
    demoMetricLabels:['Metric 1','Metric 2','Metric 3'], demoKpiTitle:'Key metrics',
    demoBulletTitle:'List title', demoBulletItems:['Item one','Item two','Item three'],
    demoParagraphTitle:'Title', demoParagraphText:'Paragraph text. Click here to edit.',
    demoTableTitle:'Data table', demoSectionTitle:'Title', demoSectionText:'Description text'
  },
  uk: {
    platformLabel: { google_ecom:'Google Ads · Інтернет-магазин', google_leadgen:'Google Ads · Лідогенерація', meta_ecom:'Meta Ads · Інтернет-магазин', meta_leadgen:'Meta Ads · Лідогенерація', seo:'SEO', custom:'Маркетинговий звіт' },
    reportTitle: { google_ecom:'Звіт по рекламній кампанії Google Ads', google_leadgen:'Звіт по лідогенерації Google Ads', meta_ecom:'Звіт по рекламній кампанії Meta Ads', meta_leadgen:'Звіт по лідогенерації Meta Ads', seo:'Звіт з SEO-оптимізації', custom:'Маркетинговий звіт' },
    agendaTitle: 'Огляд звіту',
    generalMetrics: 'Загальні метрики',
    campaignMetrics: 'Метрики по кожній рекламній кампанії',
    dynamics: 'Динаміка результатів за останні 2 місяці',
    completedWork: 'Виконана робота',
    effectiveCreatives: 'Найефективніші креативи',
    conclusion: 'Висновки',
    plansNext: 'Плани на наступний період',
    whatWorked: 'Що спрацювало',
    whatDidntWork: 'Що не спрацювало',
    closingMsg: 'Дякуємо! Продовжуємо зростати разом — Mon’Archi',
    lookerLink: 'Looker Studio →',
    tblMetric:'Показник', tblOverall:'Загальні метрики', tblDelta:'Δ%', tblPrev:'Попередній період', tblPercent:'%', tblCurrent:'Поточний період',
    period1:'Період 1', period2:'Період 2',
    newColumn:'Колонка', newCampaign:'Кампанія',
    clientPh:'Назва клієнта', titlePh:'Заголовок звіту', periodPh:'Період звіту', sectionTitlePh:'Заголовок', sectionTextPh:'Опис',
    demoTitle:'Заголовок звіту', demoAgendaItems:['Пункт 1','Пункт 2','Пункт 3'],
    demoMetricLabels:['Показник 1','Показник 2','Показник 3'], demoKpiTitle:'Ключові показники',
    demoBulletTitle:'Заголовок списку', demoBulletItems:['Пункт один','Пункт два','Пункт три'],
    demoParagraphTitle:'Заголовок', demoParagraphText:'Текст абзацу. Натисніть, щоб редагувати.',
    demoTableTitle:'Таблиця даних', demoSectionTitle:'Заголовок', demoSectionText:'Текст опису'
  }
};
function tr(){ return SLIDE_I18N[state.slideLang] || SLIDE_I18N.en; }

/* ---------------------------------------------------------- STATE */
var state = { client:'', period:'', slideLang:'en', platformLabel: SLIDE_I18N.en.platformLabel.google_ecom, lastParsedData:null, lastReportType:null, previousMetrics:null, currentType:null, template:'classic' };
var slides = [];
var activeId = null;
var uidCounter = 0;
var draggedId = null;

/* Per-report-type "drafts" — each report type (Google Ads E-commerce, Meta Ads Leadgen, etc.)
   keeps its own client name, period, slides and uploaded-CSV data, so switching the dropdown
   never overwrites another type's work: e.g. Google Ads E-commerce can hold Client A's deck
   while Meta Ads E-commerce holds Client B's, and switching back and forth restores each one
   exactly as it was left. Keyed by report-type value (google_ecom, meta_ecom, ...). */
var typeDrafts = {};

var stage, slideListEl, clientInput, periodInput, reportTypeSelect, crumbEl, prevCsvStatusEl, prevCsvHintDefault;
var csvSectionsEl, seoSectionEl, seoTextEl;
var closeAddDropdown = function(){};

/* Report types whose data entry is free-form text (paste/.txt) rather than a CSV grid —
   the sidebar shows the SEO textarea section instead of the CSV upload sections for these. */
var TEXT_INPUT_TYPES = { seo:true };

/* ---------------------------------------------------------- HELPERS */
function escapeHTML(s){
  return (s===null||s===undefined?'':String(s)).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
function el(html){
  var d = document.createElement('div');
  d.innerHTML = html.trim();
  return d.firstElementChild;
}
function chunkArray(arr, size){
  var out = [];
  for(var i=0;i<arr.length;i+=size) out.push(arr.slice(i,i+size));
  return out;
}
function formatValue(raw){
  if(raw===null||raw===undefined) return '';
  return String(raw).trim();
}

/* ---------------------------------------------------------- CSV PARSING */
var TEXT_SECTION_KEYS = [
  {key:'whatWasDone', match:['what was done','what were done','completed work','виконані роботи','виконана робота','що було зроблено']},
  {key:'mostEffective', match:['most effective creatives','effective creatives','ефективні креативи','найефективніші креативи']},
  {key:'conclusion', match:['conclusion','висновок','висновки']},
  {key:'plansNext', match:['plans for the next period','plans for next week','plans for next month','plan for the next period','плани на наступний','плани на наступний період']},
  {key:'lookerLink', match:['link to looker studio','looker studio']}
];
var DATE_RE = /^\d{1,2}[.\/]\d{1,2}[.\/]\d{2,4}$/;
var RANGE_RE = /^\d{1,2}[.\/]\d{1,2}(?:[.\/]\d{2,4})?\s*[-–]\s*\d{1,2}[.\/]\d{1,2}(?:[.\/]\d{2,4})?$/;
var RANGE_RE_LOOSE = /\d{1,2}[.\/]\d{1,2}(?:[.\/]\d{2,4})?\s*[-–]\s*\d{1,2}[.\/]\d{1,2}(?:[.\/]\d{2,4})?/;

function normalize(s){ return (s||'').toString().trim().toLowerCase(); }

function findTextHeaders(rows, sectionKeys){
  var keys = sectionKeys || TEXT_SECTION_KEYS;
  var found = {};
  for(var r=0;r<rows.length;r++){
    for(var c=0;c<rows[r].length;c++){
      var cell = normalize(rows[r][c]);
      if(!cell) continue;
      for(var k=0;k<keys.length;k++){
        var sec = keys[k];
        if(found[sec.key]) continue;
        for(var m=0;m<sec.match.length;m++){
          if(cell.indexOf(sec.match[m])!==-1){ found[sec.key] = {row:r, col:c}; break; }
        }
      }
    }
  }
  return found;
}

/* Per-report-type CSV parsing profiles.
   - "google_ecom": tuned and confirmed against a real client sheet that uses blank-row period
     markers (weekly blocks + a monthly rollup, "General Metrics"/"Δ" header row, per-campaign
     columns). Already copes with mixed accounts (e.g. an e-commerce client that also runs
     lead-gen campaigns/services) since metric rows are auto-detected generically.
   - "meta_ecom" / "meta_leadgen": tuned and confirmed against a real Meta Ads sheet, which uses
     a different block layout — explicit "Beginning of the period"/"End of the period"/"Week N"
     (or "May" for the monthly total) header rows, followed by a per-block column-header row
     ("General advertising metrics", GEO columns like Slovenia/Croatia, campaign names). This is
     auto-detected by parseReportCSV (it checks for "beginning of the period" text) regardless of
     which profile is active, so it also works if a user picks the wrong dropdown value by mistake.
   - "default": generic fallback for any report type without its own reference sheet yet. */
var REPORT_TYPE_CSV_PROFILES = {
  google_ecom: { sectionKeys: TEXT_SECTION_KEYS },
  meta_ecom: { sectionKeys: TEXT_SECTION_KEYS },
  meta_leadgen: { sectionKeys: TEXT_SECTION_KEYS },
  default: { sectionKeys: TEXT_SECTION_KEYS }
};
function csvProfileFor(reportType){
  return REPORT_TYPE_CSV_PROFILES[reportType] || REPORT_TYPE_CSV_PROFILES.default;
}

function findPeriod(rows){
  var startRow=null, startCol=null, endCol=null;
  for(var r=0;r<rows.length;r++){
    for(var c=0;c<rows[r].length;c++){
      var cell = normalize(rows[r][c]);
      if(cell.indexOf('beginning of the period')!==-1){ startRow=r; startCol=c; }
      if(cell.indexOf('end of the period')!==-1){ endCol=c; }
    }
  }
  if(startRow!==null && rows[startRow+1]){
    var start = (rows[startRow+1][startCol]||'').toString().trim();
    var end = endCol!==null ? (rows[startRow+1][endCol]||'').toString().trim() : '';
    if(start) return { start:start, end:end };
  }
  for(var r2=0;r2<rows.length;r2++){
    for(var c2=0;c2<rows[r2].length;c2++){
      var raw = (rows[r2][c2]||'').toString().trim();
      if(RANGE_RE_LOOSE.test(raw)){ return { raw:raw }; }
    }
  }
  return null;
}

/* Locates the row that holds the "General Metrics" / campaign-name / Δ column headers */
function findHeaderRow(rows, textHeaders){
  for(var r=0;r<rows.length;r++){
    for(var c=0;c<rows[r].length;c++){
      if(normalize(rows[r][c]).indexOf('general metrics')!==-1) return r;
    }
  }
  var found = Object.keys(textHeaders).map(function(k){ return textHeaders[k].row; });
  if(found.length) return Math.min.apply(null, found);
  return 0;
}

/* Identifies which value column is the "overall" total, which is the Δ column, and which
   columns are individual ad-campaign breakdowns, based on the header row's text */
function findColumnRoles(rows, headerRow, boundaryCol){
  var roles = { overallCol:null, deltaCol:null, campaignCols:[] };
  var row = rows[headerRow] || [];
  var limit = boundaryCol===Infinity ? row.length : boundaryCol;
  for(var c=1;c<limit;c++){
    var cell = normalize(row[c]);
    if(!cell) continue;
    if(roles.overallCol===null && (cell.indexOf('general metrics')!==-1 || cell.indexOf('general advertising metrics')!==-1 || cell.indexOf('загальні метрики')!==-1 || cell==='overall')){ roles.overallCol=c; continue; }
    if(roles.deltaCol===null && (cell==='δ' || cell.indexOf('delta')!==-1 || /^δ\s*%?$/i.test(cell))){ roles.deltaCol=c; continue; }
    roles.campaignCols.push({ col:c, name:(row[c]||'').toString().trim() });
  }
  if(roles.overallCol===null){
    roles.overallCol = 1;
    roles.campaignCols = roles.campaignCols.filter(function(cc){ return cc.col!==1; });
  }
  roles.campaignCols = roles.campaignCols.filter(function(cc){ return cc.name!==''; });
  return roles;
}

/* A "period marker" row is a row inserted between metric blocks that carries only a
   period label (e.g. "04.05 - 10.05" for a week, or "May" for the monthly total) —
   the metric-label column (col 0) is empty but a later data column is filled in. */
function isPeriodMarkerRow(row, boundaryCol){
  if(!row) return false;
  if(row[0] && row[0].toString().trim()!=='') return false;
  var limit = boundaryCol===Infinity ? row.length : boundaryCol;
  for(var c=1;c<limit;c++){
    if(row[c] && row[c].toString().trim()!=='') return true;
  }
  return false;
}
function periodMarkerText(row, boundaryCol){
  var limit = boundaryCol===Infinity ? row.length : boundaryCol;
  for(var c=1;c<limit;c++){
    if(row[c] && row[c].toString().trim()!=='') return row[c].toString().trim();
  }
  return '';
}

/* Splits the sheet into period blocks (one per week + the monthly rollup, when present).
   Returns null when the sheet has no period-marker rows at all (a single flat block). */
function splitPeriodBlocks(rows, headerRow, boundaryCol){
  var markers = [];
  for(var r=headerRow+1;r<rows.length;r++){
    if(isPeriodMarkerRow(rows[r], boundaryCol)){
      markers.push({ row:r, text:periodMarkerText(rows[r], boundaryCol) });
    }
  }
  if(!markers.length) return null;
  var blocks = [];
  for(var i=0;i<markers.length;i++){
    var start = markers[i].row+1;
    var end = (i+1<markers.length) ? markers[i+1].row : rows.length;
    blocks.push({ periodText:markers[i].text, startRow:start, endRow:end, isWeekly:RANGE_RE_LOOSE.test(markers[i].text) });
  }
  return blocks;
}

/* Extracts metric rows (with overall value, Δ, and per-campaign/per-segment values) from a
   given row range. labelCol defaults to 0 (the layout used by sheets with blank-row period
   markers); some sheets (e.g. ones using explicit "Beginning of the period" header rows) put
   the metric label one column further right instead — pass labelCol:1 for those, which also
   skips the isPeriodMarkerRow check since that check assumes labelCol 0. */
function extractMetricsForRange(rows, startRow, endRow, boundaryCol, roles, labelCol){
  labelCol = labelCol || 0;
  var metrics = [];
  for(var r=startRow;r<endRow;r++){
    var row = rows[r];
    if(!row) continue;
    if(labelCol===0 && isPeriodMarkerRow(row, boundaryCol)) continue;
    var label = (row[labelCol]||'').toString().trim();
    if(!label) continue;
    var norm = normalize(label);
    if(norm.indexOf('beginning of the period')!==-1 || norm.indexOf('end of the period')!==-1) continue;
    if(norm.indexOf('week ')===0 || /^week\s?\d/.test(norm)) continue;
    if(norm==='general metrics' || norm==='general advertising metrics') continue;
    if(DATE_RE.test(label) || RANGE_RE.test(label)) continue;
    var overall = roles.overallCol!=null ? formatValue(row[roles.overallCol]) : '';
    var delta = roles.deltaCol!=null ? formatValue(row[roles.deltaCol]) : '';
    var campaigns = roles.campaignCols.map(function(cc){ return { name:cc.name, value:formatValue(row[cc.col]) }; });
    metrics.push({ label:label, value:overall, delta:delta, campaigns:campaigns });
  }
  return metrics;
}

function extractTextSection(rows, headerInfo, startRow, endRow){
  if(!headerInfo) return [];
  var col = headerInfo.col;
  var items = [];
  var s = startRow!=null ? startRow : headerInfo.row+1;
  var e = endRow!=null ? endRow : rows.length;
  for(var r=s;r<e;r++){
    var cell = rows[r] ? rows[r][col] : null;
    if(cell && cell.toString().trim()!==''){
      cell.toString().split(/\r?\n/).forEach(function(line){
        if(line.trim()) items.push(line.trim());
      });
    }
  }
  return items;
}

/* --- "Beginning of the period" sheet style (seen on Meta Ads sheets) ---
   Each block looks like:
     row N:   | Beginning of the period | End of the period | Week 1 (or "May" for the total) |
     row N+1: | 01.05.2026              | 10.05.2026        |                                  |
     row N+2: | (blank) | General advertising metrics | Slovenia | Croatia | <campaign name>... | What was done | ...
     row N+3+: | (blank) | Spent | 1,158 | 704 | 454 | ... | <text...>
   The metric label sits one column further right than on the "blank-row marker" style sheets
   (Google Ads templates), and each block carries its own column-header row (so the set of
   GEO/campaign columns can differ from block to block) — this is why the columns roles and
   text-section headers are (re)detected per-block rather than once for the whole sheet. */
function isRowBlank(row){
  if(!row) return true;
  for(var c=0;c<row.length;c++){ if(row[c] && row[c].toString().trim()!=='') return false; }
  return true;
}
function extractPeriodLabelFromRow(row){
  if(!row) return '';
  for(var c=0;c<row.length;c++){
    var v = (row[c]||'').toString().trim();
    if(!v) continue;
    var n = normalize(v);
    if(n.indexOf('beginning of the period')!==-1) continue;
    if(n.indexOf('end of the period')!==-1) continue;
    return v;
  }
  return '';
}
function findBeginPeriodRows(rows){
  var out = [];
  for(var r=0;r<rows.length;r++){
    for(var c=0;c<rows[r].length;c++){
      if(normalize(rows[r][c]).indexOf('beginning of the period')!==-1){ out.push(r); break; }
    }
  }
  return out;
}
function findTextHeadersInRow(rows, rowIdx, sectionKeys){
  var keys = sectionKeys || TEXT_SECTION_KEYS;
  var found = {};
  var row = rows[rowIdx] || [];
  for(var c=0;c<row.length;c++){
    var cell = normalize(row[c]);
    if(!cell) continue;
    for(var k=0;k<keys.length;k++){
      var sec = keys[k];
      if(found[sec.key]) continue;
      for(var m=0;m<sec.match.length;m++){
        if(cell.indexOf(sec.match[m])!==-1){ found[sec.key] = {row:rowIdx, col:c}; break; }
      }
    }
  }
  return found;
}
function parseBeginEndStyleCSV(rows, beginRows, profile){
  var blocks = [];
  for(var i=0;i<beginRows.length;i++){
    var br = beginRows[i];
    var periodLabel = extractPeriodLabelFromRow(rows[br]);
    var dateRow = rows[br+1] || [];
    var dateVals = dateRow.map(function(v){ return (v||'').toString().trim(); }).filter(Boolean);
    var headerRowIdx = br+2;
    var dataStart = headerRowIdx+1;
    var dataEnd = (i+1<beginRows.length) ? beginRows[i+1] : rows.length;
    while(dataEnd>dataStart && isRowBlank(rows[dataEnd-1])) dataEnd--;
    var isWeekly = /^week\b/i.test(periodLabel) || RANGE_RE_LOOSE.test(periodLabel);
    blocks.push({
      periodLabel: periodLabel, dateStart: dateVals[0]||'', dateEnd: dateVals[1]||'',
      headerRow: headerRowIdx, startRow: dataStart, endRow: dataEnd, isWeekly: isWeekly
    });
  }
  var nonWeekly = blocks.filter(function(b){ return !b.isWeekly; });
  var target = nonWeekly.length ? nonWeekly[nonWeekly.length-1] : blocks[blocks.length-1];

  var textHeaders = findTextHeadersInRow(rows, target.headerRow, profile.sectionKeys);
  var cols = Object.keys(textHeaders).map(function(k){ return textHeaders[k].col; });
  var boundaryCol = cols.length ? Math.min.apply(null, cols) : Infinity;
  var roles = findColumnRoles(rows, target.headerRow, boundaryCol);
  var metrics = extractMetricsForRange(rows, target.startRow, target.endRow, boundaryCol, roles, 1);
  var sections = {
    whatWasDone: extractTextSection(rows, textHeaders.whatWasDone, target.startRow, target.endRow),
    mostEffective: extractTextSection(rows, textHeaders.mostEffective, target.startRow, target.endRow),
    conclusion: extractTextSection(rows, textHeaders.conclusion, target.startRow, target.endRow),
    plansNext: extractTextSection(rows, textHeaders.plansNext, target.startRow, target.endRow)
  };
  var lookerLink = '';
  if(textHeaders.lookerLink){
    var arr = extractTextSection(rows, textHeaders.lookerLink, target.startRow, target.endRow);
    lookerLink = arr.length ? arr[0] : '';
  }
  var period = (target.dateStart || target.dateEnd) ? { start:target.dateStart, end:target.dateEnd } : { raw:target.periodLabel };
  return { period:period, metrics:metrics, sections:sections, lookerLink:lookerLink };
}

function parseReportCSV(text, reportType){
  var profile = csvProfileFor(reportType);
  var result = Papa.parse(text, { skipEmptyLines:false });
  var rows = result.data;

  var beginRows = findBeginPeriodRows(rows);
  if(beginRows.length){
    var parsedBE = parseBeginEndStyleCSV(rows, beginRows, profile);
    parsedBE.reportType = reportType || null;
    return parsedBE;
  }

  var textHeaders = findTextHeaders(rows, profile.sectionKeys);
  var headerRow = findHeaderRow(rows, textHeaders);
  var cols = Object.keys(textHeaders).map(function(k){ return textHeaders[k].col; });
  var boundaryCol = cols.length ? Math.min.apply(null, cols) : Infinity;
  var roles = findColumnRoles(rows, headerRow, boundaryCol);
  var blocks = splitPeriodBlocks(rows, headerRow, boundaryCol);

  var metrics, sections, lookerLink = '', period, rangeStart, rangeEnd;

  if(blocks && blocks.length){
    /* Prefer the monthly/aggregate block (its period label is NOT a "dd.mm - dd.mm" week
       range) over the individual weekly breakdowns — this is the "total for the month" data. */
    var nonWeekly = blocks.filter(function(b){ return !b.isWeekly; });
    var target = nonWeekly.length ? nonWeekly[nonWeekly.length-1] : blocks[blocks.length-1];
    rangeStart = target.startRow; rangeEnd = target.endRow;
    period = target.periodText ? { raw:target.periodText } : findPeriod(rows);
  } else {
    rangeStart = headerRow+1; rangeEnd = rows.length;
    period = findPeriod(rows);
  }

  metrics = extractMetricsForRange(rows, rangeStart, rangeEnd, boundaryCol, roles);
  sections = {
    whatWasDone: extractTextSection(rows, textHeaders.whatWasDone, rangeStart, rangeEnd),
    mostEffective: extractTextSection(rows, textHeaders.mostEffective, rangeStart, rangeEnd),
    conclusion: extractTextSection(rows, textHeaders.conclusion, rangeStart, rangeEnd),
    plansNext: extractTextSection(rows, textHeaders.plansNext, rangeStart, rangeEnd)
  };
  if(textHeaders.lookerLink){
    var arr = extractTextSection(rows, textHeaders.lookerLink, rangeStart, rangeEnd);
    lookerLink = arr.length ? arr[0] : '';
  }
  return { period:period, metrics:metrics, sections:sections, lookerLink:lookerLink, reportType: reportType || null };
}

/* ---------------------------------------------------------- SLIDE TEMPLATES */
function footerHTML(){
  /* All slide backgrounds are brand-colored now, so the footer always uses the light/white treatment.
     The full Mon'Archi mark (icon + wordmark) sits in the top-right corner of the slide instead of a
     small icon-only badge in the footer — these are two separate top-level elements, both absolutely
     positioned against the slide, so callers must insert this whole string (not just its first element). */
  return '<div class="footer-strip" style="color:#fff;">' +
    '<span><span class="bind-client" contenteditable="true" data-ph="'+escapeHTML(tr().clientPh)+'">'+escapeHTML(state.client)+'</span>&nbsp;|&nbsp;<span class="bind-platform">'+escapeHTML(state.platformLabel)+'</span></span>' +
  '</div>' +
  '<div class="brand-topright"><span class="mark">'+LOGO_BADGE_WHITE+'</span><span>Mon’Archi</span></div>';
}

function buildEditableTable(headers, rows, opts){
  opts = opts || {};
  var wrap = document.createElement('div');
  wrap.className = 'table-panel';
  var controls = document.createElement('div');
  controls.className = 'ctrl-row';
  wrap.appendChild(controls);
  var table = document.createElement('table');
  table.className = 'report-table';
  if(opts.colWidths && opts.colWidths.length){
    var colgroup = document.createElement('colgroup');
    opts.colWidths.forEach(function(w){
      var c = document.createElement('col');
      c.style.width = w;
      colgroup.appendChild(c);
    });
    table.appendChild(colgroup);
  }
  var thead = document.createElement('thead');
  var headTr = document.createElement('tr');
  headers.forEach(function(h){
    var th = document.createElement('th');
    th.contentEditable = 'true';
    th.textContent = h;
    headTr.appendChild(th);
  });
  thead.appendChild(headTr);
  table.appendChild(thead);
  var tbody = document.createElement('tbody');
  table.appendChild(tbody);
  wrap.appendChild(table);

  function addRow(values){
    var tr = document.createElement('tr');
    var colCount = headTr.children.length;
    for(var i=0;i<colCount;i++){
      var td = document.createElement('td');
      td.contentEditable = 'true';
      td.textContent = (values && values[i]!==undefined) ? values[i] : '';
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
    return tr;
  }
  function addCol(headerText, valuesForRows){
    var th = document.createElement('th');
    th.contentEditable = 'true';
    th.textContent = headerText || 'Новая колонка';
    headTr.appendChild(th);
    Array.prototype.forEach.call(tbody.children, function(tr, i){
      var td = document.createElement('td');
      td.contentEditable = 'true';
      td.textContent = (valuesForRows && valuesForRows[i]) || '';
      tr.appendChild(td);
    });
  }
  rows.forEach(function(r){ addRow(r); });

  if(opts.allowAddRow){
    var br = document.createElement('button');
    br.type = 'button'; br.className = 'ctrl-btn'; br.textContent = '+ Строка';
    br.addEventListener('click', function(){ addRow(); });
    controls.appendChild(br);
  }
  if(opts.allowRemoveRow){
    var brr = document.createElement('button');
    brr.type = 'button'; brr.className = 'ctrl-btn'; brr.textContent = '– Строка';
    brr.addEventListener('click', function(){ if(tbody.lastElementChild) tbody.removeChild(tbody.lastElementChild); });
    controls.appendChild(brr);
  }
  if(opts.allowAddCol){
    var bc = document.createElement('button');
    bc.type = 'button'; bc.className = 'ctrl-btn'; bc.textContent = '+ ' + (opts.addColLabel || 'Колонка');
    bc.addEventListener('click', function(){ addCol((opts.addColLabel || 'Колонка') + ' ' + headTr.children.length); });
    controls.appendChild(bc);
  }
  if(opts.allowRemoveCol){
    var bcc = document.createElement('button');
    bcc.type = 'button'; bcc.className = 'ctrl-btn'; bcc.textContent = '– Колонка';
    bcc.addEventListener('click', function(){
      if(headTr.children.length<=1) return;
      headTr.removeChild(headTr.lastElementChild);
      Array.prototype.forEach.call(tbody.children, function(tr){ if(tr.lastElementChild) tr.removeChild(tr.lastElementChild); });
    });
    controls.appendChild(bcc);
  }
  return wrap;
}

function makeTitleSlide(periodText, titleText){
  var t = tr();
  var html = '<div class="slide slide-title">' +
    '<div class="blob" style="width:320px;height:320px;top:-120px;left:-100px;background:radial-gradient(circle,var(--grad-start),transparent 70%);"></div>' +
    '<div class="blob" style="width:280px;height:280px;bottom:-140px;right:-70px;background:radial-gradient(circle,var(--grad-start),transparent 70%);"></div>' +
    '<div class="dotgrid" style="width:230px;height:230px;right:36px;bottom:40px;opacity:.22;"></div>' +
    '<div class="ring" style="width:210px;height:210px;top:-70px;right:60px;"></div>' +
    '<div class="ring thin" style="width:130px;height:130px;bottom:60px;left:60px;"></div>' +
    '<div class="head"><span class="mark">'+LOGO_BADGE_WHITE+'</span><span contenteditable="true">Mon’Archi</span></div>' +
    '<div class="rule"></div>' +
    '<div class="eyebrow bind-platform" contenteditable="true">'+escapeHTML(state.platformLabel)+'</div>' +
    '<h1 contenteditable="true" data-ph="'+escapeHTML(t.titlePh)+'">'+escapeHTML(titleText||'')+'</h1>' +
    '<div class="period bind-period" contenteditable="true" data-ph="'+escapeHTML(t.periodPh)+'">'+escapeHTML(periodText||'')+'</div>' +
  '</div>';
  return el(html);
}

function makeAgendaSlide(items){
  var tt = tr();
  var html = '<div class="slide slide-agenda">' +
    '<div class="dotgrid" style="width:250px;height:250px;right:0;top:0;opacity:.28;"></div>' +
    '<div class="blob" style="width:280px;height:280px;bottom:-130px;right:-90px;background:radial-gradient(circle,rgba(255,255,255,.4),transparent 70%);"></div>' +
    '<div class="ring" style="width:170px;height:170px;bottom:-50px;right:110px;"></div>' +
    '<h2 contenteditable="true">'+escapeHTML(tt.agendaTitle)+'</h2>' +
    '<div class="client bind-client" contenteditable="true" data-ph="'+escapeHTML(tt.clientPh)+'">'+escapeHTML(state.client)+'</div>' +
    '<ul class="agenda-list">' + items.map(function(item){ return '<li contenteditable="true">'+escapeHTML(item)+'</li>'; }).join('') + '</ul>' +
    footerHTML('light') +
  '</div>';
  return el(html);
}

function makeSectionSlide(title, text){
  var t = tr();
  var html = '<div class="slide slide-section">' +
    '<div class="dotgrid" style="right:0;top:0;clip-path:polygon(100% 0,100% 100%,40% 0);"></div>' +
    '<h2 contenteditable="true" data-ph="'+escapeHTML(t.sectionTitlePh)+'">'+escapeHTML(title||'')+'</h2>' +
    '<div class="line"><span class="dot"></span><span contenteditable="true" data-ph="'+escapeHTML(t.sectionTextPh)+'">'+escapeHTML(text||'')+'</span></div>' +
    footerHTML('dark') +
  '</div>';
  return el(html);
}

function kpiCardHTML(m){
  var icon = pickIcon(m.label);
  return '<div class="kpi-card"><div class="kpi-icon">'+ICONS[icon]+'</div><div class="kpi-body">' +
    '<div class="kpi-label" contenteditable="true">'+escapeHTML(m.label)+'</div>' +
    '<div class="kpi-value" contenteditable="true" data-ph="—">'+escapeHTML(formatValue(m.value))+'</div>' +
  '</div></div>';
}

function metricPillHTML(m){
  return '<div class="metric-pill">' +
    '<span class="label" contenteditable="true">'+escapeHTML(m.label)+'</span>' +
    '<span class="value-chip" contenteditable="true" data-ph="—">'+escapeHTML(formatValue(m.value))+'</span>' +
  '</div>';
}

/* "General Metrics" — nicely formatted pill list, matching the reference deck's format */
function makeMetricsListSlide(metrics, title, lookerLink){
  var t = tr();
  var gridClass = metrics.length > 14 ? 'dense3' : (metrics.length > 8 ? 'dense' : '');
  var html = '<div class="slide slide-metricslist">' +
    '<h2 contenteditable="true">'+escapeHTML(title||t.generalMetrics)+'</h2>' +
    (lookerLink ? '<a class="looker" href="'+escapeHTML(lookerLink)+'" target="_blank" rel="noopener">'+escapeHTML(t.lookerLink)+'</a>' : '') +
    '<div class="pill-grid'+(gridClass?' '+gridClass:'')+'">' + metrics.map(metricPillHTML).join('') + '</div>' +
    footerHTML() +
  '</div>';
  return el(html);
}

/* KPI cards — alternative grid layout, available via "Добавить слайд" */
function makeKpiGridSlide(metrics, title){
  var dense = metrics.length > 8;
  var html = '<div class="slide slide-kpigrid">' +
    '<h2 contenteditable="true">'+escapeHTML(title||tr().demoKpiTitle)+'</h2>' +
    '<div class="kpi-grid'+(dense?' dense':'')+'">' + metrics.map(kpiCardHTML).join('') + '</div>' +
    footerHTML() +
  '</div>';
  return el(html);
}

/* Fixed slide canvas is 960x540 — these caps keep tables/lists from overflowing it.
   Tuned for the compact table styling (10.5px font, tight padding): rows are cheap, so the
   real limit for the campaign table is column width, not row count. When there is more data
   than fits, the caller splits it across several "(n/N)" slides; the table area also has a
   CSS overflow:hidden safety net so a slight miscalculation clips instead of overlapping the
   footer. */
var TABLE_ROWS_PER_PAGE = 12;
var TABLE_CAMPAIGNS_PER_PAGE = 5;
var DYNAMICS_ROWS_PER_PAGE = 14;

/* Off-screen sandbox used to measure how much bullet/paragraph content actually fits on a
   slide, using the real CSS and DOM (not a character-count guess) — see chunkBulletItems /
   chunkParagraphs below. Fixed-position and far off-screen so it never affects layout or
   becomes visible, but still fully rendered so scrollHeight/clientHeight are real. */
var measureBox = null;
function getMeasureBox(){
  if(!measureBox){
    measureBox = document.createElement('div');
    measureBox.style.cssText = 'position:fixed;left:-99999px;top:0;visibility:hidden;pointer-events:none;';
    document.body.appendChild(measureBox);
  }
  /* Templates are pure CSS scoped under the current template's class — the measurement
     sandbox needs that same class (not just the real #stage) so a slide measured here
     reports the same height it will actually render at. */
  measureBox.className = stage ? stage.className : '';
  return measureBox;
}
function fitsOnBulletSlide(title, items){
  var box = getMeasureBox();
  box.innerHTML = '';
  var slideEl = makeBulletSlide(title, items);
  box.appendChild(slideEl);
  var ul = slideEl.querySelector('.bullets');
  var fits = ul.scrollHeight <= ul.clientHeight + 1;
  box.innerHTML = '';
  return fits;
}
function fitsOnParagraphSlide(title, paragraphs){
  var box = getMeasureBox();
  box.innerHTML = '';
  var slideEl = makeParagraphSlide(title, paragraphs);
  box.appendChild(slideEl);
  var body = slideEl.querySelector('.paragraph-body');
  var fits = body.scrollHeight <= body.clientHeight + 1;
  box.innerHTML = '';
  return fits;
}

function campaignColWidths(n){
  var metricPct = 18, overallPct = 10, deltaPct = 7;
  var rest = 100 - metricPct - overallPct - deltaPct;
  var each = n>0 ? (rest/n) : rest;
  var widths = [metricPct+'%', overallPct+'%', deltaPct+'%'];
  for(var i=0;i<n;i++) widths.push(each.toFixed(2)+'%');
  return widths;
}
function dynamicsColWidths(){ return ['34%','22%','12%','32%']; }

/* Matches a metric to its counterpart in another metrics array by (normalized) label —
   used to pull the previous month's totals in from a separately-uploaded comparison CSV. */
function findMetricByLabel(metrics, label){
  if(!metrics) return null;
  var norm = normalize(label);
  for(var i=0;i<metrics.length;i++){
    if(normalize(metrics[i].label)===norm) return metrics[i];
  }
  return null;
}
/* Parses a formatted cell value ("₪12,345.67", "-16.63%", "#DIV/0!") into a plain number,
   or null when it isn't a clean number (currency symbols/commas are stripped, spreadsheet
   error strings like #DIV/0! are rejected). */
function parseNumericValue(raw){
  if(raw===null || raw===undefined) return null;
  var s = raw.toString().trim();
  if(!s || s.indexOf('#')===0) return null;
  var cleaned = s.replace(/[^0-9.\-]/g,'');
  if(cleaned==='' || cleaned==='-' || cleaned==='.') return null;
  var n = parseFloat(cleaned);
  return isNaN(n) ? null : n;
}
/* Builds one Dynamics-table row: pulls "Previous period" from the comparison metrics
   (when supplied) and recomputes "%" from the two real numbers rather than trusting the
   current CSV's own Δ (which can be stale, e.g. "#DIV/0!" when the sheet has no prior value). */
function dynamicsRow(m, previousMetrics){
  var prevEntry = findMetricByLabel(previousMetrics, m.label);
  var prevVal = prevEntry ? formatValue(prevEntry.value) : '';
  var pct = formatValue(m.delta || '');
  if(prevEntry){
    var curNum = parseNumericValue(m.value);
    var prevNum = parseNumericValue(prevEntry.value);
    if(curNum!==null && prevNum!==null && prevNum!==0){
      var change = (curNum - prevNum) / Math.abs(prevNum) * 100;
      pct = (change>=0 ? '+' : '') + change.toFixed(2) + '%';
    }
  }
  return [m.label, prevVal, pct, formatValue(m.value)];
}

function buildCampaignTableEl(headers, rows, title, colWidths){
  var t = tr();
  var outer = el('<div class="slide slide-darktable"><div class="dotgrid" style="right:0;top:0;"></div><h2 contenteditable="true">'+escapeHTML(title)+'</h2><div class="table-slot"></div></div>');
  var table = buildEditableTable(headers, rows, {
    allowAddRow:true, allowRemoveRow:true, allowAddCol:true, allowRemoveCol:true, addColLabel:t.newCampaign, colWidths:colWidths
  });
  outer.querySelector('.table-slot').appendChild(table);
  outer.insertAdjacentHTML('beforeend', footerHTML());
  return outer;
}
function buildDynamicsTableEl(rows, title){
  var t = tr();
  var outer = el('<div class="slide slide-darktable"><h2 contenteditable="true">'+escapeHTML(title)+'</h2><div class="table-slot"></div></div>');
  var table = buildEditableTable([t.tblMetric, t.tblPrev, t.tblPercent, t.tblCurrent], rows, {
    allowAddRow:true, allowRemoveRow:true, colWidths:dynamicsColWidths()
  });
  outer.querySelector('.table-slot').appendChild(table);
  outer.insertAdjacentHTML('beforeend', footerHTML());
  return outer;
}

/* "Metrics for each advertising campaign" — single table (used by the manual "add slide" /
   demo flow, where the data set is always small enough to fit on one slide). */
function makeCampaignTableSlide(metrics, title){
  var t = tr();
  var campaignNames = (metrics.length && metrics[0].campaigns && metrics[0].campaigns.length)
    ? metrics[0].campaigns.map(function(c){ return c.name || t.newCampaign; })
    : [t.newCampaign+' 1'];
  var headers = [t.tblMetric, t.tblOverall, t.tblDelta].concat(campaignNames);
  var rows = metrics.length ? metrics.map(function(m){
    var campaignVals = (m.campaigns && m.campaigns.length) ? m.campaigns.map(function(c){ return formatValue(c.value); }) : campaignNames.map(function(){ return ''; });
    return [m.label, formatValue(m.value), formatValue(m.delta||'')].concat(campaignVals);
  }) : [[t.tblMetric,'0',''].concat(campaignNames.map(function(){ return ''; }))];
  return buildCampaignTableEl(headers, rows, title||t.campaignMetrics, campaignColWidths(campaignNames.length));
}

/* CSV-driven version — paginates both rows (metrics) and columns (campaigns) across as many
   slides as needed so nothing overflows the fixed slide canvas. Returns [{el, menuLabel}]. */
function buildCampaignTableSlides(metrics, title){
  var t = tr();
  var baseTitle = title || t.campaignMetrics;
  var campaignNames = (metrics.length && metrics[0].campaigns && metrics[0].campaigns.length)
    ? metrics[0].campaigns.map(function(c){ return c.name || t.newCampaign; })
    : [];
  var metricsForPaging = metrics.length ? metrics : [{label:t.tblMetric, value:'0', delta:'', campaigns:campaignNames.map(function(n){ return {name:n, value:''}; })}];
  var rowChunks = chunkArray(metricsForPaging, TABLE_ROWS_PER_PAGE);
  var colIdxChunks = campaignNames.length ? chunkArray(campaignNames.map(function(n,i){ return i; }), TABLE_CAMPAIGNS_PER_PAGE) : [[]];
  var totalPages = rowChunks.length * colIdxChunks.length;
  var out = [];
  var pageNum = 0;
  rowChunks.forEach(function(rowsChunk){
    colIdxChunks.forEach(function(colIdx){
      pageNum++;
      var headers = [t.tblMetric, t.tblOverall, t.tblDelta].concat(colIdx.map(function(ci){ return campaignNames[ci]; }));
      var rows = rowsChunk.map(function(m){
        var campaignVals = colIdx.map(function(ci){
          var c = (m.campaigns||[])[ci];
          return c ? formatValue(c.value) : '';
        });
        return [m.label, formatValue(m.value), formatValue(m.delta||'')].concat(campaignVals);
      });
      var pageTitle = totalPages>1 ? baseTitle+' ('+pageNum+'/'+totalPages+')' : baseTitle;
      out.push({ el: buildCampaignTableEl(headers, rows, pageTitle, campaignColWidths(colIdx.length)), menuLabel: pageTitle });
    });
  });
  return out;
}

/* "Dynamics of results for the last 2 months" — single table (manual "add slide" / demo flow). */
function makeDynamicsTableSlide(metrics, title){
  var t = tr();
  var rows = metrics.length ? metrics.map(function(m){ return dynamicsRow(m, null); }) : [[t.tblMetric,'','','0']];
  return buildDynamicsTableEl(rows, title||t.dynamics);
}

/* CSV-driven version — paginates rows across slides when there are too many metrics for one
   table. When a previous-month comparison CSV was uploaded (state.previousMetrics), each row's
   "Previous period" / "%" columns are filled from real numbers instead of being left blank. */
function buildDynamicsTableSlides(metrics, title, previousMetrics){
  var t = tr();
  var baseTitle = title || t.dynamics;
  var metricsForPaging = metrics.length ? metrics : [{label:t.tblMetric, value:'0', delta:''}];
  var rowChunks = chunkArray(metricsForPaging, DYNAMICS_ROWS_PER_PAGE);
  var out = [];
  rowChunks.forEach(function(chunk, i){
    var rows = chunk.map(function(m){ return dynamicsRow(m, previousMetrics); });
    var pageTitle = rowChunks.length>1 ? baseTitle+' ('+(i+1)+'/'+rowChunks.length+')' : baseTitle;
    out.push({ el: buildDynamicsTableEl(rows, pageTitle), menuLabel: pageTitle });
  });
  return out;
}

/* Splits a bullet list into slide-sized pages using real rendering (fitsOnBulletSlide),
   not a character-count guess — items are added to a page one at a time for as long as
   they still fit, so each page is filled as full as it can be instead of breaking early
   and leaving slides mostly empty. "title" only needs to be the page's base title (without
   the "(n/N)" suffix); that suffix doesn't change the heading's height meaningfully. */
function chunkBulletItems(items, title){
  if(!items.length) return [[]];
  var pages = [];
  var i = 0;
  while(i < items.length){
    var candidate = [items[i]];
    var j = i + 1;
    while(j < items.length){
      var next = candidate.concat([items[j]]);
      if(fitsOnBulletSlide(title||'', next)){
        candidate = next;
        j++;
      } else {
        break;
      }
    }
    pages.push(candidate);
    i = j;
  }
  return pages;
}

/* Same real-measurement approach as chunkBulletItems, for paragraph slides — keeps whole
   paragraphs together (never cuts mid-paragraph) while filling each page as full as it fits. */
function chunkParagraphs(paragraphs, title){
  if(!paragraphs.length) return [[]];
  var pages = [];
  var i = 0;
  while(i < paragraphs.length){
    var candidate = [paragraphs[i]];
    var j = i + 1;
    while(j < paragraphs.length){
      var next = candidate.concat([paragraphs[j]]);
      if(fitsOnParagraphSlide(title||'', next)){
        candidate = next;
        j++;
      } else {
        break;
      }
    }
    pages.push(candidate);
    i = j;
  }
  return pages;
}

/* Bullet items are normally plain strings, but SEO-from-HTML sections pass
   {text, bold} objects too — "bold" marks a nested sub-heading (e.g. "Keyword analysis"
   under a weekly heading) so it stays visually distinct from the regular content lines
   grouped under it, without needing its own slide. */
function makeBulletSlide(title, items){
  var html = '<div class="slide slide-bullets">' +
    '<h2 contenteditable="true">'+escapeHTML(title)+'</h2>' +
    '<div class="dotgrid" style="right:0;top:0;clip-path:polygon(100% 0,100% 100%,0 0);"></div>' +
    '<ul class="bullets">' + items.map(function(it){
      var isObj = it && typeof it==='object';
      var text = isObj ? it.text : it;
      var bold = isObj && it.bold;
      return '<li><span class="dot"></span><span contenteditable="true"'+(bold?' style="font-weight:800;"':'')+'>'+escapeHTML(text)+'</span></li>';
    }).join('') + '</ul>' +
    footerHTML('light') +
  '</div>';
  return el(html);
}

function makeParagraphSlide(title, paragraphs){
  var html = '<div class="slide slide-paragraph">' +
    '<div class="quote">&ldquo;</div>' +
    '<h2 contenteditable="true">'+escapeHTML(title)+'</h2>' +
    '<div class="paragraph-body">' + paragraphs.map(function(p){ return '<p contenteditable="true">'+escapeHTML(p)+'</p>'; }).join('') + '</div>' +
    footerHTML('light') +
  '</div>';
  return el(html);
}

function makeTableSlide(title, headers, rows){
  var t = tr();
  headers = headers || [t.tblMetric, t.period1, t.period2, t.tblDelta];
  rows = rows || [['—','—','—','—'],['—','—','—','—'],['—','—','—','—'],['—','—','—','—']];
  var outer = el('<div class="slide slide-darktable"><h2 contenteditable="true">'+escapeHTML(title||t.demoTableTitle)+'</h2><div class="table-slot"></div></div>');
  var table = buildEditableTable(headers, rows, { allowAddRow:true, allowRemoveRow:true, allowAddCol:true, allowRemoveCol:true, addColLabel:t.newColumn });
  outer.querySelector('.table-slot').appendChild(table);
  outer.insertAdjacentHTML('beforeend', footerHTML());
  return outer;
}

function makeClosingSlide(){
  var html = '<div class="slide slide-closing">' +
    '<div class="blob" style="width:300px;height:300px;top:-120px;right:-100px;background:radial-gradient(circle,var(--grad-start),transparent 70%);"></div>' +
    '<div class="blob" style="width:260px;height:260px;bottom:-120px;left:-90px;background:radial-gradient(circle,var(--grad-start),transparent 70%);"></div>' +
    '<div class="dotgrid" style="width:200px;height:200px;left:30px;top:30px;opacity:.2;"></div>' +
    '<div class="ring" style="width:180px;height:180px;top:50%;left:50%;transform:translate(-50%,-50%);"></div>' +
    '<div class="badge-wrap" style="position:relative;">'+LOGO_BADGE_WHITE+'</div>' +
    '<h2 contenteditable="true" style="position:relative;">'+escapeHTML(tr().closingMsg)+'</h2>' +
  '</div>';
  return el(html);
}

/* ---------------------------------------------------------- SLIDE MANAGEMENT */
function addSlide(type, label, domEl, atIndex){
  var obj = { id:'s'+(++uidCounter), type:type, label:label, visible:true, el:domEl };
  if(atIndex===undefined || atIndex===null || atIndex<0) slides.push(obj);
  else slides.splice(atIndex, 0, obj);
  return obj;
}

function renderSidebar(){
  slideListEl.innerHTML = '';
  slides.forEach(function(s, i){
    var li = document.createElement('li');
    li.className = 'slide-row' + (s.id===activeId?' active':'') + (!s.visible?' hidden-slide':'');
    li.draggable = true;
    li.dataset.id = s.id;
    li.innerHTML = '<span class="handle">⠿</span><span class="num">'+(i+1)+'</span><span class="lbl">'+escapeHTML(s.label)+'</span>' +
      '<button class="btn-eye" title="Показати/сховати">'+(s.visible?'👁':'⛔')+'</button>' +
      '<button class="btn-del" title="Видалити">✕</button>';
    li.addEventListener('click', function(e){
      if(e.target.closest('button')) return;
      selectSlide(s.id);
      closeMobileSidebar(); /* reveal the picked slide immediately on phones; a no-op on desktop */
    });
    li.querySelector('.btn-eye').addEventListener('click', function(e){
      e.stopPropagation(); s.visible = !s.visible; renderSidebar();
    });
    li.querySelector('.btn-del').addEventListener('click', function(e){
      e.stopPropagation(); deleteSlide(s.id);
    });
    li.addEventListener('dragstart', function(){ draggedId = s.id; });
    li.addEventListener('dragover', function(e){ e.preventDefault(); });
    li.addEventListener('drop', function(e){
      e.preventDefault();
      if(!draggedId || draggedId===s.id) return;
      var from = slides.findIndex(function(x){ return x.id===draggedId; });
      var to = slides.findIndex(function(x){ return x.id===s.id; });
      var item = slides.splice(from,1)[0];
      slides.splice(to,0,item);
      draggedId = null;
      renderSidebar();
    });
    slideListEl.appendChild(li);
  });
}

function selectSlide(id){
  var s = slides.filter(function(x){ return x.id===id; })[0];
  if(!s) return;
  activeId = id;
  stage.innerHTML = '';
  stage.appendChild(s.el);
  var idx = slides.indexOf(s);
  crumbEl.innerHTML = 'Слайд ' + (idx+1) + ' з ' + slides.length + ' <span>&nbsp;·&nbsp;' + escapeHTML(s.label) + '</span>';
  renderSidebar();
  fitStage();
}

function deleteSlide(id){
  if(slides.length<=1){ alert('Не можна видалити останній слайд'); return; }
  var idx = slides.findIndex(function(x){ return x.id===id; });
  slides.splice(idx,1);
  if(activeId===id){
    var next = slides[Math.min(idx, slides.length-1)];
    selectSlide(next.id);
  } else {
    renderSidebar();
  }
}

function syncBinding(cls, value, exceptEl){
  slides.forEach(function(s){
    Array.prototype.forEach.call(s.el.querySelectorAll('.'+cls), function(elx){
      if(elx!==exceptEl) elx.textContent = value;
    });
  });
}

/* ---------------------------------------------------------- BUILD DECK FROM CSV */
function buildDeckFromData(parsed, type){
  var t = tr();
  var items = [t.generalMetrics, t.campaignMetrics, t.dynamics];
  if(parsed.sections.whatWasDone.length) items.push(t.completedWork);
  if(parsed.sections.mostEffective.length) items.push(t.effectiveCreatives);
  if(parsed.sections.conclusion.length) items.push(t.conclusion);
  if(parsed.sections.plansNext.length) items.push(t.plansNext);
  /* whatWorked/whatDidntWork only ever come from a project ad-report pull
     (see loadFromProjectReport below) — CSV/SEO-parsed `sections` objects
     never have these keys, hence the guards. */
  if(parsed.sections.whatWorked && parsed.sections.whatWorked.length) items.push(t.whatWorked);
  if(parsed.sections.whatDidntWork && parsed.sections.whatDidntWork.length) items.push(t.whatDidntWork);

  var periodText = '';
  if(parsed.period){
    periodText = parsed.period.raw ? parsed.period.raw : [parsed.period.start, parsed.period.end].filter(Boolean).join(' – ');
  }
  state.period = periodText;
  periodInput.value = periodText;
  state.platformLabel = t.platformLabel[type];
  state.lastParsedData = parsed;
  state.lastReportType = type;

  slides = [];
  addSlide('title', 'Титульний', makeTitleSlide(periodText, t.reportTitle[type]));
  addSlide('agenda', 'План звіту', makeAgendaSlide(items));

  var chunks = chunkArray(parsed.metrics, 16);
  if(chunks.length===0) chunks = [[]];
  chunks.forEach(function(chunk, i){
    var title = chunks.length>1 ? t.generalMetrics+' ('+(i+1)+'/'+chunks.length+')' : t.generalMetrics;
    var menuLabel = 'Загальні метрики'+(chunks.length>1?' ('+(i+1)+'/'+chunks.length+')':'');
    addSlide('metricslist', menuLabel, makeMetricsListSlide(chunk, title, i===0?parsed.lookerLink:''));
  });

  buildCampaignTableSlides(parsed.metrics, t.campaignMetrics).forEach(function(page, i, arr){
    var menuLabel = 'Метрики по кампаніях'+(arr.length>1?' ('+(i+1)+'/'+arr.length+')':'');
    addSlide('campaignTable', menuLabel, page.el);
  });
  buildDynamicsTableSlides(parsed.metrics, t.dynamics, state.previousMetrics).forEach(function(page, i, arr){
    var menuLabel = 'Динаміка за 2 періоди'+(arr.length>1?' ('+(i+1)+'/'+arr.length+')':'');
    addSlide('dynamicsTable', menuLabel, page.el);
  });

  if(parsed.sections.whatWasDone.length){
    chunkBulletItems(parsed.sections.whatWasDone, t.completedWork).forEach(function(chunk, i, arr){
      var pageTitle = arr.length>1 ? t.completedWork+' ('+(i+1)+'/'+arr.length+')' : t.completedWork;
      var menuLabel = 'Виконана робота'+(arr.length>1?' ('+(i+1)+'/'+arr.length+')':'');
      addSlide('bullets', menuLabel, makeBulletSlide(pageTitle, chunk));
    });
  }
  if(parsed.sections.mostEffective.length){
    chunkBulletItems(parsed.sections.mostEffective, t.effectiveCreatives).forEach(function(chunk, i, arr){
      var pageTitle = arr.length>1 ? t.effectiveCreatives+' ('+(i+1)+'/'+arr.length+')' : t.effectiveCreatives;
      var menuLabel = 'Ефективні креативи'+(arr.length>1?' ('+(i+1)+'/'+arr.length+')':'');
      addSlide('bullets', menuLabel, makeBulletSlide(pageTitle, chunk));
    });
  }
  if(parsed.sections.conclusion.length){
    chunkParagraphs(parsed.sections.conclusion, t.conclusion).forEach(function(chunk, i, arr){
      var pageTitle = arr.length>1 ? t.conclusion+' ('+(i+1)+'/'+arr.length+')' : t.conclusion;
      var menuLabel = 'Висновки'+(arr.length>1?' ('+(i+1)+'/'+arr.length+')':'');
      addSlide('paragraph', menuLabel, makeParagraphSlide(pageTitle, chunk));
    });
  }
  if(parsed.sections.plansNext.length){
    chunkBulletItems(parsed.sections.plansNext, t.plansNext).forEach(function(chunk, i, arr){
      var pageTitle = arr.length>1 ? t.plansNext+' ('+(i+1)+'/'+arr.length+')' : t.plansNext;
      var menuLabel = 'Плани на наступний період'+(arr.length>1?' ('+(i+1)+'/'+arr.length+')':'');
      addSlide('bullets', menuLabel, makeBulletSlide(pageTitle, chunk));
    });
  }
  if(parsed.sections.whatWorked && parsed.sections.whatWorked.length){
    chunkBulletItems(parsed.sections.whatWorked, t.whatWorked).forEach(function(chunk, i, arr){
      var pageTitle = arr.length>1 ? t.whatWorked+' ('+(i+1)+'/'+arr.length+')' : t.whatWorked;
      var menuLabel = 'Що спрацювало'+(arr.length>1?' ('+(i+1)+'/'+arr.length+')':'');
      addSlide('bullets', menuLabel, makeBulletSlide(pageTitle, chunk));
    });
  }
  if(parsed.sections.whatDidntWork && parsed.sections.whatDidntWork.length){
    chunkBulletItems(parsed.sections.whatDidntWork, t.whatDidntWork).forEach(function(chunk, i, arr){
      var pageTitle = arr.length>1 ? t.whatDidntWork+' ('+(i+1)+'/'+arr.length+')' : t.whatDidntWork;
      var menuLabel = 'Що не спрацювало'+(arr.length>1?' ('+(i+1)+'/'+arr.length+')':'');
      addSlide('bullets', menuLabel, makeBulletSlide(pageTitle, chunk));
    });
  }

  addSlide('closing', 'Фінальний слайд', makeClosingSlide());

  renderSidebar();
  selectSlide(slides[0].id);
}

/* ---------------------------------------------------------- BUILD DECK FROM SEO TEXT/HTML */
/* SEO reports (pasted/exported from a running Google Doc work-log) have no metrics grid at
   all — just period headings followed by lists of completed-work items. Two ways in:
   - Plain-text paste/.txt: no formatting survives, so it's treated as one flat list — every
     non-empty line becomes one bullet under a single "Completed work" slide (paginated).
   - .html export (Файл → Завантажити → Веб-сторінка): real heading tags survive, so the
     report is split into one slide per TOP-LEVEL heading (a heading that is not nested
     under a shallower one still open) — e.g. each "06.04 - 12.04" gets its own slide.
     A heading nested under an already-open shallower heading (e.g. "Keyword analysis"
     under "1-st month report") is NOT given its own slide — it becomes a bold line inside
     the parent slide's bullet list, per the agreed top-level-only split. A plain paragraph
     whose entire text is just a date range (some weeks in real documents lose their heading
     style by accident) is also treated as a fresh top-level section, since it's clearly
     meant as one. Both flows funnel into the same section-based slide builder below. */
function parseSeoText(text){
  return (text||'').toString().split(/\r?\n/).map(function(l){ return l.trim(); }).filter(Boolean);
}

var HEADING_TAG_LEVELS = { h1:1, h2:2, h3:3, h4:4, h5:5, h6:6 };
var SEO_DATE_HEADING_RE = /^\d{1,2}[.\/]\d{1,2}(?:[.\/]\d{2,4})?\s*[-–]\s*\d{1,2}[.\/]\d{1,2}(?:[.\/]\d{2,4})?$/;

/* Parses an exported Google Docs .html string into [{title, items:[{text,bold}]}] sections. */
function parseSeoHtml(htmlString){
  var doc;
  try{ doc = new DOMParser().parseFromString(htmlString||'', 'text/html'); }catch(e){ doc = null; }
  var body = doc && doc.body;
  if(!body) return [];

  /* Preserve manual line breaks as newlines before reading textContent, so a paragraph with
     soft line breaks still becomes multiple bullet lines instead of one run-on line. */
  Array.prototype.forEach.call(body.querySelectorAll('br'), function(br){
    if(br.parentNode) br.parentNode.replaceChild(doc.createTextNode('\n'), br);
  });

  var blocks = [];
  (function collect(node){
    Array.prototype.forEach.call(node.children, function(child){
      var tag = child.tagName ? child.tagName.toLowerCase() : '';
      if(tag==='ul' || tag==='ol'){
        Array.prototype.forEach.call(child.children, function(li){
          if(li.tagName && li.tagName.toLowerCase()==='li') blocks.push({ tag:'li', text:(li.textContent||'').trim() });
        });
      } else if(HEADING_TAG_LEVELS[tag]){
        blocks.push({ tag:tag, level:HEADING_TAG_LEVELS[tag], text:(child.textContent||'').trim() });
      } else if(tag==='p'){
        var text = (child.textContent||'').trim();
        if(text) blocks.push({ tag:'p', text:text });
      } else if(tag==='div' || tag==='span' || tag==='body'){
        collect(child); /* some exports wrap all paragraphs in one container div */
      }
    });
  })(body);

  var sections = [];
  var current = null;
  var topLevel = null;
  function ensureSection(title){ current = { title:title, items:[] }; sections.push(current); }
  function addContentText(text){
    if(!current) return; /* ignore stray content before the first detected heading (e.g. the doc's own title line) */
    text.split(/\n/).forEach(function(line){
      line = line.trim();
      if(line) current.items.push({ text:line, bold:false });
    });
  }

  blocks.forEach(function(b){
    if(b.tag==='li'){ if(b.text) addContentText(b.text); return; }
    if(HEADING_TAG_LEVELS[b.tag]){
      if(!current || topLevel===null || b.level<=topLevel){
        ensureSection(b.text);
        topLevel = b.level;
      } else if(b.text){
        current.items.push({ text:b.text, bold:true });
      }
      return;
    }
    if(SEO_DATE_HEADING_RE.test(b.text)){ ensureSection(b.text); return; }
    if(b.text) addContentText(b.text);
  });

  return sections.filter(function(s){ return s.title || s.items.length; });
}

/* Shared slide builder for both the flat (plain-text) and structured (.html) SEO flows —
   one "Completed work"-style bullet slide per section, paginated when a section's content
   is too long for a single slide. */
function buildSeoDeckFromSections(sections, type){
  var t = tr();
  if(!sections || !sections.length) sections = [{ title:t.completedWork, items:[] }];
  state.platformLabel = t.platformLabel[type];
  state.lastParsedData = null;
  state.lastReportType = type;

  slides = [];
  addSlide('title', 'Титульний', makeTitleSlide(state.period, t.reportTitle[type]));
  addSlide('agenda', 'План звіту', makeAgendaSlide([t.completedWork]));

  sections.forEach(function(section){
    var baseTitle = section.title || t.completedWork;
    var chunks = chunkBulletItems(section.items, baseTitle);
    chunks.forEach(function(chunk, i){
      var pageTitle = chunks.length>1 ? baseTitle+' ('+(i+1)+'/'+chunks.length+')' : baseTitle;
      addSlide('bullets', pageTitle, makeBulletSlide(pageTitle, chunk));
    });
  });

  addSlide('closing', 'Фінальний слайд', makeClosingSlide());

  renderSidebar();
  selectSlide(slides[0].id);
}

function buildSeoDeckFromText(text, type){
  var items = parseSeoText(text).map(function(x){ return { text:x, bold:false }; });
  buildSeoDeckFromSections([{ title: tr().completedWork, items: items }], type);
}

function buildSeoDeckFromHtml(htmlString, type){
  buildSeoDeckFromSections(parseSeoHtml(htmlString), type);
}

/* ---------------------------------------------------------- PER-TYPE DRAFTS */
/* Captures everything the currently selected report type "owns" — called right before
   switching the dropdown away from it, so the work is never lost. */
function snapshotCurrentDraft(){
  return {
    client: state.client,
    period: state.period,
    platformLabel: state.platformLabel,
    slides: slides,
    activeId: activeId,
    lastParsedData: state.lastParsedData,
    previousMetrics: state.previousMetrics,
    prevCsvStatusText: prevCsvStatusEl ? prevCsvStatusEl.textContent : '',
    seoText: seoTextEl ? seoTextEl.value : ''
  };
}

/* Shows the CSV-upload sidebar sections for table-driven report types, or the free-text
   paste/.txt section for text-driven ones (currently just "seo") — called on load and every
   time the report type dropdown changes. */
function updateTypeSpecificUI(type){
  var isText = !!TEXT_INPUT_TYPES[type];
  if(csvSectionsEl) csvSectionsEl.style.display = isText ? 'none' : '';
  if(seoSectionEl) seoSectionEl.style.display = isText ? '' : 'none';
}

/* Builds an empty starter deck for a report type that has no saved draft yet
   (mirrors the very first deck the app shows on load). */
function blankDeckForType(type){
  var t = tr();
  state.client = '';
  state.period = '';
  state.platformLabel = t.platformLabel[type];
  state.lastParsedData = null;
  state.lastReportType = null;
  state.previousMetrics = null;
  if(clientInput) clientInput.value = '';
  if(periodInput) periodInput.value = '';
  if(prevCsvStatusEl) prevCsvStatusEl.textContent = prevCsvHintDefault;
  if(seoTextEl) seoTextEl.value = '';
  slides = [];
  addSlide('title', 'Титульний', makeTitleSlide('', t.reportTitle[type]));
  addSlide('agenda', 'План звіту', makeAgendaSlide(type==='seo' ? [t.completedWork] : [t.generalMetrics]));
  addSlide('closing', 'Фінальний слайд', makeClosingSlide());
  renderSidebar();
  selectSlide(slides[0].id);
  updateTypeSpecificUI(type);
}

/* Restores a previously saved draft for a report type, or starts a blank one if this is
   the first time this type has been selected in the current session. */
function loadDraft(type){
  var d = typeDrafts[type];
  if(!d){ blankDeckForType(type); return; }
  state.client = d.client;
  state.period = d.period;
  state.platformLabel = d.platformLabel;
  state.lastParsedData = d.lastParsedData;
  state.lastReportType = d.lastParsedData ? type : null;
  state.previousMetrics = d.previousMetrics;
  if(clientInput) clientInput.value = state.client;
  if(periodInput) periodInput.value = state.period;
  if(prevCsvStatusEl) prevCsvStatusEl.textContent = d.prevCsvStatusText || prevCsvHintDefault;
  if(seoTextEl) seoTextEl.value = d.seoText || '';
  slides = d.slides && d.slides.length ? d.slides : [];
  if(!slides.length){ blankDeckForType(type); return; }
  renderSidebar();
  var restoreId = (d.activeId && slides.some(function(s){ return s.id===d.activeId; })) ? d.activeId : slides[0].id;
  selectSlide(restoreId);
  updateTypeSpecificUI(type);
}

function initDefaultDeck(){
  state.currentType = reportTypeSelect.value;
  blankDeckForType(state.currentType);
}

/* ---------------------------------------------------------- ADD SLIDE MENU */
var ADD_TYPES = [
  {type:'title', label:'Титульний'},
  {type:'agenda', label:'План / зміст'},
  {type:'section', label:'Акцентний (кольоровий фон)'},
  {type:'metricslist', label:'Загальні метрики (список)'},
  {type:'kpigrid', label:'KPI-картки (сітка)'},
  {type:'campaignTable', label:'Метрики по кампаніях (таблиця)'},
  {type:'dynamicsTable', label:'Динаміка за 2 періоди (таблиця)'},
  {type:'table', label:'Таблиця (довільна)'},
  {type:'bullets', label:'Список пунктів'},
  {type:'paragraph', label:'Текстовий блок'},
  {type:'closing', label:'Фінальний'}
];
function createBlankSlide(type){
  var t = tr();
  var demoMetrics = t.demoMetricLabels.map(function(l){ return {label:l, value:'0'}; });
  switch(type){
    case 'title': return makeTitleSlide('', t.demoTitle);
    case 'agenda': return makeAgendaSlide(t.demoAgendaItems);
    case 'section': return makeSectionSlide(t.demoSectionTitle, t.demoSectionText);
    case 'metricslist': return makeMetricsListSlide(demoMetrics, t.generalMetrics, '');
    case 'kpigrid': return makeKpiGridSlide(demoMetrics, t.demoKpiTitle);
    case 'campaignTable': return makeCampaignTableSlide(demoMetrics, t.campaignMetrics);
    case 'dynamicsTable': return makeDynamicsTableSlide(demoMetrics, t.dynamics);
    case 'bullets': return makeBulletSlide(t.demoBulletTitle, t.demoBulletItems);
    case 'paragraph': return makeParagraphSlide(t.demoParagraphTitle, [t.demoParagraphText]);
    case 'table': return makeTableSlide(t.demoTableTitle);
    case 'closing': return makeClosingSlide();
  }
}
function buildAddDropdown(){
  var dd = document.getElementById('addDropdown');
  dd.innerHTML = '';
  ADD_TYPES.forEach(function(t){
    var b = document.createElement('button');
    b.textContent = t.label;
    b.addEventListener('click', function(){
      var domEl = createBlankSlide(t.type);
      var atIndex = null;
      if(activeId){
        var idx = slides.findIndex(function(x){ return x.id===activeId; });
        atIndex = idx+1;
      }
      var obj = addSlide(t.type, t.label, domEl, atIndex);
      renderSidebar();
      selectSlide(obj.id);
      dd.classList.remove('open');
    });
    dd.appendChild(b);
  });
}

/* ---------------------------------------------------------- STAGE FIT */
function fitStage(){
  var wrap = document.getElementById('stageWrap');
  var availW = wrap.clientWidth - 48;
  var availH = wrap.clientHeight - 48;
  var scale = Math.min(availW/960, availH/540, 1.4);
  if(scale<=0 || !isFinite(scale)) scale = 1;
  stage.style.transform = 'scale(' + scale + ')';
}

/* ---------------------------------------------------------- PDF EXPORT */
function exportPDF(){
  var btn = document.getElementById('btnExport');
  var visible = slides.filter(function(s){ return s.visible; });
  if(!visible.length){ alert('Немає видимих слайдів для експорту'); return; }
  btn.disabled = true;
  var oldText = btn.textContent;
  btn.textContent = 'Формування PDF…';
  var prevActive = activeId;
  var prevTransform = stage.style.transform;
  stage.style.transform = 'none';
  document.body.classList.add('exporting');

  var fontsReady = (document.fonts && document.fonts.ready) ? document.fonts.ready : Promise.resolve();

  fontsReady.then(function(){
    var jsPDFCtor = jsPDF;
    var pdf = new jsPDFCtor({ orientation:'landscape', unit:'px', format:[960,540], compress:true });
    var i = 0;
    function next(){
      if(i>=visible.length){
        var name = (clientInput.value || 'report').trim().replace(/[^a-zA-Zа-яА-ЯіїєґІЇЄҐ0-9 _-]/g,'') || 'report';
        pdf.save(name + '.pdf');
        document.body.classList.remove('exporting');
        stage.style.transform = prevTransform;
        if(prevActive) selectSlide(prevActive);
        btn.disabled = false;
        btn.textContent = oldText;
        fitStage();
        return;
      }
      stage.innerHTML = '';
      stage.appendChild(visible[i].el);
      setTimeout(function(){
        html2canvas(visible[i].el, { scale:2, backgroundColor:'#ffffff', useCORS:true }).then(function(canvas){
          var img = canvas.toDataURL('image/jpeg', 0.92);
          if(i>0) pdf.addPage([960,540], 'landscape');
          pdf.addImage(img, 'JPEG', 0, 0, 960, 540);
          i++;
          next();
        }).catch(function(err){
          console.error(err);
          alert('Не вдалося сформувати PDF: ' + err.message);
          document.body.classList.remove('exporting');
          stage.style.transform = prevTransform;
          if(prevActive) selectSlide(prevActive);
          btn.disabled = false;
          btn.textContent = oldText;
          fitStage();
        });
      }, 70);
    }
    next();
  });
}

/* ---------------------------------------------------------- WIRE UI */
function closeMobileSidebar(){
  var appEl = document.getElementById('crApp');
  if(appEl) appEl.classList.remove('sidebar-open');
}
function wireUI(){
  document.getElementById('brandMark').innerHTML = LOGO_BADGE_PURPLE;

  /* Mobile off-canvas sidebar: hamburger opens it, tapping the overlay closes it. On
     desktop these elements are CSS-hidden (.mobile-toggle{display:none} outside the
     breakpoint) so this wiring is simply inert there. */
  var btnSidebarToggle = document.getElementById('btnSidebarToggle');
  var sidebarOverlay = document.getElementById('sidebarOverlay');
  var appEl = document.getElementById('crApp');
  /* Every binding below targets a persistent element that lives for the whole
     lifetime of this page (unlike the dropdown/sidebar-row builders above, which
     clear their container's innerHTML before rebuilding, so re-running them is
     naturally safe) — so these use property assignment (.onclick = fn) rather
     than addEventListener. Assignment overwrites the single handler slot instead
     of stacking a second one, which keeps wireUI() safe to call more than once
     (e.g. React StrictMode's dev-only double-invoke of effects). */
  if(btnSidebarToggle && appEl){
    btnSidebarToggle.onclick = function(){ appEl.classList.toggle('sidebar-open'); };
  }
  if(sidebarOverlay){
    sidebarOverlay.onclick = closeMobileSidebar;
  }

  clientInput.oninput = function(){
    state.client = clientInput.value;
    syncBinding('bind-client', state.client, null);
  };
  periodInput.oninput = function(){
    state.period = periodInput.value;
    syncBinding('bind-period', state.period, null);
  };
  reportTypeSelect.onchange = function(){
    var oldType = state.currentType;
    if(oldType) typeDrafts[oldType] = snapshotCurrentDraft();
    var newType = reportTypeSelect.value;
    state.currentType = newType;
    loadDraft(newType);
  };

  stage.oninput = function(e){
    var t = e.target;
    if(!t.classList) return;
    if(t.classList.contains('bind-client')){
      state.client = t.textContent;
      clientInput.value = state.client;
      syncBinding('bind-client', state.client, t);
    }
    if(t.classList.contains('bind-period')){
      state.period = t.textContent;
      periodInput.value = state.period;
      syncBinding('bind-period', state.period, t);
    }
  };

  var csvFile = document.getElementById('csvFile');
  document.getElementById('btnUpload').onclick = function(){ csvFile.click(); };
  csvFile.onchange = function(e){
    var file = e.target.files[0];
    if(!file) return;
    var reader = new FileReader();
    reader.onload = function(ev){
      var text = ev.target.result;
      var parsed = parseReportCSV(text, reportTypeSelect.value);
      if(slides.length && !confirm('Замінити поточні слайди даними з CSV?')) { csvFile.value=''; return; }
      buildDeckFromData(parsed, reportTypeSelect.value);
      csvFile.value = '';
    };
    reader.readAsText(file, 'UTF-8');
  };

  var csvFilePrev = document.getElementById('csvFilePrev');
  prevCsvStatusEl = document.getElementById('prevCsvStatus');
  prevCsvHintDefault = prevCsvStatusEl ? prevCsvStatusEl.textContent : '';
  document.getElementById('btnUploadPrev').onclick = function(){ csvFilePrev.click(); };
  csvFilePrev.onchange = function(e){
    var file = e.target.files[0];
    if(!file) return;
    var reader = new FileReader();
    reader.onload = function(ev){
      var text = ev.target.result;
      var parsedPrev = parseReportCSV(text, reportTypeSelect.value);
      state.previousMetrics = parsedPrev.metrics;
      if(prevCsvStatusEl) prevCsvStatusEl.textContent = 'Завантажено: "' + file.name + '" (' + parsedPrev.metrics.length + ' метрик). ' + prevCsvHintDefault;
      if(state.lastParsedData){
        buildDeckFromData(state.lastParsedData, state.lastReportType);
      }
      csvFilePrev.value = '';
    };
    reader.readAsText(file, 'UTF-8');
  };

  csvSectionsEl = document.getElementById('csvSections');
  seoSectionEl = document.getElementById('seoSection');
  seoTextEl = document.getElementById('seoTextArea');

  var seoTxtFile = document.getElementById('seoTxtFile');
  document.getElementById('btnUploadSeoTxt').onclick = function(){ seoTxtFile.click(); };
  seoTxtFile.onchange = function(e){
    var file = e.target.files[0];
    if(!file) return;
    var isHtml = /\.html?$/i.test(file.name);
    var reader = new FileReader();
    reader.onload = function(ev){
      var content = ev.target.result;
      if(isHtml){
        /* .html carries real heading structure, so it builds the deck straight away
           (splitting into one slide per top-level heading) rather than going through
           the plain-text textarea, which can't usefully display raw HTML source. */
        if(slides.length && !confirm('Замінити поточні слайди даними з файлу?')) { seoTxtFile.value=''; return; }
        buildSeoDeckFromHtml(content, reportTypeSelect.value);
      } else {
        seoTextEl.value = content;
      }
      seoTxtFile.value = '';
    };
    reader.readAsText(file, 'UTF-8');
  };
  document.getElementById('btnBuildSeo').onclick = function(){
    var text = seoTextEl.value;
    if(!text || !text.trim()){ alert('Спершу вставте текст або завантажте файл'); return; }
    if(slides.length && !confirm('Замінити поточні слайди даними з тексту?')) return;
    buildSeoDeckFromText(text, reportTypeSelect.value);
  };

  var addBtn = document.getElementById('btnAdd');
  var addDropdown = document.getElementById('addDropdown');
  addBtn.onclick = function(e){
    e.stopPropagation();
    addDropdown.classList.toggle('open');
  };
  document.removeEventListener('click', closeAddDropdown);
  closeAddDropdown = function(){ addDropdown.classList.remove('open'); };
  document.addEventListener('click', closeAddDropdown);

  document.getElementById('btnExport').onclick = exportPDF;

  window.removeEventListener('resize', fitStage);
  window.addEventListener('resize', fitStage);
}

/* ---------------------------------------------------------- INIT */
stage = document.getElementById('stage');
slideListEl = document.getElementById('slideList');
clientInput = document.getElementById('inputClient');
periodInput = document.getElementById('inputPeriod');
reportTypeSelect = document.getElementById('selectType');
crumbEl = document.getElementById('crumb');

buildThemeRow();
applyTheme('purple');
buildTemplateGrid();
applyTemplate('classic');
buildAddDropdown();
wireUI();
initDefaultDeck();
fitStage();

/* Pulls an already-saved project ad-report (Daily/Weekly/Monthly, built in
   the Project Managers Department) straight into this deck — skips CSV/SEO
   parsing entirely, reusing buildDeckFromData with a hand-built `parsed`
   object. `metrics`/`sections` are built by the caller (see ClientsReport.jsx)
   since the Supabase fetch and number formatting belong in React-land, not
   this DOM-wiring engine. Returns false (without changing anything) if the
   user declines to overwrite existing slides. */
if(api){
  api.loadFromProjectReport = function(payload){
    if(slides.length && !confirm('Замінити поточні слайди даними зі звіту?')) return false;
    state.client = payload.clientName || '';
    clientInput.value = state.client;
    var parsed = {
      period: { raw: payload.periodText || '' },
      metrics: payload.metrics || [],
      sections: payload.sections || {},
      lookerLink: ''
    };
    buildDeckFromData(parsed, reportTypeSelect.value);
    return true;
  };
}

return function cleanup() {
  window.removeEventListener('resize', fitStage);
  document.removeEventListener('click', closeAddDropdown);
};
}
