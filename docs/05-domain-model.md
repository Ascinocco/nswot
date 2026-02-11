# nswot - Domain Model

This document defines the core domain entities, their invariants, relationships, and repository interfaces. It is the source of truth for the data access and service layers.

---

## Entity Overview

```text
Workspace (aggregate root)
  ├── Profile (max 25)
  ├── Integration (max 1 per provider)
  │     └── IntegrationCacheEntry (max 5000 per integration)
  ├── Analysis (unbounded)
  │     ├── AnalysisProfile (junction — which profiles were included)
  │     └── ChatMessage (per analysis thread)
  └── Preferences (key-value, workspace-scoped)
```

---

## Core Entities

### Workspace

The top-level aggregate. All other entities belong to a workspace.

```ts
interface Workspace {
  id: string;              // UUID
  path: string;            // Absolute filesystem path to the workspace directory
  name: string;            // Display name (derived from directory name)
  createdAt: string;       // ISO 8601
  lastOpenedAt: string;    // ISO 8601
}
```

**Invariants:**
- `path` must be an absolute path to an existing directory
- `path` must be unique across all workspaces
- `name` is derived from `path` basename but can be overridden

**Lifecycle:**
- Created when user opens a directory for the first time
- Updated (`lastOpenedAt`) on each subsequent open
- Deleted only by explicit user action (cascades to all child entities)

---

### Profile

Represents a stakeholder the user has interviewed.

```ts
interface Profile {
  id: string;              // UUID
  workspaceId: string;     // FK -> Workspace
  name: string;            // Required — stakeholder's name
  role: string | null;     // Job title
  team: string | null;     // Team name
  concerns: string | null; // Freeform text
  priorities: string | null; // Freeform text
  interviewQuotes: string[]; // Array of direct quotes
  notes: string | null;    // Freeform text
  sourceFile: string | null; // Workspace-relative path if imported from markdown
  createdAt: string;       // ISO 8601
  updatedAt: string;       // ISO 8601
}

interface ProfileInput {
  name: string;
  role?: string;
  team?: string;
  concerns?: string;
  priorities?: string;
  interviewQuotes?: string[];
  notes?: string;
  sourceFile?: string;
}
```

**Invariants:**
- `name` is required and non-empty
- Maximum **25 profiles per workspace** (enforced by `ProfileService`)
- `interviewQuotes` is stored as JSON array in SQLite, deserialized to `string[]` by repository
- `sourceFile`, if present, must be a relative path within the workspace

---

### Integration

Represents a connection to an external service (Jira in MVP).

```ts
interface Integration {
  id: string;              // UUID
  workspaceId: string;     // FK -> Workspace
  provider: 'jira';        // MVP: only 'jira'. Phase 2+: 'confluence', 'github'
  config: IntegrationConfig; // Provider-specific config
  status: 'disconnected' | 'connected' | 'error';
  lastSyncedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface JiraConfig {
  cloudId: string;
  siteUrl: string;
  selectedProjectKeys: string[];
}

type IntegrationConfig = JiraConfig; // Union expands in Phase 2+
```

**Invariants:**
- Maximum **1 integration per provider per workspace** (UNIQUE constraint)
- `config` is stored as JSON in SQLite, deserialized to typed config by repository
- `status` transitions: `disconnected -> connected` (on successful auth), `connected -> error` (on auth failure), `error -> connected` (on re-auth)

---

### IntegrationCacheEntry

Cached data fetched from an external integration.

```ts
interface IntegrationCacheEntry {
  id: string;              // UUID
  integrationId: string;   // FK -> Integration
  resourceType: string;    // 'jira_epic', 'jira_story', 'jira_comment', 'jira_changelog'
  resourceId: string;      // External ID from source system
  data: unknown;           // Parsed JSON blob of fetched data
  fetchedAt: string;       // ISO 8601
}
```

**Invariants:**
- `(integrationId, resourceType, resourceId)` is unique
- Maximum **5000 entries per integration** (enforced by `IntegrationService` — prune oldest on overflow)
- TTL: **1 hour** from `fetchedAt`. Entries older than TTL are considered stale.
- Stale entries may still be used as fallback if a fresh fetch fails (with warning)

