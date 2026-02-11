# nswot - Phase 2 Sprint Plan

> **Sprint plan for Phase 2: Context Expansion & Analysis Quality.**
> Continues from MVP (Phase 1) sprint numbering.
> All sprints are **1 week** and assume a single developer.

---

## Phase 2 Overview

Phase 2 adds Confluence and GitHub integrations, multi-source analysis pipeline, cross-source evidence triangulation, and evidence quality metrics. This combines the original Phase 2 scope (Confluence, quality metrics) with parts of Phase 3 (GitHub, cross-source triangulation) from the roadmap, reflecting the priority on analysis quality through broader signal coverage.

---

## Sprint 6 — Confluence Integration

**Goal**: Connect Confluence Cloud and fetch selected space data with caching and resilience.

- [x] `ConfluenceProvider`: REST API client — space listing, page content fetching (with pagination), page comments
- [x] `confluence.types.ts`: ConfluencePage, ConfluenceComment, ConfluenceSpace types
- [x] `ConfluenceService`: connection lifecycle, sync pipeline (spaces -> pages -> comments), cache via IntegrationCacheRepository
- [x] Resource types: `CONFLUENCE_PAGE`, `CONFLUENCE_COMMENT`
- [x] Circuit breaker instance for Confluence provider
- [x] Shared Atlassian OAuth: update existing Jira OAuth flow to request Confluence scopes (`read:confluence-content.all`, `read:confluence-space.summary`). Confluence reuses the same access token from `jira_tokens_{workspaceId}`.
- [x] Domain type updates: ConfluenceConfig, expand IntegrationConfig union, expand Integration.provider union
- [x] Error codes: `CONFLUENCE_AUTH_FAILED`, `CONFLUENCE_FETCH_FAILED`, `CONFLUENCE_RATE_LIMITED`
- [x] IPC channels + handlers for Confluence (connect via shared Atlassian token, disconnect, list spaces, sync)
- [x] Preload bridge additions for Confluence
- [x] Confluence setup UI on integrations page (space selection, connection status)

**Deliverable**: User can connect Confluence and pull page data into the cache. Same resilience patterns as Jira.

---

## Sprint 7 — GitHub Integration

**Goal**: Connect GitHub and fetch selected repo data with caching and resilience.

- [x] `GitHubProvider`: REST API client (PAT auth via Authorization header) — repo listing, PR fetching, issue fetching, PR review comment fetching
- [x] `github.types.ts`: GitHubRepo, GitHubPR, GitHubIssue, GitHubPRComment types
- [x] `GitHubService`: connection lifecycle, sync pipeline (repos -> PRs -> issues -> PR comments), cache via IntegrationCacheRepository
- [x] Resource types: `GITHUB_PR`, `GITHUB_ISSUE`, `GITHUB_PR_COMMENT`
- [x] Circuit breaker instance for GitHub provider
- [x] PAT-based auth: user provides a fine-grained PAT, stored in safeStorage as `github_pat_{workspaceId}`
- [x] Domain type updates: GitHubConfig, expand IntegrationConfig union
- [x] Error codes: `GITHUB_AUTH_FAILED`, `GITHUB_FETCH_FAILED`, `GITHUB_RATE_LIMITED`
- [x] IPC channels + handlers for GitHub (connect with PAT, disconnect, list repos, sync)
- [x] Preload bridge additions for GitHub
- [x] GitHub setup UI on integrations page (PAT input, repo selection, connection status)

**Deliverable**: User can connect GitHub and pull PR/issue data into the cache. Same resilience patterns as Jira.

---

## Sprint 8 — Multi-Source Analysis Pipeline

**Goal**: Wire Confluence + GitHub data into the analysis pipeline alongside profiles + Jira.

- [x] `collectConfluenceData()` in AnalysisService — load cached pages/comments, format as markdown
- [x] `collectGithubData()` in AnalysisService — load cached PRs/issues/comments, format as markdown
- [x] `formatConfluenceMarkdown()` — structured markdown from Confluence pages (title, content excerpt, comments)
- [x] `formatGithubMarkdown()` — structured markdown from GitHub PRs/issues (title, status, body, PR review comments)
- [x] Adaptive token budget: `calculateTokenBudget()` accepts list of connected sources, allocates proportionally
- [x] Prompt builder expansion: add `## Confluence Data` and `## GitHub Data` sections
- [x] Prompt builder: add cross-source triangulation instructions to system prompt
- [x] Anonymizer expansion: `scrubIntegrationAuthors()` strips @mentions from integration data
- [x] Evidence validator expansion: accept `confluence:` and `github:` source ID prefixes
- [x] Response parser: accept expanded sourceType values, optional confluence/github summaries
- [x] Expand RunAnalysisInput: `confluenceSpaceKeys`, `githubRepos`
- [x] Expand SummariesOutput: `confluence: string | null`, `github: string | null`
- [x] Update analysis run UI: Confluence space and GitHub repo selection checkboxes
- [x] Update payload preview to include Confluence + GitHub data sources
- [x] Update IPC handler for expanded previewPayload parameters

