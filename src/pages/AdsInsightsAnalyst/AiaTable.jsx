import { exportTableCSV, exportTableXLSX } from '../../lib/aiInsightsExport';

export default function AiaTable({ title, columns, rows }) {
  return (
    <div className="aia-visual aia-visual-table">
      {title && <div className="aia-visual-title">{title}</div>}
      <div className="aia-table-scroll">
        <table className="aia-table">
          <thead>
            <tr>{columns.map((c, i) => <th key={i}>{c}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i}>{row.map((cell, j) => <td key={j}>{cell}</td>)}</tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="aia-visual-actions">
        <button type="button" onClick={() => exportTableCSV({ title, columns, rows })}>CSV</button>
        <button type="button" onClick={() => exportTableXLSX({ title, columns, rows })}>XLSX</button>
      </div>
    </div>
  );
}
