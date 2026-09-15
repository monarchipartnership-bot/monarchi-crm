import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchReportByDate } from '../../lib/api/dailyReports';
import { fetchProjects } from '../../lib/api/projects';
import { fetchAllDailyReportsForDate } from '../../lib/api/projectReports';
import { todayIso, addDaysIso } from '../../lib/dateHelpers';

function ymd(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return { y, m, d };
}
function dowOf(iso) {
  const { y, m, d } = ymd(iso);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}
function lastBusinessDayIso(todayI) {
  const dow = dowOf(todayI);
  const back = dow === 0 ? 2 : dow === 1 ? 3 : 1;
  return addDaysIso(todayI, -back);
}

// "вчора" when the missed day really is yesterday; a business only skips
// straight to "вчора" once a day, so this stays accurate day to day rather
// than guessing how many days something has been overdue.
function periodPhrase(targetIso, todayI) {
  return targetIso === addDaysIso(todayI, -1) ? 'був учора' : `був ${targetIso.split('-').reverse().slice(0, 2).join('.')}`;
}

async function safe(promise, fallback) {
  try { return await promise; } catch { return fallback; }
}

export default function OverdueReportsCard() {
  const [items, setItems] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const todayI = todayIso();
      const bizYesterdayI = lastBusinessDayIso(todayI);
      const { y, m, d } = ymd(bizYesterdayI);
      const phrase = periodPhrase(bizYesterdayI, todayI);

      const [salesYesterday, projects, pmYesterday] = await Promise.all([
        safe(fetchReportByDate(y, m, d), null),
        safe(fetchProjects(), []),
        safe(fetchAllDailyReportsForDate(bizYesterdayI), []),
      ]);
      if (cancelled) return;

      const activeProjects = projects.filter((p) => p.status === 'active');
      const reportedIds = new Set(pmYesterday.map((r) => r.project_id));

      const list = [];
      if (!salesYesterday) list.push({ key: 'sales', title: 'Щоденний звіт — команда Sales', dept: 'Sales', phrase });
      activeProjects.forEach((p) => {
        if (!reportedIds.has(p.id)) list.push({ key: `proj-${p.id}`, title: `Звіт по рекламі — «${p.name}»`, dept: 'Project Managers', phrase });
      });

      if (!cancelled) setItems(list);
    }

    load();
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="pulse-card">
      <div className="pulse-card__head">
        <span className="pulse-card__title"><span className="pulse-card__ic pulse-card__ic--danger">&#9200;</span>Прострочені звіти</span>
        <span className="pulse-card__count">{items ? `Всі ${items.length}` : ''}</span>
      </div>

      <div className="list-rows">
        {items === null && <p className="sec-empty">Завантаження...</p>}
        {items?.length === 0 && <p className="sec-empty">Немає прострочених звітів.</p>}
        {items?.map((it) => (
          <div className="list-row" key={it.key}>
            <span className="list-row__ic">&#128196;</span>
            <div className="list-row__body">
              <div className="list-row__title">{it.title}</div>
              <div className="list-row__sub">{it.dept}</div>
            </div>
            <span className="list-row__tag list-row__tag--danger">{it.phrase}</span>
          </div>
        ))}
      </div>

      <Link to="/reports/hub" className="pulse-card__cta">Перейти до звітів</Link>
    </div>
  );
}
