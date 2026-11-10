import { useMemo, useState } from 'react';
import { STATUS_TEXT } from './status';
import './AgentsPanel.css';

// «Агенти» of the map's side menu: every agent of the registry by department, with what it is doing now (the run states of the map) and the stage of the build; a click opens the
// agent (its workspace or page). Chat tools have no desk on the map but are agents too, so they are listed.
const RUN_TEXT = { working: 'працює', paused: 'чекає вас', waiting: 'готовий', inactive: 'не підключено', problem: 'помилка' };

export default function AgentsPanel({ agentDepts, runStates = {}, onOpen, onClose }) {
  const [q, setQ] = useState('');
  const groups = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return Object.entries(agentDepts || {})
      .map(([deptKey, d]) => ({
        deptKey, label: d.label, color: d.color,
        agents: (d.subcategories || []).flatMap((sc) => sc.agents.map((a) => ({ ...a, deptKey, deptLabel: d.label, color: d.color, subcatLabel: sc.label })))
          .filter((a) => !needle || a.name.toLowerCase().includes(needle)),
      }))
      .filter((g) => g.agents.length);
  }, [agentDepts, q]);
  return (
    <aside className="agp ai-panel" role="dialog" aria-label="Усі агенти" data-ai-safe>
      <header className="agp-head">
        <b>Усі агенти</b>
        <button type="button" className="agp-x" onClick={onClose} aria-label="Закрити">&times;</button>
      </header>
      <input className="agp-q" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Пошук агента…" aria-label="Пошук агента" />
      <div className="agp-list">
        {groups.length === 0 && <div className="agp-empty">Нічого не знайдено</div>}
        {groups.map((g) => (
          <section key={g.deptKey} className="agp-group">
            <h4>{g.label}<small>{g.agents.length}</small></h4>
            {g.agents.map((a) => (
              <button key={a.key} type="button" className="agp-row" onClick={() => onOpen(a)}>
                <i className={'agp-dot s-' + (runStates[a.key] || 'inactive')} aria-hidden="true" />
                <span className="agp-name">{a.name}</span>
                <span className="agp-st">{runStates[a.key] ? RUN_TEXT[runStates[a.key]] : STATUS_TEXT[a.status] || ''}</span>
              </button>
            ))}
          </section>
        ))}
      </div>
    </aside>
  );
}
