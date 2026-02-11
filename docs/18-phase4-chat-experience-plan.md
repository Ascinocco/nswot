# nswot — Phase 4: Chat-Driven Agent Experience

> Feature specification, architecture plan, and parallelized sprint decomposition.
> Transforms nswot from a page-based analysis app into a chat-driven agent experience.
> Depends on Phase 3 completion. See `docs/04-phases-roadmap.md` for phase definitions.

---

## 1. Product Vision

### 1.1 The Transformation

Today, the analysis page renders a configuration form, runs a pipeline in the background, then shows static results with a side-panel chat. Phase 4 replaces this with a unified conversational experience:

1. User clicks **Run Analysis** — page immediately transitions to a full-page chat view
2. The agent streams the initial analysis as **rich content blocks** (SWOT cards, summary cards, quality metrics) directly into the conversation
3. Follow-up questions, data fetches, new diagrams, and write actions all happen within the same conversational thread
4. The agent's final initial message contains the full structured output as rendered cards — a **pinned summary** the user can jump back to

All existing pages (workspace, profiles, integrations, settings, history) remain unchanged. Only the analysis flow transforms.

### 1.2 Page Transition

When the user clicks "Run Analysis":
- The renderer immediately navigates to the chat view (instant transition, no waiting)
- The existing analysis pipeline (`AnalysisOrchestrator` + `PipelineStep`s) runs in the background
- The first assistant message streams progressively, showing data collection activity and then the structured output
- The status bar provides real-time agent state feedback

### 1.3 Status Bar

A persistent status bar across the top of the chat view:

| Element | Description |
|---------|-------------|
| Agent state | `Analyzing...` / `Thinking...` / `Fetching data...` / `Ready` |
| Source activity | Icons for which integration is being queried (Jira, Confluence, GitHub, Codebase) |
| Token counter | Running total of input + output tokens, with approximate cost estimate |
| Stop button | Interrupts the current agent turn (cancels in-flight LLM request) |

Cost is derived from token count + model pricing stored in model metadata.

### 1.4 Rich Content Blocks

The current `ChatMessage.content` field is a plain string. Phase 4 changes this to a JSON array of `ContentBlock[]`. Each block has a `type` discriminator and typed payload:

```typescript
type ContentBlockType =
  | 'text' | 'swot_analysis' | 'summary_cards' | 'quality_metrics'
  | 'mermaid' | 'chart' | 'data_table' | 'comparison'
  | 'approval' | 'action_status';

interface ContentBlock {
  type: ContentBlockType;
  id: string;              // unique block ID for stable React keys
  data: unknown;           // typed per block type
}
```

Block type details:

| Block Type | Data Shape | Renderer |
|------------|------------|----------|
| `text` | `{ text: string }` | Markdown renderer (streaming) |
| `swot_analysis` | `SwotOutput` | Adapts existing `SwotResults` component |
| `summary_cards` | `SummariesOutput` | Adapts existing summary card components |
| `quality_metrics` | `EvidenceQualityMetrics` | Adapts existing `QualityMetrics` component |
| `mermaid` | `{ title: string, source: string }` | Mermaid-to-SVG renderer |
| `chart` | `{ title: string, type: string, spec: unknown }` | D3/Chart.js renderer |
| `data_table` | `{ title: string, headers: string[], rows: string[][] }` | Table component |
| `comparison` | `{ baseId: string, compareId: string, diff: unknown }` | Side-by-side diff view |
| `approval` | `ChatAction` (pending) | 3-tier approval card |
| `action_status` | `ChatAction` (resolved) | Status badge with result |

The renderer maps each block type to a React component via `ContentBlockRenderer`.

### 1.5 Approval Memory (3-Tier)

The current approval flow requires explicit approval for every write action. Phase 4 adds memory:

| Option | Behavior |
|--------|----------|
| **Yes** | Approve this specific action (one-time, same as current) |
| **Yes + Remember** | Approve this action AND auto-approve all future actions of the same tool type for the rest of this conversation |
| **No** | Reject this action |

