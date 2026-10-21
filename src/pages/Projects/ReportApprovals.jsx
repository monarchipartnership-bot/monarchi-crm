import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import ArchiveReportModal, { reportPeriodText, reportPlatformLabel } from '../../components/Projects/ArchiveReportModal';
import ReportReturnDialog from '../../components/Projects/ReportReturnDialog';
import { fetchPendingReports, fetchProjectReport, refreshMonthTotal, setReportStatus } from '../../lib/api/projectReportStore';
import { fetchApprovers } from '../../lib/api/projectAgents';
import { loadReportContext, extraKeysOf } from '../../lib/projectReportContext';
import { canApprove, monthKey, reportActions } from '../../lib/projectHistory';
import '@fontsource/onest/500.css';
import '@fontsource/onest/600.css';
import '@fontsource/onest/700.css';
import '@fontsource/onest/800.css';
import '../../styles/reportPage.css';
import '../../styles/projectReports.css';
import '../../styles/projectHistory.css';
import '../../styles/projectApprovalsHub.css';

const TYPE = { weekly: 'Тижневий', monthly: 'Місячний', custom: 'Довільний' };
const BACK_ICON = '<svg viewBox="0 0 24 24"><path d="M19 12H5M11 6l-6 6 6 6"/></svg>';
const QUEUE_ICON = '<svg viewBox="0 0 24 24"><rect x="4" y="3.5" width="16" height="17" rx="2.5"/><path d="M8 9h8M8 13h4M13.5 16.5l1.8 1.8 3.2-3.4"/></svg>';
const CAL_ICON = '<svg viewBox="0 0 24 24"><rect x="3.5" y="5" width="17" height="15" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/></svg>';
const BOT_ICON = '<svg viewBox="0 0 24 24"><rect x="4" y="8" width="16" height="11" rx="3"/><path d="M12 4v4M9 13h.01M15 13h.01M9.5 16h5"/></svg>';
const PERSON_ICON = '<svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="3.6"/><path d="M5 20a7 7 0 0 1 14 0"/></svg>';
const OPEN_ICON = '<svg viewBox="0 0 24 24"><path d="M14 4h6v6M20 4l-9 9M18 14v5H5V6h5"/></svg>';
const CHECK_ICON = '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
const ALERT_ICON = '<svg viewBox="0 0 24 24"><path d="M12 3.5l9 15.5H3z"/><path d="M12 10v4M12 17h.01"/></svg>';
const initials = (name) => (name || '?').split(' ').filter(Boolean).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
const countText = (n) => `${n} ${n === 1 ? 'звіт чекає' : 'звіти чекають'} на ваше затвердження`;
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
    try {
      await setReportStatus(row.id, action, { by: email, note });
      setOpenRow(null);
      if (action === 'approve' && row.period_type === 'weekly') {
        const r = await refreshMonthTotal(row.project_id, monthKey(row.period_start));
        if (r.error) setError('Тиждень затверджено, але підсумок місяця не вдалося перерахувати: ' + r.error);
      }
      await load();
    } catch (e) { setError(e.message || 'Не вдалося змінити статус.'); } finally { setBusy(false); }
  }
  const onAction = (row, action) => (action === 'return' ? setReturning(row) : act(row, action));

  return (
    <div className="report-page proj-approvals pa-hub">
      <div className="pa-head">
        <button type="button" className="pa-back" onClick={() => navigate('/projects')} aria-label="Проєкти" title="Проєкти" dangerouslySetInnerHTML={{ __html: BACK_ICON }} />
        <span className="pa-md"><span className="pa-mi" dangerouslySetInnerHTML={{ __html: QUEUE_ICON }} /></span>
        <div className="pa-ht">
          <h2>Звіти на затвердження</h2>
          <small>{rows == null ? 'Завантаження…' : rows.length > 0 ? countText(rows.length) : 'Усе затверджено, нових звітів немає'}</small>
        </div>
        {rows && rows.length > 0 && <span className="pa-count" aria-hidden="true">{rows.length}</span>}
      </div>
      {error && (
        <div className="pa-err" role="alert">
          <span className="pa-md pa-md--sm pa-md--bad"><span className="pa-mi" dangerouslySetInnerHTML={{ __html: ALERT_ICON }} /></span>
          <div>{error}</div>
        </div>
      )}
      {rows == null && <div className="pa-hint">Завантаження...</div>}
      {rows && rows.length === 0 && (
        <div className="pa-empty">
          <span className="pa-md pa-md--xl pa-md--ok"><span className="pa-mi" dangerouslySetInnerHTML={{ __html: CHECK_ICON }} /></span>
          <h3>Звітів на затвердженні немає</h3>
          <p>Тут зʼявляються тижневі й місячні звіти, які агент або менеджер надіслали на затвердження. Коли щось надійде, лічильник на кнопці в «Проєктах» покаже кількість.</p>
          <button type="button" className="pa-btn" onClick={() => navigate('/projects')}><span dangerouslySetInnerHTML={{ __html: BACK_ICON }} /> До проєктів</button>
        </div>
      )}
      {rows && rows.length > 0 && (
        <div className="pa-queue">
          {rows.map((r) => (
            <div className="pa-row" key={r.id}>
              <span className="pa-md pa-md--sm"><span className="pa-mi pa-mi--tx">{initials(r.projects?.name)}</span></span>
              <div className="pa-name">
                <b>{r.projects?.name || `Проєкт ${r.project_id}`}</b>
                <span className={'pa-plat pa-plat--' + (r.platform === 'meta' ? 'meta' : r.platform === 'google' ? 'google' : 'all')}>{reportPlatformLabel(r.platform)}</span>
              </div>
              <div><span className={'pa-type pa-type--' + r.period_type}><i />{TYPE[r.period_type] || r.period_type}</span></div>
              <div className="pa-period"><span dangerouslySetInnerHTML={{ __html: CAL_ICON }} />{reportPeriodText(r)}</div>
              <div className="pa-who">
                {r.source === 'agent'
                  ? <span className="pa-agent"><span dangerouslySetInnerHTML={{ __html: BOT_ICON }} />Зробив агент</span>
                  : <span><span dangerouslySetInnerHTML={{ __html: PERSON_ICON }} />{r.review?.sentBy || 'Менеджер'}</span>}
                <small>{stamp(r.updated_at)}</small>
              </div>
              <button type="button" className="pa-btn" disabled={busy} onClick={() => open(r)}><span dangerouslySetInnerHTML={{ __html: OPEN_ICON }} /> Відкрити</button>
            </div>
          ))}
        </div>
      )}
      {openRow && (
        <ArchiveReportModal
          row={openRow.row} projectName={openRow.ctx.project?.name || ''} custom={openRow.ctx.custom} extraKeys={extraKeysOf(openRow.ctx.columns, openRow.row)}
          actions={reportActions(openRow.row.status, canApprove(email, openRow.ctx.approvers))} onAction={onAction}
          onChanged={async () => { const fresh = await fetchProjectReport(openRow.row.id); if (fresh) setOpenRow((o) => ({ ...o, row: fresh })); }}
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
