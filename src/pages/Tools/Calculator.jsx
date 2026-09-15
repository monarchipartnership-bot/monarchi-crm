import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { runScenario, computeBreakEven, fmtMoney, fmtMoney2, fmtPct, fmtPct2, fmtX, fmtInt, fmt1, fmtSigned } from '../../lib/calculatorLogic';
import '../../styles/reportPage.css';
import '../../styles/projectsPage.css';
import '../../styles/calculatorPage.css';

const DEFAULT_INPUTS = { budget: '5000', cpm: '12', ctr: '1.8', cpc: '1.2', convRate: '1.6', aov: '950', cogsPct: '35', fixedCosts: '300', txnFeePct: '0', fulfilCost: '0' };
const DEFAULT_ASSUMPTIONS = { optCtr: '30', optCvr: '30', optCpm: '0', negCtr: '-20', negCvr: '-20', negCpm: '0' };

function num(v, fallback = 0) {
  const n = parseFloat(v);
  return isNaN(n) ? fallback : n;
}

export default function Calculator() {
  const navigate = useNavigate();
  const [trafficSource, setTrafficSource] = useState('meta');
  const [inputs, setInputs] = useState(DEFAULT_INPUTS);
  const [assumptions, setAssumptions] = useState(DEFAULT_ASSUMPTIONS);
  const [advOpen, setAdvOpen] = useState(false);
  const [instOpen, setInstOpen] = useState(false);
  const [results, setResults] = useState(null);

  const setInput = (id, v) => setInputs((f) => ({ ...f, [id]: v }));
  const setAssumption = (id, v) => setAssumptions((f) => ({ ...f, [id]: v }));

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

    setResults({ inputs: parsed, opt, neg, current, optimized, neglected, profitGap, breakEven });

    setTimeout(() => document.getElementById('resultsCard')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0);
  }

  return (
    <div className="report-page calc-page">
      <div className="page-actions">
        <button type="button" className="btn" onClick={() => navigate(-1)}>&#8592; Back</button>
      </div>

      <section className="hero">
        <h1>Project <span>Calculator</span></h1>
        <p>Швидко прорахуйте економіку воронки клієнта чи проєкту — введіть реальні цифри рекламного кабінету й магазину і одразу побачите поточний, оптимістичний та песимістичний сценарії поруч.</p>
      </section>

      <div className="card">
        <div className="card-head-row">
          <h2>Поточні показники</h2>
          <button type="button" className="inst-btn" onClick={() => setInstOpen(true)}>&#128214; Інструкція</button>
        </div>
        <div className="card-sub">Внесіть реальні цифри рекламного кабінету та магазину — все інше порахується автоматично.</div>

        <div className="switch">
          <button type="button" className={trafficSource === 'meta' ? 'on' : ''} onClick={() => setTrafficSource('meta')}>Meta / Display</button>
          <button type="button" className={trafficSource === 'google' ? 'on' : ''} onClick={() => setTrafficSource('google')}>Google Search</button>
        </div>

        <div className="hint-box">
          {trafficSource === 'meta'
            ? 'Meta/Display — оплата за покази: впишіть CPM і CTR, кліки порахуються автоматично.'
            : 'Google Search — оплата за клік: впишіть реальний CPC, CPM/CTR не потрібні.'}
        </div>

        <div className="grid2">
          {trafficSource === 'meta' && (
            <>
              <div className="field"><label>CPM ($) <span className="opt">лише Meta/Display</span></label><input type="number" value={inputs.cpm} step="0.01" onChange={(e) => setInput('cpm', e.target.value)} /></div>
              <div className="field"><label>CTR (%) <span className="opt">лише Meta/Display</span></label><input type="number" value={inputs.ctr} step="0.01" onChange={(e) => setInput('ctr', e.target.value)} /></div>
            </>
          )}
          {trafficSource === 'google' && (
            <div className="field"><label>CPC ($) <span className="opt">лише Google Search</span></label><input type="number" value={inputs.cpc} step="0.01" onChange={(e) => setInput('cpc', e.target.value)} /></div>
          )}
          <div className="field"><label>Місячний рекламний бюджет ($)</label><input type="number" value={inputs.budget} step="1" onChange={(e) => setInput('budget', e.target.value)} /></div>
        </div>

        <div className="grid2">
          <div className="field"><label>Конверсія сайту (%)</label><input type="number" value={inputs.convRate} step="0.01" onChange={(e) => setInput('convRate', e.target.value)} /></div>
          <div className="field"><label>Середній чек / AOV ($)</label><input type="number" value={inputs.aov} step="1" onChange={(e) => setInput('aov', e.target.value)} /></div>
        </div>

        <div className="grid2">
          <div className="field"><label>Собівартість (% від доходу)</label><input type="number" value={inputs.cogsPct} step="0.1" onChange={(e) => setInput('cogsPct', e.target.value)} /></div>
          <div className="field"><label>Фіксовані місячні витрати ($/міс)</label><input type="number" value={inputs.fixedCosts} step="1" onChange={(e) => setInput('fixedCosts', e.target.value)} /></div>
        </div>

        <div className="grid2">
          <div className="field"><label>Комісія платіжної системи (% від доходу)</label><input type="number" value={inputs.txnFeePct} step="0.1" onChange={(e) => setInput('txnFeePct', e.target.value)} /></div>
          <div className="field"><label>Вартість виконання замовлення ($)</label><input type="number" value={inputs.fulfilCost} step="0.1" onChange={(e) => setInput('fulfilCost', e.target.value)} /></div>
        </div>

        <button type="button" className={'adv-toggle' + (advOpen ? ' open' : '')} onClick={() => setAdvOpen((o) => !o)}>
          <span>&#9881; Розширені налаштування — припущення сценаріїв</span><span className="car">&#9662;</span>
        </button>
        {advOpen && (
          <div className="adv-panel">
            <div className="hint-box" style={{ marginBottom: 0 }}>CTR, CPM і конверсія моделюються незалежно одне від одного для аналізу сценаріїв. У реальних кампаніях зміна одного показника може впливати на інші.</div>
            <div className="adv-cols">
              <div>
                <div className="adv-col-title opt">Оптимістичний сценарій</div>
                <div className="field"><label>Зміна CTR (%)</label><input type="number" value={assumptions.optCtr} step="1" onChange={(e) => setAssumption('optCtr', e.target.value)} /></div>
                <div className="field"><label>Зміна конверсії (%)</label><input type="number" value={assumptions.optCvr} step="1" onChange={(e) => setAssumption('optCvr', e.target.value)} /></div>
                <div className="field"><label>Зміна CPM (%) <span className="opt">лише Meta/Display</span></label><input type="number" value={assumptions.optCpm} step="1" onChange={(e) => setAssumption('optCpm', e.target.value)} /></div>
              </div>
              <div>
                <div className="adv-col-title neg">Песимістичний сценарій</div>
                <div className="field"><label>Зміна CTR (%)</label><input type="number" value={assumptions.negCtr} step="1" onChange={(e) => setAssumption('negCtr', e.target.value)} /></div>
                <div className="field"><label>Зміна конверсії (%)</label><input type="number" value={assumptions.negCvr} step="1" onChange={(e) => setAssumption('negCvr', e.target.value)} /></div>
                <div className="field"><label>Зміна CPM (%) <span className="opt">лише Meta/Display</span></label><input type="number" value={assumptions.negCpm} step="1" onChange={(e) => setAssumption('negCpm', e.target.value)} /></div>
              </div>
            </div>
          </div>
        )}

        <button type="button" className="calc-btn" onClick={calculate}>Розрахувати воронку</button>
      </div>

      {results && <ResultsCard results={results} trafficSource={trafficSource} />}

      <div className="foot-note">Project Calculator · Monarchi CRM · внутрішній інструмент, розрахунки не зберігаються й не надсилаються нікуди за межі цієї сторінки.</div>

      {instOpen && <InstructionsModal onClose={() => setInstOpen(false)} />}
    </div>
  );
}

