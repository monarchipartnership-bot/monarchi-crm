import GreetingBanner from '../../components/Home/GreetingBanner';
import TodayImportant from '../../components/Home/TodayImportant';
import SalesFunnelCard from '../../components/Home/SalesFunnelCard';
import ProjectHealthCard from '../../components/Home/ProjectHealthCard';
import TeamTodayCard from '../../components/Home/TeamTodayCard';
import OverdueReportsCard from '../../components/Home/OverdueReportsCard';
import UrgentTasksCard from '../../components/Home/UrgentTasksCard';
import MeetingsSoonCard from '../../components/Home/MeetingsSoonCard';
import AiToolsCard from '../../components/Home/AiToolsCard';
import ActivityFeedCard from '../../components/Home/ActivityFeedCard';
import '../../styles/reportPage.css';
import '../../styles/comparePage.css';
import '../../styles/automationDashboard.css';
import '../../styles/homeDashboard.css';

// data-transition-fragment marks the blocks the CRM->AI transition uses as
// visual "sources" for its particle fragments (see FragmentCanvas.jsx) —
// just a hook for that overlay to read via getBoundingClientRect(), no
// effect on layout/behavior. Tagged directly on GreetingBanner/TodayImportant/
// ActivityFeedCard's own existing wrapper (`display:flex` on the tag,
// matching what .home-page's column stretch already expects from a direct
// child) and on the two .pulse-row containers themselves, rather than
// wrapping each individual card — .pulse-row--3/--4's `> *` sizing rule
// only reaches direct children, so wrapping the cards one-by-one would've
// silently broken their equal-height stretch.
export default function Home() {
  return (
    <div className="home-page">
      <div data-transition-fragment="greeting" style={{ display: 'flex' }}><GreetingBanner /></div>
      <div data-transition-fragment="today" style={{ display: 'flex' }}><TodayImportant /></div>

      <div className="pulse-row pulse-row--3" data-transition-fragment="pulse-row-3">
        <SalesFunnelCard />
        <ProjectHealthCard />
        <TeamTodayCard />
      </div>

      <div className="pulse-row pulse-row--4" data-transition-fragment="pulse-row-4">
        <OverdueReportsCard />
        <UrgentTasksCard />
        <MeetingsSoonCard />
        <AiToolsCard />
      </div>

      <div data-transition-fragment="activity-feed" style={{ display: 'flex' }}><ActivityFeedCard /></div>
    </div>
  );
}
