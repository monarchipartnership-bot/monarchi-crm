# AI Agents Section — Roadmap

Living plan for the "AI Agents" section of Monarchi CRM (sidebar → AI Agents,
`/tools/constellation-test`). Updated as decisions are made — this is the
source of truth, not a snapshot from one conversation.

Last updated: 2026-09-30.

## STOPPED HERE (2026-09-30) — read this first when picking work back up

Phase 1, Phase 2, and Phase 3 are all fully built (see §5) — every item
in §4.1 through §4.6 has at least one real implementation now.

- **Done:** Agent activity feed + review queue + notification badges
  (Phase 1, §4.3/§4.4), Agent Catalog (§4.1), Agent Workspace template
  (§4.2), 4 real agents (Ads Insights Analyst, Deal Health Check, Cover
  Letter Agent, Job Post Analyzer), Phase 3's scheduled agent run (§4.5)
  — `deal-health-check` runs automatically once a day via pg_cron and is
  confirmed actually firing in production — Phase 3's Analytics/ROI
  dashboard (§4.6), Phase 3's first agent handoff (§4.5) —
  `job-post-analyzer` → `cover-letter-agent`, human-clicked, pre-filled —
  and Phase 3's first *automatic* event-triggered run (§4.5) —
  `job-post-analyzer` also fires with zero human click whenever a new
  deal is created with job-post/inbound text pasted into its optional
  field, logging straight into the activity feed against that deal's real
  client_id (see §4.5 for why this is the one place `job-post-analyzer`
  *can* log there, unlike its manual/standalone use).
- **Infra change worth knowing about:** GitHub (`gh`), Vercel, and
  Supabase CLIs are now authenticated on the dev machine and linked to
  the real project (see `project_supabase_cli_access` memory) — direct
  read access to the live Supabase DB always works
  (`supabase db query --linked "<sql>"`). Direct **writes** work
  *sometimes* — confirmed working for a security-fix REVOKE/migration
  repair earlier in this cycle, then confirmed BLOCKED for a plain test
  INSERT later the same day, no clear pattern found for which is which.
  Don't assume a write will go through; have the fallback (present it as
  a migration file for the user to run, or verify via code review + a
  read-only check instead of a live insert) ready before attempting one.
- **Next action, when resumed:** every roadmapped item through Phase 3 is
  built. Ask the user what's next — more Wave 1 agents (2 open,
  currently-unblocked slots: account/company-data enrichment, blocked
  pending an external search API decision; and the case-selector agent,
  largely redundant with what Cover Letter/Follow-up already do
  internally — see §4.2), Phase 4 (governance/polish, §4.7-4.8), or
  something else entirely. Don't pick autonomously — every agent and
  every phase-priority decision in this project so far has been the
  user's call, not something to infer.
- Nothing is mid-edit or uncommitted — every change through this point is
  committed and pushed to `master`, and every migration in
  `supabase/migrations/` is confirmed actually applied to the live
  database (not just written).

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
- **4 of 44** agent slots have a real, working tool: "Аналітик рекламних
  даних та інсайтів" (Cross-Channel) → `AdsInsightsAnalyst`, "Агент
  контролю стану угод" (Pipeline) → `DealHealthCheck`, "Агент написання
  супровідних листів" (Proposal) → `CoverLetterAgent`, "Агент аналізу
  оголошень про проєкти" (Lead Generation) → `JobPostAnalyzer`.
  Everything else is
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
- **`DealHealthCheck`'s manual "Оновити" button (§4.2) still does NOT log
  into this feed** — clicking the threshold pills or refresh in the UI is
  a live, instantly-recomputed view (adjust the day threshold, get a new
  list on the spot), not a discrete auditable event the way a chat
  exchange or an audit is; logging every threshold click would spam the
  feed with near-duplicate rows. **Its once-a-day scheduled run (§4.5,
  built 2026-09-29) DOES log into this feed** — exactly one row per day,
  a genuinely discrete event, which is what made logging it make sense
  where logging every manual click didn't. This also resolved the other
  original blocker (`ai_agent_conversations.client_id` being `not null`
  for a cross-client agent) via
  `2026-09-29_ai_agent_conversations_client_id_nullable.sql`.
