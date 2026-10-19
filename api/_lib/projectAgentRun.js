// One run of the project AI agent: make the report for a period (and the presentation from it) as a DRAFT.
// It uses the very same code as a person clicking through the «Тижневий / Місячний звіт» tab (the report
// engine), so the numbers are computed, never written by the model; the model only phrases «What was done»
// from the accounts' change history. «Conclusion» is a neutral description of the dynamics built by code from
// the report's own figures; «Plans» is left for the manager. Nothing is ever sent to a client, and a report a
// person made or already reviewed is never touched.
//
// Everything outside (database, platforms, text writer) is handed in, so the whole run is tested without a network.
import { buildDeckFromReport } from '../../src/lib/presentation/buildDeck.js';
import { PLATFORMS } from '../../src/lib/presentation/deckModel.js';
import { computeWeeksForMonth } from '../../src/lib/dateHelpers.js';
import { projectKind } from '../../src/lib/reportMetrics.js';
import { accountPlatforms, accountsForTab } from '../../src/lib/reportScope.js';
import { describeDynamics } from '../../src/lib/reportDynamics.js';
import { PROBLEM_QUIET_HOURS, buildNotifications } from './agentNotify.js';
import {
  EMPTY_SECTIONS, buildWhatWasDone, comparisonInfo, comparisonPeriod, dueReportPeriod, pullReportData, reportPayload,
} from '../../src/lib/reportEngine.js';

const DEFAULT_CONFIG = { tasks: { weeklyReport: true, monthlyReport: true, presentation: true }, platforms: [], deck: { style: 'brand-pulse', lang: 'en' }, note: '', notify: true, notifyEmails: [] };
const PLATFORM_NAMES = Object.fromEntries(PLATFORMS.map((p) => [p.id, p.name]));
const LABEL = { weekly: 'тижневий', monthly: 'місячний' };
const GENITIVE = { weekly: 'тижневого', monthly: 'місячного' };
const fmt = (s) => s.split('-').reverse().join('.');
const LEASE_MINUTES = 10;

