import { useState } from 'react';

// Hub-style charts of the Projects Dashboard: smooth wave trend, ring donut, concentric platform rings,
// pill bars. Plain SVG/HTML, no chart library.
const f2 = (n) => Math.round(n * 100) / 100;
const P = (cx, cy, r, a) => { const t = ((a - 90) * Math.PI) / 180; return [cx + r * Math.cos(t), cy + r * Math.sin(t)]; };
function arc(cx, cy, r, a0, a1) {
  const p0 = P(cx, cy, r, a0); const p1 = P(cx, cy, r, a1);
  return `M${f2(p0[0])} ${f2(p0[1])} A${r} ${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${f2(p1[0])} ${f2(p1[1])}`;
}
// Catmull-Rom → cubic bezier through the points.
function smooth(pts) {
  let d = `M${f2(pts[0][0])} ${f2(pts[0][1])}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i]; const p1 = pts[i]; const p2 = pts[i + 1]; const p3 = pts[i + 2] || p2;
    d += ` C${f2(p1[0] + (p2[0] - p0[0]) / 6)} ${f2(p1[1] + (p2[1] - p0[1]) / 6)} ${f2(p2[0] - (p3[0] - p1[0]) / 6)} ${f2(p2[1] - (p3[1] - p1[1]) / 6)} ${f2(p2[0])} ${f2(p2[1])}`;
  }
  return d;
}
function niceStep(max) {
  const raw = Math.max(max, 1) / 5; const pow = 10 ** Math.floor(Math.log10(raw));
  return ([1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].find((m) => m * pow >= raw) || 10) * pow;
}
export const money = (v) => '$' + Math.round(v || 0).toLocaleString('uk-UA');
export const moneyK = (v) => '$' + (v / 1000).toFixed(1).replace('.', ',') + 'K';
const tick = (v) => (v === 0 ? '0' : v >= 1000 ? `$${f2(v / 1000)}K` : `$${v}`);

export const G = { plum: ['#C25AC4', '#7E2483'], blue: ['#8FB2FF', '#2F6FED'], green: ['#4BE07F', '#12A144'], amber: ['#FBBF24', '#E08A06'], lilac: ['#C9A8D1', '#8E6A99'] };
const Grad = ({ id, c, v }) => (
  <linearGradient id={id} x1="0" y1="0" x2={v ? 0 : 1} y2={v ? 1 : 1}><stop offset="0" stopColor={c[0]} /><stop offset="1" stopColor={c[1]} /></linearGradient>
);

export function Legend({ items }) {
  return <div className="pd-lgd">{items.map((x) => <span key={x[0]}><i style={{ background: `linear-gradient(135deg,${x[1][0]},${x[1][1]})` }} />{x[0]}</span>)}</div>;
}

// KPI sparkline: smooth area with a ringed end point.
export function Spark({ values, c, id }) {
  const w = 96; const h = 44;
  const mx = Math.max(...values); const mn = Math.min(...values);
  const pts = values.map((v, i) => [3 + ((w - 6) * i) / Math.max(values.length - 1, 1), h - 6 - ((h - 12) * (v - mn)) / (mx - mn || 1)]);
  const d = smooth(pts); const last = pts[pts.length - 1];
  return (
    <svg className="pd-spk" viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
      <defs>
        <Grad id={id} c={c} v />
        <linearGradient id={id + 'f'} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={c[0]} stopOpacity=".35" /><stop offset="1" stopColor={c[0]} stopOpacity="0" /></linearGradient>
      </defs>
      <path d={`${d} L${w - 3} ${h} L3 ${h}Z`} fill={`url(#${id}f)`} />
      <path d={d} fill="none" stroke={`url(#${id})`} strokeWidth="3" strokeLinecap="round" />
      <circle cx={f2(last[0])} cy={f2(last[1])} r="4" fill="#fff" stroke={c[1]} strokeWidth="2.5" />
    </svg>
  );
}

