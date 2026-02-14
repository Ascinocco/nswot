import { DomainError, ERROR_CODES } from '../../domain/errors';
import type { LLMProvider } from './llm-provider.interface';
import type {
  LlmModel,
  LlmResponse,
  LlmCompletionRequest,
  LlmToolCall,
} from './llm.types';

const ANTHROPIC_MESSAGES_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_API_VERSION = '2023-06-01';
/** Timeout for the initial HTTP connection (not the full stream). */
const FETCH_TIMEOUT_MS = 30_000;
/** Inactivity timeout for the SSE stream: abort if no data received within this period. */
const STREAM_INACTIVITY_TIMEOUT_MS = 60_000;

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

/**
 * SSE event types from the Anthropic Messages API streaming response.
 */
interface AnthropicContentBlockDelta {
  type: 'content_block_delta';
  index: number;
  delta:
    | { type: 'text_delta'; text: string }
    | { type: 'input_json_delta'; partial_json: string }
    | { type: 'thinking_delta'; thinking: string };
}

interface AnthropicContentBlockStart {
  type: 'content_block_start';
  index: number;
  content_block:
    | { type: 'text'; text: string }
    | { type: 'tool_use'; id: string; name: string; input: unknown }
    | { type: 'thinking'; thinking: string };
}

interface AnthropicMessageDelta {
  type: 'message_delta';
  delta: { stop_reason: string | null };
}

type AnthropicStreamEvent = AnthropicContentBlockDelta | AnthropicContentBlockStart | AnthropicMessageDelta | { type: string };

export class AnthropicProvider implements LLMProvider {
  readonly name = 'anthropic';

  async listModels(_apiKey: string): Promise<LlmModel[]> {
    return ANTHROPIC_MODELS;
  }

  async createChatCompletion(request: LlmCompletionRequest): Promise<LlmResponse> {
    const { systemMessage, conversationMessages } = extractSystemMessage(request.messages);

    const body: Record<string, unknown> = {
      model: request.modelId,
      messages: conversationMessages,
      stream: true,
      max_tokens: request.maxTokens ?? 4096,
    };
    if (systemMessage) body['system'] = systemMessage;
    if (request.thinkingBudget && request.thinkingBudget > 0) {
      // Extended thinking: enable thinking and enforce Anthropic constraints
      body['thinking'] = { type: 'enabled', budget_tokens: request.thinkingBudget };
      // Anthropic requires temperature=1 (or omitted) when thinking is enabled
      // max_tokens must be >= budget_tokens
      const maxTokens = request.maxTokens ?? 4096;
      if (maxTokens < request.thinkingBudget) {
        body['max_tokens'] = request.thinkingBudget + 4096;
      }
    } else if (request.temperature !== undefined) {
      body['temperature'] = request.temperature;
    }
    if (request.tools && (request.tools as unknown[]).length > 0) {
      body['tools'] = mapToolsToAnthropic(request.tools);
    }

    // Connection-phase timeout only — cleared once we receive response headers.
    // The streaming body read uses a per-chunk inactivity timeout instead.
    const controller = new AbortController();
    const connectionTimeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    let response: Response;
    try {
      response = await fetch(ANTHROPIC_MESSAGES_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': request.apiKey,
          'anthropic-version': ANTHROPIC_API_VERSION,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (e) {
      clearTimeout(connectionTimeout);
      throw e;
    }
    clearTimeout(connectionTimeout);

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
      throw new DomainError(ERROR_CODES.LLM_EMPTY_RESPONSE, 'No response body from Anthropic');
    }

    const decoder = new TextDecoder();
    let buffer = '';
    const contentChunks: string[] = [];
    const thinkingChunks: string[] = [];
    let tokenCount = 0;
    let finishReason: string | null = null;
    let lastProgressAt = 0;

    // Track content block types by index: 'thinking' | 'text' | 'tool_use'
    const blockTypeMap = new Map<number, string>();

    // Track tool_use blocks: index -> accumulated tool call
    const toolCallMap = new Map<number, { id: string; name: string; arguments: string }>();

    try {
      while (true) {
        // Race each read against an inactivity timeout — catches stalled streams
        let inactivityTimer: ReturnType<typeof setTimeout>;
        const { done, value } = await Promise.race([
          reader.read(),
          new Promise<never>((_, reject) => {
            inactivityTimer = setTimeout(
              () => reject(new DomainError(ERROR_CODES.LLM_REQUEST_FAILED, 'Anthropic stream stalled: no data received for 60s')),
              STREAM_INACTIVITY_TIMEOUT_MS,
            );
          }),
        ]).finally(() => clearTimeout(inactivityTimer!));
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
            const event = JSON.parse(data) as AnthropicStreamEvent;

            if (event.type === 'content_block_start') {
              const cbs = event as AnthropicContentBlockStart;
              blockTypeMap.set(cbs.index, cbs.content_block.type);
              if (cbs.content_block.type === 'tool_use') {
                toolCallMap.set(cbs.index, {
                  id: cbs.content_block.id,
                  name: cbs.content_block.name,
                  arguments: '',
                });
              }
              // 'thinking' blocks are tracked via blockTypeMap; deltas accumulate in thinkingChunks
            } else if (event.type === 'content_block_delta') {
              const cbd = event as AnthropicContentBlockDelta;
              if (cbd.delta.type === 'thinking_delta') {
                thinkingChunks.push(cbd.delta.thinking);
              } else if (cbd.delta.type === 'text_delta') {
                const text = cbd.delta.text;
                contentChunks.push(text);
                tokenCount++;

                if (onChunk) onChunk(text);

                if (onToken && tokenCount - lastProgressAt >= 50) {
                  lastProgressAt = tokenCount;
                  onToken(tokenCount);
                }
              } else if (cbd.delta.type === 'input_json_delta') {
                const existing = toolCallMap.get(cbd.index);
                if (existing) {
                  existing.arguments += cbd.delta.partial_json;
                }
              }
            } else if (event.type === 'message_delta') {
              const md = event as AnthropicMessageDelta;
              finishReason = md.delta.stop_reason;
            } else if (event.type === 'error') {
              const errEvent = event as { type: 'error'; error?: { message?: string } };
              throw new DomainError(
                ERROR_CODES.LLM_REQUEST_FAILED,
                errEvent.error?.message ?? 'Anthropic stream error',
              );
            }
          } catch (e) {
            if (e instanceof DomainError) throw e;
            // Skip malformed SSE chunks
          }
        }
      }
    } finally {
      reader.cancel().catch(() => {});
    }

