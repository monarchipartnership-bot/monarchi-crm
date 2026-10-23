import { useEffect, useState } from 'react';
import { supabase } from '../../../lib/supabaseClient';

// What every agent on the map is doing right now, from real activity (table ai_agent_conversations, the same feed as "Задачі агентів"):
//   working  — the agent was used in the last 30 minutes
//   paused   — it has results waiting for a person's review (needs_review)
//   waiting  — it is built and idle, ready for tasks
//   inactive — it is not built yet (in development without a tool, or only planned)
// "problem" has no signal behind it yet (nothing records a failed run), so it is never shown: no invented states. When the agent model gets a
// health signal, add it here.
const WORKING_MS = 30 * 60 * 1000;
const REFRESH_MS = 60 * 1000;

const isBuilt = (a) => a.status !== 'not_started' && !!(a.tool || a.deptAgent);

export function computeRunStates(agents, rows) {
  const now = Date.now(), byAgent = new Map();
  (rows || []).forEach((r) => {
    const cur = byAgent.get(r.agent_key) || { last: 0, review: false };
    cur.last = Math.max(cur.last, new Date(r.updated_at).getTime() || 0);
    if (r.needs_review) cur.review = true;
    byAgent.set(r.agent_key, cur);
  });
  const out = {};
  agents.forEach((a) => {
    if (!isBuilt(a)) { out[a.key] = 'inactive'; return; }
    const act = byAgent.get(a.key);
    out[a.key] = act && now - act.last < WORKING_MS ? 'working' : act?.review ? 'paused' : 'waiting';
  });
  return out;
}

export default function useAgentRunStates(agents) {
  const [states, setStates] = useState(() => computeRunStates(agents, []));
  useEffect(() => {
    let alive = true;
    async function load() {
      const since = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
      const { data, error } = await supabase.from('ai_agent_conversations').select('agent_key, updated_at, needs_review').gte('updated_at', since).limit(5000);
      if (!alive) return;
      if (error) { console.warn('agent run states: activity not available', error); setStates(computeRunStates(agents, [])); return; }
      setStates(computeRunStates(agents, data));
    }
    load();
    const t = setInterval(load, REFRESH_MS);
    return () => { alive = false; clearInterval(t); };
  }, [agents]);
  return states;
}
