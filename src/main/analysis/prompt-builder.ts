import type { AnonymizedProfile } from '../domain/types';
import { estimateTokens, trimToTokenBudget } from './token-budget';
import type { TokenBudget } from './token-budget';

export const PROMPT_VERSION = 'phase3a-v1';

const ROLE_DISPLAY_NAMES: Record<string, string> = {
  staff_engineer: 'Staff Engineer',
  senior_em: 'Senior Engineering Manager',
};

const ROLE_INSTRUCTIONS: Record<string, string> = {
  staff_engineer: `- Focus on tactical, near-term recommendations (next sprint or next week)
- Recommend specific technical investigations, design reviews, or stakeholder conversations
- Frame recommendations as direct actions: "Propose a design review for...", "Schedule a pairing session with...", "Investigate the dependency between..."
- Highlight technical debt, architecture risks, and delivery bottlenecks
- When citing team dynamics, frame through the lens of technical decision-making`,
  senior_em: `- Focus on process and team-oriented recommendations (next quarter or next cycle)
- Recommend resourcing changes, process improvements, and cross-team coordination actions
- Frame recommendations as management actions: "Consider reallocating...", "Initiate a retrospective on...", "Escalate to leadership...", "Establish a working group for..."
- Highlight team health, capacity risks, organizational misalignment, and planning gaps
- When citing technical issues, frame through the lens of team impact and resourcing`,
};

export interface PromptDataSources {
  jiraDataMarkdown: string | null;
  confluenceDataMarkdown: string | null;
  githubDataMarkdown: string | null;
  codebaseDataMarkdown: string | null;
}

export function buildSystemPrompt(): string {
  return `You are an expert organizational analyst. You produce structured SWOT analyses for software engineering organizations based on stakeholder interview data and external data sources (Jira, Confluence, GitHub, codebase analysis).

RULES — you must follow these exactly:
1. Every claim in the SWOT must cite specific evidence from the provided data. Use the exact sourceId values provided.
2. NEVER invent information. If the data does not support a claim, do not make it.
3. If evidence is weak or from a single vague source, set confidence to "low".
4. If you cannot find evidence for a particular SWOT quadrant, return an empty array for that quadrant — do not fabricate items.
5. Recommendations must be concrete and actionable, not generic.
6. Use only the data provided in this prompt. Do not use external knowledge about the organization, its employees, or its industry.
7. All stakeholder names have been anonymized. Refer to them only by their labels (e.g., "Stakeholder A").

CROSS-SOURCE TRIANGULATION:
- When multiple source types (profiles, Jira, Confluence, GitHub) corroborate the same claim, set confidence to "high" and cite evidence from each source.
- When a claim is supported by only one source type, set confidence to "medium" or "low" depending on evidence strength.
- Actively look for patterns that span sources: e.g., a stakeholder concern about delivery speed + Jira stories stuck in review + GitHub PRs with slow merge times.
- Each claim should ideally cite 2+ pieces of evidence. Single-evidence claims should have confidence "low".

EVIDENCE DENSITY:
- Prefer claims with rich, multi-source evidence over numerous weakly-supported claims.
- If a claim has supporting evidence from 3+ source types, flag it as high-confidence.
- Quality of evidence matters more than quantity.

OUTPUT FORMAT:
Respond with a single JSON object wrapped in a \`\`\`json code fence. The JSON must conform exactly to the schema provided below. Do not include any text before or after the JSON block.`;
}

