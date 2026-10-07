// Visual assets of the AI Agents section (approved "update ai agents" kit).
//   nebula / core   decorative background layers (never functional UI)
//   page icon       the approved page.ai-agents symbol, same one as the sidebar
//   department icons  department-icon-registry.json: eight departments reuse
//                   the approved Soft Volume atlas (via the shared sidebar
//                   cuts) and two NEW symbols (quality shield, advertising
//                   target) cut once from department-icons-v1.png. Never
//                   redraw these — render them through DepartmentIcon.
import { SI } from '../components/Sidebar/sidebarIcons';
import nebula from '../assets/ai/nebula-background.webp';
import core from '../assets/ai/energy-core.webp';
import departmentQuality from '../assets/ai/department-quality.webp';
import departmentAdvertising from '../assets/ai/department-advertising.webp';

export const AI_ASSETS = { nebula, core };
export const AI_PAGE_ICON = SI.aiAgents;

// Keyed by AGENT_DEPTS key (data/aiAgentsData.js) -> registry symbol.
export const DEPARTMENT_ICONS = {
  management: SI.team, // orchestration -> page.team
  sales: SI.salesDashboard, // page.sales-dashboard
  'client-success': SI.team, // account -> page.team
  'strategy-research': SI.clientsReport, // page.clients-report
  'performance-delivery': departmentAdvertising, // department.advertising (new)
  'performance-creative': SI.imageStudio, // page.image-studio
  'data-tracking-reporting': SI.salesDashboard, // page.sales-dashboard
  'quality-control': departmentQuality, // department.quality (new)
};
