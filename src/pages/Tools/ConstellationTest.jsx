import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AGENT_DEPTS } from '../../data/aiAgentsData';
import { AI_ASSETS, AI_PAGE_ICON } from '../../lib/aiAgentsAssets';
import ActionIcon from '../../components/common/ActionIcon';
import AiEnvironment from '../../components/AiEnvironment/AiEnvironment';
import KnowledgeBase from '../KnowledgeBase/KnowledgeBase';
import { BOOK_ICON } from '../KnowledgeBase/KnowledgeOrb';
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
import AiAgentActivity from '../AiAgentActivity/AiAgentActivity';
import AgentCatalog from '../AgentCatalog/AgentCatalog';
import AgentAnalytics from '../AgentAnalytics/AgentAnalytics';
import AgentSpend from '../AgentSpend/AgentSpend';
import AgentInfoModal from '../../components/AgentWorkspace/AgentInfoModal';
import { useAgentReviewCount } from '../../lib/useAgentReviewCount';
import DeptChartView from './aiMap/DeptChartView';
import FocusedGraph from './aiMap/FocusedGraph';
import OverviewMap, { AiSvgDefs } from './aiMap/OverviewMap';
import { UI_SCALE, VIEWBOX_HALF, calculateDepartmentGraphLayout, findAgent } from './aiMap/graphLayout';
import {
  FONT_SAT, buildOverview, makeDims, pluralAgents, ringGeometry,
} from './aiMap/overviewLayout';
import { STATUS_TEXT, countStatuses } from './aiMap/status';
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

// AI Agents — a self-contained immersive system inside Hub: full-screen dark
// shell (no CRM sidebar / light toolbar), floating section capsule, radial
// map of the real departments + agents (aiAgentsData.js), nested department
// focus (MAP / CHART / previous-next) and agent workspaces. Visual design:
// "update ai agents" kit (approved-reference.png). The map is live SVG, never
// an image; the background/core are decoration only.

// Top-level views inside the AI Agents section, switched via its own
// horizontal nav — not routes, not sidebar entries. Per explicit direction:
// anything AI-agents-related stays inside this one section rather than
// spreading into the main CRM's sidebar/routing.
const SECTIONS = [
  { key: 'map', label: 'Мапа' },
  { key: 'agents', label: 'Агенти' },
  { key: 'activity', label: 'Задачі агентів' },
  { key: 'analytics', label: 'Аналітика' },
  { key: 'spend', label: 'Витрати' },
];

const WHATS_NEW_SEEN_KEY = 'aiAgentsWhatsNewSeenAt';

function newAgentsWord(n) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return 'новий або оновлений агент';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return 'нові або оновлені агенти';
  return 'нових або оновлених агентів';
}

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

