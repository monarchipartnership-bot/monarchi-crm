import { SI } from './sidebarIcons';

// Sidebar tree. Each department has a label and a flat list of link items.
// `icon` is an image URL (see sidebarIcons.js). `hideLabel` keeps a group's
// heading out of sight (the menu's home entry has none) while the group
// still exists for ordering.
export const DEPTS = {
  home: {
    label: 'Home',
    hideLabel: true,
    items: [
      { key: 'home', name: 'Hub', desc: 'Головна сторінка CRM.', icon: SI.home, type: 'link', to: '/' },
    ],
  },
  sales: {
    label: 'Sales Managers Department',
    items: [
      { key: 'dashboard', name: 'Dashboard', desc: 'Загальна картина по лідах, контрактах і доході: цей тиждень, цей місяць, канали та тренди.', icon: SI.salesDashboard, type: 'link', to: '/reports/dashboard' },
      { key: 'dealTasks', name: 'Задачі', desc: 'Усі задачі та дзвінки з угод в одному місці — статуси, пріоритети, виконавці.', icon: SI.dealTasks, type: 'link', to: '/reports/deal-tasks' },
      { key: 'deals', name: 'Угоди', desc: 'Воронка продажів — угоди по стадіях, сума, менеджер, задачі по угоді.', icon: SI.deals, type: 'link', to: '/reports/deals' },
      { key: 'clientsDirectory', name: 'Контакти', desc: 'Єдина картка на кожного клієнта — платформа, тип, історія згадувань у тижневих звітах.', icon: SI.contacts, type: 'link', to: '/reports/clients-directory' },
      {
        key: 'reportsManager', name: 'Reports Manager', desc: 'Daily, Weekly, Monthly, Annual та Compare — оберіть тип звіту.', icon: SI.reportsManager, type: 'link', to: '/reports/daily',
        // Daily Report doubles as this section's landing page (its own
        // ReportTypeSwitcher lets you jump to Weekly/Monthly/Annual/Compare
        // from there) — the other report pages are sibling routes, not
        // nested under /reports/daily/, so a plain prefix match can't see
        // them — listed explicitly instead.
        activeMatch: ['/reports/daily', '/reports/weekly', '/reports/monthly', '/reports/annual', '/reports/compare'],
      },
    ],
  },
  pm: {
    label: 'Project Managers Department',
    items: [
      { key: 'dashboard', name: 'Dashboard', desc: 'Загальна картина по всіх проєктах: витрати, дохід, ROAS, статуси та тренди.', icon: SI.projectsDashboard, type: 'link', to: '/projects/dashboard' },
      { key: 'projects', name: 'Projects', desc: 'Database of all agency projects, managed by their owners.', icon: SI.projects, type: 'link', to: '/projects' },
      { key: 'clients', name: 'Clients Report', desc: 'Client-facing reporting for PMs.', icon: SI.clientsReport, type: 'link', to: '/clients' },
      // Daily/Weekly/Monthly project reports no longer have their own
      // entries — they're reached from buttons on the Projects page (their
      // /projects/reports/* routes still exist, and light up "Projects" here
      // via the /projects prefix match).
    ],
  },
  automation: {
    label: 'Automation Department',
    items: [
      { key: 'dashboard', name: 'Dashboard', desc: 'Загальна картина по задачах: сьогодні, вчора, тижні та місяці.', icon: SI.automationDashboard, type: 'link', to: '/automation/dashboard' },
      { key: 'constellation', name: 'AI Agents', desc: 'Карта реальних AI-агентів CRM за відділами — від живих (Follow-up Generator) до запланованих.', icon: SI.aiAgents, type: 'link', to: '/tools/constellation-test' },
      // Placeholder page for now. The icon is a stand-in (Image Studio's) —
      // the icon atlas has no SMM glyph yet.
      { key: 'smm', name: "Mon'Archi SMM", desc: 'Внутрішній розділ для роботи з сайтом і соцмережами Monarchi (у розробці).', icon: SI.imageStudio, type: 'link', to: '/automation/smm' },
    ],
  },
  team: {
    label: 'Team',
    items: [
      { key: 'members', name: 'Команда', desc: 'Список учасників команди та їхні профілі.', icon: SI.team, type: 'link', to: '/team/members' },
      { key: 'calendar', name: 'Team Calendar', desc: 'Хто з команди у відпустці чи на лікарняному цього місяця.', icon: SI.teamCalendar, type: 'link', to: '/team/calendar' },
      { key: 'accounts', name: 'Team Accounts', desc: 'Посилання на всі акаунти й платформи команди.', icon: SI.teamAccounts, type: 'link', to: '/team/accounts' },
      { key: 'taskManager', name: 'Task Manager', desc: 'Єдиний внутрішній задачник по всій платформі — відділи, статистика, список/канбан/календар.', icon: SI.taskManager, type: 'link', to: '/tasks' },
    ],
  },
  tools: {
    label: 'Tools',
    items: [
      { key: 'portfolio', name: 'Image Studio', desc: 'Upwork catalog & portfolio image maker.', icon: SI.imageStudio, type: 'link', to: '/tools/image-studio' },
      { key: 'followup', name: 'Follow-up Generator', desc: 'AI-generated personalized follow-up messages for clients.', icon: SI.followup, type: 'link', to: '/tools/followup' },
      { key: 'funnelCalc', name: 'Project Calculator', desc: 'Internal funnel economics calculator for client & project numbers.', icon: SI.calculator, type: 'link', to: '/tools/calculator' },
    ],
  },
};
