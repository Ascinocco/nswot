# Parallel Sprints Agents Plan

> **Source of truth for status**: `docs/16-parallel-sprint-plan.md` — check that document for current completion status, gate status, and backlog priorities.
>
> **This document** contains the detailed per-sprint instructions (scope, file ownership, completion criteria) for each agent. Agents should read their sprint instructions here, but track and update status in doc 16.
>
> **Branch policy**: All agents work on the current active branch. Do NOT create new branches. This work was designed so agents do not touch the same files.

---

## Completion Status (Quick Reference)

| Week | Agent A | Agent B |
|------|---------|---------|
| 1 | Sprint 13: Codebase Polish — **DONE** | Sprint 14 Foundation: Actions Infra — **DONE** |
| 2 | Sprint 14 Backend: Tool-Use Bridge — **DONE** | Sprint 14 Frontend: Approval Card UI — **DONE** |
| 3 | Sprint 15 Backend: Extended Actions — **DONE** | Sprint 15 Frontend: Actions Polish — **DONE** |
| 4 | Sprint 16: Comparison Backend — **DONE** | Sprint 20: Export + VP + x64 — **DONE** |
| 5 | Sprint 17: Comparison UI — **DONE** | Sprint 18a: Pipeline Architecture — **DONE** |
| 6 | Sprint 18b: Pipeline Steps — PENDING | Sprint 19a: Themes Backend — **DONE** |
| 7 | Sprint 19b: Themes Editor UI — **DONE** (Agent B) | Sprint 21: E2E Testing + Docs — PENDING |

---

## Week 1

## Agent A — Sprint 13: Codebase Analysis Polish — DONE

> **Status: COMPLETED.** All 8 tasks done. See doc 16 Completion Log.

<details>
<summary>Sprint instructions (reference only)</summary>

READ FIRST:

- docs/16-parallel-sprint-plan.md (your execution plan — you are Agent A,
  Week 1)
- docs/11-codebase-analysis-plan.md § Phase 3b (feature spec)
- docs/02-architecture-spec.md (layered architecture rules)
- CLAUDE.md (project conventions)

SCOPE (all of Sprint 13):

1. Jira MCP detection and conditional cross-reference prompt in
   src/main/providers/codebase/codebase-prompt.ts and codebase.provider.ts
2. Stale analysis detection (compare pushed_at vs analyzedAt) in
   src/main/services/codebase.service.ts
3. Re-analyze from UI — add re-analyze action to the integrations page
   codebase section
4. Cloned repo cleanup UI — storage display and "clear all" button on
   integrations page
5. Full clone option for git history analysis in codebase.service.ts and
   codebase.provider.ts
6. Prompt tuning based on real output quality in codebase-prompt.ts
7. Testing: add/expand tests in codebase.provider.test.ts and
   codebase.service.test.ts for various repo sizes, languages, monorepo
   support
8. Documentation updates in docs/ as needed

FILES YOU OWN (do not expect conflicts):

- src/main/providers/codebase/\* (all files)
- src/main/services/codebase.service.ts
- src/main/ipc/handlers/codebase.ipc.ts
- src/renderer/components/integrations/ (codebase-related components)
- Related test files

FILES TO AVOID: Do NOT modify src/main/providers/actions/\*,
src/main/services/chat.service.ts, or src/main/domain/types.ts — Agent B
owns those this week.

COMPLETION CRITERIA:

- All codebase analysis tests pass
- Jira MCP detection works (graceful degradation when MCP unavailable)
- Stale analysis detection compares timestamps correctly
- Re-analyze and cleanup UI functional
- pnpm typecheck && pnpm test passes with no regressions

</details>

---

## Agent B — Sprint 14 Foundation: Actions Infrastructure — DONE

> **Status: COMPLETED.** Tasks 14.2, 14.5, 14.8 done. Gate 1 artifacts delivered and implicitly validated by Agent A's use in Sprints 14/15 Backend.

<details>
<summary>Sprint instructions (reference only)</summary>

READ FIRST:

- docs/16-parallel-sprint-plan.md (your execution plan — you are Agent B,
  Week 1)
- docs/12-chat-actions-plan.md (feature spec — full chat actions design)
- docs/02-architecture-spec.md (layered architecture rules)
- docs/06-error-handling-strategy.md (error patterns)
- CLAUDE.md (project conventions)

SCOPE (Sprint 14 new components only — do NOT touch chat.service.ts):

1. Create src/main/providers/actions/action.types.ts — ChatAction,
   ActionResult, ActionStatus types per docs/12-chat-actions-plan.md § Data
   Model and § Result Schema