// "Today" for the team: the calendar date in Kyiv, not the server's UTC date.
export function kyivToday(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Kyiv', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

const hasDelivery = (t) => Boolean(t) && ((t.spend || 0) > 0 || (t.impressions || 0) > 0 || (t.clicks || 0) > 0);

// → { status: 'ok' | 'problem' | 'skipped', message, runId, reportId?, deckIds?, notes[] }
export async function runProjectReport({ repo, post, projectId, periodType, trigger = 'manual', startedBy = null, today = kyivToday() }) {
  const run = await repo.startRun({ projectId, trigger, periodType, startedBy });
  const notes = [];
  let locked = false;
  let notifyConfig = null; // who to tell, known once the agent's settings are loaded
  let projectName = '';
  let periodInfo = null; // set as soon as the period is known, so even a failed run says which period it was for

  const finish = async (status, message, extra = {}) => {
    const cost = await repo.costSince(run.started_at).catch(() => 0);
    // Tell the chosen people (common notification bell): a draft is ready, or the agent hit a problem.
    if (notifyConfig && (status === 'ok' || status === 'problem')) {
      try {
        let rows = buildNotifications({ projectId, projectName, periodType, status, message, config: notifyConfig, startedBy });
        if (status === 'problem' && rows.length && await repo.hasRecentNotification(projectId, 'project_agent_problem', PROBLEM_QUIET_HOURS)) rows = [];
        if (rows.length) await repo.addNotifications(rows);
      } catch (e) { notes.push('Не вдалося надіслати сповіщення: ' + (e?.message || e)); }
    }
    await repo.finishRun(run.id, { status, error: status === 'problem' ? message : null, cost_usd: cost, summary: { message, notes, ...extra.summary }, report_id: extra.reportId || null, deck_ids: extra.deckIds || [], period_start: extra.period?.start || null, period_end: extra.period?.end || null });
    return { status, message, runId: run.id, reportId: extra.reportId || null, deckIds: extra.deckIds || [], notes, costUsd: cost };
  };
  const event = (kind, status, message, details = {}) => repo.addEvent({ projectId, kind, status, message, details: { runId: run.id, ...details } }).catch(() => {});

  try {
    const agent = await repo.getAgent(projectId);
    if (!agent) return await finish('skipped', 'До проєкту не підключено AI-агента.');
    if (trigger === 'cron' && !agent.enabled) return await finish('skipped', 'Агента вимкнено.');
    const config = { ...DEFAULT_CONFIG, ...(agent.config || {}), tasks: { ...DEFAULT_CONFIG.tasks, ...(agent.config?.tasks || {}) }, deck: { ...DEFAULT_CONFIG.deck, ...(agent.config?.deck || {}) } };
    notifyConfig = config;
    if (trigger === 'cron' && !config.tasks[periodType === 'weekly' ? 'weeklyReport' : 'monthlyReport']) return await finish('skipped', `Агент не налаштований робити ${LABEL[periodType]} звіт.`);

    locked = await repo.tryLock(projectId, LEASE_MINUTES);
    if (!locked) return await finish('skipped', 'Агент уже працює над цим проєктом.');
    await event('run_started', 'info', `Запуск: ${LABEL[periodType]} звіт.`, { trigger });

    const [project, allAccounts, groups, custom] = await Promise.all([repo.getProject(projectId), repo.getAccounts(projectId), repo.getGroups(projectId), repo.getCustomMetrics(projectId)]);
    if (!project) throw new Error('Проєкт не знайдено.');
    projectName = project.name || '';
    const accounts = config.platforms?.length ? allAccounts.filter((a) => config.platforms.includes(a.platform)) : allAccounts;
    if (!accounts.length) throw new Error('До проєкту не підключено рекламних кабінетів' + (config.platforms?.length ? ' для обраних платформ.' : '.'));
    const kind = projectKind(project);

    const due = dueReportPeriod(periodType, today);
    if (!due) throw new Error('Не вдалося визначити період звіту.');
    const { picker, period } = due;
    periodInfo = period;

    // The project's reports are kept per ad platform, plus «Разом» when there are several platforms: one report (and deck) each.
    // A scope whose report a person made or already reviewed is never touched; the others are made as drafts.
    const platformIds = accountPlatforms(accounts);
    const scopes = [...platformIds, ...(platformIds.length > 1 ? ['all'] : [])];
    const scopeName = (scope) => (scope === 'all' ? 'Разом' : PLATFORM_NAMES[scope] || scope);
    const writable = [];
    const kept = [];
    for (const scope of scopes) {
      const existing = await repo.getReport(projectId, periodType, period.start, scope);
      if (existing && !(existing.source === 'agent' && existing.status === 'draft')) kept.push({ scope, existing, why: existing.source === 'agent' ? 'вже перевірений менеджером' : 'створений вручну' });
      else writable.push(scope);
    }
    if (!writable.length) {
      const { existing, why } = kept[0];
      await event('run_skipped', 'info', `Звіт за ${fmt(period.start)} – ${fmt(period.end)} ${why}, агент його не змінює.`);
      return await finish('skipped', `Звіт за цей період ${why}, його не змінено.`, { period, reportId: existing.id });
    }
    kept.forEach((k) => notes.push(`${scopeName(k.scope)}: звіт ${k.why}, агент його не змінив.`));

    // 1. The numbers (and the previous period for the comparison), once for every platform.
    const compare = { mode: 'calendar' };
    const prev = comparisonPeriod(periodType, picker, period, compare);
    const info = comparisonInfo(period, prev);
    const { data, errors } = await pullReportData({ accounts, kind, groups, period, prev, post });
    const failed = Object.entries(errors).map(([p, m]) => `${PLATFORM_NAMES[p] || p}: ${m}`);
    if (!Object.keys(data.platforms).length) throw new Error('Не вдалося отримати дані з кабінетів. ' + failed.join(' '));
    failed.forEach((f) => notes.push('Не вдалося отримати дані: ' + f));
    // Totals of periods that differ by more than 10% in length (4 days vs 3) are not comparable; 30 vs 31 days are.
    const incomparable = Math.abs(info.daysCur - info.daysPrev) / Math.max(info.daysCur, info.daysPrev) > 0.1;
    if (incomparable) notes.push(`Періоди порівняння різної тривалості (${info.daysCur} і ${info.daysPrev} дн.): у висновку порівнюються лише відносні показники.`);
    const narrow = (scope) => (scope === 'all' ? data : {
      platforms: { [scope]: data.platforms[scope] },
      previous: data.previous ? { ...data.previous, platforms: data.previous.platforms?.[scope] ? { [scope]: data.previous.platforms[scope] } : {} } : null,
    });

    const reports = {};
    const whatWasDoneBy = {};
    for (const scope of writable) {
      const have = scope === 'all' ? Object.keys(data.platforms) : data.platforms[scope] ? [scope] : [];
      if (!have.length) { notes.push(`${scopeName(scope)}: даних немає, звіт не створено.`); continue; }
      if (scope === 'all' && have.length < 2) { notes.push('Разом: дані прийшли лише з однієї платформи, окремий звіт «Разом» не створено.'); continue; }
      const scoped = narrow(scope);
      const scopeAccounts = scope === 'all' ? accounts : accountsForTab(accounts, scope);

      // 2. «What was done»: monthly = from the month's weekly texts (else from the history); weekly = from the history.
      // «Разом» has no history of its own: it gathers the texts of the platforms.
      let whatWasDone = '';
      if (scope === 'all') {
        whatWasDone = Object.entries(whatWasDoneBy).filter(([, t]) => t.trim()).map(([p, t]) => `${scopeName(p)}:\n${t}`).join('\n\n');
      } else {
        try {
          let result = null;
          if (periodType === 'monthly') {
            const weeklyRows = await repo.getReports(projectId, 'weekly', scope);
            result = await buildWhatWasDone({ source: 'weeks', periodType, period, accounts: scopeAccounts, projectName: project.name, note: config.note, weeklyRows, expectedWeeks: computeWeeksForMonth(picker.year, picker.month).length, post });
          }
          if (!result || result.empty) result = await buildWhatWasDone({ source: 'history', periodType, period, accounts: scopeAccounts, projectName: project.name, note: config.note, post });
          whatWasDone = result.text || '';
          const who = platformIds.length > 1 ? `${scopeName(scope)}: ` : '';
          if (result.empty) notes.push(who + result.empty);
          else if (result.writer !== 'ai') notes.push(who + 'Автоматичне оформлення «What was done» було недоступне: у звіті сирий список дій, його варто відредагувати.');
          Object.entries(result.info?.errors || {}).forEach(([p, m]) => notes.push(`Історія змін ${PLATFORM_NAMES[p] || p}: ${m}`));
        } catch (e) {
          notes.push(`${scopeName(scope)}: не вдалося сформувати «What was done»: ${e.message || e}`);
        }
        whatWasDoneBy[scope] = whatWasDone;
      }

      // 3. «Conclusion»: the dynamics, from the figures only. «Plans» stays empty.
      const conclusion = describeDynamics({ platforms: scoped.platforms, previous: scoped.previous, kind, custom, names: PLATFORM_NAMES, unequal: incomparable });
      const sections = { ...EMPTY_SECTIONS, whatWasDone, conclusion, plans: '' };

      // 4. Save the report as a draft.
      const payload = reportPayload({ kind, data: scoped, compare, period, prev, selection: [], options: { groups: true }, sections, note: config.note || '' });
      reports[scope] = { row: await repo.saveReport({ projectId, periodType, period, platform: scope, source: 'agent', status: 'draft', data: payload }), payload, whatWasDone };
    }
    const made = Object.keys(reports);
    if (!made.length) throw new Error('Не вдалося створити жоден звіт: ' + (notes.join(' ') || 'даних немає.'));
    const report = reports[made[0]].row;

    // 5. The presentation(s), one per platform with data; a deck a person has touched is left alone.
    const deckIds = [];
    const madeFor = [];
    if (config.tasks.presentation) {
      for (const platform of made.filter((m) => m !== 'all')) {
        const { row, payload } = reports[platform];
        if (!hasDelivery(payload.platforms[platform]?.total)) { notes.push(`${PLATFORM_NAMES[platform] || platform}: у періоді не було показів і витрат, презентацію не створено.`); continue; }
        const old = await repo.getDeck(projectId, periodType, period.start, platform);
        if (old && old.source !== 'agent') { notes.push(`${PLATFORM_NAMES[platform] || platform}: презентація вже є (створена вручну), її не змінено.`); continue; }
        const deck = buildDeckFromReport({ project, report: row, platform, style: config.deck.style, lang: config.deck.lang, custom });
        if (!deck.slides.length) continue;
        const saved = await repo.saveDeck({ projectId, reportId: row.id, periodType, period, platform, style: config.deck.style, lang: config.deck.lang, deck });
        deckIds.push(saved.id);
        madeFor.push(PLATFORM_NAMES[platform] || platform);
      }
    }
    // «What was done» is missing when no platform report has it
    const whatWasDone = made.map((m) => reports[m].whatWasDone).join('');

    const todo = [!whatWasDone.trim() && '«What was done»', '«Plans for the next period»'].filter(Boolean).join(' і ');
    const message = `Створено чернетку ${GENITIVE[periodType]} звіту за ${fmt(period.start)} – ${fmt(period.end)}${madeFor.length ? ` і презентацію (${madeFor.join(', ')})` : ''}${made.length > 1 ? `; звіти: ${made.map(scopeName).join(', ')}` : ''}. Потрібно заповнити: ${todo}; решту перевірити.`;
    await event('report_created', failed.length ? 'problem' : 'ok', message, { reportId: report.id, reportIds: made.map((m) => reports[m].row.id), deckIds, notes });
    await repo.setAgentHealth(projectId, failed.length ? { health: 'problem', last_error: failed.join(' ') } : { health: 'ok', last_error: null });
    return await finish('ok', message, { reportId: report.id, deckIds, period });
  } catch (e) {
    const message = e?.message || String(e);
    await event('problem', 'problem', 'Не вдалося створити звіт: ' + message);
    await repo.setAgentHealth(projectId, { health: 'problem', last_error: message }).catch(() => {});
    return await finish('problem', message, { period: periodInfo });
  } finally {
    if (locked) await repo.unlock(projectId).catch(() => {});
  }
}
