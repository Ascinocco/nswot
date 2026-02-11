# nswot - Org wide SWOT analysis

A local-first Electron desktop app that turns stakeholder interview notes, Jira signals, and codebase intelligence into evidence-backed SWOT analyses. Built for staff engineers in org-level problem-solving roles.

## Download

Download prebuilt desktop artifacts from GitHub Releases:

- **Releases page**: open the repository **Releases** tab on GitHub
- Assets are published per release for macOS (arm64), Windows, and Linux.
- Current distribution is **unsigned**. Your OS will block the app on first launch:
  - **macOS**: Right-click the app and choose **Open**, or go to **System Settings > Privacy & Security** and click **Open Anyway**.
  - **Windows**: Click **More info** on the SmartScreen dialog, then click **Run anyway**.
  - **Linux**: Run `chmod +x nswot-*.AppImage` before first launch.

## End-User Prerequisites

- **OpenRouter API key** — required for SWOT synthesis. Get one at [openrouter.ai](https://openrouter.ai).
- **Claude CLI** — required for codebase analysis and chat actions (Phase 3). Install from [docs.anthropic.com/claude-code](https://docs.anthropic.com/en/docs/claude-code).
- **Jira MCP server** — required for Jira cross-reference and Jira chat actions.
- **GitHub MCP server** — optional, required for GitHub chat actions.
- **Confluence MCP server** — optional, required for Confluence chat actions.

## Development Prerequisites

- **Node.js 18+**
- **pnpm 9+**
- **Git**
- See `docs/15-local-prerequisites-and-mcp-setup.md` for full command-based setup.

## Setup

```bash
pnpm install
pnpm dev
```

For full contributor setup (Claude CLI, MCP servers, and OpenRouter key flow), see `docs/15-local-prerequisites-and-mcp-setup.md`.

## First-Run Flow

1. **Open a workspace** — select a directory where your stakeholder profiles and notes live.
2. **Add profiles** — create stakeholder profiles manually or import them from markdown files.
3. **Connect integrations** — link Jira, Confluence, and/or GitHub to pull organizational signals.
4. **Analyze codebases** (Phase 3) — select repos for deep codebase analysis via Claude CLI.
5. **Run analysis** — select a role perspective, choose data sources, then run a SWOT analysis.
6. **Chat with results** — ask follow-up questions grounded in the analysis output. Create Jira tickets, Confluence pages, or GitHub issues directly from the chat.
7. **Export** — export the SWOT analysis as a structured markdown file.

## Available Scripts

| Script           | Description                           |
| ---------------- | ------------------------------------- |
| `pnpm dev`       | Start the app in development mode     |
| `pnpm build`     | Build the app for production          |
| `pnpm test`      | Run the test suite                    |
| `pnpm typecheck` | Run TypeScript type checking          |
| `pnpm package`   | Package the app for macOS (dmg + zip) |

## CI/CD and Releases

- Pipeline and release channel behavior: `docs/13-ci-cd-and-release.md`
- Release operations runbook: `docs/14-release-operations-runbook.md`
- Local setup commands (Claude CLI + MCP + OpenRouter): `docs/15-local-prerequisites-and-mcp-setup.md`

## Tech Stack

- **Runtime**: Electron (main + renderer + preload)
- **Language**: TypeScript (strict mode)
- **Frontend**: React, React Router, TanStack Query
- **Database**: SQLite via better-sqlite3 (main process only)
- **Styling**: Tailwind CSS
- **LLM (SWOT synthesis)**: OpenRouter via OpenAI-compatible SDK
- **LLM (Codebase analysis)**: Claude CLI (Phase 3)
- **Build**: Vite (renderer), electron-vite
- **Package**: electron-builder

## Architecture

See `docs/02-architecture-spec.md` for the full architecture specification. Key design decisions are documented in `docs/09-adr/`.

## Documentation

| Doc                                            | Purpose                                                    |
| ---------------------------------------------- | ---------------------------------------------------------- |
| `docs/01-product-spec.md`                      | MVP product scope                                          |
| `docs/02-architecture-spec.md`                 | Layered architecture specification                         |
| `docs/03-sprints.md`                           | Phase 1 (MVP) sprint plan                                  |
| `docs/04-phases-roadmap.md`                    | Phase 1/2/3 roadmap                                        |
| `docs/08-prompt-engineering.md`                | LLM prompt templates                                       |
| `docs/09-adr/`                                 | Architecture Decision Records                              |
| `docs/10-phase2-sprints.md`                    | Phase 2 sprint plan                                        |
| `docs/11-codebase-analysis-plan.md`            | Codebase analysis feature plan (Phase 3a)                  |
| `docs/12-chat-actions-plan.md`                 | Chat actions feature plan (Phase 3c)                       |
| `docs/13-ci-cd-and-release.md`                 | CI/CD workflows, release channels, and automation contract |
| `docs/14-release-operations-runbook.md`        | Day-2 release operations and failure triage                |
| `docs/15-local-prerequisites-and-mcp-setup.md` | Local command-based setup for contributors                 |