- **`CoverLetterAgent` (built 2026-09-29) deliberately does NOT log into
  this feed**, for the same underlying reason `DealHealthCheck`'s manual
  button doesn't: no `client_id` to attach to, and every generation is a
  one-off manual action, not a scheduled/recurring one — there's no
  "daily digest" framing available here the way there was for
  deal-health-check. A cover letter replies to a fresh Upwork job post,
  before any CRM client/deal record exists for that lead — same shape as
  the pre-existing Follow-up Generator tool, which also runs standalone
  with no required client_id. Client_id being nullable now (see above)
  removes the schema blocker if this is ever revisited, but the "every
  manual click would spam the feed" reasoning still applies unless/until
  this agent also gets a scheduled, digest-shaped trigger.
- **`JobPostAnalyzer`'s manual/standalone tool (opened from the map/
  catalog) still deliberately does NOT log into this feed**, exact same
  reasoning as `CoverLetterAgent` — one-off manual paste-and-analyze on a
  job post with no client_id yet, no scheduled/digest framing available.
  **Its event-triggered path DOES log into this feed** (built 2026-09-30,
  see §4.5) — when it's `AddDealModal` firing it right after a new deal is
  created, a real client_id already exists, closing exactly the gap that
  keeps the manual tool out.

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
- **Scheduled runs — first one BUILT (2026-09-29):** `deal-health-check`
  now also runs automatically once a day (`run_deal_health_check()`,
  scheduled via pg_cron — same mechanism as
  `2026-09-17_notifications_weekly_cleanup.sql`, no new infra) and logs a
  discrete `ai_agent_conversations` row (`kind:'audit'`), `needs_review`
  only when it actually finds stale deals. This is deliberately plain SQL,
  not a new Vercel cron + serverless round trip — the agent's own logic
  (open deals, stage neither won nor lost, `updated_at` older than N days)
  is fully deterministic and needs no LLM call, so porting it to a
  `plpgsql` function ported the *exact* rule from
  `src/lib/api/dealHealthCheck.js` with nothing new to keep in sync except
  by hand if that file's logic ever changes. See migrations
  `2026-09-29_ai_agent_conversations_client_id_nullable.sql` (client_id
  had to become nullable — a cross-client scan has no single client to
  attach to, see §4.3) and
  `2026-09-29_deal_health_check_scheduled_run.sql`.
