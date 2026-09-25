import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { DIRECT_DURATION_MS, HANDOFF_AT_S, NAVIGATE_AT_S, REVERSE_DURATION_MS } from '../lib/crmToAiTokens';

// How long the reverse's own overlay waits before actually navigating back
// to CRM (crm-to-ai/specs/04_reverse_transition.md: "0.72-0.98 CRM page
// reveals" — fire a little before that window starts so it's ready).
const REVERSE_NAVIGATE_MS = 680;
// Reduced-motion: skip the whole particle/fragment spectacle, just a short
// crossfade in both directions (crm-to-ai spec section 23 / 05).
const REDUCED_NAVIGATE_MS = 120;
const REDUCED_DURATION_MS = 220;
const REDUCED_HANDOFF_MS = 170;
// Small pad after totalDurationMs before flipping back to 'idle', so the
// portal's own fade-out animation always finishes while still mounted.
const END_PAD_MS = 100;
// Hard fail-safe well past normal completion — guarantees navigate() fires
// and mode returns to 'idle' even if a visual sub-effect throws partway
// through (crm-to-ai master prompt section 24, "interrupt/failure safety").
const FAILSAFE_PAD_MS = 700;

const CrmToAiTransitionContext = createContext(null);

// One shared timeline authority for the whole CRM<->AI Map transition.
// `destinationVisible` is the single handoff signal — the ONLY thing that
// decides when the real AI Map appears. Both TransitionPortal (fades its
// temporary network out) and ConstellationTest (fades itself in, flips its
// own introDone/pointer-events) read this exact same flag, so they cannot
// drift apart the way two independently-computed elapsed-time timers did
// in the previous version (that drift was the root cause of the overlay
// disappearing onto a real page that hadn't actually finished yet).
export function CrmToAiTransitionProvider({ children }) {
  const navigate = useNavigate();
  // react-router's navigate() function turned out NOT to stay referentially
  // stable across this provider's own re-renders during an active
  // transition — calling navigate() mid-run triggered a re-render whose new
  // `navigate` identity re-ran the timer effect below (it was in the
  // effect's dependency array), silently RESETTING every timer to count
  // from that later moment. That's what made the whole transition run ~1s
  // long for no visible reason. Reading navigate via a ref instead removes
  // it from the effect's dependencies entirely — the effect now only reruns
  // when `mode` itself changes, which is the only thing that should ever
  // restart the schedule.
  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;
  const modeRef = useRef('idle'); // 'idle' | 'direct' | 'reverse' — source of truth for re-entrancy guards
  const [mode, setMode] = useState('idle');
  const [reducedMotion, setReducedMotion] = useState(false);
  const [destinationVisible, setDestinationVisible] = useState(false);
  const startedAtRef = useRef(0);
  const sourceRectRef = useRef(null);
  const pendingPathRef = useRef(null);
  const navigatedRef = useRef(false);
  const timingRef = useRef({ navigateAtMs: 0, totalDurationMs: 0, handoffAtMs: 0 });

  function beginRun(path, sourceEl, { navigateAtMs, durationMs, handoffAtMs, reducedNavigateAtMs, reducedDurationMs, reducedHandoffAtMs }) {
    if (modeRef.current !== 'idle') return false; // double-click / interrupt guard
    const reduced = typeof window !== 'undefined' && window.matchMedia
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false;
    sourceRectRef.current = sourceEl?.getBoundingClientRect?.() ?? null;
    pendingPathRef.current = path;
    navigatedRef.current = false;
    startedAtRef.current = performance.now();
    timingRef.current = reduced
      ? { navigateAtMs: reducedNavigateAtMs, totalDurationMs: reducedDurationMs, handoffAtMs: reducedHandoffAtMs }
      : { navigateAtMs, totalDurationMs: durationMs, handoffAtMs };
    setReducedMotion(reduced);
    setDestinationVisible(false);
    return true;
  }

  function startDirect(path, sourceEl) {
    if (!beginRun(path, sourceEl, {
      navigateAtMs: NAVIGATE_AT_S * 1000,
      durationMs: DIRECT_DURATION_MS,
      handoffAtMs: HANDOFF_AT_S * 1000,
      reducedNavigateAtMs: REDUCED_NAVIGATE_MS,
      reducedDurationMs: REDUCED_DURATION_MS,
      reducedHandoffAtMs: REDUCED_HANDOFF_MS,
    })) return;
    modeRef.current = 'direct';
    setMode('direct');
  }

  function startReverse(path) {
    if (!beginRun(path, null, {
      navigateAtMs: REVERSE_NAVIGATE_MS,
      durationMs: REVERSE_DURATION_MS,
      handoffAtMs: REVERSE_NAVIGATE_MS,
      reducedNavigateAtMs: REDUCED_NAVIGATE_MS,
      reducedDurationMs: REDUCED_DURATION_MS,
      reducedHandoffAtMs: REDUCED_HANDOFF_MS,
    })) return;
    modeRef.current = 'reverse';
    setMode('reverse');
  }

  // Drives navigate(), the destinationVisible handoff, and the guaranteed
  // return to 'idle'. Re-runs exactly once per transition start (mode only
  // changes at those boundaries), reading the timing beginRun() stashed.
  useEffect(() => {
    if (mode === 'idle') return undefined;
    const { navigateAtMs, totalDurationMs, handoffAtMs } = timingRef.current;

    const navTimer = setTimeout(() => {
      navigatedRef.current = true;
      if (pendingPathRef.current) navigateRef.current(pendingPathRef.current);
    }, navigateAtMs);

    const handoffTimer = setTimeout(() => {
      setDestinationVisible(true);
    }, handoffAtMs);

    const endTimer = setTimeout(() => {
      modeRef.current = 'idle';
      setMode('idle');
      setDestinationVisible(false);
      pendingPathRef.current = null;
    }, totalDurationMs + END_PAD_MS);

    const failsafeTimer = setTimeout(() => {
      if (!navigatedRef.current && pendingPathRef.current) {
        navigatedRef.current = true;
        navigateRef.current(pendingPathRef.current);
      }
      modeRef.current = 'idle';
      setMode('idle');
      setDestinationVisible(false);
      pendingPathRef.current = null;
    }, totalDurationMs + FAILSAFE_PAD_MS);

    return () => { clearTimeout(navTimer); clearTimeout(handoffTimer); clearTimeout(endTimer); clearTimeout(failsafeTimer); };
  }, [mode]);

  // Scoped dark-background fallback (index.css) — only engaged while a
  // transition is actually active, never permanently, since several CRM
  // surfaces are semi-transparent white by design and need a light
  // background showing through during normal use.
  useEffect(() => {
    if (mode === 'idle') return undefined;
    document.body.classList.add('crm-to-ai-transitioning');
    return () => document.body.classList.remove('crm-to-ai-transitioning');
  }, [mode]);

  const value = useMemo(() => ({
    mode,
    reducedMotion,
    destinationVisible,
    startedAt: startedAtRef.current,
    sourceRect: sourceRectRef.current,
    navigateAtMs: timingRef.current.navigateAtMs,
    totalDurationMs: timingRef.current.totalDurationMs,
    handoffAtMs: timingRef.current.handoffAtMs,
    startDirect,
    startReverse,
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [mode, reducedMotion, destinationVisible]);

  return <CrmToAiTransitionContext.Provider value={value}>{children}</CrmToAiTransitionContext.Provider>;
}

export function useCrmToAiTransition() {
  const ctx = useContext(CrmToAiTransitionContext);
  if (!ctx) throw new Error('useCrmToAiTransition must be used within CrmToAiTransitionProvider');
  return ctx;
}
