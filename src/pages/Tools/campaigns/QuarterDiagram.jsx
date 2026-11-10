import { useId, useMemo } from 'react';
import { PLATFORMS } from '../../../lib/agents/campaignTeam';
import { QUARTERS, QUARTER_LINKS, QUARTER_NODES } from '../../../lib/agents/campaignModes';

// The scheme of the wizard: four panels, the quarters of the client district. `lit` (a Set of node ids) is what works in the chosen mode: it glows, the rest
// fades. A link is a smooth curve from agent to agent: to the next quarter it leaves the right side and enters the left side; inside a quarter it is a
// straight arrow to the card below, or a bulge on one side (the same side at both ends), so nothing loops around a card. Required links are solid.
const NODE_W = 184;
const NODE_H = 52;
const ROW_GAP = 18;
const PAD_IN = 26; // the panel around the cards: room for the bulges
const PANEL_W = NODE_W + PAD_IN * 2;
const COL_GAP = 66;
const TOP_LANE = 8;
const BOT_LANE = 28;
const TITLE_H = 36;
const MARGIN = 8;
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
  const bulge = 30;
  if (l.kind === 'down') return `M${a.x + NODE_W / 2} ${a.y + NODE_H} L${b.x + NODE_W / 2} ${b.y}`;
  if (l.kind === 'left') return `M${a.x} ${cy(l.from)} C${a.x - bulge} ${cy(l.from)}, ${b.x - bulge} ${cy(l.to)}, ${b.x} ${cy(l.to)}`;
  if (l.kind === 'right') return `M${a.x + NODE_W} ${cy(l.from)} C${a.x + NODE_W + bulge} ${cy(l.from)}, ${b.x + NODE_W + bulge} ${cy(l.to) - 8}, ${b.x + NODE_W} ${cy(l.to) - 8}`;
  const x1 = a.x + NODE_W;
  const x2 = b.x;
  if (l.kind === 'around') { const yB = TOP_LANE + PANEL_H + 14; return `M${x1} ${cy(l.from)} C${x1 + 50} ${cy(l.from)}, ${x1 + 50} ${yB}, ${x1 + 110} ${yB} L${x2 - 110} ${yB} C${x2 - 50} ${yB}, ${x2 - 50} ${cy(l.to)}, ${x2} ${cy(l.to)}`; }
  const dx = Math.max(30, (x2 - x1) * 0.5);
  return `M${x1} ${cy(l.from)} C${x1 + dx} ${cy(l.from)}, ${x2 - dx} ${cy(l.to)}, ${x2} ${cy(l.to)}`;
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
        <marker id={`qa-${uid}`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M1 1 9 5 1 9z" fill="#c76dff" /></marker>
        <marker id={`qd-${uid}`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M1 1 9 5 1 9z" fill="#6b5a85" /></marker>
      </defs>
      {QUARTERS.map((q, i) => (
        <g key={q.key} className={'cmp-colhead' + (quarterLit[i] ? ' is-lit' : '')}>
          <circle className="cmp-colhead-dot" cx={panelX(i) + PAD_IN + 6} cy={TOP_LANE + 19} r="4" />
          <text className="cmp-stage-title" x={panelX(i) + PAD_IN + 18} y={TOP_LANE + 23}>{q.label}</text>
          <line className="cmp-colhead-line" x1={panelX(i) + PAD_IN} y1={TOP_LANE + 30} x2={panelX(i) + PAD_IN + NODE_W} y2={TOP_LANE + 30} />
        </g>
      ))}
      <g className="cmp-edges">
        {links.map((l) => <path key={l.from + l.to} className={'cmp-edge' + (l.on ? ' is-lit' : '') + (l.required ? ' is-required' : '')} d={linkPath(l)} markerEnd={`url(#${l.on ? 'qa' : 'qd'}-${uid})`} fill="none" />)}
      </g>
      <g className="cmp-nodes">
        {QUARTER_NODES.map((n) => {
          const p = BOX[n.id];
          const on = lit.has(n.id);
          return (
            <g key={n.id} className={'cmp-node' + (on ? ' is-lit' : ' is-dim') + (n.planned ? ' is-planned' : '')} transform={`translate(${p.x} ${p.y})`} style={{ '--accent': accentOf(n) }} aria-label={n.name + (n.planned ? ', заплановано' : '')}>
              <rect className="cmp-node-box" width={NODE_W} height={NODE_H} rx="16" />
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
