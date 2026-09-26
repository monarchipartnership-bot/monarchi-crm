const BACK_ICON = '<svg viewBox="0 0 24 24"><path d="m15 18-6-6 6-6"/></svg>';
const CLOSE_ICON = '<svg viewBox="0 0 24 24"><path d="M18 6 6 18M6 6l12 12"/></svg>';
const INFO_ICON = '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><path d="M12 8h.01"/></svg>';

// Extracted from AdsInsightsAnalyst.jsx once DealHealthCheck existed to
// confirm this shape really is generic across two differently-shaped
// agents (a live chat tool vs. a run-and-review report) — see
// docs/ai-agents-roadmap.md §4.2. `orb` is the agent's own <AgentOrb/>
// element (color/icon vary per agent, nothing else about the header does).
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
              <span dangerouslySetInnerHTML={{ __html: INFO_ICON }} />
            </button>
          )}
        </h1>
        {description && <p className="agent-workspace-header-desc">{description}</p>}
      </div>
      <div className="agent-workspace-header-actions">
        <button type="button" className="agent-workspace-nav-pill" onClick={onClose}>
          <span dangerouslySetInnerHTML={{ __html: BACK_ICON }} /> До карти системи
        </button>
        <button type="button" className="agent-workspace-close-btn" onClick={onClose} aria-label="Закрити">
          <span dangerouslySetInnerHTML={{ __html: CLOSE_ICON }} />
        </button>
      </div>
    </div>
  );
}
