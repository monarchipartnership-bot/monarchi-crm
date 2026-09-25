// Plain-JS port of crm-to-ai/config/transition-spec.ts (that package ships a
// .ts file; this project has no TypeScript anywhere, so this is the source
// of truth here instead — keep both in sync if the spec package is ever
// revisited). Durations in ms; phase ranges in seconds, matching the spec
// doc's own units so they're easy to diff against transition-tokens.json.

export const DIRECT_DURATION_MS = 3800;
export const REVERSE_DURATION_MS = 1100;

// [startSeconds, endSeconds] — overlaps between phases are intentional
// (crm-to-ai/specs/01_animation_timeline.md), not a bug.
export const PHASE = {
  idle: [0.0, 0.10],
  trigger: [0.10, 0.32],
  focus: [0.32, 0.68],
  fragmentation: [0.68, 1.20],
  environmentShift: [0.95, 1.45],
  travel: [1.20, 1.80],
  coreFormation: [1.65, 2.10],
  energyBurst: [2.05, 2.28],
  mainBranches: [2.20, 2.78],
  departmentGlow: [2.35, 2.95],
  childNodes: [2.60, 3.15],
  labels: [2.90, 3.35],
  controls: [3.40, 3.60],
  finalSettle: [3.30, 3.80],
};

// When the real AI Map route actually mounts (background, screen already
// covered by the backdrop) — see TransitionContext's navigate call.
export const NAVIGATE_AT_S = 1.05;

// The single handoff moment: temporary network (built inside the overlay)
// fades out and the real, already-mounted-but-invisible AI Map fades in, at
// the exact same instant — see CrmToAiTransitionContext's destinationVisible
// and crm-to-ai spec section 14 ("Handoff transition -> real map").
export const HANDOFF_AT_S = 3.2;

export const EASING = {
  standard: 'cubic-bezier(0.2, 0.8, 0.2, 1)',
  softOut: 'cubic-bezier(0.16, 1, 0.3, 1)',
};

export const PALETTE = {
  cosmicBase: '#050817',
  deepNavy: '#070B17',
  purple: '#7C3AED',
  brightViolet: '#9B5CFF',
  blue: '#4F7CFF',
  cyan: '#22D3EE',
  teal: '#14B8A6',
};

// The white→cosmic backdrop color chain (crm-to-ai/specs/01, phase 4).
export const BACKDROP_STOPS = ['#FFFFFF', '#EDE7FF', '#3A2B62', '#11172B', '#050817'];

export const LIMITS = {
  dprMax: 2,
  fragmentParticlesDesktop: [350, 700],
  uiGlyphFragmentsMax: 8,
  glowingParticleRatioMax: 0.08,
  lowFpsThreshold: 35,
};

export function clamp01(v) {
  return Math.max(0, Math.min(1, v));
}

// Normalized 0..1 progress of `elapsedSeconds` through a [start, end] phase
// window — the one shared helper every phase-driven visual reads from,
// instead of each component re-deriving its own timing math.
export function phaseProgress(elapsedSeconds, [start, end]) {
  if (end <= start) return elapsedSeconds >= end ? 1 : 0;
  return clamp01((elapsedSeconds - start) / (end - start));
}

// Small deterministic hash → [0,1), used in place of Math.random() for
// fragment particle placement so a given source+index always produces the
// same-looking particle (crm-to-ai spec section 21 "Determinism").
export function seededRandom(seed) {
  let h = seed | 0;
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

export function hashStringToInt(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
  }
  return h;
}
