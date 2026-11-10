// The notices about money of the AI Agents section (spec 2026-11-02, §7): a notice for every N dollars (default 2) spent on a campaign, and one total per day.
// Money = Claude (ag_tasks.cost_usd) + Higgsfield (ag_creative_spend.usd) only. Pure code: the server reads the rows and sends the messages, this decides what is due.
import { kyivInstant, kyivParts } from '../agentSchedule.js';

const round = (n) => Math.round(Number(n || 0) * 1e6) / 1e6;
const usd = (n) => `$${Number(n || 0).toFixed(2)}`;
const addDays = (date, n) => { const d = new Date(`${date}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// tasks: [{ campaign_id, cost_usd }]  spends: [{ campaign_id, usd }]  → Map<campaign_id, { claude, higgsfield, total }> (campaign_id null → key 'none')
export function campaignTotals(tasks = [], spends = []) {
  const out = new Map();
  const slot = (id) => { const k = id ?? 'none'; if (!out.has(k)) out.set(k, { claude: 0, higgsfield: 0, total: 0 }); return out.get(k); };
  tasks.forEach((t) => { const c = Number(t.cost_usd) || 0; if (c > 0) { const s = slot(t.campaign_id); s.claude = round(s.claude + c); s.total = round(s.total + c); } });
  spends.forEach((x) => { const c = Number(x.usd) || 0; if (c > 0) { const s = slot(x.campaign_id); s.higgsfield = round(s.higgsfield + c); s.total = round(s.total + c); } });
  return out;
}

// The whole steps passed: step 2, spent 5.3 → 4. A step of 0 or less switches the notices off for the campaign.
export const stepLevel = (total, step) => (Number(step) > 0 ? round(Math.floor(round(total) / Number(step) + 1e-9) * Number(step)) : 0);

// → [{ campaign, level, total, claude, higgsfield }] the campaigns that passed a new step since the last notice (several steps at once give ONE notice for the highest).
export function dueStepNotices(campaigns = [], totals) {
  const out = [];
  campaigns.forEach((c) => {
    if (c.status === 'cancelled') return;
    const t = totals.get(c.id);
    if (!t) return;
    const level = stepLevel(t.total, c.notify_step_usd);
    if (level > 0 && level > round(c.notified_usd)) out.push({ campaign: c, level, ...t });
  });
  return out;
}

// → true when the cap is set and reached
export const capReached = (campaign, total) => campaign?.spend_cap_usd != null && Number(campaign.spend_cap_usd) > 0 && round(total) >= Number(campaign.spend_cap_usd);

// The Kyiv day as [from, to) instants (ISO strings).
export function dayWindow(date) { return { from: kyivInstant(date, '00:00').toISOString(), to: kyivInstant(addDays(date, 1), '00:00').toISOString() }; }

// Is the daily total due now? It tells about yesterday and goes once, after the chosen hour (Kyiv).
// → { due, day } where `day` is the date it tells about.
export function digestDue({ settings, now = new Date() }) {
  if (!settings?.enabled) return { due: false };
  const k = kyivParts(now);
  const hour = Number.isInteger(settings.digest_hour) ? settings.digest_hour : 9;
  if (k.minutes < hour * 60) return { due: false };
  if (settings.last_digest_date && String(settings.last_digest_date) >= k.date) return { due: false };
  return { due: true, day: addDays(k.date, -1), today: k.date };
}

// rows of one day → { total, claude, higgsfield, rows: [{ campaignId, name, usd }] sorted from the biggest }
export function digestOf({ tasks = [], spends = [], campaigns = [] }) {
  const totals = campaignTotals(tasks, spends);
  const name = (id) => (id === 'none' ? 'Без операції' : campaigns.find((c) => c.id === id)?.label || `Операція ${id}`);
  const rows = [...totals.entries()].map(([id, t]) => ({ campaignId: id, name: name(id), usd: t.total })).sort((a, b) => b.usd - a.usd);
  const sum = (k) => round([...totals.values()].reduce((s, t) => s + t[k], 0));
  return { total: sum('total'), claude: sum('claude'), higgsfield: sum('higgsfield'), rows };
}

// ---- the texts (Telegram HTML: everything that comes from the data is escaped)
export function stepMessage(n) {
  const label = n.campaign.label || n.campaign.name || `Операція ${n.campaign.id}`;
  return {
    title: `Витрати: ${label} — ${usd(n.level)}`,
    plain: `Операція «${label}» витратила вже ${usd(n.total)} (Claude ${usd(n.claude)}, Higgsfield ${usd(n.higgsfield)}).`,
    html: `💸 <b>${esc(label)}</b>: вже ${usd(n.total)}\nClaude ${usd(n.claude)} · Higgsfield ${usd(n.higgsfield)}\nНаступне сповіщення при ${usd(n.level + Number(n.campaign.notify_step_usd))}.`,
  };
}

export function capMessage(campaign, total) {
  const label = campaign.label || campaign.name || `Операція ${campaign.id}`;
  return {
    title: `Ліміт витрат: ${label}`,
    plain: `Операція «${label}» досягла ліміту ${usd(campaign.spend_cap_usd)} (витрачено ${usd(total)}). Нові запуски зупинено, поки ви не підвищите ліміт.`,
    html: `🛑 <b>${esc(label)}</b>: ліміт ${usd(campaign.spend_cap_usd)} досягнуто (витрачено ${usd(total)}).\nНові запуски зупинено, поки ви не підвищите ліміт.`,
  };
}

export function digestMessage(day, d) {
  const lines = d.rows.slice(0, 8).map((r) => `• ${esc(r.name)} — ${usd(r.usd)}`);
  const more = d.rows.length > 8 ? `\n… і ще ${d.rows.length - 8}` : '';
  return {
    title: `Витрати за ${day}: ${usd(d.total)}`,
    plain: `За ${day} агенти витратили ${usd(d.total)} (Claude ${usd(d.claude)}, Higgsfield ${usd(d.higgsfield)}).`,
    html: `📊 <b>Витрати AI-агентів за ${day}: ${usd(d.total)}</b>\nClaude ${usd(d.claude)} · Higgsfield ${usd(d.higgsfield)}\n${lines.join('\n')}${more}`,
  };
}
