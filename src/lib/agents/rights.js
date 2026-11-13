// Rights and the journal of the AI Agents section (spec 2026-11-02, §9). Pure code, shared by the server (which checks before an action and writes the journal) and the pages.
// One list of APPROVERS (ai_agent_settings.approvers) decides who may start paid work, confirm results and change a campaign's money limits. Empty list = anyone with access
// (as the approvers of project reports); operations managers may always, and only they change the list. The database holds the same rules for what the browser writes directly.

// level: 'paid' (starts work that costs money), 'result' (confirms or changes what the agents delivered), 'logged' (free to do, but written to the journal), null (not journaled)
export const ACTION_RULES = {
  launch_campaign: { level: 'paid', label: 'Запуск операції' },
  start_request: { level: 'paid', label: 'Запуск запиту на креативи' },
  start_intel: { level: 'paid', label: 'Розвідка клієнта (сайт і кабінет)' },
  generate_creatives: { level: 'paid', label: 'Генерація зображень у Higgsfield' },
  run_agent: { level: 'paid', label: 'Ручний запуск агента' },
  retry_task: { level: 'paid', label: 'Повтор кроку' },
  restart_agent: { level: 'paid', label: 'Перезапуск агента' },
  dry_run: { level: 'paid', label: 'Пробний запуск агента' },
  redo_visual: { level: 'paid', label: 'Нова картинка' },
  pass_on: { level: 'result', label: 'Підтвердження результату' },
  edit_output: { level: 'result', label: 'Правка результату агента' },
  approve_plan: { level: 'result', label: 'Затвердження плану' },
  reject_plan: { level: 'result', label: 'Відхилення плану' },
  cancel_task: { level: 'logged', label: 'Скасування кроку' },
  overlay_creative: { level: 'logged', label: 'Текст на креативі' },
  make_video: { level: 'paid', label: 'Відео з картинки в Higgsfield' },
  compare_looks: { level: 'paid', label: 'Порівняння реалізму: нові картинки в Higgsfield' },
  inspect_creative: { level: 'paid', label: 'Перевірка якості готового креатива' },
  edit_creative_text: { level: 'logged', label: 'Правка тексту на готовому креативі' },
  cancel_request: { level: 'logged', label: 'Зупинка запиту' },
  set_agent_schedule: { level: 'logged', label: 'Зміна розкладу агента' },
  set_agent_mode: { level: 'logged', label: 'Зміна режиму агента' },
  add_instruction: { level: 'logged', label: 'Вказівка для операції' },
  remove_instruction: { level: 'logged', label: 'Видалення вказівки' },
};

const norm = (e) => String(e || '').trim().toLowerCase();

// → { ok, reason? }. estimateOnly: asking the price of the pictures costs nothing, so it is open to everyone. isOps: profiles.role = 'ops_manager'.
export function canDo({ action, email, approvers = [], isOps = false, estimateOnly = false }) {
  const rule = ACTION_RULES[action];
  if (!rule || !['paid', 'result'].includes(rule.level)) return { ok: true };
  if (action === 'generate_creatives' && estimateOnly) return { ok: true };
  const list = (approvers || []).map(norm).filter(Boolean);
  if (!list.length || isOps || list.includes(norm(email))) return { ok: true };
  return { ok: false, reason: `«${rule.label}» можуть лише утверджувачі: ${approvers.join(', ')}. Попросіть одного з них або операційного менеджера.` };
}

// May the person change the list of approvers (and nothing else is asked of them).
export const canEditApprovers = ({ isOps }) => !!isOps;

// Cleans the list typed on the page: emails, lower case, no duplicates.
export function cleanApprovers(list = []) {
  const seen = new Set();
  const out = [];
  list.forEach((raw) => {
    const e = norm(raw);
    if (!e) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) throw new Error(`«${raw}» не схоже на електронну пошту.`);
    if (!seen.has(e)) { seen.add(e); out.push(e); }
  });
  return out;
}

// ---- the journal
const clip = (s, n) => { const t = String(s ?? '').replace(/\s+/g, ' ').trim(); return t.length > n ? `${t.slice(0, n - 1)}…` : t; };