export function buildUserPrompt(
  role: string,
  anonymizedProfiles: AnonymizedProfile[],
  dataSources: PromptDataSources,
  budget: TokenBudget,
): string {
  const roleDisplayName = ROLE_DISPLAY_NAMES[role] ?? role;
  const roleInstructions = ROLE_INSTRUCTIONS[role] ?? '';

  const profileSourceIds = anonymizedProfiles.map(
    (p) => `- \`profile:${p.label}\``,
  );

  let profilesSection = buildProfilesSection(anonymizedProfiles);
  if (estimateTokens(profilesSection) > budget.profiles) {
    profilesSection = trimToTokenBudget(profilesSection, budget.profiles);
  }

  // Build Jira section
  let jiraSection = '';
  if (dataSources.jiraDataMarkdown) {
    jiraSection = dataSources.jiraDataMarkdown;
    if (budget.jiraData > 0 && estimateTokens(jiraSection) > budget.jiraData) {
      jiraSection = trimToTokenBudget(jiraSection, budget.jiraData);
    }
  } else {
    jiraSection = 'No Jira data is available for this analysis.';
  }

  // Build Confluence section
  let confluenceSection = '';
  if (dataSources.confluenceDataMarkdown) {
    confluenceSection = dataSources.confluenceDataMarkdown;
    if (budget.confluenceData > 0 && estimateTokens(confluenceSection) > budget.confluenceData) {
      confluenceSection = trimToTokenBudget(confluenceSection, budget.confluenceData);
    }
  } else {
    confluenceSection = 'No Confluence data is available for this analysis.';
  }

  // Build GitHub section
  let githubSection = '';
  if (dataSources.githubDataMarkdown) {
    githubSection = dataSources.githubDataMarkdown;
    if (budget.githubData > 0 && estimateTokens(githubSection) > budget.githubData) {
      githubSection = trimToTokenBudget(githubSection, budget.githubData);
    }
  } else {
    githubSection = 'No GitHub data is available for this analysis.';
  }

  // Build Codebase section
  let codebaseSection = '';
  if (dataSources.codebaseDataMarkdown) {
    codebaseSection = dataSources.codebaseDataMarkdown;
    if (budget.codebaseData > 0 && estimateTokens(codebaseSection) > budget.codebaseData) {
      codebaseSection = trimToTokenBudget(codebaseSection, budget.codebaseData);
    }
  } else {
    codebaseSection = 'No codebase analysis data is available for this analysis.';
  }

  // Build source types list for the schema
  const availableSourceTypes = ['profile', 'jira'];
  if (dataSources.confluenceDataMarkdown) availableSourceTypes.push('confluence');
  if (dataSources.githubDataMarkdown) availableSourceTypes.push('github');
  if (dataSources.codebaseDataMarkdown) availableSourceTypes.push('codebase');
  const sourceTypeUnion = availableSourceTypes.map((s) => `"${s}"`).join(' | ');

  // Summaries schema
  const summariesSchema: Record<string, string> = {
    profiles: '"markdown string summarizing key themes from stakeholder interviews"',
    jira: '"markdown string summarizing key patterns from Jira data"',
  };
  if (dataSources.confluenceDataMarkdown) {
    summariesSchema['confluence'] =
      '"markdown string summarizing key patterns from Confluence data"';
  }
  if (dataSources.githubDataMarkdown) {
    summariesSchema['github'] =
      '"markdown string summarizing key patterns from GitHub data"';
  }
  if (dataSources.codebaseDataMarkdown) {
    summariesSchema['codebase'] =
      '"markdown string summarizing key patterns from codebase analysis"';
  }
  const summariesSchemaStr = Object.entries(summariesSchema)
    .map(([k, v]) => `    "${k}": ${v}`)
    .join(',\n');

  return `## Role Context

You are producing this analysis for a ${roleDisplayName}. Tailor your recommendations accordingly:

${roleInstructions}

## Stakeholder Profiles

The following profiles represent stakeholders who were interviewed. Each has been anonymized.

${profilesSection}

## Jira Data

${jiraSection}

## Confluence Data

${confluenceSection}

## GitHub Data

${githubSection}

## Codebase Analysis Data

${codebaseSection}

## Data Sources Reference

Each piece of evidence you cite must use one of these sourceId values:
${profileSourceIds.join('\n')}

For Jira evidence, use sourceIds like \`jira:PROJ-123\`.
${dataSources.confluenceDataMarkdown ? 'For Confluence evidence, use sourceIds like `confluence:PAGE-TITLE` or `confluence:page-id`.' : ''}
${dataSources.githubDataMarkdown ? 'For GitHub evidence, use sourceIds like `github:owner/repo#123`.' : ''}
${dataSources.codebaseDataMarkdown ? 'For codebase evidence, use sourceIds like `codebase:owner/repo`.' : ''}

## Output Schema

\`\`\`json
{
  "strengths": [SwotItem],
  "weaknesses": [SwotItem],
  "opportunities": [SwotItem],
  "threats": [SwotItem],
  "summaries": {
${summariesSchemaStr}
  }
}
\`\`\`

Where each SwotItem is:
\`\`\`json
{
  "claim": "A specific, actionable statement about the organization",
  "evidence": [
    {
      "sourceType": ${sourceTypeUnion},
      "sourceId": "profile:Stakeholder A" | "jira:PROJ-123"${dataSources.confluenceDataMarkdown ? ' | "confluence:page-title"' : ''}${dataSources.githubDataMarkdown ? ' | "github:owner/repo#123"' : ''}${dataSources.codebaseDataMarkdown ? ' | "codebase:owner/repo"' : ''},
      "sourceLabel": "Human-readable label for this source",
      "quote": "Direct quote or specific data point supporting the claim"
    }
  ],
  "impact": "What happens if this is not addressed (for weaknesses/threats) or leveraged (for strengths/opportunities)",
  "recommendation": "Specific next step tailored to the ${roleDisplayName} role",
  "confidence": "high" | "medium" | "low"
}
\`\`\`

Produce the analysis now.`;
}

function buildProfilesSection(profiles: AnonymizedProfile[]): string {
  return profiles
    .map((p) => {
      const quotes =
        p.quotes.length > 0
          ? p.quotes.map((q) => `  - "${q}"`).join('\n')
          : '  (none)';
      return `### ${p.label}
- **Role**: ${p.role ?? 'Not specified'}
- **Team**: ${p.team ?? 'Not specified'}
- **Concerns**: ${p.concerns ?? 'None provided'}
- **Priorities**: ${p.priorities ?? 'None provided'}
- **Key Quotes**:
${quotes}
- **Notes**: ${p.notes ?? 'None provided'}`;
    })
    .join('\n\n');
}

export function buildCorrectivePrompt(parseError: string): string {
  return `Your previous response could not be parsed. The error was:

${parseError}

Please respond again with ONLY a JSON object wrapped in a \`\`\`json code fence. The JSON must conform exactly to the schema described in the original prompt. Do not include any explanatory text before or after the JSON block.

Common issues to avoid:
- Trailing commas in JSON arrays or objects
- Unescaped quotes within string values (use \\" instead)
- Missing closing braces or brackets
- Using single quotes instead of double quotes

The JSON must have this top-level shape: { "strengths": [...], "weaknesses": [...], "opportunities": [...], "threats": [...], "summaries": { "profiles": "...", "jira": "..."[, "confluence": "..."][, "github": "..."][, "codebase": "..."] } }`;
}
