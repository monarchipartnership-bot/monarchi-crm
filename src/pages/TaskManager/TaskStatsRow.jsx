import { Link } from 'react-router-dom';
import { FIELD_ICONS } from '../../lib/taskFieldIcons';

const SPARKLE_ICON = '<svg viewBox="0 0 24 24"><path d="M12 2l1.8 5.2L19 9l-5.2 1.8L12 16l-1.8-5.2L5 9l5.2-1.8z"/><path d="M19 15l.9 2.6L22.5 18.5l-2.6.9L19 22l-.9-2.6-2.6-.9 2.6-.9z"/></svg>';
const ARROW_RIGHT_ICON = '<svg viewBox="0 0 24 24"><path d="M5 12h14"/><path d="m13 6 6 6-6 6"/></svg>';

// Task Manager's own stats block — locked "solid white card" + gradient
// icon badge recipe (feedback_card_box_styles.md), not the older flat
// .dash-kpi look, since this is new work rather than a retrofit. 5 tiles
// computed client-side from whatever task set is already loaded (same
// convention as Automation/Dashboard.jsx's own stats), plus a CTA card
// linking to the separate analytics page (where Weekly/Monthly "live" now).
export default function TaskStatsRow({ tasks, stagesById }) {
  const total = tasks.length;
  const inProgress = tasks.filter((t) => {
    const stage = t.stage_id ? stagesById?.[t.stage_id] : null;
    return stage ? !stage.is_done && !stage.is_cancelled : t.status === 'pending';
  }).length;
  const todayIso = new Date().toISOString().slice(0, 10);
  const in7Days = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
  const planned = tasks.filter((t) => t.task_date && t.task_date >= todayIso && t.task_date <= in7Days).length;
  const overdue = tasks.filter((t) => {
    const stage = t.stage_id ? stagesById?.[t.stage_id] : null;
    const done = stage ? stage.is_done || stage.is_cancelled : t.status === 'done' || t.status === 'cancelled';
    return !done && t.task_date && t.task_date < todayIso;
  }).length;
  const done = tasks.filter((t) => {
    const stage = t.stage_id ? stagesById?.[t.stage_id] : null;
    return stage ? stage.is_done : t.status === 'done';
  }).length;
  const donePct = total > 0 ? Math.round((done / total) * 100) : 0;

  const tiles = [
    { key: 'total', label: 'Усього задач', value: total, sub: 'за обраним відділом', icon: FIELD_ICONS.checklist, gradient: 'linear-gradient(135deg, #A78BFA, #7C3AED)' },
    { key: 'progress', label: 'В роботі', value: inProgress, sub: total > 0 ? `${Math.round((inProgress / total) * 100)}% від усіх задач` : '—', icon: FIELD_ICONS.repeat, gradient: 'linear-gradient(135deg, #60A5FA, #2563EB)' },
    { key: 'planned', label: 'Заплановано', value: planned, sub: 'на найближчі 7 днів', icon: FIELD_ICONS.day, gradient: 'linear-gradient(135deg, #FBBF24, #D97706)' },
    { key: 'overdue', label: 'Просрочено', value: overdue, sub: 'потребують уваги', icon: FIELD_ICONS.priority, gradient: 'linear-gradient(135deg, #F87171, #DC2626)' },
    { key: 'done', label: 'Виконано', value: done, sub: `${donePct}% успішності`, icon: FIELD_ICONS.check, gradient: 'linear-gradient(135deg, #4ADE80, #16A34A)' },
  ];

  return (
    <div className="tm-stats-row">
      {tiles.map((t) => (
        <div className="tm-stat-card" key={t.key}>
          <span className="tm-stat-icon" style={{ background: t.gradient }} dangerouslySetInnerHTML={{ __html: t.icon }} />
          <div className="tm-stat-body">
            <div className="tm-stat-label">{t.label}</div>
            <div className="tm-stat-value">{t.value}</div>
            <div className="tm-stat-sub">{t.sub}</div>
          </div>
        </div>
      ))}
      <Link to="/tasks/analytics" className="tm-stat-cta">
        <span className="tm-stat-cta-ic" dangerouslySetInnerHTML={{ __html: SPARKLE_ICON }} />
        <div>
          <div className="tm-stat-cta-title">Детальний огляд <span dangerouslySetInnerHTML={{ __html: ARROW_RIGHT_ICON }} /></div>
          <div className="tm-stat-cta-sub">Аналітика, звіти та ефективність команди</div>
        </div>
      </Link>
    </div>
  );
}
