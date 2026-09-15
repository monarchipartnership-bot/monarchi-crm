import { COST_ITEMS, INCOME_FIELDS, costHint, costLine, financeCalc, moneyFmt } from '../../../lib/weeklyLogic';
import { SECTION_ICONS, CHANNEL_ICONS } from '../../../lib/reportIcons';
import Sparkline from '../../Automation/Sparkline';
import DeltaBadge from '../../Automation/DeltaBadge';
import FinCard from '../FinCard';

const WALLET_ICON = '<svg viewBox="0 0 24 24"><rect x="3" y="7" width="18" height="12" rx="2"/><path d="M3 10h18"/><circle cx="16" cy="14" r="1.2"/></svg>';
const LEAF_ICON = '<svg viewBox="0 0 24 24"><path d="M4 20c8 0 14-6 14-14 0 0-12-2-14 8-1 3 0 6 0 6z"/><path d="M4 20c2-6 6-9 10-11"/></svg>';
const SHIELD_ICON = '<svg viewBox="0 0 24 24"><path d="M12 3l7 3v6c0 5-3.5 8-7 9-3.5-1-7-4-7-9V6z"/></svg>';
const CHEVRON = '<svg viewBox="0 0 24 24"><path d="M9 18l6-6-6-6"/></svg>';

const INCOME_ICON_META = {
  mb_income: { icon: WALLET_ICON, cls: 'green' },
  ol_income: { icon: LEAF_ICON, cls: 'green' },
  gm_income: { icon: SECTION_ICONS['Клієнти'], cls: 'blue' },
  li_income: { icon: CHANNEL_ICONS.li, cls: 'blue' },
};

function relPctDelta(cur, prev) {
  if (!prev) return null;
  return Math.round(((cur - prev) / prev) * 100);
}

// One week's (or the currently-edited week's) figures, reusing the pure
// financeCalc() helper — used to build the 4 KPI cards' history/sparkline.
function financeSeries(weeklyHistory, fields, clientsCount, selector) {
  const values = weeklyHistory.map((r) => selector(financeCalc((id) => r.data?.[id]), (r.data?.clients || []).length));
  values.push(selector(financeCalc((id) => fields[id]), clientsCount));
  const delta = values.length >= 2 ? values[values.length - 1] - values[values.length - 2] : null;
  return { values, current: values[values.length - 1], delta };
}

function CostGroup({ icon, title, subtitle, items, fields, onChange, readOnly }) {
  return (
    <FinCard icon={icon} title={title} subtitle={subtitle}>
      <div className="cost-grid">
        {items.map((it) => (
          <div className="cost-row" key={it.id}>
            <div className="cost-label">{it.label}</div>
            {readOnly ? (
              <div className="cost-dollar">{it.direct ? moneyFmt(costLine((id) => fields[id], it)) : (fields[it.id] || '0')}</div>
            ) : (
              <>
                <input
                  type="number"
                  className="cost-input"
                  value={fields[it.id] ?? ''}
                  placeholder="0"
                  onChange={(e) => onChange(it.id, e.target.value)}
                />
                {!it.direct && <span className="cost-dollar">{costHint((id) => fields[id], it)}</span>}
              </>
            )}
          </div>
        ))}
      </div>
    </FinCard>
  );
}

