// The overview of ALL projects of the agent system (step A11, concept A «Пульт» of the mockup): for each started project, where it is,
// what it waits for and from whom, how long, and what the agents spent this month against the limit. PURE: rows of the wf_* tables in, rows to draw out.
import { STAGES, nowCard } from './view.js';

const OPEN_TASK = new Set(['proposed', 'approved', 'in_progress']);
const DAY = 86400000;

export const KIND = {
  failed: { label: 'Помилка', tone: 'bad', order: 0 },
  action: { label: 'Потрібна дія', tone: 'bad', order: 1 },
  wait: { label: 'Чекаємо', tone: 'warn', order: 2 },
  paused: { label: 'Пауза', tone: 'mute', order: 3 },
  ok: { label: 'Працює', tone: 'ok', order: 4 },
};
export const FILTERS = [['all', 'Усі'], ['action', 'Потрібна дія'], ['failed', 'Помилки'], ['wait', 'Чекаємо'], ['paused', 'Пауза']];

// the button that goes with a card of «Зараз»
const ACT_LABEL = { decide: 'Відкрити апрув', signoff: 'Записати відповідь клієнта', dossier: 'Відкрити досьє', brief: 'Відкрити бриф', tasks: 'Відкрити задачі', resume: 'Зняти паузу' };

export const monthStart = (d) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString();
const days = (iso, now) => (iso ? Math.max(0, Math.floor((now - new Date(iso)) / DAY)) : 0);

// the limit of a project: its own or the default of the system
export const capOf = (state, settings) => state?.cost_cap_usd ?? settings?.project_cap_default_usd ?? null;

// d = { projects: {id: {name}}, states, runs, approvals, tasks, journal, briefs: [projectId], settings, now }
// → { rows, counts, spent, cap, stopped, notStarted }
export function buildOverview({ projects = {}, states = [], runs = [], approvals = [], tasks = [], journal = [], briefs = [], settings = {}, now = new Date() } = {}) {
  const since = monthStart(now);
  const rows = [];
  for (const state of states) {
    const id = state.project_id;
    const myRuns = runs.filter((r) => r.project_id === id);
    const myApprovals = approvals.filter((a) => a.project_id === id);
    const myJournal = journal.filter((j) => j.project_id === id).sort((a, b) => b.id - a.id);
    const myTasks = tasks.filter((t) => t.project_id === id && OPEN_TASK.has(t.status));
    const card = nowCard({ state, runs: myRuns, approvals: myApprovals, hasBrief: briefs.includes(id), journal: myJournal });
    const waitingRun = myRuns.filter((r) => r.status === 'waiting').sort((a, b) => a.id - b.id)[0];
    const pending = myApprovals.filter((a) => a.status === 'pending').sort((a, b) => b.id - a.id)[0];
    let kind = 'ok';
    let who = '';
    let sinceIso = null;
    let override = null; // a clearer sentence than the card «Зараз» for the two waits the manager meets most
    if (state.paused) { kind = 'paused'; sinceIso = state.updated_at; }
    else if (card.tone === 'bad') {
      kind = 'failed';
      const stop = myJournal.find((j) => ['check_failed', 'skill_stopped', 'launch_stopped'].includes(j.action));
      sinceIso = stop?.at || myRuns.filter((r) => r.status === 'failed').sort((a, b) => b.id - a.id)[0]?.finished_at || null;
    } else if (card.tone === 'warn') {
      if (['decide', 'signoff', 'dossier', 'brief'].includes(card.action)) {
        kind = 'action'; who = 'Менеджер';
        sinceIso = pending?.requested_at || (card.action === 'signoff' ? myApprovals.filter((a) => a.kind === 'strategy' && a.status === 'approved').sort((a, b) => b.id - a.id)[0]?.decided_at : null) || state.updated_at;
      } else { // a run waits for something: for a limit (the manager raises it), for the client's data (a task of the client), or for the manager's own
        sinceIso = waitingRun?.state?.blocked_at || waitingRun?.finished_at || null;
        const owners = new Set(myTasks.map((t) => t.owner));
        if (/ліміт/i.test(waitingRun?.error || '')) { kind = 'action'; who = 'Менеджер'; override = { what: 'Ліміт витрат вичерпано', last: waitingRun.error }; }
        else if (!owners.has('manager') && (owners.has('client') || owners.has('client_dev'))) { kind = 'wait'; who = 'Клієнт'; override = { what: 'Чекаємо дані від клієнта', last: waitingRun?.error || card.text }; }
        else { kind = 'action'; who = 'Менеджер'; }
      }
    }
    const cost = myRuns.filter((r) => r.created_at >= since).reduce((s, r) => s + Number(r.cost_usd || 0), 0);
    const name = projects[id]?.name || `Проєкт ${id}`;
    rows.push({
      id, name, stage: state.stage, stageTitle: STAGES[state.stage]?.title || String(state.stage), kind, who, age: days(sinceIso, now),
      what: override?.what || card.title, last: override?.last ?? (card.text || ''), act: card.action, actLabel: ACT_LABEL[card.action] || '', approvalId: card.approvalId || null,
      paused: !!state.paused, cost, cap: capOf(state, settings), ownCap: state.cost_cap_usd ?? null,
    });
  }
  rows.sort((a, b) => KIND[a.kind].order - KIND[b.kind].order || b.age - a.age || a.name.localeCompare(b.name, 'uk'));
  const count = (k) => rows.filter((r) => r.kind === k).length;
  const spent = rows.reduce((s, r) => s + r.cost, 0);
  return {
    rows,
    counts: { all: rows.length, action: count('action'), failed: count('failed'), wait: count('wait'), paused: count('paused'), ok: count('ok'), needYou: count('action') + count('failed') },
    spent, cap: settings.monthly_cap_usd ?? null, stopped: !!settings.stopped,
  };
}

