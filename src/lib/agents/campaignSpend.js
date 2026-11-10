// «Витрати» by campaign and period (AI Agents, stage 4). Money of a campaign = Claude (ag_tasks.cost_usd) + Higgsfield (ag_creative_spend.usd), the same two sources the notices
// and the caps use (spendNotices.js). Pure code: the page reads the rows, this adds them up. Days and months are Kyiv days and months.
import { kyivInstant, kyivParts } from '../agentSchedule.js';

export const PERIODS = [
  { key: 'today', label: 'Сьогодні' },
  { key: 'week', label: '7 днів' },
  { key: 'month', label: 'Цей місяць' },
  { key: 'year', label: 'Цей рік' },
  { key: 'all', label: 'Увесь час' },
];

export const CAMPAIGN_STATUS = { draft: 'чернетка', active: 'працює', paused: 'пауза', done: 'завершена', cancelled: 'скасована' };

const round = (n) => Math.round(Number(n || 0) * 1e6) / 1e6;
const addDays = (date, n) => { const d = new Date(`${date}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

// The first instant of a period (Kyiv), or null for «all».
export function periodStart(key, now = new Date()) {
  const k = kyivParts(now);
  if (key === 'today') return kyivInstant(k.date, '00:00');
  if (key === 'week') return kyivInstant(addDays(k.date, -6), '00:00');
  if (key === 'month') return kyivInstant(`${k.date.slice(0, 8)}01`, '00:00');
  if (key === 'year') return kyivInstant(`${k.date.slice(0, 4)}-01-01`, '00:00');
  return null;
}

// campaigns: ag_campaigns rows; projects: [{ id, name }]; tasks: [{ campaign_id, cost_usd, created_at }]; spends: [{ campaign_id, usd, created_at }]
// → { rows, total: { claude, higgsfield, total }, days: [{ date, claude, higgsfield }] (the last 30 Kyiv days, oldest first) }
// A row: { id, name, project, status, claude, higgsfield, total (in the period), allTime (all the time: the cap is compared with it), cap, step, pct (0..1 or null), hot }
export function buildCampaignSpend({ campaigns = [], projects = [], tasks = [], spends = [], period = 'month', now = new Date() } = {}) {
  const from = periodStart(period, now);
  const fromT = from ? from.getTime() : -Infinity;
  const slot = new Map();
  const get = (id) => { const k = id ?? 'none'; if (!slot.has(k)) slot.set(k, { claude: 0, higgsfield: 0, allTime: 0 }); return slot.get(k); };
  const today = kyivParts(now).date;
  const dayMap = new Map(Array.from({ length: 30 }, (_, i) => [addDays(today, i - 29), { date: addDays(today, i - 29), claude: 0, higgsfield: 0 }]));

  const put = (id, usd, at, kind) => {
    const v = Number(usd) || 0;
    if (v <= 0) return;
    const s = get(id);
    s.allTime = round(s.allTime + v);
    const t = new Date(at).getTime();
    if (t >= fromT) s[kind] = round(s[kind] + v);
    const d = dayMap.get(kindDay(at));
    if (d) d[kind] = round(d[kind] + v);
  };
  tasks.forEach((x) => put(x.campaign_id, x.cost_usd, x.created_at, 'claude'));
  spends.forEach((x) => put(x.campaign_id, x.usd, x.created_at, 'higgsfield'));

  const projectName = (id) => projects.find((p) => p.id === id)?.name || (id == null ? '' : `Проєкт ${id}`);
  const rows = [];
  campaigns.forEach((c) => {
    const s = slot.get(c.id) || { claude: 0, higgsfield: 0, allTime: 0 };
    const total = round(s.claude + s.higgsfield);
    const cap = c.spend_cap_usd != null && Number(c.spend_cap_usd) > 0 ? Number(c.spend_cap_usd) : null;
    const pct = cap ? Math.min(1, s.allTime / cap) : null;
    // a campaign that never spent and is not at work would only add noise to the list
    if (!total && !s.allTime && !['active', 'paused'].includes(c.status)) return;
    rows.push({ id: c.id, name: c.name || `Операція ${c.id}`, project: projectName(c.project_id), status: c.status, claude: s.claude, higgsfield: s.higgsfield, total, allTime: s.allTime, cap, step: c.notify_step_usd == null ? 2 : Number(c.notify_step_usd), pct, hot: pct != null && pct >= 0.9 });
    slot.delete(c.id);
  });
  const none = slot.get('none') || { claude: 0, higgsfield: 0, allTime: 0 };
  slot.forEach((s, k) => { if (k !== 'none') { none.claude = round(none.claude + s.claude); none.higgsfield = round(none.higgsfield + s.higgsfield); none.allTime = round(none.allTime + s.allTime); } }); // a campaign that is gone still spent
  if ((none.claude || none.higgsfield || none.allTime)) rows.push({ id: null, name: 'Без операції', project: 'проєктні агенти, SMM та інші', status: null, claude: none.claude, higgsfield: none.higgsfield, total: round(none.claude + none.higgsfield), allTime: none.allTime, cap: null, step: null, pct: null, hot: false });

  rows.sort((a, b) => b.total - a.total || b.allTime - a.allTime || String(a.name).localeCompare(String(b.name), 'uk'));
  const sum = (k) => round(rows.reduce((s, r) => s + r[k], 0));
  return { rows, total: { claude: sum('claude'), higgsfield: sum('higgsfield'), total: sum('total') }, days: [...dayMap.values()] };
}

const kindDay = (iso) => kyivParts(new Date(iso)).date;

// ---- the months side by side (spec §6: «сравнение месяцев»): the last `months` Kyiv months, oldest first.
// → [{ month: 'YYYY-MM', label: 'листопад 2026', claude, higgsfield, total, delta: total − the month before (null for the first), pct: the change in % (null when the month before was 0) }]
const MONTHS_UK = ['січень', 'лютий', 'березень', 'квітень', 'травень', 'червень', 'липень', 'серпень', 'вересень', 'жовтень', 'листопад', 'грудень'];
export function monthlySpend({ tasks = [], spends = [], now = new Date(), months = 6 } = {}) {
  const cur = kyivParts(now).date.slice(0, 7);
  let [y, m] = cur.split('-').map(Number);
  const keys = [];
  for (let i = 0; i < months; i += 1) { keys.unshift(`${y}-${String(m).padStart(2, '0')}`); m -= 1; if (m === 0) { m = 12; y -= 1; } }
  const map = new Map(keys.map((k) => [k, { month: k, label: `${MONTHS_UK[Number(k.slice(5)) - 1]} ${k.slice(0, 4)}`, claude: 0, higgsfield: 0, total: 0 }]));
  const put = (usd, at, kind) => { const v = Number(usd) || 0; const row = v > 0 ? map.get(kindDay(at).slice(0, 7)) : null; if (row) { row[kind] = round(row[kind] + v); row.total = round(row.total + v); } };
  tasks.forEach((x) => put(x.cost_usd, x.created_at, 'claude'));
  spends.forEach((x) => put(x.usd, x.created_at, 'higgsfield'));
  const rows = [...map.values()];
  return rows.map((r, i) => {
    const prev = i ? rows[i - 1].total : null;
    return { ...r, delta: prev == null ? null : round(r.total - prev), pct: prev ? Math.round(((r.total - prev) / prev) * 100) : null };
  });
}
