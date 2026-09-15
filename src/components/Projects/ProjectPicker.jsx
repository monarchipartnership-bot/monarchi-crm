import { useEffect, useState } from 'react';
import { fetchProjects } from '../../lib/api/projects';

// Project <select>, used only by the standalone report pages (the
// project-detail page's own tabs already have projectId from the route).
export default function ProjectPicker({ value, onChange }) {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetchProjects()
      .then((rows) => { if (!cancelled) setProjects(rows); })
      .catch((e) => console.warn('fetchProjects failed', e))
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="pk-field">
      <label>Проєкт</label>
      <select value={value ?? ''} onChange={(e) => onChange(e.target.value || null)} disabled={loading}>
        <option value="">{loading ? 'Завантаження...' : '— оберіть проєкт —'}</option>
        {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
    </div>
  );
}
