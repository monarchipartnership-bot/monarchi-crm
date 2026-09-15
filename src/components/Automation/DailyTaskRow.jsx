import { useEffect, useRef, useState } from 'react';
import TaskBadges from './TaskBadges';
import TaskSubtasks from './TaskSubtasks';
import { colorForTag } from '../../lib/tagColors';
import { iconForTag } from '../../lib/tagIcons';

// A pending task shows the three action buttons (done / move / cancel); a
// done task shows inline strikethrough plus an undo link back to pending —
// the done/pending state itself is conveyed by TaskBadges' due-status icon
// alone (no separate text pill, matching TaskRow). The row's own text is
// clickable to open the same TaskDetailModal a Weekly board card opens, for
// full view/edit access — the inline buttons stay as fast shortcuts.
//
// The leading colored icon reflects the task's primary tag (first entry in
// `task.tags`) — a quick visual anchor to scan cards by category. `text` is
// still a single field (no `description` column): a first line followed by
// a blank/newline renders as a bold title + a muted second line, purely a
// display split — single-line tasks (the majority) look exactly as before.
export default function DailyTaskRow({ task, profile, onView, onEdit, onToggleDone, onMove, onCancel, onDelete, onDeleteSeries, onSubtasksChange }) {
  const done = task.status === 'done';
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!menuOpen) return;
    function onDocClick(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [menuOpen]);

  const primaryTag = task.tags?.[0];
  const [title, ...descParts] = (task.text || '').split('\n');
  const description = descParts.join(' ').trim();

  return (
    <div className="task-row-wrap">
      <div
        className={'task-row daily-task-row' + (done ? ' done' : '') + (onView ? ' clickable' : '')}
        onClick={onView ? () => onView(task) : undefined}
      >
        <span
          className={'daily-task-icon' + (primaryTag ? '' : ' none')}
          style={primaryTag ? { background: colorForTag(primaryTag) } : undefined}
          dangerouslySetInnerHTML={{ __html: iconForTag(primaryTag) }}
        />

        <div className="daily-task-main">
          <span className="daily-task-title">{title}</span>
          {description && <span className="daily-task-desc">{description}</span>}
          <TaskBadges task={task} profile={profile} />
        </div>

        {done ? (
          <div className="dt-actions" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="dt-undo" onClick={() => onToggleDone(task)}>&#8630; Повернути</button>
          </div>
        ) : (
          <div className="dt-actions" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="dt-btn dt-btn-done" onClick={() => onToggleDone(task)}>&#10003; Виконано</button>
            <button type="button" className="dt-btn dt-btn-move" onClick={() => onMove(task)}>&#8631; Перенести</button>
            <button type="button" className="dt-btn dt-btn-cancel" onClick={() => onCancel(task)}>&#10005; Скасувати</button>
          </div>
        )}

        <div className="dt-menu-wrap" ref={menuRef} onClick={(e) => e.stopPropagation()}>
          <button type="button" className="dt-menu-btn" onClick={() => setMenuOpen((o) => !o)} aria-label="Ще дії">&#8942;</button>
          {menuOpen && (
            <div className="dt-menu-popover">
              {onEdit && <button type="button" onClick={() => { setMenuOpen(false); onEdit(task); }}>Редагувати</button>}
              <button type="button" className="danger" onClick={() => { setMenuOpen(false); onDelete(task); }}>Видалити</button>
              {task.series_id && onDeleteSeries && (
                <button type="button" className="danger" onClick={() => { setMenuOpen(false); onDeleteSeries(task); }}>Видалити всю серію</button>
              )}
            </div>
          )}
        </div>
      </div>

      <TaskSubtasks
        subtasks={task.subtasks}
        onChange={(next) => onSubtasksChange?.(task, next)}
        readOnly={!onSubtasksChange}
      />
    </div>
  );
}
