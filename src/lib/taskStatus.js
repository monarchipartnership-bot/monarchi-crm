import { mondayOf } from './dateHelpers';

// Derives a task's review status for the weekly/monthly rollups. Never
// stored — always computed from the task's current fields.
// - 'done': marked complete, regardless of which day it ended up on.
// - 'cancelled': explicitly cancelled (with a reason), stored as-is.
// - 'moved': still pending, and its current day (task_date) now falls in a
//   later real calendar week than the week it was originally planned for.
// - 'pending': still pending, and hasn't moved past its own planned week.
export function deriveTaskStatus(task) {
  if (task.status === 'done') return 'done';
  if (task.status === 'cancelled') return 'cancelled';
  // Backlog tasks (no dates at all) have nothing to compare — treat as
  // a plain open task; see dueStatus.js for their real ("no_date") status.
  if (!task.planned_date || !task.task_date) return 'pending';
  const plannedMonday = mondayOf(task.planned_date);
  const currentMonday = mondayOf(task.task_date);
  return currentMonday > plannedMonday ? 'moved' : 'pending';
}

export const STATUS_LABELS = {
  done: 'Виконано',
  pending: 'Не виконано',
  moved: 'Перенесено',
  cancelled: 'Скасовано',
};
