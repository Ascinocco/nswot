# nswot - Phased Roadmap for Repeated Decision Making

This roadmap defines how nswot grows from a focused MVP into a repeatable decision platform without overloading initial delivery.

---

## Why a Phased Roadmap

The product goal is not one-off analysis. It is **repeated, defensible decisions** over time.

To support that, we need:

- trusted evidence quality
- stable run-to-run comparability
- broader signal inputs (Jira, Confluence, GitHub)
- operational reliability for weekly/monthly use

Phasing preserves momentum while reducing execution risk.

---

## Product North Star

For each analysis cycle, a user should be able to answer:

1. What are our most important strengths, weaknesses, opportunities, and threats?
2. What concrete evidence supports each claim?
3. What changed since the last cycle?
4. What decision should we make now?

---

## Phase 1 - Trustworthy Core Loop (MVP)

**Goal**: reliable decision support using profiles + Jira only.

### Scope

- Workspace-based desktop app
- Profiles CRUD/import
- Jira Cloud integration
- Single-pass SWOT generation with evidence and confidence
- Analysis history
- Grounded chat (read/advise only)
- Markdown export

### Decision Value Delivered

- Enables a repeatable weekly/monthly review using two high-value sources
- Produces documented, evidence-backed recommendations
- Creates a baseline artifact for future comparisons

### Exit Criteria

- User can run full loop without manual recovery
- Each SWOT item has valid evidence references
- Input preview shown before LLM send
- Failed runs present actionable errors
- Team can use output directly in planning/staff sync

---

## Phase 2 - Context Expansion & Analysis Quality (Completed)

**Goal**: broader signal inputs and evidence quality through multi-source triangulation.

> Sprint plan: `docs/10-phase2-sprints.md`

### Scope (Actual)

- Confluence Cloud integration (shared Atlassian OAuth, space selection, page/comment ingestion, caching, circuit breaker)
- GitHub integration (PAT auth, repo selection, PR/issue/comment ingestion, caching, circuit breaker)
- Multi-source analysis pipeline: profiles + Jira + Confluence + GitHub
- Adaptive token budget allocation (proportional to connected sources)
- Cross-source evidence triangulation instructions in system prompt
- Evidence quality metrics (quality score 0-100, multi-source ratio, confidence distribution, source coverage)
- Quality metrics stored per analysis, displayed in results and history
- Anonymizer expansion for integration author scrubbing

### Decision Value Delivered

- Captures process/design context from Confluence missing from ticket data
- Surfaces delivery/execution patterns from GitHub PRs and issues
- Higher-confidence claims through multi-source evidence corroboration
- Quality score helps users gauge which claims are well-supported

### Deferred to Phase 3

- Run-to-run comparison view (Phase 3d)
- CSV/PDF export (Phase 3d)
- Chat-driven file generation (Phase 3e)
- VP of Engineering role (Phase 3d)

---

## Phase 3 - Codebase Intelligence & Comparability

**Goal**: deep codebase analysis as a SWOT data source, plus trend awareness through run-to-run comparison.

> Feature plan: `docs/11-codebase-analysis-plan.md`

### Scope

**Codebase Analysis (Phase 3a)**
- Claude CLI integration for agentic code exploration (architecture, quality, tech debt, risks)
- Two-tier LLM architecture: Claude CLI (per-repo analysis) → OpenRouter (SWOT synthesis)
- Local clone of selected repos with full Claude CLI tool access (Read, Glob, Grep, Bash)
- Jira MCP cross-reference: correlate code patterns with Jira issues
- Codebase analysis caching (24h TTL, manual re-analyze)
- Claude CLI prerequisite validation (installed, authenticated, Jira MCP)
- New evidence source type: `codebase:{owner/repo}`
- Codebase Patterns summary card in results view
- Progress reporting per repo (cloning → analyzing → done)

**Chat Actions (Phase 3c)**
- Tool-use bridge: OpenRouter drafts artifacts via tool_use, Claude CLI executes via MCP
- Jira actions: create issues (epic/story/task/bug), batch create linked issues, add comments
- Confluence actions: create pages
- GitHub actions: create issues, create PRs
- Mandatory user approval before every action (approval card UI with edit/reject/create)
- Action audit trail (`chat_actions` table)
- Available actions detected from connected integrations

> Feature plan: `docs/12-chat-actions-plan.md`

**Comparability & Advanced Features (Phase 3d)**
- Run-to-run comparison view ("what changed since last analysis")
- Themes layer / theme editor
- CSV/PDF export
- Multi-step LLM pipeline (extraction -> synthesis -> SWOT)
- VP of Engineering role
- macOS x64 (Intel) builds

**Platform Maturity & Multi-Provider (Phase 3e)**

