// The projects of the AI Agents section (owner, 2026-11-11): one per client project of the CRM, the operations run inside it. Rows of ag_projects joined with the
// CRM project, its cabinets, its operations and what waits for the person. Pure code: the page «Проєкти» and the tests use it.

import { buildOperationView } from './operationCycles.js';
import { modeLabelOf } from './projectCockpit.js';

export const SORTS = [
  { key: 'attention', label: 'Спершу ті, що чекають вас' },
  { key: 'updated', label: 'Останні зміни' },
  { key: 'created_desc', label: 'Нові спершу' },
  { key: 'created_asc', label: 'Старі спершу' },
  { key: 'name', label: 'За назвою клієнта' },
  { key: 'cabinet', label: 'За кабінетом' },
  { key: 'active', label: 'Спершу з активними операціями' },
];
export const PLATFORM_LABEL = { meta: 'Meta', google: 'Google', tiktok: 'TikTok' };
const PLATFORM_ORDER = ['meta', 'google', 'tiktok'];
const at = (v) => { const t = new Date(v).getTime(); return Number.isNaN(t) ? 0 : t; };
const RANK = { problem: 0, attention: 1, ok: 2 };

// aiProjects: ag_projects rows; projects: [{ id, name, client }]; accounts: [{ project_id, platform }]; campaigns: ag_campaigns rows;
// cockpits: the cabinets of the active operations by campaign id ({ projectId, waiting, tone, progress, updatedAt, modeLabel, ... }) with their short lines in `summaries`.
// → [{ id (the CRM project), client, name, status, platforms, operations: { total, active, paused, archived }, waiting, tone, progress, stageLabel, modeLabel,
//      openCampaignId (the operation to open: the most urgent active one, or null), createdAt, updatedAt, finishedAt }]
// The person's own name of a project inside the section: one line, up to 100 characters; empty = the name from the CRM. → string | null
export const TITLE_MAX = 100;
export function cleanProjectTitle(value) {
  const t = String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, TITLE_MAX).trim();
  return t || null;
}

export function buildProjectRows({ aiProjects = [], projects = [], accounts = [], campaigns = [], cockpits = {}, summaries = [] } = {}) {
  const projectById = new Map(projects.map((p) => [p.id, p]));
  const summaryById = new Map(summaries.map((s) => [s.id, s]));
  return aiProjects.filter((a) => a.status !== 'removed').map((a) => {
    const p = projectById.get(a.project_id) || {};
    const ops = campaigns.filter((c) => c.project_id === a.project_id);
    const live = ops.map((c) => cockpits[c.id]).filter(Boolean).sort((x, y) => RANK[x.tone] - RANK[y.tone] || at(y.updatedAt) - at(x.updatedAt));
    const main = live[0] || null;
    const platforms = PLATFORM_ORDER.filter((k) => accounts.some((x) => x.project_id === a.project_id && x.platform === k));
    const updated = Math.max(at(a.updated_at), ...ops.map((c) => at(c.updated_at || c.created_at)), ...live.map((c) => at(c.updatedAt)));
    return {
      // client: the name shown everywhere (the person's own one when it is set); crmClient: the name from the CRM card; title: only the person's own name
      id: a.project_id, client: cleanProjectTitle(a.title) || p.client || p.name || `Проєкт ${a.project_id}`, crmClient: p.client || p.name || `Проєкт ${a.project_id}`, title: cleanProjectTitle(a.title) || '', name: p.name || '', status: a.status, platforms,
      operations: { total: ops.length, active: ops.filter((c) => c.status === 'active').length, paused: ops.filter((c) => c.status === 'paused').length, archived: ops.filter((c) => c.status === 'archived').length },
      waiting: live.reduce((s, c) => s + (c.waiting || 0), 0), tone: main ? main.tone : 'ok', progress: main ? main.progress : 0,
      stageLabel: main ? summaryById.get(main.id)?.stageLabel || '' : '', modeLabel: main ? main.modeLabel : '',
      openCampaignId: main ? main.id : null, createdAt: a.created_at || null, updatedAt: updated ? new Date(updated).toISOString() : null, finishedAt: a.finished_at || null,
    };
  });
}

