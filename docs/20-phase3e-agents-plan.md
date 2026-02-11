# Phase 3e — Parallel Sprints Agents Plan

> **Source of truth for status**: `docs/19-phase3e-sprint-plan.md` — check that document for current completion status, gate status, and backlog priorities.
>
> **This document** contains the detailed per-sprint instructions (scope, file ownership, completion criteria) for each agent. Agents should read their sprint instructions here, but track and update status in doc 19.
>
> **Branch policy**: All agents work on the current active branch. Do NOT create new branches.

---

## Completion Status (Quick Reference)

| Week | Agent A | Agent B |
|------|---------|---------|
| 1 | Sprint 22: Logging + Menu — PENDING | Sprint 23: LLM Provider Interface — PENDING |
| 2 | Sprint 24: Multi-Provider Wiring — PENDING | Sprint 25: Codebase Provider + Tags — PENDING |
| 3 | Sprint 26: Chat File Gen — PENDING | Sprint 27: Visualizations + Tags UI — PENDING |
| 4 | Sprint 28: De-anon Hover + Watcher — PENDING | Sprint 29: Onboarding Wizard — PENDING |
| 5 | Sprint 30: Editor Context UI — PENDING | Sprint 31: Auto-Update — PENDING |
| 6 | Sprint 32: Mermaid + File Approval — PENDING | Sprint 33: Viz Polish + Provider UI — PENDING |
| 7 | Sprint 34: E2E Tests — PENDING | Sprint 35: Documentation — PENDING |

---

## Week 1

## Agent A — Sprint 22: Structured Logging + App Menu + Keyboard Shortcuts

> **Status: PENDING.**

READ FIRST:

- docs/19-phase3e-sprint-plan.md (your execution plan — you are Agent A, Week 1)
- docs/02-architecture-spec.md (layered architecture rules)
- CLAUDE.md (project conventions)
- src/main/index.ts (bootstrap sequence — your primary modification target)

SCOPE:

1. Create `src/main/infrastructure/logger.ts` — Logger class with:
   - Log levels: debug, info, warn, error
   - Console output (always)
   - Optional file output to `~/.nswot/logs/` (daily rotation, e.g., `nswot-2026-02-11.log`)
   - Configurable via environment variable or preference (default: info level)
   - Singleton pattern or injectable instance
2. Create `src/main/infrastructure/logger.test.ts` — Tests for log levels, file output, rotation
3. Adopt logger in `src/main/index.ts`:
   - Replace any `console.*` calls with logger
   - Add startup logging (app version, platform, Node version)
   - Log unhandled errors via `process.on('uncaughtException')`
4. Build native macOS menu in `src/main/index.ts` using `Menu.buildFromTemplate`:
   - **App menu**: About, Preferences (Cmd+comma → navigates to settings), Quit (Cmd+Q)
   - **Edit menu**: Undo, Redo, Cut, Copy, Paste, Select All (standard Cmd+Z/X/C/V/A)
   - **View menu**: Reload (Cmd+R), Toggle DevTools (Cmd+Option+I), actual Full Screen
   - **Window menu**: Minimize (Cmd+M), Close (Cmd+W)
   - **Help menu**: Learn More (opens GitHub/docs URL)
5. Add IPC channel for menu → renderer navigation (e.g., `menu:navigate` channel for Preferences → settings page)

FILES YOU OWN:

- src/main/infrastructure/logger.ts (NEW)
- src/main/infrastructure/logger.test.ts (NEW)
- src/main/index.ts (menu + logging additions)
- src/main/ipc/channels.ts (append menu channels only)
- src/preload/index.ts (append menu event listener only)

FILES TO AVOID: Do NOT modify `src/main/providers/llm/*`, `src/main/services/settings.service.ts`, or `src/main/domain/errors.ts` — Agent B owns those this week.

COMPLETION CRITERIA:

- Logger writes to console and file with correct levels
- Log file appears in `~/.nswot/logs/` with daily naming
- Native macOS menu renders with all standard shortcuts working
- Cmd+comma navigates to settings page
- `pnpm typecheck && pnpm test` passes with no regressions

WHEN DONE: Update Sprint 22 in docs/19-phase3e-sprint-plan.md completion log. Run `pnpm typecheck && pnpm test`.

---

## Agent B — Sprint 23: LLM Provider Interface + Anthropic Provider (Gate 1 Owner)

> **Status: PENDING.**

READ FIRST:

- docs/19-phase3e-sprint-plan.md (you are Agent B, Week 1 — Gate 1 owner)
- docs/02-architecture-spec.md (layered architecture, provider pattern)
- docs/06-error-handling-strategy.md (Result type, error codes)
- CLAUDE.md (project conventions)
- src/main/providers/llm/openrouter.provider.ts (current LLM provider)
- src/main/providers/llm/llm.types.ts (current LLM types)
- src/main/services/analysis.service.ts (find `sendToOpenRouter` method — the SSE streaming logic to extract)
- src/main/services/chat.service.ts (find streaming/completion method — the chat SSE logic)
- src/main/analysis/pipeline-step.ts (LlmCaller interface — the contract your provider must satisfy)
- src/main/services/settings.service.ts (API key storage pattern)
- src/main/infrastructure/safe-storage.ts (secure storage interface)

