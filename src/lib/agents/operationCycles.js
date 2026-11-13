// The cycles of an operation (owner, 2026-11-11). An operation is a standing assignment for one client; a CYCLE is one pass of it:
//   regular  the operation keeps weekly schedules with the parameters of the work (campaign.config.regulars, several may be); the server creates a request
//            from them on the day and starts it (api/_lib/regularCycles.js)
//   extra    a one-off request with its own parameters that a person starts next to the regular ones («Створити додаткове завдання»)
// A cycle of the creative department is a row of ag_creative_requests (brief.kind = 'regular' | 'extra', brief.scheduled_for = the Kyiv day of the run).
// The card of an operation shows six sections; this file turns the cabinet of the operation (projectCockpit.js) into what each of them shows.
// Pure code: the page, the server and the tests use it.
import { daysBetween, kyivInstant, lastInterval, lastScheduled, nextInterval, nextScheduled } from '../agentSchedule.js';
import { WEEKDAYS, cleanSchedule, describeSchedule } from './campaignCycles.js';
import { MAX_MATERIALS, cleanRequest, directionLimit } from './creativeTeam.js';

export const CYCLE_KIND = { regular: 'Регулярне завдання', extra: 'Разове завдання' };
export const REGULAR_LATE_HOURS = 36; // a regular run that could not start within this time waits for the next week (an operation that was paused does not fire at once)
export const SECTIONS = [['now', 'Зараз в роботі'], ['review', 'Потребує перевірки'], ['messages', 'Повідомлення від агентів'], ['spend', 'Витрати'], ['settings', 'Налаштування'], ['ready', 'Готові матеріали']];

const MODE_TITLE = { creative: 'Тільки креативи', full: 'Повна операція', strategy: 'Тільки стратегія', ads: 'Аналіз і оптимізація', report: 'Тільки звіт' };
const at = (v) => { const t = new Date(v).getTime(); return Number.isNaN(t) ? 0 : t; };
const clip = (v, n) => { const t = String(v ?? '').replace(/\s+/g, ' ').trim(); return t.length > n ? `${t.slice(0, n - 1).trim()}…` : t; };
const round = (n) => Math.round(n * 100) / 100;
const plural = (n, one, few, many) => { const a = Math.abs(n) % 100, b = a % 10; if (a > 10 && a < 20) return many; if (b > 1 && b < 5) return few; return b === 1 ? one : many; };
const dayMonth = (date) => `${date.slice(8, 10)}.${date.slice(5, 7)}`;

export const kindOf = (brief) => (brief?.kind === 'regular' ? 'regular' : 'extra');
export const modeOf = (campaign) => campaign?.config?.mode || 'full';
// The creative department works in «Тільки креативи» and, when it was connected, in «Повна операція»: only such an operation has cycles of creatives.
export const hasCreativeCycles = (campaign) => modeOf(campaign) === 'creative' || (modeOf(campaign) === 'full' && campaign?.config?.creative?.enabled !== false);

// ---- one operation of a kind per project (owner: «на одном проекте не может быть запущено 2 одинаковые операции одновременно»)
// → the operation of the same kind that already works in the project (active or paused), or null
export function sameModeConflict(campaigns = [], { projectId, mode, exceptId = null } = {}) {
  return campaigns.find((c) => c.project_id === projectId && c.id !== exceptId && ['active', 'paused'].includes(c.status) && modeOf(c) === mode) || null;
}
export const conflictMessage = (other) => `У цього проєкту вже працює операція «${MODE_TITLE[modeOf(other)] || modeOf(other)}» («${other.name || `Операція ${other.id}`}»). Дві однакові операції одночасно не запускаються: додайте завдання у наявну або завершіть її.`;

