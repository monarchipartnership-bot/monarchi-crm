import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { fetchTeamProjectsData } from './api/teamProjects';
import { buildTeamProjectRows } from './agents/teamProjects';

const REFRESH_MS = 30000;

// The projects with launched AI teams for the page «Проєкти» of the AI Agents section. cockpit: useProjectCockpit() (what waits for the person in the operations).
export default function useTeamProjects(cockpit, { enabled = true } = {}) {
  const [data, setData] = useState({ campaigns: [], agents: [], accounts: [], projects: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const alive = useRef(true);

  const reload = useCallback(async () => {
    try { const d = await fetchTeamProjectsData(); if (alive.current) { setData(d); setError(''); } } catch (e) { if (alive.current) setError(e?.message || 'Не вдалося завантажити проєкти.'); } finally { if (alive.current) setLoading(false); }
  }, []);
  useEffect(() => {
    alive.current = true;
    if (!enabled) return undefined;
    reload();
    const t = setInterval(reload, REFRESH_MS);
    return () => { alive.current = false; clearInterval(t); };
  }, [enabled, reload]);

  const rows = useMemo(() => buildTeamProjectRows({ ...data, cockpits: cockpit?.byId || {} }), [data, cockpit?.byId]);
  return { rows, loading, error, reload };
}
