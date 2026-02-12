# nswot — Phase 3e Parallelized Sprint Plan (Sprint 22 → 35)

> **Two-agent execution model for Phase 3e: Platform Maturity & Multi-Provider.**
> Continues from Phase 3d (Sprints 13-21, see `docs/16-parallel-sprint-plan.md`).
> 13 features decomposed into 12 agent-sprints across 6 weeks. Auto-update (Sprint 31) deferred until code signing is configured.
>
> **All sprints complete. Phase 3e delivered with two-agent parallel execution.** Sprint 31 (Auto-Update) deferred until code signing.

**Prerequisite**: Phase 3d complete (Sprint 21 E2E testing + docs merged).

### Completion Log

| Sprint | Agent | Week | Notes |
|--------|-------|------|-------|
| Sprint 23 | B | 1 | LLM Provider Interface + Anthropic Provider. Gate 1 delivered. LLMProvider interface, OpenRouter refactored to implement it (with createChatCompletion + SSE streaming), AnthropicProvider (Messages API SSE, tool_use, system message extraction, stop_reason mapping), factory, Anthropic key in settings, 2 new error codes. 608 tests pass (42 new). |
| Sprint 25 | B | 2 | Codebase Provider Abstraction + Profile Tags. CodebaseProviderInterface (name, checkPrerequisites, isAvailable, cloneOrPull, analyze). ClaudeCliCodebaseProvider refactored to implement interface. OpenCodeProvider (spawns opencode CLI, same subprocess pattern). Factory with claude_cli/opencode types. Service updated to depend on interface. Profile.tags: string[] added with migration v5. 633 tests pass (22 new). |
| Sprint 22 | A | 1 | Structured Logging + App Menu + Keyboard Shortcuts. Logger singleton with file output (~/.nswot/logs/nswot-YYYY-MM-DD.log), daily rotation, level filtering, old log cleanup. Native macOS app menu with Edit/View/Window/Help, Cmd+comma→Settings via IPC. MenuHandler component in renderer. 11 new logger tests. |
| Sprint 24 | A | 2 | Wire Multi-Provider LLM into Analysis + Chat. Refactored AnalysisService and ChatService to use LLMProvider interface (removed sendToOpenRouter/readSSEStream/streamCompletion). Provider factory wiring in index.ts. Added getActiveApiKey/getLlmProviderType to SettingsService, getSync to PreferencesRepository. Provider-switching IPC (llm:getProvider/llm:setProvider). Temperature 0 for analysis calls. 641 tests pass. |
| Sprint 26 | A | 3 | Chat-Driven File Generation + Editor Context Backend. 3 file-write tools (write_markdown_file, write_csv_file, write_mermaid_file) in action-tools.ts. ActionExecutor routes file-write tools to FileService.writeFile (no CLI spawn). Chat system prompt gains FILE GENERATION and EDITOR CONTEXT sections. EditorContext transient state on ChatService with setEditorContext/getEditorContext. IPC channel chat:setEditorContext. Preload/env.d.ts updated. Renderer approval-card and action-status updated for file-write tool names. 665 tests pass (24 new). |
| Sprint 27 | B | 3 | Visualization Infrastructure + Profile Tags UI. Installed d3/chart.js/react-chartjs-2/mermaid. Created 4 viz components: MermaidRenderer (dark theme, error boundary), ThemeDistributionChart (horizontal bar, Chart.js), SwotHeatmap (D3 confidence grid), SourceCoverageChart (horizontal bar, Chart.js). Integrated into swot-results.tsx as collapsible section. Profile form gets tags input (comma/Enter pills), profile card shows tag pills. env.d.ts updated. 641 tests pass (0 regressions). |
| Sprint 29 | B | 4 | Onboarding Wizard + Settings Provider Picker. Created 4-step onboarding wizard (Welcome, API Key, Integrations Overview, Completion) with stepper UI. useOnboardingStatus/useCompleteOnboarding hooks check/set onboardingComplete preference. OnboardingRedirect in App.tsx auto-navigates to /onboarding on fresh launch. Sidebar hidden during onboarding. ProviderPicker component with OpenRouter/Anthropic radio, API key input, model picker. Settings page replaced with unified ProviderPicker. 665 tests pass (0 regressions). |
| Sprint 33 | B | 5 | Visualization Polish + Codebase Provider UI + File Watcher UI. CoverageRadarChart (Chart.js radar for multi-source evidence %). ConfidenceTrend (stacked bar comparing confidence distributions). Comparison page gains collapsible viz section with confidence trend. QualityMetrics enhanced with per-source citation rate bars (count/total + percentage). CodebaseProviderPicker (Claude CLI vs OpenCode radio) added to codebase-setup. useFileWatcher hook listens for file:changed events and invalidates directory/file queries. Preload/env.d.ts updated with file.onChanged. 665 tests pass (0 regressions). |
| Sprint 28 | A | 4 | De-anonymization Hover + File System Watching. PseudonymMap IPC (analysis:getPseudonymMap) reads from analysis.inputSnapshot.pseudonymMap. usePseudonymMap React Query hook. DeanonymizeTooltip component detects "Stakeholder X" patterns, shows real name on hover with "(local only)" note. Integrated into swot-results.tsx evidence sourceId and quotes. FileWatcher class (fs.watch recursive, 200ms debounce, ignores .git/node_modules/.nswot). Wired into index.ts via onWorkspaceOpen callback. file:changed IPC events forwarded to renderer. 679 tests pass (14 new). |
| Sprint 32 | A | 6 | Mermaid in Workspace + Chat File Approval UI. FileApprovalCard component (format-colored icons, editable path/content, Mermaid live preview tab for .mmd files). ChatPanel routes file-write actions to FileApprovalCard. MermaidPreview component renders .mmd files visually with source toggle. EditorPane detects .mmd extension and renders MermaidPreview instead of Monaco. FileBrowser shows diamond icon for .mmd files. Integration tests: ChatService file-write approval flow for markdown/CSV/mermaid with real ActionExecutor+mock FileService, error propagation from path validation, status transitions (approved→executing→completed), rejection does not write. 691 tests pass (6 new). |
| Sprint 30 | A | 5 | Editor Context UI + Evidence Coverage. EditorContextProvider React context with useEditorContext hook. EditorPane tracks filePath/contentPreview/selectedText and syncs to main process via IPC. Chat panel shows "Editor: filename" badge when context available. Workspace route wrapped with EditorContextProvider. SourceCoverageEntry type and computeSourceCoverage function in evidence-validator.ts. Coverage computed per-source-type (profile/jira/confluence/github/codebase) comparing cited vs available sourceIds. Wired into pipeline via SwotGenerationStep. 685 tests pass (6 new). |
| Sprint 35 | B | 6 | Documentation + Final Polish. Updated docs/02 (infrastructure additions, visualization architecture), docs/04 (Phase 3e exit criteria marked delivered), docs/05 (Profile.tags, invariant), docs/08 (file-write tool instructions, editor context prompt extensions), docs/19 (completion log, header note), CLAUDE.md (current phase, multi-provider patterns, logging, new doc references). All Agent B sprints complete. |
| Sprint 34 | A | 6 | Cross-Feature E2E Testing. 42 tests across 9 describe blocks: multi-provider LLM switch (6), multi-provider codebase (4), chat file generation (5), editor context in chat (5), de-anonymization pseudonym map (3), profile tags with DB (4), onboarding wizard preferences (6), evidence coverage + validation (5), Phase 3e exit criteria (4). All 733 tests pass (54 new). Phase 3e complete. |

