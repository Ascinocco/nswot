# nswot

A local-first Electron desktop app that turns stakeholder interview notes and Jira signals into evidence-backed SWOT analyses. Built for staff engineers in org-level problem-solving roles.

## Prerequisites

- Node.js 18+
- pnpm

## Setup

```bash
pnpm install
pnpm dev
```

## First-Run Flow

1. **Open a workspace** -- select a directory where your stakeholder profiles and notes live.
2. **Add profiles** -- create stakeholder profiles manually or import them from markdown files.
3. **Connect Jira** -- link your Jira Cloud instance to pull project data (epics, stories, comments).
4. **Run analysis** -- select a role perspective, choose profiles and Jira projects, then run a SWOT analysis.
5. **Chat with results** -- ask follow-up questions grounded in the analysis output.
6. **Export** -- export the SWOT analysis as a structured markdown file.

## Available Scripts

| Script | Description |
| --- | --- |
| `pnpm dev` | Start the app in development mode |
| `pnpm build` | Build the app for production |
| `pnpm test` | Run the test suite |
| `pnpm typecheck` | Run TypeScript type checking |
| `pnpm package` | Package the app for macOS (dmg + zip) |

## Tech Stack

- **Runtime**: Electron (main + renderer + preload)
- **Language**: TypeScript (strict mode)
- **Frontend**: React, React Router, TanStack Query
- **Database**: SQLite via better-sqlite3 (main process only)
- **Styling**: Tailwind CSS
- **LLM**: OpenRouter via OpenAI-compatible SDK
- **Build**: Vite (renderer), electron-vite
- **Package**: electron-builder