- **Event-triggered runs — first one BUILT (2026-09-30):** a new deal
  being created is the event — no cron, no human opening the AI Agents
  section. `AddDealModal.jsx` got one new optional field ("Job post /
  вхідне звернення") right in the existing Add Deal form; if a manager
  pastes text there, `handleSave()` fires
  `runJobPostAnalysisForDeal({ clientId, jobPost })`
  (`src/lib/api/jobPostAnalyzerActivity.js`) fire-and-forget right after
  the deal itself is created — doesn't block the modal closing, a failure
  here doesn't undo the deal. Reuses `job-post-analyzer`'s exact
  prompt/parser (`analyzeJobPost()`, no new LLM logic) and logs straight
  into `ai_agent_conversations`/`ai_agent_messages` via the same
  `createConversation`/`appendMessages` helpers `AdsInsightsAnalyst.jsx`'s
  `runAudit()` already uses (`src/lib/api/aiConversations.js`) — `kind:
  'audit'`, `needs_review: true`, `created_by: 'Автоматично (нова
  угода)'`.
  This is deliberately NOT a Postgres trigger calling the LLM directly —
  Postgres/pg_cron can run deterministic SQL (see deal-health-check
  above) but can't reasonably call an external HTTPS API like
  `/api/anthropic` without a lot of new plumbing (`pg_net`, async
  webhooks, retry handling) for one agent; firing this from the React
  form that already creates the deal is far simpler and already proven
  reliable via the exact same helpers other agents use.
  This is also the one place `job-post-analyzer` output legitimately
  lands in the activity feed: unlike its manual/standalone use (see
  §4.3's note — no client_id exists yet when someone just pastes a job
  post to try the tool), a brand-new deal already has a real client_id by
  the time this fires.
  **Verified (2026-09-30):** the prompt+parser were run for real against
  the deployed `/api/anthropic` twice (via `curl` + actual Node execution
  of the real JS, not a text-only simulation) and produced correctly-
  shaped results both times; the `createConversation`/`appendMessages`
  call path is the exact pre-existing, already-in-production code
  `AdsInsightsAnalyst` uses, not new risky logic. A live insert-and-
  verify-then-clean-up test on a real (test) client was attempted but
  blocked by this session's Bash auto-mode classifier partway through
  (inconsistent — a very similar write had succeeded earlier the same
  day, see the STOPPED HERE infra note) — not retried further per that
  denial's own instructions. The one piece confirmed only by code review
  rather than a live run is the exact DB write; everything upstream of it
  is confirmed live.
- **Handoffs between agents — first one BUILT (2026-09-30):**
  `job-post-analyzer` (foundation stage) → `cover-letter-agent` (generate
  stage) — the exact Foundation→Generate pipeline the stages already
  encoded in `aiAgentsData.js` implied but nothing wired up yet. A
  "Написати cover letter на основі цього job post →" button on the
  analyzer's result calls `onHandoff(toolKey, payload)`
  (`ConstellationTest.jsx`'s `handoffToAgentTool`, threaded to every
  `AGENT_TOOLS` component alongside `onClose`) — opens Cover Letter Agent
  pre-filled with the same job post plus the analyzer's structured
  findings (niche/services/budget/flags) folded into "extraContext", so
  the LLM call doesn't have to re-derive what's already known. Purely a
  same-tab UI handoff (human still clicks the button) — not an automatic
  event trigger, that's still the unbuilt item above. `initialPayload` is
  the generic contract any agent tool can accept for this; `onHandoff` is
  passed to every tool whether or not it uses it, so wiring a second
  handoff pair later needs no ConstellationTest.jsx changes, only the
  source agent calling `onHandoff` and the target agent reading
  `initialPayload`.

### 4.6 Analytics / ROI — BUILT (2026-09-29)
`src/pages/AgentAnalytics/AgentAnalytics.jsx`, the section's "Аналітика"
tab. Deliberately scoped to numbers that are actually real, not invented:
- **Aggregate autonomy × stage matrix (company-wide)** — the exact same
  matrix idea as the map's own per-department CHART view
  (`DeptChartView`), rolled up across all 8 departments instead of one at
  a time. Cell intensity (background tint) scales with count; hovering a
  cell lists the agent names via `title`.
- **Wave rollout** — a stacked bar per wave (Wave 1/2/3), segmented
  live/in_development/not_started, same status colors as the Agent
  Catalog (`agentCatalogPage.css`'s `--live`/`--in_development` greens/
  blues) so the two views read as one system.
- **Real activity** — pulled live from `ai_agent_conversations` (same
  `fetchAgentActivity()` the "Задачі агентів" tab uses): total runs
  logged, runs in the last 7 days, needs-review count, and a per-agent
  bar breakdown (`findAgentByKey(conv.agent_key)` for the label).
- **Deliberately NOT built: estimated hours/cost saved.** There is no
  agreed-on way to estimate this per agent anywhere in this project —
  showing a number here would mean inventing one and presenting it as if
  it were real. The page says so explicitly instead of a fake tile. Add
  this once the business defines a real per-agent estimate to plug in,
  not before.

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

**Phase 3 — Orchestration & scale** ← current focus (started 2026-09-29)
- **Built (2026-09-29):** first scheduled agent run — `deal-health-check`
  now runs automatically once a day via pg_cron and logs into the Phase 1
  activity feed as a discrete audit. See §4.5 for detail. This also
  resolves the "not client-scoped" blocker that kept it out of the feed —
  `ai_agent_conversations.client_id` is now nullable. **Confirmed actually
  running in production 2026-09-30**: real daily audit rows visible in
  "Задачі агентів" (e.g. "176 угод потребують уваги" at 09:00), not just
  the one manual test run from the day before.
- **Built (2026-09-29):** Analytics/ROI dashboard (4.6) — new "Аналітика"
  section tab: company-wide autonomy×stage matrix, wave rollout bars, and
  real activity-feed numbers. Explicitly does not fabricate a saved-
  hours/cost number — see §4.6 for why.
- **Built (2026-09-30):** `JobPostAnalyzer` — 4th real agent, user-picked
  (`job-post-analyzer`, Sales/Lead Generation). Reads a pasted job post or
  inbound message and produces a structured sales brief (niche, task
  essence, which Mon'Archi services actually apply, budget/timeline
  mentions, ICP-fit red flags, HIGH/MEDIUM/LOW response priority) plus a
  short manager-facing recommendation paragraph. Unlike Cover Letter/
  Follow-up, this is an internal-facing extraction task, not client-facing
  prose — deliberately does NOT reuse the CORE+STYLE writing-rules
  architecture, it has its own focused prompt
  (`src/lib/jobPostAnalyzerPrompt.js`). Verified end-to-end against the
  real deployed `/api/anthropic` (via `curl` against
  `crm.monarchi.agency`, now possible because of the Vercel CLI access set
  up this cycle — see the infra note above) since local Vite dev can't
  reach it, same limitation every LLM-backed agent here has. Status
  flipped `not_started` → `in_development`. Not wired into the activity
  feed, same reasoning as Cover Letter Agent (no client_id yet). New
  files: `src/lib/jobPostAnalyzerPrompt.js`,
  `src/lib/api/jobPostAnalyzerApi.js`,
  `src/pages/JobPostAnalyzer/JobPostAnalyzer.jsx` +
  `src/styles/jobPostAnalyzerPage.css`.
- **Built (2026-09-30):** first agent handoff (4.5) — `job-post-analyzer`
  → `cover-letter-agent`, human-clicked, pre-filled. See §4.5 for detail.
- **Built (2026-09-30):** first automatic event-triggered run (4.5) —
  creating a new deal with job-post/inbound text pasted into
  `AddDealModal`'s new optional field auto-runs `job-post-analyzer` with
  zero human click, logging into the activity feed. See §4.5 for detail
  including what's verified live vs. by code review only.
- **Phase 3 is now fully built** — every §4.1-§4.6 item has at least one
  real implementation. Next is Phase 4, more Wave 1 agents, or whatever
  the user prioritizes next — ask, don't assume.

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

All 3 migrations above are applied. Real chat/audit conversations now
persist — the activity feed, "Задачі агентів" review queue, and
AdsInsightsAnalyst's own "Історія" tab all have real data flowing through
them.

3. **`ai_agent_conversations.client_id` needed to become nullable** — the
   first scheduled/cross-client agent run (deal-health-check, §4.5) has
   no single client to attach to. Fix migration:
   `2026-09-29_ai_agent_conversations_client_id_nullable.sql` (safe — a
   pure widening, every existing reader already tolerates a missing
   client_id).
4. **New `run_deal_health_check()` function + `pg_cron` schedule** —
   `2026-09-29_deal_health_check_scheduled_run.sql`. Ports
   `dealHealthCheck.js`'s exact stale-deal rule to SQL and schedules it
   daily at 06:00 UTC, reusing the same `pg_cron` extension the
   notifications weekly cleanup already uses.

**Migrations #3 and #4 confirmed applied 2026-09-29** — see the STOPPED
HERE note at the top of this file for how this was verified (a live RPC
test call, not just the user's say-so).

## 6a. Supabase-wide security audit (2026-09-30) — not AI-Agents-specific, tracked here since it landed in the same migrations folder

While setting up direct Supabase CLI access (see the infra note in
STOPPED HERE), ran a full audit of the live database (not just this
section's own tables) and found a real, previously-undocumented critical
bug: 10 tables (`clients`, `deals`, `deal_notes`, `deal_activity`,
`deal_participants`, `deal_stages`, `notifications`, `pipelines`,
`client_changes`, `client_files`) carried leftover blanket RLS policies
(`<table>_all_anon` / `_all_authenticated`, `for all using (true)`) that
no migration in this repo ever created — `2026-09-19_enable_rls_everywhere.sql`
only ever creates the correct granular per-action policies, confirmed by
reading its actual SQL. Someone must have added the blanket ones by hand
in Supabase Studio at some point. Since RLS policies OR together, this
meant the public anon key alone could insert/update/delete freely in all
10 tables, completely bypassing the "write requires authenticated" rule
every migration since assumed was in force.

Fixed and confirmed applied same day:
`20260930000000_drop_redundant_anon_all_policies.sql` — drops the 10
tables' blanket policies (confirmed every table already had working
granular replacements first), revokes public RPC `EXECUTE` on 4
`SECURITY DEFINER` functions that were incidentally callable by anyone
with just the anon key (`cleanup_old_notifications`,
`send_task_reminders`, `run_deal_health_check`, `enforce_corporate_email`
— note revoking from `anon`/`authenticated` alone wasn't enough, Postgres
grants `EXECUTE` to the `PUBLIC` pseudo-role by default on function
creation, so `revoke ... from public` is the statement that actually
matters), and pins `enforce_corporate_email`'s previously-mutable
`search_path`. See `project_rls_everywhere` / `project_supabase_cli_access`
memory for the full story of how this was found and fixed.

## 7. Explicitly out of scope for now

- The crack/shatter transition effect (removed; not being rebuilt unless
  asked again).
- Anything not tied to the AI Agents section itself (Task Manager, Deals,
  Reports etc. already exist independently). Agent activity/review is a
  dedicated surface (§4.3, decided) — explicitly not merged into Task
  Manager.
