import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import BarChart from '../../components/Reports/Weekly/BarChart';
import LineChart from '../../components/Reports/Annual/LineChart';
import DeltaBadge from '../../components/Automation/DeltaBadge';
import { fetchReportByWeekStart, fetchWeeklyRowsBetween } from '../../lib/api/weeklyReports';
import { fetchMonthlyReportByStart } from '../../lib/api/monthlyReports';
import { fetchMonthsForYear } from '../../lib/api/annualReports';
import { monthFinVal, monthValuesFor } from '../../lib/annualLogic';
import { todayIso, addDaysIso, mondayOf, isoDate, fmtDate, MONTH_NAMES } from '../../lib/dateHelpers';
import { gv, financeCalc, moneyFmt } from '../../lib/weeklyLogic';
import '../../styles/reportPage.css';
import '../../styles/comparePage.css';
import '../../styles/automationDashboard.css';
import '../../styles/salesDashboard.css';

const TREND_WEEKS = 8;

const QL_IDS = ['mb_ql', 'ol_inv_ql', 'ol_dm_ql', 'ol_con_ql', 'ol_pc_ql', 'gm_ql', 'li_ql'];
const CO_IDS = ['mb_co', 'ol_inv_co', 'ol_dm_co', 'ol_con_co', 'ol_pc_co', 'gm_co', 'li_contracts'];

const CHANNEL_META = [
  { key: 'mb', title: 'Manual Bidding', qlId: 'mb_ql', coId: 'mb_co' },
  { key: 'inv', title: 'Invites', qlId: 'ol_inv_ql', coId: 'ol_inv_co' },
  { key: 'dm', title: 'Direct Message', qlId: 'ol_dm_ql', coId: 'ol_dm_co' },
  { key: 'con', title: 'Consultations', qlId: 'ol_con_ql', coId: 'ol_con_co' },
  { key: 'pc', title: 'Project Catalog', qlId: 'ol_pc_ql', coId: 'ol_pc_co' },
  { key: 'gm', title: 'GetMany', qlId: 'gm_ql', coId: 'gm_co' },
  { key: 'li', title: 'LinkedIn', qlId: 'li_ql', coId: 'li_contracts' },
];

function sumIds(getValue, ids) {
  return ids.reduce((s, id) => s + (gv(getValue, id) || 0), 0);
}

// Weekly reports store raw per-field values; monthly reports store
// pre-aggregated sums — same totals, different source shape.
function weekTotals(row) {
  if (!row) return { ql: 0, co: 0, income: 0 };
  const getValue = (id) => row.data?.[id];
  return { ql: sumIds(getValue, QL_IDS), co: sumIds(getValue, CO_IDS), income: financeCalc(getValue).totalInc || 0 };
}
function monthTotals(row) {
  if (!row) return { ql: 0, co: 0, income: 0, profit: 0 };
  const getValue = (id) => row.data?.sums?.[id];
  return { ql: sumIds(getValue, QL_IDS), co: sumIds(getValue, CO_IDS), income: row.data?.finance?.total_inc ?? 0, profit: row.data?.finance?.profit ?? 0 };
}

function toIso(d) {
  return isoDate(d.getFullYear(), d.getMonth() + 1, d.getDate());
}

