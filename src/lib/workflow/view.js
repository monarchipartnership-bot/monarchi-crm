// What the screens of the new agent system show (step A3; document «Робочий процес клієнта»). PURE functions: they take rows of the wf_* tables and
// return what is to be drawn, so they can be tested without a browser or a database. The words are the document's own.

export const STAGES = [
  { n: 0, title: 'Заведення', hint: 'бриф, оплата, договори' },
  { n: 1, title: 'Дослідження', hint: 'сайт, аудит, аудиторія' },
  { n: 2, title: 'Стратегія', hint: 'Апрув 1, підпис клієнта' },
  { n: 3, title: 'Запуск', hint: 'Апрув 2' },
  { n: 4, title: 'Оптимізація', hint: 'щодня' },
  { n: 5, title: 'Місяць', hint: 'план, Апрув 3' },
];

export const AGENTS = [
  { key: 'researcher', name: 'Дослідник', short: 'До', does: 'Сайт, аудиторія, конкуренти, аудит, юніт-економіка' },
  { key: 'creator', name: 'Креатор', short: 'Кр', does: 'Матеріали, ідеї та креативи' },
  { key: 'strategist', name: 'Стратег', short: 'Ст', does: 'Стратегія та план на місяць' },
  { key: 'mediabuyer', name: 'Медіабаєр', short: 'Ме', does: 'Запуск і оптимізація кампаній' },
  { key: 'support', name: 'Супровід', short: 'Су', does: 'Матеріали для звіту та спілкування з клієнтом' },
];
export const agentName = (key) => AGENTS.find((a) => a.key === key)?.name || key;

export const SKILL_LABEL = {
  intake: 'перевіряє кабінети', site: 'аналізує сайт', audience: 'вивчає аудиторію', unit_economy: 'рахує юніт-економіку', competitors: 'аналізує конкурентів', audit: 'аудитує кабінети',
  materials_ideas: 'готує матеріали та ідеї', first_creatives: 'робить перші креативи', rework_creatives: 'переробляє креативи за зауваженнями', strategy: 'складає стратегію', monthly_plan: 'складає план на місяць',
  launch: 'запускає кампанії', launch_check: 'перевіряє право запису в кабінет', optimize: 'оптимізує кампанії', onboarding: 'готує супровід', payment_reminder: 'дивиться календар оплат', weekly_report: 'готує тижневий фідбек', monthly_report: 'готує місячний фідбек',
};

export const SECTIONS = [
  { key: 'brief', name: 'Бриф', who: 'Менеджер' },
  { key: 'audit', name: 'Аудит кабінету', who: 'Дослідник' },
  { key: 'site', name: 'Сайт', who: 'Дослідник' },
  { key: 'audience', name: 'Аудиторія', who: 'Дослідник' },
  { key: 'unit_economy', name: 'Юніт-економіка', who: 'Дослідник' },
  { key: 'competitors', name: 'Конкуренти', who: 'Дослідник' },
  { key: 'materials', name: 'Матеріали', who: 'Креатор' },
  { key: 'ideas', name: 'Ідеї', who: 'Креатор' },
  { key: 'strategy', name: 'Стратегія', who: 'Стратег' },
  { key: 'creatives', name: 'Креативи (готові)', who: 'Креатор' },
  { key: 'launch', name: 'Знімок запуску', who: 'Медіабаєр' },
  { key: 'monthly_plan', name: 'План на місяць', who: 'Стратег' },
];
export const sectionName = (key) => SECTIONS.find((s) => s.key === key)?.name || key;

export const SECTION_STATUS = {
  empty: { label: 'Порожньо', tone: 'mute' },
  in_progress: { label: 'В роботі', tone: 'info' },
  draft: { label: 'Чернетка', tone: 'info' },
  on_approval: { label: 'На апруві', tone: 'warn' },
  approved: { label: 'Затверджено', tone: 'ok' },
  needs_rework: { label: 'Доопрацювання', tone: 'bad' },
};

// The manager's decisions in the order of the process. «client» is the sign-off of the client that the manager records.
export const APPROVAL_KIND = {
  strategy: { title: 'Апрув 1', what: 'Стратегія і перші креативи', check: 'Чи цілі, бюджет і розподіл відповідають брифу та юніт-економіці, чи перші креативи відповідають стратегії.', section: 'strategy' },
  client: { title: 'Підпис клієнта', what: 'Погодження стратегії клієнтом', check: 'Запишіть відповідь клієнта: погодив чи повернув. Якщо повернув, вкажіть, що саме виправити.', section: 'strategy' },
  launch: { title: 'Апрув 2', what: 'Запуск кампаній', check: 'Клієнт погодив, бюджет і налаштування кампаній готові до запуску.', section: 'strategy' },
  changes: { title: 'Апрув 3', what: 'Великі зміни або план на місяць', check: 'Чи план на місяць і зміни в кампаніях мають сенс за результатами минулого місяця.', section: 'monthly_plan' },
};
export const approvalTitle = (kind) => APPROVAL_KIND[kind]?.title || kind;