_Visualization & File Generation:_
- Mermaid/chart visualizations: D3/Chart.js for interactive data viz (theme distribution, SWOT heatmaps, coverage charts); Mermaid rendering in-app for dependency maps, flowcharts, org charts
- Chat-driven local file generation: chat can write markdown, CSV, and Mermaid (`.mmd`) files to workspace with user approval

_Multi-Provider:_
- Multi-provider LLM support: switch between OpenRouter and direct Anthropic API (Claude) for SWOT analysis; factory-based provider selection via `LLMProvider` interface
- Multi-provider codebase analysis: switch between Claude CLI and OpenCode for repo analysis; extends `CodebaseProvider` with provider selection

_UX Enhancements:_
- Editor context in chat: open file path, content, and selected text available as chat context
- De-anonymization hover: hover over anonymized labels in SWOT results to reveal real names locally (never sent to LLM)
- First-launch onboarding wizard: guided setup for API keys, integrations, and first analysis
- App menu and keyboard shortcuts: native macOS menu with standard shortcuts
- Profile tags/themes manual field: manually assign theme tags to profiles before analysis

_Infrastructure:_
- Structured logging: centralized logger with log levels and optional file output
- File system watching: live sidebar updates when workspace files change externally
- Auto-update infrastructure: Electron auto-updater integrated with CI/CD release pipeline

> Sprint decomposition for Phase 3e is pending.

### Prerequisites (New)

Users must have for codebase analysis and chat actions:
- Claude CLI installed and authenticated (Pro, Max, or Team plan)
- Jira MCP server configured in Claude CLI (for cross-referencing Jira issues with code, and for creating Jira artifacts from chat)
- Confluence MCP server configured in Claude CLI (optional, for creating Confluence pages from chat)
- GitHub MCP server configured in Claude CLI (optional, for creating GitHub issues/PRs from chat)
- Git installed (for cloning repos)
- OpenRouter API key (existing requirement)

### Decision Value Delivered

- Surfaces architecture health, technical debt, and code quality risks — evidence types invisible to process-only analysis
- Staff engineers get code-level evidence for SWOT claims ("auth module has 0% test coverage" vs "there are auth-related bugs")
- Jira-code cross-reference connects process signals to specific codebase locations
- Chat actions close the insight-to-action gap — recommendations become tracked work without leaving the app
- Run-to-run comparison supports trend detection, not just point-in-time snapshots
- Broader audience through additional roles and platforms

### Exit Criteria

**Phase 3d (Delivered):**
- [x] User can run codebase analysis on selected repos via Claude CLI
- [x] Codebase evidence appears in SWOT items with source citations
- [x] Analysis works with and without codebase data (graceful degradation)
- [x] User can create Jira issues/epics directly from chat recommendations with approval
- [x] Every chat action has an audit trail and visible status
- [x] Users can compare at least two runs side by side
- [x] Multi-step LLM pipeline (extraction -> synthesis -> SWOT) operational
- [x] Themes are extracted and editable
- [x] CSV and PDF export functional
- [x] VP of Engineering role available
- [x] macOS x64 (Intel) builds
- [x] E2E integration tests validate cross-feature flows (pipeline, comparison, export, themes)

**Deferred to Phase 3e:**
- User can run SWOT analysis via either OpenRouter or direct Anthropic API
- User can run codebase analysis via either Claude CLI or OpenCode
- Chat can write markdown, CSV, and Mermaid files to workspace with user approval
- Mermaid diagrams render in-app; at least one interactive D3/Chart.js chart in results
- First-launch wizard completes successfully for new users
- Auto-update downloads and applies updates from GitHub Releases
- Follow-through metrics improve (fewer stale recommendations)

---

## Phase 4 — Chat-Driven Agent Experience

**Goal**: transform nswot into a chat-driven agent interface where analysis, exploration, and action all flow through conversational interaction powered by an agent harness with tool-use.

> Feature plan: `docs/18-phase4-chat-experience-plan.md`

### Scope

**Core Transformation:**
- Analysis page transitions instantly to full-page chat view on "Run Analysis"
- Agent streams initial analysis as rich content blocks (SWOT cards, summary cards, quality metrics)
- Status bar: agent state, source activity icons, running token count + cost estimate, stop button
- Chatbox anchored to bottom, scrollable message area between status bar and input

**Rich Content Blocks:**
- `ContentBlock[]` replaces plain text in chat messages — typed blocks rendered as React components
- Block types: text, swot_analysis, summary_cards, quality_metrics, mermaid, chart, data_table, comparison, approval, action_status
- Mermaid diagrams and D3/Chart.js charts rendered inline as SVG, exportable to PNG via SVG-to-canvas pipeline

