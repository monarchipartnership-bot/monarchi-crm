import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import CompareModal from './CompareModal';
import ResultView from './ResultView';
import { useReportContext } from './useReportContext';
import { useConfirm } from '../../common/ConfirmDialog';
import AutoResizeTextarea from '../../Reports/AutoResizeTextarea';
import WeekPicker from '../../Reports/Weekly/WeekPicker';
import { daysInRange, fetchProjectRange, periodFromPicker } from '../../../lib/periodReport';
import { fetchProjectReports, saveProjectReport, deleteProjectReport, refreshMonthTotal, setReportStatus } from '../../../lib/api/projectReportStore';
import { suggestCreatives } from '../../../lib/api/reportCreatives';
import CreativeGrid from '../CreativeGrid';
import CreativePickerDialog from '../CreativePickerDialog';
import { REPORT_STATUS, canApprove, isRunning, monthKey } from '../../../lib/projectHistory';
import { fetchProjectDecks } from '../../../lib/api/projectDecks';
import { EMPTY_SECTIONS, buildWhatWasDone, comparisonPeriod, pullReportData, reportPayload } from '../../../lib/reportEngine';
import { reportBlocks, snapshotOf, withFunnel } from '../../../lib/reportTemplate';
import { metricKeys } from '../../../lib/clientReport';
import { platformInfo } from '../../../lib/adAccounts';
import { missingColumns } from '../../../lib/platformColumns';
import { metricMeta } from '../../../lib/reportMetrics';
import { MONTH_NAMES, computeWeeksForMonth, defaultWeekIndexFor, todayIso, yearOptions } from '../../../lib/dateHelpers';
import { useAuth } from '../../../contexts/AuthContext';
import '../../../styles/projectReports.css';
import Select from '../../common/Select';

import { HubTitle } from '../hubIcons';
import '../../../styles/composeHub.css';
const fmt = (s) => s.split('-').reverse().join('.');

const CH_ICONS = {
  cal: <><rect x="3.5" y="5" width="17" height="15" rx="2" /><path d="M3.5 10h17M8 3v4M16 3v4" /></>,
  pull: <path d="M12 4v11M7 11l5 5 5-5M5 20h14" />,
  cmp: <path d="M7 7h12l-3-3M17 17H5l3 3" />,
  save: <path d="M5 4h11l3 3v13H5zM8 4v5h7V4M8 20v-6h8v6" />,
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  pres: <><rect x="3" y="4" width="18" height="12" rx="2.5" /><path d="M8 20l4-4 4 4M12 16v4" /></>,
};
const ChIcon = ({ n }) => <svg className="ch-ic" viewBox="0 0 24 24" aria-hidden="true">{CH_ICONS[n]}</svg>;
const ChMedal = ({ n }) => <span className="hub-ring ch-md" aria-hidden="true"><span className="hub-tile hub-tile--ln"><svg viewBox="0 0 24 24">{CH_ICONS[n]}</svg></span></span>;

function initialPicker() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  return { year, month, weekIndex: defaultWeekIndexFor(computeWeeksForMonth(year, month)) };
}

