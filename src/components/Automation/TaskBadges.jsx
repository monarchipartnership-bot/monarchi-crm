import { colorForTag } from '../../lib/tagColors';
import { recurrenceLabel } from '../../lib/recurrenceLabel';
import { deriveDueStatus, DUE_STATUS_LABELS } from '../../lib/dueStatus';
import { DUE_STATUS_ICONS } from '../../lib/dueStatusIcons';

const PRIORITY_COLORS = { high: 'var(--bad)', medium: 'var(--warn)', low: 'var(--purple)' };
const PRIORITY_LABELS = { high: 'Високий пріоритет', medium: 'Середній пріоритет', low: 'Низький пріоритет' };

const REPEAT_ICON = '<svg viewBox="0 0 24 24"><path d="M17 2l4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><path d="M7 22l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>';

function initials(profile, email) {
  const first = profile?.first_name?.trim();
  const last = profile?.last_name?.trim();
  if (first) return (first[0] + (last ? last[0] : '')).toUpperCase();
  return (email || '?')[0].toUpperCase();
}

function personLabel(profile, email) {
  const full = `${profile?.first_name || ''} ${profile?.last_name || ''}`.trim();
  return full || email;
}

// Small inline badges for assignee / priority / tags / recurrence — shared
// between TaskRow (Weekly/Monthly) and DailyTaskRow so both row styles stay
// visually consistent. Renders nothing at all if a task has none of these set.
export default function TaskBadges({ task, profile }) {
  const tags = task.tags || [];
  const dueStatus = deriveDueStatus(task);

  return (
    <span className="task-badges">
      <span className={'due-badge ' + dueStatus} title={DUE_STATUS_LABELS[dueStatus]} dangerouslySetInnerHTML={{ __html: DUE_STATUS_ICONS[dueStatus] }} />
      {task.assignee_email && (
        <span className="task-avatar" title={personLabel(profile, task.assignee_email)}>
          {profile?.photo ? <img src={profile.photo} alt="" /> : initials(profile, task.assignee_email)}
        </span>
      )}
      {task.priority && (
        <span className="task-priority-dot" style={{ background: PRIORITY_COLORS[task.priority] }} title={PRIORITY_LABELS[task.priority]} />
      )}
      {tags.map((tag) => (
        <span className="task-tag-chip" key={tag} style={{ background: colorForTag(tag) }}>{tag}</span>
      ))}
      {task.recurrence_rule && (
        <span className="task-recurring-badge" title={recurrenceLabel(task.recurrence_rule)} dangerouslySetInnerHTML={{ __html: REPEAT_ICON }} />
      )}
    </span>
  );
}
