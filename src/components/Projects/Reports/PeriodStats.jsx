import { useState } from 'react';
import ResultView from './ResultView';
import CompareModal from './CompareModal';
import CampaignGroupsModal from './CampaignGroupsModal';
import CustomMetricModal from './CustomMetricModal';
import { useReportContext } from './useReportContext';
import { fetchProjectRange, regroupData } from '../../../lib/periodReport';
import { isoDate } from '../../../lib/dateHelpers';
import '../../../styles/projectReports.css';
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

const PRESETS = [['7', '7 днів'], ['30', '30 днів'], ['month', 'Цей місяць'], ['last', 'Минулий місяць']];

// «Показники за період»: pick any date range, get the numbers straight from the
// project's ad accounts as a table (optionally against the period right before it),
// and download it.
export default function PeriodStats({ projectId }) {
  const ctx = useReportContext(projectId);
  const initial = presetRange('7');
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  // What the numbers are compared with: nothing until the person asks (button «Порівняти»).
  // { mode: 'previous' } = the same number of days right before; { mode: 'custom', from, to } = any dates.
  const [cmp, setCmp] = useState(null);
  const [state, setState] = useState({ status: 'idle' });
  const [modal, setModal] = useState(null);
  const [askOff, setAskOff] = useState(() => { try { return localStorage.getItem('prep-ask-compare') === 'off'; } catch { return false; } });

  const previousOf = (range) => {
    const days = Math.round((parse(range.to) - parse(range.from)) / 86400000) + 1;
    const prevTo = addDays(parse(range.from), -1);
    return { from: iso(addDays(prevTo, -(days - 1))), to: iso(prevTo) };
  };
  const compareRange = (range, c) => (c?.mode === 'custom' ? { from: c.from, to: c.to } : c?.mode === 'previous' ? previousOf(range) : null);

  async function run(range = { from, to }, c = cmp) {
    if (range.from > range.to) { setState({ status: 'error', error: 'Початок періоду пізніше за кінець.' }); return; }
    setState({ status: 'loading' });
    const prev = compareRange(range, c);
    try {
      const [cur, before] = await Promise.all([
        fetchProjectRange(ctx.accounts, range.from, range.to, ctx.kind, ctx.groups),
        prev ? fetchProjectRange(ctx.accounts, prev.from, prev.to, ctx.kind, ctx.groups) : Promise.resolve(null),
      ]);
      setState({ status: 'ok', data: { platforms: cur.platforms, previous: before ? { platforms: before.platforms } : null }, errors: cur.errors, range, prev });
      // A new period is on screen: offer to add a comparison (unless switched off or already set).
      if (!c && !askOff) setModal('ask');
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
      const before = await fetchProjectRange(ctx.accounts, prev.from, prev.to, ctx.kind, ctx.groups);
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

  if (ctx.error) return <div className="proj-empty">{ctx.error}</div>;
  if (!ctx.ready) return <div className="empty-hint">Завантаження...</div>;
  if (!ctx.accounts.length) {
    return <div className="empty-hint">До проєкту не підключено рекламних кабінетів. Підключіть Meta або Google на вкладці «Огляд», і тут зʼявляться цифри.</div>;
  }

  const campaignNames = state.status === 'ok'
    ? [...new Set(Object.values(state.data.platforms).flatMap((p) => p.campaigns.map((c) => c.name)))]
    : [];
  const firstPlatform = state.status === 'ok' ? Object.values(state.data.platforms)[0] : null;

  return (
    <div className="prep-wrap">
      <section className="report-section">
        <div className="prep-controls">
          <div className="pk-field"><label>Від</label><DatePicker value={from} onChange={setFrom} /></div>
          <div className="pk-field"><label>До</label><DatePicker value={to} onChange={setTo} /></div>
          <div className="prep-presets">
            {PRESETS.map(([k, label]) => <button key={k} type="button" className="prep-chipbtn" onClick={() => pickPreset(k)} disabled={state.status === 'loading'}>{label}</button>)}
          </div>
          <button type="button" className="btn btn-p" onClick={() => run()} disabled={state.status === 'loading'}>{state.status === 'loading' ? 'Завантаження…' : 'Показати'}</button>
          <button type="button" className={'btn' + (cmp ? ' prep-btn-on' : '')} onClick={() => setModal('compare')} disabled={state.status === 'loading' || state.comparing}>
            {state.comparing ? 'Порівняння…' : cmp && state.prev ? `Порівняння: ${fmt(state.prev.from)}–${fmt(state.prev.to)}` : cmp ? 'Порівняння додано' : 'Порівняти'}
          </button>
          <button type="button" className="btn" onClick={() => setModal('groups')}>Групи кампаній</button>
          <button type="button" className="btn" onClick={() => setModal('metric')}>+ Метрика</button>
        </div>
      </section>

      {state.status === 'error' && <div className="pacc-err">{state.error}</div>}
      {state.compareError && <div className="pacc-err">{state.compareError}</div>}
      {state.status === 'ok' && Object.entries(state.errors).map(([p, msg]) => <div className="pacc-err" key={p}>{p}: {msg}</div>)}

      {state.status === 'ok' && Object.keys(state.data.platforms).length > 0 && (
        <section className="report-section">
          <ResultView
            data={state.data} kind={ctx.kind} custom={ctx.custom}
            title={ctx.project.name} subtitle={`${fmt(state.range.from)} – ${fmt(state.range.to)}`}
            fileBase={`${ctx.project.name}_${state.range.from}_${state.range.to}`}
            curLabel={`${fmt(state.range.from)}–${fmt(state.range.to)}`}
            prevLabel={state.prev ? `${fmt(state.prev.from)}–${fmt(state.prev.to)}` : ''}
          />
        </section>
      )}

      {state.status === 'idle' && <div className="empty-hint">Оберіть період і натисніть «Показати».</div>}

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

      {modal === 'groups' && (
        <CampaignGroupsModal projectId={projectId} groups={ctx.groups} campaignNames={campaignNames} onClose={() => setModal(null)} onSaved={async () => { const g = await ctx.reloadGroups(); setState((st) => (st.status === 'ok' ? { ...st, data: regroupData(st.data, g) } : st)); }} />
      )}
      {modal === 'metric' && (
        <CustomMetricModal
          projectId={projectId} custom={ctx.custom} onClose={() => setModal(null)} onChanged={ctx.reloadCustom}
          sample={firstPlatform ? { base: firstPlatform.total, currency: firstPlatform.currency, label: 'весь акаунт' } : null}
        />
      )}
    </div>
  );
}
