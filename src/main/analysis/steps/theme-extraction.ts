import type { PipelineStep, PipelineContext, StepProgressFn } from '../pipeline-step';
import type { AnonymizedProfile, ThemeOutput, ThemeEvidenceRef, EvidenceSourceType } from '../../domain/types';
import type { PromptDataSources } from '../prompt-builder';
import { DomainError, ERROR_CODES } from '../../domain/errors';
import { calculateTokenBudget, estimateTokens, trimToTokenBudget } from '../token-budget';
import type { ConnectedSource } from '../token-budget';

const VALID_SOURCE_TYPES: Set<string> = new Set(['profile', 'jira', 'confluence', 'github', 'codebase']);

function buildThemeSystemPrompt(): string {
  return `You are an expert organizational analyst specializing in pattern recognition. Your job is to identify recurring themes — patterns, topics, and concerns that appear across multiple pieces of evidence in organizational data.

RULES:
1. Every theme must cite specific evidence from the provided data. Use the exact sourceId values provided.
2. NEVER invent themes. Only identify patterns that are clearly supported by the data.
3. Focus on themes that are actionable — patterns that inform decision-making.
4. Themes should be distinct from each other. Do not create overlapping themes.
5. A theme should appear in at least 2 pieces of evidence to be worth reporting. Single-mention patterns are not themes.
6. Use only the data provided. Do not use external knowledge.
7. All stakeholder names have been anonymized. Refer to them only by their labels.

OUTPUT FORMAT:
Respond with a single JSON object wrapped in a \`\`\`json code fence. Do not include any text before or after the JSON block.`;
}

function buildThemeUserPrompt(
  anonymizedProfiles: AnonymizedProfile[],
  dataSources: PromptDataSources,
  budget: ReturnType<typeof calculateTokenBudget>,
): string {
  let profilesSection = anonymizedProfiles
    .map((p) => {
      const quotes = p.quotes.length > 0
        ? p.quotes.map((q) => `  - "${q}"`).join('\n')
        : '  (none)';
      return `### ${p.label}
- **Role**: ${p.role ?? 'Not specified'}
- **Team**: ${p.team ?? 'Not specified'}
- **Concerns**: ${p.concerns ?? 'None provided'}
- **Priorities**: ${p.priorities ?? 'None provided'}
- **Key Quotes**:
${quotes}`;
    })
    .join('\n\n');

  if (estimateTokens(profilesSection) > budget.profiles) {
    profilesSection = trimToTokenBudget(profilesSection, budget.profiles);
  }

  const jiraSection = dataSources.jiraDataMarkdown ?? 'No Jira data available.';
  const confluenceSection = dataSources.confluenceDataMarkdown ?? 'No Confluence data available.';
  const githubSection = dataSources.githubDataMarkdown ?? 'No GitHub data available.';
  const codebaseSection = dataSources.codebaseDataMarkdown ?? 'No codebase data available.';

  const profileSourceIds = anonymizedProfiles.map(
    (p) => `- \`profile:${p.label}\``,
  );

  const availableSourceTypes = ['profile', 'jira'];
  if (dataSources.confluenceDataMarkdown) availableSourceTypes.push('confluence');
  if (dataSources.githubDataMarkdown) availableSourceTypes.push('github');
  if (dataSources.codebaseDataMarkdown) availableSourceTypes.push('codebase');
  const sourceTypeUnion = availableSourceTypes.map((s) => `"${s}"`).join(' | ');

  return `## Stakeholder Profiles

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
${dataSources.confluenceDataMarkdown ? 'For Confluence evidence, use sourceIds like `confluence:PAGE-TITLE`.' : ''}
${dataSources.githubDataMarkdown ? 'For GitHub evidence, use sourceIds like `github:owner/repo#123`.' : ''}
${dataSources.codebaseDataMarkdown ? 'For codebase evidence, use sourceIds like `codebase:owner/repo`.' : ''}

## Task

Identify the recurring themes across all the data above. A theme is a pattern or topic that appears in multiple evidence sources — e.g., "on-call burnout", "deploy velocity concerns", "cross-team coordination gaps".

## Output Schema

\`\`\`json
{
  "themes": [
    {
      "label": "Short theme name (3-6 words)",
      "description": "A paragraph explaining what this theme is and why it matters",
      "evidenceRefs": [
        {
          "sourceType": ${sourceTypeUnion},
          "sourceId": "e.g. profile:Stakeholder A or jira:PROJ-123",
          "quote": "Direct quote or specific data point"
        }
      ],
      "frequency": 2
    }
  ]
}
\`\`\`

- \`frequency\` is the number of distinct evidence sources that reference this theme
- \`sourceTypes\` will be computed from evidenceRefs — do NOT include it in your response
- Order themes by frequency (highest first)

Identify themes now.`;
}