const byIdDesc = (a, b) => b.id - a.id;
const OPEN = new Set(['queued', 'running', 'waiting']);

// The answer of the client has to be recorded after the Апрув 1 of the manager (the orchestrator waits for it at the stage «Стратегія»).
export function signoffWanted(state, approvals) {
  if (!state || state.paused || state.stage !== 2) return null;
  const strategy = approvals.filter((a) => a.kind === 'strategy').sort(byIdDesc)[0];
  if (!strategy || strategy.status !== 'approved') return null;
  const client = approvals.filter((a) => a.kind === 'client').sort(byIdDesc)[0];
  if (client && client.id > strategy.id) return null;
  return strategy;
}

// The queue of the page «Апруви»: the pending approvals of all projects plus the client sign-offs that wait to be recorded. Oldest first.
// rows: { projects: {id: {name}}, states: [wf_project_state], approvals: [wf_approvals] }
export function buildQueue({ projects = {}, states = [], approvals = [] }) {
  const out = [];
  const name = (id) => projects[id]?.name || `Проєкт ${id}`;
  for (const a of approvals.filter((x) => x.status === 'pending')) out.push({ key: 'a' + a.id, id: a.id, projectId: a.project_id, project: name(a.project_id), kind: a.kind, since: a.requested_at, subject: a.subject || {}, virtual: false });
  for (const st of states) {
    const mine = approvals.filter((a) => a.project_id === st.project_id);
    const s = signoffWanted(st, mine);
    if (s) out.push({ key: 's' + st.project_id, id: null, projectId: st.project_id, project: name(st.project_id), kind: 'client', since: s.decided_at, subject: { section: 'strategy' }, virtual: true, after: s.id });
  }
  return out.sort((a, b) => new Date(a.since) - new Date(b.since));
}