### Gate Status

| Gate | Status | Details |
|------|--------|---------|
| Gate 1: LLM Provider Interface Freeze | **PASSED** | Agent B delivered `LLMProvider` interface, OpenRouter refactor with `createChatCompletion`, Anthropic provider, factory, settings Anthropic key. All tests pass. |
| Gate 2: Multi-Provider Stable | **PASSED** | Both LLM providers work in analysis + chat. Codebase providers work. Chat file generation works. All Phase 3e features validated by Sprint 34 E2E tests (42 tests). 733 total tests pass. |

---

## Overview

Phase 3e adds platform maturity features: multi-provider LLM/codebase support, visualization, chat-driven file generation, de-anonymization, onboarding, app menu, structured logging, file watching, analysis consistency (evidence coverage indicator + low-temperature LLM calls), and auto-update.

Single-developer baseline: ~12 sprints.
Two-agent parallel plan: **6 weeks** (50% compression). Sprint 31 (auto-update) deferred until code signing is in place.

---

## Phase 3e Feature Inventory

### Visualization & File Generation

| # | Feature | Sprint(s) | Key Files |
|---|---------|-----------|-----------|
| V1 | Mermaid diagram rendering in-app | 27, 32 | NEW `components/visualizations/mermaid-renderer.tsx`, `mermaid-preview.tsx` |
| V2 | D3/Chart.js interactive charts (theme distribution, SWOT heatmap, source coverage) | 27, 33 | NEW `components/visualizations/*` |
| V3 | Chat-driven local file generation (markdown, CSV, Mermaid to workspace with approval) | 26, 32 | `action-tools.ts`, `action-executor.ts`, `chat.service.ts` |

### Multi-Provider

| # | Feature | Sprint(s) | Key Files |
|---|---------|-----------|-----------|
| P1 | Multi-provider LLM (OpenRouter + direct Anthropic API) with factory selection | 23, 24 | NEW `providers/llm/llm-provider.interface.ts`, `anthropic.provider.ts`, `llm-provider-factory.ts` |
| P2 | Multi-provider codebase analysis (Claude CLI + OpenCode) with factory selection | 25 | NEW `providers/codebase/codebase-provider.interface.ts`, `opencode.provider.ts` |

### UX Enhancements

