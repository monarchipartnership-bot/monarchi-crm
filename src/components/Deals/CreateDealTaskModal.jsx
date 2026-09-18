import { useState } from 'react';
import { createPortal } from 'react-dom';
import { createTask, updateTaskFields } from '../../lib/api/tasks';
import { createTaskAssignedNotification } from '../../lib/api/notifications';
import { FIELD_ICONS } from '../../lib/taskFieldIcons';
import Select from '../common/Select';
import DatePicker from '../common/DatePicker';
import TimePicker from '../common/TimePicker';
import DealPicker from './DealPicker';

const DIAMOND_ICON = '<svg viewBox="0 0 24 24"><path d="M12 2l10 10-10 10L2 12z"/></svg>';
const CROWN_ICON = '<svg viewBox="0 0 24 24"><path d="M4 8l4 3 4-6 4 6 4-3-1.5 10h-13z"/><path d="M6.5 19h11"/></svg>';

// Same fields/design/layout as the deal detail page's own "Задача"/"Дзвінок"
// popup (DealDetailModal.jsx) — the only two differences here are that the
// type itself is a choice inside the popup (rather than which of two pills
// opened it) and there's a deal to pick, since this isn't opened from
// inside one already.
const TYPE_META = {
  task: { label: 'Задача', title: 'Нова задача', editTitle: 'Редагувати задачу', sub: 'Створіть задачу, щоб нічого не пропустити', icon: 'checklist', addLabel: 'Додати задачу' },
  call: { label: 'Дзвінок', title: 'Новий дзвінок', editTitle: 'Редагувати дзвінок', sub: 'Заплануйте дзвінок, щоб нічого не пропустити', icon: 'phone', addLabel: 'Додати дзвінок' },
};

// A task can also carry activity_type 'email' (ACTIVITY_TYPES, api/tasks.js)
// even though nothing in the UI creates one that way yet — only used so
// editing such a task doesn't crash on a missing TYPE_META lookup; the type
// toggle below is hidden for it since switching into/out of 'email' isn't
// a supported flow.
const EMAIL_META = { label: 'Email', title: 'Email', editTitle: 'Редагувати email', sub: 'Деталі email-активності', icon: 'email', addLabel: 'Зберегти' };

function metaFor(type) { return type === 'email' ? EMAIL_META : (TYPE_META[type] || TYPE_META.task); }

const PRIORITY_CHIPS = [
  { value: 'high', label: 'Високий', color: '#DC2626', tint: '#FEE2E2' },
  { value: 'medium', label: 'Середній', color: '#D97706', tint: '#FEF3C7' },
  { value: 'low', label: 'Низький', color: '#16A34A', tint: '#DCFCE7' },
];

// `initDateTime(iso)` splits a scheduled_at timestamp back into the same
// separate date/time strings the form edits, in local time (matching how
// handleSubmit below re-composes them into an ISO string on save).
function initDateTime(iso) {
  if (!iso) return { date: '', time: '' };
  const d = new Date(iso);
  const p2 = (n) => String(n).padStart(2, '0');
  return {
    date: `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`,
    time: `${p2(d.getHours())}:${p2(d.getMinutes())}`,
  };
}

