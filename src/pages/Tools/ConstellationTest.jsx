import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AGENT_DEPTS } from '../../data/aiAgentsData';
import ActionIcon from '../../components/common/ActionIcon';
import { AgentWindowTheme } from '../../components/AgentWorkspace/AgentWindowTheme';
import AiEnvironment from '../../components/AiEnvironment/AiEnvironment';
import KnowledgeBase from '../KnowledgeBase/KnowledgeBase';
import AdsInsightsAnalyst from '../AdsInsightsAnalyst/AdsInsightsAnalyst';
import DealHealthCheck from '../DealHealthCheck/DealHealthCheck';
import CoverLetterAgent from '../CoverLetterAgent/CoverLetterAgent';
import JobPostAnalyzer from '../JobPostAnalyzer/JobPostAnalyzer';
import DataIntegrityCheck from '../DataIntegrityCheck/DataIntegrityCheck';
import AccountEnrichment from '../AccountEnrichment/AccountEnrichment';
import CaseSelector from '../CaseSelector/CaseSelector';
import QualityController from '../QualityController/QualityController';
import TaskOrchestrator from '../TaskOrchestrator/TaskOrchestrator';
import GoogleOptimizationAgent from '../GoogleOptimizationAgent/GoogleOptimizationAgent';
import MarketingStrategist from '../MarketingStrategist/MarketingStrategist';
import AiAccountManager from '../AiAccountManager/AiAccountManager';
import LeadQualificationAgent from '../LeadQualificationAgent/LeadQualificationAgent';
import ReplyAnalyzer from '../ReplyAnalyzer/ReplyAnalyzer';
import PerformanceCopywriter from '../PerformanceCopywriter/PerformanceCopywriter';
import BusinessResearchAgent from '../BusinessResearchAgent/BusinessResearchAgent';
import CompetitorResearchAgent from '../CompetitorResearchAgent/CompetitorResearchAgent';
import AudienceResearchAgent from '../AudienceResearchAgent/AudienceResearchAgent';
import OnboardingMeetingCoordinator from '../OnboardingMeetingCoordinator/OnboardingMeetingCoordinator';
import ChiefOfStaff from '../ChiefOfStaff/ChiefOfStaff';
import AgentSpend from '../AgentSpend/AgentSpend';
import AgentInfoModal from '../../components/AgentWorkspace/AgentInfoModal';
import useProjectCockpit from '../../lib/useProjectCockpit';
import { updateCampaign } from '../../lib/api/campaigns';
import { ActiveProjectsCard, ProjectsPage } from './cockpit';
import useTeamProjects from '../../lib/useTeamProjects';
import { teamsLink } from '../../lib/agents/teamProjects';
import useAgentRunStates from './aiMap/useAgentRunStates';
import AgentMap3D from './aiMap/AgentMap3D';
import useMapTasks from './aiMap/useMapTasks';
import AgentsPanel from './aiMap/AgentsPanel';
import SystemState from './aiMap/SystemState';
import { fetchSystemState } from '../../lib/api/systemState';
import TaskFlowPanel from './aiMap/TaskFlowPanel';
import CampaignsSection from './campaigns/CampaignsSection';
import DeptAgentWindow from './agents/DeptAgentWindow';
import '../../styles/constellationTest.css';

// Agents with a real interactive tool (as opposed to the generic read-only
// info modal) register here by their aiAgentsData.js `tool` key — see
// `agentToolOpen` below. Next priority agents plug in the same way instead
// of hardcoding another agent key into the JSX.
const AGENT_TOOLS = {
  'ads-insights-chat': AdsInsightsAnalyst,
  'deal-health-check': DealHealthCheck,
  'cover-letter-agent': CoverLetterAgent,
  'job-post-analyzer': JobPostAnalyzer,
  'data-integrity-check': DataIntegrityCheck,
  'account-enrichment': AccountEnrichment,
  'portfolio-case-selector': CaseSelector,
  'ai-quality-controller': QualityController,
  'task-orchestrator': TaskOrchestrator,
  'google-optimization-agent': GoogleOptimizationAgent,
  'marketing-strategist': MarketingStrategist,
  'ai-account-manager': AiAccountManager,
  'lead-qualification-agent': LeadQualificationAgent,
  'reply-analyzer': ReplyAnalyzer,
  'performance-copywriter': PerformanceCopywriter,
  'business-research-agent': BusinessResearchAgent,
  'competitor-research-agent': CompetitorResearchAgent,
  'audience-research-agent': AudienceResearchAgent,
  'client-onboarding-meeting-coordinator': OnboardingMeetingCoordinator,
  'ai-chief-of-staff': ChiefOfStaff,
};