SCOPE:

1. Create `src/main/providers/llm/llm-provider.interface.ts`:
   ```typescript
   export interface LLMProvider {
     listModels(apiKey: string): Promise<LlmModel[]>;
     createChatCompletion(request: {
       apiKey: string;
       modelId: string;
       messages: Array<{ role: string; content: string }>;
       tools?: unknown[];
       temperature?: number;
       maxTokens?: number;
       onChunk?: (chunk: string) => void;
       onToken?: (tokenCount: number) => void;
     }): Promise<LlmResponse>;
   }
   ```
   Define `LlmResponse` type (content string, tool_calls array, finish_reason, usage stats).

2. Refactor `src/main/providers/llm/openrouter.provider.ts`:
   - Implement `LLMProvider` interface
   - Extract SSE streaming logic from `analysis.service.ts.sendToOpenRouter()` into `createChatCompletion()`
   - Keep existing `listModels()` method
   - The provider handles its own HTTP/SSE internals, returns domain types

3. Create `src/main/providers/llm/anthropic.provider.ts`:
   - Implement `LLMProvider` for Anthropic Messages API (`https://api.anthropic.com/v1/messages`)
   - SSE streaming with `x-api-key` auth header, `anthropic-version` header
   - `listModels()` returns hardcoded list of Claude models (or calls `/v1/models` if available)
   - Tool-use support via Anthropic's native tool_use format
   - Map Anthropic response format to shared `LlmResponse` type

4. Create `src/main/providers/llm/llm-provider-factory.ts`:
   - Factory function: `createLlmProvider(type: 'openrouter' | 'anthropic'): LLMProvider`
   - Default: `openrouter`

5. Add to `src/main/services/settings.service.ts`:
   - `setAnthropicApiKey(apiKey)` / `getAnthropicApiKey()` methods
   - Use secure storage key `anthropic_api_key`
   - `getApiKeyForProvider(type)` helper

6. Add error codes to `src/main/domain/errors.ts`:
   - `ANTHROPIC_AUTH_FAILED`
   - `ANTHROPIC_RATE_LIMITED`

7. Write tests:
   - `anthropic.provider.test.ts` — mock HTTP, verify SSE parsing, model listing
   - `llm-provider-factory.test.ts` — verify factory returns correct provider
   - `openrouter.provider.test.ts` — verify `createChatCompletion` works (refactored from inline analysis service logic)

FILES YOU OWN:

- src/main/providers/llm/llm-provider.interface.ts (NEW)
- src/main/providers/llm/openrouter.provider.ts (refactor)
- src/main/providers/llm/anthropic.provider.ts (NEW)
- src/main/providers/llm/llm-provider-factory.ts (NEW)
- src/main/providers/llm/llm.types.ts (extend with LlmResponse)
- src/main/services/settings.service.ts (Anthropic key methods)
- src/main/domain/errors.ts (append error codes)
- All related test files

FILES TO AVOID: Do NOT modify `src/main/index.ts`, `src/main/services/analysis.service.ts`, or `src/main/services/chat.service.ts` — Agent A owns those next week.

GATE 1 RESPONSIBILITY: Your `LLMProvider` interface and provider implementations become the contract for Week 2. Agent A will refactor analysis and chat services to use them. Make the interface stable and well-tested.

COMPLETION CRITERIA:

- `LLMProvider` interface is clean with `listModels` + `createChatCompletion`
- OpenRouterProvider implements interface with extracted SSE streaming
- AnthropicProvider implements interface with Anthropic Messages API
- Factory returns correct provider by type
- Anthropic API key stored/retrieved via secure storage
- All provider tests pass with mocked HTTP
- `pnpm typecheck && pnpm test` passes with no regressions

WHEN DONE: Update Sprint 23 and Gate 1 in docs/19-phase3e-sprint-plan.md. Run `pnpm typecheck && pnpm test`.

---

## Week 2

## Agent A — Sprint 24: Wire Multi-Provider LLM into Analysis + Chat

> **Status: PENDING.** Blocked on Gate 1.

PREREQUISITE: Gate 1 (Sprint 23) passed. LLMProvider interface and both providers available.

READ FIRST:

- docs/19-phase3e-sprint-plan.md (you are Agent A, Week 2)
- src/main/providers/llm/llm-provider.interface.ts (Gate 1 contract)
- src/main/providers/llm/llm-provider-factory.ts (provider selection)
- src/main/services/analysis.service.ts (your primary refactor target — find `sendToOpenRouter`)
- src/main/services/chat.service.ts (chat streaming to refactor)
- src/main/analysis/pipeline-step.ts (LlmCaller interface)
- src/main/index.ts (service wiring)

