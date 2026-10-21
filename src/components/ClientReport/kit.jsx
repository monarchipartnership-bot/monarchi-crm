import { useId } from 'react';
import { ICONS } from './icons';

// The small parts of the client page, ported from the approved design (docs/mockups/client-report-hub.html): icons, medallions, boxes,
// pills and the SVG charts. Everything is drawn from numbers handed in; nothing here knows where they come from.

export const GP = ['#C25AC4', '#7E2483'];
export const GB = ['#8FB2FF', '#2F6FED'];
export const GG = ['#4BE07F', '#12A144'];
export const GA = ['#FBBF24', '#E08A06'];
export const GL = ['#C9A8D1', '#8E6A99'];
export const GX = ['#E58AD8', '#B544B5'];
export const PALETTE = [GP, GB, GG, GA, GL, GX];

const f2 = (n) => Math.round(n * 100) / 100;

export function Icon({ name, className = '' }) {
  return <svg className={`l${className ? ` ${className}` : ''}`} viewBox="0 0 24 24" aria-hidden="true" dangerouslySetInnerHTML={{ __html: ICONS[name] || '' }} />;
}

// The round badge with the ring. `p`: how much of the ring is filled; `st`: st-paused (amber) | st-ok | st-in …
export function Medallion({ icon, text, cls = '', st = '', p = 100 }) {
  return (
    <span className={`md ${cls} ${st}`.trim()} style={{ '--p': p }}>
      <span className={`mi${text ? ' tx3' : ' ln'}`}>{text || <Icon name={icon} />}</span>
    </span>
  );
}

export function Head({ icon, title, sub, right }) {
  return (
    <>
      <Medallion icon={icon} />
      <div><h3>{title}</h3>{sub && <small>{sub}</small>}</div>
      {right && (<><span className="sp" />{right}</>)}
    </>
  );
}

export function Box({ icon, title, sub, right, cls = '', children }) {
  return (
    <section className={`rf ${cls}`.trim()}>
      {title && <div className="bh"><Head icon={icon} title={title} sub={sub} right={right} /></div>}
      {children}
    </section>
  );
}

export const Pill = ({ tone = 'ok', children }) => <span className={`pill ${tone}`}><i />{children}</span>;

// An arrow + percentage against the previous period (see clientReport.change). Nothing to compare → a dash.
export function Mark({ change }) {
  if (!change) return <span className="dm none">—</span>;
  return <span className={`dm ${change.tone}`}>{change.arrow} {change.pct}</span>;
}
// The pill on a KPI card: «+12.3%».
export function DeltaPill({ change }) {
  if (!change) return null;
  const sign = change.value > 0.05 ? '+' : change.value < -0.05 ? '−' : '';
  return <span className={`delta ${change.tone === 'bad' ? 'bad' : 'good'}`}>{sign}{change.pct}</span>;
}

export function Legend({ items }) {
  return <div className="lgd">{items.map(([name, g]) => <span key={name}><i style={{ background: `linear-gradient(135deg,${g[0]},${g[1]})` }} />{name}</span>)}</div>;
}

// ---- SVG helpers ----
const P = (cx, cy, r, a) => { const t = (a - 90) * Math.PI / 180; return [cx + r * Math.cos(t), cy + r * Math.sin(t)]; };
function arc(cx, cy, r, a0, a1) {
  const p0 = P(cx, cy, r, a0);
  const p1 = P(cx, cy, r, a1);
  return `M${f2(p0[0])} ${f2(p0[1])} A${r} ${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${f2(p1[0])} ${f2(p1[1])}`;
}
function smooth(pts) {
  let d = `M${f2(pts[0][0])} ${f2(pts[0][1])}`;
  for (let i = 0; i < pts.length - 1; i += 1) {
    const p0 = pts[i - 1] || pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] || p2;
    d += ` C${f2(p1[0] + (p2[0] - p0[0]) / 6)} ${f2(p1[1] + (p2[1] - p0[1]) / 6)} ${f2(p2[0] - (p3[0] - p1[0]) / 6)} ${f2(p2[1] - (p3[1] - p1[1]) / 6)} ${f2(p2[0])} ${f2(p2[1])}`;
  }
  return d;
}
const Grad = ({ id, g, vertical }) => (
  <linearGradient id={id} x1="0" y1="0" x2={vertical ? '0' : '1'} y2={vertical ? '1' : '1'}><stop offset="0" stopColor={g[0]} /><stop offset="1" stopColor={g[1]} /></linearGradient>
);
function niceStep(max) {
  const raw = Math.max(max, 1) / 5;
  const pw = 10 ** Math.floor(Math.log10(raw));
  return ([1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].find((m) => m * pw >= raw) || 10) * pw;
}
const axisNum = (v) => (v >= 1000 ? `${f2(v / 1000)}K` : String(f2(v)));

