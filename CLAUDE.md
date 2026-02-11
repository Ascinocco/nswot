# CLAUDE.md — nswot Project Conventions

## Project Overview

nswot is a local-first Electron desktop app that turns stakeholder interview notes and Jira signals into evidence-backed SWOT analyses. Primary user: staff engineers in org-level problem-solving roles.

**Current phase**: MVP (Phase 1) — profiles + Jira -> single-pass SWOT -> grounded chat -> markdown export.

## Documentation

- `docs/01-product-spec.md` — Canonical MVP product scope
- `docs/02-architecture-spec.md` — Canonical MVP architecture (layered: IPC -> Services -> Repositories -> Providers -> Infrastructure)
- `docs/03-sprints.md` — 6-week MVP sprint plan
- `docs/04-phases-roadmap.md` — Phase 1/2/3 roadmap
- `docs/05-domain-model.md` — Domain entities, invariants, relationships
- `docs/06-error-handling-strategy.md` — Error taxonomy, Result type, retry/circuit breaker policies
- `docs/07-testing-strategy.md` — Testing pyramid and scope
- `docs/08-prompt-engineering.md` — LLM prompt templates
- `docs/09-adr/` — Architecture Decision Records
- `docs/future/` — Post-MVP vision docs (preserved, not active)

## Tech Stack

- **Runtime**: Electron (main + renderer + preload)
- **Language**: TypeScript (strict mode)
- **Frontend**: React, React Router, React Query (TanStack Query)
- **Database**: SQLite via better-sqlite3 (main process only)
- **Validation**: Zod (renderer form validation only)
- **Build**: Vite (renderer), tsx (main process dev)
- **Package**: electron-builder
- **LLM**: OpenRouter via OpenAI-compatible SDK
- **Styling**: Tailwind CSS

## Architecture Patterns

### Layered Architecture (Main Process)

Dependencies flow downward only. Never import upward.

```
IPC Handlers -> Services -> Repositories / Providers -> Infrastructure
```

- **IPC Handlers** (`src/main/ipc/handlers/`): Transport only. Deserialize input, call service, serialize result. No business logic.
- **Services** (`src/main/services/`): Business rules, orchestration, validation. Services depend on repositories and providers.
- **Repositories** (`src/main/repositories/`): Data access. SQLite queries in, domain types out. No business logic.
- **Providers** (`src/main/providers/`): External API clients (Jira, OpenRouter). Handle auth, serialization, raw HTTP. Wrapped in circuit breaker + retry.
- **Infrastructure** (`src/main/infrastructure/`): Shared utilities — database connection, safeStorage, circuit breaker, retry, file system.
- **Domain** (`src/main/domain/`): Types, errors, Result type. No dependencies on anything else.

### Key Rules

1. **Renderer never touches fs, db, or network.** All access through preload bridge -> IPC -> main process.
2. **IPC handlers are thin.** Max ~10 lines. Call service, return IPCResult.
3. **Business rules live in services.** Example: 25-profile limit is enforced in ProfileService, not in the IPC handler or repository.
4. **Repositories return domain types**, not raw SQL rows. Mapping happens inside the repository.
5. **External calls are wrapped** in circuit breaker + retry. Never call a provider directly without resilience wrapping.
6. **All analysis writes are transactional.** Use SQLite transactions when storing analysis + junction records.

### Result Type

Use `Result<T, E>` for operations that can fail with domain-meaningful errors. Reserve throw/try-catch for truly unexpected errors (programmer bugs).

```ts
import { ok, err, Result } from '../domain/result';

// Service returns Result
async create(input: ProfileInput): Promise<Result<Profile, DomainError>>

// IPC handler converts Result to IPCResult
result.match({
  ok: (data) => ({ success: true, data }),
  err: (error) => ({ success: false, error: { code: error.code, message: error.message } }),
});
```

## Code Style

- **Naming**: `camelCase` for variables/functions, `PascalCase` for types/classes/components, `UPPER_SNAKE` for constants
- **Files**: `kebab-case.ts` for all files. Suffix with role: `.service.ts`, `.repository.ts`, `.provider.ts`, `.ipc.ts`
- **Imports**: Prefer relative imports within a layer. Use `../` for cross-layer imports (always downward).
- **No barrel exports**: Import directly from the file, not from `index.ts` re-exports.
- **Prefer `interface` over `type`** for object shapes. Use `type` for unions, intersections, and aliases.
- **No `any`**. Use `unknown` and narrow with type guards.
- **No `enum`**. Use `as const` objects or union types.

## Error Handling

- See `docs/06-error-handling-strategy.md` for full taxonomy
- Domain errors use typed error codes (e.g., `PROFILE_LIMIT`, `JIRA_AUTH_FAILED`, `LLM_PARSE_ERROR`)
- Circuit breaker errors: `CIRCUIT_OPEN` — means the external service is temporarily unavailable, don't retry
- Never swallow errors silently. Every error path should either: return a Result, emit to the user, or log with context.

## Testing

- See `docs/07-testing-strategy.md` for full strategy
- Unit tests: services, repositories (with in-memory SQLite), domain logic, anonymizer, parser
- Integration tests: IPC handlers with real service stack, analysis pipeline end-to-end
- Test files: co-located as `*.test.ts` next to source files
- Framework: Vitest

## Git Conventions

- Branch naming: `sprint-N/description` (e.g., `sprint-0/app-shell`)
- Commit messages: imperative mood, reference sprint if relevant
- No generated files committed (build output, `.nswot/` app data)

## Important Constraints

- **No PII sent to LLM.** All names/emails must be anonymized before prompt construction.
- **No writes outside workspace.** All fs operations validate resolved path starts with workspace root.
- **No secrets in SQLite or plaintext.** API keys and OAuth tokens go through safeStorage only.
- **No evidence, no claim.** SWOT items without concrete evidence are omitted or marked low confidence.
- **MVP scope only.** Do not implement Confluence, GitHub, themes editor, PDF/CSV export, or chat file generation. These are Phase 2+.
