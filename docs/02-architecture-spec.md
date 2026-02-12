# nswot - MVP Architecture Specification

> **Canonical architecture for current development.** Full post-MVP architecture is preserved in `docs/future/full-architecture-spec.md`.
> Enterprise patterns (repository, service, provider, circuit breaker) are defined in this doc and detailed in the ADRs.

---

## 1. Architecture Overview

`nswot` is an Electron desktop app with strict process separation:

- **Renderer (React)**: UI only
- **Main process (Node.js)**: filesystem, database, network, analysis orchestration
- **Preload bridge**: typed IPC surface

The architecture has grown from its MVP foundation (profiles + Jira -> single-pass SWOT -> grounded chat -> markdown export) through Phase 2 (Confluence, GitHub, quality metrics) and Phase 3a-3d (codebase analysis, chat actions, comparison, themes, export). Phase 3e adds multi-provider LLM support, visualizations, and platform maturity features. Phase 4 replaces the page-based analysis results with a chat-driven agent experience built on an agent harness with tool-use.

### Layered Architecture

Each concern lives in a distinct layer. Dependencies flow downward only.

```text
┌─────────────────────────────────────────────────────┐
│                  IPC Handlers                        │
│         (transport layer — thin, no logic)           │
├─────────────────────────────────────────────────────┤
│                    Services                          │
│      (business logic, orchestration, validation)     │
├─────────────────────────────────────────────────────┤
│                  Repositories                        │
│    (data access — SQLite queries, domain mapping)    │
├─────────────────────────────────────────────────────┤
│                   Providers                          │
│  (external clients — Jira, Confluence, GitHub,       │
│   OpenRouter, Anthropic, Claude CLI, OpenCode)        │
├─────────────────────────────────────────────────────┤
│                 Infrastructure                       │
│   (SQLite, safeStorage, fs, circuit breaker, retry)  │
└─────────────────────────────────────────────────────┘
```

---

## 2. Process Boundaries

### 2.1 Main Process Responsibilities

- Workspace file operations (read/write/list)
- SQLite operations via repositories
- Jira OAuth and Jira data fetch via providers
- OpenRouter API calls via providers
- Analysis orchestration via services
- Secret handling (`safeStorage`)
- Markdown export generation

No renderer direct access to fs, db, or network.

### 2.2 Renderer Responsibilities

- Route and panel rendering
- Forms and validation feedback
- React Query hooks around typed IPC methods
- Streaming UI updates for analysis progress/chat chunks

### 2.3 Preload Responsibilities

- Expose minimum typed API through `contextBridge`
- Register/listen to streaming event channels
- No generic `ipcRenderer` pass-through

---

## 3. Code Layout (MVP)

