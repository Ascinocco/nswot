# nswot — Phase 4: Chat-Driven Agent Experience

> Feature specification, architecture plan, and parallelized sprint decomposition.
> Transforms nswot from a page-based analysis app into a chat-driven agent experience.
> Depends on Phase 3 completion. See `docs/04-phases-roadmap.md` for phase definitions.
> Sprints 36–41, continuing from Phase 3e Sprint 35.

---

## 1. Product Vision

### 1.1 The Transformation

Today, nswot has separate pages for analysis configuration, results viewing, chat, and history. Phase 4 collapses these into a single **Chat Analysis** experience that becomes the primary way users interact with the app.

The old `/analysis` page (config form → results page → side-panel chat) and `/history` page (flat list of past analyses) are **retired**. In their place:

1. A new **"Chat Analysis"** entry appears in the sidebar navigation — this is the app's primary feature surface
2. The page starts with a **conversation history list** showing past analysis conversations the user can resume
3. Clicking **"New Analysis"** shows an inline configuration panel (role, profiles, data sources)
4. Clicking **"Run Analysis"** collapses the config panel and transitions to the chat view — all on the same page, no route navigation
5. The agent streams the initial analysis as **rich content blocks** (SWOT cards, summary cards, quality metrics) directly into the conversation
6. A **pipeline progress indicator** at the top shows which analysis phase is running
7. **Thinking data** from the LLM is displayed in collapsible blocks so users can see the agent's reasoning
8. Follow-up questions, data fetches, new diagrams, and write actions all happen within the same conversational thread
9. The user can return to the conversation list at any time, and resume any past conversation

All other pages (workspace, profiles, integrations, settings, comparison) remain unchanged.

### 1.2 Navigation Changes

**Sidebar before Phase 4:**
```
Workspace | Profiles | Integrations | Analysis | History | Comparison | Settings
```

**Sidebar after Phase 4:**
```
Workspace | Profiles | Integrations | Chat Analysis | Comparison | Settings
```

- **"Analysis" removed** — replaced by Chat Analysis
- **"History" removed** — conversation history is the initial view of Chat Analysis
- Route changes:
  - NEW: `/chat-analysis` — conversation list (default) or active conversation
  - NEW: `/chat-analysis/:conversationId` — resume a specific conversation
  - REMOVED: `/analysis` — old config + results page
  - REMOVED: `/history` — old flat analysis list
  - KEPT: `/analysis/:analysisId` — redirect to the conversation containing this analysis (backwards compat for bookmarks)

### 1.3 Unified Config-to-Chat Flow

The Chat Analysis page has two states:

**State 1: Conversation List** (initial view)
- List of past conversations, newest first
- Each card shows: title (auto-generated from role + date), role, data source summary, last message preview, created date
- "New Analysis" button in the top-right
- Click a conversation → transitions to State 2 with that conversation loaded

**State 2: Active Conversation** (config + chat)
- **Config panel** (top): collapsible accordion containing role selector, profile picker, data source checkboxes, model selector, "Run Analysis" button
  - For new conversations: config panel starts expanded
  - For resumed conversations: config panel starts collapsed (since analysis already ran)
  - User can expand config at any time to see what was selected, or to re-run with different parameters
- **Pipeline progress** (below config, during analysis): horizontal stepped indicator
- **Chat area** (main content): scrollable messages with rich content blocks
- **Input area** (bottom): text input with send button, keyboard shortcuts
- **Back button** (top-left): returns to conversation list

When the user clicks "Run Analysis":
1. Config panel collapses with an animation
2. A new conversation record is created (if this is the first run)
3. Pipeline progress indicator appears showing the current phase
4. The agent streams the initial analysis as content blocks into the chat
5. On completion, the progress indicator shows "Complete" and fades

### 1.4 Pipeline Progress Indicator

A horizontal stepped progress bar at the top of the chat area during analysis:

```
[Load data] → [Anonymize] → [Build prompt] → [LLM generating] → [Parse] → [Validate] → [Store]
     ✓             ✓              ●
```

