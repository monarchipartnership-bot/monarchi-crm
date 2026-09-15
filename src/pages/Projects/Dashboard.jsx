import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import BarChart from '../../components/Reports/Weekly/BarChart';
import LineChart from '../../components/Reports/Annual/LineChart';
import DonutChart from '../../components/Automation/DonutChart';
import DeltaBadge from '../../components/Automation/DeltaBadge';
import { fetchProjects } from '../../lib/api/projects';
import { fetchAllWeeklyReportsForWeek, fetchAllMonthlyReportsForMonth, fetchWeeklyReportsBetween } from '../../lib/api/projectReports';
import { todayIso, addDaysIso, mondayOf, isoDate, fmtDate, MONTH_NAMES } from '../../lib/dateHelpers';
import '../../styles/reportPage.css';
import '../../styles/comparePage.css';
import '../../styles/automationDashboard.css';
import '../../styles/projectsDashboard.css';

const TREND_WEEKS = 8;

function toIso(d) {
  return isoDate(d.getFullYear(), d.getMonth() + 1, d.getDate());
}
function moneyFmt(v) {
  return '$' + Math.round(v || 0).toLocaleString('uk-UA');
}
function sumField(rows, field) {
  return rows.reduce((s, r) => s + (Number(r.data?.[field]) || 0), 0);
}
function aggTotals(rows) {
  const spend = sumField(rows, 'spend');
  const revenue = sumField(rows, 'revenue');
  return { spend, revenue, roas: spend ? revenue / spend : null };
}

