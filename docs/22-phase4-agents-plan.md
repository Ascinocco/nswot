# nswot — Phase 4 Per-Sprint Agent Execution Plans

> Per-sprint instructions for Agent A and Agent B during Phase 4.
> Reference: `docs/18-phase4-chat-experience-plan.md` (full spec), `docs/21-phase4-sprint-plan.md` (status tracking).

---

## Sprint 36: Agent Harness Core + Content Block Types

### Agent A — Agent Harness Backend

**Branch**: `sprint-36/agent-harness`

| Task | Files | Notes |
|------|-------|-------|
| Tool registry with categorized tools (render/read/write) | `src/main/providers/agent-tools/tool-registry.ts` (NEW) | Extends `ActionToolDefinition` pattern. Categories: render (no approval), read (no approval), write (approval required). |
| Agent execution loop: send → tool_use → execute → tool_result → repeat | `src/main/services/agent.service.ts` (NEW) | Core agentic loop. Continues until finishReason is `stop` (no tool calls). Uses LLMProvider.createChatCompletion(). |
| Thinking capture: extract thinking blocks from LLM responses, emit via callback | `src/main/services/agent.service.ts` | Handles Anthropic `thinking` content blocks. Emits `onThinking(text)` callback. |
| Interrupt handling: abort in-flight request, store partial response | `src/main/services/agent.service.ts` | AbortController integration. User clicks Stop → cancels fetch, stores partial. |
| Unit tests for agent harness (incl. thinking capture) | `src/main/services/agent.service.test.ts` (NEW) | Mock LLM responses with tool calls and thinking blocks. |

**Dependencies on Agent B**: Agent B provides `ContentBlock` types (content-block.types.ts) and tool definitions (render-tools.ts, read-tools.ts, write-tools.ts). Agent A can start with locally-defined interfaces and align at Gate 1.

**Completion criteria**:
- Tool registry loads categorized tools and can query by category
- Agent loop executes mock LLM response with one render tool call and produces a ContentBlock
- Thinking blocks captured from mock Anthropic responses
- Interrupt aborts in-flight request cleanly
- All tests pass, typecheck clean

### Agent B — Content Block Types + Tool Definitions + Schema

> **Status: COMPLETE.**

**Branch**: `sprint-36/content-blocks`

| Task | Files | Notes |
|------|-------|-------|
| ContentBlock type definitions (incl. `thinking` type) | `src/main/domain/content-block.types.ts` (NEW) | All block types, ContentBlockType union. See doc 18 Section 1.6. |
| Render tool definitions (7 tools) | `src/main/providers/agent-tools/render-tools.ts` (NEW) | OpenAI function schema format, extends ActionToolDefinition. |
| Read tool definitions (5 tools) | `src/main/providers/agent-tools/read-tools.ts` (NEW) | OpenAI function schema format. |
| Write tool definitions (update existing + write_file) | `src/main/providers/agent-tools/write-tools.ts` (NEW) | Extends Phase 3c action tools + new `write_file`. |
| Migration v6: conversations, content_format, approval_memory, conversation_id + parent_analysis_id on analyses | `src/main/db/migrations/006-phase4.sql` (NEW) | All Phase 4 schema changes. |
| IPC channels for agent communication | `src/main/ipc/channels.ts` (MODIFY, append-only) | Agent state, block, thinking events. |

**Completion criteria**:
- All ContentBlock types defined with TypeScript discriminated union
- All tool definitions compile and follow ActionToolDefinition pattern
- Migration v6 creates all Phase 4 tables/columns
- IPC channels added for agent events

### Gate 1 Validation

Both agents validate by running a test that:
1. Sends a mock LLM response containing a `render_swot_analysis` tool call
2. Agent harness executes the tool call
3. Verifies a `swot_analysis` ContentBlock is produced
4. Verifies thinking blocks are captured from a mock response

ContentBlock types are **frozen** after Gate 1. No changes to the type union or data shapes in later sprints.

---

