# nswot — Parallelized Sprint Plan (Sprint 13 → 21)

> **Two-agent execution model for Phase 3b through Phase 3d.**
> Reorganizes Sprints 13-21 for two concurrent agents with minimal merge conflicts and explicit dependency gates.
> Feature scope is unchanged — only sequencing and work packaging are modified.

**Prerequisite**: Sprint 12 (Phase 3a pipeline integration) is complete and merged to `main`.

**Sprint 13: Completed by Agent A, Week 1.**
**Sprint 14 Foundation: Completed by Agent B, Week 1. Gate 1 artifacts ready for review.**

---

## Overview

Single-developer baseline: 9 sprints (Sprint 13 → 21).
Two-agent parallel plan: **7 weeks** (22% compression).

Key insight: Sprint 13 (Phase 3b — codebase polish) and Sprint 14 (Phase 3c — chat actions) are **independent**. Phase 3c depends on Phase 3a infrastructure (Sprints 11-12), not Phase 3b. This unlocks the first parallelization window.

---

## 1) Current Sprint Inventory (13 → 21)

### Sprint 13 — Phase 3b: Codebase Analysis Polish

*Source: `docs/11-codebase-analysis-plan.md` § Phase 3b*

| # | Task | Dep Type | Conflict-Risk Files | Status |
|---|------|----------|---------------------|--------|
| 13.1 | Jira MCP detection + conditional cross-reference prompt | Independent | `src/main/providers/codebase/codebase-prompt.ts`, `codebase.provider.ts` | [x] |
| 13.2 | Stale analysis detection (compare `pushed_at` vs `analyzedAt`) | Independent | `src/main/services/codebase.service.ts` | [x] |
| 13.3 | Re-analyze from UI | Soft dep on 13.2 | `src/renderer/components/integrations/`, `src/main/ipc/handlers/codebase.ipc.ts` | [x] |
| 13.4 | Cloned repo cleanup UI (storage display, clear all) | Independent | `src/renderer/components/integrations/`, `codebase.service.ts` | [x] |
| 13.5 | Full clone option for git history analysis | Independent | `codebase.service.ts`, `codebase.provider.ts` | [x] |
| 13.6 | Prompt tuning based on real output quality | Independent | `codebase-prompt.ts` | [x] |
| 13.7 | Testing: various repo sizes, languages, monorepo | Independent | `codebase.provider.test.ts`, `codebase.service.test.ts` | [x] |
| 13.8 | Documentation updates | Independent | `docs/*` | [x] |

**Critical observation**: Sprint 13 does NOT block Sprint 14. Phase 3c depends on Phase 3a infrastructure (Sprints 11-12), not Phase 3b. Confirmed by `docs/12-chat-actions-plan.md` § Scope: "Depends on: Phase 3a (codebase analysis) for Claude CLI infrastructure."

---

### Sprint 14 — Phase 3c: Tool-Use Bridge + Jira Actions

*Source: `docs/12-chat-actions-plan.md` § Sprint 14*

| # | Task | Dep Type | Conflict-Risk Files |
|---|------|----------|---------------------|
| 14.1 | OpenRouter tool-use integration in chat service (stream parsing for `tool_calls`, `finish_reason` detection) | Hard dep on Sprint 12 (existing chat service) | **`src/main/services/chat.service.ts`** (HOT) |
| 14.2 | ~~ActionExecutor: spawn Claude CLI with MCP-scoped prompt, parse result~~ [x] | Independent (reuses CodebaseProvider pattern) | NEW `src/main/providers/actions/action-executor.ts` |
| 14.3 | Pending action IPC event flow (main → renderer) | Soft dep on 14.1 | `src/main/ipc/handlers/chat.ipc.ts`, `src/main/ipc/channels.ts` |
| 14.4 | Approval/rejection IPC handlers (renderer → main) | Soft dep on 14.3 | `chat.ipc.ts`, `channels.ts`, `src/preload/api.ts` |
| 14.5 | ~~`chat_actions` table (migration) + ChatActionRepository~~ [x] | Independent | NEW migration, NEW `src/main/repositories/chat-action.repository.ts` |
| 14.6 | Approval card component in chat panel | Soft dep on 14.3 IPC contract | NEW `src/renderer/components/chat/approval-card.tsx`, `chat-panel.tsx` |
| 14.7 | Action status display (executing, success, failed) | Soft dep on 14.6 | NEW `src/renderer/components/chat/action-status.tsx` |
| 14.8 | ~~Jira actions: tool definitions + CLI prompts~~ [x] | Independent | NEW `src/main/providers/actions/action-tools.ts`, `action.types.ts` |
| 14.9 | Chat system prompt update with action instructions | Soft dep on 14.1 | `src/main/analysis/prompt-builder.ts` or `chat.service.ts` |

---

### Sprint 15 — Phase 3c: Confluence + GitHub Actions + Polish

*Source: `docs/12-chat-actions-plan.md` § Sprint 15*

