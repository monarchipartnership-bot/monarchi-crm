import { useEffect, useRef } from 'react';
import { computeMetric, formatMetric, metricMeta, deltaPct, deltaTone } from '../../../lib/reportMetrics';

function Delta({ delta, tone }) {
  if (delta == null) return <span className="prep-delta prep-delta--none">—</span>;
  const arrow = delta > 0 ? '▲' : delta < 0 ? '▼' : '';
  return <span className={'prep-delta prep-delta--' + tone}>{arrow} {Math.abs(delta).toLocaleString('uk-UA', { maximumFractionDigits: 1 })}%</span>;
}

// A wide table in a horizontally scrolling box: every column stays reachable. The mouse wheel scrolls it sideways while it can still
// move that way, then hands over to the page, so the page never gets stuck.
export function HScroll({ children }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const onWheel = (e) => {
      if (el.scrollWidth <= el.clientWidth + 1 || Math.abs(e.deltaX) > Math.abs(e.deltaY) || e.ctrlKey) return;
      const max = el.scrollWidth - el.clientWidth;
      if ((e.deltaY > 0 && el.scrollLeft >= max - 1) || (e.deltaY < 0 && el.scrollLeft <= 0)) return;
      e.preventDefault();
      el.scrollLeft += e.deltaY;
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);
  return <div className="prep-scroll" ref={ref}>{children}</div>;
}

// The best value of a metric among columns: the highest (or lowest, for costs) of at least two non-zero values; none for neutral metrics.
export function bestOf(values, goodWhen) {
  const comparable = values.filter((v) => v != null && Number.isFinite(v) && v !== 0);
  if (comparable.length < 2 || goodWhen === 'neutral') return null;
  return goodWhen === 'up' ? Math.max(...comparable) : Math.min(...comparable);
}

// Metrics table for one set of numbers: value, the previous period and the change.
// `rows` come from metricRows() in lib/periodReport.js.
export function ReportMetricsTable({ rows, showPrev = true, curLabel = 'Цей період', prevLabel = 'Попередній' }) {
  return (
    <table className="prep-table">
      <thead>
        <tr>
          <th>Метрика</th>
          <th className="num">{curLabel}</th>
          {showPrev && <th className="num">{prevLabel}</th>}
          {showPrev && <th className="num">Зміна</th>}
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.key}>
            <td className="lbl">{r.label}</td>
            <td className="num strong">{formatMetric(r.value, r.format, r.currency)}</td>
            {showPrev && <td className="num muted">{formatMetric(r.before, r.format, r.currency)}</td>}
            {showPrev && <td className="num"><Delta delta={r.delta} tone={r.tone} /></td>}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// The sheet-style breakdown: metrics down the side, the account total and then one
// column per campaign group; the best group in each row is marked green.
export function GroupsTable({ keys, total, groups, custom, currency }) {
  if (!groups.length) return null;
  const columns = [{ name: 'Весь акаунт', base: total, total: true }, ...groups.map((g) => ({ name: g.name, base: g }))];
  return (
    <HScroll>
      <table className="prep-table prep-table--groups prep-table--wide">
        <thead>
          <tr>
            <th>Метрика</th>
            {columns.map((c) => <th key={c.name} className={'num' + (c.total ? ' total' : '')}>{c.name}{c.base.campaignCount && !c.base.single ? <small> · {c.base.campaignCount} камп.</small> : null}</th>)}
          </tr>
        </thead>
        <tbody>
          {keys.map((key) => {
            const m = metricMeta(key, custom);
            const values = columns.map((c) => computeMetric(key, c.base, custom));
            const best = bestOf(values.slice(1), m.goodWhen);
            return (
              <tr key={key}>
                <td className="lbl">{m.label}</td>
                {values.map((v, i) => (
                  <td key={columns[i].name} className={'num' + (columns[i].total ? ' total' : '') + (best != null && i > 0 && v === best ? ' best' : '')}>
                    {formatMetric(v, m.format, currency)}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </HScroll>
  );
}

// Plain rows for CSV / XLSX of the metrics table.
export function metricsToExport(rows, showPrev = true) {
  const columns = showPrev ? ['Метрика', 'Цей період', 'Попередній', 'Зміна, %'] : ['Метрика', 'Значення'];
  const data = rows.map((r) => showPrev
    ? [r.label, formatMetric(r.value, r.format, r.currency), formatMetric(r.before, r.format, r.currency), r.delta == null ? '' : Number(r.delta.toFixed(1))]
    : [r.label, formatMetric(r.value, r.format, r.currency)]);
  return { columns, rows: data };
}

export function groupsToExport(keys, total, groups, custom, currency) {
  const cols = [{ name: 'Весь акаунт', base: total }, ...groups.map((g) => ({ name: g.name, base: g }))];
  return {
    columns: ['Метрика', ...cols.map((c) => c.name)],
    rows: keys.map((k) => {
      const m = metricMeta(k, custom);
      return [m.label, ...cols.map((c) => formatMetric(computeMetric(k, c.base, custom), m.format, currency))];
    }),
  };
}

export { deltaPct, deltaTone };