**Agent Harness:**
- Tool registry with categorized tools: render (no approval), read (no approval), write (requires approval)
- Execution loop: send → tool_use → execute tool → tool_result → repeat until final text response
- Approval gates pause the loop for write tools, resume on user decision
- Interrupt handling: stop button cancels in-flight request, stores partial response

**Approval Memory (3-Tier):**
- Yes — approve this specific action (one-time)
- Yes + Remember — auto-approve all future actions of this tool type for rest of conversation
- No — reject
- Scope: per-conversation, resets on new conversation

**Re-run in Conversation:**
- "Run again with VP perspective" creates new analysis record linked to same conversation
- Multiple pinned summaries in one conversation thread
- New `conversation_id` and `parent_analysis_id` columns on `analyses` table

**Observability:**
- Token count and cost estimate visible in status bar throughout conversation
- Agent state indicator (Analyzing / Thinking / Fetching data / Ready)
- Source activity icons show which integrations are being queried

### Prerequisites

- Phase 3 complete (all sub-phases 3a through 3e)
- Existing tool-use bridge (Phase 3c) provides foundation for agent harness
- Existing content rendering components (SWOT cards, summary cards) available for reuse as content blocks

### Decision Value Delivered

- Eliminates context-switching between analysis results page and chat — everything in one conversational flow
- Multi-turn agentic follow-ups let users drill deeper without leaving the interface
- Rich inline content (diagrams, tables, SWOT cards) replaces static page layouts with dynamic exploration
- Approval memory reduces friction for repeated actions while maintaining user control
- Re-run capability supports rapid iteration ("same data, different role" or "updated profiles, re-analyze")

### Exit Criteria

- Analysis page transitions to chat view on "Run Analysis" and streams initial results as content blocks
- All 10 content block types render correctly in the chat message area
- Agent harness completes multi-turn tool-use loops (render + read tools) without manual intervention
- Write tools pause for user approval; "Yes + Remember" auto-approves subsequent same-type actions in the conversation
- Re-run creates a new analysis record in the same conversation with a pinned summary
- Mermaid diagrams and at least one D3/Chart.js chart render inline and export to PNG
- Token count and cost estimate update in real-time in the status bar
- Stop button interrupts in-flight agent turns and preserves partial responses
- Existing Phase 3 chat actions (Jira/Confluence/GitHub creates) work through the new agent harness

---

## Cross-Phase Guardrails

These remain true in every phase:

- Local-first by default
- Strict workspace path security
- Secrets in OS keychain via `safeStorage`
- "No evidence, no claim" policy
- Explicit handling of uncertainty (low confidence vs forced certainty)

---

## Prioritization Rules

When choosing between features, prioritize in this order:

1. Trustworthiness of outputs
2. Reliability of the run pipeline
3. Comparability over time
4. Breadth of integrations
5. Visual polish

---

## Suggested Release Cadence

- **MVP (Phase 1)**: 6 weeks (completed)
- **Phase 2**: +5 weeks (completed — Confluence, GitHub, quality metrics, multi-source pipeline)
- **Phase 3a**: +2 weeks (codebase analysis via Claude CLI — see `docs/11-codebase-analysis-plan.md`)
- **Phase 3c**: +2 weeks (chat actions via tool-use bridge — see `docs/12-chat-actions-plan.md`)
- **Phase 3b-3d**: +7 weeks with two-agent parallel execution (see `docs/16-parallel-sprint-plan.md`)
- **Phase 3e**: TBD (platform maturity, multi-provider, visualizations, UX polish — sprint plan pending)
- **Phase 4**: +6 weeks with two-agent parallel execution (see `docs/18-phase4-chat-experience-plan.md`)

> Phase 3b through 3d are planned for two concurrent agents. Sprint 13 (Phase 3b) and Sprint 14 (Phase 3c) run simultaneously. Phase 3d is decomposed into Sprints 16-21 with comparison, multi-step pipeline, themes, export, VP role, and x64 builds. See `docs/16-parallel-sprint-plan.md` for the full two-agent execution model, dependency gates, and merge plan.

Re-evaluate after each phase based on user behavior, not feature count.

Release channel and CI/CD policy (active):

- `main` publishes prereleases
- `release/*` publishes production releases
- Quality gates before release: typecheck and tests (lint added when ESLint is introduced)
- Canonical spec: `docs/13-ci-cd-and-release.md`
- Operations runbook: `docs/14-release-operations-runbook.md`

---

## Practical Success Metrics

Track these from Phase 1 onward:

- Analysis completion rate (successful runs / attempted runs)
- Evidence validity rate (items passing validation / total items)
- Repeat usage (workspaces with more than one run per month)
- Decision adoption rate (recommendations turned into tracked actions)
- Time-to-insight (run start to decision-ready output)

If these improve phase by phase, the product is doing its job.

