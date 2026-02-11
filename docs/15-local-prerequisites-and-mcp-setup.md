# nswot - Local Prerequisites and MCP Setup

> Local setup reference for contributors and advanced users.
> Covers minimum tool versions, Claude Code CLI setup, Jira/GitHub MCP wiring, and OpenRouter key setup.

---

## 1. Minimum Supported Versions

- Node.js `>=22`
- pnpm `>=9`
- Git (latest stable recommended)
- Claude Code CLI (latest stable recommended)

Check installed versions:

```bash
node -v
pnpm -v
git --version
claude -v
```

---

## 2. Project Bootstrap

```bash
pnpm install
pnpm dev
```

The app starts in desktop dev mode after native dependency rebuild.

---

## 3. Claude Code CLI Setup

Install and authenticate Claude Code CLI using Anthropic's official guide:

- https://docs.anthropic.com/en/docs/claude-code

Basic verification commands:

```bash
claude -v
claude mcp list
```

If `claude` is not found, ensure your PATH includes the Claude CLI install location.

---

## 4. MCP Setup (Jira and GitHub)

nswot uses Claude Code MCP integrations for:

- Jira cross-reference during codebase analysis
- GitHub issue/PR actions from chat

### 4.1 Scope Recommendation

Use `--scope user` for local-only setup to avoid committing secrets in project config.

### 4.2 GitHub MCP (HTTP transport example)

```bash
claude mcp add --transport http github --scope user https://api.githubcopilot.com/mcp/
claude mcp list
claude mcp get github
```

Then in a Claude Code session, run `/mcp` and complete authentication if prompted.

### 4.3 Jira MCP (provider endpoint required)

Use your Jira MCP server endpoint from your MCP provider/team setup:

```bash
claude mcp add --transport http jira --scope user https://<your-jira-mcp-endpoint>/mcp
claude mcp list
claude mcp get jira
```

Then run `/mcp` inside Claude Code and complete the auth flow.

### 4.4 Troubleshooting MCP Registration

```bash
claude mcp list
claude mcp get github
claude mcp get jira
```

If needed, remove and re-add:

```bash
claude mcp remove github
claude mcp remove jira
```

---

## 5. OpenRouter API Key Setup

The SWOT synthesis pipeline requires an OpenRouter API key.

1. Create key at https://openrouter.ai
2. Start nswot.
3. Open Settings.
4. Paste key in the API key field and save.
5. Optionally test by running a small analysis.

The key is stored through Electron `safeStorage` (not plaintext in repo).

---

## 6. Local Setup Validation Checklist

- `pnpm dev` launches the app.
- Settings screen accepts and persists OpenRouter key.
- `claude -v` returns a valid version.
- `claude mcp list` includes `jira` and `github`.
- `/mcp` in Claude Code shows both servers as authenticated/ready.

---

## 7. Security Notes

- Do not commit `.mcp.json` containing credentials.
- Prefer user-scope MCP servers for personal credentials.
- Do not store API keys in source files.
- Rotate tokens/keys if accidentally exposed.