export const money = (x) => '$' + Number(x || 0).toFixed(2);
const pct = (a, b) => (b > 0 ? Math.min(100, Math.round((a / b) * 100)) : 0);
// the bar: how much of the limit is used, and whether it is time to worry (80% and more)
export const usage = (spent, cap) => ({ pct: pct(spent, cap), hot: cap > 0 && spent / cap >= 0.8, over: cap > 0 && spent >= cap });

// filter of the list
export const filterRows = (rows, f) => (f === 'all' ? rows : rows.filter((r) => r.kind === f));

const dn = (n) => `${n} ${n % 10 === 1 && n % 100 !== 11 ? 'день' : [2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100) ? 'дні' : 'днів'}`;

// The daily digest for the manager (it is sent to Telegram when the channel is chosen; until then it is only shown here).
export function digestText(ov) {
  const need = ov.rows.filter((r) => r.kind === 'action' || r.kind === 'failed');
  const lines = [need.length ? 'Доброго ранку! Сьогодні вам потрібно:' : 'Доброго ранку! Від вас сьогодні нічого не потрібно.'];
  for (const r of need) lines.push(`• ${r.name}: ${r.kind === 'failed' ? 'зупинено, ' : ''}${r.what}${r.age ? ` (${dn(r.age)})` : ''}`);
  const wait = ov.rows.filter((r) => r.kind === 'wait');
  if (wait.length) lines.push(`Чекаємо на клієнтів: ${wait.map((r) => `${r.name}${r.age ? ` (${r.age} дн.)` : ''}`).join(', ')}.`);
  const paused = ov.rows.filter((r) => r.kind === 'paused');
  if (paused.length) lines.push(`На паузі: ${paused.map((r) => r.name).join(', ')}.`);
  lines.push(`Витрати агентів цього місяця: ${money(ov.spent)}${ov.cap != null ? ` з ${money(ov.cap)}` : ''}.${ov.counts.failed ? ` Помилок: ${ov.counts.failed}.` : ' Помилок немає.'}`);
  if (ov.stopped) lines.push('Увага: усі агенти зупинено.');
  return lines.join('\n');
}