// ---- the regular tasks: campaign.config.regulars = [{ id, enabled, weekdays [1..7] (several days a week) OR everyDays 1..60 (+ startDate: the first day), time 'HH:MM', title, brief, since, updated_by, updated_at }]
// (an older task keeps one `weekday`: it is read as weekdays [weekday])
// An operation may have several of them (owner, 2026-11-11), each with its own day, time and parameters; an older operation keeps one in campaign.config.regular
// and it is read as the cycle 'r1'. The operation gets its first regular cycle when it is created (the form opens at once).
export const MAX_REGULARS = 8; // the ones whose season is over do not count
// A SEASONAL task (owner, 2026-11-12) is a regular task for a period: `seasonal`, `startDate` .. `endDate` (a Kyiv day each), and `replaces`: the ids of the main regular tasks that rest
// while it lasts (the question «призупинити основне чи паралельно» is asked when it is made). Nothing is switched off and on: the rule is read at every run, so the main task
// comes back by itself the day after `endDate`.
const DATE = /^\d{4}-\d{2}-\d{2}$/;
// input: { id?, enabled, weekday, time, brief: the fields of the request form }; prev: what is saved for this id. Throws a message the person can read.
export function cleanRegular(input = {}, { by = null, now = new Date(), prev = null } = {}) {
  const every = input.everyDays != null && input.everyDays !== '' && !input.weekday && !(Array.isArray(input.weekdays) && input.weekdays.length);
  let days = null;
  if (!every) {
    days = [...new Set((Array.isArray(input.weekdays) && input.weekdays.length ? input.weekdays : input.weekday ? [input.weekday] : []).map(Number))].sort((a, b) => a - b);
    if (!days.length) throw new Error('Оберіть хоча б один день тижня.');
  }
  const schedule = cleanSchedule(every ? { everyDays: input.everyDays, time: input.time } : { weekday: days[0], time: input.time });
  if (days) days.forEach((d) => cleanSchedule({ weekday: d, time: schedule.time })); // every day is checked
  // what an edit that does not mention these keeps as it was (the form of the regular task knows only the schedule and the brief)
  const startDate = DATE.test(String(input.startDate || '')) ? input.startDate : input.startDate === undefined && prev ? prev.startDate || null : null;
  const endDate = DATE.test(String(input.endDate || '')) ? input.endDate : input.endDate === undefined && prev ? prev.endDate || null : null;
  const seasonal = input.seasonal === undefined ? !!prev?.seasonal : !!input.seasonal;
  if (seasonal && !endDate) throw new Error('Вкажіть, до якої дати триває сезон.');
  if (startDate && endDate && endDate < startDate) throw new Error('Кінець періоду раніше за його початок.');
  const replaces = input.replaces === undefined ? (prev?.replaces || []) : [...new Set((Array.isArray(input.replaces) ? input.replaces : []).map(String).filter((x) => /^r[a-z0-9]{1,20}$/.test(x)))];
  const raw = { ...(input.brief || {}) };
  if (raw.texts === 'given') raw.texts = 'yes'; // the same ready texts every week make no sense: the copywriter writes new ones
  const { title: derived, brief } = cleanRequest({ ...raw, given_texts: [], materials: [], kind: 'regular', scheduled_for: '' });
  const own = input.title !== undefined ? String(input.title).replace(/\s+/g, ' ').trim().slice(0, 100) : '';
  const title = own || (seasonal && prev?.title ? prev.title : derived);
  const enabled = input.enabled !== false;
  // the schedule counts from the moment it was switched on or moved: a run for a moment before that never starts
  const prevDays = prev ? (Array.isArray(prev.weekdays) && prev.weekdays.length ? prev.weekdays : prev.weekday ? [prev.weekday] : []).map(Number).join() : '';
  const moved = !prev || !prev.enabled || prevDays !== (days || []).join() || Number(prev.everyDays || 0) !== Number(schedule.everyDays || 0) || prev.time !== schedule.time || (prev.startDate || null) !== startDate || (prev.endDate || null) !== endDate;
  // «every N days» with a first day: the schedule starts at that day's time (a day that already passed means from now)
  const sinceAt = startDate ? new Date(Math.max(now.getTime(), kyivInstant(startDate, schedule.time).getTime() - 1)) : now;
  const id = prev?.id || (/^r[a-z0-9]{1,20}$/.test(String(input.id || '')) ? input.id : `r${now.getTime().toString(36)}`);
  return { id, enabled, weekdays: days, weekday: null, everyDays: schedule.everyDays || null, startDate, endDate, seasonal, replaces, time: schedule.time, title, brief, since: enabled ? (moved ? sinceAt.toISOString() : prev.since || now.toISOString()) : null, updated_by: by, updated_at: now.toISOString() };
}