function extractJson(text: string): string | null {
  const fenceMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)```/);
  if (fenceMatch?.[1]) {
    return fenceMatch[1].trim();
  }
  const jsonStart = text.indexOf('{');
  if (jsonStart !== -1) {
    const jsonEnd = text.lastIndexOf('}');
    if (jsonEnd > jsonStart) {
      return text.slice(jsonStart, jsonEnd + 1);
    }
  }
  return null;
}

function parseThemeResponse(rawResponse: string): ThemeOutput[] {
  const jsonString = extractJson(rawResponse);
  if (!jsonString) {
    throw new DomainError(
      ERROR_CODES.LLM_PARSE_ERROR,
      'No JSON block found in theme extraction LLM response.',
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonString);
  } catch (cause) {
    throw new DomainError(
      ERROR_CODES.LLM_PARSE_ERROR,
      `Invalid JSON in theme extraction response: ${(cause as Error).message}`,
      cause,
    );
  }

  if (typeof parsed !== 'object' || parsed === null) {
    throw new DomainError(
      ERROR_CODES.LLM_PARSE_ERROR,
      'Theme extraction response is not a JSON object.',
    );
  }

  const obj = parsed as Record<string, unknown>;
  const themesRaw = obj['themes'];
  if (!Array.isArray(themesRaw)) {
    throw new DomainError(
      ERROR_CODES.LLM_PARSE_ERROR,
      'Missing or invalid "themes" array in theme extraction response.',
    );
  }

  const themes: ThemeOutput[] = [];
  for (let i = 0; i < themesRaw.length; i++) {
    const item = themesRaw[i];
    if (typeof item !== 'object' || item === null) {
      throw new DomainError(
        ERROR_CODES.LLM_PARSE_ERROR,
        `themes[${i}]: expected an object`,
      );
    }

    const t = item as Record<string, unknown>;

    if (typeof t['label'] !== 'string' || t['label'].length === 0) {
      throw new DomainError(
        ERROR_CODES.LLM_PARSE_ERROR,
        `themes[${i}].label: expected a non-empty string`,
      );
    }

    if (typeof t['description'] !== 'string' || t['description'].length === 0) {
      throw new DomainError(
        ERROR_CODES.LLM_PARSE_ERROR,
        `themes[${i}].description: expected a non-empty string`,
      );
    }

    if (!Array.isArray(t['evidenceRefs']) || t['evidenceRefs'].length === 0) {
      throw new DomainError(
        ERROR_CODES.LLM_PARSE_ERROR,
        `themes[${i}].evidenceRefs: expected a non-empty array`,
      );
    }

    const evidenceRefs: ThemeEvidenceRef[] = [];
    const sourceTypesSet = new Set<EvidenceSourceType>();

    for (let j = 0; j < t['evidenceRefs'].length; j++) {
      const ref = t['evidenceRefs'][j];
      if (typeof ref !== 'object' || ref === null) {
        throw new DomainError(
          ERROR_CODES.LLM_PARSE_ERROR,
          `themes[${i}].evidenceRefs[${j}]: expected an object`,
        );
      }

      const r = ref as Record<string, unknown>;

      if (typeof r['sourceType'] !== 'string' || !VALID_SOURCE_TYPES.has(r['sourceType'])) {
        throw new DomainError(
          ERROR_CODES.LLM_PARSE_ERROR,
          `themes[${i}].evidenceRefs[${j}].sourceType: expected one of "profile", "jira", "confluence", "github", "codebase"`,
        );
      }

      if (typeof r['sourceId'] !== 'string') {
        throw new DomainError(
          ERROR_CODES.LLM_PARSE_ERROR,
          `themes[${i}].evidenceRefs[${j}].sourceId: expected a string`,
        );
      }

      if (typeof r['quote'] !== 'string') {
        throw new DomainError(
          ERROR_CODES.LLM_PARSE_ERROR,
          `themes[${i}].evidenceRefs[${j}].quote: expected a string`,
        );
      }

      const sourceType = r['sourceType'] as EvidenceSourceType;
      sourceTypesSet.add(sourceType);
      evidenceRefs.push({
        sourceType,
        sourceId: r['sourceId'] as string,
        quote: r['quote'] as string,
      });
    }

    const frequency = typeof t['frequency'] === 'number' && t['frequency'] >= 1
      ? t['frequency']
      : evidenceRefs.length;

    themes.push({
      label: t['label'] as string,
      description: t['description'] as string,
      evidenceRefs,
      sourceTypes: [...sourceTypesSet],
      frequency,
    });
  }

  return themes;
}

/**
 * Pipeline step that extracts recurring themes from analysis data.
 * Runs before SwotGenerationStep to identify cross-cutting patterns.
 */
export class ThemeExtractionStep implements PipelineStep {
  readonly name = 'theme-extraction';

  async execute(
    context: PipelineContext,
    onProgress: StepProgressFn,
  ): Promise<PipelineContext> {
    onProgress('extracting_themes', 'Identifying recurring themes...');

    const budget = calculateTokenBudget(
      context.contextWindow,
      [...context.connectedSources] as ConnectedSource[],
    );

    const systemPrompt = buildThemeSystemPrompt();
    const userPrompt = buildThemeUserPrompt(
      context.anonymizedProfiles,
      context.dataSources,
      budget,
    );

    onProgress('extracting_themes', 'Sending theme extraction request to LLM...');
    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ];

    const llmResult = await context.llmCaller.call(messages, context.modelId);
    const rawResponse = llmResult.content;

    onProgress('extracting_themes', 'Parsing theme extraction response...');
    const themes = parseThemeResponse(rawResponse);

    return {
      ...context,
      themes,
    };
  }
}
