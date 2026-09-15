import DailyTasks from '../../Automation/Tasks/DailyTasks';

// Same DailyTasks page, scoped to department='sales' — one shared tasks
// engine reused across departments rather than a parallel Sales-only copy.
export default function SalesDailyTasks() {
  return <DailyTasks department="sales" />;
}
