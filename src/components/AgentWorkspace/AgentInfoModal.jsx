import AgentWindowFrame from './AgentWindowFrame';
import AgentAbout, { autonomyLabel } from './AgentAbout';
import { STATUS_TEXT } from '../../pages/Tools/aiMap/status';

// The read-only «what is this agent» window (for the agents of the catalogue that have no workspace yet): the same full-screen window as every other
// agent page, with the single section «Про агента». `showCta` controls the «Запустити» row, `showDescription` the description card.
export default function AgentInfoModal({ agent, onClose, showCta = true, showDescription = true }) {
  return (
    <AgentWindowFrame
      label={agent.name} onClose={onClose}
      who={{ name: agent.name, sub: agent.deptLabel, html: agent.icon }}
      sections={[]} eyebrow={`AI-агент · ${agent.subcatLabel}`} title={agent.name}
      chips={(
        <>
          <span className="dwa-chip">{autonomyLabel(agent.autonomyLevel)}</span>
          <span className="dwa-chip"><i />{STATUS_TEXT[agent.status] || agent.status}</span>
          {agent.wave && <span className="dwa-chip">Хвиля {agent.wave}</span>}
        </>
      )}
      note={agent.description}
    >
      <AgentAbout agent={agent} showCta={showCta} showDescription={showDescription} />
    </AgentWindowFrame>
  );
}
