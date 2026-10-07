import { Fragment } from 'react';
import { DEPARTMENT_ICONS } from '../../../lib/aiAgentsAssets';
import { STATUS_TEXT } from './status';
import { FUNCTION_RADIUS_BASE, UI_SCALE, labelProps } from './graphLayout';
import { NODE_ICON, NODE_R } from './overviewLayout';

// The focused department: Department root -> Function hubs -> Agent
// satellites, drawn from calculateDepartmentGraphLayout (positions are final
// on-screen viewBox coordinates). Same glossy plum spheres as the overview;
// agent glyphs stay inside the spheres so each agent remains recognisable,
// and the real status is a separate TEXT badge (shown on hover/focus/select)
// — the glow never means "running".
export default function FocusedGraph({ focused, graph, selectedAgentKey, fs, onOpenAgent, onReset }) {
  const iconSrc = DEPARTMENT_ICONS[focused.key];
  const rootR = NODE_R * 1.18;
  return (
    <g className="dept-graph">
      {[0.55, 0.85, 1.18].map((mul, i) => (
        <circle key={i} r={FUNCTION_RADIUS_BASE * mul} className="dept-graph-orbit" transform={`translate(${graph.x} ${graph.y})`} />
      ))}

      {graph.functions.map((fn) => (
        <Fragment key={fn.key}>
          <path d={fn.edgePath} fill="none" className="dept-graph-edge dept-graph-edge-fn" />
          {fn.edgeDots.map(([dx, dy], i) => <circle key={i} cx={dx} cy={dy} r={2.6 * UI_SCALE} className="dept-graph-dot" />)}
          {fn.agents.map((ag) => (
            <Fragment key={ag.key}>
              <path d={ag.edgePath} fill="none" className={'dept-graph-edge dept-graph-edge-agent' + (selectedAgentKey === ag.key ? ' is-on' : '')} />
              {ag.edgeDots.map(([dx, dy], i) => <circle key={i} cx={dx} cy={dy} r={2 * UI_SCALE} className="dept-graph-dot dept-graph-dot-small" />)}
            </Fragment>
          ))}
        </Fragment>
      ))}

      {graph.functions.map((fn) => (
        <g key={fn.key} className="dept-graph-fn" transform={`translate(${fn.x} ${fn.y})`}>
          <circle r={17 * UI_SCALE} className="dept-graph-fn-halo" />
          <circle r={9 * UI_SCALE} className="dept-graph-fn-circle" />
          <text {...labelProps(fn.labelSide, 17 * UI_SCALE)} className="dept-graph-fn-label" fontSize={13 * UI_SCALE * fs} data-ai-safe>{fn.label}</text>
        </g>
      ))}

      {graph.functions.flatMap((fn) => fn.agents).map((ag) => {
        const lp = labelProps(ag.labelSide, 30 * UI_SCALE);
        const active = selectedAgentKey === ag.key;
        const activate = () => onOpenAgent({ ...ag, deptKey: focused.key, deptLabel: focused.dept.label, color: focused.dept.color });
        return (
          <g
            key={ag.key}
            className={'dept-graph-agent' + (active ? ' active' : '')}
            transform={`translate(${ag.x} ${ag.y})`}
            onClick={activate}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); activate(); } }}
            role="button" tabIndex={0}
            aria-label={`${ag.name} — ${STATUS_TEXT[ag.status] || ag.status}`}
          >
            <circle r={36 * UI_SCALE} className="dept-graph-agent-hit" />
            <circle r={25 * UI_SCALE} className="ai-focus-ring" />
            <circle r={26 * UI_SCALE} className="dept-graph-agent-glow" />
            <circle r={20 * UI_SCALE} className="dept-graph-agent-circle" />
            <ellipse cx={-6 * UI_SCALE} cy={-9 * UI_SCALE} rx={7 * UI_SCALE} ry={4.4 * UI_SCALE} className="dept-graph-agent-spec" />
            <foreignObject x={-10 * UI_SCALE} y={-10 * UI_SCALE} width={20 * UI_SCALE} height={20 * UI_SCALE}>
              <span dangerouslySetInnerHTML={{ __html: ag.icon }} />
            </foreignObject>
            <text {...lp} className="dept-graph-agent-label" fontSize={13 * UI_SCALE * fs} data-ai-safe>
              <tspan x={lp.x}>{ag.name}</tspan>
              <tspan x={lp.x} dy="1.35em" className="dept-graph-agent-status">{STATUS_TEXT[ag.status] || ag.status}</tspan>
            </text>
          </g>
        );
      })}

      <g
        className="dept-graph-root" transform={`translate(${graph.x} ${graph.y})`}
        onClick={onReset} role="button" tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onReset(); } }}
        aria-label={`${focused.dept.label} — назад до всіх відділів`}
      >
        <circle r={rootR + 30 * 1.411} className="dept-graph-root-halo" />
        <circle r={rootR + 10 * 1.411} className="ai-focus-ring" />
        <circle r={rootR} className="dept-graph-root-circle" />
        <ellipse cx={-rootR * 0.3} cy={-rootR * 0.52} rx={rootR * 0.46} ry={rootR * 0.22} className="ai-node-spec" />
        {iconSrc && <image href={iconSrc} x={-NODE_ICON * 0.6} y={-NODE_ICON * 0.6} width={NODE_ICON * 1.2} height={NODE_ICON * 1.2} className="ai-node-icon" />}
      </g>
    </g>
  );
}