| # | Feature | Sprint(s) | Key Files |
|---|---------|-----------|-----------|
| U1 | Editor context in chat | 26, 30 | `chat.service.ts`, `chat.ipc.ts`, NEW `lib/editor-context.ts` |
| U2 | De-anonymization hover | 28 | NEW `components/analysis/deanonymize-tooltip.tsx`, `swot-results.tsx` |
| U3 | First-launch onboarding wizard | 29 | NEW `routes/onboarding.tsx`, `components/onboarding/*` |
| U4 | App menu and keyboard shortcuts | 22 | `index.ts` (Electron Menu) |
| U5 | Profile tags/themes manual field | 25, 27 | `domain/types.ts`, `profile.repository.ts`, migration v5 |

### Analysis Consistency

| # | Feature | Sprint(s) | Key Files |
|---|---------|-----------|-----------|
| C1 | Evidence coverage indicator (backend compute + frontend display) | 30, 33 | `evidence-validator.ts`, `domain/types.ts`, quality-metrics component |
| C2 | Low-temperature LLM calls for run-to-run consistency | 24 | `analysis.service.ts` (provider options) |

### Infrastructure

| # | Feature | Sprint(s) | Key Files |
|---|---------|-----------|-----------|
| I1 | Structured logging | 22 | NEW `infrastructure/logger.ts` |
| I2 | File system watching | 28 | NEW `infrastructure/file-watcher.ts` |
| I3 | Auto-update infrastructure | ~~31~~ DEFERRED | Blocked on code signing (macOS notarization + Windows Authenticode). See `docs/13-ci-cd-and-release.md` § 8. |

---

## Sprint Details

### Sprint 22 — Structured Logging + App Menu + Keyboard Shortcuts (Agent A, Week 1)

| # | Task | Dep Type | Conflict-Risk Files |
|---|------|----------|---------------------|
| 22.1 | Create `src/main/infrastructure/logger.ts` — Logger class with log levels (debug, info, warn, error), console + file output to `~/.nswot/logs/`, daily rotation | Independent | NEW file |
| 22.2 | Create logger tests | Independent | NEW test file |
| 22.3 | Adopt logger in `src/main/index.ts` — startup logging, unhandled error capture | Independent | `index.ts` |
| 22.4 | Build native macOS menu using `Menu.buildFromTemplate` — Edit, View, Window, Help menus with shortcuts (Cmd+Q, Cmd+W, Cmd+Z/X/C/V, Cmd+comma for settings) | Independent | `index.ts` |
| 22.5 | Add IPC for menu actions that need renderer interaction (e.g., navigate to settings) | Soft dep on 22.4 | `channels.ts` (append), `preload/index.ts` (append) |

---

### Sprint 23 — LLM Provider Interface + Anthropic Provider (Agent B, Week 1)

| # | Task | Dep Type | Conflict-Risk Files |
|---|------|----------|---------------------|
| 23.1 | Create `src/main/providers/llm/llm-provider.interface.ts` — `LLMProvider` interface with `listModels(apiKey)` and `createChatCompletion(apiKey, modelId, messages, options)` returning domain types | Independent | NEW file |
| 23.2 | Refactor `openrouter.provider.ts` to implement `LLMProvider` — extract SSE streaming logic from `analysis.service.ts.sendToOpenRouter()` into provider | Hard dep on 23.1 | `openrouter.provider.ts` |
| 23.3 | Create `src/main/providers/llm/anthropic.provider.ts` — `AnthropicProvider` implementing `LLMProvider` for Anthropic Messages API (SSE streaming, model listing) | Hard dep on 23.1 | NEW file |
| 23.4 | Create `src/main/providers/llm/llm-provider-factory.ts` — Factory returning provider based on `llmProviderType` preference (default: `openrouter`) | Hard dep on 23.1 | NEW file |
| 23.5 | Add `anthropic_api_key` secure storage to `settings.service.ts` — parallel to existing `openrouter_api_key` | Independent | `settings.service.ts` |
| 23.6 | Tests for Anthropic provider and factory | Independent | NEW test files |
| 23.7 | Add error codes to `errors.ts` — `ANTHROPIC_AUTH_FAILED`, `ANTHROPIC_RATE_LIMITED` | Independent | `errors.ts` (append) |

**Gate 1 artifacts**: `llm-provider.interface.ts`, refactored `openrouter.provider.ts`, `anthropic.provider.ts`, `llm-provider-factory.ts`. All LLM provider tests pass.

---

### Sprint 24 — Wire Multi-Provider LLM into Analysis + Chat (Agent A, Week 2)

| # | Task | Dep Type | Conflict-Risk Files |
|---|------|----------|---------------------|
| 24.1 | Refactor `analysis.service.ts` — Replace `sendToOpenRouter` with provider's `createChatCompletion`. LlmCaller closure wraps active provider | Hard dep on Gate 1 | `analysis.service.ts` |
| 24.2 | Refactor `chat.service.ts` — Replace streaming method with provider's streaming. Both providers must support tool-use | Hard dep on Gate 1 | `chat.service.ts` |
| 24.3 | Update `index.ts` — Instantiate `LlmProviderFactory`, pass active provider to services | Hard dep on 24.1 | `index.ts` |
| 24.4 | Update `settings.service.ts` — `listModels` delegates to active provider | Hard dep on Gate 1 | `settings.service.ts` |
| 24.5 | Add provider-switching IPC + preference — `settings:setLlmProvider` channel | Soft dep on 24.3 | `channels.ts`, `preload/*` |
| 24.6 | Set temperature 0 (or near-0) on analysis LLM calls for run-to-run consistency — parameter on `createChatCompletion` options | Soft dep on 24.1 | `analysis.service.ts` |
| 24.7 | Tests: both providers through analysis and chat services (mocked HTTP) | Hard dep on 24.1-24.2 | test files |

