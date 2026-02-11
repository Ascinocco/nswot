import type { PipelineStep, PipelineContext, StepProgressFn } from '../pipeline-step';
import type { AnonymizedProfile, ExtractionOutput, ExtractionSignal, EvidenceSourceType } from '../../domain/types';
import type { PromptDataSources } from '../prompt-builder';
import { DomainError, ERROR_CODES } from '../../domain/errors';
import { calculateTokenBudget, estimateTokens, trimToTokenBudget } from '../token-budget';
import type { ConnectedSource } from '../token-budget';

const VALID_SOURCE_TYPES: Set<string> = new Set(['profile', 'jira', 'confluence', 'github', 'codebase']);
const VALID_CATEGORIES: Set<string> = new Set(['theme', 'risk', 'strength', 'concern', 'metric']);

function buildExtractionSystemPrompt(): string {
  return `You are an expert organizational analyst specializing in signal extraction. Your job is to systematically extract key signals, patterns, risks, strengths, concerns, and metrics from organizational data.

RULES:
1. Extract specific, concrete signals from the provided data. Each signal must cite a specific source with exact sourceId.
2. NEVER invent signals. Only extract patterns clearly present in the data.
3. Categorize each signal as one of: "theme" (recurring pattern), "risk" (potential problem), "strength" (positive finding), "concern" (stakeholder worry), or "metric" (quantitative observation).
4. Use the exact sourceId values provided. Do not modify or fabricate sourceIds.
5. Include a direct quote or specific data point as evidence for each signal.
6. Also identify high-level key patterns — brief phrases summarizing the most important cross-cutting observations.
7. Use only the data provided. Do not use external knowledge.
8. All stakeholder names have been anonymized. Refer to them only by their labels.

OUTPUT FORMAT:
Respond with a single JSON object wrapped in a \`\`\`json code fence. Do not include any text before or after the JSON block.`;
}

