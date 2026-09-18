import { useMemo, useState } from 'react';
import { moveTaskStage } from '../../lib/api/taskStages';
import { colorForTag } from '../../lib/tagColors';
import { FIELD_ICONS } from '../../lib/taskFieldIcons';

function initials(email) { return (email || '?')[0].toUpperCase(); }

// Kanban card — same shape as Deals' DealCard.jsx (.deal-card*), reused
// as-is since it's already a generic "white card, name + sub + meta row +
// footer" layout, not deal-specific in its styling.
function TaskCard({ task, categories, onDragStart, onClick }) {
  const tagColor = (label) => categories.find((c) => c.label === label)?.color || colorForTag(label);
  const idx = (task.text || '').indexOf('\n');
  const title = idx === -1 ? task.text : task.text.slice(0, idx);
  const description = idx === -1 ? '' : task.text.slice(idx + 1);
  return (
    <div className="deal-card" draggable onDragStart={onDragStart} onClick={() => onClick(task)}>
      <div className="deal-card-name">{title}</div>
      {description && <div className="deal-card-sub">{description}</div>}
      {(task.tags || []).length > 0 && (
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 4 }}>
          {task.tags.map((tag) => (
            <span className="task-tag-chip" key={tag} style={{ background: tagColor(tag) }}>{tag}</span>
          ))}
        </div>
      )}
      <div className="deal-card-meta">
        {task.task_date && <span className="deal-card-date"><span dangerouslySetInnerHTML={{ __html: FIELD_ICONS.day }} />{task.task_date}</span>}
      </div>
      {task.assignee_email && (
        <div className="deal-card-footer">
          <span className="task-avatar">{initials(task.assignee_email)}</span>
          <span className="deal-card-manager">{task.assignee_email}</span>
        </div>
      )}
    </div>
  );
}

// Task Manager's kanban — direct port of DealsKanbanTab.jsx's drag/drop
// mechanics onto task_stages instead of deal_stages. Only ever rendered for
// one concrete department (its own caller hides the Kanban tab entirely on
// "Всі задачі", since different departments have different stage sets).
export default function TaskKanbanView({ tasks, stages, categories, reload, onAddTask, onManageStages, onViewTask }) {
  const [dragOverStage, setDragOverStage] = useState(null);
  const [cancelModal, setCancelModal] = useState(null); // { taskId, stage }
  const [cancelReason, setCancelReason] = useState('');

  const byStage = useMemo(() => {
    const map = {};
    stages.forEach((s) => { map[s.id] = []; });
    tasks.forEach((t) => { if (map[t.stage_id]) map[t.stage_id].push(t); });
    return map;
  }, [tasks, stages]);

  async function applyStageMove(taskId, stage, reason) {
    try {
      await moveTaskStage(taskId, stage, reason);
      reload();
    } catch (e) {
      alert('Помилка переносу задачі: ' + (e.message || e));
      reload();
    }
  }

  function handleDrop(e, stage) {
    e.preventDefault();
    setDragOverStage(null);
    const taskId = e.dataTransfer.getData('text/plain');
    if (!taskId) return;
    if (stage.is_cancelled) { setCancelModal({ taskId, stage }); setCancelReason(''); return; }
    applyStageMove(taskId, stage, null);
  }

  function confirmCancel() {
    if (!cancelModal) return;
    applyStageMove(cancelModal.taskId, cancelModal.stage, cancelReason.trim());
    setCancelModal(null);
  }

  return (
    <>
      <div className="deals-kanban-toolbar">
        <span className="sp" />
        <button type="button" className="btn" onClick={onManageStages}>Налаштувати етапи</button>
      </div>

      <div className="deals-board">
        {stages.map((stage) => (
          <div
            key={stage.id}
            className={'deals-column' + (dragOverStage === stage.id ? ' drag-over' : '')}
            style={{ '--stage-color': stage.color || '#7C3AED' }}
            onDragOver={(e) => { e.preventDefault(); setDragOverStage(stage.id); }}
            onDragLeave={() => setDragOverStage((cur) => (cur === stage.id ? null : cur))}
            onDrop={(e) => handleDrop(e, stage)}
          >
            <div className="deals-column-head">
              <span className="deals-column-label">
                <span className="deals-column-dot" style={{ background: stage.color || '#7C3AED' }} />
                {stage.label}
              </span>
              <span className="deals-column-count">{(byStage[stage.id] || []).length}</span>
            </div>
            <div className="deals-column-body">
              {(byStage[stage.id] || []).length === 0 && <div className="empty-hint">Немає задач</div>}
              {(byStage[stage.id] || []).map((task) => (
                <TaskCard
                  key={task.id}
                  task={task}
                  categories={categories}
                  onDragStart={(e) => e.dataTransfer.setData('text/plain', task.id)}
                  onClick={onViewTask}
                />
              ))}
            </div>
            <button type="button" className="wk-add-task-btn" onClick={() => onAddTask(stage.id)}>+ Додати задачу</button>
          </div>
        ))}
      </div>

      {cancelModal && (
        <div className="tmodal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setCancelModal(null); }}>
          <div className="tmodal-box">
            <div className="tmodal-head">
              <h3>Причина скасування</h3>
              <button type="button" className="tmodal-close" onClick={() => setCancelModal(null)} aria-label="Закрити">&times;</button>
            </div>
            <div className="tmodal-body">
              <label>Причина</label>
              <textarea value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} placeholder="Вкажіть причину..." autoFocus />
              <div className="task-detail-inline-actions">
                <button type="button" className="btn" onClick={() => setCancelModal(null)}>Назад</button>
                <button type="button" className="btn btn-p" onClick={confirmCancel}>Підтвердити</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