2. Create src/main/providers/actions/action-tools.ts — CHAT_ACTION_TOOLS
   array with all 6 tool definitions (create_jira_issue, create_jira_issues,
   add_jira_comment, create_confluence_page, create_github_issue,
   create_github_pr) per docs/12-chat-actions-plan.md § Tool Definitions
3. Create src/main/providers/actions/action-executor.ts — ActionExecutor
   class that spawns Claude CLI with MCP-scoped prompt, captures JSON output,
   parses ActionResult. Reuse patterns from
   src/main/providers/codebase/codebase.provider.ts (child process spawning,
   timeout, JSON extraction).
4. Create DB migration for chat_actions table per
   docs/12-chat-actions-plan.md § Data Model
5. Create src/main/repositories/chat-action.repository.ts — CRUD for
   chat_actions (insert, findByAnalysis, updateStatus, findById)
6. Add chat:action:\* channel constants to src/main/ipc/channels.ts
   (pending, approve, reject, edit, list)
7. Write tests for ActionExecutor, ChatActionRepository, and tool
   definitions

FILES YOU OWN (all new files):

- src/main/providers/actions/\* (all new)
- src/main/repositories/chat-action.repository.ts (new)
- New migration SQL file
- src/main/ipc/channels.ts (append action channel constants only)

FILES TO AVOID: Do NOT modify src/main/services/chat.service.ts,
src/main/ipc/handlers/chat.ipc.ts, src/preload/api.ts, or any renderer
files — Agent A owns those next week.

GATE 1 RESPONSIBILITY: Your types in action.types.ts and channel names in
channels.ts become the contract for Week 2. Both agents will build against
them. Make them stable.

COMPLETION CRITERIA:

- ActionExecutor can spawn a mock CLI process and parse JSON result
- ChatActionRepository CRUD works against in-memory SQLite (test-db helper)
- All 6 tool definitions pass type checks
- chat_actions migration applies cleanly
- pnpm typecheck && pnpm test passes with no regressions

</details>

---

## Week 2

## Agent A — Sprint 14 Backend: Tool-Use Bridge — DONE

> **Status: COMPLETED.** Tasks 14.1, 14.3, 14.4, 14.9 done. Gate 1 implicitly validated.

<details>
<summary>Sprint instructions (reference only)</summary>

READ FIRST:

- docs/16-parallel-sprint-plan.md (you are Agent A, Week 2)
- docs/12-chat-actions-plan.md § Chat Service Changes, § IPC Surface, §
  Chat System Prompt Update
- src/main/providers/actions/action.types.ts (Gate 1 contract from Agent B
  Week 1)
- src/main/providers/actions/action-executor.ts (Agent B Week 1 output)
- src/main/services/chat.service.ts (your primary modification target)
- docs/08-prompt-engineering.md § Chat Actions System Prompt Extension

SCOPE:

1. Wire OpenRouter tool-use detection into
   src/main/services/chat.service.ts — detect tool_calls in SSE stream,
   accumulate tool call arguments, detect finish_reason: "tool_calls"
2. Implement pending action emission: when tool_calls detected, emit
   pending action to renderer via IPC event
3. Create action IPC handlers in src/main/ipc/handlers/chat.ipc.ts —
   chat:action:approve (calls ActionExecutor, feeds result back to
   OpenRouter), chat:action:reject (feeds rejection to OpenRouter),
   chat:action:list (queries ChatActionRepository)
4. Update src/preload/api.ts — add bridge methods for action
   approve/reject/list and event listener for action:pending
5. Update chat system prompt with ACTIONS section when actions are
   available (per docs/08-prompt-engineering.md § Chat Actions System Prompt
   Extension)

FILES YOU OWN:

- src/main/services/chat.service.ts (exclusive — Agent B will not touch
  this)
- src/main/ipc/handlers/chat.ipc.ts
- src/main/ipc/channels.ts (if adjustments needed)
- src/preload/api.ts
- src/main/services/chat.service.test.ts

FILES TO AVOID: Do NOT modify renderer components — Agent B owns those this
week.

COMPLETION CRITERIA:

- Tool-use stream parsing works with mock OpenRouter responses returning
  tool_calls
- IPC round-trip for approve/reject returns correct ActionResult
- chat:action:list returns actions from ChatActionRepository
- Chat system prompt includes ACTIONS section when integrations are
  connected
- All chat.service.test.ts tests pass
- pnpm typecheck && pnpm test passes with no regressions

</details>

---

## Agent B — Sprint 14 Frontend: Approval Card UI — DONE

> **Status: COMPLETED.** Tasks 14.6, 14.7 done. Created approval-card.tsx (all 6 tool types with previews), action-status.tsx (executing/success/failed/rejected states), updated use-chat.ts (useChatActions, useApproveAction, useRejectAction hooks), integrated into chat-panel.tsx (inline action rendering with onPending listener). 505 tests pass.

