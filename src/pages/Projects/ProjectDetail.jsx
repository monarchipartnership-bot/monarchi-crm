import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import AutoResizeTextarea from '../../components/Reports/AutoResizeTextarea';
import PlatformReports from '../../components/Projects/Reports/PlatformReports';
import ProjectAccountsPanel from '../../components/Projects/ProjectAccountsPanel';
import ClientPicker from '../../components/Clients/ClientPicker';
import { clientFullName } from '../../lib/clientName';
import { fetchProjectById, updateProject, deleteProject } from '../../lib/api/projects';
import { STATUS_LABEL, SERVICES, periodShare } from '../../lib/projectConstants';
import { fetchProjectAccounts } from '../../lib/api/projectAccounts';
import { platformInfo } from '../../lib/adAccounts';
import { EXTRA_PROJECT_FIELDS, extraFieldsPayload, safeHref } from '../../lib/projectFields';
import AutoField from '../../components/Projects/AutoField';
import ProjectHistoryTab from '../../components/Projects/ProjectHistoryTab';
import ReportWorkbench from '../../components/Projects/Workbench/ReportWorkbench';
import '../../styles/workbench.css';
import '../../styles/composeHub.css';
import { countWorkReports, fetchProjectReports } from '../../lib/api/projectReportStore';
import ReportBuilder from '../../components/Projects/Builder/ReportBuilder';
import ActionIcon from '../../components/common/ActionIcon';
import { useConfirm } from '../../components/common/ConfirmDialog';
import { PAGE_ICONS, PLATFORM_ICONS, PLATFORM_SYMBOL } from '../../lib/pageIcons';
import ProjectAgentTab from '../../components/Projects/Agent/ProjectAgentTab';
import ProjectCreativeTab from '../../components/Projects/Creative/ProjectCreativeTab';
import { fetchAgent } from '../../lib/api/projectAgents';
import '../../styles/reportPage.css';
import '../../styles/projectsPage.css';
import '../../styles/projectReportPage.css';
import '../../styles/projectAccounts.css';
import '@fontsource/onest/500.css';
import '@fontsource/onest/600.css';
import '@fontsource/onest/700.css';
import '../../styles/projectWorkspace.css';
import Select from '../../components/common/Select';
import { languageOptions } from '../../lib/agents/languages';
import { languagePatch } from '../../lib/clientLang';
import DatePicker from '../../components/common/DatePicker';
import '../../styles/ddHub.css';
import '../../styles/projectHub.css'; // Hub style, last so it wins over the older workspace styles
import '../../styles/ddNight.css'; // the dark plum menus of the dropdowns and calendars (data-dd="night")
import '../../styles/projectPlum.css';
import '../../styles/reportsPlum.generated.css'; // the report styles recoloured to the plum palette (made by a script)
import '../../styles/reportsPlum.css'; // the hand-made part: switch of the sections, mode tiles, striped table, glass bars; scoped to .is-plum
import { fetchProjectCreative } from '../../lib/api/projectCreative';
import { infoProgress } from '../../lib/agents/infoProgress';
import ProcessOverview from '../../components/Workflow/ProcessOverview';
import Dossier from '../../components/Workflow/Dossier';
import Tasks from '../../components/Workflow/Tasks';

const TABS = [
  { key: 'overview', label: 'Інформація про проєкт', icon: PAGE_ICONS['page.projects'].src },
  { key: 'process', label: 'Огляд', icon: PAGE_ICONS['page.projects'].src }, // the new agent system: where the project is and what waits for the manager
  { key: 'dossier', label: 'Досьє', icon: PAGE_ICONS['page.projects'].src }, // the 10 sections the agents and people write together
  { key: 'tasks', label: 'Задачі', icon: PAGE_ICONS['page.projects'].src }, // the pool of tasks: what the agents found or prepared, the drafts for the client
  { key: 'builder', label: 'Конструктор звіту', icon: null, line: <path d="M4 4h16v5H4zM4 13h7v7H4zM15 13h5v7h-5z" /> },
  { key: 'compose', label: 'Формування звіту', icon: PAGE_ICONS['page.weekly-report'].src },
  { key: 'work', label: 'Робота над звітами', icon: null, line: <path d="M5 4h14v16H5zM9 9h6M9 13h6M9 17h3" /> },
  { key: 'decks', label: 'Історія проекту', icon: PAGE_ICONS['page.clients-report'].src },
  { key: 'agent', label: 'Агент звітів', icon: PAGE_ICONS['page.ai-agents'].src },
];

