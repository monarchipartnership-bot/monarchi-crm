import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { fetchBrand, fetchCompetitorReports, fetchCompetitors, fetchPosts, BRAND_FIELDS } from '../../lib/api/smm';
import '../../styles/projectWorkspace.css'; // the shared confirmation window (useConfirm) lives in this sheet
import '../../styles/smmPage.css';
import SmmBrand from './SmmBrand';
import { GenerateDialog, PostDialog } from './SmmDialogs';
import SmmOverview from './SmmOverview';
import SmmPlan from './SmmPlan';
import SmmQueue from './SmmQueue';

const TABS = [
  { key: 'overview', label: 'Огляд' },
  { key: 'plan', label: 'Контент-план' },
  { key: 'queue', label: 'Черга схвалення' },
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
  const [missing, setMissing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [dialog, setDialog] = useState(null); // null | { kind: 'post', post } | { kind: 'generate' }
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);
  const tabRefs = useRef({});

  const reload = useCallback(async () => {
    const [b, c, p, r] = await Promise.all([fetchBrand(), fetchCompetitors(), fetchPosts(), fetchCompetitorReports()]);
    setReports(r);
    setBrand(b.brand); setCompetitors(c); setPosts(p.posts); setMissing(b.missing || p.missing); setLoading(false);
  }, []);
  useEffect(() => { reload(); }, [reload]);
  useEffect(() => () => clearTimeout(toastTimer.current), []);

  const notify = useCallback((text, isError = false) => {
    clearTimeout(toastTimer.current);
    setToast({ text, isError });
    toastTimer.current = setTimeout(() => setToast(null), isError ? 7000 : 4000);
  }, []);
  const go = (key) => setParams(key === 'overview' ? {} : { tab: key }, { replace: false });

  function onKeyTabs(e) {
    const i = TABS.findIndex((t) => t.key === tab);
    const next = e.key === 'ArrowRight' ? (i + 1) % TABS.length : e.key === 'ArrowLeft' ? (i + TABS.length - 1) % TABS.length : e.key === 'Home' ? 0 : e.key === 'End' ? TABS.length - 1 : null;
    if (next == null) return;
    e.preventDefault(); go(TABS[next].key); tabRefs.current[TABS[next].key]?.focus();
  }

  const brandFilled = BRAND_FIELDS.some((f) => (brand?.[f.key] || '').trim());
  const common = { posts, notify, reload };

  return (
    <div className="smm-page" data-dd="plum">
      <div className="smm-tabs" role="tablist" aria-label="Розділи SMM" onKeyDown={onKeyTabs}>
        {TABS.map((t) => (
          <button
            key={t.key} ref={(el) => { tabRefs.current[t.key] = el; }} type="button" role="tab" id={'smm-tab-' + t.key} aria-selected={tab === t.key} aria-controls="smm-panel"
            tabIndex={tab === t.key ? 0 : -1} className={'smm-tab' + (tab === t.key ? ' is-active' : '')} onClick={() => go(t.key)}
          >
            {t.label}
            {t.key === 'queue' && posts.some((p) => p.status === 'needs_review') && <span className="smm-tab-badge">{posts.filter((p) => p.status === 'needs_review').length}</span>}
          </button>
        ))}
      </div>

      <div className="smm-sheet" id="smm-panel" role="tabpanel" aria-labelledby={'smm-tab-' + tab}>
        {toast && <div className={'smm-toast' + (toast.isError ? ' is-error' : '')} role="status">{toast.text}</div>}
        {loading ? <p className="smm-muted">Завантаження…</p> : missing ? (
          <div className="smm-empty smm-empty--big" role="alert">Таблиці SMM ще не створено в базі. Потрібно застосувати міграцію <code>20261016000000_smm.sql</code>.</div>
        ) : (
          <>
            {tab === 'overview' && <SmmOverview brand={brand} competitors={competitors} posts={posts} go={go} onGenerate={() => setDialog({ kind: 'generate' })} />}
            {tab === 'plan' && <SmmPlan {...common} onGenerate={() => setDialog({ kind: 'generate' })} onNew={() => setDialog({ kind: 'post', post: null })} onEdit={(post) => setDialog({ kind: 'post', post })} />}
            {tab === 'queue' && <SmmQueue {...common} onEdit={(post) => setDialog({ kind: 'post', post })} />}
            {tab === 'brand' && <SmmBrand brand={brand} competitors={competitors} reports={reports} notify={notify} reload={reload} />}
          </>
        )}
      </div>

      {dialog?.kind === 'post' && (
        <PostDialog post={dialog.post} onClose={() => setDialog(null)} onSaved={(msg) => { setDialog(null); notify(msg); reload(); }} />
      )}
      {dialog?.kind === 'generate' && (
        <GenerateDialog
          brandFilled={brandFilled} onClose={() => setDialog(null)}
          onDone={(r) => { setDialog(null); notify(`Готово: ${r.count} постів чекають на вашу перевірку.`); reload(); go('queue'); }}
        />
      )}
    </div>
  );
}
