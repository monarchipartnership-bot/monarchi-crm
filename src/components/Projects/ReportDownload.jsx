import { useEffect, useRef, useState } from 'react';
import { ReportBody } from './ArchiveReportModal';
import { rowBlock, sheetNameOf } from '../../lib/reportWorkbook';
import { saveReportWorkbook } from '../../lib/reportWorkbookExport';
import { waitFor } from '../../lib/waitFor';
import '../../styles/projectHistory.css';

const FORMATS = [['xlsx', 'Excel (.xlsx)'], ['csv', 'CSV'], ['pdf', 'PDF']];

// «Завантажити» of ONE saved report (a week, the month, a custom period) straight from its row of the history, without opening it. Excel is the one-sheet
// file (the table, the texts and the creatives); CSV and PDF are made from the report mounted out of sight, so any status of the report can be downloaded.
export default function ReportDownload({ row, projectName, custom, extraKeys, lang = null }) {
  const [menu, setMenu] = useState(false);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [mounted, setMounted] = useState(false);
  const wrap = useRef(null);
  const api = useRef(null);

  useEffect(() => {
    if (!menu) return undefined;
    const onDown = (e) => { if (wrap.current && !wrap.current.contains(e.target)) setMenu(false); };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [menu]);

  async function run(kind) {
    setError('');
    setBusy(kind);
    try {
      if (kind === 'xlsx') {
        await saveReportWorkbook([rowBlock(row, { custom, extraKeys, lang })], { filename: `${projectName}_${row.period_type}_${row.period_start}_${row.platform}`, sheetName: sheetNameOf(row) });
      } else {
        setMounted(true); // the report is drawn out of sight, then it hands over its table
        const handle = await waitFor(() => api.current); // not a fixed pause: a big report on a phone is mounted later
        await handle.run(kind);
      }
      setMenu(false);
    } catch (e) {
      console.warn('download failed', e);
      setError(e?.message && /немає цифр|не встиг/.test(e.message) ? e.message : 'Не вдалося зберегти файл.');
    } finally {
      setBusy('');
      setMounted(false);
    }
  }

  return (
    <span className="prep-export rdl" ref={wrap}>
      <button type="button" className="btn" aria-haspopup="menu" aria-expanded={menu} onClick={() => setMenu((m) => !m)}>Завантажити ▾</button>
      {menu && (
        <div className="prep-export-menu" role="menu">
          {FORMATS.map(([k, label]) => <button key={k} type="button" role="menuitem" disabled={Boolean(busy)} onClick={() => run(k)}>{busy === k ? '…' : label}</button>)}
          {error && <div className="pacc-err">{error}</div>}
        </div>
      )}
      {mounted && (
        <div className="rdl-offscreen" aria-hidden="true">
          <ReportBody row={row} projectName={projectName} custom={custom} extraKeys={extraKeys} lang={lang} noExport exportApi={api} />
        </div>
      )}
    </span>
  );
}