// Spend / revenue over the last weeks: two glowing waves with ringed markers and a tooltip.
export function TrendChart({ labels, spend, revenue }) {
  const n = labels.length;
  const [hover, setHover] = useState(null);
  const sel = hover == null ? n - 1 : hover;
  const w = 720; const h = 290; const l = 54; const r = 22; const t = 30; const b = 36;
  const iw = w - l - r; const ih = h - t - b;
  const step = niceStep(Math.max(...revenue, ...spend, 0) * 1.25); const max = step * 5;
  const X = (i) => l + (iw * i) / Math.max(n - 1, 1);
  const Y = (v) => t + ih - (ih * v) / max;
  const pr = revenue.map((v, i) => [X(i), Y(v)]); const ps = spend.map((v, i) => [X(i), Y(v)]);
  const base = t + ih;
  const area = (pts) => `${smooth(pts)} L${f2(X(n - 1))} ${base} L${f2(X(0))} ${base}Z`;
  const colW = iw / Math.max(n - 1, 1);
  const tx = Math.max(l, Math.min(w - r - 150, X(sel) - 75));
  const ro = spend[sel] ? revenue[sel] / spend[sel] : null;
  return (
    <div className="pd-gx">
      <div className="pd-tsum">
        <span>Тиждень <b>{labels[sel]}</b></span>
        <span className="tv"><i style={{ background: `linear-gradient(135deg,${G.plum[0]},${G.plum[1]})` }} />Дохід <b>{money(revenue[sel])}</b></span>
        <span className="tv"><i style={{ background: `linear-gradient(135deg,${G.blue[0]},${G.blue[1]})` }} />Витрати <b>{money(spend[sel])}</b></span>
        <span className="pd-rcap hi">ROAS {ro === null ? '—' : ro.toFixed(2).replace('.', ',') + 'x'}</span>
      </div>
      <svg className="pd-gs pd-trsvg" viewBox={`0 0 ${w} ${h}`} role="img" aria-label="Витрати і дохід за тижнями" onMouseLeave={() => setHover(null)}>
        <defs>
          <Grad id="pdt-l1" c={G.plum} /><Grad id="pdt-l2" c={G.blue} />
          <linearGradient id="pdt-f1" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#B544B5" stopOpacity=".38" /><stop offset="1" stopColor="#B544B5" stopOpacity="0" /></linearGradient>
          <linearGradient id="pdt-f2" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#2F6FED" stopOpacity=".3" /><stop offset="1" stopColor="#2F6FED" stopOpacity="0" /></linearGradient>
        </defs>
        {[0, 1, 2, 3, 4, 5].map((g) => {
          const gy = t + ih - (ih * g) / 5;
          return <g key={g}><line x1={l} x2={w - r} y1={gy} y2={gy} className="pd-gl" /><text x={l - 10} y={gy + 4} className="pd-ax" textAnchor="end">{tick(step * g)}</text></g>;
        })}
        <path d={area(ps)} fill="url(#pdt-f2)" /><path d={area(pr)} fill="url(#pdt-f1)" />
        <path d={smooth(ps)} fill="none" stroke="url(#pdt-l2)" strokeWidth="3.5" strokeLinecap="round" className="pd-glw2" />
        <path d={smooth(pr)} fill="none" stroke="url(#pdt-l1)" strokeWidth="4" strokeLinecap="round" className="pd-glw1" />
        <line x1={f2(X(sel))} x2={f2(X(sel))} y1={t} y2={base} className="pd-guide" />
        {labels.map((lb, i) => {
          const on = i === sel;
          return (
            <g key={lb + i}>
              <circle cx={f2(X(i))} cy={f2(pr[i][1])} r={on ? 11 : 7} fill="#B544B5" opacity=".18" />
              <circle cx={f2(X(i))} cy={f2(pr[i][1])} r="5.5" fill="#fff" stroke="#8E1E8E" strokeWidth="3" />
              <circle cx={f2(X(i))} cy={f2(ps[i][1])} r={on ? 10 : 6} fill="#2F6FED" opacity=".18" />
              <circle cx={f2(X(i))} cy={f2(ps[i][1])} r="4.5" fill="#fff" stroke="#2F6FED" strokeWidth="3" />
              <text x={f2(X(i))} y={h - 10} textAnchor="middle" className={'pd-ax' + (on ? ' b sel' : '')}>{lb}</text>
              <rect x={f2(X(i) - colW / 2)} y="0" width={f2(colW)} height={h} fill="transparent" onMouseEnter={() => setHover(i)} onClick={() => setHover(i)} />
            </g>
          );
        })}
        <g transform={`translate(${f2(tx)},4)`} className="pd-tip" pointerEvents="none">
          <rect width="150" height="64" rx="16" />
          <text x="14" y="21" className="tt1">{labels[sel]} · ROAS {ro === null ? '—' : ro.toFixed(2).replace('.', ',') + 'x'}</text>
          <circle cx="18" cy="38" r="4" fill="#B544B5" /><text x="28" y="42" className="tt2">{money(revenue[sel])}</text>
          <circle cx="18" cy="54" r="4" fill="#2F6FED" /><text x="28" y="58" className="tt2">{money(spend[sel])}</text>
        </g>
      </svg>
    </div>
  );
}