## Sprint 37: Chat Analysis Page + Conversation Lifecycle

### Agent A — Backend: Conversation Lifecycle + Run-in-Chat

> **Status: COMPLETE.**

**Branch**: `sprint-37/conversation-lifecycle`

| Task | Files | Notes |
|------|-------|-------|
| ConversationRepository: CRUD for conversations table | `src/main/repositories/conversation.repository.ts` (NEW) | findByWorkspace, findById, insert, updateTitle, updateTimestamp, delete |
| ConversationService: create conversation on analysis start, list/resume | `src/main/services/conversation.service.ts` (NEW) | list/get/create/updateTitle/delete/touch + auto-title generation |
| Conversation IPC handlers | `src/main/ipc/handlers/conversation.ipc.ts` (NEW) | 5 thin handlers via CONVERSATION_* channels |
| "Run-in-chat" mode: analysis pipeline → emits content blocks | `src/main/services/analysis.service.ts` (MODIFY) | `runAnalysisInChat()` — creates analysis linked to conversationId |
| Agent state events: emit state changes via IPC | `src/main/ipc/handlers/agent.ipc.ts` (NEW) | AGENT_SEND (streaming callbacks for chunk/thinking/block/state/tokenCount) + AGENT_INTERRUPT |
| Token counting: accumulate from LLM responses, emit via IPC | `src/main/services/agent.service.ts` (MODIFY) | LlmUsage type, accumulated across multi-turn loop, emitted via onTokenCount callback |
| ChatMessage contentFormat field | `src/main/domain/types.ts` + `src/main/repositories/chat.repository.ts` (MODIFY) | `contentFormat: 'text' \| 'blocks'` field |
| Preload bridge alignment | `src/preload/api.ts` + `src/preload/index.ts` + `src/renderer/env.d.ts` (MODIFY) | Aligned Agent B's preload additions with actual IPC handler signatures |
| Tests | `src/main/services/conversation.service.test.ts` (NEW) + `agent.service.test.ts` (MODIFY) | 14 conversation tests + 3 token counting tests = 60 total Sprint 36+37 tests |

### Agent B — Frontend: Chat Analysis Page + UX

> **Status: COMPLETE.**

**Branch**: `sprint-37/chat-analysis-page`

| Task | Files | Notes |
|------|-------|-------|
| Chat Analysis page (conversation list / active conversation) | `src/renderer/routes/chat-analysis.tsx` (NEW) | Primary new page |
| Conversation list component | `src/renderer/components/chat/conversation-list.tsx` (NEW) | Cards with title, role, date |
| Config panel component | `src/renderer/components/chat/analysis-config-panel.tsx` (NEW) | Collapsible accordion |
| Pipeline progress indicator | `src/renderer/components/chat/pipeline-progress.tsx` (NEW) | Horizontal stepped bar |
| Status bar component | `src/renderer/components/chat/status-bar.tsx` (NEW) | Agent state, source icons, stop |
| ThinkingBlock component | `src/renderer/components/chat/blocks/thinking-block.tsx` (NEW) | Collapsible thinking card |
| ContentBlockRenderer | `src/renderer/components/chat/content-block-renderer.tsx` (NEW) | Maps block type → component |
| Route changes | `src/renderer/App.tsx` (MODIFY) | Add /chat-analysis, redirect old routes |
| Agent + conversation hooks | `src/renderer/hooks/use-agent.ts` (NEW), `src/renderer/hooks/use-conversations.ts` (NEW) | State hooks |

---

## Sprint 38: Render Tool Execution + Block Components

### Agent A — Backend: Render Tool Execution

> **Status: COMPLETE.**

**Branch**: current active branch

