import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import ProjectCard from '../../components/Projects/ProjectCard';
import ProjectModal from '../../components/Projects/ProjectModal';
import { useAuth } from '../../contexts/AuthContext';
import { fetchProjects, createProject } from '../../lib/api/projects';
import { fetchPendingReports } from '../../lib/api/projectReportStore';
import { fetchApprovers } from '../../lib/api/projectAgents';
import { canApprove } from '../../lib/projectHistory';
import { addProjectAccount, fetchAllProjectAccounts } from '../../lib/api/projectAccounts';
import { PAGE_ICONS, PLATFORM_ICONS, PLATFORM_SYMBOL } from '../../lib/pageIcons';
import '@fontsource/onest/500.css';
import '@fontsource/onest/600.css';
import '@fontsource/onest/700.css';
import '@fontsource/onest/800.css';
import '../../styles/reportPage.css';
import '../../styles/projectsPage.css';
import '../../styles/projectsFolder.css';
import '../../styles/ddHub.css';
import '../../styles/projectHistory.css';

// First level (folder tabs): where the project runs. Decided by the linked ad accounts, never by
// the service tags; a project with accounts on both platforms is in both lists.
const PLATFORM_TABS = [
  { key: 'all', label: 'Всі проєкти', icon: PAGE_ICONS['page.projects'].src },
  { key: 'google', label: 'Google Ads', icon: PLATFORM_ICONS[PLATFORM_SYMBOL.google].src },
  { key: 'meta', label: 'Meta Ads', icon: PLATFORM_ICONS[PLATFORM_SYMBOL.meta].src },
];
// Second level: its state. Independent of the platform tab.
const STATUS_TABS = [
  { key: 'all', label: 'Всі статуси', icon: <><rect x="4" y="4" width="6.5" height="6.5" rx="1.5" /><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5" /><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5" /><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5" /></> },
  { key: 'active', label: 'Поточні', icon: <><circle cx="12" cy="12" r="8.5" /><path d="M10 8.5l5 3.5-5 3.5z" /></> },
  { key: 'paused', label: 'На паузі', icon: <><circle cx="12" cy="12" r="8.5" /><path d="M10 9v6M14 9v6" /></> },
  { key: 'completed', label: 'Завершені', icon: <><circle cx="12" cy="12" r="8.5" /><path d="M8.5 12.3l2.6 2.6 4.6-5" /></> },
];

export default function Projects() {
  const navigate = useNavigate();
  const location = useLocation();
  const { email } = useAuth();
  // The contact card's "Проекти" tab can open this page with the create form and that contact preselected.
  const newForClient = location.state?.newForClient || null;

  const [projects, setProjects] = useState([]);
  const [pendingCount, setPendingCount] = useState(0); // reports that wait for this person's approval
  useEffect(() => {
    let off = false;
    Promise.all([fetchPendingReports(), fetchApprovers()]).then(([rows, approvers]) => { if (!off) setPendingCount(rows.filter((r) => canApprove(email, approvers.get(r.project_id))).length); }).catch(() => {});
    return () => { off = true; };
  }, [email]);
  const [accounts, setAccounts] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [platform, setPlatform] = useState('all');
  const [tab, setTab] = useState('all');
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(Boolean(newForClient));
  const [saving, setSaving] = useState(false);
  const createBtn = useRef(null);
  const searchRef = useRef(null);
  const tabRefs = useRef({});

  async function reload() {
    try {
      const [rows, accs] = await Promise.all([fetchProjects(), fetchAllProjectAccounts()]);
      setProjects(rows);
      setAccounts(accs);
      setLoadError('');
    } catch (e) {
      console.warn('loadProjects failed', e);
      setLoadError('Не вдалося завантажити проєкти. Можливо, таблицю ще не створено в Supabase.');
    } finally {
      setLoaded(true);
    }
  }

  useEffect(() => { reload(); }, []);

  // Which platforms each project has an account on.
  const platformsOf = useMemo(() => {
    const map = new Map();
    accounts.forEach((a) => map.set(a.project_id, new Set([...(map.get(a.project_id) || []), a.platform])));
    return map;
  }, [accounts]);

  const term = search.trim().toLowerCase();
  const matchesSearch = (p) => !term || (p.name || '').toLowerCase().includes(term) || (p.client || '').toLowerCase().includes(term);
  const onPlatform = (p, key) => key === 'all' || Boolean(platformsOf.get(p.id)?.has(key));

  // Platform counts follow the search but not the status; status counts follow platform and search.
  const platformCounts = useMemo(
    () => Object.fromEntries(PLATFORM_TABS.map((t) => [t.key, projects.filter((p) => onPlatform(p, t.key) && matchesSearch(p)).length])),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [projects, platformsOf, term],
  );
  const counts = useMemo(
    () => Object.fromEntries(STATUS_TABS.map((t) => [t.key, projects.filter((p) => onPlatform(p, platform) && (t.key === 'all' || p.status === t.key) && matchesSearch(p)).length])),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [projects, platformsOf, platform, term],
  );
  const filtered = useMemo(
    () => projects.filter((p) => onPlatform(p, platform) && (tab === 'all' || p.status === tab) && matchesSearch(p)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [projects, platformsOf, platform, tab, term],
  );

  async function handleSave({ project, accounts: linked }) {
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
    for (const a of linked) {
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

  // Arrow keys / Home / End move between the folder tabs (the focused tab is the selected one).
  function onTabKey(e) {
    const keys = PLATFORM_TABS.map((t) => t.key);
    const i = keys.indexOf(platform);
    let next = null;
    if (e.key === 'ArrowRight') next = keys[(i + 1) % keys.length];
    else if (e.key === 'ArrowLeft') next = keys[(i - 1 + keys.length) % keys.length];
    else if (e.key === 'Home') next = keys[0];
    else if (e.key === 'End') next = keys[keys.length - 1];
    if (!next) return;
    e.preventDefault();
    setPlatform(next);
    tabRefs.current[next]?.focus();
  }

  const noResults = loaded && !loadError && Boolean(term) && !filtered.length;
  const platformLabel = PLATFORM_TABS.find((t) => t.key === platform)?.label;
  const statusLabel = STATUS_TABS.find((t) => t.key === tab)?.label;
  const countText = (n) => (loaded && !loadError ? n.toLocaleString('uk-UA') : '…');

  function emptyText() {
    if (loadError) return loadError;
    if (term) return `За пошуком «${search.trim()}» нічого не знайдено.`;
    if (platform !== 'all' && tab !== 'all') return `На платформі ${platformLabel} немає проєктів зі статусом «${statusLabel}».`;
    if (platform !== 'all') return `На платформі ${platformLabel} поки немає проєктів.`;
    if (tab !== 'all') return `Немає проєктів зі статусом «${statusLabel}».`;
    return 'Проєктів ще немає. Створіть перший кнопкою «Створити проєкт».';
  }

  return (
    <div className="report-page projects-page folder-design">
      <div className="proj-ptabs" role="tablist" aria-label="Платформа" onKeyDown={onTabKey}>
        {PLATFORM_TABS.map((t) => {
          const on = platform === t.key;
          // The ring shows this platform's share of all projects (the "all" tab is a full ring).
          const share = t.key === 'all' || !platformCounts.all ? 100 : Math.round((platformCounts[t.key] / platformCounts.all) * 100);
          return (
            <button
              key={t.key} id={'proj-tab-' + t.key} ref={(n) => { tabRefs.current[t.key] = n; }}
              type="button" role="tab" aria-selected={on} aria-controls="proj-panel" tabIndex={on ? 0 : -1}
              className={'proj-ptab' + (on ? ' on' : '')} onClick={() => setPlatform(t.key)}
            >
              <span className="proj-ptab-ring" style={{ '--p': loaded && !loadError ? share : 100 }}>
                <span className="proj-ptab-ic"><img src={t.icon} alt="" aria-hidden="true" draggable="false" /></span>
                <span className="cnt" aria-label={loaded && !loadError ? `${platformCounts[t.key]} проєктів` : 'кількість завантажується'}>{countText(platformCounts[t.key])}</span>
              </span>
              <span className="proj-ptab-label">{t.label}</span>
            </button>
          );
        })}
      </div>

      <div className="proj-folder-body" id="proj-panel" role="tabpanel" aria-labelledby={'proj-tab-' + platform} aria-busy={!loaded}>
        <div className="proj-toolbar">
          <label className={'proj-search' + (search ? ' has-val' : '') + (noResults ? ' no-res' : '')}>
            <svg className="proj-search-lp" viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.35-4.35" /></svg>
            <input
              ref={searchRef} type="text" value={search} placeholder="Пошук за назвою чи клієнтом" aria-label="Пошук за назвою чи клієнтом"
              onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => { if (e.key === 'Escape' && search) { e.stopPropagation(); setSearch(''); } }}
            />
            {term && loaded && !loadError && <span className="proj-search-cnt" aria-label={`Знайдено ${filtered.length}`}>{filtered.length}</span>}
            {search && (
              <button type="button" className="proj-search-clr" aria-label="Очистити пошук" onClick={(e) => { e.preventDefault(); setSearch(''); searchRef.current?.focus(); }}>
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
              </button>
            )}
          </label>
          <span className="proj-divider" aria-hidden="true" />
          <div className="proj-tabs" role="group" aria-label="Статус">
            {STATUS_TABS.map((t) => (
              <button key={t.key} type="button" aria-pressed={tab === t.key} className={'proj-tab' + (tab === t.key ? ' on' : '')} onClick={() => setTab(t.key)}>
                <svg className="proj-tab-ic" viewBox="0 0 24 24" aria-hidden="true">{t.icon}</svg>
                {t.label}
                <span className="proj-tab-n" aria-label={loaded && !loadError ? `${counts[t.key]}` : ''}>{countText(counts[t.key])}</span>
              </button>
            ))}
          </div>
          <div className="tb-sp" />
          <button
            type="button" className="proj-apr" onClick={() => navigate('/projects/approvals')}
            title="Звіти на затвердження" aria-label={'Звіти на затвердження' + (pendingCount > 0 ? `: ${pendingCount}` : '')}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="3.5" width="16" height="17" rx="2.5" /><path d="M8 9h8M8 13h4M13.5 16.5l1.8 1.8 3.2-3.4" /></svg>
            {pendingCount > 0 && <span className="proj-apr-n" aria-hidden="true">{pendingCount > 99 ? '99+' : pendingCount}</span>}
          </button>
          <button ref={createBtn} type="button" className="btn btn-p proj-create" onClick={() => setModalOpen(true)}>
            <svg className="pf-ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>Створити проєкт
          </button>
        </div>

        <div className="proj-grid">
          {!loaded ? (
            [0, 1].map((i) => <div className="proj-card proj-skeleton" key={i} aria-hidden="true" />)
          ) : !filtered.length ? (
            <div className="proj-empty">{emptyText()}</div>
          ) : (
            filtered.map((p) => <ProjectCard key={p.id} project={p} onClick={() => navigate(`/projects/${p.id}`)} />)
          )}
        </div>
      </div>

      {modalOpen && (
        <ProjectModal
          onClose={() => { setModalOpen(false); createBtn.current?.focus(); }}
          onSave={handleSave}
          saving={saving}
          initialClientId={newForClient}
        />
      )}
    </div>
  );
}
