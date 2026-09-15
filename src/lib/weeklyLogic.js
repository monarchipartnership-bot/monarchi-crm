// Weekly Report business logic — channel configs, plan presets, and the pure
// calculation functions, ported 1:1 from weekly.html / weekly_compare.html /
// weekly_history.html. Field ids are load-bearing: they are the exact keys
// saved into `weekly_reports.data`, so do not rename them.

export const RATE = 0.15; // $/unit for count-based cost items

// ---- channel configs -------------------------------------------------

function upworkishChannel(key, title, prefix) {
  return {
    key,
    title,
    metrics: [
      { id: `${prefix}_cl`, pp: `pp_${prefix}_cl`, label: 'Cover Letters' },
      { id: `${prefix}_a`, pp: `pp_${prefix}_a`, label: 'Answers' },
      { id: `${prefix}_v`, pp: `pp_${prefix}_v`, label: 'Viewed' },
      { id: `${prefix}_c`, pp: `pp_${prefix}_c`, label: 'Calls' },
      { id: `${prefix}_ql`, pp: `pp_${prefix}_ql`, label: 'Qualified Leads' },
      { id: `${prefix}_co`, pp: `pp_${prefix}_co`, label: 'Contracts' },
    ],
    ratios: [
      { key: 'c2a', pp: `pp_${prefix}_c2a`, label: 'CL to Answers', num: `${prefix}_a`, den: `${prefix}_cl` },
      { key: 'c2v', pp: `pp_${prefix}_c2v`, label: 'CL to Viewed', num: `${prefix}_v`, den: `${prefix}_cl` },
      { key: 'a2c', pp: `pp_${prefix}_a2c`, label: 'Answers to Calls', num: `${prefix}_c`, den: `${prefix}_a` },
      { key: 'c2ql', pp: `pp_${prefix}_c2ql`, label: 'Calls to QL', num: `${prefix}_ql`, den: `${prefix}_c` },
      { key: 'ql2co', pp: `pp_${prefix}_ql2co`, label: 'QL to Contracts', num: `${prefix}_co`, den: `${prefix}_ql` },
    ],
  };
}

function organicChannel(key, title, prefix) {
  return {
    key,
    title,
    metrics: [
      { id: `ol_${prefix}`, pp: `pp_ol_${prefix}`, label: 'Кількість' },
      { id: `ol_${prefix}_c`, pp: `pp_ol_${prefix}_c`, label: 'Calls' },
      { id: `ol_${prefix}_ql`, pp: `pp_ol_${prefix}_ql`, label: 'Qualified Leads' },
      { id: `ol_${prefix}_co`, pp: `pp_ol_${prefix}_co`, label: 'Contracts' },
    ],
    ratios: [
      { key: 'q2c', pp: `pp_ol_${prefix}_q2c`, label: 'Кількість to Calls', num: `ol_${prefix}_c`, den: `ol_${prefix}` },
      { key: 'c2ql', pp: `pp_ol_${prefix}_c2ql`, label: 'Calls to QL', num: `ol_${prefix}_ql`, den: `ol_${prefix}_c` },
      { key: 'ql2co', pp: `pp_ol_${prefix}_ql2co`, label: 'QL to Contracts', num: `ol_${prefix}_co`, den: `ol_${prefix}_ql` },
    ],
  };
}

export const CHANNELS = [
  upworkishChannel('mb', 'Manual Bidding', 'mb'),
  organicChannel('inv', 'Invites', 'inv'),
  organicChannel('dm', 'Direct Message', 'dm'),
  organicChannel('con', 'Consultations', 'con'),
  organicChannel('pc', 'Project Catalog', 'pc'),
  upworkishChannel('gm', 'GetMany', 'gm'),
];

export const LI_CHANNEL = {
  key: 'li',
  title: 'LinkedIn',
  metrics: [
    { id: 'li_conn', pp: 'pp_li_conn', label: 'Connections' },
    { id: 'li_leads', pp: 'pp_li_leads', label: 'Leads' },
    { id: 'li_answers', pp: 'pp_li_a', label: 'Answers' },
    { id: 'li_calls', pp: 'pp_li_c', label: 'Calls' },
    { id: 'li_ql', pp: 'pp_li_ql', label: 'Qualified Leads' },
    { id: 'li_contracts', pp: 'pp_li_co', label: 'Contracts' },
  ],
  ratios: [
    { key: 'c2l', pp: 'pp_li_c2l', label: 'Connections to Leads', num: 'li_leads', den: 'li_conn' },
    { key: 'l2a', pp: 'pp_li_l2a', label: 'Leads to Answers', num: 'li_answers', den: 'li_leads' },
    { key: 'a2c', pp: 'pp_li_a2c', label: 'Answers to Calls', num: 'li_calls', den: 'li_answers' },
    { key: 'c2ql', pp: 'pp_li_c2ql', label: 'Calls to Qual.Leads', num: 'li_ql', den: 'li_calls' },
    { key: 'ql2co', pp: 'pp_li_ql2co', label: 'Qual.Leads to Contracts', num: 'li_contracts', den: 'li_ql' },
  ],
};

