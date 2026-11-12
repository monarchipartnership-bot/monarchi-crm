// «Результати AI команди» (owner, 2026-11-12): the tab of the project card that replaced the flat list «Готові матеріали». A RUN is one pass of a team: a regular, a seasonal or a one-off task of
// the creative team (a row of ag_creative_requests), or a one-off analysis / strategy of the analytics team (a row of ag_deliverables). The list shows the runs with a mark (regular / seasonal /
// one-off), the date, the title and what waits for the person; a run opens as a card with the creatives in groups (to approve / approved / returned). Pure code: the page and the tests use it.

export const RUN_KIND = { regular: 'Регулярний', seasonal: 'Сезонний', oneoff: 'Разовий' };
export const RUN_FILTERS = [['all', 'Усі'], ['wait', 'Чекають рішення'], ['ok', 'Усе перевірено'], ['work', 'В роботі']];
export const GROUPS = [
  { key: 'review', label: 'Для підтвердження', statuses: ['review'] },
  { key: 'approved', label: 'Підтверджені', statuses: ['approved'] },
  { key: 'rejected', label: 'Повернуті', statuses: ['rejected'] },
];
// The agents of the analytics team work by schedule and together: what they delivered in one pass is ONE run («Аналітика й оптимізація»). The research and the strategy are one-off tasks
// that a person starts, each is a run of its own.
const ANALYTICS_ROLES = new Set(['meta_analyst', 'google_analyst', 'tiktok_analyst', 'tracking_integrity', 'meta_optimizer', 'google_optimizer', 'cross_channel_report', 'account_manager']);
const PASS_GAP_MS = 45 * 60000; // materials made less than this apart belong to one pass

const at = (v) => { const t = new Date(v).getTime(); return Number.isNaN(t) ? 0 : t; };
const n = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

// The mark of a creative run: a regular task of the operation, a seasonal one (a regular task with a period) or a one-off one. regulars: the regular tasks of the operation [{ id, seasonal }].
export function runKindOf(request, regulars = []) {
  if (request.kind !== 'regular') return 'oneoff';
  const r = regulars.find((x) => x.id === (request.regularId || 'r1'));
  return r?.seasonal ? 'seasonal' : 'regular';
}

// The state of a creative run for the list: wait (something waits for the person), work (the agents or the pictures are being made), ok (everything made is decided), stopped.
//   → { state, text }
export function creativeRunState(request) {
  const c = request.creatives || {};
  const open = n(c.planned) + n(c.failed);
  if (n(c.review) > 0) return { state: 'wait', text: `Чекають рішення: ${c.review}` };
  if (['draft', 'running'].includes(request.status) && !n(c.total)) return { state: 'work', text: 'Агенти працюють' };
  if (n(c.producing) > 0) return { state: 'work', text: `Генеруються картинки: ${c.producing}` };
  if (open > 0) return { state: 'wait', text: `Чекає підтвердження генерації: ${open}` };
  if (n(c.approved) + n(c.rejected) > 0) return { state: 'ok', text: n(c.rejected) && !n(c.approved) ? `Повернуто: ${c.rejected}` : 'Усе перевірено' };
  if (request.status === 'problem') return { state: 'stopped', text: 'Зупинився з помилкою' };
  return { state: 'work', text: 'Агенти працюють' };
}

// cockpits: the cabinets of the project's operations (lib/agents/projectCockpit.js buildCockpit, with .regulars); deliverables: ag_deliverables rows of the project.
// → [{ id, source: 'creative' | 'deliverable', title, kind, kindLabel, team, date, state, stateText, counts, items, ... }] the runs that wait for the person first, then the newest
export function buildRuns({ cockpits = [], deliverables = [] } = {}) {
  const runs = [];
  cockpits.forEach((c) => {
    (c.requests || []).forEach((r) => {
      const kind = runKindOf(r, c.regulars || []);
      const st = creativeRunState(r);
      runs.push({
        id: `c:${c.id}:${r.id}`, source: 'creative', campaignId: c.id, requestId: r.id, title: r.title || r.goal || `Завдання №${r.id}`, kind, kindLabel: RUN_KIND[kind], team: 'Креативи',
        date: r.createdAt || r.updatedAt || null, state: st.state, stateText: st.text, counts: r.creatives || {}, items: r.items || [], stages: r.stages || [], goal: r.goal || '',
        cost: (r.cost?.model || 0) + (r.cost?.higgsfield || 0), steps: r.steps || [],
      });
    });
  });
  // the analytics team and the one-off research of the project (the creatives have their own runs, the reports their own tab)
  const others = deliverables.filter((d) => !['creative', 'report'].includes(d.kind));
  const pass = others.filter((d) => ANALYTICS_ROLES.has(d.meta?.role)).sort((a, b) => at(a.created_at) - at(b.created_at));
  const passes = [];
  pass.forEach((d) => { const last = passes[passes.length - 1]; if (last && at(d.created_at) - at(last[last.length - 1].created_at) < PASS_GAP_MS) last.push(d); else passes.push([d]); });
  const groupRun = (list, title, kind, team) => {
    const waiting = list.filter((d) => d.status === 'draft').length;
    return {
      id: `d:${list[0].id}`, source: 'deliverable', deliverableIds: list.map((d) => d.id), title, kind, kindLabel: RUN_KIND[kind], team, date: list[list.length - 1].created_at,
      state: waiting ? 'wait' : 'ok', stateText: waiting ? `Чекають рішення: ${waiting}` : 'Усе перевірено', counts: {}, items: [], stages: [], cost: 0,
    };
  };
  passes.forEach((list) => runs.push(groupRun(list, 'Аналітика й оптимізація', 'regular', 'Аналітика')));
  others.filter((d) => !ANALYTICS_ROLES.has(d.meta?.role)).forEach((d) => runs.push({ ...groupRun([d], d.title, 'oneoff', 'Аналітика'), stateText: d.status === 'draft' ? 'Чекає рішення' : d.status === 'approved' ? 'Схвалено' : 'Повернуто' }));
  return runs.sort((a, b) => (a.state === 'wait' ? 0 : 1) - (b.state === 'wait' ? 0 : 1) || at(b.date) - at(a.date));
}

export const filterRuns = (runs, key) => (key === 'all' ? runs : runs.filter((r) => r.state === key));
export const runCounts = (runs) => Object.fromEntries(RUN_FILTERS.map(([k]) => [k, filterRuns(runs, k).length]));

// The pictures of a run split into the groups of the card; the pictures that are being made or failed go to the last group.
export function groupItems(items = []) {
  const known = new Set(GROUPS.flatMap((g) => g.statuses));
  const groups = GROUPS.map((g) => ({ ...g, items: items.filter((i) => g.statuses.includes(i.status)) }));
  const rest = items.filter((i) => !known.has(i.status));
  return rest.length ? [...groups, { key: 'other', label: 'Генеруються й не вдалися', statuses: [], items: rest }] : groups;
}

// «12.11, 14:32»
export function dateTimeText(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const p = (x) => String(x).padStart(2, '0');
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}, ${p(d.getHours())}:${p(d.getMinutes())}`;
}
