import { useEffect, useRef } from 'react';
import { Chart, BarController, CategoryScale, LinearScale, BarElement, Legend, Tooltip } from 'chart.js';

Chart.register(BarController, CategoryScale, LinearScale, BarElement, Legend, Tooltip);

const CHART_COLORS = ['#6B2FA0', '#1E9E5D', '#B8860B', '#2F6FED', '#D14343', '#421342'];

// One grouped bar chart, bars colored/grouped by week (slot), matching
// weekly_compare.html's per-block chart. `horizontal` flips to indexAxis:'y'
// (Annual Report's channel-comparison charts) — default stays vertical, so
// Automation Dashboard's existing usage is unaffected.
export default function BarChart({ labels, series, horizontal }) {
  const canvasRef = useRef(null);
  const chartRef = useRef(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    chartRef.current = new Chart(canvasRef.current, {
      type: 'bar',
      data: {
        labels,
        datasets: series.map((s, i) => ({
          label: s.label,
          data: s.data,
          backgroundColor: CHART_COLORS[i % CHART_COLORS.length],
          borderRadius: 4,
          maxBarThickness: 26,
        })),
      },
      options: {
        indexAxis: horizontal ? 'y' : 'x',
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: series.length > 1, position: 'bottom', labels: { font: { family: 'Inter', size: 10 } } } },
        scales: {
          x: { beginAtZero: horizontal, ticks: { font: { family: 'Inter', size: 9 }, maxRotation: 0, autoSkip: false }, grid: { display: horizontal } },
          y: { beginAtZero: !horizontal, ticks: { font: { family: 'Inter', size: 9 } }, grid: { color: '#E6E1EC', display: !horizontal } },
        },
      },
    });
    return () => chartRef.current?.destroy();
  }, [labels, series, horizontal]);

  return (
    <div className="cmp-chart">
      <canvas ref={canvasRef} />
    </div>
  );
}
