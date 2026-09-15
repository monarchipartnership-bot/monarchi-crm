import { useEffect, useRef } from 'react';
import { Chart, DoughnutController, ArcElement, Legend, Tooltip } from 'chart.js';

Chart.register(DoughnutController, ArcElement, Legend, Tooltip);

// Status-distribution donut. `slices` = [{ label, value, color }].
// `centerValue` (e.g. "60%") is overlaid in the middle of the ring itself.
// `centerLabel` (e.g. "6 з 10 задач") sits as its own line below the whole
// chart (ring + legend) — it used to be squeezed inside the ring alongside
// centerValue, but Chart.js's bottom legend eats into the canvas's own
// layout, pushing the ring's true center higher than a naive 50%/50% CSS
// center would land, which clipped that second line against the ring.
export default function DonutChart({ slices, centerValue, centerLabel, showLegend = true }) {
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
          backgroundColor: slices.map((s) => s.color),
          borderWidth: 0,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '65%',
        plugins: { legend: { display: showLegend, position: 'bottom', labels: { font: { family: 'Inter', size: 10 }, boxWidth: 11, padding: 10 } } },
      },
      plugins: [{
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
      }],
    });
    return () => chartRef.current?.destroy();
  }, [slices, showLegend]);

  return (
    <>
      <div className="cmp-chart">
        <canvas ref={canvasRef} />
        {centerValue && (
          <div className="cmp-chart-center" ref={centerRef}>
            <b>{centerValue}</b>
          </div>
        )}
      </div>
      {centerLabel && <div className="cmp-chart-caption">{centerLabel}</div>}
    </>
  );
}
