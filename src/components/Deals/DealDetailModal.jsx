import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { updateDealFields, moveDealStage, deleteDeal, duplicateDeal, archiveDeal } from '../../lib/api/deals';
import { updateClientDirectoryEntry } from '../../lib/api/clients';
import { fetchTasksForDeal, createTask, setTaskStatus, ACTIVITY_TYPES } from '../../lib/api/tasks';
import { fetchDealActivity, logDealActivity } from '../../lib/api/dealActivity';
import { fetchDealParticipants, addDealParticipant, removeDealParticipant } from '../../lib/api/dealParticipants';
import { fetchDealNotes, addDealNote, setNotePinned, deleteDealNote } from '../../lib/api/dealNotes';
import { uploadDealNoteImage } from '../../lib/api/dealNoteImages';
import { createMentionNotification } from '../../lib/api/notifications';
import { buildDealExportRows, exportDealCSV, exportDealXLSX, exportDealPNG, exportDealPDF } from '../../lib/dealExport';
import { sanitizeHtml, htmlToPlainText } from '../../lib/sanitizeHtml';
import { useAuth } from '../../contexts/AuthContext';
import { FIELD_ICONS } from '../../lib/taskFieldIcons';
import { fmtDate } from '../../lib/dateHelpers';
import { copyToClipboard } from '../../lib/clipboard';
import ClientPicker from '../Clients/ClientPicker';
import NoteEditor from './NoteEditor';

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

const PRIORITY_OPTIONS = [
  { value: '', label: 'Без пріоритету' },
  { value: 'high', label: 'Високий' },
  { value: 'medium', label: 'Середній' },
  { value: 'low', label: 'Низький' },
];