export default function ConstellationTest() {
  const [section, setSection] = useState('map');
  const agentReviewCount = useAgentReviewCount();
  const [focusedDept, setFocusedDept] = useState(null);
  const [hoveredDept, setHoveredDept] = useState(null);
  const [selectedAgent, setSelectedAgent] = useState(null);
  const [coreOpen, setCoreOpen] = useState(false);
  const [agentToolOpen, setAgentToolOpen] = useState(null);
  // Set only by a handoff from another agent tool (§4.5 of the roadmap —
  // e.g. JobPostAnalyzer → CoverLetterAgent) — never by a normal map/
  // catalog/search open, which always starts an agent with a blank slate.
  const [agentToolPayload, setAgentToolPayload] = useState(null);

  // Agents with a real tool (AGENT_TOOLS) skip the generic read-only info
  // modal entirely and open straight into their own workspace — that
  // modal's content (badges/breaks-into/ladder/etc.) is still reachable
  // from inside the workspace itself via its own "?" button.
  function openAgent(agentWithContext) {
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

  const [deptPanelClosed, setDeptPanelClosed] = useState(false);
  const [viewMode, setViewMode] = useState('map');

  // Stage size drives the viewBox aspect, the compact (phone/narrow) layout
  // and the minimum readable label size.
  const stageRef = useRef(null);
  const pageRef = useRef(null);
  const [stageSize, setStageSize] = useState({ w: 1600, h: 1000 });
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
  useEffect(() => {
    const el = stageRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0) setStageSize({ w: width, h: height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [section]);

  const aspect = clamp(stageSize.w / stageSize.h, 0.35, 2.4);
  const compact = pageSize.w < 760 || pageSize.w / pageSize.h < 1;
  const graphHalfW = VIEWBOX_HALF * aspect;
  const graphHalfH = VIEWBOX_HALF;
  // 1 viewBox unit = this many CSS px; labels never drop below ~11.5px.
  // On shorter windows the whole ring is scaled down just enough that the
  // top and bottom labels clear the header capsule and the footer pill
  // (their size is fixed in px, the map scales with the window height).
  const fit = compact ? 1 : clamp(Math.min((0.5 * stageSize.h - 70) / (0.434 * stageSize.h), (0.5 * stageSize.h - 80) / (0.409 * stageSize.h)), 0.62, 1);
  const pxPerUnit = (stageSize.h / (VIEWBOX_HALF * 2)) * fit;
  const fontScale = compact ? 1 : clamp(11.5 / (FONT_SAT * pxPerUnit), 1, 1.5);
  const upx = (VIEWBOX_HALF * 2) / stageSize.h; // viewBox units per CSS px

  const deptKeys = Object.keys(AGENT_DEPTS);

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
  const counts = useMemo(() => countStatuses(allAgents), [allAgents]);

  // §4.8 "what's new" (docs/ai-agents-roadmap.md) — surfaces agents whose
  // statusChangedAt is newer than the last time this viewer dismissed the
  // banner. Per-viewer convenience state only, so localStorage is right.
  const [whatsNewSeenAt, setWhatsNewSeenAt] = useState(() => {
    try { return localStorage.getItem(WHATS_NEW_SEEN_KEY); } catch { return null; }
  });
  const [whatsNewExpanded, setWhatsNewExpanded] = useState(false);
  const recentlyChangedAgents = useMemo(() => (
    allAgents
      .filter((a) => a.statusChangedAt && (!whatsNewSeenAt || a.statusChangedAt > whatsNewSeenAt))
      .sort((a, b) => (b.statusChangedAt || '').localeCompare(a.statusChangedAt || ''))
  ), [allAgents, whatsNewSeenAt]);
  function dismissWhatsNew() {
    const now = new Date().toISOString().slice(0, 10);
    try { localStorage.setItem(WHATS_NEW_SEEN_KEY, now); } catch { /* per-viewer convenience only, fine if it fails */ }
    setWhatsNewSeenAt(now);
    setWhatsNewExpanded(false);
  }

  const [agentSearch, setAgentSearch] = useState('');
  // Separate from whether there's query text — lets a click outside the
  // search box collapse the results panel while leaving whatever was typed.
  const [searchOpen, setSearchOpen] = useState(false);
  const searchRef = useRef(null);
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
  // Jumps straight to the agent's department (only if it isn't already the
  // focused one) and opens the same modal/workspace a normal click would.
  function selectSearchResult(agent) {
    setSearchOpen(false);
    if (focusedDept !== agent.deptKey) setFocusedDept(agent.deptKey);
    openAgent(agent);
    setAgentSearch('');
  }

  // Re-show the department overview panel every time a (different)
  // department comes into focus — closing it is per-visit, not permanent.
  // CHART is per-visit too: entering a department always starts on MAP.
  useEffect(() => { setDeptPanelClosed(false); setViewMode('map'); }, [focusedDept]);

  const dims = useMemo(() => makeDims(compact, upx, stageSize.w), [compact, upx, stageSize.w]);
  const ring = useMemo(
    () => ringGeometry(graphHalfW, graphHalfH, compact, { upx, stageW: stageSize.w, stageH: stageSize.h }),
    [graphHalfW, graphHalfH, compact, upx, stageSize.w, stageSize.h],
  );
  const nodes = useMemo(() => buildOverview(deptKeys, AGENT_DEPTS, ring, compact, dims), [deptKeys.join('|'), ring, compact, dims]); // eslint-disable-line react-hooks/exhaustive-deps

  // The Department → Function → Agent graph for whichever department is
  // currently focused — recomputed when the focus changes or the stage resizes.
  const focusedGraph = useMemo(() => {
    if (!focusedDept) return null;
    const dept = AGENT_DEPTS[focusedDept];
    if (!dept) return null;
    return calculateDepartmentGraphLayout(dept, graphHalfW, graphHalfH);
  }, [focusedDept, graphHalfW, graphHalfH]);

  const focused = focusedDept && AGENT_DEPTS[focusedDept] ? { key: focusedDept, dept: AGENT_DEPTS[focusedDept] } : null;

  function focusDept(key) {
    setFocusedDept((cur) => (cur === key ? null : key));
    // The focused node leaves the overview without the pointer ever leaving
    // it, so its own mouseleave never fires — clear hover explicitly.
    setHoveredDept(null);
  }
  function resetView() {
    setFocusedDept(null);
    setHoveredDept(null);
  }
  function cycleDept(dir) {
    if (!focusedDept) return;
    const idx = deptKeys.indexOf(focusedDept);
    setFocusedDept(deptKeys[(idx + dir + deptKeys.length) % deptKeys.length]);
    setHoveredDept(null);
  }

  // Mouse wheel cycles departments while one is focused — same action as the
  // previous/next buttons. Throttled so one trackpad flick doesn't skip
  // several departments, and ignored over scrollable panels.
  const wheelCooldownRef = useRef(0);
  useEffect(() => {
    if (!focusedDept || selectedAgent || coreOpen || agentToolOpen || compact) return undefined;
    function handleWheel(e) {
      if (e.target.closest('.chart-view, .dept-panel, .ai-section, [role="dialog"]')) return;
      e.preventDefault();
      const now = Date.now();
      if (now - wheelCooldownRef.current < 450 || Math.abs(e.deltaY) < 8) return;
      wheelCooldownRef.current = now;
      cycleDept(e.deltaY > 0 ? 1 : -1);
    }
    window.addEventListener('wheel', handleWheel, { passive: false });
    return () => window.removeEventListener('wheel', handleWheel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusedDept, selectedAgent, coreOpen, agentToolOpen, compact]);

  // Escape backs out one layer at a time: closes an open agent/core modal
  // first, otherwise returns from a focused department to the overview.
  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key !== 'Escape') return;
      if (agentToolOpen) { setAgentToolOpen(null); setAgentToolPayload(null); return; }
      if (selectedAgent) { setSelectedAgent(null); return; }
      if (coreOpen) { setCoreOpen(false); return; }
      if (focusedDept) resetView();
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedAgent, coreOpen, agentToolOpen, focusedDept]);

  // Animations pause with the tab / screen position (SMIL lights + pulses),
  // and the whole scene is quieter while a form or another section is open.
  const svgRef = useRef(null);
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg || !svg.pauseAnimations) return undefined;
    let offscreen = false;
    const sync = () => { if (document.hidden || offscreen) svg.pauseAnimations(); else svg.unpauseAnimations(); };
    const io = new IntersectionObserver(([e]) => { offscreen = !e.isIntersecting; sync(); });
    io.observe(svg);
    document.addEventListener('visibilitychange', sync);
    return () => { io.disconnect(); document.removeEventListener('visibilitychange', sync); };
  }, [section]);

  const [motion, setMotion] = useState(() => !window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const on = () => setMotion(!mq.matches);
    mq.addEventListener?.('change', on);
    return () => mq.removeEventListener?.('change', on);
  }, []);

  const calm = section !== 'map' || !!agentToolOpen || !!selectedAgent || coreOpen;
  const selectedAgentKey = selectedAgent?.key || null;
  const showMapChrome = section === 'map';

  return (
    <div ref={pageRef} className={'constellation-page ai-immersive' + (calm ? ' is-calm' : '') + (motion ? '' : ' is-still') + (compact ? ' is-compact' : '')} style={{ '--ui-scale': UI_SCALE }}>
      <AiEnvironment calm={calm} />

      <header className="ai-brand" data-ai-safe>
        <img className="ai-brand-icon" src={AI_PAGE_ICON} alt="" />
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
            onClick={() => setSection(s.key)}
          >
            {s.label}
            {s.key === 'activity' && agentReviewCount > 0 && (
              <span className="constellation-section-tab-badge">{agentReviewCount}</span>
            )}
          </button>
        ))}
      </div>

      <Link to="/" className="constellation-exit ai-pill" data-ai-safe>
        <ActionIcon name="back" size={18} />
        <span>До Hub</span>
      </Link>

      {section === 'agents' && <AgentCatalog agents={allAgents} onSelectAgent={openAgent} />}
      {section === 'analytics' && <AgentAnalytics agents={allAgents} />}
      {section === 'activity' && <AiAgentActivity />}
      {section === 'spend' && <AgentSpend />}

      <div className="ai-flow">
      {showMapChrome && (
        <div className="agent-search ai-pill" ref={searchRef} data-ai-safe>
          <ActionIcon name="search" size={20} className="agent-search-icon" />
          <input
            type="text" className="agent-search-input" placeholder="Пошук агента…" aria-label="Пошук агента"
            value={agentSearch}
            onChange={(e) => { setAgentSearch(e.target.value); setSearchOpen(true); }}
            onFocus={() => setSearchOpen(true)}
          />
          {searchOpen && agentSearch.trim() && (
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
      )}

      {showMapChrome && !focused && recentlyChangedAgents.length > 0 && (
        <div className="whats-new-banner" data-ai-safe>
          <button type="button" className="whats-new-summary ai-pill" onClick={() => setWhatsNewExpanded((v) => !v)} aria-expanded={whatsNewExpanded}>
            <span className="whats-new-dot-live" aria-hidden="true" />
            <span className="whats-new-text">{recentlyChangedAgents.length} {newAgentsWord(recentlyChangedAgents.length)}</span>
            <ActionIcon name="chevron" size={14} className={'whats-new-chevron' + (whatsNewExpanded ? ' open' : '')} />
          </button>
          {whatsNewExpanded && (
            <div className="whats-new-list ai-panel">
              <button type="button" className="whats-new-dismiss" onClick={dismissWhatsNew}>Приховати</button>
              {recentlyChangedAgents.map((a) => (
                <button key={a.key} type="button" className="whats-new-item" onClick={() => openAgent(a)}>
                  <span className="whats-new-dot" />
                  <span className="whats-new-name">{a.name}</span>
                  <span className="whats-new-date">{a.statusChangedAt}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {section === 'map' && (
        <>
          {focused && (
            <div className="constellation-overlay" data-ai-safe>
              <button type="button" className="constellation-reset ai-pill" onClick={resetView}>
                <ActionIcon name="back" size={16} />Всі відділи
              </button>
            </div>
          )}

          {focused && !focused.dept.comingSoon && (
            <div className="view-tabs" role="tablist" aria-label="Вигляд відділу" data-ai-safe>
              <button type="button" role="tab" aria-selected={viewMode === 'map'} className={'view-tab' + (viewMode === 'map' ? ' active' : '')} onClick={() => setViewMode('map')}>MAP</button>
              <button type="button" role="tab" aria-selected={viewMode === 'chart'} className={'view-tab' + (viewMode === 'chart' ? ' active' : '')} onClick={() => setViewMode('chart')}>CHART</button>
            </div>
          )}

          {focused && (
            <div className="constellation-carousel" data-ai-safe>
              <button type="button" aria-label="Попередній відділ" onClick={() => cycleDept(-1)}>
                <ActionIcon name="chevron" size={22} className="chev-prev" />
              </button>
              <div className="constellation-carousel-info">
                <div className="constellation-carousel-name">{focused.dept.label}</div>
              </div>
              <button type="button" aria-label="Наступний відділ" onClick={() => cycleDept(1)}>
                <ActionIcon name="chevron" size={22} />
              </button>
            </div>
          )}

          {focused && viewMode === 'map' && !deptPanelClosed && (() => {
            const dept = focused.dept;
            if (dept.comingSoon) {
              return (
                <div className="dept-panel ai-panel dept-panel-soon" data-ai-safe>
                  <button type="button" className="dept-panel-close" aria-label="Закрити панель відділу" onClick={() => setDeptPanelClosed(true)}><ActionIcon name="close" size={18} /></button>
                  <div className="dept-panel-eyebrow">Відділ · СКОРО</div>
                  <h2>{dept.label}</h2>
                  <div className="dept-panel-subtitle">{dept.subtitle}</div>
                  {dept.comingSoonNote && <p className="dept-panel-narrative">{dept.comingSoonNote}</p>}
                  <div className="dept-panel-soon-note">Узгоджено з командою як частина цільової карти відділів. Реалізація ще не почалась.</div>
                </div>
              );
            }

            const totalAgents = dept.subcategories.reduce((sum, sc) => sum + sc.agents.length, 0);
            const startHereAgent = dept.startHere ? findAgent(dept, dept.startHere) : null;
            return (
              <div className="dept-panel ai-panel" data-ai-safe>
                <button type="button" className="dept-panel-close" aria-label="Закрити панель відділу" onClick={() => setDeptPanelClosed(true)}><ActionIcon name="close" size={18} /></button>
                <div className="dept-panel-eyebrow">Відділ</div>
                <h2>{dept.label}</h2>
                <div className="dept-panel-subtitle">{dept.subtitle}</div>
                {dept.narrative && <p className="dept-panel-narrative">{dept.narrative}</p>}

                <div className="dept-panel-section">
                  <h4>Що охоплює</h4>
                  <div className="dept-panel-pills">
                    {dept.subcategories.map((sc) => <span key={sc.key} className="dept-panel-pill">{sc.label}</span>)}
                  </div>
                </div>

                <div className="dept-panel-section">
                  <h4>Функції</h4>
                  <ul className="dept-panel-functions">
                    {dept.subcategories.map((sc) => (
                      <li key={sc.key}><span>{sc.label}</span><span className="dept-panel-count">{sc.agents.length} {sc.agents.length === 1 ? 'агент' : 'агенти'}</span></li>
                    ))}
                  </ul>
                </div>

                {startHereAgent && (
                  <div className="dept-panel-section">
                    <h4>З чого почати</h4>
                    <button
                      type="button" className="dept-panel-starthere"
                      onClick={() => openAgent({ ...startHereAgent, deptKey: focused.key, deptLabel: dept.label, color: dept.color })}
                    >
                      {startHereAgent.name} &rarr;
                    </button>
                  </div>
                )}

                <div className="dept-panel-numbers">
                  {totalAgents} {totalAgents === 1 ? 'агент' : 'агентів'} · {dept.subcategories.length} {dept.subcategories.length === 1 ? 'функція' : 'функції'}
                </div>
              </div>
            );
          })()}

          {focused && viewMode === 'chart' && !focused.dept.comingSoon && (
            <DeptChartView dept={focused.dept} deptKey={focused.key} onSelectAgent={setSelectedAgent} />
          )}

          {/* Phones/narrow windows: the focused department is a touch list
              (same data, same open handlers) instead of a tiny SVG graph. */}
          {focused && compact && viewMode === 'map' && !focused.dept.comingSoon && (
            <div className="dept-sheet ai-panel" data-ai-safe>
              <div className="dept-sheet-head">
                <h2>{focused.dept.label}</h2>
                <div className="dept-panel-subtitle">{focused.dept.subtitle}</div>
              </div>
              {focused.dept.subcategories.map((sc) => (
                <div key={sc.key} className="dept-sheet-group">
                  <h4>{sc.label}</h4>
                  {sc.agents.map((ag) => (
                    <button
                      key={ag.key} type="button" className="dept-sheet-agent"
                      onClick={() => openAgent({ ...ag, deptKey: focused.key, deptLabel: focused.dept.label, color: focused.dept.color, subcatLabel: sc.label })}
                    >
                      <span className="dept-sheet-dot" aria-hidden="true" />
                      <span className="dept-sheet-name">{ag.name}</span>
                      <span className="dept-sheet-status">{STATUS_TEXT[ag.status] || ag.status}</span>
                    </button>
                  ))}
                </div>
              ))}
            </div>
          )}

          <div className={'constellation-stage' + (viewMode === 'chart' && focused ? ' is-chart' : '')} ref={stageRef}>
            {/* decorative energy core: a picture, not a button or an agent */}
            <img className={'ai-core' + (focused ? ' is-quiet' : '')} src={AI_ASSETS.core} alt="" aria-hidden="true" style={{ '--core-dy': `${(ring.dy || 0) / upx}px` }} />

            <svg
              ref={svgRef}
              viewBox={`${-graphHalfW} ${-graphHalfH} ${graphHalfW * 2} ${graphHalfH * 2}`}
              className="constellation-svg" role="group" aria-label="Мапа відділів і агентів"
            >
              <AiSvgDefs />
              <OverviewMap
                nodes={nodes} ring={ring} compact={compact} dims={dims} fontScale={fontScale} fit={fit}
                focusedDept={focusedDept} hoveredDept={hoveredDept} setHoveredDept={setHoveredDept}
                onFocusDept={focusDept} onOpenAgent={openAgent} selectedAgentKey={selectedAgentKey} motion={motion}
              />
              {focused && focusedGraph && !compact && (
                <FocusedGraph
                  key={focused.key} focused={focused} graph={focusedGraph} fs={fontScale}
                  selectedAgentKey={selectedAgentKey} onOpenAgent={openAgent} onReset={resetView}
                />
              )}
            </svg>
          </div>

          {!focused && (
            <>
              <button type="button" className="ai-kb-btn ai-pill" onClick={() => setCoreOpen(true)} data-ai-safe>
                <span className="ai-kb-icon" dangerouslySetInnerHTML={{ __html: BOOK_ICON }} />
                <span>Інформаційна база</span>
              </button>
              <div className="ai-footer ai-pill" data-ai-safe>
                <span className="ai-footer-total">{counts.total} {pluralAgents(counts.total)}</span>
                <span className="ai-footer-item"><i className="ai-dot ai-dot-live" />{counts.live} Live</span>
                <span className="ai-footer-item"><i className="ai-dot ai-dot-dev" />{counts.in_development} у розробці</span>
                <span className="ai-footer-item"><i className="ai-dot ai-dot-plan" />{counts.not_started} заплановано</span>
              </div>
            </>
          )}
        </>
      )}
      </div>

      {/* Knowledge Base / an agent's own workspace / the read-only agent
          info modal all render regardless of `section` — opening one from
          the Агенти catalog (or anywhere else) must work the same as
          opening it from the map itself. */}
      {coreOpen && <KnowledgeBase onClose={() => setCoreOpen(false)} />}

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
  );
}