    // Final progress callback
    if (onToken && tokenCount > lastProgressAt) {
      onToken(tokenCount);
    }

    const fullContent = contentChunks.join('');
    const fullThinking = thinkingChunks.join('');
    if (!fullContent && !fullThinking && toolCallMap.size === 0) {
      throw new DomainError(ERROR_CODES.LLM_EMPTY_RESPONSE, 'Empty response from Anthropic');
    }

    // Map Anthropic's stop_reason to OpenAI-compatible finish_reason
    const mappedFinishReason = mapStopReason(finishReason);

    const toolCalls: LlmToolCall[] | undefined =
      toolCallMap.size > 0
        ? Array.from(toolCallMap.values())
        : undefined;

    return {
      content: fullContent,
      finishReason: mappedFinishReason,
      toolCalls,
      thinking: fullThinking || undefined,
    };
  }

  private throwHttpError(status: number, detail: string): never {
    if (status === 401) {
      throw new DomainError(ERROR_CODES.ANTHROPIC_AUTH_FAILED, detail || 'Invalid Anthropic API key', undefined, status);
    }
    if (status === 403) {
      throw new DomainError(ERROR_CODES.ANTHROPIC_AUTH_FAILED, detail || 'Anthropic access denied', undefined, status);
    }
    if (status === 429) {
      throw new DomainError(ERROR_CODES.ANTHROPIC_RATE_LIMITED, detail || 'Rate limited by Anthropic', undefined, status);
    }
    throw new DomainError(
      ERROR_CODES.LLM_REQUEST_FAILED,
      detail || `Anthropic returned status ${status}`,
      undefined,
      status,
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

/**
 * Anthropic uses a top-level `system` field instead of a system role message.
 * Extract the system message from the OpenAI-style messages array.
 */
function extractSystemMessage(
  messages: Array<{ role: string; content?: string }>,
): { systemMessage: string | null; conversationMessages: Array<{ role: string; content: string }> } {
  const systemParts: string[] = [];
  const conversationMessages: Array<{ role: string; content: string }> = [];

  for (const msg of messages) {
    if (msg.role === 'system') {
      const text = msg.content ?? '';
      if (text) systemParts.push(text);
    } else {
      conversationMessages.push({ role: msg.role, content: msg.content ?? '' });
    }
  }

  const systemMessage = systemParts.length > 0 ? systemParts.join('\n\n') : null;
  return { systemMessage, conversationMessages };
}

/**
 * Map OpenAI-style tool definitions to Anthropic's format.
 * OpenAI: { type: 'function', function: { name, description, parameters } }
 * Anthropic: { name, description, input_schema }
 */
function mapToolsToAnthropic(tools: unknown[]): unknown[] {
  return tools.map((tool) => {
    const t = tool as { type?: string; function?: { name: string; description?: string; parameters?: unknown } };
    if (t.type === 'function' && t.function) {
      return {
        name: t.function.name,
        description: t.function.description ?? '',
        input_schema: t.function.parameters ?? { type: 'object', properties: {} },
      };
    }
    // Pass through if already in Anthropic format
    return tool;
  });
}

/**
 * Map Anthropic's stop_reason to OpenAI-compatible finish_reason.
 */
function mapStopReason(stopReason: string | null): string | null {
  if (!stopReason) return null;
  switch (stopReason) {
    case 'end_turn':
      return 'stop';
    case 'tool_use':
      return 'tool_calls';
    case 'max_tokens':
      return 'length';
    case 'stop_sequence':
      return 'stop';
    default:
      return stopReason;
  }
}
