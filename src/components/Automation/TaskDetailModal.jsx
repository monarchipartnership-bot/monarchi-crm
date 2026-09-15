import { useState } from 'react';
import TagInput from './TagInput';
import TaskSubtasks from './TaskSubtasks';
import { recurrenceLabel } from '../../lib/recurrenceLabel';
import { deriveTaskStatus, STATUS_LABELS } from '../../lib/taskStatus';
import { deriveDueStatus, DUE_STATUS_LABELS } from '../../lib/dueStatus';
import { DUE_STATUS_ICONS } from '../../lib/dueStatusIcons';
import { colorForTag } from '../../lib/tagColors';
import { FIELD_ICONS } from '../../lib/taskFieldIcons';

const PRIORITY_OPTIONS = [
  { value: '', label: 'Без пріоритету' },
  { value: 'high', label: 'Високий' },
  { value: 'medium', label: 'Середній' },
  { value: 'low', label: 'Низький' },
];

function profileLabel(p) {
  const full = `${p.first_name || ''} ${p.last_name || ''}`.trim();
  return full || p.email;
}

// Full view/edit surface for a task, opened from Weekly's "Календар тижня"
// board and from Daily's task rows — shared between both pages so viewing,
// editing, moving, cancelling and deleting a task work identically no
// matter where it was opened from. `mode` (view/move/cancel/edit) is local
// UI state, initialized from `initialMode` so a caller can jump straight
// into move/cancel (Daily's inline "Перенести"/"Скасувати" buttons do this)
// instead of always landing on the view screen first. Every actual mutation
// goes through the handlers the caller already has wired to its own task
// list (handleToggleDone/handleMove/handleDeleteSeries/handleSubtasksChange),
// plus two this modal needs: cancelling with a reason, and saving a batch
// of edited fields.
export default function TaskDetailModal({
  task, profile, assigneeOptions, initialMode,
  onClose, onToggleDone, onMove, onCancel, onDelete, onDeleteSeries, onSubtasksChange, onSaveEdits,
}) {
  const [mode, setMode] = useState(initialMode || 'view');
  const [moveDate, setMoveDate] = useState(task.task_date || '');
  const [moveReason, setMoveReason] = useState('');
  const [cancelReason, setCancelReason] = useState('');
  const [edit, setEdit] = useState({
    text: task.text,
    assignee_email: task.assignee_email || '',
    priority: task.priority || '',
    tags: task.tags || [],
  });
  const [saving, setSaving] = useState(false);

  const status = deriveTaskStatus(task);
  const dueStatus = deriveDueStatus(task);
  const done = status === 'done';

  function saveEdits() {
    setSaving(true);
    Promise.resolve(onSaveEdits(task, {
      text: edit.text.trim() || task.text,
      assignee_email: edit.assignee_email || null,
      priority: edit.priority || null,
      tags: edit.tags,
    })).finally(() => { setSaving(false); setMode('view'); });
  }

  return (
    <div className="tmodal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="tmodal-box task-detail-modal">
        <div className="tmodal-head">
          <h3>Задача</h3>
          <div className="task-detail-head-actions">
            {mode === 'view' && <button type="button" className="btn" onClick={() => setMode('edit')}>Редагувати</button>}
            <button type="button" className="tmodal-close" onClick={onClose} aria-label="Закрити">&times;</button>
          </div>
        </div>

        {mode !== 'edit' && (
          <div className="task-detail-actions">
            <button type="button" className={'btn' + (done ? ' btn-p' : '')} onClick={() => onToggleDone(task)}>
              {done ? '↺ Повернути' : '✓ Виконати'}
            </button>
            <button type="button" className="btn btn-move" onClick={() => setMode(mode === 'move' ? 'view' : 'move')}>⇄ Перенести</button>
            <button type="button" className="btn btn-danger" onClick={() => setMode(mode === 'cancel' ? 'view' : 'cancel')}>✕ Скасувати</button>
          </div>
        )}

        {mode === 'move' && (
          <div className="tmodal-body">
            <label>Новий день</label>
            <input type="date" value={moveDate} onChange={(e) => setMoveDate(e.target.value)} />
            <label>Причина переносу (необов'язково)</label>
            <textarea value={moveReason} onChange={(e) => setMoveReason(e.target.value)} placeholder="Вкажіть причину..." />
            <div className="task-detail-inline-actions">
              <button type="button" className="btn" onClick={() => setMode('view')}>Назад</button>
              <button type="button" className="btn btn-p" onClick={() => { onMove(task, moveDate, moveReason.trim()); setMode('view'); }} disabled={!moveDate}>Підтвердити</button>
            </div>
          </div>
        )}

        {mode === 'cancel' && (
          <div className="tmodal-body">
            <label>Причина скасування</label>
            <textarea value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} placeholder="Вкажіть причину..." />
            <div className="task-detail-inline-actions">
              <button type="button" className="btn" onClick={() => setMode('view')}>Назад</button>
              <button type="button" className="btn btn-p" onClick={() => { onCancel(task, cancelReason.trim()); onClose(); }}>Підтвердити скасування</button>
            </div>
          </div>
        )}

        {mode === 'edit' ? (
          <div className="tmodal-body">
            <label>Текст задачі</label>
            <textarea value={edit.text} onChange={(e) => setEdit((s) => ({ ...s, text: e.target.value }))} />

            <div className="task-detail-edit-fields">
              <div className="wk-field-box">
                <span className="wk-field-icon" dangerouslySetInnerHTML={{ __html: FIELD_ICONS.assignee }} />
                <div className="wk-field-body">
                  <label>Відповідальний</label>
                  <select
                    value={edit.assignee_email}
                    title={assigneeOptions.find((o) => o.value === edit.assignee_email)?.label || 'Не призначено'}
                    onChange={(e) => setEdit((s) => ({ ...s, assignee_email: e.target.value }))}
                  >
                    <option value="">Не призначено</option>
                    {assigneeOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
              </div>
              <div className="wk-field-box">
                <span className="wk-field-icon" dangerouslySetInnerHTML={{ __html: FIELD_ICONS.priority }} />
                <div className="wk-field-body">
                  <label>Пріоритет</label>
                  <select value={edit.priority} onChange={(e) => setEdit((s) => ({ ...s, priority: e.target.value }))}>
                    {PRIORITY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
              </div>
              <div className="wk-field-box wk-field-box-tag">
                <span className="wk-field-icon" dangerouslySetInnerHTML={{ __html: FIELD_ICONS.tag }} />
                <div className="wk-field-body">
                  <label>Теги</label>
                  <TagInput tags={edit.tags} onChange={(tags) => setEdit((s) => ({ ...s, tags }))} />
                </div>
              </div>
            </div>

            <div className="task-detail-inline-actions">
              <button type="button" className="btn" onClick={() => setMode('view')}>Скасувати</button>
              <button type="button" className="btn btn-p" onClick={saveEdits} disabled={saving}>{saving ? '...' : 'Зберегти'}</button>
            </div>
          </div>
        ) : (
          <div className="tmodal-body task-detail-view">
            <p className="wk-view-text">{task.text}</p>

            <TaskSubtasks
              subtasks={task.subtasks}
              onChange={(next) => onSubtasksChange(task, next)}
              forceOpen
            />

            <div className="task-detail-fields">
              <div className="task-detail-field">
                <span className="wk-field-icon" dangerouslySetInnerHTML={{ __html: FIELD_ICONS.assignee }} />
                <div className="task-detail-field-body">
                  <span>Відповідальний</span>
                  <b>{profile ? profileLabel(profile) : (task.assignee_email || '—')}</b>
                </div>
              </div>
              <div className="task-detail-field">
                <span className="wk-field-icon" dangerouslySetInnerHTML={{ __html: FIELD_ICONS.priority }} />
                <div className="task-detail-field-body">
                  <span>Пріоритет</span>
                  <b>{PRIORITY_OPTIONS.find((o) => o.value === (task.priority || ''))?.label}</b>
                </div>
              </div>
              <div className="task-detail-field">
                <span className="wk-field-icon" dangerouslySetInnerHTML={{ __html: FIELD_ICONS.status }} />
                <div className="task-detail-field-body">
                  <span>Статус</span>
                  <b>{STATUS_LABELS[status]}</b>
                </div>
              </div>
              <div className="task-detail-field">
                <span className={'due-badge ' + dueStatus} dangerouslySetInnerHTML={{ __html: DUE_STATUS_ICONS[dueStatus] }} />
                <div className="task-detail-field-body">
                  <span>Терміновість</span>
                  <b>{DUE_STATUS_LABELS[dueStatus]}</b>
                </div>
              </div>
              {task.recurrence_rule && (
                <div className="task-detail-field">
                  <span className="wk-field-icon" dangerouslySetInnerHTML={{ __html: FIELD_ICONS.repeat }} />
                  <div className="task-detail-field-body">
                    <span>Повторення</span>
                    <b>{recurrenceLabel(task.recurrence_rule)}</b>
                  </div>
                </div>
              )}
              {task.tags?.length > 0 && (
                <div className="task-detail-field">
                  <span className="wk-field-icon" dangerouslySetInnerHTML={{ __html: FIELD_ICONS.tag }} />
                  <div className="task-detail-field-body">
                    <span>Теги</span>
                    <div className="task-detail-tag-list">
                      {task.tags.map((tag) => <span key={tag} className="task-tag-chip" style={{ background: colorForTag(tag) }}>{tag}</span>)}
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="task-detail-del-row">
              <button type="button" className="task-series-del" onClick={() => { onDelete(task); onClose(); }}>
                Видалити задачу
              </button>
              {task.series_id && (
                <button type="button" className="task-series-del" onClick={() => { onDeleteSeries(task); onClose(); }}>
                  Видалити всю серію
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
