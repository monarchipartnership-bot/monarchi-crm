import { roasTone } from '../../lib/projectsDashboard';
import { moneyK, money } from './DashCharts';

// The charts of the dashboard of the projects in the plum look (owner's picks 2026-11-12, artifact UQmRdrabPQkKgMAFBZ6LwB): the flow of the month's spend, the heat map of the
// ROAS by weeks, the matrix of the weekly reports, the pace of the month and the board with the dynamics. Plain SVG / HTML, the numbers come from lib/projectsDashboard.js.
const TONE_FILL = { hi: '#4BE07F', mid: '#FBBF24', lo: '#FF8A8A', none: '#8a6a98' };
const roasText = (r) => (r === null || r === undefined ? '—' : r.toFixed(1).replace('.', ','));
const roasFull = (r) => (r === null || r === undefined ? '—' : r.toFixed(2).replace('.', ',') + 'x');

export function RoasLegend() {
  return (
    <div className="pdn-leg" aria-label="Кольори ROAS">
      <span><i style={{ background: TONE_FILL.hi }} />ROAS від 3x</span>
      <span><i style={{ background: TONE_FILL.mid }} />2–3x</span>
      <span><i style={{ background: TONE_FILL.lo }} />нижче 2x</span>
    </div>
  );
}

const PLATFORM_FILL = { meta: '#7FB2FF', google: '#FBBF24', other: '#C25AC4' };

// Platforms on the left, projects on the right, the curves are the spend; the colour of a project is its ROAS.
export function FlowChart({ data }) {
  const W = 640; const NODE_L = 120; const NODE_R = W - 215; const GAP = 4;
  const { left, right, links, total } = data;
  if (!total) return null;
  const H = Math.max(260, Math.min(380, 40 + right.length * 34));
  const sc = (H - 24 - GAP * (right.length - 1)) / total;
  const rpos = {}; let ry = 12;
  right.forEach((p) => { rpos[p.id] = ry; ry += Math.max(p.spend * sc, 3) + GAP; });
  const lGap = 18; const lsc = (H - 24 - lGap * (left.length - 1)) / total;
  const lpos = {}; let ly = 12;
  left.forEach((l) => { lpos[l.key] = ly; ly += l.spend * lsc + lGap; });
  const lcur = { ...lpos }; const rcur = { ...rpos };
  const toneOf = new Map(right.map((p) => [p.id, roasTone(p.roas)]));
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Куди з платформ пішли витрати місяця" className="pdn-flow">
      {left.flatMap((l) => right.filter((p) => links.some((k) => k.from === l.key && k.to === p.id)).map((p) => {
        const v = links.find((k) => k.from === l.key && k.to === p.id).spend;
        const h1 = v * lsc; const h2 = v * sc;
        const y1 = lcur[l.key]; const y2 = rcur[p.id]; lcur[l.key] += h1; rcur[p.id] += h2;
        const c = (NODE_R - NODE_L) * 0.5;
        return <path key={l.key + p.id} d={`M${NODE_L},${y1} C${NODE_L + c},${y1} ${NODE_R - c},${y2} ${NODE_R},${y2} L${NODE_R},${y2 + h2} C${NODE_R - c},${y2 + h2} ${NODE_L + c},${y1 + h1} ${NODE_L},${y1 + h1} Z`} fill={PLATFORM_FILL[l.key]} fillOpacity=".3"><title>{`${l.label} → ${p.name}: ${money(v)}`}</title></path>;
      }))}
      {left.map((l) => (
        <g key={l.key}>
          <rect x={NODE_L - 14} y={lpos[l.key]} width="14" height={Math.max(l.spend * lsc, 3)} rx="5" fill={PLATFORM_FILL[l.key]} />
          <text x={NODE_L - 22} y={lpos[l.key] + Math.max(l.spend * lsc, 3) / 2 + 4} fill="#F6E9FA" fontSize="12.5" fontWeight="800" textAnchor="end">{l.label}</text>
        </g>
      ))}
      {right.map((p) => {
        const h = Math.max(p.spend * sc, 3);
        return (
          <g key={p.id}>
            <rect x={NODE_R} y={rpos[p.id]} width="14" height={h} rx="5" fill={TONE_FILL[toneOf.get(p.id)]} />
            <text x={NODE_R + 22} y={rpos[p.id] + h / 2 + 4} fill="#F6E9FA" fontSize="11.5">{(p.name.length > 22 ? p.name.slice(0, 21) + '…' : p.name) + ' · ' + moneyK(p.spend)}</text>
          </g>
        );
      })}
    </svg>
  );
}

