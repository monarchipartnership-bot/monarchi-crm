import { useMemo, useState } from 'react';
import DateRangePicker, { presetRange } from '../../../components/Deals/DateRangePicker';

function toIsoDay(dt) {
  return (dt || '').slice(0, 10);
}
function inRange(dateIso, start, end) {
  return dateIso && dateIso >= start && dateIso <= end;
}
function avg(list) {
  if (!list.length) return null;
  return list.reduce((s, n) => s + n, 0) / list.length;
}

export default function DealsAnalyticsTab({ deals, stages }) {
  const [range, setRange] = useState(presetRange('thisMonth'));

  const stagesById = useMemo(() => Object.fromEntries(stages.map((s) => [s.id, s])), [stages]);
  const filtered = useMemo(() => deals.filter((d) => inRange(toIsoDay(d.created_at), range.start, range.end)), [deals, range]);

  const won = useMemo(() => filtered.filter((d) => stagesById[d.stage_id]?.is_won), [filtered, stagesById]);
  const lost = useMemo(() => filtered.filter((d) => stagesById[d.stage_id]?.is_lost), [filtered, stagesById]);

  const winRate = (won.length + lost.length) ? Math.round((won.length / (won.length + lost.length)) * 100) : null;
  const avgDealSize = avg(won.filter((d) => d.amount != null).map((d) => Number(d.amount)));
  const avgCloseDays = avg(
    won.filter((d) => d.closed_at && d.created_at)
      .map((d) => (new Date(d.closed_at) - new Date(d.created_at)) / 86400000)
  );

  const stageConversion = useMemo(() => {
    const openOrWon = stages.filter((s) => !s.is_lost);
    let prevCount = null;
    return openOrWon.map((s) => {
      const count = filtered.filter((d) => d.stage_id === s.id).length;
      const pct = prevCount ? Math.round((count / prevCount) * 100) : null;
      prevCount = count;
      return { label: s.label, count, pct };
    });
  }, [stages, filtered]);

  const byManager = useMemo(() => {
    const map = {};
    filtered.forEach((d) => {
      const key = d.manager || 'Без менеджера';
      if (!map[key]) map[key] = { manager: key, total: 0, won: 0, lost: 0, wonSum: 0 };
      map[key].total += 1;
      const stage = stagesById[d.stage_id];
      if (stage?.is_won) { map[key].won += 1; map[key].wonSum += Number(d.amount) || 0; }
      if (stage?.is_lost) map[key].lost += 1;
    });
    return Object.values(map)
      .map((m) => ({ ...m, winRate: (m.won + m.lost) ? Math.round((m.won / (m.won + m.lost)) * 100) : null }))
      .sort((a, b) => b.wonSum - a.wonSum);
  }, [filtered, stagesById]);

  return (
    <>
      <div className="deals-overview-toolbar">
        <DateRangePicker range={range} onChange={setRange} />
      </div>

      <div className="dash-kpi-row">
        <div className="dash-kpi">
          <div className="dash-kpi-head"><div className="dash-kpi-label">Win rate</div></div>
          <div className="dash-kpi-value">{winRate === null ? '—' : `${winRate}%`}</div>
          <div className="dash-kpi-sub">{won.length} виграно з {won.length + lost.length} закритих</div>
        </div>
        <div className="dash-kpi">
          <div className="dash-kpi-head"><div className="dash-kpi-label">Середній розмір угоди</div></div>
          <div className="dash-kpi-value">{avgDealSize === null ? '—' : `$${Math.round(avgDealSize).toLocaleString('uk-UA')}`}</div>
          <div className="dash-kpi-sub">по виграних угодах</div>
        </div>
        <div className="dash-kpi">
          <div className="dash-kpi-head"><div className="dash-kpi-label">Середній час закриття</div></div>
          <div className="dash-kpi-value">{avgCloseDays === null ? '—' : `${Math.round(avgCloseDays)} дн.`}</div>
          <div className="dash-kpi-sub">від створення до перемоги</div>
        </div>
        <div className="dash-kpi">
          <div className="dash-kpi-head"><div className="dash-kpi-label">Всього угод за період</div></div>
          <div className="dash-kpi-value">{filtered.length}</div>
        </div>
      </div>

      <div className="deals-overview-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
        <section className="report-section">
          <div className="stitle">Конверсія по стадіях</div>
          {stageConversion.every((s) => s.count === 0) ? (
            <div className="empty-hint">Немає угод за цей період.</div>
          ) : (
            <table className="cmp-table">
              <thead><tr><th>Стадія</th><th>Кількість</th><th>% від попередньої</th></tr></thead>
              <tbody>
                {stageConversion.map((s) => (
                  <tr key={s.label}>
                    <td className="ink">{s.label}</td>
                    <td>{s.count}</td>
                    <td>{s.pct === null ? '—' : `${s.pct}%`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section className="report-section">
          <div className="stitle">По менеджерах</div>
          {byManager.length === 0 ? (
            <div className="empty-hint">Немає угод за цей період.</div>
          ) : (
            <table className="cmp-table">
              <thead><tr><th>Менеджер</th><th>Всього</th><th>Виграно</th><th>Програно</th><th>Win rate</th><th>Сума виграних</th></tr></thead>
              <tbody>
                {byManager.map((m) => (
                  <tr key={m.manager}>
                    <td className="ink">{m.manager}</td>
                    <td>{m.total}</td>
                    <td>{m.won}</td>
                    <td>{m.lost}</td>
                    <td>{m.winRate === null ? '—' : `${m.winRate}%`}</td>
                    <td>${m.wonSum.toLocaleString('uk-UA')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>
    </>
  );
}
