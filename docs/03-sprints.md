# nswot - MVP Sprint Plan

> **Canonical sprint plan for current development (6 weeks).** Full 13-week plan is preserved in `docs/future/full-sprint-plan.md`.
> Phase 2 and Phase 3 sprints will be planned after MVP ships, based on user feedback.

All sprints are **1 week** and assume a single developer.
Goal: deliver the smallest trustworthy version of nswot in **6 weeks**.

> **Parallelization note (Sprint 3/3.5/4.5):** Sprint 3 (Jira) and Sprint 3.5 (Analysis foundation) are being developed in parallel by separate developers. Sprint 3.5 builds all analysis pipeline components that don't depend on Jira data. Sprint 4 then wires them together with Jira into the full end-to-end pipeline. Sprint 4.5 (Chat + Export backend) runs in parallel with Sprint 4, building all Sprint 5 backend components that don't depend on the analysis pipeline UI.

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

## Sprint 3.5 - Analysis Foundation (parallel with Sprint 3)

**Goal**: build all analysis pipeline components that don't depend on Jira data, so Sprint 4 only needs to wire everything together.

**Depends on**: Sprint 2 (profiles, workspace). Does NOT depend on Sprint 3 (Jira).

- [ ] `AnalysisRepository` (CRUD, store snapshots, junction records, `findRunning`)
- [ ] Analysis pipeline modules in `src/main/analysis/`:
  - [ ] `anonymizer.ts`: strip PII from profiles, generate deterministic pseudonym map (`Stakeholder A`, `Stakeholder B`, ...)
  - [ ] `prompt-builder.ts`: construct system prompt + user prompt from role, anonymized profiles, Jira data (accepts Jira as optional input), output schema
  - [ ] `response-parser.ts`: extract JSON from LLM response (code fence or raw), parse into `SwotOutput + SummariesOutput`, validate schema
  - [ ] `evidence-validator.ts`: verify every `SwotItem` has evidence, all `sourceId` values exist in the input snapshot
  - [ ] `token-budget.ts`: calculate token allocation given model context window, trim/rank input data to fit budget
- [ ] Recovery logic: mark stale `running` analyses as `failed` on app launch (in `main/index.ts`)
- [ ] Analysis IPC handlers: `ANALYSIS_LIST`, `ANALYSIS_GET`, `ANALYSIS_DELETE` (read/delete — run is Sprint 4)
- [ ] Analysis history UI: list of past analyses with status, date, role, model
- [ ] Preload bridge additions for analysis read/delete/list
- [ ] Tests for all analysis modules (anonymizer, prompt builder, response parser, evidence validator, token budget, repository)

**Deliverable**: all analysis building blocks are tested and ready. Sprint 4 assembles them into the orchestrator and adds the run flow.

---

## Sprint 4 - Analysis Pipeline Assembly

**Goal**: wire Sprint 3 (Jira) + Sprint 3.5 (analysis components) into the full end-to-end analysis pipeline.

**Depends on**: Sprint 3 (Jira integration) and Sprint 3.5 (analysis foundation).

- [x] `AnalysisService` (orchestrates full pipeline, manages status transitions)
- [x] Pipeline orchestration: collect (profiles + Jira) → preprocess → prompt → send → parse → validate → store
- [x] Collect stage: load profiles via repo, load Jira data via integration cache/provider
- [x] Store stage: full run persisted in single SQLite transaction (analysis + junction records)
- [x] Analysis run IPC handler: `ANALYSIS_RUN`
- [x] Progress events streaming to renderer at each pipeline stage
- [x] Payload preview UI before LLM send
- [x] Analysis run UI: role picker, profile/project selection, run button, progress display
- [x] SWOT results display: quadrant view with evidence citations and confidence badges
- [x] Corrective prompt: on first parse failure, retry once with corrective prompt template

**Deliverable**: repeatable run produces structured SWOT with evidence and confidence. Pipeline is resilient and recoverable.

---

## Sprint 4.5 - Chat + Export Backend (parallel with Sprint 4)

**Goal**: build all chat and export backend components that don't depend on the analysis pipeline UI, so Sprint 5 only needs UI wiring and polish.

**Depends on**: Sprint 3.5 (analysis repository). Does NOT depend on Sprint 3 (Jira) or Sprint 4 (pipeline assembly).

- [x] `ChatRepository` (message persistence per analysis, ordered retrieval)
- [x] `ChatService` (context assembly: analysis SWOT + summaries + recent messages, token budgeting, OpenRouter streaming)
- [x] Chat system prompt with grounding rules and explicit limitations (no file/tool actions)
- [x] `ExportService` (reads analysis + profiles from repos, generates structured markdown)
- [x] Markdown export format: metadata header, summaries, SWOT quadrants with evidence citations and confidence
- [x] Chat IPC handlers: `CHAT_SEND` (streaming via IPC events), `CHAT_GET_MESSAGES`, `CHAT_DELETE`
- [x] Export IPC handler: `EXPORT_MARKDOWN`
- [x] Preload bridge additions for chat and export
- [x] Tests for ChatRepository, ChatService, ExportService

**Deliverable**: chat and export backends are tested and ready. Sprint 5 adds the UI and packaging.

---

## Sprint 5 - UI Polish, Chat UI, and Packaging

**Goal**: complete the MVP user loop and package macOS build.

**Depends on**: Sprint 4 (analysis pipeline) and Sprint 4.5 (chat + export backend).

- [x] Chat UI: message list, streaming display, chat history
- [x] Export UI: button on analysis detail to trigger markdown export
- [x] Core empty/error/loading states for major routes
- [x] Error boundaries on major panels
- [x] macOS packaging with `electron-builder`
- [x] README for setup and first-run flow

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

| Week | Focus                                     | Key Output                                         |
| ---- | ----------------------------------------- | -------------------------------------------------- |
| 0    | Shell + security + infra                  | Secure app scaffold, Result type, circuit breaker   |
| 1    | DB + settings                             | Local persistence, model setup, full layer stack    |
| 2    | Workspace + profiles                      | Input authoring with business rules                 |
| 3    | Jira integration                          | Resilient org data ingestion                        |
| 3.5  | Analysis foundation (parallel w/ Sprint 3)| Analysis repo, anonymizer, parser, prompt builder   |
| 4    | Analysis pipeline assembly                | End-to-end SWOT generation from profiles + Jira     |
| 4.5  | Chat + export backend (parallel w/ Sprint 4)| ChatRepository, ChatService, ExportService        |
| 5    | UI polish, chat UI, packaging             | Complete MVP loop and macOS build                   |

**Total: 6 weeks (Sprint 3/3.5 and Sprint 4/4.5 run in parallel)**
