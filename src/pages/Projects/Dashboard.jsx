import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import ProjectsRegistry from '../../components/Projects/ProjectsRegistry';
import { Ico, Medallion, BoxHead, Delta } from '../../components/Projects/dashParts';
import { G, Spark, money } from '../../components/Projects/DashCharts';
import { Board, FlowChart, HeatMap, PaceArc, RoasLegend, StatusLegend, StatusMatrix } from '../../components/Projects/DashPlum';
import { lastCompletedWeek } from '../../lib/periodReport';
import { boardRows, disciplineCounts, heatRows, pacing, sankeyData, weekStatusMatrix } from '../../lib/projectsDashboard';
import { fetchProjects } from '../../lib/api/projects';
import { platformInfo } from '../../lib/adAccounts';
import { fetchAllWeeklyReportsForWeek, fetchAllMonthlyReportsForMonth, fetchWeeklyReportsBetween, fetchWeeklyReportStatusesBetween, fetchAgentDrafts, readFailures } from '../../lib/api/projectReportStore';
import { fetchAgentsOverview } from '../../lib/api/projectAgents';
import { todayIso, addDaysIso, mondayOf, isoDate, MONTH_NAMES } from '../../lib/dateHelpers';
import '../../styles/reportPage.css';
import '../../styles/comparePage.css';
import '../../styles/automationDashboard.css';
import '../../styles/projectsDashboard.css';
import '../../styles/projectsDashboardHub.css';
import '../../styles/projectsDashboardPlum.generated.css';
import '../../styles/projectsDashboardPlum.css';

const TREND_WEEKS = 8;
const ATT_PAGE = 3; // cards of «Потрібна увага» on one page

function toIso(d) {
  return isoDate(d.getFullYear(), d.getMonth() + 1, d.getDate());
}
const fmtIso = (s) => s.split('-').reverse().join('.');
const shortWeek = (iso) => iso.slice(8, 10) + '.' + iso.slice(5, 7);
function sumField(rows, field) {
  return rows.reduce((s, r) => s + (Number(r.data?.[field]) || 0), 0);
}
function aggTotals(rows) {
  const spend = sumField(rows, 'spend');
  const revenue = sumField(rows, 'revenue');
  return { spend, revenue, roas: spend ? revenue / spend : null };
}
const ringOf = (cur, prev) => (prev > 0 ? Math.max(0, Math.min(100, Math.round((cur / prev) * 100))) : cur > 0 ? 100 : 0);

