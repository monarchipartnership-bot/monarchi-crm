import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { STATUS_LABEL, fmtIsoDate } from '../../lib/projectConstants';
import { fmtCost } from '../../lib/projectFields';

// "Реєстр проєктів" on the Projects Dashboard: one row per project with the
// registry columns (type, channels, specialist/product, client, contacts, geo,
// timezone, key dates, payment, cost, Worksection link, client notes). Rows open
// the project card; the status chips and search narrow the list.
const STATUS_FILTERS = [{ key: 'all', label: 'Всі' }, ...Object.entries(STATUS_LABEL).map(([key, label]) => ({ key, label }))];

const dash = (v) => (v == null || v === '' ? '—' : v);

export default function ProjectsRegistry({ projects }) {
  const navigate = useNavigate();
  const [status, setStatus] = useState('all');
  const [search, setSearch] = useState('');

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return projects.filter((p) => {
      if (status !== 'all' && p.status !== status) return false;
      if (!term) return true;
      return [p.name, p.client, p.manager, p.specialist, p.contacts].some((v) => (v || '').toLowerCase().includes(term));
    });
  }, [projects, status, search]);

  return (
    <div className="pr-registry">
      <div className="pr-toolbar">
        <input
          type="text" className="pr-search" value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder="Пошук: проєкт, клієнт, продакт, спеціаліст, контакти..."
        />
        <div className="pr-chips">
          {STATUS_FILTERS.map((f) => (
            <button key={f.key} type="button" className={'pr-chip' + (status === f.key ? ' on' : '')} aria-pressed={status === f.key} onClick={() => setStatus(f.key)}>
              {f.label}
              <span> {f.key === 'all' ? projects.length : projects.filter((p) => p.status === f.key).length}</span>
            </button>
          ))}
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="empty-hint">Проєктів не знайдено.</div>
      ) : (
        <div className="pr-table-wrap">
          <table className="pr-table">
            <thead>
              <tr>
                <th>Проєкт</th><th>Статус</th><th>Тип бізнесу</th><th>Канал роботи</th><th>Спеціаліст</th><th>Продакт</th>
                <th>Клієнт</th><th>Контакти</th><th>Гео</th><th>Часовий пояс</th><th>Початок комунікації</th>
                <th>Початок роботи над стратегією</th><th>Завершення співпраці</th><th>Причина зупинки роботи</th>
                <th>Канал оплати</th><th>Вартість</th><th>Лінк в Worksection</th><th>Особливості роботи з клієнтом</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id} onClick={() => navigate(`/projects/${p.id}`)} tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter') navigate(`/projects/${p.id}`); }}>
                  <td className="pr-name">{dash(p.name)}</td>
                  <td><span className={'status-pill ' + p.status}>{STATUS_LABEL[p.status] || dash(p.status)}</span></td>
                  <td>{dash(p.business_type)}</td>
                  <td>{p.services?.length ? <span className="pr-tags">{p.services.map((s) => <span className="svc-tag" key={s}>{s}</span>)}</span> : '—'}</td>
                  <td>{dash(p.specialist)}</td>
                  <td>{dash(p.manager)}</td>
                  <td>{dash(p.client)}</td>
                  <td>{dash(p.contacts)}</td>
                  <td>{dash(p.country)}</td>
                  <td>{dash(p.timezone)}</td>
                  <td>{fmtIsoDate(p.comm_start_date) || '—'}</td>
                  <td>{fmtIsoDate(p.start_date) || '—'}</td>
                  <td>{fmtIsoDate(p.end_date) || '—'}</td>
                  <td className="pr-wrap">{dash(p.stop_reason)}</td>
                  <td>{dash(p.payment_channel)}</td>
                  <td className="pr-num">{fmtCost(p.cost)}</td>
                  <td>
                    {p.worksection_link
                      ? <a href={p.worksection_link} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>Відкрити</a>
                      : '—'}
                  </td>
                  <td className="pr-wrap">{dash(p.notes)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
