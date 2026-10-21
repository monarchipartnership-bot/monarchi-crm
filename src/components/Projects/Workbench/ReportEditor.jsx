import { useMemo, useState } from 'react';
import { useAuth } from '../../../contexts/AuthContext';
import { useConfirm } from '../../common/ConfirmDialog';
import DesignTodo from '../../common/DesignTodo';
import AutoResizeTextarea from '../../Reports/AutoResizeTextarea';
import ResultView from '../Reports/ResultView';
import CreativeGrid from '../CreativeGrid';
import CreativePickerDialog from '../CreativePickerDialog';
import { PanelContext, SelectionPanel } from '../Builder/BuilderSettings';
import { reportPeriodText, reportPlatformLabel } from '../ArchiveReportModal';
import { deleteProjectReport, refreshMonthTotal, saveReportData } from '../../../lib/api/projectReportStore';
import { suggestCreatives } from '../../../lib/api/reportCreatives';
import { extraKeysOf } from '../../../lib/projectReportContext';
import { groupsForPlatform, selectionFromColumns } from '../../../lib/campaignGroups';
import { regroupData } from '../../../lib/periodReport';
import { metricKeys } from '../../../lib/clientReport';
import { metricKeysOf, reportBlocks, snapshotOf } from '../../../lib/reportTemplate';
import { metricOptions } from '../../../lib/reportMetrics';
import { REPORT_STATUS, canApprove, monthKey, reviewPatch } from '../../../lib/projectHistory';
import '../../../styles/projectReports.css';
import '../../../styles/workbench.css';

