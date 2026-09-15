import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import DonutChart from '../Automation/DonutChart';
import { fetchProjects } from '../../lib/api/projects';
import { fetchAllDailyReportsBetween } from '../../lib/api/projectReports';
import { todayIso, addDaysIso } from '../../lib/dateHelpers';

// Health isn't a stored field — there's no such column on `projects` yet —
// it's derived here from two things we do have: the deadline and whether a
// daily ad-report has come in recently. Overdue deadline wins as the
// clearest signal; no report in 2 days is the softer "needs attention" one.
function healthOf(project, reportedIds, todayI) {
  if (project.end_date && project.end_date < todayI) return 'risk';
  if (!reportedIds.has(project.id)) return 'attention';
  return 'ontrack';
}

const HEALTH_META = {
  ontrack: { label: 'На треку', color: '#1E9E5D' },
  attention: { label: 'Потребують уваги', color: '#E8A33D' },
  risk: { label: 'Ризик затримки', color: '#D14343' },
};

export default function ProjectHealthCard() {
  const [buckets, setBuckets] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const todayI = todayIso();
      const since = addDaysIso(todayI, -1);
      const [projects, recentReports] = await Promise.all([
        fetchProjects(),
        fetchAllDailyReportsBetween(since, todayI),
      ]);
      if (cancelled) return;

      const activeProjects = projects.filter((p) => p.status === 'active');
      const reportedIds = new Set(recentReports.map((r) => r.project_id));
      const counts = { ontrack: 0, attention: 0, risk: 0 };
      activeProjects.forEach((p) => { counts[healthOf(p, reportedIds, todayI)]++; });

      setBuckets({ counts, total: activeProjects.length });
    }

    load();
    return () => { cancelled = true; };
  }, []);

  const total = buckets?.total ?? 0;
  const needsAttention = (buckets?.counts.attention ?? 0) + (buckets?.counts.risk ?? 0);

  return (
    <div className="pulse-card">
      <div className="pulse-card__head">
        <span className="pulse-card__title"><span className="pulse-card__ic">&#128737;&#65039;</span>Здоров&#39;я проєктів</span>
        <Link to="/projects" className="pulse-card__link">Всі проєкти &rarr;</Link>
      </div>

      {!buckets ? (
        <p className="sec-empty">Завантаження...</p>
      ) : total === 0 ? (
        <p className="sec-empty">Активних проєктів ще немає.</p>
      ) : (
        <>
          <div className="health-body">
            <DonutChart
              showLegend={false}
              centerValue={<div className="health-center"><b>{total}</b><span>проєктів</span></div>}
              slices={Object.entries(buckets.counts).map(([k, v]) => ({ label: HEALTH_META[k].label, value: v, color: HEALTH_META[k].color }))}
            />
            <div className="health-legend">
              {Object.entries(buckets.counts).map(([k, v]) => (
                <div className="health-legend__row" key={k}>
                  <span className="health-legend__dot" style={{ background: HEALTH_META[k].color }} />
                  <span className="health-legend__label">{HEALTH_META[k].label}</span>
                  <span className="health-legend__value">{v} ({total ? Math.round((v / total) * 100) : 0}%)</span>
                </div>
              ))}
            </div>
          </div>
          {needsAttention > 0 && (
            <Link to="/projects" className="health-cta">
              <span className="health-cta__ic">&#127919;</span>
              <span>
                <b>{needsAttention} {needsAttention === 1 ? 'проєкт потребує' : 'проєкти потребують'} вашої уваги</b>
                <br />Перегляньте деталі, щоб уникнути ризиків.
              </span>
              <span className="health-cta__arrow">&rarr;</span>
            </Link>
          )}
        </>
      )}
    </div>
  );
}
