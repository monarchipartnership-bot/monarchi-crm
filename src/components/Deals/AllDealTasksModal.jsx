import { useEffect, useMemo, useState } from 'react';
import { fetchAllDealTasks, setTaskStatus, ACTIVITY_TYPES } from '../../lib/api/tasks';
import { fetchAllDeals } from '../../lib/api/deals';
import { FIELD_ICONS } from '../../lib/taskFieldIcons';

function profileLabel(profiles, email) {
  return profiles.find((p) => p.email === email)?.label || email;
}

function activityIcon(type) {
  return FIELD_ICONS[ACTIVITY_TYPES.find((t) => t.value === type)?.icon || 'checklist'];
}

function fmtActivityTime(iso) {
  if (!iso) return null;
  return new Date(iso).toLocaleString('uk-UA', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

// A cross-deal task inbox — every task linked to any deal, across every
// pipeline, so a manager can see what's outstanding without opening each
// deal card one by one. Each task only stores a bare deal_id, so this fetches
// every deal once and joins client-side rather than adding a second round
// trip per task.
export default function AllDealTasksModal({ profiles, onClose }) {
  const [loading, setLoading] = useState(true);
  const [tasks, setTasks] = useState([]);
  const [deals, setDeals] = useState([]);
  const [showDone, setShowDone] = useState(false);

  function reload() {
    setLoading(true);
    Promise.all([fetchAllDealTasks(), fetchAllDeals()])
      .then(([t, d]) => { setTasks(t); setDeals(d); })
      .finally(() => setLoading(false));
  }

  useEffect(() => { reload(); }, []);

  const dealsById = useMemo(() => {
    const map = {};
    deals.forEach((d) => { map[d.id] = d; });
    return map;
  }, [deals]);

  const visibleTasks = useMemo(
    () => tasks.filter((t) => (showDone ? true : t.status !== 'done') && t.status !== 'cancelled'),
    [tasks, showDone],
  );

  async function handleToggleDone(task) {
    const next = task.status === 'done' ? 'pending' : 'done';
    setTasks((t) => t.map((it) => (it.id === task.id ? { ...it, status: next } : it)));
    await setTaskStatus(task.id, next);
  }

  return (
    <div className="tmodal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="tmodal-box deal-tasks-modal">
        <div className="tmodal-head">
          <h3>Задачі по угодах</h3>
          <button type="button" className="tmodal-close" onClick={onClose} aria-label="Закрити">&times;</button>
        </div>
        <div className="tmodal-body">
          <label className="task-recur-toggle" style={{ alignSelf: 'flex-end' }}>
            <input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} />
            Показати виконані
          </label>

          {loading ? (
            <p className="client-history-empty">Завантаження…</p>
          ) : visibleTasks.length === 0 ? (
            <p className="client-history-empty">Задач по угодах ще немає.</p>
          ) : (
            <div className="client-history-list">
              {visibleTasks.map((t) => {
                const deal = dealsById[t.deal_id];
                const dealLabel = deal ? (deal.title || deal.clients?.company || deal.clients?.name || 'Угода') : 'Угода видалена';
                return (
                  <div className="client-history-item" key={t.id}>
                    <label className="task-recur-toggle">
                      <input type="checkbox" checked={t.status === 'done'} onChange={() => handleToggleDone(t)} />
                      <span className="deal-activity-icon" dangerouslySetInnerHTML={{ __html: activityIcon(t.activity_type) }} />
                      <span className={t.status === 'done' ? 'task-text done' : ''}>{(t.text || '').split('\n')[0]}</span>
                      {t.scheduled_at && <span className="deal-activity-time">{fmtActivityTime(t.scheduled_at)}</span>}
                    </label>
                    <div className="client-history-text">
                      {dealLabel}
                      {deal?.pipelines?.name && <span className="client-history-author"> · {deal.pipelines.name}</span>}
                      {t.assignee_email && <span className="client-history-author"> · {profileLabel(profiles, t.assignee_email)}</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        <div className="tmodal-foot">
          <button type="button" className="btn btn-p" onClick={onClose}>Готово</button>
        </div>
      </div>
    </div>
  );
}
