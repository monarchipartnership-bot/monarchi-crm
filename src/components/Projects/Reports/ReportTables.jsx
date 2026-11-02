import { useEffect, useRef } from 'react';
import { computeMetric, formatMetric, metricMeta, deltaPct, deltaTone } from '../../../lib/reportMetrics';
import { useRowTools } from '../../ClientReport/rowTools';

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
// `clientEye`: { hidden: [keys], onToggle(key) } puts an eye before every metric (the workspace of a report: what the client does not see).
// `tools`: { onChange(action, key, toKey, toIndex), options(key) } lets a person drag a metric, replace it or remove it (the same buttons as in the report builder).
export function ReportMetricsTable({ rows, showPrev = true, curLabel = 'Цей період', prevLabel = 'Попередній', clientEye = null, tools = null }) {
  const rt = useRowTools(tools);
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
        {rows.map((r, ri) => (
          <tr key={r.key} {...rt.rowAttrs(r.key, ri, clientEye && clientEye.hidden.includes(r.key) ? 'rt-off' : '')}>
            <td className="lbl" {...rt.cellAttrs(r.key, ri, rows.map((x) => x.key))}>
              {rt.toolbar(r.key, r.label)}
              {clientEye && (() => {
                const on = !clientEye.hidden.includes(r.key);
                return (
                  <button type="button" className={'rt-eye' + (on ? ' on' : '')} aria-pressed={on} aria-label={`${r.label}: ${on ? 'бачить клієнт' : 'приховано від клієнта'}`} title={on ? 'Клієнт бачить. Натисніть, щоб приховати' : 'Клієнт не бачить. Натисніть, щоб показати'} onClick={() => clientEye.onToggle(r.key)}>
                    <svg viewBox="0 0 24 24" aria-hidden="true">{on ? <><path d="M2.5 12S6 6 12 6s9.5 6 9.5 6-3.5 6-9.5 6S2.5 12 2.5 12z" /><circle cx="12" cy="12" r="2.8" /></> : <><path d="M3 3l18 18M10.6 6.2A9.8 9.8 0 0 1 12 6c5 0 8.5 4.2 9.5 6-.4.8-1.3 2.1-2.7 3.3M6.7 7.7C4.5 9.1 3.1 11 2.5 12c1 1.8 4.5 6 9.5 6 1.4 0 2.7-.3 3.8-.8" /><path d="M9.9 10a3 3 0 0 0 4.1 4.1" /></>}</svg>
                  </button>
                );
              })()}
              {rt.name(r.key, r.label)}
              {rt.replaceBox(r.key, r.label)}
            </td>
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
  // a group's column is its total (highlighted, like the account's); campaigns are columns of their own
  const columns = [{ id: 'all', name: 'Весь акаунт', base: total, total: true }, ...groups.map((g) => ({ id: g.id ?? g.name, name: g.name, base: g, total: g.kind === 'group', own: g.kind === 'group' ? 'сума групи' : null }))];
  return (
    <HScroll>
      <table className="prep-table prep-table--groups prep-table--wide">
        <thead>
          <tr>
            <th>Метрика</th>
            {columns.map((c) => <th key={c.id} className={'num' + (c.total ? ' total' : '')}>{c.name}{c.own ? <small> · {c.own}, {c.base.campaignCount} камп.</small> : c.base.campaignCount && !c.base.single && c.base.kind !== 'campaign' ? <small> · {c.base.campaignCount} камп.</small> : null}</th>)}
          </tr>
        </thead>
        <tbody>
          {keys.map((key) => {
            const m = metricMeta(key, custom);
            const values = columns.map((c) => computeMetric(key, c.base, custom));
            // the best one is picked among single campaigns / groups, not among group totals
            const best = bestOf(values.filter((v, i) => i > 0 && !columns[i].own), m.goodWhen);
            return (
              <tr key={key}>
                <td className="lbl">{m.label}</td>
                {values.map((v, i) => (
                  <td key={columns[i].id} className={'num' + (columns[i].total ? ' total' : '') + (best != null && i > 0 && !columns[i].own && v === best ? ' best' : '')}>
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

const EN = 'en-US'; // the files are English: words and numbers

// Plain rows for CSV / XLSX of the metrics table. The files are English only (they go to clients), whatever the language of the screen.
export function metricsToExport(rows, showPrev = true) {
  const columns = showPrev ? ['Metric', 'This period', 'Previous', 'Change, %'] : ['Metric', 'Value'];
  const data = rows.map((r) => showPrev
    ? [r.en || r.label, formatMetric(r.value, r.format, r.currency, EN), formatMetric(r.before, r.format, r.currency, EN), r.delta == null ? '' : Number(r.delta.toFixed(1))]
    : [r.en || r.label, formatMetric(r.value, r.format, r.currency, EN)]);
  return { columns, rows: data };
}

export function groupsToExport(keys, total, groups, custom, currency) {
  const cols = [{ name: 'General', base: total }, ...groups.map((g) => ({ name: g.kind === 'group' ? `${g.name} (group total)` : g.name, base: g }))];
  return {
    columns: ['Metric', ...cols.map((c) => c.name)],
    rows: keys.map((k) => {
      const m = metricMeta(k, custom);
      return [m.en || m.label, ...cols.map((c) => formatMetric(computeMetric(k, c.base, custom), m.format, currency, EN))];
    }),
  };
}

export { deltaPct, deltaTone };
