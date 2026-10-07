import { Fragment } from 'react';

// CHART tab: matrix view of a single department's own agents — rows are
// the autonomy ladder, columns are the rollout stage (see the `stage`
// comment in aiAgentsData.js). Reuses the same agent-detail modal as the
// graph (via onSelectAgent) instead of building a second card layout.
const LADDER_ORDER = ['human-led', 'human-assisted', 'fully-autonomous'];
const LADDER_ROW_LABEL = {
  'human-led': 'Human-led',
  'human-assisted': 'Human-assisted',
  'fully-autonomous': 'Fully autonomous',
};
const STAGE_ORDER = ['foundation', 'capture', 'generate', 'orchestrate'];
const STAGE_LABEL = {
  foundation: 'Foundation',
  capture: 'Capture',
  generate: 'Generate',
  orchestrate: 'Orchestrate',
};

export default function DeptChartView({ dept, deptKey, onSelectAgent }) {
  const agents = dept.subcategories.flatMap((sc) => sc.agents.map((a) => ({ ...a, subcatLabel: sc.label })));
  const total = agents.length;
  const autonomousCount = agents.filter((a) => a.autonomyLevel === 'fully-autonomous').length;
  const assistedCount = agents.filter((a) => a.autonomyLevel === 'human-assisted').length;
  const humanCount = agents.filter((a) => a.autonomyLevel === 'human-led').length;

  return (
    <div className="chart-view" style={{ '--dept-color': dept.color }}>
      <div className="chart-header">
        <div className="dept-panel-eyebrow">Відділ · Chart</div>
        <h2>{dept.label}</h2>
        <p className="chart-stats">
          {autonomousCount} з {total} {total === 1 ? 'завдання' : 'завдань'} виконуються автономно · {assistedCount} асистовано · {humanCount} лишаються повністю на людині
        </p>
      </div>

      <div className="chart-grid" style={{ '--stage-cols': STAGE_ORDER.length }}>
        <div className="chart-corner" />
        {STAGE_ORDER.map((stage) => (
          <div key={stage} className="chart-col-header">{STAGE_LABEL[stage]}</div>
        ))}
        {LADDER_ORDER.map((level) => (
          <Fragment key={level}>
            <div className="chart-row-label">{LADDER_ROW_LABEL[level]}</div>
            {STAGE_ORDER.map((stage) => {
              const cellAgents = agents.filter((a) => a.autonomyLevel === level && a.stage === stage);
              return (
                <div key={stage} className="chart-cell">
                  {cellAgents.length === 0 && <span className="chart-cell-empty">—</span>}
                  {cellAgents.map((a) => (
                    <button
                      key={a.key} type="button" className="chart-card"
                      onClick={() => onSelectAgent({ ...a, deptKey, deptLabel: dept.label, color: dept.color })}
                    >
                      <span className="chart-card-ic" dangerouslySetInnerHTML={{ __html: a.icon }} />
                      <span className="chart-card-body">
                        <span className="chart-card-name">{a.name}</span>
                        <span className="chart-card-sub">{a.subcatLabel}</span>
                      </span>
                      {a.wave && <span className={'chart-card-wave wave-' + a.wave}>W{a.wave}</span>}
                      <span className={'chart-card-dot status-' + a.status} />
                    </button>
                  ))}
                </div>
              );
            })}
          </Fragment>
        ))}
      </div>
    </div>
  );
}
