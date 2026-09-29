import { Fragment, useEffect, useMemo, useState } from 'react';
import { findAgentByKey } from '../../data/aiAgentsData';
import { fetchAgentActivity } from '../../lib/api/agentActivity';
import '../../styles/aiAgentsSection.css';
import '../../styles/agentAnalyticsPage.css';

const ANALYTICS_ICON = '<svg viewBox="0 0 24 24"><path d="M3 3v18h18"/><path d="M7 15l4-4 3 3 5-6"/></svg>';

const LADDER_ORDER = ['human-led', 'human-assisted', 'fully-autonomous'];
const LADDER_ROW_LABEL = { 'human-led': 'Human-led', 'human-assisted': 'Human-assisted', 'fully-autonomous': 'Fully autonomous' };
const STAGE_ORDER = ['foundation', 'capture', 'generate', 'orchestrate'];
const STAGE_LABEL = { foundation: 'Foundation', capture: 'Capture', generate: 'Generate', orchestrate: 'Orchestrate' };
const WAVE_ORDER = [1, 2, 3];
const DAY_MS = 24 * 60 * 60 * 1000;

// Phase 3 of docs/ai-agents-roadmap.md (§4.6) — a company-wide rollup, as
// opposed to the map's own per-department CHART view (DeptChartView in
// ConstellationTest.jsx, which this deliberately mirrors the matrix idea
// of rather than reinventing a new visual language). `agents` is the same
// flattened allAgents list every other section view already receives.
//
// Deliberately does NOT show estimated hours/cost saved — no per-agent
// time-saved figure is defined anywhere in this project, and inventing one
// would just be a fabricated number dressed up as a metric. Only real,
// derivable numbers: the static rollout data (aiAgentsData.js) and actual
// logged runs (ai_agent_conversations, same source as "Задачі агентів").
export default function AgentAnalytics({ agents }) {
  const [activity, setActivity] = useState(null);

  useEffect(() => {
    let alive = true;
    fetchAgentActivity({}).then((data) => { if (alive) setActivity(data); });
    return () => { alive = false; };
  }, []);

  const counts = useMemo(() => ({
    total: agents.length,
    live: agents.filter((a) => a.status === 'live').length,
    inDev: agents.filter((a) => a.status === 'in_development').length,
    notStarted: agents.filter((a) => a.status === 'not_started').length,
  }), [agents]);

  const matrix = useMemo(() => {
    const grid = {};
    LADDER_ORDER.forEach((level) => {
      grid[level] = {};
      STAGE_ORDER.forEach((stage) => { grid[level][stage] = []; });
    });
    agents.forEach((a) => {
      if (grid[a.autonomyLevel]?.[a.stage]) grid[a.autonomyLevel][a.stage].push(a);
    });
    return grid;
  }, [agents]);

  const maxCell = useMemo(() => {
    let max = 0;
    LADDER_ORDER.forEach((l) => STAGE_ORDER.forEach((s) => { max = Math.max(max, matrix[l][s].length); }));
    return max || 1;
  }, [matrix]);

  const waveBreakdown = useMemo(() => WAVE_ORDER.map((w) => {
    const waveAgents = agents.filter((a) => a.wave === w);
    return {
      wave: w,
      total: waveAgents.length,
      live: waveAgents.filter((a) => a.status === 'live').length,
      inDev: waveAgents.filter((a) => a.status === 'in_development').length,
      notStarted: waveAgents.filter((a) => a.status === 'not_started').length,
    };
  }), [agents]);

  const activityByAgent = useMemo(() => {
    if (!activity) return null;
    const map = new Map();
    activity.forEach((conv) => {
      const label = findAgentByKey(conv.agent_key)?.name || conv.agent_key;
      map.set(label, (map.get(label) || 0) + 1);
    });
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [activity]);

  const needsReviewCount = activity?.filter((a) => a.needs_review).length ?? 0;
  const last7Count = activity?.filter((a) => Date.now() - new Date(a.created_at).getTime() <= 7 * DAY_MS).length ?? 0;
  const maxAgentActivity = activityByAgent?.length ? activityByAgent[0][1] : 1;

  return (
    <div className="ai-section">
      <div className="ai-section-head">
        <span className="ai-section-icon" dangerouslySetInnerHTML={{ __html: ANALYTICS_ICON }} />
        <div>
          <div className="ai-section-kicker">AI AGENTS</div>
          <h1>Аналітика</h1>
          <p>Загальна картина по всій команді AI-агентів: скільки автономії вже є, як рухається rollout по хвилях і скільки реальних запусків уже залоговано.</p>
        </div>
      </div>

      <div className="analytics-stats">
        <div className="analytics-stat">
          <span className="analytics-stat-value">{counts.total}</span>
          <span className="analytics-stat-label">Агентів усього</span>
        </div>
        <div className="analytics-stat">
          <span className="analytics-stat-value">{counts.live}</span>
          <span className="analytics-stat-label">Live</span>
        </div>
        <div className="analytics-stat">
          <span className="analytics-stat-value">{counts.inDev}</span>
          <span className="analytics-stat-label">У розробці</span>
        </div>
        <div className="analytics-stat">
          <span className="analytics-stat-value">{counts.notStarted}</span>
          <span className="analytics-stat-label">Заплановано</span>
        </div>
      </div>

      <div className="analytics-section">
        <h2 className="analytics-section-title">Автономія × етап (уся компанія)</h2>
        <div className="analytics-matrix" style={{ '--stage-cols': STAGE_ORDER.length }}>
          <div className="analytics-matrix-corner" />
          {STAGE_ORDER.map((stage) => (
            <div key={stage} className="analytics-matrix-col-header">{STAGE_LABEL[stage]}</div>
          ))}
          {LADDER_ORDER.map((level) => (
            <Fragment key={level}>
              <div className="analytics-matrix-row-label">{LADDER_ROW_LABEL[level]}</div>
              {STAGE_ORDER.map((stage) => {
                const cellAgents = matrix[level][stage];
                return (
                  <div
                    key={stage} className="analytics-matrix-cell"
                    style={{ '--intensity': cellAgents.length / maxCell }}
                    title={cellAgents.map((a) => a.name).join(', ') || undefined}
                  >
                    {cellAgents.length ? cellAgents.length : <span className="analytics-matrix-cell-empty">—</span>}
                  </div>
                );
              })}
            </Fragment>
          ))}
        </div>
      </div>

      <div className="analytics-section">
        <h2 className="analytics-section-title">Rollout по хвилях</h2>
        <div className="analytics-waves">
          {waveBreakdown.map((w) => (
            <div key={w.wave} className="analytics-wave-row">
              <span className="analytics-wave-label">Wave {w.wave}</span>
              <div className="analytics-wave-bar">
                {w.live > 0 && <span className="analytics-wave-seg seg-live" style={{ '--seg-pct': w.live / w.total }} />}
                {w.inDev > 0 && <span className="analytics-wave-seg seg-indev" style={{ '--seg-pct': w.inDev / w.total }} />}
                {w.notStarted > 0 && <span className="analytics-wave-seg seg-notstarted" style={{ '--seg-pct': w.notStarted / w.total }} />}
              </div>
              <span className="analytics-wave-count">{w.live} live · {w.inDev} у розробці · {w.notStarted} заплановано</span>
            </div>
          ))}
        </div>
        <div className="analytics-legend">
          <span><span className="analytics-legend-dot seg-live" />Live</span>
          <span><span className="analytics-legend-dot seg-indev" />У розробці</span>
          <span><span className="analytics-legend-dot seg-notstarted" />Заплановано</span>
        </div>
      </div>

      <div className="analytics-section">
        <h2 className="analytics-section-title">Реальна активність агентів</h2>
        {activity === null && <div className="ai-section-empty">Завантаження…</div>}
        {activity !== null && !activity.length && <div className="ai-section-empty">Ще немає залогованих запусків.</div>}
        {activity !== null && activity.length > 0 && (
          <>
            <div className="analytics-stats analytics-stats-secondary">
              <div className="analytics-stat">
                <span className="analytics-stat-value">{activity.length}</span>
                <span className="analytics-stat-label">Запусків залоговано</span>
              </div>
              <div className="analytics-stat">
                <span className="analytics-stat-value">{last7Count}</span>
                <span className="analytics-stat-label">За останні 7 днів</span>
              </div>
              <div className="analytics-stat">
                <span className="analytics-stat-value">{needsReviewCount}</span>
                <span className="analytics-stat-label">На перевірку</span>
              </div>
            </div>
            <div className="analytics-agent-bars">
              {activityByAgent.map(([label, count]) => (
                <div key={label} className="analytics-agent-bar-row">
                  <span className="analytics-agent-bar-label">{label}</span>
                  <div className="analytics-agent-bar-track">
                    <span className="analytics-agent-bar-fill" style={{ '--fill-pct': count / maxAgentActivity }} />
                  </div>
                  <span className="analytics-agent-bar-count">{count}</span>
                </div>
              ))}
            </div>
          </>
        )}
        <p className="analytics-note">
          Оцінка заощаджених годин чи бюджету поки не рахується — немає узгодженого способу оцінки на агента. З'явиться окремим блоком, коли буде визначено.
        </p>
      </div>
    </div>
  );
}
