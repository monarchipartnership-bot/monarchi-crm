// Registry of approved page icons (Soft Volume set, one asset per page — see
// Updates/.../icon-policy.md). The same artwork is used in the sidebar, the
// page heading and empty states; only the size changes, so `src` is the
// 96px cut (sidebar/heading) and `srcLarge` the same icon at 192px for
// 56-64px empty states on high-density screens.
import { SI } from '../components/Sidebar/sidebarIcons';
import followupLarge from '../assets/sidebar/followup-lg.webp';
import imageStudioLarge from '../assets/sidebar/image-studio-lg.webp';
import googleAdsSymbol from '../assets/projects/platform-google-ads.png';
import metaAdsSymbol from '../assets/projects/platform-meta-ads.png';

export const PAGE_ICONS = {
  'page.followup': { src: SI.followup, srcLarge: followupLarge },
  'page.image-studio': { src: SI.imageStudio, srcLarge: imageStudioLarge },
  'page.calculator': { src: SI.calculator },
  'page.deal-tasks': { src: SI.dealTasks },
  'page.deals': { src: SI.deals },
  'page.contacts': { src: SI.contacts },
  'page.reports-manager': { src: SI.reportsManager },
  'page.clients-report': { src: SI.clientsReport },
  'page.projects': { src: SI.projects },
  'page.projects-dashboard': { src: SI.projectsDashboard },
  'page.weekly-report': { src: SI.weeklyReport },
  'page.monthly-report': { src: SI.monthlyReport },
  'page.ai-agents': { src: SI.aiAgents },
};

// Shared decorative platform symbols (Soft Volume set, registered by the Projects design kit:
// design-system/platform-icons-v1.json). One asset per platform, reused wherever the decoration
// repeats; the visible label next to it is always live text. Not a replacement of the official logos.
export const PLATFORM_ICONS = {
  'platform.google-ads.soft-volume': { src: googleAdsSymbol, label: 'Google Ads' },
  'platform.meta-ads.soft-volume': { src: metaAdsSymbol, label: 'Meta Ads' },
};
// platform key (project_ad_accounts.platform) / service tag -> symbol id
export const PLATFORM_SYMBOL = { google: 'platform.google-ads.soft-volume', meta: 'platform.meta-ads.soft-volume' };
export const SERVICE_SYMBOL = { 'Google Ads': 'platform.google-ads.soft-volume', 'Meta Ads': 'platform.meta-ads.soft-volume' };
