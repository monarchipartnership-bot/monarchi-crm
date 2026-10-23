import { useEffect, useState } from 'react';
import { supabase } from '../../../lib/supabaseClient';
import { deptRunStates } from '../../../lib/agents/deptRunState';

// What every agent on the map is doing right now, from real activity (table ai_agent_conversations, the same feed as "Задачі агентів"):
//   working  — the agent was used in the last 30 minutes
//   paused   — it has results waiting for a person's review (needs_review)
//   waiting  — it is built and idle, ready for tasks
//   inactive — it is not built yet (in development without a tool, or only planned)
// The agents of a department (the agent model: one worker with a queue of clients) get their state from their own tables instead: working = a task runs or
// waits, paused = switched off / all clients paused / a result waits for the person's OK, problem = a failed task or a failed last run (lib/agents/deptRunState.js).
// For the other agents "problem" has no signal behind it yet, so it is never shown: no invented states.
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

// The department's own tables; missing tables (before the migrations) or no access just mean «nothing known»: the agents show as idle.
async function loadDeptData() {
  try {
    const a = await supabase.from('ag_agents').select('id, role, enabled, last_status').eq('team', 'creative');
    if (a.error || !a.data?.length) return {};
    const ids = a.data.map((x) => x.id);
    const [c, open, waiting] = await Promise.all([
      supabase.from('ag_agent_clients').select('agent_id, enabled, mode').in('agent_id', ids),
      supabase.from('ag_tasks').select('agent_id, status').in('agent_id', ids).in('status', ['queued', 'running', 'failed']).limit(500),
      supabase.from('ag_tasks').select('agent_id, status').in('agent_id', ids).eq('status', 'done').eq('output->>awaiting_pass', 'true').limit(100), // results that wait for the person's OK
    ]);
    return { agents: a.data, clients: c.data || [], tasks: [...(open.data || []), ...(waiting.data || []).map((x) => ({ ...x, awaiting_pass: true }))] };
  } catch { return {}; }
}

export default function useAgentRunStates(agents) {
  const [states, setStates] = useState(() => computeRunStates(agents, []));
  useEffect(() => {
    let alive = true;
    async function load() {
      const since = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
      const [conv, dept] = await Promise.all([
        supabase.from('ai_agent_conversations').select('agent_key, updated_at, needs_review').gte('updated_at', since).limit(5000),
        loadDeptData(),
      ]);
      if (!alive) return;
      if (conv.error) console.warn('agent run states: activity not available', conv.error);
      setStates({ ...computeRunStates(agents, conv.error ? [] : conv.data), ...deptRunStates(agents, dept) });
    }
    load();
    const t = setInterval(load, REFRESH_MS);
    return () => { alive = false; clearInterval(t); };
  }, [agents]);
  return states;
}
