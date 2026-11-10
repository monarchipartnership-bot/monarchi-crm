import { useId, useMemo } from 'react';
import { CAMPAIGN_LINKS, CAMPAIGN_ROLES, PLATFORMS, STAGES } from '../../../lib/agents/campaignTeam';

// The structural scheme of the campaign team: who depends on whom. Columns are the stages of the work, arrows are the links.
// `active` (a Set of roles) is the part of the chain that works on the chosen campaign: it glows, the rest fades. `states`
// (role -> 'on' | 'off' | 'blocked' | 'paused') paints a live campaign.
const NODE_W = 204;
const NODE_H = 54;
const COL_GAP = 44;
const ROW_GAP = 14;
const HEAD = 34;
const PAD = 14;

const accentOf = (def) => (def.platforms.includes('*') ? '#EB9CEF' : PLATFORMS[def.platforms[0]]?.color || '#EB9CEF');

// Every agent sits on the row given in its definition (`row`), so related agents stand in one line: the analyst and the optimizer of a channel, the
// creative strategist and the copywriter. A column is a lighter band behind its cards; the links go behind the cards.
export function layout() {
  const rows = Math.max(...CAMPAIGN_ROLES.map((r) => r.row)) + 1;
  const colH = rows * NODE_H + (rows - 1) * ROW_GAP;
  const pos = {};
  CAMPAIGN_ROLES.forEach((def) => {
    const ci = STAGES.findIndex((s) => s.key === def.stage);
    pos[def.role] = { x: PAD + ci * (NODE_W + COL_GAP), y: HEAD + 6 + def.row * (NODE_H + ROW_GAP) };
  });
  return { pos, width: PAD * 2 + STAGES.length * NODE_W + (STAGES.length - 1) * COL_GAP, height: HEAD + 6 + colH + 8, colH };
}

const STATE_DOT = { on: '#4BE07F', off: '#8D7A93', blocked: '#FF8A8A', paused: '#FBBF24' };

export default function ChainDiagram({ active, states, selected, onSelect, compact = false }) {
  const uid = useId().replace(/:/g, '');
  const { pos, width, height, colH } = useMemo(layout, []);
  const isOn = (role) => !active || active.has(role);
  // the links that do not work on this campaign go first (under), the working ones over them
  const edges = useMemo(() => {
    const all = CAMPAIGN_LINKS.filter((l) => pos[l.from] && pos[l.to]).map((l) => ({ ...l, lit: isOn(l.from) && isOn(l.to) }));
    return [...all.filter((l) => !l.lit), ...all.filter((l) => l.lit)];
  }, [pos, active]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <svg className={'cmp-diagram' + (compact ? ' is-compact' : '')} viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Схема звʼязків між агентами операції">
      <defs>
        <marker id={`arrow-${uid}`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M1 1 9 5 1 9z" fill="#EB9CEF" /></marker>
        <marker id={`arrow-dim-${uid}`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M1 1 9 5 1 9z" fill="#8a6a98" /></marker>
        <filter id={`glow-${uid}`} x="-30%" y="-40%" width="160%" height="180%"><feGaussianBlur stdDeviation="5" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
      </defs>

      {STAGES.map((s, i) => {
        const x = PAD + i * (NODE_W + COL_GAP);
        return (
          <g key={s.key} className="cmp-colhead">
            <circle className="cmp-colhead-dot" cx={x + 6} cy={HEAD - 17} r="4" />
            <text className="cmp-stage-title" x={x + 18} y={HEAD - 13}>{s.label}</text>
            <line className="cmp-colhead-line" x1={x} y1={HEAD - 6} x2={x + NODE_W} y2={HEAD - 6} />
          </g>
        );
      })}

      <g className="cmp-edges">
        {edges.map((l) => {
          const a = pos[l.from];
          const b = pos[l.to];
          const lit = l.lit;
          const x1 = a.x + NODE_W;
          const y1 = a.y + NODE_H / 2;
          const x2 = b.x;
          const y2 = b.y + NODE_H / 2;
          const dx = Math.max(24, (x2 - x1) * 0.45);
          return (
            <path
              key={l.from + l.to}
              className={'cmp-edge' + (lit ? ' is-lit' : '') + (l.required ? ' is-required' : '')}
              d={`M${x1} ${y1} C${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`}
              markerEnd={`url(#${lit ? 'arrow' : 'arrow-dim'}-${uid})`}
              fill="none"
            />
          );
        })}
      </g>

      <g className="cmp-nodes">
        {CAMPAIGN_ROLES.map((def) => {
          const p = pos[def.role];
          const lit = isOn(def.role);
          const accent = accentOf(def);
          const st = states?.[def.role];
          return (
            <g
              key={def.role} className={'cmp-node' + (lit ? ' is-lit' : ' is-dim') + (selected === def.role ? ' is-selected' : '') + (onSelect && lit ? ' is-clickable' : '')}
              transform={`translate(${p.x} ${p.y})`} style={{ '--accent': accent }}
              onClick={onSelect && lit ? () => onSelect(def.role) : undefined}
              role={onSelect && lit ? 'button' : undefined} tabIndex={onSelect && lit ? 0 : undefined}
              onKeyDown={onSelect && lit ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(def.role); } } : undefined}
              aria-label={def.name + (st ? ', ' + st : '')}
            >
              <rect className="cmp-node-box" width={NODE_W} height={NODE_H} rx="16" filter={lit && active ? `url(#glow-${uid})` : undefined} />
              <rect className="cmp-node-bar" x="0" y="12" width="4" height={NODE_H - 24} rx="2" />
              <text className="cmp-node-name" x="16" y="23">{def.name}</text>
              <text className="cmp-node-short" x="16" y="40">{def.short}</text>
              {st && <circle cx={NODE_W - 14} cy="14" r="5" fill={STATE_DOT[st] || STATE_DOT.off} />}
            </g>
          );
        })}
      </g>
    </svg>
  );
}
