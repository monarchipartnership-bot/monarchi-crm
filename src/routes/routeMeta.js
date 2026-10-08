import { SECTION_ICONS } from '../lib/reportIcons';
import { PAGE_ICONS } from '../lib/pageIcons';

// Metadata for every route in the app: page title and short description
// (both shown in TopBar — the description in its "ⓘ" popover), plus a
// breadcrumb trail kept for any future use. `icon` (optional) is shown next
// to the title in TopBar — most routes don't have one yet, TopBar renders
// fine without it.
export const ROUTE_META = {
  '/account': {
    title: 'Мій кабінет',
    desc: "Профіль, заявки на відпустку та черга на затвердження.",
    trail: [{ label: 'Мій кабінет' }],
  },
  '/team/calendar': {
    title: 'Team Calendar',
    desc: 'Хто з команди у відпустці чи на лікарняному цього місяця.',
    trail: [{ label: 'Team' }, { label: 'Team Calendar' }],
  },
  '/team/members': {
    title: 'Команда',
    desc: 'Список учасників команди та їхні профілі.',
    trail: [{ label: 'Team' }, { label: 'Команда' }],
  },
  '/team/accounts': {
    title: 'Team Accounts',
    desc: 'Посилання на всі акаунти й платформи команди.',
    trail: [{ label: 'Team' }, { label: 'Team Accounts' }],
  },
  '/projects/dashboard': {
    title: 'Projects Dashboard',
    desc: 'Загальна картина по всіх проєктах: витрати, дохід, ROAS, статуси та тренди.',
    trail: [{ label: 'Project Managers Department' }, { label: 'Dashboard' }],
  },
  '/projects': {
    title: 'Projects',
    desc: 'База проєктів агенції, керована відповідальними менеджерами.',
    trail: [{ label: 'Project Managers Department' }, { label: 'Projects' }],
  },
  '/clients': {
    title: 'Презентація',
    desc: 'Презентація для клієнта зі збереженого звіту проєкту: редагування слайдів і тексту, готові макети, експорт у PDF і PPTX.',
    trail: [{ label: 'Project Managers Department' }, { label: 'Презентація' }],
    pageIcon: PAGE_ICONS['page.clients-report'].src,
    infoLabel: 'Про розділ',
  },
  '/projects/reports/period': {
    title: 'Показники за період',
    desc: 'Цифри з рекламних кабінетів за будь-який період у вигляді таблиці з експортом.',
    trail: [{ label: 'Project Managers Department' }, { label: 'Показники за період' }],
  },
  '/projects/reports/weekly': {
    title: 'Тижневий звіт',
    desc: 'Тижневий звіт по рекламі для обраного проєкту: цифри з кабінетів, порівняння, текст.',
    trail: [{ label: 'Project Managers Department' }, { label: 'Тижневий звіт' }],
  },
  '/projects/reports/monthly': {
    title: 'Місячний звіт',
    desc: 'Місячний звіт по рекламі для обраного проєкту: цифри з кабінетів, порівняння, текст.',
    trail: [{ label: 'Project Managers Department' }, { label: 'Місячний звіт' }],
  },
  '/reports/dashboard': {
    title: 'Sales Dashboard',
    desc: 'Загальна картина по лідах, контрактах і доході: цей тиждень, цей місяць, канали та тренди.',
    trail: [{ label: 'Sales Managers Department' }, { label: 'Dashboard' }],
  },
  '/reports/hub': {
    title: 'Reports Manager',
    desc: 'Daily, Weekly, Monthly, Annual та Compare — оберіть тип звіту.',
    trail: [{ label: 'Sales Managers Department' }, { label: 'Reports Manager' }],
  },
  '/reports/daily': {
    title: 'Daily Report',
    desc: "Log today's work, clients touched, and tomorrow's plan.",
    trail: [{ label: 'Sales Managers Department' }, { label: 'Reports Manager', to: '/reports/hub' }, { label: 'Daily Report' }],
    pageIcon: PAGE_ICONS['page.reports-manager'].src,
    infoLabel: 'Про розділ',
  },
  '/reports/weekly': {
    title: 'Weekly Report',
    desc: "Build the team's weekly performance report.",
    trail: [{ label: 'Sales Managers Department' }, { label: 'Reports Manager', to: '/reports/hub' }, { label: 'Weekly Report' }],
  },
  '/reports/monthly': {
    title: 'Monthly Report',
    desc: 'Monthly results & summary analytics across all weeks.',
    trail: [{ label: 'Sales Managers Department' }, { label: 'Reports Manager', to: '/reports/hub' }, { label: 'Monthly Report' }],
  },
  '/reports/annual': {
    title: 'Annual Report',
    desc: 'Full-year results & summary analytics across all months.',
    trail: [{ label: 'Sales Managers Department' }, { label: 'Reports Manager', to: '/reports/hub' }, { label: 'Annual Report' }],
  },
  '/reports/compare': {
    title: 'Compare',
    desc: 'Compare saved Weekly or Monthly reports side by side.',
    trail: [{ label: 'Sales Managers Department' }, { label: 'Reports Manager', to: '/reports/hub' }, { label: 'Compare' }],
  },
  '/reports/deal-tasks': {
    title: 'Задачі',
    desc: 'Усі задачі та дзвінки з угод в одному місці — статуси, пріоритети, виконавці.',
    trail: [{ label: 'Sales Managers Department' }, { label: 'Задачі' }],
    pageIcon: PAGE_ICONS['page.deal-tasks'].src,
    infoLabel: 'Про розділ',
  },
  '/reports/deals': {
    title: 'Угоди',
    desc: 'Воронка продажів — угоди по стадіях, сума, менеджер, задачі по угоді.',
    icon: SECTION_ICONS['Клієнти'],
    trail: [{ label: 'Sales Managers Department' }, { label: 'Угоди' }],
    pageIcon: PAGE_ICONS['page.deals'].src,
    infoLabel: 'Про розділ',
  },
  '/reports/clients-directory': {
    title: 'Контакти',
    desc: 'Єдина картка на кожного клієнта — платформа, тип, історія згадувань у тижневих звітах.',
    trail: [{ label: 'Sales Managers Department' }, { label: 'Контакти' }],
    pageIcon: PAGE_ICONS['page.contacts'].src,
    infoLabel: 'Про розділ',
  },
  '/tools/image-studio': {
    title: 'Image Studio',
    desc: 'Upwork catalog & portfolio image maker.',
    trail: [{ label: 'Tools' }, { label: 'Image Studio' }],
    pageIcon: PAGE_ICONS['page.image-studio'].src,
    infoLabel: 'Про розділ',
  },
  '/tools/followup': {
    title: 'Follow-up Generator',
    desc: 'AI-generated personalized follow-up messages for clients.',
    trail: [{ label: 'Tools' }, { label: 'Follow-up Generator' }],
    // Approved page icon next to the title and a labelled "Про розділ"
    // button (opt-in per route — see TopBar.jsx; other routes unchanged).
    pageIcon: PAGE_ICONS['page.followup'].src,
    infoLabel: 'Про розділ',
  },
  '/tools/calculator': {
    title: 'Project Calculator',
    desc: 'Internal funnel economics calculator for client & project numbers.',
    trail: [{ label: 'Tools' }, { label: 'Project Calculator' }],
    pageIcon: PAGE_ICONS['page.calculator'].src,
    infoLabel: 'Про розділ',
  },
  '/automation/dashboard': {
    title: 'Automation Dashboard',
    desc: 'Загальна картина по задачах: сьогодні, вчора, тижні та місяці.',
    trail: [{ label: 'Automation Department' }, { label: 'Dashboard' }],
  },
  '/automation/smm': {
    title: "Mon'Archi SMM",
    desc: 'Внутрішній розділ для роботи з сайтом і соцмережами Monarchi (у розробці).',
    trail: [{ label: 'Automation Department' }, { label: "Mon'Archi SMM" }],
  },
  '/tasks': {
    title: 'Task Manager',
    desc: 'Єдиний внутрішній задачник по всій платформі — відділи, статистика, список/канбан/календар.',
    trail: [{ label: 'Task Manager' }],
  },
  '/tasks/analytics': {
    title: 'Аналітика задач',
    desc: 'Детальний огляд ефективності по відділах і виконавцях.',
    trail: [{ label: 'Task Manager', to: '/tasks' }, { label: 'Аналітика' }],
  },
};

