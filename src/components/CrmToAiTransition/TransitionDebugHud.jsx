import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { useCrmToAiTransition } from '../../contexts/CrmToAiTransitionContext';

// Temporary diagnostic overlay for tuning the CRM->AI transition — opt-in
// via ?transitionDebug=1, per crm-to-ai master prompt section 19. Always
// mounted (from App.jsx) so it can show the resting "mode: idle" state too,
// not just while a transition is active. Writes straight to a DOM node in
// its own rAF loop instead of React state, so it never adds a re-render to
// the very system it's trying to measure.
export default function TransitionDebugHud() {
  const location = useLocation();
  const enabled = new URLSearchParams(location.search).get('transitionDebug') === '1';
  const { mode, destinationVisible, startedAt } = useCrmToAiTransition();
  const elRef = useRef(null);
  const rafRef = useRef(null);

  useEffect(() => {
    if (!enabled) return undefined;
    let lastT = performance.now();
    let frames = 0;
    let fps = 0;

    function tick(t) {
      rafRef.current = requestAnimationFrame(tick);
      frames++;
      if (t - lastT > 500) {
        fps = Math.round((frames * 1000) / (t - lastT));
        frames = 0;
        lastT = t;
      }
      if (elRef.current) {
        const elapsed = mode === 'idle' ? 0 : Math.round(performance.now() - startedAt);
        elRef.current.textContent =
          `phase: ${mode}\nelapsed: ${elapsed}ms\ndestinationReady: ${destinationVisible}\nroute: ${location.pathname}\nFPS: ${fps}`;
      }
    }
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [enabled, mode, destinationVisible, startedAt, location.pathname]);

  if (!enabled) return null;

  return (
    <pre
      ref={elRef}
      style={{
        position: 'fixed', bottom: 12, left: 12, zIndex: 100000,
        background: 'rgba(0,0,0,.78)', color: '#5CFF9B',
        padding: '8px 12px', margin: 0, borderRadius: 6,
        fontFamily: 'monospace', fontSize: 11, lineHeight: 1.5,
        pointerEvents: 'none', whiteSpace: 'pre',
      }}
    >
      {`phase: ${mode}\nelapsed: 0ms\ndestinationReady: ${destinationVisible}\nroute: ${location.pathname}\nFPS: -`}
    </pre>
  );
}