export const INCOME_FIELDS = [
  { id: 'mb_income', label: 'Manual Bidding Income' },
  { id: 'ol_income', label: 'Organic Leads Income' },
  { id: 'gm_income', label: 'GetMany Income' },
  { id: 'li_income', label: 'LinkedIn Income' },
];

export const COST_ITEMS = {
  profiles: [
    { id: 'up_c_badge_n', label: 'Availability badge', exp: true },
    { id: 'up_c_profileboost_n', label: 'Boost your profile', exp: true },
  ],
  mb: [
    { id: 'mb_c_cl_n', label: 'Cover Letters', exp: true },
    { id: 'mb_c_boost_n', label: 'Boost Cover Letters', exp: true },
    { id: 'mb_c_ret_n', label: 'Return', exp: false },
    { id: 'mb_c_extra_n', label: 'Extra', exp: true },
  ],
  gm: [
    { id: 'gm_c_cl_n', label: 'Cover Letters', exp: true },
    { id: 'gm_c_boost_n', label: 'Boost Cover Letters', exp: true },
    { id: 'gm_c_ret_n', label: 'Return', exp: false },
    { id: 'gm_c_extra_n', label: 'Extra', exp: true },
    { id: 'gm_c_sub_usd', label: 'Subscription $', exp: true, direct: true },
    { id: 'commission_usd', label: 'Commission $', exp: true, direct: true },
  ],
  li: [
    { id: 'li_c_sub_usd', label: 'Subscription $', exp: true, direct: true },
    { id: 'li_c_tools_usd', label: 'Tools $', exp: true, direct: true },
    { id: 'li_c_comm_usd', label: 'Commission $', exp: true, direct: true },
  ],
};

// ---- plan presets ------------------------------------------------------

