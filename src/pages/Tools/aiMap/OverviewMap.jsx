import { Fragment } from 'react';
import { DEPARTMENT_ICONS } from '../../../lib/aiAgentsAssets';
import { K, pluralAgents } from './overviewLayout';

// Shared SVG paint servers for every sphere on the map (overview + focused
// department graph): one glossy plum sphere, one halo, one satellite.
export function AiSvgDefs() {
  return (
    <defs>
      <radialGradient id="ai-g-sphere" cx="30%" cy="22%" r="85%">
        <stop offset="0%" stopColor="#F0B2F0" />
        <stop offset="40%" stopColor="#B544B5" />
        <stop offset="82%" stopColor="#48164C" />
      </radialGradient>
      <radialGradient id="ai-g-sat" cx="32%" cy="24%" r="80%">
        <stop offset="0%" stopColor="#F5C3F6" />
        <stop offset="48%" stopColor="#B544B5" />
        <stop offset="100%" stopColor="#682768" />
      </radialGradient>
      <radialGradient id="ai-g-halo" cx="50%" cy="50%" r="50%">
        <stop offset="52%" stopColor="#AE40AE" stopOpacity=".62" />
        <stop offset="78%" stopColor="#AE40AE" stopOpacity=".2" />
        <stop offset="100%" stopColor="#AE40AE" stopOpacity="0" />
      </radialGradient>
      <radialGradient id="ai-g-light" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stopColor="#FFFFFF" />
        <stop offset="35%" stopColor="#F9EDF9" stopOpacity=".95" />
        <stop offset="100%" stopColor="#EB9CEF" stopOpacity="0" />
      </radialGradient>
    </defs>
  );
}

function ellipsePath(rx, ry, sweep) {
  return `M ${rx} 0 A ${rx} ${ry} 0 1 ${sweep} ${-rx} 0 A ${rx} ${ry} 0 1 ${sweep} ${rx} 0 Z`;
}

// A travelling light on an ellipse (SMIL motion, so it needs no JS frames and
// can be paused with svg.pauseAnimations()). `period` seconds per lap,
// `sweep` 1 = clockwise, 0 = counter-clockwise, `phase` 0..1 start offset.
function OrbitLight({ rx, ry, period, sweep, phase, tilt = 0, r = 3.2 * K, still }) {
  const d = ellipsePath(rx, ry, sweep);
  return (
    <g transform={`rotate(${tilt})`} className="ai-orbit-light" pointerEvents="none">
      <circle r={r * 2.6} fill="url(#ai-g-light)" opacity=".85">
        {!still && <animateMotion dur={`${period}s`} begin={`${-period * phase}s`} repeatCount="indefinite" path={d} />}
      </circle>
      <circle r={r} fill="#fff">
        {!still && <animateMotion dur={`${period}s`} begin={`${-period * phase}s`} repeatCount="indefinite" path={d} />}
      </circle>
    </g>
  );
}

// Decorative light that travels core -> department every 7s (at most three
// at a time: 8 spokes, 0.875s apart, each pulse lasts ~2.2s). It is a
// picture of exchange, not a report of running agents (motion-prompt.md).
function Pulse({ x1, y1, x2, y2, index, total }) {
  const dur = 7;
  const travel = 2.2;
  const begin = (index * dur) / total;
  const path = `M ${x1} ${y1} L ${x2} ${y2}`;
  return (
    <circle r={3 * K} fill="url(#ai-g-light)" opacity="0" pointerEvents="none" className="ai-pulse">
      <animateMotion dur={`${dur}s`} begin={`${begin}s`} repeatCount="indefinite" path={path} keyPoints="0;1;1" keyTimes={`0;${travel / dur};1`} calcMode="linear" />
      <animate attributeName="opacity" dur={`${dur}s`} begin={`${begin}s`} repeatCount="indefinite" values="0;.95;.95;0;0" keyTimes={`0;.04;${(travel / dur - 0.04).toFixed(3)};${(travel / dur).toFixed(3)};1`} />
    </circle>
  );
}