| # | Task | Dep Type | Conflict-Risk Files |
|---|------|----------|---------------------|
| 15.1 | Confluence action: create page tool def + CLI prompt | Hard dep on Sprint 14 (ActionExecutor exists) | `action-tools.ts`, `action-executor.ts` |
| 15.2 | GitHub actions: create issue + create PR tool defs + CLI prompts | Hard dep on Sprint 14 | `action-tools.ts`, `action-executor.ts` |
| 15.3 | Edit capability in approval cards | Soft dep on 14.6 | `approval-card.tsx` |
| 15.4 | Action history display in chat (inline status cards) | Soft dep on 14.5 | `chat-panel.tsx`, NEW `action-history.tsx` |
| 15.5 | Available actions detection (scope tools to connected integrations) | Hard dep on 14.1, 14.8 | `chat.service.ts` |
| 15.6 | Error handling: CLI failures, MCP errors, partial batch failures | Hard dep on 14.2 | `action-executor.ts`, `chat.service.ts` |
| 15.7 | Testing: tool-use stream parsing, approval flow, action execution | Hard dep on all Sprint 14 | test files |

---

### Phase 3d — Sprints 16-21: Comparability & Advanced Features

*Source: `docs/04-phases-roadmap.md` § Phase 3d*

No detailed sprint doc existed prior to this plan. The stated Phase 3d scope is decomposed into 6 sprints below.

**Sprint 16: Run-to-Run Comparison Backend**

| # | Task | Dep Type | Conflict-Risk Files |
|---|------|----------|---------------------|
| 16.1 | ComparisonService: diff two analyses, produce structured changeset | Independent | NEW `src/main/services/comparison.service.ts` |
| 16.2 | Repository extensions: find analyses for comparison (by workspace, ordered) | Independent | `src/main/repositories/analysis.repository.ts` |
| 16.3 | Diff algorithm: item-level matching by claim similarity, score deltas | Independent | NEW `src/main/domain/comparison.types.ts` |
| 16.4 | Comparison IPC handlers | Soft dep on 16.1 | `channels.ts`, NEW `comparison.ipc.ts` |

**Sprint 17: Run-to-Run Comparison UI**

| # | Task | Dep Type | Conflict-Risk Files |
|---|------|----------|---------------------|
| 17.1 | Comparison route and navigation | Hard dep on 16 | `src/renderer/App.tsx`, NEW `src/renderer/routes/comparison.tsx` |
| 17.2 | Side-by-side diff visualization (added/removed/changed items) | Hard dep on 16.3 | NEW renderer components |
| 17.3 | Comparison selection UI (pick two analyses to compare) | Soft dep on 16 | `analysis-history.tsx` |

**Sprint 18: Multi-Step LLM Pipeline**

| # | Task | Dep Type | Conflict-Risk Files |
|---|------|----------|---------------------|
| 18.1 | Refactor `analysis/orchestrator.ts` to step-chain architecture | Independent | **`src/main/analysis/orchestrator.ts`** (MAJOR), `analysis.service.ts` |
| 18.2 | Define StepResult interface, step registry | Independent | NEW `src/main/analysis/pipeline-step.ts` |
| 18.3 | Extraction step (theme/signal extraction from raw data) | Soft dep on 18.1 | NEW `src/main/analysis/steps/extraction.ts` |
| 18.4 | Synthesis step (cross-source correlation) | Soft dep on 18.1 | NEW `src/main/analysis/steps/synthesis.ts` |
| 18.5 | SWOT generation step (produces final SwotOutput) | Soft dep on 18.1 | NEW `src/main/analysis/steps/swot-generation.ts` |
| 18.6 | Per-step corrective prompt on parse failure | Soft dep on 18.1 | `response-parser.ts`, step implementations |

**Sprint 19: Themes Layer**

| # | Task | Dep Type | Conflict-Risk Files |
|---|------|----------|---------------------|
| 19.1 | Theme extraction as a pipeline step | Hard dep on Sprint 18 (multi-step pipeline) | NEW `src/main/analysis/steps/theme-extraction.ts` |
| 19.2 | Theme types + storage | Independent | `domain/types.ts`, NEW migration |
| 19.3 | Theme repository | Independent | NEW `src/main/repositories/theme.repository.ts` |
| 19.4 | Theme editor UI | Soft dep on 19.1-19.3 | NEW `src/renderer/routes/themes.tsx`, NEW components |

**Sprint 20: CSV/PDF Export + VP Role**

| # | Task | Dep Type | Conflict-Risk Files |
|---|------|----------|---------------------|
| 20.1 | CSV export method in ExportService | Independent | `src/main/services/export.service.ts` |
| 20.2 | PDF generation (add dependency, template) | Independent | `export.service.ts`, `package.json` |
| 20.3 | Export UI: format picker (MD/CSV/PDF) | Soft dep on 20.1-20.2 | renderer export components |
| 20.4 | VP of Engineering role definition | Independent | `domain/types.ts` (role union), `prompt-builder.ts`, `docs/08-prompt-engineering.md` |
| 20.5 | macOS x64 (Intel) build target | Independent | `electron-builder.yml`, CI workflow |

