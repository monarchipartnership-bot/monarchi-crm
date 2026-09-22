import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { updateDealFields, moveDealStage, deleteDeal, duplicateDeal, archiveDeal } from '../../lib/api/deals';
import { updateClientDirectoryEntry } from '../../lib/api/clients';
import { fetchTasksForDeal, createTask, setTaskStatus, deleteTask, ACTIVITY_TYPES } from '../../lib/api/tasks';
import { fetchDealParticipants, addDealParticipant, removeDealParticipant } from '../../lib/api/dealParticipants';
import { fetchDealNotes, addDealNote, setNotePinned, deleteDealNote } from '../../lib/api/dealNotes';
import { uploadDealNoteImage } from '../../lib/api/dealNoteImages';
import { createMentionNotification, createTaskAssignedNotification } from '../../lib/api/notifications';
import { buildDealExportRows, exportDealCSV, exportDealXLSX, exportDealPNG, exportDealPDF } from '../../lib/dealExport';
import { sanitizeHtml, htmlToPlainText } from '../../lib/sanitizeHtml';
import { useAuth } from '../../contexts/AuthContext';
import { FIELD_ICONS } from '../../lib/taskFieldIcons';
import { fmtDate } from '../../lib/dateHelpers';
import { copyToClipboard } from '../../lib/clipboard';
import ClientPicker from '../Clients/ClientPicker';
import Select from '../common/Select';
import DatePicker from '../common/DatePicker';
import TimePicker from '../common/TimePicker';
import NoteEditor from './NoteEditor';
import CreateDealTaskModal from './CreateDealTaskModal';
import ServiceTagsField from './ServiceTagsField';
import { fetchServiceTags, createServiceTag } from '../../lib/api/dealServiceTags';
import { COUNTRIES, flagClass } from '../../lib/countries';
import { BUSINESS_NICHES } from '../../lib/businessNiches';

const LEAD_WARMTH_OPTIONS = [
  { value: 'warm', label: 'Теплий' },
  { value: 'cold', label: 'Холодний' },
];

const QUALIFICATION_OPTIONS = [
  { value: 'SQL', label: 'SQL' },
  { value: 'MQL', label: 'MQL' },
  { value: 'unqualified', label: 'Unqualified' },
];

const NICHE_OPTIONS = BUSINESS_NICHES.map((n) => ({ value: n, label: n }));

const COUNTRY_OPTIONS = COUNTRIES.map((c) => ({ value: c.code, label: c.name, iconClassName: flagClass(c.code) }));

// Days spent on the deal's current stage — driven by `stage_changed_at`,
// stamped by moveDealStage on every stage move (falls back to created_at for
// legacy rows migrated before that column existed).
function daysInStage(deal) {
  const since = deal.stage_changed_at || deal.created_at;
  if (!since) return 0;
  return Math.max(0, Math.floor((Date.now() - new Date(since).getTime()) / 86400000));
}

function daysWord(n) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return 'день';
  if (mod10 >= 2 && mod10 <= 4 && !(mod100 >= 12 && mod100 <= 14)) return 'дні';
  return 'днів';
}

// Horizontal Pipedrive-style progress bar — only the "open" stages of the
// pipeline (Won/Lost are represented by the dedicated buttons instead, not
// as segments here), current one highlighted, earlier ones marked done.
function DealStageBar({ stages, currentStageId, onSelect }) {
  const openStages = stages.filter((s) => !s.is_won && !s.is_lost).sort((a, b) => a.position - b.position);
  const currentIndex = openStages.findIndex((s) => String(s.id) === String(currentStageId));
  if (!openStages.length) return null;
  return (
    <div className="deal-stage-bar">
      {openStages.map((s, i) => (
        <button
          key={s.id} type="button"
          className={'deal-stage-seg' + (i === currentIndex ? ' active' : i < currentIndex ? ' done' : '')}
          onClick={() => onSelect(s.id)}
        >
          {s.label}
        </button>
      ))}
    </div>
  );
}

function fmtCreated(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return fmtDate(d.getFullYear(), d.getMonth() + 1, d.getDate());
}

