import type { AnonymizedProfile } from '../domain/types';
import { estimateTokens, trimToTokenBudget } from './token-budget';
import type { TokenBudget } from './token-budget';

export const PROMPT_VERSION = 'mvp-v1';

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

export function buildSystemPrompt(): string {
  return `You are an expert organizational analyst. You produce structured SWOT analyses for software engineering organizations based on stakeholder interview data and Jira project data.

RULES — you must follow these exactly:
1. Every claim in the SWOT must cite specific evidence from the provided data. Use the exact sourceId values provided.
2. NEVER invent information. If the data does not support a claim, do not make it.
3. If evidence is weak or from a single vague source, set confidence to "low".
4. If you cannot find evidence for a particular SWOT quadrant, return an empty array for that quadrant — do not fabricate items.
5. Recommendations must be concrete and actionable, not generic.
6. Use only the data provided in this prompt. Do not use external knowledge about the organization, its employees, or its industry.
7. All stakeholder names have been anonymized. Refer to them only by their labels (e.g., "Stakeholder A").

OUTPUT FORMAT:
Respond with a single JSON object wrapped in a \`\`\`json code fence. The JSON must conform exactly to the schema provided below. Do not include any text before or after the JSON block.`;
}

export function buildUserPrompt(
  role: string,
  anonymizedProfiles: AnonymizedProfile[],
  jiraDataMarkdown: string | null,
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

  let jiraSection = '';
  if (jiraDataMarkdown) {
    jiraSection = jiraDataMarkdown;
    if (estimateTokens(jiraSection) > budget.jiraData) {
      jiraSection = trimToTokenBudget(jiraSection, budget.jiraData);
    }
  } else {
    jiraSection = 'No Jira data is available for this analysis. Base your analysis solely on the stakeholder profiles provided.';
  }

  return `## Role Context

You are producing this analysis for a ${roleDisplayName}. Tailor your recommendations accordingly:

${roleInstructions}

## Stakeholder Profiles

The following profiles represent stakeholders who were interviewed. Each has been anonymized.

${profilesSection}

## Jira Data

${jiraSection}

## Data Sources Reference

Each piece of evidence you cite must use one of these sourceId values:
${profileSourceIds.join('\n')}

## Output Schema

\`\`\`json
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
\`\`\`

Where each SwotItem is:
\`\`\`json
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

The JSON must have this top-level shape: { "strengths": [...], "weaknesses": [...], "opportunities": [...], "threats": [...], "summaries": { "profiles": "...", "jira": "..." } }`;
}
