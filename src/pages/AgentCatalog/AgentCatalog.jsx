import { useMemo, useState } from 'react';
import { AUTONOMY_LABEL, STATUS_LABEL, WAVE_LABEL } from '../../data/aiAgentsData';
import '../../styles/aiAgentsSection.css';
import '../../styles/agentCatalogPage.css';

const CATALOG_ICON = '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>';

const STATUS_FILTERS = [
  { value: '', label: 'Усі статуси' },
  { value: 'live', label: 'Live' },
  { value: 'in_development', label: 'In development' },
  { value: 'not_started', label: 'Not started' },
];
const WAVE_FILTERS = [
  { value: '', label: 'Усі хвилі' },
  { value: '1', label: 'Wave 1' },
  { value: '2', label: 'Wave 2' },
  { value: '3', label: 'Wave 3' },
];

// Phase 2 of docs/ai-agents-roadmap.md (§4.1) — a flat, filterable view of
// every agent slot across all 8 departments. The radial map is a great
// front door but doesn't scale for "find agent X" or "review all N at
// once" — this answers "what's actually live today" in one glance instead
// of clicking into each department. `agents` is the exact same flattened
// list (deptKey/deptLabel/color/subcatLabel merged in) ConstellationTest.jsx
// already builds for its own search — passed in rather than recomputed, so
// there's one source of truth for "what an agent looks like out of
// context." `onSelectAgent` is that same file's `openAgent()`, so clicking
// a row here opens exactly what clicking the map node would.
export default function AgentCatalog({ agents, onSelectAgent }) {
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [waveFilter, setWaveFilter] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return agents.filter((a) => {
      if (statusFilter && a.status !== statusFilter) return false;
      if (waveFilter && String(a.wave) !== waveFilter) return false;
      if (q && !(a.name.toLowerCase().includes(q) || a.deptLabel.toLowerCase().includes(q) || a.subcatLabel.toLowerCase().includes(q))) return false;
      return true;
    });
  }, [agents, query, statusFilter, waveFilter]);

  const counts = useMemo(() => ({
    total: agents.length,
    live: agents.filter((a) => a.status === 'live').length,
    inDev: agents.filter((a) => a.status === 'in_development').length,
  }), [agents]);

  return (
    <div className="ai-section">
      <div className="ai-section-head">
        <span className="ai-section-icon" dangerouslySetInnerHTML={{ __html: CATALOG_ICON }} />
        <div>
          <div className="ai-section-kicker">AI AGENTS</div>
          <h1>Агенти</h1>
          <p>
            {counts.total} агентів усього · {counts.live} live · {counts.inDev} у розробці ·{' '}
            {counts.total - counts.live - counts.inDev} заплановано
          </p>
        </div>
      </div>

      <div className="agent-catalog-search">
        <svg viewBox="0 0 24 24"><circle cx="10" cy="10" r="6" /><path d="m21 21-5.2-5.2" /></svg>
        <input
          type="text" value={query} onChange={(e) => setQuery(e.target.value)}
          placeholder="Пошук за назвою, відділом або функцією…"
        />
      </div>

      <div className="ai-section-pills">
        {STATUS_FILTERS.map((f) => (
          <button
            key={f.value} type="button" className={'ai-section-pill' + (statusFilter === f.value ? ' active' : '')}
            onClick={() => setStatusFilter(f.value)}
          >
            {f.label}
          </button>
        ))}
        <span className="agent-catalog-pill-sep" />
        {WAVE_FILTERS.map((f) => (
          <button
            key={f.value} type="button" className={'ai-section-pill' + (waveFilter === f.value ? ' active' : '')}
            onClick={() => setWaveFilter(f.value)}
          >
            {f.label}
          </button>
        ))}
      </div>

      {!filtered.length && <div className="ai-section-empty">Жоден агент не відповідає фільтрам.</div>}

      <div className="ai-section-list">
        {filtered.map((agent) => (
          <button
            key={agent.key} type="button" className="agent-catalog-row"
            style={{ '--dept-color': agent.color }}
            onClick={() => onSelectAgent(agent)}
          >
            <span className="agent-catalog-dot" />
            <span className="agent-catalog-main">
              <span className="agent-catalog-breadcrumb">{agent.deptLabel} · {agent.subcatLabel}</span>
              <span className="agent-catalog-name">{agent.name}</span>
              <span className="agent-catalog-desc">{agent.description}</span>
            </span>
            <span className="agent-catalog-badges">
              <span className="ai-section-badge muted">{AUTONOMY_LABEL[agent.autonomyLevel]}</span>
              <span className={'agent-catalog-status agent-catalog-status--' + agent.status}>{STATUS_LABEL[agent.status]}</span>
              {agent.wave && <span className="ai-section-badge muted">{WAVE_LABEL[agent.wave]}</span>}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
