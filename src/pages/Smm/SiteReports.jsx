import { useEffect, useState } from 'react';
import ActionIcon from '../../components/common/ActionIcon';
import { fetchSiteStats } from '../../lib/api/smm';
import { fmtWhen } from '../../lib/smmDates';
import { SavedReport } from './SiteAnalystOverview';

// «Звіти»: every report the website analyst has written. They live in the database (table smm_site_stats), not inside the agent, so
// they stay after any change to the agent. The list shows the main figures of each one; a click opens the whole report as it was saved.
const fmt = (n) => (n == null ? '—' : Number(n).toLocaleString('uk-UA', { maximumFractionDigits: 1 }));
const metricOf = (data, group, key) => data?.[group]?.metrics?.find((m) => m.key === key)?.cur;
const speedText = (data) => {
  const sp = data?.extras?.speed;
  if (!sp || (!sp.mobile && !sp.desktop)) return '—';
  const v = (r) => (r?.scores?.performance == null ? '—' : r.scores.performance);
  return `${v(sp.mobile)} / ${v(sp.desktop)}`;
};

export default function SiteReports() {
  const [rows, setRows] = useState(null);
  const [openId, setOpenId] = useState(null);

  useEffect(() => {
    let off = false;
    fetchSiteStats(200).then((r) => { if (!off) setRows(r); }).catch(() => { if (!off) setRows([]); });
    return () => { off = true; };
  }, []);

  if (rows === null) return <p className="smm-muted">Завантаження…</p>;
  const open = rows.find((r) => r.id === openId);

  if (open) {
    return (
      <div className="smm-block">
        <div><button type="button" className="smm-btn" onClick={() => setOpenId(null)}><ActionIcon name="back" size={18} />До списку звітів</button></div>
        <SavedReport row={open} />
      </div>
    );
  }

  if (!rows.length) return <p className="smm-empty smm-empty--big">Збережених звітів ще немає. Звіт зʼявляється після кожного запуску агента: за розкладом або кнопкою «Запустити один раз» на вкладці «Огляд». Усі звіти зберігаються в базі даних.</p>;

  return (
    <section className="smm-block">
      <div>
        <h3>Історія звітів</h3>
        <p className="smm-muted">Усього збережено: {rows.length}. Звіти лежать у базі даних (Supabase), а не в самому агенті, тож не губляться. Натисніть «Відкрити», щоб побачити звіт повністю.</p>
      </div>
      <div className="smm-scroll">
        <table className="smm-table sao-reports">
          <thead><tr><th>Коли</th><th>Період даних</th><th>Користувачі</th><th>Кліки</th><th>Заявки</th><th>Швидкість</th><th /></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>{fmtWhen(r.created_at)}</td>
                <td>{r.period_start} – {r.period_end}</td>
                <td>{fmt(metricOf(r.data, 'ga4', 'users'))}</td>
                <td>{fmt(metricOf(r.data, 'gsc', 'clicks'))}</td>
                <td>{fmt(r.data?.extras?.leads?.cur?.leads)}</td>
                <td>{speedText(r.data)}</td>
                <td><button type="button" className="smm-btn" onClick={() => setOpenId(r.id)}>Відкрити</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
