import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
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
import '../../styles/reportPage.css';
import '../../styles/projectsPage.css';
import '../../styles/projectReportPage.css';
import '../../styles/projectAccounts.css';

const TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'period', label: 'Показники за період' },
  { key: 'weekly', label: 'Тижневий звіт' },
  { key: 'monthly', label: 'Місячний звіт' },
];

const STATUSES = ['active', 'paused', 'completed'];

// The Overview fields in reading order. Empty ones are hidden while viewing.
const FIELD_GROUPS = [
  { title: 'Основне', items: ['manager', 'status', 'period', 'services'] },
  { title: 'Клієнт', items: ['client', 'country', 'website', 'business_type', 'contacts', 'timezone'] },
  { title: 'Реєстр проєкту', items: ['specialist', 'comm_start_date', 'payment_channel', 'cost', 'worksection_link', 'stop_reason'] },
];
const ALL_FIELD_KEYS = FIELD_GROUPS.flatMap((g) => g.items);

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
  const [tab, setTab] = useState('overview');
  const [deleting, setDeleting] = useState(false);

  const [linkedAccounts, setLinkedAccounts] = useState([]);

  const [editMode, setEditMode] = useState(false);
  const [editForm, setEditForm] = useState(null);
  const [savingEdit, setSavingEdit] = useState(false);

  const [notesValue, setNotesValue] = useState('');
  const [notesSaving, setNotesSaving] = useState(false);
  const [infoValue, setInfoValue] = useState('');
  const [infoSaving, setInfoSaving] = useState(false);

  async function reload() {
    try {
      setProject(await fetchProjectById(id));
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
    if (!confirm('Видалити цей проєкт? Дію не можна скасувати.')) return;
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

  // Which fields have nothing in them (hidden while viewing, shown while editing).
  const emptyKeys = ALL_FIELD_KEYS.filter((k) => {
    if (k === 'status') return false;
    if (k === 'period') return !project.start_date && !project.end_date;
    return isEmpty(project[k]);
  });
  const hiddenCount = emptyKeys.length;

  function renderExtra(key) {
    const f = EXTRA_PROJECT_FIELDS.find((x) => x.key === key);
    if (!f || (!editMode && isEmpty(project[key]))) return null;
    return (
      <div className="ov-field-box" key={key}>
        <div className="ov-field-label">{f.label}</div>
        {editMode ? (
          f.type === 'select' ? (
            <select value={editForm[f.key]} onChange={(e) => setEditField(f.key, e.target.value)}>
              <option value="">Не вказано</option>
              {f.options.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          ) : (
            <input
              type={f.type === 'url' ? 'text' : f.type} value={editForm[f.key]} placeholder={f.placeholder}
              step={f.type === 'number' ? '0.01' : undefined}
              onChange={(e) => setEditField(f.key, e.target.value)}
              onClick={f.type === 'date' ? (e) => e.currentTarget.showPicker?.() : undefined}
            />
          )
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
        if (!editMode && isEmpty(project.manager)) return null;
        return (
          <div className="ov-field-box" key={key}>
            <div className="ov-field-label"><FieldIcon name="manager" />Продакт (менеджер)</div>
            {editMode
              ? <input type="text" value={editForm.manager} onChange={(e) => setEditField('manager', e.target.value)} placeholder="Ім'я менеджера" />
              : <div className="ov-field-value">{project.manager}</div>}
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
        if (!editMode && !project.start_date && !project.end_date) return null;
        return (
          <div className="ov-field-box" key={key}>
            <div className="ov-field-label"><FieldIcon name="period" />Початок роботи над стратегією – завершення співпраці</div>
            {editMode ? (
              <div className="ov-date-row">
                <input type="date" value={editForm.start_date} onChange={(e) => setEditField('start_date', e.target.value)} onClick={(e) => e.currentTarget.showPicker?.()} />
                <span>–</span>
                <input type="date" value={editForm.end_date} onChange={(e) => setEditField('end_date', e.target.value)} onClick={(e) => e.currentTarget.showPicker?.()} />
              </div>
            ) : (
              <div className="ov-field-value">{fmtIsoDate(project.start_date) || '—'} – {fmtIsoDate(project.end_date) || '—'}</div>
            )}
          </div>
        );
      case 'services':
        if (!editMode && isEmpty(project.services)) return null;
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
              <div className="proj-tags">{project.services.map((s) => <span className="svc-tag" key={s}>{s}</span>)}</div>
            )}
          </div>
        );
      case 'client':
        if (!editMode && isEmpty(project.client)) return null;
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
              <div className="ov-field-value">{project.client}</div>
            )}
          </div>
        );
      case 'country':
        if (!editMode && isEmpty(project.country)) return null;
        return (
          <div className="ov-field-box" key={key}>
            <div className="ov-field-label"><FieldIcon name="country" />Гео (країна)</div>
            {editMode
              ? <input type="text" value={editForm.country} onChange={(e) => setEditField('country', e.target.value)} placeholder="напр. USA" />
              : <div className="ov-field-value">{project.country}</div>}
          </div>
        );
      case 'website':
        if (!editMode && isEmpty(project.website)) return null;
        return (
          <div className="ov-field-box" key={key}>
            <div className="ov-field-label"><FieldIcon name="website" />Сайт</div>
            {editMode
              ? <input type="text" value={editForm.website} onChange={(e) => setEditField('website', e.target.value)} placeholder="https://..." />
              : <a className="ov-field-value ov-link" href={project.website} target="_blank" rel="noreferrer">{project.website}</a>}
          </div>
        );
      default:
        return renderExtra(key);
    }
  }

  const notesDirty = notesValue !== (project.notes || '');
  const infoDirty = infoValue !== (project.additional_info || '');

  return (
    <div className="report-page project-detail-page">
      <div className="page-actions">
        <button type="button" className="btn" onClick={() => navigate('/projects')}>&#8592; Back</button>
      </div>

      <div className="pd-header">
        <div className="pd-header-meta">
          <div className="pd-header-name">{project.name}</div>
          <div className="pd-header-chips">
            {linkedAccounts.map((a) => (
              <span className="pacc-chip" key={a.platform}>
                <span className="pacc-badge pacc-badge--xs" style={{ background: platformInfo(a.platform).gradient }}>{platformInfo(a.platform).mark}</span>
                {platformInfo(a.platform).label}
              </span>
            ))}
            {project.client && (project.client_id
              ? <Link className="pacc-chip pacc-chip--link" to={'/reports/clients-directory/' + project.client_id}>{project.client}</Link>
              : <span className="pacc-chip">{project.client}</span>)}
            {project.manager && <span className="pacc-chip">{project.manager}</span>}
          </div>
        </div>
      </div>

      <div className="pd-tabs">
        {TABS.map((t) => (
          <button key={t.key} type="button" className={'pd-tab' + (tab === t.key ? ' on' : '')} onClick={() => setTab(t.key)}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <>
          <ProjectAccountsPanel projectId={id} services={project.services} onAddService={addService} onAccountsChange={setLinkedAccounts} />

          <section className="report-section">
            <div className="ov-section-head">
              <div className="stitle">Про проєкт</div>
              {!editMode ? (
                <button type="button" className="btn" onClick={startEdit}>Редагувати</button>
              ) : (
                <div className="ov-edit-actions">
                  <button type="button" className="btn btn-p" onClick={saveEdit} disabled={savingEdit}>{savingEdit ? '...' : 'Зберегти'}</button>
                  <button type="button" className="btn" onClick={cancelEdit}>Скасувати</button>
                </div>
              )}
            </div>

            {FIELD_GROUPS.map((group) => {
              const boxes = group.items.map(renderItem).filter(Boolean);
              if (!boxes.length) return null;
              return (
                <div className="ov-group" key={group.title}>
                  <div className="ov-group-title">{group.title}</div>
                  <div className="ov-field-grid">{boxes}</div>
                </div>
              );
            })}

            {!editMode && hiddenCount > 0 && (
              <div className="ov-hidden-hint">
                Не заповнено полів: {hiddenCount}. Вони приховані.
                <button type="button" className="pacc-link" onClick={startEdit}>Показати й заповнити</button>
              </div>
            )}

            {!editMode && (
              <button type="button" className="del-link ov-delete-link" onClick={handleDelete} disabled={deleting}>
                {deleting ? '...' : 'Видалити проект'}
              </button>
            )}
          </section>

          <section className="report-section">
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

          <section className="report-section">
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
        </>
      )}

      {tab === 'period' && <PeriodStats key={'period-' + id} projectId={id} />}
      {tab === 'weekly' && <PeriodReport key={'weekly-' + id} projectId={id} periodType="weekly" />}
      {tab === 'monthly' && <PeriodReport key={'monthly-' + id} projectId={id} periodType="monthly" />}
    </div>
  );
}