export const PLAN_PRESETS = {
  none: {
    mb: { cl: 0, a: 0, v: 0, c: 0, ql: 0, co: 0, r: { c2a: 0, c2v: 0, a2c: 0, c2ql: 0, ql2co: 0 } },
    ol: { inv: { n: 0, c: 0, ql: 0, co: 0 }, dm: { n: 0, c: 0, ql: 0, co: 0 }, pc: { n: 0, c: 0, ql: 0, co: 0 }, con: { n: 0, c: 0, ql: 0, co: 0 }, r: { q2c: 0, c2ql: 0, ql2co: 0 } },
    gm: { cl: 0, a: 0, v: 0, c: 0, ql: 0, co: 0, r: { c2a: 0, c2v: 0, a2c: 0, c2ql: 0, ql2co: 0 } },
    li: { conn: 0, leads: 0, a: 0, c: 0, ql: 0, co: 0, r: { c2l: 0, l2a: 0, a2c: 0, c2ql: 0, ql2co: 0 } },
  },
  min: {
    mb: { cl: 25, a: 5, v: 10, c: 2, ql: 2, co: 1, r: { c2a: 10, c2v: 10, a2c: 50, c2ql: 50, ql2co: 10 } },
    ol: { inv: { n: 2, c: 2, ql: 1, co: 1 }, dm: { n: 1, c: 1, ql: 1, co: 1 }, pc: { n: 1, c: 1, ql: 1, co: 1 }, con: { n: 1, c: 1, ql: 1, co: 1 }, r: { q2c: 80, c2ql: 80, ql2co: 10 } },
    gm: { cl: 25, a: 5, v: 20, c: 2, ql: 2, co: 1, r: { c2a: 10, c2v: 10, a2c: 50, c2ql: 50, ql2co: 10 } },
    li: { conn: 50, leads: 5, a: 5, c: 3, ql: 3, co: 1, r: { c2l: 10, l2a: 30, a2c: 50, c2ql: 80, ql2co: 10 } },
  },
  avg: {
    mb: { cl: 50, a: 10, v: 20, c: 5, ql: 5, co: 1, r: { c2a: 15, c2v: 20, a2c: 50, c2ql: 50, ql2co: 10 } },
    ol: { inv: { n: 4, c: 3, ql: 2, co: 1 }, dm: { n: 2, c: 1, ql: 1, co: 1 }, pc: { n: 2, c: 1, ql: 1, co: 1 }, con: { n: 2, c: 1, ql: 1, co: 1 }, r: { q2c: 80, c2ql: 80, ql2co: 10 } },
    gm: { cl: 50, a: 10, v: 30, c: 5, ql: 5, co: 1, r: { c2a: 15, c2v: 20, a2c: 50, c2ql: 50, ql2co: 10 } },
    li: { conn: 100, leads: 10, a: 10, c: 5, ql: 5, co: 1, r: { c2l: 10, l2a: 30, a2c: 50, c2ql: 80, ql2co: 10 } },
  },
  real: {
    mb: { cl: 75, a: 15, v: 30, c: 10, ql: 10, co: 2, r: { c2a: 20, c2v: 30, a2c: 80, c2ql: 80, ql2co: 10 } },
    ol: { inv: { n: 8, c: 5, ql: 5, co: 1 }, dm: { n: 2, c: 1, ql: 1, co: 1 }, pc: { n: 2, c: 1, ql: 1, co: 1 }, con: { n: 2, c: 1, ql: 1, co: 1 }, r: { q2c: 80, c2ql: 80, ql2co: 10 } },
    gm: { cl: 100, a: 20, v: 40, c: 15, ql: 15, co: 2, r: { c2a: 20, c2v: 30, a2c: 80, c2ql: 80, ql2co: 10 } },
    li: { conn: 150, leads: 15, a: 15, c: 8, ql: 5, co: 1, r: { c2l: 10, l2a: 30, a2c: 50, c2ql: 80, ql2co: 10 } },
  },
  max: {
    mb: { cl: 100, a: 20, v: 50, c: 15, ql: 15, co: 2, r: { c2a: 25, c2v: 40, a2c: 80, c2ql: 80, ql2co: 20 } },
    ol: { inv: { n: 10, c: 8, ql: 6, co: 1 }, dm: { n: 2, c: 1, ql: 1, co: 1 }, pc: { n: 2, c: 1, ql: 1, co: 1 }, con: { n: 2, c: 1, ql: 1, co: 1 }, r: { q2c: 80, c2ql: 80, ql2co: 10 } },
    gm: { cl: 150, a: 30, v: 50, c: 20, ql: 20, co: 4, r: { c2a: 25, c2v: 40, a2c: 80, c2ql: 80, ql2co: 20 } },
    li: { conn: 200, leads: 20, a: 20, c: 10, ql: 10, co: 2, r: { c2l: 10, l2a: 30, a2c: 50, c2ql: 80, ql2co: 10 } },
  },
};

// Applies a preset (by key) via `setValue(fieldId, numericValue)`.
export function applyPlanPreset(presetKey, setValue) {
  const preset = PLAN_PRESETS[presetKey];
  if (!preset) return;

  const upworkishKeys = { metrics: ['cl', 'a', 'v', 'c', 'ql', 'co'], ratios: ['c2a', 'c2v', 'a2c', 'c2ql', 'ql2co'] };
  ['mb', 'gm'].forEach((ck) => {
    const chan = CHANNELS.find((c) => c.key === ck);
    const p = preset[ck];
    chan.metrics.forEach((m, i) => setValue(m.pp, p[upworkishKeys.metrics[i]]));
    chan.ratios.forEach((r, i) => setValue(r.pp, p.r[upworkishKeys.ratios[i]]));
  });

  const organicKeys = { metrics: ['n', 'c', 'ql', 'co'], ratios: ['q2c', 'c2ql', 'ql2co'] };
  ['inv', 'dm', 'con', 'pc'].forEach((ck) => {
    const chan = CHANNELS.find((c) => c.key === ck);
    const p = preset.ol[ck];
    chan.metrics.forEach((m, i) => setValue(m.pp, p[organicKeys.metrics[i]]));
    chan.ratios.forEach((r, i) => setValue(r.pp, preset.ol.r[organicKeys.ratios[i]]));
  });

  const liKeys = { metrics: ['conn', 'leads', 'a', 'c', 'ql', 'co'], ratios: ['c2l', 'l2a', 'a2c', 'c2ql', 'ql2co'] };
  LI_CHANNEL.metrics.forEach((m, i) => setValue(m.pp, preset.li[liKeys.metrics[i]]));
  LI_CHANNEL.ratios.forEach((r, i) => setValue(r.pp, preset.li.r[liKeys.ratios[i]]));
}

// ---- pure calculations --------------------------------------------------

export function toNum(v) {
  const n = parseFloat(v);
  return isNaN(n) ? 0 : n;
}