**Deliverable**: Analysis pipeline accepts all 4 source types. SWOT items can cite Confluence and GitHub evidence.

---

## Sprint 9 — Evidence Quality & Triangulation

**Goal**: Compute and display evidence quality metrics. Improve confidence calibration through cross-source correlation.

- [x] `quality-metrics.ts`: compute EvidenceQualityMetrics from SwotOutput
- [x] Quality score algorithm: composite of multi-source % (40), evidence density (30), high-confidence ratio (30)
- [x] Store quality metrics in analysis record (new `quality_metrics` column via migration 2)
- [x] Post-pipeline quality computation: compute metrics after evidence validation, store with results
- [x] System prompt update: explicit triangulation instructions
- [x] System prompt update: evidence density instructions
- [x] `QualityMetrics.tsx` component: source coverage, confidence distribution, quality score badge
- [x] Analysis results page: quality metrics panel alongside SWOT quadrants
- [x] Analysis history list: quality score badge per analysis
- [x] Confluence/GitHub summaries displayed in results view

**Deliverable**: Every analysis run produces a quality score. Users can see which claims are well-supported vs weakly-supported.

---

## Sprint 10 — Polish, Testing & Documentation

**Goal**: End-to-end testing, prompt tuning, documentation updates, edge case handling.

- [x] Phase 2 sprint document (`docs/10-phase2-sprints.md`)
- [x] Updated `docs/04-phases-roadmap.md` — mark Phase 2 scope as actual
- [ ] End-to-end test: run analysis with all 4 sources connected
- [ ] Prompt tuning: iterate on multi-source prompt based on real output quality
- [ ] Edge cases: empty Confluence spaces, repos with no PRs, single-source analyses
- [ ] Edge cases: Confluence connected to different Atlassian site than Jira
- [ ] Edge cases: GitHub rate limiting handling
- [ ] Performance: ensure sync pipeline handles large spaces/repos (pagination, cache limits)
- [ ] Update `docs/02-architecture-spec.md` for new providers/services
- [ ] Update `docs/05-domain-model.md` for expanded types
- [ ] Update `docs/08-prompt-engineering.md` for multi-source prompts and token budgets

**Deliverable**: Phase 2 is production-ready. Documentation reflects current state.

---

## Key Architecture Decisions (Phase 2)

### Auth Strategy
- **Confluence**: Shared Atlassian OAuth — reuses Jira's OAuth tokens by adding Confluence API scopes to the existing flow
- **GitHub**: Personal Access Token (PAT) — stored in safeStorage, validated on connect via `/user` endpoint

### Token Budget (Phase 2 — Adaptive)
- Profiles: 30%, Buffer: 10%
- Remaining 60% split proportionally among connected sources
- 3 sources connected: each gets 20%
- 2 sources: each gets 30%
- 1 source: gets 60%

### Evidence Source Types
```ts
type EvidenceSourceType = 'profile' | 'jira' | 'confluence' | 'github';
```

### Quality Score Algorithm (0-100)
- Multi-source ratio: (items with 2+ source types / total) x 40
- Evidence density: min(avg evidence per item / 3, 1) x 30
- High-confidence ratio: (high confidence items / total) x 30

### DB Migration (v2)
- Added `quality_metrics TEXT` column to analyses table

---

## Summary Timeline

| Sprint | Week | Focus | Key Output |
|---|---|---|---|
| 6 | 1 | Confluence integration | Confluence connection + sync + cache |
| 7 | 2 | GitHub integration | GitHub connection + sync + cache |
| 8 | 3 | Multi-source pipeline | Analysis from 4 source types |
| 9 | 4 | Quality & triangulation | Quality metrics + confidence calibration |
| 10 | 5 | Polish & docs | Testing, tuning, documentation |

**Total: 5 weeks**
