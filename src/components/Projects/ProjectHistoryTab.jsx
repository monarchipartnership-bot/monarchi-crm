import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useConfirm } from '../common/ConfirmDialog';
import { useAuth } from '../../contexts/AuthContext';
import { HubTitle, RibbonMark } from './hubIcons';
import ArchiveReportModal, { reportPeriodText, reportPlatformLabel } from './ArchiveReportModal';
import MonthDocument from './MonthDocument';
import ReportReturnDialog from './ReportReturnDialog';
import { deleteProjectReport, fetchProjectReports, setReportStatus } from '../../lib/api/projectReportStore';
import { fetchProjectDecks } from '../../lib/api/projectDecks';
import { loadReportContext, extraKeysOf } from '../../lib/projectReportContext';
import { accountPlatforms, TOTAL_TAB } from '../../lib/reportScope';
import { platformInfo } from '../../lib/adAccounts';
import { buildMonths, canApprove, reportActions, REPORT_STATUS } from '../../lib/projectHistory';
import '../../styles/projectReports.css';
import '../../styles/projectHistory.css';

const fmt = (s) => s.split('-').reverse().join('.');
const today = () => new Date().toISOString().slice(0, 10);
const stamp = (iso) => (iso ? new Date(iso).toLocaleString('uk-UA', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '');

const Chip = ({ status }) => (status ? <i className={'ph-chip ph-chip--' + status}>{REPORT_STATUS[status] || status}</i> : <i className="ph-chip ph-chip--none">ще не створено</i>);

// «Історія проекту»: month cards, one scope (platform) at a time like the report pages. A card holds the weeks of the month, the monthly report and the
// combined document. A report goes draft → on approval → approved; only the approved ones reach the client.
export default function ProjectHistoryTab({ projectId }) {
  const navigate = useNavigate();
  const { email } = useAuth();
  const [params, setParams] = useSearchParams();
  const [confirm, confirmDialog] = useConfirm();
  const [rows, setRows] = useState(null);
  const [decks, setDecks] = useState([]);
  const [ctx, setCtx] = useState({ project: null, accounts: [], custom: [], columns: {}, approvers: [] });
  const [openId, setOpenId] = useState(null);
  const [docKey, setDocKey] = useState(null);
  const [returning, setReturning] = useState(null);
  const [closed, setClosed] = useState({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [r, d] = await Promise.all([fetchProjectReports(projectId), fetchProjectDecks(projectId)]);
    setRows(r);
    setDecks(d);
  }, [projectId]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    let off = false;
    loadReportContext(projectId).then((c) => { if (!off) setCtx(c); }).catch(() => {});
    return () => { off = true; };
  }, [projectId]);

  const platforms = useMemo(() => [...new Set([...accountPlatforms(ctx.accounts), ...(rows || []).map((r) => r.platform).filter((p) => p && p !== 'all')])], [ctx.accounts, rows]);
  const scopeOf = (tab) => (tab !== TOTAL_TAB ? tab : platforms.length === 1 ? platforms[0] : 'all');
  const tabs = [...platforms.map((p) => ({ key: p, label: platformInfo(p).label })), { key: TOTAL_TAB, label: 'Разом' }];
  const wanted = params.get('platform');
  const tab = tabs.some((t) => t.key === wanted) ? wanted : tabs[0].key;
  const scopeRows = useMemo(() => (rows || []).filter((r) => (r.platform || 'all') === scopeOf(tab)), [rows, tab, platforms]); // eslint-disable-line react-hooks/exhaustive-deps
  const months = useMemo(() => buildMonths(scopeRows, today()), [scopeRows]);
  const approver = canApprove(email, ctx.approvers);
  const projectName = ctx.project?.name || '';

  const open = (rows || []).find((r) => r.id === openId) || null;
  const doc = months.find((m) => m.key === docKey) || null;

  function pick(key) {
    const next = new URLSearchParams(params);
    next.set('platform', key);
    setParams(next, { replace: true });
  }

  async function act(row, action, note) {
    setBusy(true);
    setError('');
    try { await setReportStatus(row.id, action, { by: email, note }); await load(); } catch (e) { setError(e.message || 'Не вдалося змінити статус.'); } finally { setBusy(false); }
  }
  function onAction(row, action) {
    if (action === 'return') { setReturning(row); return; }
    act(row, action);
  }
  async function remove(r) {
    if (!(await confirm({ title: 'Видалити звіт?', body: 'Видалити збережений звіт з історії? Дію не можна скасувати. Презентація, зроблена з нього, залишиться.', confirmLabel: 'Видалити звіт', danger: true }))) return;
    try { await deleteProjectReport(r.id); setOpenId(null); await load(); } catch (e) { setError(e.message || 'Не вдалося видалити.'); }
  }
  const presentation = (r, platform) => navigate(`/clients?project=${projectId}&type=${r.period_type}&start=${r.period_start}&platform=${platform}`);

  const rowLine = (row, name, dates, key) => (
    <li key={key}>
      <span className="ph-name">{name}</span>
      <span className="ph-dates">{dates}</span>
      {row ? <Chip status={row.status} /> : <Chip />}
      {row ? (
        <span className="ph-act">
          {reportActions(row.status, approver).map((a) => <button key={a.action} type="button" className={'btn' + (a.primary ? ' btn-p' : '')} disabled={busy} onClick={() => onAction(row, a.action)}>{a.label}</button>)}
          <button type="button" className="btn" onClick={() => setOpenId(row.id)}>Відкрити</button>
        </span>
      ) : <span className="ph-missing">Зʼявиться, коли агент або менеджер створить звіт за цей період.</span>}
      {row?.data?.review?.returnedNote && row.status === 'draft' && <span className="ph-note">Повернуто на доопрацювання: {row.data.review.returnedNote}</span>}
    </li>
  );

  return (
    <section className="report-section">
      <HubTitle icon="file" className="prep-box-title">Історія проекту</HubTitle>
      <div className="prep-seg" role="tablist" aria-label="Платформи">
        {tabs.map((t) => (
          <button key={t.key} type="button" role="tab" aria-selected={t.key === tab} className={'prep-seg-tab' + (t.key === tab ? ' on' : '')} onClick={() => pick(t.key)}>
            <RibbonMark platform={t.key === TOTAL_TAB ? null : t.key} />{t.label}
          </button>
        ))}
      </div>
      {error && <div className="pacc-err">{error}</div>}
      {rows == null && <div className="empty-hint">Завантаження...</div>}
      {rows && (
        <div className="ph-months">
          {months.map((m, i) => {
            const isOpen = closed[m.key] === undefined ? i === 0 : !closed[m.key];
            return (
              <article key={m.key} className={'ph-month' + (isOpen ? ' open' : '')}>
                <header onClick={() => setClosed((c) => ({ ...c, [m.key]: isOpen }))}>
                  <span className="ph-chev" aria-hidden="true">›</span>
                  <h3>{m.label}</h3>
                  <span className="ph-sum">Тижні: {m.counts.approved} з {m.counts.total} затверджено{m.counts.pending ? `, на затвердженні: ${m.counts.pending}` : ''}</span>
                  <Chip status={m.monthly?.status} />
                  <span className="ph-grow" />
                  {m.updatedAt && <span className="ph-sum">оновлено {stamp(m.updatedAt)}</span>}
                  <button type="button" className="btn" onClick={(e) => { e.stopPropagation(); setDocKey(m.key); }} disabled={!m.weeks.some((w) => w.row) && !m.monthly}>Загальний документ</button>
                </header>
                {isOpen && (
                  <div className="ph-month-body">
                    <ul className="ph-rows">
                      {m.weeks.map((w) => rowLine(w.row, `Тиждень ${w.n}`, `${fmt(w.start)} – ${fmt(w.end)}`, w.start))}
                      {rowLine(m.monthly, 'Місяць', `${fmt(m.start)} – ${fmt(m.end)}`, 'month')}
                      {m.others.map((r) => rowLine(r, r.period_type === 'weekly' ? 'Тиждень (інший період)' : r.period_type === 'monthly' ? 'Місяць (інший період)' : 'Довільний', reportPeriodText(r), 'o' + r.id))}
                    </ul>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
      {open && (
        <ArchiveReportModal
          row={open} projectName={projectName} custom={ctx.custom} extraKeys={extraKeysOf(ctx.columns, open)}
          actions={reportActions(open.status, approver)} onAction={onAction}
          onClose={() => setOpenId(null)} onDelete={remove} onPresentation={presentation}
        />
      )}
      {doc && <MonthDocument month={doc} projectName={projectName} custom={ctx.custom} extraKeys={(r) => extraKeysOf(ctx.columns, r)} onClose={() => setDocKey(null)} />}
      {returning && (
        <ReportReturnDialog
          title={`${reportPlatformLabel(returning.platform)} · ${reportPeriodText(returning)}`}
          onClose={() => setReturning(null)}
          onSubmit={async (note) => { await setReportStatus(returning.id, 'return', { by: email, note }); setReturning(null); setOpenId(null); await load(); }}
        />
      )}
      {confirmDialog}
    </section>
  );
}
