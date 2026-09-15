import { useMemo, useState } from 'react';
import DeltaBadge from '../../../components/Automation/DeltaBadge';
import Sparkline from '../../../components/Automation/Sparkline';
import DonutChart from '../../../components/Automation/DonutChart';
import LineChart from '../../../components/Reports/Annual/LineChart';
import FunnelChart from '../../../components/Reports/Annual/FunnelChart';
import ClientAvatar from '../../../components/Clients/ClientAvatar';
import DateRangePicker, { presetRange } from '../../../components/Deals/DateRangePicker';
import { addDaysIso, fmtDate } from '../../../lib/dateHelpers';

function toIsoDay(dt) {
  return (dt || '').slice(0, 10);
}
function fmtShort(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return fmtDate(y, m, d).slice(0, 5);
}
function relPctDelta(cur, prev) {
  if (!prev) return cur ? 100 : null;
  return Math.round(((cur - prev) / prev) * 100);
}
function inRange(dateIso, start, end) {
  return dateIso && dateIso >= start && dateIso <= end;
}
function shiftRangeBack(range) {
  const days = (new Date(range.end) - new Date(range.start)) / 86400000 + 1;
  return { start: addDaysIso(range.start, -days), end: addDaysIso(range.end, -days) };
}
// Weekly count buckets between two ISO dates, keyed by bucket-start label.
function weeklyBuckets(items, dateField, start, end) {
  const buckets = [];
  let cursor = start;
  while (cursor <= end) {
    const bucketEnd = addDaysIso(cursor, 6);
    buckets.push({ label: fmtShort(cursor), start: cursor, end: bucketEnd });
    cursor = addDaysIso(cursor, 7);
  }
  return buckets.map((b) => ({
    label: b.label,
    count: items.filter((it) => inRange(toIsoDay(it[dateField]), b.start, b.end)).length,
  }));
}