// Projects x weeks, the colour is the ROAS of the week.
export function HeatMap({ rows, weekLabels }) {
  return (
    <div className="pdn-scroll">
      <table className="pdn-mx">
        <thead><tr><th />{weekLabels.map((w) => <th key={w}>{w}</th>)}</tr></thead>
        <tbody>
          {rows.map((p) => (
            <tr key={p.id}>
              <th scope="row" className="l" title={p.name}>{p.name}</th>
              {p.weeks.map((w, i) => <td key={i} className={'pdn-hc ' + roasTone(w.roas)} title={`${weekLabels[i]}: витрати ${money(w.spend)}, ROAS ${roasFull(w.roas)}`}>{roasText(w.roas)}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const STATUS_TEXT = { final: 'Затверджено', rework: 'Доробка', draft: 'Чернетка', none: 'Немає' };
export function StatusLegend() {
  return (
    <div className="pdn-leg" aria-label="Статуси звіту">
      <span><i className="dot final" />Фінал</span><span><i className="dot rework" />Доробка</span><span><i className="dot draft" />Чернетка</span><span><i className="dot none" />Немає</span>
    </div>
  );
}

// Projects x weeks, a dot is the status of the weekly report.
export function StatusMatrix({ rows, weekLabels, onOpen }) {
  return (
    <div className="pdn-scroll">
      <table className="pdn-mx dots">
        <thead><tr><th />{weekLabels.map((w) => <th key={w}>{w}</th>)}</tr></thead>
        <tbody>
          {rows.map((p) => (
            <tr key={p.id}>
              <th scope="row" className="l" title={p.name}>{onOpen ? <button type="button" className="pdn-link" onClick={() => onOpen(p.id)}>{p.name}</button> : p.name}</th>
              {p.weeks.map((s, i) => <td key={i} title={`${weekLabels[i]}: ${STATUS_TEXT[s]}`}><span className={'dot ' + s} /></td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// An arc: spend so far, the forecast of the month and a white mark where the whole of the last month ended.
export function PaceArc({ pace }) {
  const cx = 130; const cy = 118; const r = 90;
  const top = Math.max(pace.forecast, pace.prev, pace.spent) * 1.15;
  const pt = (f, rr) => [cx + rr * Math.cos(Math.PI * (1 - f)), cy - rr * Math.sin(Math.PI * (1 - f))];
  const arc = (f0, f1, c, w) => {
    const a = pt(f0, r); const b = pt(Math.min(f1, 1), r);
    return <path d={`M${a.join(',')} A${r},${r} 0 0 1 ${b.join(',')}`} fill="none" stroke={c} strokeWidth={w} strokeLinecap="round" />;
  };
  const m1 = pt(pace.prev / top, r + 11); const m2 = pt(pace.prev / top, r - 14);
  return (
    <svg viewBox="0 0 260 150" width="100%" style={{ maxHeight: 180 }} role="img" aria-label={`Витрати ${money(pace.spent)}, прогноз ${money(pace.forecast)}`}>
      {arc(0, 1, 'rgba(255,255,255,.08)', 16)}
      {arc(0, pace.forecast / top, 'rgba(181,68,181,.35)', 16)}
      {arc(0.0001, pace.spent / top, '#C25AC4', 16)}
      {pace.prev > 0 && <line x1={m1[0]} y1={m1[1]} x2={m2[0]} y2={m2[1]} stroke="#fff" strokeWidth="2.5"><title>{`Минулий місяць: ${money(pace.prev)}`}</title></line>}
      <text x="130" y="106" fill="#fff" fontSize="26" fontWeight="800" textAnchor="middle">{moneyK(pace.spent)}</text>
      <text x="130" y="125" fill="#D6AEE0" fontSize="11.5" textAnchor="middle">{'прогноз ' + moneyK(pace.forecast)}</text>
    </svg>
  );
}

export function MiniSpark({ values, tone }) {
  if (!values || values.length < 2) return <span className="pdn-nospark">—</span>;
  const w = 90; const h = 26;
  const mx = Math.max(...values); const mn = Math.min(...values);
  const pts = values.map((v, i) => [i * (w / (values.length - 1)), h - 3 - ((v - mn) / (mx - mn || 1)) * (h - 6)]);
  const c = TONE_FILL[tone] || TONE_FILL.none;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width={w} height={h} aria-hidden="true">
      <path d={'M' + pts.map((p) => p.join(',')).join(' L')} fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r="3" fill={c} />
    </svg>
  );
}

// The board of the month: rank, project, weekly dynamics of the spend, spend, revenue, ROAS.
export function Board({ rows, onOpen }) {
  return (
    <div className="pdn-scroll">
      <table className="pdn-tb">
        <thead><tr><th className="n">#</th><th className="l">Проєкт</th><th>Динаміка</th><th className="r">Витрати</th><th className="r">Дохід</th><th className="r">ROAS</th></tr></thead>
        <tbody>
          {rows.map((p, i) => (
            <tr key={p.id}>
              <td className="n">{i + 1}</td>
              <td className="l"><button type="button" className="pdn-link" onClick={() => onOpen(p.id)}>{p.name}</button></td>
              <td className="c"><MiniSpark values={p.spark} tone={roasTone(p.roas)} /></td>
              <td className="r">{money(p.spend)}</td><td className="r">{money(p.revenue)}</td>
              <td className="r"><span className={'pdn-pill ' + roasTone(p.roas)}>{roasFull(p.roas)}</span></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
