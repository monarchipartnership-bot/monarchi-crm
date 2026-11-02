// The numbers of the «Витрати» page of the AI Agents section (spec 2026-11-02, §7): what the agents cost by day / month / year, against the previous period,
// split by agent, by campaign and by project. Money = Claude (agent tasks) + Higgsfield (creatives) only. Pure code over plain rows:
//   row = { at: ISO time, usd, kind: 'claude' | 'higgsfield', agent?: key, campaignId?, projectId? }
import { kyivInstant, kyivParts } from '../agentSchedule.js';

const round = (n) => Math.round(Number(n || 0) * 100) / 100;
const pad = (n) => String(n).padStart(2, '0');
const addDays = (date, n) => { const d = new Date(`${date}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const addMonths = (ym, n) => { const [y, m] = ym.split('-').map(Number); const t = y * 12 + (m - 1) + n; return `${Math.floor(t / 12)}-${pad((t % 12) + 1)}`; };
const MONTHS = ['січень', 'лютий', 'березень', 'квітень', 'травень', 'червень', 'липень', 'серпень', 'вересень', 'жовтень', 'листопад', 'грудень'];

// kind: 'day' | 'month' | 'year'; anchor: a Kyiv date 'YYYY-MM-DD' inside the period (default: today).
// → { kind, anchor, from, to, prev: { from, to }, label, bucket: 'hour' | 'day' | 'month', keys: [bucket keys in order] } (from/to are ISO instants, `to` excluded)
export function periodRange(kind, anchor = kyivParts().date) {
  const at = (date) => kyivInstant(date, '00:00').toISOString();
  if (kind === 'day') {
    return { kind, anchor, from: at(anchor), to: at(addDays(anchor, 1)), prev: { from: at(addDays(anchor, -1)), to: at(anchor) }, label: anchor, bucket: 'hour', keys: Array.from({ length: 24 }, (_, h) => pad(h)) };
  }
  if (kind === 'month') {
    const ym = anchor.slice(0, 7);
    const days = new Date(Date.UTC(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)), 0)).getUTCDate();
    return { kind, anchor, from: at(`${ym}-01`), to: at(`${addMonths(ym, 1)}-01`), prev: { from: at(`${addMonths(ym, -1)}-01`), to: at(`${ym}-01`) }, label: `${MONTHS[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}`, bucket: 'day', keys: Array.from({ length: days }, (_, i) => `${ym}-${pad(i + 1)}`) };
  }
  const y = anchor.slice(0, 4);
  return { kind: 'year', anchor, from: at(`${y}-01-01`), to: at(`${Number(y) + 1}-01-01`), prev: { from: at(`${Number(y) - 1}-01-01`), to: at(`${y}-01-01`) }, label: y, bucket: 'month', keys: Array.from({ length: 12 }, (_, i) => `${y}-${pad(i + 1)}`) };
}

const within = (iso, from, to) => iso >= from && iso < to;
function bucketOf(range, iso) {
  const k = kyivParts(new Date(iso));
  return range.bucket === 'hour' ? pad(Math.floor(k.minutes / 60)) : range.bucket === 'day' ? k.date : k.date.slice(0, 7);
}

// names: { agent(key) → name, campaign(id) → name, project(id) → name } so the page decides how things are called.
export function buildSpendReport(rows = [], range, names = {}) {
  const now = rows.filter((r) => within(r.at, range.from, range.to));
  const prevTotal = round(rows.filter((r) => within(r.at, range.prev.from, range.prev.to)).reduce((s, r) => s + Number(r.usd || 0), 0));
  const sum = (list, kind) => round(list.filter((r) => !kind || r.kind === kind).reduce((s, r) => s + Number(r.usd || 0), 0));
  const total = sum(now);
  const series = range.keys.map((key) => ({ key, claude: 0, higgsfield: 0 }));
  const at = new Map(series.map((s) => [s.key, s]));
  now.forEach((r) => { const s = at.get(bucketOf(range, r.at)); if (s) s[r.kind] = round(s[r.kind] + Number(r.usd || 0)); });
  const group = (pick, name) => {
    const m = new Map();
    now.forEach((r) => { const id = pick(r) ?? 'none'; if (!m.has(id)) m.set(id, { id, claude: 0, higgsfield: 0, total: 0 }); const g = m.get(id); g[r.kind] = round(g[r.kind] + Number(r.usd || 0)); g.total = round(g.total + Number(r.usd || 0)); });
    return [...m.values()].map((g) => ({ ...g, name: g.id === 'none' ? 'Без прив’язки' : name?.(g.id) || String(g.id) })).sort((a, b) => b.total - a.total);
  };
  return {
    range, total, claude: sum(now, 'claude'), higgsfield: sum(now, 'higgsfield'),
    prevTotal, change: prevTotal > 0 ? Math.round(((total - prevTotal) / prevTotal) * 100) : null, // percent against the previous period; null when there was nothing to compare with
    series,
    byAgent: group((r) => r.agent, names.agent), byCampaign: group((r) => r.campaignId, names.campaign), byProject: group((r) => r.projectId, names.project),
  };
}

// The rows the report reads, from the two tables (the ledger of pictures and the tasks of the agents).
// tasks: ag_tasks rows { finished_at, cost_usd, agent_id, campaign_id }; spends: ag_creative_spend rows { created_at, usd, campaign_id }; agentKeyOf(id) → role/key; projectOf(campaignId) → project id.
export function spendRows({ tasks = [], spends = [], agentKeyOf = (id) => id, projectOf = () => null }) {
  const out = [];
  tasks.forEach((t) => { const usd = Number(t.cost_usd) || 0; if (usd > 0 && t.finished_at) out.push({ at: t.finished_at, usd, kind: 'claude', agent: agentKeyOf(t.agent_id), campaignId: t.campaign_id ?? null, projectId: projectOf(t.campaign_id) }); });
  spends.forEach((s) => { const usd = Number(s.usd) || 0; if (usd > 0 && s.created_at) out.push({ at: s.created_at, usd, kind: 'higgsfield', agent: 'creative_maker', campaignId: s.campaign_id ?? null, projectId: projectOf(s.campaign_id) }); });
  return out;
}
