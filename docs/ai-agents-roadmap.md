# AI Agents Section — Roadmap

Living plan for the "AI Agents" section of Monarchi CRM (sidebar → AI Agents,
`/tools/constellation-test`). Updated as decisions are made — this is the
source of truth, not a snapshot from one conversation.

Last updated: 2026-09-29.

## STOPPED HERE (2026-09-29) — read this first when picking work back up

Phase 1 (tracking/accountability) and Phase 2 (foundations for scale) are
both built — see §5 for the full phase breakdown. Concretely:

- **Done:** Agent activity feed + review queue + notification badges
  (Phase 1, §4.3/§4.4), Agent Catalog (§4.1), Agent Workspace template
  (§4.2), and 3 real agents (Ads Insights Analyst, Deal Health Check,
  Cover Letter Agent).
- **All 3 DB migrations confirmed applied (2026-09-29)** — verified live
  (`client_id` accepts uuid without error). Real chat/audit conversations
  now actually persist — the activity feed and "Історія" tab are no
  longer blocked. See §6.
- **Next action, when resumed:** Phase 2's "1-2 more Wave 1 agents" target
  is met (3 shipped). Ask the user whether to keep shipping Wave 1 agents
  or move into Phase 3 (orchestration/scale, §5) — business decision, not
  something to pick autonomously.
- Nothing is mid-edit or uncommitted — every change through this point is
  committed and pushed to `master`.

## 1. LOCKED — navigation model (do not revisit without being asked)

**Everything AI-agents-related lives inside the AI Agents section itself,
switched by a horizontal nav at top-center of that section (right where
the circle of agents is) — never as new CRM sidebar entries or new top-
level routes.** Confirmed 2026-09-26 after the activity feed was first
built as a separate sidebar link + routed page (`/automation/ai-agent-
activity`) — wrong, corrected the same day.

- Implementation: `ConstellationTest.jsx`'s own `section` state
  (`'map' | 'activity' | …`) plus `.constellation-section-nav`, a pill tab
  bar — not React Router. Adding a new AI-agents view means adding another
  `section` entry and tab, not a new `<Route>` or `sidebarData.js` item.
- The one exception, and the only necessary link to the general CRM: the
  "CRM" exit pill (top-right) that leaves the section entirely. Nothing
  else about AI Agents should assume or require the main CRM's sidebar/
  routing.
- The department-focus MAP/CHART toggle (`.view-tabs`) is a level *below*
  this section nav (only meaningful once you've focused a department on
  the Мапа view) — it sits just underneath the section nav, not
  competing with it.
- `.constellation-stage` reserves `padding-top: 78px` so the overview's
  topmost department label/hub never sits under the section nav — if the
  nav's own height ever changes, this offset needs to move with it.

## 1b. LOCKED — visual style for every non-map AI Agents section

