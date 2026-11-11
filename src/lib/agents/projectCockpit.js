// The manager's cabinet of a project (design decision 33, «Активні проєкти»): what the AI Agents section shows about a client's work: at which step of the chain the
// request stands, and what waits for the person. Pure code: it turns the rows of the database (campaigns, requests, tasks, creatives) into the shapes the
// design components take as props (see the contract in docs/design-decisions.md, decision 33). The database is read by lib/api/projectCockpit.js.

import { fileNameOf } from '../creatives/download.js';
import { directionLimit } from './creativeTeam.js';

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

// notes of the agents are numbered («1) …  2) …»): every point is one question to the person; a note without numbers is one point
export function splitNotes(text) {
  const raw = String(text || '').trim();
  if (!raw) return [];
  const parts = raw.split(/(?:^|\s)\d{1,2}\)\s+/).map((p) => p.trim()).filter(Boolean);
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

// The chain of one request: the state of every step is the state of the newest task of its role.
export function buildStages(request, tasks, roleOf) {
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

  // what the agents ask: the notes of the steps that are done (the newest note of each step), ONE card per step with its points, the same note of two steps once
  const asked = new Set();
  STAGES.filter((s) => !onlyReview && ['creative_strategy', 'creative_brief', 'creative_copywriter', 'creative_maker'].includes(s.role)).forEach((s) => {
    const t = lastBy(mine, (x) => roleOf(x.agent_id) === s.role && x.status === 'done');
    const notes = t?.notes ?? t?.output?.json?.notes;
    const points = splitNotes(typeof notes === 'string' ? notes : '');
    if (!points.length) return;
    const id = `question:${request.id}:${hashText(points.join('|'))}`;
    if (asked.has(id)) return;
    asked.add(id);
    items.push({ id, kind: 'question', tone: 'attention', title: `Питання від кроку «${s.label}»`, text: points.length > 1 ? points.map((p, i) => `${i + 1}) ${p}`).join('\n') : points[0], requestId: request.id, actions: [{ key: 'dismiss', label: 'Зрозуміло' }] });
  });

  // remarks of the quality control
  const qc = lastBy(mine, (x) => roleOf(x.agent_id) === 'creative_quality' && x.status === 'done');
  const issues = Array.isArray(qc?.issues) ? qc.issues : Array.isArray(qc?.output?.json?.issues) ? qc.output.json.issues : [];
  if (issues.length && !onlyReview && ['review', 'problem'].includes(request.status)) {
    items.push({ id: `qc:${qc.id}`, kind: 'qc_remark', tone: 'attention', title: `Зауваження контролю якості: ${issues.length}`, requestId: request.id,
      text: issues.map((i) => `${i.severity === 'high' ? '● ' : '○ '}${i.concept ? `${i.concept}: ` : ''}${clip(i.comment, 240)}`).join('\n'), actions: [{ key: 'dismiss', label: 'Прийнято до відома' }] });
  }

  // no materials at all: the pictures would be made without references
  if (!onlyReview && ['draft', 'running', 'review', 'problem'].includes(request.status) && !(request.materials || []).length && !library.assets) {
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

// All the numbers and the cabinet of ONE campaign. raw = { campaign, project, requests, tasks, creatives, agents, library: { assets }, spend }.
export function buildCockpit(raw) {
  const { campaign, project = {}, requests = [], tasks = [], creatives = [], agents = [] } = raw;
  const library = raw.library || { assets: 0 };
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
  tasks.filter((t) => t.campaign_id === campaign.id && !t.request_id && t.status === 'failed').slice(0, 5).forEach((t) => {
    attention.push({ id: `failed:${t.id}`, kind: 'failed_step', tone: 'problem', title: 'Агент операції зупинився', text: clip(t.error, 400) || 'Завдання завершилось помилкою.', requestId: null, taskId: t.id, actions: [{ key: 'retry_step', label: 'Повторити крок', primary: true }] });
  });
  attention.sort((a, b) => (a.tone === 'problem' ? 0 : 1) - (b.tone === 'problem' ? 0 : 1));

  const chain = active ? buildStages(active, tasks, roleOf) : { stages: STAGES.map((s) => ({ key: s.key, label: s.label, state: 'idle', note: '', ...(s.parallel ? { parallel: s.parallel } : {}) })), currentStageKey: null, progress: 0 };
  const tone = attention.some((i) => i.tone === 'problem') ? 'problem' : attention.length ? 'attention' : 'ok';

  const modelCost = round(tasks.filter((t) => t.campaign_id === campaign.id || mine.some((r) => r.id === t.request_id)).reduce((s, t) => s + num(t.cost_usd), 0));
  const higgsfield = round(num(raw.spend));
  return {
    id: campaign.id, projectId: campaign.project_id ?? null, name: campaign.name, client: project.client || project.name || '', modeLabel: modeLabelOf(campaign), tone, waiting: attention.length, status: campaign.status === 'paused' ? 'paused' : 'active',
    activeRequestId: active?.id ?? null, stages: chain.stages, currentStageKey: chain.currentStageKey, progress: chain.progress, attention,
    requests: mine.filter((r) => r.status !== 'cancelled').map((r) => {
      const c = creatives.filter((x) => x.request_id === r.id);
      const status = DB_STATUS[r.status] || r.status;
      const own = buildStages(r, tasks, roleOf);
      const brief = r.brief || {};
      const items = c.slice().sort((a, b) => num(a.id) - num(b.id)).map((x) => {
        const url = x.final_url || x.asset_url || '';
        const v = x.copy?.variants?.[0] || null;
        const item = { id: x.id, url, downloadUrl: url, ratio: x.ratio, conceptName: x.concept_name || x.concept_key || '', status: x.status, kind: 'image', note: clip(x.note, 400),
          copy: v ? { headline: clip(v.headline, 200), text: clip(v.primary || v.text || v.body, 900), description: clip(v.description, 300), cta: clip(v.cta, 60) } : null };
        return { ...item, fileName: fileNameOf(item, { project: project.name || campaign.name }) };
      });
      const n = (s) => c.filter((x) => x.status === s).length;
      return { id: r.id, title: clip(r.title, 90), status, statusLabel: REQUEST_STATUS_LABEL[status] || status, items, updatedAt: r.updated_at || r.created_at, createdAt: r.created_at || null,
        // the cycle: regular (made by the schedule) or extra, what was asked, its own chain and its money (lib/agents/operationCycles.js)
        kind: brief.kind === 'regular' ? 'regular' : 'extra', scheduledFor: brief.scheduled_for || null, regularId: brief.regular_id || null, goal: clip(brief.goal, 400), ratios: Array.isArray(brief.ratios) && brief.ratios.length ? brief.ratios : ['1:1'], directions: directionLimit(brief),
        stages: own.stages, currentStageKey: own.currentStageKey, error: clip(r.error, 300),
        cost: { model: round(tasks.filter((t) => t.request_id === r.id).reduce((s, t) => s + num(t.cost_usd), 0)), higgsfield: round(c.reduce((s, x) => s + num(x.cost_usd), 0)) },
        creatives: { total: c.length, review: n('review'), approved: n('approved'), rejected: n('rejected'), failed: n('failed'), producing: n('producing'), planned: n('planned') } };
    }),
    spend: { model: modelCost, higgsfield, total: round(modelCost + higgsfield), currency: 'USD' },
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