// ROUTE_META is a flat exact-pathname lookup, which can't match a dynamic
// segment like a project id. Breadcrumbs falls back to the first entry here
// whose `test` passes. Kept generic ("Project", not the live project name —
// the page's own header already shows the name) rather than plumbing live
// data into the breadcrumb trail.
export const DYNAMIC_ROUTE_META = [
  {
    // A contact's own card is still the «Контакти» section (it used to fall back to "Monarchi CRM").
    test: (pathname) => /^\/reports\/clients-directory\/[^/]+$/.test(pathname),
    title: 'Контакти',
    desc: 'Єдина картка на кожного клієнта — платформа, тип, історія згадувань у тижневих звітах.',
    trail: [{ label: 'Sales Managers Department' }, { label: 'Контакти', to: '/reports/clients-directory' }],
    pageIcon: PAGE_ICONS['page.contacts'].src,
    infoLabel: 'Про розділ',
  },
  {
    test: (pathname) => /^\/projects\/[^/]+$/.test(pathname),
    trail: [{ label: 'Project Managers Department' }, { label: 'Projects' }, { label: 'Project' }],
  },
  {
    test: (pathname) => /^\/team\/members\/[^/]+$/.test(pathname),
    trail: [{ label: 'Team' }, { label: 'Команда', to: '/team/members' }, { label: 'Профіль' }],
  },
];
