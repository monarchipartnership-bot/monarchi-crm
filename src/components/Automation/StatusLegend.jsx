import { DUE_STATUS_ORDER, DUE_STATUS_LABELS } from '../../lib/dueStatus';
import { DUE_STATUS_ICONS } from '../../lib/dueStatusIcons';

// Shared bottom-of-page legend for the due-status icon shown on every task
// card (TaskBadges) — mounted on both Weekly and Daily Tasks so the icon set
// can't drift between the two pages.
export default function StatusLegend() {
  return (
    <div className="status-legend">
      {DUE_STATUS_ORDER.map((key) => (
        <div className="status-legend-item" key={key}>
          <span className={'due-badge ' + key} dangerouslySetInnerHTML={{ __html: DUE_STATUS_ICONS[key] }} />
          <span>{DUE_STATUS_LABELS[key]}</span>
        </div>
      ))}
    </div>
  );
}
