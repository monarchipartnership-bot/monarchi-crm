import { todayIso } from './dateHelpers';

// Orthogonal to deriveTaskStatus (done/pending/moved/cancelled): this is
// purely "how urgent is this *right now*", used for the status icon/legend/
// filter. Terminal tasks keep their own bucket; open tasks are bucketed by
// task_date vs today; tasks with no task_date at all are backlog.
export function deriveDueStatus(task, today = todayIso()) {
  if (task.status === 'done') return 'done';
  if (task.status === 'cancelled') return 'cancelled';
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