**Sprint 21: Integration Testing + Documentation**

| # | Task | Dep Type | Conflict-Risk Files |
|---|------|----------|---------------------|
| 21.1 | Cross-feature E2E tests | Hard dep on all prior | test files |
| 21.2 | Documentation updates for Phase 3 | Independent | `docs/*` |
| 21.3 | Phase 3d exit criteria validation | Hard dep on all prior | — |

---

## 2) Parallelization Strategy (Two-Agent Model)

### Guiding Principles

1. **Vertical ownership**: Each agent owns distinct files for each sprint-week. Cross-file edits to the same file in the same week are prohibited unless behind a gate.
2. **Interface-first**: Types, IPC channels, and function signatures are frozen before dependent work begins.
3. **Backend/frontend split when natural**: Many sprints split cleanly into main-process vs renderer work.
4. **New files are safe**: Creating new files never conflicts. Maximize new-file work in parallel tracks.

---

### Week 1 — Sprint 13 ∥ Sprint 14 Foundation

**Prerequisite**: Sprint 12 (Phase 3a pipeline integration) is complete and merged to `main`.

#### Track A: Phase 3b — Codebase Polish (all of Sprint 13)

| Field | Detail |
|-------|--------|
| Scope | Tasks 13.1–13.8 (complete Sprint 13) |
| Prerequisites | Sprint 12 merged |
| Expected outputs | Modified: `codebase.provider.ts`, `codebase.service.ts`, `codebase-prompt.ts`, `codebase.ipc.ts`. New/modified renderer integration components. Test files. |
| Merge gate | All codebase analysis tests pass. Codebase IPC channels stable. |

#### Track B: Phase 3c — Actions Foundation (Sprint 14 new components only)

| Field | Detail |
|-------|--------|
| Scope | ~~Tasks 14.2, 14.5, 14.8 — ActionExecutor, ChatActionRepository + migration, tool definitions + types. All NEW files. Does NOT touch `chat.service.ts`.~~ **COMPLETED** |
| Prerequisites | Sprint 12 merged (for CodebaseProvider pattern reference) |
| Expected outputs | NEW: `providers/actions/action-executor.ts`, `action-tools.ts`, `action.types.ts`, `repositories/chat-action.repository.ts`, migration SQL. Tests for each. |
| Merge gate | ActionExecutor can spawn Claude CLI and parse JSON result. ChatActionRepository CRUD works against in-memory SQLite. Tool definitions pass type checks. |

**Conflict risk**: LOW. Agent A touches codebase-specific files. Agent B creates entirely new files. Only `channels.ts` is touched by both (Agent A adds codebase channels, Agent B adds action channels), resolvable with a trivial merge.

**Can start immediately**: Yes, both tracks. Sprint 12 completion is the only prerequisite.

---

### Week 2 — Sprint 14 Integration (Backend ∥ Frontend)

#### Track A: Tool-Use Bridge Backend (Sprint 14 backend wiring)

| Field | Detail |
|-------|--------|
| Scope | Tasks 14.1, 14.3, 14.4, 14.9 — Wire tool-use detection into `chat.service.ts`, action IPC handlers, system prompt update. |
| Prerequisites | Week 1 Track B merged (ActionExecutor, types, and repository exist) |
| Expected outputs | Modified: `chat.service.ts` (tool_calls stream parsing, pending action emission), `chat.ipc.ts` (action approve/reject/list handlers), `channels.ts` (action channels), `preload/api.ts` (bridge additions). |
| Merge gate | Tool-use stream parsing works with mock OpenRouter responses. IPC round-trip for approve/reject returns correct data. `chat.service.ts` tests pass. |

#### Track B: Approval Card Frontend (Sprint 14 renderer)

| Field | Detail |
|-------|--------|
| Scope | Tasks 14.6, 14.7 — Approval card component, action status component, chat panel integration. |
| Prerequisites | Interface contract from Track A (IPC channel names, event payload shapes, action type definitions from Week 1 Track B) |
| Expected outputs | NEW: `renderer/components/chat/approval-card.tsx`, `action-status.tsx`. Modified: `chat-panel.tsx` (render approval cards), `hooks/use-chat.ts` (action event listeners). |
| Merge gate | Components render with mock data. Approval/rejection dispatches correct IPC calls. |

**Conflict risk**: MEDIUM. Both tracks modify chat-adjacent files but on different sides of the IPC boundary. Risk mitigated by freezing the IPC contract (channel names + payload types) at the start of Week 2.

---

### Week 3 — Sprint 15 (Extended Actions)

#### Track A: Sprint 15 Backend

| Field | Detail |
|-------|--------|
| Scope | Tasks 15.1, 15.2, 15.5, 15.6 — Confluence/GitHub tool definitions, available actions detection, error handling. |
| Prerequisites | Week 2 Track A merged |
| Expected outputs | Modified: `action-tools.ts` (add Confluence/GitHub tools), `action-executor.ts` (new CLI prompt templates), `chat.service.ts` (available actions filter). |
| Merge gate | All 6 tool types defined. ActionExecutor handles Confluence/GitHub prompts. Available actions correctly scoped to connected integrations. |

