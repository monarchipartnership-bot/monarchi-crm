// The journey of a lead and what waits for the person (the window «Зростання»). PURE: the page and the tests read the same functions.
//   new → scoring... → scored (verdict ask: the person decides) | drafting → draft (a letter waits) → ready (approved, the person sends) → sent → replied → won
//   rejected / skipped / failed end the journey; a lead can be rejected by the code (a hard refusal) or by the person.
import { FOLLOW_UP_DAYS } from './draftRules.js';

export const STATUS = {
  new: { tone: 'mute', label: 'Оцінюється' },
  scored: { tone: 'warn', label: 'Чекає вашого рішення' },
  drafting: { tone: 'mute', label: 'Пишемо лист' },
  draft: { tone: 'warn', label: 'Лист чекає вас' },
  ready: { tone: 'info', label: 'Готово до відправки' },
  sent: { tone: 'info', label: 'Надіслано' },
  replied: { tone: 'ok', label: 'Відповів' },
  won: { tone: 'ok', label: 'Клієнт' },
  rejected: { tone: 'mute', label: 'Відхилено' },
  skipped: { tone: 'mute', label: 'Пропущено' },
  failed: { tone: 'bad', label: 'Не вдалося оцінити' },
};
export const ENDED = new Set(['rejected', 'skipped', 'failed']);
export const SOURCE_LABEL = { site: 'Сайт', linkedin: 'LinkedIn', upwork: 'Upwork', manual: 'Вручну' };

// the first source we can guess from what the person pasted
export function classifySource(input = '') {
  const t = String(input).trim().toLowerCase();
  if (/linkedin\.com/.test(t)) return 'linkedin';
  if (/upwork\.com/.test(t)) return 'upwork';
  return 'manual';
}
export const firstUrl = (text = '') => (String(text).match(/https?:\/\/[^\s<>"')]+/i) || [null])[0];

// → the label and the tone of the capsule of a lead; a pending reply or letter of the lead changes it
export function capsuleOf(lead, drafts = []) {
  const mine = drafts.filter((d) => d.lead_id === lead.id && d.status === 'pending');
  if (lead.status === 'replied' && mine.some((d) => d.kind === 'reply')) return { tone: 'warn', label: 'Відповів: чекає вас' };
  if (lead.status === 'sent' && mine.some((d) => d.kind === 'followup')) return { tone: 'warn', label: 'Нагадування чекає вас' };
  return STATUS[lead.status] || STATUS.new;
}

// the decisions that wait for the person, in the order of the review: leads to decide, then letters, then replies
export function buildQueue({ leads = [], drafts = [] } = {}) {
  const byId = new Map(leads.map((l) => [l.id, l]));
  const out = [];
  for (const l of leads) {
    if (l.status === 'scored' && l.verdict === 'ask') out.push({ key: 'lead:' + l.id, kind: 'lead', leadId: l.id, title: l.name, sub: 'Писати цьому ліду?', at: l.updated_at || l.created_at });
  }
  for (const d of drafts) {
    if (d.status !== 'pending') continue;
    const l = byId.get(d.lead_id); if (!l || ENDED.has(l.status)) continue;
    const kind = d.kind === 'reply' ? 'reply' : 'letter';
    out.push({ key: 'draft:' + d.id, kind, leadId: l.id, draftId: d.id, title: l.name, sub: d.kind === 'reply' ? 'Відповідь клієнту' : d.kind === 'followup' ? 'Нагадування' : 'Лист', at: d.created_at });
  }
  const rank = { lead: 0, letter: 1, reply: 2 };
  return out.sort((a, b) => rank[a.kind] - rank[b.kind] || String(a.at).localeCompare(String(b.at)));
}

// the numbers of the path (Знайдено → Підходять → Написали → Відповіли → Клієнт)
export function funnel(leads = []) {
  const live = leads.filter((l) => l.status !== 'failed');
  return {
    found: live.length,
    fit: live.filter((l) => l.verdict === 'ok' || l.verdict === 'ask').length,
    wrote: live.filter((l) => l.sent_at || ['sent', 'replied', 'won'].includes(l.status)).length,
    replied: live.filter((l) => l.replied_at || ['replied', 'won'].includes(l.status)).length,
    won: live.filter((l) => l.status === 'won').length,
  };
}

// month counters for the cards of the page
export function monthStats(leads = [], now = new Date()) {
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
  const month = leads.filter((l) => String(l.created_at) >= from);
  const sent = leads.filter((l) => l.sent_at);
  return { newThisMonth: month.length, sent: sent.length, replied: sent.filter((l) => l.replied_at || ['replied', 'won'].includes(l.status)).length };
}

// leads that were written to and have not answered: the follow-up after 3 and after 7 days, at most two, then stop.
// followUpDrafts: the drafts of kind 'followup' that already exist for the lead. → [{ leadId, step, dueOn }]
export function followUpsDue(leads = [], drafts = [], today = new Date().toISOString().slice(0, 10)) {
  const out = [];
  for (const l of leads) {
    if (l.status !== 'sent' || !l.sent_at || l.replied_at) continue;
    const made = drafts.filter((d) => d.lead_id === l.id && d.kind === 'followup').length;
    if (made >= FOLLOW_UP_DAYS.length) continue;
    const dueOn = new Date(new Date(l.sent_at).getTime() + FOLLOW_UP_DAYS[made] * 86400000).toISOString().slice(0, 10);
    if (dueOn <= today && !drafts.some((d) => d.lead_id === l.id && d.kind === 'followup' && d.status === 'pending')) out.push({ leadId: l.id, step: made + 1, dueOn });
  }
  return out;
}

// the deals of the CRM that went quiet: the code watches them (no agent): no change of stage for N days while the deal is open
export function staleDeals(deals = [], { days = 7, now = new Date() } = {}) {
  const limit = now.getTime() - days * 86400000;
  return deals.filter((d) => !d.closed_at && !d.archived && new Date(d.stage_changed_at || d.updated_at || d.created_at).getTime() < limit)
    .map((d) => ({ id: d.id, title: d.title, quietDays: Math.floor((now.getTime() - new Date(d.stage_changed_at || d.updated_at || d.created_at).getTime()) / 86400000) }));
}