```text
src/
  main/
    index.ts
    ipc/
      channels.ts                    # Channel name constants (typed)
      registry.ts                    # Central IPC handler registration
      handlers/
        workspace.ipc.ts
        file.ipc.ts
        profile.ipc.ts
        integration.ipc.ts
        analysis.ipc.ts
        chat.ipc.ts
        settings.ipc.ts
        export.ipc.ts
    services/
      profile.service.ts             # Profile business rules (25-limit, validation)
      analysis.service.ts            # Analysis orchestration (pipeline stages)
      chat.service.ts                # Chat context assembly, token budgeting
      integration.service.ts         # Integration lifecycle management
      export.service.ts              # Markdown export generation
      settings.service.ts            # Preferences and key management
    repositories/
      workspace.repository.ts        # Workspace CRUD
      profile.repository.ts          # Profile CRUD
      analysis.repository.ts         # Analysis + analysis_profiles CRUD
      integration.repository.ts      # Integration config CRUD
      integration-cache.repository.ts # Cached integration data
      chat.repository.ts             # Chat message persistence
      preferences.repository.ts     # Key-value preferences
    providers/
      jira/
        jira.provider.ts             # Jira REST API client
        jira.types.ts                # Jira API response types
      llm/
        openrouter.provider.ts       # OpenRouter API client
        llm.types.ts                 # LLM request/response types
      codebase/                      # Phase 3a
        codebase.provider.ts         # Spawns Claude CLI, captures structured output
        codebase.types.ts            # CodebaseAnalysis schema types
        codebase-prompt.ts           # Analysis prompt sent to Claude CLI
      actions/                       # Phase 3c
        action-executor.ts           # Spawns Claude CLI for MCP action execution
        action-tools.ts              # Tool definitions for OpenRouter tool-use
        action.types.ts              # ChatAction, ActionResult types
    domain/
      types.ts                       # Core domain types (Profile, Analysis, SwotItem, etc.)
      errors.ts                      # Domain error types
      result.ts                      # Result<T, E> type
    analysis/
      orchestrator.ts                # Pipeline: collect -> preprocess -> prompt -> parse -> store
      preprocessor.ts                # Anonymize, rank, trim, token budget
      anonymizer.ts                  # PII stripping
      prompt-builder.ts              # Prompt template construction
      response-parser.ts            # Parse + validate LLM response
    infrastructure/
      database.ts                    # SQLite connection + migration runner
      safe-storage.ts                # Electron safeStorage wrapper
      circuit-breaker.ts             # Circuit breaker for external calls
      retry.ts                       # Retry with exponential backoff
      file-system.ts                 # Workspace-scoped fs operations
    db/
      migrations/
        001-initial-schema.sql
  preload/
    index.ts
    api.ts
  renderer/
    App.tsx
    routes/
      workspace.tsx
      profiles.tsx
      integrations.tsx
      analysis.tsx
      analysis-history.tsx
      settings.tsx
    components/
      sidebar/FileBrowser.tsx
      editor/EditorPane.tsx
      analysis/AnalysisRunner.tsx
      analysis/SwotQuadrant.tsx
      analysis/SwotItem.tsx
      chat/ChatPane.tsx
      chat/ChatInput.tsx
      profiles/ProfileForm.tsx
      integrations/JiraSetup.tsx
      common/RoleSwitcher.tsx
      common/ModelSelector.tsx
      common/ExportMenu.tsx
    hooks/
      useSettings.ts
      useProfiles.ts
      useIntegrations.ts
      useAnalysis.ts
      useChat.ts
      useFileBrowser.ts
```

---

## 4. Layer Responsibilities

### 4.1 IPC Handlers (Transport Layer)

IPC handlers are thin. They deserialize input, call a service method, and serialize the result. No business logic lives here.

```ts
// Example: profile.ipc.ts
ipcMain.handle(IPC_CHANNELS.PROFILE_CREATE, async (_event, input: ProfileInput): Promise<IPCResult<Profile>> => {
  const result = await profileService.create(workspaceId, input);
  return result.match({
    ok: (profile) => ({ success: true, data: profile }),
    err: (error) => ({ success: false, error: { code: error.code, message: error.message } }),
  });
});
```

### 4.2 Services (Business Logic Layer)

Services own domain rules, orchestrate multi-step operations, and coordinate between repositories and providers.

```ts
// Example: profile.service.ts
class ProfileService {
  constructor(
    private profileRepo: ProfileRepository,
    private workspaceRepo: WorkspaceRepository,
  ) {}

  async create(workspaceId: string, input: ProfileInput): Promise<Result<Profile, DomainError>> {
    const count = await this.profileRepo.countByWorkspace(workspaceId);
    if (count >= 25) {
      return err(new DomainError('PROFILE_LIMIT', 'Maximum 25 profiles per workspace'));
    }
    const profile = await this.profileRepo.insert(workspaceId, input);
    return ok(profile);
  }
}
```

### 4.3 Repositories (Data Access Layer)

Repositories encapsulate all SQLite queries and return domain types. They never contain business rules.

```ts
// Example: profile.repository.ts
class ProfileRepository {
  constructor(private db: Database) {}

  async findByWorkspace(workspaceId: string): Promise<Profile[]> { ... }
  async findById(id: string): Promise<Profile | null> { ... }
  async insert(workspaceId: string, input: ProfileInput): Promise<Profile> { ... }
  async update(id: string, input: ProfileInput): Promise<Profile> { ... }
  async delete(id: string): Promise<void> { ... }
  async countByWorkspace(workspaceId: string): Promise<number> { ... }
}
```