// AI Agents — a self-contained immersive system inside Hub: full-screen dark shell (no CRM sidebar / light toolbar), the floating section capsule, the 3D map of the team
// (aiMap/AgentMap3D.jsx: eight islands, a desk and a robot per agent of the real registry aiAgentsData.js) and the agent workspaces. The map is the only map: the old SVG
// constellation and the 3D city were removed (2026-11-10).

// Top-level views inside the AI Agents section, switched via its own
// horizontal nav — not routes, not sidebar entries. Per explicit direction:
// anything AI-agents-related stays inside this one section rather than
// spreading into the main CRM's sidebar/routing.
// Design decision 33: the map, the projects the agents work on, the campaigns, the money and the knowledge base (which opens over the page, it is not a section).
// the icons of the section menu (owner's pick 2026-11-10: glass ribbon, labels on all items, light line under the active one, icon in a ring medallion)
const SECTION_ICONS = {
  map: <><path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2zM9 4v14M15 6v14" /></>,
  projects: <><circle cx="9" cy="8" r="3.2" /><path d="M3 20c0-3.5 2.7-6 6-6s6 2.5 6 6M16 5a3 3 0 0 1 0 6M18 14c2 .8 3 2.6 3 5" /></>,
  campaigns: <><path d="M5 20V12M12 20V5M19 20v-6" /></>,
  spend: <><circle cx="12" cy="12" r="8.5" /><path d="M14.8 9.2c-.5-.8-1.5-1.2-2.8-1.2-1.7 0-2.8.8-2.8 2 0 3 5.8 1.2 5.8 4.2 0 1.2-1.2 2-3 2-1.3 0-2.4-.5-3-1.4M12 6.2V8M12 16v1.8" /></>,
  knowledge: <><rect x="5" y="8" width="14" height="11" rx="4" /><path d="M12 8V4M9 13h.01M15 13h.01" /></>,
};
const SECTIONS = [
  { key: 'map', label: 'Мапа' }, // the 3D map of the team (aiMap/AgentMap3D.jsx, scene in agentMap3d/)
  { key: 'projects', label: 'Проєкти' },
  { key: 'campaigns', label: 'Операції' },
  { key: 'spend', label: 'Витрати' },
  { key: 'knowledge', label: 'Інформаційна база' },
];

