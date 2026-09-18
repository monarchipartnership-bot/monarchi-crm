import { useState } from 'react';
import { deleteTask } from '../../lib/api/tasks';
import { colorForTag } from '../../lib/tagColors';
import { stagePillStyle } from '../../lib/stagePillStyle';
import { FIELD_ICONS } from '../../lib/taskFieldIcons';

// Task Manager's list — reuses the exact click-to-expand row mechanics
// built for Daily Report's Клієнти/Задачі lists (.client-grid-row +
// .daily-list-row-main/-actions, reportPage.css), scoped under
// .tm-task-grid so it gets its own column set. Shows a Відділ column only
// on "Всі задачі" (departmentId === null), since a single-department view
// already has that context from the active tab.
export default function TaskListView({ tasks, stagesById, departmentsById, categoriesByDept, showDepartment, onEdit, reload }) {
  const [expandedId, setExpandedId] = useState(null);

  async function handleDelete(e, task) {
    e.stopPropagation();
    if (!confirm(`Видалити задачу «${task.text}»?`)) return;
    await deleteTask(task.id);
    reload();
  }

  const tagColor = (task, label) => {
    const cats = categoriesByDept?.[task.department_id] || [];
    return cats.find((c) => c.label === label)?.color || colorForTag(label);
  };

  return (
    <div className={'client-grid tm-task-grid' + (showDepartment ? ' tm-task-grid--all' : '')}>
      <div className="client-grid-header">
        <div>Задача</div>
        {showDepartment && <div>Відділ</div>}
        <div>Категорії</div>
        <div>Виконавець</div>
        <div>Дедлайн</div>
        <div>Етап</div>
      </div>
      {tasks.length === 0 && <div className="empty-hint">Немає задач</div>}
      {tasks.map((task) => {
        const expanded = expandedId === task.id;
        const stage = stagesById?.[task.stage_id];
        const dept = departmentsById?.[task.department_id];
        const [title, ...descParts] = (task.text || '').split('\n');
        const description = descParts.join(' ').trim();
        return (
          <div
            key={task.id}
            className={'client-grid-row' + (expanded ? ' expanded' : '')}
            onClick={() => setExpandedId((cur) => (cur === task.id ? null : task.id))}
          >
            <div className="daily-list-row-main">
              <div className="client-grid-name-cell">
                <div className="client-grid-name-text">
                  <div className="ink">{title}</div>
                  {description && <div className="client-grid-subtitle">{description}</div>}
                </div>
              </div>
              {showDepartment && (
                <div className="tm-task-grid-dept">
                  <span className="tm-task-grid-dept-dot" style={{ background: dept?.color || '#94A3B8' }} />
                  {dept?.name || '—'}
                </div>
              )}
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                {(task.tags || []).map((tag) => (
                  <span className="task-tag-chip" key={tag} style={{ background: tagColor(task, tag) }}>{tag}</span>
                ))}
              </div>
              <div className="client-grid-subtitle">{task.assignee_email || '—'}</div>
              <div className="client-grid-subtitle">{task.task_date || '—'}</div>
              <span className="client-grid-badge client-grid-status-badge" style={stagePillStyle(stage?.color)}>
                <span className="client-grid-status-dot" style={{ background: 'rgba(255,255,255,.7)' }} />
                {stage?.label || '—'}
              </span>
            </div>
            <div className="daily-list-row-actions">
              <button
                type="button" className="deal-field-icon-btn" title="Редагувати"
                onClick={(e) => { e.stopPropagation(); onEdit(task); }}
                dangerouslySetInnerHTML={{ __html: FIELD_ICONS.edit }}
              />
              <button
                type="button" className="deal-field-icon-btn" title="Видалити"
                onClick={(e) => handleDelete(e, task)}
                dangerouslySetInnerHTML={{ __html: FIELD_ICONS.close }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
