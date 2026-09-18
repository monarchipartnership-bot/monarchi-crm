import { mondayOf } from './dateHelpers';

// Derives a task's review status for the weekly/monthly rollups. Never
// stored — always computed from the task's current fields.
// - 'done': marked complete, regardless of which day it ended up on.
// - 'cancelled': explicitly cancelled (with a reason), stored as-is.
// - 'moved': still pending, and its current day (task_date) now falls in a
//   later real calendar week than the week it was originally planned for.
// - 'pending': still pending, and hasn't moved past its own planned week.
//
// `stagesById` (optional, `{[stage.id]: stage}` for the task's own
// department) resolves done/cancelled via the task's `stage_id` and that
// stage's `is_done`/`is_cancelled` flags — the Task Manager source of
// truth, same idea as deals deriving won/lost from their stage. Omit it (or
// pass a task whose `stage_id` doesn't resolve in the map, e.g. a deal/
// client-tied task with no department at all) to fall back to the legacy
// `task.status` string check.
export function deriveTaskStatus(task, stagesById) {
  const stage = task.stage_id ? stagesById?.[task.stage_id] : null;
  const done = stage ? stage.is_done : task.status === 'done';
  const cancelled = stage ? stage.is_cancelled : task.status === 'cancelled';
  if (done) return 'done';
  if (cancelled) return 'cancelled';
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
