import { useId, useMemo } from 'react';
import { PLATFORMS } from '../../../lib/agents/campaignTeam';
import { QUARTERS, QUARTER_FLOWS, QUARTER_LINKS, QUARTER_NODES } from '../../../lib/agents/campaignModes';

// The scheme of the wizard: four panels, the quarters of the client district. `lit` (a Set of node ids) is what works in the chosen mode: it glows, the rest
// fades. Inside a quarter the links are short: the card below (a vertical arrow), a fork or a join (a bracket on the left or the right side). Between
// quarters there is one wide arrow per flow; the two that skip a quarter go around it, over the top or under the bottom. Required links are solid.
const NODE_W = 196;
const NODE_H = 52;
const ROW_GAP = 18;
const PAD_IN = 18; // the panel around the cards: room for the brackets
const PANEL_W = NODE_W + PAD_IN * 2;
const COL_GAP = 92;
const TOP_LANE = 26;
const BOT_LANE = 26;
const TITLE_H = 36;
const MARGIN = 10;
const ROWS = Math.max(...QUARTER_NODES.map((n) => n.row)) + 1;
const PANEL_H = TITLE_H + ROWS * NODE_H + (ROWS - 1) * ROW_GAP + 14;
const WIDTH = MARGIN * 2 + QUARTERS.length * PANEL_W + (QUARTERS.length - 1) * COL_GAP;
const HEIGHT = TOP_LANE + PANEL_H + BOT_LANE;
const panelX = (q) => MARGIN + q * (PANEL_W + COL_GAP);
const accentOf = (n) => (n.platforms.includes('*') ? '#EB9CEF' : PLATFORMS[n.platforms[0]]?.color || '#EB9CEF');

const BOX = Object.fromEntries(QUARTER_NODES.map((n) => [n.id, { x: panelX(n.quarter) + PAD_IN, y: TOP_LANE + TITLE_H + n.row * (NODE_H + ROW_GAP) }]));
const cy = (id) => BOX[id].y + NODE_H / 2;

function linkPath(l) {
  const a = BOX[l.from];
  const b = BOX[l.to];
  if (l.kind === 'down') return `M${a.x + NODE_W / 2} ${a.y + NODE_H} L${b.x + NODE_W / 2} ${b.y}`;
  if (l.kind === 'left') { const x = a.x - 9; return `M${a.x} ${cy(l.from)} L${x} ${cy(l.from)} L${x} ${cy(l.to)} L${b.x} ${cy(l.to)}`; }
  const x = a.x + NODE_W + 9; // a join: several feed one, they enter its right edge
  return `M${a.x + NODE_W} ${cy(l.from)} L${x} ${cy(l.from)} L${x} ${cy(l.to) - 8} L${b.x + NODE_W} ${cy(l.to) - 8}`;
}

function flowPath(f) {
  const left = panelX(f.from) + PANEL_W;
  const right = panelX(f.to);
  const mid = TOP_LANE + PANEL_H / 2;
  if (f.lane === 'top') { const x1 = left - 34; const x2 = right + 34; return `M${x1} ${TOP_LANE} L${x1} ${TOP_LANE - 14} L${x2} ${TOP_LANE - 14} L${x2} ${TOP_LANE}`; }
  if (f.lane === 'bottom') { const y = TOP_LANE + PANEL_H; const x1 = left - 34; const x2 = right + 34; return `M${x1} ${y} L${x1} ${y + 14} L${x2} ${y + 14} L${x2} ${y}`; }
  return `M${left} ${mid} L${right} ${mid}`;
}

export default function QuarterDiagram({ lit }) {
  const uid = useId().replace(/:/g, '');
  const quarterLit = useMemo(() => QUARTERS.map((q, i) => QUARTER_NODES.some((n) => n.quarter === i && lit.has(n.id))), [lit]);
  const links = useMemo(() => {
    const all = QUARTER_LINKS.map((l) => ({ ...l, on: lit.has(l.from) && lit.has(l.to) }));
    return [...all.filter((l) => !l.on), ...all.filter((l) => l.on)];
  }, [lit]);
  return (
    <svg className="cmp-diagram cmp-diagram--quarters" viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label="Схема звʼязків між агентами за кварталами Клієнтського району">
      <defs>
        <marker id={`qa-${uid}`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M1 1 9 5 1 9z" fill="#EB9CEF" /></marker>
        <marker id={`qd-${uid}`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M1 1 9 5 1 9z" fill="#7C5C85" /></marker>
      </defs>
      {QUARTERS.map((q, i) => <rect key={q.key} className={'cmp-col' + (quarterLit[i] ? ' is-lit' : '')} x={panelX(i)} y={TOP_LANE} width={PANEL_W} height={PANEL_H} rx="20" />)}
      {QUARTERS.map((q, i) => <text key={q.key} className="cmp-stage-title" x={panelX(i) + PANEL_W / 2} y={TOP_LANE + 23} textAnchor="middle">{q.label}</text>)}
      <g className="cmp-edges">
        {QUARTER_FLOWS.map((f) => {
          const on = quarterLit[f.from] && quarterLit[f.to];
          return <path key={f.from + '-' + f.to} className={'cmp-edge cmp-flow-edge' + (on ? ' is-lit' : '')} d={flowPath(f)} markerEnd={`url(#${on ? 'qa' : 'qd'}-${uid})`} fill="none" />;
        })}
        {links.map((l) => <path key={l.from + l.to} className={'cmp-edge' + (l.on ? ' is-lit' : '') + (l.required ? ' is-required' : '')} d={linkPath(l)} markerEnd={`url(#${l.on ? 'qa' : 'qd'}-${uid})`} fill="none" />)}
      </g>
      <g className="cmp-nodes">
        {QUARTER_NODES.map((n) => {
          const p = BOX[n.id];
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
