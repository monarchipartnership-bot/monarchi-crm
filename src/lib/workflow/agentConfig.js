// THE SETTINGS OF THE AGENTS in one place (owner's rule 2026-11-26): when they work, how much they spend, what they do alone, when they tell a person.
// Two levels: the settings of ALL projects (wf_settings.config) and the settings of ONE project that override them (wf_project_state.config). Only the values that
// differ from the defaults are stored. PURE: used by the orchestrator, the skills, the cron endpoints and the settings page.

export const DEFAULTS = {
  optimize: { every_hours: 24, at_hour: 10, skip_weekends: false },
  month_plan: { day: 1 },
  video_per_month: 3,
  small_actions: { max_pauses: 3, max_scales: 2 },
  thresholds: { learning_days: 3, min_spend_factor: 1.5, budget_step_pct: 20, budget_step_hours: 72, much_worse_factor: 1.5 },
  reports_via_orchestrator: false,
  notify: { approvals: true, stopped: true, cost_cap: true, waiting: true, waiting_after_min: 60, auto_actions: true, digest: true, digest_hour: 9 },
};

// every setting: its type, its limits and who may change it ('project' = a project may have its own, 'global' = the same for all)
export const SPEC = {
  'optimize.every_hours': { type: 'int', min: 1, max: 168, scope: 'project', label: 'Як часто перевіряти результати', unit: 'год' },
  'optimize.at_hour': { type: 'int', min: 0, max: 23, scope: 'project', label: 'О котрій годині (за Києвом)', unit: 'год' },
  'optimize.skip_weekends': { type: 'bool', scope: 'project', label: 'Не працювати у вихідні' },
  'month_plan.day': { type: 'int', min: 1, max: 28, scope: 'project', label: 'День місяця для плану', unit: '-го числа' },
  video_per_month: { type: 'int', min: 0, max: 20, scope: 'project', label: 'Відео на проєкт на місяць' },
  'small_actions.max_pauses': { type: 'int', min: 0, max: 10, scope: 'project', label: 'Пауз оголошень за прохід' },
  'small_actions.max_scales': { type: 'int', min: 0, max: 5, scope: 'project', label: 'Підйомів бюджету за прохід' },
  'thresholds.learning_days': { type: 'int', min: 0, max: 14, scope: 'project', label: 'Днів навчання без оцінки', unit: 'дн' },
  'thresholds.min_spend_factor': { type: 'num', min: 0.5, max: 5, scope: 'project', label: 'Витрати до вердикту, у цільових CPA', unit: '×' },
  'thresholds.budget_step_pct': { type: 'int', min: 5, max: 20, scope: 'project', label: 'Крок бюджету', unit: '%' }, // above 20% is always a decision of the manager (Апрув 3)
  'thresholds.budget_step_hours': { type: 'int', min: 24, max: 336, scope: 'project', label: 'Не частіше, ніж раз на', unit: 'год' },
  'thresholds.much_worse_factor': { type: 'num', min: 1.1, max: 5, scope: 'project', label: 'Оголошення «суттєво гірше за сусідів»', unit: '×' },
  reports_via_orchestrator: { type: 'bool', scope: 'global', label: 'Звіти через оркестратор' },
  'notify.approvals': { type: 'bool', scope: 'global', label: 'Потрібен мій апрув' },
  'notify.stopped': { type: 'bool', scope: 'global', label: 'Процес зупинено' },
  'notify.cost_cap': { type: 'bool', scope: 'global', label: 'Досягнуто ліміт витрат' },
  'notify.waiting': { type: 'bool', scope: 'global', label: 'Крок чекає даних від мене' },
  'notify.waiting_after_min': { type: 'int', min: 15, max: 1440, scope: 'global', label: 'Нагадувати, якщо чекає понад', unit: 'хв' },
  'notify.auto_actions': { type: 'bool', scope: 'global', label: 'Дрібна дія агента в кабінеті' },
  'notify.digest': { type: 'bool', scope: 'global', label: 'Ранкове зведення' },
  'notify.digest_hour': { type: 'int', min: 0, max: 23, scope: 'global', label: 'Година зведення (за Києвом)', unit: 'год' },
};

