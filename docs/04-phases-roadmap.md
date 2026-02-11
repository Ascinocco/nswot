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

## Phase 2 - Context Expansion and Comparability

**Goal**: improve strategic context and trend awareness.

### Scope

- Confluence integration (space selection, page ingestion, caching)
- Enhanced source summaries across profiles + Jira + Confluence
- Run-to-run comparison view ("what changed")
- Basic evidence quality metrics:
  - source coverage per SWOT item
  - confidence distribution
  - low-evidence flagging
- Export improvements (optional CSV/PDF if needed)

### Decision Value Delivered

- Captures process/design context missing from ticket data
- Supports trend detection, not just point-in-time snapshots
- Improves confidence in org-level strategic decisions

### Exit Criteria

- Confluence evidence appears in a meaningful share of SWOT items
- Users can compare at least two runs side by side
- Evidence quality metrics influence follow-up actions

---

## Phase 3 - Execution Reality and Triangulation

**Goal**: connect planning signals to engineering execution signals.

### Scope

- GitHub integration (repos, PRs, selective code evidence)
- Cross-source evidence triangulation (Profiles + Jira + Confluence + GitHub)
- Stronger recommendation engine for role-specific action plans
- Optional chat actions for controlled artifact creation (guard-railed)
- Advanced dashboards/visuals only if they improve decisions

### Decision Value Delivered

- Detects gaps between stated priorities and shipped work
- Surfaces delivery risk/quality issues earlier
- Produces higher-confidence decisions through multi-source corroboration

### Exit Criteria

- SWOT claims routinely reference more than one source type
- Users report improved decision confidence vs prior workflow
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

- **MVP (Phase 1)**: 6 weeks
- **Phase 2**: +4 to 6 weeks
- **Phase 3**: +4 to 8 weeks (depends on GitHub scope depth)

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

