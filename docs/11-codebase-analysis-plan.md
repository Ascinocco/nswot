# nswot — Codebase Analysis via Claude CLI

> **Feature plan for deep codebase analysis as a SWOT data source.**
> Leverages Claude CLI with full local filesystem access on cloned repos, plus Jira MCP for cross-referencing, producing structured codebase intelligence that feeds into the root SWOT analysis.

---

## Problem

The current GitHub integration fetches **process metadata** — PR titles, descriptions, review comments, issue states. This surfaces delivery patterns (slow reviews, bug labels, PR churn) but has **zero visibility into the actual codebase**: architecture health, dependency risks, test coverage gaps, tech debt hotspots, code quality patterns.

For staff engineers doing org-level SWOT analysis, codebase signals are some of the highest-value evidence available. A weakness like "authentication service is a single point of failure with no tests" is far more actionable than "there are open bugs labeled auth."

---

## Solution

Use Claude CLI as an agentic code analysis engine running against **locally cloned repos**. For each selected repo:

1. Clone the repo into the workspace
2. Invoke Claude CLI with a structured analysis prompt, pointed at the cloned repo
3. Claude explores the codebase using full local tool access (`Read`, `Glob`, `Grep`, `Bash`)
4. Claude cross-references code patterns with Jira issues via Jira MCP
5. Capture Claude's structured output as codebase intelligence
6. Feed that intelligence into the root SWOT analysis alongside profiles, Jira, Confluence, and GitHub metadata

This creates a two-tier LLM architecture:

```
Tier 1: Claude CLI (per-repo)          Tier 2: OpenRouter (SWOT synthesis)
┌──────────────────────────┐           ┌─────────────────────────────────┐
│ Local clone + full tools │           │ Profiles                        │
│ Grep, Glob, Read, Bash   │──output──▶│ Jira data                       │
│ Jira MCP cross-reference │           │ Confluence data                 │
│ Structured findings      │           │ GitHub metadata                 │
│ (arch, deps, quality)    │           │ Codebase analysis (from Tier 1) │
└──────────────────────────┘           │         ↓                       │
                                       │   Evidence-backed SWOT          │
                                       └─────────────────────────────────┘
```

### Why Local Clone Over GitHub MCP

- **Full tool access**: `Grep` across the entire codebase, `Glob` for file patterns, `Bash` for `git log`, `wc -l`, `find` — fast, native filesystem operations with no API pagination or rate limits
- **Git history analysis**: `git log --stat`, `git shortlog`, `git log --follow` work instantly on a local clone. Churn analysis, blame, and commit pattern detection are trivial locally.
- **Bulk operations**: Grepping for TODO density, error handling patterns, or type safety issues across thousands of files is instant locally but painful through API pagination
- **No rate limits**: Local filesystem reads are unlimited. GitHub API has rate limits that throttle thorough analysis.
- **Reliability**: No network dependency during analysis — once cloned, everything is local
- **Better results**: Claude CLI's native tools (`Read`, `Glob`, `Grep`) are optimized for local file exploration. This is the workflow Claude CLI was designed for.

---

## Prerequisites

Users must have:

- **Claude CLI** installed and authenticated (Pro, Max, or Team plan)
- **GitHub MCP server** configured in Claude CLI (used for validating repo access and listing repos)
- **Jira MCP server** configured in Claude CLI (for cross-referencing Jira context during code analysis)
- **OpenRouter API key** configured in nswot (for the root SWOT synthesis)
- **Git** installed (for cloning repos)

The app will validate these prerequisites and surface clear guidance when they're missing.

---

## What Claude CLI Analyzes

The Claude CLI analysis prompt asks for structured findings across these dimensions:

### Architecture Assessment
- High-level module/service structure
- Dependency graph (internal modules, external packages)
- Layering violations or circular dependencies
- API surface area and boundaries
- Monolith vs microservice patterns

### Code Quality Signals
- Test coverage patterns (which areas are well-tested vs untested)
- Error handling patterns (consistent vs ad-hoc)
- Type safety (any usage, unsafe casts, missing types)
- Code duplication hotspots
- Documentation coverage (README, inline docs, API docs)

### Technical Debt Indicators
- TODO/FIXME/HACK comment density and age
- Deprecated dependency usage
- Large files or functions (complexity hotspots)
- Dead code or unused exports
- Migration/upgrade blockers

