import { useState } from 'react';
import { findAgentByKey } from '../../data/aiAgentsData';
import AgentOrb from '../AgentOrb/AgentOrb';
import AgentWorkspaceHeader from './AgentWorkspaceHeader';
import AgentInfoModal from './AgentInfoModal';
import '../../styles/agentWorkspace.css';

// Shared full-viewport shell for every agent's own workspace — overlay,
// panel, glow, header (orb/kicker/name/description all pulled straight off
// `findAgentByKey(agentKey)`, so nothing about a specific agent needs
// repeating here), and the "?" info modal. `children` is that agent's own
// body (chat thread, report, whatever its shape is) — the one thing this
// shell deliberately doesn't templatize, since it's different by design
// per docs/ai-agents-roadmap.md §4.2.
export default function AgentWorkspaceShell({ agentKey, onClose, children }) {
  const [showInfo, setShowInfo] = useState(false);
  const agent = findAgentByKey(agentKey);

  return (
    <div className="agent-workspace-overlay">
      <div className="agent-workspace-panel">
        <div className="agent-workspace-panel-glow" />
        <AgentWorkspaceHeader
          orb={agent && <AgentOrb color={agent.color} icon={agent.icon} size={112} />}
          kicker={agent ? `AI-АГЕНТ · ${agent.deptLabel.toUpperCase()}` : 'AI-АГЕНТ'}
          name={agent?.name}
          description={agent?.description}
          onClose={onClose}
          onShowInfo={agent ? () => setShowInfo(true) : undefined}
        />
        {children}
      </div>

      {showInfo && agent && (
        <AgentInfoModal agent={agent} onClose={() => setShowInfo(false)} showCta={false} showDescription={false} style={{ zIndex: 70 }} />
      )}
    </div>
  );
}
