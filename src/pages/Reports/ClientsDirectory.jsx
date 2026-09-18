import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchClientDirectory } from '../../lib/api/clients';
import { clientFullName } from '../../lib/clientName';
import { fetchAllDeals } from '../../lib/api/deals';
import { STATUSES, STATUS_META } from '../../lib/clientStatus';
import { platformColor, platformLogo } from '../../lib/platforms';
import { COUNTRIES, flagClass } from '../../lib/countries';
import ClientAvatar from '../../components/Clients/ClientAvatar';
import PlatformPicker from '../../components/common/PlatformPicker';
import Select from '../../components/common/Select';
import ImportContactsModal from '../../components/Clients/ImportContactsModal';
import CreateClientModal from '../../components/Clients/CreateClientModal';
import { SECTION_ICONS } from '../../lib/reportIcons';
import { FIELD_ICONS } from '../../lib/taskFieldIcons';
import '../../styles/reportPage.css';
import '../../styles/automationTasksPage.css';
import '../../styles/automationDashboard.css';
import '../../styles/comparePage.css';
import '../../styles/clientsDirectory.css';
import '../../styles/dealsBoard.css';

const SEARCH_ICON = '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.35-4.35"/></svg>';
const FILTER_ICON = '<svg viewBox="0 0 24 24"><path d="M4 4h16l-6.5 8v6l-3 1.5v-7.5z"/></svg>';
const TREND_UP_ICON = '<svg viewBox="0 0 24 24"><path d="M4 16l6-6 4 4 6-8"/><path d="M15 6h5v5"/></svg>';
const PAGE_SIZE = 10;

const KPI_ICONS = {
  total: SECTION_ICONS['Клієнти'],
  openDeal: FIELD_ICONS.repeat,
  topPlatform: FIELD_ICONS.priority,
  newClients: TREND_UP_ICON,
};

// Two hand-authored decorative wave shapes (rising, distinctly different
// curvature) — same "illustration, not a real chart" approach as the
// KPI_WAVES bars on the Задачі page; there's no daily-granularity client
// count to plot for real, so this is purely visual.
const KPI_WAVE_PATHS = {
  purple: 'M0,46 C14,42 22,30 38,32 C54,34 58,20 74,17 C90,14 100,9 120,4 L120,60 L0,60 Z',
  green: 'M0,40 C13,45 24,48 34,39 C48,28 54,24 68,19 C84,13 96,17 120,7 L120,60 L0,60 Z',
};

const SORT_OPTIONS = [
  { value: 'updated', label: 'За оновленням' },
  { value: 'created', label: 'За датою створення' },
  { value: 'deals', label: 'За кількістю угод' },
  { value: 'name', label: "За ім'ям" },
];

const DEALS_FILTER_OPTIONS = [
  { value: '', label: 'Усі' },
  { value: 'with', label: 'З угодами' },
  { value: 'without', label: 'Без угод' },
];

