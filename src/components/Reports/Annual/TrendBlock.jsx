import { useEffect, useRef, useState } from 'react';
import LineChart, { CHART_COLORS } from './LineChart';
import DeltaBadge from '../../Automation/DeltaBadge';
import { moneyFmt } from '../../../lib/weeklyLogic';

const CHECK_ICON = '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7"/></svg>';
const KEBAB_ICON = '⋮';

// Last two non-null points in a 12-month values array — used for the KPI
// widgets' delta badge (vs the previous month that actually has data, not
// necessarily the immediately preceding index).
function lastTwoNonNull(values) {
  const idxs = values.map((v, i) => (v == null ? -1 : i)).filter((i) => i >= 0);
  const last = idxs.length ? idxs[idxs.length - 1] : null;
  const prevIdx = idxs.length > 1 ? idxs[idxs.length - 2] : null;
  return [last == null ? null : values[last], prevIdx == null ? null : values[prevIdx]];
}

// `unit` drives both the KPI widget's value formatting and its delta: 'pct'
// series compare in percentage points (can't show a "% change" of a %), a
// 'money'/'count' series compares as a relative % change — except when the
// previous point is exactly 0, where a relative change is undefined, so the
// raw delta is shown instead (e.g. Cover Letters going 0 → 155 reads "+155",
// not a meaningless "—").
function trendDelta(cur, prev, unit) {
  if (cur == null || prev == null) return { diff: null, suffix: unit === 'pct' ? 'п.п.' : '%' };
  if (unit === 'pct') return { diff: Math.round((cur - prev) * 10) / 10, suffix: 'п.п.' };
  if (!prev) return { diff: Math.round((cur - prev) * 100) / 100, suffix: '' };
  return { diff: Math.round(((cur - prev) / prev) * 100), suffix: '%' };
}

function formatValue(v, unit) {
  if (v == null) return '—';
  if (unit === 'pct') return v.toFixed(1) + '%';
  if (unit === 'money') return moneyFmt(v);
  return String(Math.round(v * 100) / 100);
}

// Collapsible 12-month trend chart card. Header holds three independent
// zones — collapse trigger, per-series KPI widgets, kebab menu — so
// interacting with the widgets/pills/menu never toggles the card.
export default function TrendBlock({ title, series, unit = 'count' }) {
  const [open, setOpen] = useState(true);
  const [hidden, setHidden] = useState(() => new Set());
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);
  const chartRef = useRef(null);

  useEffect(() => {
    if (!menuOpen) return;
    function onDocClick(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [menuOpen]);

  function toggleSeries(i) {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  }

  function handleDownload() {
    setMenuOpen(false);
    const dataUrl = chartRef.current?.toBase64Image();
    if (!dataUrl) return;
    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = `${title}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  const colors = series.map((s, i) => s.color || CHART_COLORS[i % CHART_COLORS.length]);
  const visibleSeries = series
    .map((s, i) => ({ ...s, color: colors[i] }))
    .filter((_, i) => !hidden.has(i));

  return (
    <div className="cmp-block">
      <div className="trend-head">
        <button type="button" className="trend-collapse-btn" onClick={() => setOpen((o) => !o)}>
          <span>{title}</span>
          <svg className={'chev' + (open ? ' open' : '')} viewBox="0 0 24 24"><path d="M9 6l6 6-6 6" /></svg>
          <span className="trend-info-icon" title="Наведіть на графік, щоб побачити значення за місяць">i</span>
        </button>

        <div className="trend-kpi-row">
          {series.map((s, i) => {
            const [cur, prev] = lastTwoNonNull(s.values);
            const { diff, suffix } = trendDelta(cur, prev, unit);
            return (
              <div className="trend-kpi" key={s.label}>
                <div className="trend-kpi-head">
                  <span className="trend-kpi-dot" style={{ background: colors[i] }} />
                  {s.label}
                </div>
                <div className="trend-kpi-value">{formatValue(cur, unit)}</div>
                <DeltaBadge diff={diff} suffix={suffix} />
              </div>
            );
          })}
        </div>

        <div className="trend-menu-wrap" ref={menuRef}>
          <button type="button" className="trend-menu-btn" onClick={() => setMenuOpen((o) => !o)} aria-label="Ще дії">{KEBAB_ICON}</button>
          {menuOpen && (
            <div className="trend-menu-popover">
              <button type="button" onClick={handleDownload}>Завантажити графік (PNG)</button>
            </div>
          )}
        </div>
      </div>

      {open && (
        <div className="cmp-block-body">
          <div className="trend-pills">
            {series.map((s, i) => (
              <button
                key={s.label}
                type="button"
                className={'trend-pill' + (hidden.has(i) ? ' off' : ' on')}
                style={hidden.has(i) ? undefined : { borderColor: colors[i], background: colors[i] + '1a', color: colors[i] }}
                onClick={() => toggleSeries(i)}
              >
                {!hidden.has(i) && <span className="trend-pill-check" dangerouslySetInnerHTML={{ __html: CHECK_ICON }} />}
                {s.label}
              </button>
            ))}
          </div>
          <LineChart ref={chartRef} series={visibleSeries} showLegend={false} />
        </div>
      )}
    </div>
  );
}
