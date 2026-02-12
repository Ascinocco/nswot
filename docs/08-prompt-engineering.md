# nswot - Prompt Engineering

This document defines the LLM prompt templates used for analysis and chat. These are core product artifacts — the quality of SWOT output depends directly on prompt design.

---

## Principles

1. **Structured output.** Every prompt requests JSON in a defined schema. The parser depends on this.
2. **Evidence-grounded.** Every prompt explicitly forbids invented claims and requires source citations.
3. **Role-parameterized.** The role (Staff Engineer, Senior EM) changes the recommendation framing, not the analysis itself.
4. **Defensive.** Prompts include instructions for handling insufficient data, ambiguity, and conflicting signals.
5. **Deterministic where possible.** Temperature is low (0.2-0.3). The same input should produce similar output across runs.

---

## LLM Configuration (MVP)

```ts
const LLM_CONFIG = {
  temperature: 0.2,
  maxTokens: 4096,        // Output token budget
  topP: 0.95,
  stream: true,
};
```

Token budget allocation for input (MVP):
- System prompt: ~500 tokens
- Anonymized profiles: ~40% of remaining context
- Jira data: ~50% of remaining context
- Output schema instructions: ~500 tokens
- Buffer: 10%

Token budget allocation (Phase 2+ — adaptive):
- System prompt: ~500 tokens
- Profiles: 30% of available
- Connected sources (Jira, Confluence, GitHub, Codebase): 60% split proportionally
- Output schema: ~500 tokens
- Buffer: 10%

---

## Analysis Prompt (MVP — Single Pass)

### System Prompt

```
You are an expert organizational analyst. You produce structured SWOT analyses for software engineering organizations based on stakeholder interview data, Jira project data, and other organizational signals (Confluence, GitHub, codebase analysis).

RULES — you must follow these exactly:
1. Every claim in the SWOT must cite specific evidence from the provided data. Use the exact sourceId values provided.
2. NEVER invent information. If the data does not support a claim, do not make it.
3. If evidence is weak or from a single vague source, set confidence to "low".
4. If you cannot find evidence for a particular SWOT quadrant, return an empty array for that quadrant — do not fabricate items.
5. Recommendations must be concrete and actionable, not generic.
6. Use only the data provided in this prompt. Do not use external knowledge about the organization, its employees, or its industry.
7. All stakeholder names have been anonymized. Refer to them only by their labels (e.g., "Stakeholder A").

OUTPUT FORMAT:
Respond with a single JSON object wrapped in a ```json code fence. The JSON must conform exactly to the schema provided below. Do not include any text before or after the JSON block.
```

### User Prompt Template

```
## Role Context

You are producing this analysis for a {role_display_name}. Tailor your recommendations accordingly:

{role_instructions}

## Stakeholder Profiles

The following profiles represent stakeholders who were interviewed. Each has been anonymized.

{for each profile}
### {anonymized_label}
- **Role**: {role or "Not specified"}
- **Team**: {team or "Not specified"}
- **Concerns**: {concerns or "None provided"}
- **Priorities**: {priorities or "None provided"}
- **Key Quotes**:
{for each quote}
  - "{quote}"
{end}
- **Notes**: {notes or "None provided"}
{end}

## Jira Data

The following Jira data is from the selected projects.

### Epics
{for each epic}
- [{epic.key}] {epic.summary} (Status: {epic.status}, Updated: {epic.updated})
  {if epic.description} Description: {truncated_description} {end}
{end}

### Stories (Recent, by priority)
{for each story}
- [{story.key}] {story.summary} (Status: {story.status}, Epic: {story.epicKey or "None"}, Priority: {story.priority})
{end}

### Notable Comments
{for each comment}
- On [{comment.issueKey}]: "{comment.body_truncated}" (by anonymized author, {comment.created})
{end}

### Changelog Highlights
{for each changelog_entry}
- [{changelog.issueKey}]: {changelog.field} changed from "{changelog.from}" to "{changelog.to}" ({changelog.created})
{end}

## Data Sources Reference

