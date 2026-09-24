import './ParticleSphere.css';

// Ported from the supplied Mon'Archi particle-sphere asset pack
// (ParticleSphere.tsx), re-centered on (0,0) instead of (500,500) so it can
// be dropped straight into another SVG's coordinate space via a plain
// `transform="scale(s)"` on the caller's side, with no TS types and plain
// (non-module) CSS classes to match this project's conventions.

const LATITUDES = [-0.82, -0.66, -0.50, -0.34, -0.18, 0, 0.18, 0.34, 0.50, 0.66, 0.82];
const MERIDIANS = [-75, -60, -45, -30, -15, 0, 15, 30, 45, 60, 75, 90, 105, 120];
const INNER_LATS = [-0.70, -0.45, -0.20, 0, 0.20, 0.45, 0.70];
const INNER_MERIDIANS = [-60, -40, -20, 0, 20, 40, 60, 90];
const ORBITS = [
  [365, 95, -10, 'accent', 0.18], [345, 130, 16, 'secondary', 0.16], [330, 165, -24, 'primary', 0.14],
  [300, 205, 35, 'cyan', 0.12], [285, 235, -42, 'soft', 0.10], [375, 78, 58, 'accent', 0.08],
];
const ACCENTS = [
  [500, 170, 3.2, 'accent', 0.85], [500, 830, 3.2, 'cyan', 0.72], [178, 500, 3.6, 'secondary', 0.70],
  [822, 500, 3.6, 'accent', 0.80], [258, 305, 3.0, 'primary', 0.68], [742, 695, 3.0, 'cyan', 0.72],
  [688, 285, 2.7, 'secondary', 0.70], [316, 710, 2.7, 'accent', 0.68],
];
const R = 325;

