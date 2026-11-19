// The brain of the orchestrator (step A2; spec: the document "Робочий процес клієнта", section "Схема процесу").
// A PURE function: it looks at one project (its stage, the sections of its dossier, its runs and approvals) and says what has to happen next:
// start a run, ask for an approval, move the stage, change the status of a section, write to the journal. It touches nothing itself.
// Stages: 0 start · 1 research · 2 strategy and the first launch · 3 launch · 4 optimisation · 5 the monthly plan (4 and 5 repeat).
// Manager approvals: «strategy» (Апрув 1), «launch» (Апрув 2), «changes» (Апрув 3). The sign-off of the client is an approval of kind «client».

export const STAGE = { START: 0, RESEARCH: 1, STRATEGY: 2, LAUNCH: 3, OPERATE: 4, MONTH: 5 };
export const DEFAULTS = { optimizeEveryHours: 24, monthStartDay: 1 };
export const RESEARCH_SKILLS = ['site', 'audience', 'unit_economy', 'competitors'];

const OPEN = new Set(['queued', 'running', 'waiting']);
const open = (runs, agent, skill) => runs.some((r) => r.agent === agent && r.skill === skill && OPEN.has(r.status));
const openOf = (runs, agents) => runs.some((r) => agents.includes(r.agent) && OPEN.has(r.status));
const byIdDesc = (a, b) => b.id - a.id;
const lastRun = (runs, agent, skill) => runs.filter((r) => r.agent === agent && r.skill === skill).sort(byIdDesc)[0] || null;
const lastApproval = (approvals, kind) => approvals.filter((a) => a.kind === kind).sort(byIdDesc)[0] || null;
const isDone = (r) => !!r && r.status === 'done';
const ym = (v) => new Date(v).toISOString().slice(0, 7);

// The runs that redo the strategy for an approval that was returned remember it in input.rework_of
const reworkRuns = (runs) => runs.filter((r) => r.agent === 'strategist' && r.skill === 'strategy' && r.input?.rework_of != null);

