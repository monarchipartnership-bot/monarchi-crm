import { useEffect, useState } from 'react';
import { fetchProjects } from '../../lib/api/projects';
import Select from '../common/Select';

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
      <Select value={value == null ? '' : String(value)} onChange={(v) => onChange(v || null)} disabled={loading} ariaLabel="Проєкт" searchable
        options={[{ value: '', label: loading ? 'Завантаження...' : '— оберіть проєкт —' }, ...projects.map((p) => ({ value: String(p.id), label: p.name }))]} />
    </div>
  );
}