function Label({ node, dims, fs, onActivate, onEnter, onLeave }) {
  const { label, count } = node;
  const lh = dims.titleLh * fs;
  const xPad = label.anchor === 'start' ? 4 : label.anchor === 'end' ? -4 : 0;
  // Invisible hit box behind the text: SVG only hit-tests painted glyphs, so
  // without it the gaps between words/lines would not be clickable.
  const longest = Math.max(...label.lines.map((l) => l.length));
  const hitW = longest * dims.fontDept * fs * 0.6 + 24;
  const hitH = lh * label.lines.length + dims.fontCount * fs * 1.6 + 8;
  const hitX = label.anchor === 'start' ? label.x : label.anchor === 'end' ? label.x - hitW : label.x - hitW / 2;
  const hitY = label.y0 - lh * 0.6;
  return (
    <g
      className="ai-dept-label" data-ai-safe
      onClick={onActivate} onMouseEnter={onEnter} onMouseLeave={onLeave}
    >
      <rect x={hitX} y={hitY} width={hitW} height={hitH} className="ai-dept-label-hit" />
      <text className="ai-dept-title" textAnchor={label.anchor} x={label.x + xPad} fontSize={dims.fontDept * fs}>
        {label.lines.map((line, i) => (
          <tspan key={i} x={label.x + xPad} y={label.y0 * 1 + i * lh} dominantBaseline="central">{line}</tspan>
        ))}
      </text>
      <text className="ai-dept-count" textAnchor={label.anchor} x={label.x + xPad} y={label.subY} dominantBaseline="central" fontSize={dims.fontCount * fs}>
        {count} {pluralAgents(count)}
      </text>
    </g>
  );
}

function Satellite({ row, dims, fs, selected, onOpenAgent, onFocusDept, deptKey, dept }) {
  const SAT_R = dims.satR;
  const gap = SAT_R + 9 * K;
  const x = row.side === 'r' ? gap : -gap;
  const anchor = row.side === 'r' ? 'start' : 'end';
  const lh = dims.fontSat * 1.18 * fs;
  const firstDy = -((row.lines.length - 1) * lh) / 2;
  const isAgent = row.kind === 'agent';
  const name = isAgent ? row.agent.name : row.lines[0];
  const activate = () => {
    if (isAgent) onOpenAgent({ ...row.agent, deptKey, deptLabel: dept.label, color: dept.color });
    else onFocusDept(deptKey);
  };
  return (
    <g
      className={'ai-sat' + (selected ? ' is-selected' : '') + (isAgent ? '' : ' is-more')}
      transform={`translate(${row.x} ${row.y})`}
      role="button" tabIndex={0}
      aria-label={isAgent ? `Агент: ${name}` : `Показати всі агенти відділу: ${name}`}
      onClick={activate}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); activate(); } }}
    >
      <title>{isAgent ? name : `${name} — відкрити відділ`}</title>
      <circle r={22 * K} className="ai-sat-hit" />
      <circle r={SAT_R + 7 * K} className="ai-focus-ring" />
      <circle r={SAT_R * 1.9} className="ai-sat-glow" />
      <circle r={SAT_R} className="ai-sat-body" />
      <ellipse cx={-SAT_R * 0.32} cy={-SAT_R * 0.4} rx={SAT_R * 0.34} ry={SAT_R * 0.22} className="ai-sat-spec" />
      <text className="ai-sat-label" data-ai-safe x={x} y={firstDy} textAnchor={anchor} fontSize={dims.fontSat * fs}>
        {row.lines.map((line, i) => (
          <tspan key={i} x={x} dy={i === 0 ? 0 : lh} dominantBaseline="central">{line}</tspan>
        ))}
      </text>
    </g>
  );
}

