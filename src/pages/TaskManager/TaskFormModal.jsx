import { useEffect, useState } from 'react';
import Select from '../../components/common/Select';
import TagInput from '../../components/Automation/TagInput';
import { createTask, updateTaskFields } from '../../lib/api/tasks';
import { fetchTaskStages } from '../../lib/api/taskStages';
import { fetchTaskCategories, createTaskCategory } from '../../lib/api/taskCategories';
import { fetchAllProfiles, profileLabel } from '../../lib/api/profile';
import { colorForTag } from '../../lib/tagColors';
import { FIELD_ICONS } from '../../lib/taskFieldIcons';
import { todayIso } from '../../lib/dateHelpers';

const PRIORITY_OPTIONS = [
  { value: '', label: 'Без пріоритету' },
  { value: 'high', label: 'Високий' },
  { value: 'medium', label: 'Середній' },
  { value: 'low', label: 'Низький' },
];

// `tasks.text` stores title+description as one string, first line = title —
// same convention every list/kanban/calendar view already splits on
// (TaskListView.jsx, DailyCreate.jsx, etc.). Split it back apart here so
// the form can edit them as two distinct fields instead of one blob.
function splitText(text) {
  const idx = (text || '').indexOf('\n');
  return idx === -1 ? { title: text || '', description: '' } : { title: text.slice(0, idx), description: text.slice(idx + 1) };
}