// «Звітність» (owner, 2026-11-11): the four report tabs are one tab of the card with four sections inside. Their keys and addresses stay (?tab=builder, compose, work, decks),
// so every link that was sent before still opens the same page.
const REPORT_TABS = [['builder', 'Конструктор звіту'], ['compose', 'Формування звіту'], ['work', 'Робота над звітами'], ['decks', 'Історія проекту']];
const REPORT_KEYS = REPORT_TABS.map(([k]) => k);
const STRIP = [
  TABS.find((x) => x.key === 'overview'),
  TABS.find((x) => x.key === 'process'),
  TABS.find((x) => x.key === 'dossier'),
  TABS.find((x) => x.key === 'tasks'),
  { key: 'reports', label: 'Звітність', icon: PAGE_ICONS['page.weekly-report'].src },
  TABS.find((x) => x.key === 'agent'),
];
// the line icons of the menu of the card (the menu is the one of the AI Agents section: a round medallion with a line icon)
const STRIP_LINE = {
  overview: <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />,
  process: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  dossier: <path d="M4 5a2 2 0 0 1 2-2h12v18H6a2 2 0 0 1-2-2zM8 7h7M8 11h7M8 15h4" />,
  tasks: <path d="M5 4h14v16H5zM9 9l2 2 4-4M9 15h6" />,
  reports: <path d="M6 3h9l4 4v14H6zM9 12h7M9 16h7" />,
  agent: <><circle cx="12" cy="12" r="3" /><path d="M12 3v3M12 18v3M3 12h3M18 12h3" /></>,
};
const STATUSES = ['active', 'paused', 'completed'];

// The summary of «Інформація про проєкт»: how many fields are filled and the next step (the ring + a button to the section).
function InfoSummary({ fill, onGo }) {
  if (!fill) return null;
  const { pct, done, total, next } = fill;
  return (
    <section className="pw-sum" aria-label="Заповненість інформації про проєкт">
      <div className="pw-sum-ring" style={{ '--p': pct }} role="img" aria-label={`Заповнено ${pct}%`}><b>{pct}%</b></div>
      <div className="pw-sum-tx">
        <b>Інформацію про проєкт заповнено: {done} з {total} полів</b>
        <span>{next ? `Далі: «${next.sectionName}» → ${next.label}. ${next.hint}` : 'Усе заповнено: агенти мають усе, що їм потрібно.'}</span>
      </div>
      {next && <button type="button" className="pw-btn pw-btn--primary pw-sum-go" onClick={() => onGo(next.section)}>Заповнити «{next.sectionName}»</button>}
    </section>
  );
}
// «Інформація про проєкт» (owner, 2026-11-11): everything known about the client lives in this one card, for people and for the agents. The sections:
// «Основне» is the former «Огляд»; the others come from the data the agents read (lib/agents/projectCreative.js).
const INFO_SECTIONS = [['main', 'Основне'], ['client', 'Про клієнта'], ['business', 'Про бізнес'], ['competitors', 'Про конкурентів'], ['ready', 'Готовність до агентів']];
const infoOf = (params) => (INFO_SECTIONS.some(([k]) => k === params.get('info')) ? params.get('info') : 'main');
// «Формування звіту» holds three ways to look at a period; the old tabs (and the links the agent sends) still open them.
const COMPOSE_MODES = [
  ['period', 'Показники за період', 'Будь-які дати: швидка вибірка цифр', 'range'],
  ['weekly', 'Тижневий звіт', 'Тиждень із порівнянням', 'cal'],
  ['monthly', 'Місячний звіт', 'Підсумок місяця', 'cal'],
];
const COMPOSE_ICONS = {
  range: <><rect x="3.5" y="5" width="17" height="15" rx="2" /><path d="M3.5 10h17M8 3v4M16 3v4M8 14h3M13 14h3" /></>,
  cal: <><rect x="3.5" y="5" width="17" height="15" rx="2" /><path d="M3.5 10h17M8 3v4M16 3v4" /></>,
};
const KEEP_ALIVE = ['builder', 'compose:period', 'compose:weekly', 'compose:monthly', 'work']; // panes that keep their state while the card is open
function parseTab(params) {
  const t = params.get('tab');
  if (COMPOSE_MODES.some(([k]) => k === t)) return { tab: 'compose', mode: t };
  const mode = COMPOSE_MODES.some(([k]) => k === params.get('mode')) ? params.get('mode') : 'weekly';
  return { tab: TABS.some((x) => x.key === t) ? t : 'overview', mode };
}

// The Overview fields in reading order. Empty ones are hidden while viewing.
const FIELD_GROUPS = [
  { title: 'Основне', hint: 'Хто веде проєкт і в якому він стані', items: ['manager', 'specialist', 'status', 'period', 'services', 'stop_reason'] },
  { title: 'Клієнт', hint: 'Хто клієнт і де він працює', items: ['client', 'country', 'client_language', 'website', 'business_type', 'contacts', 'timezone'] },
  { title: 'Комунікація та оплата', hint: 'Початок співпраці, оплата, робочий простір', items: ['comm_start_date', 'payment_channel', 'cost', 'worksection_link'] },
];

