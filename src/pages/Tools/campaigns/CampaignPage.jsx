import { useCallback, useEffect, useMemo, useState } from 'react';
import ActionIcon from '../../../components/common/ActionIcon';
import { useConfirm } from '../../../components/common/ConfirmDialog';
import { useAuth } from '../../../contexts/AuthContext';
import { kickQueue } from '../../../lib/api/agents';
import { deleteCampaign, fetchLatestOutputs, loadCampaignTeam, updateCampaign } from '../../../lib/api/campaigns';
import { agentState } from '../../../lib/agents/chain';
import { participants, PLATFORMS } from '../../../lib/agents/campaignTeam';
import Markdown from '../../Smm/Markdown';
import { fmtDateTime } from '../../Smm/agentUi';
import AgentWindow from './AgentWindow';
import ChainDiagram from './ChainDiagram';

export const CAMPAIGN_STATUS = { draft: ['Чернетка', 'draft'], active: ['Працює', 'active'], paused: ['На паузі', 'paused'], archived: ['В архіві', 'archived'] };

// One live campaign: the chain with the state of every agent, the agents' latest reports, pause / archive.
export default function CampaignPage({ campaign: initial, project, onBack, onChanged, notify }) {
  const { email } = useAuth();
  const [confirm, confirmDialog] = useConfirm();
  const [campaign, setCampaign] = useState(initial);
  const [team, setTeam] = useState(null);
  const [outputs, setOutputs] = useState({});
  const [openRole, setOpenRole] = useState(null);
  const [report, setReport] = useState(null);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    const t = await loadCampaignTeam(campaign, email);
    setTeam(t);
    setOutputs(await fetchLatestOutputs(t.agents.map((a) => a.id)));
  }, [campaign, email]);
  useEffect(() => { reload().catch((e) => notify(e.message || 'Не вдалося завантажити кампанію.', true)); }, [reload, notify]);

  const working = team ? Object.values(team.counts).some((c) => c.queued || c.running) : false;
  useEffect(() => {
    if (!working) return undefined;
    const t = setInterval(() => { reload().catch(() => {}); }, 8000);
    return () => clearInterval(t);
  }, [working, reload]);

  const states = useMemo(() => {
    if (!team) return {};
    const out = {};
    team.agents.forEach((a) => {
      const st = agentState(a, team.agents, team.links);
      out[a.role] = campaign.status === 'paused' ? 'paused' : st.state;
    });
    return out;
  }, [team, campaign.status]);
  const active = useMemo(() => new Set(participants(campaign.platforms).map((r) => r.role)), [campaign.platforms]);
  const byRole = useMemo(() => new Map((team?.agents || []).map((a) => [a.role, a])), [team]);

  async function setStatus(status, okText) {
    setBusy(true);
    try { const c = await updateCampaign(campaign.id, { status }); setCampaign(c); onChanged(); notify(okText); if (status === 'active') kickQueue().catch(() => {}); } catch (e) { notify(e.message || 'Не вдалося змінити.', true); } finally { setBusy(false); }
  }
  async function remove() {
    if (!(await confirm({ title: `Видалити кампанію «${campaign.name}»?`, body: 'Буде видалено її агентів, промти, завдання й історію запитів. Це не можна скасувати.', confirmLabel: 'Видалити', danger: true }))) return;
    setBusy(true);
    try { await deleteCampaign(campaign.id); onChanged(); onBack(); notify('Кампанію видалено.'); } catch (e) { notify(e.message || 'Не вдалося видалити.', true); setBusy(false); }
  }

  const [label, tone] = CAMPAIGN_STATUS[campaign.status] || ['—', 'draft'];
  const reports = (team?.agents || []).filter((a) => outputs[a.id]);
  const failedTotal = team ? Object.values(team.counts).reduce((s, c) => s + c.failed, 0) : 0;

  return (
    <div className="cmp-page">
      <div className="cmp-page-head">
        <button type="button" className="cmp-btn" onClick={onBack}><ActionIcon name="back" size={18} />Усі кампанії</button>
        <div className="cmp-page-title">
          <span className="cmp-kicker">{project?.name || 'Проєкт'}{project?.client ? ` · ${project.client}` : ''}</span>
          <h2>{campaign.name}</h2>
          <div className="cmp-chips-ro">{campaign.platforms.map((p) => <em key={p} style={{ '--c': PLATFORMS[p]?.color }}>{PLATFORMS[p]?.label || p}</em>)}<span className={'cmp-status cmp-status--' + tone}>{label}</span></div>
        </div>
        <div className="cmp-page-actions">
          {campaign.status === 'active' && <button type="button" className="cmp-btn" disabled={busy} onClick={() => setStatus('paused', 'Кампанію призупинено: усі її агенти зупинені.')}>Призупинити</button>}
          {campaign.status === 'paused' && <button type="button" className="cmp-btn cmp-btn--primary" disabled={busy} onClick={() => setStatus('active', 'Кампанію відновлено.')}>Відновити</button>}
          {campaign.status !== 'archived' && campaign.status !== 'draft' && <button type="button" className="cmp-btn" disabled={busy} onClick={() => setStatus('archived', 'Кампанію перенесено в архів.')}>В архів</button>}
          {campaign.status === 'archived' && <button type="button" className="cmp-btn" disabled={busy} onClick={() => setStatus('paused', 'Кампанію повернуто з архіву на паузу.')}>Повернути з архіву</button>}
          {(campaign.status === 'draft' || campaign.status === 'archived' || campaign.status === 'paused') && <button type="button" className="cmp-btn cmp-btn--danger" disabled={busy} onClick={remove}>Видалити</button>}
        </div>
      </div>

      {campaign.status === 'draft' && <p className="cmp-note">Це чернетка: кампанію створено, але не запущено. Видаліть її або створіть заново через «Створити кампанію».</p>}
      {failedTotal > 0 && <p className="cmp-warnbox" role="status"><b>Є завдання з помилкою ({failedTotal}).</b> Відкрийте агента зі статусом помилки, вкладка «Завдання», і натисніть «Повторити».</p>}

      <section className="cmp-live">
        <div className="cmp-live-head"><h3>Схема агентів кампанії</h3><span className="cmp-muted">Натисніть агента, щоб відкрити його промти, налаштування й історію.</span></div>
        <div className="cmp-scheme"><ChainDiagram active={active} states={states} onSelect={(role) => byRole.get(role) && setOpenRole(role)} selected={openRole} /></div>
        <p className="cmp-legend"><i style={{ background: '#5FE0A1' }} />працює <i style={{ background: '#8D7A93' }} />вимкнено <i style={{ background: '#FF7A9A' }} />зупинено (залежить від вимкненого) <i style={{ background: '#F2B94B' }} />кампанія на паузі</p>
      </section>

      <section className="cmp-reports">
        <h3>Останні результати агентів</h3>
        {!reports.length && <p className="cmp-muted">Результатів ще немає. Вони зʼявляться, коли агенти закінчать першу роботу.</p>}
        <div className="cmp-report-grid">
          {reports.map((a) => (
            <article key={a.id} className="cmp-report-card">
              <header><b>{a.name}</b><span>{fmtDateTime(outputs[a.id].finished_at)}</span></header>
              <p>{outputs[a.id].output.summary}</p>
              <button type="button" className="cmp-btn" onClick={() => setReport(a)}>Відкрити звіт</button>
            </article>
          ))}
        </div>
      </section>

      {report && outputs[report.id] && (
        <div className="cmp-reportwin-wrap" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) setReport(null); }}>
          <div className="cmp-reportwin" role="dialog" aria-modal="true" aria-label={'Звіт: ' + report.name}>
            <header><h3>{report.name}</h3><button type="button" className="cmp-x" onClick={() => setReport(null)} aria-label="Закрити"><ActionIcon name="close" size={20} /></button></header>
            <Markdown text={outputs[report.id].output.text} />
            {outputs[report.id].output.failedInputs?.length > 0 && <p className="cmp-warnbox">Не завантажились дані: {outputs[report.id].output.failedInputs.join('; ')}</p>}
          </div>
        </div>
      )}

      {openRole && team && byRole.get(openRole) && (
        <AgentWindow role={openRole} team={team} setRole={(r) => byRole.get(r) && setOpenRole(r)} onClose={() => setOpenRole(null)} onChanged={reload} kick={() => kickQueue().then(reload).catch(() => {})} />
      )}
      {confirmDialog}
    </div>
  );
}