SCOPE:

1. Refactor `analysis.service.ts`:
   - Remove `sendToOpenRouter()` private method (logic now lives in `OpenRouterProvider.createChatCompletion`)
   - The LlmCaller closure should call `this.llmProvider.createChatCompletion(...)` instead
   - Accept `LLMProvider` in constructor (injected from index.ts)
   - Get API key based on active provider type from settings service
2. Refactor `chat.service.ts`:
   - Replace hardcoded OpenRouter streaming with `LLMProvider.createChatCompletion`
   - Tool-use parsing should work with both providers' tool_calls format
   - Accept `LLMProvider` in constructor
3. Update `index.ts`:
   - Read `llmProviderType` preference
   - Instantiate provider via factory
   - Pass provider to AnalysisService and ChatService
   - Create new circuit breaker for Anthropic if needed (or reuse existing LLM breaker)
4. Update `settings.service.ts`:
   - `listModels()` should call active provider's `listModels` with the correct API key
5. Add IPC: `settings:setLlmProvider` and `settings:getLlmProvider` channels
6. Tests: verify both providers work through analysis and chat (mocked HTTP)

FILES YOU OWN:

- src/main/services/analysis.service.ts
- src/main/services/chat.service.ts
- src/main/index.ts (provider wiring)
- src/main/services/settings.service.ts (listModels refactor)
- src/main/ipc/channels.ts (append provider channels)
- src/preload/* (append provider switching bridge)
- Related test files

FILES TO AVOID: Do NOT modify `src/main/providers/codebase/*`, `src/main/domain/types.ts`, `src/main/repositories/profile.repository.ts`, or `src/main/db/migrations.ts` — Agent B owns those this week.

COMPLETION CRITERIA:

- Analysis runs successfully with OpenRouter provider (existing behavior preserved)
- Analysis runs successfully with Anthropic provider (new capability)
- Chat streaming works with both providers including tool-use
- Provider switching via preference works
- All existing analysis and chat tests pass
- `pnpm typecheck && pnpm test` passes with no regressions

---

## Agent B — Sprint 25: Codebase Provider Abstraction + Profile Tags

> **Status: PENDING.**

READ FIRST:

- docs/19-phase3e-sprint-plan.md (you are Agent B, Week 2)
- src/main/providers/codebase/codebase.provider.ts (current implementation — subprocess pattern)
- src/main/providers/codebase/codebase.types.ts (existing types)
- src/main/services/codebase.service.ts (uses provider)
- src/main/domain/types.ts (Profile interface)
- src/main/repositories/profile.repository.ts (profile CRUD)
- src/main/db/migrations.ts (migration pattern)
- https://github.com/anomalyco/opencode (OpenCode CLI — understand invocation pattern)

SCOPE:

1. Create `src/main/providers/codebase/codebase-provider.interface.ts`:
   - `CodebaseProviderInterface` with `checkPrerequisites()`, `analyze(repoPath, prompt, options)`, `isAvailable()`
2. Refactor `codebase.provider.ts` to implement interface (rename class to `ClaudeCliCodebaseProvider` for clarity)
3. Create `src/main/providers/codebase/opencode.provider.ts`:
   - `OpenCodeProvider` implementing interface
   - Spawns `opencode` CLI with structured prompt
   - Same subprocess pattern as Claude CLI provider (spawn, capture stdout, parse JSON)
   - `checkPrerequisites()` checks `opencode` is in PATH
4. Create `src/main/providers/codebase/codebase-provider-factory.ts`:
   - Factory: `createCodebaseProvider(type: 'claude_cli' | 'opencode'): CodebaseProviderInterface`
5. Update `codebase.service.ts` — use factory to get active provider
6. Add `tags: string[]` field to `Profile` and `ProfileInput` in `domain/types.ts`
7. Migration v5: Add `tags` TEXT column (JSON array, default `'[]'`) to profiles table
8. Update `profile.repository.ts` — serialize tags as JSON on write, parse on read
9. Tests for OpenCode provider, factory, and profile tags

FILES YOU OWN:

- src/main/providers/codebase/* (all files)
- src/main/services/codebase.service.ts
- src/main/domain/types.ts (tags field only)
- src/main/db/migrations.ts (v5)
- src/main/repositories/profile.repository.ts (tags serialization)
- Related test files

FILES TO AVOID: Do NOT modify `src/main/services/analysis.service.ts`, `src/main/services/chat.service.ts`, or `src/main/index.ts` — Agent A owns those this week.

COMPLETION CRITERIA:

- CodebaseProviderInterface is clean and extensible
- Claude CLI provider works as before (refactored to interface)
- OpenCode provider spawns `opencode` CLI and parses output (may stub if CLI unavailable)
- Factory selects correct provider
- Profile has `tags: string[]` field persisted as JSON in SQLite
- Migration v5 applies cleanly
- `pnpm typecheck && pnpm test` passes with no regressions

---

## Week 3

## Agent A — Sprint 26: Chat-Driven File Generation + Editor Context Backend

> **Status: PENDING.** Depends on Sprint 24.

PREREQUISITE: Sprint 24 (multi-provider wiring) complete.

READ FIRST:

- docs/19-phase3e-sprint-plan.md (you are Agent A, Week 3)
- docs/12-chat-actions-plan.md (action tool pattern)
- src/main/providers/actions/action-tools.ts (existing tool definitions)
- src/main/providers/actions/action-executor.ts (existing executor)
- src/main/services/chat.service.ts (system prompt, available tools)
- src/main/services/file.service.ts (writeFile method + path validation)

SCOPE:

1. Add file-write tool definitions to `action-tools.ts`:
   - `write_markdown_file`: `{ path: string, content: string }` — write .md file to workspace
   - `write_csv_file`: `{ path: string, content: string }` — write .csv file
   - `write_mermaid_file`: `{ path: string, content: string }` — write .mmd file
   - All paths are workspace-relative
2. Implement file-write execution in `action-executor.ts`:
   - For file-write tools, call `FileService.writeFile()` directly (no CLI spawn needed)
   - Validate path stays within workspace root
   - Return `ActionResult` with `{ success: true, id: filePath }`
3. Update `chat.service.ts`:
   - Include file-write tools in available tools (always available when workspace is open — no integration dependency)
   - Add file-write instructions to system prompt: "You can write files to the user's workspace. Use write_markdown_file, write_csv_file, or write_mermaid_file tools. The user must approve before any file is written."
4. Add editor context IPC:
   - New channel `chat:setEditorContext` — renderer sends `{ filePath: string | null, contentPreview: string | null, selectedText: string | null }`
   - Store in ChatService as transient state per window
   - When building chat system prompt, append editor context section if available
5. Tests for file-write tools, executor file-write path, editor context injection

FILES YOU OWN:

- src/main/providers/actions/action-tools.ts
- src/main/providers/actions/action-executor.ts
- src/main/services/chat.service.ts (file-write tools + editor context)
- src/main/ipc/handlers/chat.ipc.ts (editor context handler)
- src/main/ipc/channels.ts (append)
- Related test files

FILES TO AVOID: Do NOT modify `src/renderer/components/analysis/swot-results.tsx`, profile form components, or `package.json` — Agent B owns those this week.

COMPLETION CRITERIA:

- 3 file-write tool definitions pass type checks
- ActionExecutor writes files via FileService with path validation
- File-write tools appear in chat available tools
- Editor context IPC stores and injects context into system prompt
- `pnpm typecheck && pnpm test` passes with no regressions

---

## Agent B — Sprint 27: Visualization Infrastructure + Profile Tags UI

> **Status: PENDING.** Depends on Sprint 25 (profile tags).

PREREQUISITE: Sprint 25 (profile tags backend) complete.

READ FIRST:

- docs/19-phase3e-sprint-plan.md (you are Agent B, Week 3)
- src/renderer/components/analysis/swot-results.tsx (integration target for charts)
- src/renderer/routes/profiles.tsx (profile form for tags UI)
- src/renderer/env.d.ts (types to extend)
- src/preload/api.ts (bridge types to extend)

SCOPE:

1. Install visualization dependencies: `d3`, `@types/d3`, `chart.js`, `react-chartjs-2`, `mermaid`
2. Create `src/renderer/components/visualizations/mermaid-renderer.tsx`:
   - Takes `content: string` (Mermaid syntax)
   - Renders diagram using `mermaid.render()` with dark theme config
   - Error boundary for invalid syntax
3. Create `theme-distribution-chart.tsx`:
   - Bar or pie chart showing theme frequency from analysis themes data
   - Uses Chart.js via react-chartjs-2
   - Dark theme styling (gray backgrounds, light text)
4. Create `swot-heatmap.tsx`:
   - Confidence heatmap across SWOT quadrants
   - Uses D3 for grid/cell rendering
   - Color scale: red (low) → yellow (medium) → green (high)
5. Create `source-coverage-chart.tsx`:
   - Horizontal bar chart showing evidence count per source type
   - Uses Chart.js
6. Integrate into `swot-results.tsx`:
   - Add "Visualizations" collapsible section below SWOT quadrants
   - Show heatmap, source coverage, and theme distribution if themes available
7. Update profile form with tags input:
   - Comma-separated text input that creates tag pills
   - Display tag pills on profile cards
   - Tags passed through to IPC via existing profile create/update flow
8. Update `preload/*` and `env.d.ts` with profile tags in Profile type, codebase provider selection types

FILES YOU OWN:

- src/renderer/components/visualizations/* (all NEW)
- src/renderer/components/analysis/swot-results.tsx (add viz section)
- Profile form/card components (add tags field)
- src/preload/api.ts (append types)
- src/preload/index.ts (append bridge)
- src/renderer/env.d.ts (append types)
- package.json (install viz deps)

FILES TO AVOID: Do NOT modify `src/main/providers/actions/*`, `src/main/services/chat.service.ts`, or `src/main/ipc/handlers/chat.ipc.ts` — Agent A owns those this week.

COMPLETION CRITERIA:

- Mermaid renderer renders diagrams from string content
- Theme distribution chart renders with mock data
- SWOT heatmap shows confidence grid
- Source coverage chart shows evidence distribution
- Charts integrated into SWOT results view
- Profile form has working tags input with pill display
- `pnpm typecheck && pnpm test` passes with no regressions

---

## Week 4

## Agent A — Sprint 28: De-anonymization Hover + File System Watching

> **Status: PENDING.**

READ FIRST:

- docs/19-phase3e-sprint-plan.md (you are Agent A, Week 4)
- src/main/analysis/anonymizer.ts (understand how pseudonym map is created)
- src/main/services/analysis.service.ts (where anonymization happens — find where map is stored/discarded)
- src/renderer/components/analysis/swot-results.tsx (where to add hover)
- src/main/services/workspace.service.ts (getCurrentPath for watcher)

SCOPE:

1. Add IPC for pseudonymMap:
   - `analysis:getPseudonymMap` channel
   - Handler reads `analysis.inputSnapshot.pseudonymMap` (verify this is stored — if not, modify the analysis pipeline to persist the map in inputSnapshot)
   - Returns `Record<string, string>` (pseudonym → real name)
2. Update preload bridge: `analysis.getPseudonymMap(analysisId)`
3. Create `src/renderer/hooks/use-pseudonym-map.ts` — React Query hook
4. Create `src/renderer/components/analysis/deanonymize-tooltip.tsx`:
   - Wraps text content, detects patterns like "Stakeholder A", "Person 1", etc.
   - On hover, shows tooltip with real name from pseudonymMap
   - Styled: dark background tooltip, subtle underline on hoverable text
   - Note: "Names shown locally only — never sent to LLM"
5. Integrate into `swot-results.tsx`:
   - Wrap evidence sourceId and quote text with DeanonymizeTooltip
   - Pass pseudonymMap from hook
6. Create `src/main/infrastructure/file-watcher.ts`:
   - Uses Node.js `fs.watch` with `{ recursive: true }` option
   - Watches workspace root directory
   - Debounces events (200ms) to avoid rapid-fire
   - Emits structured events: `{ type: 'add' | 'change' | 'unlink', path: string }`
   - Ignores `.git`, `node_modules`, `.nswot`
7. Wire into `index.ts`:
   - Start watcher when workspace opens (WorkspaceService emits workspace path)
   - Stop watcher on workspace change
   - Forward events to renderer via `file:changed` IPC event
8. Add file watcher IPC channels and preload bridge
9. Tests: file watcher (mock fs events), pseudonym map IPC

FILES YOU OWN:

- src/main/infrastructure/file-watcher.ts (NEW)
- src/main/infrastructure/file-watcher.test.ts (NEW)
- src/renderer/hooks/use-pseudonym-map.ts (NEW)
- src/renderer/components/analysis/deanonymize-tooltip.tsx (NEW)
- src/renderer/components/analysis/swot-results.tsx (add hover integration)
- src/main/ipc/handlers/analysis.ipc.ts (add pseudonym map handler)
- src/main/index.ts (watcher wiring)
- src/main/ipc/channels.ts (append)
- src/preload/* (append)

FILES TO AVOID: Do NOT modify `src/renderer/App.tsx`, `src/renderer/routes/settings.tsx`, or `src/renderer/env.d.ts` — Agent B owns those this week.

COMPLETION CRITERIA:

- Hover over anonymized labels in SWOT results reveals real names
- Tooltip clearly indicates "local only"
- File watcher detects add/change/unlink in workspace
- Events reach renderer via IPC
- Watcher respects ignore patterns (.git, node_modules)
- `pnpm typecheck && pnpm test` passes with no regressions

---

## Agent B — Sprint 29: Onboarding Wizard + Settings Provider Picker

> **Status: PENDING.**

READ FIRST:

- docs/19-phase3e-sprint-plan.md (you are Agent B, Week 4)
- src/renderer/App.tsx (routing — you'll add onboarding route)
- src/renderer/routes/settings.tsx (settings page — you'll add provider picker)
- src/renderer/hooks/use-settings.ts (existing settings hooks)
- src/renderer/routes/workspace.tsx and profiles.tsx (empty state patterns to follow)

SCOPE:

1. Create `src/renderer/routes/onboarding.tsx`:
   - Multi-step wizard: Welcome → API Key → Integrations Overview → Completion
   - Stepper UI at top showing progress
   - Back/Next buttons
   - Checks `onboardingComplete` preference to decide whether to show
2. Create step components in `src/renderer/components/onboarding/`:
   - `welcome-step.tsx` — App intro, value prop, "Get Started" button
   - `api-key-step.tsx` — API key input (reuse pattern from settings). Support both OpenRouter and Anthropic. Validate key works (test call) before allowing proceed
   - `integrations-step.tsx` — Brief overview of Jira, Confluence, GitHub, Codebase integrations with descriptions and "Set up later in Integrations" messaging
   - `completion-step.tsx` — Summary of what's configured, "Start Using nswot" button that sets `onboardingComplete=true` and navigates to workspace
3. Create `src/renderer/hooks/use-onboarding.ts`:
   - `useOnboardingStatus()` — queries `onboardingComplete` preference
   - `useCompleteOnboarding()` — mutation to set preference
4. Update `App.tsx`:
   - Add `/onboarding` route
   - On app start, if `onboardingComplete` is not `'true'`, redirect to `/onboarding`
5. Create `src/renderer/components/settings/provider-picker.tsx`:
   - Radio buttons or dropdown: "OpenRouter" vs "Anthropic (Direct API)"
   - Shows appropriate API key input field based on selection
   - Saves `llmProviderType` preference
   - Shows model list for selected provider
6. Update `settings.tsx` — Add provider picker section before or alongside existing API key section
7. Update `env.d.ts` — Add `llmProviderType` to settings types, add `getPseudonymMap` to analysis API

FILES YOU OWN:

- src/renderer/routes/onboarding.tsx (NEW)
- src/renderer/components/onboarding/* (all NEW)
- src/renderer/hooks/use-onboarding.ts (NEW)
- src/renderer/components/settings/provider-picker.tsx (NEW)
- src/renderer/App.tsx (add route + redirect)
- src/renderer/routes/settings.tsx (add provider picker)
- src/renderer/env.d.ts (append types)

FILES TO AVOID: Do NOT modify `src/main/index.ts`, `src/main/infrastructure/*`, `src/renderer/components/analysis/swot-results.tsx`, or `src/main/ipc/handlers/analysis.ipc.ts` — Agent A owns those this week.

COMPLETION CRITERIA:

- Fresh app launch (no `onboardingComplete` preference) redirects to wizard
- All 4 wizard steps render and navigate correctly
- API key validation works in wizard
- Completing wizard sets preference and navigates to workspace
- Subsequent launches skip wizard
- Provider picker in settings switches between OpenRouter and Anthropic
- Model list updates when provider changes
- `pnpm typecheck && pnpm test` passes with no regressions

---

## Week 5

## Agent A — Sprint 30: Editor Context UI + Integration Testing

> **Status: PENDING.** Depends on Sprints 26 and 28.

PREREQUISITE: Sprint 26 (editor context backend) and Sprint 28 (file watcher) complete.

READ FIRST:

- docs/19-phase3e-sprint-plan.md (you are Agent A, Week 5)
- src/renderer/components/analysis/chat-panel.tsx (chat UI)
- src/renderer/routes/workspace.tsx (workspace page with editor)
- src/main/ipc/channels.ts (editor context channel from Sprint 26)

SCOPE:

1. Create `src/renderer/lib/editor-context.ts`:
   - React context provider for editor state: `{ filePath, contentPreview, selectedText }`
   - `useEditorContext()` hook to read current state
   - `EditorContextProvider` component
2. Update `editor-pane.tsx`:
   - On file open/change: update editor context via IPC (`chat:setEditorContext`)
   - On text selection: update selectedText in context
3. Update `chat-panel.tsx`:
   - Show "Editor context: filename.ts" badge when editor context is available
   - Include in send payload
4. Update `workspace.tsx` — Wrap with EditorContextProvider
5. Update preload bridge — `chat.sendWithContext(analysisId, content, editorContext)` if not already done
6. Integration tests:
   - Multi-provider LLM: run analysis with mock Anthropic, verify SWOT output
   - File write from chat: mock action approval, verify file written to workspace
   - Editor context: verify context appears in chat system prompt

FILES YOU OWN:

- src/renderer/lib/editor-context.ts (NEW)
- src/renderer/components/workspace/editor-pane.tsx
- src/renderer/components/analysis/chat-panel.tsx
- src/renderer/routes/workspace.tsx
- src/preload/api.ts (append)
- src/preload/index.ts (append)
- Test files

FILES TO AVOID: Do NOT modify `src/main/index.ts`, `electron-builder.yml`, `src/renderer/App.tsx`, or CI workflows — Agent B owns those this week.

COMPLETION CRITERIA:

- Editor context shows in chat panel when file is open
- Context includes file path, content preview, and selected text
- Integration tests pass for multi-provider, file write, and editor context
- `pnpm typecheck && pnpm test` passes with no regressions

---

## Agent B — Sprint 31: Auto-Update Infrastructure

> **Status: PENDING.**

READ FIRST:

- docs/19-phase3e-sprint-plan.md (you are Agent B, Week 5)
- docs/13-ci-cd-and-release.md (existing CI/CD setup)
- docs/14-release-operations-runbook.md (release operations)
- electron-builder.yml (current build config)
- src/main/index.ts (app lifecycle)
- src/renderer/App.tsx (where to show update banner)

SCOPE:

1. Install `electron-updater` dependency
2. Update `electron-builder.yml`:
   - Add `publish` section for GitHub Releases
   - Configure auto-update channel
3. Create `src/main/infrastructure/auto-updater.ts`:
   - Wraps `electron-updater` autoUpdater
   - Check for updates on app start (with 10s delay) and every 4 hours
   - Emit IPC events: `update:available` (version info), `update:downloaded` (ready to install), `update:error` (error message), `update:progress` (download %)
   - `checkForUpdates()` and `installUpdate()` methods
   - Graceful handling when no publish config (dev mode)
4. Wire into `index.ts` — initialize after app ready, subscribe to events
5. Add IPC channels: `update:check` (manual trigger), `update:install` (quit and install)
6. Create `src/renderer/components/common/update-notification.tsx`:
   - Banner at top of app: "Update v{version} available" → "Downloading..." → "Ready to install"
   - "Install and Restart" button when downloaded
   - "Dismiss" button to hide banner
7. Create `src/renderer/hooks/use-auto-update.ts`:
   - Listen for update IPC events
   - Expose: `updateAvailable`, `updateVersion`, `downloadProgress`, `readyToInstall`, `checkForUpdate()`, `installUpdate()`
8. Integrate into `App.tsx` — Render UpdateNotification component at top
9. Update CI workflow — ensure release artifacts published to GitHub Releases
10. Tests for auto-updater (mocked electron-updater)

FILES YOU OWN:

- src/main/infrastructure/auto-updater.ts (NEW)
- src/main/infrastructure/auto-updater.test.ts (NEW)
- src/renderer/components/common/update-notification.tsx (NEW)
- src/renderer/hooks/use-auto-update.ts (NEW)
- src/main/index.ts (auto-updater init)
- src/renderer/App.tsx (update banner)
- src/main/ipc/channels.ts (append update channels)
- src/preload/index.ts (append update bridge)
- electron-builder.yml
- package.json (electron-updater dep)
- CI workflow files

FILES TO AVOID: Do NOT modify `src/renderer/components/workspace/*`, `src/renderer/components/analysis/chat-panel.tsx`, or `src/preload/api.ts` — Agent A owns those this week.

COMPLETION CRITERIA:

- Auto-updater initializes on app start
- Update check runs on schedule and manual trigger
- IPC events flow to renderer correctly
- Update notification banner renders with correct states
- Install button triggers quit-and-install
- Graceful degradation in dev mode (no crash)
- `pnpm typecheck && pnpm test` passes with no regressions

---

## Week 6

## Agent A — Sprint 32: Mermaid in Workspace + Chat File Approval UI

> **Status: PENDING.** Depends on Gate 2.

PREREQUISITE: Gate 2 passed.

READ FIRST:

- docs/19-phase3e-sprint-plan.md (you are Agent A, Week 6)
- src/renderer/components/visualizations/mermaid-renderer.tsx (Agent B Week 3 — reuse)
- src/renderer/components/analysis/approval-card.tsx (existing approval card pattern)
- src/renderer/components/analysis/chat-panel.tsx (where to render file approval)

SCOPE:

1. Create `src/renderer/components/chat/file-approval-card.tsx`:
   - Approval card for file-write tools (write_markdown_file, write_csv_file, write_mermaid_file)
   - Shows: file path, content preview (first 10 lines), format icon
   - For Mermaid: render preview using MermaidRenderer
   - Approve/Reject buttons following existing ApprovalCard pattern
2. Update `chat-panel.tsx` — render file-approval-card for file-write actions
3. Create `src/renderer/components/workspace/mermaid-preview.tsx`:
   - When `.mmd` file selected in file browser, render Mermaid diagram instead of Monaco editor
   - Reuses `mermaid-renderer.tsx` component
4. Update `editor-pane.tsx` — detect `.mmd` extension, show MermaidPreview
5. Update file browser — show `.mmd` files with diagram icon
6. Integration tests: chat file gen E2E, file approval flow, Mermaid rendering

FILES YOU OWN:

- src/renderer/components/chat/file-approval-card.tsx (NEW)
- src/renderer/components/workspace/mermaid-preview.tsx (NEW)
- src/renderer/components/analysis/chat-panel.tsx
- src/renderer/components/workspace/editor-pane.tsx
- File browser component
- Test files

FILES TO AVOID: Do NOT modify `src/renderer/routes/comparison.tsx`, codebase setup components, or `src/preload/*` — Agent B owns those this week.

COMPLETION CRITERIA:

- File approval cards render for all 3 file-write tool types
- Mermaid preview shows in approval card
- `.mmd` files render as diagrams in workspace editor
- File browser shows format-appropriate icons
- `pnpm typecheck && pnpm test` passes with no regressions

---

## Agent B — Sprint 33: Visualization Polish + Codebase Provider UI + File Watcher UI

> **Status: PENDING.** Depends on Sprint 28 (file watcher) and Sprint 25 (codebase provider).

READ FIRST:

- docs/19-phase3e-sprint-plan.md (you are Agent B, Week 6)
- src/renderer/routes/comparison.tsx (add viz tab)
- src/renderer/hooks/use-file-browser.ts (add file watcher events)
- Integrations page codebase setup section

SCOPE:

1. Create `coverage-radar-chart.tsx` — Radar chart for multi-source evidence coverage
2. Create `confidence-trend.tsx` — Confidence distribution comparison across analyses
3. Integrate into `comparison.tsx` — Add visualization section to comparison view
4. Add codebase provider picker to integrations page codebase section:
   - Radio: "Claude CLI (Recommended)" vs "OpenCode (Experimental)"
   - Saves `codebaseProviderType` preference
5. Update preload bridge — codebase provider selection, file watcher event listener
6. Update `use-file-browser.ts` — listen for `file:changed` events, invalidate directory queries
7. Tests for viz components and provider selection

FILES YOU OWN:

- src/renderer/components/visualizations/* (new components)
- src/renderer/routes/comparison.tsx (add viz section)
- Integrations page codebase setup section
- src/preload/api.ts (append)
- src/preload/index.ts (append)
- src/renderer/hooks/use-file-browser.ts
- Test files

FILES TO AVOID: Do NOT modify `src/renderer/components/analysis/chat-panel.tsx`, `src/renderer/components/workspace/*`, or file browser components — Agent A owns those this week.

COMPLETION CRITERIA:

- Radar and confidence trend charts render with data
- Charts appear in comparison view
- Codebase provider picker works
- File browser auto-refreshes when external file changes detected
- `pnpm typecheck && pnpm test` passes with no regressions

---

## Week 7

## Agent A — Sprint 34: Cross-Feature E2E Testing

> **Status: PENDING.** Depends on all prior sprints.

PREREQUISITE: All prior sprints complete.

READ FIRST:

- docs/19-phase3e-sprint-plan.md (you are Agent A, Week 7)
- docs/04-phases-roadmap.md § Phase 3e exit criteria

SCOPE:

1. E2E: Multi-provider LLM — switch provider, run analysis, verify both produce valid output
2. E2E: Chat file generation — chat writes markdown/mermaid to workspace with approval
3. E2E: Editor context — open file, chat references content
4. E2E: De-anonymization hover — hover reveals real names
5. E2E: Profile tags — create profile with tags, verify in analysis
6. E2E: Onboarding wizard — fresh launch completes wizard
7. Validate Phase 3e exit criteria

FILES YOU OWN: All test files (E2E tests only)

COMPLETION CRITERIA:

- All E2E tests pass
- Phase 3e exit criteria validated
- `pnpm typecheck && pnpm test` passes with no regressions

---

## Agent B — Sprint 35: Documentation + Final Polish

> **Status: PENDING.** Depends on all prior sprints.

PREREQUISITE: All prior sprints complete.

READ FIRST:

- docs/19-phase3e-sprint-plan.md (you are Agent B, Week 7)
- All existing docs (02, 04, 05, 08) for current state

SCOPE:

1. Update `docs/02-architecture-spec.md`:
   - Multi-provider LLM architecture (LLMProvider interface, factory, Anthropic provider)
   - Multi-provider codebase (CodebaseProviderInterface, OpenCode)
   - Structured logging
   - File system watching
   - Auto-update infrastructure
   - Visualization component architecture
2. Update `docs/04-phases-roadmap.md` — Mark Phase 3e completed with actual scope
3. Update `docs/05-domain-model.md` — Profile tags, LLMProvider, CodebaseProviderInterface
4. Update `docs/08-prompt-engineering.md` — File-write tool instructions, editor context additions
5. Update this document (docs/19-phase3e-sprint-plan.md) — Final completion log
6. Update `CLAUDE.md` — Logging conventions, multi-provider patterns
7. Final `pnpm typecheck && pnpm test` validation

FILES YOU OWN: All docs files, CLAUDE.md

COMPLETION CRITERIA:

- Documentation reflects current architecture accurately
- All sprints marked complete in docs/19
- CLAUDE.md updated with new patterns
- `pnpm typecheck && pnpm test` passes with no regressions

WHEN DONE: Update the top of docs/19 with: "All sprints complete. Phase 3e delivered in 7 weeks with two-agent parallel execution."
