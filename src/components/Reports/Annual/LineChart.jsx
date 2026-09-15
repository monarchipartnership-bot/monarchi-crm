import { useEffect, useRef, forwardRef, useImperativeHandle } from 'react';
import { Chart, LineController, CategoryScale, LinearScale, PointElement, LineElement, Filler, Legend, Tooltip } from 'chart.js';

Chart.register(LineController, CategoryScale, LinearScale, PointElement, LineElement, Filler, Legend, Tooltip);

export const CHART_COLORS = ['#6B2FA0', '#1E9E5D', '#B8860B', '#2F6FED', '#D14343', '#421342'];
const MONTH_NAMES_SHORT = ['Січ', 'Лют', 'Бер', 'Кві', 'Тра', 'Чер', 'Лип', 'Сер', 'Вер', 'Жов', 'Лис', 'Гру'];

// Trend line per series (one series per metric/ratio/finance line), each
// point plotting that period's own value — not a running total. Defaults to
// the 12-month labels; pass `labels` for any other period axis (e.g. weeks).
// A series may carry its own `color` (so TrendBlock's toggle pills can hide
// a series without the remaining ones shifting to the wrong color) —
// otherwise falls back to CHART_COLORS by index, as before.
// `ref` exposes `toBase64Image()` for TrendBlock's PNG download action.
const LineChart = forwardRef(function LineChart({ series, labels, showLegend = true }, ref) {
  const canvasRef = useRef(null);
  const chartRef = useRef(null);
  const axisLabels = labels ?? MONTH_NAMES_SHORT;

  useImperativeHandle(ref, () => ({
    toBase64Image: () => chartRef.current?.toBase64Image(),
  }));

  useEffect(() => {
    if (!canvasRef.current) return;
    chartRef.current = new Chart(canvasRef.current, {
      type: 'line',
      data: {
        labels: axisLabels,
        datasets: series.map((s, i) => {
          const color = s.color || CHART_COLORS[i % CHART_COLORS.length];
          return {
            label: s.label,
            data: s.values,
            borderColor: color,
            backgroundColor: color + '26',
            fill: true,
            tension: 0.35,
            spanGaps: false,
            pointRadius: 3,
            pointHoverRadius: 5,
            pointBackgroundColor: color,
            borderWidth: 2,
          };
        }),
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        // TrendBlock passes showLegend=false — its own toggle pills serve
        // that role instead, so the built-in legend would be redundant.
        plugins: { legend: { display: showLegend, position: 'bottom', labels: { color: '#4B3F55', font: { family: 'Inter', size: 10 }, boxWidth: 11, padding: 10 } } },
        scales: {
          x: { ticks: { color: '#4B3F55', font: { family: 'Inter', size: 9 } }, grid: { display: false } },
          y: { beginAtZero: true, ticks: { color: '#4B3F55', font: { family: 'Inter', size: 9 } }, grid: { color: '#E6E1EC' } },
        },
      },
    });
    return () => chartRef.current?.destroy();
  }, [series, axisLabels, showLegend]);

  return (
    <div className="cmp-chart">
      <canvas ref={canvasRef} />
    </div>
  );
});

export default LineChart;
