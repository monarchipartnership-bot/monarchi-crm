import { useState } from 'react';
import { moveClient, runForClient, updateClientLink } from '../../../lib/api/deptAgents';
import { kickQueue } from '../../../lib/api/agents';
import { fmtDateTime } from '../../Smm/agentUi';
import { MODE_LABEL } from './DeptAgentWindow';

// «Проєкти»: the clients of the agent in the order of its queue. Per client: on/off (stop / continue), the mode (auto, manual, paused), the order (priority),
// «hand over only after my OK». The order of the rows IS the priority: the agent works through the clients from the top.
export default function DeptProjects({ agent, team, clients, tasks, reload, notify }) {
  const [busy, setBusy] = useState(null);
  const run = (id, fn, okText) => async () => {
    setBusy(id);
    try { await fn(); if (okText) notify(okText); await reload(); } catch (e) { notify(e.message || 'Не вдалося виконати дію.', true); } finally { setBusy(null); }
  };
  const patch = (c, p, okText) => run(c.id, () => updateClientLink(c.id, p), okText);
  const runsAlone = ['creative_analyst', 'creative_scout'].includes(agent.role); // the others work on the requests of the client (started in the campaign), not on their own
  const clientName = (c) => c.project?.name || c.campaign?.name || `Операція ${c.campaign_id}`;

  return (
    <section className="smm-block">
      <h3>Проєкти агента ({clients.length})</h3>
      <p className="smm-muted">Агент працює з клієнтами зверху вниз. Порядок рядків це пріоритет. Нового клієнта підключає майстер створення операції.</p>
      {!clients.length && <p className="smm-muted">Клієнтів ще немає.</p>}
      {clients.length > 0 && (
        <div className="dpt-table-wrap">
          <table className="dpt-table">
            <thead><tr><th>#</th><th>Клієнт</th><th>Працює</th><th>Режим</th><th>Передавати далі після мого ОК</th><th>Останній запуск</th><th /></tr></thead>
            <tbody>
              {clients.map((c, i) => {
                const mine = tasks.filter((t) => t.campaign_id === c.campaign_id && (t.status === 'queued' || t.status === 'running')).length;
                return (
                  <tr key={c.id} className={c.enabled ? '' : 'is-off'}>
                    <td>
                      <span className="dpt-order">
                        <button type="button" aria-label="Вище в черзі" disabled={i === 0 || busy === c.id} onClick={run(c.id, () => moveClient(agent.id, c.id, 'up'))}>▲</button>
                        <b>{i + 1}</b>
                        <button type="button" aria-label="Нижче в черзі" disabled={i === clients.length - 1 || busy === c.id} onClick={run(c.id, () => moveClient(agent.id, c.id, 'down'))}>▼</button>
                      </span>
                    </td>
                    <td><b>{clientName(c)}</b><small>{c.campaign?.name}{mine ? ` · у черзі: ${mine}` : ''}</small></td>
                    <td>
                      <button type="button" className={'smm-btn' + (c.enabled ? '' : ' smm-btn--primary')} disabled={busy === c.id} onClick={patch(c, { enabled: !c.enabled }, c.enabled ? 'Клієнта зупинено для цього агента.' : 'Клієнта продовжено.')}>
                        {c.enabled ? 'Зупинити' : 'Продовжити'}
                      </button>
                    </td>
                    <td>
                      <select className="dpt-select" value={c.mode} disabled={busy === c.id} aria-label={`Режим для ${clientName(c)}`} onChange={(e) => patch(c, { mode: e.target.value }, `Режим: ${MODE_LABEL[e.target.value]}.`)()}>
                        {Object.entries(MODE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                      </select>
                    </td>
                    <td><input type="checkbox" checked={c.confirm_before_pass} disabled={busy === c.id} aria-label={`Передавати далі після ОК: ${clientName(c)}`} onChange={(e) => patch(c, { confirm_before_pass: e.target.checked }, e.target.checked ? 'Результат чекатиме вашого ОК перед передачею далі.' : 'Результат передаватиметься далі сам.')()} /></td>
                    <td>{c.last_run_at ? <>{fmtDateTime(c.last_run_at)} {c.last_status === 'problem' ? <span className="dpt-chip dpt-chip--bad">помилка</span> : null}</> : '—'}</td>
                    <td>
                      {runsAlone
                        ? <button type="button" className="smm-btn" disabled={busy === c.id || !c.enabled} onClick={run(c.id, async () => { await runForClient(agent.id, c.campaign_id); kickQueue().then(() => reload()).catch(() => {}); }, 'Аналіз запущено.')}>Запустити зараз</button>
                        : <small className="smm-muted">за запитом у операції</small>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="smm-muted">Режими: «Авто» агент сам береться за завдання клієнта; «Вручну» ланцюжок не запускає його для цього клієнта, це робите ви в запиті; «Пауза» агент не працює для клієнта.</p>
    </section>
  );
}
