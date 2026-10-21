import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import ArchiveReportModal, { reportPeriodText, reportPlatformLabel } from '../../components/Projects/ArchiveReportModal';
import ReportReturnDialog from '../../components/Projects/ReportReturnDialog';
import { fetchPendingReports, fetchProjectReport, setReportStatus } from '../../lib/api/projectReportStore';
import { fetchApprovers } from '../../lib/api/projectAgents';
import { loadReportContext, extraKeysOf } from '../../lib/projectReportContext';
import { canApprove, reportActions } from '../../lib/projectHistory';
import '../../styles/reportPage.css';
import '../../styles/projectReports.css';
import '../../styles/projectHistory.css';

const TYPE = { weekly: 'Тижневий', monthly: 'Місячний', custom: 'Довільний' };
const stamp = (iso) => (iso ? new Date(iso).toLocaleString('uk-UA', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '');

// «Звіти на затвердження»: every report of every project that waits for the person's approval. Open it, check it, fill in what is missing in the
// report, press «Затвердити»: it goes to its place in the project's history (and the client's page).
export default function ReportApprovals() {
  const navigate = useNavigate();
  const { email } = useAuth();
  const [rows, setRows] = useState(null);
  const [openRow, setOpenRow] = useState(null); // { row, ctx }
  const [returning, setReturning] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [pending, approvers] = await Promise.all([fetchPendingReports(), fetchApprovers()]);
    setRows(pending.filter((r) => canApprove(email, approvers.get(r.project_id))));
  }, [email]);
  useEffect(() => { load(); }, [load]);

  async function open(r) {
    setError('');
    try {
      const [row, ctx] = await Promise.all([fetchProjectReport(r.id), loadReportContext(r.project_id)]);
      if (row) setOpenRow({ row, ctx });
    } catch (e) { setError(e.message || 'Не вдалося відкрити звіт.'); }
  }
  async function act(row, action, note) {
    setBusy(true);
    setError('');
    try { await setReportStatus(row.id, action, { by: email, note }); setOpenRow(null); await load(); } catch (e) { setError(e.message || 'Не вдалося змінити статус.'); } finally { setBusy(false); }
  }
  const onAction = (row, action) => (action === 'return' ? setReturning(row) : act(row, action));

  return (
    <div className="report-page proj-approvals">
      <div className="ph-queue-head" style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', marginBottom: 16 }}>
        <button type="button" className="btn" onClick={() => navigate('/projects')}>← Проєкти</button>
        <h2 style={{ margin: 0 }}>Звіти на затвердження</h2>
      </div>
      {error && <div className="pacc-err">{error}</div>}
      {rows == null && <div className="empty-hint">Завантаження...</div>}
      {rows && rows.length === 0 && <div className="empty-hint">Звітів на затвердженні немає. Тут зʼявляються тижневі й місячні звіти, які агент або менеджер відправив на перевірку.</div>}
      {rows && rows.length > 0 && (
        <div className="ph-queue">
          {rows.map((r) => (
            <div className="ph-queue-row" key={r.id}>
              <div><b>{r.projects?.name || `Проєкт ${r.project_id}`}</b><div className="ph-sub">{reportPlatformLabel(r.platform)}</div></div>
              <div>{TYPE[r.period_type] || r.period_type}</div>
              <div>{reportPeriodText(r)}</div>
              <div className="ph-sub">{r.source === 'agent' ? 'Зробив агент' : (r.review?.sentBy || 'Менеджер')} · {stamp(r.updated_at)}</div>
              <button type="button" className="btn btn-p" disabled={busy} onClick={() => open(r)}>Відкрити</button>
            </div>
          ))}
        </div>
      )}
      {openRow && (
        <ArchiveReportModal
          row={openRow.row} projectName={openRow.ctx.project?.name || ''} custom={openRow.ctx.custom} extraKeys={extraKeysOf(openRow.ctx.columns, openRow.row)}
          actions={reportActions(openRow.row.status, canApprove(email, openRow.ctx.approvers))} onAction={onAction}
          onClose={() => setOpenRow(null)}
        />
      )}
      {returning && (
        <ReportReturnDialog
          title={`${reportPlatformLabel(returning.platform)} · ${reportPeriodText(returning)}`}
          onClose={() => setReturning(null)}
          onSubmit={async (note) => { await setReportStatus(returning.id, 'return', { by: email, note }); setReturning(null); setOpenRow(null); await load(); }}
        />
      )}
    </div>
  );
}