export default function DealsOverviewTab({ deals, stages, onViewDeal }) {
  const [range, setRange] = useState(presetRange('thisMonth'));

  const stagesById = useMemo(() => Object.fromEntries(stages.map((s) => [s.id, s])), [stages]);

  const filtered = useMemo(() => deals.filter((d) => inRange(toIsoDay(d.created_at), range.start, range.end)), [deals, range]);
  const prevRange = useMemo(() => shiftRangeBack(range), [range]);
  const prevFiltered = useMemo(() => deals.filter((d) => inRange(toIsoDay(d.created_at), prevRange.start, prevRange.end)), [deals, prevRange]);

  function metrics(list) {
    const won = list.filter((d) => stagesById[d.stage_id]?.is_won);
    const lost = list.filter((d) => stagesById[d.stage_id]?.is_lost);
    const open = list.length - won.length - lost.length;
    const wonSum = won.reduce((s, d) => s + (Number(d.amount) || 0), 0);
    return { open, won: won.length, lost: lost.length, wonSum };
  }
  const cur = metrics(filtered);
  const prev = metrics(prevFiltered);

  // Sparklines — fixed 8-week trend, independent of the selected period
  // (same convention as Automation/Dashboard.jsx's KPI sparklines).
  const todayIso = toIsoDay(new Date().toISOString());
  const sparkStart = addDaysIso(todayIso, -7 * 7);
  const sparkWeeks = useMemo(() => weeklyBuckets(deals, 'created_at', sparkStart, todayIso), [deals, sparkStart, todayIso]);
  const sparkWonWeeks = useMemo(() => weeklyBuckets(deals.filter((d) => stagesById[d.stage_id]?.is_won), 'closed_at', sparkStart, todayIso), [deals, stagesById, sparkStart, todayIso]);
  const sparkLostWeeks = useMemo(() => weeklyBuckets(deals.filter((d) => stagesById[d.stage_id]?.is_lost), 'closed_at', sparkStart, todayIso), [deals, stagesById, sparkStart, todayIso]);

  const funnelStages = useMemo(() => {
    const openOrWon = stages.filter((s) => !s.is_lost);
    return openOrWon.map((s) => ({ label: s.label, value: filtered.filter((d) => d.stage_id === s.id).length }));
  }, [stages, filtered]);

  const donutSlices = useMemo(() => stages.map((s) => ({
    label: s.label, color: s.color || '#7C3AED', value: filtered.filter((d) => d.stage_id === s.id).length,
  })).filter((s) => s.value > 0), [stages, filtered]);

  const dynamics = useMemo(() => {
    const created = weeklyBuckets(filtered, 'created_at', range.start, range.end);
    const won = weeklyBuckets(filtered.filter((d) => stagesById[d.stage_id]?.is_won), 'closed_at', range.start, range.end);
    return { labels: created.map((b) => b.label), created: created.map((b) => b.count), won: won.map((b) => b.count) };
  }, [filtered, range, stagesById]);

  const recentDeals = useMemo(() => [...deals].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 10), [deals]);

  return (
    <>
      <div className="deals-overview-toolbar">
        <DateRangePicker range={range} onChange={setRange} />
      </div>

      <div className="dash-kpi-row">
        <div className="dash-kpi">
          <div className="dash-kpi-head"><div className="dash-kpi-label">Відкриті угоди</div></div>
          <div className="dash-kpi-value">{cur.open}</div>
          <div className="dash-kpi-sub"><DeltaBadge diff={relPctDelta(cur.open, prev.open)} suffix="%" /> vs минулий період</div>
          <Sparkline values={sparkWeeks.map((w) => w.count)} color="var(--purple)" />
        </div>
        <div className="dash-kpi">
          <div className="dash-kpi-head"><div className="dash-kpi-label">Виграно</div></div>
          <div className="dash-kpi-value">{cur.won}</div>
          <div className="dash-kpi-sub"><DeltaBadge diff={relPctDelta(cur.won, prev.won)} suffix="%" /> vs минулий період</div>
          <Sparkline values={sparkWonWeeks.map((w) => w.count)} color="var(--ok)" />
        </div>
        <div className="dash-kpi">
          <div className="dash-kpi-head"><div className="dash-kpi-label">Програно</div></div>
          <div className="dash-kpi-value">{cur.lost}</div>
          <div className="dash-kpi-sub"><DeltaBadge diff={relPctDelta(cur.lost, prev.lost)} suffix="%" /> vs минулий період</div>
          <Sparkline values={sparkLostWeeks.map((w) => w.count)} color="var(--bad)" />
        </div>
        <div className="dash-kpi">
          <div className="dash-kpi-head"><div className="dash-kpi-label">Сума виграних угод</div></div>
          <div className="dash-kpi-value">${cur.wonSum.toLocaleString('uk-UA')}</div>
          <div className="dash-kpi-sub"><DeltaBadge diff={relPctDelta(cur.wonSum, prev.wonSum)} suffix="%" /> vs минулий період</div>
        </div>
      </div>

      <div className="deals-overview-grid">
        <section className="report-section">
          <div className="stitle">Воронка угод</div>
          {funnelStages.every((s) => s.value === 0) ? (
            <div className="empty-hint">Немає угод за цей період.</div>
          ) : (
            <FunnelChart stages={funnelStages} />
          )}
        </section>
        <section className="report-section">
          <div className="stitle">Розподіл по статусах</div>
          {donutSlices.length === 0 ? (
            <div className="empty-hint">Немає угод за цей період.</div>
          ) : (
            <div className="dash-chart dash-donut-chart">
              <DonutChart slices={donutSlices} centerValue={String(filtered.length)} centerLabel="усіх угод" />
            </div>
          )}
        </section>
        <section className="report-section">
          <div className="stitle">Динаміка угод</div>
          <div className="dash-chart">
            <LineChart
              labels={dynamics.labels}
              series={[
                { label: 'Створено', values: dynamics.created, color: 'var(--purple)' },
                { label: 'Виграно', values: dynamics.won, color: 'var(--ok)' },
              ]}
            />
          </div>
        </section>
      </div>

      <section className="report-section">
        <div className="stitle">Останні угоди</div>
        {recentDeals.length === 0 ? (
          <div className="empty-hint">Угод ще немає.</div>
        ) : (
          <div className="tbl-wrap">
            <table className="cmp-table">
              <thead><tr><th>Клієнт</th><th>Етап</th><th>Сума</th><th>Дата створення</th><th>Менеджер</th><th /></tr></thead>
              <tbody>
                {recentDeals.map((d) => {
                  const stage = stagesById[d.stage_id];
                  return (
                    <tr key={d.id} className="client-row" onClick={() => onViewDeal(d)}>
                      <td className="ink">{d.clients?.company || d.clients?.name || '—'}</td>
                      <td><span className="deal-stage-pill" style={{ color: stage?.color, borderColor: stage?.color }}>{stage?.label || '—'}</span></td>
                      <td>{d.amount ? `${Number(d.amount).toLocaleString('uk-UA')} ${d.currency}` : '—'}</td>
                      <td>{fmtShort(toIsoDay(d.created_at))}</td>
                      <td>
                        {d.manager ? (
                          <span className="client-name-cell"><ClientAvatar name={d.manager} size={24} /> {d.manager}</span>
                        ) : '—'}
                      </td>
                      <td onClick={(e) => e.stopPropagation()}>
                        <button type="button" className="btn" onClick={() => onViewDeal(d)}>Відкрити</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
