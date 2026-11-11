import { useEffect, useMemo, useState } from 'react';
import { iconPath } from './parts';

// «Етапи завдання» as a route (owner's pick 2026-11-11, artifact 4bsktowXd2L1s4mrvwh5ZP; simplified the same day: «вся цепочка в таком виде»): the stops are the steps of
// the chain of agents, the parallel steps branch and meet again. EVERY leg is the same: a violet dashed line with a small file travelling along it. A leg that leaves a
// step that has not started (or waits, or failed) is dim and carries no file. The stop shows the state: green check (done), pink pulse (working), amber pulse (waits for
// the person), red (failed). Everything moves with SMIL and stops (files stand in the middle of their legs) when the system asks for less motion.
//   stages: [{ key, label, state: 'done' | 'working' | 'waiting' | 'failed' | 'idle', note?, parallel? }]
const COLOR = { done: '#4BE07F', working: '#EB9CEF', waiting: '#FBBF24', failed: '#FF8A8A', idle: 'rgba(235, 156, 239, .5)' };
const NOTE = { done: 'готово', working: 'працює', waiting: 'чекає на ваше рішення', failed: 'впав крок', idle: 'у черзі' };
const ICON = { strategy: 'strategy', brief: 'doc', copy: 'pen', maker: 'img', quality: 'shield', you: 'user' };
const W = 800, PADX = 66, STEP_Y = 62, R = 19;

function useCalm() {
  const [calm, setCalm] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
    if (!mq) return undefined;
    const on = () => setCalm(mq.matches);
    on();
    if (mq.addEventListener) mq.addEventListener('change', on);
    return () => { if (mq.removeEventListener) mq.removeEventListener('change', on); };
  }, []);
  return calm;
}

const legPath = (a, b) => `M${a.x},${a.y} C${a.x + 56},${a.y} ${b.x - 56},${b.y} ${b.x},${b.y}`;

// a small file in a violet disc
function File({ x = 0, y = 0 }) {
  return (
    <g transform={`translate(${x},${y})`}>
      <circle r="11" fill="#B544B5" stroke="#F6E9FA" strokeWidth="1.6" />
      <g transform="translate(-6.5,-6.5) scale(.54)" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d={iconPath('doc')} /></g>
    </g>
  );
}