const daysOf = (r) => (Array.isArray(r.weekdays) && r.weekdays.length ? r.weekdays : r.weekday ? [r.weekday] : []).map(Number).filter((d) => d >= 1 && d <= 7);
const validRegular = (r) => !!r && typeof r === 'object' && (daysOf(r).length > 0 || Number(r.everyDays) >= 1) && !!String(r.brief?.goal || '').trim();
const normRegular = (r, i) => ({ id: r.id || (i === 0 ? 'r1' : `r${i + 1}`), enabled: r.enabled !== false, weekdays: daysOf(r), weekday: daysOf(r)[0] || null, everyDays: Number(r.everyDays) || null, startDate: r.startDate || null, endDate: r.endDate || null, seasonal: !!r.seasonal, replaces: Array.isArray(r.replaces) ? r.replaces : [], time: r.time || '09:00', title: r.title || clip(r.brief.goal, 60), brief: r.brief, since: r.since || null, updatedAt: r.updated_at || null });
// the saved regular cycles of an operation, in the order they were made (raw rows: lib/api/operationCycles.js keeps the same rule)
export const rawRegulars = (campaign) => { const cfg = campaign?.config || {}; return Array.isArray(cfg.regulars) ? cfg.regulars : cfg.regular ? [{ ...cfg.regular, id: cfg.regular.id || 'r1' }] : []; };
export const regularsOf = (campaign) => rawRegulars(campaign).filter(validRegular).map(normRegular);
export const regularOf = (campaign) => regularsOf(campaign)[0] || null;

export const describeRegular = (r) => (r ? describeSchedule(r.everyDays ? { everyDays: r.everyDays, time: r.time } : { weekdays: daysOf(r), time: r.time }) : '');
// the Kyiv day of today as 'YYYY-MM-DD'
export const kyivToday = (now = new Date()) => lastInterval({ time: '00:00' }, now).date;
// the days a regular task has already been served: the days its requests were made for (the first run «now» counts as today)
const servedDays = (requests, campaign, regular) => requests.filter((q) => q.campaign_id === campaign.id && (q.brief?.regular_id || 'r1') === regular.id && q.brief?.scheduled_for).map((q) => q.brief.scheduled_for).sort();

// the seasonal task that makes this one rest now (its period holds today and it names this one in `replaces`), or null
export function pausedBySeason(campaign, regular, now = new Date()) {
  const today = kyivToday(now);
  return regularsOf(campaign).find((o) => o.enabled && o.seasonal && o.id !== regular.id && o.replaces.includes(regular.id) && (!o.startDate || today >= o.startDate) && (!o.endDate || today <= o.endDate)) || null;
}
// the season is over (its last day has passed)
export const seasonOver = (r, now = new Date()) => !!(r?.seasonal && r.endDate && kyivToday(now) > r.endDate);

// Is this regular cycle due now? requests: the requests of the operation (at least the recent ones); regular: one of regularsOf (the first by default).
// → { due, scheduledFor?: 'YYYY-MM-DD', reason }. The request made for a day and a cycle is the record that the day was served, so a run never repeats.
export function regularDue({ campaign, regular = null, requests = [], now = new Date() }) {
  const r = regular || regularOf(campaign);
  if (!r) return { due: false, reason: 'не налаштовано' };
  if (!r.enabled) return { due: false, reason: 'вимкнено' };
  if (campaign.status !== 'active') return { due: false, reason: 'операція не працює' };
  const today = kyivToday(now);
  if (r.endDate && today > r.endDate) return { due: false, reason: 'сезон завершено' };
  const rest = pausedBySeason(campaign, r, now);
  if (rest) return { due: false, reason: `замінено сезонним «${rest.title}»` };
  if (r.everyDays) { // every N days: counted from the last served day
    const s = lastInterval({ time: r.time }, now);
    if (!r.since || s.at < new Date(r.since)) return { due: false, reason: 'запланований момент був до вмикання', scheduledFor: s.date };
    const served = servedDays(requests, campaign, r);
    if (served.includes(s.date)) return { due: false, reason: 'вже запущено', scheduledFor: s.date };
    if (served.length && daysBetween(served[served.length - 1], s.date) < r.everyDays) return { due: false, reason: 'ще не час за розкладом', scheduledFor: s.date };
    if (now.getTime() - s.at.getTime() > REGULAR_LATE_HOURS * 3600000) return { due: false, reason: 'запізно: чекаємо наступного запуску', scheduledFor: s.date };
    return { due: true, scheduledFor: s.date };
  }
  const sched = r.weekdays.map((w) => lastScheduled('weekly', { weeklyDay: w, weeklyTime: r.time }, now)).sort((a, b) => b.at - a.at)[0]; // the latest moment of any of its days
  if (!r.since || sched.at < new Date(r.since)) return { due: false, reason: 'запланований момент був до вмикання', scheduledFor: sched.date };
  if (requests.some((q) => q.campaign_id === campaign.id && q.brief?.scheduled_for === sched.date && (q.brief?.regular_id || 'r1') === r.id)) return { due: false, reason: 'вже запущено', scheduledFor: sched.date };
  if (now.getTime() - sched.at.getTime() > REGULAR_LATE_HOURS * 3600000) return { due: false, reason: 'запізно: чекаємо наступного тижня', scheduledFor: sched.date };
  return { due: true, scheduledFor: sched.date };
}
// → [{ regular, scheduledFor }] of the regular cycles of the operation that start now
export const dueRegulars = ({ campaign, requests = [], now = new Date() }) => regularsOf(campaign).map((regular) => ({ regular, ...regularDue({ campaign, regular, requests, now }) })).filter((v) => v.due);

