import { useState } from 'react';
import { MONTH_NAMES, daysInMonth, isoDate, todayIso } from '../../lib/dateHelpers';

const LEFT_ICON = '<svg viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6"/></svg>';
const RIGHT_ICON = '<svg viewBox="0 0 24 24"><path d="M9 18l6-6-6-6"/></svg>';
const MAX_VISIBLE = 3;

function buildCells(year, month) {
  const total = daysInMonth(year, month);
  const dow = new Date(year, month - 1, 1).getDay();
  const leading = dow === 0 ? 6 : dow - 1;
  const cells = Array(leading).fill(null);
  for (let d = 1; d <= total; d++) cells.push(d);
  return cells;
}

// Task Manager's calendar — grid of task_date-grouped chips, one month at a
// time. No existing task calendar to reuse (TeamCalendar.jsx's grid is
// dot-only, for leave requests); this is new.
export default function TaskCalendarView({ tasks, stagesById, onEditTask }) {
  const [period, setPeriod] = useState(() => { const n = new Date(); return { year: n.getFullYear(), month: n.getMonth() + 1 }; });

  function shiftMonth(delta) {
    setPeriod((p) => {
      let month = p.month + delta;
      let year = p.year;
      if (month < 1) { month = 12; year -= 1; }
      if (month > 12) { month = 1; year += 1; }
      return { year, month };
    });
  }

  const byDay = {};
  tasks.forEach((t) => { if (t.task_date) (byDay[t.task_date] ||= []).push(t); });
  const today = todayIso();
  const monthLabel = `${MONTH_NAMES[period.month - 1]} ${period.year}`;

  return (
    <div>
      <div className="tm-cal-toolbar">
        <button type="button" className="tm-cal-nav-btn" onClick={() => shiftMonth(-1)} dangerouslySetInnerHTML={{ __html: LEFT_ICON }} />
        <h3>{monthLabel}</h3>
        <button type="button" className="tm-cal-nav-btn" onClick={() => shiftMonth(1)} dangerouslySetInnerHTML={{ __html: RIGHT_ICON }} />
      </div>
      <div className="tm-cal-grid">
        {['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Нд'].map((w) => <div key={w} className="tm-cal-dow">{w}</div>)}
        {buildCells(period.year, period.month).map((d, i) => {
          if (d === null) return <div key={`b${i}`} className="tm-cal-cell tm-cal-cell--blank" />;
          const iso = isoDate(period.year, period.month, d);
          const dayTasks = byDay[iso] || [];
          return (
            <div key={d} className={'tm-cal-cell' + (iso === today ? ' is-today' : '')}>
              <span className="tm-cal-cell-day">{d}</span>
              {dayTasks.slice(0, MAX_VISIBLE).map((t) => {
                const stage = stagesById?.[t.stage_id];
                const title = (t.text || '').split('\n')[0];
                return (
                  <button
                    type="button" key={t.id} className="tm-cal-task-chip"
                    style={{ background: stage?.color || '#7C3AED' }}
                    title={t.text}
                    onClick={() => onEditTask(t)}
                  >
                    {title}
                  </button>
                );
              })}
              {dayTasks.length > MAX_VISIBLE && <span className="tm-cal-more">+{dayTasks.length - MAX_VISIBLE} ще</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
