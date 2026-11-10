import { useEffect, useMemo, useRef, useState } from 'react';
import { carrierLabel } from '../../../lib/agents/mapTasks';
import './AgentMap3D.css';

// «Карта 3D» — the map of the AI team as one big glass hall: the central brain, eight islands (one per department) with a hologram, a work pod and a robot for
// every agent, status lamps, data conduits, drones, the stepped base and the bridge. The scene lives in ../agentMap3d (createAgentMap.js: three.js + the models
// from public/ai-world/models/map, loaded on demand as a separate chunk); this component only mounts it, feeds it the agents and their run states, and
// disposes it when the section is left.
//   props: agentDepts  — AGENT_DEPTS (departments → functions → agents); the islands are built from it
//          runStates   — { agentKey: 'working' | 'paused' | 'waiting' | 'inactive' | 'problem' } from useAgentRunStates; the lamps, screens and conduits follow it
//          onOpenAgent(deptKey, agentKey) — a double click on a desk / the «Відкрити агента» button of the panel
//          tasks       — the open work of the agents ([{ id, agentKey, kind, count, campaignId, campaign, project }], lib/agents/mapTasks.js): a carrier stands at the agent where the task is
//          onOpenTask(task) — a click on a carrier (the page opens the campaign)
//          focus       — { key, n }: fly the camera to the island of this department (deptKey of the registry)
//          onFocusDept(deptKey | null) — the camera is at a department's island (null: it left); the strip of departments at the bottom follows it
//          onMenu(key) — the buttons of the side menu (map, agents, reports, teams, people, settings): wired by the page when the functions exist
//          hidden — pauses the drawing
// The ten departments of the CRM that the scene draws (the other keys of AGENT_DEPTS are old aliases)
const MAP_DEPTS = ['management', 'client-research', 'client-creative', 'client-ads', 'client-reports', 'sales', 'internal', 'social'];

function toMapDepts(agentDepts) { // one island per department, one desk per agent (chat tools have no desk)
  return Object.entries(agentDepts || {})
    .filter(([key]) => MAP_DEPTS.includes(key))
    .map(([key, d]) => ({
      key, label: d.label,
      agents: (d.subcategories || []).flatMap((sc) => sc.agents.filter((a) => !a.isTool).map((a) => ({ key: a.key, name: a.name, status: a.status }))),
    }));
}

export default function AgentMap3D({ agentDepts, runStates, tasks, focus, onOpenAgent, onOpenTask, onFocusDept, onMenu, hidden }) {
  const hostRef = useRef(null);
  const apiRef = useRef(null);
  const [state, setState] = useState('loading'); // loading | ready | failed
  const [dept, setDept] = useState(null); // the department the camera is at: the strip of departments is shown
  const depts = useMemo(() => toMapDepts(agentDepts), [agentDepts]);
  const cb = useRef({}); cb.current = { onOpenAgent, onOpenTask, onFocusDept, onMenu };
  const states = useRef(runStates); states.current = runStates;

  useEffect(() => {
    let alive = true; let api = null;
    setState('loading');
    import('../agentMap3d/createAgentMap.js')
      .then(({ createAgentMap }) => createAgentMap(hostRef.current, {
        depts, runStates: states.current,
        onOpenAgent: (d, k) => cb.current.onOpenAgent?.(d, k),
        onOpenTask: (t) => cb.current.onOpenTask?.(t),
        onFocusDept: (k) => { setDept(k); cb.current.onFocusDept?.(k); },
        onMenu: (k) => { if (k === 'map') apiRef.current?.flyHome(); cb.current.onMenu?.(k); },
      }))
      .then((a) => { if (!alive) { a.dispose(); return; } api = a; apiRef.current = a; setState('ready'); })
      .catch((e) => { console.error('3D agent map failed to start', e); if (alive) setState('failed'); });
    return () => { alive = false; apiRef.current = null; if (api) api.dispose(); };
  }, [depts]);

  useEffect(() => { if (state === 'ready') apiRef.current?.setRunStatus(runStates); }, [runStates, state]);
  const stripRef = useRef(null);
  useEffect(() => { stripRef.current?.querySelector('.is-on')?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' }); }, [dept]); // the open department is always in sight in the strip
  useEffect(() => { if (state === 'ready') apiRef.current?.setPaused(!!hidden); }, [hidden, state]);
  useEffect(() => { if (state === 'ready' && focus?.key) apiRef.current?.selectDept(focus.key); }, [focus, state]); // the camera flies to a department (the search of the page)
  useEffect(() => { if (state === 'ready') apiRef.current?.setTasks((tasks || []).map((t) => ({ ...t, label: carrierLabel(t) }))); }, [tasks, state]);

  return (
    <div className="am3-shell">
      <div ref={hostRef} className="am3-host" />
      {state === 'loading' && (
        <div className="am3-loader" role="status" aria-live="polite">
          <img className="am3-loader-mark" src={`${import.meta.env.BASE_URL}ai-world/logo/emblem.svg`} alt="" />
          <div className="am3-loader-text">Будуємо карту команди…</div>
        </div>
      )}
      {state === 'ready' && dept && (
        <nav ref={stripRef} className="am3-strip" aria-label="Відділи" data-ai-safe>
          <button type="button" className="am3-strip-all" onClick={() => apiRef.current?.flyHome()}>Уся мапа</button>
          {depts.map((d) => (
            <button key={d.key} type="button" className={'am3-strip-item' + (d.key === dept ? ' is-on' : '')} aria-pressed={d.key === dept} onClick={() => apiRef.current?.selectDept(d.key)}>
              {d.label}<small>{d.agents.length}</small>
            </button>
          ))}
        </nav>
      )}
      {state === 'failed' && <div className="am3-failed">Не вдалося запустити 3D-карту. Оновіть сторінку.</div>}
    </div>
  );
}
