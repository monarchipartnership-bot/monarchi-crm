import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import AutoResizeTextarea from '../../components/Reports/AutoResizeTextarea';
import PeriodStats from '../../components/Projects/Reports/PeriodStats';
import PeriodReport from '../../components/Projects/Reports/PeriodReport';
import ProjectAccountsPanel from '../../components/Projects/ProjectAccountsPanel';
import ClientPicker from '../../components/Clients/ClientPicker';
import { clientFullName } from '../../lib/clientName';
import { fetchProjectById, updateProject, deleteProject } from '../../lib/api/projects';
import { STATUS_LABEL, SERVICES, fmtIsoDate } from '../../lib/projectConstants';
import { fetchProjectAccounts } from '../../lib/api/projectAccounts';
import { platformInfo } from '../../lib/adAccounts';
import { EXTRA_PROJECT_FIELDS, extraFieldsForm, extraFieldsPayload, fmtCost } from '../../lib/projectFields';
import ProjectDecksTab from '../../components/Projects/ProjectDecksTab';
import ActionIcon from '../../components/common/ActionIcon';
import { useConfirm } from '../../components/common/ConfirmDialog';
import { PAGE_ICONS, PLATFORM_ICONS, PLATFORM_SYMBOL } from '../../lib/pageIcons';
import ProjectAgentTab from '../../components/Projects/Agent/ProjectAgentTab';
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
import DatePicker from '../../components/common/DatePicker';

const TABS = [
  { key: 'overview', label: 'Огляд', icon: PAGE_ICONS['page.projects'].src },
  { key: 'period', label: 'Показники за період', icon: null },
  { key: 'weekly', label: 'Тижневий звіт', icon: PAGE_ICONS['page.weekly-report'].src },
  { key: 'monthly', label: 'Місячний звіт', icon: PAGE_ICONS['page.monthly-report'].src },
  { key: 'decks', label: 'Презентації', icon: PAGE_ICONS['page.clients-report'].src },
  { key: 'agent', label: 'AI Агент', icon: PAGE_ICONS['page.ai-agents'].src },
];

const STATUSES = ['active', 'paused', 'completed'];

