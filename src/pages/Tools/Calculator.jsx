import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import ActionIcon from '../../components/common/ActionIcon';
import { runScenario, computeBreakEven, fmtMoney, fmtMoney2, fmtPct, fmtPct2, fmtX, fmtInt, fmt1, fmtSigned } from '../../lib/calculatorLogic';
import '../../styles/calculatorPage.css';

// Project Calculator — funnel economics for a client/project. The math lives
// untouched in lib/calculatorLogic.js (runScenario / computeBreakEven); this
// page only collects the inputs, runs the existing model once per click and
// presents ONE snapshot of that run. Visual design: "update project
// calculator" kit (variant 2: three scenario cards on top, form + comparison
// below).

const DEFAULT_INPUTS = { budget: '5000', cpm: '12', ctr: '1.8', cpc: '1.2', convRate: '1.6', aov: '950', cogsPct: '35', fixedCosts: '300', txnFeePct: '0', fulfilCost: '0' };
const DEFAULT_ASSUMPTIONS = { optCtr: '30', optCvr: '30', optCpm: '0', negCtr: '-20', negCvr: '-20', negCpm: '0' };

function num(v, fallback = 0) {
  const n = parseFloat(v);
  return isNaN(n) ? fallback : n;
}

// The formatters in calculatorLogic.js are kept as they are; the UI just never
// prints NaN / Infinity (budget 0, zero purchases, ... are model edge cases).
const ok = (v) => typeof v === 'number' && Number.isFinite(v);
const show = (fn) => (v) => (ok(v) ? fn(v) : '—');
const money = show(fmtMoney);
const money2 = show(fmtMoney2);
const pct = show(fmtPct);
const pct2 = show(fmtPct2);
const times = show(fmtX);
const int = show(fmtInt);
const one = show(fmt1);

// Relative change of a scenario's profit vs the current one (not a probability).
function profitDelta(value, base) {
  if (!ok(value) || !ok(base) || base === 0) return null;
  return ((value - base) / Math.abs(base)) * 100;
}
function deltaText(d) {
  const r = Math.round(Math.abs(d));
  if (r === 0) return '0%';
  return (d > 0 ? '+' : '−') + r + '%';
}

const SCENARIOS = [
  { key: 'current', title: 'Поточний сценарій', mod: 'current' },
  { key: 'optimized', title: 'Оптимістичний сценарій', mod: 'optimistic' },
  { key: 'neglected', title: 'Песимістичний сценарій', mod: 'pessimistic' },
];

