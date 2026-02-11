# nswot - MVP Product Specification

> **Canonical scope for current development.** Full post-MVP vision is preserved in `docs/future/full-product-spec.md`.

---

## Product Identity

- **Codename**: nswot
- **Type**: Local-first desktop app (Electron) for macOS-first launch
- **Core value**: Turn stakeholder interview notes and Jira signals into an evidence-backed SWOT the user can act on immediately
- **Primary user**: Staff engineers in org-level problem-solving roles
- **Secondary user**: Senior engineering managers

---

## MVP Outcome

The MVP succeeds if one user can:

1. Open a workspace
2. Add/import stakeholder profiles
3. Connect Jira and choose projects
4. Run analysis once
5. Receive a role-aware SWOT where each claim includes evidence
6. Ask follow-up chat questions grounded in that saved analysis
7. Export results as markdown

If this loop works reliably, the core product value is proven.

---

## In Scope for MVP

### Inputs

- **Employee profiles** (manual entry or markdown import)
- **Jira Cloud** data only:
  - epics
  - stories
  - comments
  - changelog summaries

### Core UX

- Workspace picker
- Basic file browser + basic text editor
- Profiles CRUD (max 25 profiles per workspace)
- Jira connection and project selection
- Role selector (Staff Engineer, Senior Engineering Manager)
- "Run Analysis" flow with progress
- Analysis history list
- SWOT view with drill-down evidence
- Chat pane for follow-up Q&A grounded in selected analysis
- Markdown export

### System constraints

- Local-first storage
- Secrets stored in OS keychain via `safeStorage`
- All file writes restricted to opened workspace
- User preview of what will be sent to LLM before run

---

## Out of Scope for MVP

- Confluence integration (Phase 2)
- GitHub integration (Phase 3)
- Theme editor (rename/merge/delete UI)
- Mermaid/chart visualizations
- CSV/PDF export
- Chat-driven file generation
- Multi-provider LLM support (OpenRouter only)
- Cross-platform shipping (Windows/Linux deferred)
- VP of Engineering role (Phase 2+)

---

## Workspace Model

- User opens a local project directory
- nswot stores app state in local SQLite (app data directory)
- Workspace outputs are written under workspace root (for example `analysis/`)
- File browser ignores `.git`, `node_modules`, `.env*`, and `.nswot`

---

## Core Workflow

1. User opens workspace
2. User configures OpenRouter API key and chooses model
3. User creates/imports stakeholder profiles
4. User connects Jira Cloud and selects projects
5. User selects role (Staff Engineer or Senior EM)
6. User clicks **Run Analysis**
7. App collects profiles + Jira data, anonymizes PII, and builds prompt payload
8. LLM returns structured SWOT + evidence + confidence
9. App stores run snapshot and displays result
10. User asks follow-up questions in chat based on stored analysis context
11. User exports markdown report

---

## Employee Profiles (MVP)

- Max 25 profiles per workspace
- Fields:
  - Name (required)
  - Role/Title
  - Team
  - Concerns
  - Priorities
  - Interview quotes
  - Notes
- Optional markdown import from `profiles/*.md`

---

## Jira Integration (MVP)

- Jira Cloud OAuth 2.0 only
- User selects included projects
- Data fetched with pagination and basic backoff on rate limits
- Basic local cache with TTL to reduce repeated requests

---

## Analysis Requirements

Each SWOT item must include:

- claim
- supporting evidence (source type, source id, quote/excerpt)
- impact
- recommendation
- confidence (`high`, `medium`, `low`)

Ground rules:

- No invented facts
- If evidence is weak, mark low confidence or omit
- Use only provided profile + Jira data

### Evidence Quality Thresholds

- **High confidence**: claim supported by 2+ independent sources (e.g., profile quote + Jira data)
- **Medium confidence**: claim supported by 1 source with strong specificity (direct quote, concrete ticket data)
- **Low confidence**: claim supported by 1 source with weak specificity (vague comment, single data point)
- **Omit**: no concrete evidence available; do not generate the claim

### Role-Specific Output Differences

**Staff Engineer framing:**
- Recommendations are tactical and near-term ("next sprint" or "next week")
- Focus on technical design proposals, specific systems to investigate, stakeholder conversations to have
- Language: "You should propose...", "Consider a design review for...", "Schedule a pairing session with..."

**Senior Engineering Manager framing:**
- Recommendations are process and team-oriented ("next quarter" or "next cycle")
- Focus on team health, resourcing changes, cross-team coordination, process improvements
- Language: "Consider reallocating...", "Initiate a retrospective on...", "Escalate to leadership..."

---

## Chat (MVP)

- One thread per analysis
- Uses stored analysis output plus recent chat messages as context
- Purpose is clarification, deeper reasoning, and action planning
- Chat cannot write files in MVP

---

## Export (MVP)

- Markdown export only (`.md`)
- Report includes:
  - role used
  - model used
  - SWOT with citations and confidence
  - brief source summaries

---

## Privacy and Security

- No product telemetry in MVP
- Local-first persistence
- Names/emails anonymized before LLM call
- User can review payload summary before analysis runs
- API keys/tokens stored via OS keychain (`safeStorage`)

---

## MVP Priorities

When making trade-offs, prioritize:

1. **Trust**: every claim is evidence-grounded
2. **Reliability**: core loop works every day without manual recovery
3. **Actionability**: outputs are concrete and role-specific
4. **Simplicity**: avoid non-essential UI and integrations
5. **Extensibility**: leave clean seams for Confluence/GitHub later
