# nswot — Phase 4 Sprint Plan (Sprint 36 → 41)

> **Two-agent execution model for Phase 4: Chat-Driven Agent Experience.**
> Continues from Phase 3e (Sprints 22-35, see `docs/19-phase3e-sprint-plan.md`).
> 6 sprints across 6 weeks. Transforms nswot from page-based analysis into chat-driven agent experience.
>
> See `docs/18-phase4-chat-experience-plan.md` for full spec and `docs/22-phase4-agents-plan.md` for per-sprint agent instructions.

**Prerequisite**: Phase 3e complete (Sprint 35 docs + polish merged). Post-Phase 3e bug fixes merged.

### Completion Log

| Sprint | Agent | Week | Notes |
|--------|-------|------|-------|
| Sprint 36 | A | 1 | Agent Harness Core. ToolRegistry (categorized render/read/write), AgentService (multi-turn execution loop, thinking capture via `<thinking>` tag extraction, interrupt handling via AbortController, approval gates for write tools). 43 new tests pass. `src/main/providers/agent-tools/tool-registry.ts` + `src/main/services/agent.service.ts` + tests. |
| Sprint 36 | B | 1 | Content Block Types + Tool Definitions + Schema. ContentBlock discriminated union (11 types incl. thinking) in `content-block.types.ts`. Render tools (7), read tools (5), write tools (Phase 3c + write_file) in `agent-tools/`. Migration v6: conversations table, content_format, approval_memory, conversation_id + parent_analysis_id on analyses. IPC channels for agent/conversation/approval events. Database test updated for 12 tables + version 6. |
| Sprint 37 | A | 2 | Conversation lifecycle + agent IPC. ConversationRepository (CRUD), ConversationService (list/get/create/updateTitle/delete/touch + auto-title generation), conversation.ipc.ts, agent.ipc.ts (AGENT_SEND + AGENT_INTERRUPT with streaming callbacks for chunk/thinking/block/state/tokenCount), run-in-chat mode on AnalysisService, token counting (LlmUsage type + accumulation), ChatMessage.contentFormat field, preload bridge alignment. 60 tests (28 agent + 14 conversation + 18 tool-registry). |
| Sprint 37 | B | 2 | Chat Analysis Page + UX. New route `/chat-analysis` with conversation list, config panel, pipeline progress indicator, status bar, thinking block, content block renderer, rich message wrapper. App.tsx updated: sidebar nav replaces Analysis/History with Chat Analysis, old routes redirect. Preload bridge + env.d.ts extended with conversations (CRUD) and agent (send, interrupt, state/block/thinking/token events) sections. Hooks: use-conversations.ts (5 hooks), use-agent.ts (5 hooks). |
| Sprint 38 | A | 3 | Render Tool Execution. RenderExecutor (all 7 render tools → ContentBlock creation with input validation), ToolExecutorRouter (dispatches by category to RenderExecutor), agent-harness-factory (wires registry + executor + LLM provider). render_comparison delegates to ComparisonService. 27 render-executor tests + 3 router/factory tests. 87 total Sprint 36-38 tests. |
| Sprint 38 | B | 3 | Block Components. All 7 block components: SwotBlock (4-quadrant grid with evidence cards), SummaryBlock (markdown summary cards), MetricsBlock (quality score + coverage bars), MermaidBlock (mermaid-to-SVG with dark theme), ChartBlock (Chart.js bar/line/pie/radar/doughnut), DataTableBlock (sortable table), ComparisonBlock (diff deltas by category). ContentBlockRenderer updated to dispatch all block types. chat-analysis.tsx updated: useAgentState/useTokenCount now receive conversationId, createConversation passes role. Hooks aligned with Agent A's refined API signatures. |
| Sprint 39 | A | 4 | Read Tool Execution. ReadExecutor (all 5 read tools: fetch_jira_data, fetch_confluence_data, fetch_github_data, run_codebase_analysis, search_profiles). Queries integration cache repos and ProfileRepository, returns JSON summaries with query/tag filtering. ToolExecutorRouter updated for read dispatch. agent-harness-factory updated with ReadExecutor wiring + READ_TOOLS registration. 22 read-executor tests. 109 total Sprint 36-39 tests. |
| Sprint 39 | B | 4 | Multi-Turn Streaming UX. New AGENT_TOOL_ACTIVITY IPC channel + onToolActivity event across preload/env.d.ts. New useToolActivity hook tracks active tool name/status per conversation. Status bar updated: source activity icons (Jira/Conf/GH/Code) with animated active state. New tool-progress.tsx: inline "Fetching X data..." cards with source-colored badges. RichMessage updated: supports streamingThinking (ThinkingBlock in streaming mode) + toolActivity (ToolProgress inline) + interleaved blocks. ChatAnalysisPage: turn completion detection (prevAgentStateRef tracks idle transitions → finalizes blocks+text into message), agentThinking integration, toolActivity passed through to StatusBar and RichMessage. |
| Sprint 40 | A | 5 | Approval Memory + Write Tools. ApprovalMemoryRepository (CRUD on approval_memory table with upsert). ApprovalMemoryService (isToolApproved/remember/list). WriteExecutor (write_file via FileService + Phase 3c tools via ActionExecutor). ToolExecutorRouter updated: write category → WriteExecutor. agent-harness-factory updated: WRITE_TOOLS registration, FileService + ActionExecutor wiring. Agent approval flow: agent-approval.ts (pending promise map), agent.ipc.ts onApprovalRequest (checks memory → auto-approve, emits approval block, blocks on pending promise), chat.ipc.ts updated (resolves agent approvals before Phase 3c flow). approval-memory.ipc.ts (APPROVAL_MEMORY_LIST + SET handlers). 25 new tests (14 write-executor + 6 approval-memory-service + 5 agent-approval). 134 total Sprint 36-40 tests. |
| Sprint 40 | B | 5 | 3-Tier Approval UI + Re-Run UX. New approval-block.tsx (self-contained approval component with IPC calls for approve/reject/edit + "Yes + Remember" saves to approvalMemory). New action-status-block.tsx (completed/rejected/failed status with tool label + result links). New write-file-preview.tsx (syntax-aware file preview with expandable content + approve/remember/reject). New memory-indicator.tsx (green badges for auto-approved tools per conversation, polls every 5s). New pinned-summary.tsx ("Jump to results" affordance per analysis run). approval-card.tsx + file-approval-card.tsx updated with optional onApproveAndRemember callback + "Yes + Remember" button. ContentBlockRenderer updated: approval dispatches to ApprovalBlock, action_status to ActionStatusBlock, conversationId prop threaded through. RichMessage: added conversationId prop. ChatAnalysisPage: analysisIds state for tracking re-runs, resultsRefs for jump-to-results scrolling, handleReRun (config re-expansion), handleJumpToResults, "Re-run with different settings" button, MemoryIndicator + PinnedSummary below status bar. env.d.ts + preload: approvalMemory section (list + set). |
| Sprint 41 | A | 6 | Diagram Export + E2E Testing. DiagramExportService (base64 PNG → workspace file via FileService, path validation). EXPORT_DIAGRAM_PNG IPC channel + handler in export.ipc.ts. Comprehensive E2E agent harness tests: multiple tool calls in one response, mixed categories (render+read+write) across turns, approval state transitions, MAX_LOOP_ITERATIONS guard, error recovery mid-loop, LLM error mid-loop, thinking accumulation across rounds. Full lifecycle integration test via createAgentHarness: read → render → write with real executors. 20 new tests (7 E2E agent + 7 integration + 6 diagram-export). 154 total Sprint 36-41 tests. |
| Sprint 41 | B | 6 | Token counter + conversation management + keyboard shortcuts + export buttons + edge cases + dead code cleanup. StatusBar: cost estimate from model pricing (formatCost, modelPricing prop, inline cost with tooltip). ConversationList: inline title editing (input focus/blur/Enter/Escape), delete confirmation inline, rename button + onRename prop. MermaidBlock + ChartBlock: "Save as PNG" export buttons (SVG→canvas→blob→download, canvas.toBlob). ChatAnalysisPage: global keyboard shortcuts (Esc stop, Cmd/Ctrl+N new), model pricing fetch, empty conversation placeholder, agent error mid-turn with retry button, keyboard hints. Dead code: deleted 3 routes (analysis, analysis-detail, analysis-history), 6 analysis components (swot-results, payload-preview, quality-metrics, deanonymize-tooltip, chat-panel, action-status), 4 viz components (swot-heatmap, source-coverage-chart, theme-distribution-chart, coverage-radar-chart), 3 hooks (use-export, use-analysis, use-pseudonym-map). App.tsx: removed AnalysisDetailPage import, /analysis/:analysisId → redirect. |

