import './teamTasks.css';

// The strip «Підготовка» of a team (owner, 2026-11-12, 3.1b): what the team does BEFORE it starts to work, with the live line of the step that is going on.
//   phase: teamPhase(...) result (only a preparing one is drawn)
export default function TeamPrep({ phase }) {
  if (!phase || phase.phase !== 'preparing') return null;
  return (
    <div className="tt-prep" role="status" aria-live="polite">
      <p className="tt-prep-text">{phase.text}</p>
      <div className="tt-prep-bar" role="progressbar" aria-label="Підготовка команди" aria-valuemin="0" aria-valuemax="100" aria-valuenow={phase.progress ?? 0}>
        <i style={{ width: `${phase.progress ?? 0}%` }} />
        <span>{phase.progress ?? 0}%</span>
      </div>
      <ul className="tt-prep-steps">
        {phase.steps.map((s) => (
          <li key={s.key} className={'is-' + s.state}><i aria-hidden="true" /><b>{s.label}</b><span>{s.live}</span></li>
        ))}
      </ul>
    </div>
  );
}
