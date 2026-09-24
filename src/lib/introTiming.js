// Shared timing for the AI Agents entrance, split across two places on
// purpose: stage 1 (darken + welcome) plays over whatever page the user is
// already on, in Layout.jsx, *before* the route change — so the screen is
// already black by the time the Constellation page actually mounts. Stage 2
// (core ignite + departments flying out) lives inside ConstellationTest.jsx
// and always plays on mount, since that page has no way to know whether
// stage 1 ran (a direct URL load skips it entirely, which is fine — stage 2
// alone is still a reasonable reveal).

export const INTRO_DARKEN_MS = 6000;
export const INTRO_WELCOME_FADE_MS = 3000;
export const INTRO_WELCOME_HOLD_MS = 3000;

// Total time stage 1 owns the screen before it's safe to navigate — darken,
// then the welcome title's fade-in + hold + fade-out.
export const INTRO_STAGE1_TOTAL_MS = INTRO_DARKEN_MS + INTRO_WELCOME_FADE_MS + INTRO_WELCOME_HOLD_MS + INTRO_WELCOME_FADE_MS;
