# nswot - Error Handling Strategy

This document defines how errors are categorized, propagated, and surfaced across the application layers.

---

## Principles

1. **Errors are values, not exceptions.** Use `Result<T, E>` for expected failure paths. Reserve `throw` for programmer bugs.
2. **Every error has a code.** Typed error codes enable the renderer to show specific UI without parsing messages.
3. **Errors surface to the user.** No silent swallowing. Every error path either returns a Result, shows UI feedback, or logs with full context.
4. **External failures are isolated.** Circuit breakers prevent one flaky service from cascading through the app.
5. **Errors are actionable.** User-facing messages include what went wrong and what to do next.

---

## Result Type

```ts
// src/main/domain/result.ts

type Result<T, E = DomainError> =
  | { ok: true; value: T }
  | { ok: false; error: E };

function ok<T>(value: T): Result<T, never> {
  return { ok: true, value };
}

function err<E>(error: E): Result<never, E> {
  return { ok: false, error };
}

// Pattern matching helper
function match<T, E, R>(
  result: Result<T, E>,
  handlers: { ok: (value: T) => R; err: (error: E) => R },
): R {
  return result.ok ? handlers.ok(result.value) : handlers.err(result.error);
}
```

**Usage rules:**
- Services return `Result<T, DomainError>` for operations that can fail with business-meaningful errors
- Repositories may throw on unexpected database errors (caught by service layer)
- Providers may throw on network/parse errors (caught by circuit breaker or service layer)
- IPC handlers convert `Result` to `IPCResult` for transport

---

## Domain Error Type

```ts
// src/main/domain/errors.ts

class DomainError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'DomainError';
  }
}
```

---

## Error Taxonomy

### User Errors (4xx-equivalent)

Caused by invalid user input or configuration. User can fix these.

| Code | Layer | Trigger | User Message |
|---|---|---|---|
| `PROFILE_LIMIT` | ProfileService | Creating 26th profile | "Maximum 25 profiles per workspace. Delete a profile to add a new one." |
| `PROFILE_NOT_FOUND` | ProfileService | Referencing deleted/invalid profile | "Profile not found. It may have been deleted." |
| `PROFILE_VALIDATION` | ProfileService | Missing required fields | "Profile name is required." (field-specific) |
| `WORKSPACE_NOT_FOUND` | WorkspaceRepository | Opening a deleted directory | "Workspace directory not found. It may have been moved or deleted." |
| `WORKSPACE_PATH_INVALID` | FileSystem | Path traversal or outside workspace | "File path is outside the workspace directory." |
| `SETTINGS_KEY_MISSING` | SettingsService | Running analysis without API key | "OpenRouter API key is required. Set it in Settings." |
| `SETTINGS_MODEL_MISSING` | SettingsService | Running analysis without model selected | "Select an LLM model in Settings before running analysis." |
| `ANALYSIS_NO_PROFILES` | AnalysisService | Running with 0 profiles selected | "Select at least one profile to include in the analysis." |
| `ANALYSIS_NO_JIRA` | AnalysisService | Running with no Jira data available | "Connect Jira and select at least one project before running analysis." |
| `IMPORT_PARSE_ERROR` | ProfileService | Malformed markdown profile | "Could not parse profile from {filename}. Check the markdown format." |

### Integration Errors (External Service)

Caused by external service issues. App handles gracefully.

| Code | Layer | Trigger | User Message |
|---|---|---|---|
| `JIRA_AUTH_FAILED` | JiraProvider | OAuth token expired/invalid | "Jira authentication failed. Please reconnect." |
| `JIRA_RATE_LIMITED` | JiraProvider | 429 response | "Jira rate limit reached. Waiting before retry..." |
| `JIRA_FETCH_FAILED` | JiraProvider | Network error or 5xx | "Could not reach Jira. Using cached data if available." |
| `JIRA_PROJECT_NOT_FOUND` | JiraProvider | Selected project deleted/moved | "Jira project {key} not found. It may have been deleted." |
| `LLM_AUTH_FAILED` | OpenRouterProvider | Invalid API key | "OpenRouter API key is invalid. Check your key in Settings." |
| `LLM_RATE_LIMITED` | OpenRouterProvider | 429 response | "LLM rate limit reached. Waiting before retry..." |
| `LLM_MODEL_UNAVAILABLE` | OpenRouterProvider | Model removed/down | "Model {id} is unavailable. Select a different model in Settings." |
| `LLM_CONTEXT_EXCEEDED` | OpenRouterProvider | Payload too large | "Analysis data exceeds the model's context window. Try selecting fewer profiles or projects." |
| `LLM_REQUEST_FAILED` | OpenRouterProvider | Network error or 5xx | "Could not reach LLM service. Check your internet connection." |
| `CIRCUIT_OPEN` | CircuitBreaker | Too many recent failures | "{service} is temporarily unavailable due to repeated failures. Try again in a minute." |

### LLM Output Errors

Caused by unpredictable LLM responses. App retries once, then fails gracefully.

