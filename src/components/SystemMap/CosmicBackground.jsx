import './CosmicBackground.css';

// Deterministic star-field RNG — seeded, not Math.random(), so the scatter
// doesn't reshuffle on every render. Moved here verbatim from
// ConstellationTest.jsx as part of splitting the scene into its own
// background/particle/network layers; behavior is unchanged.
function mulberry32(seed) {
  let a = seed;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// About a quarter of the stars get a slow pulsing glow on top of the plain
// twinkle; the rest stay as plain dim points. Data range (x: ±960, y: ±480)
// is generous enough to fully cover the widest clamped aspect ratio the
// viewBox can take.
function buildStarField(count) {
  const rand = mulberry32(20260908);
  return Array.from({ length: count }, (_, i) => ({
    key: i,
    x: (rand() - 0.5) * 1920,
    y: (rand() - 0.5) * 960,
    r: 0.5 + rand() * 1,
    baseOpacity: 0.08 + rand() * 0.18,
    twinkle: 2.5 + rand() * 3.5,
    delay: rand() * 5,
    glow: rand() < 0.25,
    glowDuration: 3 + rand() * 3,
    glowDelay: rand() * 4,
  }));
}
const STAR_FIELD = buildStarField(190);

// The cosmic backdrop: gradient + nebula fog + dot grid + star field. Pure
// CSS/SVG, no canvas — the ambient particle cloud lives in the separate
// ParticleFieldCanvas layer mounted next to this one. Never intercepts
// clicks (the whole layer is pointer-events:none), and only ever reads
// state from its parent (stageAspect/gridTransform/transitionCss) — no
// click/focus/business logic lives here.
export default function CosmicBackground({ stageAspect, gridTransform, transitionCss }) {
  // Star field lives in its own full-bleed SVG, sized to the stage's real
  // aspect ratio every resize so preserveAspectRatio can stay the default
  // "meet" — stars reach every corner on a wide screen without stretching.
  const starHalfH = 480;
  const starHalfW = starHalfH * stageAspect;
  const starViewBox = `${-starHalfW} ${-starHalfH} ${starHalfW * 2} ${starHalfH * 2}`;

  return (
    <div className="cosmic-bg">
      <div className="cosmic-bg-gradient" />
      <div className="constellation-grid" style={{ transform: gridTransform, transition: transitionCss }} />
      <div className="constellation-fog fog-1" />
      <div className="constellation-fog fog-2" />
      <div className="constellation-fog fog-3" />

      <svg viewBox={starViewBox} className="constellation-starfield-svg">
        {STAR_FIELD.map((s) => (
          <circle
            key={s.key} cx={s.x} cy={s.y} r={s.r} className="bg-star"
            style={{
              '--base-o': s.baseOpacity,
              animation: s.glow
                ? `starTwinkle ${s.twinkle}s ease-in-out ${s.delay}s infinite, starGlowPulse ${s.glowDuration}s ease-in-out ${s.glowDelay}s infinite`
                : `starTwinkle ${s.twinkle}s ease-in-out ${s.delay}s infinite`,
            }}
          />
        ))}
      </svg>
    </div>
  );
}
