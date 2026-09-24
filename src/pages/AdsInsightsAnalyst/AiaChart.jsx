import { useEffect, useRef } from 'react';
import { Chart, BarController, LineController, CategoryScale, LinearScale, BarElement, LineElement, PointElement, Legend, Tooltip } from 'chart.js';
import { exportChartPNG, exportChartPDF } from '../../lib/aiInsightsExport';

Chart.register(BarController, LineController, CategoryScale, LinearScale, BarElement, LineElement, PointElement, Legend, Tooltip);

// First dark-themed chart in the app — no existing precedent to copy
// (src/components/Reports/*/*.jsx are all light-page charts), so colors
// are picked fresh to match adsInsightsAnalystPage.css's violet/cyan palette.
const DATASET_COLORS = ['#8B5CF6', '#22D3EE', '#F472B6', '#34D399', '#FBBF24'];

export default function AiaChart({ title, type, labels, datasets }) {
  const canvasRef = useRef(null);
  const chartRef = useRef(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    chartRef.current = new Chart(canvasRef.current, {
      type: type === 'line' ? 'line' : 'bar',
      data: {
        labels,
        datasets: datasets.map((d, i) => ({
          label: d.label,
          data: d.values,
          backgroundColor: DATASET_COLORS[i % DATASET_COLORS.length],
          borderColor: DATASET_COLORS[i % DATASET_COLORS.length],
          borderRadius: type === 'line' ? 0 : 4,
          maxBarThickness: 34,
          tension: 0.3,
          fill: false,
        })),
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: datasets.length > 1, position: 'bottom', labels: { color: '#D8D4F0', font: { family: 'Inter', size: 10 } } },
          tooltip: { backgroundColor: 'rgba(20,18,40,.95)', titleColor: '#F3F1FF', bodyColor: '#D8D4F0', borderColor: 'rgba(122,105,200,.4)', borderWidth: 1 },
        },
        scales: {
          x: { ticks: { color: '#918CBB', font: { family: 'Inter', size: 10 } }, grid: { color: 'rgba(122,105,200,.12)' } },
          y: { beginAtZero: true, ticks: { color: '#918CBB', font: { family: 'Inter', size: 10 } }, grid: { color: 'rgba(122,105,200,.12)' } },
        },
      },
    });
    return () => chartRef.current?.destroy();
  }, [labels, datasets, type]);

  return (
    <div className="aia-visual aia-visual-chart">
      {title && <div className="aia-visual-title">{title}</div>}
      <div className="aia-chart-canvas">
        <canvas ref={canvasRef} />
      </div>
      <div className="aia-visual-actions">
        <button type="button" onClick={() => exportChartPNG(chartRef.current, title)}>PNG</button>
        <button type="button" onClick={() => exportChartPDF(chartRef.current, title)}>PDF</button>
      </div>
    </div>
  );
}