---

### Sprint 25 — Codebase Provider Abstraction + Profile Tags (Agent B, Week 2)

| # | Task | Dep Type | Conflict-Risk Files |
|---|------|----------|---------------------|
| 25.1 | Create `src/main/providers/codebase/codebase-provider.interface.ts` — Interface with `analyze`, `isAvailable`, `checkPrerequisites` | Independent | NEW file |
| 25.2 | Refactor `codebase.provider.ts` to implement interface | Hard dep on 25.1 | `codebase.provider.ts` |
| 25.3 | Create `src/main/providers/codebase/opencode.provider.ts` — Spawns `opencode` CLI (github.com/anomalyco/opencode) with equivalent prompt and output parsing | Hard dep on 25.1 | NEW file |
| 25.4 | Create `src/main/providers/codebase/codebase-provider-factory.ts` — Factory selecting Claude CLI or OpenCode based on preference | Hard dep on 25.1 | NEW file |
| 25.5 | Update `codebase.service.ts` — Use factory to get active provider | Hard dep on 25.4 | `codebase.service.ts` |
| 25.6 | Add `tags: string[]` field to `Profile` and `ProfileInput` in `domain/types.ts` | Independent | `domain/types.ts` |
| 25.7 | Migration v5: Add `tags` column to profiles table (TEXT, JSON array, default '[]') | Hard dep on 25.6 | `db/migrations.ts` |
| 25.8 | Update `profile.repository.ts` — Parse/serialize tags JSON | Hard dep on 25.7 | `profile.repository.ts` |
| 25.9 | Tests for OpenCode provider, codebase factory, profile tags | Independent | test files |

---

### Sprint 26 — Chat-Driven File Generation + Editor Context Backend (Agent A, Week 3)

| # | Task | Dep Type | Conflict-Risk Files |
|---|------|----------|---------------------|
| 26.1 | Add file-write tool definitions to `action-tools.ts` — `write_markdown_file`, `write_csv_file`, `write_mermaid_file` (workspace-relative path + content) | Independent | `action-tools.ts` |
| 26.2 | Implement file-write execution in `action-executor.ts` — Use `FileService.writeFile` directly (no CLI spawn), validate path in workspace | Hard dep on 26.1 | `action-executor.ts` |
| 26.3 | Update `chat.service.ts` — Include file-write tools in available tools (always when workspace open), add file-write instructions to system prompt | Soft dep on 26.1 | `chat.service.ts` |
| 26.4 | Add editor context IPC — `chat:editorContext` channel. Renderer sends `{ filePath, content, selectedText }` for chat context injection | Independent | `channels.ts` (append), `chat.ipc.ts` |
| 26.5 | Tests for file-write tools, executor path validation, editor context | Independent | test files |

---

### Sprint 27 — Visualization Infrastructure + Profile Tags UI (Agent B, Week 3)

| # | Task | Dep Type | Conflict-Risk Files |
|---|------|----------|---------------------|
| 27.1 | Install visualization deps: `d3`, `@types/d3`, `chart.js`, `react-chartjs-2`, `mermaid` | Independent | `package.json` |
| 27.2 | Create `src/renderer/components/visualizations/mermaid-renderer.tsx` — Render Mermaid diagrams from string, dark theme | Independent | NEW file |
| 27.3 | Create `theme-distribution-chart.tsx` — Bar/pie chart of theme frequency from analysis themes | Independent | NEW file |
| 27.4 | Create `swot-heatmap.tsx` — Confidence heatmap across SWOT quadrants | Independent | NEW file |
| 27.5 | Create `source-coverage-chart.tsx` — Evidence source type distribution chart | Independent | NEW file |
| 27.6 | Integrate visualizations into `swot-results.tsx` — Add tabs/sections for charts | Soft dep on 27.3-27.5 | `swot-results.tsx` |
| 27.7 | Update profile form with tags field — comma-separated input with tag pills | Hard dep on Sprint 25.6 | profile form components |
| 27.8 | Update `preload/*` and `env.d.ts` with profile tags types, codebase provider types | Hard dep on Sprint 25 | `preload/api.ts`, `preload/index.ts`, `env.d.ts` |

---

### Sprint 28 — De-anonymization Hover + File System Watching (Agent A, Week 4)

