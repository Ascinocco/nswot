# ADR-006: Claude CLI for Codebase Analysis

**Status**: Proposed
**Date**: 2025-02-11
**Context**: Phase 3 — Codebase Intelligence

---

## Decision

Use Claude CLI as the engine for deep codebase analysis, spawned as a subprocess from the Electron main process. Repos are cloned locally and Claude CLI is given full read-only filesystem access to the clone. This creates a two-tier LLM architecture: Claude CLI (Tier 1, per-repo code exploration) feeds structured findings into the OpenRouter-based SWOT synthesis (Tier 2).

---

## Context

The current GitHub integration (Phase 2) fetches process metadata — PRs, issues, review comments — but has no visibility into the actual codebase. Staff engineers performing org-level SWOT analysis need code-level evidence: architecture health, tech debt patterns, test coverage gaps, dependency risks.

Four approaches were considered:

### Option A: Fetch Code Signals via GitHub API

Fetch targeted artifacts (file tree, README, dependency manifests, CI config, commit frequency) through the GitHub REST API.

- **Pros**: No new dependencies, fast, cheap, works within existing provider pattern
- **Cons**: Shallow analysis — can see file structure but not understand architecture, detect patterns, or correlate code with org problems. No ability to read and reason about code.

### Option B: Clone + Custom Static Analysis

Clone repos locally, run static analysis tools (ESLint, dependency scanners, complexity metrics), aggregate results.

- **Pros**: No LLM cost, deterministic, fast
- **Cons**: Language-specific tooling, limited to what static analyzers detect, no reasoning about architecture or cross-cutting concerns. Significant engineering effort per language.

### Option C: Claude CLI via GitHub MCP (Remote)

Invoke Claude CLI with GitHub MCP for remote code access — no cloning.

- **Pros**: No disk footprint, no clone management, always up-to-date
- **Cons**: Every file read is an API call — slow for bulk operations. GitHub API rate limits throttle thorough analysis. No native `git log`, `grep`, or `find` across the full codebase. Analysis depth limited by API pagination.

### Option D: Clone + Claude CLI with Local Tools (Chosen)

Clone repos locally, invoke Claude CLI with `cwd` set to the clone. Claude uses native filesystem tools (`Read`, `Glob`, `Grep`, `Bash`) for exploration.

- **Pros**: Full tool access — grep across the entire codebase, git log for churn analysis, find for file discovery. Fast, no rate limits, no network dependency during analysis. This is the workflow Claude CLI was designed for. Cross-reference with Jira via MCP.
- **Cons**: Requires disk space for clones (mitigated by shallow clones). Requires Git installed. Clone can become stale (mitigated by pull-before-analyze).

---

## Rationale

Option D was chosen because:

1. **Analysis depth**: Local filesystem access gives Claude the full power of `Grep`, `Glob`, `Read`, and `Bash(git log)`. Grepping for TODO density across thousands of files is instant locally but impractical through API pagination. Git history analysis (churn, blame, contributor patterns) requires local access.

2. **Performance**: No API rate limits, no network round-trips per file read. A thorough analysis that might hit GitHub API limits in minutes runs freely against a local clone.

3. **Target user alignment**: nswot targets staff engineers who already have Claude CLI, Git, and disk space. The shallow clone overhead (~100MB per repo) is negligible.

4. **Language agnosticism**: A single analysis prompt works across any language or framework, unlike static analysis which requires per-language tooling.

5. **Jira MCP synergy**: Claude CLI with Jira MCP can cross-reference codebase patterns with Jira issues, producing uniquely valuable evidence that combines code and process signals.

6. **Architecture fit**: The provider pattern (ADR-005) already accommodates a new provider that wraps a local subprocess instead of an HTTP API. No architectural changes needed.

---

## Consequences

### Positive

- Codebase evidence fills the biggest gap in the current analysis pipeline
- Claude CLI with local tools produces the deepest, most reliable analysis
- Two-tier architecture keeps the SWOT synthesis prompt lean (condensed summaries, not raw code)
- Read-only tool restrictions make the analysis safe and side-effect-free
- Caching (24h TTL) prevents redundant re-analysis

### Negative

- **New prerequisites**: Users must have Claude CLI installed and authenticated, plus Git. This narrows the potential user base.
- **Disk space**: Cloned repos consume local storage. Mitigated by shallow clones and user-facing cleanup controls.
- **Cost exposure**: Each repo analysis consumes Claude API tokens (via the user's own subscription). Cost is not directly controllable by nswot.
- **Latency**: Agentic exploration takes 1-5 minutes per repo. Must be run as a separate step before the SWOT analysis, with clear progress reporting.
- **Output variability**: Claude CLI output is non-deterministic. The structured JSON schema and corrective retry mitigate this, but two analyses of the same repo may produce different findings.

### Risks

- Claude CLI breaking changes (flags, output format) could break the integration. Mitigated by pinning to known CLI behavior and testing in CI.
- Users may not understand the cost implications. Mitigated by showing estimated token usage before analysis.

---

## Alternatives Considered

See Options A, B, and C above. Option A may still be implemented as a lightweight fallback for users without Claude CLI.
