import { useEffect, useMemo, useState } from 'react';
import BarChart from '../../components/Reports/Weekly/BarChart';
import LineChart from '../../components/Reports/Annual/LineChart';
import DonutChart from '../../components/Automation/DonutChart';
import DeltaBadge from '../../components/Automation/DeltaBadge';
import Sparkline from '../../components/Automation/Sparkline';
import DashboardTaskCard from '../../components/Automation/DashboardTaskCard';
import { fetchTasksSince } from '../../lib/api/tasks';
import { todayIso, addDaysIso, mondayOf, isoDate, fmtDate, daysInMonth, MONTH_NAMES } from '../../lib/dateHelpers';
import { deriveTaskStatus } from '../../lib/taskStatus';
import { SECTION_ICONS, CHANNEL_ICONS } from '../../lib/reportIcons';
import { FIELD_ICONS } from '../../lib/taskFieldIcons';
import '../../styles/reportPage.css';
import '../../styles/comparePage.css';
import '../../styles/automationTasksPage.css';
import '../../styles/automationDashboard.css';

const DAY_NAMES_SHORT = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Нд'];
const SPARKLINE_WEEKS = 8; // fixed, independent of the trend chart's own selector below
const FETCH_DAYS_BACK = 100; // comfortably covers a 12-week trend + the week selector + this/prev month

const WEEK_OFFSET_OPTIONS = [
  { value: 0, label: 'Поточний тиждень' },
  { value: 1, label: 'Минулий тиждень' },
  { value: 2, label: '2 тижні тому' },
  { value: 3, label: '3 тижні тому' },
];
const TREND_WEEK_OPTIONS = [4, 8, 12];

// Leading icon for each KPI card — all reused from existing icon sets, no
// new icons needed.
const KPI_ICONS = {
  today: FIELD_ICONS.day,
  yesterday: CHANNEL_ICONS.con,
  week: '<svg viewBox="0 0 24 24"><path d="M4 20V10M12 20V4M20 20v-7"/></svg>',
  month: SECTION_ICONS['Річні підсумки'],
};

function toIso(d) {
  return isoDate(d.getFullYear(), d.getMonth() + 1, d.getDate());
}

function statsFor(list) {
  const total = list.length;
  const done = list.filter((t) => t.status === 'done').length;
  const cancelled = list.filter((t) => t.status === 'cancelled').length;
  const pct = total ? Math.round((done / total) * 100) : 0;
  return { total, done, cancelled, pct };
}

function statusBreakdown(list) {
  let done = 0, pending = 0, moved = 0, cancelled = 0;
  list.forEach((t) => {
    const s = deriveTaskStatus(t);
    if (s === 'done') done++;
    else if (s === 'pending') pending++;
    else if (s === 'moved') moved++;
    else if (s === 'cancelled') cancelled++;
  });
  const total = list.length;
  const pct = total ? Math.round((done / total) * 100) : 0;
  return { total, done, pending, moved, cancelled, pct };
}

// Every Monday-start week's completion %, `weeksCount` points ending with
// the week starting at `weekStartIso` — shared by the selectable trend
// chart and the fixed-window KPI sparklines.
function computeTrendPoints(tasks, weekStartIso, weeksCount) {
  return Array.from({ length: weeksCount }, (_, i) => {
    const wMonday = addDaysIso(weekStartIso, -7 * (weeksCount - 1 - i));
    const wSunday = addDaysIso(wMonday, 6);
    const wTasks = tasks.filter((t) => t.planned_date >= wMonday && t.planned_date <= wSunday);
    const b = statsFor(wTasks);
    return { label: fmtDate(...wMonday.split('-').map(Number)).slice(0, 5), pct: b.pct };
  });
}