const clone = (o) => JSON.parse(JSON.stringify(o));
const getPath = (o, p) => p.split('.').reduce((x, k) => (x == null ? undefined : x[k]), o);
function setPath(o, p, v) {
  const ks = p.split('.'); let x = o;
  ks.slice(0, -1).forEach((k) => { if (typeof x[k] !== 'object' || x[k] === null) x[k] = {}; x = x[k]; });
  x[ks.at(-1)] = v;
}
const delPath = (o, p) => { const ks = p.split('.'); let x = o; for (const k of ks.slice(0, -1)) { if (!x || typeof x[k] !== 'object') return; x = x[k]; } if (x) delete x[ks.at(-1)]; };

// → one value checked against its spec, or { error }
export function checkValue(path, raw) {
  const s = SPEC[path];
  if (!s) return { error: 'Невідоме налаштування.' };
  if (s.type === 'bool') return typeof raw === 'boolean' ? { value: raw } : { error: 'Очікується так або ні.' };
  const n = typeof raw === 'number' ? raw : Number(String(raw ?? '').replace(',', '.'));
  if (raw === '' || raw == null || !Number.isFinite(n)) return { error: 'Потрібне число.' };
  if (s.type === 'int' && !Number.isInteger(n)) return { error: 'Потрібне ціле число.' };
  if (n < s.min || n > s.max) return { error: `Від ${s.min} до ${s.max}.` };
  return { value: n };
}

// the sparse config stored for a level, cleaned: unknown paths and values out of limits are dropped (a project may not set a «global» path)
export function cleanConfig(stored, scope) {
  const out = {};
  for (const path of Object.keys(SPEC)) {
    if (scope === 'project' && SPEC[path].scope !== 'project') continue;
    const v = getPath(stored, path);
    if (v === undefined) continue;
    const c = checkValue(path, v);
    if (!c.error) setPath(out, path, c.value);
  }
  return out;
}

// → the full settings that apply: the defaults, then the settings of all projects, then the settings of this project
export function resolveConfig(globalCfg = {}, projectCfg = {}) {
  const out = clone(DEFAULTS);
  const g = cleanConfig(globalCfg || {}, 'global'), p = cleanConfig(projectCfg || {}, 'project');
  for (const path of Object.keys(SPEC)) { const a = getPath(g, path); if (a !== undefined) setPath(out, path, a); }
  for (const path of Object.keys(SPEC)) { const a = getPath(p, path); if (a !== undefined) setPath(out, path, a); }
  return out;
}

// a change from the page: { path: value | null } (null = back to the default of the level above). → { config: new sparse config, errors: [{ path, error }] }
export function applyChanges(stored, changes, scope) {
  const next = cleanConfig(stored || {}, scope);
  if (scope === 'global' && stored?._digest_on) next._digest_on = stored._digest_on; // the day the morning digest was sent: kept by the cron, not a setting
  const errors = [];
  for (const [path, raw] of Object.entries(changes || {})) {
    if (!SPEC[path] || (scope === 'project' && SPEC[path].scope !== 'project')) { errors.push({ path, error: 'Це налаштування змінюється для всіх проєктів.' }); continue; }
    if (raw === null) { delPath(next, path); continue; }
    const c = checkValue(path, raw);
    if (c.error) errors.push({ path, error: c.error }); else setPath(next, path, c.value);
  }
  return { config: next, errors };
}

// what the planner of the orchestrator needs (api/_lib/wf/machine.js)
export const plannerConfig = (cfg) => ({ optimizeEveryHours: cfg.optimize.every_hours, optimizeAtHour: cfg.optimize.at_hour, skipWeekends: cfg.optimize.skip_weekends, monthStartDay: cfg.month_plan.day });

// the value to show: where it comes from. level: 'project' (its own) | 'global' (set for all projects) | 'default'
export function sourceOf(path, globalCfg, projectCfg) {
  if (getPath(cleanConfig(projectCfg || {}, 'project'), path) !== undefined) return 'project';
  if (getPath(cleanConfig(globalCfg || {}, 'global'), path) !== undefined) return 'global';
  return 'default';
}
export { getPath };