export default function Dashboard() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [projects, setProjects] = useState([]);
  const [thisWeekRows, setThisWeekRows] = useState([]);
  const [lastWeekRows, setLastWeekRows] = useState([]);
  const [thisMonthRows, setThisMonthRows] = useState([]);
  const [prevMonthRows, setPrevMonthRows] = useState([]);
  const [trendRows, setTrendRows] = useState([]);

  const todayI = todayIso();
  const thisMonday = mondayOf(todayI);
  const thisWeekStartIso = toIso(thisMonday);
  const lastWeekStartIso = addDaysIso(thisWeekStartIso, -7);
  const [y, m] = todayI.split('-').map(Number);
  const thisMonthStartIso = isoDate(y, m, 1);
  const prevM = m === 1 ? 12 : m - 1;
  const prevY = m === 1 ? y - 1 : y;
  const prevMonthStartIso = isoDate(prevY, prevM, 1);
  const trendRangeStartIso = addDaysIso(thisWeekStartIso, -7 * (TREND_WEEKS - 1));

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      fetchProjects(),
      fetchAllWeeklyReportsForWeek(thisWeekStartIso),
      fetchAllWeeklyReportsForWeek(lastWeekStartIso),
      fetchAllMonthlyReportsForMonth(thisMonthStartIso),
      fetchAllMonthlyReportsForMonth(prevMonthStartIso),
      fetchWeeklyReportsBetween(trendRangeStartIso, thisWeekStartIso),
    ])
      .then(([projs, tw, lw, tm, pm, trend]) => {
        if (cancelled) return;
        setProjects(projs);
        setThisWeekRows(tw);
        setLastWeekRows(lw);
        setThisMonthRows(tm);
        setPrevMonthRows(pm);
        setTrendRows(trend);
      })
      .catch((e) => console.warn('dashboard fetch failed', e))
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stats = useMemo(() => {
    const thisWeek = aggTotals(thisWeekRows);
    const lastWeek = aggTotals(lastWeekRows);
    const thisMonth = aggTotals(thisMonthRows);
    const prevMonth = aggTotals(prevMonthRows);

    const statusCounts = { active: 0, paused: 0, completed: 0 };
    projects.forEach((p) => { if (statusCounts[p.status] !== undefined) statusCounts[p.status]++; });

    const platformTotals = { meta: 0, google: 0, other: 0 };
    thisMonthRows.forEach((r) => { platformTotals[r.platform] = (platformTotals[r.platform] || 0) + (Number(r.data?.spend) || 0); });

    const projectNameById = new Map(projects.map((p) => [String(p.id), p.name]));
    const perProject = new Map();
    thisMonthRows.forEach((r) => {
      const key = String(r.project_id);
      const cur = perProject.get(key) || { spend: 0, revenue: 0 };
      cur.spend += Number(r.data?.spend) || 0;
      cur.revenue += Number(r.data?.revenue) || 0;
      perProject.set(key, cur);
    });
    const projectRows = [...perProject.entries()]
      .map(([pid, v]) => ({ name: projectNameById.get(pid) || `#${pid}`, spend: v.spend, revenue: v.revenue, roas: v.spend ? v.revenue / v.spend : null }))
      .sort((a, b) => b.spend - a.spend);

    const weekLabels = Array.from({ length: TREND_WEEKS }, (_, i) => addDaysIso(thisWeekStartIso, -7 * (TREND_WEEKS - 1 - i)));
    const byWeek = new Map();
    trendRows.forEach((r) => {
      const cur = byWeek.get(r.week_start) || { spend: 0, revenue: 0 };
      cur.spend += Number(r.data?.spend) || 0;
      cur.revenue += Number(r.data?.revenue) || 0;
      byWeek.set(r.week_start, cur);
    });
    const weeklySpendTrend = weekLabels.map((iso) => byWeek.get(iso)?.spend || 0);
    const weeklyRevenueTrend = weekLabels.map((iso) => byWeek.get(iso)?.revenue || 0);

    return { thisWeek, lastWeek, thisMonth, prevMonth, statusCounts, platformTotals, projectRows, weekLabels, weeklySpendTrend, weeklyRevenueTrend };
  }, [projects, thisWeekRows, lastWeekRows, thisMonthRows, prevMonthRows, trendRows, thisWeekStartIso]);

  const totalProjects = projects.length;

  const weekCmpLabels = ['Витрати', 'Дохід'];
  const weekCmpSeries = [
    { label: 'Цей тиждень', data: [Math.round(stats.thisWeek.spend), Math.round(stats.thisWeek.revenue)] },
    { label: 'Минулий тиждень', data: [Math.round(stats.lastWeek.spend), Math.round(stats.lastWeek.revenue)] },
  ];

  const projectLabels = stats.projectRows?.map((p) => p.name) ?? [];
  const projectSeries = [
    { label: 'Витрати', data: stats.projectRows?.map((p) => Math.round(p.spend)) ?? [] },
    { label: 'Дохід', data: stats.projectRows?.map((p) => Math.round(p.revenue)) ?? [] },
  ];

  const trendLabels = stats.weekLabels?.map((iso) => {
    const [wy, wm, wd] = iso.split('-').map(Number);
    return fmtDate(wy, wm, wd).slice(0, 5);
  }) ?? [];
  const trendSeries = [
    { label: 'Витрати', values: stats.weeklySpendTrend ?? [] },
    { label: 'Дохід', values: stats.weeklyRevenueTrend ?? [] },
  ];

  const statusSlices = [
    { label: 'Активні', value: stats.statusCounts?.active ?? 0, color: '#1E9E5D' },
    { label: 'На паузі', value: stats.statusCounts?.paused ?? 0, color: '#B8860B' },
    { label: 'Завершені', value: stats.statusCounts?.completed ?? 0, color: '#6B2FA0' },
  ];
  const platformSlices = [
    { label: 'Meta', value: Math.round(stats.platformTotals?.meta ?? 0), color: '#2F6FED' },
    { label: 'Google', value: Math.round(stats.platformTotals?.google ?? 0), color: '#1E9E5D' },
    { label: 'Інше', value: Math.round(stats.platformTotals?.other ?? 0), color: '#B8860B' },
  ];
  const platformTotal = platformSlices.reduce((s, p) => s + p.value, 0);

  return (
    <div className="report-page projects-dashboard-page">
      <div className="page-actions">
        <button type="button" className="btn" onClick={() => navigate(-1)}>&#8592; Back</button>
      </div>

      <section className="rpt-hero">
        <h1>Projects Dashboard</h1>
        <p className="sub">Загальна картина по всіх проєктах: витрати, дохід, ROAS, статуси та тренди по тижнях.</p>
      </section>

      {loading ? (
        <div className="empty-hint">Завантаження...</div>
      ) : (
        <>
          <section className="report-section">
            <div className="dash-kpi-row">
              <div className="dash-kpi">
                <div className="dash-kpi-label">Активні проєкти</div>
                <div className="dash-kpi-value">{stats.statusCounts?.active ?? 0} <span className="pct">з {totalProjects}</span></div>
              </div>
              <div className="dash-kpi">
                <div className="dash-kpi-label">Витрати цього тижня</div>
                <div className="dash-kpi-value">{moneyFmt(stats.thisWeek.spend)}</div>
                <div className="dash-kpi-sub">vs минулий тиждень ({moneyFmt(stats.lastWeek.spend)}) <DeltaBadge diff={Math.round(stats.thisWeek.spend - stats.lastWeek.spend)} suffix=" $" /></div>
              </div>
              <div className="dash-kpi">
                <div className="dash-kpi-label">Дохід цього тижня</div>
                <div className="dash-kpi-value">{moneyFmt(stats.thisWeek.revenue)}</div>
                <div className="dash-kpi-sub">vs минулий тиждень ({moneyFmt(stats.lastWeek.revenue)}) <DeltaBadge diff={Math.round(stats.thisWeek.revenue - stats.lastWeek.revenue)} suffix=" $" /></div>
              </div>
              <div className="dash-kpi">
                <div className="dash-kpi-label">ROAS цього місяця</div>
                <div className="dash-kpi-value">{stats.thisMonth.roas === null ? '—' : stats.thisMonth.roas.toFixed(2) + 'x'}</div>
                <div className="dash-kpi-sub">
                  vs минулий місяць ({stats.prevMonth.roas === null ? '—' : stats.prevMonth.roas.toFixed(2) + 'x'})
                  {stats.thisMonth.roas !== null && stats.prevMonth.roas !== null && (
                    <DeltaBadge diff={Math.round((stats.thisMonth.roas - stats.prevMonth.roas) * 100) / 100} />
                  )}
                </div>
              </div>
            </div>
          </section>

          <section className="report-section">
            <div className="stitle">Проєкти цього місяця — {MONTH_NAMES[m - 1]}</div>
            {projectLabels.length === 0 ? (
              <div className="empty-hint">Немає збережених звітів за цей місяць.</div>
            ) : (
              <>
                <div className="dash-chart">
                  <BarChart labels={projectLabels} series={projectSeries} />
                </div>
                <table className="cmp-table">
                  <thead><tr><th>Проєкт</th><th>Витрати</th><th>Дохід</th><th>ROAS</th></tr></thead>
                  <tbody>
                    {stats.projectRows.map((p) => (
                      <tr key={p.name}>
                        <td>{p.name}</td>
                        <td>{moneyFmt(p.spend)}</td>
                        <td>{moneyFmt(p.revenue)}</td>
                        <td>{p.roas === null ? '—' : p.roas.toFixed(2) + 'x'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
          </section>

          <section className="report-section">
            <div className="stitle">Тиждень: цей vs минулий</div>
            <div className="dash-chart">
              <BarChart labels={weekCmpLabels} series={weekCmpSeries} />
            </div>
          </section>

          <div className="dash-chart-grid">
            <section className="report-section">
              <div className="stitle">Витрати і дохід за {TREND_WEEKS} тижнів</div>
              <div className="dash-chart">
                <LineChart labels={trendLabels} series={trendSeries} />
              </div>
            </section>

            <section className="report-section">
              <div className="stitle">Статуси проєктів</div>
              <div className="dash-chart">
                <DonutChart slices={statusSlices} />
              </div>
            </section>
          </div>

          <section className="report-section">
            <div className="stitle">Витрати за платформою — {MONTH_NAMES[m - 1]}</div>
            {platformTotal === 0 ? (
              <div className="empty-hint">Немає витрат за цей місяць.</div>
            ) : (
              <div className="dash-chart">
                <DonutChart slices={platformSlices} />
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