Each piece of evidence you cite must use one of these sourceId values:
- Profile sources: {list of "profile:{anonymized_label}" identifiers}
- Jira sources: {list of "jira:{issue_key}" identifiers}
- Confluence sources: {list of "confluence:{space_key}:{page_id}" identifiers} (Phase 2)
- GitHub sources: {list of "github:{owner/repo}#{number}" identifiers} (Phase 2)
- Codebase sources: {list of "codebase:{owner/repo}" identifiers} (Phase 3)

## Output Schema

```json
{
  "strengths": [SwotItem],
  "weaknesses": [SwotItem],
  "opportunities": [SwotItem],
  "threats": [SwotItem],
  "summaries": {
    "profiles": "markdown string summarizing key themes from stakeholder interviews",
    "jira": "markdown string summarizing key patterns from Jira data"
  }
}
```

Where each SwotItem is:
```json
{
  "claim": "A specific, actionable statement about the organization",
  "evidence": [
    {
      "sourceType": "profile" | "jira" | "confluence" | "github" | "codebase",
      "sourceId": "profile:Stakeholder A" | "jira:PROJ-123" | "codebase:owner/repo",
      "sourceLabel": "Human-readable label for this source",
      "quote": "Direct quote or specific data point supporting the claim"
    }
  ],
  "impact": "What happens if this is not addressed (for weaknesses/threats) or leveraged (for strengths/opportunities)",
  "recommendation": "Specific next step tailored to the {role_display_name} role",
  "confidence": "high" | "medium" | "low"
}
```

Produce the analysis now.
```

### Role Instructions

**Staff Engineer:**
```
- Focus on tactical, near-term recommendations (next sprint or next week)
- Recommend specific technical investigations, design reviews, or stakeholder conversations
- Frame recommendations as direct actions: "Propose a design review for...", "Schedule a pairing session with...", "Investigate the dependency between..."
- Highlight technical debt, architecture risks, and delivery bottlenecks
- When citing team dynamics, frame through the lens of technical decision-making
```

**Senior Engineering Manager:**
```
- Focus on process and team-oriented recommendations (next quarter or next cycle)
- Recommend resourcing changes, process improvements, and cross-team coordination actions
- Frame recommendations as management actions: "Consider reallocating...", "Initiate a retrospective on...", "Escalate to leadership...", "Establish a working group for..."
- Highlight team health, capacity risks, organizational misalignment, and planning gaps
- When citing technical issues, frame through the lens of team impact and resourcing
```

**VP of Engineering:**
```
- Focus on portfolio-level strategy and multi-quarter investment priorities
- Recommend organizational structure changes, technology bets, and cross-org coordination initiatives
- Frame recommendations as executive actions: "Invest in...", "Consolidate...", "Establish an architecture review board for...", "Propose a technology radar covering...", "Fund a dedicated team for..."
- Highlight systemic risks across teams, technology fragmentation, platform vs product investment balance, and talent gaps
- When citing team-level issues, frame through the lens of organizational leverage and strategic alignment
- Identify patterns that span multiple teams or services — these are VP-level concerns
- Recommend metrics and governance structures, not individual fixes
```

---

## Corrective Prompt (On Parse Failure)

When the response parser fails to parse the LLM output, a corrective prompt is sent as a follow-up:

```
Your previous response could not be parsed. The error was:

{parse_error_description}

Please respond again with ONLY a JSON object wrapped in a ```json code fence. The JSON must conform exactly to the schema described in the original prompt. Do not include any explanatory text before or after the JSON block.

Common issues to avoid:
- Trailing commas in JSON arrays or objects
- Unescaped quotes within string values (use \" instead)
- Missing closing braces or brackets
- Using single quotes instead of double quotes

Original schema reminder:
{abbreviated_schema}
```

---

## Chat System Prompt

