import { useEffect, useState } from 'react';
import { fetchNeedsReviewCount } from './api/agentActivity';

const POLL_MS = 45000;

// Backs the two "something needs review" badges — the sidebar's "AI
// Agents" entry (a heads-up before even entering the section) and the
// section's own "Задачі агентів" tab (visible from the Мапа view too,
// without switching tabs first). Polled rather than realtime-subscribed,
// matching the rest of this app's read patterns — good enough for a count
// that only changes when someone runs/reviews an audit, not something
// needing sub-second freshness.
export function useAgentReviewCount() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let alive = true;
    function load() {
      fetchNeedsReviewCount().then((n) => { if (alive) setCount(n); });
    }
    load();
    const id = setInterval(load, POLL_MS);
    return () => { alive = false; clearInterval(id); };
  }, []);

  return count;
}
