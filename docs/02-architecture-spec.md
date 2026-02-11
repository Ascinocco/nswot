# nswot - MVP Architecture Specification

> **Canonical architecture for current development.** Full post-MVP architecture is preserved in `docs/future/full-architecture-spec.md`.
> Enterprise patterns (repository, service, provider, circuit breaker) are defined in this doc and detailed in the ADRs.

---

## 1. Architecture Overview

`nswot` is an Electron desktop app with strict process separation:

- **Renderer (React)**: UI only
- **Main process (Node.js)**: filesystem, database, network, analysis orchestration
- **Preload bridge**: typed IPC surface

The MVP architecture is intentionally narrow: profiles + Jira -> single-pass SWOT -> grounded chat -> markdown export.

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
│     (external system clients — Jira, OpenRouter)     │
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

### 4.5 Infrastructure

Shared utilities that services and providers depend on. Circuit breaker, retry, database connection, file system access.

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

## 7. Analysis Pipeline (MVP)

MVP uses a **single-pass pipeline** instead of multi-step LLM chaining.

```text
Collect -> Preprocess -> Prompt/Send -> Parse/Validate -> Store
```

### 7.1 Collect

- Load selected profiles from repository
- Load Jira data from cache (via integration-cache repository) and/or fresh fetch (via Jira provider)
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
- strict output schema requirements

Sent via OpenRouter provider, wrapped in circuit breaker.

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

### 7.5 Store

- Store `input_snapshot`, structured output, and raw response via analysis repository
- Save `analysis_profiles` junction records
- Make run available in history view
- All writes in a single SQLite transaction (unit of work)

---

## 8. Chat Architecture (MVP)

Chat is grounded only in:

- selected analysis output
- recent chat messages (last N, token-bounded)

MVP chat is **read/advise only**:

- no file writes
- no action tools
- no integration fetch from chat

Streaming chunks are emitted through `chat:chunk` and persisted after completion via chat repository.

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

These interfaces are designed for Phase 2/3 extension without modifying existing code:

- **New integration provider**: Implement a new provider class (e.g., `ConfluenceProvider`), register it in `IntegrationService`. The orchestrator already collects data by iterating registered providers.
- **New LLM provider**: Implement `LLMProvider` interface, swap in `AnalysisService`. No pipeline changes needed.
- **New export format**: Add a new method to `ExportService`. No upstream changes.
- **Multi-step pipeline**: Replace the single prompt call in the orchestrator with a step chain. Input/output types for each stage are already defined.

---

## 14. Delivery Priorities

Priority order for implementation and trade-offs:

1. Secure and reliable core loop
2. Evidence validity checks
3. Fast feedback in run and chat UX
4. Maintainable seams for future Confluence/GitHub extension
