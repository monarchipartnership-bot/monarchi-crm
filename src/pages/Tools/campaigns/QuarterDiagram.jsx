import { useId, useMemo } from 'react';
import { PLATFORMS } from '../../../lib/agents/campaignTeam';
import { QUARTERS, QUARTER_LINKS, QUARTER_NODES } from '../../../lib/agents/campaignModes';

// The scheme of the wizard: four columns, the quarters of the client district. `lit` (a Set of node ids) is what works in the chosen mode: it glows, the
// rest fades; the planned agent is dashed. Links go behind the cards: required ones solid, the others dashed.
const NODE_W = 196;
const NODE_H = 52;
const COL_GAP = 78;
const ROW_GAP = 12;
const HEAD = 34;
const PAD = 14;
const ROWS = Math.max(...QUARTER_NODES.map((n) => n.row)) + 1;
const accentOf = (n) => (n.platforms.includes('*') ? '#EB9CEF' : PLATFORMS[n.platforms[0]]?.color || '#EB9CEF');

const POS = Object.fromEntries(QUARTER_NODES.map((n) => [n.id, { x: PAD + n.quarter * (NODE_W + COL_GAP), y: HEAD + 6 + n.row * (NODE_H + ROW_GAP) }]));
const WIDTH = PAD * 2 + QUARTERS.length * NODE_W + (QUARTERS.length - 1) * COL_GAP;
const COL_H = ROWS * NODE_H + (ROWS - 1) * ROW_GAP;
const HEIGHT = HEAD + 6 + COL_H + 8;

export default function QuarterDiagram({ lit }) {
  const uid = useId().replace(/:/g, '');
  const edges = useMemo(() => {
    const all = QUARTER_LINKS.map((l) => ({ ...l, on: lit.has(l.from) && lit.has(l.to) }));
    return [...all.filter((l) => !l.on), ...all.filter((l) => l.on)];
  }, [lit]);
  return (
    <svg className="cmp-diagram cmp-diagram--quarters" viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label="Схема звʼязків між агентами за кварталами Клієнтського району">
      <defs>
        <marker id={`qa-${uid}`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M1 1 9 5 1 9z" fill="#EB9CEF" /></marker>
        <marker id={`qd-${uid}`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M1 1 9 5 1 9z" fill="#7C5C85" /></marker>
      </defs>
      {QUARTERS.map((q, i) => <rect key={q.key} className="cmp-col" x={PAD + i * (NODE_W + COL_GAP) - 8} y={HEAD - 4} width={NODE_W + 16} height={COL_H + 16} rx="18" />)}
      {QUARTERS.map((q, i) => <text key={q.key} className="cmp-stage-title" x={PAD + i * (NODE_W + COL_GAP) + NODE_W / 2} y={HEAD - 12} textAnchor="middle">{q.label}</text>)}
      <g className="cmp-edges">
        {edges.map((l) => {
          const a = POS[l.from];
          const b = POS[l.to];
          const x1 = a.x + NODE_W;
          const y1 = a.y + NODE_H / 2;
          const x2 = b.x;
          const y2 = b.y + NODE_H / 2;
          const dx = Math.max(24, Math.abs(x2 - x1) * 0.45);
          return <path key={l.from + l.to} className={'cmp-edge' + (l.on ? ' is-lit' : '') + (l.required ? ' is-required' : '')} d={`M${x1} ${y1} C${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`} markerEnd={`url(#${l.on ? 'qa' : 'qd'}-${uid})`} fill="none" />;
        })}
      </g>
      <g className="cmp-nodes">
        {QUARTER_NODES.map((n) => {
          const p = POS[n.id];
          const on = lit.has(n.id);
          return (
            <g key={n.id} className={'cmp-node' + (on ? ' is-lit' : ' is-dim') + (n.planned ? ' is-planned' : '')} transform={`translate(${p.x} ${p.y})`} style={{ '--accent': accentOf(n) }} aria-label={n.name + (n.planned ? ', заплановано' : '')}>
              <rect className="cmp-node-box" width={NODE_W} height={NODE_H} rx="14" />
              <rect className="cmp-node-bar" x="0" y="12" width="4" height={NODE_H - 24} rx="2" />
              <text className="cmp-node-name" x="16" y="22">{n.name}</text>
              <text className="cmp-node-short" x="16" y="39">{n.short}</text>
              {n.planned && <text className="cmp-node-soon" x={NODE_W - 12} y="39" textAnchor="end">СКОРО</text>}
            </g>
          );
        })}
      </g>
    </svg>
  );
}
