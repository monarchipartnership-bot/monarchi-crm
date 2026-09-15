// Monthly Report aggregation: sums each fact field across the month's saved
// weekly_reports rows, then recomputes every conversion % from the SUMMED
// base metrics (never averages the weekly percentages) — ported 1:1 from
// monthly.html's computeSums/computeFinance.
import { CHANNELS, LI_CHANNEL, COST_ITEMS, INCOME_FIELDS, pct, financeCalc } from './weeklyLogic';

// Metric plan (pp_*) ids are summed alongside fact ids so Monthly's channel
// cards can show a real "sum of everyone's weekly plan entries this month"
// figure (achievement %/bar), matching Weekly's KCard — see
// MonthlyChannelBlock.jsx. Ratio plan ids are handled separately below (a
// target conversion % is averaged across weeks, never summed).
function allMetricSumIds() {
  const ids = [];
  CHANNELS.forEach((c) => c.metrics.forEach((m) => ids.push(m.id, m.pp)));
  LI_CHANNEL.metrics.forEach((m) => ids.push(m.id, m.pp));
  INCOME_FIELDS.forEach((f) => ids.push(f.id));
  Object.values(COST_ITEMS).forEach((group) => group.forEach((it) => ids.push(it.id)));
  return ids;
}

function allRatioPlanIds() {
  const ids = [];
  CHANNELS.forEach((c) => c.ratios.forEach((r) => ids.push(r.pp)));
  LI_CHANNEL.ratios.forEach((r) => ids.push(r.pp));
  return ids;
}

// rows: weekly_reports rows for the month (whatever Supabase returns —
// missing weeks simply don't contribute, equivalent to zero-filling them).
export function computeSums(rows) {
  const sums = {};
  allMetricSumIds().forEach((id) => { sums[id] = 0; });
  rows.forEach((row) => {
    const d = row.data || {};
    allMetricSumIds().forEach((id) => {
      const v = parseFloat(d[id]);
      if (!isNaN(v)) sums[id] += v;
    });
  });

  allRatioPlanIds().forEach((id) => {
    let total = 0;
    let count = 0;
    rows.forEach((row) => {
      const v = parseFloat((row.data || {})[id]);
      if (!isNaN(v)) { total += v; count += 1; }
    });
    sums[id] = count ? total / count : 0;
  });

  const ratioPct = {};
  CHANNELS.forEach((c) => c.ratios.forEach((r) => { ratioPct[r.pp.replace('pp_', '')] = pct(sums[r.num], sums[r.den]); }));
  LI_CHANNEL.ratios.forEach((r) => { ratioPct[r.pp.replace('pp_', '')] = pct(sums[r.num], sums[r.den]); });

  const calc = financeCalc((id) => sums[id]);
  // Field names match monthly.html's `fin` object exactly (snake_case) for
  // compatibility with any months already saved by the legacy tool.
  const fin = {
    profiles_total: calc.profilesTotal,
    mb_total: calc.mbTotal,
    gm_total: calc.gmTotal,
    li_total: calc.liTotal,
    all_total: calc.allTotal,
    total_inc: calc.totalInc,
    profit: calc.profit,
    mb_income: sums.mb_income || 0,
    ol_income: sums.ol_income || 0,
    gm_income: sums.gm_income || 0,
    li_income: sums.li_income || 0,
  };
  return { sums, ratioPct, fin };
}

// Which weeks (from computeWeeksForMonth) are missing a saved weekly report.
export function findMissingWeeks(rows, expectedWeeks) {
  const foundIdx = new Set(rows.map((r) => r.week_index));
  return expectedWeeks.filter((w) => !foundIdx.has(w.index));
}