### Gate Status

| Gate | Status | Details |
|------|--------|---------|
| Gate 1: ContentBlock Types + Agent Harness Core | **PENDING** | ContentBlock types frozen (incl. thinking). Agent harness executes one render tool → ContentBlock. Thinking captured from mock responses. |
| Gate 2: Chat Analysis Page + Conversation Lifecycle | **PENDING** | Chat Analysis page renders with list + config + chat. Pipeline progress shows steps. Old routes redirect. |
| Gate 3: Render Tools + Block Components | **PENDING** | All 7 render tools produce valid ContentBlocks. All block components render from JSON. |
| Gate 4: Read Tools + Multi-Turn Loop | **PENDING** | Multi-turn loop with read tools works E2E. Thinking streams during follow-ups. |
| Gate 5: Approval Memory + Re-run | **PENDING** | Approval memory auto-approves per-conversation. Re-run works. Config re-expansion works. |

---

## Sprint Overview

| Sprint | Agent A (Backend) | Agent B (Frontend/Types) | Gate |
|--------|-------------------|--------------------------|------|
| 36 | Agent harness: registry, execution loop, interrupt, thinking capture | ContentBlock types, all tool defs, migration v6, conversations schema | G1 |
| 37 | Conversation lifecycle, run-in-chat, agent state + progress events, token counting, preload bridge | Chat Analysis page: conversation list, config panel, pipeline progress, status bar, thinking block, routes | G2 |
| 38 | Render tool execution (all 7 tools), harness integration | Block components (SwotBlock, MermaidBlock, ChartBlock, etc.), ContentBlockRenderer | G3 |
| 39 | Read tool execution, multi-turn loop, provider query methods, "go deeper" | Multi-turn streaming UX, source activity, progress indicators per tool | G4 |
| 40 | Approval memory backend, re-run analysis, write_file tool | 3-tier approval UI, memory indicator, re-run UX, pinned summary | G5 |
| 41 | SVG-to-PNG export, E2E testing, docs | Token counter, conversation management, visual polish, edge cases, dead code cleanup | — |

---

## File Ownership Matrix

See `docs/18-phase4-chat-experience-plan.md` Section 5 for the canonical ownership matrix.

**Shared file**: `src/main/ipc/channels.ts` — append-only, both agents add channels.

**Coordination rule**: Agent B defines tool schemas (render-tools.ts, read-tools.ts, write-tools.ts) and ContentBlock types. Agent A implements tool executors and the agent harness that uses them. Types are frozen at Gate 1.
