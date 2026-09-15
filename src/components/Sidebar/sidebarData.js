import { IC } from './icons';

// Sidebar tree. Each department has a label and a flat list of link items.
export const DEPTS = {
  sales: {
    label: 'Sales Managers Department',
    icon: IC.deptSales,
    items: [
      { key: 'dashboard', name: 'Dashboard', desc: 'Загальна картина по лідах, контрактах і доході: цей тиждень, цей місяць, канали та тренди.', icon: IC.dashboard, type: 'link', to: '/reports/dashboard' },
      { key: 'taskManager', name: 'Task Manager', desc: 'Daily, Weekly, Monthly — оберіть рівень планування задач.', icon: IC.salesTasks, type: 'link', to: '/reports/tasks' },
      {
        key: 'reportsManager', name: 'Reports Manager', desc: 'Daily, Weekly, Monthly, Annual та Compare — оберіть тип звіту.', icon: IC.reports, type: 'link', to: '/reports/hub',
        // The actual report pages live at sibling routes (/reports/daily etc.),
        // not nested under /reports/hub/, so the sidebar's default prefix-match
        // active-highlighting can't see them — listed explicitly instead.
        activeMatch: ['/reports/daily', '/reports/weekly', '/reports/monthly', '/reports/annual', '/reports/compare'],
      },
      { key: 'deals', name: 'Угоди', desc: 'Воронка продажів — угоди по стадіях, сума, менеджер, задачі по угоді.', icon: IC.deals, type: 'link', to: '/reports/deals' },
      { key: 'clientsDirectory', name: 'База клієнтів', desc: 'Єдина картка на кожного клієнта — платформа, тип, історія згадувань у тижневих звітах.', icon: IC.clients, type: 'link', to: '/reports/clients-directory' },
    ],
  },
  pm: {
    label: 'Project Managers Department',
    icon: IC.deptPM,
    items: [
      { key: 'dashboard', name: 'Dashboard', desc: 'Загальна картина по всіх проєктах: витрати, дохід, ROAS, статуси та тренди.', icon: IC.dashboard, type: 'link', to: '/projects/dashboard' },
      { key: 'projects', name: 'Projects', desc: 'Database of all agency projects, managed by their owners.', icon: IC.reports, type: 'link', to: '/projects' },
      { key: 'clients', name: 'Clients Report', desc: 'Client-facing reporting for PMs.', icon: IC.clientsReport, type: 'link', to: '/clients' },
      { key: 'projDailyReport', name: 'Daily Report', desc: 'Щоденний звіт по рекламі для обраного проєкту.', icon: IC.daily, type: 'link', to: '/projects/reports/daily' },
      { key: 'projWeeklyReport', name: 'Weekly Report', desc: 'Тижневий звіт по рекламі для обраного проєкту.', icon: IC.week, type: 'link', to: '/projects/reports/weekly' },
      { key: 'projMonthlyReport', name: 'Monthly Report', desc: 'Місячний звіт по рекламі для обраного проєкту.', icon: IC.month, type: 'link', to: '/projects/reports/monthly' },
    ],
  },
  automation: {
    label: 'Automation Department',
    icon: IC.deptAutomation,
    items: [
      { key: 'dashboard', name: 'Dashboard', desc: 'Загальна картина по задачах: сьогодні, вчора, тижні та місяці.', icon: IC.dashboard, type: 'link', to: '/automation/dashboard' },
      { key: 'tasksDaily', name: 'Daily Tasks', desc: 'Задачі на конкретний день — виконання, перенесення, додавання.', icon: IC.aiDaily, type: 'link', to: '/automation/tasks/daily' },
      { key: 'tasksWeekly', name: 'Weekly Tasks', desc: 'Розподіл задач на тиждень по днях і підсумок виконання.', icon: IC.aiWeek, type: 'link', to: '/automation/tasks/weekly' },
      { key: 'tasksMonthly', name: 'Monthly Tasks', desc: 'Сукупність усіх задач, запланованих за місяць.', icon: IC.aiMonth, type: 'link', to: '/automation/tasks/monthly' },
    ],
  },
  team: {
    label: 'Team',
    icon: IC.clients,
    items: [
      { key: 'calendar', name: 'Team Calendar', desc: 'Хто з команди у відпустці чи на лікарняному цього місяця.', icon: IC.teamCalendar, type: 'link', to: '/team/calendar' },
      { key: 'accounts', name: 'Team Accounts', desc: 'Посилання на всі акаунти й платформи команди.', icon: IC.deptTools, type: 'link', to: '/team/accounts' },
    ],
  },
  tools: {
    label: 'Tools',
    icon: IC.deptTools,
    items: [
      { key: 'portfolio', name: 'Image Studio', desc: 'Upwork catalog & portfolio image maker.', icon: IC.portfolio, type: 'link', to: '/tools/image-studio' },
      { key: 'followup', name: 'Follow-up Generator', desc: 'AI-generated personalized follow-up messages for clients.', icon: IC.followup, type: 'link', to: '/tools/followup' },
      { key: 'funnelCalc', name: 'Project Calculator', desc: 'Internal funnel economics calculator for client & project numbers.', icon: IC.calculator, type: 'link', to: '/tools/calculator' },
    ],
  },
};
