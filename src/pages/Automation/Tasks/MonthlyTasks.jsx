import { useEffect, useMemo, useState } from 'react';
import MonthProgressStepper from '../../../components/Automation/MonthProgressStepper';
import { fetchTasksForMonth } from '../../../lib/api/tasks';
import { MONTH_NAMES, computeWeeksForMonth, daysInMonth, isoDate, fmtDate, yearOptions, todayIso } from '../../../lib/dateHelpers';
import { deriveTaskStatus, STATUS_LABELS } from '../../../lib/taskStatus';
import { DUE_STATUS_ICONS } from '../../../lib/dueStatusIcons';
import { colorForTag } from '../../../lib/tagColors';
import { iconForTag } from '../../../lib/tagIcons';
import { SECTION_ICONS } from '../../../lib/reportIcons';
import { FIELD_ICONS } from '../../../lib/taskFieldIcons';
import '../../../styles/reportPage.css';
import '../../../styles/automationTasksPage.css';

// "Не виконано" (pending) / "Перенесено" (moved) icons — done/cancelled
// reuse dueStatusIcons, but that set doesn't cover this page's own
// done/pending/moved/cancelled model, so these two are local (same shape
// convention as elsewhere: moved reuses the trend-arrow already used on
// Daily Tasks' own stats bar).
const STATUS_TABLE_ICONS = {
  done: DUE_STATUS_ICONS.done,
  pending: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M9 9l6 6M15 9l-6 6"/></svg>',
  moved: '<svg viewBox="0 0 24 24"><path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/></svg>',
  cancelled: DUE_STATUS_ICONS.cancelled,
};
const STATUS_TABLE_COLORS = { done: 'var(--ok)', pending: 'var(--bad)', moved: 'var(--warn)', cancelled: 'var(--muted)' };

const PRIORITY_BADGE = {
  high: { label: 'Високий', color: 'var(--bad)' },
  medium: { label: 'Середній', color: 'var(--warn)' },
  low: { label: 'Низький', color: 'var(--purple)' },
};

const PAGE_SIZE_OPTIONS = [10, 25, 50];

function initialPeriod() {
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
}