// Lines with a soft fill under the first one. series: [{ name, values, g }]; one label per value. `fmt` writes the number of the hint on a point.
export function Wave({ labels, series, w = 560, h = 230, fmt = (v) => String(Math.round(v)) }) {
  const uid = useId().replace(/:/g, '');
  const l = 44; const r = 18; const t = 18; const b = 30;
  const iw = w - l - r; const ih = h - t - b; const n = labels.length;
  const mx = Math.max(0, ...series.flatMap((x) => x.values.map((v) => v || 0)));
  const step = niceStep(mx * 1.12);
  const top = step * 5;
  const X = (i) => (n === 1 ? l + iw / 2 : l + (iw * i) / (n - 1));
  const Y = (v) => t + ih - (ih * (v || 0)) / top;
  return (
    <svg className="gs" viewBox={`0 0 ${w} ${h}`} role="img">
      <defs>
        {series.map((x, i) => (
          <g key={i}>
            <Grad id={`${uid}wv${i}`} g={x.g} />
            <linearGradient id={`${uid}wf${i}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={x.g[1]} stopOpacity=".28" /><stop offset="1" stopColor={x.g[1]} stopOpacity="0" /></linearGradient>
          </g>
        ))}
      </defs>
      {[0, 1, 2, 3, 4, 5].map((g) => {
        const gy = t + ih - (ih * g) / 5;
        return (<g key={g}><line x1={l} x2={w - r} y1={gy} y2={gy} className="gl" /><text x={l - 8} y={gy + 4} className="ax" textAnchor="end">{axisNum(step * g)}</text></g>);
      })}
      {series.map((x, i) => {
        const pts = x.values.map((v, j) => [X(j), Y(v)]);
        return (
          <g key={x.name}>
            {i === 0 && n > 1 && <path d={`${smooth(pts)} L${X(n - 1)} ${t + ih} L${X(0)} ${t + ih}Z`} fill={`url(#${uid}wf0)`} />}
            {n > 1 && <path d={smooth(pts)} fill="none" stroke={`url(#${uid}wv${i})`} strokeWidth="3.5" strokeLinecap="round" className={i ? 'glw2' : 'glw1'} />}
            {pts.map((p, j) => (
              <circle key={j} cx={f2(p[0])} cy={f2(p[1])} r="4.5" fill="#fff" stroke={x.g[1]} strokeWidth="2.8"><title>{`${x.name}, ${labels[j]}: ${fmt(x.values[j])}`}</title></circle>
            ))}
          </g>
        );
      })}
      {labels.map((lb, i) => <text key={lb + i} x={f2(X(i))} y={h - 8} textAnchor="middle" className="ax">{lb}</text>)}
    </svg>
  );
}

// Ring of shares with a list beside it. slices: [{ label, value, g }]
export function Donut({ slices, center, caption, fmt = (v) => String(v) }) {
  const uid = useId().replace(/:/g, '');
  const tot = slices.reduce((a, x) => a + x.value, 0) || 1;
  const cap = ((22 / 2 / 72) * 180) / Math.PI;
  let a = 0;
  return (
    <div className="stw">
      <svg className="gs donut" viewBox="0 0 200 200" role="img">
        <defs>{slices.map((x, i) => <Grad key={i} id={`${uid}dn${i}`} g={x.g} />)}</defs>
        <circle cx="100" cy="100" r="72" className="trk" strokeWidth="22" />
        {slices.map((x, i) => {
          const sw = (x.value / tot) * 360;
          const full = slices.length === 1;
          const d = full ? 'M100 28 A72 72 0 1 1 99.9 28' : arc(100, 100, 72, a + 5 + cap, a + sw - 5 - cap);
          a += sw;
          return <path key={x.label} d={d} fill="none" stroke={`url(#${uid}dn${i})`} strokeWidth="22" strokeLinecap="round" className="glw3"><title>{`${x.label}: ${fmt(x.value)}`}</title></path>;
        })}
        <text x="100" y="104" textAnchor="middle" className="gv sm">{center}</text>
        <text x="100" y="120" textAnchor="middle" className="gl2">{caption}</text>
      </svg>
      <div className="sl">
        {slices.map((x) => (
          <div className="slr" key={x.label}><i style={{ background: `linear-gradient(135deg,${x.g[0]},${x.g[1]})` }} /><span>{x.label}</span><b>{fmt(x.value)}</b><em>{Math.round((x.value / tot) * 100)}%</em></div>
        ))}
      </div>
    </div>
  );
}

// Horizontal pills, longest = widest. items: [{ label, value, text, g }]
export function HBars({ items }) {
  const mx = Math.max(...items.map((i) => i.value), 1);
  return (
    <div className="hbars">
      {items.map((i) => (
        <div className="hbr" key={i.label}><span>{i.label}</span><div className="hpt"><div className="hpb" style={{ width: `${Math.max((i.value / mx) * 100, 16)}%`, background: `linear-gradient(100deg,${i.g[0]},${i.g[1]})` }}><em>{i.text}</em></div></div></div>
      ))}
    </div>
  );
}

// A tiny wave for a mini card.
export function Spark({ values, g }) {
  const uid = useId().replace(/:/g, '');
  const w = 96; const h = 44;
  const mx = Math.max(...values); const mn = Math.min(...values);
  const pts = values.map((v, i) => [values.length === 1 ? w / 2 : 3 + ((w - 6) * i) / (values.length - 1), h - 6 - ((h - 12) * (v - mn)) / ((mx - mn) || 1)]);
  const last = pts[pts.length - 1];
  const d = pts.length > 1 ? smooth(pts) : `M${pts[0][0]} ${pts[0][1]}`;
  return (
    <svg className="spk" viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
      <defs><Grad id={`${uid}s`} g={g} vertical /><linearGradient id={`${uid}f`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={g[0]} stopOpacity=".35" /><stop offset="1" stopColor={g[0]} stopOpacity="0" /></linearGradient></defs>
      {pts.length > 1 && <path d={`${d} L${w - 3} ${h} L3 ${h}Z`} fill={`url(#${uid}f)`} />}
      <path d={d} fill="none" stroke={`url(#${uid}s)`} strokeWidth="3" strokeLinecap="round" />
      <circle cx={f2(last[0])} cy={f2(last[1])} r="4" fill="#fff" stroke={g[1]} strokeWidth="2.5" />
    </svg>
  );
}