#### Track B: Sprint 15 Frontend + Testing

| Field | Detail |
|-------|--------|
| Scope | Tasks 15.3, 15.4, 15.7 — Edit capability, action history display, full-stack testing. |
| Prerequisites | Week 2 Track B merged |
| Expected outputs | Modified: `approval-card.tsx` (editable fields), `chat-panel.tsx` (inline history cards). NEW: comprehensive test suite for tool-use stream parsing, approval flow, action execution. |
| Merge gate | Full approval → execute → result cycle works E2E with mock Claude CLI. |

**Conflict risk**: LOW. Clean backend/frontend split. `chat.service.ts` only touched by Track A.

---

### Week 4 — Sprint 16 (Comparison) ∥ Sprint 20 (Export + VP Role)

#### Track A: Comparison Backend

| Field | Detail |
|-------|--------|
| Scope | Tasks 16.1–16.4 — ComparisonService, diff algorithm, repository extensions, IPC handlers. |
| Prerequisites | None (independent of Phase 3c) |
| Expected outputs | NEW: `services/comparison.service.ts`, `domain/comparison.types.ts`, `ipc/handlers/comparison.ipc.ts`. Modified: `analysis.repository.ts` (add `findForComparison` method), `channels.ts`, `preload/api.ts`. |
| Merge gate | Diff algorithm produces correct changesets for test fixtures. IPC round-trip returns comparison data. |

#### Track B: CSV/PDF Export + VP Engineering Role

| Field | Detail |
|-------|--------|
| Scope | Tasks 20.1–20.5 — CSV and PDF export, format picker UI, VP role definition, macOS x64 build target. |
| Prerequisites | None (independent) |
| Expected outputs | Modified: `export.service.ts` (add `exportCSV()`, `exportPDF()`), `domain/types.ts` (add `vp_engineering` to role union), prompt templates, `electron-builder.yml` (x64 target). NEW: renderer export format picker. |
| Merge gate | CSV and PDF exports produce valid output. VP role prompt generates appropriate recommendations. x64 build succeeds locally. |

**Conflict risk**: LOW. Only `channels.ts` and `domain/types.ts` are shared, with trivially mergeable changes (different new additions).

---

### Week 5 — Sprint 17 (Comparison UI) ∥ Sprint 18a (Multi-Step Pipeline Architecture)

#### Track A: Comparison UI

| Field | Detail |
|-------|--------|
| Scope | Tasks 17.1–17.3 — Comparison route, diff visualization, selection UI. |
| Prerequisites | Week 4 Track A merged |
| Expected outputs | NEW: `renderer/routes/comparison.tsx`, comparison components. Modified: `App.tsx` (add route), `analysis-history.tsx` (add "Compare" action). |
| Merge gate | User can select two analyses and see a side-by-side diff. |

#### Track B: Multi-Step Pipeline Architecture (CRITICAL PATH)

| Field | Detail |
|-------|--------|
| Scope | Tasks 18.1, 18.2, 18.5 — Refactor orchestrator to step-chain, define StepResult interface, implement SWOT generation step (preserving current single-pass behavior as the default step). |
| Prerequisites | None (existing pipeline code is stable) |
| Expected outputs | Modified: **`analysis/orchestrator.ts`** (MAJOR refactor from monolithic to step-chain). NEW: `analysis/pipeline-step.ts` (step interface + registry), `analysis/steps/swot-generation.ts`. Modified: `analysis.service.ts` (use new orchestrator API). |
| Merge gate | **CRITICAL**: Existing analysis pipeline produces identical output to pre-refactor. All existing analysis tests pass unchanged. This is a pure refactor — no new behavior. |

**Conflict risk**: LOW. Track A is renderer-only. Track B is main-process analysis pipeline. No shared files.

**CRITICAL PATH**: Track B's orchestrator refactor is the foundation for Sprint 19 (themes). It must be stable before Week 6.

---

### Week 6 — Sprint 18b (Pipeline Steps) ∥ Sprint 19a (Themes Backend)

#### Track A: Pipeline Step Implementation

| Field | Detail |
|-------|--------|
| Scope | Tasks 18.3, 18.4, 18.6 — Extraction step, synthesis step, per-step corrective prompt. |
| Prerequisites | Week 5 Track B merged (step-chain architecture exists) |
| Expected outputs | NEW: `analysis/steps/extraction.ts`, `analysis/steps/synthesis.ts`. Modified: `response-parser.ts` (per-step parsing), `analysis.service.ts` (enable multi-step mode). |
| Merge gate | Multi-step pipeline produces higher-quality output than single-pass on test fixtures. Per-step corrective prompts recover from parse failures. |

#### Track B: Themes Data Layer + Extraction Step