<details>
<summary>Sprint instructions (reference only)</summary>

READ FIRST:

- docs/16-parallel-sprint-plan.md (you are Agent B, Week 2)
- docs/12-chat-actions-plan.md § UI Changes (approval card mockup, action
  status, batch actions)
- src/main/providers/actions/action.types.ts (your Week 1 types — the
  contract)
- src/main/ipc/channels.ts (your Week 1 channel additions)
- src/renderer/components/analysis/chat-panel.tsx (existing chat panel to
  integrate into)
- src/renderer/hooks/use-chat.ts (existing chat hooks)

SCOPE:

1. Create src/renderer/components/chat/approval-card.tsx — renders a
   pending action as a preview card with Create/Reject buttons per
   docs/12-chat-actions-plan.md § Approval Card. Show tool name, key fields,
   rendered markdown description. For batch actions (create_jira_issues), show
   collapsible list with "Create All".
2. Create src/renderer/components/chat/action-status.tsx — shows executing
   (spinner), success (green check + link), failed (red error + retry option)
   states per docs/12-chat-actions-plan.md § Action Status
3. Integrate into src/renderer/components/analysis/chat-panel.tsx — render
   approval cards inline when pending action events arrive, render status
   cards for completed actions
4. Update src/renderer/hooks/use-chat.ts — add listener for
   chat:action:pending IPC event, add mutations for chat:action:approve and
   chat:action:reject

FILES YOU OWN:

- src/renderer/components/chat/approval-card.tsx (new)
- src/renderer/components/chat/action-status.tsx (new)
- src/renderer/components/analysis/chat-panel.tsx
- src/renderer/hooks/use-chat.ts

FILES TO AVOID: Do NOT modify src/main/services/chat.service.ts,
src/main/ipc/handlers/chat.ipc.ts, or src/preload/api.ts — Agent A owns
those this week.

COMPLETION CRITERIA:

- Approval card renders all 6 tool types with correct field layouts
- Create/Reject buttons dispatch correct IPC calls
- Action status shows spinner during execution, success with link, error
  with message
- Batch action card renders collapsible item list
- Components render correctly with mock data (no backend dependency for
  visual testing)
- pnpm typecheck && pnpm test passes with no regressions

WHEN DONE: Mark Sprint 14 tasks 14.6, 14.7 as complete in
docs/16-parallel-sprint-plan.md. Then run pnpm typecheck && pnpm test to confirm green.

</details>

---

## Week 3

## Agent A — Sprint 15 Backend: Extended Actions — DONE

> **Status: COMPLETED.** Tasks 15.1, 15.2, 15.5, 15.6 done.

<details>
<summary>Sprint instructions (reference only)</summary>

READ FIRST:

- docs/16-parallel-sprint-plan.md (you are Agent A, Week 3)
- docs/12-chat-actions-plan.md § Supported Actions, § Available Actions
  Detection, § Error Handling
- src/main/providers/actions/action-tools.ts (tool definitions to extend)
- src/main/providers/actions/action-executor.ts (executor to extend with
  new prompt templates)
- src/main/services/chat.service.ts (add available actions detection)

SCOPE:

1. Add Confluence tool definition and CLI prompt template to
   action-tools.ts and action-executor.ts (create_confluence_page)
2. Add GitHub tool definitions and CLI prompt templates
   (create_github_issue, create_github_pr)
3. Implement available actions detection in chat.service.ts —
   getAvailableTools() checks connected integrations and only includes tools
   for available systems per docs/12-chat-actions-plan.md § Available Actions
   Detection
4. Add error handling in action-executor.ts for: Claude CLI not found, CLI
   auth failures, MCP errors, timeout, malformed output, partial batch
   failures per docs/12-chat-actions-plan.md § Error Handling
5. Write tests for all new tool definitions, available actions logic, and
   error paths

FILES YOU OWN:

- src/main/providers/actions/action-tools.ts
- src/main/providers/actions/action-executor.ts
- src/main/services/chat.service.ts (available actions filter only)
- Related test files

FILES TO AVOID: Do NOT modify renderer components — Agent B owns those.

COMPLETION CRITERIA:

- All 6 tool types have CLI prompt templates
- Available actions correctly filters to connected integrations
- Error handling covers all failure modes from the spec
- Tests cover Confluence/GitHub tool defs, available actions logic, and
  error paths
- pnpm typecheck && pnpm test passes with no regressions

</details>

---

## Agent B — Sprint 15 Frontend: Actions Polish + Testing — DONE

> **Status: COMPLETED.** Tasks 15.3, 15.4, 15.7 done. Edit capability (editable fields with Save/Cancel), action history polish (result IDs in status), editAction service+IPC+preload bridge, 4 new tests. 509 tests pass.