| Task | Files | Notes |
|------|-------|-------|
| RenderExecutor: maps 7 render tool calls to ContentBlock creation | `src/main/providers/agent-tools/render-executor.ts` (NEW) | Validates input, creates typed blocks via `makeBlock()`. render_comparison delegates to ComparisonService. |
| ToolExecutorRouter: dispatches execute() by category | `src/main/providers/agent-tools/tool-executor-router.ts` (NEW) | render → RenderExecutor, read/write → placeholder errors (Sprint 39/40) |
| Agent harness factory: wires registry + executor + LLM provider | `src/main/providers/agent-tools/agent-harness-factory.ts` (NEW) | `createAgentHarness(llmProvider, comparisonService)` → fully-wired AgentService |
| Tests for all render tools + router + factory | `src/main/providers/agent-tools/render-executor.test.ts` (NEW) | 27 render executor tests + 3 router/factory tests = 30 new tests |

**Completion criteria**:
- All 7 render tools produce correct ContentBlock type and data
- Input validation rejects missing/invalid fields with error messages
- render_comparison delegates to ComparisonService
- ToolExecutorRouter dispatches by category
- Factory creates AgentService with all render tools registered
- All tests pass, typecheck clean

### Agent B — Frontend: Block Components

> **Status: COMPLETE.**

**Branch**: current active branch

| Task | Files | Notes |
|------|-------|-------|
| SwotBlock component | `src/renderer/components/chat/blocks/swot-block.tsx` (NEW) | 4-quadrant grid with confidence badges, evidence cards, impact/action |
| SummaryBlock component | `src/renderer/components/chat/blocks/summary-block.tsx` (NEW) | Markdown summary cards via react-markdown |
| MetricsBlock component | `src/renderer/components/chat/blocks/metrics-block.tsx` (NEW) | Quality score badge, stats grid, coverage progress bars |
| MermaidBlock component | `src/renderer/components/chat/blocks/mermaid-block.tsx` (NEW) | Mermaid-to-SVG with dark theme, error state |
| ChartBlock component | `src/renderer/components/chat/blocks/chart-block.tsx` (NEW) | Chart.js bar/line/pie/radar/doughnut from spec |
| DataTableBlock component | `src/renderer/components/chat/blocks/data-table-block.tsx` (NEW) | Sortable table with column headers |
| ComparisonBlock component | `src/renderer/components/chat/blocks/comparison-block.tsx` (NEW) | Diff deltas by SWOT category, summary counts |
| ContentBlockRenderer update | `src/renderer/components/chat/content-block-renderer.tsx` (MODIFY) | All 7 block types dispatched, typed imports |
| chat-analysis.tsx hook alignment | `src/renderer/routes/chat-analysis.tsx` (MODIFY) | useAgentState/useTokenCount take conversationId, createConversation takes role |

**Completion criteria**:
- All 7 block components render from JSON data payloads
- ContentBlockRenderer dispatches all block types (no more placeholders except approval/action_status)
- Typecheck clean, no new test failures

---

## Sprint 39: Read Tools + Agentic Follow-ups

### Agent A — Backend: Read Tool Execution

> **Status: COMPLETE.**

**Branch**: current active branch

| Task | Files | Notes |
|------|-------|-------|
| ReadExecutor: all 5 read tools | `src/main/providers/agent-tools/read-executor.ts` (NEW) | Queries integration cache + profiles. Returns JSON summaries. Query/tag filtering for search. |
| Wire into ToolExecutorRouter | `src/main/providers/agent-tools/tool-executor-router.ts` (MODIFY) | read category → ReadExecutor |
| Update agent-harness-factory | `src/main/providers/agent-tools/agent-harness-factory.ts` (MODIFY) | ReadExecutor wiring, READ_TOOLS registration, AgentHarnessOptions interface |
| Tests | `src/main/providers/agent-tools/read-executor.test.ts` (NEW) | 22 tests covering all 5 tools + edge cases |

**Read tools implemented:**
- `fetch_jira_data`: Queries integration cache for epics/stories/comments, optional query filter
- `fetch_confluence_data`: Queries pages/comments, optional query filter
- `fetch_github_data`: Queries PRs/issues/comments, optional query filter
- `run_codebase_analysis`: Queries cached codebase analyses by repo, uses workspace defaults
- `search_profiles`: Queries ProfileRepository, filters by query (name/role/team/concerns) and tags