export default function Calculator() {
  const navigate = useNavigate();
  const [trafficSource, setTrafficSource] = useState('meta');
  const [inputs, setInputs] = useState(DEFAULT_INPUTS);
  const [assumptions, setAssumptions] = useState(DEFAULT_ASSUMPTIONS);
  const [advOpen, setAdvOpen] = useState(false);
  const [instOpen, setInstOpen] = useState(false);
  const [allMetrics, setAllMetrics] = useState(false);
  // One snapshot per calculation: the numbers, the mode and the exact form
  // state they were computed from (used to tell "actual" from "changed since").
  const [results, setResults] = useState(null);
  const [runId, setRunId] = useState(0);
  const resultsRef = useRef(null);
  const instTriggerRef = useRef(null);

  const setInput = (id, v) => setInputs((f) => ({ ...f, [id]: v }));
  const setAssumption = (id, v) => setAssumptions((f) => ({ ...f, [id]: v }));

  const dirty = useMemo(() => {
    if (!results) return false;
    const s = results.form;
    return s.trafficSource !== trafficSource
      || Object.keys(inputs).some((k) => inputs[k] !== s.inputs[k])
      || Object.keys(assumptions).some((k) => assumptions[k] !== s.assumptions[k]);
  }, [results, trafficSource, inputs, assumptions]);

  function calculate() {
    const parsed = {
      trafficSource,
      budget: num(inputs.budget),
      cpm: num(inputs.cpm, 0.0001) || 0.0001,
      ctr: num(inputs.ctr) / 100,
      cpc: num(inputs.cpc, 0.0001) || 0.0001,
      convRate: num(inputs.convRate) / 100,
      aov: num(inputs.aov),
      cogsPct: num(inputs.cogsPct) / 100,
      fixedCosts: num(inputs.fixedCosts),
      txnFeePct: num(inputs.txnFeePct) / 100,
      fulfilCost: num(inputs.fulfilCost),
    };
    const opt = { ctrChange: num(assumptions.optCtr), cvrChange: num(assumptions.optCvr), cpmChange: num(assumptions.optCpm) };
    const neg = { ctrChange: num(assumptions.negCtr), cvrChange: num(assumptions.negCvr), cpmChange: num(assumptions.negCpm) };

    const current = runScenario({ ctrChange: 0, cvrChange: 0, cpmChange: 0 }, parsed);
    const optimized = runScenario(opt, parsed);
    const neglected = runScenario(neg, parsed);
    const profitGap = optimized.contributionProfit - neglected.contributionProfit;
    const breakEven = computeBreakEven(parsed, current.revenue);

    setResults({
      inputs: parsed, opt, neg, current, optimized, neglected, profitGap, breakEven,
      form: { trafficSource, inputs: { ...inputs }, assumptions: { ...assumptions } },
    });
    setRunId((n) => n + 1);

    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' }), 0);
  }

  return (
    <div className="pcalc-page">
      <div className="pcalc-toolbar">
        <button type="button" className="pcalc-button" onClick={() => navigate(-1)}>
          <ActionIcon name="back" size={18} />Назад
        </button>
        <button type="button" className="pcalc-button" ref={instTriggerRef} onClick={() => setInstOpen(true)}>
          <ActionIcon name="info" size={18} />Інструкція
        </button>
      </div>

      <div className="pcalc-status" role="status" aria-live="polite">
        {dirty && <span className="pcalc-dirty">Параметри змінено — перерахуйте</span>}
      </div>

      <section className="pcalc-scenarios" aria-label="Сценарії" ref={resultsRef}>
        {SCENARIOS.map((s) => (
          <ScenarioCard key={s.key} def={s} results={results} runId={runId} dirty={dirty} />
        ))}
      </section>

      <div className="pcalc-workbench">
        <section className="pcalc-panel" aria-labelledby="pcalc-params-h">
          <h2 className="pcalc-h" id="pcalc-params-h">Параметри розрахунку</h2>

          <div className="pcalc-group">
            <div className="pcalc-caption" id="pcalc-src-cap">Джерело трафіку</div>
            <div className="pcalc-segmented" role="group" aria-labelledby="pcalc-src-cap">
              <button type="button" className="pcalc-segment" aria-pressed={trafficSource === 'meta'} onClick={() => setTrafficSource('meta')}>Meta / Display</button>
              <button type="button" className="pcalc-segment" aria-pressed={trafficSource === 'google'} onClick={() => setTrafficSource('google')}>Google Search</button>
            </div>
            <p className="pcalc-hint">
              {trafficSource === 'meta'
                ? 'Meta/Display — оплата за покази: впишіть CPM і CTR, кліки порахуються автоматично.'
                : 'Google Search — оплата за клік: впишіть реальний CPC, CPM/CTR не потрібні.'}
            </p>
          </div>

          <div className="pcalc-group">
            <div className="pcalc-caption">Трафік</div>
            <div className={'pcalc-fields' + (trafficSource === 'meta' ? ' pcalc-fields--traffic' : '')}>
              {trafficSource === 'meta' && (
                <>
                  <Field id="cpm" label="CPM ($)" tag="лише Meta/Display" step="0.01" value={inputs.cpm} onChange={setInput} floor="0.0001" />
                  <Field id="ctr" label="CTR (%)" tag="лише Meta/Display" step="0.01" value={inputs.ctr} onChange={setInput} />
                </>
              )}
              {trafficSource === 'google' && (
                <Field id="cpc" label="CPC ($)" tag="лише Google Search" step="0.01" value={inputs.cpc} onChange={setInput} floor="0.0001" />
              )}
              <Field id="budget" label="Місячний рекламний бюджет ($)" step="1" value={inputs.budget} onChange={setInput} />
            </div>
          </div>

          <div className="pcalc-group">
            <div className="pcalc-caption">Конверсія</div>
            <div className="pcalc-fields">
              <Field id="convRate" label="Конверсія сайту (%)" step="0.01" value={inputs.convRate} onChange={setInput} />
              <Field id="aov" label="Середній чек / AOV ($)" step="1" value={inputs.aov} onChange={setInput} />
            </div>
          </div>

          <div className="pcalc-group">
            <div className="pcalc-caption">Витрати</div>
            <div className="pcalc-fields">
              <Field id="cogsPct" label="Собівартість (% від доходу)" step="0.1" value={inputs.cogsPct} onChange={setInput} />
              <Field id="fixedCosts" label="Фіксовані місячні витрати ($/міс)" step="1" value={inputs.fixedCosts} onChange={setInput} />
              <Field id="txnFeePct" label="Комісія платіжної системи (% від доходу)" step="0.1" value={inputs.txnFeePct} onChange={setInput} />
              <Field id="fulfilCost" label="Вартість виконання замовлення ($)" step="0.1" value={inputs.fulfilCost} onChange={setInput} />
            </div>
          </div>

          <div className={'pcalc-accordion' + (advOpen ? ' is-open' : '')}>
            <button type="button" className="pcalc-accordion-head" aria-expanded={advOpen} aria-controls="pcalc-adv-body" onClick={() => setAdvOpen((o) => !o)}>
              <span className="pcalc-accordion-text">
                <span className="pcalc-accordion-title">Припущення сценаріїв</span>
                <span className="pcalc-accordion-sum">
                  Оптимістичний: CTR {fmtSigned(num(assumptions.optCtr))}, CVR {fmtSigned(num(assumptions.optCvr))}, CPM {fmtSigned(num(assumptions.optCpm))}
                  <span aria-hidden="true"> | </span>
                  Песимістичний: CTR {fmtSigned(num(assumptions.negCtr))}, CVR {fmtSigned(num(assumptions.negCvr))}, CPM {fmtSigned(num(assumptions.negCpm))}
                </span>
              </span>
              <ActionIcon name="chevron" size={20} className="pcalc-chevron" />
            </button>
            <div className="pcalc-accordion-body" id="pcalc-adv-body" hidden={!advOpen}>
              <p className="pcalc-hint">CTR, CPM і конверсія моделюються незалежно одне від одного для аналізу сценаріїв. У реальних кампаніях зміна одного показника може впливати на інші.</p>
              <div className="pcalc-adv-cols">
                <fieldset className="pcalc-adv-col">
                  <legend>Оптимістичний сценарій</legend>
                  <Field id="optCtr" label="Зміна CTR (%)" tag="лише Meta/Display" step="1" value={assumptions.optCtr} onChange={setAssumption} plain />
                  <Field id="optCvr" label="Зміна конверсії (%)" step="1" value={assumptions.optCvr} onChange={setAssumption} plain />
                  <Field id="optCpm" label="Зміна CPM (%)" tag="лише Meta/Display" step="1" value={assumptions.optCpm} onChange={setAssumption} plain />
                </fieldset>
                <fieldset className="pcalc-adv-col">
                  <legend>Песимістичний сценарій</legend>
                  <Field id="negCtr" label="Зміна CTR (%)" tag="лише Meta/Display" step="1" value={assumptions.negCtr} onChange={setAssumption} plain />
                  <Field id="negCvr" label="Зміна конверсії (%)" step="1" value={assumptions.negCvr} onChange={setAssumption} plain />
                  <Field id="negCpm" label="Зміна CPM (%)" tag="лише Meta/Display" step="1" value={assumptions.negCpm} onChange={setAssumption} plain />
                </fieldset>
              </div>
            </div>
          </div>

          <button type="button" className="pcalc-button pcalc-button--primary" onClick={calculate}>Розрахувати воронку</button>
        </section>

        <div className="pcalc-right">
          <section className="pcalc-panel" aria-labelledby="pcalc-cmp-h">
            <div className="pcalc-panel-head">
              <h2 className="pcalc-h" id="pcalc-cmp-h">Порівняння сценаріїв</h2>
              {results && (
                <button type="button" className="pcalc-link" aria-expanded={allMetrics} onClick={() => setAllMetrics((v) => !v)}>
                  Усі показники
                  <ActionIcon name="chevron" size={18} className={'pcalc-chevron' + (allMetrics ? ' is-open' : '')} />
                </button>
              )}
            </div>

            {results ? (
              <ComparisonTable results={results} allMetrics={allMetrics} dirty={dirty} runId={runId} />
            ) : (
              <p className="pcalc-empty">Внесіть параметри та розрахуйте воронку — тут з’явиться порівняння сценаріїв і точка беззбитковості.</p>
            )}
          </section>

          <BreakEven results={results} dirty={dirty} runId={runId} />
        </div>
      </div>

      <div className="pcalc-foot">Project Calculator · Monarchi CRM · внутрішній інструмент, розрахунки не зберігаються й не надсилаються нікуди за межі цієї сторінки.</div>

      {instOpen && <InstructionsModal onClose={() => { setInstOpen(false); instTriggerRef.current?.focus(); }} />}
    </div>
  );
}

