import { useEffect, useState } from 'react';
import { findAgentByKey } from '../../data/aiAgentsData';
import AgentWindowFrame from './AgentWindowFrame';
import AgentAbout, { autonomyLabel } from './AgentAbout';
import { STATUS_TEXT } from '../../pages/Tools/aiMap/status';

const SEEN_PREFIX = 'aiAgentSeen:';
const SECTIONS = [{ key: 'work', label: 'Робота', icon: 'tool' }, { key: 'about', label: 'Про агента', icon: 'info' }];

const seenBefore = (agentKey) => { try { return !!localStorage.getItem(SEEN_PREFIX + agentKey); } catch { return true; } };

// The shared window for every agent's own workspace: the Hub-style agent window (left column with «Робота» and «Про агента») around the agent's own
// body. `children` is that body (chat thread, report, whatever its shape is): the one thing this shell deliberately does not templatize, since it is
// different by design per docs/ai-agents-roadmap.md §4.2. It sits in a dark plum panel in every theme until the bodies are restyled one by one.
// §4.8 «lightweight per-agent onboarding»: the first time an agent's workspace opens on this browser it opens on «Про агента», then it is marked seen.
export default function AgentWorkspaceShell({ agentKey, onClose, children }) {
  const agent = findAgentByKey(agentKey);
  const [section, setSection] = useState(() => (agentKey && !seenBefore(agentKey) ? 'about' : 'work'));

  useEffect(() => {
    if (!agentKey) return;
    try { localStorage.setItem(SEEN_PREFIX + agentKey, '1'); } catch { /* per-viewer convenience only, fine if storage is unavailable */ }
  }, [agentKey]);

  return (
    <AgentWindowFrame
      label={agent?.name || 'Агент'} onClose={onClose} tool={section === 'work'}
      who={{ name: agent?.name || 'AI-агент', sub: agent?.deptLabel || '', html: agent?.icon }}
      sections={SECTIONS} active={section} onSection={setSection}
      eyebrow={agent ? `AI-агент · ${agent.subcatLabel}` : 'AI-агент'} title={agent?.name || 'AI-агент'}
      chips={agent && (
        <>
          <span className="dwa-chip">{autonomyLabel(agent.autonomyLevel)}</span>
          <span className="dwa-chip"><i />{STATUS_TEXT[agent.status] || agent.status}</span>
          {agent.wave && <span className="dwa-chip">Хвиля {agent.wave}</span>}
        </>
      )}
      note={agent?.description}
    >
      <div className="dwa-tool" hidden={section !== 'work'}>{children}</div>
      {section === 'about' && agent && <AgentAbout agent={agent} showDescription />}
    </AgentWindowFrame>
  );
}