| Code | Layer | Trigger | User Message |
|---|---|---|---|
| `LLM_PARSE_ERROR` | ResponseParser | Malformed JSON from LLM | "LLM returned an unexpected format. Retrying with corrective prompt..." |
| `LLM_PARSE_FAILED` | ResponseParser | Second parse failure | "Could not parse LLM response after retry. Raw response saved for debugging." |
| `LLM_EVIDENCE_INVALID` | ResponseParser | Evidence IDs don't match input | "LLM referenced data not in the input. Items without valid evidence were marked low confidence." |
| `LLM_EMPTY_RESPONSE` | ResponseParser | Empty or null response | "LLM returned an empty response. This may indicate a model issue. Try a different model." |

### System Errors (Unexpected)

Bugs or environmental issues. Logged with full context.

| Code | Layer | Trigger | User Message |
|---|---|---|---|
| `DB_ERROR` | Infrastructure | SQLite failure | "A database error occurred. Try restarting the app." |
| `FS_PERMISSION_DENIED` | FileSystem | Can't read/write workspace file | "Permission denied for {path}. Check file permissions." |
| `FS_NOT_FOUND` | FileSystem | File deleted externally | "File not found: {path}. It may have been deleted outside the app." |
| `INTERNAL_ERROR` | Any | Unhandled exception | "An unexpected error occurred. Please restart the app." |

---

## Error Flow Through Layers

```text
Provider/Repository
  │ throws or returns error
  ▼
Service Layer
  │ catches, wraps in Result<T, DomainError>
  │ applies business rules (retry? fallback? fail?)
  ▼
IPC Handler
  │ converts Result to IPCResult
  │ { success: false, error: { code, message } }
  ▼
Preload Bridge
  │ passes IPCResult as-is
  ▼
React Query Hook
  │ maps success:false to thrown error
  │ error.code available for conditional UI
  ▼
Component
  │ renders error state based on error.code
  │ shows user message + action (retry, reconfigure, dismiss)
```

---

## Circuit Breaker Configuration

```ts
interface CircuitBreakerConfig {
  failureThreshold: number;  // failures before opening (default: 5)
  cooldownMs: number;        // time in OPEN state before HALF_OPEN probe (default: 60_000)
  monitorWindowMs: number;   // rolling window for failure count (default: 120_000)
}

// Per-provider instances:
const jiraCircuitBreaker = new CircuitBreaker({ failureThreshold: 5, cooldownMs: 60_000 });
const llmCircuitBreaker = new CircuitBreaker({ failureThreshold: 3, cooldownMs: 30_000 });
```

**Which errors trip the circuit:**
- Network timeouts
- 5xx responses
- Connection refused

**Which errors do NOT trip the circuit:**
- 4xx responses (client errors — auth, validation, not found)
- Parse errors (LLM response format issues)

---

## Retry Configuration

```ts
interface RetryConfig {
  maxRetries: number;        // default: 3
  baseDelayMs: number;       // default: 1000
  maxDelayMs: number;        // default: 10_000
  jitter: boolean;           // default: true (adds random 0-500ms)
}
```

**Retryable conditions:**
- Network timeout / connection reset
- HTTP 429 (Too Many Requests) — respect `Retry-After` header
- HTTP 503 (Service Unavailable)

**Non-retryable conditions:**
- HTTP 401/403 (auth errors — need user action)
- HTTP 404 (not found — resource doesn't exist)
- HTTP 400 (bad request — our fault)
- Circuit open (fail fast)

---

## Logging Strategy

All errors are logged with structured context to `~/.nswot/logs/main.log`.

```ts
interface LogEntry {
  timestamp: string;
  level: 'error' | 'warn' | 'info' | 'debug';
  code: string;
  message: string;
  context?: Record<string, unknown>; // e.g., { workspaceId, analysisId, provider }
  stack?: string;
}
```

**Log rotation:** Max 10MB per file, keep 3 rotated files.

**What to log:**
- All errors with `error` level (includes code, message, stack, context)
- Circuit state transitions with `warn` level
- Retry attempts with `info` level
- Cache hits/misses with `debug` level

**What NOT to log:**
- PII (names, emails) — use anonymized labels
- API keys or tokens
- Full LLM prompts/responses (stored in analysis record instead)

---

## Renderer Error Handling

### React Query Error Mapping

```ts
// In each hook, map IPCResult to throw on failure
const { data, error } = useQuery({
  queryKey: ['profiles', workspaceId],
  queryFn: async () => {
    const result = await window.nswot.profiles.list();
    if (!result.success) throw new AppError(result.error.code, result.error.message);
    return result.data;
  },
});
```

### Error Boundaries

Each major panel (file browser, editor, chat, analysis) gets its own React error boundary. A crash in the chat pane doesn't take down the file browser.

### Error States by Category

| Error Code Pattern | UI Treatment |
|---|---|
| `*_NOT_FOUND` | Empty state with explanation |
| `*_AUTH_FAILED` | Banner with "Reconnect" action |
| `*_RATE_LIMITED` | Toast with countdown timer |
| `CIRCUIT_OPEN` | Banner with "service unavailable, retry in X seconds" |
| `LLM_PARSE_*` | Analysis view shows partial results + warning banner |
| `SETTINGS_*_MISSING` | Redirect to settings with highlight on missing field |
| `INTERNAL_ERROR` | Error boundary fallback with "Restart" action |