### 4.4 Providers (External System Clients)

Providers wrap external APIs behind a stable interface. Each provider handles its own auth, serialization, and raw HTTP errors. Circuit breakers and retry logic wrap provider calls.

```ts
// Example: jira.provider.ts
class JiraProvider {
  async fetchProjects(cloudId: string): Promise<JiraProject[]> { ... }
  async fetchEpics(cloudId: string, projectKey: string): Promise<JiraEpic[]> { ... }
  async fetchStories(cloudId: string, epicKey: string): Promise<JiraStory[]> { ... }
  async fetchComments(cloudId: string, issueKey: string): Promise<JiraComment[]> { ... }
}
```

**Phase 3 — CodebaseProvider**: Spawns Claude CLI as a child process to perform agentic code analysis on cloned repos. Unlike HTTP-based providers, this wraps a local subprocess with structured JSON output. See `docs/11-codebase-analysis-plan.md` for the full design.

```ts
// Phase 3: codebase.provider.ts
class CodebaseProvider {
  async analyze(repoPath: string, prompt: string): Promise<CodebaseAnalysis> { ... }
  async isAvailable(): Promise<boolean> { ... }  // Claude CLI installed + authed
}
```

**Phase 3e — Multi-Provider LLM**: The `LLMProvider` interface (implemented by `OpenRouterProvider`) gains a second implementation: `AnthropicProvider` for direct Claude API access. A factory in `AnalysisService` selects the active provider based on user settings. No pipeline changes needed — the provider abstraction handles this cleanly.

**Phase 3e — Multi-Provider Codebase Analysis**: `CodebaseProvider` gains an alternative: `OpenCodeProvider`, which spawns OpenCode instead of Claude CLI. Same structured prompt and output parsing contract. Provider selection is a user setting.

### 4.5 Infrastructure

Shared utilities that services and providers depend on. Circuit breaker, retry, database connection, file system access.

**Phase 3e additions:**
- **Structured logging** (`infrastructure/logger.ts`): Singleton logger with file output (`~/.nswot/logs/nswot-YYYY-MM-DD.log`), daily rotation, configurable log levels, and old log cleanup. All services and providers log through this centralized logger.
- **File system watching** (`infrastructure/file-watcher.ts`): Monitors workspace directory for external file changes. Emits `file:changed` events via IPC to the renderer, which invalidates React Query directory/file caches for live sidebar updates.

### 4.6 Visualization Components (Renderer)

Phase 3e introduces a visualization layer in the renderer for interactive data display:

- **Chart.js** (via `react-chartjs-2`): Horizontal bar charts (source coverage, theme distribution), radar charts (multi-source evidence coverage), stacked bar charts (confidence trend comparison)
- **D3**: SVG-based confidence heatmap (SWOT categories x confidence levels)
- **Mermaid**: Diagram rendering with dark theme support and error handling

All visualization components live in `src/renderer/components/visualizations/` and are integrated into SWOT results (collapsible section) and comparison views.

---

## 5. IPC Surface (MVP)

All handlers return:

```ts
type IPCResult<T> =
  | { success: true; data: T }
  | { success: false; error: { code: string; message: string } };
```

Core channels:

- `workspace:open`
- `file:readDir`, `file:read`, `file:write`
- `profile:list`, `profile:get`, `profile:create`, `profile:update`, `profile:delete`, `profile:importMarkdown`
- `integration:jira:auth`, `integration:jira:test`, `integration:jira:projects`, `integration:jira:fetch`
- `analysis:run`, `analysis:progress`, `analysis:list`, `analysis:get`, `analysis:delete`
- `chat:send`, `chat:chunk`, `chat:history`
- `chat:action:pending` (event), `chat:action:approve`, `chat:action:reject`, `chat:action:edit`, `chat:action:list`
- `settings:getKey`, `settings:setKey`, `settings:getPrefs`, `settings:setPrefs`, `llm:listModels`
- `export:markdown`