// What goes into the journal for an action that succeeded: { action, subject, summary, meta } (the scope — campaign and project — is resolved by the server).
// body: what the page sent; out: what the action returned. → null for an action that is not journaled.
export function auditEntry(action, body = {}, out = {}) {
  const rule = ACTION_RULES[action];
  if (!rule || rule.level == null) return null;
  if (action === 'generate_creatives' && body.estimateOnly) return null;
  const meta = {};
  let summary = rule.label;
  switch (action) {
    case 'generate_creatives':
      summary = out.submitted ? `Відправив у Higgsfield ${out.submitted} зображ., ≈ $${Number(out.estimateUsd || 0).toFixed(2)}` : 'Спроба генерації: нічого не відправлено';
      meta.requestId = body.requestId; meta.submitted = out.submitted ?? 0; meta.estimateUsd = out.estimateUsd ?? 0;
      break;
    case 'launch_campaign': summary = `Запустив операцію (агентів: ${out.agents ?? '—'}${out.creativeOnly ? ', лише креативи' : ''})`; break;
    case 'start_intel': summary = body.force ? 'Оновив профіль клієнта (розвідка)' : 'Запустив розвідку клієнта'; break;
    case 'start_request': summary = 'Запустив запит на креативи'; meta.requestId = body.requestId; break;
    case 'cancel_request': summary = 'Зупинив запит на креативи'; meta.requestId = body.requestId; break;
    case 'run_agent': summary = 'Запустив агента вручну'; meta.agentId = body.agentId; break;
    case 'retry_task': summary = 'Повторив крок'; meta.taskId = body.taskId; break;
    case 'cancel_task': summary = 'Скасував крок'; meta.taskId = body.taskId; break;
    case 'restart_agent': summary = `Перезапустив агента (повернуто в чергу: ${out.requeued ?? 0})`; meta.agentId = body.agentId; break;
    case 'dry_run': summary = 'Пробний запуск агента'; meta.agentId = body.agentId; break;
    case 'redo_visual': summary = 'Попросив нову картинку'; meta.postId = body.postId; break;
    case 'pass_on': summary = 'Підтвердив результат: наступні агенти стартують'; meta.taskId = body.taskId; break;
    case 'edit_output': summary = 'Відредагував результат агента вручну'; meta.taskId = body.taskId; break;
    case 'approve_plan': summary = 'Затвердив план тижня'; meta.planId = body.planId; break;
    case 'reject_plan': summary = `Відхилив план тижня${body.reason ? `: ${clip(body.reason, 160)}` : ''}`; meta.planId = body.planId; break;
    case 'set_agent_schedule': summary = body.schedule?.weekday ? `Змінив розклад агента: день ${body.schedule.weekday}, ${body.schedule.time || '09:00'}` : body.schedule?.everyDays ? `Змінив розклад агента: кожні ${body.schedule.everyDays} дн., ${body.schedule.time || '09:00'}` : 'Зняв агента з розкладу'; meta.agentId = body.agentId; break;
    case 'set_agent_mode': summary = `Режим агента: ${{ auto: 'сам', confirm: 'з підтвердженням', paused: 'пауза' }[body.mode] || body.mode}`; meta.agentId = body.agentId; break;
    case 'add_instruction': summary = `Додав вказівку: ${clip(body.text, 200)}`; meta.role = body.role || null; break;
    case 'remove_instruction': summary = 'Видалив вказівку'; break;
    default: break;
  }
  return { action, subject: rule.label, summary, meta };
}

export const deniedEntry = (action, reason) => ({ action: 'denied', subject: ACTION_RULES[action]?.label || action, summary: `Спроба без права: ${ACTION_RULES[action]?.label || action}`, meta: { attempted: action, reason } });

// The labels of the actions the journal knows (also the ones the database writes), for the filter of the page.
export const AUDIT_LABELS = {
  ...Object.fromEntries(Object.entries(ACTION_RULES).map(([k, v]) => [k, v.label])),
  creative_approved: 'Затвердження креативу', creative_rejected: 'Відхилення креативу', money_limits_changed: 'Зміна лімітів витрат',
  campaign_status: 'Статус операції', approvers_changed: 'Зміна утверджувачів', denied: 'Спроба без права',
};
