# nswot — Full Sprint Plan (All Phases, 13 Weeks)

> This document preserves the full 13-week sprint plan covering all phases.
> It is **not the active sprint plan** for current development. See `docs/03-sprints.md` for the canonical 6-week MVP plan.
> Sprints 6-12 here correspond to Phase 2 and Phase 3 work as defined in `docs/04-phases-roadmap.md`.
> Re-plan Sprints 6+ after MVP ships and user feedback is collected.

---

## Sprint 0 — Scaffolding & Shell

**Goal**: Empty Electron app opens, dev tooling works, CI-free local workflow is fast.

- [ ] Init monorepo structure: `src/main`, `src/preload`, `src/renderer`
- [ ] Electron + Vite + React + TypeScript boilerplate
- [ ] Hot reload working for renderer (Vite dev server)
- [ ] Main process rebuild on save (tsx watch)
- [ ] `concurrently` script: `npm run dev` starts both
- [ ] Electron hardening defaults (`nodeIntegration: false`, `contextIsolation: true`, `sandbox: true`, CSP)
- [ ] `contextBridge` preload with a single test channel (`ping` -> `pong`)
- [ ] React Router with placeholder routes: `/workspace`, `/profiles`, `/integrations`, `/settings`, `/analysis`, `/analysis-history`
- [ ] Tailwind (or your preferred CSS) wired up
- [ ] `electron-builder` config — confirm `npm run build` produces a launchable binary
- [ ] `.nswot/` app data directory creation on first launch

**Deliverable**: App opens, routes navigate, preload bridge works end-to-end.

---

## Sprint 1 — Database & Settings Foundation

**Goal**: SQLite works, API keys are stored securely, model selection dropdown is functional.

- [ ] Install `better-sqlite3`, configure for Electron main process
- [ ] Migration system: versioned `.sql` files applied on startup
- [ ] Run initial migration: `workspace`, `preferences` tables
- [ ] `database.service.ts` — generic query/run helpers with typed returns
- [ ] `safe-storage.ts` — wrapper around `safeStorage` for get/set/delete
- [ ] IPC handlers: `settings:getKey`, `settings:setKey`, `settings:getPrefs`, `settings:setPrefs`
- [ ] Settings route UI
- [ ] React Query setup: `QueryClientProvider`, first hook (`useSettings`)
- [ ] IPC error handling: `IPCResult<T>` discriminated union, React Query error mapping
- [ ] Zod schema for settings form validation

**Deliverable**: User can enter API key, pick a model, both persist across restarts.

---

## Sprint 2 — Workspace & File Browser

**Goal**: User can open a project directory and browse files.

- [ ] Workspace open flow: native directory picker dialog
- [ ] `workspace` table record created on open
- [ ] `file.service.ts`: `readDir`, `readFile`, `writeFile`, `watchWorkspace`
- [ ] Path security: all fs handlers validate resolved path starts with workspace root
- [ ] Sidebar `FileBrowser` component
- [ ] `useFileBrowser` hook

**Deliverable**: User opens a folder, sees the file tree, tree updates live.

---

## Sprint 3 — Editor

**Goal**: Monaco editor with tabs, editing, saving.

- [ ] `EditorPane` component with language detection
- [ ] `EditorTabs` component: multiple files, dirty indicator
- [ ] Auto-save: debounced, writes via IPC
- [ ] Manual save: `Cmd/Ctrl+S`
- [ ] Editor state context for chat pane consumption
- [ ] `useEditor` hook

**Deliverable**: Full file editing experience.

---

## Sprint 4 — Profiles CRUD

**Goal**: User can create, edit, delete, and import employee profiles.

- [ ] Migration: `profiles` table
- [ ] Profile CRUD methods and IPC handlers
- [ ] Zod schema for profile validation
- [ ] `ProfileForm`, `ProfileCard`, `ProfileImport` components
- [ ] Profiles route with list, create/edit, delete
- [ ] Markdown import from `profiles/*.md`
- [ ] `useProfiles` hook

**Deliverable**: Full profile management with markdown import.

---

## Sprint 5 — Atlassian Integration

**Goal**: OAuth flow works, user can connect Jira + Confluence and fetch data.

- [ ] Migration: `integrations`, `integration_cache` tables
- [ ] `atlassian.service.ts`: full OAuth flow, Jira + Confluence fetch
- [ ] `cache.service.ts`: TTL-based caching with stale fallback
- [ ] IPC handlers for Atlassian integration
- [ ] `AtlassianSetup` component
- [ ] `useIntegrations` hook