| Field | Detail |
|-------|--------|
| Scope | Tasks 19.1–19.3 — Theme types, theme repository, migration, theme extraction pipeline step. |
| Prerequisites | Week 5 Track B merged (step-chain architecture exists) |
| Expected outputs | NEW: `domain/theme.types.ts`, `repositories/theme.repository.ts`, migration SQL, `analysis/steps/theme-extraction.ts`. |
| Merge gate | Theme extraction step produces valid themes from test fixtures. Theme repository CRUD works. |

**Conflict risk**: MEDIUM. Both tracks add new pipeline steps using the same step interface. Risk mitigated because they create different NEW files. The only shared touch point is the step registry in `pipeline-step.ts` (additive — each registers a different step).

---

### Week 7 — Sprint 19b (Themes UI) ∥ Sprint 21 (Integration + Docs)

#### Track A: Themes Editor UI

| Field | Detail |
|-------|--------|
| Scope | Task 19.4 — Theme editor route, CRUD components, link themes to analysis run. |
| Prerequisites | Week 6 Track B merged |
| Expected outputs | NEW: `renderer/routes/themes.tsx`, theme editor components. Modified: `App.tsx` (add route), `analysis.tsx` (link to themes). |
| Merge gate | User can view, edit, and manage themes. Themes appear in analysis context. |

#### Track B: Final Integration Testing + Documentation

| Field | Detail |
|-------|--------|
| Scope | Tasks 21.1–21.3 — Cross-feature E2E tests, documentation updates, exit criteria validation. |
| Prerequisites | All prior merges |
| Expected outputs | E2E test suite, updated `docs/02-architecture-spec.md`, `docs/04-phases-roadmap.md`, `docs/05-domain-model.md`, `docs/08-prompt-engineering.md`. |
| Merge gate | All E2E tests pass. Documentation reflects current state. Phase 3d exit criteria met. |

**Conflict risk**: LOW. Track A is renderer-only. Track B is tests and docs.

---

## 3) Dependency Gates (Must-Pass Checkpoints)

### Gate 1: Action Interface Contract Freeze

**Timing**: End of Week 1 / Start of Week 2

**Required artifacts**:
- `src/main/providers/actions/action.types.ts` — `ChatAction`, `ActionResult`, `ActionStatus` types finalized
- `src/main/ipc/channels.ts` — `chat:action:*` channel names defined
- IPC payload shapes for `pending`, `approve`, `reject`, `list` documented in type signatures
- `chat_actions` migration SQL committed

**Blocking risks if skipped**: Week 2 Track B (renderer) builds against wrong types. IPC mismatch causes runtime errors. Re-work cascades into Week 3.

**Owner recommendation**: Agent B (creates these in Week 1). Agent A reviews before Week 2 begins.

---

### Gate 2: Multi-Step Pipeline Refactor Stable

**Timing**: End of Week 5

**Required artifacts**:
- `src/main/analysis/orchestrator.ts` refactored to step-chain
- `src/main/analysis/pipeline-step.ts` — `PipelineStep` interface, `StepResult` type, step registry
- `src/main/analysis/steps/swot-generation.ts` — existing single-pass behavior wrapped as a step
- **All existing `analysis.service.test.ts` and orchestrator tests pass with zero changes**
- `analysis.service.ts` uses new orchestrator API

**Blocking risks if skipped**: Week 6 both tracks (extraction/synthesis steps, themes extraction) build on a broken foundation. This is the **critical path** — any delay here delays the final 2 weeks.

**Owner recommendation**: Agent B (owns the refactor in Week 5). Agent A validates by running the full test suite before merging.

---

### Gate 3: Step Registry Integration

**Timing**: End of Week 6

**Required artifacts**:
- All pipeline steps (extraction, synthesis, SWOT generation, theme extraction) registered and tested independently
- Step ordering defined and enforced in the registry
- Per-step corrective prompt mechanism working
- `analysis.service.ts` can run full multi-step pipeline

**Blocking risks if skipped**: Week 7 themes UI builds against incomplete backend. Multi-step pipeline has untested step interactions.

**Owner recommendation**: Both agents share responsibility. Agent A owns extraction/synthesis steps; Agent B owns theme extraction step. Integration test is a shared task after both merge.

---

## 4) Proposed Refactored Timeline