export default function FinanceSection({ fields, onChange, readOnly, clients = [], weeklyHistory = [] }) {
  const getValue = (id) => fields[id];
  const calc = financeCalc(getValue);
  const clientsCount = clients.filter((c) => c.name?.trim()).length;

  const incomeSeries = financeSeries(weeklyHistory, fields, clientsCount, (c) => c.totalInc);
  const expenseSeries = financeSeries(weeklyHistory, fields, clientsCount, (c) => c.allTotal);
  const profitSeries = financeSeries(weeklyHistory, fields, clientsCount, (c) => c.profit);
  const clientsSeries = financeSeries(weeklyHistory, fields, clientsCount, (c, n) => n);
  const margin = calc.totalInc ? Math.round((calc.profit / calc.totalInc) * 100) : 0;

  return (
    <>
      <div className="dash-kpi-row fin-kpi-row">
        <div className="dash-kpi">
          <div className="dash-kpi-head">
            <span className="dash-kpi-icon fin-kpi-icon green" dangerouslySetInnerHTML={{ __html: WALLET_ICON }} />
            <div className="dash-kpi-label">Загальний дохід</div>
          </div>
          <div className="dash-kpi-value">{moneyFmt(incomeSeries.current)}</div>
          <div className="dash-kpi-sub"><DeltaBadge diff={relPctDelta(incomeSeries.current, incomeSeries.values[incomeSeries.values.length - 2])} suffix="%" /> vs мин. тиждень</div>
          {incomeSeries.values.length >= 2 && <Sparkline values={incomeSeries.values} color="var(--ok)" />}
        </div>

        <div className="dash-kpi">
          <div className="dash-kpi-head">
            <span className="dash-kpi-icon fin-kpi-icon red" dangerouslySetInnerHTML={{ __html: SHIELD_ICON }} />
            <div className="dash-kpi-label">Загальні витрати</div>
          </div>
          <div className="dash-kpi-value">{moneyFmt(expenseSeries.current)}</div>
          <div className="dash-kpi-sub"><DeltaBadge diff={relPctDelta(Math.abs(expenseSeries.current), Math.abs(expenseSeries.values[expenseSeries.values.length - 2]))} suffix="%" /> vs мин. тиждень</div>
          {expenseSeries.values.length >= 2 && <Sparkline values={expenseSeries.values.map((v) => Math.abs(v))} color="var(--bad)" />}
        </div>

        <div className="dash-kpi">
          <div className="dash-kpi-head">
            <span className="dash-kpi-icon fin-kpi-icon purple" dangerouslySetInnerHTML={{ __html: SECTION_ICONS['Тренди за місяцями'] }} />
            <div className="dash-kpi-label">Чистий прибуток</div>
          </div>
          <div className="dash-kpi-value">{calc.profit >= 0 ? '+' : ''}{moneyFmt(calc.profit)}</div>
          <div className="dash-kpi-sub">Рентабельність {margin}%</div>
          {profitSeries.values.length >= 2 && <Sparkline values={profitSeries.values} color="var(--purple)" />}
        </div>

        <div className="dash-kpi">
          <div className="dash-kpi-head">
            <span className="dash-kpi-icon fin-kpi-icon blue" dangerouslySetInnerHTML={{ __html: SECTION_ICONS['Клієнти'] }} />
            <div className="dash-kpi-label">Кількість клієнтів</div>
          </div>
          <div className="dash-kpi-value">{clientsCount}</div>
          <div className="dash-kpi-sub"><DeltaBadge diff={relPctDelta(clientsCount, clientsSeries.values[clientsSeries.values.length - 2])} suffix="%" /> vs мин. тиждень</div>
          {clientsSeries.values.length >= 2 && <Sparkline values={clientsSeries.values} color="#2F80ED" />}
        </div>
      </div>

      <FinCard icon={WALLET_ICON} title="Дохід" subtitle="Усі джерела доходу за тиждень">
        <div className="fin-income-grid">
          {INCOME_FIELDS.map((f) => {
            const meta = INCOME_ICON_META[f.id] || { icon: WALLET_ICON, cls: 'green' };
            return (
              <div className="fin-income-item" key={f.id}>
                <span className={'fin-income-icon ' + meta.cls} dangerouslySetInnerHTML={{ __html: meta.icon }} />
                <div className="fin-income-body">
                  <div className="fin-income-label">{f.label}</div>
                  {readOnly ? (
                    <div className="fin-income-value">{moneyFmt(parseFloat(fields[f.id]) || 0)}</div>
                  ) : (
                    <input type="number" className="fin-income-input" value={fields[f.id] ?? ''} placeholder="0" onChange={(e) => onChange(f.id, e.target.value)} />
                  )}
                </div>
                <span className="fin-income-chevron" dangerouslySetInnerHTML={{ __html: CHEVRON }} />
              </div>
            );
          })}
        </div>
      </FinCard>

      <CostGroup icon={SECTION_ICONS.Upwork} title="Витрати — профілі Upwork" subtitle="Витрати на підписки та покращення профілів" items={COST_ITEMS.profiles} fields={fields} onChange={onChange} readOnly={readOnly} />
      <CostGroup icon={CHANNEL_ICONS.mb} title="Витрати — Manual Bidding" subtitle="Витрати на тендери та листи" items={COST_ITEMS.mb} fields={fields} onChange={onChange} readOnly={readOnly} />
      <CostGroup icon={CHANNEL_ICONS.gm} title="Витрати — GetMany" subtitle="Витрати на платформу GetMany" items={COST_ITEMS.gm} fields={fields} onChange={onChange} readOnly={readOnly} />
      <CostGroup icon={CHANNEL_ICONS.li} title="Витрати — LinkedIn" subtitle="Витрати на підписку та інструменти" items={COST_ITEMS.li} fields={fields} onChange={onChange} readOnly={readOnly} />

      <FinCard icon={SECTION_ICONS.Фінанси} title="Підсумок" subtitle="Зведені показники за тиждень" highlight>
        <div className="fin-summary-row">
          <div className="fin-summary-pill hl"><div className="fin-summary-label">Total Income</div><div className="fin-summary-value">{moneyFmt(calc.totalInc)}</div></div>
          <div className="fin-summary-pill"><div className="fin-summary-label">Витрати — профілі</div><div className="fin-summary-value">-${Math.abs(calc.profilesTotal).toFixed(0)}</div></div>
          <div className="fin-summary-pill"><div className="fin-summary-label">Витрати — MB</div><div className="fin-summary-value">-${Math.abs(calc.mbTotal).toFixed(0)}</div></div>
          <div className="fin-summary-pill"><div className="fin-summary-label">Витрати — GM</div><div className="fin-summary-value">-${Math.abs(calc.gmTotal).toFixed(0)}</div></div>
          <div className="fin-summary-pill"><div className="fin-summary-label">Витрати — LI</div><div className="fin-summary-value">-${Math.abs(calc.liTotal).toFixed(0)}</div></div>
          <div className="fin-summary-pill"><div className="fin-summary-label">Total Витрати</div><div className="fin-summary-value">-${Math.abs(calc.allTotal).toFixed(0)}</div></div>
          <div className={'fin-summary-pill profit ' + (calc.profit >= 0 ? 'pr' : 'loss')}>
            <div className="fin-summary-label">Прибуток</div>
            <div className="fin-summary-value">{calc.profit >= 0 ? '+' : '-'}${Math.abs(calc.profit).toFixed(0)}</div>
          </div>
        </div>
      </FinCard>
    </>
  );
}
