import { deriveTaskStatus } from '../../lib/taskStatus';
import TaskBadges from './TaskBadges';
import TaskSubtasks from './TaskSubtasks';

// Shared task row for Daily / Weekly / Monthly Tasks. The done/pending/moved/
// cancelled review status is conveyed by TaskBadges' due-status icon alone —
// no separate text pill (it used to duplicate the icon). `carriedIn` still
// shows a small neutral badge (a task planned for an earlier week that
// landed on a day within the currently-viewed week) — that's information the
// icon doesn't carry. `readOnly` (Monthly) drops all the interactive
// controls. `truncateText` clamps the text to one line (so cards stay a
// uniform size) and, paired with `onView`, makes the whole card clickable to
// open a full-text popup (the checkbox/date controls stop the click from
// also doing that). `hideDelete` drops just the inline delete button (the
// compact "Календар тижня" board card — deleting there now goes through the
// detail popup instead, both to declutter the card and because the button
// had no room left on narrow day columns). `profile` is the resolved
// assignee profile (or undefined). `onSubtasksChange` and `onDeleteSeries`
// are optional — omitting them (e.g. the Dashboard's read-only task lists)
// just drops those pieces rather than erroring.
export default function TaskRow({ task, profile, carriedIn, readOnly, truncateText, hideDelete, onView, onToggleDone, onMove, onDelete, onDeleteSeries, onSubtasksChange }) {
  const status = deriveTaskStatus(task);
  const done = status === 'done';

  return (
    <div className="task-row-wrap">
      <div
        className={'task-row status-' + status + (done ? ' done' : '') + (onView ? ' clickable' : '')}
        draggable={!readOnly}
        onDragStart={readOnly ? undefined : (e) => e.dataTransfer.setData('text/plain', String(task.id))}
        onClick={onView ? () => onView(task) : undefined}
      >
        {!readOnly && (
          <input
            type="checkbox"
            className="task-check"
            checked={done}
            onChange={() => onToggleDone(task)}
            onClick={(e) => e.stopPropagation()}
            aria-label={done ? 'Позначити як невиконане' : 'Позначити як виконане'}
          />
        )}
        <span className={'task-text' + (truncateText ? ' clamp' : '')}>{task.text}</span>

        <div className="task-row-meta">
          <TaskBadges task={task} profile={profile} />
          {carriedIn && <span className="status-pill carried" title="Перенесено з минулого тижня">З мин. тижня</span>}

          {!readOnly && (
            <span className="task-actions" onClick={(e) => e.stopPropagation()}>
              <input
                type="date"
                className="task-move"
                value={task.task_date || ''}
                onChange={(e) => e.target.value && onMove(task, e.target.value)}
                title="Перенести на інший день"
              />
              {!hideDelete && (
                <button type="button" className="task-del" onClick={() => onDelete(task)} aria-label="Видалити задачу">&times;</button>
              )}
            </span>
          )}
        </div>
      </div>

      <TaskSubtasks
        subtasks={task.subtasks}
        onChange={(next) => onSubtasksChange?.(task, next)}
        readOnly={readOnly || !onSubtasksChange}
      />

      {task.series_id && onDeleteSeries && (
        <button type="button" className="task-series-del" onClick={(e) => { e.stopPropagation(); onDeleteSeries(task); }}>
          Видалити всю серію
        </button>
      )}
    </div>
  );
}
