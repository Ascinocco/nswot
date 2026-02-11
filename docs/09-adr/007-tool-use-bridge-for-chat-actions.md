# ADR-007: Tool-Use Bridge for Chat Actions

**Status**: Proposed
**Date**: 2025-02-11
**Context**: Phase 3c — Chat Actions

---

## Decision

Use a tool-use bridge architecture where OpenRouter (the chat LLM) drafts artifacts via `tool_use` calls, the user reviews and approves via an in-app approval card, and Claude CLI executes the creation via its MCP servers. This extends the existing two-tier LLM architecture (ADR-006) from read-only analysis to write-capable actions.

---

## Context

The SWOT chat is currently read-only. Users can ask follow-up questions about the analysis, but acting on recommendations (creating Jira epics, filing tech debt stories, writing Confluence summaries) requires leaving the app and manually recreating the LLM's suggestions in each external system.

Three approaches were considered:

### Option A: Implement Write APIs Directly in nswot

Add Jira, Confluence, and GitHub write API calls alongside the existing read integrations.

- **Pros**: No Claude CLI dependency, works without MCP servers, full control over API calls
- **Cons**: Massive scope increase — each system has different write APIs, authentication flows, and edge cases. OAuth scopes need expansion. nswot becomes responsible for credential management for writes across three systems. Every new action type requires new provider code.

### Option B: Claude CLI Handles Everything (Full Context)

Pass the entire SWOT context to Claude CLI, let it decide what to create, and execute via MCP.

- **Pros**: Single LLM call, no tool-use parsing needed
- **Cons**: Duplicates the full SWOT context into Claude CLI (expensive, slow). Claude CLI has no conversation history — can't build on previous chat exchanges. Every chat message that might lead to an action requires a full Claude CLI invocation. No clean separation between "thinking" and "doing".

### Option C: Tool-Use Bridge (Chosen)

OpenRouter drafts artifacts via `tool_use`, user approves, Claude CLI executes the narrow action via MCP.

- **Pros**: OpenRouter already has the full SWOT context and conversation history — it drafts the best artifacts. Claude CLI gets a tightly-scoped prompt ("create this exact issue") making it fast and cheap. User approval happens in-app with a preview. The ActionExecutor reuses the same subprocess pattern as CodebaseProvider (ADR-006).
- **Cons**: Requires parsing `tool_use` blocks from OpenRouter's SSE stream. Two LLM calls per action (OpenRouter draft + Claude CLI execute). Claude CLI must have MCP servers configured.

---

## Rationale

Option C was chosen because:

1. **Best artifact quality**: OpenRouter has the full SWOT context, conversation history, and the user's specific request. It produces better-structured Jira descriptions and Confluence content than a cold Claude CLI invocation would.

2. **Minimal Claude CLI cost**: Claude CLI receives only a narrow, pre-structured prompt — "create this Jira epic with these exact fields". No exploration, no reasoning about what to create. Typical execution: 1-2 turns, ~500 tokens.

3. **Infrastructure reuse**: The CodebaseProvider (Phase 3a) already establishes the pattern for spawning Claude CLI as a subprocess, parsing structured JSON output, and handling failures. The ActionExecutor follows the same pattern.

4. **No write credential management**: nswot never handles Jira/Confluence/GitHub write tokens. All write access flows through Claude CLI's own MCP configuration, which the user has already set up.

5. **Approval as a first-class concept**: The tool-use bridge naturally creates an approval checkpoint — the LLM proposes via `tool_use`, nswot intercepts and presents to the user, execution only happens on explicit approval. This is a hard constraint, not a feature flag.

6. **Extensibility**: Adding a new action type (e.g., Slack message, Linear issue) requires only a tool definition in `action-tools.ts` and a corresponding MCP server in the user's Claude CLI config. No new provider code in nswot.

---

## Consequences

### Positive

- Closes the insight-to-action gap — recommendations become tracked work without leaving the app
- User always sees and approves what will be created before execution
- Audit trail in `chat_actions` table tracks all proposed, approved, rejected, and failed actions
- No new write credentials to manage in nswot
- Pattern scales to any system with a Claude CLI MCP server

### Negative

- **OpenRouter must support tool-use**: Not all OpenRouter models support `tool_use`. The feature is only available when the selected model supports it.
- **Two-hop latency**: Draft (OpenRouter) + execute (Claude CLI) adds ~5-15 seconds per action after approval.
- **MCP dependency**: Users must have Claude CLI MCP servers configured with write access. This is an additional setup burden beyond the codebase analysis requirement (which only needs read access).
- **Stream parsing complexity**: Detecting `tool_use` blocks in the SSE stream requires careful accumulation of incremental `tool_calls` deltas alongside text content.

### Risks

- OpenRouter tool-use streaming format may vary between models. Mitigated by testing with primary models (Claude, GPT-4o) and defensive parsing.
- Claude CLI MCP execution failures (permissions, rate limits, network) must be surfaced clearly to the user. Mitigated by structured error result and retry option in UI.
- Batch action failures (e.g., epic created but child stories fail) require partial result handling. Mitigated by sequential execution with per-item result tracking.

---

## Alternatives Considered

See Options A and B above. Option A may be revisited as a fallback for users without Claude CLI, but the engineering cost is significantly higher.
