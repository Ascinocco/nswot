import type { PipelineStep, PipelineContext, StepProgressFn } from '../pipeline-step';
import { buildSystemPrompt, buildUserPrompt, buildCorrectivePrompt } from '../prompt-builder';
import { parseAnalysisResponse } from '../response-parser';
import { validateEvidence } from '../evidence-validator';
import { computeQualityMetrics } from '../quality-metrics';
import { calculateTokenBudget } from '../token-budget';
import type { ConnectedSource } from '../token-budget';

/**
 * The default SWOT generation step. Wraps the original single-pass analysis pipeline:
 * build prompt → call LLM → parse response → corrective retry → validate evidence → quality metrics.
 *
 * This preserves identical behavior to the pre-refactor monolithic AnalysisService pipeline.
 */
export class SwotGenerationStep implements PipelineStep {
  readonly name = 'swot-generation';

  async execute(
    context: PipelineContext,
    onProgress: StepProgressFn,
  ): Promise<PipelineContext> {
    // Build prompt
    onProgress('building_prompt', 'Constructing analysis prompt...');
    const budget = calculateTokenBudget(
      context.contextWindow,
      [...context.connectedSources] as ConnectedSource[],
    );
    const systemPrompt = buildSystemPrompt();
    let userPrompt = buildUserPrompt(
      context.role,
      [...context.anonymizedProfiles],
      context.dataSources,
      budget,
    );

    // Append synthesis data if available from prior pipeline steps
    if (context.synthesisOutput?.synthesisMarkdown) {
      userPrompt += `\n\n## Cross-Source Synthesis (Pre-Analysis)\n\nThe following synthesis was produced by correlating signals across all data sources. Use it to inform and strengthen your SWOT analysis — especially for cross-source triangulation and confidence assessment.\n\n${context.synthesisOutput.synthesisMarkdown}`;
    }

    // Send to LLM
    onProgress('sending', 'Sending to LLM — waiting for first tokens...');
    const onToken = (tokenCount: number): void => {
      onProgress(
        'sending',
        `Generating response — ${tokenCount.toLocaleString()} tokens so far...`,
      );
    };

    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ];
    let llmResult = await context.llmCaller.call(messages, context.modelId, onToken);
    let rawResponse = llmResult.content;

    // Parse response
    onProgress('parsing', 'Parsing LLM response...');
    let parseResult = parseAnalysisResponse(rawResponse);

    // Corrective retry on first parse failure
    if (!parseResult.ok) {
      const truncated = llmResult.finishReason === 'length';
      const errorDetail = truncated
        ? `${parseResult.error.message} (response was truncated — output token limit reached. Be more concise.)`
        : parseResult.error.message;

      onProgress('sending', 'Retrying with corrective prompt...');
      const correctivePrompt = buildCorrectivePrompt(errorDetail);
      const retryMessages = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
        { role: 'assistant', content: rawResponse },
        { role: 'user', content: correctivePrompt },
      ];
      llmResult = await context.llmCaller.call(retryMessages, context.modelId, onToken);
      rawResponse = llmResult.content;

      onProgress('parsing', 'Parsing corrected response...');
      parseResult = parseAnalysisResponse(rawResponse);

      if (!parseResult.ok) {
        throw parseResult.error;
      }
    }

    const { swotOutput, summariesOutput } = parseResult.value;

    // Validate evidence
    onProgress('validating', 'Validating evidence references...');
    const validationResult = validateEvidence(swotOutput, context.inputSnapshot);
    let warning: string | undefined;

    if (validationResult.ok && !validationResult.value.valid) {
      warning = `Evidence validation warnings: ${validationResult.value.warnings.join('; ')}`;
    }
    if (!validationResult.ok) {
      throw validationResult.error;
    }

    // Compute quality metrics
    const qualityMetrics = computeQualityMetrics(swotOutput);

    return {
      ...context,
      swotOutput,
      summariesOutput,
      qualityMetrics,
      rawLlmResponse: rawResponse,
      warning,
    };
  }
}
