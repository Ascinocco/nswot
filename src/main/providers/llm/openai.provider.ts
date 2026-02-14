import { createOpenAI } from '@ai-sdk/openai';
import { streamText } from 'ai';
import { DomainError } from '../../domain/errors';
import type { LLMProvider } from './llm-provider.interface';
import type { LlmModel, LlmResponse, LlmCompletionRequest } from './llm.types';
import { convertMessages, convertTools, handleStream } from './ai-sdk-stream-handler';
import { mapAiSdkError } from './ai-sdk-error-mapper';

/**
 * Hardcoded model list for OpenAI.
 */
const OPENAI_MODELS: LlmModel[] = [
  {
    id: 'gpt-4o',
    name: 'GPT-4o',
    contextLength: 128000,
    pricing: { prompt: 0.0025, completion: 0.01 },
  },
  {
    id: 'gpt-4o-mini',
    name: 'GPT-4o Mini',
    contextLength: 128000,
    pricing: { prompt: 0.00015, completion: 0.0006 },
  },
  {
    id: 'o3-mini',
    name: 'o3-mini',
    contextLength: 200000,
    pricing: { prompt: 0.0011, completion: 0.0044 },
  },
  {
    id: 'o4-mini',
    name: 'o4-mini',
    contextLength: 200000,
    pricing: { prompt: 0.0011, completion: 0.0044 },
  },
];

export class OpenAIProvider implements LLMProvider {
  readonly name = 'openai';

  async listModels(_apiKey: string): Promise<LlmModel[]> {
    return OPENAI_MODELS;
  }

  async createChatCompletion(request: LlmCompletionRequest): Promise<LlmResponse> {
    const openai = createOpenAI({ apiKey: request.apiKey });

    try {
      const toolSet = request.tools && (request.tools as unknown[]).length > 0
        ? convertTools(request.tools)
        : undefined;

      const result = streamText({
        model: openai(request.modelId),
        messages: convertMessages(request.messages),
        tools: toolSet,
        temperature: request.temperature,
        maxOutputTokens: request.maxTokens ?? 4096,
      });

      return await handleStream(result, {
        onChunk: request.onChunk,
        onToken: request.onToken,
        providerName: 'openai',
      });
    } catch (error) {
      if (error instanceof DomainError) throw error;
      throw mapAiSdkError(error, 'openai');
    }
  }
}