- **Scope**: per-conversation. When a new conversation starts, memory resets.
- **Storage**: `approval_memory` table keyed by `analysis_id + tool_name`
- **Applies to**: write tools only. Read tools and render tools never require approval.
- **Categories**: `create_jira_issue`, `create_jira_issues`, `add_jira_comment`, `create_confluence_page`, `create_github_issue`, `create_github_pr`, `write_file`

### 1.6 Re-run in Conversation

A user can say "Run again with the VP perspective" or "Re-analyze focusing only on Jira data." This:

1. Creates a **new `analyses` row** in the database linked to the same conversation
2. Runs the full analysis pipeline with the new parameters
3. Streams the new results as a new set of content blocks in the chat
4. The new analysis gets its own pinned summary

Multiple analysis snapshots can coexist within one conversation. A `conversation_id` column groups them. A `parent_analysis_id` column links re-runs to the original.

### 1.7 Diagram Rendering and Export

**Mermaid diagrams**:
- The `mermaid` npm package renders diagram source to SVG in the DOM
- Rendered inline within the chat as an SVG element
- Exportable to PNG

**D3/Chart.js visualizations**:
- React wrapper components produce SVG via D3 or Chart.js
- Rendered inline within the chat
- Exportable to PNG

**PNG export pipeline**:
1. SVG element drawn to a `<canvas>` element
2. `canvas.toBlob('image/png')` produces the image
3. Written to workspace via `FileService` (follows workspace path enforcement)

One shared utility handles both Mermaid and D3 export.

---

## 2. Architecture

### 2.1 Agent Harness

The agent harness is a mini agent runtime in the main process. It is the **critical engineering path** for Phase 4.

```text
User Message → Agent Harness → LLM Provider (tool_use response)
                    ↓
               Tool Execution ← render / read / write tool
                    ↓
               tool_result → LLM Provider (continue)
                    ↓
               ... (loop until final text response with no tool calls)
                    ↓
               Store ContentBlock[] as chat message
```

**Components**:

| Component | Responsibility |
|-----------|---------------|
| **Tool Registry** | Categorized registry of all tools (render/read/write) with approval requirements. Extends the existing `ActionToolDefinition` pattern. |
| **Execution Loop** | Core send → tool_use → execute → tool_result → repeat cycle. Replaces the current single-turn `ChatService.sendMessage()` with a loop that continues until the agent produces a final response with no pending tool calls. |
| **Approval Gates** | When the agent calls a write tool, the harness pauses the loop, checks approval memory, and either auto-approves or emits a pending approval event to the renderer and waits. Rejection sends a `tool_result` indicating the user declined. |
| **Interrupt Handling** | User clicks "Stop" → harness cancels the in-flight LLM request (aborts fetch), skips pending tool calls, and stores the partial response as content blocks. |

The agent harness lives in a new `AgentService` that wraps or replaces the current `ChatService` for Phase 4 conversations.

### 2.2 Tool Taxonomy

Three categories of tools:

**Render Tools** (no approval — produce UI content blocks):

| Tool | Input | Output Block |
|------|-------|-------------|
| `render_swot_analysis` | `SwotOutput` | `swot_analysis` |
| `render_summary_cards` | `SummariesOutput` | `summary_cards` |
| `render_quality_metrics` | `EvidenceQualityMetrics` | `quality_metrics` |
| `render_mermaid` | `{ title, source }` | `mermaid` |
| `render_chart` | `{ title, type, spec }` | `chart` |
| `render_data_table` | `{ title, headers, rows }` | `data_table` |
| `render_comparison` | `{ baseAnalysisId, compareAnalysisId }` | `comparison` |

Render tools do not call external services. They transform data into content blocks. The harness intercepts these, creates the block, emits it to the renderer, and returns a **compact confirmation** as `tool_result` (not the full data — avoids wasting context window). The data lives in the content block, not the conversation context.

**Read Tools** (no approval — agent can fetch data):