### Delivery Risk Signals
- Recently changed hotspots (churn analysis via `git log`)
- Files with high change frequency but low test coverage
- Build/CI configuration health
- Dependency vulnerability exposure (lockfile analysis)

### Jira Cross-Reference (via MCP)
- Code areas referenced in open Jira issues
- Correlation between code hotspots and reported bugs
- Implementation gaps for in-progress stories

---

## Output Schema (Claude CLI → nswot)

Claude CLI's analysis produces a structured JSON document that nswot ingests:

```json
{
  "repo": "owner/repo",
  "analyzedAt": "2025-02-11T10:00:00Z",
  "architecture": {
    "summary": "Markdown summary of architecture patterns",
    "modules": ["list of top-level modules/services"],
    "concerns": ["specific architectural concerns with file references"]
  },
  "quality": {
    "summary": "Markdown summary of code quality patterns",
    "strengths": ["well-tested areas, good patterns"],
    "weaknesses": ["untested areas, inconsistent patterns"]
  },
  "technicalDebt": {
    "summary": "Markdown summary of tech debt landscape",
    "items": [
      {
        "description": "What the debt is",
        "location": "file path or module",
        "severity": "high | medium | low",
        "evidence": "Specific code/comment reference"
      }
    ]
  },
  "risks": {
    "summary": "Markdown summary of delivery/dependency risks",
    "items": ["specific risk with evidence"]
  },
  "jiraCrossReference": {
    "summary": "Markdown summary of Jira-code correlations",
    "correlations": ["specific correlations found via MCP"]
  }
}
```

---

## Integration into SWOT Pipeline

### Data Flow

```
User selects repos for codebase analysis
         │
         ▼
CodebaseService.analyze(repos)
  ├─ For each repo:
  │   ├─ Clone/pull to workspace/.nswot/repos/{owner}/{repo}
  │   ├─ Spawn Claude CLI with analysis prompt, cwd set to cloned repo
  │   ├─ Claude uses local tools (Read, Glob, Grep, Bash) + Jira MCP
  │   ├─ Parse structured JSON output
  │   └─ Cache result in integration_cache (resource_type: codebase_analysis)
  │
  └─ Return aggregated CodebaseAnalysis[]
         │
         ▼
AnalysisService.runAnalysis()
  ├─ collectCodebaseData() — load cached analysis results
  ├─ formatCodebaseMarkdown() — render as markdown for prompt
  └─ Include in user prompt as "## Codebase Analysis" section
         │
         ▼
LLM receives: profiles + jira + confluence + github + codebase
         │
         ▼
SWOT items can cite codebase evidence:
  sourceType: "codebase"
  sourceId: "codebase:owner/repo"
  quote: "The auth module has 0% test coverage and 47 TODO comments"
```

### Token Budget Adjustment

Codebase analysis data joins the existing source pool. The adaptive budget allocation already splits 60% among connected sources:

- 1 source (e.g., just Jira): gets 60%
- 2 sources: each gets 30%
- 5 sources (all): each gets 12%

The codebase analysis summaries are already condensed by Claude CLI (Tier 1), so they should be token-efficient compared to raw code.

### New Evidence Source Type

```ts
type EvidenceSourceType = 'profile' | 'jira' | 'confluence' | 'github' | 'codebase';
```

---

## Architecture

### New Components

```
src/main/
  providers/
    codebase/
      codebase.provider.ts       # Spawns Claude CLI, captures output
      codebase.types.ts          # CodebaseAnalysis schema types
      codebase-prompt.ts         # The analysis prompt sent to Claude CLI
  services/
    codebase.service.ts          # Orchestrates clone + analyze + cache lifecycle
```

### CodebaseProvider

Responsibilities:
- Spawn `claude` CLI as a child process with `cwd` set to the cloned repo
- Pass the analysis prompt
- Set a timeout (configurable, default 5 minutes per repo)
- Capture stdout, parse structured JSON output
- Handle failures: CLI not found, auth errors, timeout, malformed output

```ts
interface CodebaseProvider {
  analyze(repoPath: string, prompt: string): Promise<CodebaseAnalysis>;
  isAvailable(): Promise<{ cli: boolean; jiraMcp: boolean }>;
}
```

### CodebaseService

Responsibilities:
- Clone repos to workspace (shallow by default, or pull if already cloned)
- Invoke CodebaseProvider per repo
- Cache results in IntegrationCacheRepository
- Report progress per repo (cloning → analyzing → done)
- Handle partial failures (some repos succeed, some fail)

### Git Operations

Repos are cloned into a managed directory within the workspace:

```
{workspace}/.nswot/repos/{owner}/{repo}/
```

- Shallow clone (`--depth 1`) by default to minimize disk usage
- Full clone available as an option (for git history / churn analysis)
- If already cloned, `git pull` to update before analysis
- Cleanup: user can clear cached repos from the UI
- `.nswot/` is already in `.gitignore`
- Clone authenticates using the existing GitHub PAT from safeStorage

---

## Claude CLI Invocation

### Command

```bash
claude --print --output-format json \
  --allowedTools "Bash(git log:*),Bash(git shortlog:*),Bash(git blame:*),Bash(find:*),Bash(wc:*),Read,Glob,Grep,mcp__jira" \
  --model sonnet \
  --max-turns 30 \
  -p "$(cat codebase-analysis-prompt.txt)"
```

Invoked with `cwd` set to the cloned repo path so all file operations are scoped to that repo.

Key flags:
- `--print`: non-interactive, output only
- `--output-format json`: structured JSON output for parsing
- `--allowedTools`: read-only filesystem tools + git read commands + Jira MCP. No `Write`, `Edit`, or general `Bash`.
- `--model sonnet`: fast model for code exploration (user-configurable)
- `--max-turns`: cap agentic turns to control cost/time

### Tool Access

Claude CLI is given **read-only access** to the cloned repo:

**Allowed:**
- `Read` — read file contents
- `Glob` — find files by pattern
- `Grep` — search file contents
- `Bash(git log:*)` — commit history, churn analysis
- `Bash(git shortlog:*)` — contributor patterns
- `Bash(git blame:*)` — line-level history
- `Bash(find:*)` — file discovery
- `Bash(wc:*)` — line/file counting
- `mcp__jira` — Jira MCP tools (search issues, read issue details)

**Denied:**
- `Write`, `Edit` — no file modifications
- `Bash` (general) — no arbitrary shell commands
- `WebFetch`, `WebSearch` — no external network calls
- `mcp__github` write operations — no PR/issue creation

This ensures the analysis is safe and side-effect-free.

---

## UI Changes

### Integrations Page

New "Codebase Analysis" section (below GitHub):

- **Status check**: Validates Claude CLI is installed, authenticated, and has Jira MCP available
- **Repo selection**: Reuses GitHub repo list (already fetched via GitHub integration). Checkboxes for which repos to analyze.
- **Analysis options**:
  - Clone depth: shallow (default) vs full (for git history analysis)
  - Model: sonnet (default) vs opus (more thorough, slower)
  - Max turns: 30 (default), configurable
- **Analyze button**: Triggers clone + analysis for selected repos
- **Status per repo**: pending → cloning → analyzing → done / failed
- **Cached results**: Shows last analysis timestamp per repo, option to re-analyze
- **Storage**: Shows total disk usage of cloned repos, with "Clear all" option

### Analysis Run Page

- New "Codebase" source checkbox group (alongside Jira projects, Confluence spaces, GitHub repos)
- Shows which repos have cached codebase analysis and when
- Stale analysis warning (>24h old, or if repo has been pushed to since analysis)

### Results Page

- New "Codebase Patterns" summary card (alongside Stakeholder Themes, Jira Patterns, etc.)
- SWOT items with `sourceType: "codebase"` render the repo name and file references

---

## Progress Reporting

Codebase analysis is potentially long-running. Progress reporting per repo:

1. **Cloning** — "Cloning owner/repo..."
2. **Analyzing** — "Claude is analyzing owner/repo... (turn 5/30)"
3. **Parsing** — "Parsing analysis results..."
4. **Done** — "Codebase analysis complete for owner/repo"

Claude CLI's `--output-format json` with `--print` outputs at the end. To provide mid-analysis progress, we can:
- Monitor the spawned process for stderr output (Claude CLI prints status to stderr)
- Use a polling approach: check if the process is still running, update turn count
- Set per-repo timeouts with clear messaging

---

## Error Handling

