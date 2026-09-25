import { CRACK_VIEWBOX, IMPACT_POINT, MAIN_CRACKS, SECONDARY_CRACKS, MICRO_CRACKS } from './crackPattern';
import styles from './ScreenCrackOverlay.module.css';

// Renders the fixed (see crackPattern.js — no runtime randomness) crack
// geometry as a layered SVG overlay: dark base + purple mid + a thin bright
// core per "important" line, so each fracture reads as glass rather than a
// flat drawn stroke, plus a separate thin white glass-edge highlight on a
// minority of the main cracks. One shared <svg viewBox="0 0 1920 1080">
// canvas is scaled/cropped (not stretched) to any real viewport via
// `preserveAspectRatio="xMidYMid slice"`, so the pattern itself never
// changes shape — only its crop — regardless of screen size.
//
// Draw-in uses the same pathLength=1 + stroke-dasharray/dashoffset trick
// already established for this transition (see CrackTransition.css) so it
// slots into the existing 'cracks' phase timing unchanged: impact glow ->
// first main rays -> rest of the main cracks -> secondary branches -> micro
// cracks -> glass-edge highlights settle in last.
function pointsToPath(points) {
  return points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'} ${x} ${y}`).join(' ');
}

const HIGHLIGHT_CRACKS = MAIN_CRACKS.filter((c) => c.highlight);

export default function ScreenCrackOverlay() {
  return (
    <svg
      className={styles.overlay}
      viewBox={`0 0 ${CRACK_VIEWBOX.width} ${CRACK_VIEWBOX.height}`}
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
    >
      <defs>
        <radialGradient id="crackImpactGlow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#a855f7" stopOpacity="0.55" />
          <stop offset="45%" stopColor="#8b5cf6" stopOpacity="0.22" />
          <stop offset="100%" stopColor="#8b5cf6" stopOpacity="0" />
        </radialGradient>
      </defs>

      <circle
        className={styles.impactGlow}
        cx={IMPACT_POINT.x} cy={IMPACT_POINT.y} r={70}
        fill="url(#crackImpactGlow)"
      />

      <g id="main-cracks" className={styles.mainGroup}>
        {MAIN_CRACKS.map((c) => {
          const d = pointsToPath(c.points);
          const style = { animationDelay: `${c.delay}ms`, animationDuration: `${c.duration}ms` };
          return (
            <g key={c.id}>
              <path d={d} pathLength="1" className={styles.mainBase} style={{ ...style, strokeWidth: c.width }} />
              <path d={d} pathLength="1" className={styles.mainMid} style={{ ...style, strokeWidth: round(c.width * 0.55) }} />
              <path d={d} pathLength="1" className={styles.mainCore} style={{ ...style, strokeWidth: 0.32 }} />
            </g>
          );
        })}
      </g>

      <g id="secondary-cracks" className={styles.secondaryGroup}>
        {SECONDARY_CRACKS.map((c) => {
          const d = pointsToPath(c.points);
          const style = { animationDelay: `${c.delay}ms`, animationDuration: `${c.duration}ms` };
          return (
            <g key={c.id}>
              <path d={d} pathLength="1" className={styles.secBase} style={{ ...style, strokeWidth: c.width }} />
              <path d={d} pathLength="1" className={styles.secMid} style={{ ...style, strokeWidth: round(c.width * 0.6) }} />
            </g>
          );
        })}
      </g>

      <g id="micro-cracks" className={styles.microGroup}>
        {MICRO_CRACKS.map((c) => (
          <path
            key={c.id} d={pointsToPath(c.points)} pathLength="1" className={styles.micro}
            style={{ strokeWidth: c.width, animationDelay: `${c.delay}ms`, animationDuration: `${c.duration}ms` }}
          />
        ))}
      </g>

      <g id="highlights" className={styles.highlightGroup}>
        {HIGHLIGHT_CRACKS.map((c) => (
          <path
            key={c.id} d={pointsToPath(c.points)} pathLength="1" className={styles.highlight}
            style={{ animationDelay: `${c.delay + 1900}ms`, animationDuration: '700ms' }}
          />
        ))}
      </g>
    </svg>
  );
}

function round(n) { return Math.round(n * 100) / 100; }
