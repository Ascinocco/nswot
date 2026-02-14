# Bug Bash Phase 3 — MVP Demo Readiness Audit

Comprehensive codebase audit of the nswot Electron app (`src/main/` and `src/renderer/`). Focused on show-stoppers and significant bugs that would break or degrade an MVP demo. Excludes `test-repo/` and `test-project/`.

---

## P0 — Show-stoppers

### 1. Anthropic provider tool-use loop is completely broken

**Files:** `src/main/providers/llm/anthropic.provider.ts:297-314`

`extractSystemMessage()` strips `tool_calls` and `tool_call_id` from all messages, converting everything to plain `{ role, content }`. Anthropic's Messages API requires an entirely different format from OpenAI's:

- Tool calls must be `tool_use` content blocks inside assistant messages
- Tool results must be `role: 'user'` with `tool_result` content blocks (not `role: 'tool'`)

The agent loop constructs messages in OpenAI format. On the second iteration of any tool-using conversation, the Anthropic API rejects the malformed request with a 400 error.

**Impact:** Any demo using the Anthropic provider with agent tools fails completely. **Workaround:** Constrain demo to OpenRouter.

---

### 2. Switching conversations shows stale messages from the previous conversation

**File:** `src/renderer/routes/chat-analysis.tsx:224-308`

`handleSelectConversation` sets the new conversation ID but never clears `messages` state. The `useEffect` that loads messages guards with `if (messages.length > 0) return` — it sees the old conversation's messages and skips loading the new ones.

**Impact:** Open conversation A, go back, open conversation B → see conversation A's messages. Core demo flow broken.

**Fix direction:** Clear `messages` in `handleSelectConversation`, or key the component on `activeConversationId`, or replace the `messages.length > 0` guard with a ref tracking which conversation was last loaded.

---

### 3. Missing `await` on `deleteWithCascade`

**File:** `src/main/services/conversation.service.ts:100`

```ts
this.conversationRepo.deleteWithCascade(id);  // missing await
```

The function returns `ok(undefined)` before the cascade delete completes. If the delete fails, the error is an unhandled promise rejection swallowed silently.

**Impact:** Deleting a conversation appears to succeed but data may persist. Re-listing immediately shows the "deleted" conversation.

**Fix:** Add `await`.

---

### 4. Approval memory `remember` flag never transmitted from renderer

**Files:** `src/preload/index.ts:128-129`, `src/main/ipc/handlers/chat.ipc.ts:62`, `src/preload/api.ts:122`

The preload bridge's `approve()` signature is `(analysisId, actionId)` — the `remember` boolean is missing. The IPC handler expects it as a third argument but always gets `undefined`, defaulting to `false`.

**Impact:** "Remember this decision" checkbox does nothing. Users are re-prompted for every tool call every time.

**Fix:** Add `remember` parameter to preload bridge `approve()` and the `NswotAPI` type definition.

---

## P1 — Significant bugs

### 5. `writeFileContent` doesn't create parent directories

**File:** `src/main/infrastructure/file-system.ts:98-105`

No `mkdir -p` equivalent before `writeFile`. Writing to `reports/summary.md` in a fresh workspace fails with ENOENT because the `reports/` directory doesn't exist.

**Impact:** All file-write agent tools (`write_markdown_file`, `write_csv_file`, `write_mermaid_file`) fail for any nested path. "Create a report" demo flow fails.

**Fix:** Add `await mkdir(dirname(fullPath), { recursive: true })` before the write call. Same for `writeBinaryFileContent`.

---

### 6. `continueAfterToolResults` drops chained tool calls

**File:** `src/main/services/chat.service.ts:481-559`

After tool execution, the LLM continuation response may include new `toolCalls`. The method only checks `continuation.content` and stores it — `continuation.toolCalls` is silently ignored.

**Impact:** LLM plans multi-step actions (e.g., create epic then create stories) but stops after the first tool. Agent appears to give up mid-task.

**Fix:** Check `continuation.toolCalls` and either loop or re-enter the approval flow.

---

### 7. Token count double-counting in agent loop

**File:** `src/main/services/agent.service.ts:129-131`

`onToken(count)` fires with the **absolute** running count for the current stream (50, 100, 150...). But the handler does `outputTokensEstimated += count`, treating each absolute value as a delta. The token display inflates dramatically — 2x-3x the real values in multi-turn interactions.

**Impact:** Token counter shows obviously wrong numbers during any demo.

**Fix:** Track the last-seen value per stream and compute the delta, or reset `outputTokensEstimated` at the start of each LLM call within the loop.

---

### 8. Hardcoded 128K context window

**File:** `src/main/services/chat.service.ts:292, 517`

```ts
const contextWindow = 128_000;
```

Used for token budgeting regardless of the selected model. Models with 32K or 16K limits get requests exceeding their actual context length.

**Impact:** Chat with a smaller model fails with context-length-exceeded errors. The system prompt for chat includes full SWOT output + summaries + evidence, easily exceeding 32K.

**Fix:** Look up the model's actual `contextLength` from the models list.

---

### 9. Unscoped agent/streaming events leak across conversations

**Files:** `src/renderer/hooks/use-agent.ts:33-42`, `src/renderer/routes/chat-analysis.tsx:184-193, 205-212`

`useAgentState`, `useTokenCount`, `useAgentThinking`, and `useToolActivity` all accept events when `conversationId` is null (the `!conversationId` guard passes everything through). Pipeline progress doesn't filter by `analysisId`. Streaming chunks accept all chunks when `analysisIds` is empty.

**Impact:** Ghost "Thinking..." indicators, wrong token counts, and wrong pipeline progress from other conversations leak into the active view.