---

## 6. Data Model (SQLite, MVP)

```sql
CREATE TABLE workspace (
  id TEXT PRIMARY KEY,
  path TEXT NOT NULL,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_opened_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE profiles (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  role TEXT,
  team TEXT,
  concerns TEXT,
  priorities TEXT,
  interview_quotes TEXT, -- JSON array
  notes TEXT,
  source_file TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE integrations (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('jira')),
  config TEXT NOT NULL,   -- selected projects, site metadata
  status TEXT NOT NULL DEFAULT 'disconnected',
  last_synced_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(workspace_id, provider)
);

CREATE TABLE integration_cache (
  id TEXT PRIMARY KEY,
  integration_id TEXT NOT NULL REFERENCES integrations(id) ON DELETE CASCADE,
  resource_type TEXT NOT NULL, -- jira_epic, jira_story, jira_comment, jira_changelog
  resource_id TEXT NOT NULL,
  data TEXT NOT NULL,          -- JSON blob
  fetched_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(integration_id, resource_type, resource_id)
);

CREATE TABLE analyses (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  model_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  config TEXT NOT NULL,         -- included profiles + projects + run options
  input_snapshot TEXT,          -- anonymized payload sent to LLM
  swot_output TEXT,             -- JSON structured output
  summaries_output TEXT,        -- JSON source summaries
  raw_llm_response TEXT,
  warning TEXT,
  error TEXT,
  started_at TEXT,
  completed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE analysis_profiles (
  analysis_id TEXT NOT NULL REFERENCES analyses(id) ON DELETE CASCADE,
  profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  anonymized_label TEXT NOT NULL,
  PRIMARY KEY (analysis_id, profile_id)
);

CREATE TABLE chat_messages (
  id TEXT PRIMARY KEY,
  analysis_id TEXT NOT NULL REFERENCES analyses(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE preferences (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
```

---

## 7. Analysis Pipeline

The pipeline supports two modes: **single-step** (default) and **multi-step**.

### 7.0 Pipeline Architecture

The pipeline is built on a step-chain pattern:

```ts
interface PipelineStep {
  name: string;
  execute(context: PipelineContext, onProgress: StepProgressFn): Promise<PipelineContext>;
}
```

**PipelineContext** carries all inputs and accumulates outputs as steps execute:

```text
PipelineContext
  ├── Inputs: analysisId, role, modelId, contextWindow, anonymizedProfiles,
  │           inputSnapshot, dataSources, connectedSources, llmCaller
  └── Outputs (accumulated): extractionOutput?, synthesisOutput?, themes?,
                              swotOutput?, summariesOutput?, qualityMetrics?,
                              rawLlmResponse?, warning?
```

**LlmCaller** abstracts LLM communication — each step calls `llmCaller.call(messages)` and receives `{ content, finishReason }`. This enables easy mocking in tests and future provider swapping.

**AnalysisOrchestrator** runs steps sequentially, threading the context through each:

```ts
class AnalysisOrchestrator {
  constructor(private steps: PipelineStep[]) {}
  async run(context: PipelineContext, onProgress): Promise<PipelineContext> {
    for (const step of this.steps) { context = await step.execute(context, onProgress); }
    return context;
  }
}
```

**Single-step mode** (default): `[SwotGenerationStep]` — one LLM call, backward compatible with MVP.

**Multi-step mode** (`multiStep: true`): `[ExtractionStep, SynthesisStep, SwotGenerationStep]` — three LLM calls with context threading.

Each step has its own corrective prompt builder. On parse failure, the step retries once with a corrective message explaining the error and requesting valid JSON.

### 7.0.1 Single-Pass Pipeline (Default)

```text
Collect -> Preprocess -> Prompt/Send -> Parse/Validate -> Store
```

### 7.1 Collect

- Load selected profiles from repository
- Load Jira data from cache (via integration-cache repository) and/or fresh fetch (via Jira provider)
- Load codebase analysis results from cache (Phase 3 — pre-computed by Claude CLI)
- Normalize to internal shape

