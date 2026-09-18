import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchTasksForDay } from '../../lib/api/tasks';
import { fetchDepartmentIdByName } from '../../lib/api/departments';
import { fetchReportByDate } from '../../lib/api/dailyReports';
import { fetchProjects } from '../../lib/api/projects';
import { fetchAllDailyReportsForDate } from '../../lib/api/projectReports';
import { fetchPendingQueue } from '../../lib/api/profile';
import { todayIso, addDaysIso } from '../../lib/dateHelpers';
import { deriveTaskStatus } from '../../lib/taskStatus';

function ymd(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return { y, m, d };
}

function dowOf(iso) {
  const { y, m, d } = ymd(iso);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

// Same "most recent working day" rule as OpsDashboard — Monday's overdue
// check looks at last Friday, not Sunday.
function lastBusinessDayIso(todayI) {
  const dow = dowOf(todayI);
  const back = dow === 0 ? 2 : dow === 1 ? 3 : 1;
  return addDaysIso(todayI, -back);
}

async function safe(promise, fallback) {
  try {
    return await promise;
  } catch {
    return fallback;
  }
}

function StatCard({ icon, tone, count, label, to }) {
  return (
    <div className="ti-card">
      <span className={`ti-card__icon ti-card__icon--${tone}`}>{icon}</span>
      <div className="ti-card__body">
        <div className="ti-card__top">
          <span className="ti-card__count">{count}</span>
          <span className="ti-card__label">{label}</span>
        </div>
        <Link to={to} className="ti-card__link">Переглянути &rarr;</Link>
      </div>
    </div>
  );
}

function SoonCard({ icon, tone, label }) {
  return (
    <div className="ti-card ti-card--soon">
      <span className={`ti-card__icon ti-card__icon--${tone}`}>{icon}</span>
      <div className="ti-card__body">
        <div className="ti-card__top">
          <span className="ti-card__label">{label}</span>
        </div>
        <span className="ti-card__soon">Скоро</span>
      </div>
    </div>
  );
}

export default function TodayImportant() {
  const [counts, setCounts] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const todayI = todayIso();
      const bizYesterdayI = lastBusinessDayIso(todayI);
      const { y, m, d } = ymd(bizYesterdayI);

      const automationDeptId = await safe(fetchDepartmentIdByName('Відділ автоматизації'), null);
      const [salesYesterday, projects, pmYesterday, tasksToday, pendingQueue] = await Promise.all([
        safe(fetchReportByDate(y, m, d), null),
        safe(fetchProjects(), []),
        safe(fetchAllDailyReportsForDate(bizYesterdayI), []),
        safe(fetchTasksForDay(todayI, automationDeptId), []),
        safe(fetchPendingQueue(), []),
      ]);
      if (cancelled) return;

      const activeProjects = projects.filter((p) => p.status === 'active');
      const reportedIds = new Set(pmYesterday.map((r) => r.project_id));
      const overdueReports = (salesYesterday ? 0 : 1) + activeProjects.filter((p) => !reportedIds.has(p.id)).length;
      const urgentTasks = tasksToday.filter((t) => deriveTaskStatus(t) === 'pending').length;

      setCounts({ overdueReports, urgentTasks, pendingApprovals: pendingQueue.length });
    }

    load();
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="sec ti-sec">
      <div className="sec-label">&#9889; Що важливо сьогодні<span className="ln" /></div>
      <div className="ti-row">
        <StatCard icon="&#9200;" tone="danger" count={counts ? counts.overdueReports : '–'} label="Прострочені звіти" to="/reports/hub" />
        <StatCard icon="&#9989;" tone="ok" count={counts ? counts.urgentTasks : '–'} label="Термінові задачі" to="/tasks" />
        <SoonCard icon="&#128197;" tone="info" label="Зустрічі сьогодні" />
        <StatCard icon="&#128203;" tone="warn" count={counts ? counts.pendingApprovals : '–'} label="Очікують погодження" to="/account" />
        <Link to="#" className="ti-ai-btn" onClick={(e) => e.preventDefault()}>
          <span>&#10024; Запланувати день<br />з AI-помічником</span>
          <span className="ti-ai-btn__soon">Скоро</span>
        </Link>
      </div>
    </div>
  );
}
