import { useMemo, useState } from 'react';
import { MONTH_NAMES } from '../../../lib/dateHelpers';
import { pct } from '../../../lib/weeklyLogic';
import { channelList, leadsId, qualifiedId, contractsId, monthSumVal } from '../../../lib/annualLogic';

const PAGE_SIZE = 10;

// Month × channel breakdown (up to 12 × 7 = 84 rows) — same
// pagination pattern as Monthly Report's Клієнти list (.month-pagination*),
// plus a single channel <select> (only one filter dimension here, so the
// full filter-popover Monthly uses would be overkill).
export default function ChannelDetailTable({ monthsByIndex }) {
  const [channelFilter, setChannelFilter] = useState('');
  const [page, setPage] = useState(1);
  const channels = channelList();

  const rows = useMemo(() => {
    const out = [];
    for (let m = 1; m <= 12; m++) {
      if (!monthsByIndex[m]) continue;
      channels.forEach((c) => {
        const leads = monthSumVal(monthsByIndex, m, leadsId(c)) || 0;
        const qualified = monthSumVal(monthsByIndex, m, qualifiedId(c)) || 0;
        const contracts = monthSumVal(monthsByIndex, m, contractsId(c)) || 0;
        out.push({ key: `${m}-${c.key}`, month: MONTH_NAMES[m - 1], channelKey: c.key, channelTitle: c.title, leads, qualified, contracts, conversion: pct(contracts, leads) });
      });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monthsByIndex]);

  const filteredRows = channelFilter ? rows.filter((r) => r.channelKey === channelFilter) : rows;
  const pageCount = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  const clampedPage = Math.min(page, pageCount);
  const start = (clampedPage - 1) * PAGE_SIZE;
  const pagedRows = filteredRows.slice(start, start + PAGE_SIZE);
  const rangeStart = filteredRows.length ? start + 1 : 0;
  const rangeEnd = Math.min(start + PAGE_SIZE, filteredRows.length);

  function handleFilterChange(v) {
    setChannelFilter(v);
    setPage(1);
  }

  return (
    <div>
      <div className="detail-table-toolbar">
        <select value={channelFilter} onChange={(e) => handleFilterChange(e.target.value)}>
          <option value="">Всі канали</option>
          {channels.map((c) => <option key={c.key} value={c.key}>{c.title}</option>)}
        </select>
      </div>

      {filteredRows.length === 0 ? (
        <div className="placeholder"><p>Немає даних за обраним фільтром.</p></div>
      ) : (
        <>
          <table className="cmp-table">
            <thead>
              <tr><th>Місяць</th><th>Канал</th><th>Ліди</th><th>Кваліфіковано</th><th>Договори</th><th>Конверсія</th></tr>
            </thead>
            <tbody>
              {pagedRows.map((r) => (
                <tr key={r.key}>
                  <td>{r.month}</td>
                  <td>{r.channelTitle}</td>
                  <td>{r.leads}</td>
                  <td>{r.qualified}</td>
                  <td>{r.contracts}</td>
                  <td>{r.conversion === null ? '—' : r.conversion.toFixed(1) + '%'}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {filteredRows.length > PAGE_SIZE && (
            <div className="month-pagination">
              <div className="month-pagination-hint">{rangeStart}-{rangeEnd} з {filteredRows.length} рядків</div>
              <div className="month-pagination-pages">
                <button type="button" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={clampedPage === 1} aria-label="Попередня сторінка">&#8249;</button>
                {Array.from({ length: pageCount }, (_, i) => i + 1).map((n) => (
                  <button key={n} type="button" className={n === clampedPage ? 'on' : ''} onClick={() => setPage(n)}>{n}</button>
                ))}
                <button type="button" onClick={() => setPage((p) => Math.min(pageCount, p + 1))} disabled={clampedPage === pageCount} aria-label="Наступна сторінка">&#8250;</button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
