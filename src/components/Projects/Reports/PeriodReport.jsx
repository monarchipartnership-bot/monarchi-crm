import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import ResultView from './ResultView';
import CampaignGroupsModal from './CampaignGroupsModal';
import CustomMetricModal from './CustomMetricModal';
import { useReportContext } from './useReportContext';
import AutoResizeTextarea from '../../Reports/AutoResizeTextarea';
import WeekPicker from '../../Reports/Weekly/WeekPicker';
import { daysInRange, fetchProjectRange, periodFromPicker, precedingDays, previousPicker, regroupData } from '../../../lib/periodReport';
import { fetchProjectReports, saveProjectReport, deleteProjectReport } from '../../../lib/api/projectReportStore';
import { fetchProjectDecks } from '../../../lib/api/projectDecks';
import { collectFacts, describeWork, mergeWeeks } from '../../../lib/workHistory';
import { platformInfo } from '../../../lib/adAccounts';
import { MONTH_NAMES, computeWeeksForMonth, defaultWeekIndexFor, todayIso, yearOptions } from '../../../lib/dateHelpers';
import { useAuth } from '../../../contexts/AuthContext';
import '../../../styles/projectReports.css';

const TEXT_BLOCKS = [
  { key: 'whatWasDone', title: 'What was done' },
  { key: 'conclusion', title: 'Conclusion' },
  { key: 'plans', title: 'Plans for the next period' },
];
const EMPTY_SECTIONS = { whatWasDone: '', conclusion: '', plans: '' };
const STATUS = { draft: 'Чернетка', reviewed: 'Перевірено', final: 'Фінал' };
const fmt = (s) => s.split('-').reverse().join('.');

function initialPicker() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  return { year, month, weekIndex: defaultWeekIndexFor(computeWeeksForMonth(year, month)) };
}