**Deliverable**: User connects Atlassian, selects projects/spaces, fetches and caches data.

---

## Sprint 6 — GitHub Integration (Phase 2+)

**Goal**: GitHub PAT auth, repo selection, data fetch and cache.

- [ ] `github.service.ts`: PAT auth, repo/PR/code fetch
- [ ] Cache integration
- [ ] IPC handlers for GitHub
- [ ] `GitHubSetup` component
- [ ] Integrations route: tab layout with Atlassian + GitHub

**Deliverable**: Both integrations fully functional.

---

## Sprint 7 — Analysis Pipeline: Preprocessing

**Goal**: Collect data from all sources, anonymize, extract themes, chunk for LLM.

- [ ] Migration: `themes`, `analyses`, `analysis_profiles`, `analysis_themes` tables
- [ ] `anonymizer.service.ts`, `theme.service.ts`, `preprocessor.ts`
- [ ] `orchestrator.ts` through Collect and Preprocess stages
- [ ] `AnalysisRunner` component with preview
- [ ] `useAnalysis` hook

**Deliverable**: User can trigger collect + preprocess, see anonymized preview.

---

## Sprint 8 — Analysis Pipeline: LLM + SWOT Generation

**Goal**: Full analysis pipeline produces a structured, cited SWOT.

- [ ] `openrouter.service.ts`, `prompt.service.ts`, `parser.service.ts`
- [ ] Multi-step prompt chain (theme refinement -> evidence mapping -> SWOT)
- [ ] Progress events streaming to renderer
- [ ] Analysis storage with full output + input snapshot
- [ ] Error state with retry option

**Deliverable**: End-to-end analysis. User clicks run, sees progress, gets a full SWOT.

---

## Sprint 9 — SWOT Display & Analysis History

**Goal**: Rich SWOT view with evidence drill-down, plus browsable past analyses.

- [ ] `SwotQuadrant`, `SwotItem`, `Rundown`, `Summaries`, `ThemeList`, `ThemeEditor` components
- [ ] Analysis route with tabs (SWOT / Rundown / Summaries / Themes)
- [ ] Analysis history route with list, view, delete
- [ ] De-anonymization in UI (hover to show real name)

**Deliverable**: Full analysis viewing experience. Browse and compare past runs.

---

## Sprint 10 — Chat Pane

**Goal**: Chat grounded in analysis context, with file generation capabilities.

- [ ] Chat context assembly and token budgeting
- [ ] Streaming response via `chat:chunk`
- [ ] `ChatAction` parsing for file writes
- [ ] `ChatPane`, `ChatInput`, `ChatMessage` components
- [ ] `useChat` hook
- [ ] Chat history persistence per analysis

**Deliverable**: Chat works end-to-end. Follow-ups are grounded.

---

## Sprint 11 — Export & Visualization (Phase 2+)

**Goal**: Markdown + PDF export, Mermaid diagrams, Chart.js visualizations.

- [ ] `markdown.service.ts`, `pdf.service.ts`, `csv.service.ts`
- [ ] `ExportMenu` component
- [ ] `MermaidRenderer`, `ChartPanel`, `ThemeDistribution`, `CoverageMap` components
- [ ] `useExport` hook

**Deliverable**: Full export pipeline. Visualizations in analysis view.

---

## Sprint 12 — Polish, Edge Cases, Packaging

**Goal**: Production-ready. Handles errors gracefully. Ships as installable binary.

- [ ] Error boundaries, empty states, loading states
- [ ] Offline handling, token budget edge cases
- [ ] Workspace and integration edge cases
- [ ] Retry logic, structured logging
- [ ] App menu, keyboard shortcuts
- [ ] `electron-builder` final config for all platforms
- [ ] First-launch onboarding wizard

**Deliverable**: Shippable V1 binary for all platforms.

---

## Summary

| Sprint | Focus                    | Phase |
| ------ | ------------------------ | ----- |
| 0      | Scaffolding              | MVP   |
| 1      | Database & Settings      | MVP   |
| 2      | Workspace & File Browser | MVP   |
| 3      | Editor                   | MVP   |
| 4      | Profiles                 | MVP   |
| 5      | Atlassian                | MVP   |
| 6      | GitHub                   | 2     |
| 7      | Analysis: Preprocess     | MVP/2 |
| 8      | Analysis: LLM            | MVP/2 |
| 9      | SWOT Display             | MVP/2 |
| 10     | Chat                     | MVP   |
| 11     | Export & Viz             | 2/3   |
| 12     | Polish & Ship            | All   |

**Total: 13 weeks** (one dev, one-week sprints)