### 7.2 Preprocess

- Anonymize names/emails via `anonymizer.ts`
- Build deterministic pseudonym map (for local de-anonymization)
- Trim and rank Jira records by recency/relevance
- Build token-bounded prompt payload
- Generate user preview summary before final send

### 7.3 Prompt and Send

One structured prompt containing:

- role context
- anonymized profile content
- Jira summaries and selected evidence snippets
- Confluence page/comment summaries (Phase 2)
- GitHub PR/issue summaries (Phase 2)
- Codebase analysis findings (Phase 3 — architecture, quality, tech debt, risks)
- strict output schema requirements

Sent via OpenRouter provider, wrapped in circuit breaker. Codebase analysis data is pre-computed by Claude CLI (Tier 1) running against locally cloned repos, and fed to the SWOT synthesis (Tier 2) as condensed markdown — see `docs/11-codebase-analysis-plan.md`.

**Temperature (Phase 3e)**: Analysis LLM calls use temperature 0 (or near-0) to ensure consistent results across repeated runs on the same data. This is a provider-level parameter on the LLM request, not a pipeline change.

### 7.4 Parse and Validate

Parse LLM response into:

- SWOT quadrants
- evidence entries per item
- confidence per item
- per-source summaries

Validation rules:

- every SWOT item must have at least one evidence entry
- evidence `sourceId` must map to an entity in `input_snapshot`
- malformed payload retries once with corrective prompt

On second parse failure, analysis is stored as `failed` with diagnostic message.

**Evidence coverage (Phase 3e)**: After validation, compute which input sources were actually cited in the SWOT output. Compare cited `sourceId`s against the full input snapshot to produce per-source-type coverage rates (e.g., 9/14 profiles, 3/5 Jira projects, 2/2 Confluence spaces, 1/3 GitHub repos). Stored as part of `EvidenceQualityMetrics` and displayed on the quality metrics card. This data also feeds the Phase 4 "Go deeper" capability — the agent uses coverage gaps to target its search for additional findings.

### 7.5 Multi-Step Pipeline (Phase 3d)

When `multiStep: true`, the pipeline runs three steps instead of one:

```text
ExtractionStep → SynthesisStep → SwotGenerationStep
```

**ExtractionStep** (`stages: extracting`):
- Sends profiles + data source markdown to LLM
- Parses `ExtractionOutput`: `signals[]` (sourceType, sourceId, signal, category, quote) + `keyPatterns[]`
- Signal categories: theme, risk, strength, concern, metric
- Output stored on `context.extractionOutput`

**SynthesisStep** (`stages: synthesizing`):
- Reads `context.extractionOutput.signals` and correlates across sources
- Parses `SynthesisOutput`: `correlations[]` (claim, supportingSignals, sourceTypes, agreement, conflicts) + `synthesisMarkdown`
- If extraction produced no signals, returns empty synthesis without LLM call
- Output stored on `context.synthesisOutput`

**SwotGenerationStep** (`stages: building_prompt`):
- When `context.synthesisOutput?.synthesisMarkdown` is available, appends it to the user prompt under a "Cross-Source Synthesis (Pre-Analysis)" header
- Otherwise runs identically to single-step mode
- Produces `swotOutput`, `summariesOutput`, `qualityMetrics`

### 7.6 Store

- Store `input_snapshot`, structured output, and raw response via analysis repository
- Save `analysis_profiles` junction records
- Make run available in history view
- All writes in a single SQLite transaction (unit of work)

---

## 8. Chat Architecture

Chat is grounded only in:

- selected analysis output
- recent chat messages (last N, token-bounded)

### 8.1 Read/Advise Mode (MVP)

- no file writes
- no action tools
- no integration fetch from chat

Streaming chunks are emitted through `chat:chunk` and persisted after completion via chat repository.

### 8.2 Chat Actions — Tool-Use Bridge (Phase 3c)

Chat gains the ability to create artifacts in external systems via a tool-use bridge. See `docs/12-chat-actions-plan.md` for the full design.

