# Bug Bash Plan — Round 2 (nswot Electron App)

Second-pass review of the nswot Electron app. 28 new bugs not covered in the first bug bash (BUGBASH-PLAN.md in test-repo). All items are in `src/main/` or `src/renderer/` — nothing in test-repo.

---

## Master List

### P0 — Critical / Security

| ID | Bug | File(s) | Impact |
|----|-----|---------|--------|
| N1 | **`vp_engineering` role mapped to "Senior Engineering Manager"** — ternary only handles two of three roles | `chat.service.ts:67` | LLM gives wrong-role advice for VP users |
| N2 | **Anthropic/OpenRouter 429s never retried, 5xx never trips circuit** — `DomainError` lacks `.status` property so `isRetryable()` and `shouldTrip()` fall through to `false` | `anthropic.provider.ts:241-255`, `openrouter.provider.ts`, `circuit-breaker.ts`, `retry.ts` | Rate-limited requests fail immediately; broken API has no circuit protection |
| N3 | **No timeout on SSE stream reads** — `AbortSignal.timeout(30s)` only covers initial fetch; `while(true)` reader loop has no timeout | `anthropic.provider.ts:101-116`, `openrouter.provider.ts:55-71` | App hangs permanently if LLM stalls mid-stream |
| N4 | **GitHub PAT leaked in git clone error messages** — `stderr` from failed `git clone` contains full `https://{PAT}@github.com/...` URL | `codebase.provider.ts:303-321`, `opencode.provider.ts:204-221` | Secret exposed in logs/error UI |
| N5 | **Agent silently completes at 25 iterations** — loop falls through, returns `ok()` with partial content, `interrupted` stays `false` | `agent.service.ts:115, 231-242` | User sees truncated/empty result with no warning |
| N6 | **Conversation history corrupted after abort** — assistant message with N `tool_calls` pushed, but 0 tool result messages after interrupt. Resuming sends invalid history to LLM | `agent.service.ts:204-227` | Conversation can't resume after interrupt — LLM API errors |
| N7 | **Mermaid SVG set via `innerHTML`** — bypasses React's XSS protection in Electron context | `mermaid-renderer.tsx:46`, `mermaid-block.tsx:47` | XSS in Electron → potential arbitrary code execution |
| N28 | **LLM generation killed mid-stream by 30s fetch timeout (regression)** — A7 added `AbortSignal.timeout(30_000)` to all provider fetch calls including streaming LLM calls. Analysis generation easily produces 5k+ tokens taking well over 30s, so the timeout aborts the stream before completion. This was working before A7. The 30s timeout is appropriate for non-streaming calls (Jira, Confluence, GitHub) but far too short for streaming LLM generation | `anthropic.provider.ts`, `openrouter.provider.ts` | **Core functionality broken** — analysis generation and chat responses cut off mid-stream |

### P1 — Bugs

| ID | Bug | File(s) | Impact |
|----|-----|---------|--------|
| N8 | **`continueAfterToolResults` has no error handling** — no try-catch, callers return `ok()` before continuation fails | `chat.service.ts:475-533` | Unhandled rejection; user never gets continuation response after tool approve/reject |
| N9 | **`continueAfterToolResults` silently exits if API key null** — `return;` with no error or feedback | `chat.service.ts:482-483` | Tool approved but conversation dead-ends |
| N10 | **Confluence token refresh has no mutex** — unlike `IntegrationService.getTokens()`, no `refreshPromise` guard | `confluence.service.ts:369-400` | Concurrent ops with expired token → double refresh → second fails |
| N11 | **`conversation.service.touch()` no error handling** — returns `Promise<void>` not `Result`, no try-catch | `conversation.service.ts:109-111` | Unhandled rejection on DB error |
| N12 | **`unchanged` count always zero in comparisons** — no delta with `kind: 'unchanged'` ever emitted; `DeltaKind` type doesn't include it | `comparison.service.ts:93-200` | Comparison summaries always show 0 unchanged items |
| N13 | **Model pricing always uses first model** — ignores `selectedModelId` | `chat-analysis.tsx:311-324` | Wrong cost estimate displayed to user |
| N14 | **Jira setup `useState` initialized from async data** — `preferences` is `undefined` on mount; saved credentials always show empty | `jira-setup.tsx:36-37` | Users must re-enter Jira client ID/secret every time |
| N15 | **`fetch_jira_data` ignores `projectKeys` parameter** — always returns ALL cached data. Same for `fetchConfluenceData` (`spaceKeys`) and `fetchGithubData` (`repos`) | `read-executor.ts:57-222` | LLM gets all data regardless of request; wastes context tokens |
| N16 | **Final `onTokenCount` resets to 0** — when provider doesn't report `usage`, `outputTokens` stays 0 and overwrites streaming estimate | `agent.service.ts:103, 234` | Token counter jumps to 0 at end of turn |
| N17 | **`FileWatcher` never emits `'unlink'`** — `rename` always mapped to `'add'`; deletions reported as additions | `file-watcher.ts:29-33` | File deletion events lost |
| N18 | **`spawnWithTimeout` race between `close` and `error`** — abort can resolve with partial output OR reject nondeterministically | `codebase.provider.ts:413-468`, `action-executor.ts:326-381` | Timeout behavior inconsistent |
| N19 | **Unhandled exception in `ANALYSIS_RUN` after success** — post-analysis chat message insert not in try-catch | `analysis.ipc.ts:94-128` | User sees error despite analysis completing |
| N20 | **`extractTextForLlm` sends raw JSON to LLM** — falls back to `message.content` for blocks-only messages, which is serialized JSON | `agent.ipc.ts:234-247` | LLM receives garbage JSON; degrades multi-turn quality |
| N21 | **`DirectoryNode` fetches all directories eagerly** — `useDirectory()` called even when collapsed | `file-browser.tsx:22-23` | Performance: cascade of IPC calls for large file trees |
| N22 | **`MemoryIndicator` polling continues after unmount** — no cancellation flag for in-flight async | `memory-indicator.tsx:62-103` | Memory leak from recursive timeouts |
| N23 | **`updateStatus('failed')` in catch block has no try-catch** — can lose original error and stall UI | `analysis.service.ts:233-245` | Original error lost; UI stuck in "running" state |