export default function MonthlyTasks({ department = 'automation' }) {
  const [period, setPeriod] = useState(initialPeriod);
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [expandedIds, setExpandedIds] = useState(() => new Set());

  function toggleExpand(id) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  const startIso = isoDate(period.year, period.month, 1);
  const endIso = isoDate(period.year, period.month, daysInMonth(period.year, period.month));

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setPage(1);
    fetchTasksForMonth(startIso, endIso, department)
      .then((rows) => { if (!cancelled) setTasks(rows); })
      .catch((e) => console.warn('fetchTasksForMonth failed', e))
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [startIso, endIso, department]);

  const withStatus = useMemo(() => tasks.map((t) => ({ ...t, _status: deriveTaskStatus(t) })), [tasks]);
  const total = withStatus.length;
  const doneCount = withStatus.filter((t) => t._status === 'done').length;
  const pendingCount = withStatus.filter((t) => t._status === 'pending').length;
  const movedCount = withStatus.filter((t) => t._status === 'moved').length;
  const pct = (n) => (total ? Math.round((n / total) * 100) : 0);
  const completionPct = pct(doneCount);

  const today = todayIso();
  const weeks = computeWeeksForMonth(period.year, period.month);
  const weekRows = weeks.map((w) => {
    const startI = isoDate(w.start.getFullYear(), w.start.getMonth() + 1, w.start.getDate());
    const endI = isoDate(w.end.getFullYear(), w.end.getMonth() + 1, w.end.getDate());
    const inWeek = withStatus.filter((t) => t.planned_date >= startI && t.planned_date <= endI);
    const wDone = inWeek.filter((t) => t._status === 'done').length;
    return {
      index: w.index,
      label: `${fmtDate(w.start.getFullYear(), w.start.getMonth() + 1, w.start.getDate())}–${fmtDate(w.end.getFullYear(), w.end.getMonth() + 1, w.end.getDate())}`,
      total: inWeek.length,
      done: wDone,
      pending: inWeek.filter((t) => t._status === 'pending').length,
      moved: inWeek.filter((t) => t._status === 'moved').length,
      pct: inWeek.length ? Math.round((wDone / inWeek.length) * 100) : 0,
      isCurrent: today >= startI && today <= endI,
    };
  });

  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const pagedTasks = withStatus.slice((page - 1) * pageSize, page * pageSize);
  const rangeStart = total ? (page - 1) * pageSize + 1 : 0;
  const rangeEnd = Math.min(page * pageSize, total);

  return (
    <div className="report-page monthly-tasks-page">
      <section className="rpt-hero">
        <div className="rpt-hero-heading">
          <span className="rpt-hero-icon" dangerouslySetInnerHTML={{ __html: SECTION_ICONS['Задачі'] }} />
          <h1>Monthly Tasks</h1>
        </div>

        <div className="month-period-picker">
          <div className="wk-field-box">
            <span className="wk-field-icon" dangerouslySetInnerHTML={{ __html: FIELD_ICONS.day }} />
            <div className="wk-field-body">
              <label>Рік</label>
              <select value={period.year} onChange={(e) => setPeriod((p) => ({ ...p, year: +e.target.value }))}>
                {yearOptions().map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
          </div>
          <div className="wk-field-box">
            <span className="wk-field-icon" dangerouslySetInnerHTML={{ __html: FIELD_ICONS.day }} />
            <div className="wk-field-body">
              <label>Місяць</label>
              <select value={period.month} onChange={(e) => setPeriod((p) => ({ ...p, month: +e.target.value }))}>
                {MONTH_NAMES.map((name, i) => <option key={name} value={i + 1}>{name}</option>)}
              </select>
            </div>
          </div>
        </div>
      </section>

      {loading ? (
        <div className="empty-hint">Завантаження...</div>
      ) : (
        <>
          <div className="daily-stats-row month-stats-row">
            <div className="daily-stat-card">
              <span className="daily-stat-icon daily-stat-icon-total" dangerouslySetInnerHTML={{ __html: FIELD_ICONS.day }} />
              <div className="daily-stat-body">
                <span>Усього задач</span>
                <b>{total}</b>
                <em>Заплановано</em>
              </div>
            </div>
            <div className="daily-stat-card">
              <span className="daily-stat-icon daily-stat-icon-done" dangerouslySetInnerHTML={{ __html: DUE_STATUS_ICONS.done }} />
              <div className="daily-stat-body">
                <span>Виконано</span>
                <b>{doneCount}</b>
                <em>{pct(doneCount)}% від плану</em>
              </div>
            </div>
            <div className="daily-stat-card">
              <span className="daily-stat-icon daily-stat-icon-cancelled" dangerouslySetInnerHTML={{ __html: STATUS_TABLE_ICONS.pending }} />
              <div className="daily-stat-body">
                <span>Не виконано</span>
                <b>{pendingCount}</b>
                <em>{pct(pendingCount)}% від плану</em>
              </div>
            </div>
            <div className="daily-stat-card">
              <span className="daily-stat-icon daily-stat-icon-moved" dangerouslySetInnerHTML={{ __html: STATUS_TABLE_ICONS.moved }} />
              <div className="daily-stat-body">
                <span>Перенесено</span>
                <b>{movedCount}</b>
                <em>{pct(movedCount)}% від плану</em>
              </div>
            </div>
            <div className="daily-stat-card">
              <span className="daily-stat-icon daily-stat-icon-total" dangerouslySetInnerHTML={{ __html: FIELD_ICONS.status }} />
              <div className="daily-stat-body">
                <span>Виконання</span>
                <b>{completionPct}%</b>
                <em>{doneCount} з {total} задач</em>
              </div>
            </div>
          </div>

          <section className="report-section">
            <div className="stitle">Прогрес за місяць</div>
            <div className="month-section-body">
              <MonthProgressStepper weeks={weekRows} />
            </div>
          </section>

          <section className="report-section">
            <div className="stitle">По тижнях</div>
            <div className="month-week-grid">
              {weekRows.map((w) => (
                <div className="month-week-card" key={w.index}>
                  <div className="month-week-card-head">
                    <span className="wk-field-icon" dangerouslySetInnerHTML={{ __html: FIELD_ICONS.day }} />
                    <div>
                      <b>Тиждень {w.index}</b>
                      <span className="hint">{w.label}</span>
                    </div>
                  </div>
                  <div className="month-week-card-stats">
                    <span><i className="dot done" />{w.done} Виконано</span>
                    <span><i className="dot pending" />{w.pending} Не виконано</span>
                    <span><i className="dot moved" />{w.moved} Перенесено</span>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="report-section">
            <div className="stitle">Усі задачі за місяць</div>
            <div className="month-section-body">
            {total === 0 ? (
              <div className="empty-hint">За цей місяць ще немає задач.</div>
            ) : (
              <>
                <div className="month-table-wrap">
                  <table className="month-task-table">
                    <thead>
                      <tr>
                        <th className="ic"></th>
                        <th>Задача</th>
                        <th>Тег</th>
                        <th>Пріоритет</th>
                        <th>Статус</th>
                        <th>Дата</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pagedTasks.map((task) => {
                        const primaryTag = task.tags?.[0];
                        const priority = PRIORITY_BADGE[task.priority];
                        const expanded = expandedIds.has(task.id);
                        return (
                          <tr key={task.id} className="month-task-row" onClick={() => toggleExpand(task.id)} title="Натисніть, щоб розгорнути повний текст">
                            <td className="ic">
                              <span
                                className={'month-task-icon' + (primaryTag ? '' : ' none')}
                                style={primaryTag ? { background: colorForTag(primaryTag) } : undefined}
                                dangerouslySetInnerHTML={{ __html: iconForTag(primaryTag) }}
                              />
                            </td>
                            <td className={'month-task-text' + (expanded ? ' expanded' : '')}>{task.text}</td>
                            <td>
                              {task.tags?.length ? (
                                <div className="month-task-tags">
                                  {task.tags.map((tag) => (
                                    <span key={tag} className="task-tag-chip" style={{ background: colorForTag(tag) }}>{tag}</span>
                                  ))}
                                </div>
                              ) : '—'}
                            </td>
                            <td>
                              {priority ? <span className="month-badge" style={{ color: priority.color, borderColor: priority.color }}>{priority.label}</span> : '—'}
                            </td>
                            <td>
                              <span className="month-status-cell" style={{ color: STATUS_TABLE_COLORS[task._status] }}>
                                <span className="month-status-ic" dangerouslySetInnerHTML={{ __html: STATUS_TABLE_ICONS[task._status] }} />
                                {STATUS_LABELS[task._status]}
                              </span>
                            </td>
                            <td className="month-task-date">{fmtDate(...task.planned_date.split('-').map(Number))}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="month-pagination">
                  <div className="month-pagination-size">
                    <label>Показати:</label>
                    <select value={pageSize} onChange={(e) => { setPageSize(+e.target.value); setPage(1); }}>
                      {PAGE_SIZE_OPTIONS.map((n) => <option key={n} value={n}>{n}</option>)}
                    </select>
                  </div>
                  <div className="month-pagination-hint">{rangeStart}-{rangeEnd} з {total} задач</div>
                  <div className="month-pagination-pages">
                    <button type="button" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} aria-label="Попередня сторінка">&#8249;</button>
                    {Array.from({ length: pageCount }, (_, i) => i + 1).map((n) => (
                      <button key={n} type="button" className={n === page ? 'on' : ''} onClick={() => setPage(n)}>{n}</button>
                    ))}
                    <button type="button" onClick={() => setPage((p) => Math.min(pageCount, p + 1))} disabled={page === pageCount} aria-label="Наступна сторінка">&#8250;</button>
                  </div>
                </div>
              </>
            )}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
