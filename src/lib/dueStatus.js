import { todayIso } from './dateHelpers';

// Orthogonal to deriveTaskStatus (done/pending/moved/cancelled): this is
// purely "how urgent is this *right now*", used for the status icon/legend/
// filter. Terminal tasks keep their own bucket; open tasks are bucketed by
// task_date vs today; tasks with no task_date at all are backlog.
//
// `stagesById` — same optional stage-flags lookup as deriveTaskStatus (see
// taskStatus.js); omit for a deal/client-tied task (no department) to fall
// back to the legacy `task.status` string check.
export function deriveDueStatus(task, stagesById, today = todayIso()) {
  const stage = task.stage_id ? stagesById?.[task.stage_id] : null;
  const done = stage ? stage.is_done : task.status === 'done';
  const cancelled = stage ? stage.is_cancelled : task.status === 'cancelled';
  if (done) return 'done';
  if (cancelled) return 'cancelled';
  if (!task.task_date) return 'no_date';
  if (task.task_date < today) return 'overdue';
  if (task.task_date === today) return 'due_today';
  return 'upcoming';
}

export const DUE_STATUS_ORDER = ['overdue', 'due_today', 'upcoming', 'no_date', 'done', 'cancelled'];

export const DUE_STATUS_LABELS = {
  overdue: 'Протерміновано',
  due_today: 'На сьогодні',
  upcoming: 'Заплановано',
  no_date: 'Без дати',
  done: 'Виконано',
  cancelled: 'Скасовано',
};
