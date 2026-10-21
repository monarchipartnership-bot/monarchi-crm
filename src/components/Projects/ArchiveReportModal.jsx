import { useRef, useState } from 'react';
import ResultView from './Reports/ResultView';
import useDialogA11y from '../../lib/useDialogA11y';
import { platformInfo } from '../../lib/adAccounts';
import { periodLabel } from '../../lib/presentation/deckModel';
import { REPORT_STATUS } from '../../lib/projectHistory';
import CreativeGrid from './CreativeGrid';
import { reportBlocks } from '../../lib/reportTemplate';
import CreativePickerDialog from './CreativePickerDialog';
import { saveReportCreatives, suggestCreatives } from '../../lib/api/reportCreatives';
import '../../styles/projectReports.css';
import '../../styles/reportWinHub.css';

const TYPE_LABEL = { weekly: 'Тижневий', monthly: 'Місячний', custom: 'Довільний' };
const STATUS = REPORT_STATUS;
// the text blocks of a report: its own snapshot of the project's template (an old report has the three standard ones)
const sectionsOf = (data) => reportBlocks(data).map((b) => [b.key, b.title]).filter(([k]) => (data.sections?.[k] || '').trim());
const fmt = (s) => s.split('-').reverse().join('.');

export const reportPlatformLabel = (p) => (p === 'all' ? 'Разом' : platformInfo(p).label);
export const reportPeriodText = (r) => (r.period_type === 'monthly' ? periodLabel('monthly', r.period_start, r.period_end, 'uk') : `${fmt(r.period_start)} – ${fmt(r.period_end)}`);

// A report of the archive opened over the whole screen as tables. Top right: make a presentation, download (Excel / CSV / PDF), delete, close.
export default function ArchiveReportModal({ row, projectName, custom, extraKeys, onClose, onDelete, onPresentation, actions = [], onAction, onChanged }) {
  const box = useRef(null);
  useDialogA11y(box, onClose);
  const [slot, setSlot] = useState(null); // where the download menu is drawn: the header
  const [menu, setMenu] = useState(false);
  const [picking, setPicking] = useState(null); // the position of the creative being replaced
  const [cbusy, setCbusy] = useState(false);
  const [cerr, setCerr] = useState('');
  // the creatives (Meta) can be changed until the report is approved
  const items = row.data?.creatives?.items || [];
  const count = row.data?.creatives?.count || (row.period_type === 'monthly' ? 4 : 3);
  const canEdit = Boolean(onChanged) && row.status !== 'final' && (row.platform === 'meta' || row.platform === 'all');
  async function saveItems(next) {
    setCbusy(true);
    setCerr('');
    try { await saveReportCreatives(row.id, next, count); await onChanged(); } catch (e) { setCerr(e.message || 'Не вдалося зберегти креативи.'); } finally { setCbusy(false); }
  }
  async function suggest() {
    setCbusy(true);
    setCerr('');
    try {
      const found = await suggestCreatives({ projectId: row.project_id, start: row.period_start, end: row.period_end, count });
      if (!found.length) setCerr('За цей період у кабінеті Meta не знайдено оголошень.'); else { await saveReportCreatives(row.id, found, count); await onChanged(); }
    } catch (e) { setCerr(e.message || 'Не вдалося підібрати креативи.'); } finally { setCbusy(false); }
  }
  const edit = canEdit ? { onSuggest: suggest, onReplace: (i) => setPicking(i), onRemove: (i) => saveItems(items.filter((_, j) => j !== i)), busy: cbusy, error: cerr } : null;
  const data = row.data || {};
  const platforms = Object.keys(data.platforms || {});
  const isCombined = row.platform === 'all';
  const label = data.label ? ` · ${data.label}` : '';
  const sections = sectionsOf(data);

  return (
    <div className="arc-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={box} tabIndex={-1} className="arc-win" role="dialog" aria-modal="true" aria-labelledby="arc-title">
        <div className="arc-head">
          <span className="arc-md"><span className="arc-mi"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3h8l4 4v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" /><path d="M14 3v5h5M9 13h6M9 17h4" /></svg></span></span>
          <div className="arc-title">
            <h3 id="arc-title">{TYPE_LABEL[row.period_type] || row.period_type} звіт · {reportPeriodText(row)}{label}</h3>
            <div className="arc-sub">
              <span className="arc-pc">{projectName}</span>
              <span className={'arc-plt arc-plt--' + row.platform}>{reportPlatformLabel(row.platform)}</span>
              <span className={'arc-chip arc-chip--' + row.status}>{STATUS[row.status] || row.status}</span>
              <span className="arc-upd">оновлено {new Date(row.updated_at).toLocaleString('uk-UA')}</span>
            </div>
          </div>
          <div className="arc-actions">
            {actions.map((a) => <button key={a.action} type="button" className={'btn' + (a.primary ? ' arc-ok' : '')} onClick={() => onAction && onAction(row, a.action)}>{a.label}</button>)}
            {onPresentation && (<>
            {row.period_type === 'custom' ? (
              <button type="button" className="btn" disabled title="Презентацію можна зробити зі збереженого тижневого або місячного звіту">Зробити презентацію</button>
            ) : platforms.length > 1 ? (
              <div className="prep-export">
                <button type="button" className="btn" onClick={() => setMenu((m) => !m)}>Зробити презентацію ▾</button>
                {menu && (
                  <div className="prep-export-menu">
                    {platforms.map((p) => <button key={p} type="button" onClick={() => onPresentation(row, p)}>{platformInfo(p).label}</button>)}
                  </div>
                )}
              </div>
            ) : (
              <button type="button" className="btn" disabled={!platforms.length} onClick={() => onPresentation(row, platforms[0])}>Зробити презентацію</button>
            )}
            </>)}
            <span ref={setSlot} className="arc-slot" />
            {onDelete && <button type="button" className="btn arc-del" onClick={() => onDelete(row)}>Видалити</button>}
            <button type="button" className="arc-x" onClick={onClose} aria-label="Закрити"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg></button>
          </div>
        </div>
        <div className="arc-body">
          <ReportBody row={row} projectName={projectName} custom={custom} extraKeys={extraKeys} slot={slot} edit={edit} />
        </div>
      </div>
      {picking != null && <CreativePickerDialog row={row} taken={items.map((c) => c.adId)} onClose={() => setPicking(null)} onPicked={(item) => { const at = picking; setPicking(null); saveItems(at >= items.length ? [...items, item] : items.map((c, j) => (j === at ? item : c))); }} />}
    </div>
  );
}