```
Week  | Agent A                              | Agent B                              | Gate
------+--------------------------------------+--------------------------------------+------
  1   | Sprint 13: Codebase Polish (3b)      | Sprint 14 Foundation: ActionExecutor,| G1
      | [codebase.*, renderer integrations]   | ChatActionRepo, migration, types     | (end)
      |                                      | [NEW providers/actions/*, NEW repo]   |
------+--------------------------------------+--------------------------------------+------
  2   | Sprint 14 Backend: tool-use bridge   | Sprint 14 Frontend: approval card,   |
      | in chat.service, action IPC handlers | action status, chat panel integration|
      | [chat.service.ts, chat.ipc.ts]       | [NEW renderer components, hooks]     |
------+--------------------------------------+--------------------------------------+------
  3   | Sprint 15 Backend: Confluence/GitHub  | Sprint 15 Frontend: edit cards,      |
      | actions, available actions, errors   | action history, testing              |
      | [action-tools.ts, action-executor.ts]| [approval-card.tsx, test files]      |
------+--------------------------------------+--------------------------------------+------
  4   | Sprint 16: Comparison backend        | Sprint 20: CSV/PDF export + VP role  |
      | [NEW comparison.service, diff algo]  | + macOS x64 build                    |
      |                                      | [export.service.ts, electron-builder]|
------+--------------------------------------+--------------------------------------+------
  5   | Sprint 17: Comparison UI             | Sprint 18a: Multi-step pipeline      | G2
      | [NEW renderer/routes/comparison.tsx]  | architecture refactor                | (end)
      |                                      | [orchestrator.ts MAJOR, pipeline-    |
      |                                      | step.ts NEW, analysis.service.ts]    |
------+--------------------------------------+--------------------------------------+------
  6   | Sprint 18b: Extraction + synthesis   | Sprint 19a: Themes data layer +      | G3
      | steps, per-step corrective prompt    | theme extraction step                | (end)
      | [NEW steps/extraction.ts,            | [NEW theme.types, theme.repo,        |
      | synthesis.ts; response-parser.ts]    | steps/theme-extraction.ts]           |
------+--------------------------------------+--------------------------------------+------
  7   | Sprint 19b: Themes editor UI         | Sprint 21: E2E testing + docs        |
      | [NEW renderer/routes/themes.tsx]     | [test files, docs/*.md]              |
------+--------------------------------------+--------------------------------------+------

CRITICAL PATH: Week 1B -> Week 2A -> Week 5B -> Week 6 (both) -> Week 7A
```

**Compression**: 9 single-developer sprints to 7 two-agent weeks (22% reduction). The bottleneck is the multi-step pipeline refactor (Gate 2) which creates a hard sequential dependency for Weeks 6-7.

---

## 5) Integration and Merge Plan

### Branch Strategy

```
main (stable)
  |-- sprint-13/codebase-polish          (Agent A, Week 1)
  |-- sprint-14/actions-foundation       (Agent B, Week 1)
  |     |-- sprint-14/tool-use-backend   (Agent A, Week 2 -- branches from actions-foundation after merge)
  |     |-- sprint-14/approval-ui        (Agent B, Week 2 -- branches from actions-foundation after merge)
  |-- sprint-15/actions-backend          (Agent A, Week 3)
  |-- sprint-15/actions-frontend         (Agent B, Week 3)
  |-- sprint-16/comparison-backend       (Agent A, Week 4)
  |-- sprint-20/export-vp-x64           (Agent B, Week 4)
  |-- sprint-17/comparison-ui            (Agent A, Week 5)
  |-- sprint-18/pipeline-architecture    (Agent B, Week 5)    <-- CRITICAL PATH
  |-- sprint-18/pipeline-steps           (Agent A, Week 6 -- branches from pipeline-architecture)
  |-- sprint-19/themes-backend           (Agent B, Week 6 -- branches from pipeline-architecture)
  |-- sprint-19/themes-ui               (Agent A, Week 7)
  |-- sprint-21/testing-docs            (Agent B, Week 7)
```

### Merge Order (per week)

| Week | Merge first | Merge second | Reason |
|------|-------------|--------------|--------|
| 1 | Agent B (actions-foundation) | Agent A (codebase-polish) | Agent A's Week 2 work depends on B's types |
| 2 | Agent A (tool-use-backend) | Agent B (approval-ui) | UI integration-tests against real backend |
| 3 | Agent A (actions-backend) | Agent B (actions-frontend) | Same pattern |
| 4 | Either first | Either second | Independent features |
| 5 | **Agent B (pipeline-architecture)** | Agent A (comparison-ui) | **Gate 2: both Week 6 tracks depend on B** |
| 6 | Either first | Either second | Both create new step files, additive |
| 7 | Agent A (themes-ui) | Agent B (testing-docs) | Docs should reflect final state |

### Conflict-Avoidance Rules (File/Module Ownership)

| File / Module | Weeks 1-3 Owner | Weeks 4-7 Owner | Notes |
|---|---|---|---|
| `src/main/services/chat.service.ts` | Agent A (Weeks 2-3) | Stable (no changes) | Agent B never modifies this file |
| `src/main/analysis/orchestrator.ts` | — | Agent B (Week 5), then shared (Week 6) | Gate 2 must pass before Agent A touches |
| `src/main/analysis/prompt-builder.ts` | Agent A (Week 2) | Agent A (Week 6) | Single owner throughout |
| `src/main/ipc/channels.ts` | Agent B (Week 1), Agent A (Week 2) | Agent A (Week 4) | Additive changes only — append new channel constants |
| `src/preload/api.ts` | Agent A (Week 2) | Agent A (Week 4) | Single owner for bridge modifications |
| `src/renderer/App.tsx` | — | Agent A (Weeks 5, 7) | All route additions by Agent A |
| `src/main/domain/types.ts` | Agent B (Week 1) | Agent B (Weeks 4, 6) | Single owner for type additions |
| `src/main/providers/actions/*` | Agent B (Week 1), Agent A (Weeks 2-3) | — | Ownership transfers at Week 2 |
| `src/main/analysis/steps/*` | — | Agent A + Agent B (Week 6) | **Both create NEW files** — no conflicts |
| `src/main/repositories/analysis.repository.ts` | — | Agent A (Week 4) | Comparison methods only |

