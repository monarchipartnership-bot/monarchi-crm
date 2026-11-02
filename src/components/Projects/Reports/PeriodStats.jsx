import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import ResultView from './ResultView';
import CompareModal from './CompareModal';
import { saveProjectReport } from '../../../lib/api/projectReportStore';
import { EMPTY_SECTIONS, reportPayload } from '../../../lib/reportEngine';
import { customBlocks } from '../../../lib/reportTemplate';
import PeriodExtras from './PeriodExtras';
import { useAuth } from '../../../contexts/AuthContext';
import { useReportContext } from './useReportContext';
import { fetchProjectRange, regroupData } from '../../../lib/periodReport';
import { campaignKey } from '../../../lib/campaignGroups';
import { isoDate } from '../../../lib/dateHelpers';
import '../../../styles/projectReports.css';
import '../../../styles/composeHub.css';
import DatePicker from '../../common/DatePicker';

const iso = (d) => isoDate(d.getFullYear(), d.getMonth() + 1, d.getDate());
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const parse = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const fmt = (s) => s.split('-').reverse().join('.');

function presetRange(key) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (key === '7') return { from: iso(addDays(today, -6)), to: iso(today) };
  if (key === '30') return { from: iso(addDays(today, -29)), to: iso(today) };
  if (key === 'month') return { from: iso(new Date(today.getFullYear(), today.getMonth(), 1)), to: iso(today) };
  const first = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  return { from: iso(first), to: iso(new Date(today.getFullYear(), today.getMonth(), 0)) };
}

const PS_ICONS = {
  range: <><rect x="3.5" y="5" width="17" height="15" rx="2" /><path d="M3.5 10h17M8 3v4M16 3v4M8 14h3M13 14h3" /></>,
  metr: <path d="M5 20V10M12 20V4M19 20v-7" />,
  pull: <path d="M12 4v11M7 11l5 5 5-5M5 20h14" />,
  cmp: <path d="M7 7h12l-3-3M17 17H5l3 3" />,
  save: <path d="M5 4h11l3 3v13H5zM8 4v5h7V4M8 20v-6h8v6" />,
  all: <><rect x="3" y="4" width="7.5" height="7.5" rx="2" /><rect x="13.5" y="4" width="7.5" height="7.5" rx="2" /><rect x="3" y="14" width="7.5" height="7.5" rx="2" /><rect x="13.5" y="14" width="7.5" height="7.5" rx="2" /></>,
  warn: <><path d="M12 3.5l9 15.5H3z" /><path d="M12 10v4M12 17h.01" /></>,
};
const PsIcon = ({ n }) => <svg className="ch-ic" viewBox="0 0 24 24" aria-hidden="true">{PS_ICONS[n]}</svg>;
const PsMedal = ({ n, cls = '' }) => <span className={'hub-ring ch-md ' + cls} aria-hidden="true"><span className="hub-tile hub-tile--ln"><svg viewBox="0 0 24 24">{PS_ICONS[n]}</svg></span></span>;

const PRESETS = [['7', '7 днів'], ['30', '30 днів'], ['month', 'Цей місяць'], ['last', 'Минулий місяць']];

