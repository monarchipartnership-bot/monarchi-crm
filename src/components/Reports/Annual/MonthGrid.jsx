import { MONTH_NAMES } from '../../../lib/dateHelpers';
import { SEASON_ICON, seasonOf } from '../../../lib/seasons';

export default function MonthGrid({ monthsByIndex, onOpenMonth }) {
  return (
    <div className="month-grid">
      {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => {
        const found = !!monthsByIndex[m];
        const season = seasonOf(m);
        return (
          <div className={'month-box' + (found ? '' : ' empty')} key={m}>
            <div className="mb-top">
              <div className={'month-ico s-' + season} dangerouslySetInnerHTML={{ __html: SEASON_ICON[season] }} />
              <div>
                <div className="month-name">{MONTH_NAMES[m - 1]}</div>
                <div className="month-status">{found ? 'Звіт збережено' : 'Немає звіту'}</div>
              </div>
            </div>
            <button type="button" className="btn month-detail-btn" onClick={() => onOpenMonth(m)}>Детальніше</button>
          </div>
        );
      })}
    </div>
  );
}
