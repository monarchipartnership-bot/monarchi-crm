// Company-wide 3-stage funnel (Ліди → Кваліфіковано → Договори) — a plain
// CSS/SVG bar list, not a chart-lib type (Chart.js has no native funnel).
// `stages` = [{ label, value }], ordered widest-first; each bar's width is
// relative to the first stage's value.
export default function FunnelChart({ stages }) {
  const base = stages[0]?.value || 0;

  return (
    <div className="funnel">
      {stages.map((s, i) => {
        const widthPct = base ? Math.max((s.value / base) * 100, 4) : 4;
        const ofFirst = base ? ((s.value / base) * 100).toFixed(1) + '%' : '—';
        return (
          <div className="funnel-row" key={s.label}>
            <div className="funnel-label">{s.label}</div>
            <div className="funnel-track">
              <div className="funnel-bar" style={{ width: widthPct + '%', opacity: 1 - i * 0.18 }}>
                <span className="funnel-value">{s.value}</span>
              </div>
            </div>
            <div className="funnel-pct">{i === 0 ? '' : ofFirst}</div>
          </div>
        );
      })}
    </div>
  );
}
