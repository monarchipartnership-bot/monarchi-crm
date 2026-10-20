import { HUB_PATHS } from './hubIcons';

// Small Hub-style pieces shared by the Projects Dashboard: line icon, ring medallion, delta pill, initials.
export function Ico({ n, className = '' }) {
  return <svg className={'pd-i ' + className} viewBox="0 0 24 24" aria-hidden="true">{HUB_PATHS[n]}</svg>;
}

// Ring medallion. `icon` = line icon on a gradient plate, `tx` = initials on a pale plate.
// `p` is how much of the ring is filled (0-100), `st` the ring colour (st-ok, st-bad, st-paused, st-mu, st-in).
export function Medallion({ icon, tx, p = 100, st = '', size = '' }) {
  return (
    <span className={'pd-md ' + size + ' ' + st} style={{ '--p': p }}>
      <span className={'pd-mi' + (tx ? ' tx' : ' ln')}>{tx || <Ico n={icon} />}</span>
    </span>
  );
}

export const initials = (name) => (name || '?').split(/\s+/).filter(Boolean).map((w) => w[0]).join('').slice(0, 2).toUpperCase();

export function BoxHead({ icon, title, sub, right }) {
  return (
    <div className="pd-bh">
      <Medallion icon={icon} />
      <div><h3>{title}</h3>{sub ? <small>{sub}</small> : null}</div>
      {right ? <><span className="pd-sp" />{right}</> : null}
    </div>
  );
}

// ▲/▼ pill, same semantics as the old DeltaBadge (up green, down red).
export function Delta({ diff, suffix = '' }) {
  if (diff === null || diff === undefined || Number.isNaN(diff)) return <span className="pd-delta none">—</span>;
  if (diff === 0) return <span className="pd-delta neu">0{suffix}</span>;
  const up = diff > 0;
  return <span className={'pd-delta ' + (up ? 'good' : 'bad')}>{up ? '▲ +' : '▼ '}{diff}{suffix}</span>;
}