| Tool | Provider | Returns |
|------|----------|---------|
| `fetch_jira_data` | `JiraProvider` | Jira project/epic/story/comment summary |
| `fetch_confluence_data` | `ConfluenceProvider` | Page/comment summary |
| `fetch_github_data` | `GitHubProvider` | PR/issue/comment summary |
| `run_codebase_analysis` | `CodebaseProvider` | Codebase analysis findings |
| `search_profiles` | `ProfileRepository` | Matching profile data |

These reuse the existing provider infrastructure. The harness executes them directly and feeds results back as `tool_result`.

**Write Tools** (require approval, or auto-approved via memory):

| Tool | Executor | Artifact |
|------|----------|----------|
| `create_jira_issue` | ActionExecutor (Claude CLI + Jira MCP) | Jira issue |
| `create_jira_issues` | ActionExecutor | Multiple Jira issues |
| `add_jira_comment` | ActionExecutor | Jira comment |
| `create_confluence_page` | ActionExecutor (Claude CLI + Confluence MCP) | Confluence page |
| `create_github_issue` | ActionExecutor (Claude CLI + GitHub MCP) | GitHub issue |
| `create_github_pr` | ActionExecutor | GitHub PR |
| `write_file` | FileService | File in workspace |

These are the existing Phase 3c actions plus a new `write_file` tool for local file generation.

### 2.3 System Prompt Design

The agent system prompt expands from the current `buildChatSystemPrompt()` in `chat.service.ts`. New additions:

- **Tool usage instructions**: when to use render tools vs. providing plain text. E.g., "Use `render_swot_analysis` to display SWOT results as interactive cards. Use `render_mermaid` for architectural diagrams."
- **Rendering guidance**: prefer render tools for structured data, plain text for explanations
- **Context injection**: full analysis data (as today) + conversation history + data fetched via read tools
- **Re-run instructions**: how to interpret user requests for re-analysis (trigger new pipeline run)
- **Approval context**: which tools require approval, how to handle rejection gracefully

### 2.4 Storage Changes

| Change | Description |
|--------|-------------|
| `chat_messages.content_format` | New column `TEXT DEFAULT 'text'`. Values: `'text'` (plain string, existing) or `'blocks'` (JSON array of `ContentBlock[]`) |
| `approval_memory` table | New table: `analysis_id TEXT, tool_name TEXT, allowed INTEGER, PRIMARY KEY (analysis_id, tool_name)` |
| `analyses.parent_analysis_id` | New column `TEXT` — links re-runs to original analysis |
| `analyses.conversation_id` | New column `TEXT` — groups multiple analyses in the same conversation |

The `analyses` table is otherwise unchanged. Canonical SWOT output, summaries, and quality metrics remain in their existing columns (dual-write: chat displays content blocks, analyses table stores structured data).

### 2.5 Context Window Management

- Opus 4.6 has a 1M token context window
- Use the actual model context window (fetched from model metadata), not a hardcoded value
- The current `calculateChatTokenBudget()` uses a conservative 128k split. Phase 4 uses the full model context.
- Sliding window trimming only applied when approaching the limit — for 1M context, most conversations never need trimming
- Full analysis context + all conversation history + all tool results fit comfortably within 1M

### 2.6 Streaming Architecture

The current streaming flow: SSE chunks arrive, `onChunk` callback emits text to renderer, full content stored after completion.

Phase 4 changes:
- **Text blocks** stream incrementally (same as current `onChunk` pattern)
- **Render tool results** produce complete content blocks emitted as whole units via a new `onBlock` callback
- **Read tool execution** shows in the status bar (source activity indicator)
- **Write tool approval** pauses the stream, shows approval card, resumes after resolution
- The renderer handles both: streaming partial text in the current block + complete blocks appearing when tools execute

### 2.7 Initial Analysis Flow (Single-Shot)

The initial analysis reuses the existing pipeline but presents results conversationally:

1. User clicks "Run Analysis" → page transitions to chat view
2. Pipeline runs in background (`AnalysisOrchestrator` + `PipelineStep`s)
3. Status bar shows `Analyzing...` with source activity icons
4. On completion, the agent's first message is constructed from the pipeline results:
   - Text introduction
   - `render_summary_cards` → summary cards block
   - `render_quality_metrics` → metrics block
   - `render_swot_analysis` → SWOT quadrants block
   - Text with key takeaways
