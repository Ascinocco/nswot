import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { streamText } from 'ai';
import { DomainError } from '../../domain/errors';
import type { LLMProvider } from './llm-provider.interface';
import type {
  LlmModel,
  LlmResponse,
  LlmCompletionRequest,
  OpenRouterModelResponse,
} from './llm.types';
import { convertMessages, convertTools, handleStream } from './ai-sdk-stream-handler';
import { mapAiSdkError } from './ai-sdk-error-mapper';

const OPENROUTER_MODELS_URL = 'https://openrouter.ai/api/v1/models';
const FETCH_TIMEOUT_MS = 30_000;

export class OpenRouterProvider implements LLMProvider {
  readonly name = 'openrouter';

  async listModels(apiKey: string): Promise<LlmModel[]> {
    const response = await fetch(OPENROUTER_MODELS_URL, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });

    if (!response.ok) {
      const error = new Error(`OpenRouter API error: ${response.status}`);
      (error as unknown as { status: number }).status = response.status;
      throw error;
    }

    const body = (await response.json()) as OpenRouterModelResponse;

    return body.data.map((entry) => ({
      id: entry.id,
      name: entry.name,
      contextLength: entry.context_length,
      pricing: {
        prompt: parseFloat(entry.pricing.prompt),
        completion: parseFloat(entry.pricing.completion),
      },
    }));
  }

  async createChatCompletion(request: LlmCompletionRequest): Promise<LlmResponse> {
    const openrouter = createOpenAICompatible({
      name: 'openrouter',
      apiKey: request.apiKey,
      baseURL: 'https://openrouter.ai/api/v1',
      headers: {
        'HTTP-Referer': 'https://nswot.app',
        'X-Title': 'nswot',
      },
    });

    try {
      const toolSet = request.tools && (request.tools as unknown[]).length > 0
        ? convertTools(request.tools)
        : undefined;

      const result = streamText({
        model: openrouter.chatModel(request.modelId),
        messages: convertMessages(request.messages),
        tools: toolSet,
        temperature: request.temperature,
        maxOutputTokens: request.maxTokens,
      });

      return await handleStream(result, {
        onChunk: request.onChunk,
        onToken: request.onToken,
        providerName: 'openrouter',
      });
    } catch (error) {
      if (error instanceof DomainError) throw error;
      throw mapAiSdkError(error, 'openrouter');
    }
  }

}
