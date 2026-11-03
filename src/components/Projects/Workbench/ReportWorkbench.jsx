import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import ReportEditor from './ReportEditor';
import { reportPeriodText, reportPlatformLabel } from '../ArchiveReportModal';
import { fetchCampaignGroups, fetchProjectReport, fetchWorkReports } from '../../../lib/api/projectReportStore';
import { loadReportContext } from '../../../lib/projectReportContext';
import { REPORT_STATUS, isRunning } from '../../../lib/projectHistory';
import '../../../styles/projectReports.css';
import '../../../styles/workbench.css';
import '../../../styles/workbenchHub.css';

const TYPE_LABEL = { weekly: 'Тижневий', monthly: 'Місячний', custom: 'Довільний' };
const ICON = {
  work: <path d="M5 4h14v16H5zM9 9h6M9 13h6M9 17h3" />,
  ret: <path d="M9 14L4 9l5-5M4 9h11a5 5 0 0 1 0 10h-3" />,
  spark: <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" />,
  edit: <path d="M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4" />,
  clock: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></>,
};
const stamp = (iso) => (iso ? new Date(iso).toLocaleString('uk-UA', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '');

// «Робота над звітами»: the reports that are not ready yet. «Чернетки» are new ones (made by the agent or saved as a draft), «Доробка» are the ones returned from
// the history. A report opens in the workspace; when it is confirmed it goes to the history and to the client.
export default function ReportWorkbench({ projectId, onCount, version = 0 }) {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [rows, setRows] = useState(null);
  const [ctx, setCtx] = useState(null);
  const [cat, setCat] = useState('draft');
  const [loadError, setLoadError] = useState('');
  const [ctxError, setCtxError] = useState(false);
  const [extra, setExtra] = useState(null); // a report opened by a link that is not in the lists (for example an approved one)
  const todayIso = new Date().toISOString().slice(0, 10);

  const load = useCallback(async () => {
    try {
      const list = await fetchWorkReports(projectId);
      setRows(list);
      setLoadError('');
      onCount?.(list.length);
    } catch (e) {
      console.warn('fetchWorkReports failed', e);
      setLoadError(e.message || 'Не вдалося завантажити звіти.');
    }
  }, [projectId, onCount]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    let off = false;
    Promise.all([loadReportContext(projectId), fetchCampaignGroups(projectId)]).then(([c, groups]) => { if (!off) setCtx({ ...c, groups }); }).catch(() => { if (!off) { setCtxError(true); setCtx({ project: null, accounts: [], custom: [], columns: {}, groups: [], approvers: ['-'] }); } }); // fail closed: with no list of approvers nobody may confirm
    return () => { off = true; };
  }, [projectId, version]); // read again (in place) when a layout, a metric or a cabinet was changed elsewhere

  const openId = Number(params.get('report')) || null;
  // the month-to-date report that renews itself goes first
  const drafts = useMemo(() => (rows || []).filter((r) => r.status !== 'rework').sort((a, b) => Number(isRunning(b, todayIso)) - Number(isRunning(a, todayIso))), [rows]);
  const rework = useMemo(() => (rows || []).filter((r) => r.status === 'rework'), [rows]);
  const opened = (rows || []).find((r) => r.id === openId) || (extra && extra.id === openId ? extra : null);

  useEffect(() => {
    if (!openId || rows == null || (rows || []).some((r) => r.id === openId) || (extra && extra.id === openId)) return;
    // a report of another project is «not found» here: it must not open with this project's context
    fetchProjectReport(openId).then((r) => setExtra(r && Number(r.project_id) === Number(projectId) ? r : { id: openId, missing: true })).catch(() => setExtra({ id: openId, missing: true }));
  }, [openId, rows, extra, projectId]);
  // the list shows the category of the opened report, and the one that has reports when the chosen one is empty
  useEffect(() => { if (opened?.status === 'rework') setCat('rework'); else if (opened) setCat('draft'); }, [opened?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const open = (id, platform) => { const next = new URLSearchParams(params); next.set('report', id); if (platform) next.set('platform', platform); setParams(next, { replace: true }); };
  const [flash, setFlash] = useState(''); // what the closed editor wants the list to say (for example a failed recount of the month)
  const close = (msg) => { const next = new URLSearchParams(params); next.delete('report'); setParams(next, { replace: true }); setExtra(null); setFlash(typeof msg === 'string' ? msg : ''); };

  if (loadError && rows == null) return <div><div className="pacc-err" role="alert">Не вдалося завантажити звіти: {loadError}</div><button type="button" className="btn" onClick={load}>Повторити</button></div>;
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
    return (
      <>
        {ctxError && <div className="pacc-err" role="alert">Налаштування проєкту не завантажились: підтвердити звіт зараз не можна. Оновіть сторінку.</div>}
        <ReportEditor key={opened.id} row={opened} ctx={ctx} onBack={close} onChanged={load} />
      </>
    );
  }

  const list = cat === 'rework' ? rework : drafts;
  const CATS = [
    { key: 'draft', title: 'Чернетки', caption: 'Нові: створив агент або збережені вручну', n: drafts.length, icon: ICON.work },
    { key: 'rework', title: 'Доробка', caption: 'Повернуті з історії на доопрацювання', n: rework.length, icon: ICON.ret },
  ];
  return (
    <section className="report-section wb wbh">
      <div className="wbh-tiles" role="tablist" aria-label="Категорії">
        {CATS.map((c) => (
          <button key={c.key} type="button" role="tab" aria-selected={cat === c.key} className={'wbh-tile' + (cat === c.key ? ' on' : '') + (c.key === 'rework' && c.n ? ' warm' : '')} onClick={() => setCat(c.key)}>
            <span className={'hub-ring wbh-ring' + (c.key === 'rework' && c.n ? ' st-paused' : '')} aria-hidden="true"><span className="hub-tile hub-tile--ln"><svg viewBox="0 0 24 24">{c.icon}</svg></span></span>
            <span className="wbh-n">{c.n}</span>
            <span className="wbh-tt"><b>{c.title}</b><small>{c.caption}</small></span>
          </button>
        ))}
      </div>
      {flash && <div className="pacc-err" role="alert">{flash} <button type="button" className="pacc-link" onClick={() => setFlash('')}>Закрити</button></div>}
      {loadError && <div className="pacc-err" role="alert">Список не оновився: {loadError} <button type="button" className="pacc-link" onClick={load}>Повторити</button></div>}
      <p className="wbh-hint">Відкрийте звіт, доопрацюйте тексти, креативи, метрики й кампанії та натисніть «Підтверджено»: він потрапить в історію проекту й до клієнта. Скачування й презентації в історії.</p>
      {list.length === 0 ? (
        <div className="wbh-empty">
          <span className="hub-ring wbh-ring wbh-ring--xl st-mu" aria-hidden="true"><span className="hub-tile hub-tile--ln"><svg viewBox="0 0 24 24">{cat === 'rework' ? ICON.ret : ICON.work}</svg></span></span>
          <h3>{cat === 'rework' ? 'Немає звітів у доробці' : 'Чернеток немає'}</h3>
          <p>{cat === 'rework' ? 'Сюди потрапляють звіти, повернені з історії проекту на доопрацювання.' : 'Чернетки створює агент або кнопка «Зберегти чернетку» у «Формуванні звіту».'}</p>
        </div>
      ) : (
        <ul className="wbh-grid">
          {list.map((r) => {
            const note = r.status === 'rework' ? r.data?.review : null;
            const live = isRunning(r, todayIso);
            return (
              <li key={r.id}>
                <button type="button" className={'wbh-card' + (live ? ' wbh-card--live' : '')} onClick={() => open(r.id, r.platform)}>
                  <span className="wbh-ch">
                    <i className={'wbh-plt wbh-plt--' + r.platform}>{reportPlatformLabel(r.platform)}</i>
                    {live ? <i className="wbh-chip wbh-chip--live">Оновлюється</i> : <i className={'wbh-chip wbh-chip--' + r.status}>{REPORT_STATUS[r.status] || r.status}</i>}
                  </span>
                  <b className="wbh-type">{TYPE_LABEL[r.period_type] || r.period_type} звіт</b>
                  <span className="wbh-period">{reportPeriodText(r)}</span>
                  <span className="wbh-meta">
                    <span className={'wbh-src' + (r.source === 'agent' ? ' ag' : '')}><svg viewBox="0 0 24 24" aria-hidden="true">{r.source === 'agent' ? ICON.spark : ICON.edit}</svg>{r.source === 'agent' ? 'AI-агент' : 'вручну'}</span>
                    <span className="wbh-upd"><svg viewBox="0 0 24 24" aria-hidden="true">{ICON.clock}</svg>{stamp(r.updated_at)}</span>
                  </span>
                  {live && <span className="wbh-note wbh-note--live">Оновлюється автоматично до кінця місяця. Змінити, підтвердити чи видалити його можна, коли місяць завершиться.</span>}
                  {note?.returnedNote && <span className="wbh-note"><svg viewBox="0 0 24 24" aria-hidden="true">{ICON.ret}</svg><span><b>Повернуто{note.returnedBy ? ` (${note.returnedBy})` : ''}:</b> {note.returnedNote}</span></span>}
                  <span className="wbh-open"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>Відкрити</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