// The row of ag_creative_requests the schedule creates. assets: the files of the project card (taken fresh at every run); regular: which cycle (the first by default).
export function regularRequest(campaign, scheduledFor, assets = [], regular = null) {
  const r = regular || regularOf(campaign);
  if (!r) throw new Error('Регулярне завдання не налаштовано.');
  const materials = assets.filter((a) => a?.url && a?.name).slice(0, MAX_MATERIALS).map((a) => ({ name: String(a.name).slice(0, 160), url: a.url, path: a.path || '', kind: ['logo', 'product', 'style'].includes(a.kind) ? a.kind : 'other' }));
  return { campaign_id: campaign.id, title: `${clip(r.title || clip(r.brief?.goal, 60), 100)} · ${dayMonth(scheduledFor)}`, brief: { ...r.brief, kind: 'regular', regular_id: r.id, scheduled_for: scheduledFor }, materials, status: 'draft', created_by: 'розклад' };
}

// When this regular task starts next. last: the last day it was served (for «every N days»). → { at: Date, text } | null
export function nextOf(r, now = new Date(), last = null) {
  if (!r || !r.enabled) return null;
  if (r.everyDays) { const n = nextInterval({ everyDays: r.everyDays, time: r.time }, { last, since: r.since || null }, now); return { at: n.at, text: `${dayMonth(n.date)} о ${r.time}` }; }
  const next = r.weekdays.map((w) => ({ w, ...nextScheduled('weekly', { weeklyDay: w, weeklyTime: r.time }, now) })).filter((x) => x.at).sort((a, b) => a.at - b.at)[0];
  return next ? { at: next.at, text: `${WEEKDAYS[next.w - 1].toLowerCase()}, ${dayMonth(next.date)} о ${r.time}` } : null;
}
// The nearest start of any regular cycle of the operation. → { at, text, regular } | null
export function nextRegular(campaign, now = new Date(), lastOf = () => null) {
  const list = regularsOf(campaign).map((r) => { const n = nextOf(r, now, lastOf(r)); return n ? { ...n, regular: r } : null; }).filter(Boolean);
  return list.sort((a, b) => a.at - b.at)[0] || null;
}

// ---- one cycle in words
// cycle: a request of the cabinet { kind, goal, ratios, directions, creatives: { total } } → «Створення 6 креативів (3 напрями × 1:1, 4:5) за запитом «…»»
export function describeCycle(cycle = {}) {
  const ratios = cycle.ratios?.length ? cycle.ratios : ['1:1'];
  const directions = Math.max(1, Number(cycle.directions) || 1);
  const n = cycle.creatives?.total || directions * ratios.length;
  const what = `${n} ${plural(n, 'креатив', 'креативи', 'креативів')}`;
  const how = `${directions} ${plural(directions, 'напрям', 'напрями', 'напрямів')} × ${ratios.join(', ')}`;
  const goal = clip(cycle.goal || cycle.title, 160);
  return `Створення ${cycle.creatives?.total ? '' : 'до '}${what} (${how})${goal ? ` ${cycle.kind === 'regular' ? 'за регулярним завданням' : 'за запитом'} «${goal}»` : ''}`;
}

const madeOf = (c = {}) => (c.review || 0) + (c.approved || 0) + (c.rejected || 0);
const openOf = (c = {}) => (c.planned || 0) + (c.producing || 0) + (c.failed || 0);

// How far a cycle is: the agents of the chain are 60% of the way, the pictures the other 40%. → 0..1
export function cycleProgress(cycle = {}) {
  if (cycle.status === 'approved') return 1;
  const agents = (cycle.stages || []).filter((s) => s.key !== 'you');
  const a = agents.length ? agents.filter((s) => s.state === 'done').length / agents.length : 0;
  const total = cycle.creatives?.total || 0;
  if (!total) return round(0.6 * a);
  return round(Math.min(1, 0.6 * a + 0.4 * (madeOf(cycle.creatives) / total)));
}

