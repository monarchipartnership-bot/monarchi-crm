import { Link } from 'react-router-dom';
import ActionIcon from '../common/ActionIcon';
import { AUTONOMY_LABEL, STATUS_LABEL, WAVE_LABEL } from '../../data/aiAgentsData';

// The read-only "what is this agent" modal — badges, breaks-into/wired-
// into/builds-on pills, the autonomy ladder, build notes. Single source of
// truth for markup that used to be copy-pasted twice: ConstellationTest.jsx
// (clicking an agent with no real tool yet, from the map or the Агенти
// catalog) and AdsInsightsAnalyst.jsx (its own "?" info button, once
// you're already inside the one agent that *does* have a tool). Entirely
// data-driven off `findAgentByKey()`'s shape — nothing here is specific to
// any one agent, which is exactly what makes it the first real piece of
// the Phase 2 Agent Workspace template (docs/ai-agents-roadmap.md §4.2).
//
// `showCta` controls the bottom "Запустити" / "Перейти" row — shown from
// the map/catalog (where clicking through IS how you'd reach the tool),
// hidden when opened from inside the tool's own workspace (you're already
// there). `showDescription` similarly defaults on for the map/catalog (the
// modal is the only place that text appears) but is turned off from
// inside a workspace, which already shows its own description in its own
// header — avoids saying the same sentence twice on one screen.
export default function AgentInfoModal({ agent, onClose, showCta = true, showDescription = true, style }) {
  return (
    <div className="agent-modal-backdrop" style={style} onClick={onClose}>
      <div className="agent-modal" onClick={(e) => e.stopPropagation()} style={{ '--dept-color': agent.color }}>
        <button type="button" className="agent-modal-close" onClick={onClose} aria-label="Закрити"><ActionIcon name="close" size={20} /></button>

        <div className="agent-modal-badges">
          <span className="agent-badge autonomy">{AUTONOMY_LABEL[agent.autonomyLevel]}</span>
          <span className={'agent-badge status status-' + agent.status}>{STATUS_LABEL[agent.status]}</span>
          {agent.wave && <span className={'agent-badge wave wave-' + agent.wave}>{WAVE_LABEL[agent.wave]}</span>}
        </div>
        <div className="agent-modal-breadcrumb">{agent.deptLabel} · {agent.subcatLabel}</div>
        <h2>{agent.name}</h2>
        {showDescription && <p className="agent-modal-desc">{agent.description}</p>}

        {agent.breaksInto?.length > 0 && (
          <div className="agent-modal-section">
            <h4>BREAKS INTO</h4>
            <div className="agent-pills">{agent.breaksInto.map((p) => <span key={p} className="agent-pill">{p}</span>)}</div>
          </div>
        )}
        {agent.wiredInto?.length > 0 && (
          <div className="agent-modal-section">
            <h4>WIRED INTO</h4>
            <div className="agent-pills">{agent.wiredInto.map((p) => <span key={p} className="agent-pill">{p}</span>)}</div>
          </div>
        )}
        {agent.buildsOn?.length > 0 && (
          <div className="agent-modal-section">
            <h4>BUILDS ON</h4>
            <div className="agent-pills">{agent.buildsOn.map((p) => <span key={p} className="agent-pill">{p}</span>)}</div>
          </div>
        )}
        {agent.whatItReplaces && (
          <div className="agent-modal-section">
            <h4>WHAT IT REPLACES</h4>
            <p>{agent.whatItReplaces}</p>
          </div>
        )}

        {agent.ladder && (
          <div className="agent-modal-section">
            <h4>THE LADDER</h4>
            <div className="agent-ladder">
              {[
                ['human-led', 'Human-led', agent.ladder.humanLed],
                ['human-assisted', 'Human-assisted', agent.ladder.humanAssisted],
                ['fully-autonomous', 'Fully autonomous', agent.ladder.fullyAutonomous],
              ].map(([lvl, label, text]) => (
                <div key={lvl} className={'ladder-row' + (agent.autonomyLevel === lvl ? ' current' : '')}>
                  <div className="ladder-row-label">{label}</div>
                  <div className="ladder-row-text">{text}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {agent.theHuman && (
          <div className="agent-modal-section">
            <h4>THE HUMAN</h4>
            <p>{agent.theHuman}</p>
          </div>
        )}
        {agent.buildNotes && (
          <div className="agent-modal-section">
            <h4>BUILD NOTES</h4>
            <p>{agent.buildNotes}</p>
          </div>
        )}

        {showCta && (
          <div className="agent-modal-cta">
            {agent.cta ? (
              <Link to={agent.cta.to} className="btn btn-p">{agent.cta.label} &rarr;</Link>
            ) : (
              <button type="button" className="btn" disabled title="Ще не реалізовано">Запустити (скоро)</button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
