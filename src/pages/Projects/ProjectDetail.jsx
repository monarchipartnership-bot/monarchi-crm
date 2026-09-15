import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import AutoResizeTextarea from '../../components/Reports/AutoResizeTextarea';
import AdReportForm from '../../components/Projects/AdReportForm';
import { fetchProjectById, updateProject, deleteProject } from '../../lib/api/projects';
import { STATUS_LABEL, SERVICES, fmtIsoDate } from '../../lib/projectConstants';
import '../../styles/reportPage.css';
import '../../styles/projectsPage.css';
import '../../styles/projectReportPage.css';

const TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'daily', label: 'Daily Report' },
  { key: 'weekly', label: 'Weekly Report' },
  { key: 'monthly', label: 'Monthly Report' },
];

const STATUSES = ['active', 'paused', 'completed'];

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
      country: project.country || '',
      website: project.website || '',
      crm_link: project.crm_link || '',
      start_date: project.start_date || '',
      end_date: project.end_date || '',
      status: project.status || 'active',
      services: project.services || [],
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
        country: editForm.country.trim() || null,
        website: editForm.website.trim() || null,
        crm_link: editForm.crm_link.trim() || null,
        start_date: editForm.start_date || null,
        end_date: editForm.end_date || null,
        status: editForm.status,
        services: editForm.services,
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
          <span className={'status-pill ' + project.status}>{STATUS_LABEL[project.status]}</span>
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

            <div className="ov-field-grid">
              <div className="ov-field-box">
                <div className="ov-field-label"><FieldIcon name="manager" />Менеджер</div>
                {editMode
                  ? <input type="text" value={editForm.manager} onChange={(e) => setEditField('manager', e.target.value)} placeholder="Ім'я менеджера" />
                  : <div className="ov-field-value">{project.manager || '—'}</div>}
              </div>

              <div className="ov-field-box">
                <div className="ov-field-label"><FieldIcon name="client" />Клієнт</div>
                {editMode
                  ? <input type="text" value={editForm.client} onChange={(e) => setEditField('client', e.target.value)} placeholder="напр. Acme Inc." />
                  : <div className="ov-field-value">{project.client || '—'}</div>}
              </div>

              <div className="ov-field-box">
                <div className="ov-field-label"><FieldIcon name="country" />Країна</div>
                {editMode
                  ? <input type="text" value={editForm.country} onChange={(e) => setEditField('country', e.target.value)} placeholder="напр. USA" />
                  : <div className="ov-field-value">{project.country || '—'}</div>}
              </div>

              <div className="ov-field-box">
                <div className="ov-field-label"><FieldIcon name="website" />Сайт</div>
                {editMode
                  ? <input type="text" value={editForm.website} onChange={(e) => setEditField('website', e.target.value)} placeholder="https://..." />
                  : project.website
                    ? <a className="ov-field-value ov-link" href={project.website} target="_blank" rel="noreferrer">{project.website}</a>
                    : <div className="ov-field-value">—</div>}
              </div>

              <div className="ov-field-box">
                <div className="ov-field-label"><FieldIcon name="crm" />CRM link</div>
                {editMode
                  ? <input type="text" value={editForm.crm_link} onChange={(e) => setEditField('crm_link', e.target.value)} placeholder="https://..." />
                  : project.crm_link
                    ? <a className="ov-field-value ov-link" href={project.crm_link} target="_blank" rel="noreferrer">Відкрити в CRM</a>
                    : <div className="ov-field-value">—</div>}
              </div>

              <div className="ov-field-box">
                <div className="ov-field-label"><FieldIcon name="period" />Період</div>
                {editMode ? (
                  <div className="ov-date-row">
                    <input
                      type="date"
                      value={editForm.start_date}
                      onChange={(e) => setEditField('start_date', e.target.value)}
                      onClick={(e) => e.currentTarget.showPicker?.()}
                    />
                    <span>–</span>
                    <input
                      type="date"
                      value={editForm.end_date}
                      onChange={(e) => setEditField('end_date', e.target.value)}
                      onClick={(e) => e.currentTarget.showPicker?.()}
                    />
                  </div>
                ) : (
                  <div className="ov-field-value">{fmtIsoDate(project.start_date) || '—'} – {fmtIsoDate(project.end_date) || '—'}</div>
                )}
              </div>

              <div className="ov-field-box">
                <div className="ov-field-label"><FieldIcon name="status" />Статус</div>
                {editMode ? (
                  <div className="status-picker">
                    {STATUSES.map((s) => (
                      <button
                        key={s}
                        type="button"
                        className={'status-btn' + (editForm.status === s ? ` on ${s}` : '')}
                        onClick={() => setEditField('status', s)}
                      >
                        {STATUS_LABEL[s]}
                      </button>
                    ))}
                  </div>
                ) : (
                  <span className={'status-pill ' + project.status}>{STATUS_LABEL[project.status]}</span>
                )}
              </div>

              <div className="ov-field-box ov-field-box-wide">
                <div className="ov-field-label"><FieldIcon name="services" />Послуги</div>
                {editMode ? (
                  <div className="svc-picker">
                    {SERVICES.map((s) => (
                      <label className="svc-opt" key={s}>
                        <input type="checkbox" checked={editForm.services.includes(s)} onChange={() => toggleEditService(s)} />
                        <span>{s}</span>
                      </label>
                    ))}
                  </div>
                ) : project.services?.length ? (
                  <div className="proj-tags">
                    {project.services.map((s) => <span className="svc-tag" key={s}>{s}</span>)}
                  </div>
                ) : (
                  <div className="ov-field-value">—</div>
                )}
              </div>
            </div>

            {!editMode && (
              <button type="button" className="del-link ov-delete-link" onClick={handleDelete} disabled={deleting}>
                {deleting ? '...' : 'Видалити проект'}
              </button>
            )}
          </section>

          <section className="report-section">
            <div className="ov-field-box ov-notes-box">
              <div className="ov-field-label"><FieldIcon name="notes" />Заметки по клієнту</div>
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

      {tab === 'daily' && <AdReportForm key={'daily-' + id} projectId={id} periodType="daily" />}
      {tab === 'weekly' && <AdReportForm key={'weekly-' + id} projectId={id} periodType="weekly" />}
      {tab === 'monthly' && <AdReportForm key={'monthly-' + id} projectId={id} periodType="monthly" />}
    </div>
  );
}