// «Тижневий звіт» / «Місячний звіт»: pick the period, pull the numbers from the
// project's ad accounts together with the period before it for comparison, add
// the text, save. Reports made by hand and (later) by the AI agent sit in one list.
export default function PeriodReport({ projectId, periodType }) {
  const { email } = useAuth();
  const navigate = useNavigate();
  const ctx = useReportContext(projectId);
  const [picker, setPicker] = useState(initialPicker);
  const [saved, setSaved] = useState([]);
  const [decks, setDecks] = useState([]);
  const [savedLoaded, setSavedLoaded] = useState(false);
  const applied = useRef('');
  const [data, setData] = useState(null);
  const [sections, setSections] = useState(EMPTY_SECTIONS);
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
  // What the numbers are compared with: the previous report period (previous week of
  // the month / previous month) or the same number of days right before this period.
  const [cmpMode, setCmpMode] = useState('calendar');

  const period = periodFromPicker(periodType, picker);
  const prevFor = (mode) => {
    if (mode === 'days') {
      const p = precedingDays(period.start, daysInRange(period.start, period.end));
      return { ...p, label: '' };
    }
    return periodFromPicker(periodType, previousPicker(periodType, picker));
  };
  const prev = prevFor(cmpMode);
  const daysCur = daysInRange(period.start, period.end);
  const daysPrev = daysInRange(prev.start, prev.end);
  const unequal = daysCur !== daysPrev;
  const unfinished = period.end >= todayIso();

  const reloadSaved = useCallback(async () => {
    const [rows, deckRows] = await Promise.all([fetchProjectReports(projectId, periodType), fetchProjectDecks(projectId)]);
    setSaved(rows);
    setDecks(deckRows.filter((d) => d.period_type === periodType));
    setSavedLoaded(true);
  }, [projectId, periodType]);
  useEffect(() => { setSavedLoaded(false); setSaved([]); applied.current = ''; reloadSaved(); }, [reloadSaved]);

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
      setNote(row.data?.note || '');
      setSelection(row.data?.selection || []);
      setOptions({ groups: true, ...(row.data?.options || {}) });
      setStatus(row.status);
      setMeta({ source: row.source, id: row.id });
      setCmpMode(row.data?.compare?.mode || 'calendar');
    } else {
      setData(null);
      setSections(EMPTY_SECTIONS);
      setNote('');
      setSelection([]);
      setOptions({ groups: true });
      setWork(null);
      setStatus('draft');
      setMeta({ source: 'manual', id: null });
    }
    setDirty(false);
    setMessage('');
    setErrors({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saved, savedLoaded, period.start, projectId, periodType, dirty]);

  function changePicker(next) {
    if (dirty && !window.confirm('Є незбережені зміни в цьому звіті. Перейти до іншого періоду без збереження?')) return;
    if (periodType === 'weekly') {
      const dim = computeWeeksForMonth(next.year, next.month).length;
      setPicker({ year: next.year, month: next.month, weekIndex: Math.min(next.weekIndex || 1, dim) });
    } else {
      setPicker({ year: next.year, month: next.month, weekIndex: 1 });
    }
  }

  async function pull(mode = cmpMode) {
    const pv = prevFor(mode);
    setBusy('pull');
    setMessage('');
    try {
      const [cur, before] = await Promise.all([
        fetchProjectRange(ctx.accounts, period.start, period.end, ctx.kind, ctx.groups),
        fetchProjectRange(ctx.accounts, pv.start, pv.end, ctx.kind, ctx.groups),
      ]);
      setErrors(cur.errors);
      setData({ platforms: cur.platforms, previous: { period: { start: pv.start, end: pv.end }, platforms: before.platforms } });
      setDirty(true);
    } catch (e) {
      setMessage(e.message || 'Не вдалося отримати дані.');
    } finally {
      setBusy('');
    }
  }

  async function save(nextStatus = status) {
    setBusy('save');
    setMessage('');
    try {
      const row = await saveProjectReport({
        projectId, periodType, periodStart: period.start, periodEnd: period.end, status: nextStatus,
        source: meta.source, createdBy: email,
        // `compare` is internal bookkeeping (never printed on a presentation).
        data: { version: 1, kind: ctx.kind, platforms: data?.platforms || {}, previous: data?.previous || null, compare: { mode: cmpMode, daysCur, daysPrev, unequal }, selection, options, sections, note, savedAt: new Date().toISOString() },
      });
      setStatus(row.status);
      setDirty(false);
      await reloadSaved();
      setMessage('Звіт збережено.');
    } catch (e) {
      setMessage((e.message || 'Не вдалося зберегти.') + ' Якщо це перше збереження, перевірте, що застосовано міграцію 20261008000000.');
    } finally {
      setBusy('');
    }
  }

  async function remove(row) {
    if (!window.confirm('Видалити збережений звіт? Дію не можна скасувати.')) return;
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
    if (sections.whatWasDone.trim() && !window.confirm('Поточний текст «What was done» буде замінено. Продовжити?')) return;
    setBusy('work');
    setMessage('');
    setWork(null);
    try {
      let result;
      let info;
      if (kind === 'weeks') {
        const rows = (await fetchProjectReports(projectId, 'weekly')).filter((r) => r.period_start >= period.start && r.period_start <= period.end).sort((a, b) => a.period_start.localeCompare(b.period_start));
        const weeks = rows.map((r) => ({ label: `${fmt(r.period_start)} – ${fmt(r.period_end)}`, text: r.data?.sections?.whatWasDone || '' }));
        const withText = weeks.filter((w) => w.text.trim());
        const expected = computeWeeksForMonth(picker.year, picker.month).length;
        info = { kind, weeks: withText.map((w) => w.label), missing: expected - withText.length, facts: [], notes: [], errors: {} };
        if (!withText.length) { setWork({ ...info, empty: 'Для цього місяця немає тижневих звітів з текстом «What was done». Збережіть тижневі звіти або згенеруйте текст з історії кабінетів.' }); return; }
        result = await mergeWeeks({ weeks: withText, projectName: ctx.project.name, note, from: period.start, to: period.end });
      } else {
        const { facts, errors, notes } = await collectFacts(ctx.accounts, period.start, period.end);
        info = { kind, facts, notes, errors };
        if (!facts.length) { setWork({ ...info, empty: 'У кабінетах за цей період не знайдено дій людей (лише системні події). Додайте текст вручну.' }); return; }
        result = await describeWork({ facts, projectName: ctx.project.name, note, from: period.start, to: period.end, periodType });
      }
      setSections((s) => ({ ...s, whatWasDone: result.text }));
      setDirty(true);
      setWork({ ...info, writer: result.writer });
    } catch (e) {
      setMessage(e.message || 'Не вдалося сформувати текст.');
    } finally {
      setBusy('');
    }
  }

  if (ctx.error) return <div className="proj-empty">{ctx.error}</div>;
  if (!ctx.ready) return <div className="empty-hint">Завантаження...</div>;

  const campaignNames = data ? [...new Set(Object.values(data.platforms).flatMap((p) => p.campaigns.map((c) => c.name)))] : [];
  const first = data ? Object.values(data.platforms)[0] : null;
  const hasAccounts = ctx.accounts.length > 0;

  return (
    <div className="prep-wrap">
      <section className="report-section">
        {periodType === 'weekly' ? (
          <WeekPicker year={picker.year} month={picker.month} weekIndex={picker.weekIndex} onChange={changePicker} years={yearOptions()} />
        ) : (
          <div className="picker">
            <div className="pk-field">
              <label>Рік</label>
              <select value={picker.year} onChange={(e) => changePicker({ ...picker, year: +e.target.value })}>
                {yearOptions().map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
            <div className="pk-field">
              <label>Місяць</label>
              <select value={picker.month} onChange={(e) => changePicker({ ...picker, month: +e.target.value })}>
                {MONTH_NAMES.map((name, i) => <option key={name} value={i + 1}>{name}</option>)}
              </select>
            </div>
          </div>
        )}
        <div className="prep-period-line">
          <b>{period.label}</b> · {fmt(period.start)} – {fmt(period.end)} · порівняння з {fmt(prev.start)} – {fmt(prev.end)}
          {meta.id && <span className={'pacc-pill prep-src prep-src--' + meta.source}>{meta.source === 'agent' ? 'AI-агент' : 'Вручну'}</span>}
        </div>
        <div className="prep-actions">
          <div className="pk-field">
            <label>Порівняти з</label>
            <select value={cmpMode} onChange={(e) => { setCmpMode(e.target.value); if (data) pull(e.target.value); }} disabled={busy === 'pull'}>
              <option value="calendar">{periodType === 'weekly' ? 'Попереднім тижнем місяця' : 'Попереднім місяцем'}</option>
              <option value="days">Попередніми {daysCur} дн. (така ж тривалість)</option>
            </select>
          </div>
          <button type="button" className="btn btn-p" onClick={() => pull()} disabled={!hasAccounts || busy === 'pull'}>{busy === 'pull' ? 'Завантаження…' : data ? 'Оновити з кабінетів' : 'Підтягнути з кабінетів'}</button>
          <button type="button" className="btn" onClick={() => setModal('groups')}>Групи кампаній</button>
          <button type="button" className="btn" onClick={() => setModal('metric')}>+ Метрика</button>
          {!hasAccounts && <span className="pacc-hint">Підключіть рекламний кабінет на вкладці «Overview», щоб тягнути цифри автоматично.</span>}
        </div>
      </section>

      {Object.entries(errors).map(([p, msg]) => <div className="pacc-err" key={p}>{p}: {msg}</div>)}

      {data && unfinished && (
        <div className="prep-internal-note" role="note">
          <b>Тільки для внутрішнього користування.</b> Період ще не завершився: у звіті дані до сьогоднішнього дня, тому з попереднім повним періодом порівнювати суми рано. Попередження не потрапляє у презентацію та експорт.
        </div>
      )}

      {data?.previous && unequal && (
        <div className="prep-internal-note" role="note">
          <b>Тільки для внутрішнього користування.</b> Періоди різної тривалості: {daysCur} дн. проти {daysPrev} дн. Суми (витрати, покази, кліки, продажі) порівнювати некоректно, дивіться відносні показники (CTR, CPC, CPM, ROAS, AOV) або оберіть «Попередніми {daysCur} дн.». Це попередження не потрапляє у презентацію та експорт.
        </div>
      )}

      {data && Object.keys(data.platforms).length > 0 && (
        <section className="report-section">
          <ResultView
            data={data} kind={ctx.kind} custom={ctx.custom}
            title={ctx.project.name} subtitle={period.label}
            fileBase={`${ctx.project.name}_${periodType}_${period.start}`}
            campaignMode="selected" selection={selection} onSelectionChange={(s) => { setSelection(s); setDirty(true); }}
            options={options} onOptionsChange={(o) => { setOptions(o); setDirty(true); }}
            curLabel={`${fmt(period.start)} – ${fmt(period.end)}`}
            prevLabel={data.previous?.period ? `${fmt(data.previous.period.start)} – ${fmt(data.previous.period.end)}` : 'Попередній'}
          />
        </section>
      )}

      <section className="report-section">
        <div className="stitle">Текст звіту (англійською)</div>
        <div className="prep-texts">
          {TEXT_BLOCKS.map((b) => (
            <div className="ov-field-box" key={b.key}>
              <div className="ov-field-label">{b.title}</div>
              <AutoResizeTextarea value={sections[b.key]} onChange={(v) => { setSections((s) => ({ ...s, [b.key]: v })); setDirty(true); }} placeholder={b.title + '…'} />
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
        <div className="prep-save-row">
          <div className="pk-field">
            <label>Статус</label>
            <select value={status} onChange={(e) => { setStatus(e.target.value); setDirty(true); }}>
              {Object.entries(STATUS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <button type="button" className="btn btn-p" onClick={() => save()} disabled={busy === 'save' || (!data && !sections.whatWasDone && !sections.conclusion && !sections.plans)}>
            {busy === 'save' ? '...' : 'Зберегти звіт'}
          </button>
          <button
            type="button" className="btn" disabled={!meta.id || dirty || !data || !Object.keys(data.platforms).length}
            title={!meta.id ? 'Спершу збережіть звіт' : dirty ? 'Збережіть зміни у звіті' : 'Відкрити презентацію для клієнта з цього звіту'}
            onClick={() => navigate(`/clients?project=${projectId}&type=${periodType}&start=${period.start}&platform=${Object.keys(data.platforms)[0]}`)}
          >
            Створити презентацію
          </button>
          {dirty && <span className="pacc-hint">Є незбережені зміни</span>}
          {message && <span className="pacc-hint">{message}</span>}
        </div>
      </section>

      <section className="report-section">
        <div className="stitle">Збережені звіти</div>
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
                  <td>{STATUS[r.status] || r.status}</td>
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
                  <td className="num"><button type="button" className="pacc-link pacc-link--danger" onClick={() => remove(r)}>Видалити</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {modal === 'groups' && (
        <CampaignGroupsModal projectId={projectId} groups={ctx.groups} campaignNames={campaignNames} onClose={() => setModal(null)}
          onSaved={async () => { const g = await ctx.reloadGroups(); setData((d) => (d ? regroupData(d, g) : d)); setDirty(true); }} />
      )}
      {modal === 'metric' && (
        <CustomMetricModal projectId={projectId} custom={ctx.custom} onClose={() => setModal(null)} onChanged={ctx.reloadCustom}
          sample={first ? { base: first.total, currency: first.currency, label: 'весь акаунт' } : null} />
      )}
    </div>
  );
}