---

### Analysis

A single SWOT analysis run. Immutable after completion.

```ts
interface Analysis {
  id: string;              // UUID
  workspaceId: string;     // FK -> Workspace
  role: 'staff_engineer' | 'senior_em';
  modelId: string;         // OpenRouter model ID used
  status: 'pending' | 'running' | 'completed' | 'failed';
  config: AnalysisConfig;  // Which profiles, projects, and options were used
  inputSnapshot: AnonymizedPayload | null; // What was sent to the LLM
  swotOutput: SwotOutput | null;           // Structured SWOT result
  summariesOutput: SummariesOutput | null; // Per-source summaries
  rawLlmResponse: string | null;          // Full LLM response for debugging
  warning: string | null;                  // Non-fatal issues (e.g., stale cache used)
  error: string | null;                    // Error message if failed
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
}

interface AnalysisConfig {
  profileIds: string[];
  jiraProjectKeys: string[];
}

interface SwotOutput {
  strengths: SwotItem[];
  weaknesses: SwotItem[];
  opportunities: SwotItem[];
  threats: SwotItem[];
}

interface SwotItem {
  claim: string;
  evidence: EvidenceEntry[];
  impact: string;
  recommendation: string;
  confidence: 'high' | 'medium' | 'low';
}

interface EvidenceEntry {
  sourceType: 'profile' | 'jira';       // MVP: only these two. Phase 2+: 'confluence', 'github'
  sourceId: string;                      // ID of the source entity
  sourceLabel: string;                   // Human-readable label
  quote: string;                         // Relevant excerpt
}

interface SummariesOutput {
  profiles: string;  // Markdown summary
  jira: string;      // Markdown summary
}

interface AnonymizedPayload {
  profiles: AnonymizedProfile[];
  jiraData: unknown;
  pseudonymMap: Record<string, string>; // "Stakeholder A" -> real name (local only)
}

interface AnonymizedProfile {
  label: string;       // "Stakeholder A"
  role: string | null;
  team: string | null;
  concerns: string | null;
  priorities: string | null;
  quotes: string[];
  notes: string | null;
}
```

**Invariants:**
- Status transitions: `pending -> running -> completed | failed`
- Once `completed`, the analysis is **immutable** (no updates to output fields)
- Every `SwotItem` must have at least one `EvidenceEntry` (enforced by parser validation)
- Evidence `sourceId` must reference an entity in `inputSnapshot` (enforced by parser validation)
- `inputSnapshot` is stored for reproducibility and de-anonymization
- On app startup, any analyses still in `running` status are transitioned to `failed` with recovery message

---

### AnalysisProfile

Junction table tracking which profiles were included in an analysis and their anonymized labels.

```ts
interface AnalysisProfile {
  analysisId: string;      // FK -> Analysis
  profileId: string;       // FK -> Profile
  anonymizedLabel: string; // e.g., "Stakeholder A"
}
```

**Invariants:**
- `(analysisId, profileId)` is the composite primary key
- `anonymizedLabel` is deterministic within a run (alphabetical assignment)

---

### ChatMessage

A single message in a chat thread tied to an analysis.

```ts
interface ChatMessage {
  id: string;              // UUID
  analysisId: string;      // FK -> Analysis
  role: 'user' | 'assistant';
  content: string;         // Markdown content
  createdAt: string;       // ISO 8601
}
```

**Invariants:**
- Messages belong to exactly one analysis (one chat thread per analysis)
- Messages are append-only (no edits, no deletes in MVP)
- Content is stored as-is (markdown). Rendering happens in the renderer.

---

### Preferences

Simple key-value store for user preferences.

```ts
interface Preference {
  key: string;             // Primary key
  value: string;           // JSON-serialized value
}
```

**Known keys (MVP):**
- `selectedModelId` — OpenRouter model ID
- `lastWorkspaceId` — Last opened workspace
- `cacheTtlMinutes` — Cache TTL override (default: 60)

---

## Repository Interfaces

Each repository handles data access for one aggregate or entity. Repositories accept and return domain types, never raw SQL rows.

