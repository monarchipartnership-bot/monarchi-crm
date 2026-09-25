import { useEffect, useMemo, useState } from 'react';
import { AGENT_DEPTS } from '../../data/aiAgentsData';
import { computeOverviewHubs } from '../../lib/aiMapOverviewLayout';
import ParticleSphere from '../ParticleSphere/ParticleSphere';
import { MonoKnot } from '../Logo/Logo';
import './TemporaryNetworkLayer.css';

// Mirrors ConstellationTest.jsx's own VIEWBOX_HALF/UI_SCALE exactly — same
// values, kept as separate constants (see aiMapOverviewLayout.js's own
// comment on why: trivial numbers, lower risk than threading an import
// through the real map's existing working layout code).
const VIEWBOX_HALF = 700;
const UI_SCALE = VIEWBOX_HALF / 420;
// ParticleSphere's own r=92 core glow, scaled the same way the real map
// mounts it (0.38*UI_SCALE) — and the real map's hub ring radius
// (30*UI_SCALE) — used to trim connections to run rim-to-rim, matching
// ConstellationTest's own trimLineToEdges.
const CORE_EDGE_R = 92 * 0.38 * UI_SCALE;
const HUB_EDGE_R = 30 * UI_SCALE;

function trimToEdges(x1, y1, x2, y2, r1, r2) {
  const dx = x2 - x1, dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len, uy = dy / len;
  return [x1 + ux * r1, y1 + uy * r1, x2 - ux * r2, y2 - uy * r2];
}

function computeAspect() {
  if (typeof window === 'undefined') return 16 / 9;
  return Math.min(2, Math.max(1, window.innerWidth / window.innerHeight));
}

function useStageAspect() {
  const [aspect, setAspect] = useState(computeAspect);
  useEffect(() => {
    function onResize() { setAspect(computeAspect()); }
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return aspect;
}

// The CRM->AI transition's temporary "network build" — real department
// data/colors/labels, hub positions shared with the real map via
// aiMapOverviewLayout.js so the crossfade handoff has no jump at the node
// level. Everything here is disposable: mounted for ~1.5s inside
// TransitionPortal (stage 'core' through 'crossfade'), then unmounted once
// the real, already-mounted-but-invisible ConstellationTest fades in at
// the exact same instant this fades out (destinationVisible in
// CrmToAiTransitionContext — the single handoff signal, not two
// independently-timed guesses).
export default function TemporaryNetworkLayer({ stage }) {
  const deptKeys = useMemo(() => Object.keys(AGENT_DEPTS), []);
  const hubs = useMemo(() => computeOverviewHubs(deptKeys, AGENT_DEPTS), [deptKeys]);
  const stageAspect = useStageAspect();
  const halfW = VIEWBOX_HALF * stageAspect, halfH = VIEWBOX_HALF;

  const showCore = stage === 'core' || stage === 'burst' || stage === 'network' || stage === 'crossfade';
  // The Mon'Archi mark is a transient beat during formation only — gone
  // again before the network builds, so by crossfade time the temporary
  // core looks like a bare ParticleSphere, exactly matching the real
  // core (which never shows the mark) and keeping the handoff seamless.
  const showMark = stage === 'core';
  const showNetwork = stage === 'network' || stage === 'crossfade';

  return (
    <svg
      className={'temp-network-svg' + (stage === 'crossfade' ? ' crossfade-out' : '')}
      viewBox={`${-halfW} ${-halfH} ${halfW * 2} ${halfH * 2}`}
    >
      <defs>
        <filter id="tempNetGlow" x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="2.2" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>

      {showCore && (
        <g className="temp-core-group">
          <circle r={CORE_EDGE_R + 24} className="temp-core-halo" />
          <ParticleSphere scale={0.38 * UI_SCALE} />
          {showMark && (
            <foreignObject
              x={-18 * UI_SCALE} y={-18 * UI_SCALE} width={36 * UI_SCALE} height={36 * UI_SCALE}
              className="temp-core-mark"
            >
              <MonoKnot />
            </foreignObject>
          )}
        </g>
      )}

      {showNetwork && hubs.map((hub, i) => {
        const [x1, y1, x2, y2] = trimToEdges(0, 0, hub.hx, hub.hy, CORE_EDGE_R, HUB_EDGE_R);
        const delay = i * 70;
        const childCount = Math.min(3, hub.dept.subcategories?.length || 2);
        return (
          <g key={hub.key} style={{ '--dept-color': hub.dept.color }}>
            <line
              x1={x1} y1={y1} x2={x2} y2={y2} pathLength="1"
              className="temp-connection" filter="url(#tempNetGlow)"
              style={{ animationDelay: `${delay}ms` }}
            />
            <circle
              r={2.6 * UI_SCALE} className="temp-energy-dot"
              style={{ '--sx': `${x1}px`, '--sy': `${y1}px`, '--ex': `${x2}px`, '--ey': `${y2}px`, animationDelay: `${delay}ms` }}
            />
            <g transform={`translate(${hub.hx} ${hub.hy})`}>
              <g className="temp-hub-node" style={{ animationDelay: `${delay + 220}ms` }}>
                <circle r={42 * UI_SCALE} className="temp-hub-glow" />
                <circle r={30 * UI_SCALE} className="temp-hub-circle" />
                {hub.dept.icon && (
                  <foreignObject x={-13 * UI_SCALE} y={-13 * UI_SCALE} width={26 * UI_SCALE} height={26 * UI_SCALE}>
                    <span dangerouslySetInnerHTML={{ __html: hub.dept.icon }} />
                  </foreignObject>
                )}
              </g>
              {Array.from({ length: childCount }, (_, c) => {
                const childAngle = hub.deptAngle + (c - (childCount - 1) / 2) * 22;
                const rad = (childAngle * Math.PI) / 180;
                const cr = 60 * UI_SCALE;
                const cx = Math.cos(rad) * cr, cy = Math.sin(rad) * cr;
                return (
                  <g key={c} className="temp-child-group" style={{ animationDelay: `${delay + 380 + c * 60}ms` }}>
                    <line x1={0} y1={0} x2={cx} y2={cy} className="temp-child-line" />
                    <circle cx={cx} cy={cy} r={8 * UI_SCALE} className="temp-child-dot" />
                  </g>
                );
              })}
              <text
                y={56 * UI_SCALE} textAnchor="middle" className="temp-hub-label"
                style={{ animationDelay: `${delay + 520}ms` }}
              >
                {hub.dept.label}
              </text>
            </g>
          </g>
        );
      })}
    </svg>
  );
}
