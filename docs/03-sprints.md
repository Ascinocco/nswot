# nswot - MVP Sprint Plan

> **Canonical sprint plan for current development (6 weeks).** Full 13-week plan is preserved in `docs/future/full-sprint-plan.md`.
> Phase 2 and Phase 3 sprints will be planned after MVP ships, based on user feedback.

All sprints are **1 week** and assume a single developer.
Goal: deliver the smallest trustworthy version of nswot in **6 weeks**.

---

## Scope Guardrails

Only ship these in MVP:

- Profiles + Jira inputs
- One-pass SWOT analysis with citations and confidence
- Analysis-grounded chat (no tool actions)
- Markdown export
- macOS-first packaging

Everything else moves to Phase 2+.

---

## Sprint 0 - App Shell and Security Baseline

**Goal**: runnable Electron app with secure defaults, typed bridge, and layered architecture scaffold.

- [ ] Electron + Vite + React + TypeScript scaffold
- [ ] Folder structure: `src/main` (ipc/, services/, repositories/, providers/, domain/, infrastructure/, analysis/, db/), `src/preload`, `src/renderer`
- [ ] Hardening defaults: `nodeIntegration: false`, `contextIsolation: true`, `sandbox: true`, CSP
- [ ] Typed preload bridge with smoke-test channel
- [ ] Route shell: workspace, profiles, integrations, settings, analysis, history
- [ ] Local app data directory bootstrap (`~/.nswot/`)
- [ ] `Result<T, E>` type in `domain/result.ts`
- [ ] `DomainError` base class in `domain/errors.ts`
- [ ] Circuit breaker utility in `infrastructure/circuit-breaker.ts`
- [ ] Retry utility in `infrastructure/retry.ts`

**Deliverable**: app opens reliably, secure IPC plumbing is established, infrastructure utilities are available.

---

## Sprint 1 - Data and Settings Foundation

**Goal**: persistence + key management + model configuration working end-to-end through the full layer stack.

- [ ] SQLite setup (`better-sqlite3`) in `infrastructure/database.ts` with migration runner
- [ ] Initial migration: `workspace`, `profiles`, `integrations`, `integration_cache`, `analyses`, `analysis_profiles`, `chat_messages`, `preferences`
- [ ] `PreferencesRepository` and `WorkspaceRepository`
- [ ] `SettingsService` (wraps preferences repo + safeStorage)
- [ ] `safeStorage` wrapper in `infrastructure/safe-storage.ts`
- [ ] Settings IPC handlers: set/get OpenRouter key and preferences
- [ ] OpenRouter models fetch (through provider, wrapped in circuit breaker)
- [ ] React Query base setup and error mapping pattern
- [ ] Settings UI: API key input, model picker, persist across restarts

**Deliverable**: settings persist across restarts; API key and model selection work end-to-end through repos/services/IPC.

---

## Sprint 2 - Workspace and Profiles

**Goal**: user can open workspace, browse/edit files, and manage profiles with business rules enforced at the service layer.

- [ ] Workspace picker and `WorkspaceRepository` persisted record
- [ ] `FileSystem` infrastructure: `readDir`, `readFile`, `writeFile` with strict workspace path validation
- [ ] File browser + basic text editor panel
- [ ] `ProfileRepository` (CRUD, count by workspace)
- [ ] `ProfileService` (enforces 25-profile limit, validates input)
- [ ] Profile IPC handlers (thin, delegate to service)
- [ ] Profile CRUD UI with Zod validation
- [ ] Optional markdown profile import from `profiles/*.md`

**Deliverable**: user can prepare stakeholder profile inputs in-app. Business rules enforced at service layer.

---

## Sprint 3 - Jira Integration (MVP Only)

**Goal**: connect Jira Cloud and fetch selected project data with caching, circuit breaker, and retry.