5. This message is the **pinned summary** — a "Jump to results" affordance in the UI
6. User can then ask follow-up questions (multi-turn agentic mode)

The backend pipeline does not change — only how results are presented.

---

## 3. Sprint Decomposition (2-Agent Parallel)

6 sprints, 2 agents, approximately 6 weeks. Follows the conventions from `docs/16-parallel-sprint-plan.md`.

### Timeline Overview

```
Sprint | Agent A (Backend)                        | Agent B (Frontend/Types)                   | Gate
-------+------------------------------------------+--------------------------------------------+------
  22   | Agent harness: registry, execution loop,  | ContentBlock types, all tool definitions,  | G1
       | interrupt handling                         | migration v5                               |
-------+------------------------------------------+--------------------------------------------+------
  23   | Conversation lifecycle, run-in-chat mode,  | Full-page chat view, status bar, rich      | G2
       | agent state events, token counting         | message renderer, page transition           |
-------+------------------------------------------+--------------------------------------------+------
  24   | Render tool execution (all 7 tools),       | Block components (SwotBlock, MermaidBlock,  | G3
       | harness integration                        | ChartBlock, etc.), ContentBlockRenderer     |
-------+------------------------------------------+--------------------------------------------+------
  25   | Read tool execution, multi-turn loop,      | Multi-turn streaming UX, source activity,  | G4
       | provider query methods                     | progress indicators per tool                |
-------+------------------------------------------+--------------------------------------------+------
  26   | Approval memory backend, re-run analysis,  | 3-tier approval UI, memory indicator,      | G5
       | write_file tool                            | re-run UX, pinned summary                  |
-------+------------------------------------------+--------------------------------------------+------
  27   | SVG-to-PNG export, E2E testing, docs       | Token counter, shortcuts, visual polish,   |
       |                                            | edge cases                                  |
```

### Sprint 22: Agent Harness Core + Content Block Types

**Agent A — Agent Harness Backend**

| Task | Files | Notes |
|------|-------|-------|
| Tool registry with categorized tools (render/read/write) | `src/main/providers/agent-tools/tool-registry.ts` (NEW) | Extends `ActionToolDefinition` pattern |
| Agent execution loop: send → tool_use → execute → tool_result → repeat | `src/main/services/agent.service.ts` (NEW) | Core loop, handles streaming + tool accumulation |
| Interrupt handling: abort in-flight request, store partial response | `src/main/services/agent.service.ts` | AbortController integration |
| Unit tests for agent harness | `src/main/services/agent.service.test.ts` (NEW) | Mock LLM responses with tool calls |

**Agent B — Content Block Types + Tool Definitions**

| Task | Files | Notes |
|------|-------|-------|
| ContentBlock type definitions | `src/main/domain/content-block.types.ts` (NEW) | All block types, ContentBlockType union |
| Render tool definitions (7 tools) | `src/main/providers/agent-tools/render-tools.ts` (NEW) | OpenAI function schema format |
| Read tool definitions (5 tools) | `src/main/providers/agent-tools/read-tools.ts` (NEW) | OpenAI function schema format |
| Write tool definitions (update existing + write_file) | `src/main/providers/agent-tools/write-tools.ts` (NEW) | Extends Phase 3c tools |
| Migration v5: `content_format` column on `chat_messages` | `src/main/db/migrations/005-phase4-content-blocks.sql` (NEW) | Also adds `approval_memory` table, `conversation_id` + `parent_analysis_id` on analyses |
| IPC channels for agent communication | `src/main/ipc/channels.ts` (MODIFY, append-only) | Agent state events, block events |

**Gate 1**: ContentBlock types are frozen. Agent harness can execute one render tool call and produce a ContentBlock result. Both agents validate by running a test that sends a mock LLM response with a `render_swot_analysis` tool call and verifying a `swot_analysis` ContentBlock is produced.

### Sprint 23: Chat View Transformation + Status Bar

**Agent A — Backend: Conversation Lifecycle + Run-in-Chat**