export function pct(a, b) {
  return b ? (a / b) * 100 : null;
}

export function fp(v) {
  return v === null || v === undefined || isNaN(v) || !isFinite(v) ? '—' : v.toFixed(1) + '%';
}

export function bcls(actual, plan) {
  if (!plan) return '';
  const r = actual / plan;
  if (r >= 0.9) return 'ok';
  if (r >= 0.6) return 'warn';
  return 'bad';
}

const CLS_COLOR = { ok: 'var(--ok)', warn: 'var(--warn)', bad: 'var(--bad)', '': 'var(--muted)' };

// actual/plan may be null (ratio fact with no denominator) or a number.
export function achievement(actual, plan) {
  if (actual === null || actual === undefined || !plan) {
    return { text: '—', color: 'var(--muted)', barPct: 0 };
  }
  const ratio = actual / plan;
  const cls = bcls(actual, plan);
  return { text: Math.round(ratio * 100) + '%', color: CLS_COLOR[cls], barPct: Math.max(0, Math.min(ratio * 100, 100)) };
}

export function costLine(getValue, item) {
  if (item.direct) {
    const v = toNum(getValue(item.id));
    return item.exp ? -v : v;
  }
  const c = toNum(getValue(item.id));
  const d = c * RATE;
  return item.exp ? -d : d;
}

export function costHint(getValue, item) {
  if (item.direct) return null;
  const c = toNum(getValue(item.id));
  if (!c) return '—';
  const d = c * RATE;
  return (item.exp ? '-' : '+') + '$' + d.toFixed(2);
}

export function financeCalc(getValue) {
  const sum = (items) => items.reduce((s, it) => s + costLine(getValue, it), 0);
  const profilesTotal = sum(COST_ITEMS.profiles);
  const mbTotal = sum(COST_ITEMS.mb);
  const gmTotal = sum(COST_ITEMS.gm);
  const liTotal = sum(COST_ITEMS.li);
  const allTotal = profilesTotal + mbTotal + gmTotal + liTotal;
  const totalInc = INCOME_FIELDS.reduce((s, f) => s + toNum(getValue(f.id)), 0);
  const profit = totalInc + allTotal;
  return { profilesTotal, mbTotal, gmTotal, liTotal, allTotal, totalInc, profit };
}

// Like toNum, but distinguishes "field genuinely absent/blank" (null) from
// an actual 0 — used by the Compare page so empty cells render as "—".
export function gv(getValue, id) {
  const v = getValue(id);
  if (v === null || v === undefined || v === '') return null;
  const n = parseFloat(v);
  return isNaN(n) ? null : n;
}

export function nvd(getValue, id) {
  const v = gv(getValue, id);
  return v === null ? 0 : v;
}

export function pctVal(getValue, num, den) {
  const d = nvd(getValue, den);
  return d ? (nvd(getValue, num) / d) * 100 : null;
}

// Per-row "best value wins" highlighting across compared weeks — needs at
// least 2 real (non-null) values before anything is flagged; ties all win.
export function bestFlags(values) {
  const present = values.filter((v) => v !== null && v !== undefined && !isNaN(v));
  if (present.length < 2) return values.map(() => false);
  const max = Math.max(...present);
  return values.map((v) => v !== null && v !== undefined && !isNaN(v) && v === max);
}

export function moneyFmt(v) {
  if (v === null || v === undefined || isNaN(v)) return '—';
  return (v >= 0 ? '$' : '-$') + Math.abs(v).toFixed(0);
}

export function numFmt(v) {
  if (v === null || v === undefined || isNaN(v)) return '—';
  const rounded = Math.round(v * 10) / 10;
  return rounded % 1 === 0 ? String(Math.round(v)) : rounded.toFixed(1);
}

export function pctFmt(v) {
  return v === null || v === undefined || isNaN(v) ? '—' : v.toFixed(1) + '%';
}

// Every scalar field id that belongs in the `data` blob (all as strings).
export function allFieldIds() {
  const ids = ['manager'];
  CHANNELS.forEach((c) => {
    c.metrics.forEach((m) => ids.push(m.id, m.pp));
    c.ratios.forEach((r) => ids.push(r.pp));
  });
  LI_CHANNEL.metrics.forEach((m) => ids.push(m.id, m.pp));
  LI_CHANNEL.ratios.forEach((r) => ids.push(r.pp));
  INCOME_FIELDS.forEach((f) => ids.push(f.id));
  Object.values(COST_ITEMS).forEach((group) => group.forEach((it) => ids.push(it.id)));
  return ids;
}