**Every full-page view inside the AI Agents section (other than the map
itself) uses the shared dark palette in `src/styles/aiAgentsSection.css`
(`.ai-section*`) — same colors/typography/components as the Knowledge
Base (`knowledgeBasePage.css`'s `.kb-*`), but laid out full-bleed edge-to-
edge, never a floating rounded "window" card like the Knowledge Base
itself.** Confirmed 2026-09-26 after "Задачі агентів" was first built with
the light CRM design system (white cards, `.btn`) — wrong, corrected the
same day to the dark full-bleed treatment.

- Background `#0A0612`, header icon badge (`.ai-section-icon`, purple
  gradient) + kicker + title + description (`.ai-section-head`), pill
  filters (`.ai-section-pill`), tinted list cards (`.ai-section-card`),
  buttons (`.ai-section-btn`/`.ai-section-btn-primary`) — reuse these
  classes for the next section (Агенти, Аналітика, Налаштування) rather
  than inventing a new palette or falling back to the light CRM system.
- The Knowledge Base itself stays as its own floating-window component
  (`.kb-*`, opened from the core sphere) — it predates this convention and
  isn't being migrated to `.ai-section*` unless asked.

## 2. Current state (as of this writing)

**Built and working:**
- Constellation map (`ConstellationTest.jsx`): 8-department radial overview,
  click-to-focus per department with two views — **MAP** (hub → function →
  agent graph) and **CHART** (autonomy breakdown: Human-led / Human-assisted
  / Fully autonomous × Foundation / Capture / Generate / Orchestrate stages).
- Agent detail modal: description, autonomy/status/wave badges. Falls back
  to read-only info unless the agent has a registered real tool.
- **3 of 44** agent slots have a real, working tool: "Аналітик рекламних
  даних та інсайтів" (Cross-Channel) → `AdsInsightsAnalyst`, "Агент
  контролю стану угод" (Pipeline) → `DealHealthCheck`, "Агент написання
  супровідних листів" (Proposal) → `CoverLetterAgent`. Everything else is
  `status: not_started` — data-only placeholders with a disabled
  "Запустити (скоро)" button.
- Agent search (⌘K-style).
- Knowledge Base: shared categories/articles, search, create/edit/delete
  (writes to Supabase), opened from the map's core sphere as a full-screen
  opaque overlay.

**Explicitly reverted this cycle (don't rebuild without asking):**
- CRM → AI Agents "crack/shatter" screen transition. Built fully from
  scratch (deterministic crack pattern + shard map for a future crumble
  animation), iterated twice on realism per feedback, then removed entirely
  — user didn't like it. "AI Agents" in the sidebar is a plain instant
  `NavLink` again. If a transition effect is wanted again later, it starts
  from zero (the shard/crack data system was deleted, not archived).

**Fixed this cycle:**
- Knowledge Base's backdrop is now fully opaque (not translucent like the
  agent modal) — it opens over the *unfocused* map (8 animating hubs), so
  translucency let a hub label bleed through and read as a stray moving
  box. The agent modal's own translucency is fine because it only ever
  opens over an already-focused, calmer view.

## 3. The core gap

The map is a strong front door, but almost nothing exists **behind** it:
- No standard template for building a new agent — the 1 real agent was
  built as a one-off. Agent #2 currently means designing a workspace from
  scratch again.
- No visibility into what agents *do*: no activity feed, no run history,
  no human-review queue, no error/failure state, no notifications.
- No way to trigger an agent except opening its modal by hand — no
  scheduling, no event triggers, no handoffs between agents even though
  the department stages (Foundation → Capture → Generate → Orchestrate)
  already imply pipelines.
- No aggregate view — autonomy breakdown exists per department (CHART
  tab) but not company-wide; no adoption/ROI numbers anywhere.
- No governance — anyone who can open the map can (in principle) trigger
  any agent; no permissions, no config/prompt versioning.
- Everything lives inside one immersive full-screen page. There's no
  sub-navigation — "AI Agents" in the sidebar is a single link, not a
  section with its own tabs the way Reports or Team are.

**Decided (2026-09-26): tracking/accountability comes before scaling.**
Make the existing agent(s) trackable first — activity feed + human-review
queue as a dedicated surface, not merged into the existing Task Manager
(agent run lifecycle — retry, failure states — doesn't fit that model).
This reorders §5 below: tracking is Phase 1, not Phase 2.

## 4. Proposed structure

Keep the constellation map as the flagship overview (it's already well
built and a good pitch/demo surface) but stop treating it as the *only*
surface. Turn "AI Agents" into a proper section with its own internal
sub-navigation — see §1: a horizontal tab bar top-center of the section
itself, NOT a CRM sidebar group and NOT separate routes:

```
AI Agents section (one sidebar link in, "CRM" pill out — nothing else
touches the main CRM's navigation)
  Мапа           — existing constellation map (default view) — BUILT
  Задачі агентів — activity feed + human-review queue — BUILT (2026-09-26)
  Агенти         — flat catalog: table/grid of all 44 agent slots
  База знань     — already built; opened from the map's core sphere
  Аналітика      — adoption/ROI, aggregate autonomy, wave rollout timeline
  Налаштування   — permissions, per-agent config/data-access (later phase)
```

### 4.1 Agent Catalog (list/grid view) — BUILT (2026-09-27)
`src/pages/AgentCatalog/AgentCatalog.jsx`, the section's "Агенти" tab.
- The exact same flattened agent list `ConstellationTest.jsx` already
  builds for its own search (`allAgents`) — passed in as a prop rather
  than recomputed, one source of truth.
- Search (name/department/function) + status pills (Live/In development/
  Not started) + wave pills (1/2/3); a summary line ("N агентів усього ·
  N live · N у розробці · N заплановано") answers "what's live today" at
  a glance.
- Clicking a row calls the same `openAgent()` the map itself uses — opens
  the real tool if the agent has one, the read-only info modal otherwise.
  (Department/autonomy filters and "last updated" were dropped from the
  original sketch below — no per-agent `updated_at` exists in the data
  yet, and status+wave+search already cover the "find X" / "review all"
  cases without an 8-option department filter's clutter.)

### 4.2 Agent Workspace template — BUILT (2026-09-27)
The single highest-leverage piece of infrastructure missing. Instead of
building each agent's UI from scratch (as `AdsInsightsAnalyst` was),
extracted a reusable shell — validated against two real, differently-
shaped agents (a live chat tool and a run-and-review report) rather than
designed speculatively from one sample:
- **`AgentWorkspaceShell`** (`src/components/AgentWorkspace/
  AgentWorkspaceShell.jsx`) — the overlay/panel/glow/header/info-modal
  wrapper every agent workspace opens inside. Takes just `agentKey` +
  `onClose` + `children`; everything about the header (orb color/icon,
  kicker, name, description) comes straight off `findAgentByKey()`, so a
  new agent's workspace never repeats data already in `aiAgentsData.js`.
- **`AgentWorkspaceHeader`** (same folder) — the icon/kicker/title/info-
  button/description/nav-actions row, used by the shell.
- **`AgentInfoModal`** (same folder) — the read-only "what is this agent"
  modal, was copy-pasted identically in `ConstellationTest.jsx` and
  `AdsInsightsAnalyst.jsx`; now one component.
- Shared CSS: `src/styles/agentWorkspace.css` (renamed from
  `AdsInsightsAnalyst`'s own `.aia-*` classes to `.agent-workspace-*`,
  zero visual change — confirmed by screenshot before/after).
- `AdsInsightsAnalyst.jsx` refactored onto the shell (proof it doesn't
  regress a real, working agent); `DealHealthCheck.jsx` (§4's second
  agent) and `CoverLetterAgent.jsx` (§4's third agent, built 2026-09-29)
  built on it from scratch.

Confirmed NOT generalizable from three data points (left agent-specific,
not templatized):
- Body content — chat thread vs. stale-deal list vs. form-plus-generated-
  text are genuinely different shapes; not templatizing this further.
- Run history / output log — a chat's "history" (past conversations), a
  report agent's "history" (past runs), and a generator's "history" (past
  generations) aren't the same shape. Not attempted.
- Linked Knowledge Base articles (traceability) — still nobody's built
  this.
- "Запустити" as a tracked run/status lifecycle — neither `DealHealthCheck`
  nor `CoverLetterAgent` logs runs to the Phase 1 activity feed (see
  §4.3's note on why, and §6 for the schema blocker if this changes).

Confirmed generalizable (reused as-is, not re-derived, for
`CoverLetterAgent`): the Follow-up Generator's CORE+STYLE prompt
architecture (`followupPrompt.js`'s `CORE_WRITING_RULES_BLOCK`/
`getStyleBlock`, exported for this purpose) and its Supabase-backed case
database (`followupCases.js`) — both agent-agnostic once exported, no
duplication needed for a third agent that also needs a "write like
Mon'Archi" system prompt.

### 4.3 Agent activity & task tracking — PRIORITY (Phase 1)
Currently invisible. Needs:
- **Activity feed** — what ran, when, on which record (deal/client/task),
  success or failure.
- **Human-review queue** — anything a `human-assisted` agent produced that
  needs a person to approve/edit/reject before it counts as done. This is
  not optional once more than one human-assisted agent exists — right now
  there's no mechanism for it at all.
- **Decided:** a dedicated activity feed/queue, separate from the existing
  Task Manager — not merged in, even tagged. Agent runs need their own
  lifecycle (queued/running/success/failed/needs-review/retried) that
  doesn't map cleanly onto human task statuses, and mixing them risks
  distorting both views.
- **`DealHealthCheck` (§4.2) deliberately does NOT log into this feed
  yet**, even though the intent was "every new agent wired in from day
  one." Two real blockers, not an oversight: (1) `ai_agent_conversations.
  client_id` is `not null` and this agent isn't scoped to one client —
  every run spans all open deals; (2) its "runs" are a live, instantly-
  recomputed view (adjust the day threshold, get a new list on the spot),
  not a discrete auditable event the way a chat exchange or an audit is —
  logging every threshold click would spam the feed with near-duplicate
  rows.
- **`CoverLetterAgent` (built 2026-09-29) also deliberately does NOT log
  into this feed**, for the same underlying reason as `DealHealthCheck`:
  no `client_id` to attach to. A cover letter replies to a fresh Upwork
  job post, before any CRM client/deal record exists for that lead — same
  shape as the pre-existing Follow-up Generator tool, which also runs
  standalone with no required client_id. Two agents now share this
  pattern (not-yet-a-client input), so it's a real pattern, not a one-off
  excuse — worth solving properly (e.g. an optional/nullable `client_id`,
  or a separate non-client-scoped log) if a fourth such agent shows up.

### 4.4 Notifications — BUILT (2026-09-26)
Minimal version, deliberately not the personal per-recipient `notifications`
table (task reminders etc.) — a needs-review item isn't addressed to one
person, it's a shared queue anyone on the team can clear, which doesn't
fit that table's recipient-targeted model.
- `useAgentReviewCount()` (`src/lib/useAgentReviewCount.js`) — polls
  `fetchNeedsReviewCount()` every 45s.
- Badge on the sidebar "AI Agents" entry (the one sanctioned link to the
  general CRM, per §1) — a count, shown only when > 0.
- Badge on the section's own "Задачі агентів" tab, visible from the Мапа
  view too without switching tabs first.

### 4.5 Orchestration & triggers
- Manual trigger (exists, informally, via the modal).
- Scheduled runs (cron-style) and event-triggered runs (e.g., new lead →
  qualification agent runs automatically).
- Handoffs between agents matching the Foundation → Capture → Generate →
  Orchestrate stages already encoded in the data — right now those stages
  are descriptive labels only, not a real pipeline.

### 4.6 Analytics / ROI
- Aggregate autonomy chart (company-wide, not just per department).
- Adoption over time, estimated hours/cost saved.
- Wave rollout as a visual timeline (Wave 1/2/3 tags already exist in
  `aiAgentsData.js` — currently invisible as a roadmap view).

### 4.7 Governance (later)
- Permissions: who can trigger/configure which agents.
- Per-agent data access scope.
- Prompt/config version history + changelog.

### 4.8 Change management (later)
- Surface a "what's new" moment when an agent flips
  not_started → in_development → live, instead of the team discovering it
  by clicking around.
- Lightweight per-agent onboarding/tour when it first goes live.

## 5. Phased roadmap

**Phase 1 — Tracking & accountability** ← current focus
- **Built (2026-09-26):** Activity feed + human-review queue — "Задачі
  агентів" tab inside the AI Agents section itself (see §1; originally
  built as a sidebar link + routed page, corrected same day), built on
  `ai_agent_conversations` (kind/created_by/needs_review/reviewed_by/
  reviewed_at columns — `2026-09-26_ai_agent_activity_tracking.sql`).
  Audits (`runAudit()` in AdsInsightsAnalyst.jsx) are tagged
  `kind:'audit', needs_review:true`; ordinary chat stays `kind:'chat'`.
  **Blocked on one more DB migration** — see §6 (a schema bug, not
  something new to build).
- **Built (2026-09-26):** Notifications (4.4) — sidebar + section-nav-tab
  badge counts, see §4.4 for detail.
- Phase 1 is now functionally complete pending migration #3 (§6) —
  everything above is built; only real data flowing through it is blocked.
- Covers the 1 agent that exists today (Ads Insights Analyst) properly
  before adding more agents on top of an untracked foundation.

**Phase 2 — Foundations for scale**
- **Built (2026-09-27):** Agent Catalog list view (4.1) — see §4.1. Also
  fixed a real bug found while wiring it up: the KB/agent-tool/agent-modal
  overlays were accidentally nested inside the map's own `section ===
  'map'` gate, so opening an agent from anywhere other than the map (e.g.
  a search result, or this catalog) silently did nothing — moved them to
  render unconditionally, keyed off their own state instead.
- **Built (2026-09-27):** Agent Workspace template (4.2) — extracted while
  building the first of the "2-3 more agents" below (see §4.2 detail).
- **Built (2026-09-27):** `DealHealthCheck` — 1 of the 2-3 target agents,
  user-picked (`deal-health-check`, sales/pipeline). Lists open deals with
  no activity in N days (7/14/30 toggle), a computed reason per deal, and
  a deep link to the real deal (`/reports/deals?open=<id>`, reusing the
  same convention notifications already use there). Status flipped
  `not_started` → `in_development` in `aiAgentsData.js`; is now the sales
  department's `startHere` (was `account-enrichment`, which still needs an
  external search API decision — this one needed none, only data already
  in the CRM). Not wired into the Phase 1 activity feed — see §4.3's note
  on why.
- **Built (2026-09-29):** `CoverLetterAgent` — 2nd/3rd of the "2-3 more
  agents" target, user-picked (`cover-letter-agent`, Sales/Proposal). Reads
  a pasted Upwork job post, picks (or lets the user pick) a relevant
  Mon'Archi case from the shared case database, and generates a ready-to-
  send cover letter via the CORE+STYLE prompt architecture reused directly
  from the Follow-up Generator (`followupPrompt.js`, `coverLetterPrompt.js`
  is the new task-specific layer on top). Status flipped `not_started` →
  `in_development` in `aiAgentsData.js`. Not wired into the Phase 1
  activity feed — see §4.3's note on why (no client_id at generation time).
  New files: `src/lib/coverLetterPrompt.js`, `src/lib/api/coverLetterApi.js`,
  `src/pages/CoverLetterAgent/CoverLetterAgent.jsx` +
  `src/styles/coverLetterAgentPage.css`.
- Phase 2's "2-3 more agents" target is now met (3 real agents live in
  the section). Next agent, if/when picked, is extra beyond the original
  Phase 2 scope.

**Phase 3 — Orchestration & scale**
- Scheduled/event-triggered runs, agent handoffs (4.5)
- Analytics/ROI dashboard, aggregate autonomy view (4.6)

**Phase 4 — Governance & polish**
- Permissions, config/prompt versioning (4.7)
- Onboarding/changelog surfacing (4.8)

## 6. DB migrations — ALL APPLIED (confirmed 2026-09-29)

Two issues surfaced while verifying the activity feed, in this order —
both resolved, kept here as the historical record:

1. **`ai_agent_conversations`/`ai_agent_messages` were never applied** —
   the tables didn't exist at all; every read/write had been silently
   failing to `[]` (each call already catches its own error). Not new
   breakage — it meant the agent's own "Історія" tab and ClientProfile's
   "AI Team work history" tab had never actually persisted anything
   either. **Fixed 2026-09-26** — user ran the migration, confirmed the
   tables + new columns exist.
2. **`ai_agent_conversations.client_id` was declared `bigint`, but
   `clients.id` is `uuid`** — a real bug in the original 2026-09-25
   migration (pre-existing, not introduced this cycle). Every insert that
   references a real client failed with `invalid input syntax for type
   bigint: <uuid>` — caught by the same silent error handling. Fix
   migration: `2026-09-26_ai_agent_conversations_client_id_uuid_fix.sql`
   (safe — table was still empty, `alter column ... type uuid`).
   **Confirmed run 2026-09-29** — verified live (`client_id` now accepts
   a uuid filter/insert with no type error; the only remaining rejection
   is RLS on an unauthenticated test write, which is expected).

All 3 migrations are applied. Real chat/audit conversations now persist —
the activity feed, "Задачі агентів" review queue, and AdsInsightsAnalyst's
own "Історія" tab all have real data flowing through them.

## 7. Explicitly out of scope for now

- The crack/shatter transition effect (removed; not being rebuilt unless
  asked again).
- Anything not tied to the AI Agents section itself (Task Manager, Deals,
  Reports etc. already exist independently). Agent activity/review is a
  dedicated surface (§4.3, decided) — explicitly not merged into Task
  Manager.
