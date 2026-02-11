# ADR-005: Repository-Service Layering Pattern

**Status**: Accepted
**Date**: 2025-02-10
**Context**: Choosing the code organization pattern for the main process

---

## Decision

The main process uses a **layered architecture** with explicit separation between IPC handlers, services, repositories, providers, and infrastructure. This is the primary structural pattern for maintaining separation of concerns.

---

## Context

Electron apps commonly put business logic directly in IPC handlers or in monolithic "service" files that mix data access, business rules, and external API calls. This works for small apps but becomes unmaintainable as complexity grows.

nswot's main process needs to:
- Manage multiple data entities (profiles, analyses, integrations, chat)
- Orchestrate a multi-stage analysis pipeline
- Call external APIs (Jira, OpenRouter) with resilience patterns
- Enforce business rules (profile limits, evidence validation, workspace scoping)
- Handle transactions (analysis storage writes to multiple tables)

We evaluated:
1. **Flat services** — one service file per feature, mixing all concerns
2. **Repository-Service layering** (chosen) — explicit layers with clear responsibilities
3. **Full DDD** — aggregates, value objects, domain events, bounded contexts

---

## Rationale

### Why not flat services

A flat `database.service.ts` that handles all CRUD + business logic:
- Becomes a god file (1000+ lines by Sprint 4)
- Mixes SQL queries with business rules (e.g., profile count check next to `INSERT` statement)
- Hard to test (need real database for every business logic test)
- Hard to extend (adding Confluence means touching the same files that handle Jira)

### Why Repository-Service layering

- **Clear boundaries**: Each layer has one job. Repositories = data access. Services = business rules. Providers = external APIs. IPC handlers = transport.
- **Testability**: Services can be tested with mocked repositories (no database needed). Repositories can be tested with in-memory SQLite (no services needed).
- **Extensibility**: Adding Confluence in Phase 2 means adding a `ConfluenceProvider` and registering it. The `IntegrationService` orchestrates without knowing Confluence-specific details.
- **Right-sized for the project**: Not as heavy as full DDD (no aggregate roots, no domain events, no bounded contexts). Just enough structure to keep things clean.

### Why not full DDD

- **Overkill for single-user desktop app**: DDD shines in distributed systems with multiple bounded contexts. nswot is a single process with a single user.
- **No domain events needed**: There's no event bus, no async subscribers, no eventual consistency. Everything is request/response.
- **Value objects add ceremony without value**: For the data shapes in nswot, plain interfaces are sufficient.

---

## Layer Details

### IPC Handlers (`src/main/ipc/handlers/`)

**Responsibility**: Transport only. Deserialize input, call service, serialize response.

**Rules:**
- Max ~10 lines per handler
- No `if` statements (no business logic)
- Always return `IPCResult<T>`
- Convert service `Result<T, E>` to `IPCResult<T>` using `match`

### Services (`src/main/services/`)

**Responsibility**: Business logic, orchestration, validation.

**Rules:**
- One service per aggregate (ProfileService, AnalysisService, etc.)
- Services depend on repositories (for data access) and providers (for external calls)
- Services never import from other services (avoids circular dependencies). If coordination is needed, the IPC handler calls multiple services, or a dedicated orchestration service is created.
- Return `Result<T, DomainError>` for expected failures
- Throw only for unexpected/programmer errors

### Repositories (`src/main/repositories/`)

**Responsibility**: Data access. SQL in, domain types out.

**Rules:**
- One repository per table (or closely related table group)
- Accept and return domain types (defined in `domain/types.ts`), never raw SQL row objects
- JSON serialization/deserialization happens inside the repository
- No business logic (no "if count >= 25" checks — that's the service's job)
- May accept a transaction object for multi-table atomic writes

### Providers (`src/main/providers/`)

**Responsibility**: External API clients.

**Rules:**
- One provider per external system (JiraProvider, OpenRouterProvider)
- Handle auth, request construction, response parsing
- Throw typed errors (which services catch and wrap into `Result`)
- Do NOT handle retry or circuit breaking (that's the infrastructure layer, applied by the service)
- Each provider has its own types file for API-specific shapes

### Infrastructure (`src/main/infrastructure/`)

**Responsibility**: Shared utilities that services and providers depend on.

**Includes:**
- `database.ts` — SQLite connection, migration runner, transaction helper
- `safe-storage.ts` — Electron safeStorage wrapper
- `circuit-breaker.ts` — Generic circuit breaker
- `retry.ts` — Generic retry with exponential backoff
- `file-system.ts` — Workspace-scoped fs operations with path validation

### Domain (`src/main/domain/`)

**Responsibility**: Types, errors, and the Result type. Zero dependencies on any other layer.

**Includes:**
- `types.ts` — All domain entity interfaces (Profile, Analysis, SwotItem, etc.)
- `errors.ts` — DomainError class and error codes
- `result.ts` — Result<T, E> type with ok/err/match

---

## Dependency Rules

```text
domain        <- depends on nothing
infrastructure <- depends on domain (for types)
repositories  <- depends on domain, infrastructure (database)
providers     <- depends on domain, infrastructure (circuit breaker, retry)
services      <- depends on domain, repositories, providers
ipc/handlers  <- depends on domain, services
analysis/     <- depends on domain, repositories, providers, services
```

**Never:**
- Repository imports service
- Provider imports service
- Infrastructure imports service or repository
- Domain imports anything

---

## Consequences

**Positive:**
- Clear responsibility boundaries prevent god files
- Each layer is independently testable
- Adding new integrations (Confluence, GitHub) follows a predictable pattern
- Business rules are consolidated and auditable

**Negative:**
- More files than a flat structure (5-6 files per feature vs 1-2)
- Indirection: tracing a request through 4 layers requires following the call chain
- Some boilerplate in simple CRUD paths (IPC -> service -> repository for a basic read)

**Mitigations:**
- The file count is manageable for a 6-week MVP (estimated ~40 files in main process)
- Consistent naming conventions (`.ipc.ts`, `.service.ts`, `.repository.ts`, `.provider.ts`) make navigation predictable
- For simple CRUD with no business rules, services can be thin pass-through wrappers. They exist for the seam, not for ceremony. Don't add logic that isn't needed.

---

## Example: Adding Confluence in Phase 2

Following this pattern, adding Confluence requires:

1. **Provider**: Create `src/main/providers/confluence/confluence.provider.ts` — API client
2. **Types**: Add Confluence types to `domain/types.ts` or `confluence.types.ts`
3. **Repository**: `IntegrationCacheRepository` already handles any `resource_type` — no changes
4. **Service**: Update `IntegrationService` to register the Confluence provider. Update `AnalysisService` to include Confluence data in the collect step.
5. **IPC**: Add Confluence-specific IPC handlers if needed, or reuse generic integration handlers
6. **Renderer**: Add `ConfluenceSetup` component

No existing provider, repository, or infrastructure code changes. The layering isolates the change.
