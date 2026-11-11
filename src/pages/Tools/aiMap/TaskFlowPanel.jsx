import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../../lib/supabaseClient';
import { KIND_LABEL, PATH_STATE_LABEL, buildTaskPath, carrierLabel, currentStep } from '../../../lib/agents/mapTasks';
import './TaskFlowPanel.css';

// The tasks of one carrier, for its path: a creative request → the tasks of the request; other open work → the tasks of the operation of the last two weeks.
async function fetchPath(car) {
  let q = supabase.from('ag_tasks').select('agent_id, status, output, created_at').order('created_at', { ascending: true }).limit(300);
  if (car.requestId) q = q.eq('request_id', car.requestId);
  else if (car.campaignId != null) q = q.eq('campaign_id', car.campaignId).gte('created_at', new Date(Date.now() - 14 * 86400000).toISOString());
  else return null; // an agent without an operation: there is no chain to show
  const [tasks, agents] = await Promise.all([q, supabase.from('ag_agents').select('id, role, name')]);
  if (tasks.error || agents.error) throw tasks.error || agents.error;
  return buildTaskPath({ tasks: tasks.data || [], agents: agents.data || [] });
}

// «Рух задач» (spec 2026-11-02, §2): the list of every active task of the map and the chain of the chosen one — which agents it passed, where it stands now, what is ahead.
// Choosing a row chooses its car on the map (and the other way round).
//   tasks: the carriers of the map (lib/agents/mapTasks.js)  selectedId / onSelect(id | null)  onFocus(agentKey): fly the camera there  onOpenOperation(campaignId)
export default function TaskFlowPanel({ tasks = [], selectedId = null, onSelect, onFocus, onOpenOperation }) {
  const [open, setOpen] = useState(false);
  const [path, setPath] = useState(undefined); // undefined = loading, null = no chain
  const car = useMemo(() => tasks.find((t) => t.id === selectedId) || null, [tasks, selectedId]);
  const carKey = car ? `${car.id}:${car.kind}:${car.count}` : '';

  useEffect(() => { if (selectedId) setOpen(true); }, [selectedId]); // a click on a car on the map opens the panel
  useEffect(() => {
    if (!car) { setPath(undefined); return undefined; }
    let alive = true;
    setPath(undefined);
    fetchPath(car).then((p) => { if (alive) setPath(p); }).catch(() => { if (alive) setPath(null); });
    return () => { alive = false; };
  }, [carKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const here = path ? currentStep(path) : -1;
  const attention = tasks.filter((t) => t.kind === 'failed' || t.kind === 'review').length;

  if (!open) {
    return (
      <button type="button" className={'tfp-pill' + (attention ? ' is-warn' : '')} onClick={() => setOpen(true)} aria-expanded="false" data-ai-safe>
        <i aria-hidden="true" />Рух задач<b>{tasks.length}</b>{attention > 0 && <em>{attention} чекають вас</em>}
      </button>
    );
  }
  return (
    <aside className="tfp ai-panel" role="region" aria-label="Рух задач" data-ai-safe>
      <header className="tfp-head">
        <b>Рух задач</b><span>{tasks.length ? `активних: ${tasks.length}` : 'зараз нічого не в роботі'}</span>
        <button type="button" className="tfp-x" onClick={() => { setOpen(false); onSelect?.(null); }} aria-label="Згорнути">&times;</button>
      </header>
      {!tasks.length && <p className="tfp-empty">Коли операція працює, її завдання зʼявляється тут і на мапі: видно, у якого агента воно зараз і що далі.</p>}
      {tasks.length > 0 && (
        <ul className="tfp-list">
          {tasks.map((t) => (
            <li key={t.id}>
              <button type="button" className={'tfp-row k-' + t.kind + (t.id === selectedId ? ' is-on' : '')} aria-pressed={t.id === selectedId} onClick={() => { onSelect?.(t.id === selectedId ? null : t.id); if (t.id !== selectedId) onFocus?.(t.agentKey); }}>
                <i aria-hidden="true" /><span>{carrierLabel(t)}</span><small>{KIND_LABEL[t.kind]}</small>
              </button>
            </li>
          ))}
        </ul>
      )}
      {car && (
        <div className="tfp-path">
          <div className="tfp-path-head"><b>{car.project || car.campaign || 'Завдання'}</b></div>
          {path === undefined && <p className="tfp-empty">Завантажую шлях…</p>}
          {path === null && <p className="tfp-empty">Це завдання агента без операції: ланцюжка немає.</p>}
          {path && !path.length && <p className="tfp-empty">Кроків ще немає.</p>}
          {path && path.length > 0 && (
            <ol className="tfp-steps">
              {path.map((s, i) => (
                <li key={s.role + i} className={'s-' + s.state + (i === here ? ' is-here' : '')}>
                  <i aria-hidden="true" />
                  <button type="button" disabled={!s.agentKey} onClick={() => s.agentKey && onFocus?.(s.agentKey)} title={s.agentKey ? 'Показати на мапі' : undefined}>{s.name}</button>
                  <small>{i === here ? `зараз тут · ${PATH_STATE_LABEL[s.state]}` : PATH_STATE_LABEL[s.state]}</small>
                </li>
              ))}
            </ol>
          )}
          <div className="tfp-actions">
            <button type="button" className="tfp-btn" onClick={() => onFocus?.(car.agentKey)}>Показати на мапі</button>
            {car.campaignId != null && <button type="button" className="tfp-btn is-primary" onClick={() => onOpenOperation?.(car.campaignId)}>Відкрити операцію</button>}
          </div>
        </div>
      )}
    </aside>
  );
}
