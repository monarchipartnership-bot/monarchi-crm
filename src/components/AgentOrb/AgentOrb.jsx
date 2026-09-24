import './AgentOrb.css';

const PARTICLES = [
  { cx: 14, cy: 28, r: 1.6 }, { cx: 89, cy: 22, r: 1.3 }, { cx: 18, cy: 80, r: 1.4 },
  { cx: 85, cy: 74, r: 1.7 }, { cx: 50, cy: 4, r: 1.1 }, { cx: 6, cy: 52, r: 1.2 },
];

// Generic AI-agent identity orb — rings + particles + glowing core + icon,
// generalized from KnowledgeBase/KnowledgeOrb.jsx into a reusable component
// any agent's workspace can use with its own color, so this doesn't need
// rebuilding per agent. `color` drives the rings/particles/core/glow via a
// single CSS custom property.
export default function AgentOrb({ color = '#8B5CF6', icon, size = 88 }) {
  return (
    <div className="agent-orb" style={{ width: size, height: size, '--orb-color': color }}>
      <div className="agent-orb-glow" />
      <svg viewBox="0 0 100 100" className="agent-orb-svg">
        <circle cx="50" cy="50" r="47" className="agent-orb-ring" />
        <ellipse cx="50" cy="50" rx="38" ry="22" className="agent-orb-ring" />
        <ellipse cx="50" cy="50" rx="22" ry="38" className="agent-orb-ring" />
        {PARTICLES.map((p, i) => <circle key={i} cx={p.cx} cy={p.cy} r={p.r} className="agent-orb-particle" />)}
        <circle cx="50" cy="50" r="22" className="agent-orb-core" />
      </svg>
      {icon && <span className="agent-orb-icon" dangerouslySetInnerHTML={{ __html: icon }} />}
    </div>
  );
}