**Completion criteria**:
- All 5 read tools query integration cache and return JSON summaries
- Disconnected/empty integrations return helpful error messages
- Query filtering works across all data source tools
- Profile search supports both text query and tag filtering
- All tests pass, typecheck clean

### Agent B — Frontend: Multi-Turn Streaming UX

> **Status: COMPLETE.**

**Branch**: current active branch

| Task | Files | Notes |
|------|-------|-------|
| Tool activity IPC channel | `src/main/ipc/channels.ts` (MODIFY, append) | AGENT_TOOL_ACTIVITY channel |
| Tool activity event in preload + env.d.ts | `src/preload/api.ts` (MODIFY), `src/preload/index.ts` (MODIFY), `src/renderer/env.d.ts` (MODIFY) | onToolActivity callback: {conversationId, toolName, status, message} |
| useToolActivity hook | `src/renderer/hooks/use-agent.ts` (MODIFY) | Tracks active tool per conversation, clears on completion |
| Source activity in status bar | `src/renderer/components/chat/status-bar.tsx` (MODIFY) | Animated Jira/Conf/GH/Code icons, active state highlight |
| Tool progress indicator | `src/renderer/components/chat/tool-progress.tsx` (NEW) | Inline "Fetching X data..." cards with source-colored badges |
| Streaming thinking + interleaved blocks | `src/renderer/components/chat/rich-message.tsx` (MODIFY) | streamingThinking, toolActivity props, ThinkingBlock in streaming mode |
| Turn completion + multi-turn handling | `src/renderer/routes/chat-analysis.tsx` (MODIFY) | prevAgentStateRef for turn detection, agentThinking integration, toolActivity pass-through |

**Completion criteria**:
- Source activity icons animate in status bar when read tools execute
- Tool progress cards appear inline during tool execution
- Thinking streams progressively during follow-ups
- Turn completion finalizes blocks into messages, enabling multi-turn accumulation
- Typecheck clean, no new test failures

---

## Sprint 40: Approval Memory + Re-Run UX

### Agent A — Backend: Approval Memory + Write Tools

> **Status: COMPLETE.**

**Branch**: current active branch

| Task | Files | Notes |
|------|-------|-------|
| ApprovalMemoryRepository: CRUD for approval_memory table | `src/main/repositories/approval-memory.repository.ts` (NEW) | findByConversation, isApproved, set (upsert), deleteByConversation |
| ApprovalMemoryService: check/set/list per conversation | `src/main/services/approval-memory.service.ts` (NEW) | isToolApproved/remember/list. Wraps repository, used by agent IPC for auto-approval |
| Pending approval resolution mechanism | `src/main/ipc/agent-approval.ts` (NEW) | registerPendingApproval/resolveAgentApproval — promise map bridging agent loop ↔ IPC approve/reject |
| Agent IPC: onApprovalRequest with memory check | `src/main/ipc/handlers/agent.ipc.ts` (MODIFY) | Checks approval memory → auto-approve, emits approval ContentBlock, blocks on pending promise |
| Chat IPC: resolve Phase 4 agent approvals | `src/main/ipc/handlers/chat.ipc.ts` (MODIFY) | APPROVE/REJECT handlers check for pending agent approvals before Phase 3c flow |
| WriteExecutor: write_file + Phase 3c action tool delegation | `src/main/providers/agent-tools/write-executor.ts` (NEW) | write_file via FileService, Phase 3c tools via ActionExecutor |
| Wire write tools into router + factory | `src/main/providers/agent-tools/tool-executor-router.ts` (MODIFY), `agent-harness-factory.ts` (MODIFY) | write category → WriteExecutor, WRITE_TOOLS registered, FileService + ActionExecutor wiring |
| Approval memory IPC handlers | `src/main/ipc/handlers/approval-memory.ipc.ts` (NEW) | APPROVAL_MEMORY_LIST, APPROVAL_MEMORY_SET |
| Tests | `write-executor.test.ts` (NEW), `approval-memory.service.test.ts` (NEW), `agent-approval.test.ts` (NEW) | 25 new tests (14 + 6 + 5). 134 total Sprint 36-40 tests |

