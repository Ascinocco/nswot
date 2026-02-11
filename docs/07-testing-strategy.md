# nswot - Testing Strategy

This document defines what gets tested, how, and at what level of the architecture.

---

## Principles

1. **Test behavior, not implementation.** Tests verify what a service does, not how it does it internally.
2. **Each layer gets the right kind of test.** Unit tests for pure logic, integration tests for cross-layer flows, E2E for the full user loop.
3. **Tests run fast.** Unit tests use in-memory SQLite. No real network calls in any test. No Electron launch in unit/integration tests.
4. **Tests are co-located.** `foo.service.ts` has `foo.service.test.ts` next to it.
5. **MVP test coverage is focused.** Cover the critical path (analysis pipeline, data integrity, security boundaries). Don't test trivial getters.

---

## Framework

- **Test runner**: Vitest
- **Assertions**: Vitest built-in (`expect`)
- **Mocking**: Vitest mocking (`vi.fn()`, `vi.mock()`)
- **SQLite for tests**: In-memory `better-sqlite3` (`:memory:`) with migrations applied

---

## Testing Pyramid

```text
        ┌─────────┐
        │   E2E   │   Few — full Electron app, real user flows
        │  tests  │   (Sprint 5, after MVP is integrated)
        ├─────────┤
        │  Integ  │   Moderate — IPC handlers + real service stack
        │  tests  │   with in-memory SQLite
        ├─────────┤
        │  Unit   │   Many — services, repositories, domain logic,
        │  tests  │   anonymizer, parser, circuit breaker, retry
        └─────────┘
```

---

## Layer-by-Layer Test Scope

### Domain Layer (Unit Tests)

**What to test:**
- `Result` type: `ok()`, `err()`, `match()` behavior
- `DomainError`: construction, code and message propagation
- Domain type validation helpers (if any)

**How:**
- Pure function tests, no mocks needed

---

### Infrastructure Layer (Unit Tests)

**What to test:**

**Circuit Breaker (`circuit-breaker.ts`)**
- Starts in CLOSED state
- Opens after `failureThreshold` failures
- Rejects calls immediately when OPEN
- Transitions to HALF_OPEN after cooldown
- Closes on successful probe in HALF_OPEN
- Reopens on failed probe in HALF_OPEN
- Failure count resets on success in CLOSED
- Only counts configured error types (not 4xx)

**Retry (`retry.ts`)**
- Retries up to `maxRetries` on retryable errors
- Applies exponential backoff between retries
- Respects `Retry-After` header
- Does not retry on non-retryable errors (401, 403, 404)
- Does not retry when circuit is open
- Returns the successful result if retry succeeds
- Returns the last error if all retries exhausted

