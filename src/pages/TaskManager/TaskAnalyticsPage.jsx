import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchDepartments } from '../../lib/api/departments';
import { fetchTaskStages } from '../../lib/api/taskStages';
import { fetchTasksForDepartment } from '../../lib/api/tasks';
import { todayIso, addDaysIso } from '../../lib/dateHelpers';
import '../../styles/reportPage.css';
import '../../styles/automationDashboard.css';
import '../../styles/comparePage.css';
import '../../styles/taskManagerPage.css';

const PERIODS = [
  { key: 'today', label: 'Сьогодні' },
  { key: 'week', label: 'Тиждень' },
  { key: 'month', label: 'Місяць' },
  { key: 'all', label: 'Весь час' },
];

const BACK_ICON = '<svg viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6"/></svg>';

// Analytics page behind Task Manager's "Детальний огляд" — this is where
// Weekly/Monthly "live" now, as a period switcher (Сьогодні/Тиждень/
// Місяць/Весь час) rather than separate report pages.
export default function TaskAnalyticsPage() {
  const [departments, setDepartments] = useState([]);
  const [stages, setStages] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState('week');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchDepartments().then(async (depts) => {
      if (cancelled) return;
      setDepartments(depts);
      const [stageLists, t] = await Promise.all([
        Promise.all(depts.map((d) => fetchTaskStages(d.id))),
        fetchTasksForDepartment(null),
      ]);
      if (cancelled) return;
      setStages(stageLists.flat());
      setTasks(t);
    }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const stagesById = useMemo(() => Object.fromEntries(stages.map((s) => [s.id, s])), [stages]);
  const departmentsById = useMemo(() => Object.fromEntries(departments.map((d) => [d.id, d])), [departments]);

  const filtered = useMemo(() => {
    if (period === 'all') return tasks;
    const today = todayIso();
    const from = period === 'today' ? today : period === 'week' ? addDaysIso(today, -6) : `${today.slice(0, 8)}01`;
    return tasks.filter((t) => t.task_date && t.task_date >= from && t.task_date <= today);
  }, [tasks, period]);

  const done = filtered.filter((t) => stagesById[t.stage_id]?.is_done);
  const cancelledList = filtered.filter((t) => stagesById[t.stage_id]?.is_cancelled);
  const overdue = filtered.filter((t) => {
    const stage = stagesById[t.stage_id];
    return stage && !stage.is_done && !stage.is_cancelled && t.task_date && t.task_date < todayIso();
  });
  const doneRate = filtered.length ? Math.round((done.length / filtered.length) * 100) : null;

  const byDepartment = useMemo(() => {
    const map = {};
    filtered.forEach((t) => {
      const key = t.department_id;
      if (!map[key]) map[key] = { id: key, total: 0, done: 0, cancelled: 0 };
      map[key].total += 1;
      const stage = stagesById[t.stage_id];
      if (stage?.is_done) map[key].done += 1;
      if (stage?.is_cancelled) map[key].cancelled += 1;
    });
    return Object.values(map).sort((a, b) => b.total - a.total);
  }, [filtered, stagesById]);

  const byAssignee = useMemo(() => {
    const map = {};
    filtered.forEach((t) => {
      const key = t.assignee_email || 'Без виконавця';
      if (!map[key]) map[key] = { email: key, total: 0, done: 0 };
      map[key].total += 1;
      if (stagesById[t.stage_id]?.is_done) map[key].done += 1;
    });
    return Object.values(map).sort((a, b) => b.total - a.total);
  }, [filtered, stagesById]);

  return (
    <div className="report-page">
      <div className="page-actions">
        <Link className="btn" to="/tasks"><span dangerouslySetInnerHTML={{ __html: BACK_ICON }} /> Task Manager</Link>
      </div>

      <section className="rpt-hero">
        <h1>Аналітика задач</h1>
        <p className="sub">Детальний огляд ефективності по відділах і виконавцях.</p>
      </section>

      <div className="tm-view-switch" style={{ marginBottom: 18 }}>
        {PERIODS.map((p) => (
          <button key={p.key} type="button" className={'tm-view-btn' + (period === p.key ? ' active' : '')} onClick={() => setPeriod(p.key)}>
            {p.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="empty-hint">Завантаження...</div>
      ) : (
        <>
          <div className="dash-kpi-row">
            <div className="dash-kpi">
              <div className="dash-kpi-head"><div className="dash-kpi-label">Всього задач</div></div>
              <div className="dash-kpi-value">{filtered.length}</div>
            </div>
            <div className="dash-kpi">
              <div className="dash-kpi-head"><div className="dash-kpi-label">Виконано</div></div>
              <div className="dash-kpi-value">{doneRate === null ? '—' : `${doneRate}%`}</div>
              <div className="dash-kpi-sub">{done.length} з {filtered.length}</div>
            </div>
            <div className="dash-kpi">
              <div className="dash-kpi-head"><div className="dash-kpi-label">Скасовано</div></div>
              <div className="dash-kpi-value">{cancelledList.length}</div>
            </div>
            <div className="dash-kpi">
              <div className="dash-kpi-head"><div className="dash-kpi-label">Просрочено</div></div>
              <div className="dash-kpi-value">{overdue.length}</div>
            </div>
          </div>

          <div className="deals-overview-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <section className="report-section">
              <div className="stitle">По відділах</div>
              {byDepartment.length === 0 ? (
                <div className="empty-hint">Немає задач за цей період.</div>
              ) : (
                <table className="cmp-table">
                  <thead><tr><th>Відділ</th><th>Всього</th><th>Виконано</th><th>Скасовано</th></tr></thead>
                  <tbody>
                    {byDepartment.map((d) => (
                      <tr key={d.id}>
                        <td className="ink">{departmentsById[d.id]?.name || '—'}</td>
                        <td>{d.total}</td>
                        <td>{d.done}</td>
                        <td>{d.cancelled}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>

            <section className="report-section">
              <div className="stitle">По виконавцях</div>
              {byAssignee.length === 0 ? (
                <div className="empty-hint">Немає задач за цей період.</div>
              ) : (
                <table className="cmp-table">
                  <thead><tr><th>Виконавець</th><th>Всього</th><th>Виконано</th></tr></thead>
                  <tbody>
                    {byAssignee.map((a) => (
                      <tr key={a.email}>
                        <td className="ink">{a.email}</td>
                        <td>{a.total}</td>
                        <td>{a.done}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>
          </div>
        </>
      )}
    </div>
  );
}
