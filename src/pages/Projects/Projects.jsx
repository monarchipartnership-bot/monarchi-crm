import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import ProjectCard from '../../components/Projects/ProjectCard';
import ProjectModal from '../../components/Projects/ProjectModal';
import { useAuth } from '../../contexts/AuthContext';
import { fetchProjects, createProject } from '../../lib/api/projects';
import { addProjectAccount } from '../../lib/api/projectAccounts';
import '../../styles/reportPage.css';
import '../../styles/projectsPage.css';

const TABS = [
  { key: 'all', label: 'Всі проекти' },
  { key: 'active', label: 'Поточні проекти' },
  { key: 'paused', label: 'На паузі' },
  { key: 'completed', label: 'Завершені проекти' },
];

export default function Projects() {
  const navigate = useNavigate();
  const location = useLocation();
  const { email } = useAuth();
  // The contact card's "Проекти" tab can open this page with the create form and that contact preselected.
  const newForClient = location.state?.newForClient || null;

  const [projects, setProjects] = useState([]);
  const [loadError, setLoadError] = useState('');
  const [tab, setTab] = useState('all');
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(Boolean(newForClient));
  const [saving, setSaving] = useState(false);

  async function reload() {
    try {
      setProjects(await fetchProjects());
      setLoadError('');
    } catch (e) {
      console.warn('loadProjects failed', e);
      setLoadError('Не вдалося завантажити проєкти. Можливо, таблицю ще не створено в Supabase.');
    }
  }

  useEffect(() => { reload(); }, []);

  const counts = useMemo(() => ({
    all: projects.length,
    active: projects.filter((p) => p.status === 'active').length,
    paused: projects.filter((p) => p.status === 'paused').length,
    completed: projects.filter((p) => p.status === 'completed').length,
  }), [projects]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return projects.filter((p) => {
      if (tab !== 'all' && p.status !== tab) return false;
      if (term && !(p.name || '').toLowerCase().includes(term) && !(p.client || '').toLowerCase().includes(term)) return false;
      return true;
    });
  }, [projects, tab, search]);

  async function handleSave({ project, accounts }) {
    setSaving(true);
    let created = null;
    try {
      created = await createProject(project, email);
    } catch (e) {
      console.warn('saveProject failed', e);
      setSaving(false);
      alert('Не вдалося зберегти проєкт. Якщо це перший проєкт із клієнтом, перевірте, що в базі застосовано останню міграцію.');
      return;
    }
    // The project exists now; a failing account link must not look like the project was lost.
    const failed = [];
    for (const a of accounts) {
      try {
        await addProjectAccount({ projectId: created.id, platform: a.platform, account: a.account, createdBy: email });
      } catch (e) {
        console.warn('addProjectAccount failed', e);
        failed.push(`${a.platform}: ${e.message || e}`);
      }
    }
    setSaving(false);
    setModalOpen(false);
    if (failed.length) alert('Проєкт створено, але кабінети підключилися не всі:' + String.fromCharCode(10) + failed.join(String.fromCharCode(10)));
    navigate('/projects/' + created.id);
  }

  return (
    <div className="report-page projects-page">
      <div className="page-actions">
        <button type="button" className="btn" onClick={() => navigate(-1)}>&#8592; Back</button>
        <Link className="btn" to="/projects/reports/period">Показники за період</Link>
        <Link className="btn" to="/projects/reports/weekly">Тижневий звіт</Link>
        <Link className="btn" to="/projects/reports/monthly">Місячний звіт</Link>
      </div>

      <section className="rpt-hero">
        <h1>Projects</h1>
        <p className="sub">База всіх проєктів агентства. Створює та веде проєкт менеджер, який за нього відповідає.</p>
      </section>

      <div className="proj-toolbar">
        <div className="proj-search">
          <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.35-4.35" /></svg>
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Пошук за назвою чи клієнтом..." />
        </div>
        <div className="proj-tabs">
          {TABS.map((t) => (
            <button key={t.key} type="button" className={'proj-tab' + (tab === t.key ? ' on' : '')} onClick={() => setTab(t.key)}>
              {t.label} <span className="cnt">{counts[t.key]}</span>
            </button>
          ))}
        </div>
        <div className="tb-sp" />
        <button type="button" className="btn btn-p" onClick={() => setModalOpen(true)}>+ Створити проект</button>
      </div>

      <div className="proj-grid">
        {loadError ? (
          <div className="proj-empty">{loadError}</div>
        ) : !filtered.length ? (
          <div className="proj-empty">Проєктів не знайдено.</div>
        ) : (
          filtered.map((p) => (
            <ProjectCard key={p.id} project={p} onClick={() => navigate(`/projects/${p.id}`)} />
          ))
        )}
      </div>

      {modalOpen && (
        <ProjectModal
          onClose={() => setModalOpen(false)}
          onSave={handleSave}
          saving={saving}
          initialClientId={newForClient}
        />
      )}
    </div>
  );
}