| Task | Files | Notes |
|------|-------|-------|
| Conversation lifecycle: create conversation when analysis starts, link to analysis | `src/main/services/conversation.service.ts` (NEW) | Or add to existing AnalysisService |
| "Run-in-chat" mode: analysis pipeline → emits content blocks instead of static results | `src/main/services/analysis.service.ts` (MODIFY) | New entry point alongside existing `run()` |
| Agent state events: emit state changes (analyzing/thinking/fetching/ready) via IPC | `src/main/ipc/handlers/agent.ipc.ts` (NEW) | Streaming events |
| Token counting: accumulate tokens from LLM responses, emit via IPC | `src/main/services/agent.service.ts` (MODIFY) | Use response `usage` field + estimation |
| Preload bridge for agent events | `src/preload/api.ts` (MODIFY) | Add agent section |

**Agent B — Frontend: Chat View + Status Bar + Rich Rendering**

| Task | Files | Notes |
|------|-------|-------|
| Full-page chat view (replaces analysis results panel) | `src/renderer/routes/chat.tsx` (NEW) | Scrollable messages, anchored input |
| Status bar component | `src/renderer/components/chat/status-bar.tsx` (NEW) | Agent state, source icons, token count, stop |
| Rich message renderer (dispatches ContentBlock arrays) | `src/renderer/components/chat/content-block-renderer.tsx` (NEW) | Maps block type → component |
| `RichMessage` wrapper component | `src/renderer/components/chat/rich-message.tsx` (NEW) | Renders array of ContentBlocks |
| Page transition: analysis route → chat route on "Run Analysis" | `src/renderer/routes/analysis.tsx` (MODIFY) | Navigate on run |
| Route registration | `src/renderer/App.tsx` (MODIFY) | Add `/chat/:analysisId` route |
| Agent hooks | `src/renderer/hooks/use-agent.ts` (NEW) | useAgentState, useTokenCount, useStopAgent |

**Gate 2**: Chat view renders ContentBlock arrays. Page transition works (clicking "Run Analysis" opens the chat view). Status bar shows agent state and token count. Text content blocks render as markdown.

### Sprint 24: Render Tools Implementation

**Agent A — Backend: Render Tool Execution**

| Task | Files | Notes |
|------|-------|-------|
| Render tool executor: maps tool calls to ContentBlock creation | `src/main/providers/agent-tools/render-executor.ts` (NEW) | 7 render tools |
| `render_swot_analysis`: converts SwotOutput → swot_analysis block | render-executor.ts | Validates SwotOutput shape |
| `render_summary_cards`: converts SummariesOutput → block | render-executor.ts | |
| `render_quality_metrics`: converts metrics → block | render-executor.ts | |
| `render_mermaid`: validates Mermaid syntax → block | render-executor.ts | Basic syntax check |
| `render_chart`: validates chart spec → block | render-executor.ts | |
| `render_data_table`: validates table data → block | render-executor.ts | |
| `render_comparison`: calls comparison logic → block | render-executor.ts | Reuses Phase 3d comparison |
| Register render tools in agent harness | `src/main/services/agent.service.ts` (MODIFY) | |
| Tests for all render tools | `src/main/providers/agent-tools/render-executor.test.ts` (NEW) | |

**Agent B — Frontend: Block Components**

| Task | Files | Notes |
|------|-------|-------|
| `SwotBlock.tsx` | `src/renderer/components/chat/blocks/swot-block.tsx` (NEW) | Adapts existing SwotResults |
| `SummaryBlock.tsx` | `src/renderer/components/chat/blocks/summary-block.tsx` (NEW) | Adapts existing summary cards |
| `MetricsBlock.tsx` | `src/renderer/components/chat/blocks/metrics-block.tsx` (NEW) | Adapts existing QualityMetrics |
| `MermaidBlock.tsx` | `src/renderer/components/chat/blocks/mermaid-block.tsx` (NEW) | Mermaid-to-SVG rendering |
| `ChartBlock.tsx` | `src/renderer/components/chat/blocks/chart-block.tsx` (NEW) | D3/Chart.js rendering |
| `DataTableBlock.tsx` | `src/renderer/components/chat/blocks/data-table-block.tsx` (NEW) | Sortable table |
| `ComparisonBlock.tsx` | `src/renderer/components/chat/blocks/comparison-block.tsx` (NEW) | Side-by-side diff |
| Register all blocks in ContentBlockRenderer | `src/renderer/components/chat/content-block-renderer.tsx` (MODIFY) | |

