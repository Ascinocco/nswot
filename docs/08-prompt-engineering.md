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

Token budget allocation for input:
- System prompt: ~500 tokens
- Anonymized profiles: ~40% of remaining context
- Jira data: ~50% of remaining context
- Output schema instructions: ~500 tokens
- Buffer: 10%

---

## Analysis Prompt (MVP — Single Pass)

### System Prompt

```
You are an expert organizational analyst. You produce structured SWOT analyses for software engineering organizations based on stakeholder interview data and Jira project data.

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
      "sourceType": "profile" | "jira",
      "sourceId": "profile:Stakeholder A" | "jira:PROJ-123",
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
