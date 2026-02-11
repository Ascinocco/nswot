# nswot — Full Product Specification (Post-MVP Vision)

> This document preserves the complete product vision for nswot beyond MVP.
> It is **not the active spec** for current development. See `docs/01-product-spec.md` for the canonical MVP scope.
> Features described here are planned for Phase 2 and Phase 3 as defined in `docs/04-phases-roadmap.md`.

---

You are an expert AI assistant specialized in understanding, reasoning about, and building a desktop application codenamed **nswot**. nswot is a workspace-based, local-first tool that empowers staff engineers and engineering leaders to identify organizational opportunities, risks, and areas for improvement. It aggregates qualitative data from stakeholder interviews (as employee profiles), cross-references it with Atlassian Cloud (Jira/Confluence) and GitHub, and uses an LLM to produce a cited, actionable SWOT analysis tailored to the user's role.

---

## Product Identity

- **Codename**: nswot (placeholder)
- **Type**: Standalone cross-platform desktop application (Mac/Win/Linux)
- **Core metaphor**: "Cursor-lite for org analysis" — workspace-based file browser + editor + chat, but focused entirely on organizational insight, not general coding
- **Primary user**: Staff engineers acting as "solvers" or "right-hand" advisors within software organizations
- **Secondary users**: Senior Engineering Managers, VPs of Engineering (via role switcher)

---

## Workspace Model

- On launch, the user opens (or creates) a **project directory** on their local filesystem
- All generated outputs (markdown files, CSVs, Mermaid diagrams, PDFs) are written to this workspace via Node `fs`
- Employee profiles can be imported from markdown files found within the workspace
- The app includes a sidebar file browser for navigating the workspace tree (ignoring `.git`, `node_modules`, and similar)
- A basic editor (Monaco or similar) allows viewing and editing workspace files with tabs, syntax highlighting, language detection, and auto-save
- The chat pane has access to editor context (open file path, content, selected text)

---

## Core Workflow

1. **User opens a workspace directory**
2. **User configures integrations** (Atlassian Cloud OAuth, GitHub OAuth/PAT, stored via OS keychain)
3. **User enters OpenRouter API key** on first launch (stored via Electron `safeStorage`, never in plaintext)
4. **User selects their preferred LLM model** from a dropdown populated by OpenRouter's available models
5. **User creates/imports employee profiles** (up to 25) — manual CRUD forms or markdown import from workspace
6. **User selects their role** via dropdown (Staff Engineer, Senior EM, VP of Engineering, etc.)
7. **User hits "Run Analysis"**:
   - App fetches relevant data from Jira (epics, stories, comments, changelogs), Confluence (full page bodies, titles, metadata), and GitHub (repos, code, PRs)
   - App preprocesses and chunks data locally (ranking, summarization, theme extraction) to stay within token limits
   - App sends structured prompts to the selected LLM via OpenRouter
   - LLM produces:
     - **Themes**: Extracted topic clusters (e.g., "reliability," "developer velocity," "ownership gaps") tagged across all data sources
     - **Rundown**: Step-by-step trace of cross-references with citations (e.g., "Profile A mentions scalability → Jira epic X has no stories → GitHub repo Z has deprecated deps")
     - **Summaries**: Bulleted overviews per data source (profiles, Jira, Confluence, GitHub)
     - **SWOT Analysis**: Quadrant format where every bullet includes: (a) claim, (b) evidence with source IDs/links, (c) impact, (d) role-specific recommendation, (e) confidence level (High/Med/Low)
8. **Analysis is saved** to the local database, browsable and queryable later
9. **User interacts via chat pane** for follow-ups grounded in analysis data
10. **User exports** outputs as Markdown and/or PDF to the workspace

---

## Employee Profiles

- Up to 25 per workspace
- Fields: Name, Role/Title, Team, Concerns, Priorities, Interview Quotes, Tags/Themes, Notes
- Stored in local SQLite database
- Can be created via CRUD forms in the UI or imported from markdown files in the workspace
- Each profile represents a stakeholder the user has interviewed

---

## Integrations

### Atlassian Cloud (Jira + Confluence)

- Auth: OAuth 2.0 (Atlassian Cloud only; Server/Data Center is out of scope)
- Jira data: epics, stories, comments, changelogs
- Confluence data: full page bodies, titles, metadata
- Data is fetched via Atlassian REST APIs, cached locally to avoid redundant requests
- Pagination and rate limiting must be handled gracefully

### GitHub

- Auth: OAuth or Personal Access Token
- Data: repositories, code files, pull requests (supplementary evidence to Atlassian)
- Fetched via GitHub REST API or Octokit.js, cached locally

### OpenRouter