function Field({ id, label, tag, step, value, onChange, floor, plain }) {
  const uid = useId();
  const hintId = `${uid}-hint`;
  const empty = String(value).trim() === '';
  return (
    <div className={'pcalc-field' + (plain ? ' pcalc-field--plain' : '')}>
      <label htmlFor={`pcalc-${id}`}>
        {label}{tag && <span className="pcalc-tag">{tag}</span>}
      </label>
      <input
        id={`pcalc-${id}`} type="number" inputMode="decimal" step={step} value={value}
        aria-invalid={empty || undefined} aria-describedby={empty ? hintId : undefined}
        onChange={(e) => onChange(id, e.target.value)}
      />
      {empty && <p className="pcalc-error" id={hintId}>Порожнє поле — у розрахунку буде {floor || '0'}.</p>}
    </div>
  );
}

function ScenarioCard({ def, results, runId, dirty }) {
  const r = results ? results[def.key] : null;
  const base = results ? results.current.contributionProfit : null;
  const delta = r && def.key !== 'current' ? profitDelta(r.contributionProfit, base) : null;
  return (
    <article className={`pcalc-scenario pcalc-scenario--${def.mod}` + (r ? ' is-ready' : '') + (dirty && r ? ' is-stale' : '')} aria-labelledby={`pcalc-sc-${def.key}`}>
      <div className="pcalc-scenario-head">
        <h3 className="pcalc-scenario-title" id={`pcalc-sc-${def.key}`}>{def.title}</h3>
        {def.key === 'current' && <span className="pcalc-pill">Поточний</span>}
        {delta !== null && (
          <span className={'pcalc-delta' + (delta > 0 ? ' is-up' : delta < 0 ? ' is-down' : '')} title="Зміна прибутку воронки відносно поточного сценарію">
            <span className="pcalc-sr">Зміна прибутку відносно поточного: </span>{deltaText(delta)}
          </span>
        )}
      </div>
      <div className="pcalc-secondary">Прибуток воронки</div>
      <div className="pcalc-value" key={runId}>{r ? money(r.contributionProfit) : '—'}</div>
      <dl className="pcalc-stats">
        <div><dt>ROAS</dt><dd>{r ? times(r.roas) : '—'}</dd></div>
        <div><dt>Покупки (оцінка)</dt><dd>{r ? one(r.estPurchases) : '—'}</dd></div>
        <div><dt>Дохід</dt><dd>{r ? money(r.revenue) : '—'}</dd></div>
      </dl>
      {!r && <p className="pcalc-card-note">Внесіть параметри та розрахуйте воронку</p>}
    </article>
  );
}

