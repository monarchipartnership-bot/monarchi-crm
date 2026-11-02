import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../../contexts/AuthContext';
import { useConfirm } from '../../common/ConfirmDialog';
import AutoResizeTextarea from '../../Reports/AutoResizeTextarea';
import ResultView from '../Reports/ResultView';
import CreativeGrid from '../CreativeGrid';
import CreativePickerDialog from '../CreativePickerDialog';
import { Panel, PanelContext, SelectionPanel } from '../Builder/BuilderSettings';
import { reportPeriodText, reportPlatformLabel } from '../ArchiveReportModal';
import { deleteProjectReport, fetchReportLayout, refreshMonthTotal, saveReportData } from '../../../lib/api/projectReportStore';
import { suggestCreatives } from '../../../lib/api/reportCreatives';
import { extraKeysOf } from '../../../lib/projectReportContext';
import { groupsForPlatform, selectionFromColumns } from '../../../lib/campaignGroups';
import { regroupData } from '../../../lib/periodReport';
import { metricKeys } from '../../../lib/clientReport';
import { metricKeysOf, reportBlocks, snapshotOf, withFunnel } from '../../../lib/reportTemplate';
import { metricOptions } from '../../../lib/reportMetrics';
import { REPORT_STATUS, canApprove, isRunning, monthKey, reviewPatch } from '../../../lib/projectHistory';
import '../../../styles/projectReports.css';
import '../../../styles/workbench.css';
import '../../../styles/builderHub.css';
import '../../../styles/workbenchHub.css';

