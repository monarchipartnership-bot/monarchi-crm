import { useEffect, useState } from 'react';
import Select from '../../components/common/Select';
import DatePicker from '../../components/common/DatePicker';
import TagInput from '../../components/Automation/TagInput';
import { createTask, updateTaskFields } from '../../lib/api/tasks';
import { fetchTaskStages } from '../../lib/api/taskStages';
import { fetchTaskCategories, createTaskCategory } from '../../lib/api/taskCategories';
import { fetchAllProfiles, profileLabel } from '../../lib/api/profile';
import { colorForTag } from '../../lib/tagColors';
import { FIELD_ICONS } from '../../lib/taskFieldIcons';
import { todayIso } from '../../lib/dateHelpers';
import '../../styles/ddHub.css';
import '../../styles/taskDialogsHub.css';

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
  const [section, setSection] = useState(0);

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

  const sections = [
    { key: 'task', label: 'Задача', sub: 'Назва й опис', icon: FIELD_ICONS.document },
    { key: 'plan', label: 'Планування', sub: 'Відділ, етап, категорії', icon: FIELD_ICONS.briefcase },
    { key: 'work', label: 'Виконання', sub: 'Виконавець, пріоритет, дедлайн', icon: FIELD_ICONS.assignee },
  ];
  const cur = sections[section];
  const field = (icon, label, hint, control) => (
    <div className="thd-field">
      <div className="thd-field-head">
        <span className="thd-ic" dangerouslySetInnerHTML={{ __html: icon }} />
        <div><label>{label}</label><p>{hint}</p></div>
      </div>
      <div className="thd-field-control">{control}</div>
    </div>
  );

  return (
    <div className="tmodal-overlay thd-overlay" data-dd="hub" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="tmodal-box thd-dialog thd-dialog--side" role="dialog" aria-modal="true" aria-labelledby="task-form-title">
        <aside className="thd-rail">
          <div className="thd-brand">
            <span className="thd-md thd-md--lg"><span className="thd-mi" dangerouslySetInnerHTML={{ __html: FIELD_ICONS.checklist }} /></span>
            <div><b id="task-form-title">{initial ? 'Редагувати задачу' : 'Нова задача'}</b><small>Task Manager</small></div>
          </div>
          <nav className="thd-nav" aria-label="Розділи форми">
            {sections.map((sec, i) => (
              <button key={sec.key} type="button" className={'thd-rn' + (i === section ? ' on' : '')} aria-current={i === section ? 'true' : undefined} onClick={() => setSection(i)}>
                <span className="thd-md thd-md--sm"><span className="thd-mi" dangerouslySetInnerHTML={{ __html: sec.icon }} /></span>
                <span>{sec.label}</span>
              </button>
            ))}
          </nav>
          <div className="thd-note">Заголовок і відділ обов'язкові, решту можна заповнити пізніше.</div>
        </aside>
        <div className="thd-main">
          <div className="thd-head">
            <div><h3>{cur.label}</h3><small>{cur.sub}</small></div>
            <button type="button" className="thd-close" onClick={onClose} aria-label="Закрити"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg></button>
          </div>
          <div className="thd-body">
            {section === 0 && (
              <>
                {field(FIELD_ICONS.title, 'Заголовок', 'Коротка назва задачі, виділяється жирним у списку',
                  <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Напр. Підготувати SEO-стратегію на Q2" autoFocus />)}
                {field(FIELD_ICONS.document, 'Опис', "Додаткові деталі, необов'язково",
                  <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Деталі, кроки, посилання..." />)}
              </>
            )}
            {section === 1 && (
              <>
                {field(FIELD_ICONS.briefcase, 'Відділ', 'Визначає доступні етапи та категорії',
                  <Select value={departmentId} onChange={setDepartmentId} options={departments.map((d) => ({ value: d.id, label: d.name }))} />)}
                {field(FIELD_ICONS.status, 'Етап', 'Стадія пайплайну обраного відділу',
                  <Select value={stageId} onChange={setStageId} options={stages.map((st) => ({ value: st.id, label: st.label }))} disabled={!stages.length} />)}
                {field(FIELD_ICONS.tag, 'Категорії', 'Власні для кожного відділу',
                  <TagInput
                    tags={tags} onChange={setTags}
                    suggestions={categories.map((c) => c.label)}
                    colorFor={categoryColor}
                    onNewTag={(label) => { if (departmentId) createTaskCategory({ label, departmentId }).then((c) => c && setCategories((cs) => [...cs, c])); }}
                    placeholder="Категорія..."
                  />)}
              </>
            )}
            {section === 2 && (
              <>
                {field(FIELD_ICONS.assignee, 'Виконавець', 'Хто відповідає за задачу',
                  <Select
                    value={assigneeEmail} onChange={setAssigneeEmail} placeholder="Не призначено"
                    options={[{ value: '', label: 'Не призначено' }, ...profiles.map((p) => ({ value: p.email, label: profileLabel(p) }))]}
                  />)}
                {field(FIELD_ICONS.priority, 'Пріоритет', 'Наскільки це термінова задача',
                  <Select value={priority} onChange={setPriority} options={PRIORITY_OPTIONS} />)}
                {field(FIELD_ICONS.day, 'Дедлайн', 'Дата, на яку запланована задача',
                  <DatePicker value={taskDate} onChange={setTaskDate} placeholder="Оберіть дату" />)}
              </>
            )}
          </div>
          <div className="thd-foot">
            <button type="button" className="btn thd-btn-bad" onClick={onClose}>
              <span dangerouslySetInnerHTML={{ __html: FIELD_ICONS.close }} /> Скасувати
            </button>
            <button type="button" className="btn thd-btn-ok" onClick={handleSave} disabled={!title.trim() || !departmentId || saving}>
              <span dangerouslySetInnerHTML={{ __html: FIELD_ICONS.check }} /> {saving ? '...' : (initial ? 'Зберегти' : 'Додати')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