**Completion criteria**:
- Approval memory persists per-conversation tool approvals
- Auto-approval skips UI when tool is remembered as approved
- Write tools execute via WriteExecutor (write_file + Phase 3c delegation)
- Agent approval flow blocks loop, emits approval block, resolves via IPC
- All tests pass, typecheck clean

### Agent B — Frontend: 3-Tier Approval UI + Re-Run UX

> **Status: COMPLETE.**

**Branch**: current active branch

| Task | Files | Notes |
|------|-------|-------|
| Approval block component | `src/renderer/components/chat/blocks/approval-block.tsx` (NEW) | Self-contained approval with IPC calls for approve/reject/edit + "Yes + Remember" saves to approvalMemory |
| Action status block component | `src/renderer/components/chat/blocks/action-status-block.tsx` (NEW) | Completed/rejected/failed status with tool label + result links |
| Write file preview component | `src/renderer/components/chat/blocks/write-file-preview.tsx` (NEW) | Syntax-aware file preview with expandable content, approve/remember/reject buttons |
| Memory indicator component | `src/renderer/components/chat/memory-indicator.tsx` (NEW) | Green badges for auto-approved tools per conversation, polls every 5s |
| Pinned summary component | `src/renderer/components/chat/pinned-summary.tsx` (NEW) | "Jump to results" affordance per analysis run, supports multi-run |
| Approval card: "Yes + Remember" button | `src/renderer/components/analysis/approval-card.tsx` (MODIFY) | Optional onApproveAndRemember callback + "Yes + Remember" button |
| File approval card: "Yes + Remember" button | `src/renderer/components/chat/file-approval-card.tsx` (MODIFY) | Same pattern as approval-card |
| ContentBlockRenderer: approval + action_status dispatch | `src/renderer/components/chat/content-block-renderer.tsx` (MODIFY) | approval → ApprovalBlock, action_status → ActionStatusBlock, conversationId prop |
| RichMessage: conversationId prop | `src/renderer/components/chat/rich-message.tsx` (MODIFY) | Passes conversationId to ContentBlockRenderer |
| ChatAnalysisPage: re-run UX + memory + pinned summary | `src/renderer/routes/chat-analysis.tsx` (MODIFY) | analysisIds tracking, resultsRefs, handleReRun, handleJumpToResults, "Re-run with different settings" button, MemoryIndicator + PinnedSummary |
| Preload bridge: approvalMemory section | `src/renderer/env.d.ts` (MODIFY), `src/preload/api.ts` (MODIFY), `src/preload/index.ts` (MODIFY) | approvalMemory.list + approvalMemory.set |

**Completion criteria**:
- Approval block renders with Approve / Yes + Remember / Reject buttons
- "Yes + Remember" saves to approval memory and approves the action
- Action status block shows completed/rejected/failed with appropriate styling
- Write file preview shows syntax-highlighted expandable content
- Memory indicator shows auto-approved tools as green badges
- Pinned summary enables "Jump to results" navigation
- Re-run button re-expands config panel for re-configuration
- Typecheck clean, no new test failures

---

## Sprint 41: Polish + Dead Code Cleanup

### Agent A — Backend: Diagram Export + E2E Testing

> **Status: COMPLETE.**

**Branch**: current active branch