| # | Task | Dep Type | Conflict-Risk Files |
|---|------|----------|---------------------|
| 28.1 | Add IPC for pseudonymMap retrieval — `analysis:pseudonymMap` returns map from `analysis.inputSnapshot` | Independent | `channels.ts` (append), `analysis.ipc.ts` |
| 28.2 | Update `preload/*` — Add `analysis.getPseudonymMap(analysisId)` bridge | Soft dep on 28.1 | `preload/api.ts`, `preload/index.ts` |
| 28.3 | Create `src/renderer/hooks/use-pseudonym-map.ts` — React Query hook for pseudonym map | Soft dep on 28.2 | NEW file |
| 28.4 | Create `src/renderer/components/analysis/deanonymize-tooltip.tsx` — Hover tooltip: detects "Stakeholder X" patterns, reveals real name on hover | Soft dep on 28.3 | NEW file |
| 28.5 | Integrate hover into `swot-results.tsx` — Wrap evidence source IDs with `DeanonymizeTooltip` | Soft dep on 28.4 | `swot-results.tsx` |
| 28.6 | Create `src/main/infrastructure/file-watcher.ts` — Wraps `fs.watch` (recursive) for workspace directory. Debounced IPC events on file changes | Independent | NEW file |
| 28.7 | Wire file watcher into `index.ts` — Start on workspace open, stop on change. Emit `file:changed` events | Soft dep on 28.6 | `index.ts` |
| 28.8 | Add file watcher IPC channels and preload bridge | Soft dep on 28.7 | `channels.ts` (append), `preload/*` (append) |
| 28.9 | Tests for file watcher and pseudonym map IPC | Independent | test files |

---

### Sprint 29 — Onboarding Wizard + Settings Provider Picker (Agent B, Week 4)

| # | Task | Dep Type | Conflict-Risk Files |
|---|------|----------|---------------------|
| 29.1 | Create `src/renderer/routes/onboarding.tsx` — Multi-step wizard: (1) Welcome, (2) API Key setup, (3) Integration overview, (4) Completion. Uses `onboardingComplete` preference | Independent | NEW file |
| 29.2 | Create `src/renderer/components/onboarding/welcome-step.tsx` | Independent | NEW file |
| 29.3 | Create `src/renderer/components/onboarding/api-key-step.tsx` — Supports both OpenRouter and Anthropic key entry | Independent | NEW file |
| 29.4 | Create `src/renderer/components/onboarding/integrations-step.tsx` — Overview of available integrations | Independent | NEW file |
| 29.5 | Create `src/renderer/components/onboarding/completion-step.tsx` — Summary + "Get Started" button | Independent | NEW file |
| 29.6 | Update `App.tsx` — Add `/onboarding` route, redirect if `onboardingComplete` not set | Soft dep on 29.1 | `App.tsx` |
| 29.7 | Create `src/renderer/hooks/use-onboarding.ts` — Check/set onboarding status via settings IPC | Independent | NEW file |
| 29.8 | Create LLM provider picker in settings — radio/dropdown for OpenRouter vs Anthropic | Independent | NEW `components/settings/provider-picker.tsx` |
| 29.9 | Update `settings.tsx` — Add provider picker section and Anthropic API key input | Soft dep on 29.8 | `settings.tsx` |
| 29.10 | Update `env.d.ts` — Add LLM provider types, provider selection settings | Independent | `env.d.ts` (append) |

---

### Sprint 30 — Editor Context UI + Integration Testing (Agent A, Week 5)

| # | Task | Dep Type | Conflict-Risk Files |
|---|------|----------|---------------------|
| 30.1 | Create `src/renderer/lib/editor-context.ts` — React context provider for editor state (file path, content, selected text) | Independent | NEW file |
| 30.2 | Update `editor-pane.tsx` — Track current file path, content, selected text in editor context | Soft dep on 30.1 | `editor-pane.tsx` |
| 30.3 | Update `chat-panel.tsx` — When sending, include editor context if available. Show "Editor context attached" indicator | Soft dep on 30.1 | `chat-panel.tsx` |
| 30.4 | Update `workspace.tsx` — Wrap with EditorContextProvider | Soft dep on 30.1 | `workspace.tsx` |
| 30.5 | Update `preload/*` — Add `chat.sendWithContext` bridge method | Soft dep on Sprint 26.4 | `preload/api.ts`, `preload/index.ts` |
| 30.6 | Evidence coverage computation — after validation, compare cited `sourceId`s in SWOT output against input snapshot. Produce per-source-type coverage rates (profiles, Jira projects, Confluence spaces, GitHub repos, codebase repos). Store as part of `EvidenceQualityMetrics` | Independent | `evidence-validator.ts`, `domain/types.ts` |
| 30.7 | Add evidence coverage IPC — return coverage data alongside quality metrics | Soft dep on 30.6 | `analysis.ipc.ts`, `preload/*` |
| 30.8 | Integration tests: multi-provider LLM E2E (mock Anthropic), file write from chat, editor context, evidence coverage | Hard dep on all prior | test files |

---

### Sprint 31 — Auto-Update Infrastructure — DEFERRED

> **Deferred** until code signing is configured (macOS notarization + Windows Authenticode). `electron-updater` requires signed apps for auto-install on macOS/Windows. See `docs/13-ci-cd-and-release.md` § 8 for unsigned distribution policy and future signing migration path. The CI pipeline also needs `--publish always` (currently `--publish never`) to generate the `latest-mac.yml` / `latest.yml` manifest files that `electron-updater` uses for version discovery.