function fmtActivityTime(iso) {
  if (!iso) return null;
  return new Date(iso).toLocaleString('uk-UA', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function activityIcon(type) {
  return FIELD_ICONS[ACTIVITY_TYPES.find((t) => t.value === type)?.icon || 'checklist'];
}

// A text field paired with "open" and "copy" icon buttons — used for Chat
// link and Website, the two fields that hold an external URL someone will
// want to jump to or paste elsewhere rather than just read.
function LinkField({ icon, label, value, onChange, onBlur, placeholder }) {
  return (
    <div className="wk-field-box wk-field-box-wide">
      <span className="wk-field-icon" dangerouslySetInnerHTML={{ __html: icon }} />
      <div className="wk-field-body">
        <label>{label}</label>
        <input type="text" value={value} onChange={onChange} onBlur={onBlur} placeholder={placeholder} />
      </div>
      <div className="deal-field-actions">
        <button type="button" className="deal-field-icon-btn" disabled={!value} title="Відкрити" aria-label="Відкрити" onClick={() => window.open(value, '_blank', 'noreferrer')}>
          <span dangerouslySetInnerHTML={{ __html: FIELD_ICONS.externalLink }} />
        </button>
        <button type="button" className="deal-field-icon-btn" disabled={!value} title="Копіювати" aria-label="Копіювати" onClick={() => copyToClipboard(value)}>
          <span dangerouslySetInnerHTML={{ __html: FIELD_ICONS.copy }} />
        </button>
      </div>
    </div>
  );
}

const DIAMOND_ICON = '<svg viewBox="0 0 24 24"><path d="M12 2l10 10-10 10L2 12z"/></svg>';
const CROWN_ICON = '<svg viewBox="0 0 24 24"><path d="M4 8l4 3 4-6 4 6 4-3-1.5 10h-13z"/><path d="M6.5 19h11"/></svg>';

// "Задача" and "Дзвінок" both open the same popup — same fields and layout
// either way, "Дзвінок" just also asks for a time alongside the date.
const ACTIVITY_MODAL_META = {
  task: { title: 'Нова задача', sub: 'Створіть задачу, щоб нічого не пропустити', icon: 'checklist', addLabel: 'Додати задачу' },
  call: { title: 'Новий дзвінок', sub: 'Заплануйте дзвінок, щоб нічого не пропустити', icon: 'phone', addLabel: 'Додати дзвінок' },
};

// The tabbed "Історія угоди" section — one color/icon per activity type so
// the combined "all" feed reads at a glance, plus a dedicated tab per type
// the user asked to be able to isolate (meeting/email/deadline items only
// ever show up in "all" — no tab of their own was asked for).
const HISTORY_TYPE_META = {
  note: { label: 'Нотатка', color: '#D97706', tint: '#FEF3C7', icon: '<svg viewBox="0 0 24 24"><path d="M9 4h6l-1 6 3 3v2H7v-2l3-3z"/><path d="M12 15v5"/></svg>' },
  task: { label: 'Задача', color: '#7C3AED', tint: '#EDE7FB', icon: '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 9l1.5 1.5L11 8"/><path d="M14 9h5"/><path d="M7 15l1.5 1.5L11 14"/><path d="M14 15h5"/></svg>' },
  call: { label: 'Дзвінок', color: '#2563EB', tint: '#E8F0FE', icon: '<svg viewBox="0 0 24 24"><path d="M4.5 4h3.8l1.6 4.2-2.2 1.6a12.5 12.5 0 0 0 6.5 6.5l1.6-2.2 4.2 1.6v3.8a2 2 0 0 1-2.1 2A16.5 16.5 0 0 1 2.5 6.1 2 2 0 0 1 4.5 4z"/></svg>' },
  meeting: { label: 'Зустріч', color: '#0D9488', tint: '#E1F5F2', icon: '<svg viewBox="0 0 24 24"><circle cx="8" cy="8" r="3"/><circle cx="16" cy="8" r="3"/><path d="M2 20a6 6 0 0 1 12 0"/><path d="M10 20a6 6 0 0 1 12 0"/></svg>' },
  email: { label: 'Email', color: '#DB2777', tint: '#FCE7F3', icon: '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/></svg>' },
  deadline: { label: 'Дедлайн', color: '#DC2626', tint: '#FEE2E2', icon: '<svg viewBox="0 0 24 24"><path d="M5 3v18"/><path d="M5 4h12l-2.5 3.5L17 11H5"/></svg>' },
};

const HISTORY_TABS = [
  { key: 'all', label: 'Історія угоди' },
  { key: 'note', label: 'Історія нотатків' },
  { key: 'task', label: 'Історія задач' },
  { key: 'call', label: 'Історія дзвінків' },
];

// The three priority levels for the task/call popup, rendered as colored
// chips instead of a plain select — the color itself should signal how
// urgent something is at a glance, not just its label.
const PRIORITY_CHIPS = [
  { value: 'high', label: 'Високий', color: '#DC2626', tint: '#FEE2E2' },
  { value: 'medium', label: 'Середній', color: '#D97706', tint: '#FEF3C7' },
  { value: 'low', label: 'Низький', color: '#16A34A', tint: '#DCFCE7' },
];

function SectionHead({ icon, title, subtitle, gradient }) {
  return (
    <div className="deal-section-head">
      <span className="deal-section-icon" style={{ background: gradient || 'linear-gradient(135deg, #A78BFA, #7C3AED)' }} dangerouslySetInnerHTML={{ __html: icon }} />
      <div className="deal-section-text">
        <h4>{title}</h4>
        <p>{subtitle}</p>
      </div>
    </div>
  );
}

export default function DealDetailModal({ deal, stages, profiles, onClose, onChanged }) {
  const navigate = useNavigate();
  const { email: myEmail } = useAuth();

  // Every field below saves itself the moment it changes (onBlur for text,
  // onChange for select/date) — same instant-apply convention as Стадія,
  // notes, tasks and participants already use.
  const [title, setTitle] = useState(deal.title || '');
  const [company, setCompany] = useState(deal.clients?.company || '');
  const [amount, setAmount] = useState(deal.amount ?? '');
  const [currency, setCurrency] = useState(deal.currency || 'USD');
  const [manager, setManager] = useState(deal.manager || '');
  const [expectedClose, setExpectedClose] = useState(deal.expected_close_date || '');
  const [source, setSource] = useState(deal.source || '');
  const [chatLink, setChatLink] = useState(deal.chat_link || '');
  const [website, setWebsite] = useState(deal.website || '');
  const [lostReason, setLostReason] = useState(deal.lost_reason || '');
  const [leadWarmth, setLeadWarmth] = useState(deal.lead_warmth || '');
  const [niche, setNiche] = useState(deal.niche || '');
  const [country, setCountry] = useState(deal.country || '');
  const [qualification, setQualification] = useState(deal.qualification || '');
  const [serviceTagIds, setServiceTagIds] = useState(deal.service_tag_ids || []);
  const [serviceTagsCatalog, setServiceTagsCatalog] = useState([]);
  useEffect(() => { fetchServiceTags().then(setServiceTagsCatalog); }, []);
  // Unlike the fields above, this one can now also be set from OUTSIDE this
  // input — the "Програно" reason modal saves it via moveDealStage, and the
  // resulting reload() hands this component a new `deal` prop. A plain
  // useState initializer only runs on mount, so without this the field
  // would keep showing stale (empty) text after the modal saves.
  useEffect(() => { setLostReason(deal.lost_reason || ''); }, [deal.lost_reason]);

  // Only ever 'notes' in practice now — Задача/Дзвінок open their popup
  // without touching this, and Email is a disabled "Скоро" stub, so nothing
  // else is left that can switch it.
  const [subTab, setSubTab] = useState('notes');
  const [tasks, setTasks] = useState([]);
  const [tasksLoading, setTasksLoading] = useState(true);
  const [newTaskText, setNewTaskText] = useState('');
  const [newTaskPriority, setNewTaskPriority] = useState('');
  const [newTaskAssignee, setNewTaskAssignee] = useState('');
  const [adding, setAdding] = useState(false);
  // "Задача" and "Дзвінок" open a dedicated popup — its own type is tracked
  // separately from `subTab` (which stays on "Нотатки"), since which of the
  // two pills triggered it still decides the popup's title/icon/fields.
  const [activityModalOpen, setActivityModalOpen] = useState(false);
  const [activityModalType, setActivityModalType] = useState('task');
  const [newTaskDate, setNewTaskDate] = useState('');
  const [newTaskTime, setNewTaskTime] = useState('');
  const [newTaskCreatedBy, setNewTaskCreatedBy] = useState('');

  const [historyTab, setHistoryTab] = useState('all');
  const [historyDetail, setHistoryDetail] = useState(null); // the raw task row being viewed, or null
  const [editTaskOpen, setEditTaskOpen] = useState(false); // true while CreateDealTaskModal is open in edit mode for historyDetail

  const [dealNotes, setDealNotes] = useState([]);
  const [notesLoading, setNotesLoading] = useState(true);
  const [addingNote, setAddingNote] = useState(false);
  const [noteAuthorName, setNoteAuthorName] = useState('');

  const [participants, setParticipants] = useState([]);

  const [menuOpen, setMenuOpen] = useState(false);
  const [duplicating, setDuplicating] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [lostModalReason, setLostModalReason] = useState(null); // string once the modal is open, null when closed
  const dealPageRef = useRef(null);
  const kebabRef = useRef(null);

  useEffect(() => {
    if (!menuOpen) return;
    function handleClickOutside(e) {
      if (kebabRef.current && !kebabRef.current.contains(e.target)) setMenuOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [menuOpen]);

  function reloadTasks() {
    setTasksLoading(true);
    fetchTasksForDeal(deal.id).then(setTasks).finally(() => setTasksLoading(false));
  }

  function reloadParticipants() {
    fetchDealParticipants(deal.id).then(setParticipants);
  }

  function reloadNotes() {
    setNotesLoading(true);
    fetchDealNotes(deal.id).then(setDealNotes).finally(() => setNotesLoading(false));
  }

  // Follow-up Generator has no verbatim chat transcript to pull from (the
  // deal only stores a chat_link URL, not message text) — so instead of
  // "chat", this feeds its optional "extraContext" field with everything the
  // deal itself already knows: niche/qualification/source plus the last few
  // notes, stripped of the notes editor's own HTML formatting.
  function buildFollowupExtraContext() {
    const lines = [];
    const clientLabel = deal.clients?.company || deal.clients?.name;
    if (clientLabel) lines.push(`Клієнт: ${clientLabel}`);
    if (niche) lines.push(`Ніша: ${niche}`);
    if (qualification) lines.push(`Кваліфікація: ${qualification}`);
    if (source) lines.push(`Джерело: ${source}`);
    const recentNotes = dealNotes.slice(0, 5)
      .map((n) => {
        const text = htmlToPlainText(n.text || '').trim();
        if (!text) return null;
        const date = n.created_at ? new Date(n.created_at).toLocaleDateString('uk-UA') : '';
        return `- ${date ? date + ': ' : ''}${text}`;
      })
      .filter(Boolean);
    if (recentNotes.length) lines.push('', 'Останні нотатки по угоді:', ...recentNotes);
    return lines.join('\n');
  }

  function handleOpenFollowup() {
    // deals.manager stores the owner's display LABEL (same vocabulary as the
    // "Owner" field's own Select — value: p.label), not an email — resolve
    // it back to a real email via the profiles list so the auto-scheduled
    // next-step task/notification can be scoped to that one person.
    const managerEmail = profiles.find((p) => p.label === deal.manager)?.email || '';
    navigate('/tools/followup', {
      state: {
        dealId: deal.id,
        clientId: deal.client_id,
        clientName: deal.clients?.name || '',
        dealTitle: deal.title || deal.clients?.company || deal.clients?.name || 'Угода',
        managerEmail,
        extraContext: buildFollowupExtraContext(),
      },
    });
  }

  useEffect(() => {
    reloadTasks();
    reloadParticipants();
    reloadNotes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deal.id]);

  async function handleAddNote(html, mentionedEmails) {
    const plain = htmlToPlainText(html);
    if (!plain) return false;
    setAddingNote(true);
    try {
      await addDealNote(deal.id, sanitizeHtml(html), noteAuthorName.trim() || myEmail);
      for (const email of mentionedEmails) {
        await createMentionNotification({ recipientEmail: email, senderEmail: myEmail, dealId: deal.id, noteExcerpt: plain.slice(0, 140) });
      }
      reloadNotes();
      return true;
    } catch (e) {
      alert('Помилка додавання нотатки: ' + (e.message || e));
      return false;
    } finally {
      setAddingNote(false);
    }
  }

  async function handleTogglePin(note) {
    setDealNotes((list) => list.map((n) => (n.id === note.id ? { ...n, pinned: !n.pinned } : n)));
    await setNotePinned(note.id, !note.pinned);
    reloadNotes();
  }

  async function handleDeleteNote(note) {
    if (!confirm('Видалити цю нотатку?')) return;
    await deleteDealNote(note.id);
    reloadNotes();
  }

  async function handleAddParticipant(client) {
    if (!client || client.id === deal.client_id || participants.some((p) => p.client_id === client.id)) return;
    await addDealParticipant(deal.id, client.id);
    reloadParticipants();
  }

  async function handleRemoveParticipant(participantId) {
    await removeDealParticipant(participantId);
    reloadParticipants();
  }

  function saveField(patch) {
    updateDealFields(deal.id, patch).then(() => onChanged?.());
  }

  function handleToggleServiceTag(tagId) {
    const next = serviceTagIds.includes(tagId) ? serviceTagIds.filter((id) => id !== tagId) : [...serviceTagIds, tagId];
    setServiceTagIds(next);
    saveField({ service_tag_ids: next });
  }

  async function handleCreateServiceTag(label, color) {
    const created = await createServiceTag(label, color);
    setServiceTagsCatalog((c) => [...c, created]);
    const next = [...serviceTagIds, created.id];
    setServiceTagIds(next);
    saveField({ service_tag_ids: next });
  }

  function saveCompany(value) {
    if (value.trim() === (deal.clients?.company || '')) return;
    updateClientDirectoryEntry(deal.client_id, { company: value.trim() || null }, deal.clients).then(() => onChanged?.());
  }

  function handleStageChange(stageId) {
    const stage = stages.find((s) => String(s.id) === String(stageId));
    if (!stage) return;
    // Moving into a Lost stage always goes through the reason modal instead
    // (openLostModal below) — this only handles Won/open-stage moves.
    if (stage.is_lost) { openLostModal(stage); return; }
    moveDealStage(deal.id, stage, deal.lost_reason).then(() => onChanged?.());
  }

  function openLostModal(stage) {
    setLostModalReason({ stage, text: deal.lost_reason || '' });
  }

  function handleConfirmLost() {
    if (!lostModalReason) return;
    moveDealStage(deal.id, lostModalReason.stage, lostModalReason.text.trim() || null).then(() => onChanged?.());
    setLostModalReason(null);
  }

  async function handleFinishDeal() {
    setFinishing(true);
    try {
      await archiveDeal(deal.id);
      onChanged?.();
    } finally {
      setFinishing(false);
    }
  }

  async function handleDuplicate() {
    setMenuOpen(false);
    setDuplicating(true);
    try {
      const copy = await duplicateDeal(deal, stages);
      if (!copy) { alert('Не вдалося створити дублікат угоди.'); return; }
      onChanged?.();
      onClose();
    } finally {
      setDuplicating(false);
    }
  }

  async function handleExport(kind) {
    setMenuOpen(false);
    if (kind === 'csv' || kind === 'xlsx') {
      const rows = buildDealExportRows(deal, dealNotes, tasks);
      if (kind === 'csv') exportDealCSV(deal, rows);
      else exportDealXLSX(deal, rows);
      return;
    }
    setExporting(true);
    try {
      if (kind === 'png') await exportDealPNG(dealPageRef.current, deal);
      else await exportDealPDF(dealPageRef.current, deal);
    } finally {
      setExporting(false);
    }
  }

  function openActivityModal(type) {
    setActivityModalType(type);
    setNewTaskCreatedBy(myEmail || '');
    setActivityModalOpen(true);
  }
  function closeActivityModal() {
    setActivityModalOpen(false);
    setNewTaskText(''); setNewTaskPriority(''); setNewTaskAssignee(''); setNewTaskDate(''); setNewTaskTime(''); setNewTaskCreatedBy('');
  }

  async function handleAddTask() {
    const text = newTaskText.trim();
    if (!text) return;
    setAdding(true);
    try {
      // "Дзвінок" combines its date field with a time; "Задача" is date-only.
      const scheduledAt = !newTaskDate ? null
        : activityModalType === 'call'
          ? new Date(`${newTaskDate}T${newTaskTime || '00:00'}`).toISOString()
          : new Date(newTaskDate).toISOString();
      const row = await createTask({
        text, assigneeEmail: newTaskAssignee, priority: newTaskPriority,
        departmentId: null, clientId: deal.client_id, dealId: deal.id,
        createdByEmail: newTaskCreatedBy || myEmail,
        activityType: activityModalType,
        scheduledAt,
      });
      setTasks((t) => [row, ...t]);
      createTaskAssignedNotification({
        recipientEmail: newTaskAssignee, senderEmail: newTaskCreatedBy || myEmail,
        dealId: deal.id, taskId: row.id, noteExcerpt: text,
        dealTitle: deal.title || deal.clients?.company || deal.clients?.name || 'Угода',
        clientLabel: deal.clients?.name || deal.clients?.company || null,
        scheduledAt, activityType: activityModalType,
      });
      closeActivityModal();
    } catch (e) {
      alert('Помилка додавання активності: ' + (e.message || e));
    } finally {
      setAdding(false);
    }
  }

  // Unlike Скасувати (which just marks the task cancelled), this actually
  // removes the row — for a task added by mistake, not one that just didn't
  // happen.
  async function handleDeleteTask(task) {
    if (!confirm('Видалити цю задачу назавжди? Цю дію не можна скасувати.')) return;
    setTasks((t) => t.filter((it) => it.id !== task.id));
    setHistoryDetail((d) => (d && d.id === task.id ? null : d));
    await deleteTask(task.id);
  }

  // Drives the status buttons in the history detail popup — updates both the
  // task list (so the row's gradient badge reflects it right away) and the
  // open popup itself (so its own buttons re-render for the new status).
  async function handleSetTaskStatus(task, status) {
    setTasks((t) => t.map((it) => (it.id === task.id ? { ...it, status } : it)));
    setHistoryDetail((d) => (d && d.id === task.id ? { ...d, status } : d));
    await setTaskStatus(task.id, status);
  }

  async function handleDelete() {
    if (!confirm('Видалити цю угоду? Прив\'язані задачі залишаться, але без угоди.')) return;
    await deleteDeal(deal.id);
    onChanged?.();
    onClose();
  }

  // Focus — overdue/today's not-done activities plus pinned notes, so the
  // most urgent things surface above the tabs instead of getting buried.
  const endOfToday = new Date(); endOfToday.setHours(23, 59, 59, 999);
  const focusActivities = tasks
    .filter((t) => t.status !== 'done' && t.scheduled_at && new Date(t.scheduled_at) <= endOfToday)
    .sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at));
  const focusNotes = dealNotes.filter((n) => n.pinned);
  const showFocus = focusActivities.length > 0 || focusNotes.length > 0;

  // Display name for a creator/assignee email — falls back to the raw email
  // when it's not a known profile (e.g. an account that's since been removed).
  function profileLabelFor(email) {
    if (!email) return null;
    return profiles.find((p) => p.email === email)?.label || email;
  }

  // "Історія угоди" feed — built straight from the notes and task rows
  // (rather than a separate generic activity log) so it can show real
  // structured data per type: who created it, and for tasks/calls, who it
  // was assigned to.
  const historyRows = useMemo(() => {
    const noteRows = dealNotes.map((n) => ({
      id: `note-${n.id}`, type: 'note', text: htmlToPlainText(n.text), createdAt: n.created_at, createdBy: n.created_by, note: n,
    }));
    const taskRows = tasks.map((t) => ({
      id: `task-${t.id}`, type: t.activity_type || 'task', text: (t.text || '').split('\n')[0], createdAt: t.created_at,
      createdBy: t.created_by_email, assignee: t.assignee_email, task: t,
    }));
    return [...noteRows, ...taskRows].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }, [dealNotes, tasks]);

  const filteredHistoryRows = historyTab === 'all' ? historyRows : historyRows.filter((r) => r.type === historyTab);

  const wonStage = stages.find((s) => s.is_won);
  const lostStage = stages.find((s) => s.is_lost);
  const firstStage = [...stages].sort((a, b) => a.position - b.position)[0];
  const isClosed = Boolean(deal.deal_stages?.is_won || deal.deal_stages?.is_lost);
  // A Won deal keeps working (invoices, follow-up notes) until someone
  // explicitly finishes it — it doesn't disappear into the Архів the moment
  // it closes the way a Lost deal does.
  const showFinish = Boolean(deal.deal_stages?.is_won && !deal.archived);
  const stageDays = daysInStage(deal);

  return (
    <div className="report-page deal-page" ref={dealPageRef}>
      <section className="rpt-hero deal-page-hero">
        <span className="deal-section-icon deal-detail-head-icon" style={{ background: 'linear-gradient(135deg, #A78BFA, #7C3AED)' }} dangerouslySetInnerHTML={{ __html: FIELD_ICONS.briefcase }} />
        <div className="deal-detail-head-text">
          <input
            type="text" className="deal-title-input" value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => saveField({ title: title.trim() || null })}
            placeholder={deal.clients?.company || deal.clients?.name || 'Угода'}
          />
        </div>

        <div className="deal-page-actions-row">
          <button type="button" className="btn deal-page-back" onClick={onClose}>&larr; Назад до угод</button>
          {!isClosed && (
            <>
              {wonStage && (
                <button type="button" className="btn deal-btn-won" onClick={() => handleStageChange(wonStage.id)}>
                  <span className="deal-action-ic deal-action-ic--ghost" dangerouslySetInnerHTML={{ __html: FIELD_ICONS.check }} /> Виграно
                </button>
              )}
              {lostStage && (
                <button type="button" className="btn deal-btn-lost" onClick={() => handleStageChange(lostStage.id)}>
                  <span className="deal-action-ic deal-action-ic--ghost" dangerouslySetInnerHTML={{ __html: FIELD_ICONS.close }} /> Програно
                </button>
              )}
            </>
          )}
          {showFinish && (
            <button type="button" className="btn deal-btn-finish" disabled={finishing} onClick={handleFinishDeal}>
              <span className="deal-action-ic deal-action-ic--ghost" dangerouslySetInnerHTML={{ __html: FIELD_ICONS.archive }} /> {finishing ? 'Завершуємо…' : 'Завершити угоду'}
            </button>
          )}
          {isClosed && (
            <button type="button" className="btn deal-btn-reopen" onClick={() => handleStageChange(firstStage.id)}>
              <span className="deal-action-ic deal-action-ic--ghost" dangerouslySetInnerHTML={{ __html: FIELD_ICONS.undo }} /> Повернути в роботу
            </button>
          )}
          <button type="button" className="btn" onClick={handleOpenFollowup} title="Відкрити Follow-up Generator з даними цієї угоди">
            <span dangerouslySetInnerHTML={{ __html: FIELD_ICONS.megaphone }} /> Follow-up
          </button>
          <div className="deal-kebab-wrap" ref={kebabRef}>
            <button type="button" className="btn deal-kebab-btn" title="Дії з угодою" aria-label="Дії з угодою" onClick={() => setMenuOpen((o) => !o)}>
              <span dangerouslySetInnerHTML={{ __html: FIELD_ICONS.more }} />
            </button>
            {menuOpen && (
              <div className="deal-kebab-menu">
                <button type="button" disabled={duplicating} onClick={handleDuplicate}>
                  <span dangerouslySetInnerHTML={{ __html: FIELD_ICONS.copy }} /> {duplicating ? 'Дублюємо…' : 'Зробити дублікат'}
                </button>
                <div className="deal-kebab-sep" />
                <button type="button" disabled={exporting} onClick={() => handleExport('png')}>
                  <span dangerouslySetInnerHTML={{ __html: FIELD_ICONS.download }} /> Завантажити PNG
                </button>
                <button type="button" disabled={exporting} onClick={() => handleExport('pdf')}>
                  <span dangerouslySetInnerHTML={{ __html: FIELD_ICONS.download }} /> Завантажити PDF
                </button>
                <button type="button" onClick={() => handleExport('xlsx')}>
                  <span dangerouslySetInnerHTML={{ __html: FIELD_ICONS.download }} /> Завантажити XLSX
                </button>
                <button type="button" onClick={() => handleExport('csv')}>
                  <span dangerouslySetInnerHTML={{ __html: FIELD_ICONS.download }} /> Завантажити CSV
                </button>
                <div className="deal-kebab-sep" />
                <button type="button" className="deal-kebab-danger" onClick={() => { setMenuOpen(false); handleDelete(); }}>
                  Видалити угоду
                </button>
              </div>
            )}
          </div>
        </div>
      </section>

      <div className="deal-stage-bar-wrap">
        <div className="deal-stage-days-label">{stageDays} {daysWord(stageDays)} · {deal.deal_stages?.label || '—'}</div>
        <DealStageBar stages={stages} currentStageId={deal.stage_id} onSelect={handleStageChange} />
      </div>

      <div className="deal-page-body">
        <div className="deal-section">
          <SectionHead icon={FIELD_ICONS.document} title="Основна інформація" subtitle="Базові дані про угоду" gradient="linear-gradient(135deg, #A78BFA, #7C3AED)" />
          <div className="deal-section-body deal-basic-info-row">
            <div className="wk-field-box">
              <span className="wk-field-icon" dangerouslySetInnerHTML={{ __html: FIELD_ICONS.pipeline }} />
              <div className="wk-field-body">
                <label>Pipeline</label>
                <div className="wk-field-static">{deal.pipelines?.name || '—'}</div>
              </div>
            </div>
            <div className="wk-field-box">
              <span className="wk-field-icon" dangerouslySetInnerHTML={{ __html: FIELD_ICONS.source }} />
              <div className="wk-field-body">
                <label>Source</label>
                <input
                  type="text" value={source} onChange={(e) => setSource(e.target.value)}
                  onBlur={() => saveField({ source: source.trim() || null })}
                  placeholder="напр. Реферал, холодний лист..."
                />
              </div>
            </div>
            <ServiceTagsField
              value={serviceTagIds} catalog={serviceTagsCatalog}
              onToggle={handleToggleServiceTag} onCreate={handleCreateServiceTag}
            />
            <div className="wk-field-box">
              <span className="wk-field-icon" dangerouslySetInnerHTML={{ __html: FIELD_ICONS.owner }} />
              <div className="wk-field-body">
                <label>Owner</label>
                <Select
                  bare value={manager} onChange={(v) => { setManager(v); saveField({ manager: v }); }}
                  options={[{ value: '', label: 'Не призначено' }, ...profiles.map((p) => ({ value: p.label, label: p.label }))]}
                />
              </div>
            </div>
          </div>
        </div>

        <div className="deal-page-columns">
          <div className="deal-page-sidebar">
            <div className="deal-section">
              <SectionHead icon={FIELD_ICONS.barChart} title="Параметри угоди" subtitle="Стадія, сума та терміни" gradient="linear-gradient(135deg, #60A5FA, #2563EB)" />
              <div className="deal-section-body deal-sidebar-fields">
                <div className="wk-field-box wk-field-box-wide">
                  <span className="wk-field-icon" dangerouslySetInnerHTML={{ __html: FIELD_ICONS.day }} />
                  <div className="wk-field-body">
                    <label>Дата заведення</label>
                    <div className="wk-field-static">{fmtCreated(deal.created_at)}</div>
                  </div>
                </div>
                <div className="wk-field-box wk-field-box-wide">
                  <span className="wk-field-icon" dangerouslySetInnerHTML={{ __html: FIELD_ICONS.status }} />
                  <div className="wk-field-body">
                    <label>Стадія</label>
                    <Select
                      bare value={deal.stage_id} onChange={handleStageChange}
                      options={stages.map((s) => ({ value: s.id, label: s.label }))}
                    />
                  </div>
                </div>
                <LinkField
                  icon={FIELD_ICONS.chatLink} label="Chat link" value={chatLink}
                  onChange={(e) => setChatLink(e.target.value)}
                  onBlur={() => saveField({ chat_link: chatLink.trim() || null })}
                  placeholder="Посилання на переписку"
                />
                <LinkField
                  icon={FIELD_ICONS.website} label="Вебсайт" value={website}
                  onChange={(e) => setWebsite(e.target.value)}
                  onBlur={() => saveField({ website: website.trim() || null })}
                  placeholder="https://..."
                />
                <div className="wk-field-box wk-field-box-wide">
                  <span className="wk-field-icon" dangerouslySetInnerHTML={{ __html: FIELD_ICONS.thermometer }} />
                  <div className="wk-field-body">
                    <label>Прогрів ліда</label>
                    <Select
                      bare value={leadWarmth} onChange={(v) => { setLeadWarmth(v); saveField({ lead_warmth: v || null }); }}
                      options={LEAD_WARMTH_OPTIONS} placeholder="Не вказано"
                    />
                  </div>
                </div>
                <div className="wk-field-box wk-field-box-wide">
                  <span className="wk-field-icon" dangerouslySetInnerHTML={{ __html: FIELD_ICONS.briefcase }} />
                  <div className="wk-field-body">
                    <label>Ніша бізнесу</label>
                    <Select
                      bare value={niche} onChange={(v) => { setNiche(v); saveField({ niche: v || null }); }}
                      options={NICHE_OPTIONS} placeholder="Не вказано"
                    />
                  </div>
                </div>
                <div className="wk-field-box wk-field-box-wide">
                  <span className="wk-field-icon" dangerouslySetInnerHTML={{ __html: FIELD_ICONS.mapPin }} />
                  <div className="wk-field-body">
                    <label>Країна</label>
                    <Select
                      bare searchable value={country} onChange={(v) => { setCountry(v); saveField({ country: v || null }); }}
                      options={COUNTRY_OPTIONS} placeholder="Не вказано"
                    />
                  </div>
                </div>
                <div className="wk-field-box wk-field-box-wide">
                  <span className="wk-field-icon" dangerouslySetInnerHTML={{ __html: FIELD_ICONS.target }} />
                  <div className="wk-field-body">
                    <label>MQL чи SQL</label>
                    <Select
                      bare value={qualification} onChange={(v) => { setQualification(v); saveField({ qualification: v || null }); }}
                      options={QUALIFICATION_OPTIONS} placeholder="Не вказано"
                    />
                  </div>
                </div>
                <div className="deal-field-pair-row">
                  <div className="wk-field-box">
                    <span className="wk-field-icon" dangerouslySetInnerHTML={{ __html: FIELD_ICONS.amount }} />
                    <div className="wk-field-body">
                      <label>Сума</label>
                      <input
                        type="number" value={amount} onChange={(e) => setAmount(e.target.value)}
                        onBlur={() => saveField({ amount: amount === '' ? null : Number(amount) })}
                      />
                    </div>
                  </div>
                  <div className="wk-field-box">
                    <span className="wk-field-icon" dangerouslySetInnerHTML={{ __html: FIELD_ICONS.currency }} />
                    <div className="wk-field-body">
                      <label>Валюта</label>
                      <Select
                        bare value={currency} onChange={(v) => { setCurrency(v); saveField({ currency: v }); }}
                        options={[{ value: 'USD', label: 'USD' }, { value: 'EUR', label: 'EUR' }, { value: 'UAH', label: 'UAH' }]}
                      />
                    </div>
                  </div>
                </div>
                <div className="wk-field-box wk-field-box-wide">
                  <span className="wk-field-icon" dangerouslySetInnerHTML={{ __html: FIELD_ICONS.day }} />
                  <div className="wk-field-body">
                    <label>Очікуване закриття</label>
                    <DatePicker
                      bare value={expectedClose || ''}
                      onChange={(v) => { setExpectedClose(v); saveField({ expected_close_date: v || null }); }}
                    />
                  </div>
                </div>
              </div>

              {deal.deal_stages?.is_lost && (
                <div className="deal-plain-field" style={{ marginTop: 14 }}>
                  <label>Причина програшу</label>
                  <input
                    type="text" value={lostReason} onChange={(e) => setLostReason(e.target.value)}
                    onBlur={() => saveField({ lost_reason: lostReason.trim() || null })}
                    placeholder="Вкажіть причину..."
                  />
                </div>
              )}
            </div>

            <div className="deal-section">
              <SectionHead icon={FIELD_ICONS.assignee} title="Клієнт" subtitle="Контакт, компанія та учасники угоди" gradient="linear-gradient(135deg, #2DD4BF, #0D9488)" />
              <div className="deal-section-body">
                <div className="deal-client-name-row">
                  <span className="deal-client-name">{deal.clients?.name || '—'}</span>
                  <button type="button" className="deal-field-icon-btn" title="Відкрити картку клієнта" aria-label="Відкрити картку клієнта" onClick={() => navigate(`/reports/clients-directory/${deal.client_id}`)}>
                    <span dangerouslySetInnerHTML={{ __html: FIELD_ICONS.externalLink }} />
                  </button>
                </div>
                <div className="deal-client-mini">
                  <span className="deal-client-mini-row"><span dangerouslySetInnerHTML={{ __html: FIELD_ICONS.mapPin }} />{deal.clients?.country || '—'}</span>
                  <span className="deal-client-mini-row"><span dangerouslySetInnerHTML={{ __html: FIELD_ICONS.phone }} />{deal.clients?.phone || '—'}</span>
                </div>

                <div className="wk-field-box wk-field-box-wide" style={{ marginTop: 14 }}>
                  <span className="wk-field-icon" dangerouslySetInnerHTML={{ __html: FIELD_ICONS.company }} />
                  <div className="wk-field-body">
                    <label>Company (необов'язково)</label>
                    <input
                      type="text" value={company} onChange={(e) => setCompany(e.target.value)}
                      onBlur={() => saveCompany(company)}
                      placeholder="Назва компанії"
                    />
                  </div>
                </div>

                <div className="deal-participants" style={{ marginTop: 14 }}>
                  <label>Учасники (необов'язково)</label>
                  {participants.length > 0 && (
                    <div className="deal-participant-chips">
                      {participants.map((p) => (
                        <span className="deal-participant-chip" key={p.id}>
                          {p.clients?.name || 'Клієнт'}
                          <button type="button" onClick={() => handleRemoveParticipant(p.id)} aria-label="Прибрати учасника">&times;</button>
                        </span>
                      ))}
                    </div>
                  )}
                  <ClientPicker value={null} onChange={handleAddParticipant} placeholder="Додати учасника..." />
                </div>
              </div>
            </div>
          </div>

          <div className="deal-page-main">
            <div className="deal-section">
              <SectionHead icon={FIELD_ICONS.checklist} title="Нотатки та задачі" subtitle="Ведіть нотатки та активності по угоді" gradient="linear-gradient(135deg, #F472B6, #DB2777)" />
              <div className="deal-section-body">
                {showFocus && (
                  <div className="deal-focus">
                    <div className="deal-focus-label">На часі</div>
                    {focusActivities.map((t) => (
                      <div className="deal-focus-item" key={`a${t.id}`}>
                        <span className="deal-focus-icon" dangerouslySetInnerHTML={{ __html: activityIcon(t.activity_type) }} />
                        <span>{(t.text || '').split('\n')[0]}</span>
                        <span className="deal-focus-time">{fmtActivityTime(t.scheduled_at)}</span>
                      </div>
                    ))}
                    {focusNotes.map((n) => (
                      <div className="deal-focus-item" key={`n${n.id}`}>
                        <span className="deal-focus-icon" dangerouslySetInnerHTML={{ __html: FIELD_ICONS.pin }} />
                        <span>{htmlToPlainText(n.text).slice(0, 80)}</span>
                      </div>
                    ))}
                  </div>
                )}

                <div className="chan-tabs deal-subtabs">
                  <button type="button" className={'chan-tab' + (subTab === 'notes' ? ' active' : '')} onClick={() => setSubTab('notes')}>Нотатки</button>
                  {ACTIVITY_TYPES.map((t) => (
                    t.value === 'email' ? (
                      <button key={t.value} type="button" className="chan-tab" disabled title="Скоро">
                        <span dangerouslySetInnerHTML={{ __html: FIELD_ICONS[t.icon] }} />
                        {t.label}
                      </button>
                    ) : (
                      // Задача/Дзвінок only ever open their own popup — the
                      // active tab deliberately stays on "Нотатки" instead of
                      // following them here, since there's nothing of their
                      // own left to show underneath (their history now lives
                      // in the tabbed "Історія угоди" section below).
                      <button key={t.value} type="button" className="chan-tab" onClick={() => openActivityModal(t.value)}>
                        <span dangerouslySetInnerHTML={{ __html: FIELD_ICONS[t.icon] }} />
                        {t.label}
                      </button>
                    )
                  ))}
                </div>

                {subTab === 'notes' && (
                  <>
                    <div className="deal-note-add-row">
                      <div className="deal-note-author-field">
                        <label>Зробив нотатку</label>
                        <input
                          type="text" value={noteAuthorName}
                          onChange={(e) => setNoteAuthorName(e.target.value)}
                          placeholder="Ім'я Прізвище"
                        />
                      </div>
                      <NoteEditor profiles={profiles} saving={addingNote} onSave={handleAddNote} onUploadImage={(file) => uploadDealNoteImage(deal.id, file)} />
                    </div>
                  </>
                )}
              </div>
            </div>

            <div className="deal-section">
              <SectionHead icon={FIELD_ICONS.history} title="Історія угоди" subtitle="Останні дії за цією угодою" gradient="linear-gradient(135deg, #94A3B8, #475569)" />
              <div className="deal-section-body">
                <div className="chan-tabs deal-history-tabs">
                  {HISTORY_TABS.map((t) => (
                    <button key={t.key} type="button" className={'chan-tab' + (historyTab === t.key ? ' active' : '')} onClick={() => setHistoryTab(t.key)}>
                      {t.label}
                    </button>
                  ))}
                </div>
                {tasksLoading || notesLoading ? (
                  <p className="client-history-empty">Завантаження…</p>
                ) : filteredHistoryRows.length === 0 ? (
                  <p className="client-history-empty">Історія поки що порожня.</p>
                ) : (
                  <div className="client-history-list">
                    {filteredHistoryRows.map((r) => {
                      const meta = HISTORY_TYPE_META[r.type] || HISTORY_TYPE_META.task;
                      const statusMeta = r.task?.status === 'done' ? { label: 'Виконана', cls: 'done' }
                        : r.task?.status === 'cancelled' ? { label: 'Скасовано', cls: 'cancelled' } : null;
                      return (
                        <div
                          key={r.id} className={'deal-history-row' + (r.task ? ' clickable' : '')}
                          style={{ '--history-color': meta.color, '--history-tint': meta.tint }}
                          onClick={r.task ? () => setHistoryDetail(r.task) : undefined}
                        >
                          <span className="deal-history-ic" dangerouslySetInnerHTML={{ __html: meta.icon }} />
                          <div className="deal-history-body">
                            <div className="deal-history-top">
                              <span className="deal-history-type">{meta.label}</span>
                              <span className="client-history-week">{new Date(r.createdAt).toLocaleString('uk-UA')}</span>
                            </div>
                            <div className="client-history-text">{r.text || '—'}</div>
                            {r.type === 'note' ? (
                              r.createdBy && <div className="deal-history-meta">{r.createdBy}</div>
                            ) : (
                              (r.createdBy || r.assignee) && (
                                <div className="deal-history-meta">
                                  {r.createdBy && <span>Поставив: {profileLabelFor(r.createdBy)}</span>}
                                  {r.assignee && <span>Призначено: {profileLabelFor(r.assignee)}</span>}
                                </div>
                              )
                            )}
                          </div>
                          {r.type === 'note' ? (
                            <div className="deal-history-actions" onClick={(e) => e.stopPropagation()}>
                              <button type="button" className={'deal-field-icon-btn' + (r.note.pinned ? ' active' : '')} title={r.note.pinned ? 'Відкріпити' : 'Закріпити'} onClick={() => handleTogglePin(r.note)}>
                                <span dangerouslySetInnerHTML={{ __html: FIELD_ICONS.pin }} />
                              </button>
                              <button type="button" className="deal-field-icon-btn" title="Видалити" onClick={() => handleDeleteNote(r.note)}>&times;</button>
                            </div>
                          ) : statusMeta && (
                            <div className={'deal-history-status ' + statusMeta.cls}>{statusMeta.label}</div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {historyDetail && createPortal(
        <div className="tmodal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setHistoryDetail(null); }}>
          <div className="tmodal-box task-detail-box">
            <div className="tmodal-head">
              <div className="pipeline-modal-head">
                <span
                  className="pipeline-modal-head-ic"
                  dangerouslySetInnerHTML={{ __html: (HISTORY_TYPE_META[historyDetail.activity_type] || HISTORY_TYPE_META.task).icon }}
                />
                <div>
                  <h3>{(ACTIVITY_TYPES.find((t) => t.value === historyDetail.activity_type)?.label) || 'Задача'}</h3>
                  <p>{new Date(historyDetail.created_at).toLocaleString('uk-UA')}</p>
                </div>
              </div>
              <button type="button" className="tmodal-close" onClick={() => setHistoryDetail(null)} aria-label="Закрити">&times;</button>
            </div>
            <div className="tmodal-body">
              <p className="task-detail-text">{historyDetail.text || '—'}</p>
              {(historyDetail.created_by_email || historyDetail.assignee_email) && (
                <div className="deal-history-meta task-detail-meta">
                  {historyDetail.created_by_email && <span>Поставив: {profileLabelFor(historyDetail.created_by_email)}</span>}
                  {historyDetail.assignee_email && <span>Призначено: {profileLabelFor(historyDetail.assignee_email)}</span>}
                </div>
              )}
            </div>
            <div className="tmodal-foot">
              <button type="button" className="btn btn-danger" style={{ marginRight: 'auto' }} onClick={() => handleDeleteTask(historyDetail)}>Видалити</button>
              <button type="button" className="btn" onClick={() => setEditTaskOpen(true)}>Редагувати</button>
              {historyDetail.status === 'pending' ? (
                <>
                  <button type="button" className="btn deal-btn-lost" onClick={() => handleSetTaskStatus(historyDetail, 'cancelled')}>Скасувати</button>
                  <button type="button" className="btn deal-btn-won" onClick={() => handleSetTaskStatus(historyDetail, 'done')}>Виконано</button>
                </>
              ) : (
                <button type="button" className="btn" onClick={() => handleSetTaskStatus(historyDetail, 'pending')}>
                  <span dangerouslySetInnerHTML={{ __html: FIELD_ICONS.undo }} /> Повернути в роботу
                </button>
              )}
            </div>
          </div>
        </div>,
        document.body,
      )}

      {editTaskOpen && historyDetail && (
        <CreateDealTaskModal
          task={historyDetail}
          deal={deal}
          profiles={profiles}
          myEmail={myEmail}
          onClose={() => setEditTaskOpen(false)}
          onSaved={(patch) => {
            setTasks((t) => t.map((it) => (it.id === historyDetail.id ? { ...it, ...patch } : it)));
            setHistoryDetail((h) => (h ? { ...h, ...patch } : h));
            setEditTaskOpen(false);
          }}
        />
      )}

      {lostModalReason && (
        <div className="tmodal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setLostModalReason(null); }}>
          <div className="tmodal-box">
            <div className="tmodal-head">
              <h3>Причина програшу</h3>
              <button type="button" className="tmodal-close" onClick={() => setLostModalReason(null)} aria-label="Закрити">&times;</button>
            </div>
            <div className="tmodal-body">
              <textarea
                className="client-notes-textarea" autoFocus
                value={lostModalReason.text}
                onChange={(e) => setLostModalReason({ ...lostModalReason, text: e.target.value })}
                placeholder="Чому угода не відбулась..."
              />
            </div>
            <div className="tmodal-foot">
              <button type="button" className="btn" onClick={() => setLostModalReason(null)}>Скасувати</button>
              <button type="button" className="btn btn-p" onClick={handleConfirmLost}>Зберегти</button>
            </div>
          </div>
        </div>
      )}

      {activityModalOpen && createPortal(
        <div className="tmodal-overlay" onClick={(e) => { if (e.target === e.currentTarget) closeActivityModal(); }}>
          <div className="tmodal-box task-modal-box">
            <div className="tmodal-head">
              <div className="pipeline-modal-head">
                <span className="pipeline-modal-head-ic" dangerouslySetInnerHTML={{ __html: FIELD_ICONS[ACTIVITY_MODAL_META[activityModalType]?.icon] }} />
                <div>
                  <h3>{ACTIVITY_MODAL_META[activityModalType]?.title}</h3>
                  <p>{ACTIVITY_MODAL_META[activityModalType]?.sub}</p>
                </div>
              </div>
              <button type="button" className="tmodal-close" onClick={closeActivityModal} aria-label="Закрити">&times;</button>
            </div>
            <div className="tmodal-body">
              <div className="task-modal-grid">
                <div className="task-modal-section">
                  <div className="task-modal-section-head">
                    <span className="task-modal-section-ic" dangerouslySetInnerHTML={{ __html: FIELD_ICONS.day }} />
                    <div>
                      <div className="task-modal-section-title">{activityModalType === 'call' ? 'Дата та час' : 'Дата'}</div>
                      <div className="task-modal-section-sub">Оберіть дату виконання задачі</div>
                    </div>
                  </div>
                  <div className="wk-field-box wk-field-box-wide task-modal-input-box">
                    <span className="wk-field-icon" dangerouslySetInnerHTML={{ __html: FIELD_ICONS.day }} />
                    <div className="wk-field-body">
                      <div className="task-modal-datetime-row">
                        <DatePicker bare value={newTaskDate} onChange={setNewTaskDate} />
                        {activityModalType === 'call' && (
                          <TimePicker className="task-modal-time-input" value={newTaskTime} onChange={setNewTaskTime} />
                        )}
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
                      const active = newTaskPriority === p.value;
                      return (
                        <button
                          key={p.value} type="button" className={'task-priority-chip' + (active ? ' active' : '')}
                          style={active ? { background: p.tint, borderColor: p.color, color: p.color } : undefined}
                          onClick={() => setNewTaskPriority(active ? '' : p.value)}
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
                    <div className="task-modal-section-title">Задача</div>
                    <div className="task-modal-section-sub">Опишіть, що потрібно зробити</div>
                  </div>
                </div>
                <textarea
                  className="task-modal-textarea" autoFocus
                  value={newTaskText} onChange={(e) => setNewTaskText(e.target.value)}
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
                  <Select
                    value={newTaskCreatedBy} onChange={setNewTaskCreatedBy}
                    options={profiles.map((p) => ({ value: p.email, label: p.label }))}
                  />
                </div>

                <div className="task-modal-section">
                  <div className="task-modal-section-head">
                    <span className="task-modal-section-ic" dangerouslySetInnerHTML={{ __html: FIELD_ICONS.assignee }} />
                    <div>
                      <div className="task-modal-section-title">Кому призначено</div>
                      <div className="task-modal-section-sub">Виконавець задачі</div>
                    </div>
                  </div>
                  <Select
                    value={newTaskAssignee} onChange={setNewTaskAssignee}
                    options={[{ value: '', label: 'Не призначено' }, ...profiles.map((p) => ({ value: p.email, label: p.label }))]}
                  />
                </div>
              </div>
            </div>
            <div className="tmodal-foot">
              <button type="button" className="btn" onClick={closeActivityModal}>Скасувати</button>
              <button type="button" className="btn btn-p" onClick={handleAddTask} disabled={adding || !newTaskText.trim()}>
                <span dangerouslySetInnerHTML={{ __html: FIELD_ICONS.plus }} /> {adding ? 'Додаємо...' : ACTIVITY_MODAL_META[activityModalType]?.addLabel}
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