**Fix:** Only accept events when the conversation/analysis ID matches. When null, ignore events rather than accepting all.

---

### 10. No deep validation on `render_swot_analysis` items

**File:** `src/main/providers/agent-tools/render-executor.ts:52-70`

Validation checks `Array.isArray(strengths)` but doesn't validate individual item structure. LLMs can send items missing `claim`, `evidence`, or `confidence`. The renderer will crash or show "undefined".

**Impact:** LLMs frequently produce slightly malformed JSON. A render tool call with a bad SWOT item crashes the chat view's React component tree.

**Fix:** Validate each item has at least `claim` (string) and `evidence` (array) before creating the block.

---

### 11. AbortSignal not propagated to write tool executors

**Files:** `src/main/services/agent.service.ts:363`, `src/main/providers/agent-tools/tool-executor-router.ts:39`

`ToolExecutorInterface.execute()` has no `signal` parameter. Write tools that spawn CLI subprocesses can't be interrupted. User clicks "Interrupt" but waits up to 60s for subprocess timeout.

**Impact:** Interrupt appears broken during write tool execution.

**Fix:** Add optional `signal` to `ToolExecutorInterface` and propagate it through `ToolExecutorRouter` to `WriteExecutor`.

---

### 12. ThinkingBlock defaults to collapsed during streaming

**File:** `src/renderer/components/chat/blocks/thinking-block.tsx:12-13`

```ts
const [expanded, setExpanded] = useState(false);
```

The agent's reasoning is hidden behind a toggle while actively streaming. User sees "Thinking..." label but no content unless they know to click.

**Impact:** The agent's reasoning process — a key demo differentiator — is invisible by default.

**Fix:** Default `expanded` to `isStreaming`, or auto-expand when streaming starts.

---

### 13. Deleting an analysis orphans its linked conversation

**Files:** `src/main/ipc/handlers/analysis.ipc.ts:65-82`, `src/main/repositories/analysis.repository.ts:206-208`

`analysisRepo.delete(id)` cascades to messages/actions/themes via FK but leaves the conversation record. The conversation sidebar shows a dead entry that leads to an empty state.

**Impact:** After deleting an analysis, the conversation list has a zombie entry.

**Fix:** Clear `conversation_id` on the linked conversation or cascade-delete it if it has no remaining analyses.

---

### 14. Jira client secret stored in plaintext preferences

**File:** `src/renderer/components/integrations/jira-setup.tsx:53-55`

```ts
setPreference.mutate({ key: 'jiraClientSecret', value: clientSecret.trim() });
```

Stores the secret via `settings.set` in plain SQLite instead of `safeStorage`. Violates the security constraint "No secrets in SQLite or plaintext."

**Impact:** Not a crash, but a finding a customer security team would flag immediately.

**Fix:** Route through `safeStorage` like API keys and OAuth tokens.

---

## P2 — Minor / Latent

| # | File | Issue |
|---|------|-------|
| 15 | `agent.service.ts:77,96` | Single `abortController` field — race condition if two turns overlap, second overwrites first |
| 16 | `analysis.service.ts:222-227` | Non-null assertions (`!`) on optional pipeline context fields (`swotOutput`, `summariesOutput`, etc.) |
| 17 | `analysis.service.ts:159-165` | Profile-to-anonymizedLabel mapping relies on array index alignment — fragile if anonymizer reorders |
| 18 | `integration-cache.repository.ts:53-79` | Non-atomic SELECT+INSERT upsert can create duplicate cache entries under concurrent syncs |
| 19 | `confluence.service.ts:395-417` | Token refresh errors not wrapped in Result type — unclean error path |
| 20 | `openrouter.provider.ts:200-215` | Never reports token `usage` — UI shows 0 input tokens with OpenRouter provider |
| 21 | `analysis.ipc.ts:37,56,77` | Catch blocks capture `cause` but never pass it to `DomainError` — silent error context loss |
| 22 | `analysis.ipc.ts:98-129` | Initial chat message storage failure swallowed with no logging |
| 23 | `chat-action.repository.ts:79-93` | `updateStatus` unconditionally NULLs the `result` column instead of preserving existing value |
| 24 | `theme.ipc.ts` | Bypasses service layer — no workspace authorization check, no input validation |
| 25 | `mermaid-renderer.tsx:40` | `Date.now()` for element ID — can collide if two diagrams render in the same millisecond |
| 26 | `domain/types.ts:202-225` | `ActionToolName` union missing 3 render tool names (`render_summary_cards`, `render_quality_metrics`, `render_comparison`) |

---

## Recommended Fix Priority for Demo

### Fix immediately (P0):
1. **Bug 2** — Clear messages on conversation switch (small state fix)
2. **Bug 3** — Add `await` to `deleteWithCascade` (one-word fix)
3. **Bug 4** — Add `remember` param to preload bridge (3 files, small change)
4. **Bug 1** — If demo uses Anthropic: needs message format conversion. If demo uses OpenRouter: skip and constrain to OpenRouter.

### Fix before demo (P1, high bang-for-buck):
5. **Bug 5** — Add `mkdirSync` for parent dirs in `writeFileContent` (2-line fix)
6. **Bug 7** — Fix token double-counting (track last value, compute delta)
7. **Bug 12** — Auto-expand ThinkingBlock when `isStreaming` (1-line default change)
8. **Bug 9** — Scope event listeners by conversationId/analysisId (guard clauses)
9. **Bug 10** — Add shallow validation on SWOT item fields in render executor

### Can defer past demo:
- Bugs 6, 8, 11, 13, 14, and all P2s