**Database (`database.ts`)**
- Migrations apply in order
- Migration idempotency (re-running doesn't error)
- Transaction commit and rollback behavior

**FileSystem (`file-system.ts`)**
- Rejects paths outside workspace root
- Rejects path traversal attempts (`../`, symlinks)
- `readDir` ignores configured patterns (`.git`, `node_modules`)
- `writeFile` creates intermediate directories

**How:**
- Circuit breaker and retry: use fake async functions that succeed/fail on demand
- Database: use `:memory:` SQLite
- FileSystem: use a temp directory created per test

---

### Repository Layer (Unit Tests with In-Memory DB)

**What to test per repository:**
- `insert` creates a record and returns it with generated ID
- `findById` returns null for non-existent ID
- `findById` returns the correct record
- `findByWorkspace` returns only records for that workspace
- `update` modifies fields and updates `updatedAt`
- `delete` removes the record
- Cascade deletes work (e.g., deleting workspace deletes profiles)
- JSON fields are serialized/deserialized correctly (`interviewQuotes`, `config`, etc.)

**Specific repository tests:**

| Repository | Specific Tests |
|---|---|
| `ProfileRepository` | `countByWorkspace` returns accurate count |
| `IntegrationCacheRepository` | `upsert` updates existing entry, `pruneOldest` removes correct entries |
| `AnalysisRepository` | `findRunning` returns only `running` status, `storeResult` writes all output fields atomically |
| `ChatRepository` | `findRecent` respects limit, messages ordered by `createdAt` |

**How:**
- Create a fresh `:memory:` SQLite database per test (or per test file with cleanup)
- Apply all migrations
- No mocks — these are integration tests against real SQLite

---

### Service Layer (Unit Tests with Mocked Dependencies)

**What to test:**

**ProfileService**
- `create` succeeds when under 25 profiles
- `create` returns `PROFILE_LIMIT` error at 25 profiles
- `create` validates required fields (name non-empty)
- `update` returns `PROFILE_NOT_FOUND` for invalid ID
- `delete` returns `PROFILE_NOT_FOUND` for invalid ID
- `importFromMarkdown` parses valid markdown correctly
- `importFromMarkdown` returns `IMPORT_PARSE_ERROR` for invalid markdown

**IntegrationService**
- Uses cached data when cache is fresh
- Fetches fresh data when cache is stale
- Falls back to stale cache when fetch fails (with warning)
- Prunes cache when over 5000 entries
- Updates integration status on auth success/failure

**AnalysisService**
- Returns `ANALYSIS_NO_PROFILES` when no profiles selected
- Returns `SETTINGS_KEY_MISSING` when API key not set
- Pipeline stages execute in order (collect -> preprocess -> prompt -> parse -> store)
- Failed analysis stores error message and transitions to `failed`
- Recovery: identifies and marks `running` analyses as `failed` on startup
- Stores results in a single transaction

**ChatService**
- Assembles context from analysis output + recent messages
- Respects token budget (trims oldest messages first)
- Persists both user and assistant messages

**ExportService**
- Generates valid markdown with all SWOT sections
- Includes role, model, confidence, evidence citations

**How:**
- Mock repositories and providers using `vi.fn()`
- Test business logic in isolation
- Verify correct calls to dependencies

---

### Analysis Pipeline (Unit Tests)

**Anonymizer (`anonymizer.ts`)**
- Replaces all names with "Stakeholder A", "Stakeholder B", etc.
- Replaces emails with anonymized placeholders
- Handles names appearing in quotes and notes (not just the name field)
- Produces a stable pseudonym map (same input always gets same label)
- Handles edge cases: empty strings, null fields, names as substrings

**Preprocessor (`preprocessor.ts`)**
- Ranks Jira records by recency
- Trims data to fit within token budget
- Token estimation is within 20% of actual (rough chars/4 check)
- Produces valid `PreprocessedData` shape

**Prompt Builder (`prompt-builder.ts`)**
- Includes role context in prompt
- Includes anonymized profile data
- Includes Jira summaries
- Includes output schema instructions
- Corrective prompt includes original + error description

**Response Parser (`response-parser.ts`)**
- Parses valid JSON response into `SwotOutput`
- Returns `LLM_PARSE_ERROR` for malformed JSON
- Returns `LLM_EVIDENCE_INVALID` when evidence IDs don't match input
- Returns `LLM_EMPTY_RESPONSE` for empty/null response
- Handles partial output (some quadrants valid, some not)
- Extracts JSON from markdown code fences if LLM wraps it

**How:**
- Use fixture data (sample profiles, sample Jira responses, sample LLM outputs)
- Test each pipeline stage independently
- Test error paths with deliberately malformed inputs

---

### Provider Layer (Unit Tests with HTTP Mocking)

**What to test:**

**JiraProvider**
- Constructs correct API URLs and headers
- Handles pagination (follows `nextPage` links)
- Parses Jira response format into domain types
- Throws on 401 (auth failed)
- Throws on 429 (rate limited) with `Retry-After` preserved
- Throws on 5xx (server error)

**OpenRouterProvider**
- Constructs correct request body (messages, model, stream flag)
- Parses streaming response chunks
- Throws on 401 (invalid key)
- Throws on 429 (rate limited)
- Throws on model-specific errors (context exceeded, model unavailable)

**How:**
- Mock HTTP calls (mock the `fetch` function or use a lightweight HTTP mock)
- Use real Jira/OpenRouter response fixtures for parse testing
- No real network calls

---

### IPC Handler Layer (Integration Tests)

**What to test:**
- Handler correctly deserializes input and calls the service
- Handler converts service `Result` to `IPCResult`
- Handler converts `DomainError` to `{ success: false, error: { code, message } }`
- Handler converts unexpected exceptions to `INTERNAL_ERROR`
- Streaming handlers emit progress events correctly

**How:**
- Use real service stack with in-memory SQLite
- Mock only external providers (Jira, OpenRouter)
- Call handlers directly (no Electron IPC transport needed)

---

### Renderer (Unit Tests)

**What to test:**
- React Query hooks correctly call IPC and handle success/error
- Form components validate with Zod schemas
- SWOT display renders all four quadrants
- SwotItem renders evidence, confidence badge, recommendation
- Error states render appropriate messages based on error code
- Loading states render skeletons

**How:**
- React Testing Library
- Mock `window.nswot` (preload API)
- No real IPC calls

---

### E2E Tests

**What to test (critical paths only):**
1. Open workspace -> create profile -> run analysis -> see SWOT -> export markdown
2. Connect Jira -> fetch projects -> select projects -> verify data appears in analysis
3. Run analysis -> open chat -> ask follow-up -> see grounded response
4. Error recovery: run analysis with invalid API key -> see error -> fix key -> re-run succeeds

**How:**
- Electron testing framework (Playwright or Spectron)
- Mock external APIs at the network level (intercept HTTP)
- Use a fixture workspace directory
- Run as part of CI/release, not on every commit

---

## Test Fixtures

Store shared fixtures in `src/test/fixtures/`:

```text
src/test/
  fixtures/
    profiles.ts          # Sample ProfileInput objects
    jira-responses.ts    # Sample Jira API response JSON
    llm-responses.ts     # Sample OpenRouter/LLM response JSON (valid + malformed)
    analysis-output.ts   # Sample SwotOutput objects
  helpers/
    test-db.ts           # Create in-memory SQLite with migrations applied
    test-providers.ts    # Mock provider factories
```

---

## Coverage Targets (MVP)

| Layer | Target | Rationale |
|---|---|---|
| Domain | 100% | Small, critical, pure logic |
| Infrastructure | 90%+ | Circuit breaker and retry correctness is essential |
| Repositories | 90%+ | Data integrity is critical |
| Services | 90%+ | Business rules must be verified |
| Analysis pipeline | 95%+ | Core product value — parser and anonymizer especially |
| Providers | 80%+ | HTTP mocking covers main paths |
| IPC Handlers | 70%+ | Thin layer, tested indirectly through integration tests |
| Renderer hooks | 70%+ | Error/loading state handling matters |
| Renderer components | 50%+ | Focus on SWOT display and error states |
| E2E | Critical paths only | 4-5 tests covering the full loop |

---

## When to Write Tests

- **Sprint 0**: Infrastructure utilities (circuit breaker, retry, Result type), test setup (test-db helper)
- **Sprint 1**: Repository tests, SettingsService tests
- **Sprint 2**: ProfileRepository tests, ProfileService tests, FileSystem tests
- **Sprint 3**: JiraProvider tests, IntegrationService tests, IntegrationCacheRepository tests
- **Sprint 4**: Full analysis pipeline tests (anonymizer, preprocessor, prompt builder, parser), AnalysisService tests
- **Sprint 5**: ChatService tests, ExportService tests, E2E critical path tests
