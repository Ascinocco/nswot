# ADR-002: Single-Pass Analysis Pipeline for MVP

**Status**: Accepted
**Date**: 2025-02-10
**Context**: Choosing the analysis pipeline complexity for MVP

---

## Decision

The MVP analysis pipeline uses a **single LLM call** (single-pass) to produce the SWOT output. Multi-step chaining (theme refinement -> evidence mapping -> SWOT generation) is deferred to Phase 2.

---

## Context

The full architecture vision describes a 3-step LLM pipeline:
1. Theme Refinement — extract organizational themes
2. Evidence Mapping — tag evidence to themes
3. SWOT Generation — produce cited SWOT from theme-evidence map

This produces higher quality output but adds complexity:
- 3x LLM calls per analysis (cost, latency, failure points)
- Intermediate state management between steps
- More complex error recovery (which step failed? retry from where?)
- More prompt engineering surface area

For MVP, we need to validate the core loop: does an evidence-backed SWOT provide real value?

---

## Rationale

### Why single-pass for MVP

- **Faster iteration**: One prompt to tune, one response to parse. We can rapidly iterate on prompt quality.
- **Simpler error handling**: One call fails or succeeds. No partial pipeline state to manage.
- **Lower cost per run**: 1 LLM call vs 3. Users experimenting with the tool will appreciate lower API costs.
- **Faster execution**: 20-40 seconds vs 60-120 seconds per analysis.
- **Sufficient for validation**: A single well-crafted prompt with clear schema instructions can produce high-quality SWOT output from profiles + Jira data. Multi-step chaining is an optimization, not a requirement.

### Why multi-step is planned for Phase 2

- **Better evidence quality**: Separating theme extraction from SWOT generation reduces hallucination risk.
- **User-editable themes**: Theme refinement as a separate step allows users to review and edit themes before SWOT generation (Phase 2 feature).
- **Cross-source triangulation**: When Confluence and GitHub are added (Phases 2-3), the evidence volume increases. Multi-step helps manage token budgets across more sources.

---

## Consequences

**Positive:**
- Simpler codebase for MVP (one prompt template, one parser)
- Faster analysis runs
- Easier debugging (one LLM response to inspect)
- Lower API cost per run

**Negative:**
- Output quality may be slightly lower than multi-step (themes may be less refined)
- Harder to attribute errors to specific reasoning steps
- When transitioning to multi-step in Phase 2, the orchestrator will need to be refactored

**Mitigations:**
- Invest in prompt quality: clear schema, strong constraints, concrete examples in the prompt
- Store `rawLlmResponse` for debugging
- Design the orchestrator with step interfaces from day one (even though MVP has only one step), so adding steps later doesn't require a rewrite

---

## Transition Plan (Phase 2)

When transitioning to multi-step:

1. Define a `PipelineStep` interface: `{ name, execute(input) -> output }`
2. The single-pass prompt becomes the first `SwotGenerationStep`
3. Add `ThemeRefinementStep` and `EvidenceMappingStep` before it
4. Orchestrator iterates over an ordered list of steps
5. Each step's output becomes the next step's input
6. Progress events fire per step

The single-pass prompt remains available as a fallback mode (useful for quick re-runs or when users don't need theme refinement).