// `task` + `deal` (both required together) switch the modal into edit mode:
// prefilled from the existing row, deal is fixed (not pickable — editing a
// task doesn't move it to a different deal), and saving calls
// `updateTaskFields` instead of `createTask`. `onSaved(patch)` replaces
// `onCreated(row)` as the edit-mode completion callback.
export default function CreateDealTaskModal({ deals, profiles, myEmail, task, deal: fixedDeal, onClose, onCreated, onSaved }) {
  const editing = !!task;
  const initDT = editing ? initDateTime(task.scheduled_at) : { date: '', time: '' };
  const [type, setType] = useState(editing ? (task.activity_type || 'task') : 'task');
  const [deal, setDeal] = useState(editing ? fixedDeal : null);
  const [date, setDate] = useState(initDT.date);
  const [time, setTime] = useState(initDT.time);
  const [priority, setPriority] = useState(editing ? (task.priority || '') : '');
  const [text, setText] = useState(editing ? (task.text || '') : '');
  const [createdBy, setCreatedBy] = useState(editing ? (task.created_by_email || '') : (myEmail || ''));
  const [assignee, setAssignee] = useState(editing ? (task.assignee_email || '') : '');
  const [adding, setAdding] = useState(false);

  const meta = metaFor(type);

  async function handleSubmit() {
    const trimmed = text.trim();
    if (!trimmed || (!editing && !deal)) return;
    setAdding(true);
    try {
      const scheduledAt = !date ? null
        : type === 'call'
          ? new Date(`${date}T${time || '00:00'}`).toISOString()
          : new Date(date).toISOString();
      if (editing) {
        const patch = {
          text: trimmed, assignee_email: assignee || null, priority: priority || null,
          created_by_email: createdBy || null, activity_type: type, scheduled_at: scheduledAt,
        };
        await updateTaskFields(task.id, patch);
        // Only the person newly put on the task needs to hear about it — not
        // every edit, and not when the assignee stays the same.
        if (assignee && assignee !== task.assignee_email) {
          createTaskAssignedNotification({
            recipientEmail: assignee, senderEmail: createdBy || myEmail,
            dealId: deal?.id, taskId: task.id, noteExcerpt: trimmed,
            dealTitle: deal ? (deal.title || deal.clients?.company || deal.clients?.name || 'Угода') : null,
            clientLabel: deal ? (deal.clients?.name || deal.clients?.company || null) : null,
            scheduledAt, activityType: type,
          });
        }
        onSaved(patch);
      } else {
        const row = await createTask({
          text: trimmed, assigneeEmail: assignee, priority,
          departmentId: null, clientId: deal.client_id, dealId: deal.id,
          createdByEmail: createdBy || myEmail,
          activityType: type,
          scheduledAt,
        });
        createTaskAssignedNotification({
          recipientEmail: assignee, senderEmail: createdBy || myEmail,
          dealId: deal.id, taskId: row.id, noteExcerpt: trimmed,
          dealTitle: deal.title || deal.clients?.company || deal.clients?.name || 'Угода',
          clientLabel: deal.clients?.name || deal.clients?.company || null,
          scheduledAt, activityType: type,
        });
        onCreated(row);
      }
      onClose();
    } catch (e) {
      alert('Помилка збереження активності: ' + (e.message || e));
    } finally {
      setAdding(false);
    }
  }

  return createPortal(
    <div className="tmodal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="tmodal-box task-modal-box">
        <div className="tmodal-head">
          <div className="pipeline-modal-head">
            <span className="pipeline-modal-head-ic" dangerouslySetInnerHTML={{ __html: FIELD_ICONS[meta.icon] }} />
            <div>
              <h3>{editing ? meta.editTitle : meta.title}</h3>
              <p>{meta.sub}</p>
            </div>
          </div>
          <button type="button" className="tmodal-close" onClick={onClose} aria-label="Закрити">&times;</button>
        </div>
        <div className="tmodal-body">
          {/* Switching type is only a create-time choice — an existing task
              keeps its type on edit (and 'email' isn't a creatable type at
              all here, so there's nothing to toggle into/out of for it). */}
          {(!editing || type !== 'email') && (
            <div className="chan-tabs">
              {Object.entries(TYPE_META).map(([key, m]) => (
                <button key={key} type="button" className={'chan-tab' + (type === key ? ' active' : '')} onClick={() => setType(key)} disabled={editing}>
                  <span dangerouslySetInnerHTML={{ __html: FIELD_ICONS[m.icon] }} /> {m.label}
                </button>
              ))}
            </div>
          )}

          {/* Which deal a task belongs to isn't editable — only shown as a
              picker at create time. */}
          {!editing && (
            <div className="task-modal-section">
              <div className="task-modal-section-head">
                <span className="task-modal-section-ic" dangerouslySetInnerHTML={{ __html: FIELD_ICONS.pipeline }} />
                <div>
                  <div className="task-modal-section-title">Угода</div>
                  <div className="task-modal-section-sub">Оберіть угоду, до якої відноситься {type === 'call' ? 'дзвінок' : 'задача'}</div>
                </div>
              </div>
              <DealPicker value={deal?.id} onChange={setDeal} deals={deals} />
            </div>
          )}

          <div className="task-modal-grid">
            <div className="task-modal-section">
              <div className="task-modal-section-head">
                <span className="task-modal-section-ic" dangerouslySetInnerHTML={{ __html: FIELD_ICONS.day }} />
                <div>
                  <div className="task-modal-section-title">{type === 'call' ? 'Дата та час' : 'Дата'}</div>
                  <div className="task-modal-section-sub">Оберіть дату виконання задачі</div>
                </div>
              </div>
              <div className="wk-field-box wk-field-box-wide task-modal-input-box">
                <span className="wk-field-icon" dangerouslySetInnerHTML={{ __html: FIELD_ICONS.day }} />
                <div className="wk-field-body">
                  <div className="task-modal-datetime-row">
                    <DatePicker bare value={date} onChange={setDate} />
                    {type === 'call' && <TimePicker className="task-modal-time-input" value={time} onChange={setTime} />}
                  </div>
                </div>
              </div>
            </div>

            <div className="task-modal-section">
              <div className="task-modal-section-head">
                <span className="task-modal-section-ic" dangerouslySetInnerHTML={{ __html: DIAMOND_ICON }} />
                <div>
                  <div className="task-modal-section-title">Пріоритет</div>
                  <div className="task-modal-section-sub">Визначте важливість задачі</div>
                </div>
              </div>
              <div className="task-priority-chips">
                {PRIORITY_CHIPS.map((p) => {
                  const active = priority === p.value;
                  return (
                    <button
                      key={p.value} type="button" className={'task-priority-chip' + (active ? ' active' : '')}
                      style={active ? { background: p.tint, borderColor: p.color, color: p.color } : undefined}
                      onClick={() => setPriority(active ? '' : p.value)}
                    >
                      <span className="task-priority-dot" style={{ background: p.color }} />
                      {p.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="task-modal-section">
            <div className="task-modal-section-head">
              <span className="task-modal-section-ic" dangerouslySetInnerHTML={{ __html: FIELD_ICONS.document }} />
              <div>
                <div className="task-modal-section-title">{meta.label}</div>
                <div className="task-modal-section-sub">Опишіть, що потрібно зробити</div>
              </div>
            </div>
            <textarea
              className="task-modal-textarea" autoFocus
              value={text} onChange={(e) => setText(e.target.value)}
              placeholder="Що потрібно зробити..."
            />
          </div>

          <div className="task-modal-grid">
            <div className="task-modal-section">
              <div className="task-modal-section-head">
                <span className="task-modal-section-ic" dangerouslySetInnerHTML={{ __html: CROWN_ICON }} />
                <div>
                  <div className="task-modal-section-title">Хто ставить задачу</div>
                  <div className="task-modal-section-sub">Автор задачі</div>
                </div>
              </div>
              <Select value={createdBy} onChange={setCreatedBy} options={profiles.map((p) => ({ value: p.email, label: p.label }))} />
            </div>

            <div className="task-modal-section">
              <div className="task-modal-section-head">
                <span className="task-modal-section-ic" dangerouslySetInnerHTML={{ __html: FIELD_ICONS.assignee }} />
                <div>
                  <div className="task-modal-section-title">Кому призначено</div>
                  <div className="task-modal-section-sub">Виконавець задачі</div>
                </div>
              </div>
              <Select value={assignee} onChange={setAssignee} options={[{ value: '', label: 'Не призначено' }, ...profiles.map((p) => ({ value: p.email, label: p.label }))]} />
            </div>
          </div>
        </div>
        <div className="tmodal-foot">
          <button type="button" className="btn" onClick={onClose}>Скасувати</button>
          <button type="button" className="btn btn-p" onClick={handleSubmit} disabled={adding || !text.trim() || (!editing && !deal)}>
            <span dangerouslySetInnerHTML={{ __html: FIELD_ICONS[editing ? 'check' : 'plus'] }} />
            {adding ? (editing ? 'Зберігаємо...' : 'Додаємо...') : (editing ? 'Зберегти' : meta.addLabel)}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
