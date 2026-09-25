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

export default function Home() {
  return (
    <div className="home-page">
      <GreetingBanner />
      <TodayImportant />

      <div className="pulse-row pulse-row--3">
        <SalesFunnelCard />
        <ProjectHealthCard />
        <TeamTodayCard />
      </div>

      <div className="pulse-row pulse-row--4">
        <OverdueReportsCard />
        <UrgentTasksCard />
        <MeetingsSoonCard />
        <AiToolsCard />
      </div>

      <ActivityFeedCard />
    </div>
  );
}
