import { daysInMonth } from '../../lib/dateHelpers';

const CALENDAR_ICON = '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="17" rx="2"/><path d="M3 9h18M8 2v4M16 2v4"/></svg>';

// "Заповненість місяця" panel: one pill per day of the month, colored by
// whether a report was saved for it (done), is still upcoming (future), or
// was skipped (over — past and never saved), plus a days-in-month stat and
// a vertical legend on the right.
export default function MonthFullness({ year, month, currentDay, savedDays, onSelectDay }) {
  const dim = daysInMonth(year, month);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return (
    <div className="fullness">
      <div className="mf-title">Заповненість місяця</div>
      <div className="mf-row">
        <div className="mf-days">
          {Array.from({ length: dim }, (_, i) => i + 1).map((d) => {
            const thisDate = new Date(year, month - 1, d);
            thisDate.setHours(0, 0, 0, 0);
            const hasReport = savedDays.has(d);
            let status;
            if (thisDate.getTime() > today.getTime()) status = 'future';
            else if (hasReport) status = 'done';
            else if (thisDate.getTime() < today.getTime()) status = 'over';
            else status = 'future';
            const statusLabel = status === 'done' ? 'внесено' : status === 'over' ? 'прострочено' : 'ще не настав';
            return (
              <button
                key={d}
                type="button"
                className={'mf-day ' + status + (d === currentDay ? ' cur' : '')}
                title={`${d} (${statusLabel})`}
                onClick={() => onSelectDay(d)}
              >
                <span className="mf-day-num">{String(d).padStart(2, '0')}</span>
                <span className="mf-day-dot" />
              </button>
            );
          })}
        </div>
        <div className="mf-side">
          <div className="mf-stat">
            <span className="mf-stat-icon" dangerouslySetInnerHTML={{ __html: CALENDAR_ICON }} />
            <div className="mf-stat-body">
              <b>{currentDay} / {dim}</b>
              <span>днів у місяці</span>
            </div>
          </div>
          <div className="mf-legend">
            <span className="mf-legend-item"><i className="mf-legend-dot over" />Прострочено</span>
            <span className="mf-legend-item"><i className="mf-legend-dot done" />Внесено</span>
            <span className="mf-legend-item"><i className="mf-legend-dot future" />Ще не настав</span>
          </div>
        </div>
      </div>
    </div>
  );
}
