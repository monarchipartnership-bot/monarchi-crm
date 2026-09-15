import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchClientDirectory, updateClientDirectoryEntry } from '../../lib/api/clients';
import { fetchAllDeals } from '../../lib/api/deals';
import { fetchPipelines } from '../../lib/api/pipelines';
import { fetchAllProfiles, profileLabel } from '../../lib/api/profile';
import { CLIENT_PLATFORMS, CLIENT_TYPES } from '../../lib/reportConstants';
import { colorForTag } from '../../lib/tagColors';
import { useAuth } from '../../contexts/AuthContext';
import ClientAvatar from '../../components/Clients/ClientAvatar';
import ClientActivityTab from '../../components/Clients/ClientActivityTab';
import ClientNotesTab from '../../components/Clients/ClientNotesTab';
import ClientFilesTab from '../../components/Clients/ClientFilesTab';
import AddDealModal from '../../components/Deals/AddDealModal';
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
const MORE_ICON = '<svg viewBox="0 0 24 24"><circle cx="12" cy="5" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="12" cy="19" r="1.6"/></svg>';
const PAGE_SIZE = 10;

const KPI_ICONS = {
  total: SECTION_ICONS['Клієнти'],
  openDeal: FIELD_ICONS.repeat,
  topPlatform: FIELD_ICONS.priority,
};

const TABS = [
  { key: 'info', label: 'Основна інформація' },
  { key: 'activity', label: 'Активність' },
  { key: 'notes', label: 'Нотатки' },
  { key: 'files', label: 'Файли' },
];

const SORT_OPTIONS = [
  { value: 'updated', label: "За оновленням" },
  { value: 'name', label: "За ім'ям" },
];

