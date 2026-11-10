import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../../contexts/AuthContext';
import { kickQueue } from '../../../lib/api/agents';
import { loadCampaignTeam } from '../../../lib/api/campaigns';
import { fetchDeptClientSetup } from '../../../lib/api/creatives';
import { AGENT_MODES, describeSchedule, modeOfAgent } from '../../../lib/agents/campaignCycles';
import { CAMPAIGN_ROLES } from '../../../lib/agents/campaignTeam';
import { creativeRoleDef } from '../../../lib/agents/creativeTeam';
import { agentRows } from '../../../lib/agents/aiProjects';
import { fmtDateTime } from '../../Smm/agentUi';
import AgentWindow from '../campaigns/AgentWindow';
import DeptAgentWindow from '../agents/DeptAgentWindow';
import { Ic } from './parts';

const MODE_TEXT = Object.fromEntries(AGENT_MODES.map((m) => [m.key, m.label]));
const TRIGGER_TEXT = { initial: 'один раз, під час запуску операції', upstream: 'після агентів, від яких залежить', schedule: 'за розкладом', request: 'коли приходить запит на креативи', manual: 'лише вручну' };
const shortOf = (role) => CAMPAIGN_ROLES.find((r) => r.role === role)?.short || creativeRoleDef(role)?.short || '';

// One agent as a card (owner's pick 2026-11-11): the colour bar and the ring of the medallion show the mode (green: works by itself, amber: asks to confirm, grey: paused).
export function Row({ a, onOpen }) {
  const tone = a.mode === 'paused' ? 'off' : a.mode === 'confirm' ? 'warn' : 'ok';
  return (
    <div className={'pcd-agent is-' + tone + (a.working ? '' : ' is-off')}>
      <div className="pcd-agent-top">
        <span className="pcd-agent-med" aria-hidden="true"><Ic n="bot" size={20} /></span>
        <div className="pcd-agent-main">
          <b>{a.name}</b>
          <small>{a.short}</small>
        </div>
      </div>
      <span className="ckp-chip">{a.modeLabel}</span>
      <span className="pcd-agent-when">{a.when || 'вмикається вручну'}</span>
      <span className="pcd-agent-last">{a.lastRunAt ? `останній запуск ${fmtDateTime(a.lastRunAt)}` : 'ще не працював'}</span>
      <button type="button" className="ckp-btn is-primary" onClick={() => onOpen(a)}><Ic n="pen" size={15} />Налаштувати</button>
    </div>
  );
}

// «Налаштування агентів» of the project card (owner, 2026-11-11): every agent that works on an operation of the project, each opened on its own settings
// (the fields for this client, the schedule, the prompts with versions, the history). The agents of the operation's own team and the agents of the creative
// department that are linked to it; the ones that do not work in this operation are listed below, so any of them can be switched on and set up too.
//   campaigns: the operations of the project (ag_campaigns rows)  currentId: the operation shown first
export default function AgentsSettings({ campaigns = [], currentId = null, notify, onChanged }) {
  const { email } = useAuth();
  const ops = useMemo(() => campaigns.filter((c) => c.status !== 'archived'), [campaigns]);
  const [opId, setOpId] = useState(currentId ?? ops[0]?.id ?? null);
  const op = ops.find((c) => c.id === opId) || ops[0] || null;
  const [team, setTeam] = useState(null);
  const [dept, setDept] = useState(null);
  const [open, setOpen] = useState(null); // { kind: 'campaign' | 'dept', role }
  const [showOff, setShowOff] = useState(false);

  const load = useCallback(async () => {
    if (!op) return;
    const [t, d] = await Promise.all([loadCampaignTeam(op, email), fetchDeptClientSetup(op, email).catch(() => null)]);
    setTeam(t); setDept(d);
  }, [op, email]);
  useEffect(() => { setTeam(null); setDept(null); load().catch((e) => notify?.(e.message || 'Не вдалося завантажити агентів.', true)); }, [load, notify]);
  const changed = useCallback(async () => { await load(); onChanged?.(); }, [load, onChanged]);

  const rows = useMemo(() => agentRows({ team, dept, shortOf, describeSchedule, modeOfAgent, modeText: MODE_TEXT, triggerText: TRIGGER_TEXT }), [team, dept]);
  const working = rows.filter((a) => a.working);
  const off = rows.filter((a) => !a.working);

  if (!ops.length) return <p className="ckp-empty-line">У проєкту немає операцій у роботі: агентів налаштовують в операції. Натисніть «Нова операція».</p>;
  return (
    <div className="pcd-agents">
      {ops.length > 1 && (
        <div className="opv-line pcd-agents-ops" role="tablist" aria-label="Операція">
          {ops.map((c) => <button key={c.id} type="button" role="tab" aria-selected={c.id === op.id} className={c.id === op.id ? 'is-on' : ''} onClick={() => setOpId(c.id)}>{c.name}</button>)}
        </div>
      )}
      <div className="ckp-sec-h"><h3>Агенти, які працюють над операцією «{op.name}»</h3><span className="ckp-chip">{working.length}</span></div>
      <p className="ckp-empty-line pcd-agents-lead">Кожен агент відкривається на власних налаштуваннях: поля для цього клієнта, розклад, промти з версіями, історія запитів і завдання. Зміни діють з наступного запуску агента.</p>
      {team === null && <div className="ckp-skel ckp-skel-wide" aria-hidden="true" />}
      {team && !working.length && <p className="ckp-empty-line">Зараз над цією операцією не працює жоден агент: усі вимкнені або на паузі. Увімкніть потрібних нижче.</p>}
      <div className="pcd-agent-list">{working.map((a) => <Row key={a.key} a={a} onOpen={setOpen} />)}</div>
      {team && off.length > 0 && (
        <>
          <button type="button" className="ckp-btn pcd-agents-more" aria-expanded={showOff} onClick={() => setShowOff((v) => !v)}><span className={showOff ? 'ckp-flip' : ''}><Ic n="chev" size={14} /></span>Не працюють у цій операції ({off.length})</button>
          {showOff && <div className="pcd-agent-list">{off.map((a) => <Row key={a.key} a={a} onOpen={setOpen} />)}</div>}
        </>
      )}
      {open?.kind === 'campaign' && team && (
        <AgentWindow role={open.role} team={team} initialSub="settings" setRole={(r) => team.agents.some((x) => x.role === r) && setOpen({ kind: 'campaign', role: r })}
          onClose={() => { setOpen(null); changed(); }} onChanged={changed} kick={() => kickQueue().then(changed).catch(() => {})} />
      )}
      {open?.kind === 'dept' && <DeptAgentWindow role={open.role} initialTab="settings" onClose={() => { setOpen(null); changed(); }} />}
    </div>
  );
}
