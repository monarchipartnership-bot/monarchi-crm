// Annual Report: sums each month's already-computed `sums` (from
// monthly_reports.data.sums) across the year, then recomputes every
// conversion % from the summed totals — the same "sum first" rule one level
// up from Monthly. Ported 1:1 from annual.html's computeAnnualSums.
import { CHANNELS, LI_CHANNEL, COST_ITEMS, INCOME_FIELDS, pct, financeCalc, costLine } from './weeklyLogic';
import { CLIENT_TYPES } from './reportConstants';

// Every channel's metrics[] has a different shape (upworkish: 6 stages,
// organic: 4, LinkedIn: 6), but all of them share three universal stages
// that can be matched generically by position/label rather than hardcoding
// per-channel field ids — this is the single source of truth the KPI row,
// channel-effectiveness cards, bar charts, funnel and detail table all read.
export function channelList() { return [...CHANNELS, LI_CHANNEL]; }
export function outreachId(c) { return c.metrics[0].id; }
export function qualifiedId(c) { return c.metrics.find((m) => m.label === 'Qualified Leads').id; }
export function contractsId(c) { return c.metrics.find((m) => m.label === 'Contracts').id; }
export function callsId(c) { return c.metrics.find((m) => m.label === 'Calls').id; }
// "Ліди" = Answers where the channel tracks that stage (Upwork-style
// channels + LinkedIn — LinkedIn's own separate "Leads" field, li_leads, is
// just accepted connection requests, not a real lead, so it's not used
// here); organic channels (Invites/DM/Consultations/Project Catalog) have
// no separate Answers step — their funnel goes straight Кількість→Calls —
// so their own outreach count stands in for it.
export function leadsId(c) {
  const answers = c.metrics.find((m) => m.label === 'Answers');
  return answers ? answers.id : c.metrics[0].id;
}

// Organic channels are inbound — leads reach out to us, we never send them
// outreach — so they have no real "Cover Letters" equivalent and must be
// excluded from that total (their own Кількість instead feeds leadsId()
// above). Upwork-style channels + LinkedIn (Connections) do send outreach.
export function isOrganicChannel(c) { return c.metrics[0].label === 'Кількість'; }
export function outreachChannels() { return channelList().filter((c) => !isOrganicChannel(c)); }

function allSumIds() {
  const ids = [];
  CHANNELS.forEach((c) => c.metrics.forEach((m) => ids.push(m.id)));
  LI_CHANNEL.metrics.forEach((m) => ids.push(m.id));
  INCOME_FIELDS.forEach((f) => ids.push(f.id));
  Object.values(COST_ITEMS).forEach((group) => group.forEach((it) => ids.push(it.id)));
  return ids;
}

// monthsByIndex: { [1..12]: monthly_reports row | undefined }
export function computeAnnualSums(monthsByIndex) {
  const sums = {};
  allSumIds().forEach((id) => { sums[id] = 0; });
  for (let m = 1; m <= 12; m++) {
    const row = monthsByIndex[m];
    const monthSums = row?.data?.sums;
    if (!monthSums) continue;
    allSumIds().forEach((id) => {
      const v = parseFloat(monthSums[id]);
      if (!isNaN(v)) sums[id] += v;
    });
  }

  const ratioPct = {};
  CHANNELS.forEach((c) => c.ratios.forEach((r) => { ratioPct[r.pp.replace('pp_', '')] = pct(sums[r.num], sums[r.den]); }));
  LI_CHANNEL.ratios.forEach((r) => { ratioPct[r.pp.replace('pp_', '')] = pct(sums[r.num], sums[r.den]); });

  const calc = financeCalc((id) => sums[id]);
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

// Accessors reading a single month's own already-saved values — used to
// plot the 12-point trend lines (each point is that month's own total, not
// a running/cumulative sum).
export function monthSumVal(monthsByIndex, m, id) {
  const v = monthsByIndex[m]?.data?.sums?.[id];
  return v === undefined || v === null || isNaN(v) ? null : Number(v);
}
export function monthRatioVal(monthsByIndex, m, id) {
  const v = monthsByIndex[m]?.data?.ratioPct?.[id];
  return v === undefined || v === null || isNaN(v) ? null : v;
}
export function monthFinVal(monthsByIndex, m, key) {
  const v = monthsByIndex[m]?.data?.finance?.[key];
  return v === undefined || v === null || isNaN(v) ? null : v;
}
export function monthCostLineVal(monthsByIndex, m, item) {
  const monthSums = monthsByIndex[m]?.data?.sums;
  if (!monthSums) return null;
  return costLine((id) => monthSums[id], item);
}

export function monthValuesFor(monthsByIndex, getter, idOrItem) {
  const out = [];
  for (let m = 1; m <= 12; m++) out.push(getter(monthsByIndex, m, idOrItem));
  return out;
}

// Tallies `leadType` across every month's saved `clients[]` (added to
// Monthly Report's payload in its _version 2). Months saved before that
// upgrade simply have no `clients` array and contribute nothing — the
// donut just reflects whatever part of the year already carries the field.
export function computeClientTypeBreakdown(monthsByIndex) {
  const counts = {};
  CLIENT_TYPES.forEach((t) => { counts[t] = 0; });
  let other = 0;
  Object.values(monthsByIndex).forEach((row) => {
    (row?.data?.clients || []).forEach((c) => {
      if (c.leadType && counts[c.leadType] !== undefined) counts[c.leadType] += 1;
      else other += 1;
    });
  });
  return { counts, other };
}