- Steps correspond to the existing `PipelineStep` stages in `AnalysisOrchestrator`
- Current step is highlighted (animated pulse), completed steps show a checkmark
- Emitted via IPC as `analysis:progress` events (already exists — same `{ stage, message }` pattern)
- On completion: shows all steps checked, then fades to a compact "Analysis complete" badge
- On failure: current step shows error state with the failure message

### 1.5 Status Bar

A persistent status bar within the chat area (below progress indicator, above messages):

| Element | Description |
|---------|-------------|
| Agent state | `Analyzing...` / `Thinking...` / `Fetching data...` / `Ready` |
| Source activity | Icons for which integration is being queried (Jira, Confluence, GitHub, Codebase) |
| Token counter | Running total of input + output tokens, with approximate cost estimate |
| Stop button | Interrupts the current agent turn (cancels in-flight LLM request) |

Cost is derived from token count + model pricing stored in model metadata.

### 1.6 Rich Content Blocks

The current `ChatMessage.content` field is a plain string. Phase 4 changes this to a JSON array of `ContentBlock[]`. Each block has a `type` discriminator and typed payload:

```typescript
type ContentBlockType =
  | 'text' | 'thinking' | 'swot_analysis' | 'summary_cards' | 'quality_metrics'
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
| `thinking` | `{ thinking: string }` | Collapsible thinking card |
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

### 1.7 Thinking Display

When the LLM returns thinking/reasoning data, it is surfaced to the user:

- **Anthropic direct provider**: Uses `extended_thinking` parameter. The API returns `thinking` content blocks alongside `text` blocks. These are captured by the agent harness and emitted as `thinking` content blocks.
- **OpenRouter provider**: Extended thinking support depends on the underlying model and OpenRouter's proxy behavior. If thinking blocks are returned, they are captured the same way. If not available, no thinking blocks appear (graceful degradation).

**Rendering**: Thinking blocks appear as collapsible cards in the chat:
- Default state: **collapsed** — shows "Thinking..." header with a subtle indicator
- Click to expand: reveals the full chain-of-thought text
- Thinking blocks appear inline in the message flow, before the text/render blocks they informed
- During streaming: thinking blocks stream progressively (same `onChunk` pattern) while collapsed, with an animated indicator showing the agent is reasoning

### 1.8 Conversation History

Conversations are first-class entities with their own table and lifecycle:

- **Auto-title**: Generated from the analysis role + date (e.g., "Staff Engineer Analysis — Feb 12, 2026"). Editable by the user.
- **Resume**: Click any conversation to load its full chat history and continue chatting. The agent retains full context.
- **Multiple analyses**: A single conversation can contain multiple analysis runs (re-runs with different parameters). Each creates a separate `analyses` row linked to the same conversation.
- **Delete**: User can delete conversations (cascades to analyses and messages).

The conversation list replaces the old `/history` page. Unlike the flat analysis list, conversations group related analyses and their chat threads into coherent investigation sessions.

### 1.9 Approval Memory (3-Tier)

The current approval flow requires explicit approval for every write action. Phase 4 adds memory:

| Option | Behavior |
|--------|----------|
| **Yes** | Approve this specific action (one-time, same as current) |
| **Yes + Remember** | Approve this action AND auto-approve all future actions of the same tool type for the rest of this conversation |
| **No** | Reject this action |

- **Scope**: per-conversation. When a new conversation starts, memory resets.
- **Storage**: `approval_memory` table keyed by `conversation_id + tool_name`
- **Applies to**: write tools only. Read tools and render tools never require approval.

### 1.10 Re-run in Conversation

A user can say "Run again with the VP perspective" or "Re-analyze focusing only on Jira data." This:

1. Creates a **new `analyses` row** in the database linked to the same conversation
2. Runs the full analysis pipeline with the new parameters
3. Pipeline progress indicator reappears showing the new run's phases
4. Streams the new results as a new set of content blocks in the chat
5. The new analysis gets its own pinned summary

Multiple analysis snapshots coexist within one conversation. A `parent_analysis_id` column links re-runs to the original.

### 1.11 Diagram Rendering and Export

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
| **Thinking Capture** | When the LLM response includes thinking blocks, the harness captures them and emits `thinking` content blocks to the renderer before processing any tool calls or text. |
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
- **Evidence gap analysis ("Go deeper")**: when the user asks for more findings, the agent examines evidence sources not cited in the current SWOT (using the evidence coverage data from Phase 3e). It performs a targeted search for additional patterns — not a re-roll — and either surfaces new evidence-backed items or confirms the current analysis covers the available data. The agent has the current SWOT as context, so it won't repeat existing findings.

### 2.4 Storage Changes

| Change | Description |
|--------|-------------|
| `conversations` table | New table: `id TEXT PK, workspace_id TEXT NOT NULL REFERENCES workspaces(id), title TEXT, created_at TEXT, updated_at TEXT` |
| `analyses.conversation_id` | New column `TEXT REFERENCES conversations(id)` — links analysis to conversation |
| `analyses.parent_analysis_id` | New column `TEXT` — links re-runs to original analysis |
| `chat_messages.content_format` | New column `TEXT DEFAULT 'text'`. Values: `'text'` (plain string, existing) or `'blocks'` (JSON array of `ContentBlock[]`) |
| `approval_memory` table | New table: `conversation_id TEXT, tool_name TEXT, allowed INTEGER, PRIMARY KEY (conversation_id, tool_name)` |

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
- **Thinking blocks** stream progressively via a new `onThinking` callback. Renderer shows animated "Thinking..." indicator while chunks arrive. Full thinking text stored as a `thinking` content block when complete.
- **Text blocks** stream incrementally (same as current `onChunk` pattern)
- **Render tool results** produce complete content blocks emitted as whole units via a new `onBlock` callback
- **Read tool execution** shows in the status bar (source activity indicator)
- **Write tool approval** pauses the stream, shows approval card, resumes after resolution
- The renderer handles all three: streaming thinking + streaming partial text + complete blocks appearing when tools execute

### 2.7 Initial Analysis Flow (Single-Shot)

The initial analysis reuses the existing pipeline but presents results conversationally:

1. User configures analysis in the config panel and clicks "Run Analysis"
2. Config panel collapses. Pipeline progress indicator appears.
3. Pipeline runs in background (`AnalysisOrchestrator` + `PipelineStep`s)
4. Progress indicator updates as each pipeline step completes
5. On completion, the agent's first message is constructed from the pipeline results:
   - Thinking block (if available from the LLM)
   - Text introduction
   - `render_summary_cards` → summary cards block
   - `render_quality_metrics` → metrics block
   - `render_swot_analysis` → SWOT quadrants block
   - Text with key takeaways
6. This message is the **pinned summary** — a "Jump to results" affordance in the UI
7. User can then ask follow-up questions (multi-turn agentic mode)

The backend pipeline does not change — only how results are presented.

---

## 3. Sprint Decomposition (2-Agent Parallel)

6 sprints (36–41), 2 agents, approximately 6 weeks. Continues from Phase 3e Sprint 35. Follows the conventions from `docs/16-parallel-sprint-plan.md`.

### Timeline Overview

```
Sprint | Agent A (Backend)                        | Agent B (Frontend/Types)                   | Gate
-------+------------------------------------------+--------------------------------------------+------
  36   | Agent harness: registry, execution loop,  | ContentBlock types (incl. thinking), all   | G1
       | interrupt handling, thinking capture       | tool defs, migration v6, conversations     |
       |                                            | table schema                               |
