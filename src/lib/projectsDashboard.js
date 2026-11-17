// The numbers behind the charts of the dashboard of the projects (/projects/dashboard): the weekly heat map (ROAS of every project for the last weeks), the flow of the
// month's spend from the platforms to the projects, the pace of the month with a forecast, the matrix of the status of the weekly reports and the board with the dynamics.
// Pure functions over the rows the page already reads (flattened weekly / monthly reports: { project_id, platform, week_start?, data: { spend, revenue, ... } }).

const num = (v) => Number(v) || 0;
export const roasOf = (revenue, spend) => (spend > 0 ? revenue / spend : null);
// the colour class of a ROAS (the chart legend: from 3x good, from 2x so-so, lower bad)
export const roasTone = (r) => (r === null || r === undefined ? 'none' : r >= 3 ? 'hi' : r >= 2 ? 'mid' : 'lo');

export const mondayIso = (iso) => {
  const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const dow = dt.getUTCDay();
  dt.setUTCDate(dt.getUTCDate() + (dow === 0 ? -6 : 1 - dow));
  return dt.toISOString().slice(0, 10);
};

const PLATFORM_KEYS = ['meta', 'google'];
const platformKey = (p) => (PLATFORM_KEYS.includes(p) ? p : 'other');

// Projects with spend in the window, biggest spender first: every week has { spend, revenue, roas } (roas null when nothing was spent).
// weeks: the Mondays, the oldest first.
export function heatRows(rows, projects, weeks) {
  const nameOf = new Map(projects.map((p) => [String(p.id), p.name]));
  const by = new Map();
  rows.forEach((r) => {
    const key = String(r.project_id);
    const i = weeks.indexOf(r.week_start);
    if (i < 0) return;
    if (!by.has(key)) by.set(key, weeks.map(() => ({ spend: 0, revenue: 0 })));
    const cell = by.get(key)[i];
    cell.spend += num(r.data?.spend);
    cell.revenue += num(r.data?.revenue);
  });
  return [...by.entries()]
    .map(([id, cells]) => ({ id, name: nameOf.get(id) || `#${id}`, total: cells.reduce((s, c) => s + c.spend, 0), weeks: cells.map((c) => ({ ...c, roas: roasOf(c.revenue, c.spend) })) }))
    .filter((p) => p.total > 0)
    .sort((a, b) => b.total - a.total);
}

// The flow of the month: the platforms on the left (Meta, Google, other), the projects on the right (spend, revenue, ROAS), the links between them.
export function sankeyData(monthRows, projects) {
  const nameOf = new Map(projects.map((p) => [String(p.id), p.name]));
  const proj = new Map();
  const left = { meta: 0, google: 0, other: 0 };
  const links = new Map();
  monthRows.forEach((r) => {
    const spend = num(r.data?.spend);
    if (spend <= 0) return;
    const id = String(r.project_id);
    const pk = platformKey(r.platform);
    const cur = proj.get(id) || { id, name: nameOf.get(id) || `#${id}`, spend: 0, revenue: 0 };
    cur.spend += spend; cur.revenue += num(r.data?.revenue);
    proj.set(id, cur);
    left[pk] += spend;
    links.set(`${pk}|${id}`, (links.get(`${pk}|${id}`) || 0) + spend);
  });
  const right = [...proj.values()].map((p) => ({ ...p, roas: roasOf(p.revenue, p.spend) })).sort((a, b) => b.spend - a.spend);
  const labels = { meta: 'Meta', google: 'Google', other: 'Інше' };
  return {
    left: Object.entries(left).filter(([, v]) => v > 0).map(([key, spend]) => ({ key, label: labels[key], spend })),
    right,
    links: [...links.entries()].map(([k, spend]) => { const [from, to] = k.split('|'); return { from, to, spend }; }),
    total: right.reduce((s, p) => s + p.spend, 0),
  };
}

// Month to date and the forecast: spend so far, what the month will be at this pace, and the whole of the last month. today: 'YYYY-MM-DD'.
export function pacing(monthRows, prevMonthRows, today) {
  const [y, m, d] = String(today).split('-').map(Number);
  const dim = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const spent = monthRows.reduce((s, r) => s + num(r.data?.spend), 0);
  const prev = prevMonthRows.reduce((s, r) => s + num(r.data?.spend), 0);
  if (!spent) return null;
  const forecast = d > 0 ? (spent / d) * dim : spent;
  return { spent, forecast, prev, day: d, dim, deltaPct: prev > 0 ? Math.round(((forecast - prev) / prev) * 100) : null };
}

// The status of the weekly report of every project for every week: 'final' | 'rework' | 'draft' | 'none'. Several reports of a week (one per platform) count as the worst of them.
const ORDER = { draft: 0, reviewed: 0, rework: 1, final: 2 };
export function weekStatusMatrix(statusRows, projects, weeks) {
  const cells = new Map();
  statusRows.forEach((r) => {
    const w = mondayIso(r.period_start);
    if (!weeks.includes(w)) return;
    const key = `${r.project_id}|${w}`;
    const prev = cells.get(key);
    if (prev === undefined || (ORDER[r.status] ?? 0) < (ORDER[prev] ?? 0)) cells.set(key, r.status);
  });
  const norm = (s) => (s === 'final' ? 'final' : s === 'rework' ? 'rework' : s ? 'draft' : 'none');
  return projects.map((p) => ({ id: String(p.id), name: p.name, weeks: weeks.map((w) => norm(cells.get(`${p.id}|${w}`))) }));
}

// How the last week stands: counts of final / rework / draft / none over the rows of the matrix.
export function disciplineCounts(matrix) {
  const out = { final: 0, rework: 0, draft: 0, none: 0 };
  matrix.forEach((r) => { out[r.weeks[r.weeks.length - 1]] += 1; });
  return out;
}

// The board of the month: spend, revenue, ROAS and the weekly spend for the sparkline (from the heat rows).
export function boardRows(monthRows, projects, heat) {
  const nameOf = new Map(projects.map((p) => [String(p.id), p.name]));
  const by = new Map();
  monthRows.forEach((r) => {
    const id = String(r.project_id);
    const cur = by.get(id) || { spend: 0, revenue: 0 };
    cur.spend += num(r.data?.spend); cur.revenue += num(r.data?.revenue);
    by.set(id, cur);
  });
  const spark = new Map(heat.map((h) => [h.id, h.weeks.map((w) => w.spend)]));
  return [...by.entries()]
    .map(([id, v]) => ({ id, name: nameOf.get(id) || `#${id}`, spend: v.spend, revenue: v.revenue, roas: roasOf(v.revenue, v.spend), spark: spark.get(id) || [] }))
    .sort((a, b) => b.spend - a.spend);
}
