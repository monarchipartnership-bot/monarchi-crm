// Sidebar icons — 96px transparent WebP, one per menu item, cut from the
// "Monarchi Hub" icon atlas (Updates/sidebar-design-kit/icons-atlas.png).
// The atlas is NOT on an even 7x3 grid (icons sit off-centre in their cells
// and five touch a cell edge), so a CSS sprite would clip/misalign them —
// each icon was cut along its real outline instead, halo-cleaned and
// optically centred on a square canvas. Displayed at 32px (3x for retina).
import home from '../../assets/sidebar/home.webp';
import salesDashboard from '../../assets/sidebar/sales-dashboard.webp';
import taskManager from '../../assets/sidebar/task-manager.webp';
import reportsManager from '../../assets/sidebar/reports-manager.webp';
import deals from '../../assets/sidebar/deals.webp';
import dealTasks from '../../assets/sidebar/deal-tasks.webp';
import contacts from '../../assets/sidebar/contacts.webp';
import projectsDashboard from '../../assets/sidebar/projects-dashboard.webp';
import projects from '../../assets/sidebar/projects.webp';
import clientsReport from '../../assets/sidebar/clients-report.webp';
import dailyReport from '../../assets/sidebar/daily-report.webp';
import weeklyReport from '../../assets/sidebar/weekly-report.webp';
import monthlyReport from '../../assets/sidebar/monthly-report.webp';
import automationDashboard from '../../assets/sidebar/automation-dashboard.webp';
import aiAgents from '../../assets/sidebar/ai-agents.webp';
import team from '../../assets/sidebar/team.webp';
import teamCalendar from '../../assets/sidebar/team-calendar.webp';
import teamAccounts from '../../assets/sidebar/team-accounts.webp';
import imageStudio from '../../assets/sidebar/image-studio.webp';
import followup from '../../assets/sidebar/followup.webp';
import calculator from '../../assets/sidebar/calculator.webp';

export const SI = {
  home, salesDashboard, taskManager, reportsManager, deals, dealTasks, contacts,
  projectsDashboard, projects, clientsReport, dailyReport, weeklyReport, monthlyReport,
  automationDashboard, aiAgents, team, teamCalendar, teamAccounts, imageStudio, followup, calculator,
};