// tab: 'active' | 'archive' (the finished ones); filter: 'all' | 'waiting' | 'working'; query: a part of the client's or the project's name; sort: a key of SORTS
export function filterSortProjects(rows = [], { tab = 'active', filter = 'all', query = '', sort = 'attention' } = {}) {
  const q = String(query || '').trim().toLowerCase();
  const shown = rows.filter((r) => (tab === 'archive' ? r.status === 'done' : r.status === 'active'))
    .filter((r) => tab === 'archive' || filter === 'all' || (filter === 'waiting' ? r.waiting > 0 : r.waiting === 0))
    .filter((r) => !q || `${r.client} ${r.crmClient || ''} ${r.name}`.toLowerCase().includes(q));
  const byName = (a, b) => a.client.localeCompare(b.client, 'uk') || a.name.localeCompare(b.name, 'uk');
  const cmp = {
    attention: (a, b) => RANK[a.tone] - RANK[b.tone] || b.waiting - a.waiting || at(b.updatedAt) - at(a.updatedAt),
    updated: (a, b) => at(b.updatedAt) - at(a.updatedAt),
    created_desc: (a, b) => at(b.createdAt) - at(a.createdAt),
    created_asc: (a, b) => at(a.createdAt) - at(b.createdAt),
    name: byName,
    cabinet: (a, b) => (a.platforms.join('+') || 'яяя').localeCompare(b.platforms.join('+') || 'яяя') || byName(a, b), // projects without a cabinet last
    active: (a, b) => b.operations.active - a.operations.active || b.operations.total - a.operations.total || byName(a, b),
  }[sort] || (() => 0);
  return [...shown].sort((a, b) => cmp(a, b) || byName(a, b));
}

export const projectCounts = (rows = []) => ({
  active: rows.filter((r) => r.status === 'active').length, archive: rows.filter((r) => r.status === 'done').length,
  waiting: rows.filter((r) => r.status === 'active' && r.waiting > 0).length, working: rows.filter((r) => r.status === 'active' && r.waiting === 0).length,
});

// The operations that must stop when a project is finished or taken out of the section (the agents must not keep working and spending): everything not archived yet.
export const operationsToStop = (campaigns = [], projectId) => campaigns.filter((c) => c.project_id === projectId && c.status !== 'archived').map((c) => c.id);

// ---- inside the card of a project
// The operations of one project in three groups: the ones in work (active, then paused; a problem and what waits first), the planned ones (created, not launched yet)
// and the finished ones (the archive), each newest first. campaigns: ag_campaigns rows of the project; cockpits / summaries: as in buildProjectRows.
// → { current, planned, finished }: [{ id, name, status, modeLabel, platforms, progress, waiting, tone, stageLabel, hasWork, createdAt, updatedAt }]
export function groupOperations(campaigns = [], cockpits = {}, summaries = []) {
  const sum = new Map(summaries.map((s) => [s.id, s]));
  const item = (c) => {
    const k = cockpits[c.id] || null;
    // the cycles that are open now: the ones in work, then the ones whose creatives wait for the person's check
    const v = k ? buildOperationView({ campaign: c, cockpit: k }) : null;
    const working = v ? v.inWork.filter((x) => x.status !== 'draft') : [];
    const live = v ? [...working, ...v.review.filter((r) => r.pending && !working.some((x) => x.id === r.id))] : [];
    return { cycles: live.map((x) => ({ id: x.id, kindLabel: x.kindLabel, title: x.title })), cycleProgress: live.length ? live[0].progress ?? 1 : 0,
      id: c.id, name: c.name || `Операція ${c.id}`, status: c.status, modeLabel: modeLabelOf(c), platforms: [...(c.platforms || [])], progress: k ? k.progress : 0, waiting: k ? k.waiting : 0, tone: k ? k.tone : 'ok',
      stageLabel: sum.get(c.id)?.stageLabel || '', hasWork: !!k, createdAt: c.created_at || null, updatedAt: (k && k.updatedAt) || c.updated_at || c.created_at || null };
  };
  const of = (...st) => campaigns.filter((c) => st.includes(c.status)).map(item);
  return {
    current: of('active', 'paused').sort((a, b) => RANK[a.tone] - RANK[b.tone] || (a.status === 'active' ? 0 : 1) - (b.status === 'active' ? 0 : 1) || at(b.updatedAt) - at(a.updatedAt)),
    planned: of('draft').sort((a, b) => at(b.createdAt) - at(a.createdAt)),
    finished: of('archived').sort((a, b) => at(b.updatedAt) - at(a.updatedAt)),
  };
}