function ResultsCard({ results, trafficSource }) {
  const { current, optimized, neglected, opt, neg, profitGap, breakEven } = results;

  const rows = [];
  if (trafficSource === 'meta') {
    rows.push(['Impressions', fmtInt(current.impressions), fmtInt(optimized.impressions), fmtInt(neglected.impressions)]);
    rows.push([
      'CTR (effective)',
      fmtPct2(current.ctrEff),
      <>{fmtPct2(current.ctrEff)} &rarr; {fmtPct2(optimized.ctrEff)}<small className="rel-change">{fmtSigned(opt.ctrChange)} relative</small></>,
      <>{fmtPct2(current.ctrEff)} &rarr; {fmtPct2(neglected.ctrEff)}<small className="rel-change">{fmtSigned(neg.ctrChange)} relative</small></>,
    ]);
  }
  rows.push(['Clicks', fmtInt(current.clicks), fmtInt(optimized.clicks), fmtInt(neglected.clicks)]);
  rows.push(['Cost per Click (effective)', fmtMoney2(current.cpcEff), fmtMoney2(optimized.cpcEff), fmtMoney2(neglected.cpcEff)]);
  rows.push([
    'Conversion Rate (effective)',
    fmtPct2(current.crEff),
    <>{fmtPct2(current.crEff)} &rarr; {fmtPct2(optimized.crEff)}<small className="rel-change">{fmtSigned(opt.cvrChange)} relative</small></>,
    <>{fmtPct2(current.crEff)} &rarr; {fmtPct2(neglected.crEff)}<small className="rel-change">{fmtSigned(neg.cvrChange)} relative</small></>,
  ]);
  rows.push(['Estimated Purchases', fmt1(current.estPurchases), fmt1(optimized.estPurchases), fmt1(neglected.estPurchases)]);
  rows.push(['Cost per Acquisition (CPA)', fmtMoney2(current.cpa), fmtMoney2(optimized.cpa), fmtMoney2(neglected.cpa)]);
  rows.push(['Revenue', fmtMoney(current.revenue), fmtMoney(optimized.revenue), fmtMoney(neglected.revenue)]);
  rows.push(['ROAS', fmtX(current.roas), fmtX(optimized.roas), fmtX(neglected.roas)]);
  rows.push(['Cost of Goods Sold', fmtMoney(current.cogs), fmtMoney(optimized.cogs), fmtMoney(neglected.cogs)]);
  rows.push(['Other Costs (Fixed + Variable)', fmtMoney(current.otherCosts), fmtMoney(optimized.otherCosts), fmtMoney(neglected.otherCosts)]);
  rows.push(['Total Modelled Costs', fmtMoney(current.totalCosts), fmtMoney(optimized.totalCosts), fmtMoney(neglected.totalCosts)]);

  const beGapClass = breakEven.beGap >= 0 ? 'positive' : 'negative';
  const beGapLabel = breakEven.beGap >= 0
    ? 'Above break-even by ' + fmtMoney(breakEven.beGap)
    : fmtMoney(Math.abs(breakEven.beGap)) + ' short of break-even';

  return (
    <div className="card show" id="resultsCard">
      <h2>Три сценарії на одній сторінці</h2>
      <div className="card-sub">Порівняйте, як зміни CTR, конверсії та CPM впливають на дохід, вартість залучення й прибутковість. Оптимістичний і песимістичний сценарії використовують редаговані припущення.</div>

      <div className="summary-row">
        <div className="summary-card">
          <div className="sc-label">Current</div>
          <div className="sc-value">{fmt1(current.estPurchases)} estimated purchases | {fmtX(current.roas)} ROAS | {fmtMoney(current.contributionProfit)} contribution profit</div>
        </div>
        <div className="summary-card opt">
          <div className="sc-label">Optimized</div>
          <div className="sc-value">{fmt1(optimized.estPurchases)} estimated purchases | {fmtX(optimized.roas)} ROAS | {fmtMoney(optimized.contributionProfit)} contribution profit</div>
        </div>
        <div className="summary-card neg">
          <div className="sc-label">Neglected</div>
          <div className="sc-value">{fmt1(neglected.estPurchases)} estimated purchases | {fmtX(neglected.roas)} ROAS | {fmtMoney(neglected.contributionProfit)} contribution profit</div>
        </div>
      </div>

      <div className="res-table-wrap">
        <table className="res-table">
          <thead>
            <tr>
              <th>Metric</th>
              <th>Current</th>
              <th className="col-opt">Optimized Scenario<span className="hdr-sub">CTR {fmtSigned(opt.ctrChange)} | CVR {fmtSigned(opt.cvrChange)}</span></th>
              <th className="col-neg">Neglected Scenario<span className="hdr-sub">CTR {fmtSigned(neg.ctrChange)} | CVR {fmtSigned(neg.cvrChange)}</span></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}><td>{r[0]}</td><td>{r[1]}</td><td className="col-opt">{r[2]}</td><td className="col-neg">{r[3]}</td></tr>
            ))}
            <tr className="hl">
              <td>Contribution Profit</td><td>{fmtMoney(current.contributionProfit)}</td>
              <td className="col-opt">{fmtMoney(optimized.contributionProfit)}</td><td className="col-neg">{fmtMoney(neglected.contributionProfit)}</td>
            </tr>
            <tr className="hl">
              <td>Contribution ROI <span className="info-ic" title="Contribution ROI compares estimated contribution profit with all costs included in this model.">&#9432;</span></td>
              <td>{fmtPct(current.contributionROI)}</td>
              <td className="col-opt">{fmtPct(optimized.contributionROI)}</td><td className="col-neg">{fmtPct(neglected.contributionROI)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="disclaimer-box">Припущення сценаріїв ілюстративні й покликані показати потенційний фінансовий вплив змін у рекламі та конверсії. Це не гарантований результат.</div>

      <div className="gap-card">
        <div className="gap-label">Різниця прибутку: Оптимістичний vs Песимістичний</div>
        <div className="gap-value">{fmtMoney(profitGap)}</div>
        <div className="gap-sub">Це реальна ціна активного управління воронкою — або ціна того, що її залишили без уваги. Модель використовує спрощені, лінійні припущення, щоб показати механіку; сприймайте це як орієнтир, а не гарантований прогноз.</div>
      </div>

      <div className="break-even">
        <h3>Break-even Analysis</h3>
        <div className="be-grid">
          <div className="be-stat"><div className="be-label">Break-even Revenue</div><div className="be-value">{fmtMoney(breakEven.beRevenue)}</div></div>
          <div className="be-stat"><div className="be-label">Break-even ROAS</div><div className="be-value">{fmtX(breakEven.beROAS)}</div></div>
          <div className="be-stat"><div className="be-label">Break-even Purchases</div><div className="be-value">{fmt1(breakEven.bePurchases)}</div></div>
          <div className="be-stat gap"><div className="be-label">Gap to Break-even (Current)</div><div className={'be-value ' + beGapClass}>{beGapLabel}</div></div>
        </div>
      </div>
    </div>
  );
}