export default function OverviewMap({
  nodes, ring, compact, dims, fontScale, fit = 1, focusedDept, hoveredDept, setHoveredDept,
  onFocusDept, onOpenAgent, selectedAgentKey, motion,
}) {
  const fs = fontScale;
  const still = !motion;
  const coreR = compact ? 52 * (dims.nodeR / 36) : 80;
  const selectedKey = focusedDept || hoveredDept;

  const tilted = compact
    ? [[110 * (dims.nodeR / 36), 40 * (dims.nodeR / 36), -12], [98 * (dims.nodeR / 36), 35 * (dims.nodeR / 36), 22], [86 * (dims.nodeR / 36), 31 * (dims.nodeR / 36), -48]]
    : [[150 * K, 58 * K, -12], [138 * K, 50 * K, 22], [124 * K, 44 * K, -48]];

  return (
    <g className={'ai-overview' + (focusedDept ? ' is-focused' : '')}>
      <g transform={`translate(0 ${ring.dy || 0})` + (fit < 1 ? ` scale(${fit})` : '')}>
      {/* guides: ellipse through the departments plus quieter inner rings and
          three tilted orbits around the core (decorative, not connections) */}
      <g className="ai-rings" pointerEvents="none">
        <ellipse rx={ring.rx} ry={ring.ry} className="ai-ring ai-ring-nodes" />
        <ellipse rx={ring.rx * 0.82} ry={ring.ry * 0.82} className="ai-ring ai-ring-solid" />
        <ellipse rx={ring.rx * 0.58} ry={ring.ry * 0.58} className="ai-ring ai-ring-dotted" />
        <ellipse rx={ring.rx * 0.38} ry={ring.ry * 0.38} className="ai-ring ai-ring-solid ai-ring-faint" />
        {tilted.map(([rx, ry, rot], i) => (
          <ellipse key={i} rx={rx} ry={ry} transform={`rotate(${rot})`} className="ai-ring ai-ring-orbit" />
        ))}
      </g>

      {/* real connections: core -> every department (selected one lights up) */}
      <g className="ai-spokes" pointerEvents="none">
        {nodes.map((n) => {
          const len = Math.hypot(n.x, n.y) || 1;
          const ux = n.x / len, uy = n.y / len;
          const x1 = ux * coreR, y1 = uy * coreR, x2 = n.x - ux * (dims.nodeR + 2), y2 = n.y - uy * (dims.nodeR + 2);
          const on = selectedKey === n.key;
          const dim = selectedKey && !on;
          return (
            <Fragment key={n.key}>
              <line x1={x1} y1={y1} x2={x2} y2={y2} className={'ai-spoke' + (on ? ' is-on' : '') + (dim ? ' is-dim' : '')} />
              {motion && <Pulse x1={x1} y1={y1} x2={x2} y2={y2} index={n.index} total={nodes.length} />}
            </Fragment>
          );
        })}
      </g>

      <g className="ai-lights" pointerEvents="none">
        <OrbitLight rx={ring.rx * 0.82} ry={ring.ry * 0.82} period={72} sweep={1} phase={0.1} still={still} />
        <OrbitLight rx={ring.rx * 0.82} ry={ring.ry * 0.82} period={72} sweep={1} phase={0.62} still={still} r={2.4 * K} />
        <OrbitLight rx={ring.rx * 0.58} ry={ring.ry * 0.58} period={48} sweep={0} phase={0.3} still={still} />
        <OrbitLight rx={tilted[0][0]} ry={tilted[0][1]} tilt={tilted[0][2]} period={96} sweep={1} phase={0.45} still={still} r={2.6 * K} />
        <OrbitLight rx={tilted[1][0]} ry={tilted[1][1]} tilt={tilted[1][2]} period={72} sweep={0} phase={0.8} still={still} r={2.6 * K} />
      </g>

      {nodes.map((n) => {
        const dim = selectedKey && selectedKey !== n.key;
        const iconSrc = DEPARTMENT_ICONS[n.key];
        const enter = () => setHoveredDept(n.key);
        const leave = () => setHoveredDept(null);
        const activate = () => onFocusDept(n.key);
        return (
          <g key={n.key} transform={`translate(${n.x} ${n.y})`} className={'ai-dept' + (dim ? ' is-dim' : '') + (selectedKey === n.key ? ' is-on' : '')} style={{ '--i': n.index }}>
            <g className="ai-dept-inner">
              {n.rows.map((row, i) => {
                const len = Math.hypot(row.x, row.y) || 1;
                const ux = row.x / len, uy = row.y / len;
                return (
                  <line
                    key={i} className="ai-sat-line"
                    x1={ux * dims.nodeR * 0.92} y1={uy * dims.nodeR * 0.92} x2={row.x - ux * dims.satR} y2={row.y - uy * dims.satR}
                  />
                );
              })}
              {n.rows.map((row, i) => (
                <Satellite
                  key={i} row={row} dims={dims} fs={fs} deptKey={n.key} dept={n.dept}
                  selected={row.kind === 'agent' && selectedAgentKey === row.agent.key}
                  onOpenAgent={onOpenAgent} onFocusDept={onFocusDept}
                />
              ))}

              <g
                className="ai-node" data-ai-safe
                role="button" tabIndex={0}
                aria-label={`${n.dept.label}: ${n.count} ${pluralAgents(n.count)}. Відкрити відділ`}
                onClick={activate} onMouseEnter={enter} onMouseLeave={leave}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); activate(); } }}
                onFocus={enter} onBlur={leave}
              >
                <circle r={dims.nodeR + 10 * K} className="ai-node-hit" />
                <circle r={dims.nodeR + dims.halo * 0.3} className="ai-focus-ring" />
                <circle r={dims.nodeR + dims.halo} className="ai-node-halo" />
                <circle r={dims.nodeR} className="ai-node-sphere" />
                <ellipse cx={-dims.nodeR * 0.3} cy={-dims.nodeR * 0.52} rx={dims.nodeR * 0.46} ry={dims.nodeR * 0.22} className="ai-node-spec" />
                {iconSrc && <image href={iconSrc} x={-dims.icon / 2} y={-dims.icon / 2} width={dims.icon} height={dims.icon} className="ai-node-icon" />}
                <g transform={`translate(${dims.nodeR * 0.68} ${dims.nodeR * 0.68})`} className="ai-node-badge">
                  <circle r={dims.badgeR} />
                  <text textAnchor="middle" dominantBaseline="central" fontSize={dims.badgeR * 1.05}>{n.count}</text>
                </g>
              </g>

              <Label node={n} dims={dims} fs={fs} onActivate={activate} onEnter={enter} onLeave={leave} />
            </g>
          </g>
        );
      })}
      </g>
    </g>
  );
}
