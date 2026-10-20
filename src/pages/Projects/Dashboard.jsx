import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import ProjectsRegistry from '../../components/Projects/ProjectsRegistry';
import { Ico, Medallion, BoxHead, Delta, initials } from '../../components/Projects/dashParts';
import { G, Legend, Spark, TrendChart, StatusDonut, PlatformRings, money, moneyK } from '../../components/Projects/DashCharts';
import { lastCompletedWeek } from '../../lib/periodReport';
import { fetchProjects } from '../../lib/api/projects';
import { platformInfo } from '../../lib/adAccounts';
import { fetchAllWeeklyReportsForWeek, fetchAllMonthlyReportsForMonth, fetchWeeklyReportsBetween, fetchWeeklyReportStatuses, fetchAgentDrafts } from '../../lib/api/projectReportStore';
import { fetchAgentsOverview } from '../../lib/api/projectAgents';
import { todayIso, addDaysIso, mondayOf, isoDate, fmtDate, MONTH_NAMES } from '../../lib/dateHelpers';
import { PLATFORM_ICONS, PLATFORM_SYMBOL } from '../../lib/pageIcons';
import '../../styles/reportPage.css';
import '../../styles/comparePage.css';
import '../../styles/automationDashboard.css';
import '../../styles/projectsDashboard.css';
import '../../styles/projectsDashboardHub.css';

const TREND_WEEKS = 8;
const REPORT_STATUS = { draft: 'Чернетка', reviewed: 'Перевірено', final: 'Фінал' };
// Ring of a weekly-report card: how far the report got.
const REPORT_RING = { final: { cls: 'ok', ring: 'st-ok', p: 100 }, reviewed: { cls: 'in', ring: 'st-in', p: 66 }, draft: { cls: 'wa', ring: 'st-paused', p: 33 }, none: { cls: 'mu', ring: 'st-mu', p: 0 } };

function toIso(d) {
  return isoDate(d.getFullYear(), d.getMonth() + 1, d.getDate());
}
const fmtIso = (s) => s.split('-').reverse().join('.');
const moneyFmt = money;
const roasFmt = (v) => (v === null ? '—' : v.toFixed(2).replace('.', ',') + 'x');
function sumField(rows, field) {
  return rows.reduce((s, r) => s + (Number(r.data?.[field]) || 0), 0);
}
function aggTotals(rows) {
  const spend = sumField(rows, 'spend');
  const revenue = sumField(rows, 'revenue');
  return { spend, revenue, roas: spend ? revenue / spend : null };
}
const ringOf = (cur, prev) => (prev > 0 ? Math.max(0, Math.min(100, Math.round((cur / prev) * 100))) : cur > 0 ? 100 : 0);