| Task | Files | Notes |
|------|-------|-------|
| DiagramExportService: save PNG to workspace | `src/main/services/diagram-export.service.ts` (NEW) | Base64 PNG → binary → workspace file via FileService. Path validation + .png extension |
| EXPORT_DIAGRAM_PNG IPC channel + handler | `src/main/ipc/channels.ts` (MODIFY), `src/main/ipc/handlers/export.ipc.ts` (MODIFY) | New channel, optional diagramExportService param |
| E2E agent harness tests | `src/main/services/agent.service.test.ts` (MODIFY) | 7 new: multiple tool calls, mixed categories, approval states, MAX_LOOP guard, error recovery, LLM error, thinking accumulation |
| Full lifecycle integration test | `src/main/providers/agent-tools/agent-harness.integration.test.ts` (NEW) | 7 tests: render, sequential renders, disconnected read, write approval, write rejection, validation errors, read→render→write lifecycle |
| DiagramExportService tests | `src/main/services/diagram-export.service.test.ts` (NEW) | 6 tests: success, extension, empty data/path, path traversal, write failure |

### Agent B — Frontend: Token Counter + Conversation Management + Polish + Dead Code

> **Status: COMPLETE.**

**Branch**: current active branch

| Task | Files | Notes |
|------|-------|-------|
| Token counter cost estimate | `src/renderer/components/chat/status-bar.tsx` (MODIFY) | modelPricing prop, formatCost helper, inline cost display with tooltip breakdown |
| Conversation title edit | `src/renderer/components/chat/conversation-list.tsx` (MODIFY) | Inline editing (input focus/blur/Enter/Escape), rename button, onRename prop |
| Conversation delete confirmation | `src/renderer/components/chat/conversation-list.tsx` (MODIFY) | Inline "Delete? Yes/No" confirmation instead of immediate delete |
| "Save as PNG" on MermaidBlock | `src/renderer/components/chat/blocks/mermaid-block.tsx` (MODIFY) | SVG→canvas→blob→download pipeline, 2x resolution |
| "Save as PNG" on ChartBlock | `src/renderer/components/chat/blocks/chart-block.tsx` (MODIFY) | canvas.toBlob download |
| Keyboard shortcuts | `src/renderer/routes/chat-analysis.tsx` (MODIFY) | Esc to stop agent, Cmd/Ctrl+N for new analysis, global keydown listener |
| Empty conversation placeholder | `src/renderer/routes/chat-analysis.tsx` (MODIFY) | Chat icon + helpful text when no messages |
| Agent error mid-turn handling | `src/renderer/routes/chat-analysis.tsx` (MODIFY) | Error detection on active→error transition, error message with Retry button |
| Keyboard hints in input | `src/renderer/routes/chat-analysis.tsx` (MODIFY) | "Enter to send / Shift+Enter for newline / Esc to stop" hints |
| Model pricing for cost estimate | `src/renderer/routes/chat-analysis.tsx` (MODIFY) | Fetches model list on mount, passes pricing to StatusBar |
| Rename callback wiring | `src/renderer/routes/chat-analysis.tsx` (MODIFY) | useUpdateConversationTitle hook, handleRenameConversation, passed to ConversationList |
| Dead routes cleanup | `src/renderer/routes/analysis.tsx` (DELETE), `analysis-detail.tsx` (DELETE), `analysis-history.tsx` (DELETE) | Removed 3 dead route pages |
| Dead analysis components | `src/renderer/components/analysis/` (DELETE 6) | Removed swot-results, payload-preview, quality-metrics, deanonymize-tooltip, chat-panel, action-status |
| Dead visualization components | `src/renderer/components/visualizations/` (DELETE 4) | Removed swot-heatmap, source-coverage-chart, theme-distribution-chart, coverage-radar-chart |
| Dead hooks | `src/renderer/hooks/` (DELETE 3) | Removed use-export, use-analysis, use-pseudonym-map |
| App.tsx route cleanup | `src/renderer/App.tsx` (MODIFY) | Removed AnalysisDetailPage import + route, /analysis/:analysisId now redirects |

**Completion criteria**:
- Token counter shows cost estimate with model pricing
- Conversation title editable inline with Enter/Escape
- Delete has inline confirmation
- Mermaid and chart blocks have "Save as PNG" button
- Esc stops agent, Cmd+N creates new analysis
- Empty conversation shows placeholder
- Agent error shows retry button
- All dead code removed (3 routes, 6 components, 4 viz, 3 hooks)
- Typecheck clean, no new test failures
