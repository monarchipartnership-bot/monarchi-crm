import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useConfirm } from '../common/ConfirmDialog';
import { useAuth } from '../../contexts/AuthContext';
import { HubTitle, RibbonMark } from './hubIcons';
import InfoTip from '../common/InfoTip';
import ReportEditor from './Workbench/ReportEditor';
import ArchiveReportModal, { reportPeriodText, reportPlatformLabel } from './ArchiveReportModal';
import MonthDocument from './MonthDocument';
import ReportReturnDialog from './ReportReturnDialog';
import ShareLinkBox from './ShareLinkBox';
import { deleteProjectReport, fetchCampaignGroups, fetchProjectReports, refreshMonthTotal, setReportStatus } from '../../lib/api/projectReportStore';
import { fetchProjectDecks } from '../../lib/api/projectDecks';
import { loadReportContext, extraKeysOf } from '../../lib/projectReportContext';
import { accountPlatforms, TOTAL_TAB } from '../../lib/reportScope';
import { platformInfo } from '../../lib/adAccounts';
import { buildMonths, canApprove, monthKey, reportActions, REPORT_STATUS } from '../../lib/projectHistory';
import '../../styles/projectReports.css';
import '../../styles/projectHistory.css';
import '../../styles/historyHub.css';

const fmt = (s) => s.split('-').reverse().join('.');
const today = () => new Date().toISOString().slice(0, 10);
const stamp = (iso) => (iso ? new Date(iso).toLocaleString('uk-UA', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '');

const SEC_ICONS = {
  journey: <path d="M3 12a9 9 0 1 0 3-6.7M3 4v5h5M12 8v4l3 2" />,
  range: <><rect x="3.5" y="5" width="17" height="15" rx="2" /><path d="M3.5 10h17M8 3v4M16 3v4M8 14h3M13 14h3" /></>,
  open: <path d="M9 6l6 6-6 6" />,
  trash: <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6" />,
};
const HubIcon = ({ n }) => <svg viewBox="0 0 24 24" aria-hidden="true">{SEC_ICONS[n]}</svg>;
const Medal = ({ n, cls = '' }) => <span className={'hub-ring ph-md ' + cls} aria-hidden="true"><span className="hub-tile hub-tile--ln"><HubIcon n={n} /></span></span>;

const Chip = ({ status, toDate }) => (toDate ? <i className="ph-chip ph-chip--todate">Оновлюється</i> : status ? <i className={'ph-chip ph-chip--' + status}>{REPORT_STATUS[status] || status}</i> : <i className="ph-chip ph-chip--none">ще не створено</i>);


// «Історія проекту» has two categories. «Перебіг проекту»: month cards, one scope (platform) at a time like the report pages. A card holds the weeks of the
// month, the monthly report and the combined document. A report is a draft, in rework or approved; only the approved ones reach the client, the others are
// opened in «Робота над звітами». «Кастомні звіти»: the reports made in «Показники за період» (any dates); they never go to the client and are opened,
// edited, downloaded and deleted right here.
export default function ProjectHistoryTab({ projectId }) {
  const navigate = useNavigate();
  const { email } = useAuth();
  const [params, setParams] = useSearchParams();
  const [confirm, confirmDialog] = useConfirm();
  const [rows, setRows] = useState(null);
  const [decks, setDecks] = useState([]);
  const [ctx, setCtx] = useState({ project: null, accounts: [], custom: [], columns: {}, approvers: [] });
  const [groups, setGroups] = useState([]);
  const [openId, setOpenId] = useState(null);
  const [docKey, setDocKey] = useState(null);
  const [returning, setReturning] = useState(null);
  const [closed, setClosed] = useState({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');

  const load = useCallback(async () => {
    const [r, d] = await Promise.all([fetchProjectReports(projectId), fetchProjectDecks(projectId)]);
    setRows(r);
    setDecks(d);
  }, [projectId]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    let off = false;
    loadReportContext(projectId).then((c) => { if (!off) setCtx(c); }).catch(() => {});
    fetchCampaignGroups(projectId).then((g) => { if (!off) setGroups(g); }).catch(() => {});
    return () => { off = true; };
  }, [projectId]);

  const platforms = useMemo(() => [...new Set([...accountPlatforms(ctx.accounts), ...(rows || []).map((r) => r.platform).filter((p) => p && p !== 'all')])], [ctx.accounts, rows]);
  const scopeOf = (tab) => (tab !== TOTAL_TAB ? tab : platforms.length === 1 ? platforms[0] : 'all');
  const tabs = [...platforms.map((p) => ({ key: p, label: platformInfo(p).label })), { key: TOTAL_TAB, label: 'Разом' }];
  const wanted = params.get('platform');
  const tab = tabs.some((t) => t.key === wanted) ? wanted : tabs[0].key;
  const scopeRows = useMemo(() => (rows || []).filter((r) => (r.platform || 'all') === scopeOf(tab)), [rows, tab, platforms]); // eslint-disable-line react-hooks/exhaustive-deps
  const section = params.get('section') === 'custom' ? 'custom' : 'journey';
  const months = useMemo(() => buildMonths(scopeRows.filter((r) => r.period_type !== 'custom'), today()), [scopeRows]);
  const customRows = useMemo(() => scopeRows.filter((r) => r.period_type === 'custom').sort((a, b) => String(b.period_start).localeCompare(String(a.period_start)) || String(b.updated_at).localeCompare(String(a.updated_at))), [scopeRows]);
  const customOpen = section === 'custom' ? customRows.find((r) => r.id === Number(params.get('report'))) || null : null;
  const approver = canApprove(email, ctx.approvers);
  const projectName = ctx.project?.name || '';

  const open = (rows || []).find((r) => r.id === openId) || null;
  const doc = months.find((m) => m.key === docKey) || null;

  function pick(key) {
    const next = new URLSearchParams(params);
    next.set('platform', key);
    next.delete('report');
    setParams(next, { replace: true });
  }
  function pickSection(key) {
    const next = new URLSearchParams(params);
    if (key === 'custom') next.set('section', 'custom'); else next.delete('section');
    next.delete('report');
    setParams(next, { replace: true });
  }
  function openCustom(id) {
    const next = new URLSearchParams(params);
    if (id) next.set('report', id); else next.delete('report');
    setParams(next, { replace: true });
  }

  async function act(row, action, note) {
    setBusy(true);
    setError('');
    try {
      await setReportStatus(row.id, action, { by: email, note });
      // an approved (or withdrawn) week changes the running total of its month
      if ((action === 'approve' || action === 'return') && row.period_type === 'weekly') {
        setNote('Оновлюємо підсумок місяця…');
        const r = await refreshMonthTotal(projectId, monthKey(row.period_start));
        if (r.error) setError('Тиждень оновлено, але підсумок місяця не вдалося перерахувати: ' + r.error);
      }
      await load();
    } catch (e) { setError(e.message || 'Не вдалося змінити статус.'); } finally { setBusy(false); setNote(''); }
  }
  function onAction(row, action) {
    if (action === 'return') { setReturning(row); return; }
    act(row, action);
  }
  async function remove(r) {
    if (!(await confirm({ title: 'Видалити звіт?', body: 'Видалити збережений звіт з історії? Дію не можна скасувати. Презентація, зроблена з нього, залишиться.', confirmLabel: 'Видалити звіт', danger: true }))) return;
    try { await deleteProjectReport(r.id); setOpenId(null); await load(); } catch (e) { setError(e.message || 'Не вдалося видалити.'); }
  }
  const presentation = (r, platform) => navigate(`/clients?project=${projectId}&type=${r.period_type}&start=${r.period_start}&end=${r.period_end}&platform=${platform}`);

  const rowLine = (row, name, dates, key) => (
    <li key={key}>
      <span className="ph-name">{row?.data?.toDate ? `${name} · на сьогодні` : name}</span>
      <span className="ph-dates">{row?.data?.toDate ? `${fmt(row.period_start)} – ${fmt(row.period_end)}` : dates}</span>
      {row ? <Chip status={row.status} toDate={row.data?.toDate} /> : <Chip />}
      {row ? (
        <span className="ph-act">
          {(row.data?.toDate ? [] : reportActions(row.status, approver)).map((a) => <button key={a.action} type="button" className={'btn' + (a.primary ? ' btn-p' : '')} disabled={busy} onClick={() => onAction(row, a.action)}>{a.label}</button>)}
          <button type="button" className="btn" onClick={() => (row.status === 'final' ? setOpenId(row.id) : navigate(`/projects/${projectId}?tab=work&report=${row.id}&platform=${row.platform}`))}>Відкрити</button>
        </span>
      ) : <span className="ph-missing">Зʼявиться, коли агент або менеджер створить звіт за цей період.</span>}
      {row?.data?.review?.returnedNote && row.status === 'rework' && <span className="ph-note">Повернуто на доопрацювання: {row.data.review.returnedNote}</span>}
    </li>
  );

  return (
    <section className="report-section">
      {!customOpen && (
        <>
          <HubTitle icon="file" className="prep-box-title">Історія проекту<InfoTip>{section === 'custom' ? 'Звіти за будь-який період, збережені в «Формування звіту» → «Показники за період». Клієнту вони не йдуть: їх можна відкрити, змінити, видалити й завантажити.' : 'Місяці з тижневими звітами: чернетка, доробка, затверджено. Клієнт бачить лише затверджене; чернетки й доробка опрацьовуються в розділі «Робота над звітами».'}</InfoTip></HubTitle>
          <div className="ph-tiles" role="tablist" aria-label="Розділи історії">
            {[
              { key: 'journey', title: 'Перебіг проекту', caption: 'Тижні й місяці: те, що бачить клієнт', n: months.length, icon: 'journey' },
              { key: 'custom', title: 'Кастомні звіти', caption: 'Будь-який період, клієнту не йдуть', n: customRows.length, icon: 'range' },
            ].map((t) => (
              <button key={t.key} type="button" role="tab" aria-selected={section === t.key} className={'ph-tile' + (section === t.key ? ' on' : '')} onClick={() => pickSection(t.key)}>
                <Medal n={t.icon} />
                <span className="ph-tn">{t.n}</span>
                <span className="ph-tt"><b>{t.title}</b><small>{t.caption}</small></span>
              </button>
            ))}
          </div>
          <div className="prep-seg" role="tablist" aria-label="Платформи">
            {tabs.map((t) => (
              <button key={t.key} type="button" role="tab" aria-selected={t.key === tab} className={'prep-seg-tab' + (t.key === tab ? ' on' : '')} onClick={() => pick(t.key)}>
                <RibbonMark platform={t.key === TOTAL_TAB ? null : t.key} />{t.label}
              </button>
            ))}
          </div>
        </>
      )}
      {section === 'journey' && <ShareLinkBox projectId={projectId} scope={scopeOf(tab)} label={tabs.find((t) => t.key === tab)?.label || ''} />}
      {error && <div className="pacc-err">{error}</div>}
      {note && <div className="pacc-hint" role="status">{note}</div>}
      {rows == null && <div className="empty-hint">Завантаження...</div>}
      {rows && section === 'custom' && (customOpen ? (
        <ReportEditor key={customOpen.id} row={customOpen} ctx={{ ...ctx, groups }} onBack={() => openCustom(null)} onChanged={load} />
      ) : customRows.length === 0 ? (
        <div className="ph-cempty">
          <span className="hub-ring ph-md ph-md--xl st-mu" aria-hidden="true"><span className="hub-tile hub-tile--ln"><HubIcon n="range" /></span></span>
          <h3>Кастомних звітів немає</h3>
          <p>Оберіть період у «Формування звіту» → «Показники за період», натисніть «Показати», потім «Зберегти».</p>
        </div>
      ) : (
        <ul className="ph-clist">
          {customRows.map((r) => (
            <li key={r.id}>
              <Medal n="range" />
              <div className="ph-ct">
                <b>{reportPeriodText(r)}</b>
                <span className="ph-cs"><i className={'ph-plt ph-plt--' + r.platform}>{reportPlatformLabel(r.platform)}</i><span>оновлено {stamp(r.updated_at)}</span></span>
              </div>
              <span className="ph-grow" />
              <span className="ph-cact">
                <button type="button" className="btn" onClick={() => openCustom(r.id)}><HubIcon n="open" />Відкрити</button>
                <button type="button" className="btn ph-cdel" onClick={() => remove(r)}><HubIcon n="trash" />Видалити</button>
              </span>
            </li>
          ))}
        </ul>
      ))}
      {rows && section === 'journey' && (
        <div className="ph-months">
          {months.map((m, i) => {
            const isOpen = closed[m.key] === undefined ? i === 0 : !closed[m.key];
            const share = m.counts.total ? Math.round((m.counts.approved / m.counts.total) * 100) : 0;
            const tone = m.counts.total && share === 100 && m.monthly?.status === 'approved' ? ' st-ok' : m.counts.rework ? ' st-paused' : '';
            return (
              <article key={m.key} className={'ph-month' + (isOpen ? ' open' : '')}>
                <header onClick={() => setClosed((c) => ({ ...c, [m.key]: isOpen }))}>
                  <span className={'hub-ring hub-ring--sm ph-ring' + tone} style={{ '--p': share }} aria-hidden="true"><span className="hub-tile hub-tile--ln"><svg viewBox="0 0 24 24"><path d="M3 12a9 9 0 1 0 3-6.7M3 4v5h5M12 8v4l3 2" /></svg></span></span>
                  <div className="ph-mt">
                    <h3>{m.label}</h3>
                    <span className="ph-sum">Тижні: {m.counts.approved} з {m.counts.total} затверджено{m.counts.rework ? `, в доробці: ${m.counts.rework}` : ''}</span>
                  </div>
                  <Chip status={m.monthly?.status} />
                  <span className="ph-grow" />
                  {m.updatedAt && <span className="ph-sum">оновлено {stamp(m.updatedAt)}</span>}
                  <button type="button" className="btn" onClick={(e) => { e.stopPropagation(); setDocKey(m.key); }} disabled={!m.weeks.some((w) => w.row) && !m.monthly}>
                    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3h8l4 4v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" /><path d="M14 3v5h5M9 13h6M9 17h4" /></svg>Загальний документ
                  </button>
                  <span className="ph-chev" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M6 9l6 6 6-6" /></svg></span>
                </header>
                {isOpen && (
                  <div className="ph-month-body">
                    <ul className="ph-rows">
                      {m.weeks.map((w) => rowLine(w.row, `Тиждень ${w.n}`, `${fmt(w.start)} – ${fmt(w.end)}`, w.start))}
                      {rowLine(m.monthly, 'Місяць', `${fmt(m.start)} – ${fmt(m.end)}`, 'month')}
                      {m.others.map((r) => rowLine(r, r.period_type === 'weekly' ? 'Тиждень (інший період)' : 'Місяць (інший період)', reportPeriodText(r), 'o' + r.id))}
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
          actions={open.data?.toDate ? [] : reportActions(open.status, approver)} onAction={onAction} onChanged={load}
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