// The numbers and the texts of one saved report. Used by the window above and by the combined month document.
export function ReportBody({ row, projectName, custom, extraKeys, slot = null, edit = null }) {
  const data = row.data || {};
  const platforms = Object.keys(data.platforms || {});
  const isCombined = row.platform === 'all';
  const label = data.label ? ` · ${data.label}` : '';
  const sections = sectionsOf(data);
  return (
    <>
      {platforms.length === 0 ? <div className="empty-hint">У цьому звіті немає цифр.</div> : (
        <ResultView
          data={{ platforms: data.platforms, previous: data.previous || null }} kind={data.kind || 'ecom'} custom={custom} templateMetrics={data.template?.metrics || null}
          lockTotal={isCombined} extraKeys={isCombined ? [] : extraKeys}
          title={projectName + label} subtitle={TYPE_LABEL[row.period_type] + ' · ' + reportPeriodText(row)}
          fileBase={`${projectName}_${row.period_type}_${row.period_start}_${row.platform}`}
          campaignMode="selected" selection={data.selection || []} options={{ groups: true, ...(data.options || {}) }}
          curLabel={reportPeriodText(row)}
          prevLabel={data.previous?.period ? `${fmt(data.previous.period.start)} – ${fmt(data.previous.period.end)}` : 'Попередній'}
          exportPortal={slot} exportFormats={['xlsx', 'csv', 'pdf']}
        />
      )}
      {(data.creatives?.items?.length > 0 || edit) && (
        <div className="arc-creatives">
          <div className="arc-block-title"><span className="arc-bi"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2.5" /><circle cx="9" cy="10" r="2" /><path d="M21 16l-5-5-8 8" /></svg></span>Most effective creatives</div>
          {data.creatives?.items?.length > 0 ? (
            <CreativeGrid items={data.creatives.items} onReplace={edit ? edit.onReplace : undefined} onRemove={edit ? edit.onRemove : undefined} />
          ) : (
            <div className="pacc-hint">Креативів у звіті ще немає.</div>
          )}
          {edit && (
            <div className="crx-tools">
              <button type="button" className="btn" disabled={edit.busy} onClick={edit.onSuggest}>{edit.busy ? 'Працюємо…' : data.creatives?.items?.length ? 'Підібрати знову' : 'Підібрати креативи автоматично'}</button>
              {edit.error && <span className="form-err">{edit.error}</span>}
            </div>
          )}
        </div>
      )}
      {sections.length > 0 && (
        <div className="arc-texts">
          {sections.map(([k, title]) => (
            <div className="arc-text" key={k}>
              <div className="arc-text-title">{title}</div>
              <div className="arc-text-body">{data.sections[k]}</div>
            </div>
          ))}
        </div>
      )}
    
    </>
  );
}
