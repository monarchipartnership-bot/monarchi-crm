// The running total of a month («month to date»). After a week of the month is approved, the monthly report of that month is pulled again for the period
// from the 1st to the last approved day. The totals cannot be added up from the weeks (reach and unique clicks are not additive, ROAS and CPA are
// ratios), so the platform is asked for the whole period. It is ONE monthly row per month and platform scope: it only grows its end date; at the
// month's close the agent's monthly run moves the same row to the full month and sends it to approval.
//
// The row is marked data.toDate = true. It is built only from approved weeks, so the client page may show it before the month is approved.
// A monthly report that a person made, or one that already waits for approval or is approved, is never touched.
// Everything outside (database, platforms) is handed in, so this is tested without a network.
import { EMPTY_SECTIONS, pullReportData, reportPayload } from '../../src/lib/reportEngine.js';
import { accountPlatforms } from '../../src/lib/reportScope.js';
import { projectKind } from '../../src/lib/reportMetrics.js';
import { describeDynamics } from '../../src/lib/reportDynamics.js';
import { daysInRange } from '../../src/lib/periodReport.js';
import { PLATFORMS } from '../../src/lib/presentation/deckModel.js';
import { monthRange } from '../../src/lib/projectHistory.js';

const NAMES = Object.fromEntries(PLATFORMS.map((p) => [p.id, p.name]));
const fmt = (s) => s.split('-').reverse().join('.');
const addDays = (iso, n) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const prevMonthKey = (key) => { let [y, m] = key.split('-').map(Number); m -= 1; if (m === 0) { m = 12; y -= 1; } return `${y}-${String(m).padStart(2, '0')}`; };

// The same number of days from the 1st of the previous month: 1-12 Oct is compared with 1-12 Sep.
export function toDateComparison(key, endIso) {
  const days = daysInRange(`${key}-01`, endIso);
  const prev = monthRange(prevMonthKey(key));
  const end = addDays(prev.start, days - 1);
  return { start: prev.start, end: end > prev.end ? prev.end : end, label: '' };
}

// → { updated: [{ scope, end }], skipped: [text] }
export async function refreshMonthToDate({ repo, post, projectId, monthKey: key }) {
  const out = { updated: [], skipped: [] };
  const agent = await repo.getAgent(projectId);
  const config = agent?.config || {};
  const [project, allAccounts, groups, custom, columns] = await Promise.all([repo.getProject(projectId), repo.getAccounts(projectId), repo.getGroups(projectId), repo.getCustomMetrics(projectId), repo.getColumns(projectId)]);
  if (!project) throw new Error('Проєкт не знайдено.');
  const accounts = config.platforms?.length ? allAccounts.filter((a) => config.platforms.includes(a.platform)) : allAccounts;
  if (!accounts.length) { out.skipped.push('До проєкту не підключено рекламних кабінетів.'); return out; }
  const kind = projectKind(project);
  const platformIds = accountPlatforms(accounts);
  const scopes = [...platformIds, ...(platformIds.length > 1 ? ['all'] : [])];

  // the last approved day of the month, per scope
  const ends = {};
  for (const scope of scopes) {
    const weeks = (await repo.getReports(projectId, 'weekly', scope)).filter((r) => String(r.period_start).startsWith(key) && r.status === 'final');
    if (weeks.length) ends[scope] = weeks.map((w) => w.period_end).sort().pop();
    else out.skipped.push(`${scope === 'all' ? 'Разом' : NAMES[scope] || scope}: у місяці ще немає затверджених тижнів.`);
  }
  const monthStart = `${key}-01`;
  const pulled = new Map(); // end → the numbers, asked once per distinct end
  for (const scope of Object.keys(ends)) {
    const end = ends[scope];
    const existing = (await repo.getReports(projectId, 'monthly', scope)).filter((r) => r.period_start === monthStart);
    const blocker = existing.find((r) => r.source !== 'agent' || r.status !== 'draft');
    if (blocker) { out.skipped.push(`${scope === 'all' ? 'Разом' : NAMES[scope] || scope}: місячний звіт уже ${blocker.source !== 'agent' ? 'створений вручну' : blocker.status === 'final' ? 'затверджений' : 'на затвердженні'}, підсумок не змінено.`); continue; }
    const period = { start: monthStart, end };
    const prev = toDateComparison(key, end);
    if (!pulled.has(end)) pulled.set(end, await pullReportData({ accounts, kind, groups, period, prev, post, columns }));
    const { data, errors } = pulled.get(end);
    const have = scope === 'all' ? Object.keys(data.platforms) : data.platforms[scope] ? [scope] : [];
    if (!have.length || (scope === 'all' && have.length < 2)) { out.skipped.push(`${scope === 'all' ? 'Разом' : NAMES[scope] || scope}: даних немає${Object.keys(errors || {}).length ? ' (кабінет не відповів)' : ''}.`); continue; }
    const scoped = scope === 'all' ? data : {
      platforms: { [scope]: data.platforms[scope] },
      previous: data.previous ? { ...data.previous, platforms: data.previous.platforms?.[scope] ? { [scope]: data.previous.platforms[scope] } : {} } : null,
    };
    const conclusion = describeDynamics({ platforms: scoped.platforms, previous: scoped.previous, kind, custom, names: NAMES, unequal: false });
    const payload = reportPayload({ kind, data: scoped, compare: { mode: 'custom' }, period, prev, selection: [], options: { groups: true }, sections: { ...EMPTY_SECTIONS, conclusion }, note: config.note || '' });
    payload.toDate = true;
    payload.approvedThrough = end;
    payload.label = `Місяць на сьогодні, по ${fmt(end)}`;
    const mine = existing[0];
    if (mine) await repo.updateReport(mine.id, { period_end: end, data: payload });
    else await repo.saveReport({ projectId, periodType: 'monthly', period, platform: scope, source: 'agent', status: 'draft', data: payload });
    out.updated.push({ scope, end });
  }
  return out;
}