| Error | Detection | User Message |
|---|---|---|
| Claude CLI not installed | `which claude` fails | "Claude CLI is required for codebase analysis. Install it from https://docs.anthropic.com/claude-code" |
| Claude CLI not authenticated | `claude --print -p "test"` fails with auth error | "Claude CLI is not authenticated. Run `claude` in your terminal to sign in." |
| No Pro/Max/Team plan | Auth succeeds but API quota exceeded | "Codebase analysis requires a Claude Pro, Max, or Team plan." |
| Git not installed | `which git` fails | "Git is required for cloning repos. Install it from https://git-scm.com" |
| Clone fails | Git subprocess error | "Failed to clone {repo}. Check your GitHub PAT has repo read access." |
| Jira MCP not configured | Prerequisite check | "Jira MCP server is recommended for codebase analysis. Analysis will proceed without Jira cross-reference." |
| Analysis timeout | Process exceeds timeout | "Analysis of {repo} timed out after {n} minutes. Try reducing max turns or use a faster model." |
| Malformed output | JSON parse failure | "Claude's analysis output could not be parsed. Retrying..." (1 retry) |
| Partial failure | Some repos fail | "Codebase analysis completed for 3/5 repos. {repo1} and {repo2} failed: {reason}" |

Note: Jira MCP is recommended but not required. If unavailable, the `jiraCrossReference` section is omitted from results — analysis still proceeds with architecture, quality, debt, and risk dimensions.

---

## Caching Strategy

- **Cache key**: `(integration_id, 'codebase_analysis', 'owner/repo')`
- **Cache TTL**: 24 hours (codebase changes less frequently than Jira/GitHub metadata)
- **Invalidation**: Manual re-analyze, or automatic if repo has new commits since last analysis (checked via GitHub API `pushed_at`)
- **Storage**: Same `integration_cache` table used by Jira/Confluence/GitHub
- **Cloned repos**: Stored in `{workspace}/.nswot/repos/`, user can clear from UI

---

## Scope & Phasing

### Phase 3a — Core Codebase Analysis (2 sprints)

**Sprint 11: Infrastructure + Provider**
- Prerequisite validation (Claude CLI installed, authenticated, Jira MCP check)
- Git clone/pull operations with workspace-scoped path enforcement
- CodebaseProvider: spawn Claude CLI with `cwd` set to repo, capture output, parse JSON
- Codebase analysis prompt (initial version)
- CodebaseService: orchestrate clone → analyze → cache
- Error handling for all failure modes
- Progress reporting per repo

**Sprint 12: Pipeline Integration + UI**
- `collectCodebaseData()` in AnalysisService
- `formatCodebaseMarkdown()` formatter
- Token budget: add `codebase` as a ConnectedSource
- Prompt builder: add `## Codebase Analysis` section
- Evidence validator: accept `codebase:` source IDs
- Response parser: accept `codebase` sourceType
- Codebase setup UI on integrations page (repo selection, analysis options, status)
- Analysis run page: codebase source selection
- Results page: "Codebase Patterns" summary card
- Update SummariesOutput type: `codebase: string | null`

### Phase 3b — Refinement (1 sprint)

**Sprint 13: Polish + Tuning**
- Jira MCP detection and conditional cross-reference prompt
- Stale analysis detection (compare `pushed_at` vs `analyzedAt`)
- Re-analyze from UI
- Cloned repo cleanup UI (storage display, clear all)
- Full clone option for git history analysis
- Prompt tuning based on real output quality
- Testing: various repo sizes, languages, monorepo support
- Documentation updates

---

## Security Considerations

- **Read-only analysis**: Claude CLI tool restrictions prevent any writes to the cloned repo or local filesystem
- **Workspace-scoped clones**: All repos cloned under `{workspace}/.nswot/repos/`, path enforcement prevents writes outside workspace
- **No secrets in analysis**: Claude CLI's analysis prompt does not include API keys, tokens, or credentials. The prompt instructs Claude to skip `.env` files and similar.
- **PAT reuse**: Git clone authenticates with the existing GitHub PAT from safeStorage
- **Process isolation**: Claude CLI runs as a subprocess with no access to nswot's internal state, database, or safeStorage
- **Jira MCP is read-only**: The analysis prompt instructs Claude to only search/read Jira issues, never create or modify them

---

## Open Questions

1. **Monorepo support**: Should we support analyzing sub-paths within a monorepo? (e.g., "focus on `services/auth` within `owner/monorepo`")
2. **Cost visibility**: Should we estimate Claude CLI token cost before analysis and show it to the user?
3. **Concurrent analysis**: Should we analyze multiple repos in parallel? (Faster, but higher resource usage and potential rate limiting)
4. **Incremental analysis**: For subsequent runs, should we only ask Claude to analyze files changed since last analysis? (Faster, but may miss context)
5. **Custom prompts**: Should users be able to customize the codebase analysis prompt? (e.g., "Focus on security patterns" or "Ignore test files")
