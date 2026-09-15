import { Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
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
import ReportsHub from './pages/Reports/ReportsHub';
import ClientsDirectory from './pages/Reports/ClientsDirectory';
import ClientProfile from './pages/Reports/ClientProfile';
import TasksHub from './pages/Reports/Tasks/TasksHub';
import SalesDailyTasks from './pages/Reports/Tasks/SalesDailyTasks';
import SalesWeeklyTasks from './pages/Reports/Tasks/SalesWeeklyTasks';
import SalesMonthlyTasks from './pages/Reports/Tasks/SalesMonthlyTasks';
import DealsBoard from './pages/Reports/Deals/DealsBoard';
import Projects from './pages/Projects/Projects';
import ProjectsDashboard from './pages/Projects/Dashboard';
import ProjectDetail from './pages/Projects/ProjectDetail';
import AdReportPage from './pages/Projects/Reports/AdReportPage';
import TeamCalendar from './pages/Team/TeamCalendar';
import TeamAccounts from './pages/Team/TeamAccounts';
import Account from './pages/Account/Account';
import Calculator from './pages/Tools/Calculator';
import ImageStudio from './pages/Tools/ImageStudio';
import FollowupGenerator from './pages/Tools/FollowupGenerator';
import ConstellationTest from './pages/Tools/ConstellationTest';
import ClientsReport from './pages/ClientsReport/ClientsReport';
import DailyTasks from './pages/Automation/Tasks/DailyTasks';
import WeeklyTasks from './pages/Automation/Tasks/WeeklyTasks';
import MonthlyTasks from './pages/Automation/Tasks/MonthlyTasks';
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
        <Route path="/reports/hub" element={<ReportsHub />} />
        <Route path="/reports/daily" element={<DailyCreate />} />
        <Route path="/reports/weekly" element={<WeeklyCreate />} />
        <Route path="/reports/monthly" element={<MonthlyCreate />} />
        <Route path="/reports/annual" element={<AnnualCreate />} />
        <Route path="/reports/compare" element={<ReportsCompare />} />
        <Route path="/reports/clients-directory" element={<ClientsDirectory />} />
        <Route path="/reports/clients-directory/:id" element={<ClientProfile />} />
        <Route path="/reports/tasks" element={<TasksHub />} />
        <Route path="/reports/tasks/daily" element={<SalesDailyTasks />} />
        <Route path="/reports/tasks/weekly" element={<SalesWeeklyTasks />} />
        <Route path="/reports/tasks/monthly" element={<SalesMonthlyTasks />} />
        <Route path="/reports/deals" element={<DealsBoard />} />
        <Route path="/projects" element={<Projects />} />
        <Route path="/projects/dashboard" element={<ProjectsDashboard />} />
        <Route path="/projects/reports/daily" element={<AdReportPage periodType="daily" />} />
        <Route path="/projects/reports/weekly" element={<AdReportPage periodType="weekly" />} />
        <Route path="/projects/reports/monthly" element={<AdReportPage periodType="monthly" />} />
        <Route path="/projects/:id" element={<ProjectDetail />} />
        <Route path="/team/calendar" element={<TeamCalendar />} />
        <Route path="/team/accounts" element={<TeamAccounts />} />
        <Route path="/account" element={<Account />} />
        <Route path="/tools/calculator" element={<Calculator />} />
        <Route path="/tools/image-studio" element={<ImageStudio />} />
        <Route path="/tools/followup" element={<FollowupGenerator />} />
        <Route path="/tools/constellation-test" element={<ConstellationTest />} />
        <Route path="/clients" element={<ClientsReport />} />
        <Route path="/automation/dashboard" element={<AutomationDashboard />} />
        <Route path="/automation/tasks/daily" element={<DailyTasks />} />
        <Route path="/automation/tasks/weekly" element={<WeeklyTasks />} />
        <Route path="/automation/tasks/monthly" element={<MonthlyTasks />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AuthGate />
    </AuthProvider>
  );
}