function InstructionsModal({ onClose }) {
  return (
    <div className="modal-overlay show" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-box">
        <div className="modal-head">
          <h3>Як працює цей калькулятор</h3>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close">&times;</button>
        </div>
        <div className="modal-body">
          <h4>Що робить цей інструмент</h4>
          <p>Калькулятор перетворює реальні цифри рекламного кабінету на чітку картину економіки воронки — і показує, що станеться з прибутком, якщо покращити ключові кроки воронки, або залишити їх без змін. Без теорії. Лише цифри, три сценарії, одна сторінка.</p>

          <h4>Як користуватись</h4>
          <ol>
            <li>Оберіть <b>джерело трафіку</b>: Google Search (оплата за клік, без реального CPM) або Meta / Display (оплата за покази, CTR визначає кліки). Калькулятор автоматично перемикає логіку залежно від вибору.</li>
            <li>Внесіть поточні реальні цифри з рекламного кабінету та магазину — для Google Search це CPC; для Meta/Display — CPM і CTR. Далі: місячний рекламний бюджет, конверсію сайту, середній чек (AOV), собівартість, фіксовані місячні витрати, комісію платіжної системи та вартість виконання замовлення.</li>
            <li>За бажанням відкрийте <b>Розширені налаштування</b>, щоб змінити припущення оптимістичного та песимістичного сценаріїв. За замовчуванням вже стоять розумні значення.</li>
            <li>Натисніть <b>Розрахувати воронку</b>. Все інше — кліки, ефективний CPC, орієнтовна кількість покупок, CPA, дохід, витрати, прибуток і ROAS — порахується автоматично.</li>
            <li>Колонка <b>Оптимістичний сценарій</b> показує потенціал за умови досягнення припущень вище. Колонка <b>Песимістичний сценарій</b> показує, що станеться, якщо ці ж показники просядуть на вказану величину.</li>
            <li>Порівняйте три значення прибутку та ROI поруч, і перевірте <b>аналіз точки беззбитковості</b> під таблицею, щоб побачити, наскільки поточні цифри далекі від неї.</li>
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
            <li><b>Прибуток (Contribution Profit)</b> — дохід мінус рекламні витрати, собівартість і всі змодельовані витрати (фіксовані + змінні). Відображає прибутковість саме воронки, а не весь чистий прибуток компанії.</li>
            <li><b>ROI (Contribution ROI)</b> — прибуток поділений на всі змодельовані витрати.</li>
            <li><b>Точка беззбитковості (дохід/ROAS/покупки)</b> — дохід, ROAS і кількість покупок, потрібні лише щоб покрити рекламні витрати й фіксовані витрати, з урахуванням собівартості та комісії.</li>
          </ul>

          <h4>Примітка щодо цифр</h4>
          <p>CTR, CPM і конверсія моделюються незалежно одне від одного для аналізу сценаріїв — у реальних кампаніях зміна одного показника може впливати на інші. Ця модель використовує спрощені, лінійні припущення, щоб показати механіку. Це орієнтовна діагностика, а не медіаплан — реальні кампанії залежать від сезонності, вигорання аудиторії та втоми від креативів, чого статична модель не враховує. Сприймайте різницю між сценаріями як сигнал, куди дивитись, а не гарантований прогноз.</p>
        </div>
      </div>
    </div>
  );
}