export default function Dashboard() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [thisWeekRow, setThisWeekRow] = useState(null);
  const [lastWeekRow, setLastWeekRow] = useState(null);
  const [thisMonthRow, setThisMonthRow] = useState(null);
  const [prevMonthRow, setPrevMonthRow] = useState(null);
  const [monthsByIndex, setMonthsByIndex] = useState({});
  const [recentWeeklyRows, setRecentWeeklyRows] = useState([]);

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
      fetchReportByWeekStart(thisWeekStartIso),
      fetchReportByWeekStart(lastWeekStartIso),
      fetchMonthlyReportByStart(thisMonthStartIso),
      fetchMonthlyReportByStart(prevMonthStartIso),
      fetchMonthsForYear(y),
      fetchWeeklyRowsBetween(trendRangeStartIso, thisWeekStartIso),
    ])
      .then(([tw, lw, tm, pm, months, recent]) => {
        if (cancelled) return;
        setThisWeekRow(tw);
        setLastWeekRow(lw);
        setThisMonthRow(tm);
        setPrevMonthRow(pm);
        setMonthsByIndex(months);
        setRecentWeeklyRows(recent);
      })
      .catch((e) => console.warn('dashboard fetch failed', e))
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stats = useMemo(() => {
    const thisWeek = weekTotals(thisWeekRow);
    const lastWeek = weekTotals(lastWeekRow);
    const thisMonth = monthTotals(thisMonthRow);
    const prevMonth = monthTotals(prevMonthRow);

    const channelRows = CHANNEL_META.map((c) => ({
      title: c.title,
      ql: thisMonthRow?.data?.sums?.[c.qlId] ?? 0,
      co: thisMonthRow?.data?.sums?.[c.coId] ?? 0,
    }));

    const monthlyIncomeTrend = monthValuesFor(monthsByIndex, monthFinVal, 'total_inc');
    const monthlyProfitTrend = monthValuesFor(monthsByIndex, monthFinVal, 'profit');

    const weekLabels = Array.from({ length: TREND_WEEKS }, (_, i) => addDaysIso(thisWeekStartIso, -7 * (TREND_WEEKS - 1 - i)));
    const weekRowByStart = new Map(recentWeeklyRows.map((r) => [r.week_start, r]));
    const weeklyQlTrend = weekLabels.map((iso) => weekTotals(weekRowByStart.get(iso)).ql);
    const weeklyCoTrend = weekLabels.map((iso) => weekTotals(weekRowByStart.get(iso)).co);

    const recentClients = (thisWeekRow?.data?.clients?.length ? thisWeekRow.data.clients : lastWeekRow?.data?.clients) || [];

    return { thisWeek, lastWeek, thisMonth, prevMonth, channelRows, monthlyIncomeTrend, monthlyProfitTrend, weekLabels, weeklyQlTrend, weeklyCoTrend, recentClients };
  }, [thisWeekRow, lastWeekRow, thisMonthRow, prevMonthRow, monthsByIndex, recentWeeklyRows, thisWeekStartIso]);

  const weekCmpLabels = ['Qualified Leads', 'Contracts'];
  const weekCmpSeries = [
    { label: 'Цей тиждень', data: [stats.thisWeek.ql, stats.thisWeek.co] },
    { label: 'Минулий тиждень', data: [stats.lastWeek.ql, stats.lastWeek.co] },
  ];

  const channelLabels = stats.channelRows?.map((c) => c.title) ?? [];
  const channelSeries = [
    { label: 'Qualified Leads', data: stats.channelRows?.map((c) => c.ql) ?? [] },
    { label: 'Contracts', data: stats.channelRows?.map((c) => c.co) ?? [] },
  ];

  const monthlyTrendSeries = [
    { label: 'Дохід', values: stats.monthlyIncomeTrend ?? [] },
    { label: 'Прибуток', values: stats.monthlyProfitTrend ?? [] },
  ];

  const weeklyTrendLabels = stats.weekLabels?.map((iso) => {
    const [wy, wm, wd] = iso.split('-').map(Number);
    return fmtDate(wy, wm, wd).slice(0, 5);
  }) ?? [];
  const weeklyTrendSeries = [
    { label: 'Qualified Leads', values: stats.weeklyQlTrend ?? [] },
    { label: 'Contracts', values: stats.weeklyCoTrend ?? [] },
  ];

  return (
    <div className="report-page sales-dashboard-page">
      <div className="page-actions">
        <button type="button" className="btn" onClick={() => navigate(-1)}>&#8592; Back</button>
      </div>

      <section className="rpt-hero">
        <h1>Sales Dashboard</h1>
        <p className="sub">Загальна картина по лідах, контрактах і доході: цей тиждень, цей місяць, канали та тренди.</p>
      </section>

      {loading ? (
        <div className="empty-hint">Завантаження...</div>
      ) : (
        <>
          <section className="report-section">
            <div className="stitle">Цей тиждень</div>
            <div className="dash-kpi-row">
              <div className="dash-kpi">
                <div className="dash-kpi-label">Qualified Leads</div>
                <div className="dash-kpi-value">{stats.thisWeek.ql}</div>
                <div className="dash-kpi-sub">vs минулий тиждень ({stats.lastWeek.ql}) <DeltaBadge diff={stats.thisWeek.ql - stats.lastWeek.ql} /></div>
              </div>
              <div className="dash-kpi">
                <div className="dash-kpi-label">Contracts</div>
                <div className="dash-kpi-value">{stats.thisWeek.co}</div>
                <div className="dash-kpi-sub">vs минулий тиждень ({stats.lastWeek.co}) <DeltaBadge diff={stats.thisWeek.co - stats.lastWeek.co} /></div>
              </div>
              <div className="dash-kpi">
                <div className="dash-kpi-label">Дохід</div>
                <div className="dash-kpi-value">{moneyFmt(stats.thisWeek.income)}</div>
                <div className="dash-kpi-sub">vs минулий тиждень ({moneyFmt(stats.lastWeek.income)}) <DeltaBadge diff={Math.round(stats.thisWeek.income - stats.lastWeek.income)} suffix=" $" /></div>
              </div>
            </div>
          </section>

          <section className="report-section">
            <div className="stitle">Цей місяць — {MONTH_NAMES[m - 1]}</div>
            <div className="dash-kpi-row">
              <div className="dash-kpi">
                <div className="dash-kpi-label">Qualified Leads</div>
                <div className="dash-kpi-value">{stats.thisMonth.ql}</div>
                <div className="dash-kpi-sub">vs минулий місяць ({stats.prevMonth.ql}) <DeltaBadge diff={stats.thisMonth.ql - stats.prevMonth.ql} /></div>
              </div>
              <div className="dash-kpi">
                <div className="dash-kpi-label">Contracts</div>
                <div className="dash-kpi-value">{stats.thisMonth.co}</div>
                <div className="dash-kpi-sub">vs минулий місяць ({stats.prevMonth.co}) <DeltaBadge diff={stats.thisMonth.co - stats.prevMonth.co} /></div>
              </div>
              <div className="dash-kpi">
                <div className="dash-kpi-label">Дохід</div>
                <div className="dash-kpi-value">{moneyFmt(stats.thisMonth.income)}</div>
                <div className="dash-kpi-sub">vs минулий місяць ({moneyFmt(stats.prevMonth.income)}) <DeltaBadge diff={Math.round(stats.thisMonth.income - stats.prevMonth.income)} suffix=" $" /></div>
              </div>
              <div className="dash-kpi">
                <div className="dash-kpi-label">Прибуток</div>
                <div className="dash-kpi-value">{moneyFmt(stats.thisMonth.profit)}</div>
                <div className="dash-kpi-sub">vs минулий місяць ({moneyFmt(stats.prevMonth.profit)}) <DeltaBadge diff={Math.round(stats.thisMonth.profit - stats.prevMonth.profit)} suffix=" $" /></div>
              </div>
            </div>
          </section>

          <section className="report-section">
            <div className="stitle">Тиждень: цей vs минулий</div>
            <div className="dash-chart">
              <BarChart labels={weekCmpLabels} series={weekCmpSeries} />
            </div>
          </section>

          <section className="report-section">
            <div className="stitle">Канали цього місяця</div>
            <div className="dash-chart">
              <BarChart labels={channelLabels} series={channelSeries} />
            </div>
          </section>

          <div className="dash-chart-grid">
            <section className="report-section">
              <div className="stitle">Дохід і прибуток за місяцями ({y})</div>
              <div className="dash-chart">
                <LineChart series={monthlyTrendSeries} />
              </div>
            </section>

            <section className="report-section">
              <div className="stitle">Ліди та контракти за {TREND_WEEKS} тижнів</div>
              <div className="dash-chart">
                <LineChart labels={weeklyTrendLabels} series={weeklyTrendSeries} />
              </div>
            </section>
          </div>

          <section className="report-section">
            <div className="stitle">Останні клієнти</div>
            <div className="sd-client-list">
              {stats.recentClients.length === 0 && <div className="empty-hint">Немає клієнтів у збережених звітах останнього тижня.</div>}
              {stats.recentClients.map((c, i) => (
                <div className="sd-client-card" key={i}>
                  <div className="sd-client-name">{c.name || '—'}</div>
                  <div className="sd-client-tag">{c.platform} · {c.leadType}</div>
                  {c.text && <div className="sd-client-text">{c.text}</div>}
                </div>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