**Gate 2 artifacts**: Both LLM providers work in analysis + chat. Codebase providers work. Chat file generation works. Editor context injected. De-anonymization hover works. Onboarding completes. File watching emits events. All tests pass.

---

### Sprint 32 — Mermaid in Workspace + Chat File Approval UI (Agent A, Week 6)

| # | Task | Dep Type | Conflict-Risk Files |
|---|------|----------|---------------------|
| 32.1 | Create `src/renderer/components/chat/file-approval-card.tsx` — Approval card for file-write actions (path, content preview, format icon) | Independent | NEW file |
| 32.2 | Update `chat-panel.tsx` — Render file-approval-card for file-write tool actions | Soft dep on 32.1 | `chat-panel.tsx` |
| 32.3 | Create `src/renderer/components/workspace/mermaid-preview.tsx` — Render Mermaid diagram when `.mmd` file selected (reuses `mermaid-renderer.tsx`) | Independent | NEW file |
| 32.4 | Update `editor-pane.tsx` — Detect `.mmd` extension, render MermaidPreview instead of Monaco | Soft dep on 32.3 | `editor-pane.tsx` |
| 32.5 | Update file browser to show `.mmd` files with diagram icon | Soft dep on 32.3 | file browser component |
| 32.6 | Integration tests: chat file generation E2E, Mermaid rendering | Hard dep on all prior | test files |

---

### Sprint 33 — Visualization Polish + Codebase Provider UI + File Watcher UI (Agent B, Week 5)

| # | Task | Dep Type | Conflict-Risk Files |
|---|------|----------|---------------------|
| 33.1 | Create `coverage-radar-chart.tsx` — Radar chart for multi-source evidence coverage | Independent | NEW file |
| 33.2 | Create `confidence-trend.tsx` — Bar chart comparing confidence distributions across analyses | Independent | NEW file |
| 33.3 | Integrate charts into `comparison.tsx` — Add visualization tab | Soft dep on 33.1-33.2 | `comparison.tsx` |
| 33.3a | Evidence coverage indicator on quality metrics card — display per-source-type citation rates (e.g., "9/14 profiles cited, 3/5 Jira projects cited"). Uses coverage data from Sprint 30.6 | Hard dep on Sprint 30.6 | `quality-metrics` component |
| 33.4 | Add codebase provider selection to integrations page — Claude CLI vs OpenCode picker | Hard dep on Sprint 25 | codebase setup component |
| 33.5 | Update `preload/*` — Add codebase provider selection bridge, file watcher event listener | Hard dep on Sprint 28 | `preload/api.ts`, `preload/index.ts` |
| 33.6 | Update `use-file-browser.ts` — Subscribe to `file:changed` events, invalidate directory queries | Hard dep on Sprint 28.8 | `use-file-browser.ts` |
| 33.7 | Tests for viz components and codebase provider selection | Independent | test files |

---

### Sprint 34 — Cross-Feature E2E Testing (Agent A, Week 6)

| # | Task | Dep Type | Conflict-Risk Files |
|---|------|----------|---------------------|
| 34.1 | E2E: Multi-provider LLM switch — run with OpenRouter, switch to Anthropic, run again | Hard dep on all | test files |
| 34.2 | E2E: Chat file generation — request file write, approve, verify in workspace | Hard dep on all | test files |
| 34.3 | E2E: Editor context — open file, chat references content | Hard dep on all | test files |
| 34.4 | E2E: De-anonymization hover — run analysis, hover shows real names | Hard dep on all | test files |
| 34.5 | E2E: Profile tags — create with tags, verify in analysis data | Hard dep on all | test files |
| 34.6 | E2E: Onboarding wizard — fresh launch, complete steps, redirect | Hard dep on all | test files |
| 34.7 | E2E: Evidence coverage — run analysis, verify coverage rates on metrics card, verify consistency across repeated runs (low temperature) | Hard dep on all | test files |
| 34.8 | Validate Phase 3e exit criteria from `docs/04-phases-roadmap.md` | Hard dep on all | — |

---

### Sprint 35 — Documentation + Final Polish (Agent B, Week 6)

| # | Task | Dep Type | Conflict-Risk Files |
|---|------|----------|---------------------|
| 35.1 | Update `docs/02-architecture-spec.md` — Multi-provider, logging, auto-update, file watcher, visualizations | Hard dep on all | docs |
| 35.2 | Update `docs/04-phases-roadmap.md` — Mark Phase 3e completed | Independent | docs |
| 35.3 | Update `docs/05-domain-model.md` — Profile tags, LLMProvider interface, CodebaseProviderInterface | Independent | docs |
| 35.4 | Update `docs/08-prompt-engineering.md` — File-write tool instructions, editor context prompt additions | Independent | docs |
| 35.5 | Update this document — Mark all sprints complete | Independent | this doc |
| 35.6 | Update `CLAUDE.md` — Logging conventions, multi-provider patterns | Independent | `CLAUDE.md` |
| 35.7 | Final `pnpm typecheck && pnpm test` validation | Hard dep on all | — |