// Create ("+ Додати задачу") or edit (`initial` given) a Task Manager task.
// `departments` is the full list (for the department picker); when opened
// from a specific department tab, `defaultDepartmentId` pre-selects it —
// switching departments re-fetches that department's own stages/categories,
// since each owns its own pipeline (see taskStages.js/taskCategories.js).
export default function TaskFormModal({
  initial, departments, defaultDepartmentId, defaultStageId, defaultAssigneeEmail, defaultTaskDate, onClose, onSaved,
}) {
  const [departmentId, setDepartmentId] = useState(initial?.department_id ?? defaultDepartmentId ?? departments[0]?.id ?? null);
  const [stageId, setStageId] = useState(initial?.stage_id ?? defaultStageId ?? null);
  const [stages, setStages] = useState([]);
  const [categories, setCategories] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [title, setTitle] = useState(() => splitText(initial?.text).title);
  const [description, setDescription] = useState(() => splitText(initial?.text).description);
  const [tags, setTags] = useState(initial?.tags || []);
  const [assigneeEmail, setAssigneeEmail] = useState(initial?.assignee_email || defaultAssigneeEmail || '');
  const [priority, setPriority] = useState(initial?.priority || '');
  const [taskDate, setTaskDate] = useState(initial?.task_date || defaultTaskDate || todayIso());
  const [saving, setSaving] = useState(false);

  useEffect(() => { fetchAllProfiles().then(setProfiles); }, []);

  useEffect(() => {
    if (!departmentId) { setStages([]); setCategories([]); return; }
    Promise.all([fetchTaskStages(departmentId), fetchTaskCategories(departmentId)]).then(([s, c]) => {
      setStages(s);
      setCategories(c);
      // Keep the currently-picked stage only if it still belongs to the
      // now-selected department — otherwise fall back to the first stage.
      setStageId((cur) => (s.some((st) => st.id === cur) ? cur : s[0]?.id ?? null));
    });
  }, [departmentId]);

  async function handleSave() {
    const trimmedTitle = title.trim();
    if (!trimmedTitle || !departmentId) return;
    const trimmedDescription = description.trim();
    const text = trimmedDescription ? `${trimmedTitle}\n${trimmedDescription}` : trimmedTitle;
    setSaving(true);
    try {
      if (initial) {
        await updateTaskFields(initial.id, {
          text, department_id: departmentId, stage_id: stageId, tags,
          assignee_email: assigneeEmail || null, priority: priority || null, task_date: taskDate || null,
        });
      } else {
        await createTask({
          text, departmentId, stageId, tags,
          assigneeEmail: assigneeEmail || null, priority: priority || null,
          plannedDate: taskDate || null, taskDate: taskDate || null,
        });
      }
      await onSaved();
      onClose();
    } finally {
      setSaving(false);
    }
  }

  const categoryColor = (label) => categories.find((c) => c.label === label)?.color || colorForTag(label);

  return (
    <div className="tmodal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="tmodal-box">
        <div className="tmodal-head">
          <div className="tmodal-head-left">
            <span className="tmodal-head-icon" style={{ background: 'linear-gradient(135deg, #A78BFA, #7C3AED)' }} dangerouslySetInnerHTML={{ __html: FIELD_ICONS.checklist }} />
            <div className="tmodal-head-text">
              <h3>{initial ? 'Редагувати задачу' : 'Додати задачу'}</h3>
              <p>{initial ? 'Оновіть інформацію про задачу' : 'Нова задача в Task Manager'}</p>
            </div>
          </div>
          <button type="button" className="tmodal-close" onClick={onClose} aria-label="Закрити">&times;</button>
        </div>
        <div className="tmodal-body">
          <div className="modal-field">
            <div className="modal-field-head">
              <span className="modal-field-icon" style={{ background: 'linear-gradient(135deg, #A78BFA, #7C3AED)' }} dangerouslySetInnerHTML={{ __html: FIELD_ICONS.title }} />
              <div><label>Заголовок</label><p>Коротка назва задачі — виділяється жирним у списку</p></div>
            </div>
            <div className="modal-field-control">
              <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Напр. Підготувати SEO-стратегію на Q2" autoFocus />
            </div>
          </div>

          <div className="modal-field">
            <div className="modal-field-head">
              <span className="modal-field-icon" style={{ background: 'linear-gradient(135deg, #818CF8, #4F46E5)' }} dangerouslySetInnerHTML={{ __html: FIELD_ICONS.document }} />
              <div><label>Опис</label><p>Додаткові деталі — необов'язково</p></div>
            </div>
            <div className="modal-field-control">
              <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Деталі, кроки, посилання..." />
            </div>
          </div>

          <div className="modal-field">
            <div className="modal-field-head">
              <span className="modal-field-icon" style={{ background: 'linear-gradient(135deg, #60A5FA, #2563EB)' }} dangerouslySetInnerHTML={{ __html: FIELD_ICONS.briefcase }} />
              <div><label>Відділ</label><p>Визначає доступні етапи та категорії</p></div>
            </div>
            <div className="modal-field-control">
              <Select value={departmentId} onChange={setDepartmentId} options={departments.map((d) => ({ value: d.id, label: d.name }))} />
            </div>
          </div>

          <div className="modal-field">
            <div className="modal-field-head">
              <span className="modal-field-icon" style={{ background: 'linear-gradient(135deg, #2DD4BF, #0D9488)' }} dangerouslySetInnerHTML={{ __html: FIELD_ICONS.status }} />
              <div><label>Етап</label><p>Стадія пайплайну обраного відділу</p></div>
            </div>
            <div className="modal-field-control">
              <Select value={stageId} onChange={setStageId} options={stages.map((s) => ({ value: s.id, label: s.label }))} disabled={!stages.length} />
            </div>
          </div>

          <div className="modal-field">
            <div className="modal-field-head">
              <span className="modal-field-icon" style={{ background: 'linear-gradient(135deg, #F472B6, #DB2777)' }} dangerouslySetInnerHTML={{ __html: FIELD_ICONS.tag }} />
              <div><label>Категорії</label><p>Власні для кожного відділу</p></div>
            </div>
            <div className="modal-field-control">
              <TagInput
                tags={tags} onChange={setTags}
                suggestions={categories.map((c) => c.label)}
                colorFor={categoryColor}
                onNewTag={(label) => { if (departmentId) createTaskCategory({ label, departmentId }).then((c) => c && setCategories((cs) => [...cs, c])); }}
                placeholder="Категорія..."
              />
            </div>
          </div>

          <div className="modal-field">
            <div className="modal-field-head">
              <span className="modal-field-icon" style={{ background: 'linear-gradient(135deg, #94A3B8, #475569)' }} dangerouslySetInnerHTML={{ __html: FIELD_ICONS.assignee }} />
              <div><label>Виконавець</label><p>Хто відповідає за задачу</p></div>
            </div>
            <div className="modal-field-control">
              <Select
                value={assigneeEmail} onChange={setAssigneeEmail} placeholder="Не призначено"
                options={[{ value: '', label: 'Не призначено' }, ...profiles.map((p) => ({ value: p.email, label: profileLabel(p) }))]}
              />
            </div>
          </div>

          <div className="modal-field">
            <div className="modal-field-head">
              <span className="modal-field-icon" style={{ background: 'linear-gradient(135deg, #FBBF24, #D97706)' }} dangerouslySetInnerHTML={{ __html: FIELD_ICONS.priority }} />
              <div><label>Пріоритет</label><p>Наскільки це термінова задача</p></div>
            </div>
            <div className="modal-field-control">
              <Select value={priority} onChange={setPriority} options={PRIORITY_OPTIONS} />
            </div>
          </div>

          <div className="modal-field">
            <div className="modal-field-head">
              <span className="modal-field-icon" style={{ background: 'linear-gradient(135deg, #F87171, #DC2626)' }} dangerouslySetInnerHTML={{ __html: FIELD_ICONS.day }} />
              <div><label>Дедлайн</label><p>Дата, на яку запланована задача</p></div>
            </div>
            <div className="modal-field-control">
              <input type="date" value={taskDate} onChange={(e) => setTaskDate(e.target.value)} />
            </div>
          </div>
        </div>
        <div className="tmodal-foot">
          <button type="button" className="btn" onClick={onClose}>
            <span dangerouslySetInnerHTML={{ __html: FIELD_ICONS.close }} /> Скасувати
          </button>
          <button type="button" className="btn btn-p" onClick={handleSave} disabled={!title.trim() || !departmentId || saving}>
            <span className="deal-action-ic deal-action-ic--ghost" dangerouslySetInnerHTML={{ __html: FIELD_ICONS.check }} /> {saving ? '...' : (initial ? 'Зберегти' : 'Додати')}
          </button>
        </div>
      </div>
    </div>
  );
}