```text
OpenRouter (tool_use) → nswot (approval UI) → Claude CLI (MCP execution)
```

- **OpenRouter** receives tool definitions (Jira, Confluence, GitHub create actions) and returns `tool_use` content blocks when the LLM decides to create an artifact
- **nswot** intercepts tool calls in the SSE stream, presents an approval card to the user, and waits for explicit approval
- **Claude CLI** executes the approved action via its MCP servers (Jira, Confluence, GitHub)
- Results are fed back to OpenRouter as `tool_result` messages for conversational continuity

Key constraints:
- User approval is mandatory — no auto-execution
- Only create/add operations — no updates, no deletes
- Audit trail stored in `chat_actions` table
- Available tools are scoped to the user's connected integrations

### 8.3 Agent Harness (Phase 4)

Phase 4 replaces the SSE streaming + tool-use bridge (Phase 3c) with a full agent harness that drives the entire chat experience. See `docs/18-phase4-chat-experience-plan.md` for the complete design.

```text
User Message → Agent Harness → LLM Provider (tool_use response)
                    ↓
               Tool Execution ← render / read / write tool
                    ↓
               tool_result → LLM Provider (continue)
                    ↓
               ... (loop until final text response)
                    ↓
               Store ContentBlock[] as chat message
```

Components:
- **Tool Registry**: categorized tools (render/read/write) with declared approval requirements
- **Execution Loop**: send → tool_use → execute → tool_result → repeat until no more tool calls
- **Approval Gates**: write tools pause loop, emit pending event, wait for user decision (or auto-approve via memory)
- **Interrupt Handling**: stop button cancels in-flight LLM request, stores partial response

Tool taxonomy:

| Category | Approval | Examples |
|----------|----------|---------|
| Render | Never | render_swot_analysis, render_mermaid, render_chart, render_data_table |
| Read | Never | fetch_jira_data, fetch_confluence_data, run_codebase_analysis |
| Write | Required (or auto via memory) | create_jira_issue, create_confluence_page, write_file |

Render tools return compact confirmations as `tool_result` (not the full data) to avoid wasting context window. The data goes directly into a `ContentBlock` emitted to the renderer.

Storage additions:
- `chat_messages.content_format` — distinguishes plain text vs rich content block arrays
- `approval_memory` table — per-conversation auto-approval tracking
- `analyses.conversation_id` / `analyses.parent_analysis_id` — groups re-runs in a conversation

---

## 9. Jira Integration (MVP)

### 9.1 Auth

- OAuth 2.0 (Atlassian Cloud)
- Loopback callback server on localhost
- Token storage in `safeStorage`

### 9.2 Fetch

Handled by `JiraProvider`, wrapped in circuit breaker + retry:

- Project list
- Epics/stories via JQL and pagination
- Comments and changelog where available
- Basic retry/backoff using `Retry-After` when present

### 9.3 Cache

- Managed by `IntegrationCacheRepository`
- TTL default: 1 hour
- Max cache entries per integration: 5000 (prevents unbounded growth)
- If refresh fails, stale cache may be used with warning flag

---

## 10. Resilience Patterns

### 10.1 Circuit Breaker

External API calls (Jira, OpenRouter) are wrapped in a circuit breaker:

```text
States: CLOSED -> OPEN -> HALF_OPEN -> CLOSED

CLOSED:   requests pass through normally
          failure counter increments on error
          when failures >= threshold (5), transition to OPEN

OPEN:     all requests fail immediately with CircuitOpenError
          after cooldown period (60s), transition to HALF_OPEN

HALF_OPEN: allow one probe request
           if succeeds: reset counter, transition to CLOSED
           if fails: transition back to OPEN
```

Each external provider gets its own circuit breaker instance.

### 10.2 Retry with Backoff

Transient failures (network timeouts, 429/503 responses) are retried:

- Max retries: 3
- Backoff: exponential (1s, 2s, 4s) with jitter
- Respect `Retry-After` header when present
- Non-retryable errors (401, 403, 404) fail immediately

