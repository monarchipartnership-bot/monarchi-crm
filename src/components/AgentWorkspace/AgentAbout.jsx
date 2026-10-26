import { Link } from 'react-router-dom';

const LADDER = [['human-led', 'Human-led', 'humanLed'], ['human-assisted', 'Human-assisted', 'humanAssisted'], ['fully-autonomous', 'Fully autonomous', 'fullyAutonomous']];
export const autonomyLabel = (level) => LADDER.find((l) => l[0] === level)?.[1] || level;

// «Про агента» of every agent of the catalogue, from its record in aiAgentsData (nothing here is specific to one agent): what it does, what it breaks
// into / is wired into / builds on, what it replaces, the autonomy ladder, the human's role, build notes. `showCta`: the «Запустити» row at the end.
export default function AgentAbout({ agent, showCta = false, showDescription = true }) {
  const pills = (title, items) => items?.length > 0 && (
    <section className="dwa-card">
      <h3>{title}</h3>
      <div className="dwa-pills">{items.map((p) => <span key={p} className="dwa-chip">{p}</span>)}</div>
    </section>
  );
  return (
    <div className="dwa-stack dwa-about">
      {showDescription && agent.description && <section className="dwa-card"><h3>Що робить</h3><p className="dwa-txt">{agent.description}</p></section>}
      <div className="dwa-about-grid">
        <div className="dwa-stack">
          {pills('Розбивається на', agent.breaksInto)}
          {pills('Підключається до', agent.wiredInto)}
          {pills('Спирається на', agent.buildsOn)}
          {agent.whatItReplaces && <section className="dwa-card"><h3>Що замінює</h3><p className="dwa-txt">{agent.whatItReplaces}</p></section>}
          {agent.theHuman && <section className="dwa-card"><h3>Роль людини</h3><p className="dwa-txt">{agent.theHuman}</p></section>}
        </div>
        <div className="dwa-stack">
          {agent.ladder && (
            <section className="dwa-card">
              <h3>Драбина автономності</h3>
              <div className="dwa-ladder">
                {LADDER.map(([lvl, label, key]) => (
                  <div key={lvl} className={agent.autonomyLevel === lvl ? 'is-cur' : ''}><b>{label}</b>{agent.ladder[key]}</div>
                ))}
              </div>
            </section>
          )}
          {agent.buildNotes && <section className="dwa-card"><h3>Нотатки зі збирання</h3><p className="dwa-txt">{agent.buildNotes}</p></section>}
        </div>
      </div>
      {showCta && (
        <div>
          {agent.cta ? <Link to={agent.cta.to} className="dwa-cta">{agent.cta.label}</Link> : <button type="button" className="dwa-btn" disabled title="Ще не реалізовано">Запустити (скоро)</button>}
        </div>
      )}
    </div>
  );
}
