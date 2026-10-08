import { useEffect, useRef, useState } from 'react';
import { exportCsv, exportXlsx, exportPng, exportPdf, safeFileName } from '../../../lib/reportExport';

// "Завантажити" menu: CSV and XLSX come from the data model, PNG and PDF from a
// picture of the element that holds the tables (`targetRef`).
export default function ExportMenu({ model, targetRef, fileBase, disabled }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const wrapRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  async function run(kind) {
    setError('');
    setBusy(kind);
    const name = safeFileName(fileBase);
    try {
      if (kind === 'csv') exportCsv(model, name);
      else if (kind === 'xlsx') exportXlsx(model, name);
      else if (kind === 'png') await exportPng(targetRef.current, name);
      else if (kind === 'pdf') await exportPdf(targetRef.current, name);
      setOpen(false);
    } catch (e) {
      console.warn('export failed', e);
      setError('Не вдалося зберегти файл.');
    } finally {
      setBusy('');
    }
  }

  return (
    <div className="prep-export" ref={wrapRef}>
      <button type="button" className="btn" onClick={() => setOpen((o) => !o)} disabled={disabled}>Завантажити ▾</button>
      {open && (
        <div className="prep-export-menu">
          {[['xlsx', 'Excel (.xlsx)'], ['csv', 'CSV'], ['pdf', 'PDF'], ['png', 'Картинка (PNG)']].map(([k, label]) => (
            <button key={k} type="button" onClick={() => run(k)} disabled={Boolean(busy)}>{busy === k ? '...' : label}</button>
          ))}
          {error && <div className="pacc-err">{error}</div>}
        </div>
      )}
    </div>
  );
}