### P2 — Low / Latent

| ID | Bug | File(s) | Impact |
|----|-----|---------|--------|
| N24 | **Anthropic provider drops all but last system message** | `anthropic.provider.ts:271-286` | Multi-system-message prompts silently truncated |
| N25 | **Unhandled promises from `setProvider`/`settings.set`** | `provider-picker.tsx:18`, `api-key-step.tsx:19` | Silent failures, provider state desync |
| N26 | **Write executor `PHASE3C_TOOL_NAMES` manually maintained** — won't pick up new tools from `FILE_WRITE_TOOL_NAMES` | `write-executor.ts:5-8` | New write tools silently fail |
| N27 | **`ChatRepository.insert()` doesn't parse blocks** — returns inconsistent `ChatMessage` for blocks-format inserts | `chat.repository.ts:50-64` | Latent: consumers of return value get unparsed blocks |

---

## Agent Assignments

### Agent A — Agent System & Chat Services

**Scope**: `agent.service.ts`, `chat.service.ts`, `conversation.service.ts`, `comparison.service.ts`, `analysis.service.ts`, `analysis.ipc.ts`. Core agent loop, chat flows, and service-layer error handling.

| Task | Items | Description |
|------|-------|-------------|
| ✅ **A1: Fix chat role mapping** | N1 | DONE — Replaced ternary with `ROLE_LABELS` lookup map for all three roles. Added test for `vp_engineering`. |
| ✅ **A2: Fix agent loop silent exit + token count** | N5, N16 | DONE — N5: Detect loop exhaustion, set `interrupted = true`, log warning, append truncation notice. N16: Fall back to `outputTokensEstimated` when provider `usage` is null. |
| ✅ **A3: Fix conversation history after abort** | N6 | DONE — Push partial results + stub `[Interrupted]` messages for unanswered tool calls after abort. |
| ✅ **A4: Fix `continueAfterToolResults`** | N8, N9 | DONE — N8: Wrapped in try-catch, stores error as assistant message. N9: Logs error and stores feedback message when API key is null. |
| ✅ **A5: Fix service error handling gaps** | N11, N19, N23 | DONE — N11: `touch()` wrapped in try-catch. N19: Post-analysis chat insert wrapped in try-catch. N23: `updateStatus('failed')` wrapped in try-catch with Logger. |
| ✅ **A6: Fix comparison unchanged count** | N12 | DONE — Added `'unchanged'` to `DeltaKind`. Emit `unchanged` delta for matched items with no changes. Updated tests. |

### Agent B — Providers & Infrastructure

**Scope**: `anthropic.provider.ts`, `openrouter.provider.ts`, `codebase.provider.ts`, `opencode.provider.ts`, `confluence.service.ts`, `read-executor.ts`, `write-executor.ts`, `file-watcher.ts`, `circuit-breaker.ts`, `retry.ts`. LLM providers, external integrations, infrastructure utilities.

