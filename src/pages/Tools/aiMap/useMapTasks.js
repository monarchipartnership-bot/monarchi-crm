import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../../lib/supabaseClient';
import { buildMapTasks } from '../../../lib/agents/mapTasks';

// The open work of the agents for the carriers of the 3D map: queued / running / failed tasks and the results that wait for a person's OK, with the campaign and the project of
// every task. Refreshed every 30 s; no access or no tables: an empty list (the map just shows no carriers).
const REFRESH_MS = 30 * 1000;

export default function useMapTasks(registryKeys = []) {
  const [raw, setRaw] = useState({ tasks: [], agents: [], campaigns: [], projects: [] });
  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        const [open, review, agents] = await Promise.all([
          supabase.from('ag_tasks').select('id, agent_id, status, campaign_id, request_id, created_at, started_at, output').in('status', ['queued', 'running', 'failed']).order('created_at', { ascending: false }).limit(500),
          supabase.from('ag_tasks').select('id, agent_id, status, campaign_id, request_id, created_at, started_at, output').eq('status', 'done').eq('output->>awaiting_pass', 'true').limit(200),
          supabase.from('ag_agents').select('id, role, team, scope_id'),
        ]);
        if (open.error || review.error || agents.error) throw open.error || review.error || agents.error;
        const tasks = [...(open.data || []), ...(review.data || [])];
        const byAgent = new Map((agents.data || []).map((a) => [a.id, a]));
        const ids = [...new Set(tasks.map((t) => t.campaign_id ?? (byAgent.get(t.agent_id)?.team === 'campaign' ? Number(byAgent.get(t.agent_id).scope_id) || null : null)).filter((x) => x != null))];
        const campaigns = ids.length ? (await supabase.from('ag_campaigns').select('id, name, project_id').in('id', ids)).data || [] : [];
        const pids = [...new Set(campaigns.map((c) => c.project_id).filter((x) => x != null))];
        const projects = pids.length ? (await supabase.from('projects').select('id, name').in('id', pids)).data || [] : [];
        if (alive) setRaw({ tasks, agents: agents.data || [], campaigns, projects });
      } catch (e) {
        console.warn('map tasks not available', e?.message || e);
        if (alive) setRaw({ tasks: [], agents: [], campaigns: [], projects: [] });
      }
    }
    load();
    const t = setInterval(load, REFRESH_MS);
    return () => { alive = false; clearInterval(t); };
  }, []);
  const known = useMemo(() => new Set(registryKeys), [registryKeys.join('|')]); // eslint-disable-line react-hooks/exhaustive-deps
  return useMemo(() => buildMapTasks({ ...raw, knownKeys: known.size ? known : null }), [raw, known]);
}
