import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import DesignTodo from '../../common/DesignTodo';
import ReportEditor from './ReportEditor';
import { reportPeriodText, reportPlatformLabel } from '../ArchiveReportModal';
import { fetchCampaignGroups, fetchProjectReport, fetchWorkReports } from '../../../lib/api/projectReportStore';
import { loadReportContext } from '../../../lib/projectReportContext';
import { REPORT_STATUS } from '../../../lib/projectHistory';
import '../../../styles/projectReports.css';
import '../../../styles/workbench.css';

const TYPE_LABEL = { weekly: 'Тижневий', monthly: 'Місячний', custom: 'Довільний' };
const stamp = (iso) => (iso ? new Date(iso).toLocaleString('uk-UA', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '');

// «Робота над звітами»: the reports that are not ready yet. «Чернетки» are new ones (made by the agent or saved as a draft), «Доробка» are the ones returned from
// the history. A report opens in the workspace; when it is confirmed it goes to the history and to the client.
export default function ReportWorkbench({ projectId, onCount }) {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [rows, setRows] = useState(null);
  const [ctx, setCtx] = useState(null);
  const [cat, setCat] = useState('draft');
  const [extra, setExtra] = useState(null); // a report opened by a link that is not in the lists (for example an approved one)

  const load = useCallback(async () => {
    const list = await fetchWorkReports(projectId);
    setRows(list);
    onCount?.(list.length);
  }, [projectId, onCount]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    let off = false;
    Promise.all([loadReportContext(projectId), fetchCampaignGroups(projectId)]).then(([c, groups]) => { if (!off) setCtx({ ...c, groups }); }).catch(() => { if (!off) setCtx({ project: null, accounts: [], custom: [], columns: {}, groups: [], approvers: [] }); });
    return () => { off = true; };
  }, [projectId]);

  const openId = Number(params.get('report')) || null;
  const drafts = useMemo(() => (rows || []).filter((r) => r.status !== 'rework'), [rows]);
  const rework = useMemo(() => (rows || []).filter((r) => r.status === 'rework'), [rows]);
  const opened = (rows || []).find((r) => r.id === openId) || (extra && extra.id === openId ? extra : null);

  useEffect(() => {
    if (!openId || rows == null || (rows || []).some((r) => r.id === openId) || (extra && extra.id === openId)) return;
    fetchProjectReport(openId).then((r) => setExtra(r || { id: openId, missing: true })).catch(() => setExtra({ id: openId, missing: true }));
  }, [openId, rows, extra]);
  // the list shows the category of the opened report, and the one that has reports when the chosen one is empty
  useEffect(() => { if (opened?.status === 'rework') setCat('rework'); else if (opened) setCat('draft'); }, [opened?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const open = (id, platform) => { const next = new URLSearchParams(params); next.set('report', id); if (platform) next.set('platform', platform); setParams(next, { replace: true }); };
  const close = () => { const next = new URLSearchParams(params); next.delete('report'); setParams(next, { replace: true }); setExtra(null); };

  if (rows == null || !ctx) return <div className="empty-hint">Завантаження...</div>;

  if (openId) {
    if (!opened) return <div className="empty-hint">Завантаження звіту...</div>;
    if (opened.missing) return <div><div className="pacc-err">Звіт не знайдено: можливо, його видалили.</div><button type="button" className="btn" onClick={close}>← До списку</button></div>;
    if (opened.status === 'final') {
      return (
        <div className="wb-final">
          <div className="pacc-hint">Цей звіт уже затверджено: він в «Історії проекту» і в клієнта. Щоб доопрацювати його, поверніть на доопрацювання з історії.</div>
          <div className="rte-row"><button type="button" className="btn" onClick={close}>← До списку</button><button type="button" className="btn btn-p" onClick={() => navigate(`/projects/${projectId}?tab=decks&platform=${opened.platform}`)}>Відкрити історію</button></div>
        </div>
      );
    }
    return <ReportEditor key={opened.id} row={opened} ctx={ctx} onBack={close} onChanged={load} />;
  }

  const list = cat === 'rework' ? rework : drafts;
  return (
    <section className="report-section wb">
      <div className="wb-head">
        <h3>Робота над звітами <DesignTodo note="Розділ «Робота над звітами»: категорії, список звітів" /></h3>
        <div className="pacc-hint">Звіти, що ще не готові. Відкрийте звіт, доопрацюйте тексти, креативи, метрики й кампанії та натисніть «Підтверджено»: він потрапить в історію проекту й до клієнта. Скачування й презентації в історії.</div>
      </div>
      <div className="prep-seg" role="tablist" aria-label="Категорії">
        <button type="button" role="tab" aria-selected={cat === 'draft'} className={'prep-seg-tab' + (cat === 'draft' ? ' on' : '')} onClick={() => setCat('draft')}>Чернетки · {drafts.length}</button>
        <button type="button" role="tab" aria-selected={cat === 'rework'} className={'prep-seg-tab' + (cat === 'rework' ? ' on' : '')} onClick={() => setCat('rework')}>Доробка · {rework.length}</button>
      </div>
      {list.length === 0 ? (
        <div className="empty-hint">{cat === 'rework' ? 'Немає звітів у доробці: сюди потрапляють звіти, повернені з історії.' : 'Чернеток немає. Їх створює агент або кнопка «Зберегти чернетку» у «Формуванні звіту».'}</div>
      ) : (
        <ul className="wb-list">
          {list.map((r) => (
            <li key={r.id}>
              <button type="button" className="wb-item" onClick={() => open(r.id, r.platform)}>
                <span className="wb-item-main"><b>{TYPE_LABEL[r.period_type] || r.period_type} звіт · {reportPeriodText(r)}</b><small>{reportPlatformLabel(r.platform)}</small></span>
                <span className="wb-item-meta">{r.source === 'agent' ? 'AI-агент' : 'вручну'} · оновлено {stamp(r.updated_at)}</span>
                <span className={'wb-chip wb-chip--' + r.status}>{REPORT_STATUS[r.status] || r.status}</span>
                {r.status === 'rework' && r.data?.review?.returnedNote && <span className="wb-note">Повернуто: {r.data.review.returnedNote}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
