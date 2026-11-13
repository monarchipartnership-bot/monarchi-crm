// «Історія проекту»: the saved reports of a project grouped into month cards, and the approval flow of one report.
// Pure functions (no database, no network), so scripts/check-core.mjs tests all of it.
//
// A month card holds the weekly reports of that month (whole Monday-to-Sunday weeks that start in the month; the last one may run into the next
// month, see reportWeeksForMonth), the monthly report and anything else saved for the month. The «combined» document is a VIEW of
// the card (the weeks one under another, then the month), it is not stored.
//
// A report is a draft (Чернетка: it is being worked on in «Робота над звітами»), in rework (Доробка: it was returned from the history) or final
// (Затверджено: it is in the history and the client sees it). The old value «reviewed» (На затвердженні) is read as a draft.
import { reportWeeksForMonth } from './dateHelpers.js';

export const DRAFT = 'draft';
export const REWORK = 'rework';
export const APPROVED = 'final';
export const REPORT_STATUS = { [DRAFT]: 'Чернетка', reviewed: 'Чернетка', [REWORK]: 'Доробка', [APPROVED]: 'Затверджено' };
// a report that is still being worked on (shown in «Робота над звітами»)
export const inWork = (status) => status === DRAFT || status === REWORK || status === 'reviewed';

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

// The month-to-date report of the agent renews itself until the month is over: by hand it can be neither saved, confirmed nor deleted meanwhile
// (a person saving it would stop the agent renewing it).
export const isRunning = (row, todayIso) => Boolean(row?.data?.toDate) && monthRange(monthKey(row.period_start)).end >= String(todayIso);

// The weeks of a month: whole Monday-to-Sunday weeks that start in it (the last one may run into the next month): [{ n, start, end }] with ISO dates.
export function monthWeeks(key) {
  return reportWeeksForMonth(Number(key.slice(0, 4)), Number(key.slice(5, 7))).map((w) => ({ n: w.index, start: ymd(w.start), end: ymd(w.end) }));
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
      // a week belongs to the card when it starts on the card's week (it may run into the next month); an old week cut short at the month's start stays among the others
      const week = r.period_type === 'weekly' ? weeks.find((w) => w.start === r.period_start) : null;
      if (week) week.row = week.row ? newest(week.row, r) : r;
      else if (r.period_type === 'monthly' && r.period_start === `${key}-01`) {
        if (monthly) { const keep = newest(monthly, r); others.push(keep === monthly ? r : monthly); monthly = keep; } else monthly = r;
      }
      else others.push(r);
    });
    const count = (status) => weeks.filter((w) => w.row?.status === status).length;
    const counts = { total: weeks.length, approved: count(APPROVED), rework: count(REWORK), draft: weeks.filter((w) => w.row && (w.row.status === DRAFT || w.row.status === 'reviewed')).length, missing: weeks.filter((w) => !w.row).length };
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

// What the person can do with a report in the history: only an approved one has an action there (return it for rework); everything else is worked on in
// «Робота над звітами».
export function reportActions(status, approver) {
  if (status === APPROVED) return approver ? [{ action: 'return', label: 'Повернути на доопрацювання' }] : [];
  return [];
}

// The new status and the note of the review for an action. `data.review` is kept inside the report: who approved it, who returned it and why.
//   approve: draft / rework → final;  return: final → rework, with the note.
export function reviewPatch(row, action, by, note = '', at = new Date().toISOString()) {
  const prev = row?.data?.review || {};
  if (action === 'approve') return { status: APPROVED, review: { ...prev, approvedBy: by, approvedAt: at } };
  if (action === 'return') return { status: REWORK, review: { ...prev, returnedBy: by, returnedAt: at, returnedNote: String(note || '').trim().slice(0, 1000), approvedBy: null, approvedAt: null } };
  throw new Error('Невідома дія: ' + action);
}

// A client sees only approved reports.
export const clientVisible = (rows) => (rows || []).filter((r) => r.status === APPROVED);
