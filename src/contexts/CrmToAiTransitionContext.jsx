import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { DIRECT_DURATION_MS, NAVIGATE_AT_S, REVERSE_DURATION_MS } from '../lib/crmToAiTokens';

// How long the reverse's own overlay waits before actually navigating back
// to CRM (crm-to-ai/specs/04_reverse_transition.md: "0.72-0.98 CRM page
// reveals" — fire a little before that window starts so it's ready).
const REVERSE_NAVIGATE_MS = 680;
// Reduced-motion: skip the whole particle/fragment spectacle, just a short
// crossfade in both directions (crm-to-ai spec section 23 / 05).
const REDUCED_NAVIGATE_MS = 120;
const REDUCED_DURATION_MS = 220;
// Small pad after totalDurationMs before flipping back to 'idle', so the
// portal's own fade-out animation always finishes while still mounted.
const END_PAD_MS = 100;
// Hard fail-safe well past normal completion — guarantees navigate() fires
// and mode returns to 'idle' even if a visual sub-effect throws partway
// through (crm-to-ai master prompt section 24, "interrupt/failure safety").
const FAILSAFE_PAD_MS = 700;

const CrmToAiTransitionContext = createContext(null);

// One shared timeline authority for the whole CRM<->AI Map transition,
// consumed both by TransitionPortal (the fixed overlay, owns phases 0-7)
// and by ConstellationTest (owns phases 8-12 via its own existing reveal —
// no duplicate department graph, the real map just gets told *when* to run
// its existing animation instead of timing itself from its own mount).
export function CrmToAiTransitionProvider({ children }) {
  const navigate = useNavigate();
  const modeRef = useRef('idle'); // 'idle' | 'direct' | 'reverse' — source of truth for re-entrancy guards
  const [mode, setMode] = useState('idle');
  const [reducedMotion, setReducedMotion] = useState(false);
  const startedAtRef = useRef(0);
  const sourceRectRef = useRef(null);
  const pendingPathRef = useRef(null);
  const navigatedRef = useRef(false);
  const timingRef = useRef({ navigateAtMs: 0, totalDurationMs: 0 });

  function beginRun(path, sourceEl, { navigateAtMs, durationMs, reducedNavigateAtMs, reducedDurationMs }) {
    if (modeRef.current !== 'idle') return false; // double-click / interrupt guard
    const reduced = typeof window !== 'undefined' && window.matchMedia
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false;
    sourceRectRef.current = sourceEl?.getBoundingClientRect?.() ?? null;
    pendingPathRef.current = path;
    navigatedRef.current = false;
    startedAtRef.current = performance.now();
    timingRef.current = reduced
      ? { navigateAtMs: reducedNavigateAtMs, totalDurationMs: reducedDurationMs }
      : { navigateAtMs, totalDurationMs: durationMs };
    setReducedMotion(reduced);
    return true;
  }

  function startDirect(path, sourceEl) {
    if (!beginRun(path, sourceEl, {
      navigateAtMs: NAVIGATE_AT_S * 1000,
      durationMs: DIRECT_DURATION_MS,
      reducedNavigateAtMs: REDUCED_NAVIGATE_MS,
      reducedDurationMs: REDUCED_DURATION_MS,
    })) return;
    modeRef.current = 'direct';
    setMode('direct');
  }

  function startReverse(path) {
    if (!beginRun(path, null, {
      navigateAtMs: REVERSE_NAVIGATE_MS,
      durationMs: REVERSE_DURATION_MS,
      reducedNavigateAtMs: REDUCED_NAVIGATE_MS,
      reducedDurationMs: REDUCED_DURATION_MS,
    })) return;
    modeRef.current = 'reverse';
    setMode('reverse');
  }

  // Drives the actual navigate() call plus the guaranteed return to 'idle'.
  // Re-runs exactly once per transition start (mode only changes at those
  // boundaries), reading the timing beginRun() already stashed in refs.
  useEffect(() => {
    if (mode === 'idle') return undefined;
    const { navigateAtMs, totalDurationMs } = timingRef.current;

    const navTimer = setTimeout(() => {
      navigatedRef.current = true;
      if (pendingPathRef.current) navigate(pendingPathRef.current);
    }, navigateAtMs);

    const endTimer = setTimeout(() => {
      modeRef.current = 'idle';
      setMode('idle');
      pendingPathRef.current = null;
    }, totalDurationMs + END_PAD_MS);

    const failsafeTimer = setTimeout(() => {
      if (!navigatedRef.current && pendingPathRef.current) {
        navigatedRef.current = true;
        navigate(pendingPathRef.current);
      }
      modeRef.current = 'idle';
      setMode('idle');
      pendingPathRef.current = null;
    }, totalDurationMs + FAILSAFE_PAD_MS);

    return () => { clearTimeout(navTimer); clearTimeout(endTimer); clearTimeout(failsafeTimer); };
  }, [mode, navigate]);

  const value = useMemo(() => ({
    mode,
    reducedMotion,
    startedAt: startedAtRef.current,
    sourceRect: sourceRectRef.current,
    navigateAtMs: timingRef.current.navigateAtMs,
    totalDurationMs: timingRef.current.totalDurationMs,
    startDirect,
    startReverse,
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [mode, reducedMotion]);

  return <CrmToAiTransitionContext.Provider value={value}>{children}</CrmToAiTransitionContext.Provider>;
}

export function useCrmToAiTransition() {
  const ctx = useContext(CrmToAiTransitionContext);
  if (!ctx) throw new Error('useCrmToAiTransition must be used within CrmToAiTransitionProvider');
  return ctx;
}
