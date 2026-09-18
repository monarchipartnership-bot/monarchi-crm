import { useMemo, useRef, useState } from 'react';
import { fmtDate } from '../../../lib/dateHelpers';
import Select from '../../../components/common/Select';
import { stagePillStyle } from '../../../lib/stagePillStyle';

const SEARCH_ICON = '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.35-4.35"/></svg>';
const FILTER_ICON = '<svg viewBox="0 0 24 24"><path d="M4 4h16l-6.5 8v6l-3 1.5v-7.5z"/></svg>';
const PAGE_SIZE = 15;

const SORT_OPTIONS = [
  { value: 'updated', label: 'За оновленням' },
  { value: 'amount', label: 'За сумою' },
  { value: 'created', label: 'За датою створення' },
];

function fmtShort(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return fmtDate(d.getFullYear(), d.getMonth() + 1, d.getDate());
}

export default function DealsListTab({ deals, stages, onViewDeal, mode = 'active' }) {
  const [search, setSearch] = useState('');
  const [stageFilter, setStageFilter] = useState('');
  const [managerFilter, setManagerFilter] = useState('');
  const [sortBy, setSortBy] = useState('updated');
  const [filterOpen, setFilterOpen] = useState(false);
  const [page, setPage] = useState(1);
  const filterRef = useRef(null);

  const managerOptions = useMemo(() => Array.from(new Set(deals.map((d) => d.manager).filter(Boolean))).sort(), [deals]);
  const stagesById = useMemo(() => Object.fromEntries(stages.map((s) => [s.id, s])), [stages]);

  const activeFilterCount = [stageFilter, managerFilter].filter(Boolean).length;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = deals.filter((d) => {
      if (mode === 'archive' ? !d.archived : d.archived) return false;
      if (q) {
        const inTitle = d.title?.toLowerCase().includes(q);
        const inClient = d.clients?.name?.toLowerCase().includes(q);
        const inCompany = d.clients?.company?.toLowerCase().includes(q);
        if (!inTitle && !inClient && !inCompany) return false;
      }
      if (stageFilter && String(d.stage_id) !== String(stageFilter)) return false;
      if (managerFilter && d.manager !== managerFilter) return false;
      return true;
    });
    list = [...list].sort((a, b) => {
      if (sortBy === 'amount') return (Number(b.amount) || 0) - (Number(a.amount) || 0);
      if (sortBy === 'created') return new Date(b.created_at) - new Date(a.created_at);
      return new Date(b.updated_at || 0) - new Date(a.updated_at || 0);
    });
    return list;
  }, [deals, search, stageFilter, managerFilter, sortBy, mode]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const clampedPage = Math.min(page, pageCount);
  const paged = filtered.slice((clampedPage - 1) * PAGE_SIZE, clampedPage * PAGE_SIZE);
  const rangeStart = filtered.length ? (clampedPage - 1) * PAGE_SIZE + 1 : 0;
  const rangeEnd = Math.min(clampedPage * PAGE_SIZE, filtered.length);

  function resetFilters() {
    setSearch(''); setStageFilter(''); setManagerFilter(''); setPage(1);
  }

  return (
    <>
      <section className="report-section">
        <div className="stitle">
          <span>{mode === 'archive' ? 'Архів угод' : 'Усі угоди'}</span>
          <div className="mc-client-toolbar stitle-filter">
            <div className="mc-client-search">
              <span dangerouslySetInnerHTML={{ __html: SEARCH_ICON }} />
              <input type="text" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="Пошук за назвою або клієнтом..." />
            </div>
            <Select className="dash-period-select" value={sortBy} onChange={setSortBy} options={SORT_OPTIONS} />
            <div className="task-filter-wrap" ref={filterRef}>
              <button type="button" className={'btn task-filter-btn' + (activeFilterCount ? ' has-active' : '')} onClick={() => setFilterOpen((o) => !o)}>
                <span dangerouslySetInnerHTML={{ __html: FILTER_ICON }} />
                Фільтр{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
              </button>
              {filterOpen && (
                <div className="task-filter-popover">
                  <div className="task-filter-row">
                    <label>Стадія</label>
                    <Select
                      value={stageFilter} onChange={(v) => { setStageFilter(v); setPage(1); }}
                      options={[{ value: '', label: 'Усі' }, ...stages.map((s) => ({ value: String(s.id), label: s.label }))]}
                    />
                  </div>
                  <div className="task-filter-row">
                    <label>Менеджер</label>
                    <Select
                      value={managerFilter} onChange={(v) => { setManagerFilter(v); setPage(1); }}
                      options={[{ value: '', label: 'Усі' }, ...managerOptions.map((m) => ({ value: m, label: m }))]}
                    />
                  </div>
                  <button type="button" className="btn task-filter-reset" onClick={resetFilters}>Скинути</button>
                </div>
              )}
            </div>
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="placeholder">
            <p>
              {mode === 'archive'
                ? 'Архів поки порожній — сюди потраплять угоди після переходу в стадію Виграно/Програно.'
                : deals.length === 0 ? 'Угод ще немає.' : 'Немає угод за цим фільтром.'}
            </p>
          </div>
        ) : (
          <>
            <div className="tbl-wrap">
              <table className="cmp-table">
                <thead>
                  <tr><th>Клієнт</th><th>Назва угоди</th><th>Етап</th><th>Сума</th><th>Менеджер</th><th>Дата створення</th><th /></tr>
                </thead>
                <tbody>
                  {paged.map((d) => {
                    const stage = stagesById[d.stage_id];
                    return (
                      <tr key={d.id} className="client-row" onClick={() => onViewDeal(d)}>
                        <td className="ink">{d.clients?.company || d.clients?.name || '—'}</td>
                        <td>{d.title || '—'}</td>
                        <td><span className="deal-stage-pill" style={stagePillStyle(stage?.color)}>{stage?.label || '—'}</span></td>
                        <td>{d.amount ? `${Number(d.amount).toLocaleString('uk-UA')} ${d.currency}` : '—'}</td>
                        <td>{d.manager || '—'}</td>
                        <td>{fmtShort(d.created_at)}</td>
                        <td onClick={(e) => e.stopPropagation()}>
                          <button type="button" className="btn" onClick={() => onViewDeal(d)}>Відкрити</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {filtered.length > PAGE_SIZE && (
              <div className="month-pagination">
                <div className="month-pagination-hint">{rangeStart}-{rangeEnd} з {filtered.length} угод</div>
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
      </section>
    </>
  );
}
