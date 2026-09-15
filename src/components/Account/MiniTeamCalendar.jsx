import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchLeaveForMonth, fetchProfilesByEmails } from '../../lib/api/leaveRequests';
import { MONTH_NAMES, daysInMonth, isoDate, todayIso } from '../../lib/dateHelpers';
import LeaveCard from '../Team/LeaveCard';

const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Нд'];

// Monday-start grid for the month — leading `null`s pad out to the first
// real day so the weekday columns line up.
function buildCells(year, month) {
  const total = daysInMonth(year, month);
  const dow = new Date(year, month - 1, 1).getDay();
  const leading = dow === 0 ? 6 : dow - 1;
  const cells = Array(leading).fill(null);
  for (let d = 1; d <= total; d++) cells.push(d);
  return cells;
}

export default function MiniTeamCalendar() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const monthStart = isoDate(year, month, 1);
  const monthEnd = isoDate(year, month, daysInMonth(year, month));
  const today = todayIso();

  const [rows, setRows] = useState([]);
  const [profiles, setProfiles] = useState({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await fetchLeaveForMonth(monthStart, monthEnd);
        if (cancelled) return;
        setRows(data);
        setProfiles(await fetchProfilesByEmails(data.map((r) => r.email)));
      } catch (e) {
        console.warn('loadMiniTeamCalendar failed', e);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monthStart, monthEnd]);

  const dotsByDay = {};
  rows.forEach((r) => {
    const from = r.date_start < monthStart ? monthStart : r.date_start;
    const to = r.date_end > monthEnd ? monthEnd : r.date_end;
    for (let d = new Date(from); isoDate(d.getFullYear(), d.getMonth() + 1, d.getDate()) <= to; d.setDate(d.getDate() + 1)) {
      const day = d.getDate();
      dotsByDay[day] ||= { vacation: false, sick: false };
      dotsByDay[day][r.type === 'sick' ? 'sick' : 'vacation'] = true;
    }
  });

  const onLeaveNow = rows.filter((r) => r.status === 'approved' && r.date_start <= today && today <= r.date_end);

  return (
    <div className="pulse-card mini-cal-card">
      <div className="pulse-card__head">
        <span className="pulse-card__title"><span className="pulse-card__ic">&#128197;</span>Календар команди</span>
        <Link to="/team/calendar" className="pulse-card__link">Переглянути повний календар &rarr;</Link>
      </div>

      <div className="mini-cal-month">{MONTH_NAMES[month - 1]} {year}</div>
      <div className="mini-cal-grid">
        {WEEKDAYS.map((w) => <div key={w} className="mini-cal-dow">{w}</div>)}
        {buildCells(year, month).map((d, i) => {
          if (d === null) return <div key={`b${i}`} className="mini-cal-cell mini-cal-cell--blank" />;
          const iso = isoDate(year, month, d);
          const dots = dotsByDay[d];
          return (
            <div key={d} className={'mini-cal-cell' + (iso === today ? ' is-today' : '')}>
              <span>{d}</span>
              {dots && (
                <span className="mini-cal-dots">
                  {dots.vacation && <span className="mini-cal-dot mini-cal-dot--vacation" />}
                  {dots.sick && <span className="mini-cal-dot mini-cal-dot--sick" />}
                </span>
              )}
            </div>
          );
        })}
      </div>

      <div className="mini-cal-legend">
        <span><span className="mini-cal-dot mini-cal-dot--vacation" />Відпустка</span>
        <span><span className="mini-cal-dot mini-cal-dot--sick" />Лікарняний</span>
      </div>

      <div className="mini-cal-away-label">Зараз не на роботі</div>
      <div className="leave-list">
        {onLeaveNow.length === 0 ? (
          <div className="leave-empty">Сьогодні вся команда на місці.</div>
        ) : (
          onLeaveNow.map((r) => <LeaveCard key={r.id} row={r} profile={profiles[r.email]} />)
        )}
      </div>
    </div>
  );
}