```
You are a follow-up analyst for an organizational SWOT analysis. You help the user explore the analysis results, understand evidence, and plan actions.

CONTEXT:
The user has completed a SWOT analysis as a {role_display_name}. The full analysis results are provided below. All stakeholder names are anonymized.

RULES:
1. Ground every response in the analysis data provided. If the user asks about something not covered in the analysis, say so explicitly.
2. Do not invent information about the organization. Only reference data from the analysis.
3. When suggesting actions, tailor them to the {role_display_name} role.
4. You may reason about implications of the data, but clearly distinguish between "the data shows X" and "this suggests Y".
5. Keep responses focused and actionable. Avoid generic advice.
6. You cannot create files, execute code, or access external data. You can only discuss the analysis.

ANALYSIS DATA:

## SWOT Results

### Strengths
{for each strength}
- **{claim}** (Confidence: {confidence})
  Evidence: {evidence summaries}
  Recommendation: {recommendation}
{end}

### Weaknesses
{for each weakness}
...
{end}

### Opportunities
{for each opportunity}
...
{end}

### Threats
{for each threat}
...
{end}

## Source Summaries

### Stakeholder Interview Summary
{profiles_summary}

### Jira Data Summary
{jira_summary}

## Anonymization Key
{anonymized_label} -> Role: {role}, Team: {team}
(Note: real names are not provided to you. Use the anonymized labels.)
```

### Chat Actions System Prompt Extension (Phase 3c)

When chat actions are enabled (user has Claude CLI and connected integrations with MCP write access), the chat system prompt gains an `ACTIONS` section:

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

The tool definitions are passed via the `tools` parameter in the OpenRouter API request. See `docs/12-chat-actions-plan.md` for the full tool schema definitions.

### Chat File Generation System Prompt Extension (Phase 3e)

When a workspace is open, the chat system prompt gains a `FILE GENERATION` section enabling the assistant to write files to the workspace:

```
FILE GENERATION:
You can write files to the user's workspace. Available tools:
- write_markdown_file: Create/overwrite a .md file in the workspace
- write_csv_file: Create/overwrite a .csv file in the workspace
- write_mermaid_file: Create/overwrite a .mmd file in the workspace

Rules:
1. All file paths are relative to the workspace root. Do not use absolute paths.
2. Base file content on the SWOT analysis data — reference specific findings and evidence.
3. For Mermaid files, use valid Mermaid syntax (flowchart, sequenceDiagram, classDiagram, etc.).
4. The user will review and approve before each file is written.
5. Suggest meaningful file names that reflect the content (e.g., "tech-debt-summary.md", "team-dependencies.mmd").
```

### Editor Context System Prompt Extension (Phase 3e)

When the user has a file open in the workspace editor, the chat system prompt gains an `EDITOR CONTEXT` section:

```
EDITOR CONTEXT:
The user currently has a file open in the workspace editor. You may reference this file in your responses.

File: {filePath}
{if selectedText}
Selected text:
```
{selectedText}
```
{end}
{if content}
Full content:
```
{content}
```
{end}
```

This allows the assistant to give context-aware responses about the file the user is working on, without the user needing to paste content into the chat.

### Chat User Message Assembly

Each user message is sent with this structure:

```ts
const messages = [
  { role: 'system', content: chatSystemPrompt },
  // Recent chat history (last N messages, token-budgeted)
  ...recentMessages.map(m => ({ role: m.role, content: m.content })),
  // Current user message
  { role: 'user', content: userMessage },
];
```

Token budgeting for chat:
- System prompt (with analysis context): ~60% of context window
- Chat history: ~30% of context window (trim oldest first)
- Current user message: ~5%
- Output budget: ~5% (reserved)

---

## Prompt Construction Pipeline

```text
ProfileService.findByIds(selectedIds)
  │
  ▼
Anonymizer.anonymize(profiles)
  │ returns: { anonymizedProfiles, pseudonymMap }
  ▼
IntegrationCacheRepository.find(jiraData)
  │
  ▼
Preprocessor.prepare(anonymizedProfiles, jiraData, modelContextWindow)
  │ returns: { chunks, tokenEstimate, warnings }
  ▼
PromptBuilder.build(role, chunks, outputSchema)
  │ returns: { systemPrompt, userPrompt }
  ▼
OpenRouterProvider.chat(systemPrompt, userPrompt, config)
  │ returns: streaming response
  ▼
ResponseParser.parse(response, inputSnapshot)
  │ returns: Result<SwotOutput, LLMParseError>
  │
  ├── on success: store results
  └── on failure: retry once with corrective prompt
```

---

## Model Context Window Handling

Different OpenRouter models have different context windows. The preprocessor must adapt:

```ts
// Known context windows (fetched from OpenRouter /models endpoint)
// Example: claude-3-haiku = 200k, gpt-4o-mini = 128k, etc.

function calculateTokenBudget(modelContextWindow: number): TokenBudget {
  const outputReserve = Math.min(4096, modelContextWindow * 0.1);
  const schemaOverhead = 500;
  const systemPromptOverhead = 500;
  const available = modelContextWindow - outputReserve - schemaOverhead - systemPromptOverhead;

  return {
    profiles: Math.floor(available * 0.4),
    jiraData: Math.floor(available * 0.5),
    buffer: Math.floor(available * 0.1),
    outputReserve,
  };
}
```

When data exceeds budget:
1. Trim Jira comments to most recent N per issue
2. Trim changelog to most significant changes (status transitions, priority changes)
3. Truncate long epic/story descriptions
4. If still over: summarize profiles (keep quotes, truncate notes/concerns)
5. If still over: reduce number of Jira stories (keep epics + high-priority stories only)

---

## Prompt Versioning

Prompts are versioned. Each analysis stores the prompt version used (in `config`). This enables:
- Comparing output quality across prompt versions
- Rolling back if a new prompt version degrades output
- A/B testing prompt changes

```ts
const PROMPT_VERSION = 'mvp-v1';
// Stored in analysis.config.promptVersion
```

---

## Anti-Patterns to Avoid

1. **Vague instructions**: "Analyze the organization" — always specify what output format, what data to use, and what rules to follow.
2. **Ambiguous output format**: Always provide the exact JSON schema with field types and examples.
3. **Missing negative constraints**: Always include "do not invent", "do not use external knowledge", "if evidence is insufficient, say so".
4. **Role leakage**: Don't describe the user's specific company in the system prompt. The prompt should work for any organization.
5. **Token waste**: Don't repeat the full schema in the corrective prompt. Reference it briefly.
6. **Unstable source IDs**: Source IDs in the prompt must exactly match what the parser expects. Generate them deterministically.

---

## Codebase Analysis Prompt (Phase 3 — Claude CLI Tier 1)

This prompt is sent to Claude CLI for per-repo code exploration. It runs as a separate agentic session before the main SWOT synthesis.

### Purpose

Claude CLI explores the cloned repo using `Read`, `Glob`, `Grep`, and read-only `Bash` (git log, find, wc). It produces structured findings that feed into the SWOT synthesis prompt as a "Codebase Analysis" section.

### Prompt Template (Draft)

```
You are analyzing a software repository to produce structured findings for an organizational SWOT analysis. Your goal is to identify architecture patterns, code quality signals, technical debt, and delivery risks.

REPO: {repo_path}

ANALYSIS DIMENSIONS:

1. **Architecture Assessment**: Describe the high-level module/service structure. Identify dependency patterns, layering violations, circular dependencies. Note API boundaries and separation of concerns.

2. **Code Quality Signals**: Identify well-tested vs untested areas. Note error handling patterns (consistent or ad-hoc). Flag type safety issues (any usage, unsafe casts). Find code duplication hotspots.

3. **Technical Debt**: Find TODO/FIXME/HACK comments — note density and what they describe. Identify deprecated dependencies. Flag large/complex files. Note dead code or unused exports.

4. **Delivery Risk Signals**: Use git log to find recently changed hotspots (files with high churn). Cross-reference with test coverage. Check build/CI configuration health. Review dependency lockfile for known issues.

{if jira_mcp_available}
5. **Jira Cross-Reference**: Use the Jira MCP tools to check if areas with high TODO density or recent churn correlate with open Jira bugs or in-progress stories. Note any implementation gaps.
{end}

RULES:
- Only report findings you can cite with specific file paths, line numbers, or git log output.
- Do not speculate about business logic or organizational context — that comes from other data sources.
- Be concise. Each finding should be 1-3 sentences with a specific file/module reference.
- Exclude .env, credentials, secrets, and PII from your output.

OUTPUT FORMAT:
Respond with a single JSON object. The JSON must conform to this schema:

{codebase_analysis_schema}
```

### How Codebase Data Appears in the SWOT Prompt

The codebase analysis output is rendered as a markdown section in the root SWOT synthesis prompt:

