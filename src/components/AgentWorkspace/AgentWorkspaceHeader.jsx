import ActionIcon from '../common/ActionIcon';

// Extracted from AdsInsightsAnalyst.jsx once DealHealthCheck existed to
// confirm this shape really is generic across two differently-shaped
// agents (a live chat tool vs. a run-and-review report) — see
// docs/ai-agents-roadmap.md §4.2. `orb` is the agent's own <AgentOrb/>
// element (color/icon vary per agent, nothing else about the header does).
// Info / back / close use the shared action icon sprite (action-info,
// action-back, action-close) like the rest of the AI section.
export default function AgentWorkspaceHeader({ orb, kicker, name, description, onClose, onShowInfo }) {
  return (
    <div className="agent-workspace-header">
      {orb}
      <div className="agent-workspace-header-text">
        <div className="agent-workspace-kicker">{kicker}</div>
        <h1>
          {name}
          {onShowInfo && (
            <button type="button" className="agent-workspace-info-btn" onClick={onShowInfo} aria-label="Детальніше про агента">
              <ActionIcon name="info" size={16} />
            </button>
          )}
        </h1>
        {description && <p className="agent-workspace-header-desc">{description}</p>}
      </div>
      <div className="agent-workspace-header-actions">
        <button type="button" className="agent-workspace-nav-pill" onClick={onClose}>
          <ActionIcon name="back" size={16} /> До карти системи
        </button>
        <button type="button" className="agent-workspace-close-btn" onClick={onClose} aria-label="Закрити">
          <ActionIcon name="close" size={20} />
        </button>
      </div>
    </div>
  );
}