const joinLabels = (list) => (list.length > 1 ? `${list.slice(0, -1).join(', ')} і ${list[list.length - 1]}` : list[0] || '');

// What a cycle does now and what comes after it. → { now, next, blocked: null | 'failed' | 'estimate' | 'review' | 'draft' }
export function cycleStage(cycle = {}) {
  const stages = (cycle.stages || []).filter((s) => s.key !== 'you');
  const c = cycle.creatives || {};
  if (cycle.status === 'draft') return { now: 'Чернетка: завдання збережено, але не запущено', next: 'Після запуску почне працювати стратег', blocked: 'draft' };
  if (cycle.status === 'paused') return { now: 'Завдання на паузі: нові кроки й нові платні запити не стартують', next: 'Натисніть «Продовжити», щоб агенти працювали далі', blocked: 'paused' };
  if (cycle.status === 'waiting') return { now: 'Агент питає вас: завдання стоїть, поки ви не відповісте', next: 'Після вашої відповіді цей агент працює знову й передає результат далі', blocked: 'question' };
  const failed = stages.find((s) => s.state === 'failed');
  if (failed) return { now: `Крок «${failed.label}» зупинився`, next: 'Повторіть крок у розділі «Повідомлення від агентів»', blocked: 'failed' };
  const live = stages.filter((s) => ['working', 'waiting'].includes(s.state));
  if (live.length) {
    const working = live.filter((s) => s.state === 'working');
    const lastIdx = stages.indexOf(live[live.length - 1]);
    const after = stages.slice(lastIdx + 1).filter((s) => s.state !== 'done');
    const group = after.length ? after.filter((s) => (after[0].parallel ? s.parallel === after[0].parallel : s === after[0])) : [];
    return { now: working.length ? `Працює: ${joinLabels(working.map((s) => s.label))}` : `У черзі: ${joinLabels(live.map((s) => s.label))}`, next: group.length ? joinLabels(group.map((s) => s.label)) : 'Підтвердження генерації картинок, потім ваш перегляд', blocked: null };
  }
  if (c.producing > 0) return { now: `Генеруються картинки: готово ${madeOf(c)} з ${c.total}`, next: 'Ваш перегляд у розділі «Потребує перевірки»', blocked: null };
  if ((c.planned || 0) + (c.failed || 0) > 0) return { now: `Чекає вашого підтвердження генерації: ${c.planned + (c.failed || 0)} ${plural(c.planned + (c.failed || 0), 'картинка', 'картинки', 'картинок')}`, next: 'Після підтвердження картинки згенеруються й підуть на ваш перегляд', blocked: 'estimate' };
  if (madeOf(c) > 0 || cycle.status === 'review') return { now: 'Готово: чекає вашого перегляду', next: 'Схваліть або поверніть у розділі «Потребує перевірки»', blocked: 'review' };
  if (cycle.status === 'problem') return { now: 'Завдання зупинився з помилкою', next: 'Подивіться розділ «Повідомлення від агентів»', blocked: 'failed' };
  const idle = stages.find((s) => s.state !== 'done');
  return { now: idle ? `Чекає на крок «${idle.label}»` : 'Агенти завершили роботу', next: idle ? '' : 'Ваш перегляд', blocked: null };
}

// A cycle is «in work» until all its pictures reached the person: the chain runs, or the pictures are planned / being made.
export const isInWork = (cycle) => ['draft', 'running', 'problem', 'paused', 'waiting'].includes(cycle.status) || (cycle.status === 'review' && (openOf(cycle.creatives) > 0 || !madeOf(cycle.creatives)));
// A cycle has something to look at when at least one picture is made.
export const hasMaterials = (cycle) => madeOf(cycle.creatives) > 0;
// review: pictures wait for the decision; rework: nothing waits, some are returned; checked: every made picture is approved
export function reviewState(cycle) {
  const c = cycle.creatives || {};
  if (c.review > 0) return 'review';
  if (c.rejected > 0) return 'rework';
  return 'checked';
}
export const REVIEW_LABEL = { review: 'чекає перевірки', rework: 'є повернені', checked: 'перевірено' };

// After the person decided on pictures: what the request becomes. creatives: [{ status }] of ONE request.
// → 'done' (every picture is approved), 'review' (something still waits or is returned), null (pictures are still being made: leave it)
export function reviewOutcome(creatives = []) {
  const n = (s) => creatives.filter((c) => c.status === s).length;
  if (!creatives.length || n('planned') || n('producing')) return null;
  if (n('review') || n('rejected') || n('failed')) return 'review';
  return n('approved') ? 'done' : null;
}