export function ageText(iso, now = new Date()) {
  const m = Math.max(0, Math.round((now - new Date(iso)) / 60000));
  if (m < 1) return 'щойно';
  if (m < 60) return `${m} хв`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} год`;
  return `${Math.round(h / 24)} дн`;
}

// The card «Зараз» of the overview: one sentence about where the project is and, when it waits for the manager, which decision.
// d = { state, sections: {key: row}, runs, approvals, hasBrief }
export function nowCard({ state, runs = [], approvals = [], hasBrief = false, journal = [] }) {
  if (!state) return { tone: 'mute', title: 'Процес для проєкту не запущено', text: 'Запустіть процес, і агенти почнуть працювати за документом «Робочий процес клієнта».', action: 'start' };
  if (state.paused) return { tone: 'warn', title: 'Проєкт на паузі', text: state.paused_reason || 'Агенти нічого не роблять, доки ви не зніміть паузу.', action: 'resume' };
  const pending = approvals.filter((a) => a.status === 'pending').sort(byIdDesc)[0];
  if (pending) return { tone: 'warn', title: `Чекає на вас: ${approvalTitle(pending.kind)}`, text: APPROVAL_KIND[pending.kind]?.what || '', action: 'decide', approvalId: pending.id };
  const so = signoffWanted(state, approvals);
  if (so) return { tone: 'warn', title: 'Запишіть відповідь клієнта', text: 'Стратегію затверджено (Апрув 1). Запуск чекає на підпис клієнта.', action: 'signoff', approvalId: null };
  if (state.stage === 0) {
    const need = [];
    if (!hasBrief) need.push('заповнити бриф у Досьє');
    if (!state.paid_at) need.push('підтвердити оплату');
    if (!state.contracts_signed_at) need.push('підтвердити підписання договорів');
    if (need.length) return { tone: 'warn', title: 'Для старту потрібно', text: need.join('; ') + '.', action: 'dossier' };
  }
  const openRuns = runs.filter((r) => OPEN.has(r.status)).sort((a, b) => a.id - b.id);
  const open = openRuns.find((r) => r.status !== 'waiting') || null;
  // everything that is open waits for a person: say what for, and where to do it (found by the end-to-end run: a waiting run used to be shown as «Працює»)
  if (!open && openRuns.length) { const w = openRuns[0]; return { tone: 'warn', title: `Чекає: ${agentName(w.agent)} ${SKILL_LABEL[w.skill] || w.skill}`, text: w.error || 'Крок чекає на дані від людини.', action: 'tasks' }; }
  // the process is stopped by the automatic check or by a skill that failed three times: nothing is running, so «усе виконано» would be a lie
  const stop = journal.find((j) => ['check_failed', 'skill_stopped', 'launch_stopped'].includes(j.action));
  const moved = journal.find((j) => j.action === 'stage');
  if (!open && stop && (!moved || moved.id < stop.id)) {
    // a skill that failed three times is never started again by the orchestrator: the manager fixes the cause and starts it by hand («Запустити ще раз»)
    const [agent, skill] = String(stop.action === 'skill_stopped' ? stop.meta?.skill || '' : '').split('/');
    return { tone: 'bad', title: 'Процес зупинено', text: stop.summary, action: 'tasks', ...(agent && skill ? { rerun: { agent, skill } } : {}) };
  }
  if (open) return { tone: 'info', title: `Зараз: ${agentName(open.agent)} ${SKILL_LABEL[open.skill] || open.skill}`, text: open.status === 'queued' ? 'У черзі на виконання.' : 'Працює.', action: 'dossier' };
  const failed = runs.filter((r) => r.status === 'failed').sort(byIdDesc)[0];
  if (failed && !runs.some((r) => r.agent === failed.agent && r.skill === failed.skill && r.id > failed.id)) return { tone: 'bad', title: `Помилка: ${agentName(failed.agent)}, ${SKILL_LABEL[failed.skill] || failed.skill}`, text: failed.error || 'Крок не вдався після повторних спроб.', action: 'dossier' };
  return { tone: 'ok', title: `Етап «${STAGES[state.stage]?.title || state.stage}»`, text: 'Усе виконано, чекаємо наступної події.', action: null };
}

// The skills a manager may start again by hand from the card of an agent. NOT the launch: it writes to a cabinet and has its own road (Апрув 2, the stopped-process card).
export const RERUN_SKILLS = new Set(['intake', 'audit', 'site', 'audience', 'unit_economy', 'competitors', 'materials_ideas', 'first_creatives', 'strategy', 'optimize', 'onboarding', 'payment_reminder', 'weekly_report', 'monthly_report']);

// The five cards of the agents: what each one is doing now or did last. `rerun` = the skill that can be started again (the last one that finished or failed, when nothing of this agent is open).
export function agentCards(runs = []) {
  return AGENTS.map((a) => {
    const mine = runs.filter((r) => r.agent === a.key).sort(byIdDesc);
    const open = mine.find((r) => OPEN.has(r.status));
    const last = mine[0];
    if (open) return { ...a, tone: 'info', status: open.status === 'queued' ? 'У черзі' : 'Працює', note: SKILL_LABEL[open.skill] || open.skill, active: open.status === 'running' };
    const rerun = last && RERUN_SKILLS.has(last.skill) ? last.skill : null;
    if (last?.status === 'failed') return { ...a, tone: 'bad', status: 'Помилка', note: SKILL_LABEL[last.skill] || last.skill, rerun };
    if (last) return { ...a, tone: 'ok', status: 'Готово', note: `Остання робота: ${SKILL_LABEL[last.skill] || last.skill}`, rerun };
    return { ...a, tone: 'mute', status: 'Не активний', note: 'Ще нічого не робив' };
  });
}

// A section is «ready for the next step» when it has a current version; the dossier list shows the status and who works on it.
export function sectionRows(rows = []) {
  const by = Object.fromEntries(rows.map((r) => [r.key, r]));
  return SECTIONS.map((s) => {
    const r = by[s.key];
    const st = SECTION_STATUS[r?.status || 'empty'];
    return { ...s, id: r?.id || null, status: r?.status || 'empty', label: st.label, tone: st.tone, hasCurrent: !!r?.current_version_id, needsReapproval: !!r?.needs_reapproval, updated: r?.updated_at || null };
  });
}

// Proposals of the agent for a section that a person has changed: the versions marked is_proposal that are newer than the current one and not yet answered.
export function openProposals(versions = [], answeredIds = new Set()) {
  return versions.filter((v) => v.is_proposal && !answeredIds.has(v.id)).sort((a, b) => b.version - a.version);
}

export const agoText = (iso, now = new Date()) => { const t = ageText(iso, now); return t === 'щойно' ? t : `${t} тому`; };
