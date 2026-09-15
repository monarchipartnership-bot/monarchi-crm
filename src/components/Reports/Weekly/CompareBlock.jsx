import { useState } from 'react';
import BarChart from './BarChart';
import { bestFlags } from '../../../lib/weeklyLogic';

// One collapsible comparison block: a table (row per metric, column per
// selected week, best value per row highlighted) plus a bar chart.
// `rows`: [{ label, values: number|null per slot, hl?: bool }]
export default function CompareBlock({ title, slots, rows, formatter }) {
  const [open, setOpen] = useState(true);
  if (!rows.length) return null;

  return (
    <div className="cmp-block">
      <button type="button" className="cmp-block-head" onClick={() => setOpen((o) => !o)}>
        <span>{title}</span>
        <svg className={'chev' + (open ? ' open' : '')} viewBox="0 0 24 24"><path d="M9 6l6 6-6 6" /></svg>
      </button>
      {open && (
        <div className="cmp-block-body">
          <div style={{ overflowX: 'auto' }}>
            <table className="cmp-table">
              <thead>
                <tr>
                  <th />
                  {slots.map((s) => <th key={s.key}>{s.label}</th>)}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const flags = bestFlags(row.values);
                  return (
                    <tr key={row.label} className={row.hl ? 'hl' : ''}>
                      <td>{row.label}</td>
                      {row.values.map((v, i) => (
                        <td key={i} className={v === null ? 'na' : flags[i] ? 'best' : ''}>{formatter(v)}</td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {slots.length > 0 && (
            <BarChart
              labels={rows.map((r) => r.label)}
              series={slots.map((s, i) => ({ label: s.label, data: rows.map((r) => r.values[i]) }))}
            />
          )}
        </div>
      )}
    </div>
  );
}
