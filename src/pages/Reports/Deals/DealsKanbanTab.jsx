import { useMemo, useState } from 'react';
import { moveDealStage } from '../../../lib/api/deals';
import DealCard from '../../../components/Deals/DealCard';
import Select from '../../../components/common/Select';
import DealsFilterMenu from '../../../components/Deals/DealsFilterMenu';

const SEARCH_ICON = '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.35-4.35"/></svg>';
const DAY_MS = 86400000;

export default function DealsKanbanTab({ deals, stages, reload, onAddDeal, onManageStages, onViewDeal }) {
  const [dragOverStage, setDragOverStage] = useState(null);
  const [lostModal, setLostModal] = useState(null); // { dealId, stage }
  const [lostReason, setLostReason] = useState('');
  const [search, setSearch] = useState('');
  const [managerFilter, setManagerFilter] = useState('');
  const [smartFilter, setSmartFilter] = useState(null);
  const [stageFilterIds, setStageFilterIds] = useState([]);
  const [sourceFilter, setSourceFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const managerOptions = useMemo(() => Array.from(new Set(deals.map((d) => d.manager).filter(Boolean))).sort(), [deals]);
  const sourceOptions = useMemo(() => Array.from(new Set(deals.map((d) => d.source).filter(Boolean))).sort(), [deals]);
  const stagesById = useMemo(() => Object.fromEntries(stages.map((s) => [s.id, s])), [stages]);

  function toggleStageFilter(id) {
    setStageFilterIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
  }
  function resetAdvancedFilters() {
    setManagerFilter(''); setSmartFilter(null); setStageFilterIds([]); setSourceFilter(''); setDateFrom(''); setDateTo('');
  }
  const activeFilterCount = [managerFilter, smartFilter, sourceFilter, dateFrom, dateTo].filter(Boolean).length + stageFilterIds.length;

  const filteredDeals = useMemo(() => {
    const q = search.trim().toLowerCase();
    return deals.filter((d) => {
      // Archived deals leave the working board — Lost deals archive
      // themselves the moment they close, Won deals stay here until
      // someone explicitly clicks "Завершити угоду" (ongoing invoicing/
      // follow-up work happens while a deal is Won but not yet archived).
      // The one exception is the "Усі видалені угоди" smart filter, which
      // deliberately wants exactly the archived ones instead.
      if (smartFilter === 'archived') { if (!d.archived) return false; }
      else if (d.archived) return false;

      if (managerFilter && d.manager !== managerFilter) return false;
      if (stageFilterIds.length && !stageFilterIds.includes(d.stage_id)) return false;
      if (sourceFilter && d.source !== sourceFilter) return false;
      if (dateFrom && (d.created_at || '') < dateFrom) return false;
      if (dateTo && (d.created_at || '') > `${dateTo}T23:59:59`) return false;

      if (smartFilter && smartFilter !== 'archived') {
        const stage = stagesById[d.stage_id];
        if (smartFilter === 'won' && !stage?.is_won) return false;
        if (smartFilter === 'lost' && !stage?.is_lost) return false;
        if (smartFilter === 'open' && (stage?.is_won || stage?.is_lost)) return false;
        if (smartFilter === 'inactive' && (Date.now() - new Date(d.updated_at || d.created_at).getTime()) < 14 * DAY_MS) return false;
        if (smartFilter === 'old3m' && (Date.now() - new Date(d.created_at).getTime()) < 90 * DAY_MS) return false;
      }

      if (q) {
        const inTitle = d.title?.toLowerCase().includes(q);
        const inClient = d.clients?.name?.toLowerCase().includes(q);
        const inCompany = d.clients?.company?.toLowerCase().includes(q);
        if (!inTitle && !inClient && !inCompany) return false;
      }
      return true;
    });
  }, [deals, search, managerFilter, smartFilter, stageFilterIds, sourceFilter, dateFrom, dateTo, stagesById]);

  const byStage = useMemo(() => {
    const map = {};
    stages.forEach((s) => { map[s.id] = []; });
    filteredDeals.forEach((d) => { if (map[d.stage_id]) map[d.stage_id].push(d); });
    return map;
  }, [filteredDeals, stages]);

  async function applyStageMove(dealId, stage, reason) {
    try {
      await moveDealStage(dealId, stage, reason);
      reload();
    } catch (e) {
      alert('Помилка переносу угоди: ' + (e.message || e));
      reload();
    }
  }

  function handleDrop(e, stage) {
    e.preventDefault();
    setDragOverStage(null);
    const dealId = e.dataTransfer.getData('text/plain');
    if (!dealId) return;
    if (stage.is_lost) {
      setLostModal({ dealId, stage });
      setLostReason('');
      return;
    }
    applyStageMove(dealId, stage, null);
  }

  function confirmLost() {
    if (!lostModal) return;
    applyStageMove(lostModal.dealId, lostModal.stage, lostReason.trim());
    setLostModal(null);
  }

  return (
    <>
      <div className="deals-kanban-toolbar">
        <div className="mc-client-search">
          <span dangerouslySetInnerHTML={{ __html: SEARCH_ICON }} />
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Пошук за назвою або клієнтом..." />
        </div>
        <Select
          className="dash-period-select" value={managerFilter} onChange={setManagerFilter}
          options={[{ value: '', label: 'Усі менеджери' }, ...managerOptions.map((m) => ({ value: m, label: m }))]}
        />
        <span className="sp" />
        <DealsFilterMenu
          managerOptions={managerOptions} managerFilter={managerFilter} onManagerChange={setManagerFilter}
          stages={stages} stageFilterIds={stageFilterIds} onStageToggle={toggleStageFilter}
          sourceOptions={sourceOptions} sourceFilter={sourceFilter} onSourceChange={setSourceFilter}
          smartFilter={smartFilter} onSmartChange={setSmartFilter}
          dateFrom={dateFrom} dateTo={dateTo} onDateFromChange={setDateFrom} onDateToChange={setDateTo}
          activeCount={activeFilterCount} onReset={resetAdvancedFilters}
        />
        <button type="button" className="btn" onClick={onManageStages}>Налаштувати етапи</button>
      </div>

      <div className="deals-board">
        {stages.map((stage) => (
          <div
            key={stage.id}
            className={'deals-column' + (dragOverStage === stage.id ? ' drag-over' : '')}
            style={{ '--stage-color': stage.color || '#7C3AED' }}
            onDragOver={(e) => { e.preventDefault(); setDragOverStage(stage.id); }}
            onDragLeave={() => setDragOverStage((cur) => (cur === stage.id ? null : cur))}
            onDrop={(e) => handleDrop(e, stage)}
          >
            <div className="deals-column-head">
              <span className="deals-column-label">
                <span className="deals-column-dot" style={{ background: stage.color || '#7C3AED' }} />
                {stage.label}
              </span>
              <span className="deals-column-count">{(byStage[stage.id] || []).length}</span>
            </div>
            <div className="deals-column-body">
              {(byStage[stage.id] || []).length === 0 && <div className="empty-hint">Немає угод</div>}
              {(byStage[stage.id] || []).map((deal) => (
                <DealCard
                  key={deal.id}
                  deal={deal}
                  draggable
                  onDragStart={(e) => e.dataTransfer.setData('text/plain', deal.id)}
                  onClick={onViewDeal}
                />
              ))}
            </div>
            <button type="button" className="wk-add-task-btn" onClick={() => onAddDeal(stage.id)}>+ Додати угоду</button>
          </div>
        ))}
      </div>

      {lostModal && (
        <div className="tmodal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setLostModal(null); }}>
          <div className="tmodal-box">
            <div className="tmodal-head">
              <h3>Причина програшу</h3>
              <button type="button" className="tmodal-close" onClick={() => setLostModal(null)} aria-label="Закрити">&times;</button>
            </div>
            <div className="tmodal-body">
              <label>Причина</label>
              <textarea value={lostReason} onChange={(e) => setLostReason(e.target.value)} placeholder="Вкажіть причину..." autoFocus />
              <div className="task-detail-inline-actions">
                <button type="button" className="btn" onClick={() => setLostModal(null)}>Назад</button>
                <button type="button" className="btn btn-p" onClick={confirmLost}>Підтвердити</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
