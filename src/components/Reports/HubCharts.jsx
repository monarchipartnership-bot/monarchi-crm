import { forwardRef, useEffect, useId, useImperativeHandle, useRef, useState } from 'react';

// Hub-style charts of the Reports Manager (waves, pill bars, ring donut, pill funnel). Same props as the Chart.js
// components they replace on the report pages (LineChart, BarChart, DonutChart, FunnelChart), plain SVG/HTML.
export const HUB_COLORS = ['#8E1E8E', '#2F6FED', '#12A144', '#E08A06', '#D92D2D', '#8E6A99'];

const f2 = (n) => Math.round(n * 100) / 100;
const MONTH_NAMES_SHORT = ['Січ', 'Лют', 'Бер', 'Кві', 'Тра', 'Чер', 'Лип', 'Сер', 'Вер', 'Жов', 'Лис', 'Гру'];
const fmtN = (v) => (v == null ? '—' : Math.abs(v) >= 1000 ? Math.round(v).toLocaleString('uk-UA') : String(Math.round(v * 100) / 100));
const fmtTick = (v) => (v === 0 ? '0' : Math.abs(v) >= 1000 ? `${f2(v / 1000)}K` : String(f2(v)));
const mix = (hex, ratio) => {
  const h = hex.replace('#', '');
  const c = [0, 2, 4].map((i) => Math.round(parseInt(h.substring(i, i + 2), 16) * (1 - ratio) + 255 * ratio));
  return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
};
function niceStep(span) {
  const raw = Math.max(span, 1e-9) / 5; const pow = 10 ** Math.floor(Math.log10(raw));
  return ([1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].find((m) => m * pow >= raw) || 10) * pow;
}
// Catmull-Rom → cubic bezier through one run of points.
function smooth(pts) {
  let d = `M${f2(pts[0][0])} ${f2(pts[0][1])}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i]; const p1 = pts[i]; const p2 = pts[i + 1]; const p3 = pts[i + 2] || p2;
    d += ` C${f2(p1[0] + (p2[0] - p0[0]) / 6)} ${f2(p1[1] + (p2[1] - p0[1]) / 6)} ${f2(p2[0] - (p3[0] - p1[0]) / 6)} ${f2(p2[1] - (p3[1] - p1[1]) / 6)} ${f2(p2[0])} ${f2(p2[1])}`;
  }
  return d;
}
const P = (cx, cy, r, a) => { const t = ((a - 90) * Math.PI) / 180; return [cx + r * Math.cos(t), cy + r * Math.sin(t)]; };
function arc(cx, cy, r, a0, a1) {
  const p0 = P(cx, cy, r, a0); const p1 = P(cx, cy, r, a1);
  return `M${f2(p0[0])} ${f2(p0[1])} A${r} ${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${f2(p1[0])} ${f2(p1[1])}`;
}

// Trend waves: one smooth line per series (gaps where a value is missing), ringed markers, tooltip on hover.
// `ref.toBase64Image()` resolves to a PNG data URL (the trend card's download action).
export const HubLine = forwardRef(function HubLine({ series, labels }, ref) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const svgRef = useRef(null);
  const wrapRef = useRef(null);
  const [hover, setHover] = useState(null);
  // Draw at the real width so the type stays the same size in a narrow card and in a full-width one.
  const [w, setW] = useState(640);
  useEffect(() => {
    const el = wrapRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(([e]) => { const next = Math.round(e.contentRect.width); if (next > 120) setW(next); });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const axis = labels ?? MONTH_NAMES_SHORT;
  const n = axis.length;
  const h = Math.max(210, Math.min(300, Math.round(w * 0.4))); const l = 50; const r = 16; const t = 30; const b = 34;
  const iw = w - l - r; const ih = h - t - b;
  const vals = series.flatMap((s) => s.values).filter((v) => v != null);
  const hi = Math.max(...vals, 1) * 1.15; const lo = Math.min(0, ...vals);
  const step = niceStep(hi - lo);
  const bottom = Math.floor(lo / step) * step; const top = bottom + step * 5 >= hi ? bottom + step * 5 : bottom + step * 6;
  const rows = Math.round((top - bottom) / step);
  const X = (i) => l + (iw * i) / Math.max(n - 1, 1);
  const Y = (v) => t + ih - (ih * (v - bottom)) / (top - bottom);
  const base = Y(Math.max(bottom, Math.min(0, top)));

  useImperativeHandle(ref, () => ({
    toBase64Image: () => new Promise((resolve) => {
      const el = svgRef.current;
      if (!el) { resolve(null); return; }
      const xml = new XMLSerializer().serializeToString(el);
      const img = new Image();
      img.onload = () => {
        const c = document.createElement('canvas'); c.width = w * 2; c.height = h * 2;
        const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height); ctx.drawImage(img, 0, 0, c.width, c.height);
        resolve(c.toDataURL('image/png'));
      };
      img.onerror = () => resolve(null);
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(xml);
    }),
  }));

  const runs = (s) => {
    const out = []; let cur = [];
    s.values.forEach((v, i) => { if (v == null) { if (cur.length) out.push(cur); cur = []; } else cur.push([X(i), Y(v)]); });
    if (cur.length) out.push(cur);
    return out;
  };
  const colW = iw / Math.max(n - 1, 1);
  const tipW = 164; const tipH = 30 + series.length * 16;
  const tx = hover == null ? 0 : Math.max(l, Math.min(w - r - tipW, X(hover) - tipW / 2));
  return (
    <div ref={wrapRef} className="hc-wrap">
    <svg ref={svgRef} className="hc-svg" viewBox={`0 0 ${w} ${h}`} role="img" aria-label="Графік по періодах" onMouseLeave={() => setHover(null)} xmlns="http://www.w3.org/2000/svg">
      <defs>
        {series.map((s, i) => (
          <linearGradient key={i} id={`${uid}f${i}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={s.color || HUB_COLORS[i % 6]} stopOpacity=".3" /><stop offset="1" stopColor={s.color || HUB_COLORS[i % 6]} stopOpacity="0" /></linearGradient>
        ))}
      </defs>
      {Array.from({ length: rows + 1 }, (_, g) => {
        const v = bottom + step * g; const gy = Y(v);
        return <g key={g}><line x1={l} x2={w - r} y1={gy} y2={gy} className="hc-gl" /><text x={l - 10} y={gy + 4} className="hc-ax" textAnchor="end">{fmtTick(v)}</text></g>;
      })}
      {series.map((s, i) => {
        const color = s.color || HUB_COLORS[i % 6];
        return runs(s).map((run, k) => (run.length > 1 ? (
          <g key={`${i}-${k}`}>
            {i === 0 && <path d={`${smooth(run)} L${f2(run[run.length - 1][0])} ${f2(base)} L${f2(run[0][0])} ${f2(base)}Z`} fill={`url(#${uid}f${i})`} />}
            <path d={smooth(run)} fill="none" stroke={color} strokeWidth="3.5" strokeLinecap="round" style={{ filter: `drop-shadow(0 6px 6px ${color}55)` }} />
          </g>
        ) : null));
      })}
      {hover != null && <line x1={f2(X(hover))} x2={f2(X(hover))} y1={t} y2={t + ih} className="hc-guide" />}
      {series.map((s, i) => {
        const color = s.color || HUB_COLORS[i % 6];
        return s.values.map((v, j) => (v == null ? null : (
          <g key={`${i}-${j}`}>
            {hover === j && <circle cx={f2(X(j))} cy={f2(Y(v))} r="10" fill={color} opacity=".18" />}
            <circle cx={f2(X(j))} cy={f2(Y(v))} r="4.5" fill="#fff" stroke={color} strokeWidth="3" />
          </g>
        )));
      })}
      {axis.map((lb, i) => (
        <g key={lb + i}>
          <text x={f2(X(i))} y={h - 10} textAnchor="middle" className={'hc-ax' + (hover === i ? ' sel' : '')}>{lb}</text>
          <rect x={f2(X(i) - colW / 2)} y="0" width={f2(colW)} height={h} fill="transparent" onMouseEnter={() => setHover(i)} />
        </g>
      ))}
      {hover != null && (
        <g transform={`translate(${f2(tx)},2)`} pointerEvents="none" className="hc-tip">
          <rect width={tipW} height={tipH} rx="16" />
          <text x="14" y="21" className="tt1">{axis[hover]}</text>
          {series.map((s, i) => (
            <g key={i}>
              <circle cx="18" cy={36 + i * 16} r="4" fill={s.color || HUB_COLORS[i % 6]} />
              <text x="28" y={40 + i * 16} className="tt2">{s.label}: {fmtN(s.values[hover])}</text>
            </g>
          ))}
        </g>
      )}
    </svg>
    </div>
  );
});