export default function ClientsDirectory() {
  const navigate = useNavigate();
  const [clients, setClients] = useState([]);
  const [deals, setDeals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [platformFilter, setPlatformFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [sourceFilter, setSourceFilter] = useState('');
  const [countryFilter, setCountryFilter] = useState('');
  const [dealsFilter, setDealsFilter] = useState('');
  const [sortBy, setSortBy] = useState('updated');
  const [filterOpen, setFilterOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [importOpen, setImportOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const filterRef = useRef(null);

  function reloadDeals() {
    fetchAllDeals().then(setDeals);
  }

  function reloadClients() {
    fetchClientDirectory().then(setClients);
  }

  useEffect(() => {
    fetchClientDirectory().then((rows) => { setClients(rows); setLoading(false); });
    reloadDeals();
  }, []);

  const dealsByClient = useMemo(() => {
    const map = {};
    deals.forEach((d) => { (map[d.client_id] ||= []).push(d); });
    return map;
  }, [deals]);

  useEffect(() => {
    if (!filterOpen) return;
    function onDocClick(e) {
      // Select's open menu portals straight to <body>, outside filterRef's
      // own DOM subtree — without this check, picking an option there reads
      // as an "outside" click and closes the whole popover before the pick
      // registers (PlatformPicker's own menu isn't portaled, so it doesn't
      // need the same treatment).
      if (e.target.closest('.ui-select-menu')) return;
      if (filterRef.current && !filterRef.current.contains(e.target)) setFilterOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [filterOpen]);

  function resetFilters() {
    setSearch(''); setPlatformFilter(''); setTypeFilter(''); setSourceFilter(''); setCountryFilter(''); setDealsFilter(''); setPage(1);
  }

  const sourceOptions = useMemo(() => (
    Array.from(new Set(clients.map((c) => c.source).filter(Boolean))).sort().map((s) => ({ value: s, label: s }))
  ), [clients]);

  const countryOptions = useMemo(() => {
    const codes = new Set(clients.map((c) => c.country).filter(Boolean));
    return COUNTRIES.filter((c) => codes.has(c.code)).map((c) => ({ value: c.code, label: c.name, iconClassName: flagClass(c.code) }));
  }, [clients]);

  const kpis = useMemo(() => {
    const total = clients.length;
    const openDeals = clients.flatMap((c) => (dealsByClient[c.id] || []).filter((d) => !d.deal_stages?.is_won && !d.deal_stages?.is_lost));
    const withOpenDeal = clients.filter((c) => (dealsByClient[c.id] || []).some((d) => !d.deal_stages?.is_won && !d.deal_stages?.is_lost)).length;
    const byPlatform = {};
    clients.forEach((c) => { if (c.platform) byPlatform[c.platform] = (byPlatform[c.platform] || 0) + 1; });
    let topPlatform = null, topCount = 0;
    Object.entries(byPlatform).forEach(([p, n]) => { if (n > topCount) { topPlatform = p; topCount = n; } });
    const topPct = total && topPlatform ? Math.round((topCount / total) * 100) : 0;

    // "New" = created within the last 30 days — the growth-% subtext compares
    // that against the base that was already there before those 30 days
    // (total minus the new ones), not against the prior 30-day count, so it
    // reads as "the client base grew by X% this month".
    const now = Date.now();
    const day = 24 * 60 * 60 * 1000;
    const cutoff30 = now - 30 * day;
    const newLast30 = clients.filter((c) => c.created_at && new Date(c.created_at).getTime() >= cutoff30).length;
    const priorBase = total - newLast30;
    const newPct = priorBase > 0 ? Math.round((newLast30 / priorBase) * 100) : (newLast30 > 0 ? 100 : 0);
    const openDealsNew30 = openDeals.filter((d) => d.created_at && new Date(d.created_at).getTime() >= cutoff30).length;

    return { total, withOpenDeal, topPlatform, topCount, topPct, newLast30, newPct, openDealsNew30 };
  }, [clients, dealsByClient]);

  const activeFilterCount = [platformFilter, typeFilter, sourceFilter, countryFilter, dealsFilter].filter(Boolean).length;
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = clients.filter((c) => {
      if (q) {
        const inName = clientFullName(c).toLowerCase().includes(q);
        const inCompany = c.company?.toLowerCase().includes(q);
        const inTags = (c.tags || []).some((t) => t.toLowerCase().includes(q));
        if (!inName && !inCompany && !inTags) return false;
      }
      if (platformFilter && c.platform !== platformFilter) return false;
      if (typeFilter && c.status !== typeFilter) return false;
      if (sourceFilter && c.source !== sourceFilter) return false;
      if (countryFilter && c.country !== countryFilter) return false;
      const hasDeals = (dealsByClient[c.id] || []).length > 0;
      if (dealsFilter === 'with' && !hasDeals) return false;
      if (dealsFilter === 'without' && hasDeals) return false;
      return true;
    });
    list = [...list].sort((a, b) => {
      if (sortBy === 'name') return clientFullName(a).localeCompare(clientFullName(b), 'uk');
      if (sortBy === 'created') return new Date(b.created_at || 0) - new Date(a.created_at || 0);
      if (sortBy === 'deals') return (dealsByClient[b.id]?.length || 0) - (dealsByClient[a.id]?.length || 0);
      return new Date(b.updated_at || 0) - new Date(a.updated_at || 0);
    });
    return list;
  }, [clients, search, platformFilter, typeFilter, sourceFilter, countryFilter, dealsFilter, sortBy, dealsByClient]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const clampedPage = Math.min(page, pageCount);
  const paged = filtered.slice((clampedPage - 1) * PAGE_SIZE, clampedPage * PAGE_SIZE);
  const rangeStart = filtered.length ? (clampedPage - 1) * PAGE_SIZE + 1 : 0;
  const rangeEnd = Math.min(clampedPage * PAGE_SIZE, filtered.length);

  return (
    <div className="report-page">
      <div className="client-kpi-row">
        <div className="client-kpi-card">
          <div className="client-kpi-left">
            <div className="client-kpi-head">
              <span className="client-kpi-icon blue" dangerouslySetInnerHTML={{ __html: KPI_ICONS.total }} />
              <span className="client-kpi-label">Всього клієнтів</span>
            </div>
            <div className="client-kpi-value-row">
              <span className="client-kpi-value">{kpis.total}</span>
              {kpis.newLast30 > 0 && <span className="client-kpi-delta">&#8599; +{kpis.newLast30}</span>}
            </div>
            <div className="client-kpi-sub">{kpis.newPct > 0 ? `+${kpis.newPct}% за останні 30 днів` : 'за останні 30 днів'}</div>
          </div>
          <svg className="client-kpi-wave" viewBox="0 0 120 60" preserveAspectRatio="none">
            <defs>
              <linearGradient id="clientKpiWavePurple" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#7C3AED" stopOpacity=".35" />
                <stop offset="100%" stopColor="#7C3AED" stopOpacity="0" />
              </linearGradient>
            </defs>
            <path d={KPI_WAVE_PATHS.purple} fill="url(#clientKpiWavePurple)" stroke="#7C3AED" strokeWidth="2" />
          </svg>
        </div>

        <div className="client-kpi-card">
          <div className="client-kpi-left">
            <div className="client-kpi-head">
              <span className="client-kpi-icon blue" dangerouslySetInnerHTML={{ __html: KPI_ICONS.openDeal }} />
              <span className="client-kpi-label">Активних угод</span>
            </div>
            <div className="client-kpi-value-row">
              <span className="client-kpi-value">{kpis.withOpenDeal}</span>
              {kpis.openDealsNew30 > 0 && <span className="client-kpi-delta">&#8599; +{kpis.openDealsNew30}</span>}
            </div>
            <div className="client-kpi-sub">В роботі зараз</div>
          </div>
          <svg className="client-kpi-wave" viewBox="0 0 120 60" preserveAspectRatio="none">
            <defs>
              <linearGradient id="clientKpiWaveGreen" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#16A34A" stopOpacity=".35" />
                <stop offset="100%" stopColor="#16A34A" stopOpacity="0" />
              </linearGradient>
            </defs>
            <path d={KPI_WAVE_PATHS.green} fill="url(#clientKpiWaveGreen)" stroke="#16A34A" strokeWidth="2" />
          </svg>
        </div>

        <div className="client-kpi-card">
          <div className="client-kpi-left">
            <div className="client-kpi-head">
              <span className="client-kpi-icon orange" dangerouslySetInnerHTML={{ __html: KPI_ICONS.topPlatform }} />
              <span className="client-kpi-label">Топ платформа</span>
            </div>
            <div className="client-kpi-value-row">
              <span className="client-kpi-value client-kpi-value--text">{kpis.topPlatform || '—'}</span>
              {kpis.topPlatform && <span className="client-kpi-delta">{kpis.topPct}%</span>}
            </div>
            <div className="client-kpi-sub">{kpis.topPlatform ? `${kpis.topCount} з ${kpis.total} клієнтів` : 'Немає даних'}</div>
          </div>
          <div className="client-kpi-donut">
            <svg viewBox="0 0 80 80">
              <circle cx="40" cy="40" r="32" fill="none" stroke="#EDE7FB" strokeWidth="9" />
              <circle
                cx="40" cy="40" r="32" fill="none" stroke="#7C3AED" strokeWidth="9" strokeLinecap="round"
                strokeDasharray={`${(kpis.topPct / 100) * 201.06} 201.06`}
                transform="rotate(-90 40 40)"
              />
            </svg>
            <span className="client-kpi-donut-center">{kpis.topPct}%</span>
          </div>
        </div>

        <div className="client-kpi-card">
          <div className="client-kpi-left">
            <div className="client-kpi-head">
              <span className="client-kpi-icon blue" dangerouslySetInnerHTML={{ __html: KPI_ICONS.newClients }} />
              <span className="client-kpi-label">Нові клієнти</span>
            </div>
            <div className="client-kpi-value-row">
              <span className="client-kpi-value">+{kpis.newLast30}</span>
              {kpis.newPct > 0 && <span className="client-kpi-delta">&#8599; +{kpis.newPct}%</span>}
            </div>
            <div className="client-kpi-sub">За останні 30 днів</div>
          </div>
          <div className="client-kpi-bars">
            {[30, 45, 40, 60, 55, 80].map((h, i) => <span key={i} className="client-kpi-bar" style={{ height: h + '%', opacity: .4 + i * 0.1 }} />)}
          </div>
        </div>
      </div>

      <section className="report-section">
        <div className="mc-client-toolbar client-directory-toolbar">
          <div className="mc-client-search">
            <span dangerouslySetInnerHTML={{ __html: SEARCH_ICON }} />
            <input type="text" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="Пошук за іменем, компанією або тегом..." />
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
                  <label>Платформа</label>
                  <PlatformPicker
                    value={platformFilter} onChange={(v) => { setPlatformFilter(v); setPage(1); }}
                    allowClear clearLabel="Усі"
                  />
                </div>
                <div className="task-filter-row">
                  <label>Статус</label>
                  <Select
                    value={typeFilter} onChange={(v) => { setTypeFilter(v); setPage(1); }}
                    options={[{ value: '', label: 'Усі' }, ...STATUSES.map((s) => ({ value: s, label: s }))]}
                  />
                </div>
                <div className="task-filter-row">
                  <label>Джерело</label>
                  <Select
                    value={sourceFilter} onChange={(v) => { setSourceFilter(v); setPage(1); }}
                    options={[{ value: '', label: 'Усі' }, ...sourceOptions]}
                  />
                </div>
                <div className="task-filter-row">
                  <label>Країна</label>
                  <Select
                    searchable value={countryFilter} onChange={(v) => { setCountryFilter(v); setPage(1); }}
                    options={[{ value: '', label: 'Усі' }, ...countryOptions]}
                  />
                </div>
                <div className="task-filter-row">
                  <label>Угоди</label>
                  <Select
                    value={dealsFilter} onChange={(v) => { setDealsFilter(v); setPage(1); }}
                    options={DEALS_FILTER_OPTIONS}
                  />
                </div>
                <button type="button" className="btn task-filter-reset" onClick={resetFilters}>Скинути</button>
              </div>
            )}
          </div>
          <button type="button" className="btn" onClick={() => setImportOpen(true)}>Імпортувати контакти</button>
          <button type="button" className="btn btn-p" onClick={() => setCreateOpen(true)}>+ Створити контакт</button>
        </div>

        {loading ? (
          <div className="placeholder"><p>Завантаження…</p></div>
        ) : filtered.length === 0 ? (
          <div className="placeholder"><p>{clients.length === 0 ? 'Клієнтів ще немає — вони з’являться тут після збереження Weekly Report.' : 'Немає клієнтів за цим фільтром.'}</p></div>
        ) : (
          <div className="clients-directory-layout">
            <div>
              <div className="client-grid">
                <div className="client-grid-header">
                  <div>Клієнт</div>
                  <div>Статус</div>
                  <div>Платформа</div>
                  <div>Джерело</div>
                  <div>Країна</div>
                  <div>Угоди</div>
                  <div>Оновлено</div>
                </div>
                {paged.map((c) => {
                  const platformBrandColor = c.platform ? platformColor(c.platform) : null;
                  const platformBrandLogo = c.platform ? platformLogo(c.platform) : null;
                  const statusMeta = c.status ? STATUS_META[c.status] : null;
                  const countryMeta = c.country ? COUNTRIES.find((cn) => cn.code === c.country) : null;
                  return (
                    <div key={c.id} className="client-grid-row" onClick={() => navigate(`/reports/clients-directory/${c.id}`)}>
                      <div className="client-grid-name-cell">
                        <ClientAvatar name={c.name} photo={c.photo} size={34} />
                        <div className="client-grid-name-text">
                          <div className="ink">{clientFullName(c)}</div>
                          {c.company && <div className="client-grid-subtitle">{c.company}</div>}
                        </div>
                      </div>
                      <div>
                        {statusMeta ? (
                          <span
                            className="client-grid-badge client-grid-status-badge"
                            style={{ color: statusMeta.color, background: statusMeta.tint, border: `1px solid ${statusMeta.color}4D` }}
                          >
                            <span className="client-grid-status-dot" style={{ background: statusMeta.color }} />
                            {c.status}
                          </span>
                        ) : '—'}
                      </div>
                      <div>
                        {c.platform ? (
                          <span
                            className="client-grid-badge client-grid-badge--platform"
                            style={{
                              color: platformBrandColor,
                              background: `linear-gradient(135deg, #fff, ${platformBrandColor}26)`,
                              border: `1px solid ${platformBrandColor}55`,
                              boxShadow: `0 3px 8px -3px ${platformBrandColor}66`,
                            }}
                          >
                            {platformBrandLogo && <img className="client-grid-badge-logo" src={platformBrandLogo} alt="" />}
                            {c.platform}
                          </span>
                        ) : '—'}
                      </div>
                      <div className="client-grid-plain">{c.source || '—'}</div>
                      <div className="client-grid-plain">
                        {countryMeta ? (
                          <span className="client-grid-country">
                            <span className={flagClass(countryMeta.code)} />
                            {countryMeta.name}
                          </span>
                        ) : '—'}
                      </div>
                      <div>{(dealsByClient[c.id] || []).length || '—'}</div>
                      <div className="client-grid-date">
                        <span dangerouslySetInnerHTML={{ __html: FIELD_ICONS.day }} />
                        {c.updated_at ? new Date(c.updated_at).toLocaleDateString('uk-UA') : '—'}
                      </div>
                    </div>
                  );
                })}
              </div>
              {filtered.length > PAGE_SIZE && (
                <div className="month-pagination">
                  <div className="month-pagination-hint">{rangeStart}-{rangeEnd} з {filtered.length} клієнтів</div>
                  <div className="month-pagination-pages">
                    <button type="button" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={clampedPage === 1} aria-label="Попередня сторінка">&#8249;</button>
                    {Array.from({ length: pageCount }, (_, i) => i + 1).map((n) => (
                      <button key={n} type="button" className={n === clampedPage ? 'on' : ''} onClick={() => setPage(n)}>{n}</button>
                    ))}
                    <button type="button" onClick={() => setPage((p) => Math.min(pageCount, p + 1))} disabled={clampedPage === pageCount} aria-label="Наступна сторінка">&#8250;</button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </section>

      {importOpen && (
        <ImportContactsModal
          onClose={() => setImportOpen(false)}
          onImported={reloadClients}
        />
      )}

      {createOpen && (
        <CreateClientModal
          onClose={() => setCreateOpen(false)}
          onCreated={(client) => navigate(`/reports/clients-directory/${client.id}`)}
        />
      )}
    </div>
  );
}
