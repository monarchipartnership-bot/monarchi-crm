import { useCallback, useEffect, useMemo, useState } from 'react';
import ActionIcon from '../../../components/common/ActionIcon';
import { fetchCampaigns, fetchClientsForCampaigns } from '../../../lib/api/campaigns';
import { supabase } from '../../../lib/supabaseClient';
import { PLATFORMS } from '../../../lib/agents/campaignTeam';
import { fmtDateTime } from '../../Smm/agentUi';
import CampaignPage, { CAMPAIGN_STATUS } from './CampaignPage';
import CreateCampaignWizard from './CreateCampaignWizard';
import '../../../styles/aiAgentsSection.css';
import '../../../styles/campaignsSection.css';

// «Кампанії»: the teams of agents that work on the campaigns of the clients. Create a campaign (a window with the chain of agents),
// the current campaigns, the archive.
export default function CampaignsSection() {
  const [campaigns, setCampaigns] = useState(null);
  const [projects, setProjects] = useState([]);
  const [agents, setAgents] = useState([]);
  const [failed, setFailed] = useState({});
  const [view, setView] = useState('current'); // current | archive
  const [wizard, setWizard] = useState(false);
  const [openId, setOpenId] = useState(null);
  const [toast, setToast] = useState(null);

  const notify = useCallback((text, isError = false) => { setToast({ text, isError }); setTimeout(() => setToast(null), isError ? 7000 : 4000); }, []);
  const reload = useCallback(async () => {
    const [c, p] = await Promise.all([fetchCampaigns(), fetchClientsForCampaigns().catch(() => [])]);
    setCampaigns(c); setProjects(p);
    if (c?.length) {
      const { data: ag } = await supabase.from('ag_agents').select('id, scope_id, enabled, last_run_at, last_status').eq('team', 'campaign');
      setAgents(ag || []);
      const ids = (ag || []).map((a) => a.id);
      const { data: t } = ids.length ? await supabase.from('ag_tasks').select('agent_id, status').in('agent_id', ids).in('status', ['failed', 'queued', 'running']) : { data: [] };
      const f = {};
      (t || []).forEach((x) => { const sc = (ag || []).find((a) => a.id === x.agent_id)?.scope_id; if (sc) (f[sc] ||= { failed: 0, open: 0 })[x.status === 'failed' ? 'failed' : 'open'] += 1; });
      setFailed(f);
    }
  }, []);
  useEffect(() => { reload(); }, [reload]);

  const projectOf = (id) => projects.find((p) => p.id === id);
  const shown = useMemo(() => (campaigns || []).filter((c) => (view === 'archive' ? c.status === 'archived' : c.status !== 'archived')), [campaigns, view]);
  const counts = { current: (campaigns || []).filter((c) => c.status !== 'archived').length, archive: (campaigns || []).filter((c) => c.status === 'archived').length };
  const open = campaigns?.find((c) => c.id === openId) || null;

  if (open) {
    return (
      <div className="ai-section cmp-section" role="region" aria-label="Кампанія">
        {toast && <div className={'cmp-toast' + (toast.isError ? ' is-error' : '')} role="status">{toast.text}</div>}
        <CampaignPage key={open.id} campaign={open} project={projectOf(open.project_id)} onBack={() => { setOpenId(null); reload(); }} onChanged={reload} notify={notify} />
      </div>
    );
  }

  return (
    <div className="ai-section cmp-section" role="region" aria-label="Кампанії клієнтів">
      {toast && <div className={'cmp-toast' + (toast.isError ? ' is-error' : '')} role="status">{toast.text}</div>}
      <div className="ai-section-head">
        <div className="ai-section-icon" aria-hidden="true"><ActionIcon name="generate" size={26} /></div>
        <div>
          <div className="ai-section-kicker">Команди агентів</div>
          <h1>Кампанії клієнтів</h1>
          <p>Для кожного клієнта з рекламним кабінетом у CRM створюється своя команда агентів: вона аналізує кабінети, пропонує оптимізацію й креативи, готує звіт і лист клієнту. Усе проходить через вашу перевірку.</p>
        </div>
      </div>

      <div className="ai-section-pills" role="tablist" aria-label="Розділи кампаній">
        <button type="button" className="ai-section-btn ai-section-btn-primary" onClick={() => setWizard(true)}><ActionIcon name="create" size={18} />Створити кампанію</button>
        <span className="agent-catalog-pill-sep" aria-hidden="true" />
        <button type="button" role="tab" aria-selected={view === 'current'} className={'ai-section-pill' + (view === 'current' ? ' active' : '')} onClick={() => setView('current')}>Поточні кампанії ({counts.current})</button>
        <button type="button" role="tab" aria-selected={view === 'archive'} className={'ai-section-pill' + (view === 'archive' ? ' active' : '')} onClick={() => setView('archive')}>Архів ({counts.archive})</button>
      </div>

      {campaigns === null && <div className="ai-section-empty">Не вдалося завантажити кампанії. Потрібно застосувати міграцію <code>20261023000000_ag_campaigns.sql</code>.</div>}
      {campaigns && !shown.length && (
        <div className="ai-section-empty">{view === 'archive' ? 'В архіві поки порожньо.' : 'Кампаній ще немає. Натисніть «Створити кампанію», оберіть клієнта й канали, і команда агентів буде готова за кілька хвилин.'}</div>
      )}
      <div className="cmp-cards">
        {shown.map((c) => {
          const p = projectOf(c.project_id);
          const mine = agents.filter((a) => a.scope_id === String(c.id));
          const on = mine.filter((a) => a.enabled).length;
          const last = mine.map((a) => a.last_run_at).filter(Boolean).sort().pop();
          const f = failed[String(c.id)] || {};
          const [label, tone] = CAMPAIGN_STATUS[c.status] || ['—', 'draft'];
          return (
            <button key={c.id} type="button" className="cmp-card" onClick={() => setOpenId(c.id)}>
              <span className="cmp-card-top"><span className="cmp-kicker">{p?.name || 'Проєкт'}</span><span className={'cmp-status cmp-status--' + tone}>{label}</span></span>
              <b className="cmp-card-name">{c.name}</b>
              <span className="cmp-chips-ro">{c.platforms.map((x) => <em key={x} style={{ '--c': PLATFORMS[x]?.color }}>{PLATFORMS[x]?.label || x}</em>)}</span>
              <span className="cmp-card-meta">
                <span>{on} з {mine.length} агентів увімкнено</span>
                <span>{last ? `остання робота ${fmtDateTime(last)}` : 'ще не працювала'}</span>
                {f.open ? <span>у черзі: {f.open}</span> : null}
                {f.failed ? <span className="cmp-bad">помилок: {f.failed}</span> : null}
              </span>
            </button>
          );
        })}
      </div>

      {wizard && (
        <CreateCampaignWizard
          onClose={() => { setWizard(false); reload(); }} notify={notify}
          onLaunched={(id) => { setWizard(false); reload().then(() => setOpenId(id)); }}
        />
      )}
    </div>
  );
}
