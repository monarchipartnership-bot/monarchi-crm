import { agentState, chainStates } from '../../lib/agents/chain';
import { SMM_ROLES } from '../../lib/agents/smmTeam';

// Shared bits of the agent pages: what an agent's state is called, small formatters.
export const roleMeta = (role) => SMM_ROLES.find((r) => r.role === role) || { role, ready: true };

export function stateOf(agent, team) {
  const meta = roleMeta(agent.role);
  if (!meta.ready && !agent.enabled) return { key: 'wait', label: 'Чекає доступ', note: meta.readyNote };
  const st = agentState(agent, team.agents, team.links);
  if (st.state === 'blocked') return { key: 'blocked', label: 'Зупинено', note: `Вимкнено: ${st.blockedBy.name}`, blockedBy: st.blockedBy };
  if (st.state === 'off') return { key: 'off', label: 'Вимкнено' };
  return { key: 'on', label: 'Працює' };
}

export const allStates = (team) => chainStates(team.agents, team.links);

const STATE_CLASS = { on: 'ok', off: 'off', blocked: 'bad', wait: 'wait' };
export function AgentStateChip({ state }) {
  return <span className={'smm-state smm-state--' + STATE_CLASS[state.key]} title={state.note || undefined}>{state.label}</span>;
}

export const fmtDateTime = (iso) => (iso ? new Date(iso).toLocaleString('uk-UA', { timeZone: 'Europe/Kyiv', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—');

export const TASK_STATUS = { queued: ['У черзі', 'wait'], running: ['Виконується', 'next'], done: ['Готово', 'ok'], failed: ['Помилка', 'bad'], cancelled: ['Скасовано', 'off'] };
export const TASK_TYPE = { plan_week: 'План тижня', write: 'Текст поста', visual: 'Візуал', review: 'Контроль якості', audit: 'Аудит сайту', analyse: 'Аналіз конкурентів', report: 'Звіт', publish: 'Публікація' };
