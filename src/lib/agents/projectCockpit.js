// The manager's cabinet of a project (design decision 33, «Активні проєкти»): what the AI Agents section shows about a client's work: at which step of the chain the
// request stands, and what waits for the person. Pure code: it turns the rows of the database (campaigns, requests, tasks, creatives) into the shapes the
// design components take as props (see the contract in docs/design-decisions.md, decision 33). The database is read by lib/api/projectCockpit.js.

import { fileNameOf } from '../creatives/download.js';
import { directionLimit } from './creativeTeam.js';
import { mergeNotes } from './agentNotes.js';
import { intelSummaryLine } from './clientIntel.js';
import { cleanStyle, effectiveStyle } from './projectStyle.js';
import { regularsOf } from './operationCycles.js';

export const STAGES = [
  { key: 'strategy', label: 'Стратег', role: 'creative_strategy' },
  { key: 'brief', label: 'ТЗ', role: 'creative_brief' },
  { key: 'copy', label: 'Копірайтер', role: 'creative_copywriter', parallel: 'make' },
  { key: 'maker', label: 'Креативщик', role: 'creative_maker', parallel: 'make' },
  { key: 'quality', label: 'Контроль якості', role: 'creative_quality' },
  { key: 'you', label: 'Ви', role: null },
];
const MODE_LABEL = { creative: 'Тільки креативи', full: 'Повна операція', strategy: 'Тільки стратегія', ads: 'Аналіз і оптимізація', report: 'Тільки звіт' };
export const REQUEST_STATUS_LABEL = { draft: 'Чернетка', running: 'Працює', review: 'На перегляд', approved: 'Затверджено', problem: 'Проблема' };
const DB_STATUS = { done: 'approved' }; // the database says «done», the screens say «approved»
const STALE_REQUEST_DAYS = 14; // an open request nobody touched for this long is history
const TASK_STATE = { queued: 'waiting', running: 'working', done: 'done', failed: 'failed' };

const clip = (v, n) => String(v ?? '').trim().slice(0, n);
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const round = (n) => Math.round(n * 10000) / 10000;
const at = (v) => { const t = new Date(v).getTime(); return Number.isNaN(t) ? 0 : t; };

export const modeLabelOf = (campaign) => MODE_LABEL[campaign?.config?.mode] || (campaign?.config?.mode ? campaign.config.mode : 'Повна операція');

// notes of the agents are numbered («1) …  2) …» or «1. …  2. …»): every point is one question to the person; a note without numbers is one point
export function splitNotes(text) {
  const raw = String(text || '').trim();
  if (!raw) return [];
  const parts = raw.split(/(?:^|\s)\d{1,2}[.)]\s+/).map((p) => p.trim()).filter(Boolean); // «1) …» and «1. …»
  return (parts.length ? parts : [raw]).map((p) => clip(p, 700));
}

