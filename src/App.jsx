import { Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { CrmToAiTransitionProvider, useCrmToAiTransition } from './contexts/CrmToAiTransitionContext';
import TransitionPortal from './components/CrmToAiTransition/TransitionPortal';
import TransitionDebugHud from './components/CrmToAiTransition/TransitionDebugHud';
import Login from './pages/Login/Login';
import SetPassword from './pages/Login/SetPassword';
import Layout from './components/Layout/Layout';
import Home from './pages/Home/Home';
import ReportsDashboard from './pages/Reports/Dashboard';
import DailyCreate from './pages/Reports/Daily/DailyCreate';
import WeeklyCreate from './pages/Reports/Weekly/WeeklyCreate';
import MonthlyCreate from './pages/Reports/Monthly/MonthlyCreate';
import AnnualCreate from './pages/Reports/Annual/AnnualCreate';
import ReportsCompare from './pages/Reports/Compare';
import ClientsDirectory from './pages/Reports/ClientsDirectory';
import ClientProfile from './pages/Reports/ClientProfile';
import TaskManagerPage from './pages/TaskManager/TaskManagerPage';
import TaskAnalyticsPage from './pages/TaskManager/TaskAnalyticsPage';
import DealsBoard from './pages/Reports/Deals/DealsBoard';
import DealTasksPage from './pages/Reports/Deals/DealTasksPage';
import Projects from './pages/Projects/Projects';
import ProjectsDashboard from './pages/Projects/Dashboard';
import ProjectDetail from './pages/Projects/ProjectDetail';
import AdReportPage from './pages/Projects/Reports/AdReportPage';
import TeamCalendar from './pages/Team/TeamCalendar';
import TeamAccounts from './pages/Team/TeamAccounts';
import TeamMembers from './pages/Team/TeamMembers';
import TeamMemberProfile from './pages/Team/TeamMemberProfile';
import Account from './pages/Account/Account';
import Calculator from './pages/Tools/Calculator';
import ImageStudio from './pages/Tools/ImageStudio';
import FollowupGenerator from './pages/Tools/FollowupGenerator';
import ConstellationTest from './pages/Tools/ConstellationTest';
import ClientsReport from './pages/ClientsReport/ClientsReport';
import AutomationDashboard from './pages/Automation/Dashboard';
import './styles/pages.css';

function AuthGate() {
  const { session, loading, passwordSet, profileLoading } = useAuth();

  if (loading || (session && profileLoading)) {
    return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted)' }}>Завантаження…</div>;
  }

  if (!session) return <Login />;

  // First login ever (or any account that predates this gate) — must set a
  // password before reaching the rest of the app. See SetPassword.jsx.
  if (!passwordSet) return <SetPassword />;

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Home />} />
        <Route path="/reports/dashboard" element={<ReportsDashboard />} />
        <Route path="/reports/hub" element={<Navigate to="/reports/daily" replace />} />
        <Route path="/reports/daily" element={<DailyCreate />} />
        <Route path="/reports/weekly" element={<WeeklyCreate />} />
        <Route path="/reports/monthly" element={<MonthlyCreate />} />
        <Route path="/reports/annual" element={<AnnualCreate />} />
        <Route path="/reports/compare" element={<ReportsCompare />} />
        <Route path="/reports/clients-directory" element={<ClientsDirectory />} />
        <Route path="/reports/clients-directory/:id" element={<ClientProfile />} />
        <Route path="/reports/deals" element={<DealsBoard />} />
        <Route path="/reports/deal-tasks" element={<DealTasksPage />} />
        <Route path="/projects" element={<Projects />} />
        <Route path="/projects/dashboard" element={<ProjectsDashboard />} />
        <Route path="/projects/reports/daily" element={<AdReportPage periodType="daily" />} />
        <Route path="/projects/reports/weekly" element={<AdReportPage periodType="weekly" />} />
        <Route path="/projects/reports/monthly" element={<AdReportPage periodType="monthly" />} />
        <Route path="/projects/:id" element={<ProjectDetail />} />
        <Route path="/team/calendar" element={<TeamCalendar />} />
        <Route path="/team/accounts" element={<TeamAccounts />} />
        <Route path="/team/members" element={<TeamMembers />} />
        <Route path="/team/members/:email" element={<TeamMemberProfile />} />
        <Route path="/account" element={<Account />} />
        <Route path="/tools/calculator" element={<Calculator />} />
        <Route path="/tools/image-studio" element={<ImageStudio />} />
        <Route path="/tools/followup" element={<FollowupGenerator />} />
        <Route path="/tools/constellation-test" element={<ConstellationTest />} />
        <Route path="/clients" element={<ClientsReport />} />
        <Route path="/automation/dashboard" element={<AutomationDashboard />} />
        <Route path="/tasks" element={<TaskManagerPage />} />
        <Route path="/tasks/analytics" element={<TaskAnalyticsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

// The transition overlay's own persistence — CrmToAiTransitionProvider
// wraps AuthGate (not just its <Routes>), so the overlay survives ANY
// state change below it: a route swap between two CRM/AI pages, but also
// an auth hiccup that would otherwise swap AuthGate's own branch to the
// loading screen or <Login/> mid-transition and unmount everything under
// it. TransitionPortal is rendered as AuthGate's sibling here, inside the
// same provider, so it's never a descendant of anything that could unmount
// out from under it.
function TransitionPortalGate() {
  const { mode } = useCrmToAiTransition();
  return mode !== 'idle' ? <TransitionPortal /> : null;
}

export default function App() {
  return (
    <AuthProvider>
      <CrmToAiTransitionProvider>
        <AuthGate />
        <TransitionPortalGate />
        <TransitionDebugHud />
      </CrmToAiTransitionProvider>
    </AuthProvider>
  );
}