export default function Dashboard() {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [weekOffset, setWeekOffset] = useState(0);
  const [trendWeeks, setTrendWeeks] = useState(8);

  const todayI = todayIso();
  const yesterdayI = addDaysIso(todayI, -1);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchTasksSince(addDaysIso(todayI, -FETCH_DAYS_BACK))
      .then((rows) => { if (!cancelled) setTasks(rows); })
      .catch((e) => console.warn('fetchTasksSince failed', e))
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stats = useMemo(() => {
    const todaysTasks = tasks.filter((t) => t.task_date === todayI);
    const yesterdaysTasks = tasks.filter((t) => t.task_date === yesterdayI);

    const thisMonday = mondayOf(todayI);
    const thisWeekStartIso = toIso(thisMonday);
    const thisWeekEndIso = addDaysIso(thisWeekStartIso, 6);
    const lastWeekStartIso = addDaysIso(thisWeekStartIso, -7);
    const lastWeekEndIso = addDaysIso(thisWeekStartIso, -1);

    const thisWeekTasks = tasks.filter((t) => t.planned_date >= thisWeekStartIso && t.planned_date <= thisWeekEndIso);
    const lastWeekTasks = tasks.filter((t) => t.planned_date >= lastWeekStartIso && t.planned_date <= lastWeekEndIso);

    const [y, m] = todayI.split('-').map(Number);
    const monthStartIso = isoDate(y, m, 1);
    const monthEndIso = isoDate(y, m, daysInMonth(y, m));
    const prevM = m === 1 ? 12 : m - 1;
    const prevY = m === 1 ? y - 1 : y;
    const prevMonthStartIso = isoDate(prevY, prevM, 1);
    const prevMonthEndIso = isoDate(prevY, prevM, daysInMonth(prevY, prevM));

    const monthTasks = tasks.filter((t) => t.planned_date >= monthStartIso && t.planned_date <= monthEndIso);
    const prevMonthTasks = tasks.filter((t) => t.planned_date >= prevMonthStartIso && t.planned_date <= prevMonthEndIso);

    // The day-progress chart can look at an earlier week via `weekOffset`,
    // independent of `thisWeekTasks`/`lastWeekTasks` above (those always
    // compare to the real current week).
    const targetMonday = new Date(thisMonday);
    targetMonday.setDate(targetMonday.getDate() - weekOffset * 7);
    const weekDays = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(targetMonday);
      d.setDate(targetMonday.getDate() + i);
      return { iso: toIso(d), date: d };
    });
    const weekDayRows = weekDays.map((d) => {
      const dayTasks = tasks.filter((t) => t.planned_date === d.iso);
      return { ...d, ...statusBreakdown(dayTasks) };
    });

    const trendPoints = computeTrendPoints(tasks, thisWeekStartIso, trendWeeks);
    const sparklineTrend = computeTrendPoints(tasks, thisWeekStartIso, SPARKLINE_WEEKS);

    return {
      today: statsFor(todaysTasks),
      todaysTasks,
      yesterday: statsFor(yesterdaysTasks),
      yesterdaysDone: yesterdaysTasks.filter((t) => t.status === 'done'),
      thisWeek: statusBreakdown(thisWeekTasks),
      lastWeek: statusBreakdown(lastWeekTasks),
      month: statusBreakdown(monthTasks),
      prevMonth: statusBreakdown(prevMonthTasks),
      monthLabel: MONTH_NAMES[m - 1],
      weekDayRows,
      trendPoints,
      sparklineTrend,
    };
  }, [tasks, todayI, yesterdayI, weekOffset, trendWeeks]);

  const sparklineValues = stats.sparklineTrend?.map((p) => p.pct) ?? [];

  const weekCmpLabels = ['Заплановано', 'Виконано', 'Скасовано', 'Перенесено'];
  const weekCmpSeries = [
    { label: 'Цей тиждень', data: [stats.thisWeek.total, stats.thisWeek.done, stats.thisWeek.cancelled, stats.thisWeek.moved] },
    { label: 'Минулий тиждень', data: [stats.lastWeek.total, stats.lastWeek.done, stats.lastWeek.cancelled, stats.lastWeek.moved] },
  ];

  const dayProgressLabels = stats.weekDayRows?.map((d, i) => `${DAY_NAMES_SHORT[i]} ${fmtDate(d.date.getFullYear(), d.date.getMonth() + 1, d.date.getDate())}`) ?? [];
  const dayProgressSeries = [
    { label: 'Заплановано', data: stats.weekDayRows?.map((d) => d.total) ?? [] },
    { label: 'Виконано', data: stats.weekDayRows?.map((d) => d.done) ?? [] },
  ];

  const trendLabels = stats.trendPoints?.map((p) => p.label) ?? [];
  const trendSeries = [{ label: '% виконання', values: stats.trendPoints?.map((p) => p.pct) ?? [] }];

  const donutSlices = [
    { label: 'Виконано', value: stats.month?.done ?? 0, color: '#1E9E5D' },
    { label: 'Не виконано', value: stats.month?.pending ?? 0, color: '#D14343' },
    { label: 'Перенесено', value: stats.month?.moved ?? 0, color: '#B8860B' },
    { label: 'Скасовано', value: stats.month?.cancelled ?? 0, color: '#6B2FA0' },
  ];

  return (
    <div className="report-page automation-dashboard-page">
      <section className="rpt-hero">
        <div className="rpt-hero-heading">
          <span className="rpt-hero-icon" dangerouslySetInnerHTML={{ __html: SECTION_ICONS['Річні підсумки'] }} />
          <h1>Automation Dashboard</h1>
        </div>
      </section>

      {loading ? (
        <div className="empty-hint">Завантаження...</div>
      ) : (
        <>
          <section className="report-section">
            <div className="dash-kpi-row">
              <div className="dash-kpi">
                <div className="dash-kpi-head">
                  <span className="dash-kpi-icon" dangerouslySetInnerHTML={{ __html: KPI_ICONS.today }} />
                  <div className="dash-kpi-label">Сьогодні</div>
                </div>
                <div className="dash-kpi-value">{stats.today.done}/{stats.today.total} <span className="pct">{stats.today.pct}%</span></div>
                <div className="dash-kpi-sub">{stats.today.cancelled} скасовано</div>
                <Sparkline values={sparklineValues} color="var(--purple)" />
              </div>
              <div className="dash-kpi">
                <div className="dash-kpi-head">
                  <span className="dash-kpi-icon" dangerouslySetInnerHTML={{ __html: KPI_ICONS.yesterday }} />
                  <div className="dash-kpi-label">Вчора</div>
                </div>
                <div className="dash-kpi-value">{stats.yesterday.done}/{stats.yesterday.total} <span className="pct">{stats.yesterday.pct}%</span></div>
                <div className="dash-kpi-sub">{stats.yesterday.cancelled} скасовано</div>
                <Sparkline values={sparklineValues} color="var(--ok)" />
              </div>
              <div className="dash-kpi">
                <div className="dash-kpi-head">
                  <span className="dash-kpi-icon" dangerouslySetInnerHTML={{ __html: KPI_ICONS.week }} />
                  <div className="dash-kpi-label">Цей тиждень</div>
                </div>
                <div className="dash-kpi-value">{stats.thisWeek.done}/{stats.thisWeek.total} <span className="pct">{stats.thisWeek.pct}%</span></div>
                <div className="dash-kpi-sub">
                  vs минулий тиждень ({stats.lastWeek.pct}%) <DeltaBadge diff={stats.thisWeek.pct - stats.lastWeek.pct} suffix=" п.п." />
                </div>
                <Sparkline values={sparklineValues} color="var(--warn)" />
              </div>
              <div className="dash-kpi">
                <div className="dash-kpi-head">
                  <span className="dash-kpi-icon" dangerouslySetInnerHTML={{ __html: KPI_ICONS.month }} />
                  <div className="dash-kpi-label">Цей місяць — {stats.monthLabel}</div>
                </div>
                <div className="dash-kpi-value">{stats.month.done}/{stats.month.total} <span className="pct">{stats.month.pct}%</span></div>
                <div className="dash-kpi-sub">
                  vs минулий місяць ({stats.prevMonth.pct}%) <DeltaBadge diff={stats.month.pct - stats.prevMonth.pct} suffix=" п.п." />
                </div>
                <Sparkline values={sparklineValues} color="var(--purple)" />
              </div>
            </div>
          </section>

          <section className="report-section">
            <div className="dash-lists">
              <div>
                <div className="stitle">Задачі на сьогодні</div>
                <div className="task-list">
                  {stats.todaysTasks.length === 0 && <div className="empty-hint">На сьогодні задач немає.</div>}
                  {stats.todaysTasks.map((t) => <DashboardTaskCard key={t.id} task={t} />)}
                </div>
                {stats.todaysTasks.length > 0 && <div className="dash-list-footer">Всього задач: {stats.todaysTasks.length}</div>}
              </div>
              <div>
                <div className="stitle">Виконано вчора</div>
                <div className="task-list">
                  {stats.yesterdaysDone.length === 0 && <div className="empty-hint">Вчора не виконано жодної задачі.</div>}
                  {stats.yesterdaysDone.map((t) => <DashboardTaskCard key={t.id} task={t} done />)}
                </div>
                {stats.yesterdaysDone.length > 0 && <div className="dash-list-footer">Всього виконано: {stats.yesterdaysDone.length}</div>}
              </div>
            </div>
          </section>

          <section className="report-section">
            <div className="stitle">Тиждень: цей vs минулий</div>
            <div className="dash-chart">
              <BarChart labels={weekCmpLabels} series={weekCmpSeries} />
            </div>
            <table className="cmp-table">
              <thead>
                <tr><th>Період</th><th>Заплановано</th><th>Виконано</th><th>Скасовано</th><th>Перенесено</th><th>% виконання</th></tr>
              </thead>
              <tbody>
                <tr>
                  <td>Цей тиждень</td>
                  <td>{stats.thisWeek.total}</td><td>{stats.thisWeek.done}</td><td>{stats.thisWeek.cancelled}</td><td>{stats.thisWeek.moved}</td>
                  <td>{stats.thisWeek.pct}%</td>
                </tr>
                <tr>
                  <td>Минулий тиждень</td>
                  <td>{stats.lastWeek.total}</td><td>{stats.lastWeek.done}</td><td>{stats.lastWeek.cancelled}</td><td>{stats.lastWeek.moved}</td>
                  <td>{stats.lastWeek.pct}%</td>
                </tr>
              </tbody>
            </table>
          </section>

          <section className="report-section">
            <div className="stitle">
              <span>Прогрес по днях поточного тижня</span>
              <select className="dash-period-select" value={weekOffset} onChange={(e) => setWeekOffset(+e.target.value)}>
                {WEEK_OFFSET_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div className="dash-chart">
              <BarChart labels={dayProgressLabels} series={dayProgressSeries} />
            </div>
          </section>

          <div className="dash-chart-grid">
            <section className="report-section">
              <div className="stitle">
                <span>Тренд виконання за {trendWeeks} тижнів</span>
                <select className="dash-period-select" value={trendWeeks} onChange={(e) => setTrendWeeks(+e.target.value)}>
                  {TREND_WEEK_OPTIONS.map((n) => <option key={n} value={n}>{n} тижнів</option>)}
                </select>
              </div>
              <div className="dash-chart">
                <LineChart labels={trendLabels} series={trendSeries} />
              </div>
            </section>

            <section className="report-section">
              <div className="stitle">Розподіл статусів за {stats.monthLabel.toLowerCase()}</div>
              {stats.month.total === 0 ? (
                <div className="empty-hint">За цей місяць ще немає задач.</div>
              ) : (
                <div className="dash-donut-row">
                  <div className="dash-chart dash-donut-chart">
                    <DonutChart
                      slices={donutSlices}
                      centerValue={String(stats.month.total)}
                      centerLabel="загалом"
                      showLegend={false}
                    />
                  </div>
                  <div className="dash-donut-legend">
                    {donutSlices.map((s) => (
                      <div className="dash-donut-legend-item" key={s.label}>
                        <span className="dot" style={{ background: s.color }} />
                        <span className="label">{s.label}</span>
                        <span className="value">{s.value} ({stats.month.total ? (s.value / stats.month.total * 100).toFixed(1) : '0'}%)</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </section>
          </div>

          <section className="report-section">
            <div className="stitle">Детальна таблиця по днях поточного тижня</div>
            <table className="cmp-table">
              <thead>
                <tr><th>День</th><th>Заплановано</th><th>Виконано</th><th>Не виконано</th><th>Перенесено</th><th>Скасовано</th><th>% виконання</th></tr>
              </thead>
              <tbody>
                {stats.weekDayRows.map((d, i) => (
                  <tr key={d.iso}>
                    <td>{DAY_NAMES_SHORT[i]} {fmtDate(d.date.getFullYear(), d.date.getMonth() + 1, d.date.getDate())}</td>
                    <td>{d.total}</td><td>{d.done}</td><td>{d.pending}</td><td>{d.moved}</td><td>{d.cancelled}</td>
                    <td>{d.pct}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </>
      )}
    </div>
  );
}
