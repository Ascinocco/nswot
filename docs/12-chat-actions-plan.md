# nswot — Chat Actions via Claude CLI MCP

> **Feature plan for creating Jira tickets, Confluence pages, GitHub issues/PRs, and other artifacts directly from the SWOT chat interface.**
> Uses OpenRouter tool-use as the decision layer and Claude CLI with MCP servers as the execution layer.

---

## Problem

The current chat is **read-only** — the user can ask follow-up questions about the SWOT analysis, but cannot act on recommendations. A typical workflow today looks like:

1. Run SWOT analysis
2. Chat: "What should we do about the auth module tech debt?"
3. Assistant recommends creating a Jira epic with specific stories
4. User manually switches to Jira, creates the epic, types out the details from memory
5. Repeat for every recommendation

This friction between "insight" and "action" means recommendations go stale. The most valuable part of the analysis — turning findings into tracked work — requires the most manual effort.

---

## Solution

Enable the chat assistant to **create artifacts** in external systems on the user's behalf, with explicit approval before each action. The assistant drafts the artifact, the user reviews and approves, and Claude CLI executes the creation via its MCP servers.

### Tool-Use Bridge Architecture

```
User: "Create a Jira epic for the auth tech debt"
  │
  ▼
OpenRouter (chat LLM with tool definitions)
  │ Understands SWOT context
  │ Drafts artifact details
  │ Returns tool_use: create_jira_issue({...})
  │
  ▼
nswot chat service (tool-use interceptor)
  │ Detects tool_use in streamed response
  │ Sends draft to renderer for user approval
  │
  ▼
Renderer (approval UI)
  │ Shows artifact preview card
  │ User reviews, optionally edits, approves or rejects
  │
  ▼ (on approve)
nswot action executor
  │ Spawns Claude CLI with focused prompt:
  │ "Create this exact Jira epic using the Jira MCP tools"
  │
  ▼
Claude CLI (with Jira/Confluence/GitHub MCP)
  │ Executes MCP action
  │ Returns result (issue key, URL, etc.)
  │
  ▼
nswot chat service
  │ Feeds tool result back to OpenRouter
  │ Stores action record in DB
  │
  ▼
OpenRouter continues conversation:
  "Created PROJ-456: Auth Module Tech Debt Remediation. Here's the link: ..."
```

### Why This Architecture

- **OpenRouter stays as the brain**: It has the full SWOT context, conversation history, and the intelligence to draft well-structured artifacts. No need to duplicate all that context into Claude CLI.
- **Claude CLI stays as the hands**: It already has MCP servers configured with write access. We don't need to implement Jira/Confluence/GitHub write APIs in nswot.
- **User approval is mandatory**: The LLM drafts, the human approves. No auto-creation. This is a hard constraint, not a configuration option.
- **Clean separation**: The tool-use bridge is a narrow interface — OpenRouter outputs a structured tool call, nswot translates it to a Claude CLI invocation. Each side does what it's best at.

---

## Prerequisites

Same as codebase analysis, plus MCP write access:

- **Claude CLI** installed and authenticated (Pro, Max, or Team plan)
- **Jira MCP server** configured in Claude CLI (with write permissions for creating issues)
- **Confluence MCP server** configured in Claude CLI (optional, for creating pages)
- **GitHub MCP server** configured in Claude CLI (optional, for creating issues/PRs)
- **OpenRouter API key** configured in nswot

---

## Supported Actions

### Jira Actions

| Action | Tool Name | Key Fields |
|---|---|---|
| Create issue | `create_jira_issue` | project, summary, description, type (Epic/Story/Task/Bug), priority, labels, assignee |
| Create linked issues | `create_jira_issues` | Array of issues, with optional parent/epic link |
| Add comment | `add_jira_comment` | issue key, comment body |

### Confluence Actions

| Action | Tool Name | Key Fields |
|---|---|---|
| Create page | `create_confluence_page` | space, title, content (markdown), parent page (optional) |

### GitHub Actions

| Action | Tool Name | Key Fields |
|---|---|---|
| Create issue | `create_github_issue` | repo, title, body, labels, assignees |
| Create PR | `create_github_pr` | repo, title, body, head branch, base branch |

---

## Tool Definitions (OpenRouter)

OpenRouter supports tool-use via the `tools` parameter. Each action is defined as a tool:

```ts
const CHAT_ACTION_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'create_jira_issue',
      description: 'Create a Jira issue (epic, story, task, or bug). The user will review and approve before creation.',
      parameters: {
        type: 'object',
        properties: {
          project: { type: 'string', description: 'Jira project key (e.g., "PROJ")' },
          issueType: { type: 'string', enum: ['Epic', 'Story', 'Task', 'Bug'], description: 'Type of issue to create' },
          summary: { type: 'string', description: 'Issue title/summary' },
          description: { type: 'string', description: 'Issue description in markdown' },
          priority: { type: 'string', enum: ['Highest', 'High', 'Medium', 'Low', 'Lowest'], description: 'Issue priority' },
          labels: { type: 'array', items: { type: 'string' }, description: 'Issue labels' },
          parentKey: { type: 'string', description: 'Parent epic key for stories/tasks (optional)' },
        },
        required: ['project', 'issueType', 'summary', 'description'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_jira_issues',
      description: 'Create multiple related Jira issues at once (e.g., an epic with child stories). The user will review and approve before creation.',
      parameters: {
        type: 'object',
        properties: {
          issues: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                project: { type: 'string' },
                issueType: { type: 'string', enum: ['Epic', 'Story', 'Task', 'Bug'] },
                summary: { type: 'string' },
                description: { type: 'string' },
                priority: { type: 'string' },
                labels: { type: 'array', items: { type: 'string' } },
                parentRef: { type: 'string', description: 'Reference to another issue in this batch by index (e.g., "0" to link to the first issue)' },
              },
              required: ['project', 'issueType', 'summary', 'description'],
            },
          },
        },
        required: ['issues'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'add_jira_comment',
      description: 'Add a comment to an existing Jira issue. The user will review and approve before posting.',
      parameters: {
        type: 'object',
        properties: {
          issueKey: { type: 'string', description: 'Jira issue key (e.g., "PROJ-123")' },
          comment: { type: 'string', description: 'Comment body in markdown' },
        },
        required: ['issueKey', 'comment'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_confluence_page',
      description: 'Create a Confluence page. The user will review and approve before creation.',
      parameters: {
        type: 'object',
        properties: {
          space: { type: 'string', description: 'Confluence space key' },
          title: { type: 'string', description: 'Page title' },
          content: { type: 'string', description: 'Page content in markdown' },
          parentPageId: { type: 'string', description: 'Parent page ID (optional)' },
        },
        required: ['space', 'title', 'content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_github_issue',
      description: 'Create a GitHub issue. The user will review and approve before creation.',
      parameters: {
        type: 'object',
        properties: {
          repo: { type: 'string', description: 'Repository full name (e.g., "owner/repo")' },
          title: { type: 'string', description: 'Issue title' },
          body: { type: 'string', description: 'Issue body in markdown' },
          labels: { type: 'array', items: { type: 'string' }, description: 'Issue labels' },
        },
        required: ['repo', 'title', 'body'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_github_pr',
      description: 'Create a GitHub pull request. The user will review and approve before creation.',
      parameters: {
        type: 'object',
        properties: {
          repo: { type: 'string', description: 'Repository full name (e.g., "owner/repo")' },
          title: { type: 'string', description: 'PR title' },
          body: { type: 'string', description: 'PR description in markdown' },
          head: { type: 'string', description: 'Head branch name' },
          base: { type: 'string', description: 'Base branch name (e.g., "main")' },
        },
        required: ['repo', 'title', 'body', 'head', 'base'],
      },
    },
  },
];
```

These are passed to the OpenRouter API in the `tools` field. OpenRouter returns `tool_use` content blocks when the LLM decides to create an artifact.

---

## Chat System Prompt Update

The chat system prompt gains additional instructions when actions are enabled:

```
ACTIONS:
You have tools available to create artifacts in the user's systems (Jira, Confluence, GitHub).
When the user asks you to create something:
1. Use the appropriate tool with well-structured, detailed content.
2. Base all content on the SWOT analysis data — reference specific findings, evidence, and recommendations.
3. Write descriptions in clear markdown with context from the analysis.
4. For Jira issues, include acceptance criteria when relevant.
5. For Confluence pages, structure content with headers, findings, and action items.
6. The user will review your draft before it's created — be thorough rather than brief.
7. When creating multiple related items (e.g., epic + stories), use create_jira_issues to batch them.

Available Jira projects: {project_keys}
Available Confluence spaces: {space_keys}
Available GitHub repos: {repo_names}
```

The available projects/spaces/repos are populated from the user's connected integrations (already known by nswot).

---

## Chat Service Changes

### Tool-Use Detection

The current `streamCompletion()` method reads SSE chunks and accumulates text content. It needs to also detect tool-use blocks in the streamed response.

OpenRouter's streaming format for tool-use:
- Text content streams as `choices[0].delta.content`
- Tool calls stream as `choices[0].delta.tool_calls[{index, function: {name, arguments}}]`
- `finish_reason` is `"tool_calls"` when the LLM wants to call tools

The chat service must:

1. Detect `finish_reason: "tool_calls"` in the stream
2. Accumulate tool call arguments (they stream incrementally, like content)
3. Instead of storing the response as a regular message, emit a **pending action** to the renderer
4. Wait for user approval/rejection
5. On approval: execute via Claude CLI, feed result back to OpenRouter, continue
6. On rejection: feed rejection back to OpenRouter ("The user declined this action. Continue the conversation without creating it.")

### Message Flow (with tool-use)

```
User sends message
  ↓
ChatService.sendMessage()
  ↓
OpenRouter streams response (may contain text + tool_calls)
  ↓
If text only:
  → Store as assistant message (existing flow)

If tool_calls detected:
  → Stream any leading text to renderer as partial message
  → Parse tool call(s)
  → Emit pending action(s) to renderer via IPC event
  → Wait for approval (via new IPC handler)
  ↓
On approval:
  → ActionExecutor.execute(toolCall) → spawns Claude CLI
  → Claude CLI executes MCP action, returns result
  → Feed tool result back to OpenRouter as tool_result message
  → OpenRouter continues (streams confirmation text)
  → Store full conversation (user msg + assistant text + tool call + result + final text)

On rejection:
  → Feed rejection as tool_result: "User declined. Do not retry."
  → OpenRouter continues conversationally
  → Store conversation with rejection noted
```

---

## Action Executor (Claude CLI Bridge)

The action executor translates an approved tool call into a Claude CLI invocation.

### Invocation Pattern

```bash
claude --print --output-format json \
  --allowedTools "mcp__jira__*,mcp__confluence__*,mcp__github__*" \
  --max-turns 5 \
  --model sonnet \
  -p "$(cat action-prompt.txt)"
```

The prompt is tightly scoped:

```
Execute the following action using the available MCP tools. Do not modify the content.
Return the result as JSON with the fields: success (boolean), id (created resource ID), url (link to created resource), error (if failed).

ACTION: create_jira_issue
DETAILS:
- Project: PROJ
- Type: Epic
- Summary: Auth Module Tech Debt Remediation
- Description: (full markdown from the tool call)
- Priority: High
- Labels: ["tech-debt", "auth"]

Execute this now.
```

### Result Schema

```ts
interface ActionResult {
  success: boolean;
  id?: string;       // e.g., "PROJ-456", page ID, issue number
  url?: string;      // Link to the created resource
  error?: string;    // Error message if failed
}
```

### Batch Actions (create_jira_issues)

For batch creation, Claude CLI receives all issues in one prompt and creates them sequentially, linking children to parents as they're created:

```
Execute the following batch of Jira issue creations using MCP tools.
Create them in order. The first issue is the parent epic — use its key as the parent for subsequent stories.

Return results as a JSON array, one entry per issue.

ISSUES:
1. Epic: "Auth Module Tech Debt Remediation" in PROJ (High priority)
2. Story: "Add unit tests for AuthService" in PROJ (parent: issue #1)
3. Story: "Remove deprecated token validation" in PROJ (parent: issue #1)
4. Story: "Add circuit breaker to auth provider" in PROJ (parent: issue #1)
```

---

## UI Changes

### Approval Card

When the assistant proposes an action, the chat renders an **approval card** instead of (or after) the text response:

```
┌─────────────────────────────────────────────────┐
│ 📋 Create Jira Epic                             │
│                                                 │
│ Project: PROJ                                   │
│ Type: Epic                                      │
│ Summary: Auth Module Tech Debt Remediation       │
│ Priority: High                                  │
│ Labels: tech-debt, auth                         │
│                                                 │
│ Description:                                    │
│ ┌─────────────────────────────────────────────┐ │
│ │ Based on the SWOT analysis, the auth module │ │
│ │ was identified as a key weakness...         │ │
│ │ (rendered markdown preview)                 │ │
│ └─────────────────────────────────────────────┘ │
│                                                 │
│              [Edit]  [Reject]  [Create]         │
└─────────────────────────────────────────────────┘
```

- **Create**: Approves and executes the action
- **Reject**: Declines, continues conversation
- **Edit**: Opens an editable view of the fields before approving

For batch actions (`create_jira_issues`), the card shows all items in a collapsible list with a single "Create All" button.

### Action Status

After approval:
- **Executing**: spinner with "Creating Jira epic..."
- **Success**: green checkmark with link to created resource
- **Failed**: red error with message, option to retry

### Action History

Completed actions are stored and rendered inline in the chat as status cards:

```
┌─────────────────────────────────────────────────┐
│ ✅ Created PROJ-456: Auth Module Tech Debt       │
│    https://mysite.atlassian.net/browse/PROJ-456 │
└─────────────────────────────────────────────────┘
```

---

## Data Model

### New Table: `chat_actions`