**Gate 3**: All render tools produce valid ContentBlocks. All block components render from JSON data. E2E: agent calls `render_swot_analysis` → harness produces block → renderer displays SWOT cards.

### Sprint 25: Read Tools + Agentic Follow-ups

**Agent A — Backend: Read Tools + Multi-Turn Loop**

| Task | Files | Notes |
|------|-------|-------|
| Read tool executor | `src/main/providers/agent-tools/read-executor.ts` (NEW) | 5 read tools |
| `fetch_jira_data`: queries JiraProvider, returns summary | read-executor.ts | Reuses existing data collection logic |
| `fetch_confluence_data`: queries ConfluenceProvider | read-executor.ts | |
| `fetch_github_data`: queries GitHubProvider | read-executor.ts | |
| `run_codebase_analysis`: queries CodebaseProvider | read-executor.ts | |
| `search_profiles`: queries ProfileRepository | read-executor.ts | |
| Multi-turn execution loop: after read tool results, continue conversation | `src/main/services/agent.service.ts` (MODIFY) | Loop handles mixed render + read + text |
| Tests for read tools and multi-turn | `src/main/providers/agent-tools/read-executor.test.ts` (NEW) | |

**Agent B — Frontend: Multi-Turn Streaming UX**

| Task | Files | Notes |
|------|-------|-------|
| Source activity in status bar (which tool is executing) | `src/renderer/components/chat/status-bar.tsx` (MODIFY) | Animated integration icons |
| Progress indicators per tool execution | `src/renderer/components/chat/tool-progress.tsx` (NEW) | "Fetching Jira data..." cards |
| Handle interleaved blocks during multi-turn (text → tool → text → tool) | `src/renderer/routes/chat.tsx` (MODIFY) | Progressive rendering |
| Streaming UX: partial text + complete blocks appearing | `src/renderer/components/chat/rich-message.tsx` (MODIFY) | |

**Gate 4**: Agent can fetch data via read tools and incorporate results into responses. Multi-turn loop works E2E: user asks follow-up → agent calls `fetch_jira_data` → gets data → renders analysis → responds.

### Sprint 26: Approval Memory + Re-run + Write Tools

**Agent A — Backend: Approval Memory + Re-run**

| Task | Files | Notes |
|------|-------|-------|
| ApprovalMemoryService: per-conversation store | `src/main/services/approval-memory.service.ts` (NEW) | |
| ApprovalMemoryRepository: CRUD on `approval_memory` table | `src/main/repositories/approval-memory.repository.ts` (NEW) | |
| Auto-approval check in agent harness: before emitting pending event, check memory | `src/main/services/agent.service.ts` (MODIFY) | |
| Re-run: create new analysis record with `parentAnalysisId` and `conversationId` | `src/main/services/analysis.service.ts` (MODIFY) | New `reRunAnalysis()` method |
| Re-run: stream results into same conversation | `src/main/services/agent.service.ts` (MODIFY) | |
| `write_file` tool implementation | `src/main/providers/agent-tools/write-executor.ts` (NEW) | Uses FileService with path enforcement |
| Tests | Various test files (NEW) | |

**Agent B — Frontend: 3-Tier Approval UI + Re-run UX**

| Task | Files | Notes |
|------|-------|-------|
| "Yes + Remember" button on approval cards | `src/renderer/components/analysis/approval-card.tsx` (MODIFY) | Third button |
| Memory indicator badge (shows which tools are auto-approved) | `src/renderer/components/chat/memory-indicator.tsx` (NEW) | |
| Re-run UX: new analysis appears in same conversation | `src/renderer/routes/chat.tsx` (MODIFY) | |
| Pinned summary: jumpable "results" section per analysis | `src/renderer/components/chat/pinned-summary.tsx` (NEW) | "Jump to results" affordance |
| Write file approval card (preview file content + path) | `src/renderer/components/chat/blocks/write-file-preview.tsx` (NEW) | |