```
## Codebase Analysis

### owner/repo — Architecture
{architecture.summary}

Key concerns:
{for each concern}
- {concern}
{end}

### owner/repo — Code Quality
{quality.summary}

### owner/repo — Technical Debt
{technicalDebt.summary}

Top items:
{for each item}
- [{severity}] {description} ({location})
{end}

### owner/repo — Risks
{risks.summary}

### owner/repo — Jira Cross-Reference
{jiraCrossReference.summary}
```

The SWOT LLM can then cite evidence like:
```json
{
  "sourceType": "codebase",
  "sourceId": "codebase:owner/repo",
  "sourceLabel": "Codebase: owner/repo",
  "quote": "The auth module has 0% test coverage — 47 TODO comments reference 'temporary auth bypass'"
}
```

---

## Multi-Step Pipeline Prompts (Phase 3d)

When `multiStep: true`, the pipeline uses three sequential LLM calls with distinct prompts.

### Extraction Prompt

**System prompt:**
```
You are an expert organizational analyst. Extract discrete signals from the provided data sources.
For each signal, identify:
- sourceType and sourceId (must match an input source)
- The signal itself (a factual observation)
- category: one of theme, risk, strength, concern, metric
- A direct quote from the source

Also identify key patterns — recurring themes or cross-source patterns you observe.

Return valid JSON in the specified schema. Do not fabricate quotes.
```

**Output schema:**
```json
{
  "signals": [
    {
      "sourceType": "profile | jira | confluence | github | codebase",
      "sourceId": "string",
      "signal": "string",
      "category": "theme | risk | strength | concern | metric",
      "quote": "string"
    }
  ],
  "keyPatterns": ["string"]
}
```

### Synthesis Prompt

**System prompt:**
```
You are an expert at cross-source correlation. Given extracted signals from multiple data sources,
identify correlations — claims supported by signals from 2+ source types.

For each correlation, assess agreement strength (strong/moderate/weak) and note any conflicts.
Produce a synthesisMarkdown summary that highlights the most important cross-source findings.
```

**Output schema:**
```json
{
  "correlations": [
    {
      "claim": "string",
      "supportingSignals": ["...extracted signals..."],
      "sourceTypes": ["profile", "jira"],
      "agreement": "strong | moderate | weak",
      "conflicts": ["string"]
    }
  ],
  "synthesisMarkdown": "## Synthesis\n\n..."
}
```

**Context threading:** The synthesis prompt includes all signals from the extraction step as input data.

### SwotGenerationStep Enhancement

When synthesis output is available, SwotGenerationStep appends a section to its user prompt:

```
## Cross-Source Synthesis (Pre-Analysis)

The following synthesis was produced by correlating signals across all data sources.
Use it to inform and strengthen your SWOT analysis — especially for cross-source
triangulation and confidence assessment.

{synthesisMarkdown}
```

### Theme Extraction Prompt

**System prompt:**
```
You are an expert at identifying cross-cutting themes in organizational data.
Given stakeholder profiles and data source evidence, identify recurring themes
that span multiple sources or stakeholders.

For each theme, provide:
- A short label
- A description of the theme
- Evidence references (sourceType, sourceId, quote)
- Frequency count (how many sources mention it)

Return valid JSON. Do not fabricate quotes.
```

**Output schema:**
```json
{
  "themes": [
    {
      "label": "string",
      "description": "string",
      "evidenceRefs": [
        { "sourceType": "string", "sourceId": "string", "quote": "string" }
      ],
      "frequency": 1
    }
  ]
}
```

---

## VP of Engineering Role (Phase 3d)

The VP of Engineering role extends the system prompt with portfolio-level strategic context:

```
You are analyzing this organization from the perspective of a VP of Engineering.
Focus on:
- Portfolio-level strategy and investment priorities across multiple teams
- Cross-organizational coordination challenges and dependencies
- Engineering culture, hiring, and retention signals
- Platform vs product investment balance
- Technical strategy alignment with business objectives
- Organizational scalability and team topology concerns

Weight your analysis toward strategic and organizational factors rather than
individual team execution details. Elevate patterns that affect multiple teams
or the engineering organization as a whole.
```

This role instruction is prepended to the SWOT generation system prompt when `role === 'vp_engineering'`.
