import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { fetchAiProjects, finishAiProject, removeAiProject, restoreAiProject } from './api/aiProjects';
import { buildProjectRows } from './agents/aiProjects';

const REFRESH_MS = 30000;

// The projects of the AI Agents section for the page «Проєкти»: the rows (one per client project, with its cabinets, operations and what waits for the person) and
// the three things a person does with a project. cockpit: useProjectCockpit() (the cabinets of the active operations, read every 20 s).
export default function useAiProjects(cockpit, { enabled = true } = {}) {
  const { email } = useAuth();
  const [data, setData] = useState({ aiProjects: [], projects: [], accounts: [], campaigns: [], ready: true });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const alive = useRef(true);

  const reload = useCallback(async () => {
    try { const d = await fetchAiProjects(); if (alive.current) { setData(d); setError(''); } } catch (e) { if (alive.current) setError(e?.message || 'Не вдалося завантажити проєкти.'); } finally { if (alive.current) setLoading(false); }
  }, []);
  useEffect(() => {
    alive.current = true;
    if (!enabled) return undefined;
    reload();
    const t = setInterval(reload, REFRESH_MS);
    return () => { alive.current = false; clearInterval(t); };
  }, [enabled, reload]);

  const rows = useMemo(() => buildProjectRows({ ...data, cockpits: cockpit?.byId || {}, summaries: cockpit?.list || [] }), [data, cockpit?.byId, cockpit?.list]);
  const after = useCallback(async (r) => { await Promise.all([reload(), cockpit?.reload?.()]); return r; }, [reload, cockpit]);
  const finish = useCallback((projectId) => finishAiProject(projectId, email).then(after), [email, after]);
  const remove = useCallback((projectId) => removeAiProject(projectId, email).then(after), [email, after]);
  const restore = useCallback((projectId) => restoreAiProject(projectId, email).then(after), [email, after]);

  return { rows, ready: data.ready, loading, error, reload, finish, remove, restore };
}