// Grouped pill bars: a row per label, one pill per series (slot), pill length relative to the largest value.
export function HubBars({ labels, series }) {
  const all = series.flatMap((s) => s.data).filter((v) => v != null && v > 0);
  const mx = Math.max(...all, 1);
  return (
    <div className="hc-bars">
      {labels.map((lb, li) => (
        <div className="hc-bar-row" key={lb + li}>
          <span className="hc-bar-name">{lb}</span>
          <div className="hc-bar-stack">
            {series.map((s, si) => {
              const v = s.data[li]; const color = s.color || HUB_COLORS[si % 6];
              return (
                <div className="hc-bar-track" key={s.label + si} title={`${s.label}: ${fmtN(v)}`}>
                  <div className={'hc-bar' + (v ? '' : ' nil')} style={{ width: v ? Math.max((v / mx) * 100, 14) + '%' : undefined, background: v ? `linear-gradient(100deg,${mix(color, 0.3)},${color})` : undefined }}>
                    <em>{fmtN(v)}</em>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
      {series.length > 1 && (
        <div className="hc-legend">{series.map((s, i) => <span key={s.label + i}><i style={{ background: s.color || HUB_COLORS[i % 6] }} />{s.label}</span>)}</div>
      )}
    </div>
  );
}

// Ring donut: rounded segments with gaps, the total (or `centerValue`) in the middle, pill legend beside it.
export function HubDonut({ slices, centerValue, centerLabel }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const total = slices.reduce((s, x) => s + (x.value || 0), 0);
  const live = slices.filter((x) => x.value > 0);
  const cap = ((22 / 2 / 72) * 180) / Math.PI; const gap = 5;
  let a = 0;
  return (
    <div className="hc-donut-wrap">
      <svg className="hc-donut" viewBox="0 0 200 200" role="img" aria-label="Розподіл">
        <defs>{slices.map((x, i) => (
          <linearGradient key={i} id={`${uid}d${i}`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor={mix(x.color || HUB_COLORS[i % 6], 0.35)} /><stop offset="1" stopColor={x.color || HUB_COLORS[i % 6]} /></linearGradient>
        ))}</defs>
        <circle cx="100" cy="100" r="72" className="hc-trk" strokeWidth="22" />
        {total > 0 && slices.map((x, i) => {
          if (!(x.value > 0)) return null;
          const sw = (x.value / total) * 360; const from = a; a += sw;
          if (live.length === 1) return <circle key={i} cx="100" cy="100" r="72" fill="none" stroke={`url(#${uid}d${i})`} strokeWidth="22" />;
          return <path key={i} d={arc(100, 100, 72, from + gap + cap, Math.max(from + sw - gap - cap, from + gap + cap + 0.1))} fill="none" stroke={`url(#${uid}d${i})`} strokeWidth="22" strokeLinecap="round" style={{ filter: 'drop-shadow(0 3px 4px rgba(39,8,39,.16))' }} />;
        })}
        <text x="100" y="104" textAnchor="middle" className="hc-gv">{centerValue ?? fmtN(total)}</text>
        {centerLabel ? <text x="100" y="122" textAnchor="middle" className="hc-gl2">{centerLabel}</text> : null}
      </svg>
      <div className="hc-dl">
        {slices.map((x, i) => (
          <div className="hc-dlr" key={x.label + i}><i style={{ background: `linear-gradient(135deg,${mix(x.color || HUB_COLORS[i % 6], 0.35)},${x.color || HUB_COLORS[i % 6]})` }} /><span>{x.label}</span><b>{fmtN(x.value)}</b><em>{total ? Math.round((x.value / total) * 100) : 0}%</em></div>
        ))}
      </div>
    </div>
  );
}

// Funnel of pills that narrow stage by stage; each shows its value and the share of the first stage.
export function HubFunnel({ stages }) {
  const base = stages[0]?.value || 0;
  return (
    <div className="hc-funnel">
      {stages.map((s, i) => {
        const color = HUB_COLORS[[0, 1, 2][i % 3]];
        return (
          <div className="hc-fn" key={s.label} style={{ width: (base ? Math.max((s.value / base) * 100, 38) : 38) + '%', background: `linear-gradient(100deg,${mix(color, 0.3)},${color})` }}>
            <b>{s.label}</b>
            <em>{s.value}{i && base ? ` · ${((s.value / base) * 100).toFixed(1)}%` : ''}</em>
          </div>
        );
      })}
    </div>
  );
}