### CI Checks Required Before Each Merge

1. `pnpm typecheck` passes (zero errors)
2. `pnpm test` passes (all unit + integration tests)
3. No regressions: test count must be >= pre-branch count
4. Branch is rebased on current `main` (no merge commits)
5. For Gate 2 specifically: verify existing analysis pipeline output matches pre-refactor baseline (snapshot test recommended)

---

## 6) Risk Register

| # | Risk | Prob | Impact | Mitigation | Contingency Trigger |
|---|------|------|--------|------------|---------------------|
| R1 | `chat.service.ts` tool-use stream parsing is more complex than expected (OpenRouter streaming format for `tool_calls` is poorly documented) | Med | High | Agent A spikes the stream parsing in Week 1 using a throwaway script against real OpenRouter. Validate format before building production code. | If spike takes >1 day, descope to non-streaming tool-use (batch response, detect `finish_reason: tool_calls` post-completion). |
| R2 | Multi-step pipeline refactor (Week 5, Gate 2) breaks existing analysis behavior | Med | High | Pure refactor first — wrap existing single-pass logic as one step, verify identical output via snapshot tests. Only then add new steps. | If refactor is unstable by end of Week 5, Week 6 falls back to single-pass with themes as a post-processing step (not a pipeline step). Phase 3d scope for themes is reduced. |
| R3 | `channels.ts` / `preload/api.ts` merge conflicts accumulate across weeks | Low | Med | Both agents append-only to these files. Use a convention: Agent A adds to the end, Agent B adds to a marked section. | If conflicts occur, resolve immediately at merge time. These are flat constant declarations — trivially resolvable. |
| R4 | Claude CLI invocation in ActionExecutor is unreliable (timeouts, auth issues, JSON parse failures) | Med | Med | Reuse CodebaseProvider patterns (timeout, retry, JSON extraction). Start with Jira-only (simplest MCP). Add Confluence/GitHub only after Jira is stable. | If CLI reliability is <90%, fallback: show the user a "copy to clipboard" action instead of auto-execution. This preserves the drafting UX without CLI dependency. |
| R5 | Phase 3d scope (comparison, themes, multi-step, export, VP, x64) exceeds 4 weeks for 2 agents | Med | Med | Prioritize comparison and multi-step pipeline (highest decision value per roadmap). Export/VP/x64 are strictly additive and can slip to a Week 8. | If Week 5 is delayed, cut themes editor UI (Sprint 19b) — keep backend extraction but defer the editor to a follow-up. |
| R6 | Agent B's Week 6 (themes extraction) depends on shared step registry with Agent A's Week 6 (extraction/synthesis steps) | Low | Med | Both agents create independent step files. The step registry is additive (each registers their own step). Integration test is a shared task at Week 6 end. | If step interaction bugs emerge, run a 1-day joint debug session before merging either branch. |

---

## 7) Final Output: Actionable Board

### Agent A Backlog

| Week | Task | Status | Blocked By |
|------|------|--------|------------|
| 1 | Sprint 13: Codebase Analysis Polish (all 8 tasks) | Complete | Sprint 12 merged |
| 2 | Sprint 14 Backend: tool-use bridge in `chat.service.ts`, action IPC, system prompt | Blocked | Week 1 Agent B merge (Gate 1) |
| 3 | Sprint 15 Backend: Confluence/GitHub actions, available actions detection, error handling | Blocked | Week 2 Agent A merge |
| 4 | Sprint 16: Comparison backend (service, diff algo, repo, IPC) | Ready now | None |
| 5 | Sprint 17: Comparison UI (route, diff viz, selection) | Blocked | Week 4 Agent A merge |
| 6 | Sprint 18b: Extraction + synthesis steps, per-step corrective prompt | Blocked | Week 5 Agent B merge (Gate 2) |
| 7 | Sprint 19b: Themes editor UI (route, CRUD components) | Blocked | Week 6 Agent B merge (Gate 3) |

### Agent B Backlog

| Week | Task | Status | Blocked By |
|------|------|--------|------------|
| 1 | Sprint 14 Foundation: ActionExecutor, ChatActionRepo, migration, types, tool defs | Ready now | Sprint 12 merged |
| 2 | Sprint 14 Frontend: Approval card, action status, chat panel integration | Blocked | Gate 1 (type contract) |
| 3 | Sprint 15 Frontend: Edit cards, action history, testing | Blocked | Week 2 Agent B merge |
| 4 | Sprint 20: CSV/PDF export, VP Engineering role, macOS x64 build target | Ready now | None |
| 5 | Sprint 18a: Multi-step pipeline architecture refactor (**CRITICAL PATH**) | Ready now | None |
| 6 | Sprint 19a: Themes data layer + extraction step | Blocked | Week 5 Agent B merge (Gate 2) |
| 7 | Sprint 21: E2E testing, documentation updates, exit criteria | Blocked | All prior merges |