<details>
<summary>Sprint instructions (reference only)</summary>

PREREQUISITE: Sprint 14 Frontend (Agent B Week 2) must be completed first.

READ FIRST:

- docs/16-parallel-sprint-plan.md (you are Agent B, Week 3)
- docs/12-chat-actions-plan.md § Approval Card (edit), § Action History
- src/renderer/components/chat/approval-card.tsx (your Week 2 component)
- src/renderer/components/analysis/chat-panel.tsx

SCOPE:

1. Add edit capability to src/renderer/components/chat/approval-card.tsx —
   "Edit" button opens editable view of action fields before approving.
   Dispatches chat:action:edit IPC with edited input.
2. Add action history display in chat-panel.tsx — completed/failed actions
   render as inline status cards showing result (issue key + URL for success,
   error message for failure) per docs/12-chat-actions-plan.md § Action
   History
3. Write comprehensive tests for the full Phase 3c flow:
   - Tool-use stream parsing (mock SSE with tool_calls)
   - Approval card rendering for all 6 tool types
   - Approve → execute → success/failure cycle
   - Reject flow
   - Edit → approve flow
   - Batch action approval
   - Action history rendering

FILES YOU OWN:

- src/renderer/components/chat/approval-card.tsx
- src/renderer/components/chat/action-status.tsx
- src/renderer/components/analysis/chat-panel.tsx
- src/renderer/hooks/use-chat.ts
- All related test files

FILES TO AVOID: Do NOT modify src/main/services/chat.service.ts or backend
action files — Agent A owns those.

COMPLETION CRITERIA:

- Edit mode works: fields are editable, edited values dispatched via IPC
- Action history renders inline status cards with correct data
- Comprehensive test suite covers all approval flow paths
- Full approve → execute → result cycle works E2E with mock Claude CLI
- pnpm typecheck && pnpm test passes with no regressions

WHEN DONE: Mark Sprint 15 tasks 15.3, 15.4, 15.7 as complete in
docs/16-parallel-sprint-plan.md. Then run pnpm typecheck && pnpm test to confirm green.

</details>

---

## Week 4

## Agent A — Sprint 16: Comparison Backend — DONE

> **Status: COMPLETED.** Tasks 16.1–16.4 done. ComparisonService, diff algorithm, findForComparison, IPC handlers, preload bridge. 505 tests pass.

<details>
<summary>Sprint instructions (reference only)</summary>

READ FIRST:

- docs/16-parallel-sprint-plan.md (you are Agent A, Week 4)
- docs/04-phases-roadmap.md § Phase 3d (comparison scope)
- docs/05-domain-model.md (Analysis entity for reference)
- docs/02-architecture-spec.md (layered architecture — services ->
  repositories pattern)
- src/main/repositories/analysis.repository.ts (existing analysis data
  access)
- src/main/domain/types.ts (existing Analysis, SwotOutput, SwotItem types)

SCOPE:

1. Create src/main/domain/comparison.types.ts — ComparisonResult, ItemDelta
   (added/removed/changed), ScoreDelta, SourceDelta types
2. Create src/main/services/comparison.service.ts — ComparisonService with
   compare(analysisIdA, analysisIdB) method. Implements diff algorithm: match
   SWOT items by claim text similarity (simple substring/Levenshtein), detect
   added/removed items, compute confidence score deltas, detect source
   coverage changes.
3. Add findForComparison(workspaceId) method to
   src/main/repositories/analysis.repository.ts — returns completed analyses
   ordered by date (id, role, model, date, status only — lightweight)
4. Create src/main/ipc/handlers/comparison.ipc.ts — IPC handlers for
   comparison:list (available analyses) and comparison:run (diff two analyses)
5. Add comparison channel constants to src/main/ipc/channels.ts
6. Update src/preload/api.ts with comparison bridge methods
7. Register handlers in src/main/ipc/registry.ts
8. Write tests for ComparisonService diff algorithm and repository method

FILES YOU OWN:

- src/main/domain/comparison.types.ts (new)
- src/main/services/comparison.service.ts (new)
- src/main/ipc/handlers/comparison.ipc.ts (new)
- src/main/repositories/analysis.repository.ts (add one method)
- src/main/ipc/channels.ts (append comparison channels)
- src/preload/api.ts (append comparison bridge)
- Related test files

FILES TO AVOID: Do NOT modify src/main/domain/types.ts,
src/main/services/export.service.ts, or electron-builder.yml — Agent B owns
those this week.

COMPLETION CRITERIA:

- Diff algorithm produces correct changesets (added, removed, changed
  items) for test fixtures