function ComparisonTable({ results, allMetrics, dirty, runId }) {
  const { current, optimized, neglected, opt, neg, profitGap, inputs } = results;
  const meta = inputs.trafficSource === 'meta';
  const S = [current, optimized, neglected];

  const rel = (label, fmt, key, relKey) => ({
    label,
    cells: S.map((s, i) => (i === 0
      ? fmt(s[key])
      : <>{fmt(current[key])} &rarr; {fmt(s[key])}<small className="pcalc-rel">{fmtSigned(i === 1 ? opt[relKey] : neg[relKey])} відносно</small></>)),
  });
  const plain = (label, fmt, pick) => ({ label, cells: S.map((s) => fmt(pick(s))) });

  const key = {
    revenue: plain('Дохід', money, (s) => s.revenue),
    purchases: plain('Покупки (оцінка)', one, (s) => s.estPurchases),
    cpa: plain('CPA', money2, (s) => s.cpa),
    roas: plain('ROAS', times, (s) => s.roas),
  };
  const budget = plain('Рекламний бюджет', money, () => inputs.budget);
  const impressions = meta ? plain('Покази (оцінка)', int, (s) => s.impressions) : null;
  const ctr = meta ? rel('CTR (ефективний)', pct2, 'ctrEff', 'ctrChange') : null;
  const clicks = plain('Кліки (оцінка)', int, (s) => s.clicks);
  const cpc = plain('CPC (ефективний)', money2, (s) => s.cpcEff);
  const cvr = rel('Конверсія (ефективна)', pct2, 'crEff', 'cvrChange');
  const cogs = plain('Собівартість (COGS)', money, (s) => s.cogs);
  const other = plain('Інші витрати (фіксовані + змінні)', money, (s) => s.otherCosts);
  const total = plain('Усього змодельованих витрат', money, (s) => s.totalCosts);
  const profit = { ...plain('Прибуток воронки (Contribution Profit)', money, (s) => s.contributionProfit), strong: true };
  const roi = { ...plain('Contribution ROI', pct, (s) => s.contributionROI), strong: true, note: true };

  const rows = allMetrics
    ? [budget, impressions, ctr, clicks, cpc, cvr, key.purchases, key.cpa, key.revenue, key.roas, cogs, other, total, profit, roi].filter(Boolean)
    : [key.revenue, key.purchases, key.cpa, key.roas, profit];

  return (
    <div className="pcalc-result" key={runId}>
      <p className="pcalc-mode-note">Розрахунок: {meta ? 'Meta / Display' : 'Google Search'}{dirty ? ' · параметри змінено — перерахуйте, щоб оновити цифри' : ''}</p>
      <div className="pcalc-table-wrap" tabIndex={0} role="region" aria-label="Таблиця порівняння сценаріїв, прокручується горизонтально">
        <table className="pcalc-table">
          <thead>
            <tr>
              <th scope="col">Показник</th>
              <th scope="col" className="pcalc-col pcalc-col--current">Поточний</th>
              <th scope="col" className="pcalc-col pcalc-col--optimistic">Оптимістичний<span className="pcalc-hdr-sub">CTR {fmtSigned(opt.ctrChange)} | CVR {fmtSigned(opt.cvrChange)}</span></th>
              <th scope="col" className="pcalc-col pcalc-col--pessimistic">Песимістичний<span className="pcalc-hdr-sub">CTR {fmtSigned(neg.ctrChange)} | CVR {fmtSigned(neg.cvrChange)}</span></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.label} className={r.strong ? 'is-strong' : undefined}>
                <th scope="row">{r.label}</th>
                <td className="pcalc-col pcalc-col--current">{r.cells[0]}</td>
                <td className="pcalc-col pcalc-col--optimistic">{r.cells[1]}</td>
                <td className="pcalc-col pcalc-col--pessimistic">{r.cells[2]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {allMetrics && (
        <p className="pcalc-note">Contribution ROI порівнює орієнтовний прибуток воронки з усіма витратами, включеними в модель. Contribution Profit — це не чистий прибуток компанії.</p>
      )}
      <div className="pcalc-diff">
        <span className="pcalc-diff-label">Різниця прибутку: оптимістичний і песимістичний</span>
        <span className="pcalc-diff-value">{money(profitGap)}</span>
      </div>
    </div>
  );
}

