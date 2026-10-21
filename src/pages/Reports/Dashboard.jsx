import { useEffect, useMemo, useState } from 'react';
import { HubBars, HubLine } from '../../components/Reports/HubCharts';
import DeltaBadge from '../../components/Automation/DeltaBadge';
import Sparkline from '../../components/Automation/Sparkline';
import ClientAvatar from '../../components/Clients/ClientAvatar';
import { FIELD_ICONS } from '../../lib/taskFieldIcons';
import { fetchReportByWeekStart, fetchWeeklyRowsBetween } from '../../lib/api/weeklyReports';
import { fetchMonthlyReportByStart, fetchWeeklyRowsForMonth } from '../../lib/api/monthlyReports';
import { computeSums } from '../../lib/monthlyLogic';
import { funnelFrom } from '../../lib/salesFunnel';
import { FunnelSection, ChannelFunnelTable, InvestmentsTable } from '../../components/Reports/SalesFunnel';
import { fetchMonthsForYear } from '../../lib/api/annualReports';
import { fetchAllDeals } from '../../lib/api/deals';
import { countLeadsByChannel } from '../../lib/upworkChannels';
import { monthFinVal, monthValuesFor } from '../../lib/annualLogic';
import { todayIso, addDaysIso, mondayOf, isoDate, fmtDate, MONTH_NAMES } from '../../lib/dateHelpers';
import { gv, financeCalc, moneyFmt } from '../../lib/weeklyLogic';
import '../../styles/reportPage.css';
import '../../styles/comparePage.css';
import '../../styles/automationDashboard.css';
import '../../styles/salesDashboard.css';
import '../../styles/ddHub.css';
import '../../styles/reportsHub.css';
import '../../styles/salesDashboardHub.css';

const TREND_UP_ICON = '<svg viewBox="0 0 24 24"><path d="M3 17l5-5 4 4 8-9M15 7h5v5"/></svg>';
const KPI_ICON = {
  ql: FIELD_ICONS.assignee,
  co: FIELD_ICONS.document,
  income: FIELD_ICONS.amount,
  profit: TREND_UP_ICON,
};

// One KPI card: ring medallion + label, big value with an optional 8-point trend line,
// and the change against the previous period (pill) with the previous value beside it.
function Kpi({ icon, tone, label, value, delta, prev, trend, trendColor }) {
  return (
    <div className="dash-kpi sdh-kpi">
      <div className="dash-kpi-head">
        <span className={'dash-kpi-icon' + (tone ? ' ' + tone : '')} style={{ '--p': 100 }} dangerouslySetInnerHTML={{ __html: icon }} />
        <div className="dash-kpi-label">{label}</div>
      </div>
      <div className="sdh-kpi-main">
        <div className="dash-kpi-value">{value}</div>
        {trend && trend.length > 1 && <span className="sdh-kpi-spark"><Sparkline values={trend} color={trendColor} /></span>}
      </div>
      <div className="dash-kpi-sub">{delta}<span>{prev}</span></div>
    </div>
  );
}

const TREND_WEEKS = 8;
const RECENT_CONTRACTS = 6;