---

## Timeline

```
Week  | Agent A                              | Agent B                              | Gate
------+--------------------------------------+--------------------------------------+------
  1   | Sprint 22: Structured Logging +      | Sprint 23: LLM Provider Interface +  | G1
      | App Menu + Keyboard Shortcuts        | Anthropic Provider                   | (end)
      | [index.ts, NEW logger, channels.ts]  | [NEW llm/*, settings.service.ts]     |
------+--------------------------------------+--------------------------------------+------
  2   | Sprint 24: Wire Multi-Provider LLM   | Sprint 25: Codebase Provider         |
      | into Analysis + Chat                 | Abstraction + Profile Tags           |
      | [analysis.service.ts, chat.service,  | [NEW codebase/*, domain/types.ts,    |
      | index.ts, settings.service.ts]       | profile.repository, migrations]      |
------+--------------------------------------+--------------------------------------+------
  3   | Sprint 26: Chat File Generation +    | Sprint 27: Visualization Infra +     |
      | Editor Context Backend               | Profile Tags UI                      |
      | [action-tools, action-executor,      | [NEW visualizations/*, swot-results, |
      | chat.service, chat.ipc]              | profile-form, package.json]          |
------+--------------------------------------+--------------------------------------+------
  4   | Sprint 28: De-anonymization Hover +  | Sprint 29: Onboarding Wizard         |
      | File System Watching                 | + Settings Provider Picker           |
      | [NEW file-watcher, analysis.ipc,     | [NEW onboarding/*, App.tsx,          |
      | swot-results, index.ts]              | settings.tsx, env.d.ts]              |
------+--------------------------------------+--------------------------------------+------
  5   | Sprint 30: Editor Context UI +       | Sprint 33: Viz Polish + Codebase     | G2
      | Integration Testing                  | Provider UI + File Watcher UI        | (end)
      | [editor-pane, chat-panel,            | [NEW viz components, comparison.tsx, |
      | workspace.tsx, preload/*]            | codebase-setup, preload/*, hooks]    |
------+--------------------------------------+--------------------------------------+------
  6   | Sprint 32: Mermaid in Workspace +    | Sprint 35: Documentation + Polish    |
      | Chat File Approval UI                |                                      |
      | [chat-panel, editor-pane,            | [docs/* only]                        |
      | file-browser, NEW components]        |                                      |
      +--------------------------------------+--------------------------------------+
      | Sprint 34: Cross-Feature E2E Tests   |                                      |
      | [test files only]                    |                                      |
------+--------------------------------------+--------------------------------------+------

Sprint 31 (Auto-Update) DEFERRED — blocked on code signing.
CRITICAL PATH: Week 1B (Gate 1) -> Week 2A (provider wiring) -> Week 3A (chat file gen) -> Week 5 (Gate 2)
```

---

## Dependency Gates

### Gate 1: LLM Provider Interface Freeze (End of Week 1)

**Owner**: Agent B (Sprint 23)

**Required artifacts**:
- [x] `src/main/providers/llm/llm-provider.interface.ts` — `LLMProvider` interface with `listModels` and `createChatCompletion`
- [x] `src/main/providers/llm/openrouter.provider.ts` — Refactored to implement `LLMProvider`
- [x] `src/main/providers/llm/anthropic.provider.ts` — Working Anthropic provider
- [x] `src/main/providers/llm/llm-provider-factory.ts` — Factory with preference-based selection
- [x] All LLM provider tests pass
- [x] `pnpm typecheck && pnpm test` green

**Blocking**: Sprint 24 (Agent A Week 2) cannot start until Gate 1 passes.

### Gate 2: Multi-Provider Stable (End of Week 5)

**Owner**: Both agents

**Required artifacts**:
- [ ] Analysis pipeline works with both OpenRouter and Anthropic
- [ ] Codebase analysis works with both Claude CLI and OpenCode
- [ ] Chat file generation works (write to workspace with approval)
- [ ] Editor context injected into chat
- [ ] Settings UI allows switching LLM and codebase providers
- [ ] De-anonymization hover works in SWOT results
- [ ] Onboarding wizard completes successfully
- [ ] File system watching emits events
- [ ] Visualization charts render in results and comparison views
- [ ] Codebase provider selection UI works
- [ ] All tests pass

**Blocking**: Sprint 32 + Sprint 34 (Week 6) and Sprint 35 (Week 6) depend on Gate 2.

---

## File Ownership Table