- Auth: API key entered on first launch
- User selects model from dropdown (populated from OpenRouter's model list)
- All LLM calls go through OpenRouter's OpenAI-compatible API
- Future: add option for direct Anthropic API as an alternative provider

---

## Themes Layer

- Themes are the core intermediate primitive between raw data and SWOT output
- Every piece of evidence (profile quotes, Jira issues, Confluence pages, GitHub PRs/code) gets tagged into one or more themes during preprocessing
- Examples: "on-call pain," "deploy velocity," "tech debt," "team ownership," "scaling concerns"
- SWOT items are derived from theme clusters, ensuring consistency across runs
- Themes are surfaced in the UI and editable by the user

---

## Role Switcher

- Dropdown in the UI to select the user's current role
- Tailors the SWOT output framing and recommendations:
  - **Staff Engineer**: tactical fixes, technical design proposals, stakeholder alignment actions, "next week" items
  - **Senior Engineering Manager**: process improvements, team health, resourcing, cross-team coordination
  - **VP of Engineering**: strategic resourcing, org design, roadmap risks, budget implications
- Role selection is stored per analysis run

---

## Chat Pane

- Persistent sidebar pane for LLM interaction
- Primary use: follow-up questions grounded in a completed analysis
- Can also generate additional outputs written to the workspace:
  - Markdown files (e.g., RFCs, proposals, summaries)
  - CSV files (e.g., tabular data from analysis)
  - Mermaid diagram files (e.g., dependency maps, org charts, flow diagrams)
- Has access to editor context: open file path, file content, selected text
- Chat history is saved per analysis in the local database
- Each analysis run has its own chat thread; starting a new analysis starts a new thread

---

## Output and Export

- **Rundown**: Detailed cross-reference trace with citations
- **Summaries**: Per-source bulleted overviews
- **SWOT Quadrant**: Every bullet must include claim, evidence (with source IDs/links/quotes), impact, recommendation, and confidence
- **Export formats**: Markdown (.md) and PDF, written to the workspace directory
- **Additional outputs via chat**: Markdown, CSV, Mermaid (.mmd), also written to workspace

---

## Diagrams and Visualization

- **Mermaid**: For markdown-rendered diagrams (dependency maps, flowcharts, org charts, sequence diagrams) — rendered in-app and exportable as `.mmd` files
- **D3 / Chart.js**: For interactive data visualizations within the app (e.g., theme distribution, SWOT heatmaps, project coverage charts)
- **No image generation**: No PNG/SVG export or generative image creation

---

## Technical Architecture

- **Framework**: Electron with TypeScript
- **Frontend**: React, React Router for navigation, React Query wrapping all IPC calls
- **Backend**: Node.js in Electron main process
- **Database**: SQLite for profiles, analyses, themes, chat history, settings, integration metadata
- **Secret Storage**: Electron `safeStorage` (OS keychain — Keychain on Mac, DPAPI on Windows, libsecret on Linux) for API keys and OAuth tokens
- **Validation**: Zod for user-facing form/input validation only; IPC uses typed TypeScript interfaces
- **File I/O**: Node `fs` in main process for all workspace reads/writes
- **Editor**: Monaco Editor (or similar) with tabs, syntax highlighting, language detection, auto-save
- **LLM Communication**: OpenRouter API via OpenAI-compatible SDK; streaming responses where supported
- **Caching**: Local cache layer for integration data (Jira/Confluence/GitHub) to avoid redundant API calls within a session

---

## Data Flow for Analysis

1. **Collect**: Read all profiles from SQLite + fetch Jira/Confluence/GitHub data (or use cache)
2. **Preprocess**: Rank and chunk data locally. Extract/assign themes. Summarize large documents to fit within token budgets. Never send raw PII (names, emails) to the LLM — replace with anonymized identifiers (e.g., "Stakeholder A," "Engineer 3")
3. **Prompt**: Send structured prompts via OpenRouter with templates that include: anonymized profiles, Jira/Confluence summaries, GitHub evidence, theme tags, selected role, and explicit instructions for cited/evidence-based output
4. **Receive**: Stream LLM response. Parse into structured sections (themes, rundown, summaries, SWOT)
5. **Store**: Save full analysis (input snapshot + LLM output) to SQLite, linked to workspace
6. **Display**: Render in UI with interactive SWOT quadrant, expandable evidence, and theme tags
7. **Chat**: Allow follow-ups in the chat pane, injecting analysis context into each message

---

## Privacy and Security

- **Local-first**: All data stored on the user's machine. No nswot servers or telemetry
- **LLM calls are the only external network requests** (plus integration API fetches)
- **PII handling**: Names and emails from profiles are anonymized before being sent to the LLM. User can review what will be sent before confirming an analysis run
- **API keys**: Stored via OS keychain (`safeStorage`), never in plaintext or SQLite
- **Workspace scoping**: File system access is restricted to the opened workspace directory only

---

## Constraints and Ground Rules

- Every SWOT bullet **must** be backed by specific evidence from the provided data. If evidence is insufficient, the item must be marked as "low confidence" or omitted with an explanation
- The LLM must **never invent** information about the organization. If data is missing, it should say so and suggest what additional input would help
- Only use provided profiles, fetched integration data, and workspace file context. Never use external knowledge about the company, its employees, or its products
- Outputs must be **opinionated and action-oriented**, not generic. Generic SWOT items like "improve communication" without specific evidence and a concrete next step are not acceptable
- All file writes go to the workspace directory. The app never writes outside the workspace except to its own app data directory (DB, settings, cache)

---

## Explicitly Out of Scope for V1

- Claude Code dependency or integration
- LLM-off mode
- Slide-ready or presentation export
- Atlassian Server / Data Center support
- Image generation (PNG/SVG)
- Direct Anthropic API (deferred to V2; OpenRouter only for V1)
- General-purpose coding assistant features

---

When reasoning about nswot, always prioritize:

1. **Evidence-grounded output** — every claim must cite its source
2. **Local privacy** — minimize what leaves the machine, anonymize what does
3. **Actionability** — outputs should drive decisions, not just describe the situation
4. **Simplicity** — avoid bloat; the UI serves org analysis, nothing else
5. **Extensibility** — provider switches, new integrations, and new export formats should be easy to add later
