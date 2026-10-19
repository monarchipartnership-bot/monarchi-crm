import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { agentAction, fetchPlans, fetchPostTasks, kickQueue, loadTeam } from '../../lib/api/agents';
import { fetchBrand, fetchCompetitorReports, fetchCompetitors, fetchPosts, fetchSettings, fetchSiteAudits, fetchSiteStats } from '../../lib/api/smm';
import '../../styles/projectWorkspace.css'; // the shared confirmation window (useConfirm) lives in this sheet
import '../../styles/smmPage.css';
import AgentPage from './AgentPage';
import SmmAgents from './SmmAgents';
import SmmBrand from './SmmBrand';
import { PostDialog } from './SmmDialogs';
import SmmOverview from './SmmOverview';
import SmmPlan from './SmmPlan';
import SmmQueue from './SmmQueue';
import SmmSite from './SmmSite';

const TABS = [
  { key: 'overview', label: 'Огляд' },
  { key: 'agents', label: 'Агенти' },
  { key: 'plan', label: 'Контент-план' },
  { key: 'queue', label: 'Черга схвалення' },
  { key: 'site', label: 'Сайт' },
  { key: 'brand', label: 'Бренд і конкуренти' },
];

// Mon'Archi SMM: the team of assistants for the Monarchi website and social networks.
// Step 1: brand profile, content strategist + copywriter, approval queue (publishing is by hand for now).
export default function SmmHome() {
  const [params, setParams] = useSearchParams();
  const tab = TABS.some((t) => t.key === params.get('tab')) ? params.get('tab') : 'overview';
  const [brand, setBrand] = useState(null);
  const [competitors, setCompetitors] = useState([]);
  const [posts, setPosts] = useState([]);
  const [reports, setReports] = useState({});
  const [settings, setSettings] = useState(null);
  const [audits, setAudits] = useState([]);
  const [siteStats, setSiteStats] = useState([]);
  const [team, setTeam] = useState(null);
  const [plans, setPlans] = useState([]);
  const [postTasks, setPostTasks] = useState([]);
  const { email } = useAuth();
  const kicking = useRef(false);
  const [missing, setMissing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [dialog, setDialog] = useState(null); // null | { kind: 'post', post }
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);
  const tabRefs = useRef({});

  const reloadTeam = useCallback(async () => {
    try { setTeam(await loadTeam(email)); } catch (e) { console.warn('loadTeam failed', e); setTeam(null); }
  }, [email]);
  const reload = useCallback(async () => {
    const [b, c, p, r, st, au, pl, ss] = await Promise.all([fetchBrand(), fetchCompetitors(), fetchPosts(), fetchCompetitorReports(), fetchSettings(), fetchSiteAudits(), fetchPlans().catch(() => []), fetchSiteStats()]);
    const producing = p.posts.filter((x) => ['planned', 'producing', 'qc'].includes(x.status)).map((x) => x.id);
    const [pt] = await Promise.all([fetchPostTasks(producing).catch(() => []), reloadTeam()]);
    setReports(r); setSettings(st); setAudits(au); setSiteStats(ss); setPlans(pl); setPostTasks(pt);
    setBrand(b.brand); setCompetitors(c); setPosts(p.posts); setMissing(b.missing || p.missing); setLoading(false);
  }, [reloadTeam]);
  useEffect(() => { reload(); }, [reload]);

  // The queue is worked through by the server (the cron every 15 minutes, and this call right after a plan is approved);
  // while something is in production the page refreshes itself.
  const kick = useCallback(() => {
    if (kicking.current) return;
    kicking.current = true;
    kickQueue().catch((e) => console.warn('queue kick failed', e)).finally(() => { kicking.current = false; reload(); });
  }, [reload]);
  const busyProduction = posts.some((x) => ['planned', 'producing', 'qc'].includes(x.status)) || Object.values(team?.counts || {}).some((c) => c.queued || c.running);
  const pendingAssets = posts.some((x) => x.asset_status === 'pending');
  useEffect(() => {
    if (!pendingAssets) return undefined;
    const t = setInterval(() => { agentAction('poll_assets').then(reload).catch(() => {}); }, 20000);
    return () => clearInterval(t);
  }, [pendingAssets, reload]);
  useEffect(() => {
    if (!busyProduction) return undefined;
    const t = setInterval(() => { reload(); }, 8000);
    return () => clearInterval(t);
  }, [busyProduction, reload]);
  useEffect(() => () => clearTimeout(toastTimer.current), []);

  const notify = useCallback((text, isError = false) => {
    clearTimeout(toastTimer.current);
    setToast({ text, isError });
    toastTimer.current = setTimeout(() => setToast(null), isError ? 7000 : 4000);
  }, []);
  const go = (key) => setParams(key === 'overview' ? {} : { tab: key }, { replace: false });
  const agentRole = params.get('agent');
  const openAgent = (role) => setParams({ tab: 'agents', agent: role });

  function onKeyTabs(e) {
    const i = TABS.findIndex((t) => t.key === tab);
    const next = e.key === 'ArrowRight' ? (i + 1) % TABS.length : e.key === 'ArrowLeft' ? (i + TABS.length - 1) % TABS.length : e.key === 'Home' ? 0 : e.key === 'End' ? TABS.length - 1 : null;
    if (next == null) return;
    e.preventDefault(); go(TABS[next].key); tabRefs.current[TABS[next].key]?.focus();
  }

  const common = { posts, notify, reload };
  const toReview = posts.filter((p) => p.status === 'needs_review').length + plans.filter((pl) => pl.status === 'awaiting_approval').length;

  return (
    <div className="smm-page" data-dd="plum">
      <div className="smm-tabs" role="tablist" aria-label="Розділи SMM" onKeyDown={onKeyTabs}>
        {TABS.map((t) => (
          <button
            key={t.key} ref={(el) => { tabRefs.current[t.key] = el; }} type="button" role="tab" id={'smm-tab-' + t.key} aria-selected={tab === t.key} aria-controls="smm-panel"
            tabIndex={tab === t.key ? 0 : -1} className={'smm-tab' + (tab === t.key ? ' is-active' : '')} onClick={() => go(t.key)}
          >
            {t.label}
            {t.key === 'queue' && toReview > 0 && <span className="smm-tab-badge">{toReview}</span>}
          </button>
        ))}
      </div>

      <div className="smm-sheet" id="smm-panel" role="tabpanel" aria-labelledby={'smm-tab-' + tab}>
        {toast && <div className={'smm-toast' + (toast.isError ? ' is-error' : '')} role="status">{toast.text}</div>}
        {loading ? <p className="smm-muted">Завантаження…</p> : missing ? (
          <div className="smm-empty smm-empty--big" role="alert">Таблиці SMM ще не створено в базі. Потрібно застосувати міграцію <code>20261016000000_smm.sql</code>.</div>
        ) : (
          <>
            {tab === 'overview' && <SmmOverview brand={brand} competitors={competitors} posts={posts} plans={plans} team={team} go={go} open={openAgent} />}
            {tab === 'agents' && !team && <div className="smm-empty smm-empty--big" role="alert">Агентів ще не створено в базі. Потрібно застосувати міграцію <code>20261020000000_agent_framework.sql</code>.</div>}
            {tab === 'agents' && team && !agentRole && <SmmAgents team={team} open={openAgent} notify={notify} reloadTeam={reloadTeam} />}
            {tab === 'agents' && team && agentRole && <AgentPage role={agentRole} team={team} posts={posts} notify={notify} reloadTeam={reloadTeam} reloadAll={reload} back={() => go('agents')} open={openAgent} go={go} kick={kick} />}
            {tab === 'plan' && <SmmPlan {...common} onGenerate={() => openAgent('strategist')} onNew={() => setDialog({ kind: 'post', post: null })} onEdit={(post) => setDialog({ kind: 'post', post })} />}
            {tab === 'queue' && team && <SmmQueue {...common} plans={plans} postTasks={postTasks} team={team} kick={kick} onEdit={(post) => setDialog({ kind: 'post', post })} />}
            {tab === 'site' && <SmmSite settings={settings} audits={audits} siteStats={siteStats} openAgent={openAgent} notify={notify} reload={reload} />}
            {tab === 'brand' && <SmmBrand brand={brand} competitors={competitors} reports={reports} notify={notify} reload={reload} />}
          </>
        )}
      </div>

      {dialog?.kind === 'post' && (
        <PostDialog post={dialog.post} onClose={() => setDialog(null)} onSaved={(msg) => { setDialog(null); notify(msg); reload(); }} />
      )}
    </div>
  );
}