```ts
interface WorkspaceRepository {
  findById(id: string): Promise<Workspace | null>;
  findByPath(path: string): Promise<Workspace | null>;
  insert(path: string, name: string): Promise<Workspace>;
  updateLastOpened(id: string): Promise<void>;
  delete(id: string): Promise<void>;
}

interface ProfileRepository {
  findByWorkspace(workspaceId: string): Promise<Profile[]>;
  findById(id: string): Promise<Profile | null>;
  findByIds(ids: string[]): Promise<Profile[]>;
  insert(workspaceId: string, input: ProfileInput): Promise<Profile>;
  update(id: string, input: ProfileInput): Promise<Profile>;
  delete(id: string): Promise<void>;
  countByWorkspace(workspaceId: string): Promise<number>;
}

interface IntegrationRepository {
  findByWorkspaceAndProvider(workspaceId: string, provider: string): Promise<Integration | null>;
  upsert(workspaceId: string, provider: string, config: IntegrationConfig, status: string): Promise<Integration>;
  updateStatus(id: string, status: string): Promise<void>;
  updateLastSynced(id: string): Promise<void>;
  delete(id: string): Promise<void>;
}

interface IntegrationCacheRepository {
  find(integrationId: string, resourceType: string, resourceId: string): Promise<IntegrationCacheEntry | null>;
  findByIntegration(integrationId: string, resourceType: string): Promise<IntegrationCacheEntry[]>;
  upsert(integrationId: string, resourceType: string, resourceId: string, data: unknown): Promise<void>;
  deleteStale(integrationId: string, olderThan: string): Promise<number>;
  countByIntegration(integrationId: string): Promise<number>;
  pruneOldest(integrationId: string, keepCount: number): Promise<number>;
}

interface AnalysisRepository {
  findByWorkspace(workspaceId: string): Promise<Analysis[]>;
  findById(id: string): Promise<Analysis | null>;
  insert(analysis: Omit<Analysis, 'createdAt'>): Promise<Analysis>;
  updateStatus(id: string, status: string, fields?: Partial<Analysis>): Promise<void>;
  storeResult(id: string, output: { swotOutput: SwotOutput; summariesOutput: SummariesOutput; rawLlmResponse: string; warning?: string }): Promise<void>;
  delete(id: string): Promise<void>;
  findRunning(): Promise<Analysis[]>;

  // Junction: analysis_profiles
  insertProfiles(analysisId: string, profiles: AnalysisProfile[]): Promise<void>;
  findProfiles(analysisId: string): Promise<AnalysisProfile[]>;
}

interface ChatRepository {
  findByAnalysis(analysisId: string): Promise<ChatMessage[]>;
  findRecent(analysisId: string, limit: number): Promise<ChatMessage[]>;
  insert(analysisId: string, role: string, content: string): Promise<ChatMessage>;
}

interface PreferencesRepository {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
  getAll(): Promise<Record<string, string>>;
}
```

---

## Service Layer Summary

Services enforce business rules and orchestrate multi-repository operations.

| Service | Key Responsibilities |
|---|---|
| `ProfileService` | Enforce 25-profile limit, validate input, delegate to `ProfileRepository` |
| `IntegrationService` | Manage connection lifecycle, coordinate provider fetch + cache, enforce cache limits |
| `AnalysisService` | Orchestrate pipeline (collect -> preprocess -> prompt -> parse -> store), manage status transitions, handle recovery |
| `ChatService` | Assemble context (analysis + recent messages), token budget, delegate to LLM provider |
| `ExportService` | Read analysis from repo, generate markdown, write to workspace via FileSystem |
| `SettingsService` | Coordinate preferences repo + safeStorage for keys, model selection |

---

## Extension Points

These are designed to grow without breaking existing code:

- **New integration provider**: Add new provider type to `Integration.provider` union, implement provider class, register in `IntegrationService`. Repositories and cache work unchanged.
- **New evidence source type**: Add to `EvidenceEntry.sourceType` union. Parser and SWOT display handle it through the same structure.
- **New analysis output sections**: Add optional fields to `Analysis` (e.g., `themesOutput`, `rundownOutput`). Existing fields unchanged.
- **New export format**: Add method to `ExportService`. No upstream changes.