-------+------------------------------------------+--------------------------------------------+------
  37   | Conversation lifecycle, run-in-chat mode,  | Chat Analysis page: conversation list,     | G2
       | agent state + progress events, token       | config panel, pipeline progress, status     |
       | counting, preload bridge                   | bar, thinking block, route changes          |
-------+------------------------------------------+--------------------------------------------+------
  38   | Render tool execution (all 7 tools),       | Block components (SwotBlock, MermaidBlock,  | G3
       | harness integration                        | ChartBlock, etc.), ContentBlockRenderer     |
-------+------------------------------------------+--------------------------------------------+------
  39   | Read tool execution, multi-turn loop,      | Multi-turn streaming UX, source activity,  | G4
       | provider query methods, "go deeper"        | progress indicators per tool                |
-------+------------------------------------------+--------------------------------------------+------
  40   | Approval memory backend, re-run analysis,  | 3-tier approval UI, memory indicator,      | G5
       | write_file tool                            | re-run UX, pinned summary                  |
-------+------------------------------------------+--------------------------------------------+------
  41   | SVG-to-PNG export, E2E testing, docs       | Token counter, conversation management,    |
       |                                            | visual polish, edge cases                   |
```

### Sprint 36: Agent Harness Core + Content Block Types

**Agent A — Agent Harness Backend**

| Task | Files | Notes |
|------|-------|-------|
| Tool registry with categorized tools (render/read/write) | `src/main/providers/agent-tools/tool-registry.ts` (NEW) | Extends `ActionToolDefinition` pattern |
| Agent execution loop: send → tool_use → execute → tool_result → repeat | `src/main/services/agent.service.ts` (NEW) | Core loop, handles streaming + tool accumulation |
| Thinking capture: extract thinking blocks from LLM responses, emit via callback | `src/main/services/agent.service.ts` | Handles Anthropic `thinking` content blocks |
| Interrupt handling: abort in-flight request, store partial response | `src/main/services/agent.service.ts` | AbortController integration |
| Unit tests for agent harness (incl. thinking capture) | `src/main/services/agent.service.test.ts` (NEW) | Mock LLM responses with tool calls and thinking |

**Agent B — Content Block Types + Tool Definitions + Schema**

| Task | Files | Notes |
|------|-------|-------|
| ContentBlock type definitions (incl. `thinking` type) | `src/main/domain/content-block.types.ts` (NEW) | All block types, ContentBlockType union |
| Render tool definitions (7 tools) | `src/main/providers/agent-tools/render-tools.ts` (NEW) | OpenAI function schema format |
| Read tool definitions (5 tools) | `src/main/providers/agent-tools/read-tools.ts` (NEW) | OpenAI function schema format |
| Write tool definitions (update existing + write_file) | `src/main/providers/agent-tools/write-tools.ts` (NEW) | Extends Phase 3c tools |
| Migration v6: `conversations` table, `content_format` on `chat_messages`, `approval_memory` table, `conversation_id` + `parent_analysis_id` on `analyses` | `src/main/db/migrations/006-phase4.sql` (NEW) | All Phase 4 schema changes |
| IPC channels for agent communication | `src/main/ipc/channels.ts` (MODIFY, append-only) | Agent state, block, thinking events |

**Gate 1**: ContentBlock types are frozen. Agent harness can execute one render tool call and produce a ContentBlock result. Thinking blocks are captured from mock LLM responses. Both agents validate by running a test that sends a mock LLM response with a `render_swot_analysis` tool call and verifying a `swot_analysis` ContentBlock is produced.

### Sprint 37: Chat Analysis Page + Conversation Lifecycle

**Agent A — Backend: Conversation Lifecycle + Run-in-Chat**

| Task | Files | Notes |
|------|-------|-------|
| ConversationRepository: CRUD for conversations table | `src/main/repositories/conversation.repository.ts` (NEW) | list, get, create, update title, delete (cascade) |
| ConversationService: create conversation on analysis start, list/resume | `src/main/services/conversation.service.ts` (NEW) | Business logic for conversation lifecycle |
| Conversation IPC handlers: list, get, create, delete | `src/main/ipc/handlers/conversation.ipc.ts` (NEW) | Thin handlers calling service |
| "Run-in-chat" mode: analysis pipeline → emits content blocks instead of static results | `src/main/services/analysis.service.ts` (MODIFY) | New entry point alongside existing `run()` |
| Pipeline progress events: emit current step via IPC (reuses existing `analysis:progress` pattern) | `src/main/services/analysis.service.ts` | Already emits stage — ensure all 7 steps covered |
| Agent state events: emit state changes (analyzing/thinking/fetching/ready) via IPC | `src/main/ipc/handlers/agent.ipc.ts` (NEW) | Streaming events |
| Token counting: accumulate tokens from LLM responses, emit via IPC | `src/main/services/agent.service.ts` (MODIFY) | Use response `usage` field + estimation |
| Preload bridge for agent + conversation events | `src/preload/api.ts` (MODIFY) | Add agent + conversation sections |

**Agent B — Frontend: Chat Analysis Page + UX**

| Task | Files | Notes |
|------|-------|-------|
| Chat Analysis page with two states (conversation list / active conversation) | `src/renderer/routes/chat-analysis.tsx` (NEW) | Primary new page |
| Conversation list component | `src/renderer/components/chat/conversation-list.tsx` (NEW) | Cards with title, role, date, preview, resume |
| Config panel component (role, profiles, sources, model, run button) | `src/renderer/components/chat/analysis-config-panel.tsx` (NEW) | Collapsible accordion, reuses existing selectors |
| Pipeline progress indicator component | `src/renderer/components/chat/pipeline-progress.tsx` (NEW) | Horizontal stepped bar with 7 phases |
| Status bar component | `src/renderer/components/chat/status-bar.tsx` (NEW) | Agent state, source icons, token count, stop |
| ThinkingBlock component | `src/renderer/components/chat/blocks/thinking-block.tsx` (NEW) | Collapsible thinking card, streaming indicator |
| Rich message renderer (dispatches ContentBlock arrays) | `src/renderer/components/chat/content-block-renderer.tsx` (NEW) | Maps block type → component |
| RichMessage wrapper component | `src/renderer/components/chat/rich-message.tsx` (NEW) | Renders array of ContentBlocks |
| Route changes: add `/chat-analysis`, remove `/analysis` + `/history` from sidebar | `src/renderer/App.tsx` (MODIFY) | New route, update nav items |
| Agent + conversation hooks | `src/renderer/hooks/use-agent.ts` (NEW), `src/renderer/hooks/use-conversations.ts` (NEW) | useAgentState, useTokenCount, useStopAgent, useConversations, useConversation |
| Redirect `/analysis` and `/history` to `/chat-analysis` | `src/renderer/App.tsx` (MODIFY) | Backwards compat for any bookmarks |

**Gate 2**: Chat Analysis page renders with conversation list. New Analysis → config panel → Run Analysis creates a conversation and transitions to chat view. Pipeline progress indicator shows steps. Thinking blocks render as collapsible cards. Status bar shows agent state. Old /analysis and /history routes redirect.

### Sprint 38: Render Tools Implementation

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

### Sprint 39: Read Tools + Agentic Follow-ups

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
| "Go deeper" system prompt guidance | `src/main/services/agent.service.ts` (MODIFY) | System prompt addition |
| Tests for read tools, multi-turn, and evidence gap analysis | `src/main/providers/agent-tools/read-executor.test.ts` (NEW) | |

**Agent B — Frontend: Multi-Turn Streaming UX**

| Task | Files | Notes |
|------|-------|-------|
| Source activity in status bar (which tool is executing) | `src/renderer/components/chat/status-bar.tsx` (MODIFY) | Animated integration icons |
| Progress indicators per tool execution | `src/renderer/components/chat/tool-progress.tsx` (NEW) | "Fetching Jira data..." cards |
| Handle interleaved blocks during multi-turn (text → tool → text → tool) | `src/renderer/routes/chat-analysis.tsx` (MODIFY) | Progressive rendering |
| Streaming UX: partial thinking + partial text + complete blocks appearing | `src/renderer/components/chat/rich-message.tsx` (MODIFY) | |

**Gate 4**: Agent can fetch data via read tools and incorporate results into responses. Multi-turn loop works E2E: user asks follow-up → agent calls `fetch_jira_data` → gets data → renders analysis → responds. Thinking blocks stream during follow-ups.

### Sprint 40: Approval Memory + Re-run + Write Tools

**Agent A — Backend: Approval Memory + Re-run**

| Task | Files | Notes |
|------|-------|-------|
| ApprovalMemoryService: per-conversation store | `src/main/services/approval-memory.service.ts` (NEW) | Uses conversation_id |
| ApprovalMemoryRepository: CRUD on `approval_memory` table | `src/main/repositories/approval-memory.repository.ts` (NEW) | |
| Auto-approval check in agent harness: before emitting pending event, check memory | `src/main/services/agent.service.ts` (MODIFY) | |
| Re-run: create new analysis record with `parentAnalysisId` within same conversation | `src/main/services/analysis.service.ts` (MODIFY) | New `reRunAnalysis()` method |
| Re-run: stream results into same conversation | `src/main/services/agent.service.ts` (MODIFY) | |
| `write_file` tool implementation | `src/main/providers/agent-tools/write-executor.ts` (NEW) | Uses FileService with path enforcement |
| Tests | Various test files (NEW) | |

**Agent B — Frontend: 3-Tier Approval UI + Re-run UX**

| Task | Files | Notes |
|------|-------|-------|
| "Yes + Remember" button on approval cards | `src/renderer/components/analysis/approval-card.tsx` (MODIFY) | Third button |
| Memory indicator badge (shows which tools are auto-approved) | `src/renderer/components/chat/memory-indicator.tsx` (NEW) | |
| Re-run UX: config panel re-expandable, new analysis appears in same conversation | `src/renderer/routes/chat-analysis.tsx` (MODIFY) | |
| Pinned summary: jumpable "results" section per analysis | `src/renderer/components/chat/pinned-summary.tsx` (NEW) | "Jump to results" affordance |
| Write file approval card (preview file content + path) | `src/renderer/components/chat/blocks/write-file-preview.tsx` (NEW) | |

**Gate 5**: Approval memory works per-conversation. "Yes + Remember" auto-approves subsequent same-type actions. Re-run creates new analysis in same conversation with separate pinned summary. Config panel re-expansion works.

### Sprint 41: Diagram Export + Conversation Management + Polish + Testing

**Agent A — Backend + Testing**

| Task | Files | Notes |
|------|-------|-------|
| SVG-to-PNG export utility | `src/main/services/diagram-export.service.ts` (NEW) | SVG → canvas → blob → file |
| Export IPC handler | `src/main/ipc/handlers/export.ipc.ts` (MODIFY) | Add `export:diagram:png` channel |
| E2E agent harness tests: multi-turn, interrupt, error recovery, approval memory, thinking | Various test files | |
| Integration test: new conversation → config → run → chat → render → read → write → re-run | Test file (NEW) | Full lifecycle |
| Documentation updates | `docs/18-phase4-chat-experience-plan.md` (MODIFY) | Completion log |

**Agent B — Frontend + Polish**

| Task | Files | Notes |
|------|-------|-------|
| Token counter in status bar: running count + cost estimate | `src/renderer/components/chat/status-bar.tsx` (MODIFY) | |
| Conversation management: edit title, delete conversation | `src/renderer/components/chat/conversation-list.tsx` (MODIFY) | |
| Keyboard shortcuts (send message, stop agent, jump to results, new analysis) | Various | |
| Export buttons on Mermaid and chart blocks ("Save as PNG") | Block components (MODIFY) | |
| Edge cases: empty conversation, agent error mid-turn, network disconnect, resume stale conversation | `src/renderer/routes/chat-analysis.tsx` (MODIFY) | |
| Visual consistency pass across all block types | All block components | |
| Remove dead code: old `analysis.tsx`, `analysis-history.tsx`, `analysis-detail.tsx` routes | `src/renderer/routes/` (DELETE) | Cleanup after migration |

---

## 4. Dependency Gates

| Gate | Timing | Validation Criteria | Blocking |
|------|--------|--------------------|---------  |
| **G1** | End Sprint 36 | ContentBlock types frozen (incl. `thinking`). Agent harness executes one render tool and produces a ContentBlock. Thinking blocks captured from mock responses. | Sprint 37 both tracks |
| **G2** | End Sprint 37 | Chat Analysis page renders with conversation list + config + chat states. Pipeline progress shows steps. Thinking blocks render. Old routes redirect. | Sprint 38 frontend track |
| **G3** | End Sprint 38 | All 7 render tools produce valid ContentBlocks. All block components (8 incl. thinking) render from JSON data. | Sprint 39 |
| **G4** | End Sprint 39 | Multi-turn loop with read tools works E2E. Thinking streams during follow-ups. | Sprint 40 |
| **G5** | End Sprint 40 | Approval memory auto-approves per-conversation. Re-run works. Config re-expansion works. | Sprint 41 testing |

---

## 5. File Ownership Matrix

| File / Module | Owner | Notes |
|---|---|---|
| `src/main/services/agent.service.ts` | Agent A (all sprints) | Core harness — exclusive ownership |
| `src/main/domain/content-block.types.ts` | Agent B (Sprint 36), then frozen | Frozen at Gate 1 |
| `src/main/providers/agent-tools/tool-registry.ts` | Agent A (Sprint 36) | Registry infrastructure |
| `src/main/providers/agent-tools/render-tools.ts` | Agent B (Sprint 36 definitions) | Tool schemas |
| `src/main/providers/agent-tools/read-tools.ts` | Agent B (Sprint 36 definitions) | Tool schemas |
| `src/main/providers/agent-tools/write-tools.ts` | Agent B (Sprint 36 definitions) | Tool schemas |
| `src/main/providers/agent-tools/render-executor.ts` | Agent A (Sprint 38) | Execution logic |
| `src/main/providers/agent-tools/read-executor.ts` | Agent A (Sprint 39) | Execution logic |
| `src/main/providers/agent-tools/write-executor.ts` | Agent A (Sprint 40) | Execution logic |
| `src/main/repositories/conversation.repository.ts` | Agent A (Sprint 37) | Conversation CRUD |
| `src/main/services/conversation.service.ts` | Agent A (Sprint 37) | Conversation lifecycle |
| `src/main/services/approval-memory.service.ts` | Agent A (Sprint 40) | |
| `src/main/services/analysis.service.ts` | Agent A (Sprint 37, 40) | Run-in-chat, re-run |
| `src/main/services/chat.service.ts` | Agent A | Delegates to agent harness |
| `src/renderer/routes/chat-analysis.tsx` | Agent B (Sprint 37+) | Primary new page |
| `src/renderer/components/chat/conversation-list.tsx` | Agent B (Sprint 37, 41) | History list |
| `src/renderer/components/chat/analysis-config-panel.tsx` | Agent B (Sprint 37) | Config accordion |
| `src/renderer/components/chat/pipeline-progress.tsx` | Agent B (Sprint 37) | Progress indicator |
| `src/renderer/components/chat/status-bar.tsx` | Agent B (Sprint 37+) | |
| `src/renderer/components/chat/content-block-renderer.tsx` | Agent B (Sprint 37+) | |
| `src/renderer/components/chat/blocks/*` | Agent B (Sprint 37+) | All block renderers |
| `src/renderer/components/analysis/approval-card.tsx` | Agent B (Sprint 40) | 3-tier upgrade |
| `src/renderer/App.tsx` | Agent B (Sprint 37) | Route changes |
| `src/main/ipc/channels.ts` | Both (append-only) | Same convention as Phase 3 |
| `src/preload/api.ts` | Agent A (Sprint 37) | Agent + conversation bridge |
| `src/main/db/migrations/*` | Agent B (Sprint 36) | Migration v6 |
| `src/renderer/hooks/use-conversations.ts` | Agent B (Sprint 37) | Conversation hooks |
| `src/renderer/hooks/use-agent.ts` | Agent B (Sprint 37) | Agent hooks |

---

## 6. Risk Register

| # | Risk | Prob | Impact | Mitigation | Contingency |
|---|------|------|--------|------------|-------------|
| R1 | Agent harness loop complexity (recursive tool calls, error recovery, partial responses) | Med | High | Layered approach: render-only loop (Sprint 36), add read (Sprint 39), add write (Sprint 40). Each layer adds complexity incrementally. | Fall back to single-turn tool-use (current Phase 3c pattern) for write tools; only auto-loop for render/read. |
| R2 | Mermaid/D3 rendering in Electron has compatibility issues | Med | Med | Already proven in Phase 3e (Sprint 27). Reuse the same components. | Fall back to code blocks with "Copy diagram source" button instead of inline SVG. |
| R3 | Token counter accuracy — OpenRouter doesn't always report exact usage | Med | Low | Use approximate estimation (chars/4) for running count. Show as "~N tokens". True usage from response `usage` field when available. | Display tilde prefix to set expectations about approximation. |
| R4 | 1M context window makes responses slow and expensive for long conversations | Med | Med | Use context generously but monitor latency. If turns exceed 30s consistently, investigate prompt trimming. | Add "turbo mode" toggle using smaller context window for faster responses. |
| R5 | Render tool output is large (full SwotOutput in tool_result) and wastes context | Low | Med | Render tools return compact confirmation as tool_result, not full data. Data stored in content block only. | Implement content block storage separately from conversation context. |
| R6 | Two agents create merge conflicts on shared files | Med | Low | File ownership matrix (Section 5) prevents most conflicts. `channels.ts` is append-only. Gate validations catch integration issues early. | Same conflict resolution process as Phase 3 parallel sprints. |
| R7 | Extended thinking not available via OpenRouter for all models | Med | Low | Thinking display degrades gracefully — if no thinking blocks in response, no thinking UI appears. Works fully with direct Anthropic provider. | Document as "best with Anthropic provider" in settings. Add a note in provider picker. |
| R8 | Unified config-to-chat page is complex state management (list vs config vs chat) | Med | Med | Clear state machine: `list` → `config` → `running` → `chat`. Each state renders a distinct section. Use React state or URL params to track. | Fall back to separate routes (`/chat-analysis` for list, `/chat-analysis/new` for config, `/chat-analysis/:id` for chat) if single-page state becomes unwieldy. |

---

## 7. Key Design Decisions

1. **Chat Analysis as primary nav entry**: The old Analysis and History pages are retired. Chat Analysis is the single entry point for running analyses and browsing past conversations. This eliminates the fragmented experience of configuring on one page, viewing results on another, chatting in a side panel, and browsing history on yet another page.

2. **Single-shot initial analysis preserved**: The existing pipeline is proven and reliable. Phase 4 changes how results are presented (content blocks in chat), not how they're generated. The backend pipeline is unchanged for the initial run.

3. **Multi-turn for follow-ups only**: Follow-up questions become agentic (tool-use loop). This avoids the cost/latency of multi-turn for the initial analysis while enabling rich interactive exploration afterward.

4. **Render tools as the bridge**: The agent uses tool_use to produce structured output. This is cleaner than parsing special markers in text streams. It aligns with the existing Phase 3c tool-use pattern and gives the agent explicit control over when to render cards vs. write text.

5. **Dual-write for data integrity**: The `analyses` table remains the source of truth for SWOT output, summaries, and quality metrics. Chat messages store content blocks for display. Export and comparison features continue to work from the analyses table without change.

6. **Approval memory per-conversation**: Scoped to the conversation to prevent stale permissions. A permission granted 3 weeks ago shouldn't auto-create Jira tickets today. Per-conversation scope matches the user's mental model of "this investigation session."

7. **No backwards compatibility**: The app is still in development. Existing analyses may not render in the new chat view. Old routes redirect to Chat Analysis. Old analysis/history pages are deleted in the final sprint.

8. **Thinking as progressive disclosure**: Thinking data is shown collapsed by default — users who want to see the agent's reasoning can expand it, but it doesn't clutter the primary flow. This mirrors the UX pattern established by Claude's web interface.

9. **Conversations as first-class entities**: Rather than a flat list of analyses, conversations group related analyses and chat threads. This supports the natural workflow of iterating on an analysis (re-run with different role, drill deeper, compare approaches) within a single investigation session.
