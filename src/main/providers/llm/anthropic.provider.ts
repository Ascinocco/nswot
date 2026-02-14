import { createAnthropic } from '@ai-sdk/anthropic';
import { streamText } from 'ai';
import { DomainError } from '../../domain/errors';
import type { LLMProvider } from './llm-provider.interface';
import type { LlmModel, LlmResponse, LlmCompletionRequest } from './llm.types';
import { convertMessages, convertTools, handleStream } from './ai-sdk-stream-handler';
import { mapAiSdkError } from './ai-sdk-error-mapper';

/**
 * Hardcoded model list for Anthropic.
 * The /v1/models endpoint is not reliably available, so we enumerate known models.
 */
const ANTHROPIC_MODELS: LlmModel[] = [
  {
    id: 'claude-sonnet-4-5-20250929',
    name: 'Claude Sonnet 4.5',
    contextLength: 200000,
    pricing: { prompt: 0.003, completion: 0.015 },
  },
  {
    id: 'claude-haiku-4-5-20251001',
    name: 'Claude Haiku 4.5',
    contextLength: 200000,
    pricing: { prompt: 0.001, completion: 0.005 },
  },
  {
    id: 'claude-opus-4-6',
    name: 'Claude Opus 4.6',
    contextLength: 200000,
    pricing: { prompt: 0.015, completion: 0.075 },
  },
];

export class AnthropicProvider implements LLMProvider {
  readonly name = 'anthropic';

  async listModels(_apiKey: string): Promise<LlmModel[]> {
    return ANTHROPIC_MODELS;
  }

  async createChatCompletion(request: LlmCompletionRequest): Promise<LlmResponse> {
    const anthropic = createAnthropic({ apiKey: request.apiKey });

    try {
      const toolSet = request.tools && (request.tools as unknown[]).length > 0
        ? convertTools(request.tools)
        : undefined;
      const hasThinking = request.thinkingBudget && request.thinkingBudget > 0;
      const maxTokens = request.maxTokens ?? 4096;

      const result = streamText({
        model: anthropic(request.modelId),
        messages: convertMessages(request.messages),
        tools: toolSet,
        temperature: hasThinking ? undefined : request.temperature,
        maxOutputTokens: hasThinking
          ? Math.max(maxTokens, request.thinkingBudget! + 4096)
          : maxTokens,
        providerOptions: hasThinking
          ? { anthropic: { thinking: { type: 'enabled', budgetTokens: request.thinkingBudget } } }
          : undefined,
      });

      return await handleStream(result, {
        onChunk: request.onChunk,
        onToken: request.onToken,
        supportsThinking: true,
        providerName: 'anthropic',
      });
    } catch (error) {
      if (error instanceof DomainError) throw error;
      throw mapAiSdkError(error, 'anthropic');
    }
  }
}
