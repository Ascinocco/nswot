import { DomainError, ERROR_CODES } from '../../domain/errors';
import type { LLMProvider } from './llm-provider.interface';
import type {
  LlmModel,
  LlmResponse,
  LlmCompletionRequest,
  LlmToolCall,
  OpenRouterModelResponse,
} from './llm.types';

const OPENROUTER_MODELS_URL = 'https://openrouter.ai/api/v1/models';
const OPENROUTER_CHAT_URL = 'https://openrouter.ai/api/v1/chat/completions';

export class OpenRouterProvider implements LLMProvider {
  readonly name = 'openrouter';

  async listModels(apiKey: string): Promise<LlmModel[]> {
    const response = await fetch(OPENROUTER_MODELS_URL, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
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
    const body: Record<string, unknown> = {
      model: request.modelId,
      messages: request.messages,
      stream: true,
    };
    if (request.temperature !== undefined) body['temperature'] = request.temperature;
    if (request.maxTokens !== undefined) body['max_tokens'] = request.maxTokens;
    if (request.tools && (request.tools as unknown[]).length > 0) body['tools'] = request.tools;

    const response = await fetch(OPENROUTER_CHAT_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${request.apiKey}`,
        'HTTP-Referer': 'https://nswot.app',
        'X-Title': 'nswot',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      this.throwHttpError(response.status, await this.extractErrorDetail(response));
    }

    return this.readSSEStream(response, request.onChunk, request.onToken);
  }

  private async readSSEStream(
    response: Response,
    onChunk?: (chunk: string) => void,
    onToken?: (tokenCount: number) => void,
  ): Promise<LlmResponse> {
    const reader = response.body?.getReader();
    if (!reader) {
      throw new DomainError(ERROR_CODES.LLM_EMPTY_RESPONSE, 'No response body from LLM');
    }

    const decoder = new TextDecoder();
    let buffer = '';
    const contentChunks: string[] = [];
    let tokenCount = 0;
    let finishReason: string | null = null;
    let lastProgressAt = 0;
    const toolCallAccumulator = new Map<number, { id: string; name: string; arguments: string }>();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data: ')) continue;

        const data = trimmed.slice(6);
        if (data === '[DONE]') continue;

        try {
          const parsed = JSON.parse(data) as {
            choices?: Array<{
              delta?: {
                content?: string;
                tool_calls?: Array<{
                  index: number;
                  id?: string;
                  function?: { name?: string; arguments?: string };
                }>;
              };
              finish_reason?: string | null;
            }>;
            error?: { message?: string };
          };

          if (parsed.error?.message) {
            throw new DomainError(ERROR_CODES.LLM_REQUEST_FAILED, parsed.error.message);
          }

          const choice = parsed.choices?.[0];
          if (!choice) continue;

          const content = choice.delta?.content;
          if (content) {
            contentChunks.push(content);
            tokenCount++;

            if (onChunk) onChunk(content);

            if (onToken && tokenCount - lastProgressAt >= 50) {
              lastProgressAt = tokenCount;
              onToken(tokenCount);
            }
          }

          // Accumulate tool calls (streamed incrementally)
          const deltaToolCalls = choice.delta?.tool_calls;
          if (deltaToolCalls) {
            for (const dtc of deltaToolCalls) {
              const existing = toolCallAccumulator.get(dtc.index);
              if (existing) {
                if (dtc.function?.arguments) {
                  existing.arguments += dtc.function.arguments;
                }
              } else {
                toolCallAccumulator.set(dtc.index, {
                  id: dtc.id ?? `call_${dtc.index}`,
                  name: dtc.function?.name ?? '',
                  arguments: dtc.function?.arguments ?? '',
                });
              }
            }
          }

          if (choice.finish_reason) {
            finishReason = choice.finish_reason;
          }
        } catch (e) {
          if (e instanceof DomainError) throw e;
          // Skip malformed SSE chunks
        }
      }
    }

    // Final progress callback
    if (onToken && tokenCount > lastProgressAt) {
      onToken(tokenCount);
    }

    const fullContent = contentChunks.join('');
    if (!fullContent && toolCallAccumulator.size === 0) {
      throw new DomainError(ERROR_CODES.LLM_EMPTY_RESPONSE, 'Empty response from LLM');
    }

    const toolCalls: LlmToolCall[] | undefined =
      toolCallAccumulator.size > 0
        ? Array.from(toolCallAccumulator.values())
        : undefined;

    return { content: fullContent, finishReason, toolCalls };
  }

  private throwHttpError(status: number, detail: string): never {
    if (status === 401 || status === 403) {
      throw new DomainError(ERROR_CODES.LLM_AUTH_FAILED, detail || 'Invalid API key');
    }
    if (status === 429) {
      throw new DomainError(ERROR_CODES.LLM_RATE_LIMITED, detail || 'Rate limited by OpenRouter');
    }
    throw new DomainError(
      ERROR_CODES.LLM_REQUEST_FAILED,
      detail || `OpenRouter returned status ${status}`,
    );
  }

  private async extractErrorDetail(response: Response): Promise<string> {
    try {
      const errBody = (await response.json()) as { error?: { message?: string } };
      return errBody.error?.message ?? '';
    } catch {
      return '';
    }
  }
}
