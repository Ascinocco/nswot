# CLAUDE.md — nswot Project Conventions

## Project Overview

nswot is a local-first Electron desktop app that turns stakeholder interview notes and Jira signals into evidence-backed SWOT analyses. Primary user: staff engineers in org-level problem-solving roles.

**Current phase**: Phase 3e complete (Platform Maturity & Multi-Provider). Phases 1-3d complete. Phase 4 (Chat-Driven Agent Experience) planned next.

## Documentation

- `docs/01-product-spec.md` — Canonical MVP product scope
- `docs/02-architecture-spec.md` — Canonical MVP architecture (layered: IPC -> Services -> Repositories -> Providers -> Infrastructure)
- `docs/03-sprints.md` — 6-week MVP sprint plan
- `docs/04-phases-roadmap.md` — Phase 1/2/3/4 roadmap
- `docs/05-domain-model.md` — Domain entities, invariants, relationships
- `docs/06-error-handling-strategy.md` — Error taxonomy, Result type, retry/circuit breaker policies
- `docs/07-testing-strategy.md` — Testing pyramid and scope
- `docs/08-prompt-engineering.md` — LLM prompt templates
- `docs/09-adr/` — Architecture Decision Records
- `docs/10-phase2-sprints.md` — Phase 2 sprint plan (Confluence, GitHub, quality metrics)
- `docs/11-codebase-analysis-plan.md` — Codebase analysis via Claude CLI feature plan
- `docs/12-chat-actions-plan.md` — Chat actions via tool-use bridge feature plan
- `docs/13-ci-cd-and-release.md` — CI/CD workflow and release automation spec
- `docs/14-release-operations-runbook.md` — Release operations and failure triage runbook
- `docs/15-local-prerequisites-and-mcp-setup.md` — Local prerequisites and MCP setup commands
- `docs/16-parallel-sprint-plan.md` — Two-agent parallel execution plan for Sprints 13-21 (Phase 3b-3d)
- `docs/17-parallel-sprints-agents-plan.md` — Agent execution plans for parallel sprints
- `docs/18-phase4-chat-experience-plan.md` — Phase 4 chat-driven agent experience plan
- `docs/19-phase3e-sprint-plan.md` — Phase 3e parallelized sprint plan (Sprints 22-35)
- `docs/20-phase3e-agents-plan.md` — Phase 3e per-sprint agent execution instructions
- `docs/future/` — Post-MVP vision docs (preserved, not active)

## Tech Stack

- **Runtime**: Electron (main + renderer + preload)
- **Language**: TypeScript (strict mode)
- **Frontend**: React, React Router, React Query (TanStack Query)
- **Database**: SQLite via better-sqlite3 (main process only)
- **Validation**: Zod (renderer form validation only)
- **Build**: Vite (renderer), tsx (main process dev)
- **Package**: electron-builder
- **LLM**: Multi-provider — OpenRouter (default) or direct Anthropic API, selected via `LLMProvider` interface + factory
- **Codebase Analysis**: Multi-provider — Claude CLI (default) or OpenCode, selected via `CodebaseProviderInterface` + factory
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
- **Providers** (`src/main/providers/`): External API clients (Jira, Confluence, GitHub, OpenRouter, Anthropic, Claude CLI, OpenCode). Handle auth, serialization, raw HTTP/subprocess. Wrapped in circuit breaker + retry. LLM providers implement `LLMProvider` interface; codebase providers implement `CodebaseProviderInterface`.
- **Infrastructure** (`src/main/infrastructure/`): Shared utilities — database connection, safeStorage, circuit breaker, retry, file system, structured logger, file watcher.
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
- **Current scope: Phase 3 complete, Phase 4 next.** Phases 1-3e are complete. Phase 4 transforms nswot into a chat-primary agent experience: "Chat Analysis" replaces the Analysis + History pages, conversations are first-class entities (browse, resume, delete), config-to-chat happens on one page, pipeline progress is visible, and LLM thinking/reasoning is displayed. Agent harness with tool registry (render/read/write) drives multi-turn interactions. Sprints 36–41 with two-agent parallel execution. See `docs/18-phase4-chat-experience-plan.md` and `docs/04-phases-roadmap.md`.
- **Structured logging.** Use `Logger` singleton (`src/main/infrastructure/logger.ts`) — `logger.info()`, `logger.warn()`, `logger.error()`, `logger.debug()`. Logs to console and `~/.nswot/logs/nswot-YYYY-MM-DD.log` with daily rotation.
- **Multi-provider pattern.** LLM and codebase providers are selected via factory based on user preference. Add new providers by implementing `LLMProvider` or `CodebaseProviderInterface` and registering in the factory. Provider type stored as preference (`llmProviderType`, `codebaseProviderType`).
