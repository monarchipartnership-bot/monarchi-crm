import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchTasksForDay } from '../../lib/api/tasks';
import { deriveTaskStatus } from '../../lib/taskStatus';
import { todayIso } from '../../lib/dateHelpers';

export default function UrgentTasksCard() {
  const [tasks, setTasks] = useState(null);

  useEffect(() => {
    let cancelled = false;
    fetchTasksForDay(todayIso())
      .then((rows) => { if (!cancelled) setTasks(rows.filter((t) => deriveTaskStatus(t) === 'pending')); })
      .catch(() => { if (!cancelled) setTasks([]); });
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="pulse-card">
      <div className="pulse-card__head">
        <span className="pulse-card__title"><span className="pulse-card__ic pulse-card__ic--ok">&#9989;</span>Термінові задачі</span>
        <span className="pulse-card__count">{tasks ? `Всі ${tasks.length}` : ''}</span>
      </div>

      <div className="list-rows">
        {tasks === null && <p className="sec-empty">Завантаження...</p>}
        {tasks?.length === 0 && <p className="sec-empty">На сьогодні всі задачі виконано.</p>}
        {tasks?.slice(0, 5).map((t) => {
          const title = (t.text || '').split('\n')[0];
          return (
            <div className="list-row" key={t.id}>
              <span className="list-row__check" />
              <div className="list-row__body">
                <div className="list-row__title">{title}</div>
              </div>
              <span className="list-row__tag">Сьогодні</span>
            </div>
          );
        })}
      </div>

      <Link to="/automation/tasks/daily" className="pulse-card__cta">Відкрити Task Manager</Link>
    </div>
  );
}