function BreakEven({ results, dirty, runId }) {
  const be = results?.breakEven;
  const gapKnown = be && ok(be.beGap);
  const gapText = !gapKnown ? '—'
    : be.beGap >= 0 ? `Вище точки беззбитковості на ${money(be.beGap)}`
      : `До беззбитковості бракує ${money(Math.abs(be.beGap))}`;
  return (
    <section className="pcalc-break-even" aria-labelledby="pcalc-be-h" key={runId}>
      <h2 className="pcalc-h" id="pcalc-be-h">Точка беззбитковості</h2>
      <dl className="pcalc-be-stats">
        <div><dt>Необхідний дохід</dt><dd>{be ? money(be.beRevenue) : '—'}</dd></div>
        <div><dt>Мінімальний ROAS</dt><dd>{be ? times(be.beROAS) : '—'}</dd></div>
        <div><dt>Покупки (оцінка)</dt><dd>{be ? one(be.bePurchases) : '—'}</dd></div>
      </dl>
      <p className={'pcalc-be-gap' + (gapKnown ? (be.beGap >= 0 ? ' is-up' : ' is-down') : '')}>
        <span className="pcalc-be-gap-label">Розрив до точки (поточний сценарій)</span> {gapText}
      </p>
      <p className="pcalc-note">
        <ActionIcon name="info" size={18} />
        <span>Сценарії ілюстративні; результат не гарантований.{dirty ? ' Показано цифри попереднього розрахунку.' : ''}</span>
      </p>
    </section>
  );
}

