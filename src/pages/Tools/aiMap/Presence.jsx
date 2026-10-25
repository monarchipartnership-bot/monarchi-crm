import { useEffect, useState } from 'react';
import './Presence.css';

// Keeps a group of absolutely positioned page elements on screen while they fade out, and fades them in when they arrive, so swapping the
// overview interface for a department's (or back) is a short cross-fade with a small slide, never a hard switch.
// `instant` (phones, narrow windows: the elements live in a flow layout there) renders the children as they are, with no wrapper and no animation.
export default function Presence({ show, instant = false, ms = 220, delay = 90, children }) {
  const [phase, setPhase] = useState(show ? 'in' : 'gone'); // 'gone': not mounted, 'in': shown (also while fading out, until the timer ends)
  const [kept, setKept] = useState(children); // the last children given while shown, drawn again while they fade out
  if (show && kept !== children) setKept(children);

  useEffect(() => {
    if (instant) return undefined;
    if (show) {
      let r2 = 0;
      const r1 = requestAnimationFrame(() => { r2 = requestAnimationFrame(() => setPhase('in')); });
      return () => { cancelAnimationFrame(r1); cancelAnimationFrame(r2); };
    }
    const t = setTimeout(() => setPhase('gone'), ms);
    return () => clearTimeout(t);
  }, [show, instant, ms]);

  if (instant) return show ? children : null;
  if (!show && phase === 'gone') return null;
  const cls = show ? (phase === 'in' ? 'is-in' : 'is-enter') : 'is-exit';
  return <div className={'pres ' + cls} style={{ '--pd': `${delay}ms` }}>{show ? children : kept}</div>;
}