export default function ConstellationTest() {
  const [section, setSection] = useState('map');
  const [cockpitCollapsed, setCockpitCollapsed] = useState(false);
  // the lamp on the gear: is the system alive (the clock, the keys, the queue)? Asked on entering the section and every 5 minutes; locally there is no server, so no lamp
  const [health, setHealth] = useState(null); // 'ok' | 'warn' | 'bad' | null
  useEffect(() => {
    let alive = true;
    const ask = () => fetchSystemState().then((s) => { if (alive) setHealth(s?.status || null); }).catch(() => { if (alive) setHealth(null); });
    ask();
    const t = setInterval(ask, 5 * 60 * 1000);
    return () => { alive = false; clearInterval(t); };
  }, []);
  const [campaignTarget, setCampaignTarget] = useState(null); // { id, newRequest }: «Операції» opens on this campaign
  const cockpit = useProjectCockpit({ enabled: true });
  // the projects with launched AI teams (the page «Проєкти»): a click opens the card of the project in the CRM, the tab of the teams
  const navigate = useNavigate();
  const teamProjects = useTeamProjects(cockpit);
  const openProject = (projectId) => { if (projectId != null) navigate(teamsLink(projectId)); };
  const openOperationCard = (campaignId) => openProject(cockpit.byId[campaignId]?.projectId);
  const [mapFocus, setMapFocus] = useState(null); // { key, n }: the camera of the map flies to this department (the search box asks for it)
  const [agentsOpen, setAgentsOpen] = useState(false); // the list of all agents (the «Агенти» button of the map's side menu)
  const [selectedAgent, setSelectedAgent] = useState(null);
  const [coreOpen, setCoreOpen] = useState(false);
  const [agentToolOpen, setAgentToolOpen] = useState(null);
  const [deptAgent, setDeptAgent] = useState(null); // { role, legacyTool }: the page of an agent of a department (one worker with a queue of clients)
  // Set only by a handoff from another agent tool (§4.5 of the roadmap —
  // e.g. JobPostAnalyzer → CoverLetterAgent) — never by a normal map/
  // catalog/search open, which always starts an agent with a blank slate.
  const [agentToolPayload, setAgentToolPayload] = useState(null);

  // Agents with a real tool (AGENT_TOOLS) skip the generic read-only info
  // modal entirely and open straight into their own workspace — that
  // modal's content (badges/breaks-into/ladder/etc.) is still reachable
  // from inside the workspace itself via its own "?" button.
  function openAgent(agentWithContext) {
    if (agentWithContext.deptAgent) { setDeptAgent({ role: agentWithContext.deptAgent, legacyTool: AGENT_TOOLS[agentWithContext.tool] ? agentWithContext.tool : null }); return; }
    if (agentWithContext.tool === 'campaign-teams') { setSection('campaigns'); return; }
    if (AGENT_TOOLS[agentWithContext.tool]) { setAgentToolOpen(agentWithContext.tool); setAgentToolPayload(null); }
    else setSelectedAgent(agentWithContext);
  }

  // First event-triggered handoff between two agent tools (§4.5): one
  // agent's own result hands off straight into another agent's workspace,
  // pre-filled, instead of the human re-typing/re-pasting the same input.
  function handoffToAgentTool(toolKey, payload) {
    setAgentToolOpen(toolKey);
    setAgentToolPayload(payload || null);
  }

  // The narrow (phone) layout follows the size of the page.
  const pageRef = useRef(null);
  const [pageSize, setPageSize] = useState({ w: 1600, h: 1000 });
  useEffect(() => {
    const el = pageRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0) setPageSize({ w: width, h: height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const compact = pageSize.w < 760 || pageSize.w / pageSize.h < 1;

  // Flat, department-agnostic agent list for the search box and the catalog —
  // built once (AGENT_DEPTS is static data, not state). Each entry carries
  // the same deptKey/deptLabel/color/subcatLabel context openAgent()/the
  // agent modal already expect.
  const allAgents = useMemo(() => {
    const list = [];
    Object.entries(AGENT_DEPTS).forEach(([deptKey, dept]) => {
      (dept.subcategories || []).forEach((sc) => {
        sc.agents.forEach((ag) => {
          list.push({ ...ag, deptKey, deptLabel: dept.label, color: dept.color, subcatLabel: sc.label });
        });
      });
    });
    return list;
  }, []);
  const runStates = useAgentRunStates(allAgents);
  const mapTasks = useMapTasks(useMemo(() => allAgents.map((x) => x.key), [allAgents])); // the carriers of the 3D map: the open work of the agents
  const [carId, setCarId] = useState(null); // the car chosen in «Рух задач» (a click on the map or in the list)
  const shownTasks = useMemo(() => mapTasks.map((t) => (t.id === carId ? { ...t, selected: true } : t)), [mapTasks, carId]);

  const [agentSearch, setAgentSearch] = useState('');
  // Separate from whether there's query text — lets a click outside the
  // search box collapse the results panel while leaving whatever was typed.
  const [searchOpen, setSearchOpen] = useState(false);
  const searchRef = useRef(null);
  const [searchExpanded, setSearchExpanded] = useState(false); // the search is an icon in the tools ribbon that opens into a field (owner's pick 2026-11-10)
  const searchInputRef = useRef(null);
  useEffect(() => { if (searchExpanded) searchInputRef.current?.focus(); }, [searchExpanded]);
  useEffect(() => {
    if (!searchExpanded) return undefined;
    function onDown(e) { if (searchRef.current && !searchRef.current.contains(e.target) && !agentSearch.trim()) setSearchExpanded(false); }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [searchExpanded, agentSearch]);
  useEffect(() => {
    if (!searchOpen) return undefined;
    function onDocClick(e) {
      if (searchRef.current && !searchRef.current.contains(e.target)) setSearchOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [searchOpen]);
  const searchResults = useMemo(() => {
    const q = agentSearch.trim().toLowerCase();
    if (!q) return [];
    return allAgents.filter((a) => a.name.toLowerCase().includes(q)).slice(0, 8);
  }, [agentSearch, allAgents]);
  // Flies the camera to the agent's department and opens the same modal/workspace a normal click would.
  function selectSearchResult(agent) {
    setSearchOpen(false); setSearchExpanded(false);
    setSection('map');
    setMapFocus({ key: agent.deptKey, n: Date.now() });
    openAgent(agent);
    setAgentSearch('');
  }

  // Escape backs out one layer at a time: closes an open agent/core modal first.
  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key !== 'Escape') return;
      if (agentToolOpen) { setAgentToolOpen(null); setAgentToolPayload(null); return; }
      if (selectedAgent) { setSelectedAgent(null); return; }
      if (coreOpen) { setCoreOpen(false); return; }
      if (agentsOpen) setAgentsOpen(false);
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedAgent, coreOpen, agentToolOpen, agentsOpen]);

  const [motion, setMotion] = useState(() => !window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const on = () => setMotion(!mq.matches);
    mq.addEventListener?.('change', on);
    return () => mq.removeEventListener?.('change', on);
  }, []);

  const calm = section !== 'map' || !!agentToolOpen || !!selectedAgent || coreOpen;
  const showMapChrome = section === 'map';
  const windowTheme = useMemo(() => ({ night: !(section === 'map' && !compact) }), [section, compact]); // the agent windows follow the page: light over the map, dark plum in the other sections

  return (
    <AgentWindowTheme.Provider value={windowTheme}>
    <div ref={pageRef} className={'constellation-page ai-immersive' + (calm ? ' is-calm' : '') + (motion ? '' : ' is-still') + (compact ? ' is-compact' : '')}>
      {section !== 'map' && <AiEnvironment calm={calm} />}

      <header className="ai-brand" data-ai-safe>
        <img className="ai-brand-logo" src={`${import.meta.env.BASE_URL}ai-world/logo/emblem.svg`} alt="" />
        <div className="ai-brand-text">
          <h1>AI Agents</h1>
          <span>Monarchi Hub</span>
        </div>
      </header>

      {/* This section's own horizontal nav — everything AI-agents-related is
          switched here, inside the section itself, rather than as separate
          CRM sidebar entries/routes. */}
      <div className="constellation-section-nav" role="tablist" aria-label="Розділи AI Agents" data-ai-safe>
        {SECTIONS.map((s) => (
          <button
            key={s.key} type="button" role="tab" aria-selected={section === s.key}
            className={'constellation-section-tab' + (section === s.key ? ' active' : '')}
            onClick={() => (s.key === 'knowledge' ? setCoreOpen(true) : setSection(s.key))}
          >
            <span className="cst-ico" aria-hidden="true"><svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{SECTION_ICONS[s.key]}</svg></span>
            <span className="cst-lab">{s.label}</span>
            {s.key === 'projects' && cockpit.waitingTotal > 0 && (
              <span className="constellation-section-tab-badge">{cockpit.waitingTotal} чекають</span>
            )}
          </button>
        ))}
      </div>

      {/* the tools ribbon (owner's pick 2026-11-10): one glass pill with the search (an icon that opens into a field), the settings medallion and the round «До Hub» */}
      <div className="constellation-tools" data-ai-safe>
        {showMapChrome && (
          <>
            <div className={'agent-search' + (searchExpanded ? ' is-open' : '')} ref={searchRef}>
              {searchExpanded ? (
                <label className="agent-search-field">
                  <ActionIcon name="search" size={18} className="agent-search-icon" />
                  <input
                    ref={searchInputRef} type="text" className="agent-search-input" placeholder="Пошук агента…" aria-label="Пошук агента"
                    value={agentSearch}
                    onChange={(e) => { setAgentSearch(e.target.value); setSearchOpen(true); }}
                    onFocus={() => setSearchOpen(true)}
                    onKeyDown={(e) => { if (e.key === 'Escape') { setAgentSearch(''); setSearchOpen(false); setSearchExpanded(false); } }}
                  />
                </label>
              ) : (
                <button type="button" className="cst-tool" aria-label="Пошук агента" title="Пошук агента" onClick={() => setSearchExpanded(true)}>
                  <ActionIcon name="search" size={20} />
                </button>
              )}
              {searchExpanded && searchOpen && agentSearch.trim() && (
                <div className="agent-search-results ai-panel">
                  {searchResults.length > 0 ? searchResults.map((r) => (
                    <button key={r.key} type="button" className="agent-search-result" onClick={() => selectSearchResult(r)}>
                      <span className="agent-search-result-dot" />
                      <span className="agent-search-result-text">
                        <span className="agent-search-result-name">{r.name}</span>
                        <span className="agent-search-result-dept">{r.deptLabel}</span>
                      </span>
                    </button>
                  )) : (
                    <div className="agent-search-empty">Нічого не знайдено</div>
                  )}
                </div>
              )}
            </div>
            <span className="cst-sep" aria-hidden="true" />
          </>
        )}
        <button type="button" className={'cst-tool cst-gear' + (section === 'system' ? ' active' : '')} onClick={() => setSection(section === 'system' ? 'map' : 'system')} aria-label={health === 'bad' ? 'Стан системи: є проблема' : health === 'warn' ? 'Стан системи: є що перевірити' : 'Стан системи'} aria-pressed={section === 'system'} title={health === 'bad' ? 'Стан системи: є проблема' : health === 'warn' ? 'Стан системи: є що перевірити' : 'Стан системи'}>
        {(health === 'bad' || health === 'warn') && <i className={'constellation-gear-lamp is-' + health} aria-hidden="true" />}
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></svg>
        </button>
        <span className="cst-sep" aria-hidden="true" />
        <Link to="/" className="cst-hub" aria-label="До Hub" title="До Hub">
          <svg className="constellation-exit-icon" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12H3l9-9 9 9h-2" /><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7" /><path d="M9 21v-6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v6" /></svg>
        </Link>
      </div>

      {section === 'projects' && <ProjectsPage rows={teamProjects.rows} loading={teamProjects.loading || cockpit.loading} onOpen={(row) => openProject(row.id)} />}
      {section === 'campaigns' && <CampaignsSection key={campaignTarget ? `c${campaignTarget.id ?? 'p' + campaignTarget.startProjectId}` : 'all'} openCampaignId={campaignTarget?.id ?? null} openNewRequest={!!campaignTarget?.newRequest} startProjectId={campaignTarget?.startProjectId ?? null} cockpit={cockpit}
        onOpenProject={(projectId) => openProject(projectId)} />}
      {section === 'spend' && <AgentSpend onOpenCampaign={(id) => { setCampaignTarget({ id }); setSection('campaigns'); }} />}
      {section === 'system' && <SystemState />}
      {section === 'map' && (
        <AgentMap3D
          agentDepts={AGENT_DEPTS} runStates={runStates} tasks={shownTasks} focus={mapFocus}
          onOpenTask={(task) => setCarId(task.id)}
          onOpenAgent={(deptKey, agentKey) => { const a = allAgents.find((x) => x.key === agentKey); if (a) openAgent(a); }}
          onMenu={(key) => { if (key === 'agents') setAgentsOpen((v) => !v); else if (key === 'reports') setSection('spend'); else if (key === 'teams') setSection('campaigns'); else if (key === 'people') setSection('projects'); else if (key === 'settings') setSection('system'); }}
        />
      )}

      <div className="ai-flow">

      {section === 'map' && (
        <ActiveProjectsCard projects={cockpit.list} loading={cockpit.loading} collapsed={cockpitCollapsed} onToggle={() => setCockpitCollapsed((v) => !v)} onOpen={openOperationCard} onOpenAll={() => setSection('projects')} />
      )}
      {section === 'map' && (
        <TaskFlowPanel
          tasks={mapTasks} selectedId={carId} onSelect={setCarId}
          onFocus={(agentKey) => { const a = allAgents.find((x) => x.key === agentKey); if (a) setMapFocus({ key: a.deptKey, n: Date.now() }); }}
          onOpenOperation={openOperationCard}
        />
      )}
      {section === 'map' && agentsOpen && (
        <AgentsPanel agentDepts={AGENT_DEPTS} runStates={runStates} onClose={() => setAgentsOpen(false)} onOpen={(a) => { setAgentsOpen(false); openAgent(a); }} />
      )}
      </div>

      {/* Knowledge Base / an agent's own workspace / the read-only agent
          info modal all render regardless of `section` — opening one from
          the Агенти catalog (or anywhere else) must work the same as
          opening it from the map itself. */}
      {coreOpen && <KnowledgeBase onClose={() => setCoreOpen(false)} />}

      {deptAgent && <DeptAgentWindow role={deptAgent.role} onClose={() => setDeptAgent(null)} onOpenLegacy={deptAgent.legacyTool ? () => { const tool = deptAgent.legacyTool; setDeptAgent(null); setAgentToolOpen(tool); setAgentToolPayload(null); } : null} />}
      {agentToolOpen && AGENT_TOOLS[agentToolOpen] && (() => {
        const AgentTool = AGENT_TOOLS[agentToolOpen];
        return (
          <AgentTool
            onClose={() => { setAgentToolOpen(null); setAgentToolPayload(null); }}
            initialPayload={agentToolPayload}
            onHandoff={handoffToAgentTool}
          />
        );
      })()}

      {selectedAgent && <AgentInfoModal agent={selectedAgent} onClose={() => setSelectedAgent(null)} />}
    </div>
    </AgentWindowTheme.Provider>
  );
}

