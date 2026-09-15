import { colorForTag } from '../../lib/tagColors';
import { iconForTag } from '../../lib/tagIcons';
import { DUE_STATUS_ICONS } from '../../lib/dueStatusIcons';

// Compact glance-only task card for the Automation Dashboard's "today" /
// "done yesterday" lists — no actions here (view/edit/move live on the
// actual Tasks pages, this is just an overview widget). `text` splits on
// its first newline into a bold title + muted description, the same
// display-only convention already used by DailyTaskRow (no schema change).
// `done` shows a small leading checkmark badge — used for the "always
// done" yesterday list, omitted for "today" (mixed done/pending).
export default function DashboardTaskCard({ task, done }) {
  const primaryTag = task.tags?.[0];
  const [title, ...descParts] = (task.text || '').split('\n');
  const description = descParts.join(' ').trim();

  return (
    <div className="dash-task-card">
      {done && (
        <span className="dash-task-done-ic" dangerouslySetInnerHTML={{ __html: DUE_STATUS_ICONS.done }} />
      )}
      <div className="dash-task-main">
        <span className="dash-task-title">{title}</span>
        {description && <span className="dash-task-desc">{description}</span>}
      </div>
      {primaryTag && (
        <div className="dash-task-tag-group">
          <span className="dash-task-tag-icon" style={{ background: colorForTag(primaryTag) }} dangerouslySetInnerHTML={{ __html: iconForTag(primaryTag) }} />
          <span className="task-tag-chip" style={{ background: colorForTag(primaryTag) }}>{primaryTag}</span>
        </div>
      )}
    </div>
  );
}
