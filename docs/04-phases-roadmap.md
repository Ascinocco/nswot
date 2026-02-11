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

- Run-to-run comparison view ("what changed")
- CSV/PDF export
- Chat-driven file generation
- VP of Engineering role

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

- User can run codebase analysis on selected repos via Claude CLI
- Codebase evidence appears in SWOT items with source citations
- Analysis works with and without codebase data (graceful degradation)
- User can create Jira issues/epics directly from chat recommendations with approval
- Every chat action has an audit trail and visible status
- Users can compare at least two runs side by side
- Follow-through metrics improve (fewer stale recommendations)

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