const TYPE_LABEL = { weekly: 'Тижневий', monthly: 'Місячний', custom: 'Довільний' };
const stamp = (iso) => (iso ? new Date(iso).toLocaleString('uk-UA', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '');
const fmt = (s) => String(s).split('-').reverse().join('.');
const ICON = {
  work: <path d="M5 4h14v16H5zM9 9h6M9 13h6M9 17h3" />,
  back: <path d="M15 6l-6 6 6 6" />,
  metrics: <path d="M5 20V10M12 20V4M19 20v-7" />,
  texts: <path d="M5 6h14M5 11h14M5 16h9" />,
  images: <><rect x="3" y="4" width="18" height="16" rx="2.5" /><circle cx="9" cy="10" r="2" /><path d="M21 16l-5-5-8 8" /></>,
  eye: <><path d="M2.5 12S6 6 12 6s9.5 6 9.5 6-3.5 6-9.5 6S2.5 12 2.5 12z" /><circle cx="12" cy="12" r="2.8" /></>,
  eyeOff: <><path d="M3 3l18 18M10.6 6.2A9.8 9.8 0 0 1 12 6c5 0 8.5 4.2 9.5 6-.4.8-1.3 2.1-2.7 3.3M6.7 7.7C4.5 9.1 3.1 11 2.5 12c1 1.8 4.5 6 9.5 6 1.4 0 2.7-.3 3.8-.8" /><path d="M9.9 10a3 3 0 0 0 4.1 4.1" /></>,
  ret: <path d="M9 14L4 9l5-5M4 9h11a5 5 0 0 1 0 10h-3" />,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></>,
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
};
const Ic = ({ n }) => <svg viewBox="0 0 24 24" aria-hidden="true">{ICON[n]}</svg>;
const Medal = ({ n, cls = '' }) => <span className={'bld-md ' + cls}><span className="bld-mi"><Ic n={n} /></span></span>;
const Eye = ({ on, onToggle, label }) => (
  <button type="button" className={'wbe-eye' + (on ? ' on' : '')} aria-pressed={on} aria-label={`${label}: ${on ? 'бачить клієнт' : 'приховано від клієнта'}`} title={on ? 'Клієнт бачить. Натисніть, щоб приховати' : 'Клієнт не бачить. Натисніть, щоб показати'} onClick={onToggle}><Ic n={on ? 'eye' : 'eyeOff'} /></button>
);

// One report of «Робота над звітами» opened in the workspace: the numbers as they will look, what is in the report (metrics, groups and campaigns), the texts, the
// creatives. «Зберегти» keeps the status, «Підтверджено» sends the report to the history and to the client's page.
// A custom report («Показники за період» → «Зберегти», opened from «Історія проекту» → «Кастомні звіти») has no status and never goes to the client; it has the table,
// what is in it, the texts and the creatives of its dates, saving, downloading and deleting.
export default function ReportEditor({ row, ctx, onBack, onChanged }) {
  const { email } = useAuth();
  const navigate = useNavigate();
  const [confirm, confirmDialog] = useConfirm();
  const [data, setData] = useState(row.data || {});
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [picking, setPicking] = useState(null);
  const [cbusy, setCbusy] = useState(false);
  const [cerr, setCerr] = useState('');
  const [slot, setSlot] = useState(null); // where the download menu of a custom report is drawn: the bar
  const [openPanel, setOpenPanel] = useState('metrics'); // the panels of the side column are an accordion, one open at a time

  const isCustom = row.period_type === 'custom';
  const platform = row.platform;
  const isAll = platform === 'all';
  const kind = data.kind || 'ecom';
  const approver = canApprove(email, ctx.approvers);
  // the funnel: the report's own snapshot; a report made before the funnel existed takes the layout's setting of its platform
  const [layout, setLayout] = useState(null);
  useEffect(() => {
    if (isAll || isCustom) return undefined;
    let off = false;
    fetchReportLayout(row.project_id, platform).then((r) => { if (!off && r.exists) setLayout(r.layout); });
    return () => { off = true; };
  }, [row.project_id, platform, isAll, isCustom]);
  const funnel = isCustom ? null : (withFunnel(data.template || {}, layout).funnel ?? null);
  const withFunnelData = () => (!isCustom && data.template && data.template.funnel === undefined && layout ? { ...data, template: withFunnel(data.template, layout) } : data);
  const groupsHere = useMemo(() => groupsForPlatform(ctx.groups || [], platform), [ctx.groups, platform]);
  const extraKeys = extraKeysOf(ctx.columns, { ...row, data });
  const defaults = metricKeys(kind, extraKeys, ctx.custom);
  const shownKeys = metricKeysOf({ metrics: data.template?.metrics }, defaults, [...extraKeys, ...ctx.custom.map((c) => c.key)]);
  const hidden = data.template?.hiddenMetrics || [];
  const blocks = reportBlocks(data);
  const sel = useMemo(() => data.campaignSel || selectionFromColumns({ platform, columns: data.platforms?.[platform]?.groups, groups: groupsHere }), [data.campaignSel, data.platforms, platform, groupsHere]);
  const campaigns = useMemo(() => (data.platforms?.[platform]?.campaigns || []).map((c) => ({ name: c.name, spend: c.spend || 0 })), [data.platforms, platform]);

  // the month-to-date report of the agent renews itself: nothing can be changed, saved, confirmed or deleted until the month is over
  const running = isRunning(row, new Date().toISOString().slice(0, 10));
  const edit = (fn) => { if (running) return; setData((d) => fn(d)); setDirty(true); setMessage(''); };
  const withTemplate = (d) => d.template || snapshotOf(null, row.period_type === 'monthly' ? 'monthly' : 'weekly');
  const setTemplate = (patch) => edit((d) => ({ ...d, template: { ...withTemplate(d), ...patch } }));

  // ---- what is in the report
  const toggleShown = (key) => {
    const next = shownKeys.includes(key) ? shownKeys.filter((k) => k !== key) : [...shownKeys, key];
    if (next.length) setTemplate({ metrics: next });
  };
  const toggleHidden = (key) => setTemplate({ hiddenMetrics: hidden.includes(key) ? hidden.filter((k) => k !== key) : [...hidden, key] });
  const setSelection = (patch) => {
    const next = patch.campaignSel;
    edit((d) => {
      const re = regroupData({ platforms: d.platforms, previous: d.previous }, ctx.groups || [], { [platform]: next });
      return { ...d, platforms: re.platforms, previous: re.previous, campaignSel: next };
    });
  };

  // ---- texts
  const setText = (key, v) => edit((d) => ({ ...d, sections: { ...(d.sections || {}), [key]: v } }));
  const setBlockClient = (key, on) => setTemplate({ blocks: blocks.map((b) => ({ key: b.key, title: b.title, client: b.key === key ? on : b.client })) });

  // ---- creatives (Meta)
  const items = data.creatives?.items || [];
  const count = data.creatives?.count || (row.period_type === 'monthly' ? 4 : 3);
  const canCreatives = platform === 'meta' || isAll;
  const setItems = (next) => edit((d) => ({ ...d, creatives: { count, items: next, source: 'manual', at: new Date().toISOString() } }));
  async function suggest() {
    setCbusy(true);
    setCerr('');
    try {
      const found = await suggestCreatives({ projectId: row.project_id, start: row.period_start, end: row.period_end, count });
      if (!found.length) setCerr('За цей період у кабінеті Meta не знайдено оголошень.'); else setItems(found);
    } catch (e) { setCerr(e.message || 'Не вдалося підібрати креативи.'); } finally { setCbusy(false); }
  }

  // ---- saving
  async function save() {
    setBusy('save');
    setError('');
    try { await saveReportData(row.id, { data: withFunnelData() }); setDirty(false); setMessage('Збережено.'); await onChanged(); } catch (e) { setError(e.message || 'Не вдалося зберегти.'); } finally { setBusy(''); }
  }
  async function approve() {
    if (!(await confirm({ title: 'Підтвердити звіт?', body: 'Звіт потрапить в «Історію проекту» і на сторінку клієнта. Його можна буде повернути на доопрацювання з історії.', confirmLabel: 'Підтверджено' }))) return;
    setBusy('approve');
    setError('');
    try {
      const patch = reviewPatch({ status: row.status, data }, 'approve', email);
      await saveReportData(row.id, { data: { ...withFunnelData(), review: patch.review }, status: patch.status });
      if (row.period_type === 'weekly') {
        const r = await refreshMonthTotal(row.project_id, monthKey(row.period_start));
        if (r.error) setError('Звіт підтверджено, але підсумок місяця не вдалося перерахувати: ' + r.error);
      }
      await onChanged();
      onBack();
    } catch (e) { setError(e.message || 'Не вдалося підтвердити звіт.'); setBusy(''); }
  }
  async function remove() {
    if (!(await confirm({ title: 'Видалити звіт?', body: 'Видалити цей звіт? Дію не можна скасувати.', confirmLabel: 'Видалити звіт', danger: true }))) return;
    setBusy('delete');
    try { await deleteProjectReport(row.id); await onChanged(); onBack(); } catch (e) { setError(e.message || 'Не вдалося видалити.'); setBusy(''); }
  }
  async function back() {
    if (dirty && !(await confirm({ title: 'Незбережені зміни', body: 'У звіті є незбережені зміни. Вийти без збереження?', confirmLabel: 'Вийти без збереження', cancelLabel: 'Залишитись' }))) return;
    onBack();
  }

  const options = metricOptions(ctx.custom, extraKeys);
  const review = data.review || {};
  const prevLabel = data.previous?.period ? `${fmt(data.previous.period.start)} – ${fmt(data.previous.period.end)}` : 'Попередній';

  const filled = blocks.filter((b) => (data.sections?.[b.key] || '').trim()).length;
  const metricsInTable = options.filter((o) => shownKeys.includes(o.key)).length;
  const statusLabel = REPORT_STATUS[row.status] || row.status;

  return (
    <div className="wb-editor bld wbe">
      <div className="wbe-bar">
        <button type="button" className="wbe-back" onClick={back} aria-label="До списку" title="До списку"><Ic n="back" /></button>
        <Medal n="work" />
        <div className="wbe-title">
          <b>{isCustom ? 'Кастомний звіт' : (TYPE_LABEL[row.period_type] || row.period_type) + ' звіт'} · {reportPeriodText(row)}</b>
          <div className="wbe-sub">
            <i className={'wbh-plt wbh-plt--' + platform}>{reportPlatformLabel(platform)}</i>
            {isCustom ? <i className="wbh-chip wbh-chip--custom">Кастомний · клієнту не йде</i> : <i className={'wbh-chip wbh-chip--' + row.status}>{statusLabel}</i>}
            <span className="wbe-upd">оновлено {stamp(row.updated_at)}</span>
            {dirty && <span className="bld-state dirty"><i />Є незбережені зміни</span>}
          </div>
        </div>
        <div className="wbe-actions">
          {isCustom && <span ref={setSlot} className="wbe-slot" />}
          {isCustom && <button type="button" className="btn" disabled={dirty || !!busy || !Object.keys(data.platforms || {}).length} title={dirty ? 'Спершу збережіть зміни' : 'Створити презентацію з цього звіту'} onClick={() => navigate(`/clients?project=${row.project_id}&type=custom&start=${row.period_start}&end=${row.period_end}&platform=${isAll ? Object.keys(data.platforms)[0] : platform}`)}>Зробити презентацію</button>}
          <button type="button" className="btn wbe-del" disabled={!!busy || running} onClick={remove}>Видалити</button>
          <button type="button" className="btn" disabled={!dirty || !!busy || running} onClick={save}>{busy === 'save' ? 'Зберігаємо…' : 'Зберегти'}</button>
          {!isCustom && <button type="button" className="btn wbe-ok" disabled={!approver || !!busy || running} title={running ? 'Звіт оновлюється автоматично до кінця місяця' : approver ? 'Відправити звіт в історію й до клієнта' : 'Підтверджують лише відповідальні, обрані в налаштуваннях агента'} onClick={approve}><Ic n="check" />{busy === 'approve' ? 'Підтверджуємо…' : 'Підтверджено'}</button>}
        </div>
      </div>
      {running && <div className="wbe-note wbe-note--info" role="note"><Ic n="info" /><span><b>Цей звіт оновлюється автоматично до кінця місяця.</b> Поки місяць не завершився, його не можна змінити, зберегти, підтвердити чи видалити: агент оновлює його сам. Після завершення місяця він стане звичайною чернеткою.</span></div>}
      {row.status === 'rework' && review.returnedNote && <div className="wbe-note wbe-note--warn" role="note"><Ic n="ret" /><span><b>Повернуто на доопрацювання{review.returnedBy ? ` (${review.returnedBy})` : ''}:</b> {review.returnedNote}</span></div>}
      {!isCustom && !approver && <div className="wbe-note wbe-note--info"><Ic n="info" /><span>Підтвердити звіт можуть лише відповідальні, обрані в налаштуваннях агента. Ви можете працювати над ним і зберігати.</span></div>}
      {message && <div className="wbe-note wbe-note--ok" role="status"><Ic n="check" /><span>{message}</span></div>}
      {error && <div className="pacc-err">{error}</div>}

      <div className="wbe-grid">
        <div className="wbe-main">
          <section className="wbe-block">
            <div className="wbe-bh"><Medal n="metrics" cls="wbe-md" /><b>Таблиця звіту</b><span className="wbe-sp" />{!isCustom && <span className="wbe-mut">Око: чи бачить клієнт показник</span>}</div>
            {Object.keys(data.platforms || {}).length === 0 ? <div className="empty-hint">У цьому звіті немає цифр.</div> : (
              <ResultView
                data={{ platforms: data.platforms, previous: data.previous || null }} kind={kind} custom={ctx.custom} templateMetrics={shownKeys} funnel={funnel} noExport={!isCustom} exportPortal={slot} exportFormats={['xlsx', 'csv', 'pdf']}
                lockTotal={isAll} extraKeys={isAll ? [] : extraKeys} title={ctx.project?.name || ''} subtitle={`${TYPE_LABEL[row.period_type]} · ${reportPeriodText(row)}`}
                fileBase={isCustom ? `${ctx.project?.name || 'report'}_custom_${row.period_start}_${row.period_end}_${platform}` : 'draft'} campaignMode="selected" selection={[]} options={{ groups: true }} curLabel={reportPeriodText(row)} prevLabel={prevLabel}
                clientEye={isCustom ? null : { hidden, onToggle: toggleHidden }}
              />
            )}
          </section>

          {(
            <section className="wbe-block">
              <div className="wbe-bh"><Medal n="texts" cls="wbe-md" /><b>Тексти</b><span className="wbe-sp" /><span className={'wbe-count' + (filled === blocks.length ? ' ok' : '')}>{filled} з {blocks.length} заповнено</span></div>
              <div className="wbe-texts">
                {blocks.map((b) => (
                  <div className={'wbe-text' + (b.client ? '' : ' off')} key={b.key}>
                    <div className="wbe-text-head">
                      <label htmlFor={'wb-t-' + b.key}>{b.title}</label>
                      {!isCustom && <Eye on={b.client} onToggle={() => setBlockClient(b.key, !b.client)} label={b.title} />}
                    </div>
                    <AutoResizeTextarea id={'wb-t-' + b.key} value={data.sections?.[b.key] || ''} onChange={(v) => setText(b.key, v)} placeholder={b.title + '…'} />
                  </div>
                ))}
              </div>
            </section>
          )}

          {canCreatives && (
            <section className="wbe-block">
              <div className="wbe-bh"><Medal n="images" cls="wbe-md" /><b>Most effective creatives</b><span className="wbe-sp" /><span className="wbe-count">{items.length}</span></div>
              {items.length > 0 ? <CreativeGrid items={items} onReplace={(i) => setPicking(i)} onRemove={(i) => setItems(items.filter((_, j) => j !== i))} /> : <div className="pacc-hint">Креативів у звіті ще немає.</div>}
              <div className="wbe-tools">
                <button type="button" className="btn" disabled={cbusy} onClick={suggest}>{cbusy ? 'Працюємо…' : items.length ? 'Підібрати знову' : 'Підібрати креативи автоматично'}</button>
                <button type="button" className="btn" onClick={() => setPicking(items.length)}>+ Додати креатив</button>
                {cerr && <span className="form-err">{cerr}</span>}
              </div>
            </section>
          )}
        </div>

        <aside className="wbe-side">
          <PanelContext.Provider value={{ open: openPanel, toggle: (id) => setOpenPanel((cur) => (cur === id ? '' : id)) }}>
            <Panel id="metrics" title="Метрики в таблиці" summary={`${metricsInTable} з ${options.length}`}>
              <div className="pacc-hint">Тільки для цього звіту: макет платформи не змінюється. Рахується за збереженими цифрами, нового запиту в кабінет немає. Метрика, якої немає в збережених цифрах, зʼявиться після оновлення звіту з кабінетів.</div>
              <div className="bld-chips">
                {options.map((o) => {
                  const on = shownKeys.includes(o.key);
                  return <button key={o.key} type="button" className={'bld-toggle' + (on ? ' on' : '')} aria-pressed={on} onClick={() => toggleShown(o.key)}>{o.label}</button>;
                })}
              </div>
            </Panel>
            {!isAll && <SelectionPanel platform={platform} groups={groupsHere} campaigns={campaigns} problem="" draft={{ campaignSel: sel }} set={setSelection} />}
          </PanelContext.Provider>
        </aside>
      </div>

      {picking != null && (
        <CreativePickerDialog
          row={row} taken={items.map((c) => c.adId)} onClose={() => setPicking(null)}
          onPicked={(item) => { const at = picking; setPicking(null); setItems(at >= items.length ? [...items, item] : items.map((c, j) => (j === at ? item : c))); }}
        />
      )}
      {confirmDialog}
    </div>
  );
}