// «Тижневий звіт» / «Місячний звіт»: pick the period, pull the numbers from the
// project's ad accounts together with the period before it for comparison, add
// the text, save. Reports made by hand and (later) by the AI agent sit in one list.
// `platform` is the tab of PlatformReports: that platform's own report (its accounts, its groups), or 'total' = «Разом», the report over every platform.
// `unsavedRef` lets the tab row ask before leaving a report with unsaved changes.
export default function PeriodReport({ projectId, periodType, platform = 'total', unsavedRef }) {
  const [confirm, confirmDialog] = useConfirm();
  const { email } = useAuth();
  const navigate = useNavigate();
  const ctx = useReportContext(projectId, platform);
  const isTotal = platform === 'total';
  const approver = canApprove(email, ctx.approvers); // who may save a report as final
  const [picker, setPicker] = useState(initialPicker);
  const [saved, setSaved] = useState([]);
  const [decks, setDecks] = useState([]);
  const [savedLoaded, setSavedLoaded] = useState(false);
  const applied = useRef('');
  const [data, setData] = useState(null);
  const [sections, setSections] = useState(EMPTY_SECTIONS);
  // the template snapshot of the opened saved report (it keeps its own blocks and metrics); null for a new one, which takes the project's current template
  const [snap, setSnap] = useState(null);
  const [creatives, setCreatives] = useState(null); // { count, items }: the «Most effective creatives» of this report (Meta)
  const [picking, setPicking] = useState(null);
  const [cbusy, setCbusy] = useState(false);
  const [cerr, setCerr] = useState('');
  const [savedId, setSavedId] = useState(null); // the report just saved as a draft: a link to it in «Робота над звітами»
  const [note, setNote] = useState('');
  const [selection, setSelection] = useState([]);
  const [options, setOptions] = useState({ groups: true });
  const [status, setStatus] = useState('draft');
  const [meta, setMeta] = useState({ source: 'manual', id: null });
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState('');
  // The "What was done" helper: what it was built from (shown to the person, never printed in the report).
  const [work, setWork] = useState(null);
  const [message, setMessage] = useState('');
  const [errors, setErrors] = useState({});
  const [modal, setModal] = useState(null);
  // What the numbers are compared with. Nothing until the person asks («Порівняти»):
  //   { mode: 'calendar' } the previous report period (previous week of the month / previous month)
  //   { mode: 'days' }     the same number of days right before this period
  //   { mode: 'custom', from, to } any dates; null = no comparison.
  const [cmp, setCmp] = useState(null);
  const [askOff, setAskOff] = useState(() => { try { return localStorage.getItem('prep-ask-compare') === 'off'; } catch { return false; } });

  const period = periodFromPicker(periodType, picker);
  const prevFor = (c) => comparisonPeriod(periodType, picker, period, c);
  const prev = prevFor(cmp);
  const daysCur = daysInRange(period.start, period.end);
  const daysPrev = prev ? daysInRange(prev.start, prev.end) : daysCur;
  const unequal = daysCur !== daysPrev;
  const comparePresets = [
    { key: 'calendar', title: periodType === 'weekly' ? 'Попередній тиждень місяця' : 'Попередній місяць', hint: 'за календарем звітів', range: (() => { const q = prevFor({ mode: 'calendar' }); return { from: q.start, to: q.end }; })() },
    { key: 'days', title: `Попередні ${daysCur} дн.`, hint: 'така ж тривалість, одразу перед періодом', range: (() => { const q = prevFor({ mode: 'days' }); return { from: q.start, to: q.end }; })() },
  ];
  const unfinished = period.end >= todayIso();

  const reloadSaved = useCallback(async () => {
    const [rows, deckRows] = await Promise.all([fetchProjectReports(projectId, periodType, ctx.scope), fetchProjectDecks(projectId)]);
    setSaved(rows);
    setDecks(deckRows.filter((d) => d.period_type === periodType));
    setSavedLoaded(true);
  }, [projectId, periodType, ctx.scope]);
  // Reports are kept per tab (platform, or «Разом»): another tab starts from its own saved reports, never from the previous tab's numbers.
  useEffect(() => {
    if (!ctx.ready) return;
    setSavedLoaded(false); setSaved([]); setData(null); applied.current = ''; reloadSaved();
  }, [reloadSaved, ctx.ready]);
  useEffect(() => { if (unsavedRef) unsavedRef.current = dirty; }, [dirty, unsavedRef]);

  // Opening a period shows its saved report if there is one.
  useEffect(() => {
    if (!savedLoaded) return;
    const row = saved.find((r) => r.period_start === period.start);
    const key = `${projectId}|${periodType}|${period.start}`;
    const marker = `${key}|${row?.updated_at || ''}`;
    if (applied.current === marker) return;
    if (applied.current.startsWith(key + '|') && dirty) return; // keep what the person is typing
    applied.current = marker;
    if (row) {
      setData(row.data?.platforms ? { platforms: row.data.platforms, previous: row.data.previous || null } : null);
      setSections({ ...EMPTY_SECTIONS, ...(row.data?.sections || {}) });
      setCreatives(row.data?.creatives || null);
      setSnap(row.data?.template || snapshotOf(null, periodType)); // a report made before templates existed keeps the standard blocks, whatever the template is now
      setNote(row.data?.note || '');
      setSelection(row.data?.selection || []);
      setOptions({ groups: true, ...(row.data?.options || {}) });
      setStatus(row.status);
      setMeta({ source: row.source, id: row.id });
      setCmp(row.data?.previous?.period ? (row.data.compare?.mode === 'custom' ? { mode: 'custom', from: row.data.previous.period.start, to: row.data.previous.period.end } : { mode: row.data.compare?.mode || 'calendar' }) : null);
    } else {
      setData(null);
      setSections(EMPTY_SECTIONS);
      setSnap(null);
      setCreatives(null);
      setNote('');
      setSelection([]);
      setOptions({ groups: true });
      setCmp(null);
      setWork(null);
      setStatus('draft');
      setMeta({ source: 'manual', id: null });
    }
    setDirty(false);
    setMessage('');
    setErrors({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saved, savedLoaded, period.start, projectId, periodType, dirty]);

  async function changePicker(next) {
    if (dirty && !(await confirm({ title: 'Незбережені зміни', body: 'Є незбережені зміни в цьому звіті. Перейти до іншого періоду без збереження?', confirmLabel: 'Перейти без збереження', cancelLabel: 'Залишитись' }))) return;
    if (periodType === 'weekly') {
      const dim = computeWeeksForMonth(next.year, next.month).length;
      setPicker({ year: next.year, month: next.month, weekIndex: Math.min(next.weekIndex || 1, dim) });
    } else {
      setPicker({ year: next.year, month: next.month, weekIndex: 1 });
    }
  }

  async function pull(c = cmp, columns = ctx.fetchColumns, quiet = false) {
    const pv = prevFor(c);
    setBusy('pull');
    setMessage('');
    try {
      const pulled = await pullReportData({ accounts: ctx.accounts, kind: ctx.kind, groups: ctx.groups, period, prev: pv, columns, selections: ctx.selections });
      setErrors(pulled.errors);
      setData(pulled.data);
      setDirty(true);
      // The period is on screen: offer a comparison (unless it is set already or switched off).
      if (!quiet && !c && !askOff) setModal('ask');
    } catch (e) {
      setMessage(e.message || 'Не вдалося отримати дані.');
    } finally {
      setBusy('');
    }
  }

  // Adds / changes / removes the comparison of the numbers already pulled, without asking the accounts for the period again.
  async function applyCompare(c) {
    setCmp(c);
    setModal(null);
    if (!data) return;
    setDirty(true);
    if (!c) { setData((d) => ({ ...d, previous: null })); return; }
    const pv = prevFor(c);
    setBusy('pull');
    try {
      const before = await fetchProjectRange(ctx.accounts, pv.start, pv.end, ctx.kind, ctx.groups, undefined, ctx.fetchColumns, ctx.selections);
      setData((d) => ({ ...d, previous: { period: { start: pv.start, end: pv.end }, platforms: before.platforms } }));
    } catch (e) {
      setMessage(e.message || 'Не вдалося отримати дані для порівняння.');
    } finally {
      setBusy('');
    }
  }

  function neverAsk() {
    setAskOff(true);
    try { localStorage.setItem('prep-ask-compare', 'off'); } catch { /* optional */ }
  }

  // Saves the report with the given status and gives the saved row back. A report a person saves is theirs (source «manual»): the agent never overwrites it.
  async function persist(nextStatus) {
    const payload = reportPayload({ kind: ctx.kind, data, compare: cmp, period, prev, selection, options, sections, note, template: withFunnel(snap || newSnap(), ctx.layout), campaignSel: ctx.selections ? ctx.selections[platform] : null });
    if (creatives?.items?.length) payload.creatives = { count: creatives.count, items: creatives.items, source: 'manual', at: new Date().toISOString() };
    const row = await saveProjectReport({ projectId, periodType, periodStart: period.start, periodEnd: period.end, platform: ctx.scope, status: nextStatus, source: 'manual', createdBy: email, data: payload });
    setStatus(row.status);
    setMeta({ source: row.source, id: row.id });
    setDirty(false);
    return row;
  }
  // «Зберегти чернетку»: the report waits in «Робота над звітами» (a report returned for rework stays in rework).
  async function saveDraft() {
    setBusy('save');
    setMessage('');
    setSavedId(null);
    try {
      const row = await persist(status === 'rework' ? 'rework' : 'draft');
      await reloadSaved();
      setSavedId(row.id);
      setMessage('Збережено в «Робота над звітами».');
    } catch (e) {
      setMessage((e.message || 'Не вдалося зберегти.') + ' Якщо це перше збереження, перевірте, що застосовано міграцію 20261008000000.');
    } finally { setBusy(''); }
  }
  // «Зберегти як фінал»: the report goes to the history of the project and to the client's page at once.
  async function saveFinal() {
    if (status !== 'final' && !(await confirm({ title: 'Зберегти як фінал?', body: 'Звіт потрапить в «Історію проекту» і на сторінку клієнта.', confirmLabel: 'Зберегти як фінал' }))) return;
    setBusy('save');
    setMessage('');
    setSavedId(null);
    try {
      const wasFinal = status === 'final';
      const row = await persist(wasFinal ? 'final' : 'draft');
      if (!wasFinal) await setReportStatus(row.id, 'approve', { by: email });
      setStatus('final');
      if (periodType === 'weekly') {
        const r = await refreshMonthTotal(projectId, monthKey(period.start));
        if (r.error) setMessage('Звіт збережено як фінал, але підсумок місяця не вдалося перерахувати: ' + r.error);
      }
      await reloadSaved();
      setMessage((m) => m || (wasFinal ? 'Зміни збережено.' : 'Збережено як фінал: звіт в «Історії проекту» і в клієнта.'));
    } catch (e) {
      setMessage(e.message || 'Не вдалося зберегти.');
    } finally { setBusy(''); }
  }

  // ---- creatives (Meta)
  const canCreatives = ctx.scope === 'meta' || ctx.scope === 'all';
  const creativeCount = creatives?.count || (periodType === 'monthly' ? ctx.layout.creatives.monthly : ctx.layout.creatives.weekly) || (periodType === 'monthly' ? 4 : 3);
  const setCreativeItems = (items) => { setCreatives({ count: creativeCount, items }); setDirty(true); };
  async function suggestCreativeItems() {
    setCbusy(true);
    setCerr('');
    try {
      const found = await suggestCreatives({ projectId, start: period.start, end: period.end, count: creativeCount });
      if (!found.length) setCerr('За цей період у кабінеті Meta не знайдено оголошень.'); else setCreativeItems(found);
    } catch (e) { setCerr(e.message || 'Не вдалося підібрати креативи.'); } finally { setCbusy(false); }
  }

  async function remove(row) {
    if (isRunning(row, new Date().toISOString().slice(0, 10))) return;
    if (!(await confirm({ title: 'Видалити звіт?', body: 'Видалити збережений звіт? Дію не можна скасувати.', confirmLabel: 'Видалити звіт', danger: true }))) return;
    try { await deleteProjectReport(row.id); await reloadSaved(); } catch (e) { setMessage(e.message || 'Не вдалося видалити.'); }
  }

  function openSaved(row) {
    const [y, m] = row.period_start.split('-').map(Number);
    if (periodType === 'monthly') { changePicker({ year: y, month: m, weekIndex: 1 }); return; }
    const weeks = computeWeeksForMonth(y, m);
    const idx = weeks.find((w) => `${w.start.getFullYear()}-${String(w.start.getMonth() + 1).padStart(2, '0')}-${String(w.start.getDate()).padStart(2, '0')}` === row.period_start)?.index || 1;
    changePicker({ year: y, month: m, weekIndex: idx });
  }

  // "What was done" from the accounts' change history (weekly) or from the month's weekly lists (monthly).
  async function fillWhatWasDone(kind) {
    if (sections.whatWasDone.trim() && !(await confirm({ title: 'Замінити текст?', body: 'Поточний текст «What was done» буде замінено. Продовжити?', confirmLabel: 'Замінити', cancelLabel: 'Залишити' }))) return;
    setBusy('work');
    setMessage('');
    setWork(null);
    try {
      const weeklyRows = kind === 'weeks' ? await fetchProjectReports(projectId, 'weekly', ctx.scope) : [];
      const result = await buildWhatWasDone({
        source: kind === 'weeks' ? 'weeks' : 'history', periodType, period, accounts: ctx.accounts, projectName: ctx.project.name, note,
        weeklyRows, expectedWeeks: computeWeeksForMonth(picker.year, picker.month).length,
      });
      if (result.empty) { setWork({ ...result.info, empty: result.empty }); return; }
      setSections((s) => ({ ...s, whatWasDone: result.text }));
      setDirty(true);
      setWork({ ...result.info, writer: result.writer });
    } catch (e) {
      setMessage(e.message || 'Не вдалося сформувати текст.');
    } finally {
      setBusy('');
    }
  }

  if (ctx.error) return <div className="proj-empty">{ctx.error}</div>;
  if (!ctx.ready) return <div className="empty-hint">Завантаження...</div>;

  const hasAccounts = ctx.accounts.length > 0;
  // the text blocks of this report: its own snapshot, or the project's template for a new one (a text under a key outside the list is still shown)
  const newSnap = () => snapshotOf(ctx.layout, periodType, { metrics: metricKeys(ctx.kind, ctx.extraKeys, ctx.custom, ctx.layout.baseMetrics) });
  const textBlocks = reportBlocks({ template: snap || newSnap(), sections });
  const platData = !isTotal && data ? data.platforms?.[platform] : null;
  // columns picked in «+ Метрика» after this report was pulled: it has no numbers for them until it is refreshed
  const missing = platData ? missingColumns(platform, ctx.extraKeys, platData.total) : [];

  return (
    <div className="prep-wrap">
      <section className="ch-period">
        <div className="ch-ph"><ChMedal n="cal" /><h3>Період звіту</h3></div>
        <div className="ch-pcols">
          <div className="ch-pl">
            {periodType === 'weekly' ? (
              <WeekPicker year={picker.year} month={picker.month} weekIndex={picker.weekIndex} onChange={changePicker} years={yearOptions()} />
            ) : (
              <div className="picker">
                <div className="pk-field">
                  <label>Рік</label>
                  <Select value={picker.year} onChange={(v) => changePicker({ ...picker, year: v })} ariaLabel="Рік" options={yearOptions().map((y) => ({ value: y, label: String(y) }))} />
                </div>
                <div className="pk-field">
                  <label>Місяць</label>
                  <Select value={picker.month} onChange={(v) => changePicker({ ...picker, month: v })} ariaLabel="Місяць" options={MONTH_NAMES.map((name, i) => ({ value: i + 1, label: name }))} />
                </div>
              </div>
            )}
          </div>
          <div className="ch-pr">
            <div className="ch-pcard">
              <small>Звіт за</small>
              <b>{period.label}</b>
              <span className="ch-pd">{fmt(period.start)} – {fmt(period.end)}</span>
              <span className="ch-chips">
                {prev ? <i className="ch-chp">порівняння з {fmt(prev.start)} – {fmt(prev.end)}</i> : <i className="ch-chp off">без порівняння</i>}
                {meta.id && <i className={'ch-src' + (meta.source === 'agent' ? ' ag' : '')}>{meta.source === 'agent' ? 'AI-агент' : 'Вручну'}</i>}
              </span>
            </div>
            <div className="ch-pacts">
              <button type="button" className="btn btn-p" onClick={() => pull()} disabled={!hasAccounts || busy === 'pull'}><ChIcon n="pull" />{busy === 'pull' ? 'Завантаження…' : data ? 'Оновити з кабінетів' : 'Підтягнути з кабінетів'}</button>
              <button type="button" className={'btn' + (cmp ? ' prep-btn-on' : '')} onClick={() => setModal('compare')} disabled={busy === 'pull'}>
                <ChIcon n="cmp" />{cmp && prev ? `Порівняння: ${fmt(prev.start)}–${fmt(prev.end)}` : 'Порівняти'}
              </button>
            </div>
            {!hasAccounts && <span className="pacc-hint">Підключіть рекламний кабінет на вкладці «Огляд», щоб тягнути цифри автоматично.</span>}
          </div>
        </div>
      </section>

      {Object.entries(errors).map(([p, msg]) => <div className="pacc-err" key={p}>{p}: {msg}</div>)}

      {data && unfinished && (
        <div className="prep-internal-note" role="note">
          <b>Тільки для внутрішнього користування.</b> Період ще не завершився: у звіті дані до сьогоднішнього дня, тому з попереднім повним періодом порівнювати суми рано. Попередження не потрапляє у презентацію та експорт.
        </div>
      )}

      {missing.length > 0 && (
        <div className="prep-internal-note" role="note">
          <b>Нові стовпці без цифр.</b> Звіт зібрано до того, як додали: {missing.map((k) => metricMeta(k, ctx.custom).label).join(', ')}. Оновіть цифри з кабінетів, і вони зʼявляться в таблицях, експорті та презентації.{' '}
          <button type="button" className="pacc-link" onClick={() => pull(cmp, ctx.fetchColumns, true)} disabled={busy === 'pull'}>Оновити зараз</button>
        </div>
      )}

      {data?.previous && unequal && (
        <div className="prep-internal-note" role="note">
          <b>Тільки для внутрішнього користування.</b> Періоди різної тривалості: {daysCur} дн. проти {daysPrev} дн. Суми (витрати, покази, кліки, продажі) порівнювати некоректно, дивіться відносні показники (CTR, CPC, CPM, ROAS, AOV) або оберіть «Попередніми {daysCur} дн.». Це попередження не потрапляє у презентацію та експорт.
        </div>
      )}

      {!isTotal && ctx.ready && !ctx.layoutSaved && (
        <div className="prep-internal-note" role="note">
          <b>Макет звіту не налаштовано.</b> Звіт збирається за стандартним виглядом, а AI-агент для цієї платформи не працює, поки макет не створено.{' '}
          <button type="button" className="pacc-link" onClick={() => navigate(`/projects/${projectId}?tab=builder&platform=${platform}`)}>Відкрити «Конструктор звіту»</button>
        </div>
      )}

      {data && Object.keys(data.platforms).length > 0 && (
        <section className="report-section">
          <ResultView
            data={data} kind={ctx.kind} custom={ctx.custom} lockTotal={isTotal} extraKeys={ctx.extraKeys} templateMetrics={snap?.metrics || null} funnel={withFunnel(snap || newSnap(), ctx.layout).funnel} metricOrder={ctx.layout?.metricOrder} baseMetrics={ctx.layout?.baseMetrics}
            title={ctx.project.name} subtitle={period.label}
            fileBase={`${ctx.project.name}_${periodType}_${period.start}`}
            campaignMode="selected" selection={selection}
            options={options}
            curLabel={`${fmt(period.start)} – ${fmt(period.end)}`}
            prevLabel={data.previous?.period ? `${fmt(data.previous.period.start)} – ${fmt(data.previous.period.end)}` : 'Попередній'}
          />
        </section>
      )}

      <section className="report-section">
        <HubTitle icon="note">Текст звіту (англійською)</HubTitle>
        <div className="prep-texts">
          {textBlocks.map((b) => (
            <div className="ov-field-box" key={b.key}>
              <div className="ov-field-label">{b.title}</div>
              <AutoResizeTextarea value={sections[b.key] || ''} onChange={(v) => { setSections((s) => ({ ...s, [b.key]: v })); setDirty(true); }} placeholder={b.title + '…'} />
              {b.key === 'whatWasDone' && (
                <div className="prep-work">
                  <div className="prep-work-actions">
                    {periodType === 'monthly' && (
                      <button type="button" className="btn" onClick={() => fillWhatWasDone('weeks')} disabled={busy === 'work'}>{busy === 'work' ? 'Формуємо…' : 'Зібрати з тижневих звітів'}</button>
                    )}
                    <button type="button" className={'btn' + (periodType === 'weekly' ? ' btn-p' : '')} onClick={() => fillWhatWasDone('history')} disabled={busy === 'work' || !hasAccounts}>{busy === 'work' ? 'Формуємо…' : 'Сформувати з історії кабінетів'}</button>
                    {!hasAccounts && <span className="pacc-hint">Потрібен підключений кабінет.</span>}
                  </div>
                  {work && (
                    <div className="prep-internal-note" role="note">
                      <b>Тільки для внутрішнього користування.</b>{' '}
                      {work.empty || (work.kind === 'weeks'
                        ? `Текст зібрано з тижневих звітів: ${work.weeks.join('; ')}.${work.missing > 0 ? ` Тижнів без тексту: ${work.missing}.` : ''}`
                        : `Текст написано за ${work.facts.length} діями з кабінетів (системні сповіщення відфільтровано).`)}
                      {work.writer === 'plain' && ' Автоматичне оформлення зараз недоступне, тому показано сирий список дій: відредагуйте його.'}
                      {work.notes?.map((n) => <div key={n}>{n}</div>)}
                      {Object.entries(work.errors || {}).map(([p, m]) => <div key={p}>{p}: {m}</div>)}
                      {work.facts?.length > 0 && (
                        <details className="prep-work-facts"><summary>Які дії враховано</summary><ul>{work.facts.map((f) => <li key={f}>{f}</li>)}</ul></details>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
          <div className="ov-field-box">
            <div className="ov-field-label">Нотатка менеджера (контекст для AI-агента, у звіт не потрапляє)</div>
            <AutoResizeTextarea value={note} onChange={(v) => { setNote(v); setDirty(true); }} placeholder="Напр.: у вересні тестуємо Labor Day, акцент на RTS…" />
          </div>
        </div>
      </section>

      {canCreatives && (
        <section className="report-section">
          <HubTitle icon="layers">Most effective creatives</HubTitle>
          {creatives?.items?.length > 0 ? <CreativeGrid items={creatives.items} onReplace={(i) => setPicking(i)} onRemove={(i) => setCreativeItems(creatives.items.filter((_, j) => j !== i))} /> : <div className="pacc-hint">Креативів у звіті ще немає.</div>}
          <div className="crx-tools">
            <button type="button" className="btn" disabled={cbusy} onClick={suggestCreativeItems}>{cbusy ? 'Працюємо…' : creatives?.items?.length ? 'Підібрати знову' : 'Підібрати креативи автоматично'}</button>
            <button type="button" className="btn" onClick={() => setPicking((creatives?.items || []).length)}>+ Додати креатив</button>
            {cerr && <span className="form-err">{cerr}</span>}
          </div>
        </section>
      )}
      {picking != null && (
        <CreativePickerDialog
          row={{ project_id: projectId, period_start: period.start, period_end: period.end }} taken={(creatives?.items || []).map((c) => c.adId)} onClose={() => setPicking(null)}
          onPicked={(item) => { const at = picking; const list = creatives?.items || []; setPicking(null); setCreativeItems(at >= list.length ? [...list, item] : list.map((c, j) => (j === at ? item : c))); }}
        />
      )}

      <section className="report-section">
        <HubTitle icon="file">Збережені звіти</HubTitle>
        {saved.length === 0 ? (
          <div className="empty-hint">Збережених звітів ще немає.</div>
        ) : (
          <table className="prep-table prep-saved">
            <thead><tr><th>Період</th><th>Джерело</th><th>Статус</th><th>Оновлено</th><th>Презентація</th><th /></tr></thead>
            <tbody>
              {saved.map((r) => (
                <tr key={r.id} className={r.period_start === period.start ? 'on' : ''}>
                  <td className="lbl"><button type="button" className="pacc-link" onClick={() => openSaved(r)}>{fmt(r.period_start)} – {fmt(r.period_end)}</button></td>
                  <td><span className={'pacc-pill prep-src prep-src--' + r.source}>{r.source === 'agent' ? 'AI-агент' : 'Вручну'}</span></td>
                  <td>{isRunning(r, new Date().toISOString().slice(0, 10)) ? 'Оновлюється' : REPORT_STATUS[r.status] || r.status}</td>
                  <td className="muted">{new Date(r.updated_at).toLocaleString('uk-UA')}</td>
                  <td>
                    <div className="prep-deckcell">
                      {Object.keys(r.data?.platforms || {}).map((p, _i, all) => {
                        const has = decks.some((d) => d.period_start === r.period_start && d.platform === p);
                        return (
                          <button
                            key={p} type="button" className="pacc-link"
                            onClick={() => navigate(`/clients?project=${projectId}&type=${periodType}&start=${r.period_start}&platform=${p}`)}
                          >
                            {has ? 'Відкрити презентацію' : 'Створити презентацію'}{all.length > 1 ? ` · ${platformInfo(p).label}` : ''}
                          </button>
                        );
                      })}
                    </div>
                  </td>
                  <td className="num">{isRunning(r, new Date().toISOString().slice(0, 10)) ? <span className="muted" title="Звіт оновлюється автоматично до кінця місяця">—</span> : <button type="button" className="pacc-link pacc-link--danger" onClick={() => remove(r)}>Видалити</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="ch-save" aria-label="Збереження">
        <div className="ch-states">
          <span className={'ch-pill' + (meta.id && status === 'final' ? ' ok' : '')}><i />{meta.id ? `Статус: ${REPORT_STATUS[status] || status}` : 'Звіт ще не збережено'}</span>
          {dirty && <span className="ch-pill warn"><i />Є незбережені зміни</span>}
          {message && <span className="ch-pill ok"><i />{message}</span>}
        </div>
        <span className="ch-grow" />
        <div className="ch-sbtns">
          {status !== 'final' && (
            <button type="button" className="btn" onClick={saveDraft} disabled={busy === 'save' || (!data && !sections.whatWasDone && !sections.conclusion && !sections.plans)} title="Звіт ще дорабатується: він зʼявиться в розділі «Робота над звітами»">
              <ChIcon n="save" />{busy === 'save' ? '...' : 'Зберегти чернетку'}
            </button>
          )}
          <button type="button" className="btn ch-ok" onClick={saveFinal} disabled={busy === 'save' || !approver || !data} title={approver ? 'Звіт піде в «Історію проекту» і до клієнта' : 'Фінал зберігають лише відповідальні, обрані в налаштуваннях агента'}>
            <ChIcon n="check" />{busy === 'save' ? '...' : status === 'final' ? 'Зберегти зміни' : 'Зберегти як фінал'}
          </button>
          <button
            type="button" className="btn" disabled={!meta.id || dirty || !data || !Object.keys(data.platforms).length}
            title={!meta.id ? 'Спершу збережіть звіт' : dirty ? 'Збережіть зміни у звіті' : 'Відкрити презентацію для клієнта з цього звіту'}
            onClick={() => navigate(`/clients?project=${projectId}&type=${periodType}&start=${period.start}&platform=${Object.keys(data.platforms)[0]}`)}
          >
            <ChIcon n="pres" />Створити презентацію
          </button>
          {savedId && <button type="button" className="ch-lnk" onClick={() => navigate(`/projects/${projectId}?tab=work&report=${savedId}&platform=${platform}`)}>Відкрити в «Робота над звітами»</button>}
        </div>
        {!approver && <div className="ch-shint">Фінал зберігають лише відповідальні, обрані в налаштуваннях агента; чернетку може зберегти будь-хто.</div>}
      </section>

      {(modal === 'compare' || modal === 'ask') && (
        <CompareModal
          offer={modal === 'ask'} current={{ from: period.start, to: period.end }} presets={comparePresets} value={cmp}
          onApply={applyCompare} onClose={() => setModal(null)} onNeverAsk={neverAsk}
        />
      )}
      {confirmDialog}
    </div>
  );
}
