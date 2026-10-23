import { useEffect, useMemo, useRef, useState } from 'react';

// The 3D map of departments and agents (src/pages/Tools/world3d). It is loaded only when the Map section opens (three.js and the models are
// a separate chunk). The page owns the state (which department is focused, which agent is open); the scene reports clicks and follows props.

const WORLD_DEPTS = ['management', 'strategy-research', 'performance-creative', 'performance-delivery', 'data-tracking-reporting', 'client-success', 'sales'];

// AGENT_DEPTS (departments → functions → agents) to the flat shape the scene draws: one building per department, one desk per agent.
export function toWorldDepts(agentDepts) {
  return Object.entries(agentDepts)
    .filter(([key]) => WORLD_DEPTS.includes(key))
    .map(([key, d]) => ({
      key, label: d.label, subtitle: d.subtitle || '',
      agents: (d.subcategories || []).flatMap((sc) => sc.agents.map((a) => ({ key: a.key, name: a.name, status: a.status }))),
    }));
}

export default function WorldMap3D({ agentDepts, focusedDept, hidden, runStates, onFocusDept, onOpenAgent, onReset }) {
  const hostRef = useRef(null);
  const worldRef = useRef(null);
  const cbRef = useRef({});
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);
  cbRef.current = { onFocusDept, onOpenAgent, onReset };
  const depts = useMemo(() => toWorldDepts(agentDepts), [agentDepts]);

  useEffect(() => {
    let cancelled = false, world = null; setReady(false);
    (async () => {
      try {
        const { createWorld } = await import('../world3d/world.js');
        if (cancelled || !hostRef.current) return;
        world = await createWorld(hostRef.current, {
          depts,
          onFocusDept: (k) => cbRef.current.onFocusDept?.(k),
          onOpenAgent: (d, k) => cbRef.current.onOpenAgent?.(d, k),
          onReset: () => cbRef.current.onReset?.(),
        });
        if (cancelled) { world.dispose(); return; }
        worldRef.current = world; setReady(true);
      } catch (e) { console.error('3D map failed to start', e); if (!cancelled) setFailed(true); }
    })();
    return () => { cancelled = true; worldRef.current = null; world?.dispose(); };
  }, [depts]);

  // the page's focus drives the camera (only when it differs from what the scene already shows, so a click does not restart the flight)
  useEffect(() => {
    const w = worldRef.current; if (!w) return;
    if (focusedDept) { if (w.state.dept !== focusedDept) w.api.selectDept(focusedDept); } else if (w.state.dept) w.api.reset();
  }, [focusedDept, ready]);
  useEffect(() => { worldRef.current?.setRunStatus(runStates); }, [runStates, ready]);
  useEffect(() => { worldRef.current?.setPaused(!!hidden); }, [hidden, ready]);

  if (failed) return <div className="w3d-failed">Не вдалося запустити 3D-мапу. Оновіть сторінку або відкрийте розділ «Агенти».</div>;
  return <div ref={hostRef} className="w3d-host" style={{ position: 'absolute', inset: 0, visibility: hidden ? 'hidden' : 'visible' }} />;
}