const TYPE_LABEL = { weekly: 'Тижневий', monthly: 'Місячний', custom: 'Довільний' };
const stamp = (iso) => (iso ? new Date(iso).toLocaleString('uk-UA', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '');
const fmt = (s) => String(s).split('-').reverse().join('.');
const OPEN_SELECTION = { open: 'selection', toggle: () => {} };

// One report of «Робота над звітами» opened in the workspace: the numbers as they will look, what is in the report (metrics, groups and campaigns), the texts, the
// creatives. «Зберегти» keeps the status, «Підтверджено» sends the report to the history and to the client's page.
export default function ReportEditor({ row, ctx, onBack, onChanged }) {
  const { email } = useAuth();
  const [confirm, confirmDialog] = useConfirm();
  const [data, setData] = useState(row.data || {});
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [picking, setPicking] = useState(null);
  const [cbusy, setCbusy] = useState(false);
  const [cerr, setCerr] = useState('');

  const platform = row.platform;
  const isAll = platform === 'all';
  const kind = data.kind || 'ecom';
  const approver = canApprove(email, ctx.approvers);
  const groupsHere = useMemo(() => groupsForPlatform(ctx.groups || [], platform), [ctx.groups, platform]);
  const extraKeys = extraKeysOf(ctx.columns, { ...row, data });
  const defaults = metricKeys(kind, extraKeys, ctx.custom);
  const shownKeys = metricKeysOf({ metrics: data.template?.metrics }, defaults, [...extraKeys, ...ctx.custom.map((c) => c.key)]);
  const hidden = data.template?.hiddenMetrics || [];
  const blocks = reportBlocks(data);
  const sel = useMemo(() => data.campaignSel || selectionFromColumns({ platform, columns: data.platforms?.[platform]?.groups, groups: groupsHere }), [data.campaignSel, data.platforms, platform, groupsHere]);
  const campaigns = useMemo(() => (data.platforms?.[platform]?.campaigns || []).map((c) => ({ name: c.name, spend: c.spend || 0 })), [data.platforms, platform]);

  const edit = (fn) => { setData((d) => fn(d)); setDirty(true); setMessage(''); };
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
    try { await saveReportData(row.id, { data }); setDirty(false); setMessage('Збережено.'); await onChanged(); } catch (e) { setError(e.message || 'Не вдалося зберегти.'); } finally { setBusy(''); }
  }
  async function approve() {
    if (!(await confirm({ title: 'Підтвердити звіт?', body: 'Звіт потрапить в «Історію проекту» і на сторінку клієнта. Його можна буде повернути на доопрацювання з історії.', confirmLabel: 'Підтверджено' }))) return;
    setBusy('approve');
    setError('');
    try {
      const patch = reviewPatch({ status: row.status, data }, 'approve', email);
      await saveReportData(row.id, { data: { ...data, review: patch.review }, status: patch.status });
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

  return (
    <div className="wb-editor">
      <div className="wb-bar">
        <button type="button" className="btn" onClick={back}>← До списку</button>
        <div className="wb-bar-title">
          <b>{TYPE_LABEL[row.period_type] || row.period_type} звіт · {reportPeriodText(row)}</b>
          <small>{reportPlatformLabel(platform)} · <span className={'wb-chip wb-chip--' + row.status}>{REPORT_STATUS[row.status] || row.status}</span> · оновлено {stamp(row.updated_at)}</small>
        </div>
        <div className="wb-actions">
          {dirty && <span className="pacc-hint">Є незбережені зміни</span>}
          <button type="button" className="btn" disabled={busy === 'delete' || !!busy} onClick={remove}>Видалити</button>
          <button type="button" className="btn" disabled={!dirty || !!busy} onClick={save}>{busy === 'save' ? 'Зберігаємо…' : 'Зберегти'}</button>
          <button type="button" className="btn btn-p" disabled={!approver || !!busy} title={approver ? 'Відправити звіт в історію й до клієнта' : 'Підтверджують лише відповідальні, обрані в налаштуваннях агента'} onClick={approve}>{busy === 'approve' ? 'Підтверджуємо…' : 'Підтверджено'}</button>
        </div>
      </div>
      <DesignTodo note="Робоча область звіту: таблиця, склад звіту, тексти, креативи, кнопки" />
      {row.status === 'rework' && review.returnedNote && <div className="prep-internal-note" role="note"><b>Повернуто на доопрацювання{review.returnedBy ? ` (${review.returnedBy})` : ''}:</b> {review.returnedNote}</div>}
      {!approver && <div className="pacc-hint">Підтвердити звіт можуть лише відповідальні, обрані в налаштуваннях агента. Ви можете працювати над ним і зберігати.</div>}
      {message && <div className="pacc-hint" role="status">{message}</div>}
      {error && <div className="pacc-err">{error}</div>}

      <section className="wb-block">
        <h4>Таблиця звіту</h4>
        {Object.keys(data.platforms || {}).length === 0 ? <div className="empty-hint">У цьому звіті немає цифр.</div> : (
          <ResultView
            data={{ platforms: data.platforms, previous: data.previous || null }} kind={kind} custom={ctx.custom} templateMetrics={shownKeys} noExport
            lockTotal={isAll} extraKeys={isAll ? [] : extraKeys} title={ctx.project?.name || ''} subtitle={`${TYPE_LABEL[row.period_type]} · ${reportPeriodText(row)}`}
            fileBase="draft" campaignMode="selected" selection={[]} options={{ groups: true }} curLabel={reportPeriodText(row)} prevLabel={prevLabel}
          />
        )}
      </section>

      <section className="wb-block">
        <h4>Склад звіту</h4>
        <div className="pacc-hint">Тільки для цього звіту: макет платформи не змінюється. Працює за збереженими цифрами, нового запиту в кабінет немає. Кампанія, якої не було в періоді, або метрика, якої немає в збережених цифрах, зʼявляться після оновлення звіту з кабінетів.</div>
        <h5>Метрики</h5>
        <div className="wb-metrics">
          <div className="wb-mrow wb-mhead"><span>Метрика</span><span>У таблиці</span><span>Бачить клієнт</span></div>
          {options.map((o) => (
            <div className="wb-mrow" key={o.key}>
              <span>{o.label}</span>
              <input type="checkbox" checked={shownKeys.includes(o.key)} onChange={() => toggleShown(o.key)} aria-label={`${o.label}: у таблиці`} />
              <input type="checkbox" checked={!hidden.includes(o.key)} disabled={!shownKeys.includes(o.key)} onChange={() => toggleHidden(o.key)} aria-label={`${o.label}: бачить клієнт`} />
            </div>
          ))}
        </div>
        {!isAll && (
          <PanelContext.Provider value={OPEN_SELECTION}>
            <SelectionPanel platform={platform} groups={groupsHere} campaigns={campaigns} problem="" draft={{ campaignSel: sel }} set={setSelection} />
          </PanelContext.Provider>
        )}
      </section>

      <section className="wb-block">
        <h4>Тексти</h4>
        {blocks.map((b) => (
          <div className="wb-text" key={b.key}>
            <div className="wb-text-head">
              <label htmlFor={'wb-t-' + b.key}>{b.title}</label>
              <label className="wb-client"><input type="checkbox" checked={b.client} onChange={(e) => setBlockClient(b.key, e.target.checked)} /> Бачить клієнт</label>
            </div>
            <AutoResizeTextarea id={'wb-t-' + b.key} value={data.sections?.[b.key] || ''} onChange={(v) => setText(b.key, v)} placeholder={b.title + '…'} />
          </div>
        ))}
      </section>

      {canCreatives && (
        <section className="wb-block">
          <h4>Most effective creatives</h4>
          {items.length > 0 ? <CreativeGrid items={items} onReplace={(i) => setPicking(i)} onRemove={(i) => setItems(items.filter((_, j) => j !== i))} /> : <div className="pacc-hint">Креативів у звіті ще немає.</div>}
          <div className="rte-row">
            <button type="button" className="btn" disabled={cbusy} onClick={suggest}>{cbusy ? 'Працюємо…' : items.length ? 'Підібрати знову' : 'Підібрати креативи автоматично'}</button>
            <button type="button" className="btn" onClick={() => setPicking(items.length)}>+ Додати креатив</button>
            {cerr && <span className="form-err">{cerr}</span>}
          </div>
        </section>
      )}

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