function fmtMoneyCur(amount, currency) {
  const n = Number(amount);
  if (!amount || !Number.isFinite(n)) return '—';
  return new Intl.NumberFormat('uk-UA').format(n) + ' ' + (currency || '');
}
function fmtDay(iso) {
  const d = iso ? new Date(iso) : null;
  return d && !Number.isNaN(d.getTime()) ? d.toLocaleDateString('uk-UA') : '';
}

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
  const [loading, setLoading] = useState(true);
  const [thisWeekRow, setThisWeekRow] = useState(null);
  const [lastWeekRow, setLastWeekRow] = useState(null);
  const [thisMonthRow, setThisMonthRow] = useState(null);
  const [prevMonthRow, setPrevMonthRow] = useState(null);
  const [monthsByIndex, setMonthsByIndex] = useState({});
  const [recentWeeklyRows, setRecentWeeklyRows] = useState([]);
  const [wonDeals, setWonDeals] = useState([]);
  // Month figures when the monthly report isn't saved yet: summed from the month's weekly reports.
  const [liveMonthSums, setLiveMonthSums] = useState(null);

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
      // Deals are optional context here: a failure must not blank the dashboard.
      fetchAllDeals().catch((e) => { console.warn('dashboard deals fetch failed', e); return []; }),
      fetchWeeklyRowsForMonth(y, m).catch(() => []),
    ])
      .then(([tw, lw, tm, pm, months, recent, deals, monthWeeks]) => {
        if (cancelled) return;
        setThisWeekRow(tw);
        setLastWeekRow(lw);
        setThisMonthRow(tm);
        setPrevMonthRow(pm);
        setMonthsByIndex(months);
        setRecentWeeklyRows(recent);
        setLiveMonthSums(monthWeeks?.length ? computeSums(monthWeeks).sums : null);
        setWonDeals((deals || [])
          .filter((d) => d.deal_stages?.is_won && !d.archived)
          .sort((a, b) => new Date(b.closed_at || b.updated_at || 0) - new Date(a.closed_at || a.updated_at || 0))
          .slice(0, RECENT_CONTRACTS));
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

    // Leads per source channel — every channel (Upwork, Facebook ads, ..., the team's own), straight from the month's lead rows.
    const leadChannelRows = countLeadsByChannel(thisMonthRow?.data?.clients);

    const monthlyIncomeTrend = monthValuesFor(monthsByIndex, monthFinVal, 'total_inc');
    const monthlyProfitTrend = monthValuesFor(monthsByIndex, monthFinVal, 'profit');

    const weekLabels = Array.from({ length: TREND_WEEKS }, (_, i) => addDaysIso(thisWeekStartIso, -7 * (TREND_WEEKS - 1 - i)));
    const weekRowByStart = new Map(recentWeeklyRows.map((r) => [r.week_start, r]));
    const weeklyQlTrend = weekLabels.map((iso) => weekTotals(weekRowByStart.get(iso)).ql);
    const weeklyCoTrend = weekLabels.map((iso) => weekTotals(weekRowByStart.get(iso)).co);
    const weeklyIncTrend = weekLabels.map((iso) => weekTotals(weekRowByStart.get(iso)).income);

    const recentClients = (thisWeekRow?.data?.clients?.length ? thisWeekRow.data.clients : lastWeekRow?.data?.clients) || [];

    // Funnel / investments: this week's raw fields; the month's saved sums, or the live weekly sum if the month isn't saved.
    const weekGet = (id) => thisWeekRow?.data?.[id];
    const monthSums = thisMonthRow?.data?.sums || liveMonthSums || {};
    const monthGet = (id) => monthSums[id];
    const weekFunnel = funnelFrom(weekGet);
    const monthFunnel = funnelFrom(monthGet);

    return { weekGet, monthGet, weekFunnel, monthFunnel, thisWeek, lastWeek, thisMonth, prevMonth, channelRows, leadChannelRows, monthlyIncomeTrend, monthlyProfitTrend, weekLabels, weeklyQlTrend, weeklyCoTrend, weeklyIncTrend, recentClients };
  }, [thisWeekRow, lastWeekRow, thisMonthRow, prevMonthRow, monthsByIndex, recentWeeklyRows, thisWeekStartIso, liveMonthSums]);

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

  const monthTrend = (arr) => (arr || []).slice(0, m).filter((v) => v != null);
  const monthLabel = MONTH_NAMES[m - 1];
  const stitle = (icon, text) => (
    <div className="stitle"><span className="stitle-icon" dangerouslySetInnerHTML={{ __html: icon }} />{text}</div>
  );

  return (
    <div className="report-page sales-dashboard-page sdh rpt-hub" data-dd="hub">
      {loading ? (
        <div className="empty-hint">Завантаження...</div>
      ) : (
        <>
          <section className="report-section">
            {stitle(FIELD_ICONS.day, 'Цей тиждень')}
            <div className="dash-kpi-row sdh-k3">
              <Kpi icon={KPI_ICON.ql} label="Qualified Leads" value={stats.thisWeek.ql} trend={stats.weeklyQlTrend} trendColor="#8E1E8E"
                delta={<DeltaBadge diff={stats.thisWeek.ql - stats.lastWeek.ql} />} prev={`минулий тиждень ${stats.lastWeek.ql}`} />
              <Kpi icon={KPI_ICON.co} tone="ok" label="Contracts" value={stats.thisWeek.co} trend={stats.weeklyCoTrend}
                delta={<DeltaBadge diff={stats.thisWeek.co - stats.lastWeek.co} />} prev={`минулий тиждень ${stats.lastWeek.co}`} />
              <Kpi icon={KPI_ICON.income} tone="ok" label="Дохід" value={moneyFmt(stats.thisWeek.income)} trend={stats.weeklyIncTrend}
                delta={<DeltaBadge diff={Math.round(stats.thisWeek.income - stats.lastWeek.income)} suffix=" $" />} prev={`минулий тиждень ${moneyFmt(stats.lastWeek.income)}`} />
            </div>
          </section>

          <section className="report-section">
            {stitle(FIELD_ICONS.day, `Цей місяць — ${monthLabel}`)}
            <div className="dash-kpi-row sdh-k4">
              <Kpi icon={KPI_ICON.ql} label="Qualified Leads" value={stats.thisMonth.ql}
                delta={<DeltaBadge diff={stats.thisMonth.ql - stats.prevMonth.ql} />} prev={`минулий місяць ${stats.prevMonth.ql}`} />
              <Kpi icon={KPI_ICON.co} tone="ok" label="Contracts" value={stats.thisMonth.co}
                delta={<DeltaBadge diff={stats.thisMonth.co - stats.prevMonth.co} />} prev={`минулий місяць ${stats.prevMonth.co}`} />
              <Kpi icon={KPI_ICON.income} tone="ok" label="Дохід" value={moneyFmt(stats.thisMonth.income)} trend={monthTrend(stats.monthlyIncomeTrend)}
                delta={<DeltaBadge diff={Math.round(stats.thisMonth.income - stats.prevMonth.income)} suffix=" $" />} prev={`минулий місяць ${moneyFmt(stats.prevMonth.income)}`} />
              <Kpi icon={KPI_ICON.profit} tone="ok" label="Прибуток" value={moneyFmt(stats.thisMonth.profit)} trend={monthTrend(stats.monthlyProfitTrend)}
                delta={<DeltaBadge diff={Math.round(stats.thisMonth.profit - stats.prevMonth.profit)} suffix=" $" />} prev={`минулий місяць ${moneyFmt(stats.prevMonth.profit)}`} />
            </div>
          </section>

          <section className="report-section">
            {stitle(FIELD_ICONS.target, 'Воронка продажів')}
            <p className="sd-note">Лід → дзвінок → кваліфікований → контракт за цифрами тижневих і місячних звітів. Лід — це відповіді (Upwork), вхідні звернення (органіка) або ліди LinkedIn.</p>
            <FunnelSection weekFunnel={stats.weekFunnel} monthFunnel={stats.monthFunnel} monthLabel={monthLabel} />
          </section>

          <section className="report-section">
            {stitle(FIELD_ICONS.megaphone, `Воронка по каналах — ${monthLabel}`)}
            <p className="sd-note">Зелена капсула — найкраща конверсія серед каналів.</p>
            <ChannelFunnelTable funnel={stats.monthFunnel} />
          </section>

          <section className="report-section">
            {stitle(FIELD_ICONS.amount, 'Інвестиції в канали продажів')}
            <p className="sd-note">Інвестиції — витрати з фінансового блоку звітів за вирахуванням повернень; дохід — з полів доходу за каналами.</p>
            <InvestmentsTable weekGet={stats.weekGet} monthGet={stats.monthGet} monthLabel={monthLabel} />
          </section>

          <section className="report-section">
            {stitle(FIELD_ICONS.barChart, 'Тиждень: цей vs минулий')}
            <HubBars labels={weekCmpLabels} series={weekCmpSeries} />
          </section>

          <section className="report-section">
            {stitle(FIELD_ICONS.megaphone, 'Канали цього місяця')}
            <div className="sdh-two">
              <div>
                <div className="sdh-sub">Qualified Leads</div>
                <HubBars labels={channelLabels} series={[{ label: 'Qualified Leads', data: channelSeries[0].data }]} />
              </div>
              <div>
                <div className="sdh-sub">Contracts</div>
                <HubBars labels={channelLabels} series={[{ label: 'Contracts', data: channelSeries[1].data, color: '#12A144' }]} />
              </div>
            </div>
          </section>

          <section className="report-section">
            {stitle(FIELD_ICONS.assignee, 'Ліди за каналами цього місяця')}
            {stats.leadChannelRows.length === 0 ? (
              <div className="empty-hint">Немає лідів у місячному звіті. Канал обирається у «Клієнтах» денного, тижневого чи місячного звіту.</div>
            ) : (
              <HubBars
                labels={stats.leadChannelRows.map((r) => r.label)}
                series={[{ label: 'Ліди', data: stats.leadChannelRows.map((r) => r.count) }]}
              />
            )}
          </section>

          <div className="sdh-two sdh-charts">
            <section className="report-section">
              {stitle(FIELD_ICONS.barChart, `Дохід і прибуток за місяцями (${y})`)}
              <HubLine series={[{ label: 'Дохід', values: monthlyTrendSeries[0].values, color: '#8E1E8E' }, { label: 'Прибуток', values: monthlyTrendSeries[1].values, color: '#12A144' }]} />
            </section>

            <section className="report-section">
              {stitle(FIELD_ICONS.barChart, `Ліди та контракти за ${TREND_WEEKS} тижнів`)}
              <HubLine labels={weeklyTrendLabels} series={[{ label: 'Qualified Leads', values: weeklyTrendSeries[0].values, color: '#8E1E8E' }, { label: 'Contracts', values: weeklyTrendSeries[1].values, color: '#2F6FED' }]} />
            </section>
          </div>

          <section className="report-section">
            {stitle(FIELD_ICONS.assignee, 'Ліди')}
            <div className="sdh-cards">
              {stats.recentClients.length === 0 && <div className="empty-hint">Немає лідів у збережених звітах останнього тижня.</div>}
              {stats.recentClients.map((c, i) => (
                <div className="sd-client-card" key={i}>
                  <ClientAvatar name={c.name || '—'} size={36} />
                  <div className="sd-client-body">
                    <div className="sd-client-name">{c.name || '—'}</div>
                    <div className="sd-client-tag">{c.platform} · {c.leadType}</div>
                    {c.text && <div className="sd-client-text">{c.text}</div>}
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="report-section">
            {stitle(FIELD_ICONS.check, 'Останні закриті контракти')}
            <div className="sdh-cards">
              {wonDeals.length === 0 && <div className="empty-hint">Закритих контрактів поки немає.</div>}
              {wonDeals.map((d) => (
                <div className="sd-client-card" key={d.id}>
                  <span className="dash-kpi-icon ok" style={{ '--p': 100 }} dangerouslySetInnerHTML={{ __html: FIELD_ICONS.check }} />
                  <div className="sd-client-body">
                    <div className="sd-client-name">{d.clients?.name || d.title || '—'}</div>
                    <div className="sd-client-tag">{d.pipelines?.name || '—'} · {d.deal_stages?.label || 'Виграно'}</div>
                    <div className="sd-client-text">{fmtMoneyCur(d.amount, d.currency)}{fmtDay(d.closed_at || d.updated_at) ? ` · ${fmtDay(d.closed_at || d.updated_at)}` : ''}</div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