**Gate 5**: Approval memory works per-conversation. "Yes + Remember" auto-approves subsequent same-type actions. Re-run creates new analysis in same conversation with separate pinned summary.

### Sprint 27: Diagram Export + Token Counter + Polish + Testing

**Agent A — Backend + Testing**

| Task | Files | Notes |
|------|-------|-------|
| SVG-to-PNG export utility | `src/main/services/diagram-export.service.ts` (NEW) | SVG → canvas → blob → file |
| Export IPC handler | `src/main/ipc/handlers/export.ipc.ts` (MODIFY) | Add `export:diagram:png` channel |
| E2E agent harness tests: multi-turn, interrupt, error recovery, approval memory | Various test files | |
| Integration test: analysis → chat → render → read → write → re-run | Test file (NEW) | |
| Documentation updates | `docs/18-phase4-chat-experience-plan.md` (MODIFY) | Completion log |

**Agent B — Frontend + Polish**

| Task | Files | Notes |
|------|-------|-------|
| Token counter in status bar: running count + cost estimate | `src/renderer/components/chat/status-bar.tsx` (MODIFY) | |
| Keyboard shortcuts (send message, stop agent, jump to results) | Various | |
| Export buttons on Mermaid and chart blocks ("Save as PNG") | Block components (MODIFY) | |
| Edge cases: empty conversation, agent error mid-turn, network disconnect | `src/renderer/routes/chat.tsx` (MODIFY) | |
| Visual consistency pass across all block types | All block components | |
| Loading states and error states polish | Various | |

---

## 4. Dependency Gates

| Gate | Timing | Validation Criteria | Blocking |
|------|--------|--------------------|---------  |
| **G1** | End Sprint 22 | ContentBlock types frozen. Agent harness executes one render tool and produces a ContentBlock. | Sprint 23 both tracks |
| **G2** | End Sprint 23 | Chat view renders ContentBlock arrays. Page transition works. Status bar displays agent state + token count. | Sprint 24 frontend track |
| **G3** | End Sprint 24 | All 7 render tools produce valid ContentBlocks. All 7 block components render from JSON data. | Sprint 25 (read tools build on same rendering) |
| **G4** | End Sprint 25 | Multi-turn loop with read tools works E2E. Agent fetches data and incorporates into responses. | Sprint 26 (approval memory wraps same loop) |
| **G5** | End Sprint 26 | Approval memory auto-approves. Re-run creates new analysis in same conversation. | Sprint 27 testing |

---

## 5. File Ownership Matrix

| File / Module | Owner | Notes |
|---|---|---|
| `src/main/services/agent.service.ts` | Agent A (all sprints) | Core harness — exclusive ownership |
| `src/main/domain/content-block.types.ts` | Agent B (Sprint 22), then frozen | Frozen at Gate 1 |
| `src/main/providers/agent-tools/tool-registry.ts` | Agent A (Sprint 22) | Registry infrastructure |
| `src/main/providers/agent-tools/render-tools.ts` | Agent B (Sprint 22 definitions) | Tool schemas |
| `src/main/providers/agent-tools/read-tools.ts` | Agent B (Sprint 22 definitions) | Tool schemas |
| `src/main/providers/agent-tools/write-tools.ts` | Agent B (Sprint 22 definitions) | Tool schemas |
| `src/main/providers/agent-tools/render-executor.ts` | Agent A (Sprint 24) | Execution logic |
| `src/main/providers/agent-tools/read-executor.ts` | Agent A (Sprint 25) | Execution logic |
| `src/main/providers/agent-tools/write-executor.ts` | Agent A (Sprint 26) | Execution logic |
| `src/main/services/approval-memory.service.ts` | Agent A (Sprint 26) | |
| `src/main/services/analysis.service.ts` | Agent A (Sprint 23, 26) | Run-in-chat, re-run |
| `src/main/services/chat.service.ts` | Agent A | Delegates to agent harness |
| `src/renderer/routes/chat.tsx` | Agent B (Sprint 23+) | Primary chat view |
| `src/renderer/components/chat/status-bar.tsx` | Agent B (Sprint 23+) | |
| `src/renderer/components/chat/content-block-renderer.tsx` | Agent B (Sprint 23+) | |
| `src/renderer/components/chat/blocks/*` | Agent B (Sprint 24+) | All block renderers |
| `src/renderer/components/analysis/approval-card.tsx` | Agent B (Sprint 26) | 3-tier upgrade |
| `src/renderer/routes/analysis.tsx` | Agent B (Sprint 23) | Page transition |
| `src/renderer/App.tsx` | Agent B (Sprint 23) | Route addition |
| `src/main/ipc/channels.ts` | Both (append-only) | Same convention as Phase 3 |
| `src/preload/api.ts` | Agent A (Sprint 23) | Agent bridge |
| `src/main/db/migrations/*` | Agent B (Sprint 22) | Migration v5 |

