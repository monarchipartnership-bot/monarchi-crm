import { useEffect, useState } from 'react';

// Keeps a dropdown/popover mounted for `closeMs` after `open` goes false so
// its reverse CSS animation (a ".closing" class) has time to actually play,
// instead of the element vanishing the instant conditional rendering removes
// it. Same mount-lag pattern used for the notifications panel.
export function useAnimatedOpen(open, closeMs = 160) {
  const [rendered, setRendered] = useState(open);

  useEffect(() => {
    if (open) { setRendered(true); return; }
    if (!rendered) return;
    const t = setTimeout(() => setRendered(false), closeMs);
    return () => clearTimeout(t);
  }, [open, rendered, closeMs]);

  return rendered;
}