// The state of a project in one chip and the line about its operations (the head of the card). → { label, tone (a class of the chip), ops }
export function projectHeadline(row = {}, campaigns = []) {
  const n = (s) => campaigns.filter((c) => c.status === s).length;
  const live = n('active'), paused = n('paused'), drafts = n('draft'), total = campaigns.length;
  const ops = total ? `операцій: ${total}${live ? `, у роботі: ${live}` : ''}${paused ? `, на паузі: ${paused}` : ''}` : 'операцій ще немає';
  if (row.status === 'done') return { label: 'Завершено', tone: 'is-ok', ops };
  if (live) return row.tone === 'problem' ? { label: 'є проблема', tone: 'is-bad', ops } : row.waiting > 0 ? { label: 'чекає на вас', tone: 'is-warn', ops } : { label: 'працює', tone: 'is-work', ops };
  if (paused) return { label: 'зупинено', tone: '', ops };
  return { label: drafts ? 'операції не запущені' : 'без операцій', tone: 'is-grey', ops };
}

// ---- «Налаштування агентів» of the project card: every agent of one operation in one list.
// team: { agents } the operation's own team (ag_agents rows: role, name, enabled, config, schedule, last_run_at); dept: { agents, links } the creative department
// and its links to this operation (ag_agent_clients rows: agent_id, enabled). The helpers are handed in so this file stays free of the registries.
// → [{ key, kind: 'campaign' | 'dept', role, name, short, working, mode, modeLabel, when, lastRunAt }] the working ones first, in the order of the chain
export function agentRows({ team = null, dept = null, shortOf = () => '', describeSchedule = () => '', modeOfAgent = (a) => (a.enabled ? 'auto' : 'paused'), modeText = {}, triggerText = {} } = {}) {
  const out = [];
  (team?.agents || []).forEach((a) => {
    const mode = modeOfAgent(a);
    const when = mode === 'paused' ? '' : describeSchedule(a.schedule) || triggerText[a.config?.trigger || 'upstream'] || '';
    out.push({ key: `c${a.id}`, kind: 'campaign', role: a.role, name: a.name, short: shortOf(a.role), working: mode !== 'paused', mode, modeLabel: modeText[mode] || mode, when, lastRunAt: a.last_run_at || null, sort: a.sort ?? 0 });
  });
  (dept?.agents || []).forEach((a) => {
    const link = (dept.links || []).find((l) => l.agent_id === a.id) || null;
    const on = !!(link && link.enabled && a.enabled !== false);
    const mode = on ? 'auto' : 'paused';
    out.push({ key: `d${a.id}`, kind: 'dept', role: a.role, name: a.name, short: [shortOf(a.role), 'відділ креативів'].filter(Boolean).join(' · '), working: on, mode, modeLabel: on ? 'Працює для клієнта' : link ? 'Вимкнено для клієнта' : 'Не підключено', when: on ? describeSchedule(a.schedule) || triggerText[a.config?.trigger || 'request'] || '' : '', lastRunAt: a.last_run_at || null, sort: 1000 + (a.sort ?? 0) });
  });
  return out.sort((x, y) => (x.working ? 0 : 1) - (y.working ? 0 : 1) || x.sort - y.sort).map(({ sort, ...r }) => r);
}
