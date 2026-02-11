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

## Phase 3 - Comparability and Advanced Features

**Goal**: trend awareness and repeated decision support.

### Scope

- Run-to-run comparison view ("what changed since last analysis")
- Themes layer / theme editor
- CSV/PDF export
- Optional chat actions for controlled artifact creation (guard-railed)
- Multi-step LLM pipeline (extraction -> synthesis -> SWOT)
- VP of Engineering role
- Windows/Linux packaging
- Advanced dashboards/visuals only if they improve decisions

### Decision Value Delivered

- Supports trend detection, not just point-in-time snapshots
- More granular control over analysis themes
- Broader audience through additional roles and platforms

### Exit Criteria

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
- **Phase 3**: +4 to 8 weeks (comparability, themes, export, multi-platform)

Re-evaluate after each phase based on user behavior, not feature count.

---

## Practical Success Metrics

Track these from Phase 1 onward:

- Analysis completion rate (successful runs / attempted runs)
- Evidence validity rate (items passing validation / total items)
- Repeat usage (workspaces with more than one run per month)
- Decision adoption rate (recommendations turned into tracked actions)
- Time-to-insight (run start to decision-ready output)

If these improve phase by phase, the product is doing its job.