// Project statuses: ring donut with rounded, separated segments and a count in the middle.
export function StatusDonut({ slices }) {
  const total = slices.reduce((s, x) => s + x.value, 0);
  const cap = ((22 / 2 / 72) * 180) / Math.PI; const gap = 5;
  let a = 0;
  const nonZero = slices.filter((x) => x.value > 0).length;
  return (
    <div className="pd-stw">
      <svg className="pd-gs pd-donut" viewBox="0 0 200 200" role="img" aria-label="Статуси проєктів">
        <defs>{slices.map((x, i) => <Grad key={i} id={'pds' + i} c={x.grad} />)}</defs>
        <circle cx="100" cy="100" r="72" className="pd-trk" strokeWidth="22" />
        {total > 0 && slices.map((x, i) => {
          const sw = (x.value / total) * 360; const from = a; a += sw;
          if (!x.value) return null;
          if (nonZero === 1) return <circle key={i} cx="100" cy="100" r="72" fill="none" stroke={`url(#pds${i})`} strokeWidth="22" className="pd-glw3" />;
          return <path key={i} d={arc(100, 100, 72, from + gap + cap, Math.max(from + sw - gap - cap, from + gap + cap + 0.1))} fill="none" stroke={`url(#pds${i})`} strokeWidth="22" strokeLinecap="round" className="pd-glw3" />;
        })}
        <text x="100" y="104" textAnchor="middle" className="pd-gv">{total}</text>
        <text x="100" y="124" textAnchor="middle" className="pd-gl2">проєкти</text>
      </svg>
      <div className="pd-sl">
        {slices.map((x) => (
          <div className="pd-slr" key={x.label}><i style={{ background: `linear-gradient(135deg,${x.grad[0]},${x.grad[1]})` }} /><span>{x.label}</span><b>{x.value}</b><em>{total ? Math.round((x.value / total) * 100) : 0}%</em></div>
        ))}
      </div>
    </div>
  );
}

// Spend by platform: concentric rings (one per platform) with the total in the middle.
export function PlatformRings({ slices, caption, centerLabel }) {
  const total = slices.reduce((s, x) => s + x.value, 0);
  const radii = [88, 66, 44];
  return (
    <svg className="pd-gs pd-donut big" viewBox="0 0 200 200" role="img" aria-label={caption}>
      <defs>{slices.map((x, i) => <Grad key={i} id={'pdp' + i} c={x.grad} />)}</defs>
      {slices.slice(0, 3).map((x, i) => {
        const rr = radii[i]; const cap = ((9 / rr) * 180) / Math.PI;
        const sw = Math.max(total ? (x.value / total) * 360 : 0, 2 * cap + 8);
        return (
          <g key={x.label}>
            <circle cx="100" cy="100" r={rr} className="pd-trk" strokeWidth="18" />
            {x.value > 0 && <path d={arc(100, 100, rr, cap, Math.min(sw - cap, 359 - cap))} fill="none" stroke={`url(#pdp${i})`} strokeWidth="18" strokeLinecap="round" className="pd-glw3" />}
          </g>
        );
      })}
      <text x="100" y="104" textAnchor="middle" className="pd-gv sm">{moneyK(total)}</text>
      <text x="100" y="120" textAnchor="middle" className="pd-gl2">{centerLabel}</text>
    </svg>
  );
}