const ICONS = {
  manager: <svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="3.4" /><path d="M5 20a7 7 0 0 1 14 0" /></svg>,
  client: <svg viewBox="0 0 24 24"><path d="M3 21V8l9-5 9 5v13" /><path d="M9 21v-6h6v6" /></svg>,
  country: <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" /><path d="M3 12h18" /><path d="M12 3a15 15 0 0 1 0 18" /><path d="M12 3a15 15 0 0 0 0 18" /></svg>,
  website: <svg viewBox="0 0 24 24"><path d="M9 15l6-6" /><path d="M13 6l1-1a3 3 0 1 1 4 4l-2 2" /><path d="M11 18l-1 1a3 3 0 1 1-4-4l2-2" /></svg>,
  crm: <svg viewBox="0 0 24 24"><path d="M7 17L17 7" /><path d="M9 7h8v8" /></svg>,
  period: <svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="17" rx="2" /><path d="M3 9h18M8 2v4M16 2v4" /></svg>,
  status: <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" /><path d="M8 12l3 3 5-6" /></svg>,
  services: <svg viewBox="0 0 24 24"><path d="M20.6 13.4L11 3.8A2 2 0 0 0 9.6 3.2H4a1 1 0 0 0-1 1v5.6a2 2 0 0 0 .6 1.4l9.6 9.6a2 2 0 0 0 2.8 0l5.2-5.2a2 2 0 0 0 0-2.8z" /><circle cx="7.5" cy="7.5" r="1.3" /></svg>,
  notes: <svg viewBox="0 0 24 24"><path d="M7 3h8l4 4v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" /><path d="M9 9h6M9 13h6M9 17h4" /></svg>,
  info: <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" /><path d="M12 11v5" /><path d="M12 8h.01" /></svg>,
};

function FieldIcon({ name }) {
  return <span className="ov-field-icon">{ICONS[name]}</span>;
}

export default function ProjectDetail() {
  const { id } = useParams();
  return <ProjectDetailCard key={id} />; // a new project is a new card: no state, draft or late answer of the previous one is carried over
}

