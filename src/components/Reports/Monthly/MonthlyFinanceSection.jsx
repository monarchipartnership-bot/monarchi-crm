import { COST_ITEMS, INCOME_FIELDS } from '../../../lib/weeklyLogic';
import { SECTION_ICONS, CHANNEL_ICONS } from '../../../lib/reportIcons';
import FinCard from '../FinCard';

const WALLET_ICON = '<svg viewBox="0 0 24 24"><rect x="3" y="7" width="18" height="12" rx="2"/><path d="M3 10h18"/><circle cx="16" cy="14" r="1.2"/></svg>';
const LEAF_ICON = '<svg viewBox="0 0 24 24"><path d="M4 20c8 0 14-6 14-14 0 0-12-2-14 8-1 3 0 6 0 6z"/><path d="M4 20c2-6 6-9 10-11"/></svg>';

const INCOME_ICON_META = {
  mb_income: { icon: WALLET_ICON, cls: 'green' },
  ol_income: { icon: LEAF_ICON, cls: 'green' },
  gm_income: { icon: SECTION_ICONS['Клієнти'], cls: 'blue' },
  li_income: { icon: CHANNEL_ICONS.li, cls: 'blue' },
};

function costLineDisplay(sums, it) {
  const raw = sums[it.id] || 0;
  if (it.direct) {
    const signed = it.exp ? -raw : raw;
    return (signed >= 0 ? '+' : '-') + '$' + Math.abs(signed).toFixed(2);
  }
  const d = raw * 0.15;
  const signed = it.exp ? -d : d;
  return (signed >= 0 ? '+' : '-') + '$' + Math.abs(signed).toFixed(2);
}

function CostGroup({ icon, title, subtitle, items, sums }) {
  return (
    <FinCard icon={icon} title={title} subtitle={subtitle}>
      <div className="cost-grid">
        {items.map((it) => (
          <div className="cost-row" key={it.id}>
            <div className="cost-label">{it.label}</div>
            <div className="cost-dollar">{costLineDisplay(sums, it)}</div>
          </div>
        ))}
      </div>
    </FinCard>
  );
}

// Monthly's Фінанси — same FinCard/income-row/summary-pill shape as Weekly's
// FinanceSection.jsx, minus the top KPI row (no prior-month trend data yet)
// and minus any input (everything here is a read-only rollup of the month's
// saved weekly reports).
export default function MonthlyFinanceSection({ sums, fin }) {
  return (
    <>
      <FinCard icon={WALLET_ICON} title="Дохід" subtitle="Усі джерела доходу за місяць">
        <div className="fin-income-grid">
          {INCOME_FIELDS.map((f) => {
            const meta = INCOME_ICON_META[f.id] || { icon: WALLET_ICON, cls: 'green' };
            return (
              <div className="fin-income-item" key={f.id}>
                <span className={'fin-income-icon ' + meta.cls} dangerouslySetInnerHTML={{ __html: meta.icon }} />
                <div className="fin-income-body">
                  <div className="fin-income-label">{f.label}</div>
                  <div className="fin-income-value">${(sums[f.id] || 0).toFixed(0)}</div>
                </div>
              </div>
            );
          })}
        </div>
      </FinCard>

      <CostGroup icon={SECTION_ICONS.Upwork} title="Витрати — профілі Upwork" subtitle="Витрати на підписки та покращення профілів" items={COST_ITEMS.profiles} sums={sums} />
      <CostGroup icon={CHANNEL_ICONS.mb} title="Витрати — Manual Bidding" subtitle="Витрати на тендери та листи" items={COST_ITEMS.mb} sums={sums} />
      <CostGroup icon={CHANNEL_ICONS.gm} title="Витрати — GetMany" subtitle="Витрати на платформу GetMany" items={COST_ITEMS.gm} sums={sums} />
      <CostGroup icon={CHANNEL_ICONS.li} title="Витрати — LinkedIn" subtitle="Витрати на підписку та інструменти" items={COST_ITEMS.li} sums={sums} />

      <FinCard icon={SECTION_ICONS.Фінанси} title="Підсумок" subtitle="Зведені показники за місяць" highlight>
        <div className="fin-summary-row">
          <div className="fin-summary-pill hl"><div className="fin-summary-label">Total Income</div><div className="fin-summary-value">${fin.total_inc.toFixed(0)}</div></div>
          <div className="fin-summary-pill"><div className="fin-summary-label">Витрати — профілі</div><div className="fin-summary-value">-${Math.abs(fin.profiles_total).toFixed(0)}</div></div>
          <div className="fin-summary-pill"><div className="fin-summary-label">Витрати — MB</div><div className="fin-summary-value">-${Math.abs(fin.mb_total).toFixed(0)}</div></div>
          <div className="fin-summary-pill"><div className="fin-summary-label">Витрати — GM</div><div className="fin-summary-value">-${Math.abs(fin.gm_total).toFixed(0)}</div></div>
          <div className="fin-summary-pill"><div className="fin-summary-label">Витрати — LI</div><div className="fin-summary-value">-${Math.abs(fin.li_total).toFixed(0)}</div></div>
          <div className="fin-summary-pill"><div className="fin-summary-label">Total Витрати</div><div className="fin-summary-value">-${Math.abs(fin.all_total).toFixed(0)}</div></div>
          <div className={'fin-summary-pill profit ' + (fin.profit >= 0 ? 'pr' : 'loss')}>
            <div className="fin-summary-label">Прибуток</div>
            <div className="fin-summary-value">{fin.profit >= 0 ? '+' : '-'}${Math.abs(fin.profit).toFixed(0)}</div>
          </div>
        </div>
      </FinCard>
    </>
  );
}
