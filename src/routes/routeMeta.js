import { SECTION_ICONS } from '../lib/reportIcons';

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
    title: 'Clients Report',
    desc: 'Клієнтський звіт для проєктних менеджерів.',
    trail: [{ label: 'Project Managers Department' }, { label: 'Clients Report' }],
  },
  '/projects/reports/daily': {
    title: 'Project Daily Report',
    desc: 'Щоденний звіт по рекламі для обраного проєкту.',
    trail: [{ label: 'Project Managers Department' }, { label: 'Daily Report' }],
  },
  '/projects/reports/weekly': {
    title: 'Project Weekly Report',
    desc: 'Тижневий звіт по рекламі для обраного проєкту.',
    trail: [{ label: 'Project Managers Department' }, { label: 'Weekly Report' }],
  },
  '/projects/reports/monthly': {
    title: 'Project Monthly Report',
    desc: 'Місячний звіт по рекламі для обраного проєкту.',
    trail: [{ label: 'Project Managers Department' }, { label: 'Monthly Report' }],
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
  '/reports/tasks': {
    title: 'Task Manager',
    desc: 'Daily, Weekly, Monthly — оберіть рівень планування задач.',
    trail: [{ label: 'Sales Managers Department' }, { label: 'Task Manager' }],
  },
  '/reports/tasks/daily': {
    title: 'Daily Tasks',
    desc: 'Задачі лідогенератора на конкретний день.',
    trail: [{ label: 'Sales Managers Department' }, { label: 'Task Manager', to: '/reports/tasks' }, { label: 'Daily Tasks' }],
  },
  '/reports/tasks/weekly': {
    title: 'Weekly Tasks',
    desc: 'Тижневе планування задач лідогенератора.',
    trail: [{ label: 'Sales Managers Department' }, { label: 'Task Manager', to: '/reports/tasks' }, { label: 'Weekly Tasks' }],
  },
  '/reports/tasks/monthly': {
    title: 'Monthly Tasks',
    desc: 'Зведення всіх задач лідогенератора за місяць.',
    trail: [{ label: 'Sales Managers Department' }, { label: 'Task Manager', to: '/reports/tasks' }, { label: 'Monthly Tasks' }],
  },
  '/reports/deals': {
    title: 'Угоди',
    desc: 'Воронка продажів — угоди по стадіях, сума, менеджер, задачі по угоді.',
    icon: SECTION_ICONS['Клієнти'],
    trail: [{ label: 'Sales Managers Department' }, { label: 'Угоди' }],
  },
  '/reports/clients-directory': {
    title: 'База клієнтів',
    desc: 'Єдина картка на кожного клієнта — платформа, тип, історія згадувань у тижневих звітах.',
    trail: [{ label: 'Sales Managers Department' }, { label: 'База клієнтів' }],
  },
  '/tools/image-studio': {
    title: 'Image Studio',
    desc: 'Upwork catalog & portfolio image maker.',
    trail: [{ label: 'Tools' }, { label: 'Image Studio' }],
  },
  '/tools/followup': {
    title: 'Follow-up Generator',
    desc: 'AI-generated personalized follow-up messages for clients.',
    trail: [{ label: 'Tools' }, { label: 'Follow-up Generator' }],
  },
  '/tools/calculator': {
    title: 'Project Calculator',
    desc: 'Internal funnel economics calculator for client & project numbers.',
    trail: [{ label: 'Tools' }, { label: 'Project Calculator' }],
  },
  '/automation/dashboard': {
    title: 'Automation Dashboard',
    desc: 'Загальна картина по задачах: сьогодні, вчора, тижні та місяці.',
    trail: [{ label: 'Automation Department' }, { label: 'Dashboard' }],
  },
  '/automation/tasks/daily': {
    title: 'Daily Tasks',
    desc: 'Задачі на конкретний день — виконання, перенесення, додавання.',
    trail: [{ label: 'Automation Department' }, { label: 'Daily Tasks' }],
  },
  '/automation/tasks/weekly': {
    title: 'Weekly Tasks',
    desc: 'Розподіл задач на тиждень по днях і підсумок виконання.',
    trail: [{ label: 'Automation Department' }, { label: 'Weekly Tasks' }],
  },
  '/automation/tasks/monthly': {
    title: 'Monthly Tasks',
    desc: 'Сукупність усіх задач, запланованих за місяць.',
    trail: [{ label: 'Automation Department' }, { label: 'Monthly Tasks' }],
  },
};

// ROUTE_META is a flat exact-pathname lookup, which can't match a dynamic
// segment like a project id. Breadcrumbs falls back to the first entry here
// whose `test` passes. Kept generic ("Project", not the live project name —
// the page's own header already shows the name) rather than plumbing live
// data into the breadcrumb trail.
export const DYNAMIC_ROUTE_META = [
  {
    test: (pathname) => /^\/projects\/[^/]+$/.test(pathname),
    trail: [{ label: 'Project Managers Department' }, { label: 'Projects' }, { label: 'Project' }],
  },
];
