import { useState } from 'react';
import { useConfirm } from '../../components/common/ConfirmDialog';
import { useAuth } from '../../contexts/AuthContext';
import { setAgentEnabled } from '../../lib/api/agents';
import { dependents } from '../../lib/agents/chain';
import { AgentStateChip, fmtDateTime, roleMeta, stateOf } from './agentUi';

// The chain of the SMM team, left to right: research -> plan -> production (text and visual in parallel) -> control -> publishing.
const STAGES = [
  { title: 'Дослідження', hint: 'Збирають дані для плану', roles: ['site_analyst', 'seo', 'competitors', 'social_analyst'] },
  { title: 'Планування', hint: 'План тижня і завдання', roles: ['strategist'] },
  { title: 'Виробництво', hint: 'Паралельно, на кожен пост', roles: ['copywriter', 'visual'] },
  { title: 'Контроль', hint: 'Перед вашим схваленням', roles: ['qc'] },
  { title: 'Публікація', hint: 'Після вашого схвалення', roles: ['publisher'] },
];

export function AgentSwitch({ agent, team, onChanged, notify, compact, variant }) {
  const { email } = useAuth();
  const [confirm, confirmDialog] = useConfirm();
  const [busy, setBusy] = useState(false);
  const meta = roleMeta(agent.role);

  async function toggle() {
    const turningOff = agent.enabled;
    if (turningOff) {
      const downstream = dependents(agent.id, team.links).map((id) => team.agents.find((a) => a.id === id)).filter((a) => a && a.enabled);
      const open = team.counts[agent.id];
      const lines = [];
      if (downstream.length) lines.push(`Разом з ним зупиняться: ${downstream.map((a) => a.name).join(', ')}. Їхні завдання лишаться в черзі й продовжаться, коли ви його увімкнете.`);
      if (open?.queued || open?.running) lines.push('Завдання цього агента в черзі чекатимуть.');
      if (lines.length && !(await confirm({ title: `Вимкнути «${agent.name}»?`, body: lines.join(' '), confirmLabel: 'Вимкнути' }))) return;
    }
    setBusy(true);
    try { await setAgentEnabled(agent, !agent.enabled, email); await onChanged(); notify(turningOff ? `«${agent.name}» вимкнено.` : `«${agent.name}» увімкнено.`); } catch (e) { notify(e.message || 'Не вдалося змінити.', true); } finally { setBusy(false); }
  }
  const disabled = busy || (!meta.ready && !agent.enabled);
  if (variant === 'power') {
    return (
      <>
        <button type="button" role="switch" aria-checked={agent.enabled} className={'smm-power' + (agent.enabled ? ' is-on' : '')} disabled={disabled} onClick={toggle} title={!meta.ready && !agent.enabled ? meta.readyNote : undefined}>
          <span className="smm-power-track" aria-hidden="true"><i /></span>
          <span>{busy ? '…' : agent.enabled ? 'Увімкнено' : 'Вимкнено'}</span>
        </button>
        {confirmDialog}
      </>
    );
  }
  return (
    <>
      <label className={'smm-switch' + (compact ? ' smm-switch--compact' : '')} title={!meta.ready && !agent.enabled ? meta.readyNote : undefined}>
        <input type="checkbox" checked={agent.enabled} disabled={disabled} onChange={toggle} aria-label={`${agent.name}: ${agent.enabled ? 'вимкнути' : 'увімкнути'}`} />
        {!compact && <span>{agent.enabled ? 'Увімкнено' : 'Вимкнено'}</span>}
      </label>
      {confirmDialog}
    </>
  );
}

export default function SmmAgents({ team, open, notify, reloadTeam }) {
  const byRole = new Map(team.agents.map((a) => [a.role, a]));
  const states = new Map(team.agents.map((a) => [a.id, stateOf(a, team)]));
  const working = team.agents.filter((a) => states.get(a.id).key === 'on').length;
  const counts = Object.values(team.counts);
  const queued = counts.reduce((s, c) => s + c.queued + c.running, 0);
  const failed = counts.reduce((s, c) => s + c.failed, 0);

  return (
    <>
      <div className="smm-stats">
        <div className="smm-stat"><b>{working} з {team.agents.length}</b><span>агентів працює</span></div>
        <div className="smm-stat"><b>{queued}</b><span>завдань у черзі або виконується</span></div>
        <div className={'smm-stat' + (failed ? ' smm-stat--bad' : '')}><b>{failed}</b><span>завдань із помилкою</span></div>
      </div>

      <p className="smm-muted">Агенти працюють ланцюжком: кожен передає завдання наступному. Якщо вимкнути агента, від якого залежать інші, вони теж зупиняться, а їхні завдання чекатимуть у черзі. Відкрийте агента, щоб побачити його промти, історію запитів і налаштування.</p>

      <div className="smm-chain" role="list">
        {STAGES.map((stage, i) => (
          <section key={stage.title} className="smm-stage" role="listitem" aria-label={stage.title}>
            <header><h3>{stage.title}</h3><span>{stage.hint}</span></header>
            <div className="smm-stage-cards">
              {stage.roles.map((role) => {
                const a = byRole.get(role);
                if (!a) return null;
                const st = states.get(a.id);
                const c = team.counts[a.id];
                return (
                  <article key={role} className={'smm-acard smm-acard--' + st.key}>
                    <header>
                      <button type="button" className="smm-acard-name" onClick={() => open(role)}>{a.name}</button>
                      <AgentSwitch agent={a} team={team} onChanged={reloadTeam} notify={notify} compact />
                    </header>
                    <p className="smm-acard-short">{roleMeta(role).short}</p>
                    <div className="smm-acard-meta">
                      <AgentStateChip state={st} />
                      {(c?.queued || c?.running) ? <span className="smm-pill">{c.queued + c.running} у черзі</span> : null}
                      {c?.failed ? <span className="smm-pill smm-pill--bad">{c.failed} помилок</span> : null}
                    </div>
                    {st.key === 'blocked' && <p className="smm-acard-note">Чекає: вимкнено «{st.blockedBy.name}»</p>}
                    {st.key === 'wait' && <p className="smm-acard-note">{st.note}</p>}
                    {a.last_run_at && <p className={'smm-acard-last' + (a.last_status === 'problem' ? ' smm-bad' : '')}>{fmtDateTime(a.last_run_at)}: {a.last_message || (a.last_status === 'ok' ? 'успішно' : 'помилка')}</p>}
                    <button type="button" className="smm-btn" onClick={() => open(role)}>Відкрити</button>
                  </article>
                );
              })}
            </div>
            {i < STAGES.length - 1 && <span className="smm-stage-arrow" aria-hidden="true">→</span>}
          </section>
        ))}
      </div>
    </>
  );
}