function buildExtractionUserPrompt(
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

Each signal you extract must use one of these sourceId values:
${profileSourceIds.join('\n')}

For Jira evidence, use sourceIds like \`jira:PROJ-123\`.
${dataSources.confluenceDataMarkdown ? 'For Confluence evidence, use sourceIds like `confluence:PAGE-TITLE`.' : ''}
${dataSources.githubDataMarkdown ? 'For GitHub evidence, use sourceIds like `github:owner/repo#123`.' : ''}
${dataSources.codebaseDataMarkdown ? 'For codebase evidence, use sourceIds like `codebase:owner/repo`.' : ''}

## Task

Extract all key signals from the data above. A signal is a specific observation, pattern, risk, strength, concern, or metric found in the data. Be thorough — capture every meaningful data point.

## Output Schema

\`\`\`json
{
  "signals": [
    {
      "sourceType": ${sourceTypeUnion},
      "sourceId": "e.g. profile:Stakeholder A or jira:PROJ-123",
      "signal": "A concise statement of the extracted signal",
      "category": "theme" | "risk" | "strength" | "concern" | "metric",
      "quote": "Direct quote or specific data point supporting this signal"
    }
  ],
  "keyPatterns": [
    "Brief phrase summarizing a cross-cutting pattern (e.g., 'delivery velocity declining', 'strong testing culture')"
  ]
}
\`\`\`

- Extract signals from ALL available data sources
- Each signal should be specific and grounded in evidence
- keyPatterns should summarize the 3-8 most important high-level observations
- Order signals by importance within each source type

Extract signals now.`;
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

export function parseExtractionResponse(rawResponse: string): ExtractionOutput {
  const jsonString = extractJson(rawResponse);
  if (!jsonString) {
    throw new DomainError(
      ERROR_CODES.LLM_PARSE_ERROR,
      'No JSON block found in extraction LLM response.',
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonString);
  } catch (cause) {
    throw new DomainError(
      ERROR_CODES.LLM_PARSE_ERROR,
      `Invalid JSON in extraction response: ${(cause as Error).message}`,
      cause,
    );
  }

  if (typeof parsed !== 'object' || parsed === null) {
    throw new DomainError(
      ERROR_CODES.LLM_PARSE_ERROR,
      'Extraction response is not a JSON object.',
    );
  }

  const obj = parsed as Record<string, unknown>;

  if (!Array.isArray(obj['signals'])) {
    throw new DomainError(
      ERROR_CODES.LLM_PARSE_ERROR,
      'Missing or invalid "signals" array in extraction response.',
    );
  }

  const signals: ExtractionSignal[] = [];
  for (let i = 0; i < obj['signals'].length; i++) {
    const item = obj['signals'][i];
    if (typeof item !== 'object' || item === null) {
      throw new DomainError(
        ERROR_CODES.LLM_PARSE_ERROR,
        `signals[${i}]: expected an object`,
      );
    }

    const s = item as Record<string, unknown>;

    if (typeof s['sourceType'] !== 'string' || !VALID_SOURCE_TYPES.has(s['sourceType'])) {
      throw new DomainError(
        ERROR_CODES.LLM_PARSE_ERROR,
        `signals[${i}].sourceType: expected one of "profile", "jira", "confluence", "github", "codebase"`,
      );
    }

    if (typeof s['sourceId'] !== 'string') {
      throw new DomainError(
        ERROR_CODES.LLM_PARSE_ERROR,
        `signals[${i}].sourceId: expected a string`,
      );
    }

    if (typeof s['signal'] !== 'string' || s['signal'].length === 0) {
      throw new DomainError(
        ERROR_CODES.LLM_PARSE_ERROR,
        `signals[${i}].signal: expected a non-empty string`,
      );
    }

    if (typeof s['category'] !== 'string' || !VALID_CATEGORIES.has(s['category'])) {
      throw new DomainError(
        ERROR_CODES.LLM_PARSE_ERROR,
        `signals[${i}].category: expected one of "theme", "risk", "strength", "concern", "metric"`,
      );
    }

    if (typeof s['quote'] !== 'string') {
      throw new DomainError(
        ERROR_CODES.LLM_PARSE_ERROR,
        `signals[${i}].quote: expected a string`,
      );
    }

    signals.push({
      sourceType: s['sourceType'] as EvidenceSourceType,
      sourceId: s['sourceId'] as string,
      signal: s['signal'] as string,
      category: s['category'] as ExtractionSignal['category'],
      quote: s['quote'] as string,
    });
  }

  const keyPatterns: string[] = [];
  if (Array.isArray(obj['keyPatterns'])) {
    for (let i = 0; i < obj['keyPatterns'].length; i++) {
      const pattern = obj['keyPatterns'][i];
      if (typeof pattern === 'string' && pattern.length > 0) {
        keyPatterns.push(pattern);
      }
    }
  }

  return { signals, keyPatterns };
}

export function buildExtractionCorrectivePrompt(parseError: string): string {
  return `Your previous response could not be parsed. The error was:

${parseError}

Please respond again with ONLY a JSON object wrapped in a \`\`\`json code fence. The JSON must conform exactly to the extraction schema:

\`\`\`json
{
  "signals": [
    {
      "sourceType": "profile" | "jira" | "confluence" | "github" | "codebase",
      "sourceId": "string",
      "signal": "string",
      "category": "theme" | "risk" | "strength" | "concern" | "metric",
      "quote": "string"
    }
  ],
  "keyPatterns": ["string"]
}
\`\`\`

Do not include any explanatory text before or after the JSON block.`;
}

/**
 * Pipeline step that extracts key signals, patterns, and observations from raw data.
 * Runs before SynthesisStep to provide structured extraction for cross-source correlation.
 */
export class ExtractionStep implements PipelineStep {
  readonly name = 'extraction';

  async execute(
    context: PipelineContext,
    onProgress: StepProgressFn,
  ): Promise<PipelineContext> {
    onProgress('extracting', 'Extracting signals from data sources...');

    const budget = calculateTokenBudget(
      context.contextWindow,
      [...context.connectedSources] as ConnectedSource[],
    );

    const systemPrompt = buildExtractionSystemPrompt();
    const userPrompt = buildExtractionUserPrompt(
      context.anonymizedProfiles,
      context.dataSources,
      budget,
    );

    onProgress('extracting', 'Sending extraction request to LLM...');
    const onToken = (tokenCount: number): void => {
      onProgress(
        'extracting',
        `Extracting signals — ${tokenCount.toLocaleString()} tokens so far...`,
      );
    };

    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ];
    let llmResult = await context.llmCaller.call(messages, context.modelId, onToken);
    let rawResponse = llmResult.content;

    onProgress('extracting', 'Parsing extraction response...');
    try {
      const extractionOutput = parseExtractionResponse(rawResponse);
      return { ...context, extractionOutput };
    } catch (firstError) {
      // Corrective retry
      const errorMessage = firstError instanceof DomainError
        ? firstError.message
        : 'Unknown parse error';
      const truncated = llmResult.finishReason === 'length';
      const errorDetail = truncated
        ? `${errorMessage} (response was truncated — be more concise.)`
        : errorMessage;

      onProgress('extracting', 'Retrying extraction with corrective prompt...');
      const correctivePrompt = buildExtractionCorrectivePrompt(errorDetail);
      const retryMessages = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
        { role: 'assistant', content: rawResponse },
        { role: 'user', content: correctivePrompt },
      ];
      llmResult = await context.llmCaller.call(retryMessages, context.modelId, onToken);
      rawResponse = llmResult.content;

      onProgress('extracting', 'Parsing corrected extraction response...');
      const extractionOutput = parseExtractionResponse(rawResponse);
      return { ...context, extractionOutput };
    }
  }
}