export function planNext({ now = new Date(), state, sections = {}, runs = [], approvals = [], checks = { ok: true, problems: [] }, config = {} } = {}) {
  const cfg = { ...DEFAULTS, ...config };
  const acts = [];
  if (!state || state.paused) return acts;
  const has = (k) => !!sections[k]?.hasCurrent;
  const queued = (agent, skill) => acts.some((a) => a.type === 'enqueue' && a.agent === agent && a.skill === skill);
  const enqueue = (agent, skill, input = {}, priority = 100) => { if (!open(runs, agent, skill) && !queued(agent, skill)) acts.push({ type: 'enqueue', agent, skill, input, priority }); };
  const journal = (action, summary, meta = {}) => acts.push({ type: 'journal', action, summary, meta });

  // ---------------------------------------------------------------- 0 · start
  if (state.stage === STAGE.START) {
    if (has('brief') && state.has_data == null) { enqueue('researcher', 'intake'); return acts; } // find out whether the cabinets hold data (decides if there is an audit)
    const ready = !!state.paid_at && !!state.contracts_signed_at && has('brief') && state.has_data != null;
    if (!ready) return acts;
    acts.push({ type: 'set_stage', stage: STAGE.RESEARCH });
    journal('stage', 'Умови старту виконані: оплата, договори, бриф. Починаємо дослідження.');
    RESEARCH_SKILLS.forEach((s) => enqueue('researcher', s));
    if (state.has_data) enqueue('researcher', 'audit'); // no data in the cabinets: no audit
    enqueue('support', 'onboarding');
    return acts;
  }

  // ---------------------------------------------------------------- 1 · research
  if (state.stage === STAGE.RESEARCH) {
    if (has('audience') && has('competitors') && !has('materials')) enqueue('creator', 'materials_ideas'); // ideas use the audience and the competitors
    const need = [...RESEARCH_SKILLS, 'materials', 'ideas', ...(state.has_data ? ['audit'] : [])];
    const missing = need.filter((k) => !has(k));
    if (missing.length || openOf(runs, ['researcher', 'creator'])) return acts;
    if (!checks.ok) {
      acts.push({ type: 'journal', action: 'check_failed', summary: 'Автоматична перевірка знайшла проблеми: ' + (checks.problems || []).join(' '), meta: {}, once: true }); // written once, not on every pass
      for (const r of checks.rerun || []) enqueue(r.agent, r.skill); // a section that is older than its source is made again (the check asks for it only then, so there is no loop)
      return acts;
    }
    acts.push({ type: 'set_stage', stage: STAGE.STRATEGY });
    journal('stage', 'Дослідження завершено. Стратег складає стратегію.' + ((checks.warnings || []).length ? ' Перед апрувом варто глянути: ' + checks.warnings.join(' ') : ''));
    enqueue('strategist', 'strategy');
    return acts;
  }

  // ---------------------------------------------------------------- 2 · strategy and the first launch
  if (state.stage === STAGE.STRATEGY) {
    // a returned approval (the manager's or the client's) sends the strategy back to the strategist, once per approval
    const handled = new Set(reworkRuns(runs).map((r) => r.input.rework_of));
    const returned = ['strategy', 'client', 'launch'].map((k) => lastApproval(approvals, k)).filter((a) => a && a.status === 'returned' && !handled.has(a.id)).sort(byIdDesc)[0];
    if (returned) {
      acts.push({ type: 'section_status', key: 'strategy', status: 'needs_rework' });
      enqueue('strategist', 'strategy', { rework_of: returned.id, comment: returned.comment || '' });
      journal('returned', `Повернуто на доопрацювання (${returned.kind}): ${returned.comment || ''}`);
      return acts;
    }
    let status = sections.strategy?.status || 'empty';
    const rework = reworkRuns(runs).sort(byIdDesc)[0];
    if (status === 'needs_rework' && isDone(rework) && !open(runs, 'strategist', 'strategy')) { acts.push({ type: 'section_status', key: 'strategy', status: 'draft' }); status = 'draft'; }
    const sApp = lastApproval(approvals, 'strategy');
    if (status === 'draft' && has('strategy')) {
      const creatives = lastRun(runs, 'creator', 'first_creatives');
      if (!creatives) { enqueue('creator', 'first_creatives'); return acts; }
      if (isDone(creatives) && !openOf(runs, ['strategist', 'creator']) && (!sApp || sApp.status !== 'pending')) {
        acts.push({ type: 'approval', kind: 'strategy', subject: { section: 'strategy' } });
        acts.push({ type: 'section_status', key: 'strategy', status: 'on_approval' });
        journal('approval', 'Стратегія й перші креативи чекають на Апрув 1.');
      }
      return acts;
    }
    if (status === 'on_approval' && sApp?.status === 'approved') { acts.push({ type: 'section_status', key: 'strategy', status: 'approved' }); status = 'approved'; journal('approved', 'Апрув 1 отримано. Чекаємо погодження клієнта.'); }
    if (status === 'approved' && sApp?.status === 'approved') {
      const cApp = lastApproval(approvals, 'client');
      if (!cApp || cApp.id < sApp.id) return acts; // the manager has not recorded the client's answer yet
      if (cApp.status === 'approved') {
        const lApp = lastApproval(approvals, 'launch');
        if (!lApp || lApp.id < cApp.id) { acts.push({ type: 'approval', kind: 'launch', subject: { section: 'strategy' } }); journal('approval', 'Клієнт погодив. Запуск чекає на Апрув 2.'); return acts; }
        if (lApp.status === 'approved') {
          acts.push({ type: 'set_stage', stage: STAGE.LAUNCH });
          journal('stage', 'Апрув 2 отримано. Запуск.');
          enqueue('mediabuyer', 'launch');
        }
      }
    }
    return acts;
  }

  // ---------------------------------------------------------------- 3 · launch
  if (state.stage === STAGE.LAUNCH) {
    const l = lastRun(runs, 'mediabuyer', 'launch');
    if (!l) enqueue('mediabuyer', 'launch');
    else if (isDone(l)) { acts.push({ type: 'set_stage', stage: STAGE.OPERATE }); journal('stage', 'Кампанії запущено. Оптимізація.'); }
    return acts;
  }

  // ---------------------------------------------------------------- 4 and 5 · optimisation and the monthly plan
  if (state.stage === STAGE.OPERATE || state.stage === STAGE.MONTH) {
    const lo = lastRun(runs, 'mediabuyer', 'optimize');
    const due = !lo || (lo.finished_at && now - new Date(lo.finished_at) >= cfg.optimizeEveryHours * 3600e3);
    if (due) enqueue('mediabuyer', 'optimize', {}, 50);
    const lm = lastRun(runs, 'strategist', 'monthly_plan');
    if (state.stage === STAGE.OPERATE) {
      const covered = [lm, lastRun(runs, 'mediabuyer', 'launch')].filter(Boolean).map((r) => ym(r.created_at)).sort().pop(); // the month of the launch is covered by the strategy
      if (now.getUTCDate() >= cfg.monthStartDay && (!covered || ym(now) > covered) && !open(runs, 'strategist', 'monthly_plan')) {
        acts.push({ type: 'set_stage', stage: STAGE.MONTH });
        journal('stage', 'Початок місяця: планування.');
        enqueue('strategist', 'monthly_plan');
        enqueue('support', 'monthly_report');
      }
      return acts;
    }
    // stage 5: the plan is written, then the manager approves it (Апрув 3)
    if (isDone(lm) && !open(runs, 'strategist', 'monthly_plan')) {
      const ap = approvals.filter((a) => a.kind === 'changes' && a.subject?.section === 'monthly_plan' && a.subject?.run === lm.id).sort(byIdDesc)[0];
      if (!ap) { acts.push({ type: 'approval', kind: 'changes', subject: { section: 'monthly_plan', run: lm.id } }); journal('approval', 'Місячний план чекає на Апрув 3.'); }
      else if (ap.status === 'approved') { acts.push({ type: 'set_stage', stage: STAGE.OPERATE }); journal('stage', 'Апрув 3 отримано. Місячний план діє.'); }
      else if (ap.status === 'returned') { enqueue('strategist', 'monthly_plan', { rework_of: ap.id, comment: ap.comment || '' }); journal('returned', `Місячний план повернуто: ${ap.comment || ''}`); }
    }
    return acts;
  }
  return acts;
}
