import { useId, useMemo } from 'react';
import { CAMPAIGN_LINKS, CAMPAIGN_ROLES, PLATFORMS, STAGES } from '../../../lib/agents/campaignTeam';

// The structural scheme of the campaign team: who depends on whom. Columns are the stages of the work, arrows are the links.
// `active` (a Set of roles) is the part of the chain that works on the chosen campaign: it glows, the rest fades. `states`
// (role -> 'on' | 'off' | 'blocked' | 'paused') paints a live campaign.
const NODE_W = 176;
const NODE_H = 60;
const COL_GAP = 66;
const ROW_GAP = 18;
const HEAD = 38;
const PAD = 14;

const accentOf = (def) => (def.platforms.includes('*') ? '#EB9CEF' : PLATFORMS[def.platforms[0]]?.color || '#EB9CEF');

export function layout() {
  const cols = STAGES.map((s) => CAMPAIGN_ROLES.filter((r) => r.stage === s.key).sort((a, b) => a.row - b.row));
  const maxRows = Math.max(...cols.map((c) => c.length));
  const colH = maxRows * NODE_H + (maxRows - 1) * ROW_GAP;
  const pos = {};
  cols.forEach((col, ci) => {
    const startY = HEAD + PAD + (colH - (col.length * NODE_H + (col.length - 1) * ROW_GAP)) / 2;
    col.forEach((def, ri) => { pos[def.role] = { x: PAD + ci * (NODE_W + COL_GAP), y: startY + ri * (NODE_H + ROW_GAP) }; });
  });
  return { pos, width: PAD * 2 + STAGES.length * NODE_W + (STAGES.length - 1) * COL_GAP, height: HEAD + PAD * 2 + colH };
}

const STATE_DOT = { on: '#5FE0A1', off: '#8D7A93', blocked: '#FF7A9A', paused: '#F2B94B' };

export default function ChainDiagram({ active, states, selected, onSelect, compact = false }) {
  const uid = useId().replace(/:/g, '');
  const { pos, width, height } = useMemo(layout, []);
  const isOn = (role) => !active || active.has(role);

  return (
    <svg className={'cmp-diagram' + (compact ? ' is-compact' : '')} viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Схема звʼязків між агентами кампанії">
      <defs>
        <marker id={`arrow-${uid}`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M1 1 9 5 1 9z" fill="#EB9CEF" /></marker>
        <marker id={`arrow-dim-${uid}`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M1 1 9 5 1 9z" fill="#7C5C85" /></marker>
        <filter id={`glow-${uid}`} x="-30%" y="-40%" width="160%" height="180%"><feGaussianBlur stdDeviation="5" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
      </defs>

      {STAGES.map((s, i) => (
        <text key={s.key} className="cmp-stage-title" x={PAD + i * (NODE_W + COL_GAP) + NODE_W / 2} y={HEAD - 8} textAnchor="middle">{s.label}</text>
      ))}

      <g className="cmp-edges">
        {CAMPAIGN_LINKS.map((l) => {
          const a = pos[l.from];
          const b = pos[l.to];
          if (!a || !b) return null;
          const lit = isOn(l.from) && isOn(l.to);
          const x1 = a.x + NODE_W;
          const y1 = a.y + NODE_H / 2;
          const x2 = b.x;
          const y2 = b.y + NODE_H / 2;
          const dx = Math.max(30, (x2 - x1) * 0.5);
          // a link that skips a column goes over the nodes in between: it is bent upwards a little so it stays readable
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
              <rect className="cmp-node-box" width={NODE_W} height={NODE_H} rx="13" filter={lit && active ? `url(#glow-${uid})` : undefined} />
              <rect className="cmp-node-bar" x="0" y="10" width="4" height={NODE_H - 20} rx="2" />
              <text className="cmp-node-name" x="16" y="25">{def.name}</text>
              <text className="cmp-node-short" x="16" y="43">{def.short}</text>
              {st && <circle cx={NODE_W - 14} cy="14" r="5" fill={STATE_DOT[st] || STATE_DOT.off} />}
            </g>
          );
        })}
      </g>
    </svg>
  );
}
