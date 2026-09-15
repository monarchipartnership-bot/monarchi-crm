// Small ▲/▼ percentage-point badge comparing a current value to a previous
// one. `diff` is already the computed difference (e.g. percentage points or
// a plain count) — this component only renders direction/color/sign.
export default function DeltaBadge({ diff, suffix = '' }) {
  if (diff === null || diff === undefined || Number.isNaN(diff)) {
    return <span className="delta-badge neutral">—</span>;
  }
  if (diff === 0) {
    return <span className="delta-badge neutral">0{suffix}</span>;
  }
  const up = diff > 0;
  return (
    <span className={'delta-badge ' + (up ? 'up' : 'down')}>
      {up ? '▲' : '▼'} {up ? '+' : ''}{diff}{suffix}
    </span>
  );
}
