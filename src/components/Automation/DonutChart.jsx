import { useEffect, useRef } from 'react';
import { Chart, DoughnutController, ArcElement, Legend, Tooltip } from 'chart.js';

Chart.register(DoughnutController, ArcElement, Legend, Tooltip);

// Mixes a hex color with white by `ratio` (0-1) — same idea as the CSS
// `color-mix(in srgb, ${hex} X%, #fff)` recipe used for gradient badges/
// buttons/day-pills, just computed in JS since Chart.js needs a real
// CanvasGradient object, not a CSS string, for a per-slice fill.
function mixWithWhite(hex, ratio) {
  const h = hex.replace('#', '');
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  const mix = (c) => Math.round(c * (1 - ratio) + 255 * ratio);
  return `rgb(${mix(r)}, ${mix(g)}, ${mix(b)})`;
}

// Status-distribution donut. `slices` = [{ label, value, color }].
// `centerValue` (e.g. "60%") is overlaid in the middle of the ring itself.
// `centerLabel` (e.g. "6 з 10 задач") sits as its own line below the whole
// chart (ring + legend) — it used to be squeezed inside the ring alongside
// centerValue, but Chart.js's bottom legend eats into the canvas's own
// layout, pushing the ring's true center higher than a naive 50%/50% CSS
// center would land, which clipped that second line against the ring.
// `gradient` (opt-in, off by default so existing pages keep their flat-color
// look unless asked) swaps each slice's flat fill for the same diagonal
// light→color gradient used by the app's gradient buttons/badges, plus a
// soft drop shadow under the ring — a subtle "voluminous" look instead of a
// flat pie slice. `smallCenter` (opt-in) shrinks the center `centerValue`
// text for a spot where the default 1.4rem reads too heavy.
export default function DonutChart({ slices, centerValue, centerLabel, showLegend = true, gradient = false, smallCenter = false }) {
  const canvasRef = useRef(null);
  const chartRef = useRef(null);
  const centerRef = useRef(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    chartRef.current = new Chart(canvasRef.current, {
      type: 'doughnut',
      data: {
        labels: slices.map((s) => s.label),
        datasets: [{
          data: slices.map((s) => s.value),
          backgroundColor: !gradient
            ? slices.map((s) => s.color)
            : (ctx) => {
              const { chart, dataIndex } = ctx;
              const slice = slices[dataIndex];
              if (!slice) return '#ccc';
              const area = chart.chartArea;
              if (!area) return slice.color;
              const g = chart.ctx.createLinearGradient(area.left, area.top, area.right, area.bottom);
              g.addColorStop(0, mixWithWhite(slice.color, .22));
              g.addColorStop(1, slice.color);
              return g;
            },
          borderWidth: 0,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '65%',
        plugins: { legend: { display: showLegend, position: 'bottom', labels: { font: { family: 'Inter', size: 10 }, boxWidth: 11, padding: 10 } } },
      },
      plugins: [
        {
          id: 'centerOverlayPosition',
          // Chart.js knows the ring's real drawing rect (chartArea) once the
          // legend has claimed its own space — position the overlay there
          // instead of assuming it's the box's exact geometric center.
          afterLayout(chart) {
            if (!centerRef.current) return;
            const { left, right, top, bottom } = chart.chartArea;
            centerRef.current.style.left = `${(left + right) / 2}px`;
            centerRef.current.style.top = `${(top + bottom) / 2}px`;
          },
        },
        gradient && {
          id: 'ringDropShadow',
          beforeDatasetsDraw(chart) {
            chart.ctx.save();
            chart.ctx.shadowColor = 'rgba(37, 28, 48, .28)';
            chart.ctx.shadowBlur = 10;
            chart.ctx.shadowOffsetY = 4;
          },
          afterDatasetsDraw(chart) {
            chart.ctx.restore();
          },
        },
      ].filter(Boolean),
    });
    return () => chartRef.current?.destroy();
  }, [slices, showLegend, gradient]);

  return (
    <>
      <div className="cmp-chart">
        <canvas ref={canvasRef} />
        {centerValue && (
          <div className={'cmp-chart-center' + (smallCenter ? ' cmp-chart-center--sm' : '')} ref={centerRef}>
            <b>{centerValue}</b>
          </div>
        )}
      </div>
      {centerLabel && <div className="cmp-chart-caption">{centerLabel}</div>}
    </>
  );
}