// a small stable id for a text, so the same remark keeps its id between two reads
export function hashText(text) {
  let h = 5381;
  const s = String(text || '');
  for (let i = 0; i < s.length; i += 1) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

const lastBy = (rows, pick) => rows.filter(pick).sort((a, b) => at(b.created_at) - at(a.created_at) || num(b.id) - num(a.id))[0] || null;

// What the agents of the steps that are done are unsure about (the newest note of each step), merged into short entries (lib/agents/agentNotes.js): information for the person, not
// messages that wait for them. The theme «немає фото» is left out while the card tells it in its own message.
export function stepNotes(request, tasks, roleOf, { hasAssets = true } = {}) {
  const mine = tasks.filter((t) => t.request_id === request.id);
  const steps = STAGES.filter((s) => ['creative_strategy', 'creative_brief', 'creative_copywriter', 'creative_maker'].includes(s.role)).map((s) => {
    const t = lastBy(mine, (x) => roleOf(x.agent_id) === s.role && x.status === 'done');
    const notes = t?.notes ?? t?.output?.json?.notes;
    return { label: s.label, points: splitNotes(typeof notes === 'string' ? notes : '') };
  });
  return mergeNotes(steps, request.id, { skipMaterials: !hasAssets });
}

// The scout (owner, 2026-11-12) works once per client, not per request: its task has no request. Its step is the first of the scheme while it works or has made the profile of the client;
// an older task that never had a scout keeps the scheme as it was. A scout that failed does not stop the task: the step shows «без профілю» and the chain goes on.
const SCOUT = { key: 'scout', label: 'Розвідник', role: 'creative_scout' };
function scoutStage(request, tasks, roleOf, intel) {
  const t = lastBy(tasks.filter((x) => x.campaign_id === request.campaign_id && roleOf(x.agent_id) === SCOUT.role), () => true);
  const ready = !!intel && ['ready', 'partial'].includes(intel.status);
  const others = tasks.some((x) => x.request_id === request.id);
  if (!t && !intel && others) return null;
  const base = { key: SCOUT.key, label: SCOUT.label, taskId: t?.id ?? null, startedAt: t?.started_at || null, finishedAt: t?.finished_at || null, costUsd: num(t?.cost_usd), summary: clip(intel?.summary || t?.summary, 400) };
  if (t && ['queued', 'running'].includes(t.status) && !ready) return { ...base, state: t.status === 'running' ? 'working' : 'waiting', note: '' };
  if (ready) return { ...base, state: 'done', note: intelSummaryLine(intel) || 'профіль готовий' };
  if (t?.status === 'failed' || t?.status === 'cancelled' || intel?.status === 'failed') return { ...base, state: 'done', note: `без профілю: ${clip(t?.error, 80) || 'не вдалося вивчити'}`, skipped: true };
  return { ...base, state: 'idle', note: '' };
}

// The steps of the agents that are shown live (lib/api/projectCockpit.js reads ag_task_steps): the lines of ONE request, plus the scout's lines (it works for the whole client).
// → [{ id, role, label, text, state, at }] newest first
export function stepsOfRequest(request, steps = [], tasks = [], roleOf = () => null) {
  const scoutTaskIds = tasks.filter((x) => x.campaign_id === request.campaign_id && roleOf(x.agent_id) === SCOUT.role).map((x) => x.id);
  const lastScout = scoutTaskIds.length ? Math.max(...scoutTaskIds) : null;
  const labelOf = (role) => [SCOUT, ...STAGES].find((s) => s.role === role)?.label || '';
  return steps.filter((x) => (x.request_id === request.id) || (x.role === SCOUT.role && x.campaign_id === request.campaign_id && (lastScout == null || x.task_id === lastScout)))
    .sort((a, b) => num(b.id) - num(a.id)).slice(0, 80).map((x) => ({ id: x.id, role: x.role, label: labelOf(x.role), text: x.text, state: x.state, at: x.created_at }));
}

// The chain of one request: the state of every step is the state of the newest task of its role. extra: { intel: the profile of the client, steps: ag_task_steps rows }
export function buildStages(request, tasks, roleOf, extra = {}) {
  const mine = tasks.filter((t) => t.request_id === request.id);
  const stages = STAGES.map((s) => {
    if (s.key === 'you') {
      const state = request.status === 'done' ? 'done' : request.status === 'review' ? 'working' : 'idle';
      return { key: s.key, label: s.label, state, note: request.status === 'review' ? 'чекає на ваше рішення' : '' };
    }
    const t = lastBy(mine, (x) => roleOf(x.agent_id) === s.role);
    const state = t ? TASK_STATE[t.status] || 'idle' : 'idle';
    // the details of the step for the blocks under the scheme (lib/agents/stageDetails.js): its task, when it worked, what it cost, what it said about its own result
    const out = { key: s.key, label: s.label, state, note: t?.status === 'failed' ? clip(t.error, 160) : '', taskId: t?.id ?? null, startedAt: t?.started_at || null, finishedAt: t?.finished_at || null, costUsd: num(t?.cost_usd), summary: clip(t?.summary, 1200) };
    if (s.parallel) out.parallel = s.parallel;
    return out;
  });
  const scout = scoutStage(request, tasks, roleOf, extra.intel);
  if (scout) stages.unshift(scout);
  // the live line of a step (what it does right now): the newest line that is still «running», or any line of a step that works; a line older than 15 minutes is not live any more
  const lines = stepsOfRequest(request, extra.steps || [], tasks, roleOf);
  const nowMs = extra.now ? new Date(extra.now).getTime() : Date.now();
  stages.forEach((s) => {
    const role = [SCOUT, ...STAGES].find((x) => x.key === s.key)?.role;
    const last = role ? lines.find((l) => l.role === role) : null;
    if (last && nowMs - at(last.at) < 15 * 60000 && (s.state === 'working' || last.state === 'running')) s.live = clip(last.text, 160);
  });
  const current = stages.find((s) => ['working', 'failed', 'waiting'].includes(s.state))?.key || null;
  const done = stages.filter((s) => s.state === 'done').length;
  return { stages, currentStageKey: current, progress: round(done / stages.length) };
}

// What waits for the person in one request.
function requestAttention(request, tasks, creatives, roleOf, library, { onlyReview = false } = {}) {
  const items = [];
  const mine = tasks.filter((t) => t.request_id === request.id);
  const made = creatives.filter((c) => c.request_id === request.id);

  // a step that stopped (and was not repeated successfully since)
  STAGES.filter((s) => s.role && !onlyReview).forEach((s) => {
    const t = lastBy(mine, (x) => roleOf(x.agent_id) === s.role);
    if (t?.status === 'failed') {
      items.push({ id: `failed:${t.id}`, kind: 'failed_step', tone: 'problem', title: `Крок «${s.label}» зупинився`, text: clip(t.error, 400) || 'Крок завершився з помилкою.', requestId: request.id, taskId: t.id,
        actions: [{ key: 'retry_step', label: 'Повторити крок', primary: true }] });
    }
  });

  // pictures waiting for the decision
  const review = made.filter((c) => c.status === 'review');
  if (review.length) {
    items.push({ id: `review:${request.id}`, kind: 'review', tone: 'attention', title: `Креативи на перегляд: ${review.length}`, text: 'Перегляньте й схваліть або поверніть із коментарем.', requestId: request.id,
      creatives: review.map((c) => ({ id: c.id, url: c.final_url || c.asset_url || '', ratio: c.ratio, conceptName: c.concept_name || c.concept_key || '', status: c.status })),
      actions: [{ key: 'approve_all', label: 'Схвалити всі', primary: true }, { key: 'return', label: 'Повернути з коментарем' }] });
  }

  // remarks of the quality control
  const qc = lastBy(mine, (x) => roleOf(x.agent_id) === 'creative_quality' && x.status === 'done');
  const issues = Array.isArray(qc?.issues) ? qc.issues : Array.isArray(qc?.output?.json?.issues) ? qc.output.json.issues : [];
  if (issues.length && !onlyReview && ['review', 'problem'].includes(request.status)) {
    items.push({ id: `qc:${qc.id}`, kind: 'qc_remark', tone: 'attention', title: `Зауваження контролю якості: ${issues.length}`, requestId: request.id,
      text: issues.map((i) => `${i.severity === 'high' ? '● ' : '○ '}${i.concept ? `${i.concept}: ` : ''}${clip(i.comment, 240)}`).join('\n'), actions: [{ key: 'dismiss', label: 'Прийнято до відома' }] });
  }

  // no materials at all: the pictures would be made without references
  if (!onlyReview && ['draft', 'running', 'review', 'problem'].includes(request.status) && !(request.materials || []).length && !library.assets && !library.sitePhotos) {
    items.push({ id: `assets:${request.id}`, kind: 'missing_assets', tone: 'attention', title: 'Немає фото товару', requestId: request.id,
      text: 'У картці проєкту й запиті немає матеріалів: картинки будуть зроблені без референсів, менш точно.', actions: [{ key: 'upload_assets', label: 'Додати фото', primary: true }, { key: 'dismiss', label: 'Продовжити без фото' }] });
  }

  // the pictures are planned and nothing is being made: the person confirms the money
  const planned = made.filter((c) => ['planned', 'failed'].includes(c.status));
  if (planned.length && !onlyReview && !made.some((c) => c.status === 'producing') && ['review', 'running', 'problem'].includes(request.status)) {
    items.push({ id: `estimate:${request.id}`, kind: 'estimate', tone: 'attention', title: `Генерація: ${planned.length} картинок`, requestId: request.id,
      text: 'Спершу оцініть вартість (безкоштовно), потім підтвердіть генерацію.', estimate: null, actions: [{ key: 'estimate', label: 'Оцінити вартість', primary: true }] });
  }
  return items;
}

// The profile of the client for the card «Розвідка клієнта»: what the scout found, in what state it is, whether it is being made now. intel: the ag_project_intel row (or null)
export function intelView(intel, scoutTasks = [], now = null) {
  const open = scoutTasks.some((t) => ['queued', 'running'].includes(t.status));
  if (!intel && !open) return null;
  const p = intel?.profile || {};
  const status = open ? (intel && ['ready', 'partial'].includes(intel.status) ? 'refreshing' : 'running') : intel?.status || 'none';
  return {
    status, updatedAt: intel?.updated_at || null, summary: clip(intel?.summary, 1500), line: intel ? intelSummaryLine(intel) : '', siteUrl: intel?.site_url || '',
    business: clip(p.business, 900), tone: clip(p.tone, 500), visualStyle: clip(p.visual_style, 900), priceRange: clip(p.price_range, 160),
    categories: Array.isArray(p.categories) ? p.categories : [], products: Array.isArray(p.products) ? p.products : [], ads: p.ads || null, gaps: Array.isArray(p.gaps) ? p.gaps : [],
    photos: Array.isArray(intel?.photos) ? intel.photos.map((x) => ({ url: x.url, label: x.label || '', use: x.use || 'product' })) : [],
    autoStyle: cleanStyle(p.style), // the scout's own decision: the starting point of every task (a task changes it for itself, in its own settings)
    style: effectiveStyle(p.style, null),
    costUsd: num(intel?.cost_usd), now,
  };
}

// All the numbers and the cabinet of ONE campaign. raw = { campaign, project, requests, tasks, creatives, agents, library: { assets }, spend }.
export function buildCockpit(raw) {
  const { campaign, project = {}, requests = [], tasks = [], creatives = [], agents = [] } = raw;
  const library = { ...(raw.library || { assets: 0 }), sitePhotos: Array.isArray(raw.intel?.photos) ? raw.intel.photos.length : 0 }; // the photos the scout took from the site count as materials
  const roleMap = new Map(agents.map((a) => [a.id, a.role]));
  const roleOf = (id) => roleMap.get(id) || null;
  const mine = requests.filter((r) => r.campaign_id === campaign.id).sort((a, b) => at(b.created_at) - at(a.created_at));
  const live = mine.filter((r) => ['draft', 'running', 'review', 'problem'].includes(r.status));
  const active = live[0] || mine[0] || null;

  const attention = [];
  // cycles run side by side (the regular one and extra ones), so every open request that was touched lately says what it needs; an old one that was left
  // behind is shown only while pictures wait in it for the decision (its old stops and questions are history)
  const fresh = (raw.now ? new Date(raw.now).getTime() : Date.now()) - STALE_REQUEST_DAYS * 86400000;
  live.slice(0, 6).forEach((r, i) => attention.push(...requestAttention(r, tasks, creatives, roleOf, library, { onlyReview: i > 0 && at(r.updated_at || r.created_at) < fresh })));
  // a campaign agent (not a request step) that failed: a task of the campaign without a request
  tasks.filter((t) => t.campaign_id === campaign.id && !t.request_id && t.status === 'failed' && roleOf(t.agent_id) !== 'creative_scout').slice(0, 5).forEach((t) => {
    attention.push({ id: `failed:${t.id}`, kind: 'failed_step', tone: 'problem', title: 'Агент операції зупинився', text: clip(t.error, 400) || 'Завдання завершилось помилкою.', requestId: null, taskId: t.id, actions: [{ key: 'retry_step', label: 'Повторити крок', primary: true }] });
  });
  attention.sort((a, b) => (a.tone === 'problem' ? 0 : 1) - (b.tone === 'problem' ? 0 : 1));

  const extra = { intel: raw.intel || null, steps: raw.steps || [], now: raw.now };
  const chain = active ? buildStages(active, tasks, roleOf, extra) : { stages: STAGES.map((s) => ({ key: s.key, label: s.label, state: 'idle', note: '', ...(s.parallel ? { parallel: s.parallel } : {}) })), currentStageKey: null, progress: 0 };
  const tone = attention.some((i) => i.tone === 'problem') ? 'problem' : attention.length ? 'attention' : 'ok';

  const modelCost = round(tasks.filter((t) => t.campaign_id === campaign.id || mine.some((r) => r.id === t.request_id)).reduce((s, t) => s + num(t.cost_usd), 0));
  const higgsfield = round(num(raw.spend));
  return {
    id: campaign.id, projectId: campaign.project_id ?? null, name: campaign.name, client: project.client || project.name || '', modeLabel: modeLabelOf(campaign), tone, waiting: attention.length, status: campaign.status === 'paused' ? 'paused' : 'active',
    activeRequestId: active?.id ?? null, stages: chain.stages, currentStageKey: chain.currentStageKey, progress: chain.progress, attention,
    requests: mine.filter((r) => r.status !== 'cancelled').map((r) => {
      const c = creatives.filter((x) => x.request_id === r.id);
      const status = DB_STATUS[r.status] || r.status;
      const own = buildStages(r, tasks, roleOf, extra);
      const brief = r.brief || {};
      const items = c.slice().sort((a, b) => num(a.id) - num(b.id)).map((x) => {
        const url = x.final_url || x.asset_url || '';
        const v = x.copy?.variants?.[0] || null;
        const item = { id: x.id, url, rawUrl: x.asset_url || '', hasText: !!x.final_url, downloadUrl: url, ratio: x.ratio, conceptName: x.concept_name || x.concept_key || '', status: x.status, kind: 'image', note: clip(x.note, 400),
          copy: v ? { headline: clip(v.headline, 200), text: clip(v.primary || v.text || v.body, 900), description: clip(v.description, 300), cta: clip(v.cta, 60) } : null };
        return { ...item, fileName: fileNameOf(item, { project: project.name || campaign.name }) };
      });
      const n = (s) => c.filter((x) => x.status === s).length;
      return { id: r.id, title: clip(r.title, 90), brief, status, statusLabel: REQUEST_STATUS_LABEL[status] || status, items, updatedAt: r.updated_at || r.created_at, createdAt: r.created_at || null,
        // the cycle: regular (made by the schedule) or extra, what was asked, its own chain and its money (lib/agents/operationCycles.js)
        kind: brief.kind === 'regular' ? 'regular' : 'extra', scheduledFor: brief.scheduled_for || null, regularId: brief.regular_id || null, goal: clip(brief.goal, 400), ratios: Array.isArray(brief.ratios) && brief.ratios.length ? brief.ratios : ['1:1'], directions: directionLimit(brief),
        stages: own.stages, steps: stepsOfRequest(r, raw.steps || [], tasks, roleOf), currentStageKey: own.currentStageKey, error: clip(r.error, 300), notes: ['draft', 'running', 'review', 'problem'].includes(r.status) ? stepNotes(r, tasks, roleOf, { hasAssets: !!((r.materials || []).length || library.assets || library.sitePhotos) }) : [],
        cost: { model: round(tasks.filter((t) => t.request_id === r.id).reduce((s, t) => s + num(t.cost_usd), 0)), higgsfield: round(c.reduce((s, x) => s + num(x.cost_usd), 0)) },
        creatives: { total: c.length, review: n('review'), approved: n('approved'), rejected: n('rejected'), failed: n('failed'), producing: n('producing'), planned: n('planned') } };
    }),
    spend: { model: modelCost, higgsfield, total: round(modelCost + higgsfield), currency: 'USD' },
    regulars: regularsOf(campaign).map((r) => ({ id: r.id, seasonal: !!r.seasonal, title: r.title || '' })), // the regular tasks of the operation: the marks of the runs («Результати AI команди»)
    scoutSteps: stepsOfRequest({ id: -1, campaign_id: campaign.id }, raw.steps || [], tasks, roleOf), // the live lines of the scout (it works for the client, not for one task)
    intel: intelView(raw.intel, tasks.filter((t) => t.campaign_id === campaign.id && roleOf(t.agent_id) === SCOUT.role), raw.now),
    updatedAt: active?.updated_at || campaign.updated_at || campaign.created_at || null,
  };
}

// The line of the list: the short form of a cabinet.
export function summaryOf(cockpit) {
  const cur = STAGES.find((s) => s.key === cockpit.currentStageKey);
  const stateOfCur = cockpit.stages.find((s) => s.key === cockpit.currentStageKey)?.state;
  const first = cockpit.requests[0];
  const stageLabel = cockpit.status === 'paused' ? 'На паузі'
    : !first ? 'Чекає на запит'
      : first.status === 'approved' ? 'Усе затверджено'
        : cockpit.stages.some((s) => s.state === 'failed') ? `${cockpit.stages.find((s) => s.state === 'failed').label} зупинився`
          : first.status === 'review' ? 'Готово до перегляду'
          : cur ? `${cur.label}${stateOfCur === 'failed' ? ' зупинився' : stateOfCur === 'waiting' ? ' у черзі' : ' працює'}` : first.statusLabel;
  return { id: cockpit.id, name: cockpit.name, client: cockpit.client, modeLabel: cockpit.modeLabel, stageLabel, progress: cockpit.progress, waiting: cockpit.waiting, tone: cockpit.tone, updatedAt: cockpit.updatedAt };
}

// The campaigns that are worked on: active ones (a paused one only when something is open in it).
export const isActiveCampaign = (campaign, requests = []) => campaign.status === 'active' || requests.some((r) => r.campaign_id === campaign.id && ['running', 'review', 'problem'].includes(r.status));

// The rows to show in the list: the problems first, then the ones that wait for a person, then the rest by the time of the last change.
export function sortProjects(list) {
  const rank = { problem: 0, attention: 1, ok: 2 };
  return [...list].sort((a, b) => rank[a.tone] - rank[b.tone] || at(b.updatedAt) - at(a.updatedAt));
}