// The Overview fields in reading order. Empty ones are hidden while viewing.
const FIELD_GROUPS = [
  { title: 'Основне', hint: 'Хто веде проєкт і в якому він стані', items: ['manager', 'specialist', 'status', 'period', 'services', 'stop_reason'] },
  { title: 'Клієнт', hint: 'Хто клієнт і де він працює', items: ['client', 'country', 'website', 'business_type', 'contacts', 'timezone'] },
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
  const navigate = useNavigate();
  const [project, setProject] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [searchParams, setSearchParams] = useSearchParams();
  const [tab, setTabState] = useState(() => (TABS.some((t) => t.key === searchParams.get('tab')) ? searchParams.get('tab') : 'overview'));
  const setTab = (next) => {
    setTabState(next);
    setSearchParams(next === 'overview' ? {} : { tab: next }, { replace: true });
  };
  const [deleting, setDeleting] = useState(false);
  const [confirm, confirmDialog] = useConfirm();
  const tabRefs = useRef({});

  // Arrow keys / Home / End move between the folder tabs (the focused one is the selected one).
  function onTabKey(e) {
    const keys = TABS.map((t) => t.key);
    const i = keys.indexOf(tab);
    let next = null;
    if (e.key === 'ArrowRight') next = keys[(i + 1) % keys.length];
    else if (e.key === 'ArrowLeft') next = keys[(i - 1 + keys.length) % keys.length];
    else if (e.key === 'Home') next = keys[0];
    else if (e.key === 'End') next = keys[keys.length - 1];
    if (!next) return;
    e.preventDefault();
    setTab(next);
    tabRefs.current[next]?.focus();
  }

  const [linkedAccounts, setLinkedAccounts] = useState([]);
  // The agent's state for the chip in the header (the tab itself loads everything it needs).
  const [agentChip, setAgentChip] = useState(null);
  // The project name in the header is a field that saves itself (like the deal title).
  const [nameValue, setNameValue] = useState('');

  const [editMode, setEditMode] = useState(false);
  const [editForm, setEditForm] = useState(null);
  const [savingEdit, setSavingEdit] = useState(false);

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

  useEffect(() => {
    if (project) {
      setNotesValue(project.notes || '');
      setInfoValue(project.additional_info || '');
    }
  }, [project]);

  function startEdit() {
    setEditForm({
      manager: project.manager || '',
      client: project.client || '',
      client_id: project.client_id || null,
      country: project.country || '',
      website: project.website || '',
      start_date: project.start_date || '',
      end_date: project.end_date || '',
      status: project.status || 'active',
      services: project.services || [],
      ...extraFieldsForm(project),
    });
    setEditMode(true);
  }

  function cancelEdit() {
    setEditMode(false);
    setEditForm(null);
  }

  function setEditField(field, value) {
    setEditForm((f) => ({ ...f, [field]: value }));
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

  function toggleEditService(s) {
    setEditForm((f) => ({ ...f, services: f.services.includes(s) ? f.services.filter((x) => x !== s) : [...f.services, s] }));
  }

  async function saveEdit() {
    setSavingEdit(true);
    try {
      await updateProject(id, {
        manager: editForm.manager.trim() || null,
        client: editForm.client.trim() || null,
        client_id: editForm.client_id || null,
        country: editForm.country.trim() || null,
        website: editForm.website.trim() || null,
        start_date: editForm.start_date || null,
        end_date: editForm.end_date || null,
        status: editForm.status,
        services: editForm.services,
        ...extraFieldsPayload(editForm),
      });
      setEditMode(false);
      setEditForm(null);
      await reload();
    } catch (e) {
      console.warn('saveProject failed', e);
      alert('Не вдалося зберегти проєкт.');
    } finally {
      setSavingEdit(false);
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
    if (!(await confirm({ title: 'Видалити проєкт?', body: 'Видалити цей проєкт? Дію не можна скасувати.', confirmLabel: 'Видалити проєкт', danger: true }))) return;
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
          <button type="button" className="btn" onClick={() => navigate('/projects')}>&#8592; Back</button>
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
    return (
      <div className="ov-field-box" key={key}>
        <div className="ov-field-label">{f.label}</div>
        {editMode ? (
          f.type === 'select' ? (
            <Select value={editForm[f.key] || ''} onChange={(v) => setEditField(f.key, v)} ariaLabel={f.label}
              options={[{ value: '', label: 'Не вказано' }, ...f.options.map((o) => ({ value: o, label: o }))]} />
          ) : (
            <input
              type={f.type === 'url' ? 'text' : f.type} value={editForm[f.key]} placeholder={f.placeholder}
              step={f.type === 'number' ? '0.01' : undefined}
              onChange={(e) => setEditField(f.key, e.target.value)}
              onClick={f.type === 'date' ? (e) => e.currentTarget.showPicker?.() : undefined}
            />
          )
        ) : isEmpty(project[f.key]) ? (
          <div className="ov-field-value ov-empty">—</div>
        ) : f.key === 'worksection_link' ? (
          <a className="ov-field-value ov-link" href={project[f.key]} target="_blank" rel="noreferrer">Відкрити в Worksection</a>
        ) : (
          <div className="ov-field-value">
            {f.key === 'cost' ? fmtCost(project.cost) : f.type === 'date' ? (fmtIsoDate(project[f.key]) || '—') : project[f.key]}
          </div>
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
            {editMode
              ? <input type="text" value={editForm.manager} onChange={(e) => setEditField('manager', e.target.value)} placeholder="Ім'я менеджера" />
              : <div className={'ov-field-value' + (isEmpty(project.manager) ? ' ov-empty' : '')}>{isEmpty(project.manager) ? '—' : project.manager}</div>}
          </div>
        );
      case 'status':
        return (
          <div className="ov-field-box" key={key}>
            <div className="ov-field-label"><FieldIcon name="status" />Статус</div>
            {editMode ? (
              <div className="status-picker">
                {STATUSES.map((s) => (
                  <button key={s} type="button" className={'status-btn' + (editForm.status === s ? ` on ${s}` : '')} onClick={() => setEditField('status', s)}>
                    {STATUS_LABEL[s]}
                  </button>
                ))}
              </div>
            ) : (
              <span className={'status-pill ' + project.status}>{STATUS_LABEL[project.status]}</span>
            )}
          </div>
        );
      case 'period':
        return (
          <div className="ov-field-box" key={key}>
            <div className="ov-field-label"><FieldIcon name="period" />Початок роботи над стратегією – завершення співпраці</div>
            {editMode ? (
              <div className="ov-date-row">
                <DatePicker value={editForm.start_date} onChange={(v) => setEditField('start_date', v)} />
                <span>–</span>
                <DatePicker value={editForm.end_date} onChange={(v) => setEditField('end_date', v)} />
              </div>
            ) : (
              <div className={'ov-field-value' + (!project.start_date && !project.end_date ? ' ov-empty' : '')}>{!project.start_date && !project.end_date ? '—' : `${fmtIsoDate(project.start_date) || '—'} – ${fmtIsoDate(project.end_date) || '—'}`}</div>
            )}
          </div>
        );
      case 'services':
        return (
          <div className="ov-field-box ov-field-box-wide" key={key}>
            <div className="ov-field-label"><FieldIcon name="services" />Послуги (канал роботи)</div>
            {editMode ? (
              <div className="svc-picker">
                {SERVICES.map((s) => (
                  <label className="svc-opt" key={s}>
                    <input type="checkbox" checked={editForm.services.includes(s)} onChange={() => toggleEditService(s)} />
                    <span>{s}</span>
                  </label>
                ))}
              </div>
            ) : (
              isEmpty(project.services)
                ? <div className="ov-field-value ov-empty">—</div>
                : <div className="proj-tags">{project.services.map((x) => <span className="svc-tag" key={x}>{x}</span>)}</div>
            )}
          </div>
        );
      case 'client':
        return (
          <div className="ov-field-box" key={key}>
            <div className="ov-field-label"><FieldIcon name="client" />Клієнт</div>
            {editMode ? (
              <ClientPicker
                value={editForm.client_id}
                placeholder={editForm.client || 'Пошук клієнта або створити нового...'}
                onChange={(c) => setEditForm((f) => ({ ...f, client_id: c ? c.id : null, client: c ? (c.company || clientFullName(c)) : '' }))}
              />
            ) : project.client_id ? (
              <Link className="ov-field-value ov-link" to={'/reports/clients-directory/' + project.client_id}>{project.client || 'Відкрити контакт'}</Link>
            ) : (
              <div className={'ov-field-value' + (isEmpty(project.client) ? ' ov-empty' : '')}>{isEmpty(project.client) ? '—' : project.client}</div>
            )}
          </div>
        );
      case 'country':
        return (
          <div className="ov-field-box" key={key}>
            <div className="ov-field-label"><FieldIcon name="country" />Гео (країна)</div>
            {editMode
              ? <input type="text" value={editForm.country} onChange={(e) => setEditField('country', e.target.value)} placeholder="напр. USA" />
              : <div className={'ov-field-value' + (isEmpty(project.country) ? ' ov-empty' : '')}>{isEmpty(project.country) ? '—' : project.country}</div>}
          </div>
        );
      case 'website':
        return (
          <div className="ov-field-box" key={key}>
            <div className="ov-field-label"><FieldIcon name="website" />Сайт</div>
            {editMode
              ? <input type="text" value={editForm.website} onChange={(e) => setEditField('website', e.target.value)} placeholder="https://..." />
              : (isEmpty(project.website) ? <div className="ov-field-value ov-empty">—</div> : <a className="ov-field-value ov-link" href={project.website} target="_blank" rel="noreferrer">{project.website}</a>)}
          </div>
        );
      default:
        return renderExtra(key);
    }
  }

  const notesDirty = notesValue !== (project.notes || '');
  const infoDirty = infoValue !== (project.additional_info || '');

  return (
    <div className="report-page project-detail-page pw" data-dd="plum">
      <div className="pd-header pw-head">
        <div className="pd-header-meta">
          <div className="pd-title-row">
            <input
              type="text" className="deal-title-input pd-title-input" value={nameValue}
              onChange={(e) => setNameValue(e.target.value)}
              onBlur={saveName}
              onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') { setNameValue(project.name || ''); e.currentTarget.blur(); } }}
              placeholder="Назва проєкту" aria-label="Назва проєкту"
            />
            <button type="button" className="pw-btn pd-back" onClick={() => navigate('/projects')}><ActionIcon name="back" size={18} /> Назад</button>
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
      </div>

      <div className="pw-tabs" role="tablist" aria-label="Розділи проєкту" onKeyDown={onTabKey}>
        {TABS.map((t) => (
          <button
            key={t.key} id={'pw-tab-' + t.key} ref={(n) => { tabRefs.current[t.key] = n; }}
            type="button" role="tab" aria-selected={tab === t.key} aria-controls="pw-panel" tabIndex={tab === t.key ? 0 : -1}
            className={'pw-tab' + (tab === t.key ? ' on' : '')} onClick={() => setTab(t.key)}
          >
            {t.icon && <img src={t.icon} alt="" aria-hidden="true" draggable="false" />}
            <span>{t.label}</span>
          </button>
        ))}
      </div>

      <div className="pw-workspace" id="pw-panel" role="tabpanel" aria-labelledby={'pw-tab-' + tab}>
      {tab === 'overview' && (
        <>
          <ProjectAccountsPanel projectId={id} services={project.services} onAddService={addService} onAccountsChange={setLinkedAccounts} />

          <section className="report-section pw-card">
            <div className="ov-section-head">
              <div className="stitle">Про проєкт</div>
              {!editMode ? (
                <button type="button" className="pw-btn" onClick={startEdit}><ActionIcon name="edit" size={18} /> Редагувати</button>
              ) : (
                <div className="ov-edit-actions">
                  <button type="button" className="pw-btn pw-btn--primary" onClick={saveEdit} disabled={savingEdit}><ActionIcon name="save" size={18} /> {savingEdit ? '...' : 'Зберегти'}</button>
                  <button type="button" className="pw-btn" onClick={cancelEdit}>Скасувати</button>
                </div>
              )}
            </div>

            <div className="pw-groups">
              {FIELD_GROUPS.map((group) => (
                <div className="ov-group" key={group.title}>
                  <div className="ov-group-head">
                    <div className="ov-group-title">{group.title}</div>
                  </div>
                  <div className="ov-field-grid">{group.items.map(renderItem).filter(Boolean)}</div>
                </div>
              ))}
            </div>
          </section>

          <div className="pw-notes">
          <section className="report-section pw-card">
            <div className="ov-field-box ov-notes-box">
              <div className="ov-field-label"><FieldIcon name="notes" />Особливості роботи з клієнтом</div>
              <AutoResizeTextarea value={notesValue} onChange={setNotesValue} placeholder="Нотатки по клієнту..." />
              {notesDirty && (
                <button type="button" className="btn btn-p ov-notes-save" onClick={saveNotes} disabled={notesSaving}>
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
                <button type="button" className="btn btn-p ov-notes-save" onClick={saveInfo} disabled={infoSaving}>
                  {infoSaving ? '...' : 'Зберегти'}
                </button>
              )}
            </div>
          </section>
          </div>

          {!editMode && (
            <button type="button" className="pw-btn pw-btn--danger-quiet ov-delete-link" onClick={handleDelete} disabled={deleting}>
              <ActionIcon name="delete" size={18} /> {deleting ? '...' : 'Видалити проєкт'}
            </button>
          )}
        </>
      )}

      {tab === 'period' && <PeriodStats key={'period-' + id} projectId={id} />}
      {tab === 'weekly' && <PeriodReport key={'weekly-' + id} projectId={id} periodType="weekly" />}
      {tab === 'monthly' && <PeriodReport key={'monthly-' + id} projectId={id} periodType="monthly" />}
      {tab === 'decks' && <ProjectDecksTab key={'decks-' + id} projectId={id} />}
      {tab === 'agent' && <ProjectAgentTab key={'agent-' + id} projectId={id} />}
      </div>
      {confirmDialog}
    </div>
  );
}
