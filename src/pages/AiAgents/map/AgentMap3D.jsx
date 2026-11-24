import { useEffect, useMemo, useRef, useState } from 'react';
import './AgentMap3D.css';

// «Карта» of the AI Agents section: the 3D hall (three.js, loaded on demand as a separate chunk) with one island of the client's team (five agents) and the archived
// departments, round the central hub (the Orchestrator). The scene lives next to this file (createAgentMap.js); this component mounts it, feeds it the islands from the
// registry and the run states of the agents, and disposes it when the section is left.
//   props: islands     - mapIslands() of src/lib/workflow/registry.js
//          runStates   - { agentKey: 'working' | 'paused' | 'waiting' | 'inactive' | 'problem' }
//          onOpenAgent(islandKey, agentKey) - a click on an agent that is already in focus (the page shows its panel)
//          onFocusDept(islandKey | null)    - the camera is at an island (null: it left)
export default function AgentMap3D({ islands, runStates, onOpenAgent, onFocusDept, hidden }) {
  const hostRef = useRef(null);
  const apiRef = useRef(null);
  const [state, setState] = useState('loading'); // loading | ready | failed
  const [dept, setDept] = useState(null);
  const cb = useRef({}); cb.current = { onOpenAgent, onFocusDept };
  const states = useRef(runStates); states.current = runStates;
  const key = useMemo(() => JSON.stringify(islands.map((i) => [i.key, i.agents.length])), [islands]);

  useEffect(() => {
    let alive = true; let api = null;
    setState('loading');
    import('./createAgentMap.js')
      .then(({ createAgentMap }) => createAgentMap(hostRef.current, {
        islands, runStates: states.current,
        onOpenAgent: (d, k) => cb.current.onOpenAgent?.(d, k),
        onFocusDept: (k) => { setDept(k); cb.current.onFocusDept?.(k); },
        onMenu: (k) => { if (k === 'map') apiRef.current?.flyHome(); },
      }))
      .then((a) => { if (!alive) { a.dispose(); return; } api = a; apiRef.current = a; setState('ready'); })
      .catch((e) => { console.error('3D agent map failed to start', e); if (alive) setState('failed'); });
    return () => { alive = false; apiRef.current = null; if (api) api.dispose(); };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (state === 'ready') apiRef.current?.setRunStatus(runStates); }, [runStates, state]);
  useEffect(() => { if (state === 'ready') apiRef.current?.setPaused(!!hidden); }, [hidden, state]);

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
        <nav className="am3-strip" aria-label="Відділи" data-ai-safe>
          <button type="button" className="am3-strip-all" onClick={() => apiRef.current?.flyHome()}>Уся мапа</button>
          {islands.map((d) => (
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
