import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { STATUS_LABEL, fmtIsoDate } from '../../lib/projectConstants';
import { fmtCost } from '../../lib/projectFields';
import { Ico, Medallion, initials } from './dashParts';

// "Реєстр проєктів" on the Projects Dashboard in Hub style: one pill-row per project (ring medallion with the
// initials, name, status, channels, cost); a row opens into every registry field plus a button to the project
// card. A halo search and a segmented status ribbon narrow the list.
const STATUS_FILTERS = [{ key: 'all', label: 'Всі' }, ...Object.entries(STATUS_LABEL).map(([key, label]) => ({ key, label }))];
const RING = { active: '', paused: 'st-paused', completed: 'st-mu' };

const PAGE_SIZE = 10;

// Page numbers to show: all of them up to 7, otherwise the first, the last and a window around the current one.
function pageList(page, pages) {
  if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1);
  const set = new Set([1, pages, page - 1, page, page + 1]);
  const list = [...set].filter((n) => n >= 1 && n <= pages).sort((a, b) => a - b);
  return list.flatMap((n, i) => (i && n - list[i - 1] > 1 ? ['…' + n, n] : [n]));
}

const dash = (v) => (v == null || v === '' ? '—' : v);

export default function ProjectsRegistry({ projects }) {
  const navigate = useNavigate();
  const [status, setStatus] = useState('all');
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(() => new Set());
  const [page, setPage] = useState(1);

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return projects.filter((p) => {
      if (status !== 'all' && p.status !== status) return false;
      if (!term) return true;
      return [p.name, p.client, p.manager, p.specialist, p.contacts].some((v) => (v || '').toLowerCase().includes(term));
    });
  }, [projects, status, search]);

  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const cur = Math.min(page, pages);
  const pageRows = rows.slice((cur - 1) * PAGE_SIZE, cur * PAGE_SIZE);

  const toggle = (id) => setOpen((cur) => {
    const next = new Set(cur);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  return (
    <div className="pd-registry">
      <div className="pd-rtools">
        <label className="pd-in">
          <Ico n="search" />
          <input
            type="text" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="Пошук: проєкт, клієнт, продакт, спеціаліст, контакти..." aria-label="Пошук по реєстру"
          />
        </label>
        <div className="pd-sg" role="group" aria-label="Статус проєкту">
          {STATUS_FILTERS.map((f) => (
            <button key={f.key} type="button" className={status === f.key ? 'on' : ''} aria-pressed={status === f.key} onClick={() => { setStatus(f.key); setPage(1); }}>
              {f.label}
              <span className="n">{f.key === 'all' ? projects.length : projects.filter((p) => p.status === f.key).length}</span>
            </button>
          ))}
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="pd-empty">Проєктів не знайдено.</div>
      ) : (
        <div className="pd-acc">
          {pageRows.map((p) => {
            const isOpen = open.has(p.id);
            const services = p.services || [];
            const facts = [
              ['Спеціаліст', p.specialist], ['Продакт', p.manager], ['Клієнт', p.client], ['Контакти', p.contacts],
              ['Гео', p.country], ['Часовий пояс', p.timezone], ['Початок комунікації', fmtIsoDate(p.comm_start_date)],
              ['Початок роботи над стратегією', fmtIsoDate(p.start_date)], ['Завершення співпраці', fmtIsoDate(p.end_date)],
              ['Причина зупинки роботи', p.stop_reason], ['Канал оплати', p.payment_channel], ['Вартість', fmtCost(p.cost)],
            ];
            return (
              <div className={'pd-ar' + (isOpen ? ' on' : '')} key={p.id}>
                <button type="button" className="pd-arh" aria-expanded={isOpen} onClick={() => toggle(p.id)}>
                  <Medallion tx={initials(p.name)} size="sm" st={RING[p.status] || ''} />
                  <span className="pd-arn"><b>{dash(p.name)}</b><small>{[p.business_type, p.client].filter(Boolean).join(' · ') || '—'}</small></span>
                  <span className={'pd-pill ' + p.status}><i />{STATUS_LABEL[p.status] || dash(p.status)}</span>
                  <span className="pd-tags">{services.slice(0, 2).map((s) => <span className="pd-tag" key={s}>{s}</span>)}{services.length > 2 ? <span className="pd-tag more">+{services.length - 2}</span> : null}</span>
                  <span className="pd-arc">{fmtCost(p.cost)}</span>
                  <span className="pd-cv"><Ico n="chev" /></span>
                </button>
                {isOpen && (
                  <div className="pd-ard">
                    {facts.map(([k, v]) => <div key={k}><small>{k}</small><b>{dash(v)}</b></div>)}
                    <div className="wide"><small>Канал роботи</small><b>{services.length ? services.join(', ') : '—'}</b></div>
                    <div className="wide"><small>Особливості роботи з клієнтом</small><b>{dash(p.notes)}</b></div>
                    <div className="pd-ardb">
                      <button type="button" className="pd-btn pri sm" onClick={() => navigate(`/projects/${p.id}`)}><Ico n="open" />Відкрити проєкт</button>
                      {p.worksection_link ? <a className="pd-btn sec sm" href={p.worksection_link} target="_blank" rel="noreferrer"><Ico n="link" />Worksection</a> : null}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {pages > 1 && (
        <nav className="pd-pager" aria-label="Сторінки реєстру">
          <button type="button" className="pd-pg arr" disabled={cur === 1} aria-label="Попередня сторінка" onClick={() => setPage(cur - 1)}><Ico n="chev" className="l" /></button>
          {pageList(cur, pages).map((n) => (typeof n === 'string'
            ? <span className="pd-pg gap" key={n}>…</span>
            : <button key={n} type="button" className={'pd-pg' + (n === cur ? ' on' : '')} aria-current={n === cur ? 'page' : undefined} onClick={() => setPage(n)}>{n}</button>))}
          <button type="button" className="pd-pg arr" disabled={cur === pages} aria-label="Наступна сторінка" onClick={() => setPage(cur + 1)}><Ico n="chev" className="r" /></button>
          <span className="pd-pgn">{(cur - 1) * PAGE_SIZE + 1}–{Math.min(cur * PAGE_SIZE, rows.length)} з {rows.length}</span>
        </nav>
      )}
    </div>
  );
}