export default function ParticleSphere({ scale = 1, animated = true, colors = {}, className = '' }) {
  const cssVars = {
    '--sphere-primary': colors.primary ?? '#7C3AED',
    '--sphere-secondary': colors.secondary ?? '#4F7CFF',
    '--sphere-accent': colors.accent ?? '#D946EF',
    '--sphere-core': colors.core ?? '#E879F9',
    '--sphere-cyan': colors.cyan ?? '#5EE7F7',
    '--sphere-soft': colors.soft ?? '#9B5CFF',
  };
  const cls = (name) => `ps-line ps-${name}`;

  return (
    <g transform={`scale(${scale})`} style={cssVars} className={`ps-root${animated ? ' ps-animated' : ''} ${className}`}>
      <defs>
        <radialGradient id="ps-coreGradient" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="var(--sphere-core)" stopOpacity=".78" />
          <stop offset="42%" stopColor="var(--sphere-primary)" stopOpacity=".30" />
          <stop offset="100%" stopColor="var(--sphere-primary)" stopOpacity="0" />
        </radialGradient>
        <filter id="ps-coreGlow" x="-80%" y="-80%" width="260%" height="260%">
          <feGaussianBlur stdDeviation="9" />
        </filter>
      </defs>

      <g className="ps-outerShell">
        <circle cx="0" cy="0" r={R} className={cls('soft')} strokeWidth="1.1" strokeOpacity=".16" strokeDasharray="1.2 26" />

        <g className="ps-latitudeBands">
          {LATITUDES.map((t, i) => {
            const y = t * R * 0.92;
            const rx = R * Math.sqrt(Math.max(0.06, 1 - t * t));
            const ry = Math.max(10, rx * 0.105);
            const keys = ['secondary', 'soft', 'primary', 'accent', 'secondary', 'soft', 'primary', 'accent', 'secondary', 'soft', 'primary'];
            const op = 0.22 + 0.09 * (1 - Math.abs(t));
            const gap = 46 + (i % 3) * 7;
            return <ellipse key={`lat-${i}`} cx="0" cy={y} rx={rx} ry={ry} className={cls(keys[i])} strokeWidth="2.1" strokeOpacity={op} strokeDasharray={`1.2 ${gap}`} />;
          })}
        </g>

        <g className="ps-meridianBands">
          {MERIDIANS.map((angle, i) => {
            const keys = ['primary', 'secondary', 'soft', 'accent', 'primary', 'cyan'];
            const rx = 82 + (i % 4) * 11;
            const op = 0.16 + (i % 5) * 0.018;
            const gap = 54 + (i % 3) * 8;
            return <ellipse key={`mer-${i}`} cx="0" cy="0" rx={rx} ry={R} transform={`rotate(${angle})`} className={cls(keys[i % keys.length])} strokeWidth="2" strokeOpacity={op} strokeDasharray={`1.1 ${gap}`} />;
          })}
        </g>

        <g className="ps-orbits">
          {ORBITS.map(([rx, ry, rot, key, op], i) => (
            <ellipse key={`orbit-${i}`} cx="0" cy="0" rx={rx} ry={ry} transform={`rotate(${rot})`} className={cls(key)} strokeWidth="1.3" strokeOpacity={op} strokeDasharray={`1 ${72 + i * 5}`} />
          ))}
        </g>

        <g className="ps-axes">
          <path d="M0 -345 L0 345" className={cls('accent')} strokeWidth="2.5" strokeOpacity=".24" strokeDasharray="1 34" />
          <path d="M-335 0 L335 0" className={cls('secondary')} strokeWidth="2.5" strokeOpacity=".24" strokeDasharray="1 34" />
        </g>
      </g>

      <g className="ps-innerShell">
        {INNER_LATS.map((t, i) => {
          const ir = 135;
          const y = t * ir * 0.9;
          const rx = ir * Math.sqrt(Math.max(0.08, 1 - t * t));
          const ry = Math.max(6, rx * 0.12);
          const keys = ['accent', 'primary', 'secondary', 'soft', 'cyan', 'accent', 'primary'];
          return <ellipse key={`ilat-${i}`} cx="0" cy={y} rx={rx} ry={ry} className={cls(keys[i])} strokeWidth="1.6" strokeOpacity=".28" strokeDasharray="1 30" />;
        })}
        {INNER_MERIDIANS.map((angle, i) => {
          const keys = ['soft', 'secondary', 'accent', 'primary'];
          return <ellipse key={`imer-${i}`} cx="0" cy="0" rx="36" ry="135" transform={`rotate(${angle})`} className={cls(keys[i % 4])} strokeWidth="1.6" strokeOpacity=".26" strokeDasharray="1 30" />;
        })}
      </g>

      <g className="ps-core">
        <circle cx="0" cy="0" r="92" fill="url(#ps-coreGradient)" opacity=".62" />
        <circle cx="0" cy="0" r="28" fill="url(#ps-coreGradient)" opacity=".88" filter="url(#ps-coreGlow)" />
        {Array.from({ length: 74 }).map((_, i) => {
          const golden = Math.PI * (3 - Math.sqrt(5));
          const rr = 74 * Math.sqrt((i + 0.5) / 74);
          const th = i * golden;
          const x = rr * Math.cos(th);
          const y = rr * Math.sin(th);
          const keys = ['coreDot', 'accent', 'soft', 'secondary'];
          const key = keys[i % 4];
          const r = 0.8 + (i % 5) * 0.18;
          const op = Math.min(0.28 + (i % 7) * 0.045, 0.58);
          return <circle key={`core-${i}`} cx={x} cy={y} r={r} className={key === 'coreDot' ? 'ps-coreDot' : `ps-dot ps-${key}`} opacity={op} />;
        })}
      </g>

      <g className="ps-accentParticles">
        {ACCENTS.map(([x, y, r, key, op], i) => (
          <circle key={`accent-${i}`} cx={x - 500} cy={y - 500} r={r} className={`ps-dot ps-${key}`} opacity={op} />
        ))}
      </g>
    </g>
  );
}
