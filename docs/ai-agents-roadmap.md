# AI Agents Section — Roadmap

Living plan for the "AI Agents" section of Monarchi CRM (sidebar → AI Agents,
`/tools/constellation-test`). Updated as decisions are made — this is the
source of truth, not a snapshot from one conversation.

Last updated: 2026-09-26.

## 1. Current state (as of this writing)

**Built and working:**
- Constellation map (`ConstellationTest.jsx`): 8-department radial overview,
  click-to-focus per department with two views — **MAP** (hub → function →
  agent graph) and **CHART** (autonomy breakdown: Human-led / Human-assisted
  / Fully autonomous × Foundation / Capture / Generate / Orchestrate stages).
- Agent detail modal: description, autonomy/status/wave badges. Falls back
  to read-only info unless the agent has a registered real tool.
- **1 of 44** agent slots has a real, working tool: "Аналітик рекламних
  даних та інсайтів" (Cross-Channel) → `AdsInsightsAnalyst`. Everything
  else is `status: not_started` (one `in_development`) — data-only
  placeholders with a disabled "Запустити (скоро)" button.
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

## 2. The core gap

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
This reorders §4 below: tracking is Phase 1, not Phase 2.

## 3. Proposed structure

Keep the constellation map as the flagship overview (it's already well
built and a good pitch/demo surface) but stop treating it as the *only*
surface. Turn "AI Agents" into a proper section with sub-navigation,
similar to how Reports or Team already work:

```
AI Agents (sidebar group, not a single link)
├── Мапа          — existing constellation map (default view)
├── Агенти        — flat catalog: table/grid of all 44 agent slots
├── Задачі агентів — activity feed + human-review queue
├── База знань    — already built; also reachable directly, not only via the core sphere
├── Аналітика     — adoption/ROI, aggregate autonomy, wave rollout timeline
└── Налаштування  — permissions, per-agent config/data-access (later phase)
```

### 3.1 Agent Catalog (list/grid view)
The radial map doesn't scale for "find agent X" or "review all 44 at
once." A flat, filterable table next to it:
- Columns: name, department, function, autonomy level, status, wave,
  last updated.
- Filter by department / status / autonomy / wave; search; sort.
- Bulk status view answers "what's actually live today" in one glance,
  instead of clicking into 8 departments one at a time.

### 3.2 Agent Workspace template
The single highest-leverage piece of infrastructure missing. Instead of
building each agent's UI from scratch (as `AdsInsightsAnalyst` was),
extract a reusable shell:
- Header: description, connected data sources, owner, status badge.
- Body: chat or input-form area (agent-specific), depending on agent type.
- Run history / output log.
- Linked Knowledge Base articles (traceability — which agent reads which
  KB content).
- "Запустити" action wired to a consistent run/status lifecycle.

Shipping this template is what turns "1 of 44 built" into "each new agent
takes days, not a redesign."

### 3.3 Agent activity & task tracking — PRIORITY (Phase 1)
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

### 3.4 Notifications
Nothing currently tells anyone an agent finished a job or needs input.
Even a minimal version (a badge/count on the sidebar "AI Agents" entry, or
reuse of whatever notification pattern the rest of the CRM ends up with)
closes a real gap.

### 3.5 Orchestration & triggers
- Manual trigger (exists, informally, via the modal).
- Scheduled runs (cron-style) and event-triggered runs (e.g., new lead →
  qualification agent runs automatically).
- Handoffs between agents matching the Foundation → Capture → Generate →
  Orchestrate stages already encoded in the data — right now those stages
  are descriptive labels only, not a real pipeline.

### 3.6 Analytics / ROI
- Aggregate autonomy chart (company-wide, not just per department).
- Adoption over time, estimated hours/cost saved.
- Wave rollout as a visual timeline (Wave 1/2/3 tags already exist in
  `aiAgentsData.js` — currently invisible as a roadmap view).

### 3.7 Governance (later)
- Permissions: who can trigger/configure which agents.
- Per-agent data access scope.
- Prompt/config version history + changelog.

### 3.8 Change management (later)
- Surface a "what's new" moment when an agent flips
  not_started → in_development → live, instead of the team discovering it
  by clicking around.
- Lightweight per-agent onboarding/tour when it first goes live.

## 4. Phased roadmap

**Phase 1 — Tracking & accountability** ← current focus
- Activity feed + human-review queue (3.3), dedicated surface (not Task Manager)
- Notifications (3.4)
- Covers the 1 agent that exists today (Ads Insights Analyst) properly
  before adding more agents on top of an untracked foundation.

**Phase 2 — Foundations for scale**
- Agent Workspace template (3.2)
- Agent Catalog list view (3.1)
- Ship 2–3 more Wave 1 agents using the template — each wired into the
  Phase 1 activity feed/review queue from day one, not bolted on after.

**Phase 3 — Orchestration & scale**
- Scheduled/event-triggered runs, agent handoffs (3.5)
- Analytics/ROI dashboard, aggregate autonomy view (3.6)

**Phase 4 — Governance & polish**
- Permissions, config/prompt versioning (3.7)
- Onboarding/changelog surfacing (3.8)

## 5. Explicitly out of scope for now

- The crack/shatter transition effect (removed; not being rebuilt unless
  asked again).
- Anything not tied to the AI Agents section itself (Task Manager, Deals,
  Reports etc. already exist independently). Agent activity/review is a
  dedicated surface (§3.3, decided) — explicitly not merged into Task
  Manager.