// The dashboard of the projects in the plum look (owner's picks 2026-11-12): the row of the key figures, the flow of the month's spend next to the things that need a person, the
// heat map of the ROAS and the matrix of the weekly reports, the pace of the month and the board of the projects, the registry at the bottom.
export default function Dashboard() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [projects, setProjects] = useState([]);
  const [thisWeekRows, setThisWeekRows] = useState([]);
  const [lastWeekRows, setLastWeekRows] = useState([]);
  const [thisMonthRows, setThisMonthRows] = useState([]);
  const [prevMonthRows, setPrevMonthRows] = useState([]);
  const [trendRows, setTrendRows] = useState([]);
  const [statusRows, setStatusRows] = useState([]);
  const [agentRows, setAgentRows] = useState([]);
  const [agentDrafts, setAgentDrafts] = useState([]);
  const [registryOpen, setRegistryOpen] = useState(false);
  const [attPage, setAttPage] = useState(1);
  const doneWeek = useMemo(() => lastCompletedWeek(todayIso()), []);

  const todayI = todayIso();
  const thisMonday = mondayOf(todayI);
  const thisWeekStartIso = toIso(thisMonday);
  const lastWeekStartIso = addDaysIso(thisWeekStartIso, -7);
  const [y, m] = todayI.split('-').map(Number);
  const thisMonthStartIso = isoDate(y, m, 1);
  const prevM = m === 1 ? 12 : m - 1;
  const prevY = m === 1 ? y - 1 : y;
  const prevMonthStartIso = isoDate(prevY, prevM, 1);
  // 8 finished weeks for the heat map and the matrix (the week that is going on is not counted), the 8 weeks up to this one for the sparklines of the key figures
  const trendRangeStartIso = addDaysIso(thisWeekStartIso, -7 * TREND_WEEKS);
  const heatWeeks = Array.from({ length: TREND_WEEKS }, (_, i) => addDaysIso(lastWeekStartIso, -7 * (TREND_WEEKS - 1 - i)));

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError('');
    const failuresBefore = readFailures.count;
    Promise.all([
      fetchProjects(),
      fetchAllWeeklyReportsForWeek(thisWeekStartIso),
      fetchAllWeeklyReportsForWeek(lastWeekStartIso),
      fetchAllMonthlyReportsForMonth(thisMonthStartIso),
      fetchAllMonthlyReportsForMonth(prevMonthStartIso),
      fetchWeeklyReportsBetween(trendRangeStartIso, thisWeekStartIso),
      fetchWeeklyReportStatusesBetween(heatWeeks[0], lastWeekStartIso),
      fetchAgentsOverview(),
      fetchAgentDrafts(),
    ])
      .then(([projs, tw, lw, tm, pm, trend, statuses, agents, drafts]) => {
        if (!cancelled && readFailures.count > failuresBefore) setLoadError('частина звітів не завантажилась');
        if (cancelled) return;
        setProjects(projs);
        setThisWeekRows(tw);
        setLastWeekRows(lw);
        setThisMonthRows(tm);
        setPrevMonthRows(pm);
        setTrendRows(trend);
        setStatusRows(statuses);
        setAgentRows(agents);
        setAgentDrafts(drafts);
      })
      .catch((e) => { console.warn('dashboard fetch failed', e); if (!cancelled) setLoadError(e.message || 'помилка мережі'); })
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
    // the 8 weeks up to this one, for the sparklines of the key figures
    const sparkWeeks = Array.from({ length: TREND_WEEKS }, (_, i) => addDaysIso(thisWeekStartIso, -7 * (TREND_WEEKS - 1 - i)));
    const byWeek = new Map();
    trendRows.forEach((r) => {
      const cur = byWeek.get(r.week_start) || { spend: 0, revenue: 0 };
      cur.spend += Number(r.data?.spend) || 0;
      cur.revenue += Number(r.data?.revenue) || 0;
      byWeek.set(r.week_start, cur);
    });
    const weeklySpendTrend = sparkWeeks.map((iso) => byWeek.get(iso)?.spend || 0);
    const weeklyRevenueTrend = sparkWeeks.map((iso) => byWeek.get(iso)?.revenue || 0);
    return { thisWeek, lastWeek, thisMonth, prevMonth, statusCounts, weeklySpendTrend, weeklyRevenueTrend };
  }, [projects, thisWeekRows, lastWeekRows, thisMonthRows, prevMonthRows, trendRows, thisWeekStartIso]);

  const charts = useMemo(() => {
    const heat = heatRows(trendRows, projects, heatWeeks);
    const matrix = weekStatusMatrix(statusRows, projects.filter((p) => p.status === 'active'), heatWeeks);
    return {
      heat,
      flow: sankeyData(thisMonthRows, projects),
      pace: pacing(thisMonthRows, prevMonthRows, todayI),
      matrix,
      counts: disciplineCounts(matrix),
      board: boardRows(thisMonthRows, projects, heat),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trendRows, projects, statusRows, thisMonthRows, prevMonthRows, todayI]);

  const totalProjects = projects.length;
  // «Потрібна увага»: where the AI agent hit a problem, and the drafts it made that wait for a person.
  const attention = useMemo(() => {
    const nameOf = (id) => projects.find((p) => String(p.id) === String(id))?.name || `Проєкт ${id}`;
    const problems = agentRows.filter((a) => a.health === 'problem').map((a) => ({ key: 'p' + a.project_id, kind: 'problem', projectId: a.project_id, project: nameOf(a.project_id), text: a.last_error || 'Агент повідомив про проблему.', to: `/projects/${a.project_id}?tab=agent`, action: 'Відкрити агента' }));
    const reviews = agentDrafts.map((r) => ({ key: 'r' + r.id, kind: 'review', projectId: r.project_id, project: nameOf(r.project_id), text: `${r.period_type === 'monthly' ? 'Місячний' : 'Тижневий'} звіт · ${r.platform === 'all' ? 'Разом' : platformInfo(r.platform).label} за ${fmtIso(r.period_start)} – ${fmtIso(r.period_end)}: чернетка агента чекає перевірки`, to: `/projects/${r.project_id}?tab=${r.period_type}&platform=${r.platform === 'all' ? 'total' : r.platform}`, action: 'Перевірити' }));
    return [...problems, ...reviews];
  }, [projects, agentRows, agentDrafts]);

  const monthLabel = MONTH_NAMES[m - 1];
  // the week is still going (not Sunday): its total is compared with a whole week, so no «▼» is drawn that would only mean «the week is not over»
  const weekOpen = new Date().getDay() !== 0;
  const kpis = [
    { icon: 'stat', label: 'Поточні проєкти', ring: totalProjects ? Math.round(((stats.statusCounts?.active ?? 0) / totalProjects) * 100) : 0, st: '', value: <>{stats.statusCounts?.active ?? 0} <span className="of">з {totalProjects}</span></>, sub: null, spark: null },
    { icon: 'wallet', label: 'Витрати цього тижня', ring: ringOf(stats.thisWeek.spend, stats.lastWeek.spend), st: 'st-in', value: money(stats.thisWeek.spend), sub: <><span>до минулого тижня ({money(stats.lastWeek.spend)})</span>{weekOpen ? <span className="pd-note">тиждень ще триває</span> : <Delta diff={Math.round(stats.thisWeek.spend - stats.lastWeek.spend)} suffix=" $" />}</>, spark: [stats.weeklySpendTrend, G.blue, 'pdk2'] },
    { icon: 'coin', label: 'Дохід цього тижня', ring: ringOf(stats.thisWeek.revenue, stats.lastWeek.revenue), st: '', value: money(stats.thisWeek.revenue), sub: <><span>до минулого тижня ({money(stats.lastWeek.revenue)})</span>{weekOpen ? <span className="pd-note">тиждень ще триває</span> : <Delta diff={Math.round(stats.thisWeek.revenue - stats.lastWeek.revenue)} suffix=" $" />}</>, spark: [stats.weeklyRevenueTrend, G.plum, 'pdk3'] },
    {
      icon: 'roas', label: 'ROAS цього місяця', ring: stats.thisMonth.roas === null ? 0 : ringOf(stats.thisMonth.roas, stats.prevMonth.roas || stats.thisMonth.roas), st: 'st-ok', value: stats.thisMonth.roas === null ? '—' : stats.thisMonth.roas.toFixed(2) + 'x',
      sub: <><span>до минулого місяця ({stats.prevMonth.roas === null ? '—' : stats.prevMonth.roas.toFixed(2) + 'x'})</span>{stats.thisMonth.roas !== null && stats.prevMonth.roas !== null && <Delta diff={Math.round((stats.thisMonth.roas - stats.prevMonth.roas) * 100) / 100} />}</>,
      spark: [stats.weeklyRevenueTrend.map((v, i) => (stats.weeklySpendTrend[i] ? v / stats.weeklySpendTrend[i] : 0)), G.green, 'pdk4'],
    },
  ];

  const weekLabels = heatWeeks.map(shortWeek);
  const openProject = (id) => navigate(`/projects/${id}`);
  const flowBox = (
    <section className="pd-box">
      <BoxHead icon="layers" title="Потік грошей" sub={`${monthLabel}: з платформи в проєкти, колір проєкту це ROAS`} right={<RoasLegend />} />
      {charts.flow.total ? <FlowChart data={charts.flow} /> : <div className="pd-empty">Немає витрат за цей місяць.</div>}
    </section>
  );
  // three cards at a time, the rest is behind the switch of the pages
  const attPages = Math.max(1, Math.ceil(attention.length / ATT_PAGE));
  const attCur = Math.min(attPage, attPages);
  const attentionBox = attention.length > 0 && (
    <section className="pd-box pdn-att">
      <BoxHead icon="alert" title="Потрібна увага" sub="Проблеми агента й чернетки, що чекають людину" right={<span className="pd-pill bad nc">{attention.length}</span>} />
      <div className="pdn-acards">
        {attention.slice((attCur - 1) * ATT_PAGE, attCur * ATT_PAGE).map((a) => (
          <div className={'pd-box flat pd-acard ' + (a.kind === 'problem' ? 'bd' : 'wa')} key={a.key}>
            <Medallion icon={a.kind === 'problem' ? 'alert' : 'note'} size="sm" st={a.kind === 'problem' ? 'st-bad' : 'st-paused'} />
            <div className="pd-ab">
              <div className="pd-an"><Link to={`/projects/${a.projectId}`}>{a.project}</Link>{a.kind === 'problem' ? <span className="pd-pill bad"><i />Проблема</span> : <span className="pd-pill paused"><i />Чернетка</span>}</div>
              <p>{a.text}</p>
            </div>
            <Link className="pd-btn sec sm" to={a.to}><Ico n="arrow" />{a.action}</Link>
          </div>
        ))}
      </div>
      {attPages > 1 && (
        <nav className="pd-pager pdn-attpager" aria-label="Сторінки списку «Потрібна увага»">
          <button type="button" className="pd-pg arr" disabled={attCur === 1} aria-label="Попередня сторінка" onClick={() => setAttPage(attCur - 1)}><Ico n="chev" className="l" /></button>
          {Array.from({ length: attPages }, (_, i) => i + 1).map((n) => (
            <button key={n} type="button" className={'pd-pg' + (n === attCur ? ' on' : '')} aria-current={n === attCur ? 'page' : undefined} onClick={() => setAttPage(n)}>{n}</button>
          ))}
          <button type="button" className="pd-pg arr" disabled={attCur === attPages} aria-label="Наступна сторінка" onClick={() => setAttPage(attCur + 1)}><Ico n="chev" className="r" /></button>
          <span className="pd-pgn">{(attCur - 1) * ATT_PAGE + 1}–{Math.min(attCur * ATT_PAGE, attention.length)} з {attention.length}</span>
        </nav>
      )}
    </section>
  );

  return (
    <div className="report-page projects-dashboard-page pd pd-plum is-plum">
      {loading ? (
        <div className="pd-empty">Завантаження...</div>
      ) : (
        <div className="pd-stack">
          {loadError && <div className="pacc-err" role="alert">Не вдалося завантажити частину даних: {loadError}. Цифри нижче можуть бути неповними. Оновіть сторінку.</div>}
          <div className="pd-kp">
            {kpis.map((k) => (
              <div className="pd-box pd-kc" key={k.label}>
                <Medallion icon={k.icon} p={k.ring} st={k.st} size="kmd" />
                <div className="pd-kt">
                  <small>{k.label}</small>
                  <b className="v">{k.value}</b>
                  {k.sub ? <div className="pd-ks">{k.sub}</div> : null}
                </div>
                {k.spark ? <Spark values={k.spark[0]} c={k.spark[1]} id={k.spark[2]} /> : null}
              </div>
            ))}
          </div>

          {attentionBox ? <div className="pdn-g21">{flowBox}{attentionBox}</div> : flowBox}

          <div className="pdn-g21">
            <section className="pd-box">
              <BoxHead icon="stat" title="ROAS проєктів за 8 тижнів" sub="Де ефективність росте, а де сповзає; колір це ROAS тижня" right={<RoasLegend />} />
              {charts.heat.length ? <HeatMap rows={charts.heat} weekLabels={weekLabels} /> : <div className="pd-empty">Немає збережених тижневих звітів з витратами.</div>}
            </section>
            <section className="pd-box">
              <BoxHead icon="file" title="Дисципліна звітів" sub={doneWeek ? `Тижневі звіти, останній за ${fmtIso(doneWeek.start)} – ${fmtIso(doneWeek.end)}` : 'Тижневі звіти за 8 тижнів'} right={<StatusLegend />} />
              {charts.matrix.length ? <StatusMatrix rows={charts.matrix} weekLabels={weekLabels} onOpen={openProject} /> : <div className="pd-empty">Поточних проєктів ще немає.</div>}
              {charts.matrix.length > 0 && <small className="pdn-note">Минулий тиждень: {charts.counts.final} з {charts.matrix.length} затверджено{charts.counts.draft + charts.counts.rework ? `, ${charts.counts.draft + charts.counts.rework} у роботі` : ''}{charts.counts.none ? `, ${charts.counts.none} без звіту` : ''}.</small>}
            </section>
          </div>

          <div className="pdn-g12">
            <section className="pd-box">
              <BoxHead icon="clock" title="Темп місяця" sub={charts.pace ? `Витрати на ${charts.pace.day}-й день із ${charts.pace.dim} і прогноз` : monthLabel} />
              {charts.pace ? (
                <>
                  <PaceArc pace={charts.pace} />
                  <small className="pdn-note">Біла риска це весь минулий місяць ({money(charts.pace.prev)}){charts.pace.deltaPct === null ? '' : <>: за цим темпом цей місяць вийде на <b className={charts.pace.deltaPct > 0 ? 'pdn-up' : 'pdn-dn'}>{charts.pace.deltaPct > 0 ? '+' : ''}{charts.pace.deltaPct}%</b></>}. Дані з місячних звітів проєктів.</small>
                </>
              ) : <div className="pd-empty">Немає витрат за цей місяць.</div>}
            </section>
            <section className="pd-box">
              <BoxHead icon="users" title="Проєкти цього місяця" sub={`${monthLabel}: витрати, дохід, ROAS і динаміка витрат за 8 тижнів`} />
              {charts.board.length ? <Board rows={charts.board} onOpen={openProject} /> : <div className="pd-empty">Немає збережених звітів за цей місяць.</div>}
            </section>
          </div>

          <section className="pd-box">
            <button type="button" className="pdn-reghead" aria-expanded={registryOpen} onClick={() => setRegistryOpen((o) => !o)}>
              <Medallion icon="users" />
              <span><b>Реєстр проєктів</b><small>{`${totalProjects} проєктів · рядок розкривається, там усі поля і перехід до картки`}</small></span>
              <span className="pd-cv"><Ico n="chev" /></span>
            </button>
            {registryOpen && <ProjectsRegistry projects={projects} />}
          </section>
        </div>
      )}
    </div>
  );
}
