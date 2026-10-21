import { useState } from 'react';
import TagInput from './TagInput';
import TaskSubtasks from './TaskSubtasks';
import { recurrenceLabel } from '../../lib/recurrenceLabel';
import { deriveTaskStatus, STATUS_LABELS } from '../../lib/taskStatus';
import { deriveDueStatus, DUE_STATUS_LABELS } from '../../lib/dueStatus';
import { DUE_STATUS_ICONS } from '../../lib/dueStatusIcons';
import { colorForTag } from '../../lib/tagColors';
import { FIELD_ICONS } from '../../lib/taskFieldIcons';
import DatePicker from '../common/DatePicker';
import '../../styles/ddHub.css';
import '../../styles/taskDialogsHub.css';

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

  const firstLine = (task.text || '').split('\n')[0];
  const STATUS_TONE = { done: 'ok', pending: 'wa', moved: 'in', cancelled: 'bad', canceled: 'bad' };
  const DUE_TONE = { overdue: 'bad', due_today: 'wa', upcoming: 'in', no_date: 'mu', done: 'ok', cancelled: 'bad' };
  const closeIc = '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>';
  const field = (icon, label, control) => (
    <div className="thd-field">
      <div className="thd-field-head"><span className="thd-ic" dangerouslySetInnerHTML={{ __html: icon }} /><div><label>{label}</label></div></div>
      <div className="thd-field-control">{control}</div>
    </div>
  );
  const tile = (icon, label, value) => (
    <div className="thd-tile">
      <span className="thd-ic" dangerouslySetInnerHTML={{ __html: icon }} />
      <div><small>{label}</small><b>{value}</b></div>
    </div>
  );
  const goBack = () => setMode('view');

  return (
    <div className="tmodal-overlay thd-overlay" data-dd="hub" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="tmodal-box thd-dialog task-detail-modal" role="dialog" aria-modal="true" aria-labelledby="task-detail-title">
        <div className="thd-head thd-head--row">
          <span className={'thd-md thd-md--lg' + (mode === 'cancel' ? ' thd-md--bad' : '')}>
            <span className="thd-mi" dangerouslySetInnerHTML={{ __html: mode === 'cancel' ? FIELD_ICONS.close : FIELD_ICONS.checklist }} />
          </span>
          <div className="thd-head-text">
            <h3 id="task-detail-title">{mode === 'cancel' ? 'Скасування задачі' : mode === 'edit' ? 'Редагування задачі' : 'Задача'}</h3>
            <small>{mode === 'cancel' ? 'Вкажіть причину, її побачить команда' : firstLine}</small>
          </div>
          <div className="thd-head-actions">
            {mode === 'view' && (
              <button type="button" className="btn" onClick={() => setMode('edit')}><span dangerouslySetInnerHTML={{ __html: FIELD_ICONS.edit }} /> Редагувати</button>
            )}
            <button type="button" className="thd-close" onClick={onClose} aria-label="Закрити"><span dangerouslySetInnerHTML={{ __html: closeIc }} /></button>
          </div>
        </div>

        {(mode === 'view' || mode === 'move') && (
          <div className="thd-actions">
            <button type="button" className="btn thd-btn-ok" onClick={() => onToggleDone(task)}>
              <span dangerouslySetInnerHTML={{ __html: done ? FIELD_ICONS.undo : FIELD_ICONS.check }} /> {done ? 'Повернути' : 'Виконати'}
            </button>
            <button type="button" className={'btn' + (mode === 'move' ? ' thd-btn-on' : '')} onClick={() => setMode(mode === 'move' ? 'view' : 'move')}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7h11M15 4l3 3-3 3M17 17H6M9 14l-3 3 3 3" /></svg> Перенести
            </button>
            <button type="button" className="btn thd-btn-bad" onClick={() => setMode('cancel')}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5" /><path d="M6 6l12 12" /></svg> Скасувати
            </button>
          </div>
        )}

        {mode === 'move' && (
          <>
            <div className="thd-body">
              {field(FIELD_ICONS.day, 'Новий день', <DatePicker value={moveDate} onChange={setMoveDate} placeholder="Оберіть дату" />)}
              {field(FIELD_ICONS.document, 'Причина переносу', <textarea value={moveReason} onChange={(e) => setMoveReason(e.target.value)} placeholder="Вкажіть причину (необов'язково)..." />)}
            </div>
            <div className="thd-foot">
              <button type="button" className="btn" onClick={goBack}><span dangerouslySetInnerHTML={{ __html: FIELD_ICONS.undo }} /> Назад</button>
              <button type="button" className="btn thd-btn-ok" onClick={() => { onMove(task, moveDate, moveReason.trim()); setMode('view'); }} disabled={!moveDate}>
                <span dangerouslySetInnerHTML={{ __html: FIELD_ICONS.check }} /> Підтвердити
              </button>
            </div>
          </>
        )}

        {mode === 'cancel' && (
          <>
            <div className="thd-body">
              {field(FIELD_ICONS.document, 'Причина скасування', <textarea value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} placeholder="Вкажіть причину..." />)}
            </div>
            <div className="thd-foot">
              <button type="button" className="btn" onClick={goBack}><span dangerouslySetInnerHTML={{ __html: FIELD_ICONS.undo }} /> Назад</button>
              <button type="button" className="btn thd-btn-bad" onClick={() => { onCancel(task, cancelReason.trim()); onClose(); }}>
                <span dangerouslySetInnerHTML={{ __html: FIELD_ICONS.close }} /> Підтвердити скасування
              </button>
            </div>
          </>
        )}

        {mode === 'edit' && (
          <>
            <div className="thd-body thd-body--grid">
              <div className="thd-wide">{field(FIELD_ICONS.title, 'Текст задачі', <textarea value={edit.text} onChange={(e) => setEdit((st) => ({ ...st, text: e.target.value }))} />)}</div>
              {field(FIELD_ICONS.assignee, 'Відповідальний',
                <select
                  value={edit.assignee_email}
                  title={assigneeOptions.find((o) => o.value === edit.assignee_email)?.label || 'Не призначено'}
                  onChange={(e) => setEdit((st) => ({ ...st, assignee_email: e.target.value }))}
                >
                  <option value="">Не призначено</option>
                  {assigneeOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>)}
              {field(FIELD_ICONS.priority, 'Пріоритет',
                <select value={edit.priority} onChange={(e) => setEdit((st) => ({ ...st, priority: e.target.value }))}>
                  {PRIORITY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>)}
              <div className="thd-wide">{field(FIELD_ICONS.tag, 'Теги', <TagInput tags={edit.tags} onChange={(tags) => setEdit((st) => ({ ...st, tags }))} />)}</div>
            </div>
            <div className="thd-foot">
              <button type="button" className="btn thd-btn-bad" onClick={goBack}><span dangerouslySetInnerHTML={{ __html: FIELD_ICONS.close }} /> Скасувати</button>
              <button type="button" className="btn thd-btn-ok" onClick={saveEdits} disabled={saving}>
                <span dangerouslySetInnerHTML={{ __html: FIELD_ICONS.check }} /> {saving ? '...' : 'Зберегти'}
              </button>
            </div>
          </>
        )}

        {mode === 'view' && (
          <>
            <div className="thd-body task-detail-view">
              <div className="thd-text"><p>{task.text}</p></div>

              <TaskSubtasks
                subtasks={task.subtasks}
                onChange={(next) => onSubtasksChange(task, next)}
                forceOpen
              />

              <div className="thd-tiles">
                {tile(FIELD_ICONS.assignee, 'Відповідальний', profile ? profileLabel(profile) : (task.assignee_email || '—'))}
                {tile(FIELD_ICONS.priority, 'Пріоритет', PRIORITY_OPTIONS.find((o) => o.value === (task.priority || ''))?.label)}
                {tile(FIELD_ICONS.status, 'Статус', <span className={'thd-pill thd-pill--' + (STATUS_TONE[status] || 'mu')}><i />{STATUS_LABELS[status]}</span>)}
                {tile(FIELD_ICONS.day, 'Терміновість', <span className={'thd-pill thd-pill--' + (DUE_TONE[dueStatus] || 'mu')}><i />{DUE_STATUS_LABELS[dueStatus]}</span>)}
                {task.recurrence_rule && tile(FIELD_ICONS.repeat, 'Повторення', recurrenceLabel(task.recurrence_rule))}
                {task.tags?.length > 0 && (
                  <div className="thd-tile thd-tile--wide">
                    <span className="thd-ic" dangerouslySetInnerHTML={{ __html: FIELD_ICONS.tag }} />
                    <div>
                      <small>Теги</small>
                      <div className="task-detail-tag-list">
                        {task.tags.map((tag) => <span key={tag} className="task-tag-chip" style={{ background: colorForTag(tag) }}>{tag}</span>)}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
            <div className="thd-foot thd-foot--start">
              <button type="button" className="thd-del" onClick={() => { onDelete(task); onClose(); }}>
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4.5h6V7M6.5 7l1 13h9l1-13" /></svg> Видалити задачу
              </button>
              {task.series_id && (
                <button type="button" className="thd-del" onClick={() => { onDeleteSeries(task); onClose(); }}>
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4.5h6V7M6.5 7l1 13h9l1-13" /></svg> Видалити всю серію
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
