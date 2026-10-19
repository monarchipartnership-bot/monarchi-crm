import { useId, useMemo } from 'react';
import { SMM_ROLES } from '../../lib/agents/smmTeam';
import { stateOf } from './agentUi';
import '../../styles/campaignsSection.css'; // the node / edge look of the AI Agents scheme, shared on purpose

// The scheme of the SMM team: columns are the stages of the work, arrows are the links between the agents. It is drawn from the team's
// real data: an agent that is switched on glows with a green dot, a switched-off, stopped or waiting one is faded, and a link is lit only
// while both of its ends work. A click opens the agent. The return arrow (the publisher gives the result back to the social analyst) goes
// under the whole chain.
export const SMM_STAGES = [
  { key: 'research', title: 'Дослідження', hint: 'Збирають дані для плану', roles: ['site_analyst', 'seo', 'competitors', 'social_analyst'] },
  { key: 'plan', title: 'Планування', hint: 'План тижня і завдання', roles: ['strategist'] },
  { key: 'production', title: 'Виробництво', hint: 'Паралельно, на кожен пост', roles: ['copywriter', 'visual'] },
  { key: 'control', title: 'Контроль', hint: 'Перед вашим схваленням', roles: ['qc'] },
  { key: 'publish', title: 'Публікація', hint: 'Після вашого схвалення', roles: ['publisher'] },
];

const NODE_W = 184;
const NODE_H = 60;
const COL_GAP = 70;
const ROW_GAP = 20;
const HEAD = 40;
const PAD = 16;
const DOT = { on: '#5FE0A1', off: '#8D7A93', blocked: '#FF7A9A', wait: '#F2B94B' };
const ACCENT = '#AE40AE';

function layout() {
  const colH = Math.max(...SMM_STAGES.map((s) => s.roles.length)) * NODE_H + (Math.max(...SMM_STAGES.map((s) => s.roles.length)) - 1) * ROW_GAP;
  const pos = {};
  SMM_STAGES.forEach((s, ci) => {
    const startY = HEAD + PAD + (colH - (s.roles.length * NODE_H + (s.roles.length - 1) * ROW_GAP)) / 2;
    s.roles.forEach((role, ri) => { pos[role] = { x: PAD + ci * (NODE_W + COL_GAP), y: startY + ri * (NODE_H + ROW_GAP), col: ci }; });
  });
  const bottom = HEAD + PAD + colH;
  return { pos, bottom, width: PAD * 2 + SMM_STAGES.length * NODE_W + (SMM_STAGES.length - 1) * COL_GAP, height: bottom + 44 };
}

export default function SmmChainDiagram({ team, onSelect }) {
  const uid = useId().replace(/:/g, '');
  const { pos, bottom, width, height } = useMemo(layout, []);
  const byRole = new Map(team.agents.map((a) => [a.role, a]));
  const roleOf = new Map(team.agents.map((a) => [a.id, a.role]));
  const states = {};
  team.agents.forEach((a) => { states[a.role] = stateOf(a, team).key; });
  const lit = (role) => states[role] === 'on';
  const links = team.links.map((l) => ({ from: roleOf.get(l.from_agent_id), to: roleOf.get(l.to_agent_id), required: l.required })).filter((l) => pos[l.from] && pos[l.to]);

  function edge(l) {
    const a = pos[l.from];
    const b = pos[l.to];
    if (b.col < a.col) {
      // the way back: down from the sender, under every node, up into the receiver
      const x1 = a.x + NODE_W / 2;
      const y1 = a.y + NODE_H;
      const x2 = b.x + NODE_W / 2;
      const y2 = b.y + NODE_H;
      const yb = bottom + 22;
      return `M${x1} ${y1} L${x1} ${yb - 8} Q${x1} ${yb} ${x1 - 8} ${yb} L${x2 + 8} ${yb} Q${x2} ${yb} ${x2} ${yb - 8} L${x2} ${y2 + 2}`;
    }
    if (b.col === a.col) {
      // two agents in one column: a short line from the bottom of the upper one to the top of the lower one
      const x = a.x + NODE_W / 2;
      return a.y < b.y ? `M${x} ${a.y + NODE_H} L${x} ${b.y - 2}` : `M${x} ${a.y} L${x} ${b.y + NODE_H + 2}`;
    }
    const x1 = a.x + NODE_W;
    const y1 = a.y + NODE_H / 2;
    const x2 = b.x;
    const y2 = b.y + NODE_H / 2;
    const dx = Math.max(30, (x2 - x1) * 0.5);
    return `M${x1} ${y1} C${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
  }

  return (
    <svg className="cmp-diagram smm-diagram" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Схема звʼязків між агентами SMM-команди">
      <defs>
        <marker id={`a-${uid}`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M1 1 9 5 1 9z" fill={ACCENT} /></marker>
        <marker id={`d-${uid}`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M1 1 9 5 1 9z" fill="#C9AED3" /></marker>
        <linearGradient id={`on-${uid}`} x1="0" y1="0.4" x2="1" y2="0.6"><stop offset="0" stopColor="#B544B5" /><stop offset="1" stopColor="#661466" /></linearGradient>
        <linearGradient id={`off-${uid}`} x1="0" y1="0.4" x2="1" y2="0.6"><stop offset="0" stopColor="#C99ECE" /><stop offset="1" stopColor="#85608F" /></linearGradient>
      </defs>

      {SMM_STAGES.map((s, i) => (
        <text key={s.key} className="cmp-stage-title" x={PAD + i * (NODE_W + COL_GAP) + NODE_W / 2} y={HEAD - 10} textAnchor="middle">{s.title}</text>
      ))}

      <g className="cmp-edges">
        {links.map((l) => {
          const on = lit(l.from) && lit(l.to);
          return <path key={l.from + l.to} className={'cmp-edge' + (on ? ' is-lit' : '') + (l.required ? ' is-required' : '')} d={edge(l)} markerEnd={`url(#${on ? 'a' : 'd'}-${uid})`} fill="none" />;
        })}
      </g>

      <g className="cmp-nodes">
        {SMM_STAGES.flatMap((s) => s.roles).map((role) => {
          const p = pos[role];
          const a = byRole.get(role);
          if (!a) return null;
          const st = states[role];
          const meta = SMM_ROLES.find((r) => r.role === role);
          return (
            <g
              key={role} className={'cmp-node is-clickable ' + (st === 'on' ? 'is-lit' : 'smm-faded')} transform={`translate(${p.x} ${p.y})`} style={{ '--accent': ACCENT }}
              onClick={() => onSelect(role)} role="button" tabIndex={0} aria-label={`${a.name}: відкрити`}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(role); } }}
            >
              <rect className="cmp-node-box" width={NODE_W} height={NODE_H} rx="13" style={{ fill: `url(#${st === 'on' ? 'on' : 'off'}-${uid})`, stroke: 'transparent' }} />
              <rect className="cmp-node-bar" x="0" y="10" width="4" height={NODE_H - 20} rx="2" style={{ fill: '#ffffff8c' }} />
              <text className="cmp-node-name" x="16" y="25" style={{ fill: '#fff' }}>{a.name}</text>
              <text className="cmp-node-short" x="16" y="43" style={{ fill: st === 'on' ? '#F2DAF4' : '#F1E4F4' }}>{meta?.short || ''}</text>
              <circle cx={NODE_W - 14} cy="14" r="5" fill={DOT[st] || DOT.off} stroke="#ffffffb3" strokeWidth="1.5" />
            </g>
          );
        })}
      </g>
    </svg>
  );
}