function SectionHead({ icon, title, subtitle }) {
  return (
    <div className="deal-section-head">
      <span className="deal-section-icon" dangerouslySetInnerHTML={{ __html: icon }} />
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
  // Unlike the fields above, this one can now also be set from OUTSIDE this
  // input — the "Програно" reason modal saves it via moveDealStage, and the
  // resulting reload() hands this component a new `deal` prop. A plain
  // useState initializer only runs on mount, so without this the field
  // would keep showing stale (empty) text after the modal saves.
  useEffect(() => { setLostReason(deal.lost_reason || ''); }, [deal.lost_reason]);

  // 'notes' or one of ACTIVITY_TYPES' values ('task'/'call'/'meeting'/'email'/'deadline')
  // — each activity type is its own top-level pill rather than being tucked
  // behind a single generic "Активності" tab.
  const [subTab, setSubTab] = useState('notes');
  const [tasks, setTasks] = useState([]);
  const [tasksLoading, setTasksLoading] = useState(true);
  const [newTaskText, setNewTaskText] = useState('');
  const [newScheduledAt, setNewScheduledAt] = useState('');
  const [newDurationMinutes, setNewDurationMinutes] = useState('');
  const [newTaskPriority, setNewTaskPriority] = useState('');
  const [newTaskAssignee, setNewTaskAssignee] = useState('');
  const [adding, setAdding] = useState(false);

  const [dealNotes, setDealNotes] = useState([]);
  const [notesLoading, setNotesLoading] = useState(true);
  const [addingNote, setAddingNote] = useState(false);
  const [noteAuthorName, setNoteAuthorName] = useState('');

  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(true);

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

  function reloadHistory() {
    setHistoryLoading(true);
    fetchDealActivity(deal.id).then(setHistory).finally(() => setHistoryLoading(false));
  }

  function reloadParticipants() {
    fetchDealParticipants(deal.id).then(setParticipants);
  }

  function reloadNotes() {
    setNotesLoading(true);
    fetchDealNotes(deal.id).then(setDealNotes).finally(() => setNotesLoading(false));
  }

  useEffect(() => {
    reloadTasks();
    reloadHistory();
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
      await logDealActivity({ dealId: deal.id, eventType: 'note_added', text: `Додано нотатку: ${plain.split('\n')[0].slice(0, 80)}`, createdBy: myEmail });
      reloadHistory();
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

  async function handleAddTask() {
    const text = newTaskText.trim();
    if (!text) return;
    setAdding(true);
    try {
      const row = await createTask({
        text, assigneeEmail: newTaskAssignee, priority: newTaskPriority,
        department: 'sales', clientId: deal.client_id, dealId: deal.id, createdByEmail: myEmail,
        activityType: subTab,
        scheduledAt: newScheduledAt ? new Date(newScheduledAt).toISOString() : null,
        durationMinutes: newDurationMinutes === '' ? null : Number(newDurationMinutes),
      });
      setTasks((t) => [row, ...t]);
      setNewTaskText(''); setNewTaskPriority(''); setNewTaskAssignee(''); setNewScheduledAt(''); setNewDurationMinutes('');
      const typeLabel = ACTIVITY_TYPES.find((t) => t.value === subTab)?.label || 'Задача';
      await logDealActivity({ dealId: deal.id, eventType: 'task_added', text: `Додано (${typeLabel.toLowerCase()}): ${text}`, createdBy: myEmail });
      reloadHistory();
    } catch (e) {
      alert('Помилка додавання активності: ' + (e.message || e));
    } finally {
      setAdding(false);
    }
  }

  async function handleToggleDone(task) {
    const next = task.status === 'done' ? 'pending' : 'done';
    setTasks((t) => t.map((it) => (it.id === task.id ? { ...it, status: next } : it)));
    await setTaskStatus(task.id, next);
    const label = (task.text || '').split('\n')[0];
    await logDealActivity({
      dealId: deal.id, eventType: next === 'done' ? 'task_done' : 'task_reopened',
      text: next === 'done' ? `Задача виконана: ${label}` : `Задача повернена в роботу: ${label}`,
      createdBy: myEmail,
    });
    reloadHistory();
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
        <span className="deal-section-icon deal-detail-head-icon" dangerouslySetInnerHTML={{ __html: FIELD_ICONS.briefcase }} />
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
                  <span dangerouslySetInnerHTML={{ __html: FIELD_ICONS.check }} /> Виграно
                </button>
              )}
              {lostStage && (
                <button type="button" className="btn deal-btn-lost" onClick={() => handleStageChange(lostStage.id)}>
                  <span dangerouslySetInnerHTML={{ __html: FIELD_ICONS.close }} /> Програно
                </button>
              )}
            </>
          )}
          {showFinish && (
            <button type="button" className="btn deal-btn-finish" disabled={finishing} onClick={handleFinishDeal}>
              <span dangerouslySetInnerHTML={{ __html: FIELD_ICONS.archive }} /> {finishing ? 'Завершуємо…' : 'Завершити угоду'}
            </button>
          )}
          {isClosed && (
            <button type="button" className="btn deal-btn-reopen" onClick={() => handleStageChange(firstStage.id)}>
              <span dangerouslySetInnerHTML={{ __html: FIELD_ICONS.undo }} /> Повернути в роботу
            </button>
          )}
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
          <SectionHead icon={FIELD_ICONS.document} title="Основна інформація" subtitle="Базові дані про угоду" />
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
            <div className="wk-field-box">
              <span className="wk-field-icon" dangerouslySetInnerHTML={{ __html: FIELD_ICONS.owner }} />
              <div className="wk-field-body">
                <label>Owner</label>
                <select value={manager} onChange={(e) => { setManager(e.target.value); saveField({ manager: e.target.value }); }}>
                  <option value="">Не призначено</option>
                  {profiles.map((p) => <option key={p.email} value={p.label}>{p.label}</option>)}
                </select>
              </div>
            </div>
          </div>
        </div>

        <div className="deal-page-columns">
          <div className="deal-page-sidebar">
            <div className="deal-section">
              <SectionHead icon={FIELD_ICONS.barChart} title="Параметри угоди" subtitle="Стадія, сума та терміни" />
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
                    <select value={deal.stage_id} onChange={(e) => handleStageChange(e.target.value)}>
                      {stages.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                    </select>
                  </div>
                </div>
                <div className="wk-field-box wk-field-box-wide">
                  <span className="wk-field-icon" dangerouslySetInnerHTML={{ __html: FIELD_ICONS.amount }} />
                  <div className="wk-field-body">
                    <label>Сума</label>
                    <input
                      type="number" value={amount} onChange={(e) => setAmount(e.target.value)}
                      onBlur={() => saveField({ amount: amount === '' ? null : Number(amount) })}
                    />
                  </div>
                </div>
                <div className="wk-field-box wk-field-box-wide">
                  <span className="wk-field-icon" dangerouslySetInnerHTML={{ __html: FIELD_ICONS.currency }} />
                  <div className="wk-field-body">
                    <label>Валюта</label>
                    <select value={currency} onChange={(e) => { setCurrency(e.target.value); saveField({ currency: e.target.value }); }}>
                      <option value="USD">USD</option>
                      <option value="EUR">EUR</option>
                      <option value="UAH">UAH</option>
                    </select>
                  </div>
                </div>
                <div className="wk-field-box wk-field-box-wide">
                  <span className="wk-field-icon" dangerouslySetInnerHTML={{ __html: FIELD_ICONS.day }} />
                  <div className="wk-field-body">
                    <label>Очікуване закриття</label>
                    <input
                      type="date" value={expectedClose || ''}
                      onChange={(e) => { setExpectedClose(e.target.value); saveField({ expected_close_date: e.target.value || null }); }}
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
              <SectionHead icon={FIELD_ICONS.assignee} title="Клієнт" subtitle="Контакт, компанія та учасники угоди" />
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
              <SectionHead icon={FIELD_ICONS.checklist} title="Нотатки та задачі" subtitle="Ведіть нотатки та активності по угоді" />
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
                    <button key={t.value} type="button" className={'chan-tab' + (subTab === t.value ? ' active' : '')} onClick={() => setSubTab(t.value)}>
                      <span dangerouslySetInnerHTML={{ __html: FIELD_ICONS[t.icon] }} />
                      {t.label}
                    </button>
                  ))}
                </div>

                {subTab === 'notes' ? (
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
                      <NoteEditor dealId={deal.id} profiles={profiles} saving={addingNote} onSave={handleAddNote} />
                    </div>
                    {notesLoading ? (
                      <p className="client-history-empty">Завантаження…</p>
                    ) : dealNotes.length > 0 && (
                      <div className="client-history-list">
                        {dealNotes.map((n) => (
                          <div className={'client-history-item deal-note-item' + (n.pinned ? ' pinned' : '')} key={n.id}>
                            <div className="deal-note-head">
                              <div className="deal-note-meta">
                                <span className="deal-note-author">{n.created_by || 'Без автора'}</span>
                                <span className="client-history-week">{new Date(n.created_at).toLocaleString('uk-UA')}</span>
                              </div>
                              <div className="deal-note-actions">
                                <button type="button" className={'deal-field-icon-btn' + (n.pinned ? ' active' : '')} title={n.pinned ? 'Відкріпити' : 'Закріпити'} onClick={() => handleTogglePin(n)}>
                                  <span dangerouslySetInnerHTML={{ __html: FIELD_ICONS.pin }} />
                                </button>
                                <button type="button" className="deal-field-icon-btn" title="Видалити" onClick={() => handleDeleteNote(n)}>&times;</button>
                              </div>
                            </div>
                            <div className="client-history-text deal-note-rich" dangerouslySetInnerHTML={{ __html: sanitizeHtml(n.text) }} />
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    <div className="deal-activity-add">
                      <div className="task-add-row">
                        <input type="text" value={newTaskText} onChange={(e) => setNewTaskText(e.target.value)} placeholder="Що зробити..." />
                        <input type="datetime-local" value={newScheduledAt} onChange={(e) => setNewScheduledAt(e.target.value)} />
                        {(subTab === 'call' || subTab === 'meeting') && (
                          <input type="number" value={newDurationMinutes} onChange={(e) => setNewDurationMinutes(e.target.value)} placeholder="Хв." className="deal-activity-duration" />
                        )}
                      </div>
                      <div className="task-add-row" style={{ marginTop: 8 }}>
                        <select value={newTaskPriority} onChange={(e) => setNewTaskPriority(e.target.value)}>
                          {PRIORITY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                        <select value={newTaskAssignee} onChange={(e) => setNewTaskAssignee(e.target.value)}>
                          <option value="">Не призначено</option>
                          {profiles.map((p) => <option key={p.email} value={p.email}>{p.label}</option>)}
                        </select>
                        <button type="button" className="btn btn-p" onClick={handleAddTask} disabled={adding || !newTaskText.trim()}>+ Додати</button>
                      </div>
                    </div>
                    {tasksLoading ? (
                      <p className="client-history-empty">Завантаження…</p>
                    ) : tasks.length === 0 ? (
                      <p className="client-history-empty">Активностей по цій угоді ще немає.</p>
                    ) : (
                      <div className="client-history-list">
                        {tasks.map((t) => (
                          <div className="client-history-item" key={t.id}>
                            <label className="task-recur-toggle">
                              <input type="checkbox" checked={t.status === 'done'} onChange={() => handleToggleDone(t)} />
                              <span className="deal-activity-icon" dangerouslySetInnerHTML={{ __html: activityIcon(t.activity_type) }} />
                              <span className={t.status === 'done' ? 'task-text done' : ''}>{(t.text || '').split('\n')[0]}</span>
                              {t.scheduled_at && <span className="deal-activity-time">{fmtActivityTime(t.scheduled_at)}</span>}
                            </label>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>

            <div className="deal-section">
              <SectionHead icon={FIELD_ICONS.history} title="Історія угоди" subtitle="Останні дії за цією угодою" />
              <div className="deal-section-body">
                {historyLoading ? (
                  <p className="client-history-empty">Завантаження…</p>
                ) : history.length === 0 ? (
                  <p className="client-history-empty">Історія поки що порожня.</p>
                ) : (
                  <div className="client-history-list">
                    {history.map((h) => (
                      <div className="client-history-item" key={h.id}>
                        <div className="client-history-week">{new Date(h.created_at).toLocaleString('uk-UA')}</div>
                        <div className="client-history-text">
                          {h.text}
                          {h.created_by && <span className="client-history-author"> · {h.created_by}</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

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
    </div>
  );
}