export function StageRoute({ stages = [], currentKey = null }) {
  const calm = useCalm();
  const geo = useMemo(() => {
    // consecutive steps with the same `parallel` mark make one group, drawn one over the other
    const groups = [];
    stages.forEach((s) => { const last = groups[groups.length - 1]; if (s.parallel && last && last.parallel === s.parallel) last.items.push(s); else groups.push({ parallel: s.parallel, items: [s] }); });
    const maxK = Math.max(1, ...groups.map((g) => g.items.length));
    const minY = maxK > 1 ? 50 : 34;
    const half = ((maxK - 1) * STEP_Y) / 2;
    const mid = minY + half;
    const H = mid + half + 62;
    const n = groups.length;
    const nodes = [];
    groups.forEach((g, gi) => {
      const x = n === 1 ? W / 2 : PADX + gi * ((W - 2 * PADX) / (n - 1));
      g.items.forEach((s, j) => nodes.push({ ...s, x, y: mid + (j - (g.items.length - 1) / 2) * STEP_Y, gi, j, k: g.items.length }));
    });
    const legs = [];
    for (let gi = 0; gi + 1 < groups.length; gi += 1) {
      const A = nodes.filter((nd) => nd.gi === gi), B = nodes.filter((nd) => nd.gi === gi + 1);
      if (A.length === 1 || B.length === 1) A.forEach((a) => B.forEach((b) => legs.push({ a, b })));
      else for (let j = 0; j < Math.min(A.length, B.length); j += 1) legs.push({ a: A[j], b: B[j] });
    }
    legs.forEach((l) => { l.live = l.a.state === 'done' || l.a.state === 'working'; l.d = legPath(l.a, l.b); l.mx = (l.a.x + l.b.x) / 2; l.my = (l.a.y + l.b.y) / 2; });
    return { nodes, legs, H };
  }, [stages]);

  const label = stages.map((s) => `${s.label}: ${s.note || NOTE[s.state] || ''}`).join('; ');
  return (
    <div className="pcd-route">
      <svg viewBox={`0 0 ${W} ${geo.H}`} role="img" aria-label={`Етапи завдання. ${label}`}>
        {geo.legs.map((l, i) => (
          <path key={'l' + i} d={l.d} fill="none" strokeWidth="3.5" strokeLinecap="round" strokeDasharray="2.5 10"
            stroke={l.live ? 'rgba(235, 156, 239, .9)' : 'rgba(235, 156, 239, .26)'}>
            {l.live && !calm && <animate attributeName="stroke-dashoffset" values="0;-25" dur="1.5s" repeatCount="indefinite" />}
          </path>
        ))}
        {geo.legs.filter((l) => l.live).map((l, i) => (calm
          ? <File key={'f' + i} x={l.mx} y={l.my} />
          : (
            <g key={'f' + i}>
              <File />
              <animateMotion dur="3.2s" begin={`${(i * 0.55).toFixed(2)}s`} repeatCount="indefinite" path={l.d} keyPoints="0;1;1" keyTimes="0;.85;1" calcMode="linear" />
            </g>
          )))}
        {geo.nodes.map((s) => {
          const col = COLOR[s.state] || COLOR.idle;
          const up = s.k > 1 && s.j === 0; // the upper step of a branch is named above its stop, the others below
          return (
            <g key={s.key}>
              <g transform={`translate(${s.x},${s.y})`}>
                <circle r={R} fill={s.state === 'working' ? 'rgba(181, 68, 181, .35)' : '#2c0f2c'} stroke={col} strokeWidth="2.6" />
                {!calm && (s.state === 'working' || s.state === 'waiting') && (
                  <circle r={R} fill="none" stroke={col} strokeWidth="1.8">
                    <animate attributeName="r" values={`${R};${R + 12}`} dur="1.8s" repeatCount="indefinite" />
                    <animate attributeName="opacity" values=".8;0" dur="1.8s" repeatCount="indefinite" />
                  </circle>
                )}
                <g transform="translate(-8.5,-8.5) scale(.71)" fill="none" stroke={col} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={iconPath(s.state === 'done' ? 'check' : ICON[s.key] || 'doc')} /></g>
              </g>
              <text className="pcd-route-n" x={s.x} y={up ? s.y - 39 : s.y + 37}>{s.label}</text>
              <text className="pcd-route-s" x={s.x} y={up ? s.y - 26 : s.y + 50} style={{ fill: col }}>{s.note || NOTE[s.state] || ''}</text>
              {currentKey === s.key && <title>{s.label}</title>}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// The readiness of the cycle as a ring: the arc fills to the value; amber when the cycle waits for the person.
export function ProgressRing({ value = 0, tone = '' }) {
  const v = Math.max(0, Math.min(1, Number(value) || 0));
  const C = 2 * Math.PI * 38, col = tone === 'bad' ? '#FF8A8A' : tone === 'warn' ? '#FBBF24' : '#EB9CEF';
  return (
    <div className="pcd-ring" role="progressbar" aria-label="Готовність завдання" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(v * 100)}>
      <svg viewBox="0 0 92 92" aria-hidden="true">
        <circle cx="46" cy="46" r="38" fill="none" stroke="rgba(235, 156, 239, .16)" strokeWidth="9" />
        <circle cx="46" cy="46" r="38" fill="none" stroke={col} strokeWidth="9" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - v)} style={{ filter: `drop-shadow(0 0 6px ${col})` }} />
      </svg>
      <span>{Math.round(v * 100)}%</span>
    </div>
  );
}