| Task | Items | Description |
|------|-------|-------------|
| **B1: Fix DomainError lacking `.status` for retry/circuit** ✅ | N2 | Added optional `status?: number` to `DomainError` constructor. Both Anthropic and OpenRouter providers now pass HTTP status code when throwing. `isHttpError()` in retry.ts and circuit-breaker.ts now matches these errors — 429 retried with backoff, 5xx trips circuit |
| **B2: Fix LLM provider timeouts (regression + gap)** ✅ | N3, N28 | **N28:** Replaced `AbortSignal.timeout(30s)` with `AbortController` + manual connection timeout cleared on response. Streaming body no longer killed by 30s timeout. `listModels()` still uses 30s timeout. **N3:** Added 60s inactivity timeout in `readSSEStream` — each `reader.read()` raced against a timeout promise with cleanup via `.finally()`. Applied to both Anthropic and OpenRouter |
| **B3: Sanitize PAT from error messages** ✅ | N4 | Both `codebase.provider.ts` and `opencode.provider.ts` `gitClone()` now strip credentials from stderr via `stderr.replace(/https:\/\/[^@]+@/g, 'https://***@')` before throwing |
| **B4: Add Confluence token refresh mutex** ✅ | N10 | Added `refreshPromise` guard to `ConfluenceService.getTokens()` — concurrent refresh attempts deduplicated. Extracted refresh logic into `refreshTokensInternal()`. Same pattern as `IntegrationService` |
| **B5: Fix read executor filter parameters** ✅ | N15 | `fetchJiraData` now filters by `projectKeys` (via `resourceId` prefix). `fetchConfluenceData` filters by `spaceKeys` (via `resourceId` prefix). `fetchGithubData` filters by `repos` (via `resourceId` prefix). All fall back to all data when param is empty |
| **B6: Fix FileWatcher unlink events** ✅ | N17 | On `rename` events, checks `existsSync(fullPath)` — emits `'unlink'` if gone, `'add'` if present. Imported `existsSync` and `join` |
| **B7: Fix spawnWithTimeout race** ✅ | N18 | Added `settled` flag to `spawnWithTimeout` in `codebase.provider.ts`, `opencode.provider.ts`, and `action-executor.ts`. Only the first of `close`/`error` settles the promise |
| **B8: Fix Anthropic system message handling** ✅ | N24 | `extractSystemMessage()` now collects all system messages into an array and joins with `\n\n` instead of overwriting with the last one |
| **B9: Fix write executor tool name set** ✅ | N26 | Replaced manual `['write_markdown_file', 'write_csv_file', 'write_mermaid_file']` with `FILE_WRITE_TOOL_NAMES` import from `action-tools.ts` |

### Agent C — Renderer & Data Layer

**Scope**: `chat-analysis.tsx`, `jira-setup.tsx`, `mermaid-renderer.tsx`, `mermaid-block.tsx`, `file-browser.tsx`, `memory-indicator.tsx`, `provider-picker.tsx`, `api-key-step.tsx`, `agent.ipc.ts`, `chat.repository.ts`. Frontend components, IPC-facing utilities, and repository serialization.

| Task | Items | Description |
|------|-------|-------------|
| **C1: Fix Mermaid XSS** ✅ | N7 | Added DOMPurify sanitization with SVG profile to both `mermaid-renderer.tsx` and `mermaid-block.tsx` |
| **C2: Fix model pricing** ✅ | N13 | Pricing now looks up model matching `selectedModelId`, falls back to first model. Re-fetches when selection changes |
| **C3: Fix Jira setup credentials** ✅ | N14 | Added `useEffect` to sync preferences into state when async data loads. Uses `prev || value` to avoid overwriting user edits |
| **C4: Fix `extractTextForLlm` raw JSON fallback** ✅ | N20 | When no text blocks exist, generates `[Assistant provided: SWOT analysis results, chart visualization]` instead of raw JSON |
| **C5: Fix DirectoryNode eager fetch** ✅ | N21 | Added `enabled` param to `useDirectory()`. `file-browser.tsx` passes `expanded` so collapsed dirs skip IPC |
| **C6: Fix MemoryIndicator unmount** ✅ | N22 | Added `cancelled` flag to both initial fetch and polling effects. Checked after every `await` before setState/scheduling |
| **C7: Fix unhandled IPC promises** ✅ | N25 | Added `.catch()` to `setProvider()` in `provider-picker.tsx`, `settings.set()` and `setProvider()` in `api-key-step.tsx`, and `setEditorContext()` in `editor-context.ts` |
| **C8: Fix ChatRepository blocks parsing** ✅ | N27 | `insert()` now parses `content` JSON into `blocks` field when `contentFormat === 'blocks'`, matching `toDomain()` behavior |

---

## Execution Order

All agents can start in parallel. Within each agent, tasks are ordered by priority.

```
Phase 1 (P0 — do first):
  Agent A: A1, A2, A3
  Agent B: B2 (regression — do FIRST), B1, B3
  Agent C: C1, C4

Phase 2 (P1 — do second):
  Agent A: A4, A5, A6
  Agent B: B4, B5, B6, B7
  Agent C: C2, C3, C5, C6

Phase 3 (P2 — do last):
  Agent B: B8, B9
  Agent C: C7, C8
```

---

## Notes

- **No overlap with BUGBASH-PLAN.md** (test-repo). That plan covers the test-repo microservices. This plan covers only the nswot Electron app (`src/main/` and `src/renderer/`).
- **No overlap with in-progress Agent A work** (A8 done, A9 in progress from first plan). Items here are distinct from A4-A13 in the original plan.
- **Agent A** has the most critical agent-loop bugs (silent exit, corrupt history).
- **Agent B** has the most critical provider bugs (broken retry/circuit breaker, stream hang, PAT leak).
- **Agent C** has the XSS security fix plus frontend correctness bugs.
- All agents should run the full test suite (`npm test` or equivalent) after each task to catch regressions.
