import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { fetchClientById, updateClientDirectoryEntry, deleteClientDirectoryEntry, fetchClientHistory, fetchClientChangeLog } from '../../lib/api/clients';
import { fetchClientFiles } from '../../lib/api/clientFiles';
import { platformLogo } from '../../lib/platforms';
import { clientFullName } from '../../lib/clientName';
import { stagePillStyle } from '../../lib/stagePillStyle';
import { STATUSES, STATUS_META } from '../../lib/clientStatus';
import { saveCustomTag } from '../../lib/api/customTags';
import { fetchDealsForClient } from '../../lib/api/deals';
import { fetchTasksForClient, fetchTasksForDeal } from '../../lib/api/tasks';
import { fetchDealNotes } from '../../lib/api/dealNotes';
import { fetchPipelines } from '../../lib/api/pipelines';
import { fetchAllProfiles, profileLabel } from '../../lib/api/profile';
import { fetchClientNotes, addClientNote, setClientNotePinned, deleteClientNote } from '../../lib/api/clientNotes';
import { uploadClientNoteImage } from '../../lib/api/clientNoteImages';
import { createMentionNotification } from '../../lib/api/notifications';
import { sanitizeHtml, htmlToPlainText } from '../../lib/sanitizeHtml';
import { COUNTRIES, flagClass } from '../../lib/countries';
import { BUSINESS_NICHES } from '../../lib/businessNiches';
import { CONTACT_TYPES, SOURCES } from '../../lib/clientTypeAndSource';
import { useAuth } from '../../contexts/AuthContext';
import ClientAvatar from '../../components/Clients/ClientAvatar';
import ProfileAvatar from '../../components/common/ProfileAvatar';
import ClientFilesTab from '../../components/Clients/ClientFilesTab';
import NoteEditor from '../../components/Deals/NoteEditor';
import TagInput from '../../components/Automation/TagInput';
import AddDealModal from '../../components/Deals/AddDealModal';
import PlatformPicker from '../../components/common/PlatformPicker';
import Select from '../../components/common/Select';
import MultiTextField from '../../components/common/MultiTextField';
import { FIELD_ICONS } from '../../lib/taskFieldIcons';
import '../../styles/reportPage.css';
import '../../styles/automationTasksPage.css';
import '../../styles/comparePage.css';
import '../../styles/clientsDirectory.css';
import '../../styles/clientProfile.css';
import '../../styles/dealsBoard.css';

const CAMERA_ICON = '<svg viewBox="0 0 24 24"><path d="M4 8h3l1.5-2h7L17 8h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="14" r="3.5"/></svg>';

// Turns a handful of waypoints into a smooth SVG path (Catmull-Rom spline
// converted to cubic Beziers) — every segment's control points are derived
// from its neighbors, so the curve stays tangent-continuous through every
// waypoint with no visible kink, no matter how many ups/downs it has. Used
// for the stats row's wave graphics below, in place of hand-tuned Bezier
// control points (which kinked at the join between segments).
function smoothWavePath(points) {
  let d = `M${points[0][0]},${points[0][1]}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i === 0 ? i : i - 1];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2 === points.length ? i + 1 : i + 2];
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C${c1x},${c1y} ${c2x},${c2y} ${p2[0]},${p2[1]}`;
  }
  return d;
}

// Waypoint trend for the Угоди card's wave graphic — the other two stat
// cards use a bar chart and a ring instead of a second/third wave, so all
// three read as genuinely different chart types side by side, not the same
// shape recolored three times.
const STAT_WAVE_POINTS = [[4, 74], [32, 82], [58, 52], [88, 62], [118, 26], [148, 38], [176, 14], [196, 8]];
const STAT_WAVE_PATH = smoothWavePath(STAT_WAVE_POINTS);

// Bar heights (% of the chart's own height) for the Задачі card — a rising,
// slightly uneven run rather than a perfectly straight staircase.
const STAT_BAR_HEIGHTS = [30, 48, 40, 62, 52, 74, 64, 92, 100];
const BACK_ICON = '<svg viewBox="0 0 24 24"><path d="M19 12H5"/><path d="M11 18l-6-6 6-6"/></svg>';
const PENCIL_ICON = '<svg viewBox="0 0 24 24"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>';
const TRASH_ICON = '<svg viewBox="0 0 24 24"><path d="M4 7h16"/><path d="M9 7V4h6v3"/><path d="M6 7l1 13h10l1-13"/><path d="M10 11v6M14 11v6"/></svg>';
const CHEVRON_ICON = '<svg viewBox="0 0 24 24"><path d="m6 9 6 6 6-6"/></svg>';
const SORT_ICON = '<svg viewBox="0 0 24 24"><path d="M7 4v16M7 4l-3 3M7 4l3 3"/><path d="M17 20V4M17 20l-3-3M17 20l3-3"/></svg>';

// "Угоди" tab — sort options for the deal list, and a days-until helper for
// the detail panel's "Через N днів" countdown next to the expected close date.
const DEAL_SORTS = [
  { value: 'created', label: 'Дата створення' },
  { value: 'amount', label: 'Сума' },
  { value: 'stage', label: 'Стадія' },
];

function daysUntil(dateStr) {
  if (!dateStr) return null;
  const diff = Math.round((new Date(dateStr).setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0)) / 86400000);
  return diff;
}

function daysUntilLabel(n) {
  if (n === null) return null;
  if (n < 0) return `${Math.abs(n)} дн. тому`;
  if (n === 0) return 'Сьогодні';
  return `Через ${n} дн.`;
}


const TAG_CONTEXT = 'client_tags';

const CONTACT_TYPE_OPTIONS = CONTACT_TYPES.map((t) => ({ value: t, label: t }));
const SOURCE_OPTIONS = SOURCES.map((s) => ({ value: s, label: s }));
const COUNTRY_OPTIONS = COUNTRIES.map((c) => ({ value: c.code, label: c.name, iconClassName: flagClass(c.code) }));
const NICHE_OPTIONS = BUSINESS_NICHES.map((n) => ({ value: n, label: n }));

// One row inside a collapsible info card — a small muted icon, a label, and
// either the plain read-only value (view mode) or the real editable control
// passed as `children` (edit mode). Keeps the "Основна інформація" body from
// needing the same if/else repeated ~25 times inline.
function InfoRow({ icon, label, value, editing, children }) {
  return (
    <div className="client-profile-row">
      <span className="client-profile-row-ic" dangerouslySetInnerHTML={{ __html: icon }} />
      <span className="client-profile-row-label">{label}</span>
      {editing ? <div className="client-profile-row-edit">{children}</div> : <span className="client-profile-row-value">{value}</span>}
    </div>
  );
}

// One collapsible card (Персональна інформація / Бізнес / Контактна
// інформація) — gradient icon + title + subtitle in the header, a chevron
// that toggles `collapsed`, rows underneath.
function SectionCard({ icon, gradient, title, subtitle, collapsed, onToggle, children }) {
  return (
    <div className="client-profile-section-card">
      <button type="button" className="client-profile-section-head" onClick={onToggle}>
        <span className="client-profile-section-ic" style={{ background: gradient }} dangerouslySetInnerHTML={{ __html: icon }} />
        <span className="client-profile-section-titles">
          <span className="client-profile-section-title">{title}</span>
          <span className="client-profile-section-sub">{subtitle}</span>
        </span>
        <span className={'client-profile-section-chevron' + (collapsed ? '' : ' open')} dangerouslySetInnerHTML={{ __html: CHEVRON_ICON }} />
      </button>
      {!collapsed && <div className="client-profile-section-body">{children}</div>}
    </div>
  );
}