### Shared Integration Tasks

| When | Task | Owners |
|------|------|--------|
| End of Week 1 | Gate 1 review: validate action type contract + IPC channel names | B proposes, A reviews |
| End of Week 2 | Integration test: full approval -> execute -> result cycle | Both |
| End of Week 3 | Phase 3c sign-off: all 6 action types work E2E | Both |
| End of Week 5 | **Gate 2 review: pipeline refactor produces identical output** | B implements, A validates |
| End of Week 6 | Gate 3: step registry integration test (all steps run in sequence) | Both |
| End of Week 7 | Phase 3d exit criteria validation | Both |

### Items That Can Start While Sprint 12 Is Still Running

- **Agent B, Week 1** (actions foundation): Only needs to reference `CodebaseProvider` as a pattern — can read the completed Sprint 11 code. Does not depend on Sprint 12's pipeline integration or UI.
- **Agent A, Week 4** (comparison backend): Fully independent of Phase 3a/3b/3c. Can be started at any time after MVP.
- **Agent B, Week 4** (export + VP + x64): Fully independent. Can be started at any time after MVP.
- **Agent B, Week 5** (multi-step pipeline): Only depends on existing stable analysis pipeline (Sprint 4 vintage). Can start as soon as the orchestrator is not actively being modified.

---

## Recommended Default Plan (Agent Execution Charter)

1. **Agent A owns tracks**: codebase polish (W1), chat actions backend (W2-3), comparison feature (W4-5), pipeline steps (W6), themes UI (W7). **Agent B owns tracks**: actions foundation + frontend (W1-3), export/VP/x64 (W4), pipeline architecture refactor (W5), themes backend (W6), E2E + docs (W7).
2. **Sprint 13 and Sprint 14 start simultaneously.** Phase 3b does not block Phase 3c — both depend only on Sprint 12.
3. **Week 1 output**: Agent B delivers `action.types.ts`, `action-executor.ts`, `chat-action.repository.ts`, migration, and `action-tools.ts` as NEW files. Agent A delivers all Sprint 13 codebase polish. Agent B merges first (Gate 1).
4. **Weeks 2-3 use backend/frontend split** for Sprint 14-15. Agent A owns `chat.service.ts` exclusively — Agent B never modifies it. Agent B owns all `renderer/components/chat/` action components.
5. **Week 4 is a parallelism sweet spot** — comparison and export/VP/x64 are fully independent with zero shared files.
6. **Week 5 Gate 2 is the critical path.** Agent B's `orchestrator.ts` refactor must be a pure refactor that passes all existing tests unchanged. No new behavior until Week 6. Agent A validates by running the full test suite.
7. **Week 6 both agents add pipeline steps** — they create different NEW files (`steps/extraction.ts`, `steps/synthesis.ts` vs `steps/theme-extraction.ts`). The only integration point is the step registry, which is additive.
8. **File ownership is strict**: `chat.service.ts` = Agent A (W2-3 only). `orchestrator.ts` = Agent B (W5), then shared (W6+). `channels.ts` = append-only by convention. `domain/types.ts` = Agent B. `App.tsx` routes = Agent A.
9. **Branch naming**: `sprint-{N}/{description}` per CLAUDE.md convention. Rebase on `main` before merge. No merge commits.
10. **CI before every merge**: `pnpm typecheck && pnpm test`. Test count must not decrease. Gate 2 additionally requires analysis output snapshot comparison.
11. **If Claude CLI reliability is low** (ActionExecutor failures >10%), descope to "draft + copy to clipboard" for chat actions — preserves the OpenRouter tool-use UX without CLI execution dependency.
12. **If pipeline refactor destabilizes** (Gate 2 fails), fallback: keep single-pass pipeline, implement themes as a post-processing pass outside the orchestrator. This reduces Phase 3d scope but unblocks Week 6-7.
13. **E2E tests are non-blocking** per `docs/07-testing-strategy.md`. They run in Week 7 as validation, not as a merge gate for individual sprints.
14. **No scope changes.** All feature scope comes from `docs/11-codebase-analysis-plan.md`, `docs/12-chat-actions-plan.md`, and `docs/04-phases-roadmap.md` Phase 3d. If ambiguity arises, prefer the narrower interpretation.

---

## Assumptions

- Sprint 12 is complete or will complete before Week 1 begins.
- Phase 3d is decomposed into 6 sprints (16-21) based on the feature list in `docs/04-phases-roadmap.md`. No official sprint doc existed for Phase 3d prior to this plan; the decomposition above is the first detailed breakdown.
- "Themes layer" means: extraction as a pipeline step + a basic editor UI. Full theme editor with drag-and-drop or rich editing is Phase 4.
- PDF export uses a lightweight library (e.g., `pdfkit` or `jspdf`). No complex layout engine.