- Item matching works for similar but not identical claims
- Score deltas computed correctly
- IPC round-trip returns comparison data
- findForComparison returns only completed analyses, ordered by date
- pnpm typecheck && pnpm test passes with no regressions

WHEN DONE: Mark Sprint 16 tasks 16.1–16.4 as complete in
docs/16-parallel-sprint-plan.md. Then run pnpm typecheck && pnpm test to confirm green.

</details>

---

## Agent B — Sprint 20: CSV/PDF Export + VP Role + x64 — DONE

> **Status: COMPLETED.** Tasks 20.1–20.5 done. CSV/PDF export, VP Engineering role, x64 build target.

<details>
<summary>Sprint instructions (reference only)</summary>

READ FIRST:

- docs/16-parallel-sprint-plan.md (you are Agent B, Week 4)
- docs/04-phases-roadmap.md § Phase 3d (export, VP role, platform scope)
- docs/08-prompt-engineering.md § Role Instructions (existing Staff
  Engineer and Senior EM patterns)
- src/main/services/export.service.ts (existing markdown export to extend)
- src/main/domain/types.ts (Analysis role union to extend)
- src/main/analysis/prompt-builder.ts (role instructions)
- electron-builder.yml (build targets)

SCOPE:

1. Add exportCSV(analysisId) method to src/main/services/export.service.ts
   — produces CSV with columns: quadrant, claim, confidence, evidence_count,
   recommendation, sources
2. Add exportPDF(analysisId) method to export.service.ts — add a
   lightweight PDF dependency (e.g., pdfkit or jspdf), generate PDF with
   metadata header, SWOT quadrants, evidence citations, confidence badges
3. Create renderer export format picker component — dropdown or radio group
   (Markdown/CSV/PDF) replacing the current single-format export button
4. Update src/main/ipc/handlers/export.ipc.ts for new export formats
5. Add vp_engineering to the role union in src/main/domain/types.ts
6. Add VP of Engineering role instructions to
   src/main/analysis/prompt-builder.ts following the pattern from
   docs/08-prompt-engineering.md — focus on portfolio-level strategy,
   cross-org coordination, investment priorities, technical vision
7. Update docs/08-prompt-engineering.md with the VP role instructions
8. Add macOS x64 (Intel) build target to electron-builder.yml
9. Update CI workflow if needed for x64 build matrix
10. Write tests for CSV and PDF export methods and VP role prompt
    construction

FILES YOU OWN:

- src/main/services/export.service.ts
- src/main/domain/types.ts (role union addition)
- src/main/analysis/prompt-builder.ts (VP role instructions)
- src/main/ipc/handlers/export.ipc.ts
- electron-builder.yml
- Renderer export components
- docs/08-prompt-engineering.md (VP role section)
- Related test files

COMPLETION CRITERIA:

- CSV export produces valid CSV with correct columns for test fixtures
- PDF export generates a readable PDF with SWOT content
- Format picker UI allows selecting MD/CSV/PDF
- VP of Engineering role produces appropriate portfolio-level
  recommendations
- x64 build target added and builds locally (if on Intel Mac, or
  config-verified on ARM)
- pnpm typecheck && pnpm test passes with no regressions

</details>

---

## Week 5

## Agent A — Sprint 17: Comparison UI — PENDING

> **Status: BLOCKED.** Depends on Sprint 16 (Agent A Week 4) being completed first.

PREREQUISITE: Sprint 16 (comparison backend) must be completed first.

READ FIRST:

- docs/16-parallel-sprint-plan.md (you are Agent A, Week 5)
- src/main/domain/comparison.types.ts (your Week 4 types)
- src/main/services/comparison.service.ts (your Week 4 service)
- src/renderer/App.tsx (router — you'll add a route)
- src/renderer/routes/analysis-history.tsx (you'll add a "Compare" action
  here)

SCOPE:

1. Create src/renderer/routes/comparison.tsx — comparison page that accepts
   two analysis IDs (from query params or state), calls comparison:run IPC,
   displays results
2. Create comparison UI components:
   - Analysis picker: select two completed analyses to compare (reuse
     analysis list data)
   - Side-by-side diff view: show added items (green), removed items (red),
     changed items (yellow) with confidence delta indicators
   - Summary panel: overall score changes, source coverage changes
3. Add route to src/renderer/App.tsx for /comparison
4. Add "Compare" action button to src/renderer/routes/analysis-history.tsx
   — allows selecting analyses for comparison
5. Create React Query hook in src/renderer/hooks/ for comparison IPC calls

FILES YOU OWN:

- src/renderer/routes/comparison.tsx (new)
- src/renderer/components/comparison/ (new directory, all new components)
- src/renderer/hooks/use-comparison.ts (new)
- src/renderer/App.tsx (add route)
- src/renderer/routes/analysis-history.tsx (add Compare action)

FILES TO AVOID: Do NOT modify src/main/analysis/orchestrator.ts,
src/main/analysis/pipeline-step.ts, or
src/main/services/analysis.service.ts — Agent B owns those this week
(critical path).

COMPLETION CRITERIA:

- User can select two analyses from history and navigate to comparison view
- Diff visualization clearly shows added, removed, and changed SWOT items
- Confidence deltas are visible per item
- Source coverage changes are summarized
- pnpm typecheck && pnpm test passes with no regressions

WHEN DONE: Mark Sprint 17 tasks 17.1–17.3 as complete in
docs/16-parallel-sprint-plan.md. Then run pnpm typecheck && pnpm test to confirm green.

---

## Agent B — Sprint 18a: Multi-Step Pipeline Architecture (CRITICAL PATH) — DONE

> **Status: COMPLETED.** Gate 2 passed. PipelineStep interface, AnalysisOrchestrator, SwotGenerationStep created. All 449 pre-existing tests pass unchanged. 21 new tests added.

<details>
<summary>Sprint instructions (reference only)</summary>

READ FIRST:

- docs/16-parallel-sprint-plan.md (you are Agent B, Week 5 — Gate 2 owner)
- docs/02-architecture-spec.md § 7 Analysis Pipeline
- docs/04-phases-roadmap.md § Phase 3d (multi-step pipeline scope)
- src/main/analysis/orchestrator.ts (MAJOR refactor target — read
  thoroughly)
- src/main/services/analysis.service.ts (uses orchestrator — must update
  API)
- src/main/analysis/response-parser.ts (for reference)
- src/main/services/analysis.service.test.ts (MUST continue to pass
  unchanged)

SCOPE — PURE REFACTOR, NO NEW BEHAVIOR:

1. Create src/main/analysis/pipeline-step.ts — define PipelineStep
   interface (name, execute method taking step input and returning
   StepResult), StepResult type, StepRegistry class (register steps, execute
   in order, handle per-step failures)
2. Refactor src/main/analysis/orchestrator.ts from monolithic function to
   step-chain architecture. The existing collect -> preprocess -> prompt ->
   parse -> validate -> store flow becomes a series of registered steps.
3. Create src/main/analysis/steps/swot-generation.ts — wrap the EXISTING
   single-pass behavior as a pipeline step. This step does exactly what the
   current orchestrator does: build prompt, call LLM, parse response, validate
   evidence. No changes to behavior.
4. Update src/main/services/analysis.service.ts to use the new orchestrator
   API (step registry). The service should still produce identical output.
5. Ensure all existing tests pass with ZERO changes — this validates the
   refactor is behavior-preserving.

FILES YOU OWN:

- src/main/analysis/orchestrator.ts (MAJOR)
- src/main/analysis/pipeline-step.ts (new)
- src/main/analysis/steps/swot-generation.ts (new)
- src/main/services/analysis.service.ts (API update only)

GATE 2 CRITERIA (you are the owner):

- PipelineStep interface is clean and extensible (name, execute,
  StepResult)
- StepRegistry supports ordered execution and per-step error handling
- Existing single-pass behavior is wrapped in swot-generation.ts step
- ALL existing analysis.service.test.ts tests pass with ZERO changes to
  test code
- ALL existing orchestrator-related tests pass unchanged
- pnpm typecheck && pnpm test passes with no regressions

</details>

---

## Week 6

## Agent A — Sprint 18b: Pipeline Step Implementation — PENDING

> **Status: READY NOW.** Gate 2 passed — pipeline step interface is stable. Can start immediately.

PREREQUISITE: Gate 2 (Sprint 18a) is passed. Pipeline step interface is stable.

READ FIRST:

- docs/16-parallel-sprint-plan.md (you are Agent A, Week 6)
- src/main/analysis/pipeline-step.ts (Gate 2 output — step interface and
  registry)
- src/main/analysis/steps/swot-generation.ts (Gate 2 output — reference
  step implementation)
- src/main/analysis/orchestrator.ts (refactored step-chain from Week 5)
- docs/08-prompt-engineering.md (prompt patterns)
- src/main/analysis/response-parser.ts (parser to extend for per-step
  parsing)

SCOPE:

1. Create src/main/analysis/steps/extraction.ts — Extraction step: takes
   raw collected data (profiles, Jira, Confluence, GitHub, codebase), sends to
   LLM with an extraction-focused prompt asking for key themes, signals, and
   patterns. Returns structured extraction result.
2. Create src/main/analysis/steps/synthesis.ts — Synthesis step: takes
   extraction output, performs cross-source correlation, identifies
   agreements/conflicts across sources, produces a synthesis document for the
   final SWOT generation step.
3. Implement per-step corrective prompt in response-parser.ts — when a
   step's LLM output fails to parse, retry with a corrective prompt specific
   to that step's expected schema (not the full SWOT schema).
4. Update src/main/services/analysis.service.ts — add ability to run in
   multi-step mode (extraction -> synthesis -> swot-generation) or single-step
   mode (backward compatible). Multi-step mode should be configurable.
5. Register new steps in the step registry with correct ordering
6. Write tests for extraction step, synthesis step, and per-step corrective
   prompt

FILES YOU OWN:

- src/main/analysis/steps/extraction.ts (new)
- src/main/analysis/steps/synthesis.ts (new)
- src/main/analysis/response-parser.ts (per-step corrective prompt)
- src/main/services/analysis.service.ts (multi-step mode toggle)
- Related test files

FILES TO COORDINATE: src/main/analysis/pipeline-step.ts step registry — you
register extraction and synthesis steps. Agent B registers
theme-extraction step. Both are additive (no conflict if you append to
different sections).

COMPLETION CRITERIA:

- Extraction step produces structured themes/signals from test fixture data
- Synthesis step cross-references sources and identifies correlations
- Per-step corrective prompt recovers from parse failures for each step
  type
- Multi-step mode produces output (may differ from single-step — that's
  expected and desired)
- Single-step mode still works identically to pre-refactor (backward
  compatibility)
- pnpm typecheck && pnpm test passes with no regressions

WHEN DONE: Mark Sprint 18 tasks 18.3, 18.4, 18.6 as complete in
docs/16-parallel-sprint-plan.md. Then run pnpm typecheck && pnpm test to confirm green.

---

## Agent B — Sprint 19a: Themes Backend — DONE

> **Status: COMPLETED.** Tasks 19.1–19.3 done. Theme types added to `domain/types.ts` (`Theme`, `ThemeOutput`, `ThemeEvidenceRef`). Migration v4 (themes table). `ThemeRepository` with transactional batch insert. `ThemeExtractionStep` pipeline step. `PipelineContext` extended with `themes?: ThemeOutput[]`. 21 new tests. 484 total tests pass.

<details>
<summary>Sprint instructions (reference only)</summary>

READ FIRST:

- docs/16-parallel-sprint-plan.md (you are Agent B, Week 6)
- docs/04-phases-roadmap.md § Phase 3d (themes layer scope)
- src/main/analysis/pipeline-step.ts (your Week 5 Gate 2 output — step
  interface)
- src/main/analysis/steps/swot-generation.ts (your Week 5 reference step)
- src/main/domain/types.ts (domain types to extend)
- src/main/repositories/ (repository patterns to follow)
- docs/05-domain-model.md (entity patterns)

SCOPE:

1. Theme types (ThemeOutput, ThemeEvidenceRef, Theme) in domain/types.ts
2. DB migration v4 for themes table (id, analysis_id FK, label, description,
   evidence_refs JSON, source_types JSON, frequency, created_at)
3. ThemeRepository with insertMany, findByAnalysis, findById, deleteByAnalysis
4. ThemeExtractionStep pipeline step — sends theme-extraction prompt to LLM,
   parses response, adds themes to PipelineContext
5. Tests for ThemeRepository CRUD and ThemeExtractionStep

FILES YOU OWN:

- src/main/domain/types.ts (theme type additions)
- src/main/repositories/theme.repository.ts (new)
- src/main/analysis/steps/theme-extraction.ts (new)
- src/main/db/migrations.ts (migration v4)
- src/main/analysis/pipeline-step.ts (PipelineContext themes field)
- Related test files

</details>

---

## Week 7

## Agent B — Sprint 19b: Themes Editor UI — DONE

> **Status: COMPLETED (by Agent B).** Theme IPC handlers (list/get/update/delete), preload bridge, use-themes.ts hooks, themes.tsx route with inline edit + evidence viewer, App.tsx route, analysis.tsx + analysis-history.tsx "Themes" links. ThemeRepository extended with update() and deleteById(). 509 tests pass.

<details>
<summary>Sprint instructions (reference only)</summary>

PREREQUISITE: Sprint 19a (themes backend) is complete. Theme types and
repository are available.

SCOPE:

1. Create IPC handlers for themes — list by analysis, get, update, delete.
   Add to src/main/ipc/handlers/ and register in registry.
2. Add theme channels to src/main/ipc/channels.ts and bridge methods to
   src/preload/api.ts
3. Create src/renderer/routes/themes.tsx — themes editor page showing
   themes for a given analysis
4. Create theme editor components:
   - Theme list: shows extracted themes with label, description,
     evidence count, source types
   - Theme detail: expandable view showing full description, evidence
     citations, related SWOT items
   - Theme edit: inline editing of theme label, description
   - Theme delete: with confirmation
5. Create src/renderer/hooks/use-themes.ts — React Query hook for theme IPC
   calls
6. Add route to src/renderer/App.tsx for /themes/:analysisId
7. Add "View Themes" link from src/renderer/routes/analysis.tsx to themes
   page

FILES MODIFIED/CREATED:

- src/main/repositories/theme.repository.ts (added update, deleteById)
- src/main/ipc/channels.ts (added THEME_LIST, THEME_GET, THEME_UPDATE, THEME_DELETE)
- src/main/ipc/handlers/theme.ipc.ts (new — 4 handlers)
- src/main/ipc/registry.ts (added ThemeRepository to IpcContext, registered handlers)
- src/main/index.ts (instantiate ThemeRepository, pass to IPC)
- src/preload/api.ts (added themes API types)
- src/preload/index.ts (added themes bridge methods)
- src/renderer/env.d.ts (added Theme, ThemeEvidenceRef types + NswotAPI.themes)
- src/renderer/hooks/use-themes.ts (new — useThemes, useUpdateTheme, useDeleteTheme)
- src/renderer/routes/themes.tsx (new — full themes editor page)
- src/renderer/App.tsx (added /themes/:analysisId route)
- src/renderer/routes/analysis.tsx (added "View Themes" button)
- src/renderer/routes/analysis-history.tsx (added "Themes" button)

</details>

---

## Agent B — Sprint 21: E2E Testing + Documentation — PENDING

> **Status: BLOCKED.** Depends on all prior sprints being completed by both agents.

PREREQUISITE: All prior sprints completed and merged. This is the final sprint.

READ FIRST:

- docs/16-parallel-sprint-plan.md (you are Agent B, Week 7 — all sections)
- docs/07-testing-strategy.md § E2E Tests (testing approach)
- docs/02-architecture-spec.md (to update)
- docs/04-phases-roadmap.md (to update)
- docs/05-domain-model.md (to update with themes, comparison, chat actions
  entities)
- docs/08-prompt-engineering.md (to update with multi-step prompts)
- All src/main/analysis/steps/\*.ts (verify all steps run in sequence)

SCOPE:

1. Run Gate 3 integration test: execute full multi-step pipeline
   (extraction -> synthesis -> swot-generation -> theme-extraction) and verify
   all steps complete without error
2. Write cross-feature E2E tests:
   - Analysis with codebase data → SWOT with codebase evidence → chat with
     actions → create Jira issue (mock CLI)
   - Run two analyses → compare them → verify diff shows meaningful changes
   - Multi-step pipeline → themes extracted → themes visible in UI
   - Export in all 3 formats (MD/CSV/PDF) from same analysis
3. Validate Phase 3d exit criteria from docs/04-phases-roadmap.md:
   - Codebase analysis works on selected repos
   - Chat actions create artifacts with approval flow
   - Comparison view shows differences between runs
   - Themes are extracted and editable
   - All export formats work
4. Update documentation:
   - docs/02-architecture-spec.md — add Phase 3 provider descriptions
     (CodebaseProvider, ActionExecutor), multi-step pipeline architecture, chat
     actions tool-use bridge
   - docs/04-phases-roadmap.md — mark Phase 3d as completed with actual
     scope
   - docs/05-domain-model.md — add Theme entity, ChatAction entity,
     ComparisonResult types
   - docs/08-prompt-engineering.md — add multi-step prompt templates
     (extraction prompt, synthesis prompt), update VP role if needed
5. Final pass on docs/16-parallel-sprint-plan.md — mark all sprints
   complete

FILES YOU OWN:

- All test files (new E2E tests)
- docs/02-architecture-spec.md
- docs/04-phases-roadmap.md
- docs/05-domain-model.md
- docs/08-prompt-engineering.md
- docs/16-parallel-sprint-plan.md (final status update)

FILES TO AVOID: Do NOT modify renderer route files or src/main/ source
files — only tests and docs this week. Agent A may still be merging themes
UI.

COMPLETION CRITERIA:

- Full multi-step pipeline runs end-to-end without error
- Cross-feature E2E tests pass
- All Phase 3d exit criteria validated
- Documentation accurately reflects the current codebase architecture
- All sprints in docs/16-parallel-sprint-plan.md marked complete
- pnpm typecheck && pnpm test passes with no regressions

WHEN DONE: Mark Sprint 21 tasks 21.1–21.3 as complete in
docs/16-parallel-sprint-plan.md. Update the top of doc 16 with: "All
sprints complete. Phase 3b-3d delivered in 7 weeks with two-agent parallel
execution." Then run pnpm typecheck && pnpm test one final time to confirm
everything is green.
