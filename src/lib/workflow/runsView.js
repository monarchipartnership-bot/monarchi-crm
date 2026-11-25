// The window «Прогони» of the AI Agents section: one journal of all runs of all projects (who, what, when, how it ended, what it cost). PURE.
import { RERUN_SKILLS, SKILL_LABEL, agentName } from './view.js';

export const STATUS = { done: ['ok', 'Готово'], failed: ['bad', 'Помилка'], running: ['info', 'Працює'], queued: ['info', 'У черзі'], waiting: ['warn', 'Чекає'], cancelled: ['mute', 'Скасовано'] };
const OPEN = new Set(['queued', 'running', 'waiting']);

export function durationText(sec) {
  if (sec == null || !Number.isFinite(sec)) return '';
  if (sec < 1) return 'менше секунди';
  if (sec < 60) return `${Math.round(sec)} с`;
  const m = Math.floor(sec / 60), s = Math.round(sec % 60);
  return m < 60 ? `${m} хв${s ? ` ${s} с` : ''}` : `${Math.floor(m / 60)} год ${m % 60} хв`;
}

export function runRows({ runs = [], projects = {} } = {}) {
  return runs.map((r) => {
    const [tone, statusLabel] = STATUS[r.status] || ['mute', r.status || ''];
    const seconds = r.finished_at && r.created_at ? (new Date(r.finished_at) - new Date(r.created_at)) / 1000 : null;
    return {
      id: r.id, at: r.created_at, projectId: r.project_id, project: projects[r.project_id]?.name || `Проєкт ${r.project_id}`, agent: r.agent, agentName: agentName(r.agent), skill: r.skill,
      label: SKILL_LABEL[r.skill] || r.skill, status: r.status, tone, statusLabel, open: OPEN.has(r.status), cost: Number(r.cost_usd || 0), seconds, duration: durationText(seconds),
      error: r.error || '', manual: r.trigger === 'manual', canRerun: RERUN_SKILLS.has(r.skill) && !OPEN.has(r.status),
    };
  }).sort((a, b) => b.id - a.id);
}

export const STATUS_FILTERS = [['all', 'Усі'], ['failed', 'Не вдалось'], ['open', 'Відкриті'], ['done', 'Готово']];
export function runCounts(rows) { return { all: rows.length, failed: rows.filter((r) => r.status === 'failed').length, open: rows.filter((r) => r.open).length, done: rows.filter((r) => r.status === 'done').length }; }
export function filterRuns(rows, { status = 'all', agent = '', project = '' } = {}) {
  return rows.filter((r) => (status === 'all' || (status === 'open' ? r.open : r.status === status)) && (!agent || r.agent === agent) && (!project || String(r.projectId) === String(project)));
}