// ---- the six sections of the card of an operation
// campaign: the ag_campaigns row; cockpit: the cabinet of the operation (buildCockpit) or null.
export function buildOperationView({ campaign, cockpit = null, now = new Date() } = {}) {
  const cycles = (cockpit?.requests || []).map((r) => ({ ...r, kind: r.kind || 'extra' }));
  const paused = campaign?.status === 'paused';
  const inWork = cycles.filter(isInWork).map((c) => ({ ...c, kindLabel: CYCLE_KIND[c.kind], text: describeCycle(c), progress: cycleProgress(c), stage: cycleStage(c) }))
    .sort((a, b) => (a.status === 'draft' ? 1 : 0) - (b.status === 'draft' ? 1 : 0) || at(b.updatedAt) - at(a.updatedAt));
  const rank = { review: 0, rework: 1, checked: 2 };
  // pending: pictures wait for the person's decision (or are being made again) = the cycle to look at now; the others are decided and lie in the archive of cycles
  const review = cycles.filter(hasMaterials).map((c) => ({ ...c, kindLabel: CYCLE_KIND[c.kind], state: reviewState(c), stateLabel: REVIEW_LABEL[reviewState(c)], pending: (c.creatives?.review || 0) + (c.creatives?.producing || 0) > 0 }))
    .sort((a, b) => rank[a.state] - rank[b.state] || at(b.updatedAt) - at(a.updatedAt));
  const approved = cycles.flatMap((c) => (c.items || []).filter((i) => i.status === 'approved' && i.url).map((i) => ({ ...i, requestId: c.id })));
  const messages = (cockpit?.attention || []).filter((a) => a.kind !== 'review');
  // the ready materials: the newest cycle that has made pictures
  const last = cycles.filter(hasMaterials).sort((a, b) => at(b.createdAt || b.updatedAt) - at(a.createdAt || a.updatedAt))[0] || null;
  const ready = last ? { cycle: { id: last.id, title: last.title, kind: last.kind, kindLabel: CYCLE_KIND[last.kind], updatedAt: last.updatedAt }, items: (last.items || []).filter((i) => i.status === 'approved' && i.url), pending: last.creatives?.review || 0, returned: last.creatives?.rejected || 0 } : null;
  const lastOf = (r) => cycles.filter((c) => (c.regularId || 'r1') === r.id && c.scheduledFor).map((c) => c.scheduledFor).sort().pop() || null;
  const regulars = regularsOf(campaign).map((r) => { const n = nextOf(r, now, lastOf(r)); return { ...r, whenText: describeRegular(r), next: n ? { at: n.at.toISOString(), text: n.text } : null }; });
  const regular = regulars[0] || null;
  const next = nextRegular(campaign, now, lastOf);
  const creative = hasCreativeCycles(campaign);
  const nextText = !creative ? '' : !regulars.length ? 'Регулярних завдань не налаштовано: операція працює лише за одноразовими завданнями.'
    : !regulars.some((r) => r.enabled) ? 'Усі регулярні завдання вимкнено.'
      : paused ? 'Операція на паузі: регулярні завдання не запускаються, поки ви її не відновите.'
        : next ? `Наступний регулярний запуск: ${next.text}.` : '';
  return {
    creative, inWork, review, messages, ready, regular, regulars,
    archive: { count: approved.length, cycles: new Set(approved.map((i) => i.requestId)).size, items: approved },
    next: next && !paused ? { at: next.at.toISOString(), text: next.text } : null, nextText,
    counts: { now: inWork.filter((c) => c.status !== 'draft').length, review: review.reduce((s, c) => s + (c.creatives?.review || 0), 0), messages: messages.length, problems: messages.filter((m) => m.tone === 'problem').length },
  };
}

// The money of an operation by cycle. → [{ id, title, kindLabel, model, higgsfield, total }] newest first (the model part covers the last 30 days: see fetchCockpits)
export function cycleCosts(cockpit = null) {
  return (cockpit?.requests || []).map((r) => ({ id: r.id, title: r.title, kindLabel: CYCLE_KIND[r.kind || 'extra'], model: r.cost?.model || 0, higgsfield: r.cost?.higgsfield || 0, total: round((r.cost?.model || 0) + (r.cost?.higgsfield || 0)), pictures: r.creatives?.total || 0 }));
}