export default function Dashboard() {
  const [loading, setLoading] = useState(true);
  const [projects, setProjects] = useState([]);
  const [thisWeekRows, setThisWeekRows] = useState([]);
  const [lastWeekRows, setLastWeekRows] = useState([]);
  const [thisMonthRows, setThisMonthRows] = useState([]);
  const [prevMonthRows, setPrevMonthRows] = useState([]);
  const [trendRows, setTrendRows] = useState([]);
  const [lastWeekStatuses, setLastWeekStatuses] = useState([]);
  const [agentRows, setAgentRows] = useState([]);
  const [agentDrafts, setAgentDrafts] = useState([]);
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
      doneWeek ? fetchWeeklyReportStatuses(doneWeek.start) : Promise.resolve([]),
      fetchAgentsOverview(),
      fetchAgentDrafts(),
    ])
      .then(([projs, tw, lw, tm, pm, trend, statuses, agents, drafts]) => {
        if (cancelled) return;
        setProjects(projs);
        setThisWeekRows(tw);
        setLastWeekRows(lw);
        setThisMonthRows(tm);
        setPrevMonthRows(pm);
        setTrendRows(trend);
        setLastWeekStatuses(statuses);
        setAgentRows(agents);
        setAgentDrafts(drafts);
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

  // «Потрібна увага»: where the AI agent hit a problem, and the drafts it made that wait for a person.
  const attention = useMemo(() => {
    const nameOf = (id) => projects.find((p) => String(p.id) === String(id))?.name || `Проєкт ${id}`;
    const problems = agentRows.filter((a) => a.health === 'problem').map((a) => ({ key: 'p' + a.project_id, kind: 'problem', projectId: a.project_id, project: nameOf(a.project_id), text: a.last_error || 'Агент повідомив про проблему.', to: `/projects/${a.project_id}?tab=agent`, action: 'Відкрити агента' }));
    const reviews = agentDrafts.map((r) => ({ key: 'r' + r.id, kind: 'review', projectId: r.project_id, project: nameOf(r.project_id), text: `${r.period_type === 'monthly' ? 'Місячний' : 'Тижневий'} звіт · ${r.platform === 'all' ? 'Разом' : platformInfo(r.platform).label} за ${fmtIso(r.period_start)} – ${fmtIso(r.period_end)}: чернетка агента чекає перевірки`, to: `/projects/${r.project_id}?tab=${r.period_type}&platform=${r.platform === 'all' ? 'total' : r.platform}`, action: 'Перевірити' }));
    return [...problems, ...reviews];
  }, [projects, agentRows, agentDrafts]);

  const trendLabels = stats.weekLabels?.map((iso) => {
    const [wy, wm, wd] = iso.split('-').map(Number);
    return fmtDate(wy, wm, wd).slice(0, 5);
  }) ?? [];

  const statusSlices = [
    { label: 'Активні', value: stats.statusCounts?.active ?? 0, grad: G.green },
    { label: 'На паузі', value: stats.statusCounts?.paused ?? 0, grad: G.amber },
    { label: 'Завершені', value: stats.statusCounts?.completed ?? 0, grad: G.lilac },
  ];
  const platformSlices = [
    { label: 'Meta', key: 'meta', value: Math.round(stats.platformTotals?.meta ?? 0), grad: G.blue },
    { label: 'Google', key: 'google', value: Math.round(stats.platformTotals?.google ?? 0), grad: G.green },
    { label: 'Інше', key: 'other', value: Math.round(stats.platformTotals?.other ?? 0), grad: G.amber },
  ];
  const platformTotal = platformSlices.reduce((s, p) => s + p.value, 0);
  const monthLabel = MONTH_NAMES[m - 1];

  const kpis = [
    { icon: 'stat', label: 'Активні проєкти', ring: totalProjects ? Math.round(((stats.statusCounts?.active ?? 0) / totalProjects) * 100) : 0, st: '', value: <>{stats.statusCounts?.active ?? 0} <span className="of">з {totalProjects}</span></>, sub: null, spark: null },
    { icon: 'wallet', label: 'Витрати цього тижня', ring: ringOf(stats.thisWeek.spend, stats.lastWeek.spend), st: 'st-in', value: moneyFmt(stats.thisWeek.spend), sub: <><span>до минулого тижня ({moneyFmt(stats.lastWeek.spend)})</span><Delta diff={Math.round(stats.thisWeek.spend - stats.lastWeek.spend)} suffix=" $" /></>, spark: [stats.weeklySpendTrend, G.blue, 'pdk2'] },
    { icon: 'coin', label: 'Дохід цього тижня', ring: ringOf(stats.thisWeek.revenue, stats.lastWeek.revenue), st: '', value: moneyFmt(stats.thisWeek.revenue), sub: <><span>до минулого тижня ({moneyFmt(stats.lastWeek.revenue)})</span><Delta diff={Math.round(stats.thisWeek.revenue - stats.lastWeek.revenue)} suffix=" $" /></>, spark: [stats.weeklyRevenueTrend, G.plum, 'pdk3'] },
    {
      icon: 'roas', label: 'ROAS цього місяця', ring: stats.thisMonth.roas === null ? 0 : ringOf(stats.thisMonth.roas, stats.prevMonth.roas || stats.thisMonth.roas), st: 'st-ok', value: stats.thisMonth.roas === null ? '—' : stats.thisMonth.roas.toFixed(2) + 'x',
      sub: <><span>до минулого місяця ({stats.prevMonth.roas === null ? '—' : stats.prevMonth.roas.toFixed(2) + 'x'})</span>{stats.thisMonth.roas !== null && stats.prevMonth.roas !== null && <Delta diff={Math.round((stats.thisMonth.roas - stats.prevMonth.roas) * 100) / 100} />}</>,
      spark: [stats.weeklyRevenueTrend.map((v, i) => (stats.weeklySpendTrend[i] ? v / stats.weeklySpendTrend[i] : 0)), G.green, 'pdk4'],
    },
  ];

  const activeProjects = projects.filter((p) => p.status === 'active');
  const maxRevenue = Math.max(...stats.projectRows.map((p) => p.revenue), 1);
  const bestRoas = Math.max(...stats.projectRows.map((p) => p.roas ?? 0), 0);
  const weekCmp = [
    { label: 'Витрати', cur: stats.thisWeek.spend, prev: stats.lastWeek.spend, grad: G.blue },
    { label: 'Дохід', cur: stats.thisWeek.revenue, prev: stats.lastWeek.revenue, grad: G.plum },
  ];

  return (
    <div className="report-page projects-dashboard-page pd">
      {loading ? (
        <div className="pd-empty">Завантаження...</div>
      ) : (
        <div className="pd-stack">
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

          {attention.length > 0 && (
            <section className="pd-box">
              <BoxHead icon="alert" title="Потрібна увага" sub="Де агент натрапив на проблему і які чернетки чекають людину" right={<span className="pd-pill bad nc">{attention.length}</span>} />
              <div className="pd-acards">
                {attention.map((a) => (
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
            </section>
          )}

          <section className="pd-box">
            <BoxHead
              icon="file" title="Тижневі звіти" sub={doneWeek ? `за ${fmtIso(doneWeek.start)} – ${fmtIso(doneWeek.end)}` : undefined}
              right={<span className="pd-legsm"><i style={{ background: '#12A144' }} />Фінал<i style={{ background: '#2F6FED' }} />Перевірено<i style={{ background: '#E08A06' }} />Чернетка<i style={{ background: '#A98BB3' }} />Немає</span>}
            />
            {activeProjects.length === 0 ? (
              <div className="pd-empty">Активних проєктів ще немає.</div>
            ) : (
              <div className="pd-wks">
                {activeProjects.map((p) => {
                  const st = lastWeekStatuses.find((r) => String(r.project_id) === String(p.id))?.status;
                  const rg = REPORT_RING[st] || REPORT_RING.none;
                  return (
                    <Link className="pd-wk" key={p.id} to={`/projects/${p.id}?tab=weekly`}>
                      <Medallion tx={initials(p.name)} p={rg.p} st={rg.ring} size="wkm" />
                      <span className="pd-wt"><b>{p.name}</b><small className={rg.cls}>{st ? (REPORT_STATUS[st] || st) : 'Немає'}</small></span>
                      <span className={'pd-wgo' + (st ? '' : ' new')}><Ico n={st ? 'arrow' : 'plus'} /></span>
                    </Link>
                  );
                })}
              </div>
            )}
          </section>

          <section className="pd-box">
            <BoxHead icon="users" title="Реєстр проєктів" sub={`${totalProjects} проєктів · рядок розкривається, там усі поля і перехід до картки`} />
            <ProjectsRegistry projects={projects} />
          </section>

          <section className="pd-box">
            <BoxHead icon="wallet" title="Проєкти цього місяця" sub={`${monthLabel} · витрати, дохід і ROAS по проєктах`} />
            {stats.projectRows.length === 0 ? (
              <div className="pd-empty">Немає збережених звітів за цей місяць.</div>
            ) : (
              <>
                <div className="pd-pbars">
                  {stats.projectRows.map((p) => (
                    <div className="pd-pbr" key={p.name}>
                      <span className="pd-pbn"><Medallion tx={initials(p.name)} size="xs" /><b>{p.name}</b></span>
                      <div className="pd-pbb">
                        <div className="pd-pb rv" style={{ width: Math.max((p.revenue / maxRevenue) * 100, 4) + '%' }}><em>{moneyK(p.revenue)}</em></div>
                        <div className="pd-pb sp" style={{ width: Math.max((p.spend / maxRevenue) * 100, 4) + '%' }}><em>{moneyK(p.spend)}</em></div>
                      </div>
                      <span className={'pd-rcap' + (p.roas === null ? '' : p.roas >= 3 ? ' hi' : p.roas < 2 ? ' lo' : '')}>{roasFmt(p.roas)}</span>
                    </div>
                  ))}
                </div>
                <Legend items={[['Дохід', G.plum], ['Витрати', G.blue]]} />
                <div className="pd-tblw">
                  <table className="pd-tbl">
                    <thead><tr><th>Проєкт</th><th className="num">Витрати</th><th className="num">Дохід</th><th className="num">ROAS</th></tr></thead>
                    <tbody>
                      {stats.projectRows.map((p) => (
                        <tr key={p.name}>
                          <td className="lbl">{p.name}</td>
                          <td className="num">{moneyFmt(p.spend)}</td>
                          <td className="num">{moneyFmt(p.revenue)}</td>
                          <td className="num"><span className={p.roas !== null && p.roas === bestRoas && stats.projectRows.length > 1 ? 'best' : ''}>{roasFmt(p.roas)}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </section>

          <section className="pd-box">
            <BoxHead icon="bars" title="Цей тиждень і минулий" sub="Витрати і дохід у порівнянні" />
            <div className="pd-wc2">
              {weekCmp.map((c) => {
                const mx = Math.max(c.cur, c.prev, 1); const dd = Math.round(c.cur - c.prev);
                return (
                  <div className="pd-wcb" key={c.label}>
                    <div className="pd-wch"><b>{c.label}</b><Delta diff={dd} suffix=" $" /></div>
                    <div className="pd-hp"><span>Цей тиждень</span><div className="pd-hpt"><div className="pd-hpb" style={{ width: Math.max((c.cur / mx) * 100, 14) + '%', background: `linear-gradient(100deg,${c.grad[0]},${c.grad[1]})` }}><em>{moneyFmt(c.cur)}</em></div></div></div>
                    <div className="pd-hp"><span>Минулий</span><div className="pd-hpt"><div className="pd-hpb old" style={{ width: Math.max((c.prev / mx) * 100, 14) + '%' }}><em>{moneyFmt(c.prev)}</em></div></div></div>
                  </div>
                );
              })}
            </div>
          </section>

          <div className="pd-g21">
            <section className="pd-box">
              <BoxHead icon="roas" title={`Витрати і дохід за ${TREND_WEEKS} тижнів`} sub="Наведіть або натисніть на тиждень" right={<Legend items={[['Дохід', G.plum], ['Витрати', G.blue]]} />} />
              <TrendChart labels={trendLabels} spend={stats.weeklySpendTrend ?? []} revenue={stats.weeklyRevenueTrend ?? []} />
            </section>
            <section className="pd-box">
              <BoxHead icon="pie" title="Статуси проєктів" sub={`Усього ${totalProjects}`} />
              <div className="pd-gx"><StatusDonut slices={statusSlices} /></div>
            </section>
          </div>

          <section className="pd-box">
            <BoxHead icon="wallet" title="Витрати за платформою" sub={monthLabel} />
            {platformTotal === 0 ? (
              <div className="pd-empty">Немає витрат за цей місяць.</div>
            ) : (
              <div className="pd-plw">
                <PlatformRings slices={platformSlices} caption={`Витрати за платформою — ${monthLabel}`} centerLabel={`за ${monthLabel.toLowerCase()}`} />
                <div className="pd-pl">
                  {platformSlices.map((p) => {
                    const sym = PLATFORM_ICONS[PLATFORM_SYMBOL[p.key]];
                    return (
                      <div className="pd-plr" key={p.key}>
                        {sym ? <span className="pd-lg2"><img src={sym.src} alt="" draggable="false" /></span> : <Medallion icon="layers" size="xs" st="st-paused" />}
                        <span className="pn">{p.label}</span><b>{moneyFmt(p.value)}</b>
                        <span className="pd-delta neu">{Math.round((p.value / platformTotal) * 100)}%</span>
                      </div>
                    );
                  })}
                  <div className="pd-plr tot"><span className="pn">Разом</span><b>{moneyFmt(platformTotal)}</b></div>
                </div>
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
