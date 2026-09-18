import { useEffect, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { fetchDeals, fetchAllDeals } from '../../../lib/api/deals';
import { fetchDealStages } from '../../../lib/api/dealStages';
import { fetchPipelines } from '../../../lib/api/pipelines';
import { fetchAllProfiles, profileLabel } from '../../../lib/api/profile';
import { FIELD_ICONS } from '../../../lib/taskFieldIcons';
import Select from '../../../components/common/Select';
import AddDealModal from '../../../components/Deals/AddDealModal';
import DealDetailModal from '../../../components/Deals/DealDetailModal';
import StageManagerModal from '../../../components/Deals/StageManagerModal';
import PipelineManagerModal from '../../../components/Deals/PipelineManagerModal';
import ImportDealsModal from '../../../components/Deals/ImportDealsModal';
import ImportNetHuntDealsModal from '../../../components/Deals/ImportNetHuntDealsModal';
import DealsKanbanTab from './DealsKanbanTab';
import DealsOverviewTab from './DealsOverviewTab';
import DealsListTab from './DealsListTab';
import DealsAnalyticsTab from './DealsAnalyticsTab';
import '../../../styles/reportPage.css';
import '../../../styles/automationTasksPage.css';
import '../../../styles/automationDashboard.css';
import '../../../styles/comparePage.css';
import '../../../styles/clientsDirectory.css';
import '../../../styles/dealsBoard.css';

const TABS = [
  { key: 'kanban', label: 'Канбан', icon: FIELD_ICONS.kanban },
  { key: 'list', label: 'Список', icon: FIELD_ICONS.list },
  { key: 'archive', label: 'Архів', icon: FIELD_ICONS.archive },
  { key: 'overview', label: 'Огляд', icon: FIELD_ICONS.barChart },
];

export default function DealsBoard() {
  const navigate = useNavigate();
  const [tab, setTab] = useState('kanban');
  const [pipelines, setPipelines] = useState([]);
  const [pipelineId, setPipelineId] = useState(null);
  const [deals, setDeals] = useState([]);
  const [stages, setStages] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [addModalStageId, setAddModalStageId] = useState(null);
  const [stageManagerOpen, setStageManagerOpen] = useState(false);
  const [pipelineManagerOpen, setPipelineManagerOpen] = useState(false);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [netHuntImportOpen, setNetHuntImportOpen] = useState(false);
  const [viewDeal, setViewDeal] = useState(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();

  function reload() {
    if (!pipelineId) return;
    setLoading(true);
    Promise.all([fetchDeals(pipelineId), fetchDealStages(pipelineId)])
      .then(([d, s]) => { setDeals(d); setStages(s); })
      .finally(() => setLoading(false));
  }

  function reloadPipelines() {
    return fetchPipelines().then((rows) => {
      setPipelines(rows);
      setPipelineId((cur) => (rows.some((p) => p.id === cur) ? cur : (rows[0]?.id || null)));
    });
  }

  useEffect(() => {
    reloadPipelines();
    fetchAllProfiles().then((rows) => setProfiles(rows.map((p) => ({ email: p.email, label: profileLabel(p) }))));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pipelineId]);

  // Deep link from a notification (`/reports/deals?open=<dealId>`) — deals
  // are otherwise only ever opened through local `viewDeal` state, so a
  // notification click needs to fetch the target deal (possibly in a
  // different pipeline than the one currently selected) and open it.
  useEffect(() => {
    const openId = searchParams.get('open');
    if (!openId) return;
    fetchAllDeals().then((all) => {
      const found = all.find((d) => String(d.id) === String(openId));
      if (found) {
        setPipelineId(found.pipeline_id);
        setViewDeal(found);
      }
    });
    setSearchParams((sp) => { sp.delete('open'); return sp; }, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Clicking "Угоди" in the sidebar/topbar while a deal is already open
  // navigates to the same /reports/deals path — React Router still pushes a
  // new history entry (a fresh `location.key`) for that, but since it's the
  // same route this component isn't remounted, so nothing else here would
  // otherwise notice the click and clear `viewDeal` back to the board.
  useEffect(() => {
    setViewDeal(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.key]);

  function openAddDeal(stageId) {
    setAddModalStageId(stageId || null);
    setAddModalOpen(true);
  }

  if (viewDeal) {
    return (
      <DealDetailModal
        deal={deals.find((d) => d.id === viewDeal.id) || viewDeal}
        stages={stages}
        profiles={profiles}
        onClose={() => setViewDeal(null)}
        onChanged={reload}
      />
    );
  }

  return (
    <div className="report-page deals-page">
      <section className="rpt-hero deals-actions-row">
        <div className="deals-header-actions">
          <div className="pipeline-switcher">
            <span className="pipeline-switcher-icon" dangerouslySetInnerHTML={{ __html: FIELD_ICONS.pipeline }} />
            <span className="pipeline-switcher-label">Обрати Pipeline</span>
            <span className="pipeline-switcher-dot" style={{ background: pipelines.find((p) => p.id === pipelineId)?.color || '#7C3AED' }} />
            <Select
              bare className="dash-period-select" value={pipelineId || ''} onChange={(v) => setPipelineId(Number(v))}
              options={pipelines.map((p) => ({ value: p.id, label: p.name }))}
            />
          </div>
          <button type="button" className="btn" onClick={() => setPipelineManagerOpen(true)}>
            <span dangerouslySetInnerHTML={{ __html: FIELD_ICONS.settings }} /> Керувати Pipeline
          </button>
          <button type="button" className="btn" onClick={() => navigate('/reports/deal-tasks')}>
            <span dangerouslySetInnerHTML={{ __html: FIELD_ICONS.checklist }} /> Задачі
          </button>
          <button type="button" className="btn" onClick={() => setImportModalOpen(true)}>
            <span dangerouslySetInnerHTML={{ __html: FIELD_ICONS.upload }} /> Імпорт
          </button>
          <button type="button" className="btn" onClick={() => setNetHuntImportOpen(true)}>
            <span dangerouslySetInnerHTML={{ __html: FIELD_ICONS.upload }} /> Імпорт з NetHunt
          </button>
          <button type="button" className="btn btn-p deals-add-btn" onClick={() => openAddDeal(null)}>
            <span dangerouslySetInnerHTML={{ __html: FIELD_ICONS.plus }} /> Додати угоду
          </button>
        </div>
      </section>

      <div className="chan-tabs deals-tabs">
        {TABS.map((t) => (
          <button key={t.key} type="button" className={'chan-tab' + (tab === t.key ? ' active' : '')} onClick={() => setTab(t.key)}>
            <span dangerouslySetInnerHTML={{ __html: t.icon }} />
            {t.label}
          </button>
        ))}
      </div>

      {loading || !pipelineId ? (
        <div className="empty-hint">Завантаження...</div>
      ) : tab === 'overview' ? (
        <>
          <DealsOverviewTab deals={deals} stages={stages} profiles={profiles} reload={reload} onViewDeal={setViewDeal} />
          <DealsAnalyticsTab deals={deals} stages={stages} />
        </>
      ) : tab === 'kanban' ? (
        <DealsKanbanTab
          deals={deals} stages={stages} profiles={profiles} reload={reload}
          onAddDeal={openAddDeal} onManageStages={() => setStageManagerOpen(true)} onViewDeal={setViewDeal}
        />
      ) : tab === 'list' ? (
        <DealsListTab deals={deals} stages={stages} profiles={profiles} reload={reload} onViewDeal={setViewDeal} />
      ) : (
        <DealsListTab deals={deals} stages={stages} profiles={profiles} reload={reload} onViewDeal={setViewDeal} mode="archive" />
      )}

      {addModalOpen && (
        <AddDealModal
          pipelines={pipelines}
          defaultPipelineId={pipelineId}
          defaultStageId={addModalStageId}
          profiles={profiles}
          onClose={() => setAddModalOpen(false)}
          onCreated={reload}
        />
      )}

      {stageManagerOpen && pipelineId && (
        <StageManagerModal
          pipelineId={pipelineId}
          pipelineName={pipelines.find((p) => p.id === pipelineId)?.name}
          stages={stages}
          onClose={() => setStageManagerOpen(false)}
          onChanged={async () => reload()}
        />
      )}

      {pipelineManagerOpen && (
        <PipelineManagerModal
          pipelines={pipelines}
          onClose={() => setPipelineManagerOpen(false)}
          onChanged={reloadPipelines}
        />
      )}

      {importModalOpen && (
        <ImportDealsModal
          pipelines={pipelines}
          defaultPipelineId={pipelineId}
          profiles={profiles}
          onClose={() => setImportModalOpen(false)}
          onImported={reload}
        />
      )}

      {netHuntImportOpen && (
        <ImportNetHuntDealsModal
          pipelines={pipelines}
          onClose={() => setNetHuntImportOpen(false)}
          onImported={reload}
        />
      )}
    </div>
  );
}