export default function ClientsDirectory() {
  const navigate = useNavigate();
  const { email } = useAuth();
  const [clients, setClients] = useState([]);
  const [deals, setDeals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [platformFilter, setPlatformFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [sortBy, setSortBy] = useState('updated');
  const [filterOpen, setFilterOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState(null);
  const [activeTab, setActiveTab] = useState('info');
  const [editingBasic, setEditingBasic] = useState(false);
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [rowMenuOpenId, setRowMenuOpenId] = useState(null);
  const [pipelines, setPipelines] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [addDealOpen, setAddDealOpen] = useState(false);
  const filterRef = useRef(null);

  function reloadDeals() {
    fetchAllDeals().then(setDeals);
  }

  useEffect(() => {
    fetchClientDirectory().then((rows) => { setClients(rows); setLoading(false); });
    reloadDeals();
    fetchPipelines().then(setPipelines);
    fetchAllProfiles().then((rows) => setProfiles(rows.map((p) => ({ email: p.email, label: profileLabel(p) }))));
  }, []);

  const dealsByClient = useMemo(() => {
    const map = {};
    deals.forEach((d) => { (map[d.client_id] ||= []).push(d); });
    return map;
  }, [deals]);

  useEffect(() => {
    if (!filterOpen) return;
    function onDocClick(e) {
      if (filterRef.current && !filterRef.current.contains(e.target)) setFilterOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [filterOpen]);

  useEffect(() => {
    if (rowMenuOpenId === null) return;
    function onDocClick(e) {
      if (!e.target.closest('.row-menu')) setRowMenuOpenId(null);
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [rowMenuOpenId]);

  function openClient(c) {
    setSelected(c);
    setActiveTab('info');
    setEditingBasic(false);
  }

  function patchSelected(patch) {
    const before = selected;
    setSelected((s) => ({ ...s, ...patch }));
    setClients((list) => list.map((c) => (c.id === before.id ? { ...c, ...patch } : c)));
    updateClientDirectoryEntry(before.id, patch, before, email);
  }

  function toggleRowSelected(id) {
    setSelectedIds((set) => {
      const next = new Set(set);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function resetFilters() {
    setSearch(''); setPlatformFilter(''); setTypeFilter(''); setPage(1);
  }

  const kpis = useMemo(() => {
    const total = clients.length;
    const withOpenDeal = clients.filter((c) => (dealsByClient[c.id] || []).some((d) => !d.deal_stages?.is_won && !d.deal_stages?.is_lost)).length;
    const byPlatform = {};
    clients.forEach((c) => { if (c.platform) byPlatform[c.platform] = (byPlatform[c.platform] || 0) + 1; });
    let topPlatform = null, topCount = 0;
    Object.entries(byPlatform).forEach(([p, n]) => { if (n > topCount) { topPlatform = p; topCount = n; } });
    const topPct = total && topPlatform ? Math.round((topCount / total) * 100) : 0;
    return { total, withOpenDeal, topPlatform, topPct };
  }, [clients, dealsByClient]);

  const activeFilterCount = [platformFilter, typeFilter].filter(Boolean).length;
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = clients.filter((c) => {
      if (q) {
        const inName = c.name?.toLowerCase().includes(q);
        const inCompany = c.company?.toLowerCase().includes(q);
        const inTags = (c.tags || []).some((t) => t.toLowerCase().includes(q));
        if (!inName && !inCompany && !inTags) return false;
      }
      if (platformFilter && c.platform !== platformFilter) return false;
      if (typeFilter && c.lead_type !== typeFilter) return false;
      return true;
    });
    list = [...list].sort((a, b) => {
      if (sortBy === 'name') return (a.name || '').localeCompare(b.name || '', 'uk');
      return new Date(b.updated_at || 0) - new Date(a.updated_at || 0);
    });
    return list;
  }, [clients, search, platformFilter, typeFilter, sortBy]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const clampedPage = Math.min(page, pageCount);
  const paged = filtered.slice((clampedPage - 1) * PAGE_SIZE, clampedPage * PAGE_SIZE);
  const rangeStart = filtered.length ? (clampedPage - 1) * PAGE_SIZE + 1 : 0;
  const rangeEnd = Math.min(clampedPage * PAGE_SIZE, filtered.length);
  const allPagedSelected = paged.length > 0 && paged.every((c) => selectedIds.has(c.id));

  return (
    <div className="report-page">
      <section className="rpt-hero">
        <div className="rpt-hero-heading">
          <span className="rpt-hero-icon" dangerouslySetInnerHTML={{ __html: SECTION_ICONS['Клієнти'] }} />
          <h1>База клієнтів</h1>
        </div>
        <p className="sub">Єдина картка на кожного клієнта — синхронізується з тим, що менеджери зберігають у Weekly Report, і не залежить від перерахунку місячних звітів.</p>
      </section>

      <div className="dash-kpi-row">
        <div className="dash-kpi">
          <div className="dash-kpi-head">
            <span className="dash-kpi-icon" dangerouslySetInnerHTML={{ __html: KPI_ICONS.total }} />
            <div className="dash-kpi-label">Всього клієнтів</div>
          </div>
          <div className="dash-kpi-value">{kpis.total}</div>
        </div>
        <div className="dash-kpi">
          <div className="dash-kpi-head">
            <span className="dash-kpi-icon" dangerouslySetInnerHTML={{ __html: KPI_ICONS.openDeal }} />
            <div className="dash-kpi-label">З відкритою угодою</div>
          </div>
          <div className="dash-kpi-value">{kpis.withOpenDeal}</div>
        </div>
        <div className="dash-kpi">
          <div className="dash-kpi-head">
            <span className="dash-kpi-icon" dangerouslySetInnerHTML={{ __html: KPI_ICONS.topPlatform }} />
            <div className="dash-kpi-label">Топ платформа</div>
          </div>
          <div className="dash-kpi-value">{kpis.topPlatform || '—'} {kpis.topPlatform && <span className="pct">{kpis.topPct}%</span>}</div>
        </div>
      </div>

      <section className="report-section">
        <div className="stitle">
          <span className="stitle-icon" dangerouslySetInnerHTML={{ __html: SECTION_ICONS['Клієнти'] }} />Клієнти
          <div className="mc-client-toolbar stitle-filter">
            <div className="mc-client-search">
              <span dangerouslySetInnerHTML={{ __html: SEARCH_ICON }} />
              <input type="text" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="Пошук за іменем, компанією або тегом..." />
            </div>
            <select className="dash-period-select" value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
              {SORT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <div className="task-filter-wrap" ref={filterRef}>
              <button type="button" className={'btn task-filter-btn' + (activeFilterCount ? ' has-active' : '')} onClick={() => setFilterOpen((o) => !o)}>
                <span dangerouslySetInnerHTML={{ __html: FILTER_ICON }} />
                Фільтр{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
              </button>
              {filterOpen && (
                <div className="task-filter-popover">
                  <div className="task-filter-row">
                    <label>Платформа</label>
                    <select value={platformFilter} onChange={(e) => { setPlatformFilter(e.target.value); setPage(1); }}>
                      <option value="">Усі</option>
                      {CLIENT_PLATFORMS.map((p) => <option key={p} value={p}>{p}</option>)}
                    </select>
                  </div>
                  <div className="task-filter-row">
                    <label>Тип клієнта</label>
                    <select value={typeFilter} onChange={(e) => { setTypeFilter(e.target.value); setPage(1); }}>
                      <option value="">Усі</option>
                      {CLIENT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                  <button type="button" className="btn task-filter-reset" onClick={resetFilters}>Скинути</button>
                </div>
              )}
            </div>
          </div>
        </div>

        {loading ? (
          <div className="placeholder"><p>Завантаження…</p></div>
        ) : filtered.length === 0 ? (
          <div className="placeholder"><p>{clients.length === 0 ? 'Клієнтів ще немає — вони з’являться тут після збереження Weekly Report.' : 'Немає клієнтів за цим фільтром.'}</p></div>
        ) : (
          <div className={'clients-directory-layout' + (selected ? ' has-panel' : '')}>
            <div>
              <div className="tbl-wrap">
                <table className="cmp-table">
                  <thead>
                    <tr>
                      <th className="client-check-col">
                        <input
                          type="checkbox"
                          checked={allPagedSelected}
                          onChange={() => setSelectedIds((set) => {
                            const next = new Set(set);
                            if (allPagedSelected) paged.forEach((c) => next.delete(c.id));
                            else paged.forEach((c) => next.add(c.id));
                            return next;
                          })}
                        />
                      </th>
                      <th>Клієнт</th>
                      <th>Компанія</th>
                      <th>Платформа</th>
                      <th>Тип</th>
                      <th>Угоди</th>
                      <th>Оновлено</th>
                      <th className="client-menu-col" />
                    </tr>
                  </thead>
                  <tbody>
                    {paged.map((c) => (
                      <tr key={c.id} className={'client-row' + (selected?.id === c.id ? ' active' : '')} onClick={() => openClient(c)}>
                        <td className="client-check-col" onClick={(e) => e.stopPropagation()}>
                          <input type="checkbox" checked={selectedIds.has(c.id)} onChange={() => toggleRowSelected(c.id)} />
                        </td>
                        <td className="ink client-name-cell">
                          <ClientAvatar name={c.name} size={30} />
                          <span>{c.name}</span>
                        </td>
                        <td>{c.company || '—'}</td>
                        <td>{c.platform || '—'}</td>
                        <td>{c.lead_type || '—'}</td>
                        <td>{(dealsByClient[c.id] || []).length || '—'}</td>
                        <td>{c.updated_at ? new Date(c.updated_at).toLocaleDateString('uk-UA') : '—'}</td>
                        <td className="client-menu-col row-menu" onClick={(e) => e.stopPropagation()}>
                          <button type="button" className="row-menu-btn" onClick={() => setRowMenuOpenId((id) => (id === c.id ? null : c.id))} aria-label="Дії">
                            <span dangerouslySetInnerHTML={{ __html: MORE_ICON }} />
                          </button>
                          {rowMenuOpenId === c.id && (
                            <div className="row-menu-popover">
                              <button type="button" onClick={() => { setRowMenuOpenId(null); navigate(`/reports/clients-directory/${c.id}`); }}>Відкрити профіль</button>
                              <button type="button" onClick={() => { setRowMenuOpenId(null); openClient(c); setEditingBasic(true); }}>Редагувати</button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
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

            {selected && (
              <div className="client-panel">
                <button type="button" className="client-panel-close" onClick={() => setSelected(null)}>&times;</button>
                <div className="client-panel-head">
                  <ClientAvatar name={selected.name} size={44} />
                  <div>
                    <h3>{selected.name}</h3>
                    <span className="status-dot-wrap">{(dealsByClient[selected.id] || []).length || 0} угод</span>
                  </div>
                </div>
                <div className="client-panel-actions">
                  <button type="button" className="btn" onClick={() => navigate(`/reports/clients-directory/${selected.id}`)}>Відкрити профіль</button>
                  <button type="button" className="btn" onClick={() => setEditingBasic((v) => !v)}>{editingBasic ? 'Готово' : 'Редагувати'}</button>
                  <button type="button" className="btn btn-p" onClick={() => setAddDealOpen(true)}>+ Створити угоду</button>
                </div>

                <div className="client-panel-tabs">
                  {TABS.map((t) => (
                    <button key={t.key} type="button" className={'client-panel-tab' + (activeTab === t.key ? ' active' : '')} onClick={() => setActiveTab(t.key)}>
                      {t.label}
                    </button>
                  ))}
                </div>

                {activeTab === 'info' && (
                  <div className="client-panel-info">
                    {editingBasic ? (
                      <>
                        <div className="task-filter-row">
                          <label>Ім'я</label>
                          <input type="text" value={selected.name || ''} onChange={(e) => patchSelected({ name: e.target.value })} />
                        </div>
                        <div className="task-filter-row">
                          <label>Компанія</label>
                          <input type="text" value={selected.company || ''} onChange={(e) => patchSelected({ company: e.target.value })} />
                        </div>
                      </>
                    ) : (
                      <div className="task-filter-row"><label>Компанія</label><span>{selected.company || '—'}</span></div>
                    )}
                    <div className="task-filter-row">
                      <label>Платформа</label>
                      <select value={selected.platform || ''} onChange={(e) => patchSelected({ platform: e.target.value })}>
                        {CLIENT_PLATFORMS.map((p) => <option key={p} value={p}>{p}</option>)}
                      </select>
                    </div>
                    <div className="task-filter-row">
                      <label>Тип клієнта</label>
                      <select value={selected.lead_type || ''} onChange={(e) => patchSelected({ lead_type: e.target.value })}>
                        {CLIENT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </div>
                    {(selected.tags || []).length > 0 && (
                      <div className="client-panel-tags">
                        {selected.tags.map((tag) => (
                          <span className="tag-chip" key={tag} style={{ background: colorForTag(tag) }}>{tag}</span>
                        ))}
                      </div>
                    )}
                    <div className="client-history-label">Угоди клієнта</div>
                    {(dealsByClient[selected.id] || []).length === 0 ? (
                      <p className="client-history-empty">Угод ще немає.</p>
                    ) : (
                      <div className="client-history-list">
                        {dealsByClient[selected.id].map((d) => (
                          <div className="client-history-item" key={d.id}>
                            <div className="client-history-week">{d.pipelines?.name ? `${d.pipelines.name} · ` : ''}{d.deal_stages?.label}{d.amount ? ` · ${Number(d.amount).toLocaleString('uk-UA')} ${d.currency}` : ''}</div>
                          </div>
                        ))}
                      </div>
                    )}
                    <button type="button" className="btn" onClick={() => navigate('/reports/deals')} style={{ marginTop: 10 }}>Переглянути в Угодах</button>
                  </div>
                )}
                {activeTab === 'activity' && <ClientActivityTab clientId={selected.id} name={selected.name} />}
                {activeTab === 'notes' && <ClientNotesTab notes={selected.notes} onSave={(notes) => patchSelected({ notes })} />}
                {activeTab === 'files' && <ClientFilesTab clientId={selected.id} uploadedBy={email} />}
              </div>
            )}
          </div>
        )}
      </section>

      {addDealOpen && selected && pipelines.length > 0 && (
        <AddDealModal
          pipelines={pipelines}
          defaultPipelineId={pipelines.find((p) => p.name === selected.platform)?.id || pipelines[0]?.id}
          presetClient={selected}
          profiles={profiles}
          onClose={() => setAddDealOpen(false)}
          onCreated={reloadDeals}
        />
      )}
    </div>
  );
}