---

## 6. Risk Register

| # | Risk | Prob | Impact | Mitigation | Contingency |
|---|------|------|--------|------------|-------------|
| R1 | Agent harness loop complexity (recursive tool calls, error recovery, partial responses) | Med | High | Layered approach: render-only loop (Sprint 22), add read (Sprint 25), add write (Sprint 26). Each layer adds complexity incrementally. | Fall back to single-turn tool-use (current Phase 3c pattern) for write tools; only auto-loop for render/read. |
| R2 | Mermaid/D3 rendering in Electron has compatibility issues | Med | Med | Spike Mermaid rendering early in Sprint 22. Use headless rendering if direct DOM integration fails. | Fall back to code blocks with "Copy diagram source" button instead of inline SVG. |
| R3 | Token counter accuracy — OpenRouter doesn't always report exact usage | Med | Low | Use approximate estimation (chars/4) for running count. Show as "~N tokens". True usage from response `usage` field when available. | Display tilde prefix to set expectations about approximation. |
| R4 | 1M context window makes responses slow and expensive for long conversations | Med | Med | Use context generously but monitor latency. If turns exceed 30s consistently, investigate prompt trimming. | Add "turbo mode" toggle using smaller context window for faster responses. |
| R5 | Render tool output is large (full SwotOutput in tool_result) and wastes context | Low | Med | Render tools return compact confirmation as tool_result, not full data. Data stored in content block only. | Implement content block storage separately from conversation context. |
| R6 | Two agents create merge conflicts on shared files | Med | Low | File ownership matrix (Section 5) prevents most conflicts. `channels.ts` is append-only. Gate validations catch integration issues early. | Same conflict resolution process as Phase 3 parallel sprints. |

---

## 7. Key Design Decisions

1. **Single-shot initial analysis preserved**: The existing pipeline is proven and reliable. Phase 4 changes how results are presented (content blocks in chat), not how they're generated. The backend pipeline is unchanged for the initial run.

2. **Multi-turn for follow-ups only**: Follow-up questions become agentic (tool-use loop). This avoids the cost/latency of multi-turn for the initial analysis while enabling rich interactive exploration afterward.

3. **Render tools as the bridge**: The agent uses tool_use to produce structured output. This is cleaner than parsing special markers in text streams. It aligns with the existing Phase 3c tool-use pattern and gives the agent explicit control over when to render cards vs. write text.

4. **Dual-write for data integrity**: The `analyses` table remains the source of truth for SWOT output, summaries, and quality metrics. Chat messages store content blocks for display. History, export, and comparison features continue to work from the analyses table without change.

5. **Approval memory per-conversation**: Scoped to the conversation to prevent stale permissions. A permission granted 3 weeks ago shouldn't auto-create Jira tickets today. Per-conversation scope matches the user's mental model of "this investigation session."

6. **No backwards compatibility**: The app is still in development. Existing analyses may not render in the new chat view. This simplifies the migration significantly.
