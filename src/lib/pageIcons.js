// Registry of approved page icons (Soft Volume set, one asset per page — see
// Updates/.../icon-policy.md). The same artwork is used in the sidebar, the
// page heading and empty states; only the size changes, so `src` is the
// 96px cut (sidebar/heading) and `srcLarge` the same icon at 192px for
// 56-64px empty states on high-density screens.
import { SI } from '../components/Sidebar/sidebarIcons';
import followupLarge from '../assets/sidebar/followup-lg.webp';
import imageStudioLarge from '../assets/sidebar/image-studio-lg.webp';

export const PAGE_ICONS = {
  'page.followup': { src: SI.followup, srcLarge: followupLarge },
  'page.image-studio': { src: SI.imageStudio, srcLarge: imageStudioLarge },
  'page.calculator': { src: SI.calculator },
  'page.deal-tasks': { src: SI.dealTasks },
  'page.deals': { src: SI.deals },
  'page.contacts': { src: SI.contacts },
  'page.reports-manager': { src: SI.reportsManager },
  'page.clients-report': { src: SI.clientsReport },
};