| File / Module | Week 1-2 Owner | Week 3-4 Owner | Week 5-6 Owner |
|---|---|---|---|
| `src/main/index.ts` | Agent A (W1: menu+logger, W2: provider wiring) | Agent A (W4: file watcher) | Stable |
| `src/main/services/analysis.service.ts` | Agent A (W2) | Stable | Stable |
| `src/main/services/chat.service.ts` | Agent A (W2-W3) | Stable | Stable |
| `src/main/services/settings.service.ts` | Agent B (W1), Agent A (W2) | Stable | Stable |
| `src/main/providers/llm/*` | Agent B (W1) | Stable | Stable |
| `src/main/providers/codebase/*` | Agent B (W2) | Stable | Stable |
| `src/main/providers/actions/*` | Stable | Agent A (W3) | Stable |
| `src/main/domain/types.ts` | Agent B (W2: tags) | Stable | Stable |
| `src/main/ipc/channels.ts` | Both (append-only) | Agent A (W3-4) | Stable |
| `src/preload/*` | Agent A (W2) | Agent A (W4) | Agent A (W5), Agent B (W5) |
| `src/renderer/App.tsx` | Stable | Agent B (W4) | Stable |
| `src/renderer/routes/settings.tsx` | Stable | Agent B (W4) | Stable |
| `swot-results.tsx` | Stable | Agent B (W3: viz), Agent A (W4: hover) | Stable |
| `chat-panel.tsx` | Stable | Agent A (W3) | Agent A (W5-6) |
| `package.json` | Stable | Agent B (W3: viz deps) | Stable |

---

## Agent Backlogs

### Agent A Backlog

| Week | Sprint | Task | Status | Blocked By |
|------|--------|------|--------|------------|
| 1 | 22 | Structured logging + App menu + Keyboard shortcuts | **Complete** | — |
| 2 | 24 | Wire multi-provider LLM into analysis + chat | **Complete** | Gate 1 |
| 3 | 26 | Chat-driven file generation + Editor context backend | **Complete** | Sprint 24 |
| 4 | 28 | De-anonymization hover + File system watching | **Complete** | — |
| 5 | 30 | Editor context UI + Integration testing | **Complete** | Sprint 26, 28 |
| 6 | 32 | Mermaid in workspace + Chat file approval UI | **Complete** | Gate 2 |
| 6 | 34 | Cross-feature E2E testing | **Complete** | All prior |

### Agent B Backlog

| Week | Sprint | Task | Status | Blocked By |
|------|--------|------|--------|------------|
| 1 | 23 | LLM provider interface + Anthropic provider (Gate 1 owner) | **Complete** | — |
| 2 | 25 | Codebase provider abstraction + Profile tags | **Complete** | — |
| 3 | 27 | Visualization infrastructure + Profile tags UI | **Complete** | Sprint 25 |
| 4 | 29 | Onboarding wizard + Settings provider picker | **Complete** | — |
| 5 | 33 | Visualization polish + Codebase provider UI + File watcher UI | **Complete** | Sprint 28 |
| 6 | 35 | Documentation + Final polish | **Complete** | All prior |
| — | ~~31~~ | ~~Auto-update infrastructure~~ | **DEFERRED** | Code signing |

### Shared Integration Tasks

| When | Task | Owners | Status |
|------|------|--------|--------|
| End of Week 1 | Gate 1: validate LLMProvider interface + both providers | B delivers, A validates | Pending |
| End of Week 5 | Gate 2: all Phase 3e features work E2E (except auto-update) | Both | Pending |
| End of Week 6 | Phase 3e exit criteria validation | Both | Pending |

---

## Risk Register

| # | Risk | Prob | Impact | Mitigation | Contingency |
|---|------|------|--------|------------|-------------|
| R1 | Anthropic Messages API SSE format differs from OpenRouter, breaking shared streaming | Med | High | Each provider handles its own SSE parsing internally. Interface returns domain types | Descope to non-streaming for Anthropic. OpenRouter remains default |
| R2 | ~~`index.ts` merge conflicts when both agents modify it (W5)~~ | — | — | **RESOLVED**: Sprint 31 deferred. Only Agent A modifies `index.ts` (W1, W4) | — |
| R3 | Mermaid library is heavy, causes renderer performance issues | Low | Med | Lazy-load via `React.lazy`. Only import when `.mmd` files opened or viz shown | Defer Mermaid to Phase 4, show as raw text |
| R4 | OpenCode CLI unavailable or incompatible output format | Med | Low | Factory defaults to Claude CLI. OpenCode marked "experimental" in settings | Stub provider returning "not yet supported" |
| R5 | `fs.watch` recursive unreliable on some platforms | Low | Med | Node.js 19+ (Electron 33) supports recursive `fs.watch`. Test on macOS first | Fallback to polling (check every 3s) |
| R6 | ~~electron-updater requires code signing~~ | — | — | **RESOLVED**: Sprint 31 deferred until code signing is configured | — |
| R7 | 12 features across 6 weeks too ambitious | Med | Med | Priority order: multi-provider LLM > chat file gen > de-anonymization. Viz is polish | Cut W5 viz polish (Sprint 33), roll into Phase 4 |

---

## Branch Policy

All work on current active branch. No new branches. Agents do not touch the same files in the same sprint week.

## CI Checks Before Each Sprint Completion

1. `pnpm typecheck` passes (zero errors)
2. `pnpm test` passes (all tests, no regressions)
3. Test count must be >= pre-sprint count
4. Gate-specific checks where applicable
