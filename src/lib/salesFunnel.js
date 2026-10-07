import { financeCalc, gv } from './weeklyLogic';

// Sales funnel on the Sales Dashboard: лід → дзвінок → кваліфікований → контракт,
// built from the numbers already typed into the Weekly report (and summed by
// the Monthly one). Both hand the same field ids; `getValue(id)` is the only
// difference (weekly: data[id], monthly: data.sums[id]).
//
// What counts as a "лід" differs per channel because the reports track them
// differently: Upwork-style channels (Manual Bidding, GetMany) log Answers,
// the organic ones (Invites, DM, Consultations, Catalog) log "Кількість"
// (incoming leads), LinkedIn logs Leads.
export const FUNNEL_CHANNELS = [
  { key: 'mb', title: 'Manual Bidding', leads: 'mb_a', calls: 'mb_c', ql: 'mb_ql', co: 'mb_co' },
  { key: 'inv', title: 'Invites', leads: 'ol_inv', calls: 'ol_inv_c', ql: 'ol_inv_ql', co: 'ol_inv_co' },
  { key: 'dm', title: 'Direct Message', leads: 'ol_dm', calls: 'ol_dm_c', ql: 'ol_dm_ql', co: 'ol_dm_co' },
  { key: 'con', title: 'Consultations', leads: 'ol_con', calls: 'ol_con_c', ql: 'ol_con_ql', co: 'ol_con_co' },
  { key: 'pc', title: 'Project Catalog', leads: 'ol_pc', calls: 'ol_pc_c', ql: 'ol_pc_ql', co: 'ol_pc_co' },
  { key: 'gm', title: 'GetMany', leads: 'gm_a', calls: 'gm_c', ql: 'gm_ql', co: 'gm_co' },
  { key: 'li', title: 'LinkedIn', leads: 'li_leads', calls: 'li_calls', ql: 'li_ql', co: 'li_contracts' },
];

export const STAGES = [
  { key: 'leads', label: 'Ліди' },
  { key: 'calls', label: 'Дзвінки' },
  { key: 'ql', label: 'Кваліфіковані' },
  { key: 'co', label: 'Контракти' },
];

const num = (getValue, id) => gv(getValue, id) || 0;

// { total: { leads, calls, ql, co }, byChannel: { mb: {...}, ... } }
export function funnelFrom(getValue) {
  const total = { leads: 0, calls: 0, ql: 0, co: 0 };
  const byChannel = {};
  for (const c of FUNNEL_CHANNELS) {
    const row = { leads: num(getValue, c.leads), calls: num(getValue, c.calls), ql: num(getValue, c.ql), co: num(getValue, c.co) };
    byChannel[c.key] = row;
    for (const k of Object.keys(total)) total[k] += row[k];
  }
  return { total, byChannel };
}

// Conversion % between neighbouring stages (null when the earlier stage is 0).
export function pctOf(num, den) {
  return den > 0 ? (num / den) * 100 : null;
}
export function conversions(f) {
  return {
    leadsToCalls: pctOf(f.calls, f.leads),
    callsToQl: pctOf(f.ql, f.calls),
    qlToCo: pctOf(f.co, f.ql),
    leadsToCo: pctOf(f.co, f.leads),
  };
}

// Money put into the sales channels and what they brought back. Costs are
// stored as negatives (and returns as positives) by financeCalc, so spend is
// the negated total: a net-negative spend means returns exceeded costs.
// Organic channels (Invites/DM/Consultations/Catalog) cost nothing in the
// report, only income.
export function investmentsFrom(getValue) {
  const f = financeCalc(getValue);
  const income = (id) => gv(getValue, id) || 0;
  const rows = [
    { key: 'profiles', title: 'Профілі Upwork', spend: -f.profilesTotal, income: 0 },
    { key: 'mb', title: 'Manual Bidding', spend: -f.mbTotal, income: income('mb_income') },
    { key: 'ol', title: 'Organic Leads', spend: 0, income: income('ol_income') },
    { key: 'gm', title: 'GetMany', spend: -f.gmTotal, income: income('gm_income') },
    { key: 'li', title: 'LinkedIn', spend: -f.liTotal, income: income('li_income') },
  ].map((r) => ({ ...r, profit: r.income - r.spend }));
  return { rows, totalSpend: -f.allTotal, totalIncome: f.totalInc, profit: f.profit };
}
