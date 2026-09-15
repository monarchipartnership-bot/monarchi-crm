import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchPipelines } from '../../lib/api/pipelines';
import { fetchDeals } from '../../lib/api/deals';

function fmtMoney(n) {
  return Math.round(n).toLocaleString('uk-UA');
}

// The lowest-position pipeline stands in for "the" pipeline here — the real
// Угоди page shows one pipeline at a time via its own switcher, and there's
// no single well-defined way to merge stage sets across several pipelines.
export default function SalesFunnelCard() {
  const [rows, setRows] = useState(null);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const pipelines = await fetchPipelines();
      const pipeline = pipelines[0];
      if (!pipeline) { if (!cancelled) setRows([]); return; }

      const deals = await fetchDeals(pipeline.id);
      if (cancelled) return;

      const openDeals = deals.filter((d) => !d.deal_stages?.is_won && !d.deal_stages?.is_lost);
      const stageMap = new Map();
      openDeals.forEach((d) => {
        const stage = d.deal_stages;
        if (!stage) return;
        const cur = stageMap.get(stage.id) || { id: stage.id, label: stage.label, color: stage.color, position: stage.position, count: 0, sum: 0 };
        cur.count += 1;
        cur.sum += Number(d.amount) || 0;
        stageMap.set(stage.id, cur);
      });

      const now = new Date();
      const closedThisMonth = deals.filter((d) => {
        if (!d.deal_stages?.is_won && !d.deal_stages?.is_lost) return false;
        if (!d.closed_at) return false;
        const c = new Date(d.closed_at);
        return c.getFullYear() === now.getFullYear() && c.getMonth() === now.getMonth();
      });
      const closedWon = closedThisMonth.filter((d) => d.deal_stages?.is_won);

      const stageRows = [...stageMap.values()].sort((a, b) => a.position - b.position);
      if (closedWon.length) {
        stageRows.push({
          id: 'closed', label: 'Закрито (цього місяця)', color: '#1E9E5D',
          count: closedWon.length, sum: closedWon.reduce((s, d) => s + (Number(d.amount) || 0), 0),
        });
      }

      if (!cancelled) {
        setRows(stageRows);
        setTotal(openDeals.reduce((s, d) => s + (Number(d.amount) || 0), 0));
      }
    }

    load();
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="pulse-card">
      <div className="pulse-card__head">
        <span className="pulse-card__title"><span className="pulse-card__ic">&#128200;</span>Воронка продажів</span>
        <Link to="/reports/deals" className="pulse-card__link">Всі угоди &rarr;</Link>
      </div>

      <div className="funnel-total">
        <span className="funnel-total__value">&#8372;{fmtMoney(total)}</span>
        <span className="funnel-total__label">Сума відкритих угод у воронці</span>
      </div>

      <div className="funnel-rows">
        {rows === null && <p className="sec-empty">Завантаження...</p>}
        {rows?.length === 0 && <p className="sec-empty">Угод ще немає.</p>}
        {rows?.map((r) => (
          <div className="funnel-row" key={r.id}>
            <span className="funnel-row__tag" style={{ background: `${r.color}22`, color: r.color }}>{r.label}</span>
            <span className="funnel-row__count">{r.count}</span>
            <span className="funnel-row__sum">&#8372;{fmtMoney(r.sum)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
