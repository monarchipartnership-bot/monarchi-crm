// The POOL OF TASKS of a project (document: «Пул задач: задачі з доказом, типом, пріоритетом, виконавцем, статусом»; step A10 page, concept «Мій день» with the block of blockers).
// Everything the agents found or prepared lands here, and so do the drafts of messages to the client. Pure code, checked in scripts/check-workflow.mjs.
export const TYPE_LABEL = { site: 'Сайт', creatives: 'Креативи', ads: 'Реклама', tracking: 'Трекінг', brand: 'Бренд', client: 'Клієнт' };
export const OWNER_LABEL = { manager: 'Менеджер', client: 'Клієнт', client_dev: 'Розробник клієнта', agent: 'Агент' };
export const STATUS_LABEL = { proposed: 'Нова', approved: 'Погоджена', in_progress: 'В роботі', done: 'Зроблено', rejected: 'Відхилено' };
export const PRIORITY_LABEL = { high: 'Високий', medium: 'Середній', low: 'Низький' };

const SOURCE = {
  'researcher/site': 'Розділ «Сайт»', 'researcher/competitors': 'Ринок і конкуренти', 'researcher/audience': 'Аудиторія', 'researcher/audit': 'Аудит кабінету', 'researcher/unit_economy': 'Unit Economy', 'researcher/intake': 'Перевірка кабінетів',
  'creator/materials_ideas': 'Креативи (матеріали)', 'creator/first_creatives': 'Креативи (готові)', 'strategist/strategy': 'Стратегія', 'mediabuyer/launch': 'Перевірка перед запуском', 'mediabuyer/optimize': 'Оптимізація',
  'support/onboarding': 'Супровід: онбординг', 'support/payment_reminder': 'Супровід: оплата', 'support/weekly_report': 'Супровід: тижневий фідбек', 'support/monthly_report': 'Супровід: місячний фідбек',
};
export const sourceLabel = (t) => (t.created_by_kind === 'human' ? 'Додано вручну' : SOURCE[t.created_by] || (t.created_by ? String(t.created_by) : 'Агент'));

// what stops the launch: the tasks made by the check before the launch and by the strategy (what the client owes before the start)
export const LAUNCH_BLOCKERS = new Set(['mediabuyer/launch', 'strategist/strategy']);
export const isOpen = (t) => ['proposed', 'approved', 'in_progress'].includes(t.status);
export const isBlocker = (t) => isOpen(t) && t.created_by_kind !== 'human' && LAUNCH_BLOCKERS.has(t.created_by);
export const DRAFT_MARK = 'Чернетка:\n';
const FEEDBACK_MARK = '\nЧернетка листа клієнту\n';
// the evidence of a task: a plain note, a draft («Чернетка:» in front), or a note with a draft after the line «Чернетка листа клієнту»
export function parseEvidence(ev) {
  const t = String(ev || '');
  if (t.startsWith(DRAFT_MARK)) return { note: '', draft: t.slice(DRAFT_MARK.length).trim() };
  const i = t.indexOf(FEEDBACK_MARK);
  if (i >= 0) return { note: t.slice(0, i).trim(), draft: t.slice(i + FEEDBACK_MARK.length).trim() };
  return { note: t.trim(), draft: '' };
}
export const hasDraft = (t) => !!parseEvidence(t.evidence).draft;

const ymd = (d) => d.toISOString().slice(0, 10);
// → 'overdue' | 'today' | 'soon' (within 3 days) | null
export function dueState(t, today = new Date()) {
  if (!t.due_date || !isOpen(t)) return null;
  const a = ymd(today), n = Math.round((new Date(t.due_date + 'T00:00:00Z') - new Date(a + 'T00:00:00Z')) / 864e5);
  return n < 0 ? 'overdue' : n === 0 ? 'today' : n <= 3 ? 'soon' : null;
}
export const ageDays = (t, now = new Date()) => Math.max(0, Math.floor((now - new Date(t.created_at || now)) / 864e5));

const PRIO = { high: 0, medium: 1, low: 2 };
const sortTasks = (a, b) => (PRIO[a.priority] ?? 1) - (PRIO[b.priority] ?? 1) || String(a.due_date || '9999').localeCompare(String(b.due_date || '9999')) || a.id - b.id;

export const FILTERS = [['all', 'Усі'], ['mine', 'Мої'], ['blockers', 'Блокують запуск'], ['drafts', 'Чернетки листів']];
export function filterTasks(tasks, f) {
  return tasks.filter((t) => (f === 'mine' ? t.owner === 'manager' && isOpen(t) : f === 'blockers' ? isBlocker(t) : f === 'drafts' ? hasDraft(t) && isOpen(t) : true));
}
export const filterCounts = (tasks) => Object.fromEntries(FILTERS.map(([k]) => [k, filterTasks(tasks, k).length]));

// the groups of the feed, in the order a manager works: what burns today, the rest of the manager's tasks, what we wait for, what is done
export function groupTasks(tasks, today = new Date()) {
  const open = tasks.filter(isOpen), mine = open.filter((t) => t.owner === 'manager');
  const hot = (t) => t.priority === 'high' || ['overdue', 'today'].includes(dueState(t, today));
  const groups = [
    { key: 'hot', title: 'Горить, сьогодні', items: mine.filter(hot) },
    { key: 'week', title: 'Цього тижня', items: mine.filter((t) => !hot(t)) },
    { key: 'waiting', title: 'Чекаємо клієнта, розробника й агентів', items: open.filter((t) => t.owner !== 'manager') },
    { key: 'done', title: 'Зроблено', items: tasks.filter((t) => !isOpen(t)).slice(0, 20) },
  ];
  return groups.map((g) => ({ ...g, items: [...g.items].sort(g.key === 'done' ? (a, b) => b.id - a.id : sortTasks) })).filter((g) => g.items.length);
}

// the line at the top of the page: what to do today and who we are waiting for
export function digest(tasks, today = new Date()) {
  const open = tasks.filter(isOpen);
  const hot = open.filter((t) => t.owner === 'manager' && (t.priority === 'high' || ['overdue', 'today'].includes(dueState(t, today))));
  const wait = (o) => open.filter((t) => t.owner === o).length;
  const parts = [];
  parts.push(hot.length ? `Сьогодні варто: ${hot.slice(0, 3).map((t) => t.title.replace(/\.$/, '')).join('; ')}${hot.length > 3 ? ` (ще ${hot.length - 3})` : ''}.` : 'Сьогодні нічого не горить.');
  const w = [wait('client') && `клієнта ${wait('client')}`, wait('client_dev') && `розробника клієнта ${wait('client_dev')}`, wait('agent') && `агентів ${wait('agent')}`].filter(Boolean);
  if (w.length) parts.push(`Чекаємо: ${w.join(', ')}.`);
  return parts.join(' ');
}
