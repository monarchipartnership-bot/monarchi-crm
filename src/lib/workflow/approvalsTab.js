// The tab «Апруви» of a project (owner's choice A, 2026-11-24): what waits for the manager now, the road of the decisions, and the history. PURE functions on rows of wf_*.
// state = the row of wf_project_state, approvals = rows of wf_approvals of ONE project.
import { APPROVAL_KIND, buildQueue } from './view.js';

export const ROAD = [
  { kind: 'strategy', title: 'Апрув 1', hint: 'стратегія і креативи' },
  { kind: 'client', title: 'Відповідь клієнта', hint: 'записує менеджер' },
  { kind: 'launch', title: 'Апрув 2', hint: 'запуск у кабінеті' },
  { kind: 'changes', title: 'Апрув 3', hint: 'зміни й план місяця' },
];
const byIdDesc = (a, b) => b.id - a.id;
const same = (a, b) => Number(a) === Number(b); // the id of the route is a string, the rows hold numbers

// everything that waits for the manager in this project: the pending approvals and the client answer that is still to be recorded. Oldest first.
export function pendingList({ projectId, state, approvals = [] }) {
  const mine = approvals.filter((a) => same(a.project_id, projectId));
  return buildQueue({ projects: {}, states: state ? [state] : [], approvals: mine }).filter((x) => same(x.projectId, projectId));
}
export const pendingItem = (d) => pendingList(d)[0] || null;
export const pendingCount = (d) => pendingList(d).length;

// the four steps of the road: current (waits for you) · done · returned · todo
export function roadOf({ projectId, state, approvals = [] }) {
  const pend = pendingItem({ projectId, state, approvals });
  const mine = approvals.filter((a) => same(a.project_id, projectId));
  return ROAD.map((r) => {
    const last = mine.filter((a) => a.kind === r.kind).sort(byIdDesc)[0];
    let status = 'todo';
    if (pend && pend.kind === r.kind) status = 'current';
    else if (last?.status === 'approved') status = 'done';
    else if (last?.status === 'returned') status = 'returned';
    else if (last?.status === 'pending') status = 'current';
    const note = { current: 'чекає на вас', done: 'схвалено', returned: 'повернуто', todo: r.hint }[status];
    return { ...r, status, note, at: status === 'done' || status === 'returned' ? last?.decided_at || null : null };
  });
}

// the decided approvals, the newest first: what, when, who, with which comment
export function historyOf(approvals = []) {
  return approvals
    .filter((a) => a.status === 'approved' || a.status === 'returned')
    .map((a) => ({ id: a.id, kind: a.kind, title: APPROVAL_KIND[a.kind]?.title || a.kind, status: a.status, at: a.decided_at || a.requested_at || null, who: a.decided_by || '', comment: a.comment || '' }))
    .sort((a, b) => (new Date(b.at || 0) - new Date(a.at || 0)) || (b.id - a.id));
}

// the headline of the tab
export function headlineOf(item) {
  if (!item) return { tone: 'mute', title: 'Зараз нічого не чекає на вас', text: 'Наступне рішення з’явиться тут, коли агенти завершать свою частину. Лічильник на вкладці покаже, що воно чекає.' };
  const info = APPROVAL_KIND[item.kind] || { title: item.kind, what: '' };
  return { tone: 'warn', title: `Чекає на вас: ${info.title}`, text: info.what };
}
