import type { PipelineStep, PipelineContext, StepProgressFn } from '../pipeline-step';
import type { ExtractionOutput, ExtractionSignal, SynthesisOutput, SynthesisCorrelation, EvidenceSourceType } from '../../domain/types';
import { DomainError, ERROR_CODES } from '../../domain/errors';

function buildSynthesisSystemPrompt(): string {
  return `You are an expert organizational analyst specializing in cross-source synthesis. Your job is to correlate signals from multiple data sources to identify patterns of agreement and conflict.

RULES:
1. Correlate signals that describe the same underlying pattern or issue, even when expressed differently across sources.
2. Mark agreement strength based on how many distinct source types support the correlation: "strong" (3+ source types), "moderate" (2 source types), "weak" (1 source type but multiple signals).
3. Identify conflicts — cases where signals from different sources contradict each other.
4. Produce a synthesis markdown narrative that a SWOT analysis can be built from.
5. Use only the signals provided. Do not invent new findings.
6. The synthesis narrative should highlight cross-source patterns, agreements, and conflicts.

OUTPUT FORMAT:
Respond with a single JSON object wrapped in a \`\`\`json code fence. Do not include any text before or after the JSON block.`;
}

function buildSynthesisUserPrompt(extraction: ExtractionOutput): string {
  const signalsBySource = new Map<string, ExtractionSignal[]>();
  for (const signal of extraction.signals) {
    const key = signal.sourceType;
    const existing = signalsBySource.get(key) ?? [];
    existing.push(signal);
    signalsBySource.set(key, existing);
  }

  let signalsSection = '';
  for (const [sourceType, signals] of signalsBySource) {
    signalsSection += `### ${sourceType.charAt(0).toUpperCase() + sourceType.slice(1)} Signals\n\n`;
    for (let i = 0; i < signals.length; i++) {
      const s = signals[i]!;
      signalsSection += `${i + 1}. [${s.category}] ${s.signal}\n   Source: ${s.sourceId}\n   Quote: "${s.quote}"\n\n`;
    }
  }

  const patternsSection = extraction.keyPatterns.length > 0
    ? extraction.keyPatterns.map((p, i) => `${i + 1}. ${p}`).join('\n')
    : 'No key patterns identified.';

  return `## Extracted Signals

${signalsSection}

## Key Patterns Identified

${patternsSection}

## Task

Synthesize the signals above into correlations. Group signals that describe the same underlying pattern, even if they come from different sources. For each correlation:
- Write a clear claim that captures the correlated finding
- List the supporting signals (use the exact signal text)
- Identify the source types involved
- Assess agreement strength: "strong" (3+ source types corroborate), "moderate" (2 source types), "weak" (1 source type)
- Note any conflicts between signals

Then produce a synthesis narrative in markdown that summarizes all correlations, highlighting cross-source agreements and conflicts. This narrative will feed into a SWOT analysis.

## Output Schema

\`\`\`json
{
  "correlations": [
    {
      "claim": "A synthesized finding that combines related signals",
      "supportingSignals": [
        {
          "sourceType": "profile" | "jira" | "confluence" | "github" | "codebase",
          "sourceId": "string",
          "signal": "string",
          "category": "theme" | "risk" | "strength" | "concern" | "metric",
          "quote": "string"
        }
      ],
      "sourceTypes": ["profile", "jira"],
      "agreement": "strong" | "moderate" | "weak",
      "conflicts": ["Any conflicting evidence, or empty array if none"]
    }
  ],
  "synthesisMarkdown": "## Synthesis\\n\\nA markdown narrative summarizing all correlations..."
}
\`\`\`

- Order correlations by agreement strength (strong first)
- The synthesisMarkdown should be a complete narrative suitable for feeding into a SWOT analysis
- Include both agreements and conflicts in the narrative

Synthesize now.`;
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

const VALID_SOURCE_TYPES: Set<string> = new Set(['profile', 'jira', 'confluence', 'github', 'codebase']);
const VALID_CATEGORIES: Set<string> = new Set(['theme', 'risk', 'strength', 'concern', 'metric']);

export function parseSynthesisResponse(rawResponse: string): SynthesisOutput {
  const jsonString = extractJson(rawResponse);
  if (!jsonString) {
    throw new DomainError(
      ERROR_CODES.LLM_PARSE_ERROR,
      'No JSON block found in synthesis LLM response.',
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonString);
  } catch (cause) {
    throw new DomainError(
      ERROR_CODES.LLM_PARSE_ERROR,
      `Invalid JSON in synthesis response: ${(cause as Error).message}`,
      cause,
    );
  }

  if (typeof parsed !== 'object' || parsed === null) {
    throw new DomainError(
      ERROR_CODES.LLM_PARSE_ERROR,
      'Synthesis response is not a JSON object.',
    );
  }

  const obj = parsed as Record<string, unknown>;

  if (!Array.isArray(obj['correlations'])) {
    throw new DomainError(
      ERROR_CODES.LLM_PARSE_ERROR,
      'Missing or invalid "correlations" array in synthesis response.',
    );
  }

  const correlations: SynthesisCorrelation[] = [];
  for (let i = 0; i < obj['correlations'].length; i++) {
    const item = obj['correlations'][i];
    if (typeof item !== 'object' || item === null) {
      throw new DomainError(
        ERROR_CODES.LLM_PARSE_ERROR,
        `correlations[${i}]: expected an object`,
      );
    }

    const c = item as Record<string, unknown>;

    if (typeof c['claim'] !== 'string' || c['claim'].length === 0) {
      throw new DomainError(
        ERROR_CODES.LLM_PARSE_ERROR,
        `correlations[${i}].claim: expected a non-empty string`,
      );
    }

    if (!Array.isArray(c['supportingSignals'])) {
      throw new DomainError(
        ERROR_CODES.LLM_PARSE_ERROR,
        `correlations[${i}].supportingSignals: expected an array`,
      );
    }

    const supportingSignals: ExtractionSignal[] = [];
    for (let j = 0; j < c['supportingSignals'].length; j++) {
      const sig = c['supportingSignals'][j];
      if (typeof sig !== 'object' || sig === null) {
        throw new DomainError(
          ERROR_CODES.LLM_PARSE_ERROR,
          `correlations[${i}].supportingSignals[${j}]: expected an object`,
        );
      }

      const s = sig as Record<string, unknown>;

      if (typeof s['sourceType'] !== 'string' || !VALID_SOURCE_TYPES.has(s['sourceType'])) {
        throw new DomainError(
          ERROR_CODES.LLM_PARSE_ERROR,
          `correlations[${i}].supportingSignals[${j}].sourceType: expected one of "profile", "jira", "confluence", "github", "codebase"`,
        );
      }

      if (typeof s['sourceId'] !== 'string') {
        throw new DomainError(
          ERROR_CODES.LLM_PARSE_ERROR,
          `correlations[${i}].supportingSignals[${j}].sourceId: expected a string`,
        );
      }

      if (typeof s['signal'] !== 'string') {
        throw new DomainError(
          ERROR_CODES.LLM_PARSE_ERROR,
          `correlations[${i}].supportingSignals[${j}].signal: expected a string`,
        );
      }

      if (typeof s['category'] !== 'string' || !VALID_CATEGORIES.has(s['category'])) {
        throw new DomainError(
          ERROR_CODES.LLM_PARSE_ERROR,
          `correlations[${i}].supportingSignals[${j}].category: expected one of "theme", "risk", "strength", "concern", "metric"`,
        );
      }

      if (typeof s['quote'] !== 'string') {
        throw new DomainError(
          ERROR_CODES.LLM_PARSE_ERROR,
          `correlations[${i}].supportingSignals[${j}].quote: expected a string`,
        );
      }

      supportingSignals.push({
        sourceType: s['sourceType'] as EvidenceSourceType,
        sourceId: s['sourceId'] as string,
        signal: s['signal'] as string,
        category: s['category'] as ExtractionSignal['category'],
        quote: s['quote'] as string,
      });
    }

    if (!Array.isArray(c['sourceTypes'])) {
      throw new DomainError(
        ERROR_CODES.LLM_PARSE_ERROR,
        `correlations[${i}].sourceTypes: expected an array`,
      );
    }

    const sourceTypes: EvidenceSourceType[] = [];
    for (const st of c['sourceTypes']) {
      if (typeof st === 'string' && VALID_SOURCE_TYPES.has(st)) {
        sourceTypes.push(st as EvidenceSourceType);
      }
    }

    const agreement = c['agreement'];
    if (agreement !== 'strong' && agreement !== 'moderate' && agreement !== 'weak') {
      throw new DomainError(
        ERROR_CODES.LLM_PARSE_ERROR,
        `correlations[${i}].agreement: expected "strong", "moderate", or "weak"`,
      );
    }

    const conflicts: string[] = [];
    if (Array.isArray(c['conflicts'])) {
      for (const conflict of c['conflicts']) {
        if (typeof conflict === 'string' && conflict.length > 0) {
          conflicts.push(conflict);
        }
      }
    }

    correlations.push({
      claim: c['claim'] as string,
      supportingSignals,
      sourceTypes,
      agreement,
      conflicts,
    });
  }

  if (typeof obj['synthesisMarkdown'] !== 'string' || obj['synthesisMarkdown'].length === 0) {
    throw new DomainError(
      ERROR_CODES.LLM_PARSE_ERROR,
      'Missing or invalid "synthesisMarkdown" string in synthesis response.',
    );
  }

  return {
    correlations,
    synthesisMarkdown: obj['synthesisMarkdown'] as string,
  };
}

export function buildSynthesisCorrectivePrompt(parseError: string): string {
  return `Your previous response could not be parsed. The error was:

${parseError}

Please respond again with ONLY a JSON object wrapped in a \`\`\`json code fence. The JSON must conform exactly to the synthesis schema:

\`\`\`json
{
  "correlations": [
    {
      "claim": "string",
      "supportingSignals": [
        {
          "sourceType": "profile" | "jira" | "confluence" | "github" | "codebase",
          "sourceId": "string",
          "signal": "string",
          "category": "theme" | "risk" | "strength" | "concern" | "metric",
          "quote": "string"
        }
      ],
      "sourceTypes": ["string"],
      "agreement": "strong" | "moderate" | "weak",
      "conflicts": ["string"]
    }
  ],
  "synthesisMarkdown": "markdown string"
}
\`\`\`

Do not include any explanatory text before or after the JSON block.`;
}

/**
 * Pipeline step that synthesizes extraction signals into cross-source correlations.
 * Runs after ExtractionStep and before SwotGenerationStep.
 */
export class SynthesisStep implements PipelineStep {
  readonly name = 'synthesis';

  async execute(
    context: PipelineContext,
    onProgress: StepProgressFn,
  ): Promise<PipelineContext> {
    if (!context.extractionOutput) {
      throw new DomainError(
        ERROR_CODES.INTERNAL_ERROR,
        'SynthesisStep requires extractionOutput from a prior ExtractionStep.',
      );
    }

    if (context.extractionOutput.signals.length === 0) {
      // No signals to synthesize — return empty synthesis
      return {
        ...context,
        synthesisOutput: {
          correlations: [],
          synthesisMarkdown: 'No signals were extracted, so no synthesis could be performed.',
        },
      };
    }

    onProgress('synthesizing', 'Synthesizing cross-source correlations...');

    const systemPrompt = buildSynthesisSystemPrompt();
    const userPrompt = buildSynthesisUserPrompt(context.extractionOutput);

    onProgress('synthesizing', 'Sending synthesis request to LLM...');
    const onToken = (tokenCount: number): void => {
      onProgress(
        'synthesizing',
        `Synthesizing correlations — ${tokenCount.toLocaleString()} tokens so far...`,
      );
    };

    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ];
    let llmResult = await context.llmCaller.call(messages, context.modelId, onToken);
    let rawResponse = llmResult.content;

    onProgress('synthesizing', 'Parsing synthesis response...');
    try {
      const synthesisOutput = parseSynthesisResponse(rawResponse);
      return { ...context, synthesisOutput };
    } catch (firstError) {
      // Corrective retry
      const errorMessage = firstError instanceof DomainError
        ? firstError.message
        : 'Unknown parse error';
      const truncated = llmResult.finishReason === 'length';
      const errorDetail = truncated
        ? `${errorMessage} (response was truncated — be more concise.)`
        : errorMessage;

      onProgress('synthesizing', 'Retrying synthesis with corrective prompt...');
      const correctivePrompt = buildSynthesisCorrectivePrompt(errorDetail);
      const retryMessages = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
        { role: 'assistant', content: rawResponse },
        { role: 'user', content: correctivePrompt },
      ];
      llmResult = await context.llmCaller.call(retryMessages, context.modelId, onToken);
      rawResponse = llmResult.content;

      onProgress('synthesizing', 'Parsing corrected synthesis response...');
      const synthesisOutput = parseSynthesisResponse(rawResponse);
      return { ...context, synthesisOutput };
    }
  }
}