- [ ] `JiraProvider`: OAuth flow via local callback server, project list, epics/stories/comments/changelog fetch with pagination
- [ ] Token persistence in `safeStorage`
- [ ] Circuit breaker instance wrapping all Jira provider calls
- [ ] Retry with backoff respecting `Retry-After`
- [ ] `IntegrationRepository` and `IntegrationCacheRepository`
- [ ] `IntegrationService`: manages connection lifecycle, delegates fetch to provider, caches via repository
- [ ] Cache layer with 1-hour TTL, max 5000 entries, stale fallback with warning
- [ ] Jira project selection UI and connection status

**Deliverable**: user can connect Jira and pull analysis-ready data. External calls are resilient.

---

## Sprint 4 - Analysis Core Loop

**Goal**: first trustworthy SWOT output from profiles + Jira.

- [ ] `AnalysisRepository` (CRUD, store snapshots, junction records)
- [ ] `AnalysisService` (orchestrates pipeline, manages status transitions)
- [ ] Analysis pipeline stages:
  - [ ] Collect: selected profiles (via repo) + Jira data (via cache/provider)
  - [ ] Preprocess: anonymize names/emails, rank/trim, token budgeting
  - [ ] Payload preview UI before send
  - [ ] Prompt: single-pass template for structured SWOT output (via OpenRouter provider, wrapped in circuit breaker)
  - [ ] Parse + validate output schema
  - [ ] Evidence validation: every item has evidence, IDs exist in snapshot
  - [ ] Store: full run in single transaction (unit of work)
- [ ] Progress events streaming to renderer at each stage
- [ ] Analysis history view
- [ ] Recovery: mark stale `running` analyses as `failed` on app launch

**Deliverable**: repeatable run produces structured SWOT with evidence and confidence. Pipeline is resilient and recoverable.

---

## Sprint 5 - Grounded Chat, Markdown Export, Polish

**Goal**: complete the MVP user loop and package macOS build.

- [ ] `ChatRepository` (message persistence per analysis)
- [ ] `ChatService` (context assembly: analysis output + recent messages, token budgeting)
- [ ] Chat IPC: streaming responses via `chat:chunk`
- [ ] Chat UI: message list, streaming display, chat history
- [ ] Explicit chat limitation in prompt: no file/tool actions
- [ ] `ExportService` (reads from analysis repo, generates markdown)
- [ ] Markdown export: `analysis/{date}-swot.md`
- [ ] Core empty/error/loading states for major routes
- [ ] Error boundaries on major panels
- [ ] macOS packaging with `electron-builder`
- [ ] README for setup and first-run flow

**Deliverable**: MVP is usable by a real user from setup to shareable output.

---

## MVP Exit Criteria

MVP is done only if all are true:

- [ ] User can run full loop without manual intervention
- [ ] SWOT items consistently include valid evidence references
- [ ] Failed runs show actionable error states (no silent failure)
- [ ] Payload preview is visible before each analysis run
- [ ] No out-of-workspace writes are possible through app features
- [ ] Circuit breaker prevents cascading failures on Jira/OpenRouter outage
- [ ] Stale `running` analyses are recovered on app restart

---

## Deferred to Phase 2+

- Confluence integration
- GitHub integration
- Multi-step theme/evidence prompt chain
- Theme editor UI
- CSV/PDF export
- Mermaid/charts
- Chat-driven file generation
- Windows/Linux packaging
- VP of Engineering role

---

## Summary Timeline

| Week | Focus                         | Key Output                                     |
| ---- | ----------------------------- | ---------------------------------------------- |
| 0    | Shell + security + infra      | Secure app scaffold, Result type, circuit breaker |
| 1    | DB + settings                 | Local persistence, model setup, full layer stack |
| 2    | Workspace + profiles          | Input authoring with business rules              |
| 3    | Jira integration              | Resilient org data ingestion                     |
| 4    | Analysis core                 | Evidence-backed SWOT generation                  |
| 5    | Chat + export + packaging     | Complete MVP loop and macOS build                |

**Total: 6 weeks (single developer)**