const ACTIVITY_FIELD_LABELS = {
  platform: 'Платформа', status: 'Статус', company: 'Компанія', name: "Ім'я", last_name: 'Прізвище',
  tags: 'Теги', manager: 'Менеджер', contact_type: 'Тип контакту', source: 'Source', country: 'Країна', photo: 'Фото',
  job_title: 'Посада', websites: 'Вебсайт', socials: 'Соц. мережі', niche: 'Ніша бізнесу',
  goal_launch: 'Які основні цілі запуску?', current_ad_channels: 'Які на разі канали реклами у вас вже працюють?',
  service_interest: 'Яка маркетингова послуга вас цікавить?', brand_name_niche: 'Яка назва вашого бренду та в якій ніші ви працюєте?',
  monthly_budget: 'Який місячний бюджет на маркетинг ви закладаєте?', ad_campaign: 'Ad campaign',
  facebook_lead_id: 'Facebook Lead ID', agency_experience: 'Досвід співпраці з агентствами', start_timing: 'Коли плануєте почати?',
  phone: 'Телефон', email: 'Email', telegram: 'Telegram', whatsapp: 'WhatsApp', linkedin: 'LinkedIn', instagram: 'Instagram',
  nethunt_id: 'NetHunt ID', google_ads_customer_id: 'Google Ads Customer ID',
};
const ACTIVITY_CONTACT_FIELDS = ['name', 'last_name', 'phone', 'email', 'telegram', 'whatsapp', 'linkedin', 'instagram'];
// `color` is the plain hex used for the "Активність" tab's Було/Стало value
// pills; `gradient` (built from the same color) is only for the icon badge.
const ACTIVITY_META_BY_FIELD = {
  tags: { icon: FIELD_ICONS.tag, color: '#DB2777', gradient: 'linear-gradient(135deg, #F472B6, #DB2777)' },
  manager: { icon: FIELD_ICONS.user, color: '#7C3AED', gradient: 'linear-gradient(135deg, #A78BFA, #7C3AED)' },
  status: { icon: FIELD_ICONS.status, color: '#16A34A', gradient: 'linear-gradient(135deg, #4ADE80, #16A34A)' },
  platform: { icon: FIELD_ICONS.website, color: '#2563EB', gradient: 'linear-gradient(135deg, #60A5FA, #2563EB)' },
  photo: { icon: FIELD_ICONS.image, color: '#7C3AED', gradient: 'linear-gradient(135deg, #A78BFA, #7C3AED)' },
  ...Object.fromEntries(ACTIVITY_CONTACT_FIELDS.map((f) => [f, { icon: FIELD_ICONS.user, color: '#2563EB', gradient: 'linear-gradient(135deg, #60A5FA, #2563EB)' }])),
};
const ACTIVITY_DEFAULT_META = { icon: FIELD_ICONS.history, color: '#64748B', gradient: 'linear-gradient(135deg, #94A3B8, #475569)' };

// Category per entry — drives the "Активність" tab's filter pills.
function activityCategory(e) {
  if (e.kind === 'mention') return 'field';
  if (e.field === 'tags') return 'tags';
  if (e.field === 'status') return 'status';
  if (ACTIVITY_CONTACT_FIELDS.includes(e.field)) return 'contact';
  return 'field';
}

const ACTIVITY_FILTERS = [
  { value: 'all', label: 'Усі' },
  { value: 'field', label: 'Зміни полів' },
  { value: 'tags', label: 'Теги' },
  { value: 'contact', label: 'Контакти' },
  { value: 'status', label: 'Статус' },
];

// The full timeline's row title — a bit more specific than the sidebar
// preview's single-line text, since the row already shows the field/value
// diff separately (see the "Активність" tab render).
function activityTitle(e) {
  if (e.kind === 'mention') return 'Згадка у Weekly Report';
  if (e.field === 'tags') return e.old_value ? 'Змінено теги' : 'Додано тег';
  if (e.field === 'status') return 'Змінено статус';
  if (ACTIVITY_CONTACT_FIELDS.includes(e.field)) return 'Змінено контакт';
  return 'Змінено поле';
}

// Turns one merged activity-log entry (a weekly-report mention or a manual
// field edit — see reloadActivity) into what the sidebar preview needs:
// icon/color, a one-line description, and a display timestamp.
function describeActivity(e) {
  if (e.kind === 'mention') {
    return { ...ACTIVITY_DEFAULT_META, icon: FIELD_ICONS.document, text: e.text || 'Згадка у Weekly Report', time: `${e.weekStart} – ${e.weekEnd}` };
  }
  const meta = ACTIVITY_META_BY_FIELD[e.field] || ACTIVITY_DEFAULT_META;
  const label = ACTIVITY_FIELD_LABELS[e.field] || e.field;
  // Photo is stored as a base64 data URL — way too long to show as a raw
  // "old → new" value like every other field.
  const shownValue = e.field === 'photo' ? (e.new_value ? 'оновлено' : 'видалено') : (e.new_value || '—');
  return { ...meta, text: `${label}: ${shownValue}`, time: new Date(e.changed_at).toLocaleString('uk-UA') };
}


// Confirmed final tab order (from the full dashboard mockup discussion).
// "Компанії"/"Проекти"/"Задачі" are placeholders for features whose content
// hasn't been designed yet, same "Скоро" convention as Bot communication/AI
// Team work history — `soon` renders them disabled instead of a working tab.
const TABS = [
  { key: 'info', label: 'Основна інформація' },
  { key: 'companies', label: 'Компанії', soon: true },
  { key: 'projects', label: 'Проекти', soon: true },
  { key: 'notes', label: 'Нотатки' },
  { key: 'activity', label: 'Активність' },
  { key: 'deals', label: 'Угоди' },
  { key: 'tasks', label: 'Задачі', soon: true },
  { key: 'files', label: 'Файли' },
  { key: 'bot', label: 'Bot communication', soon: true },
  { key: 'ai', label: 'AI Team work history', soon: true },
];