### 10.3 Analysis Pipeline Recovery

- Analysis status transitions: `pending -> running -> completed | failed`
- If the app crashes mid-pipeline, the analysis stays in `running` status
- On next app launch, any `running` analyses are marked as `failed` with a recovery message
- User can re-run from the failed analysis (same config, fresh execution)

---

## 11. Security and Privacy Model (MVP)

Electron hardening defaults:

- `nodeIntegration: false`
- `contextIsolation: true`
- `sandbox: true`
- `webSecurity: true`
- strict CSP

Data protection:

- API keys/tokens in OS keychain (`safeStorage`)
- Names/emails anonymized before LLM send
- Workspace path enforcement for all fs writes (path traversal rejected at infrastructure layer)
- Input preview shown to user before analysis send

---

## 12. Export (MVP)

Only markdown export is supported:

- `analysis/{date}-swot.md` in workspace by default
- Includes role, model, SWOT items, evidence, confidence, and summaries
- Generated by `ExportService`, which reads from `AnalysisRepository`

---

## 13. Extension Seams

These interfaces are designed for Phase 2/3/3e/4 extension without modifying existing code:

- **New integration provider**: Implement a new provider class (e.g., `ConfluenceProvider`), register it in `IntegrationService`. The orchestrator already collects data by iterating registered providers.
- **New LLM provider (Phase 3e)**: Implement `LLMProvider` interface (e.g., `AnthropicProvider` for direct Claude API). Factory in `AnalysisService` selects provider based on user settings. No pipeline changes needed.
- **New export format**: Add a new method to `ExportService`. No upstream changes.
- **Multi-step pipeline**: Replace the single prompt call in the orchestrator with a step chain. Input/output types for each stage are already defined.
- **Subprocess-based provider (Phase 3)**: `CodebaseProvider` demonstrates a new provider pattern — spawning a local CLI tool (Claude CLI) as a child process instead of making HTTP calls. The same service/cache/pipeline integration applies.
- **Alternative codebase provider (Phase 3e)**: Implement `OpenCodeProvider` following the same subprocess pattern as `CodebaseProvider`. Factory selects between Claude CLI and OpenCode based on user settings.
- **Chat tool-use actions (Phase 3c)**: The `ActionExecutor` reuses the Claude CLI subprocess pattern from `CodebaseProvider` but with MCP-scoped write access. Adding a new action type requires only a tool definition in `action-tools.ts` and a Claude CLI prompt template. See `docs/12-chat-actions-plan.md`.
- **New agent tool (Phase 4)**: Add a tool definition to the agent harness tool registry, implement the executor function. Render, read, and write tools follow the same pattern. Approval requirements are declared per-tool in the registry. See `docs/18-phase4-chat-experience-plan.md`.
- **New content block type (Phase 4)**: Define the block type in `ContentBlockType`, create a React renderer component in `blocks/`, and register it in `ContentBlockRenderer`. The agent harness emits blocks via render tools automatically.

---

## 14. Build and Release Architecture

Build and release delivery is automated through GitHub Actions.

Release channel mapping:

- `main` branch publishes prereleases (beta)
- `release/*` branches publish production releases

Workflow architecture (2 workflows):

1. `ci.yml` validates typecheck and tests on PR/push. Lint is added when ESLint tooling is introduced.
2. `release.yml` triggers after CI success via `workflow_run`. Computes SemVer from Conventional Commit history, creates release tag/notes, then builds and uploads macOS (arm64)/Windows/Linux artifacts to GitHub Releases in a parallel OS matrix.

Distribution policy:

- Current releases are unsigned and include per-platform bypass instructions.
- Signing/notarization is deferred and can be layered onto the same workflow model later.

See `docs/13-ci-cd-and-release.md` for the complete contract and `docs/14-release-operations-runbook.md` for operations.

---

## 15. Delivery Priorities

Priority order for implementation and trade-offs:

1. Secure and reliable core loop
2. Evidence validity checks
3. Fast feedback in run and chat UX
4. Maintainable seams for future Confluence/GitHub extension