function InstructionsModal({ onClose }) {
  const dialogRef = useRef(null);
  const closeRef = useRef(null);
  const titleId = useId();

  useEffect(() => {
    closeRef.current?.focus();
    const dialog = dialogRef.current;
    function onKey(e) {
      if (e.key === 'Escape') { e.stopPropagation(); onClose(); return; }
      if (e.key !== 'Tab' || !dialog) return;
      const focusable = dialog.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
      if (!focusable.length) return;
      const first = focusable[0], last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  return (
    <div className="pcalc-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="pcalc-modal" role="dialog" aria-modal="true" aria-labelledby={titleId} ref={dialogRef}>
        <div className="pcalc-modal-head">
          <h3 id={titleId}>Як працює цей калькулятор</h3>
          <button type="button" className="pcalc-modal-close" onClick={onClose} aria-label="Закрити" ref={closeRef}>
            <ActionIcon name="close" size={20} />
          </button>
        </div>
        <div className="pcalc-modal-body">
          <h4>Що робить цей інструмент</h4>
          <p>Калькулятор перетворює реальні цифри рекламного кабінету на чітку картину економіки воронки — і показує, що станеться з прибутком, якщо покращити ключові кроки воронки, або залишити їх без змін. Без теорії. Лише цифри, три сценарії, одна сторінка.</p>

          <h4>Як користуватись</h4>
          <ol>
            <li>Оберіть <b>джерело трафіку</b>: Google Search (оплата за клік, без реального CPM) або Meta / Display (оплата за покази, CTR визначає кліки). Калькулятор автоматично перемикає логіку залежно від вибору.</li>
            <li>Внесіть поточні реальні цифри з рекламного кабінету та магазину — для Google Search це CPC; для Meta/Display — CPM і CTR. Далі: місячний рекламний бюджет, конверсію сайту, середній чек (AOV), собівартість, фіксовані місячні витрати, комісію платіжної системи та вартість виконання замовлення.</li>
            <li>За бажанням відкрийте <b>Припущення сценаріїв</b>, щоб змінити припущення оптимістичного та песимістичного сценаріїв. За замовчуванням вже стоять розумні значення.</li>
            <li>Натисніть <b>Розрахувати воронку</b>. Все інше — кліки, ефективний CPC, орієнтовна кількість покупок, CPA, дохід, витрати, прибуток і ROAS — порахується автоматично.</li>
            <li>Картка <b>Оптимістичний сценарій</b> показує потенціал за умови досягнення припущень вище. Картка <b>Песимістичний сценарій</b> показує, що станеться, якщо ці ж показники просядуть на вказану величину.</li>
            <li>Порівняйте три значення прибутку та ROI поруч, відкрийте <b>Усі показники</b> для повної таблиці й перевірте <b>точку беззбитковості</b>, щоб побачити, наскільки поточні цифри далекі від неї.</li>
            <li>Якщо після розрахунку змінити параметри, цифри не перераховуються самі: з’явиться позначка «Параметри змінено — перерахуйте», а картки й таблиця показують попередній розрахунок.</li>
          </ol>

          <h4>Що означає кожен показник</h4>
          <ul>
            <li><b>Джерело трафіку</b> — Google Search (ставка за клік, без реального CPM) або Meta/Display (ставка за покази, CTR визначає кліки) — це перемикає формули на сторінці.</li>
            <li><b>CPM</b> — вартість 1000 показів — використовується лише для Meta/Display.</li>
            <li><b>CTR</b> — клікабельність — частка людей, які побачили рекламу і клікнули по ній. Лише для Meta/Display.</li>
            <li><b>CPC</b> — вартість кліку. Для Google Search це ваше введене значення (ставка за клік). Для Meta/Display рахується як бюджет поділений на кліки.</li>
            <li><b>Конверсія</b> — частка відвідувачів сайту, які завершили покупку.</li>
            <li><b>AOV</b> — середній чек — середній дохід за покупку.</li>
            <li><b>Орієнтовна кількість покупок</b> — кліки × конверсія, без округлення, щоб усі подальші розрахунки залишались точними.</li>
            <li><b>CPA</b> — вартість залучення — бюджет поділений на орієнтовну кількість покупок.</li>
            <li><b>ROAS</b> — повернення на рекламні витрати — дохід поділений на бюджет.</li>
            <li><b>Прибуток воронки (Contribution Profit)</b> — дохід мінус рекламні витрати, собівартість і всі змодельовані витрати (фіксовані + змінні). Відображає прибутковість саме воронки, а не весь чистий прибуток компанії.</li>
            <li><b>ROI (Contribution ROI)</b> — прибуток поділений на всі змодельовані витрати.</li>
            <li><b>Відсоток біля сценарію</b> — зміна прибутку воронки відносно поточного сценарію. Це не ймовірність і не впевненість прогнозу.</li>
            <li><b>Точка беззбитковості (дохід/ROAS/покупки)</b> — дохід, ROAS і кількість покупок, потрібні лише щоб покрити рекламні витрати й фіксовані витрати, з урахуванням собівартості та комісії.</li>
          </ul>

          <h4>Примітка щодо цифр</h4>
          <p>CTR, CPM і конверсія моделюються незалежно одне від одного для аналізу сценаріїв — у реальних кампаніях зміна одного показника може впливати на інші. Ця модель використовує спрощені, лінійні припущення, щоб показати механіку. Це орієнтовна діагностика, а не медіаплан — реальні кампанії залежать від сезонності, вигорання аудиторії та втоми від креативів, чого статична модель не враховує. Сприймайте різницю між сценаріями як сигнал, куди дивитись, а не гарантований прогноз.</p>
        </div>
      </div>
    </div>
  );
}
