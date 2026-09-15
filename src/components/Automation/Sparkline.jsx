// Tiny inline trend line for a KPI card — plain SVG, no Chart.js/canvas
// needed for something this small. `values` is a flat array of numbers
// (e.g. weekly completion %); renders nothing if there's not enough points
// to draw a line.
export default function Sparkline({ values, color = 'var(--ok)' }) {
  if (!values || values.length < 2) return null;

  const w = 100, h = 28, pad = 2;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const step = (w - pad * 2) / (values.length - 1);

  const points = values.map((v, i) => {
    const x = pad + i * step;
    const y = pad + (h - pad * 2) * (1 - (v - min) / range);
    return `${x},${y}`;
  });
  const linePath = 'M' + points.join(' L');
  const lastX = pad + (values.length - 1) * step;
  const areaPath = `${linePath} L${lastX},${h - pad} L${pad},${h - pad} Z`;

  return (
    <svg className="dash-sparkline" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
      <path d={areaPath} fill={color} opacity="0.12" stroke="none" />
      <path d={linePath} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