export default function ClientProfile() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { email } = useAuth();
  const [client, setClient] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('info');
  const [deals, setDeals] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [pipelines, setPipelines] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [teamProfiles, setTeamProfiles] = useState([]);
  const [addDealOpen, setAddDealOpen] = useState(false);

  // Discrete, pinnable client notes — same shape/UI as a deal's own
  // "Нотатки" (client_notes mirrors deal_notes), now living inside "Основна
  // інформація" instead of a separate tab.
  const [notes, setNotes] = useState([]);
  const [notesLoading, setNotesLoading] = useState(true);
  const [addingNote, setAddingNote] = useState(false);
  const [noteAuthorName, setNoteAuthorName] = useState('');

  const [avatarMenuOpen, setAvatarMenuOpen] = useState(false);
  const avatarMenuRef = useRef(null);
  const fileInputRef = useRef(null);

  // While off, every client field on this page is locked (inputs/selects/
  // pickers disabled) so it's unambiguous when edits are actually possible.
  // `editSnapshotRef` holds the row as it was right when edit mode turned
  // on, so "Скасувати" can revert every change made during this edit pass —
  // fields already autosave on every change (via patch()), so cancelling
  // has to explicitly patch back to the snapshot rather than just discarding
  // unsaved state.
  const [editMode, setEditMode] = useState(false);
  const editSnapshotRef = useRef(null);
  const [statusMenuOpen, setStatusMenuOpen] = useState(false);
  const statusMenuRef = useRef(null);

  // "Основна інформація" sidebar (Остання активність / Файли preview) and
  // the 3 info cards' expand-collapse state.
  const [activityLog, setActivityLog] = useState([]);
  const [files, setFiles] = useState([]);
  const [collapsedSections, setCollapsedSections] = useState({});
  const [dealsTasksSubTab, setDealsTasksSubTab] = useState('deals');

  // "Активність" tab — full timeline built on the same `activityLog` the
  // sidebar preview already loads, plus its own search/category filter/sort.
  const [activitySearch, setActivitySearch] = useState('');
  const [activityFilter, setActivityFilter] = useState('all');
  const [activityNewestFirst, setActivityNewestFirst] = useState(true);

  // "Угоди" tab — master/detail: a filtered/sorted list on the left, the
  // selected deal's own notes/next task on the right (fetched lazily per
  // selection rather than for every deal up front).
  const [selectedDealId, setSelectedDealId] = useState(null);
  const [dealSearch, setDealSearch] = useState('');
  const [dealSort, setDealSort] = useState('created');
  const [dealDetailNotes, setDealDetailNotes] = useState([]);
  const [dealDetailTasks, setDealDetailTasks] = useState([]);

  function toggleSection(key) {
    setCollapsedSections((c) => ({ ...c, [key]: !c[key] }));
  }

  function reloadFiles() {
    fetchClientFiles(id).then(setFiles);
  }

  // Takes the client's name explicitly (rather than reading `client` state)
  // so it can be called right after the client row itself loads, without
  // waiting an extra render for state to settle.
  function reloadActivity(name) {
    Promise.all([fetchClientHistory(name), fetchClientChangeLog(id)]).then(([history, changes]) => {
      const merged = [
        ...history.map((h) => ({ kind: 'mention', date: h.weekStart, ...h })),
        ...changes.map((c) => ({ kind: 'change', date: c.changed_at, ...c })),
      ].sort((a, b) => (a.date < b.date ? 1 : -1));
      setActivityLog(merged);
    });
  }

  function reloadDeals() {
    fetchDealsForClient(id).then(setDeals);
  }

  function reloadNotes() {
    setNotesLoading(true);
    fetchClientNotes(id).then(setNotes).finally(() => setNotesLoading(false));
  }

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchClientById(id).then((row) => { if (!cancelled) { setClient(row); setLoading(false); reloadActivity(row?.name); } });
    fetchDealsForClient(id).then((rows) => { if (!cancelled) setDeals(rows); });
    fetchTasksForClient(id).then((rows) => { if (!cancelled) setTasks(rows); });
    fetchPipelines().then((rows) => { if (!cancelled) setPipelines(rows); });
    fetchAllProfiles().then((rows) => {
      if (cancelled) return;
      setProfiles(rows.map((p) => ({ email: p.email, label: profileLabel(p) })));
      setTeamProfiles(rows);
    });
    reloadFiles();
    reloadNotes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    if (!avatarMenuOpen) return;
    function onDocClick(e) { if (avatarMenuRef.current && !avatarMenuRef.current.contains(e.target)) setAvatarMenuOpen(false); }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [avatarMenuOpen]);

  useEffect(() => {
    if (!statusMenuOpen) return;
    function onDocClick(e) { if (statusMenuRef.current && !statusMenuRef.current.contains(e.target)) setStatusMenuOpen(false); }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [statusMenuOpen]);

  // Keep a selected deal whenever the list has any — first load, or after
  // the previously-selected deal disappears (e.g. a fresh client fetch).
  useEffect(() => {
    if (deals.length && !deals.some((d) => d.id === selectedDealId)) setSelectedDealId(deals[0].id);
    if (!deals.length) setSelectedDealId(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deals]);

  // The deal list itself already loads with every deal's own fields, but
  // notes/tasks are per-deal detail — only worth fetching for whichever one
  // is actually selected, not all of them up front.
  useEffect(() => {
    if (!selectedDealId) { setDealDetailNotes([]); setDealDetailTasks([]); return; }
    let cancelled = false;
    fetchDealNotes(selectedDealId).then((rows) => { if (!cancelled) setDealDetailNotes(rows); });
    fetchTasksForDeal(selectedDealId).then((rows) => { if (!cancelled) setDealDetailTasks(rows); });
    return () => { cancelled = true; };
  }, [selectedDealId]);

  function handleNewTag(tag) {
    saveCustomTag(TAG_CONTEXT, tag);
  }

  function patch(fields) {
    const before = client;
    setClient((c) => ({ ...c, ...fields }));
    updateClientDirectoryEntry(before.id, fields, before, email);
  }

  function startEdit() {
    editSnapshotRef.current = client;
    setEditMode(true);
  }

  function saveEdit() {
    setEditMode(false);
  }

  function cancelEdit() {
    const snapshot = editSnapshotRef.current;
    if (snapshot) {
      const reverted = {};
      Object.keys(snapshot).forEach((k) => { if (client[k] !== snapshot[k]) reverted[k] = snapshot[k]; });
      if (Object.keys(reverted).length) {
        updateClientDirectoryEntry(client.id, reverted, client, email);
        setClient(snapshot);
      }
    }
    setEditMode(false);
  }

  // Real, permanent deletion — deals/notes/tasks tied to this client aren't
  // cascade-deleted (see deleteClientDirectoryEntry), so the confirm warns
  // about that instead of silently leaving them orphaned.
  async function handleDeleteClient() {
    const dealWarning = deals.length
      ? `У цього клієнта є ${deals.length} угод(и) — вони НЕ будуть видалені автоматично.\n\n`
      : '';
    if (!confirm(`${dealWarning}Видалити клієнта «${clientFullName(client)}»? Цю дію не можна скасувати.`)) return;
    try {
      await deleteClientDirectoryEntry(client.id);
      navigate('/reports/clients-directory');
    } catch (e) {
      alert('Помилка видалення: ' + (e.message || e));
    }
  }

  // Same "FileReader → base64 data URL, saved immediately" approach as the
  // team's own profile photo (Account.jsx) — this page's other fields
  // already auto-save on change, so the photo does too rather than staging
  // behind a separate save step.
  function handlePhotoChange(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => patch({ photo: ev.target.result });
    reader.readAsDataURL(file);
    e.target.value = '';
  }

  async function handleAddNote(html, mentionedEmails) {
    const plain = htmlToPlainText(html);
    if (!plain) return false;
    setAddingNote(true);
    try {
      await addClientNote(client.id, sanitizeHtml(html), noteAuthorName.trim() || email);
      for (const m of mentionedEmails) {
        // No deal to link a client-note mention back to — dealId stays null,
        // the notification just won't be clickable (NotificationBell already
        // handles a null `to` as a plain, non-navigating card).
        await createMentionNotification({ recipientEmail: m, senderEmail: email, dealId: null, noteExcerpt: plain.slice(0, 140) });
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
    setNotes((list) => list.map((n) => (n.id === note.id ? { ...n, pinned: !n.pinned } : n)));
    await setClientNotePinned(note.id, !note.pinned);
    reloadNotes();
  }

  async function handleDeleteNote(note) {
    if (!confirm('Видалити цю нотатку?')) return;
    await deleteClientNote(note.id);
    reloadNotes();
  }

  if (loading) return <div className="report-page"><div className="placeholder"><p>Завантаження…</p></div></div>;
  if (!client) return <div className="report-page"><div className="placeholder"><p>Клієнта не знайдено.</p></div></div>;

  const statusMeta = STATUS_META[client.status] || null;
  const activeDealsCount = deals.filter((d) => !d.deal_stages?.is_won && !d.deal_stages?.is_lost).length;
  const activeTasksCount = tasks.filter((t) => t.status === 'pending').length;

  // "Угоди" tab — filter by title/pipeline-name match, then sort.
  const sortedDeals = deals
    .filter((d) => {
      const q = dealSearch.trim().toLowerCase();
      if (!q) return true;
      return (d.title || '').toLowerCase().includes(q) || (d.pipelines?.name || '').toLowerCase().includes(q);
    })
    .sort((a, b) => {
      if (dealSort === 'amount') return (b.amount || 0) - (a.amount || 0);
      if (dealSort === 'stage') return (a.deal_stages?.position ?? 0) - (b.deal_stages?.position ?? 0);
      return new Date(b.created_at || 0) - new Date(a.created_at || 0);
    });
  const selectedDeal = deals.find((d) => d.id === selectedDealId) || null;
  const selectedDealManagerProfile = selectedDeal ? teamProfiles.find((p) => profileLabel(p) === selectedDeal.manager) : null;
  const dealNextTask = dealDetailTasks.filter((t) => t.status === 'pending').sort((a, b) => new Date(a.scheduled_at || a.task_date || 0) - new Date(b.scheduled_at || b.task_date || 0))[0] || null;
  const dealLastNote = dealDetailNotes[0] || null;

  // "Активність" tab — filter, search, sort, then group into date buckets
  // ("17.09.2026" headers with a per-day count), same order the mockup uses.
  const filteredActivity = activityLog
    .filter((e) => activityFilter === 'all' || activityCategory(e) === activityFilter)
    .filter((e) => {
      const q = activitySearch.trim().toLowerCase();
      if (!q) return true;
      const haystack = [activityTitle(e), e.field, ACTIVITY_FIELD_LABELS[e.field], e.old_value, e.new_value, e.text, e.changed_by].filter(Boolean).join(' ').toLowerCase();
      return haystack.includes(q);
    })
    .sort((a, b) => (activityNewestFirst ? 1 : -1) * (new Date(a.date) - new Date(b.date)));
  const activityGroups = [];
  filteredActivity.forEach((e) => {
    const dateKey = (e.date || '').slice(0, 10);
    let group = activityGroups.find((g) => g.dateKey === dateKey);
    if (!group) { group = { dateKey, entries: [] }; activityGroups.push(group); }
    group.entries.push(e);
  });

  return (
    <div className="report-page">
      <div className="client-profile-top-row">
        <button type="button" className="btn client-profile-back" onClick={() => navigate('/reports/clients-directory')}>
          <span className="client-profile-action-ic" style={{ background: 'linear-gradient(135deg, #A78BFA, #7C3AED)' }} dangerouslySetInnerHTML={{ __html: BACK_ICON }} />
          Назад до контактів
        </button>
        <div className="client-profile-top-actions">
          {editMode ? (
            <>
              <button type="button" className="btn" onClick={cancelEdit}>Скасувати</button>
              <button type="button" className="btn btn-p" onClick={saveEdit}>Зберегти</button>
            </>
          ) : (
            <button type="button" className="btn" onClick={startEdit}>
              <span className="client-profile-action-ic" style={{ background: 'linear-gradient(135deg, #A78BFA, #7C3AED)' }} dangerouslySetInnerHTML={{ __html: PENCIL_ICON }} />
              Редагувати
            </button>
          )}
          <button type="button" className="btn" disabled title="Скоро">
            <span className="client-profile-action-ic" style={{ background: 'linear-gradient(135deg, #2DD4BF, #0D9488)' }} dangerouslySetInnerHTML={{ __html: FIELD_ICONS.company }} />
            Створити компанію
          </button>
          <button type="button" className="btn btn-p" onClick={() => setAddDealOpen(true)}>
            <span className="client-profile-action-ic client-profile-action-ic--ghost" dangerouslySetInnerHTML={{ __html: FIELD_ICONS.briefcase }} />
            Створити угоду
          </button>
          <button type="button" className="btn client-profile-btn-danger" onClick={handleDeleteClient}>
            <span className="client-profile-action-ic" style={{ background: 'linear-gradient(135deg, #F87171, #DC2626)' }} dangerouslySetInnerHTML={{ __html: TRASH_ICON }} />
            Видалити контакт
          </button>
        </div>
      </div>

      <section className="client-profile-card">
        <div className="client-profile-card-top">
          <div className="client-profile-avatar-wrap" ref={avatarMenuRef}>
            <ClientAvatar name={client.name} photo={client.photo} size={64} />
            {editMode && (
              <button type="button" className="client-profile-avatar-cam" onClick={() => setAvatarMenuOpen((o) => !o)} aria-label="Змінити фото">
                <span dangerouslySetInnerHTML={{ __html: CAMERA_ICON }} />
              </button>
            )}
            {avatarMenuOpen && (
              <div className="client-profile-avatar-menu">
                <button type="button" onClick={() => { setAvatarMenuOpen(false); fileInputRef.current?.click(); }}>Змінити фото</button>
                {client.photo && <button type="button" onClick={() => { setAvatarMenuOpen(false); patch({ photo: null }); }}>Прибрати фото</button>}
              </div>
            )}
            <input ref={fileInputRef} type="file" accept="image/*" hidden onChange={handlePhotoChange} />
          </div>
          <div className="client-profile-name-block">
            <div className="client-profile-name-row">
              <h1>{clientFullName(client)}</h1>
              <div className="client-profile-status" ref={statusMenuRef}>
                <button
                  type="button" className="client-profile-status-trigger"
                  style={statusMeta ? { color: statusMeta.color, background: statusMeta.tint, borderColor: `${statusMeta.color}4D` } : undefined}
                  onClick={() => setStatusMenuOpen((o) => !o)}
                  disabled={!editMode}
                >
                  <span className="client-profile-status-dot" style={{ background: statusMeta ? statusMeta.color : 'var(--muted)' }} />
                  {client.status || 'Без статусу'}
                  {editMode && <span className="client-profile-status-chevron" dangerouslySetInnerHTML={{ __html: CHEVRON_ICON }} />}
                </button>
                {statusMenuOpen && (
                  <div className="platform-picker-menu client-profile-status-menu">
                    {STATUSES.map((s) => (
                      <button
                        type="button" key={s} className={'platform-picker-row' + (client.status === s ? ' active' : '')}
                        onClick={() => { patch({ status: s }); setStatusMenuOpen(false); }}
                      >
                        <span className="client-profile-status-dot" style={{ background: STATUS_META[s].color }} />
                        {s}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <p className="sub">
              <span dangerouslySetInnerHTML={{ __html: FIELD_ICONS.company }} /> {client.company || 'Компанія не вказана'}
            </p>
          </div>
        </div>

        <div className="client-profile-quickrow">
          <div className="client-profile-quick-field">
            <span className="client-profile-quick-ic" style={{ background: 'linear-gradient(135deg, #60A5FA, #2563EB)' }} dangerouslySetInnerHTML={{ __html: FIELD_ICONS.website }} />
            <div className="client-profile-quick-body">
              <label>Платформа</label>
              <PlatformPicker className="platform-picker--bare" value={client.platform || ''} onChange={(v) => patch({ platform: v })} disabled={!editMode} />
            </div>
          </div>
          <div className="client-profile-quick-field">
            <span className="client-profile-quick-ic" style={{ background: 'linear-gradient(135deg, #2DD4BF, #0D9488)' }} dangerouslySetInnerHTML={{ __html: FIELD_ICONS.source }} />
            <div className="client-profile-quick-body">
              <label>Джерело</label>
              <Select bare value={client.source || ''} onChange={(v) => patch({ source: v || null })} options={SOURCE_OPTIONS} placeholder="Не вказано" disabled={!editMode} />
            </div>
          </div>
          <div className="client-profile-quick-field">
            <span className="client-profile-quick-ic" style={{ background: 'linear-gradient(135deg, #FDBA74, #EA580C)' }} dangerouslySetInnerHTML={{ __html: FIELD_ICONS.mapPin }} />
            <div className="client-profile-quick-body">
              <label>Країна</label>
              <Select bare searchable value={client.country || ''} onChange={(v) => patch({ country: v || null })} options={COUNTRY_OPTIONS} placeholder="Не вказано" disabled={!editMode} />
            </div>
          </div>
          <div className="client-profile-quick-field">
            <span className="client-profile-quick-ic" style={{ background: 'linear-gradient(135deg, #A78BFA, #7C3AED)' }} dangerouslySetInnerHTML={{ __html: FIELD_ICONS.user }} />
            <div className="client-profile-quick-body">
              <label>Менеджер</label>
              <div className="client-profile-readonly">{client.manager || 'Не призначено'}</div>
            </div>
          </div>
          <div className="client-profile-quick-field client-profile-quick-tags">
            <span className="client-profile-quick-ic" style={{ background: 'linear-gradient(135deg, #F472B6, #DB2777)' }} dangerouslySetInnerHTML={{ __html: FIELD_ICONS.tag }} />
            <div className="client-profile-quick-body">
              <label>Теги</label>
              <TagInput
                tags={client.tags || []}
                onChange={(tags) => patch({ tags })}
                suggestions={[]}
                onNewTag={handleNewTag}
                placeholder="Додати тег"
                disabled={!editMode}
              />
            </div>
          </div>
        </div>
      </section>

      <div className="client-profile-stats-row">
        <div className="client-profile-stat-card">
          <div className="client-profile-stat-head">
            <span className="client-profile-stat-icon" style={{ background: 'linear-gradient(135deg, #A78BFA, #7C3AED)' }} dangerouslySetInnerHTML={{ __html: FIELD_ICONS.briefcase }} />
            <span className="client-profile-stat-label">Кількість активних угод</span>
          </div>
          <div className="client-profile-stat-value">{activeDealsCount}</div>
          <div className="client-profile-stat-sub">Відкриті угоди в роботі</div>
          <svg className="client-profile-stat-wave" viewBox="0 0 200 90" preserveAspectRatio="none">
            <defs>
              <linearGradient id="statWavePurple" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#7C3AED" stopOpacity=".32" />
                <stop offset="100%" stopColor="#7C3AED" stopOpacity="0" />
              </linearGradient>
            </defs>
            <path d={STAT_WAVE_PATH + ' L196,90 L4,90 Z'} fill="url(#statWavePurple)" stroke="none" />
            <path d={STAT_WAVE_PATH} fill="none" stroke="#7C3AED" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx="196" cy="8" r="7" fill="#7C3AED" opacity=".18" />
            <circle cx="196" cy="8" r="3.5" fill="#7C3AED" />
          </svg>
        </div>
        <div className="client-profile-stat-card">
          <div className="client-profile-stat-head">
            <span className="client-profile-stat-icon" style={{ background: 'linear-gradient(135deg, #60A5FA, #2563EB)' }} dangerouslySetInnerHTML={{ __html: FIELD_ICONS.checklist }} />
            <span className="client-profile-stat-label">Кількість активних задач</span>
          </div>
          <div className="client-profile-stat-value">{activeTasksCount}</div>
          <div className="client-profile-stat-sub">Задачі, що в роботі</div>
          <div className="client-profile-stat-bars">
            {STAT_BAR_HEIGHTS.map((h, i) => (
              <span
                key={i} className="client-profile-stat-bar"
                style={{ height: h + '%', background: 'linear-gradient(180deg, #93C5FD, #2563EB)', opacity: .55 + (i / STAT_BAR_HEIGHTS.length) * .45 }}
              />
            ))}
          </div>
        </div>
        <div className="client-profile-stat-card">
          <div className="client-profile-stat-head">
            <span className="client-profile-stat-icon" style={{ background: 'linear-gradient(135deg, #2DD4BF, #0D9488)' }} dangerouslySetInnerHTML={{ __html: FIELD_ICONS.company }} />
            <span className="client-profile-stat-label">Кількість компаній</span>
          </div>
          <div className="client-profile-stat-value">—</div>
          <div className="client-profile-stat-sub">Скоро</div>
          <div className="client-profile-stat-donut">
            <svg viewBox="0 0 100 100">
              <defs>
                <linearGradient id="statDonutTeal" x1="0" y1="1" x2="1" y2="0">
                  <stop offset="0%" stopColor="#5EEAD4" />
                  <stop offset="100%" stopColor="#0D9488" />
                </linearGradient>
              </defs>
              <circle cx="50" cy="50" r="40" fill="none" stroke="#0D948826" strokeWidth="11" />
              <circle
                cx="50" cy="50" r="40" fill="none" stroke="url(#statDonutTeal)" strokeWidth="11" strokeLinecap="round"
                strokeDasharray="150 251.2" transform="rotate(-90 50 50)"
              />
            </svg>
            <span className="client-profile-stat-donut-ic" dangerouslySetInnerHTML={{ __html: FIELD_ICONS.company }} />
          </div>
        </div>
      </div>

      <div className="client-panel-tabs client-profile-tabs">
        {TABS.map((t) => (
          t.soon ? (
            <button key={t.key} type="button" className="client-panel-tab" disabled title="Скоро">{t.label}</button>
          ) : (
            <button key={t.key} type="button" className={'client-panel-tab' + (activeTab === t.key ? ' active' : '')} onClick={() => setActiveTab(t.key)}>
              {t.label}
            </button>
          )
        ))}
      </div>

      <section className={'report-section client-profile-section' + (activeTab === 'info' || activeTab === 'deals' || activeTab === 'activity' ? ' client-profile-section--wide' : '')}>
        {activeTab === 'info' && (
          <div className="client-profile-info-layout">
            <div className="client-profile-info-main">
              <SectionCard
                icon={FIELD_ICONS.user} gradient="linear-gradient(135deg, #A78BFA, #7C3AED)"
                title="Персональна інформація" subtitle="Основні дані про контакт"
                collapsed={!!collapsedSections.personal} onToggle={() => toggleSection('personal')}
              >
                <InfoRow icon={FIELD_ICONS.user} label="Ім'я" value={client.name || '—'} editing={editMode}>
                  <input type="text" value={client.name || ''} onChange={(e) => patch({ name: e.target.value })} />
                </InfoRow>
                <InfoRow icon={FIELD_ICONS.user} label="Прізвище" value={client.last_name || '—'} editing={editMode}>
                  <input type="text" value={client.last_name || ''} onChange={(e) => patch({ last_name: e.target.value })} />
                </InfoRow>
                <InfoRow icon={FIELD_ICONS.company} label="Компанія" value={client.company || '—'} editing={editMode}>
                  <input type="text" value={client.company || ''} onChange={(e) => patch({ company: e.target.value })} />
                </InfoRow>
                <InfoRow
                  icon={FIELD_ICONS.website} label="Платформа" editing={editMode}
                  value={client.platform ? (
                    <span className="client-profile-row-platform">
                      {platformLogo(client.platform) && <img src={platformLogo(client.platform)} alt="" />}
                      {client.platform}
                    </span>
                  ) : '—'}
                >
                  <PlatformPicker value={client.platform || ''} onChange={(v) => patch({ platform: v })} />
                </InfoRow>
                <InfoRow icon={FIELD_ICONS.tag} label="Тип контакту" value={client.contact_type || 'Не вказано'} editing={editMode}>
                  <Select value={client.contact_type || ''} onChange={(v) => patch({ contact_type: v || null })} options={CONTACT_TYPE_OPTIONS} placeholder="Не вказано" />
                </InfoRow>
                <InfoRow icon={FIELD_ICONS.source} label="Source" value={client.source || 'Не вказано'} editing={editMode}>
                  <Select value={client.source || ''} onChange={(v) => patch({ source: v || null })} options={SOURCE_OPTIONS} placeholder="Не вказано" />
                </InfoRow>
                <InfoRow icon={FIELD_ICONS.briefcase} label="Посада" value={client.job_title || '—'} editing={editMode}>
                  <input type="text" value={client.job_title || ''} onChange={(e) => patch({ job_title: e.target.value })} />
                </InfoRow>
                <InfoRow
                  icon={FIELD_ICONS.mapPin} label="Країна" editing={editMode}
                  value={client.country ? (
                    <span className="client-profile-row-platform">
                      <span className={flagClass(client.country)} />
                      {COUNTRIES.find((c) => c.code === client.country)?.name || client.country}
                    </span>
                  ) : 'Не вказано'}
                >
                  <Select searchable value={client.country || ''} onChange={(v) => patch({ country: v || null })} options={COUNTRY_OPTIONS} placeholder="Не вказано" />
                </InfoRow>
              </SectionCard>

              <SectionCard
                icon={FIELD_ICONS.briefcase} gradient="linear-gradient(135deg, #2DD4BF, #0D9488)"
                title="Бізнес" subtitle="Інформація про бізнес та проєкти"
                collapsed={!!collapsedSections.business} onToggle={() => toggleSection('business')}
              >
                <InfoRow icon={FIELD_ICONS.website} label="Вебсайт" value={(client.websites || []).filter(Boolean).join(', ') || '—'} editing={editMode}>
                  <MultiTextField values={client.websites || []} onChange={(websites) => patch({ websites })} placeholder="https://..." />
                </InfoRow>
                <InfoRow icon={FIELD_ICONS.link} label="Соц. мережі" value={(client.socials || []).filter(Boolean).join(', ') || '—'} editing={editMode}>
                  <MultiTextField values={client.socials || []} onChange={(socials) => patch({ socials })} placeholder="https://..." />
                </InfoRow>
                <InfoRow icon={FIELD_ICONS.target} label="Ніша бізнесу" value={client.niche || 'Не вказано'} editing={editMode}>
                  <Select value={client.niche || ''} onChange={(v) => patch({ niche: v || null })} options={NICHE_OPTIONS} placeholder="Не вказано" />
                </InfoRow>
                <InfoRow icon={FIELD_ICONS.target} label="Які основні цілі запуску?" value={client.goal_launch || '—'} editing={editMode}>
                  <input type="text" value={client.goal_launch || ''} onChange={(e) => patch({ goal_launch: e.target.value })} />
                </InfoRow>
                <InfoRow icon={FIELD_ICONS.megaphone} label="Які на разі канали реклами у вас вже працюють?" value={client.current_ad_channels || '—'} editing={editMode}>
                  <input type="text" value={client.current_ad_channels || ''} onChange={(e) => patch({ current_ad_channels: e.target.value })} />
                </InfoRow>
                <InfoRow icon={FIELD_ICONS.briefcase} label="Яка маркетингова послуга вас цікавить?" value={client.service_interest || '—'} editing={editMode}>
                  <input type="text" value={client.service_interest || ''} onChange={(e) => patch({ service_interest: e.target.value })} />
                </InfoRow>
                <InfoRow icon={FIELD_ICONS.tag} label="Яка назва вашого бренду та в якій ніші ви працюєте?" value={client.brand_name_niche || '—'} editing={editMode}>
                  <input type="text" value={client.brand_name_niche || ''} onChange={(e) => patch({ brand_name_niche: e.target.value })} />
                </InfoRow>
                <InfoRow icon={FIELD_ICONS.currency} label="Який місячний бюджет на маркетинг ви закладаєте?" value={client.monthly_budget || '—'} editing={editMode}>
                  <input type="text" value={client.monthly_budget || ''} onChange={(e) => patch({ monthly_budget: e.target.value })} />
                </InfoRow>
                <InfoRow icon={FIELD_ICONS.megaphone} label="Ad campaign" value={client.ad_campaign || '—'} editing={editMode}>
                  <input type="text" value={client.ad_campaign || ''} onChange={(e) => patch({ ad_campaign: e.target.value })} />
                </InfoRow>
                <InfoRow icon={FIELD_ICONS.target} label="Google Ads Customer ID" value={client.google_ads_customer_id || '—'} editing={editMode}>
                  <input type="text" placeholder="123-456-7890" value={client.google_ads_customer_id || ''} onChange={(e) => patch({ google_ads_customer_id: e.target.value })} />
                </InfoRow>
                <InfoRow icon={FIELD_ICONS.at} label="Facebook Lead ID" value={client.facebook_lead_id || '—'} editing={editMode}>
                  <input type="text" value={client.facebook_lead_id || ''} onChange={(e) => patch({ facebook_lead_id: e.target.value })} />
                </InfoRow>
                <InfoRow icon={FIELD_ICONS.history} label="Досвід співпраці з агентствами" value={client.agency_experience || '—'} editing={editMode}>
                  <input type="text" value={client.agency_experience || ''} onChange={(e) => patch({ agency_experience: e.target.value })} />
                </InfoRow>
                <InfoRow icon={FIELD_ICONS.deadline} label="Коли плануєте почати?" value={client.start_timing || '—'} editing={editMode}>
                  <input type="text" value={client.start_timing || ''} onChange={(e) => patch({ start_timing: e.target.value })} />
                </InfoRow>
              </SectionCard>

              <SectionCard
                icon={FIELD_ICONS.phone} gradient="linear-gradient(135deg, #60A5FA, #2563EB)"
                title="Контактна інформація" subtitle="Канали зв'язку та нотатки"
                collapsed={!!collapsedSections.contact} onToggle={() => toggleSection('contact')}
              >
                <InfoRow icon={FIELD_ICONS.phone} label="Телефон" value={client.phone || '—'} editing={editMode}>
                  <input type="text" value={client.phone || ''} onChange={(e) => patch({ phone: e.target.value })} />
                </InfoRow>
                <InfoRow icon={FIELD_ICONS.email} label="Email" value={client.email || '—'} editing={editMode}>
                  <input type="text" value={client.email || ''} onChange={(e) => patch({ email: e.target.value })} />
                </InfoRow>
                <InfoRow icon={FIELD_ICONS.chatLink} label="Telegram" value={client.telegram || '—'} editing={editMode}>
                  <input type="text" value={client.telegram || ''} onChange={(e) => patch({ telegram: e.target.value })} />
                </InfoRow>
                <InfoRow icon={FIELD_ICONS.chatLink} label="WhatsApp" value={client.whatsapp || '—'} editing={editMode}>
                  <input type="text" value={client.whatsapp || ''} onChange={(e) => patch({ whatsapp: e.target.value })} />
                </InfoRow>
                <InfoRow icon={FIELD_ICONS.link} label="LinkedIn" value={client.linkedin || '—'} editing={editMode}>
                  <input type="text" value={client.linkedin || ''} onChange={(e) => patch({ linkedin: e.target.value })} />
                </InfoRow>
                <InfoRow icon={FIELD_ICONS.image} label="Instagram" value={client.instagram || '—'} editing={editMode}>
                  <input type="text" value={client.instagram || ''} onChange={(e) => patch({ instagram: e.target.value })} />
                </InfoRow>
              </SectionCard>
            </div>

            <div className="client-profile-info-sidebar">
              <div className="client-profile-side-card">
                <div className="client-profile-side-head">
                  <span className="client-profile-side-title">Остання активність</span>
                  <button type="button" className="client-profile-side-link" onClick={() => setActiveTab('activity')}>Переглянути всі</button>
                </div>
                {activityLog.length === 0 ? (
                  <p className="client-history-empty">Активності ще немає.</p>
                ) : (
                  <div className="client-profile-activity-list">
                    {activityLog.slice(0, 4).map((e, i) => {
                      const meta = describeActivity(e);
                      return (
                        <div className="client-profile-activity-row" key={i}>
                          <span className="client-profile-activity-ic" style={{ background: meta.gradient }} dangerouslySetInnerHTML={{ __html: meta.icon }} />
                          <div className="client-profile-activity-body">
                            <div className="client-profile-activity-text">{meta.text}</div>
                            <div className="client-profile-activity-time">{meta.time}</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="client-profile-side-card">
                <div className="client-profile-side-head">
                  <span className="client-profile-side-title">Нотатки</span>
                  <button type="button" className="client-profile-side-link" onClick={() => setActiveTab('notes')}>Всі нотатки</button>
                </div>
                {notes.length > 0 && (
                  <div className="client-profile-note-preview-list">
                    {notes.slice(0, 2).map((n) => (
                      <div className="client-profile-note-preview" key={n.id}>
                        <span className="client-profile-note-avatar">{(n.created_by || '?')[0].toUpperCase()}</span>
                        <div className="client-profile-note-preview-body">
                          <div className="client-profile-note-preview-top">
                            <span className="client-profile-note-preview-author">{n.created_by || 'Хтось'}</span>
                            <span className="client-profile-note-preview-date">{new Date(n.created_at).toLocaleDateString('uk-UA')}</span>
                          </div>
                          <div className="client-profile-note-preview-text">{htmlToPlainText(n.text)}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                <NoteEditor profiles={profiles} saving={addingNote} onSave={handleAddNote} onUploadImage={(file) => uploadClientNoteImage(client.id, file)} />
              </div>

              <div className="client-profile-side-card">
                <span className="client-profile-side-title">Швидкі дії</span>
                <div className="client-profile-quick-actions">
                  <button type="button" className="client-profile-quick-action" style={{ background: '#EDE7FB' }} onClick={startEdit}>
                    <span className="client-profile-quick-action-ic" style={{ background: 'linear-gradient(135deg, #A78BFA, #7C3AED)' }} dangerouslySetInnerHTML={{ __html: PENCIL_ICON }} />
                    Редагувати контакт
                  </button>
                  <button type="button" className="client-profile-quick-action" style={{ background: '#DCFCE7' }} onClick={() => setAddDealOpen(true)}>
                    <span className="client-profile-quick-action-ic" style={{ background: 'linear-gradient(135deg, #4ADE80, #16A34A)' }} dangerouslySetInnerHTML={{ __html: FIELD_ICONS.currency }} />
                    Створити угоду
                  </button>
                  <button type="button" className="client-profile-quick-action" disabled title="Скоро" style={{ background: '#FFEDD5' }}>
                    <span className="client-profile-quick-action-ic" style={{ background: 'linear-gradient(135deg, #FDBA74, #EA580C)' }} dangerouslySetInnerHTML={{ __html: FIELD_ICONS.check }} />
                    Створити задачу
                  </button>
                  <button type="button" className="client-profile-quick-action" style={{ background: '#E0F2FE' }} onClick={() => setActiveTab('notes')}>
                    <span className="client-profile-quick-action-ic" style={{ background: 'linear-gradient(135deg, #60A5FA, #2563EB)' }} dangerouslySetInnerHTML={{ __html: FIELD_ICONS.document }} />
                    Додати нотатку
                  </button>
                </div>
              </div>

              <div className="client-profile-side-card">
                <span className="client-profile-side-title">Останні угоди / завдання</span>
                <div className="client-profile-subtabs">
                  <button type="button" className={'client-profile-subtab' + (dealsTasksSubTab === 'deals' ? ' active' : '')} onClick={() => setDealsTasksSubTab('deals')}>
                    Угоди ({deals.length})
                  </button>
                  <button type="button" className={'client-profile-subtab' + (dealsTasksSubTab === 'tasks' ? ' active' : '')} onClick={() => setDealsTasksSubTab('tasks')}>
                    Завдання ({tasks.length})
                  </button>
                </div>
                {dealsTasksSubTab === 'deals' ? (
                  deals.length === 0 ? (
                    <div className="client-profile-side-empty">
                      <span className="client-profile-side-empty-ic" dangerouslySetInnerHTML={{ __html: FIELD_ICONS.document }} />
                      <p className="client-profile-side-empty-title">Ще немає угод</p>
                      <p className="client-profile-side-empty-sub">Створіть першу угоду для цього клієнта, щоб відстежувати прогрес</p>
                      <button type="button" className="btn btn-p" onClick={() => setAddDealOpen(true)}>+ Створити угоду</button>
                    </div>
                  ) : (
                    <div className="client-profile-mini-list">
                      {deals.slice(0, 3).map((d) => (
                        <button type="button" className="client-profile-mini-row" key={d.id} onClick={() => navigate(`/reports/deals?open=${d.id}`)}>
                          <span className="client-profile-mini-row-ic" style={{ background: 'linear-gradient(135deg, #A78BFA, #7C3AED)' }} dangerouslySetInnerHTML={{ __html: FIELD_ICONS.briefcase }} />
                          <span className="client-profile-mini-row-body">
                            <span className="client-profile-mini-row-title">{d.pipelines?.name ? `${d.pipelines.name} · ` : ''}{d.deal_stages?.label}</span>
                            {d.manager && <span className="client-profile-mini-row-sub">{d.manager}</span>}
                          </span>
                          <span className="client-profile-mini-row-go" dangerouslySetInnerHTML={{ __html: FIELD_ICONS.externalLink }} />
                        </button>
                      ))}
                    </div>
                  )
                ) : tasks.length === 0 ? (
                  <div className="client-profile-side-empty">
                    <span className="client-profile-side-empty-ic" dangerouslySetInnerHTML={{ __html: FIELD_ICONS.checklist }} />
                    <p className="client-profile-side-empty-title">Ще немає завдань</p>
                  </div>
                ) : (
                  <div className="client-profile-mini-list">
                    {tasks.slice(0, 3).map((t) => (
                      <button type="button" className="client-profile-mini-row" key={t.id} onClick={() => navigate(`/reports/deal-tasks?open=${t.id}`)}>
                        <span className="client-profile-mini-row-ic" style={{ background: 'linear-gradient(135deg, #60A5FA, #2563EB)' }} dangerouslySetInnerHTML={{ __html: FIELD_ICONS.checklist }} />
                        <span className="client-profile-mini-row-body">
                          <span className="client-profile-mini-row-title">{t.text}</span>
                        </span>
                        <span className="client-profile-mini-row-go" dangerouslySetInnerHTML={{ __html: FIELD_ICONS.externalLink }} />
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="client-profile-side-card">
                <div className="client-profile-side-head">
                  <span className="client-profile-side-title">Файли</span>
                  <button type="button" className="client-profile-side-link" onClick={() => setActiveTab('files')}>Всі файли</button>
                </div>
                {files.length === 0 ? (
                  <div className="client-profile-side-empty">
                    <span className="client-profile-side-empty-ic" dangerouslySetInnerHTML={{ __html: FIELD_ICONS.upload }} />
                    <p className="client-profile-side-empty-title">Файли ще не додані</p>
                    <p className="client-profile-side-empty-sub">Завантажте документи, презентації або інші файли</p>
                    <button type="button" className="btn" onClick={() => setActiveTab('files')}>Завантажити файл</button>
                  </div>
                ) : (
                  <div className="client-profile-file-preview-list">
                    {files.slice(0, 3).map((f) => (
                      <div className="client-profile-file-preview-row" key={f.id}>
                        <span dangerouslySetInnerHTML={{ __html: FIELD_ICONS.document }} />
                        {f.file_name}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
        {activeTab === 'notes' && (
          <div className="client-profile-info">
            <div className="deal-note-add-row">
              <div className="deal-note-author-field">
                <label>Зробив нотатку</label>
                <input
                  type="text" value={noteAuthorName}
                  onChange={(e) => setNoteAuthorName(e.target.value)}
                  placeholder="Ім'я Прізвище"
                />
              </div>
              <NoteEditor profiles={profiles} saving={addingNote} onSave={handleAddNote} onUploadImage={(file) => uploadClientNoteImage(client.id, file)} />
            </div>
            {notesLoading ? (
              <p className="client-history-empty">Завантаження…</p>
            ) : notes.length === 0 ? (
              <p className="client-history-empty">Нотаток ще немає.</p>
            ) : (
              <div className="client-history-list">
                {notes.map((n) => (
                  <div key={n.id} className="deal-history-row">
                    <span className="deal-history-ic" dangerouslySetInnerHTML={{ __html: FIELD_ICONS.document }} />
                    <div className="deal-history-body">
                      <div className="deal-history-top">
                        <span className="deal-history-type">Нотатка</span>
                        <span className="client-history-week">{new Date(n.created_at).toLocaleString('uk-UA')}</span>
                      </div>
                      <div className="client-history-text">{htmlToPlainText(n.text)}</div>
                      {n.created_by && <div className="deal-history-meta">{n.created_by}</div>}
                    </div>
                    <div className="deal-history-actions">
                      <button type="button" className={'deal-field-icon-btn' + (n.pinned ? ' active' : '')} title={n.pinned ? 'Відкріпити' : 'Закріпити'} onClick={() => handleTogglePin(n)}>
                        <span dangerouslySetInnerHTML={{ __html: FIELD_ICONS.pin }} />
                      </button>
                      <button type="button" className="deal-field-icon-btn" title="Видалити" onClick={() => handleDeleteNote(n)}>&times;</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        {activeTab === 'deals' && (
          deals.length === 0 ? (
            <div className="client-profile-info">
              <p className="client-history-empty">Угод ще немає.</p>
              <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                <button type="button" className="btn btn-p" onClick={() => setAddDealOpen(true)}>Створити угоду</button>
                <button type="button" className="btn" onClick={() => navigate('/reports/deals')}>Переглянути в Угодах</button>
              </div>
            </div>
          ) : (
            <div className="client-profile-deals-layout">
              <div className="client-profile-deals-list-card">
                <div className="client-profile-deals-list-head">
                  <h3>Угоди ({deals.length})</h3>
                  <Select bare value={dealSort} onChange={setDealSort} options={DEAL_SORTS} />
                </div>
                <div className="client-profile-deals-search">
                  <span dangerouslySetInnerHTML={{ __html: FIELD_ICONS.search }} />
                  <input type="text" value={dealSearch} onChange={(e) => setDealSearch(e.target.value)} placeholder="Пошук серед угод..." />
                </div>
                <div className="client-profile-deals-list">
                  {sortedDeals.map((d) => {
                    const rowManagerProfile = teamProfiles.find((p) => profileLabel(p) === d.manager);
                    return (
                      <button
                        type="button" key={d.id}
                        className={'client-profile-deal-row' + (d.id === selectedDealId ? ' active' : '')}
                        onClick={() => setSelectedDealId(d.id)}
                      >
                        <span className="client-profile-mini-row-ic" style={{ background: 'linear-gradient(135deg, #60A5FA, #2563EB)' }} dangerouslySetInnerHTML={{ __html: FIELD_ICONS.briefcase }} />
                        <div className="client-profile-deal-row-body">
                          <div className="client-profile-deal-row-top">
                            <div className="client-profile-deal-row-title">{d.title || client.company || clientFullName(client)}</div>
                            <span className="client-profile-deal-row-stage" style={stagePillStyle(d.deal_stages?.color)}>
                              <span className="client-profile-status-dot" style={{ background: 'rgba(255,255,255,.7)' }} />
                              {d.deal_stages?.label || '—'}
                            </span>
                          </div>
                          <div className="client-profile-deal-row-meta">
                            <span><span dangerouslySetInnerHTML={{ __html: FIELD_ICONS.company }} />{client.company || clientFullName(client)}</span>
                            {d.amount != null && <span><span dangerouslySetInnerHTML={{ __html: FIELD_ICONS.currency }} />{Number(d.amount).toLocaleString('uk-UA')} {d.currency}</span>}
                            {d.created_at && <span><span dangerouslySetInnerHTML={{ __html: FIELD_ICONS.day }} />{new Date(d.created_at).toLocaleDateString('uk-UA')}</span>}
                          </div>
                        </div>
                        {d.manager && <ProfileAvatar profile={rowManagerProfile} name={d.manager} className="client-profile-deal-row-avatar" />}
                        <span className="client-profile-deal-row-chevron" dangerouslySetInnerHTML={{ __html: FIELD_ICONS.externalLink }} />
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="client-profile-deal-detail-card">
                {!selectedDeal ? (
                  <p className="client-history-empty">Оберіть угоду зі списку.</p>
                ) : (
                  <>
                    <div className="client-profile-deal-detail-top">
                      <span className="client-profile-deal-detail-stage" style={stagePillStyle(selectedDeal.deal_stages?.color)}>
                        <span className="client-profile-status-dot" style={{ background: 'rgba(255,255,255,.7)' }} />
                        {selectedDeal.deal_stages?.label || '—'}
                      </span>
                      <div className="client-profile-deal-detail-top-actions">
                        <button type="button" className="btn btn-p" onClick={() => navigate(`/reports/deals?open=${selectedDeal.id}`)}>
                          <span className="client-profile-action-ic client-profile-action-ic--ghost" dangerouslySetInnerHTML={{ __html: FIELD_ICONS.externalLink }} />
                          Відкрити угоду
                        </button>
                      </div>
                    </div>

                    <h2 className="client-profile-deal-detail-title">{selectedDeal.title || client.company || clientFullName(client)}</h2>

                    <div className="client-profile-deal-detail-tags">
                      <span><span dangerouslySetInnerHTML={{ __html: FIELD_ICONS.company }} />{client.company || clientFullName(client)}</span>
                      {selectedDeal.pipelines?.name && <span><span dangerouslySetInnerHTML={{ __html: FIELD_ICONS.website }} />{selectedDeal.pipelines.name}</span>}
                      {selectedDeal.niche && <span><span dangerouslySetInnerHTML={{ __html: FIELD_ICONS.tag }} />{selectedDeal.niche}</span>}
                    </div>

                    <div className="client-profile-deal-detail-stats">
                      <div>
                        <div className="client-profile-deal-detail-stat-label">Сума угоди</div>
                        <div className="client-profile-deal-detail-stat-value">
                          {selectedDeal.amount != null ? `${Number(selectedDeal.amount).toLocaleString('uk-UA')} ${selectedDeal.currency}` : '—'}
                        </div>
                      </div>
                      <div>
                        <div className="client-profile-deal-detail-stat-label">Стадія</div>
                        <span className="client-profile-deal-detail-stage" style={stagePillStyle(selectedDeal.deal_stages?.color)}>
                          {selectedDeal.deal_stages?.label || '—'}
                        </span>
                      </div>
                      <div>
                        <div className="client-profile-deal-detail-stat-label">Очікувана дата закриття</div>
                        {selectedDeal.expected_close_date ? (
                          <>
                            <div className="client-profile-deal-detail-stat-value client-profile-deal-detail-stat-value--sm">
                              <span dangerouslySetInnerHTML={{ __html: FIELD_ICONS.day }} />
                              {new Date(selectedDeal.expected_close_date).toLocaleDateString('uk-UA')}
                            </div>
                            <div className="client-profile-deal-detail-stat-sub">{daysUntilLabel(daysUntil(selectedDeal.expected_close_date))}</div>
                          </>
                        ) : <div className="client-profile-deal-detail-stat-value client-profile-deal-detail-stat-value--sm">—</div>}
                      </div>
                    </div>

                    {selectedDeal.manager && (
                      <div className="client-profile-deal-detail-owner">
                        <span className="client-profile-deal-detail-stat-label">Відповідальний</span>
                        <div className="client-profile-deal-detail-owner-row">
                          <ProfileAvatar profile={selectedDealManagerProfile} name={selectedDeal.manager} className="client-profile-deal-row-avatar client-profile-deal-row-avatar--lg" />
                          <div>
                            <div className="client-profile-deal-detail-owner-name">{selectedDeal.manager}</div>
                            {selectedDealManagerProfile?.position && <div className="client-profile-deal-detail-owner-role">{selectedDealManagerProfile.position}</div>}
                          </div>
                        </div>
                      </div>
                    )}

                    <div className="client-profile-deal-detail-cards">
                      <div className="client-profile-deal-mini-card">
                        <div className="client-profile-deal-mini-card-head">
                          <span dangerouslySetInnerHTML={{ __html: FIELD_ICONS.document }} />
                          <span className="client-profile-deal-mini-card-title">Остання нотатка</span>
                          {dealLastNote && <span className="client-profile-deal-mini-card-time">{new Date(dealLastNote.created_at).toLocaleString('uk-UA')}</span>}
                        </div>
                        {dealLastNote ? (
                          <>
                            <p className="client-profile-deal-mini-card-text">{htmlToPlainText(dealLastNote.text)}</p>
                            {dealLastNote.created_by && (
                              <div className="client-profile-deal-mini-card-author">
                                <ProfileAvatar profile={teamProfiles.find((p) => profileLabel(p) === dealLastNote.created_by)} name={dealLastNote.created_by} className="client-profile-deal-row-avatar" />
                                {dealLastNote.created_by}
                              </div>
                            )}
                          </>
                        ) : <p className="client-history-empty">Нотаток ще немає.</p>}
                      </div>

                      <div className="client-profile-deal-mini-card">
                        <div className="client-profile-deal-mini-card-head">
                          <span dangerouslySetInnerHTML={{ __html: FIELD_ICONS.check }} />
                          <span className="client-profile-deal-mini-card-title">Наступна дія</span>
                          {dealNextTask && <span className="client-profile-deal-mini-card-time">{new Date(dealNextTask.scheduled_at || dealNextTask.task_date).toLocaleString('uk-UA')}</span>}
                        </div>
                        {dealNextTask ? (
                          <>
                            <p className="client-profile-deal-mini-card-text client-profile-deal-mini-card-text--bold">{dealNextTask.text}</p>
                            <div className="client-profile-deal-mini-card-footer">
                              {dealNextTask.assignee_email && (
                                <div className="client-profile-deal-mini-card-author">
                                  <ProfileAvatar profile={teamProfiles.find((p) => p.email === dealNextTask.assignee_email)} email={dealNextTask.assignee_email} className="client-profile-deal-row-avatar" />
                                  {profiles.find((p) => p.email === dealNextTask.assignee_email)?.label || dealNextTask.assignee_email}
                                </div>
                              )}
                              <button type="button" className="btn" disabled title="Скоро">
                                <span dangerouslySetInnerHTML={{ __html: FIELD_ICONS.day }} />
                                Додати в календар
                              </button>
                            </div>
                          </>
                        ) : <p className="client-history-empty">Немає запланованих дій.</p>}
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          )
        )}
        {activeTab === 'activity' && (
          <div className="client-profile-activity-page">
            <div className="client-profile-activity-header">
              <div className="client-profile-activity-heading">
                <h3>Історія активності <span className="client-profile-activity-count">{filteredActivity.length}</span></h3>
                <p>Усі зміни в картці, включаючи редагування полів, теги, статуси та контакти.</p>
              </div>
              <div className="client-profile-activity-toolbar">
                <div className="client-profile-activity-search">
                  <span dangerouslySetInnerHTML={{ __html: FIELD_ICONS.search }} />
                  <input type="text" value={activitySearch} onChange={(e) => setActivitySearch(e.target.value)} placeholder="Пошук в активності..." />
                </div>
                <div className="client-profile-activity-filters">
                  {ACTIVITY_FILTERS.map((f) => (
                    <button
                      type="button" key={f.value}
                      className={'client-profile-activity-filter' + (activityFilter === f.value ? ' active' : '')}
                      onClick={() => setActivityFilter(f.value)}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
                <button type="button" className="client-profile-activity-sort" onClick={() => setActivityNewestFirst((v) => !v)}>
                  <span dangerouslySetInnerHTML={{ __html: SORT_ICON }} />
                  {activityNewestFirst ? 'Спочатку нові' : 'Спочатку старі'}
                </button>
              </div>
            </div>

            {activityGroups.length === 0 ? (
              <p className="client-history-empty">Активності ще немає.</p>
            ) : activityGroups.map((group) => (
              <div className="client-profile-activity-group" key={group.dateKey}>
                <div className="client-profile-activity-group-head">
                  <span className="client-profile-activity-group-date">{group.dateKey ? new Date(group.dateKey).toLocaleDateString('uk-UA') : '—'}</span>
                  <span className="client-profile-activity-group-count">{group.entries.length} змін</span>
                </div>
                <div className="client-profile-activity-timeline">
                  {group.entries.map((e, i) => {
                    const meta = ACTIVITY_META_BY_FIELD[e.field] || ACTIVITY_DEFAULT_META;
                    const isMention = e.kind === 'mention';
                    return (
                      <div className="client-profile-activity-tl-row" key={i}>
                        <span className="client-profile-activity-tl-dot" />
                        <span className="client-profile-activity-tl-time">
                          {isMention ? '' : new Date(e.changed_at).toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                        <span className="client-profile-activity-tl-ic" style={{ background: meta.gradient }} dangerouslySetInnerHTML={{ __html: isMention ? FIELD_ICONS.document : meta.icon }} />
                        <div className="client-profile-activity-tl-main">
                          <div className="client-profile-activity-tl-title">{activityTitle(e)}</div>
                          <div className="client-profile-activity-tl-user">Користувач: {e.changed_by || 'Система'}</div>
                        </div>
                        {isMention ? (
                          <div className="client-profile-activity-tl-diff">
                            <span className="client-profile-activity-tl-mention-text">{e.text}</span>
                          </div>
                        ) : (
                          <div className="client-profile-activity-tl-diff">
                            <span className="client-profile-activity-tl-diff-field">Поле: <b>{ACTIVITY_FIELD_LABELS[e.field] || e.field}</b></span>
                            <span className="client-profile-activity-tl-diff-group">
                              <span className="client-profile-activity-tl-diff-label">Було</span>
                              <span className="client-profile-activity-tl-pill" style={{ color: meta.color, background: `${meta.color}1A` }}>
                                {e.field === 'photo' ? (e.old_value ? 'було' : '—') : (e.old_value || '—')}
                              </span>
                            </span>
                            <span className="client-profile-activity-tl-arrow">→</span>
                            <span className="client-profile-activity-tl-diff-group">
                              <span className="client-profile-activity-tl-diff-label">Стало</span>
                              <span className="client-profile-activity-tl-pill" style={{ color: meta.color, background: `${meta.color}1A` }}>
                                {e.field === 'photo' ? (e.new_value ? 'оновлено' : '—') : (e.new_value || '—')}
                              </span>
                            </span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
        {activeTab === 'files' && <ClientFilesTab clientId={client.id} uploadedBy={email} />}
      </section>

      {addDealOpen && pipelines.length > 0 && (
        <AddDealModal
          pipelines={pipelines}
          defaultPipelineId={pipelines.find((p) => p.name === client.platform)?.id || pipelines[0]?.id}
          presetClient={client}
          profiles={profiles}
          onClose={() => setAddDealOpen(false)}
          onCreated={reloadDeals}
        />
      )}
    </div>
  );
}