```sql
CREATE TABLE chat_actions (
  id TEXT PRIMARY KEY,
  analysis_id TEXT NOT NULL REFERENCES analyses(id) ON DELETE CASCADE,
  chat_message_id TEXT REFERENCES chat_messages(id),
  tool_name TEXT NOT NULL,           -- e.g., 'create_jira_issue'
  tool_input TEXT NOT NULL,          -- JSON: the tool call arguments
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'executing', 'completed', 'failed', 'rejected')),
  result TEXT,                       -- JSON: ActionResult
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  executed_at TEXT
);
```

This provides:
- Audit trail of all proposed and executed actions
- Ability to show action history in the chat
- Recovery from mid-execution failures

---

## IPC Surface (New Channels)

```
chat:action:pending    → renderer (event): { actionId, toolName, toolInput, contextText }
chat:action:approve    ← renderer (invoke): { actionId } → IPCResult<ActionResult>
chat:action:reject     ← renderer (invoke): { actionId } → IPCResult<void>
chat:action:edit       ← renderer (invoke): { actionId, editedInput } → IPCResult<void>
chat:action:list       ← renderer (invoke): { analysisId } → IPCResult<ChatAction[]>
```

---

## Available Actions Detection

Not all users will have all MCP servers configured. The chat should only offer tools for systems the user has access to.

On chat initialization:
1. Check which integrations are connected in nswot (Jira, Confluence, GitHub)
2. Optionally: check Claude CLI MCP availability for each
3. Only include tool definitions for available systems in the OpenRouter request

```ts
function getAvailableTools(connectedIntegrations: string[]): Tool[] {
  const tools: Tool[] = [];
  if (connectedIntegrations.includes('jira')) {
    tools.push(CREATE_JIRA_ISSUE, CREATE_JIRA_ISSUES, ADD_JIRA_COMMENT);
  }
  if (connectedIntegrations.includes('confluence')) {
    tools.push(CREATE_CONFLUENCE_PAGE);
  }
  if (connectedIntegrations.includes('github')) {
    tools.push(CREATE_GITHUB_ISSUE, CREATE_GITHUB_PR);
  }
  return tools;
}
```

---

## Security & Safety

### Hard Constraints

- **User approval is mandatory**: Every action requires explicit user approval. No auto-execution, no configuration to bypass this.
- **No destructive actions**: Only create/add operations. No delete, no update, no close. If the user wants to modify an existing issue, they do it in the source system.
- **Audit trail**: Every proposed action (approved, rejected, or failed) is stored in `chat_actions`.
- **Scoped MCP access**: Claude CLI is only allowed MCP create/write tools for the specific action. Tool restrictions are set per invocation.

### Content Safety

- **Anonymized data**: The chat system prompt uses anonymized stakeholder names. Actions created from chat recommendations may reference anonymized labels. The approval step lets the user replace these with real names before creation.
- **No credential exposure**: Action execution happens through Claude CLI's own MCP configuration. nswot never handles Jira/Confluence/GitHub write credentials directly.

---

## Scope & Phasing

### Phase 3c — Chat Actions (2 sprints)

> Depends on: Phase 3a (codebase analysis) for Claude CLI infrastructure. The CodebaseProvider pattern for spawning Claude CLI and parsing output is reused by the ActionExecutor.

**Sprint 14: Tool-Use Bridge + Jira Actions**
- OpenRouter tool-use integration in chat service (tool definitions, stream parsing for tool_calls)
- ActionExecutor: spawn Claude CLI with MCP-scoped prompt, parse result
- Pending action IPC event flow (main → renderer)
- Approval/rejection IPC handlers (renderer → main)
- `chat_actions` table (migration)
- Approval card component in chat panel (preview, approve, reject)
- Action status display (executing, success, failed)
- Jira actions: create issue, create batch issues, add comment
- Chat system prompt update with action instructions

**Sprint 15: Confluence + GitHub Actions + Polish**
- Confluence action: create page
- GitHub actions: create issue, create PR
- Edit capability in approval cards
- Action history display in chat (inline status cards)
- Available actions detection (only show tools for connected integrations)
- Error handling: Claude CLI failures, MCP errors, partial batch failures
- Testing: tool-use stream parsing, approval flow, action execution

---

## Open Questions

1. **Edit depth**: How much editing should the approval card support? Just text fields, or a full structured form per action type?
2. **Action references**: Should created artifacts be linked back to the analysis? (e.g., Jira issue description includes "Generated from nswot analysis {id}")
3. **Template support**: Should users be able to save action templates? (e.g., "Always create tech debt epics in PROJ with these labels")
4. **Undo**: Should we support "undo" for recently created artifacts? (Would require delete permissions in MCP)
5. **Rate limiting**: Should we limit how many actions can be created per chat session? (Prevent accidental batch spam)
