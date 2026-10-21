// «Історія проекту»: the saved reports of a project grouped into month cards, and the approval flow of one report.
// Pure functions (no database, no network), so scripts/check-core.mjs tests all of it.
//
// A month card holds the weekly reports of that month (weeks are cut at the month borders: Monday to Sunday, the first and the last
// week short, see computeWeeksForMonth), the monthly report and anything else saved for the month. The «combined» document is a VIEW of
// the card (the weeks one under another, then the month), it is not stored.
//
// The report status keeps its three database values and gets new names: draft = «Чернетка», reviewed = «На затвердженні»
// (sent to the responsible people), final = «Затверджено» (the only status a client ever sees).
import { computeWeeksForMonth } from './dateHelpers.js';

export const DRAFT = 'draft';
export const PENDING = 'reviewed';
export const APPROVED = 'final';
export const REPORT_STATUS = { [DRAFT]: 'Чернетка', [PENDING]: 'На затвердженні', [APPROVED]: 'Затверджено' };

const MONTHS_UK = ['Січень', 'Лютий', 'Березень', 'Квітень', 'Травень', 'Червень', 'Липень', 'Серпень', 'Вересень', 'Жовтень', 'Листопад', 'Грудень'];
const pad = (n) => String(n).padStart(2, '0');
export const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const monthKey = (iso) => String(iso).slice(0, 7);
export const monthLabel = (key) => `${MONTHS_UK[Number(key.slice(5, 7)) - 1]} ${key.slice(0, 4)}`;
export const monthRange = (key) => {
  const y = Number(key.slice(0, 4));
  const m = Number(key.slice(5, 7));
  return { start: `${key}-01`, end: ymd(new Date(y, m, 0)) };
};

// The weeks of a month, cut at its borders: [{ n, start, end }] with ISO dates.
export function monthWeeks(key) {
  return computeWeeksForMonth(Number(key.slice(0, 4)), Number(key.slice(5, 7))).map((w) => ({ n: w.index, start: ymd(w.start), end: ymd(w.end) }));
}

const newest = (a, b) => (String(a.updated_at || '') >= String(b.updated_at || '') ? a : b);

// rows of project_reports of ONE scope (one platform) → month cards, newest month first. The current month is always there.
export function buildMonths(rows, todayIso) {
  const keys = new Set(rows.map((r) => monthKey(r.period_start)));
  keys.add(monthKey(todayIso));
  return [...keys].sort().reverse().map((key) => {
    const weeks = monthWeeks(key).map((w) => ({ ...w, row: null }));
    const range = monthRange(key);
    let monthly = null;
    const others = [];
    rows.filter((r) => monthKey(r.period_start) === key).forEach((r) => {
      // a week belongs to the card when it starts on the card's week and does not run past the month (an old Monday-based week that spans two months stays among the others)
      const week = r.period_type === 'weekly' && r.period_end <= range.end ? weeks.find((w) => w.start === r.period_start) : null;
      if (week) week.row = week.row ? newest(week.row, r) : r;
      else if (r.period_type === 'monthly' && r.period_start === `${key}-01`) {
        if (monthly) { const keep = newest(monthly, r); others.push(keep === monthly ? r : monthly); monthly = keep; } else monthly = r;
      }
      else others.push(r);
    });
    const count = (status) => weeks.filter((w) => w.row?.status === status).length;
    const counts = { total: weeks.length, approved: count(APPROVED), pending: count(PENDING), draft: count(DRAFT), missing: weeks.filter((w) => !w.row).length };
    return {
      key, label: monthLabel(key), ...range, weeks, monthly, others, counts,
      complete: counts.approved === counts.total && monthly?.status === APPROVED,
      updatedAt: [...weeks.map((w) => w.row?.updated_at), monthly?.updated_at, ...others.map((o) => o.updated_at)].filter(Boolean).sort().pop() || null,
    };
  });
}

// Who may approve: the people chosen in the agent's settings; when nobody is chosen yet, anyone with access (as before).
export function canApprove(email, approvers) {
  const list = (approvers || []).map((e) => String(e).toLowerCase());
  return !list.length || list.includes(String(email || '').toLowerCase());
}

// What the person can do with a report in this status: [{ action, label, primary? }].
export function reportActions(status, approver) {
  if (status === DRAFT) return [{ action: 'send', label: 'На затвердження', primary: true }];
  if (status === PENDING) return approver ? [{ action: 'approve', label: 'Затвердити', primary: true }, { action: 'return', label: 'Повернути на доопрацювання' }] : [];
  if (status === APPROVED) return approver ? [{ action: 'reopen', label: 'Відкликати затвердження' }] : [];
  return [];
}

// The new status and the note of the review for an action. `data.review` is kept inside the report: who sent it, who approved it, why it was returned.
export function reviewPatch(row, action, by, note = '', at = new Date().toISOString()) {
  const prev = row?.data?.review || {};
  if (action === 'send') return { status: PENDING, review: { ...prev, sentBy: by, sentAt: at, returnedNote: '' } };
  if (action === 'approve') return { status: APPROVED, review: { ...prev, approvedBy: by, approvedAt: at } };
  if (action === 'return') return { status: DRAFT, review: { ...prev, returnedBy: by, returnedAt: at, returnedNote: String(note || '').trim().slice(0, 1000) } };
  if (action === 'reopen') return { status: PENDING, review: { ...prev, reopenedBy: by, reopenedAt: at, approvedBy: null, approvedAt: null } };
  throw new Error('Невідома дія: ' + action);
}

// A client sees only approved reports.
export const clientVisible = (rows) => (rows || []).filter((r) => r.status === APPROVED);
