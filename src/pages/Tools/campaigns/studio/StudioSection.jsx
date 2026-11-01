import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../../../../contexts/AuthContext';
import { kickQueue } from '../../../../lib/api/agents';
import { createRequest, fetchRequests, loadCreativeTeam, saveCreativeSetup, startRequest } from '../../../../lib/api/creatives';
import { CREATIVE_ROLES, creativeSetupOf } from '../../../../lib/agents/creativeTeam';
import { fmtDateTime } from '../../../Smm/agentUi';
import AgentWindow from '../AgentWindow';
import RequestForm from './RequestForm';
import RequestWindow, { REQUEST_STATUS } from './RequestWindow';
import '../../../../styles/studio.css';

// «Креативна студія» of a campaign: the requests of the client (requirements + materials) and the chain of agents that turns each of them into
// a technical brief, ad texts and prompts for Higgsfield. The agents of the studio are opened from here (prompts, settings, history).
export default function StudioSection({ campaign, notify, onCampaign = null, autoOpenForm = false }) {
  const { email } = useAuth();
  const [team, setTeam] = useState(null);
  const [requests, setRequests] = useState(null);
  const [form, setForm] = useState(null); // null | { initial }
  const [openId, setOpenId] = useState(null);
  const [openRole, setOpenRole] = useState(null);

  const reload = useCallback(async () => {
    const [t, r] = await Promise.all([loadCreativeTeam(campaign, email), fetchRequests(campaign.id)]);
    setTeam(t);
    setRequests(r);
  }, [campaign, email]);
  const autoOpened = useRef(false);
  useEffect(() => { if (autoOpenForm && team && requests && !autoOpened.current) { autoOpened.current = true; setForm({ initial: null }); } }, [autoOpenForm, team, requests]); // «Тільки креативи» was just created: the form of the first request opens at once
  useEffect(() => { reload().catch((e) => notify(e.message || 'Не вдалося завантажити студію. Перевірте, що застосовано міграцію 20261040000000.', true)); }, [reload, notify]);

  async function save(values, start) {
    const row = await createRequest(campaign.id, values, email);
    setForm(null);
    await reload();
    setOpenId(row.id);
    if (start) {
      await startRequest(row.id);
      notify('Запит запущено: агенти працюють.');
      kickQueue(() => { reload().catch(() => {}); }).catch(() => {});
    } else notify('Запит збережено як чернетку.');
  }

  // the wizard left the department out for this client: a note and a button, nothing else
  const setup = creativeSetupOf(campaign);
  async function connect() {
    try { const row = await saveCreativeSetup(campaign, { enabled: true, roles: CREATIVE_ROLES.map((r) => r.role) }, email); onCampaign?.(row); notify('Відділ креативів підключено до клієнта.'); } catch (e) { notify(e.message || 'Не вдалося підключити відділ креативів.', true); }
  }
  if (setup.configured && !setup.enabled) {
    return (
      <section className="stu-section-wrap" aria-label="Креативна студія">
        <div className="cmp-live-head stu-head">
          <div><h3>Відділ креативів</h3><span className="cmp-muted">Для цього клієнта відділ креативів не підключено: запитів на креативи немає. Підключення нічого не коштує, поки ви не створите запит.</span></div>
          <button type="button" className="cmp-btn cmp-btn--primary" disabled={!onCampaign} onClick={connect}>Підключити відділ креативів</button>
        </div>
      </section>
    );
  }

  const open = requests?.find((r) => r.id === openId) || null;
  const agentsOn = (team?.agents || []).filter((a) => a.enabled).length;
  return (
    <section className="stu-section-wrap" aria-label="Креативна студія">
      <div className="cmp-live-head stu-head">
        <div>
          <h3>Відділ креативів</h3>
          <span className="cmp-muted">Запит клієнта → Агент креативний стратег → Агент по ТЗ → Агент копірайтер й Агент креативщик → Агент перевірки якості → ваше затвердження.</span>
        </div>
        <div className="stu-head-actions">
          <button type="button" className="cmp-btn" disabled={!team} onClick={() => setOpenRole(CREATIVE_ROLES.find((r) => r.entry).role)}>Агенти відділу{team ? ` (${agentsOn} з ${team.agents.length})` : ''}</button>
          <button type="button" className="cmp-btn cmp-btn--primary" disabled={!team || ['paused', 'archived'].includes(campaign.status)} onClick={() => setForm({ initial: null })}>Новий запит</button>
        </div>
      </div>
      {['paused', 'archived'].includes(campaign.status) && <p className="cmp-note">Кампанія на паузі або в архіві: студія не працює.</p>}

      {requests && !requests.length && <p className="cmp-muted">Запитів ще немає. Натисніть «Новий запит»: опишіть задачу клієнта й додайте його матеріали.</p>}
      <div className="stu-list">
        {(requests || []).map((r) => {
          const [label, tone] = REQUEST_STATUS[r.status] || ['—', 'draft'];
          return (
            <button key={r.id} type="button" className="stu-item" onClick={() => setOpenId(r.id)}>
              <span className="stu-item-title">{r.title}</span>
              <span className={'cmp-status cmp-status--' + tone}>{label}</span>
              <span className="stu-item-meta">{fmtDateTime(r.created_at)}{r.creatives ? ` · креативів: ${r.creatives}` : ''}{(r.materials || []).length ? ` · матеріалів: ${r.materials.length}` : ''}</span>
              {r.status === 'problem' && r.error && <span className="stu-item-err">{r.error}</span>}
            </button>
          );
        })}
      </div>

      {form && <RequestForm campaign={campaign} initial={form.initial} onClose={() => setForm(null)} onSave={save} />}
      {open && <RequestWindow campaignName={campaign.name} request={open} team={team} onClose={() => setOpenId(null)} onChanged={() => reload().catch(() => {})} notify={notify} onCopy={(req) => { setOpenId(null); setForm({ initial: { ...req.brief, materials: req.materials } }); }} />}
      {openRole && team && team.agents.find((a) => a.role === openRole) && (
        <AgentWindow role={openRole} team={team} setRole={(r) => team.agents.find((a) => a.role === r) && setOpenRole(r)} onClose={() => setOpenRole(null)} onChanged={() => reload().catch(() => {})} kick={() => kickQueue().then(() => reload()).catch(() => {})} />
      )}
    </section>
  );
}
