import { setLinkRequired } from '../../lib/api/agents';
import { roleMeta, stateOf } from './agentUi';

// Pieces of the agent card: the status light and the small scheme of the agent's links.

// The light: green = works, red = something is wrong, grey = not active. `extraProblem` is a text when the agent itself reports a problem
// the framework does not know about (for the website analyst: Google is not connected).
export function healthOf(agent, team, extraProblem = '') {
  const st = stateOf(agent, team);
  if (st.key === 'wait') return { key: 'off', label: 'Не активний', note: st.note || 'Чекає на доступ, без якого не може працювати.' };
  if (st.key === 'blocked') return { key: 'bad', label: 'Проблема в роботі', note: `Зупинено, бо вимкнено «${st.blockedBy.name}», від якого агент залежить.` };
  if (st.key === 'off') return { key: 'off', label: 'Не активний', note: 'Агент вимкнено: за розкладом він не запускається.' };
  if (extraProblem) return { key: 'bad', label: 'Проблема в роботі', note: extraProblem };
  if (agent.last_status === 'problem') return { key: 'bad', label: 'Проблема в роботі', note: agent.last_message || 'Останній запуск завершився з помилкою.' };
  return { key: 'ok', label: 'Працює', note: 'Агент увімкнено, останній запуск без помилок.' };
}

export function HealthLight({ health, label = false }) {
  return (
    <span className={'smm-lightbox smm-lightbox--' + health.key} title={health.note} role="img" aria-label={`${health.label}. ${health.note}`}>
      <i className="smm-light" aria-hidden="true" />
      {label && <b>{health.label}</b>}
    </span>
  );
}

const DAYS = ['', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'нд'];
const START_NOTE = {
  site_analyst: 'сам читає Google Analytics і Search Console',
  seo: 'сам читає публічні сторінки сайту',
  competitors: 'сам читає публічні сайти конкурентів',
};

function startNote(agent) {
  const how = START_NOTE[agent.role];
  const when = agent.schedule?.weekday ? `за розкладом (${DAYS[agent.schedule.weekday]} ${agent.schedule.time})` : 'вручну або за завданням';
  return `Це початок ланцюжка: агент ${how ? `${how} і ` : ''}стартує ${when}, тому йому не потрібні дані від інших агентів.`;
}

// «Звʼязки в ланцюжку» as a small scheme: who feeds the agent → the agent → whom it hands over to.
// A box opens that agent; «обовʼязковий» means the next agent stops when this one is switched off.
export function ChainMini({ agent, team, notify, reloadTeam, open }) {
  const byId = new Map(team.agents.map((a) => [a.id, a]));
  const up = team.links.filter((l) => l.to_agent_id === agent.id);
  const down = team.links.filter((l) => l.from_agent_id === agent.id);
  const meOn = stateOf(agent, team).key === 'on';

  async function toggle(link, required) {
    try { await setLinkRequired(link.id, required); await reloadTeam(); notify(required ? 'Звʼязок зроблено обовʼязковим: якщо агент вимкнений, цей теж зупиняється.' : 'Звʼязок необовʼязковий: агент працює й без цих даних.'); } catch (e) { notify(e.message || 'Не вдалося змінити.', true); }
  }

  const node = (link, other) => {
    const st = stateOf(other, team);
    const h = healthOf(other, team);
    const lit = st.key === 'on' && meOn;
    return (
      <li key={link.id} className={'acm-item' + (lit ? ' is-lit' : '')}>
        <button type="button" className={'acm-node' + (st.key === 'on' ? '' : ' is-faded')} onClick={() => open(other.role)}>
          <i className={'smm-light smm-light--' + h.key} aria-hidden="true" />
          <span>{other.name}</span>
          <small>{roleMeta(other.role).short || ''}</small>
        </button>
        <label className="smm-check acm-req" title="Якщо агент у цьому звʼязку вимкнений, залежний від нього теж зупиняється">
          <input type="checkbox" checked={link.required} onChange={(e) => toggle(link, e.target.checked)} /> обовʼязковий
        </label>
      </li>
    );
  };

  return (
    <div className="acm" role="group" aria-label="Схема звʼязків агента">
      <div className="acm-side">
        <h5>Отримує дані від</h5>
        {up.length ? <ul className="acm-list">{up.map((l) => node(l, byId.get(l.from_agent_id)))}</ul> : <p className="acm-empty">{startNote(agent)}</p>}
      </div>
      <span className={'acm-arrow' + (up.length && meOn ? ' is-lit' : '')} aria-hidden="true" />
      <div className="acm-me"><b>{agent.name}</b><small>{roleMeta(agent.role).short || ''}</small></div>
      <span className={'acm-arrow' + (down.length && meOn ? ' is-lit' : '')} aria-hidden="true" />
      <div className="acm-side">
        <h5>Передає далі</h5>
        {down.length ? <ul className="acm-list">{down.map((l) => node(l, byId.get(l.to_agent_id)))}</ul> : <p className="acm-empty">Це кінець ланцюжка: результат лишається в CRM (у «Завданнях» і звіті), далі агент нікому не передає.</p>}
      </div>
    </div>
  );
}
