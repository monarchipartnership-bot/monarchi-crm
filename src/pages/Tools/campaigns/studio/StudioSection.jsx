import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../../../../contexts/AuthContext';
import { kickQueue } from '../../../../lib/api/agents';
import { createRequest, fetchRequests, loadStudioTeam, startRequest } from '../../../../lib/api/studio';
import { STUDIO_ROLES } from '../../../../lib/agents/studioTeam';
import { fmtDateTime } from '../../../Smm/agentUi';
import AgentWindow from '../AgentWindow';
import RequestForm from './RequestForm';
import RequestWindow, { REQUEST_STATUS } from './RequestWindow';
import '../../../../styles/studio.css';

// «Креативна студія» of a campaign: the requests of the client (requirements + materials) and the chain of agents that turns each of them into
// a technical brief, ad texts and prompts for Higgsfield. The agents of the studio are opened from here (prompts, settings, history).
export default function StudioSection({ campaign, notify }) {
  const { email } = useAuth();
  const [team, setTeam] = useState(null);
  const [requests, setRequests] = useState(null);
  const [form, setForm] = useState(null); // null | { initial }
  const [openId, setOpenId] = useState(null);
  const [openRole, setOpenRole] = useState(null);

  const reload = useCallback(async () => {
    const [t, r] = await Promise.all([loadStudioTeam(campaign, email), fetchRequests(campaign.id)]);
    setTeam(t);
    setRequests(r);
  }, [campaign, email]);
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

  const open = requests?.find((r) => r.id === openId) || null;
  const agentsOn = (team?.agents || []).filter((a) => a.enabled).length;
  return (
    <section className="stu-section-wrap" aria-label="Креативна студія">
      <div className="cmp-live-head stu-head">
        <div>
          <h3>Креативна студія</h3>
          <span className="cmp-muted">Запит клієнта → аналіз клієнта й конкурентів → технічне завдання → тексти й запити для Higgsfield → ваше затвердження.</span>
        </div>
        <div className="stu-head-actions">
          <button type="button" className="cmp-btn" disabled={!team} onClick={() => setOpenRole(STUDIO_ROLES[0].role)}>Агенти студії{team ? ` (${agentsOn} з ${team.agents.length})` : ''}</button>
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
      {open && <RequestWindow request={open} team={team} onClose={() => setOpenId(null)} onChanged={() => reload().catch(() => {})} notify={notify} onCopy={(req) => { setOpenId(null); setForm({ initial: { ...req.brief, materials: req.materials } }); }} />}
      {openRole && team && team.agents.find((a) => a.role === openRole) && (
        <AgentWindow role={openRole} team={team} setRole={(r) => team.agents.find((a) => a.role === r) && setOpenRole(r)} onClose={() => setOpenRole(null)} onChanged={() => reload().catch(() => {})} kick={() => kickQueue().then(() => reload()).catch(() => {})} />
      )}
    </section>
  );
}