function ProjectDetailCard() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [project, setProject] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [searchParams, setSearchParams] = useSearchParams();
  const [tab, setTabState] = useState(() => parseTab(searchParams).tab);
  const [mode, setModeState] = useState(() => parseTab(searchParams).mode);
  const [info, setInfoState] = useState(() => infoOf(searchParams)); // the section of «Інформація про проєкт»; it stays in the address, so a link can open it
  const setInfo = (next) => { setInfoState(next); setSearchParams(next === 'main' ? {} : { info: next }, { replace: true }); };
  const setTab = (next) => {
    setTabState(next);
    // the chosen ad platform of the report tabs stays when moving between them
    const platform = ['compose', 'decks', 'builder', 'work'].includes(next) ? searchParams.get('platform') : null;
    setSearchParams(next === 'overview' ? {} : { tab: next, ...(next === 'compose' ? { mode } : {}), ...(platform ? { platform } : {}) }, { replace: true });
  };
  const goWf = (next, section) => { setTabState(next); setSearchParams({ tab: next, ...(section ? { section } : {}) }, { replace: true }); }; // between «Огляд» and «Досьє» (and into a section of the dossier)
  const setMode = (next) => {
    setModeState(next);
    const platform = searchParams.get('platform');
    setSearchParams({ tab: 'compose', mode: next, ...(platform ? { platform } : {}) }, { replace: true });
  };
  const paneKey = tab === 'compose' ? `compose:${mode}` : tab;
  const isReport = REPORT_KEYS.includes(tab);
  const activeStrip = isReport ? 'reports' : tab;
  const lastReport = useRef('compose'); // the section of «Звітність» that was open last: the tab comes back to it
  if (isReport) lastReport.current = tab;
  const openStrip = (key) => setTab(key === 'reports' ? lastReport.current : key);
  // The address can be changed from outside (a link in the history, a note on a report page): the card follows it.
  useEffect(() => {
    const p = parseTab(searchParams);
    if (p.tab !== tab) setTabState(p.tab);
    if (p.tab === 'compose' && p.mode !== mode) setModeState(p.mode);
    if (p.tab === 'overview') setInfoState(infoOf(searchParams));
  }, [searchParams]); // eslint-disable-line react-hooks/exhaustive-deps
  const [deleting, setDeleting] = useState(false);
  const [confirm, confirmDialog] = useConfirm();
  const tabRefs = useRef({});
  const [visited, setVisited] = useState(() => new Set([paneKey]));
  const [cfgVersion, setCfgVersion] = useState(0);
  const [accVersion, setAccVersion] = useState(0); // grows when the cabinets of the project change (the builder reads them once)
  const [workCount, setWorkCount] = useState(0); // reports waiting in «Робота над звітами» (the badge of the tab)
  useEffect(() => { let off = false; countWorkReports(id).then((n) => { if (!off) setWorkCount(n); }); return () => { off = true; }; }, [id, tab]);
  useEffect(() => { setVisited((v) => (v.has(paneKey) ? v : new Set(v).add(paneKey))); }, [paneKey]);
  useEffect(() => { setVisited(new Set([paneKey])); setCfgVersion(0); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Arrow keys / Home / End move between the folder tabs (the focused one is the selected one).
  function onTabKey(e) {
    const keys = STRIP.map((t) => t.key);
    const i = keys.indexOf(activeStrip);
    let next = null;
    if (e.key === 'ArrowRight') next = keys[(i + 1) % keys.length];
    else if (e.key === 'ArrowLeft') next = keys[(i - 1 + keys.length) % keys.length];
    else if (e.key === 'Home') next = keys[0];
    else if (e.key === 'End') next = keys[keys.length - 1];
    if (!next) return;
    e.preventDefault();
    openStrip(next);
    tabRefs.current[next]?.focus();
  }

  const [linkedAccounts, setLinkedAccounts] = useState([]);
  const [fill, setFill] = useState(null); // how full «Інформація про проєкт» is: the counters of the sub-sections and the summary (refreshed when the section is opened)
  useEffect(() => {
    let off = false;
    if (!id) return undefined;
    fetchProjectCreative(id).then((d) => { if (!off) setFill(infoProgress({ settings: d.settings, assets: d.assets, accounts: linkedAccounts, project })); }).catch(() => { if (!off) setFill(null); });
    return () => { off = true; };
  }, [id, linkedAccounts, info, tab, project]);
  // The agent's state for the chip in the header (the tab itself loads everything it needs).
  const [agentChip, setAgentChip] = useState(null);
  // The project name in the header is a field that saves itself (like the deal title).
  const [nameValue, setNameValue] = useState('');

  // The fields of the card are always editable and save themselves (like the deal card): 'idle' | 'saving' | 'saved' | 'error'
  const [saveState, setSaveState] = useState('idle');
  const savedTimer = useRef(null);

  const [notesValue, setNotesValue] = useState('');
  const [notesSaving, setNotesSaving] = useState(false);
  const [infoValue, setInfoValue] = useState('');
  const [infoSaving, setInfoSaving] = useState(false);

  useEffect(() => {
    let off = false;
    fetchAgent(id).then(({ agent }) => {
      if (off) return;
      if (!agent) setAgentChip(null);
      else if (agent.health === 'problem') setAgentChip({ label: 'є проблеми', tone: 'bad' });
      else setAgentChip(agent.enabled ? { label: 'активний', tone: 'ok' } : { label: 'вимкнений', tone: 'muted' });
    });
    return () => { off = true; };
  }, [id, tab]);

  async function reload() {
    try {
      const fresh = await fetchProjectById(id);
      setProject(fresh);
      setNameValue(fresh?.name || '');
      setLoadError('');
    } catch (e) {
      console.warn('loadProject failed', e);
      setLoadError('Не вдалося завантажити проєкт.');
    }
  }

  useEffect(() => { reload(); }, [id]);
  useEffect(() => { fetchProjectAccounts(id).then(setLinkedAccounts); }, [id]);

  // The text fields follow the project only while the person has not typed in them: a status change or any other saved field must not wipe a note that is not saved yet.
  const syncedNotes = useRef('');
  const syncedInfo = useRef('');
  useEffect(() => {
    if (!project) return;
    const n = project.notes || '';
    const i = project.additional_info || '';
    setNotesValue((cur) => (cur === syncedNotes.current ? n : cur));
    setInfoValue((cur) => (cur === syncedInfo.current ? i : cur));
    syncedNotes.current = n;
    syncedInfo.current = i;
  }, [project]);

  // Saves one change at once. The card shows it straight away; if the database refuses, the old value comes back and the person is told.
  async function commit(patch) {
    const before = project;
    clearTimeout(savedTimer.current);
    setSaveState('saving');
    setProject((p) => ({ ...p, ...patch }));
    try {
      await updateProject(id, patch);
      setSaveState('saved');
      savedTimer.current = setTimeout(() => setSaveState('idle'), 2500);
    } catch (e) {
      console.warn('saveProject failed', e);
      setProject((p) => ({ ...p, ...Object.fromEntries(Object.keys(patch).map((k) => [k, before[k]])) }));
      setSaveState('error');
    }
  }

  async function saveName() {
    const next = nameValue.trim();
    if (!next) { setNameValue(project.name || ''); return; }
    if (next === project.name) { setNameValue(next); return; }
    try {
      await updateProject(id, { name: next });
      setProject((p) => ({ ...p, name: next }));
      setNameValue(next);
    } catch (e) {
      console.warn('saveName failed', e);
      setNameValue(project.name || '');
      alert('Не вдалося зберегти назву проєкту.');
    }
  }

  // Linking an account adds its platform to the project's services, so the two never disagree.
  async function addService(service) {
    try {
      await updateProject(id, { services: [...(project.services || []), service] });
      await reload();
    } catch (e) {
      console.warn('addService failed', e);
    }
  }

  async function handleDelete() {
    if (deleting) return;
    let reports = 0;
    try { reports = (await fetchProjectReports(id)).length; } catch { /* the count only makes the warning more exact */ }
    const body = `Разом із проєктом «${project.name || ''}» буде безповоротно видалено: ${reports ? `збережені звіти (${reports})` : 'збережені звіти'}, презентації, посилання для клієнта (вони одразу перестануть працювати), підключені кабінети, налаштування AI-агента й креативи. Дію не можна скасувати.`;
    if (!(await confirm({ title: 'Видалити проєкт?', body, confirmLabel: 'Видалити проєкт', danger: true }))) return;
    setDeleting(true);
    try {
      await deleteProject(id);
      navigate('/projects');
    } catch (e) {
      console.warn('deleteProject failed', e);
      alert('Не вдалося видалити проєкт.');
    } finally {
      setDeleting(false);
    }
  }

  async function saveNotes() {
    setNotesSaving(true);
    try {
      await updateProject(id, { notes: notesValue });
      await reload();
    } catch (e) {
      console.warn('saveNotes failed', e);
      alert('Не вдалося зберегти нотатки.');
    } finally {
      setNotesSaving(false);
    }
  }

  async function saveInfo() {
    setInfoSaving(true);
    try {
      await updateProject(id, { additional_info: infoValue });
      await reload();
    } catch (e) {
      console.warn('saveInfo failed', e);
      alert('Не вдалося зберегти інформацію.');
    } finally {
      setInfoSaving(false);
    }
  }

  if (loadError) {
    return (
      <div className="report-page project-detail-page">
        <div className="page-actions">
          <button type="button" className="btn" onClick={() => navigate('/projects')}>&#8592; До списку</button>
        </div>
        <div className="proj-empty">{loadError}</div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="report-page project-detail-page">
        <div className="empty-hint">Завантаження...</div>
      </div>
    );
  }

  const isEmpty = (v) => v == null || v === '' || (Array.isArray(v) && v.length === 0);


  function renderExtra(key) {
    const f = EXTRA_PROJECT_FIELDS.find((x) => x.key === key);
    if (!f) return null;
    const raw = project[f.key];
    const save = (v) => commit({ [f.key]: extraFieldsPayload({ [f.key]: v })[f.key] });
    const link = (f.key === 'worksection_link' || f.type === 'url') && !isEmpty(raw) && safeHref(raw) ? <a className="ov-link ov-open" href={safeHref(raw)} target="_blank" rel="noreferrer">Відкрити ↗</a> : null;
    return (
      <div className="ov-field-box" key={key}>
        <div className="ov-field-label">{f.label}{link}</div>
        {f.type === 'select' ? (
          <Select value={raw || ''} onChange={save} ariaLabel={f.label} options={[{ value: '', label: 'Не вказано' }, ...f.options.map((o) => ({ value: o, label: o }))]} />
        ) : f.type === 'date' ? (
          <input type="date" value={raw || ''} aria-label={f.label} onChange={(e) => save(e.target.value)} onClick={(e) => e.currentTarget.showPicker?.()} />
        ) : (
          <AutoField type={f.type === 'url' ? 'text' : f.type} value={raw} placeholder={f.placeholder} step={f.type === 'number' ? '0.01' : undefined} ariaLabel={f.label} onCommit={save} />
        )}
      </div>
    );
  }

  function renderItem(key) {
    switch (key) {
      case 'manager':
        return (
          <div className="ov-field-box" key={key}>
            <div className="ov-field-label"><FieldIcon name="manager" />Продакт (менеджер)</div>
            <AutoField value={project.manager} placeholder="Ім'я менеджера" ariaLabel="Продакт (менеджер)" onCommit={(v) => commit({ manager: v.trim() || null })} />
          </div>
        );
      case 'client_language':
        return (
          <div className="ov-field-box" key={key}>
            <div className="ov-field-label"><FieldIcon name="country" />Мова клієнта{!project.client_language && <span className="ov-req"> обовʼязково для запуску команд</span>}</div>
            <Select value={project.client_language || ''} onChange={(v) => commit(languagePatch(v))} ariaLabel="Мова клієнта" options={[{ value: '', label: 'Не вказано' }, ...languageOptions()]} />
            <div className="ov-field-hint">Усі тексти для клієнта (на креативах, у рекламі) агенти пишуть цією мовою, звіти для клієнта (сторінка, Excel, презентація) теж: для української вони українські, для будь-якої іншої мови англійські. У кожному звіті мову можна змінити окремо. Для команди результати завжди українською. Матеріали можна давати українською, російською чи англійською.</div>
          </div>
        );
      case 'report_lang': {
        const lang = project.report_lang === 'uk' ? 'uk' : 'en';
        return (
          <div className="ov-field-box" key={key}>
            <div className="ov-field-label"><FieldIcon name="country" />Мова звітів для клієнта</div>
            <div className="status-picker" role="group" aria-label="Мова звітів для клієнта">
              {[['en', 'English'], ['uk', 'Українська']].map(([v, label]) => (
                <button key={v} type="button" aria-pressed={lang === v} className={'status-btn' + (lang === v ? ' on active' : '')} onClick={() => { if (lang !== v) commit({ report_lang: v }); }}>{label}</button>
              ))}
            </div>
            <div className="ov-field-hint">Сторінка клієнта, Excel і презентація. У кожному звіті мову можна змінити окремо.</div>
          </div>
        );
      }
      case 'status':
        return (
          <div className="ov-field-box" key={key}>
            <div className="ov-field-label"><FieldIcon name="status" />Статус</div>
            <div className="status-picker" role="group" aria-label="Статус проєкту">
              {STATUSES.map((st) => (
                <button key={st} type="button" aria-pressed={project.status === st} className={'status-btn' + (project.status === st ? ` on ${st}` : '')} onClick={() => { if (project.status !== st) commit({ status: st }); }}>
                  {STATUS_LABEL[st]}
                </button>
              ))}
            </div>
          </div>
        );
      case 'period':
        return (
          <div className="ov-field-box" key={key}>
            <div className="ov-field-label"><FieldIcon name="period" />Початок роботи над стратегією – завершення співпраці</div>
            <div className="ov-date-row">
              <DatePicker value={project.start_date || ''} onChange={(v) => commit({ start_date: v || null })} />
              <span>–</span>
              <DatePicker value={project.end_date || ''} onChange={(v) => commit({ end_date: v || null })} />
            </div>
          </div>
        );
      case 'services':
        return (
          <div className="ov-field-box ov-field-box-wide" key={key}>
            <div className="ov-field-label"><FieldIcon name="services" />Послуги (канал роботи)</div>
            <div className="svc-picker">
              {SERVICES.map((sv) => {
                const have = (project.services || []).includes(sv);
                return (
                  <label className="svc-opt" key={sv}>
                    <input type="checkbox" checked={have} onChange={() => commit({ services: have ? (project.services || []).filter((x) => x !== sv) : [...(project.services || []), sv] })} />
                    <span>{sv}</span>
                  </label>
                );
              })}
            </div>
          </div>
        );
      case 'client':
        return (
          <div className="ov-field-box" key={key}>
            <div className="ov-field-label"><FieldIcon name="client" />Клієнт{project.client_id ? <Link className="ov-link ov-open" to={'/reports/clients-directory/' + project.client_id}>Відкрити контакт ↗</Link> : null}</div>
            <ClientPicker
              value={project.client_id || null}
              placeholder={project.client || 'Пошук клієнта або створити нового...'}
              onChange={(c) => commit({ client_id: c ? c.id : null, client: c ? (c.company || clientFullName(c)) : null })}
            />
          </div>
        );
      case 'country':
        return (
          <div className="ov-field-box" key={key}>
            <div className="ov-field-label"><FieldIcon name="country" />Гео (країна)</div>
            <AutoField value={project.country} placeholder="напр. USA" ariaLabel="Гео (країна)" onCommit={(v) => commit({ country: v.trim() || null })} />
          </div>
        );
      case 'website':
        return (
          <div className="ov-field-box" key={key}>
            <div className="ov-field-label"><FieldIcon name="website" />Сайт{!isEmpty(project.website) && safeHref(project.website) ? <a className="ov-link ov-open" href={safeHref(project.website)} target="_blank" rel="noreferrer">Відкрити ↗</a> : null}</div>
            <AutoField value={project.website} placeholder="https://..." ariaLabel="Сайт" onCommit={(v) => commit({ website: v.trim() || null })} />
          </div>
        );
      default:
        return renderExtra(key);
    }
  }

  const notesDirty = notesValue !== (project.notes || '');
  const infoDirty = infoValue !== (project.additional_info || '');

  return (
    <div className="report-page project-detail-page pw is-plum" data-dd="night">
      <div className="pd-header pw-head">
        <span className={'hub-ring hub-ring--lg st-' + project.status} style={{ '--p': periodShare(project) }}>
          <span className="hub-tile"><img src={PAGE_ICONS['page.projects'].src} alt="" draggable="false" /></span>
        </span>
        <div className="pd-header-meta">
          <div className="pd-title-row">
            <input
              type="text" className="deal-title-input pd-title-input" value={nameValue}
              onChange={(e) => setNameValue(e.target.value)}
              onBlur={saveName}
              onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') { setNameValue(project.name || ''); e.currentTarget.blur(); } }}
              placeholder="Назва проєкту" aria-label="Назва проєкту"
            />
          </div>
          <div className="pd-header-chips">
            {linkedAccounts.map((a) => {
              const sym = PLATFORM_ICONS[PLATFORM_SYMBOL[a.platform]];
              return (
                <span className="pw-chip pw-chip--platform" key={a.platform}>
                  {sym && <img src={sym.src} alt="" width="23" height="23" draggable="false" />}
                  {platformInfo(a.platform).label}
                </span>
              );
            })}
            <span className={'pw-chip pw-chip--status pw-chip--' + (project.status === 'active' ? 'ok' : project.status === 'paused' ? 'warn' : 'muted')}>{STATUS_LABEL[project.status]}</span>
            {project.client && (project.client_id
              ? <Link className="pw-chip" to={'/reports/clients-directory/' + project.client_id}>{project.client}</Link>
              : <span className="pw-chip">{project.client}</span>)}
            {project.manager && <span className="pw-chip">{project.manager}</span>}
            {agentChip && (
              <button type="button" className={'pw-chip pw-chip--agent pw-chip--' + agentChip.tone} onClick={() => setTab('agent')} title="Відкрити вкладку AI Агент">
                AI-агент: {agentChip.label}
              </button>
            )}
          </div>
        </div>
        <div className="pd-header-actions">
          <button type="button" className="pw-btn pd-back" onClick={() => navigate('/projects')}><ActionIcon name="back" size={18} /> Назад до проєктів</button>
          <button type="button" className="pw-btn pw-btn--primary pd-back" onClick={() => navigate('/tools/constellation-test')}><ActionIcon name="generate" size={18} /> Відкрити AI розділ</button>
        </div>
      </div>

      <div className="pw-tabs" role="tablist" aria-label="Розділи проєкту" onKeyDown={onTabKey}>
        {STRIP.map((t) => (
          <button
            key={t.key} id={'pw-tab-' + t.key} ref={(n) => { tabRefs.current[t.key] = n; }}
            type="button" role="tab" aria-selected={activeStrip === t.key} aria-controls="pw-panel" tabIndex={activeStrip === t.key ? 0 : -1}
            className={'pw-tab' + (activeStrip === t.key ? ' on' : '')} onClick={() => openStrip(t.key)}
          >
            <span className="pw-tab-m"><svg viewBox="0 0 24 24" aria-hidden="true">{STRIP_LINE[t.key]}</svg></span>
            <span>{t.label}</span>{t.key === 'reports' && workCount > 0 && <span className="pw-tab-n" aria-label={`${workCount} у роботі`}>{workCount}</span>}
          </button>
        ))}
      </div>

      <div className={'pw-workspace ' + (tab === 'overview' ? 'pw-dark' : isReport ? 'pw-dark pw-rep' : 'pw-sheet')} data-dd={tab === 'overview' || isReport ? 'night' : 'hub'} id="pw-panel" role="tabpanel" aria-labelledby={'pw-tab-' + activeStrip}>
      {isReport && (
        <div className="pcr-tabs pw-sub pw-isub" role="tablist" aria-label="Розділи звітності">
          {REPORT_TABS.map(([k, label]) => <button key={k} type="button" role="tab" aria-selected={tab === k} className={'pcr-tab' + (tab === k ? ' on' : '')} onClick={() => setTab(k)}>{label}{k === 'work' && workCount > 0 ? <em>{workCount}</em> : null}</button>)}
        </div>
      )}
      {tab === 'overview' && (
        <div className="pcr-wrap pw-info">
          <div className="pcr-tabs pw-isub" role="tablist" aria-label="Розділи інформації про проєкт">
            {INFO_SECTIONS.map(([k, label]) => {
              const sec = fill?.sections?.[k];
              return (
                <button key={k} type="button" role="tab" aria-selected={info === k} className={'pcr-tab' + (info === k ? ' on' : '')} onClick={() => setInfo(k)}>
                  {label}
                  {sec && k !== 'ready' && sec.total > 0 && <span className="pw-isub-n">{sec.done} з {sec.total}</span>}
                  {sec && k === 'ready' && sec.missing > 0 && <span className="pw-isub-n is-warn">{sec.missing} бракує</span>}
                </button>
              );
            })}
          </div>
          <InfoSummary fill={fill} onGo={setInfo} />
          {info !== 'main' && <ProjectCreativeTab key={'info-' + id + '-' + info} projectId={id} section={info} embedded />}
        </div>
      )}
      {tab === 'overview' && info === 'main' && (
        <div className="pw-ov">
          <aside className="pw-ov-side">
            <section className="report-section pw-card pw-about">
              <div className="ov-section-head">
                <div className="stitle hub-title"><span className="hub-ring hub-ring--sm"><span className="hub-tile hub-tile--ln"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 4h6a1 1 0 0 1 1 1v1H8V5a1 1 0 0 1 1-1zM6 6h12v14H6z" /><path d="M9 11h6M9 15h4" /></svg></span></span>Про проєкт</div>
                <span className={'ov-save-state ' + saveState} role="status" aria-live="polite">
                  <i aria-hidden="true" />
                  {saveState === 'saving' ? 'Зберігаємо…' : saveState === 'saved' ? 'Збережено' : saveState === 'error' ? 'Не вдалося зберегти, спробуйте ще раз' : 'Зміни зберігаються автоматично'}
                </span>
              </div>

              <div className="pw-groups">
                {FIELD_GROUPS.map((group) => (
                  <div className="ov-group" key={group.title}>
                    <div className="ov-group-head">
                      <div className="ov-group-title">{group.title}</div>
                      <div className="ov-group-hint">{group.hint}</div>
                    </div>
                    <div className="ov-field-grid">{group.items.map(renderItem).filter(Boolean)}</div>
                  </div>
                ))}
              </div>
            </section>
          </aside>

          <div className="pw-ov-main">
            <ProjectAccountsPanel projectId={id} services={project.services} onAddService={addService} onAccountsChange={(a) => { setLinkedAccounts(a); setCfgVersion((v) => v + 1); setAccVersion((v) => v + 1); }} />

            <div className="pw-notes">
              <section className="report-section pw-card">
                <div className="ov-field-box ov-notes-box">
                  <div className="ov-field-label"><FieldIcon name="notes" />Особливості роботи з клієнтом</div>
                  <AutoResizeTextarea value={notesValue} onChange={setNotesValue} placeholder="Нотатки по клієнту..." />
                  {notesDirty && (
                    <button type="button" className="pw-btn pw-btn--ok ov-notes-save" onClick={saveNotes} disabled={notesSaving}>
                      {notesSaving ? '...' : 'Зберегти'}
                    </button>
                  )}
                </div>
              </section>

              <section className="report-section pw-card">
                <div className="ov-field-box ov-notes-box">
                  <div className="ov-field-label"><FieldIcon name="info" />Додаткова інформація</div>
                  <AutoResizeTextarea value={infoValue} onChange={setInfoValue} placeholder="Будь-яка додаткова інформація..." />
                  {infoDirty && (
                    <button type="button" className="pw-btn pw-btn--ok ov-notes-save" onClick={saveInfo} disabled={infoSaving}>
                      {infoSaving ? '...' : 'Зберегти'}
                    </button>
                  )}
                </div>
              </section>
            </div>

            <button type="button" className="pw-btn pw-btn--danger-quiet ov-delete-link" onClick={handleDelete} disabled={deleting}>
              <ActionIcon name="delete" size={18} /> {deleting ? '...' : 'Видалити проєкт'}
            </button>
          </div>
        </div>
      )}

      {/* The builder and the report tabs stay open once visited: coming back shows the report that was loaded, and nothing is pulled again.
          They are cleared when the card is closed or another project is opened. A change of the layout (saved in the builder) reloads the report tabs. */}
      {tab === 'compose' && (
        <div className="ch-tiles compose-modes" role="tablist" aria-label="Формування звіту">
          {COMPOSE_MODES.map(([k, label, caption, icon]) => (
            <button key={k} type="button" role="tab" aria-selected={mode === k} className={'ch-tile' + (mode === k ? ' on' : '')} onClick={() => setMode(k)}>
              <span className="hub-ring ch-md" aria-hidden="true"><span className="hub-tile hub-tile--ln"><svg viewBox="0 0 24 24">{COMPOSE_ICONS[icon]}</svg></span></span>
              <span className="ch-tt"><b>{label}</b><small>{caption}</small></span>
            </button>
          ))}
        </div>
      )}
      {KEEP_ALIVE.filter((k) => visited.has(k)).map((k) => (
        <div key={k + '-' + id + (k === 'builder' ? '-a' + accVersion : '')} hidden={paneKey !== k}>
          {k === 'builder' ? <ReportBuilder projectId={id} onConfigChanged={() => setCfgVersion((v) => v + 1)} /> : k === 'work' ? <ReportWorkbench projectId={id} onCount={setWorkCount} version={cfgVersion} /> : <PlatformReports projectId={id} mode={k.split(':')[1]} version={cfgVersion} />}
        </div>
      ))}
      {tab === 'process' && <ProcessOverview key={'process-' + id} projectId={id} onGo={goWf} />}
      {tab === 'tasks' && <Tasks key={'tasks-' + id} projectId={id} />}
      {tab === 'dossier' && <Dossier key={'dossier-' + id + (searchParams.get('section') || '')} projectId={id} initialKey={searchParams.get('section') || undefined} />}
      {tab === 'decks' && <ProjectHistoryTab key={'decks-' + id} projectId={id} />}
      {tab === 'agent' && <ProjectAgentTab key={'agent-' + id} projectId={id} />}
      </div>
      {confirmDialog}
    </div>
  );
}
