import { useEffect } from 'react';
import MonthlyChannelBlock from '../Monthly/MonthlyChannelBlock';
import MonthlyFinanceSection from '../Monthly/MonthlyFinanceSection';
import { ReadOnlyItemList } from '../ReadOnlyLists';
import { MONTH_NAMES } from '../../../lib/dateHelpers';
import { SEASON_ICON, SEASON_LABEL, seasonOf } from '../../../lib/seasons';
import { CHANNELS, LI_CHANNEL } from '../../../lib/weeklyLogic';

const TASK_SECTIONS = [
  { key: 't_plan', title: 'Заплановано на місяць' },
  { key: 't_done', title: 'Виконано за місяць' },
  { key: 't_next', title: 'Плани на наступний місяць' },
  { key: 't_conc', title: 'Висновки' },
];

// Detail popup for one month in the Annual Report grid — reuses Monthly's
// read-only building blocks against that month's own saved snapshot.
// Matches annual.html's buildMonthDetailHTML: no Клієнти section here.
export default function MonthDetailModal({ month, year, row, onClose }) {
  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose(); }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (month === null) return null;

  const season = seasonOf(month);
  const data = row?.data;
  const weeksFound = row?.weeks_found ?? data?.weeks_found;
  const weeksTotal = row?.weeks_total ?? data?.weeks_total;

  return (
    <div className="ov open" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="ovbox">
        <div className="ovtop">
          <div>
            <h3>{MONTH_NAMES[month - 1]} {year}</h3>
            <div className="ov-season" dangerouslySetInnerHTML={{ __html: SEASON_ICON[season] + ' ' + SEASON_LABEL[season] }} />
          </div>
          <button type="button" className="ov-close" onClick={onClose}>&times;</button>
        </div>

        {!data ? (
          <div className="ov-empty">За {MONTH_NAMES[month - 1]} Monthly Report ще не збережено.</div>
        ) : (
          <>
            {weeksFound != null && weeksTotal != null && (
              <div className="ssub" style={{ marginTop: 0 }}>
                Тижнів знайдено: {weeksFound} з {weeksTotal}{data.manager ? ` · Менеджер: ${data.manager}` : ''}
              </div>
            )}
            <div className="ssub" style={{ marginTop: 0 }}>Upwork</div>
            {CHANNELS.map((c) => <MonthlyChannelBlock key={c.key} channel={c} sums={data.sums || {}} ratioPct={data.ratioPct || {}} />)}
            <div className="ssub">LinkedIn</div>
            <MonthlyChannelBlock channel={LI_CHANNEL} sums={data.sums || {}} ratioPct={data.ratioPct || {}} />
            <MonthlyFinanceSection sums={data.sums || {}} fin={data.finance || { profiles_total: 0, mb_total: 0, gm_total: 0, li_total: 0, all_total: 0, total_inc: 0, profit: 0 }} />
            {data.tasks && (
              <>
                <div className="ssub">Задачі</div>
                <div className="task-grid-4">
                  {TASK_SECTIONS.map((s) => (
                    <div key={s.key}>
                      <div className="ssub">{s.title}</div>
                      <ReadOnlyItemList items={data.tasks?.[s.key]} emptyLabel="Немає записів" />
                    </div>
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
