const BOOK_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H12v18H6.5A2.5 2.5 0 0 1 4 18.5z"/><path d="M20 5.5A2.5 2.5 0 0 0 17.5 3H12v18h5.5a2.5 2.5 0 0 0 2.5-2.5z"/></svg>';
const PARTICLES = [ {cx:14,cy:28,r:1.6}, {cx:89,cy:22,r:1.3}, {cx:18,cy:80,r:1.4}, {cx:85,cy:74,r:1.7}, {cx:50,cy:4,r:1.1} ];

export default function KnowledgeOrb({ size = 88 }) {
  return (
    <div className="kb-orb" style={{ width: size, height: size }}>
      <svg viewBox="0 0 100 100" className="kb-orb-svg">
        <ellipse cx="50" cy="50" rx="47" ry="47" className="kb-orb-ring" />
        <ellipse cx="50" cy="50" rx="38" ry="22" className="kb-orb-ring" />
        <ellipse cx="50" cy="50" rx="22" ry="38" className="kb-orb-ring" />
        {PARTICLES.map((p, i) => <circle key={i} cx={p.cx} cy={p.cy} r={p.r} className="kb-orb-particle" />)}
        <circle cx="50" cy="50" r="20" className="kb-orb-core" />
      </svg>
      <span className="kb-orb-icon" dangerouslySetInnerHTML={{ __html: BOOK_ICON }} />
    </div>
  );
}