// «Показники за період»: pick any date range, get the numbers straight from the
// project's ad accounts as a table (optionally against the period right before it),
// and download it. `platform` is the tab of PlatformReports: one platform's own numbers
// and groups, or 'total' (the sum over every platform, without groups).
export default function PeriodStats({ projectId, platform = 'total' }) {
  const ctx = useReportContext(projectId, platform);
  const { email } = useAuth();
  const navigate = useNavigate();
  const [archive, setArchive] = useState({ busy: false, msg: '', id: null });
  const isTotal = platform === 'total';
  const initial = presetRange('7');
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  // What the numbers are compared with: nothing until the person asks (button «Порівняти»).
  // { mode: 'previous' } = the same number of days right before; { mode: 'custom', from, to } = any dates.
  const [cmp, setCmp] = useState(null);
  const [state, setState] = useState({ status: 'idle' });
  const [modal, setModal] = useState(null);
  const [sections, setSections] = useState(EMPTY_SECTIONS); // the texts and the creatives of the dates on screen (saved with the custom report)
  const [creatives, setCreatives] = useState(null);
  const [askOff, setAskOff] = useState(() => { try { return localStorage.getItem('prep-ask-compare') === 'off'; } catch { return false; } });

  const previousOf = (range) => {
    const days = Math.round((parse(range.to) - parse(range.from)) / 86400000) + 1;
    const prevTo = addDays(parse(range.from), -1);
    return { from: iso(addDays(prevTo, -(days - 1))), to: iso(prevTo) };
  };
  const compareRange = (range, c) => (c?.mode === 'custom' ? { from: c.from, to: c.to } : c?.mode === 'previous' ? previousOf(range) : null);

  async function run(range = { from, to }, c = cmp, columns = ctx.fetchColumns, quiet = false) {
    if (range.from > range.to) { setState({ status: 'error', error: 'Початок періоду пізніше за кінець.' }); return; }
    setState({ status: 'loading' }); setArchive({ busy: false, msg: '', id: null });
    if (!state.range || state.range.from !== range.from || state.range.to !== range.to) { setSections(EMPTY_SECTIONS); setCreatives(null); } // other dates: the texts and creatives of the old ones do not belong here
    const prev = compareRange(range, c);
    try {
      const [cur, before] = await Promise.all([
        fetchProjectRange(ctx.accounts, range.from, range.to, ctx.kind, ctx.groups, undefined, columns, ctx.selections),
        prev ? fetchProjectRange(ctx.accounts, prev.from, prev.to, ctx.kind, ctx.groups, undefined, columns, ctx.selections) : Promise.resolve(null),
      ]);
      setState({ status: 'ok', data: { platforms: cur.platforms, previous: before ? { platforms: before.platforms } : null }, errors: cur.errors, range, prev });
      // A new period is on screen: offer to add a comparison (unless switched off or already set).
      if (!quiet && !c && !askOff) setModal('ask');
    } catch (e) {
      setState({ status: 'error', error: e.message || 'Не вдалося отримати дані.' });
    }
  }

  // Adds / changes / removes the comparison of the period already shown, without asking for the period again.
  async function applyCompare(c) {
    setCmp(c);
    setModal(null);
    if (state.status !== 'ok') return;
    if (!c) { setState((st) => ({ ...st, data: { ...st.data, previous: null }, prev: null })); return; }
    const prev = compareRange(state.range, c);
    setState((st) => ({ ...st, comparing: true }));
    try {
      const before = await fetchProjectRange(ctx.accounts, prev.from, prev.to, ctx.kind, ctx.groups, undefined, ctx.fetchColumns, ctx.selections);
      setState((st) => ({ ...st, comparing: false, data: { ...st.data, previous: { platforms: before.platforms } }, prev }));
    } catch (e) {
      setState((st) => ({ ...st, comparing: false, compareError: e.message || 'Не вдалося отримати дані для порівняння.' }));
    }
  }

  function neverAsk() {
    setAskOff(true);
    try { localStorage.setItem('prep-ask-compare', 'off'); } catch { /* optional */ }
  }

  function pickPreset(key) {
    const r = presetRange(key);
    setFrom(r.from);
    setTo(r.to);
    run(r);
  }

  // Another tab: its own platform's numbers for the same dates (a result already on screen is fetched again for the new tab).
  const tabSeen = useRef(platform);
  useEffect(() => {
    if (tabSeen.current === platform) return;
    tabSeen.current = platform;
    setModal(null);
    if (state.status === 'ok' && ctx.ready) run(state.range); else setState({ status: 'idle' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [platform]);

  // The campaigns of the table are the ones the layout selected (the «Конструктор звіту»). «Показати всі кампанії» adds every other campaign of the
  // period as a column too, without changing the layout.
  const [allCampaigns, setAllCampaigns] = useState(false);
  const canShowAll = Boolean(ctx.selections);
  const shown = useMemo(() => {
    if (state.status !== 'ok') return null;
    if (!allCampaigns || !ctx.selections) return state.data;
    const own = ctx.selections[platform];
    const all = (state.data.platforms[platform]?.campaigns || []).map((c) => campaignKey(platform, c.name));
    return regroupData(state.data, ctx.groups, { [platform]: { groups: own.groups, campaigns: [...own.campaigns, ...all] } });
  }, [state, allCampaigns, ctx.selections, ctx.groups, platform]);

  // «Зберегти»: the period on screen becomes a custom report. It has no draft or rework (it is saved as final), never goes to the client, and lives in
  // «Історія проекту» → «Кастомні звіти», where it is opened, edited, downloaded or deleted.
  async function saveCustom() {
    setArchive({ busy: true, msg: '', id: null });
    try {
      const period = { start: state.range.from, end: state.range.to };
      const prev = state.prev ? { start: state.prev.from, end: state.prev.to } : null;
      const payload = reportPayload({ kind: ctx.kind, data: { platforms: shown.platforms, previous: shown.previous ? { period: prev, platforms: shown.previous.platforms } : null }, compare: cmp, period, prev, selection: [], options: { groups: true }, sections, template: { blocks: customBlocks(ctx.layout), metrics: null, hiddenMetrics: [], funnel: null } });
      if (creatives?.items?.length) payload.creatives = { count: creatives.count, items: creatives.items, source: 'manual', at: new Date().toISOString() };
      const row = await saveProjectReport({ projectId, periodType: 'custom', periodStart: period.start, periodEnd: period.end, platform: ctx.scope, source: 'manual', status: 'final', data: { ...payload, label: null }, createdBy: email });
      setArchive({ busy: false, msg: 'Збережено в «Історія проекту» → «Кастомні звіти».', id: row.id });
    } catch (e) {
      setArchive({ busy: false, msg: (e.message || 'Не вдалося зберегти.') + ' Якщо це перше збереження, перевірте, що застосовано міграцію 20261030000000.', id: null });
    }
  }

  if (ctx.error) return <div className="proj-empty">{ctx.error}</div>;
  if (!ctx.ready) return <div className="empty-hint">Завантаження...</div>;
  if (!ctx.allAccounts.length) {
    return <div className="empty-hint">До проєкту не підключено рекламних кабінетів. Підключіть Meta або Google на вкладці «Огляд», і тут зʼявляться цифри.</div>;
  }


  const loading = state.status === 'loading';
  // the preset whose dates are on the screen is lit in the ribbon
  const activePreset = PRESETS.find(([k]) => { const r = presetRange(k); return r.from === from && r.to === to; })?.[0] || null;
  const shownRange = state.status === 'ok' ? state.range : { from, to };
  const dayCount = Math.round((parse(shownRange.to) - parse(shownRange.from)) / 86400000) + 1;
  const prevShown = state.status === 'ok' ? state.prev : null;

  return (
    <div className="prep-wrap">
      <section className="ch-period">
        <div className="ch-ph"><PsMedal n="range" /><h3>Період</h3></div>
        <div className="ch-pcols">
          <div className="ch-pl">
            <div className="ch-dates">
              <div className="pk-field"><label>Від</label><DatePicker value={from} onChange={setFrom} /></div>
              <div className="pk-field"><label>До</label><DatePicker value={to} onChange={setTo} /></div>
            </div>
            <div className="ch-lbl">Швидкий вибір</div>
            <div className="prep-seg ch-presets" role="group" aria-label="Швидкий вибір періоду">
              {PRESETS.map(([k, label]) => (
                <button key={k} type="button" className={'prep-seg-tab' + (activePreset === k ? ' on' : '')} aria-pressed={activePreset === k} onClick={() => pickPreset(k)} disabled={loading}>{label}</button>
              ))}
            </div>
          </div>
          <div className="ch-pr">
            <div className="ch-pcard">
              <small>Показники за</small>
              <b>{fmt(shownRange.from)} – {fmt(shownRange.to)}</b>
              <span className="ch-pd">{dayCount} дн.</span>
              <span className="ch-chips">
                {prevShown ? <i className="ch-chp">порівняння з {fmt(prevShown.from)} – {fmt(prevShown.to)}</i> : cmp ? <i className="ch-chp">порівняння додано</i> : <i className="ch-chp off">без порівняння</i>}
              </span>
            </div>
            <div className="ch-pacts">
              <button type="button" className="btn btn-p" onClick={() => run()} disabled={loading}><PsIcon n="pull" />{loading ? 'Завантаження…' : 'Показати'}</button>
              <button type="button" className={'btn' + (cmp ? ' prep-btn-on' : '')} onClick={() => setModal('compare')} disabled={loading || state.comparing}>
                <PsIcon n="cmp" />{state.comparing ? 'Порівняння…' : cmp && state.prev ? `Порівняння: ${fmt(state.prev.from)}–${fmt(state.prev.to)}` : cmp ? 'Порівняння додано' : 'Порівняти'}
              </button>
            </div>
          </div>
        </div>
      </section>

      {state.status === 'error' && <div className="ch-err" role="alert"><PsIcon n="warn" />{state.error}</div>}
      {state.compareError && <div className="ch-err" role="alert"><PsIcon n="warn" />{state.compareError}</div>}
      {state.status === 'ok' && Object.entries(state.errors).map(([p, msg]) => <div className="ch-err" role="alert" key={p}><PsIcon n="warn" />{p}: {msg}</div>)}

      {loading && (
        <section className="ch-block" aria-busy="true">
          <div className="ch-bh"><PsMedal n="metr" cls="ch-md--sm" /><b>Цифри за період</b><span className="ch-pill warn"><i />Завантажуємо цифри з кабінетів…</span></div>
          <div className="ch-skel"><i /><i /><i /><i /><i /></div>
        </section>
      )}

      {state.status === 'ok' && !loading && Object.keys(shown.platforms).length > 0 && (
        <section className="ch-block">
          <div className="ch-bh">
            <PsMedal n="metr" cls="ch-md--sm" />
            <b>Цифри за період</b>
            <span className="ch-bd">{fmt(state.range.from)} – {fmt(state.range.to)} · {dayCount} дн.</span>
            {state.prev && <i className="ch-chp">порівняння з {fmt(state.prev.from)} – {fmt(state.prev.to)}</i>}
          </div>
          <ResultView
            data={shown} kind={ctx.kind} custom={ctx.custom} lockTotal={isTotal} extraKeys={ctx.extraKeys}
            title={ctx.project.name} subtitle={`${fmt(state.range.from)} – ${fmt(state.range.to)}`}
            fileBase={`${ctx.project.name}_${state.range.from}_${state.range.to}`}
            curLabel={`${fmt(state.range.from)}–${fmt(state.range.to)}`}
            prevLabel={state.prev ? `${fmt(state.prev.from)}–${fmt(state.prev.to)}` : ''}
          />
        </section>
      )}

      {state.status === 'ok' && !loading && Object.keys(shown.platforms).length > 0 && (
        <PeriodExtras
          projectId={projectId} ctx={ctx} range={state.range} blocks={customBlocks(ctx.layout)}
          sections={sections} onSections={(s) => { setSections(s); setArchive((a) => (a.id ? { busy: false, msg: '', id: null } : a)); }}
          creatives={creatives} onCreatives={(c) => { setCreatives(c); setArchive((a) => (a.id ? { busy: false, msg: '', id: null } : a)); }}
        />
      )}

      {state.status === 'idle' && (
        <div className="ch-empty">
          <span className="hub-ring ch-md ch-md--xl st-mu" aria-hidden="true"><span className="hub-tile hub-tile--ln"><svg viewBox="0 0 24 24">{PS_ICONS.range}</svg></span></span>
          <h3>Оберіть період і натисніть «Показати»</h3>
          <p>Цифри підтягнуться з рекламних кабінетів проєкту. Їх можна порівняти з попереднім періодом, завантажити або зберегти в «Кастомні звіти».</p>
        </div>
      )}

      {state.status === 'ok' && !loading && Object.keys(shown.platforms).length > 0 && (
        <section className="ch-save" aria-label="Дії над цифрами">
          <div className="ch-states">
            <span className={'ch-pill' + (archive.id ? ' ok' : '')}><i />{archive.id ? 'Збережено в «Кастомні звіти»' : 'Не збережено'}</span>
            <span className="ch-bd">{fmt(state.range.from)} – {fmt(state.range.to)}</span>
            {archive.msg && !archive.id && <span className="ch-pill warn"><i />{archive.msg}</span>}
          </div>
          <span className="ch-grow" />
          <div className="ch-sbtns">
            {canShowAll && <button type="button" className={'btn' + (allCampaigns ? ' prep-btn-on' : '')} onClick={() => setAllCampaigns((v) => !v)} aria-pressed={allCampaigns}><PsIcon n="all" />{allCampaigns ? 'Лише обрані в макеті' : 'Показати всі кампанії'}</button>}
            <button type="button" className="btn ch-ok" onClick={saveCustom} disabled={archive.busy}><PsIcon n="save" />{archive.busy ? 'Зберігаємо…' : 'Зберегти'}</button>
            {archive.id && <button type="button" className="ch-lnk" onClick={() => navigate(`/projects/${projectId}?tab=decks&platform=${platform}&section=custom&report=${archive.id}`)}>Відкрити в «Кастомні звіти»</button>}
          </div>
        </section>
      )}

      {(modal === 'compare' || modal === 'ask') && (
        <CompareModal
          offer={modal === 'ask'}
          current={state.status === 'ok' ? state.range : { from, to }}
          presets={[{ key: 'previous', title: 'Попередній період', hint: 'стільки ж днів одразу перед обраним', range: previousOf(state.status === 'ok' ? state.range : { from, to }) }]}
          value={cmp}
          onApply={applyCompare}
          onClose={() => setModal(null)}
          onNeverAsk={neverAsk}
        />
      )}
    </div>
  );
}
