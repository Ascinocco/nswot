import { streamText, tool as aiTool } from 'ai';
import type { ToolSet, FinishReason } from 'ai';
import type { ModelMessage } from '@ai-sdk/provider-utils';
import { jsonSchema } from '@ai-sdk/provider-utils';
import { DomainError, ERROR_CODES } from '../../domain/errors';
import type { LlmResponse, LlmToolCall } from './llm.types';
import { mapAiSdkError } from './ai-sdk-error-mapper';

type ProviderName = 'anthropic' | 'openrouter' | 'openai';

interface HandleStreamOptions {
  onChunk?: (chunk: string) => void;
  onToken?: (tokenCount: number) => void;
  supportsThinking?: boolean;
  providerName: ProviderName;
}

/**
 * Consume an AI SDK StreamTextResult and return our LlmResponse.
 * Shared across all three providers.
 */
export async function handleStream(
  result: ReturnType<typeof streamText>,
  options: HandleStreamOptions,
): Promise<LlmResponse> {
  const { onChunk, onToken, providerName } = options;
  const contentChunks: string[] = [];
  const thinkingChunks: string[] = [];
  const toolCalls: LlmToolCall[] = [];
  let tokenCount = 0;
  let lastProgressAt = 0;
  let finishReason: string | null = null;

  try {
    for await (const part of result.fullStream) {
      switch (part.type) {
        case 'text-delta': {
          contentChunks.push(part.text);
          tokenCount++;
          if (onChunk) onChunk(part.text);
          if (onToken && tokenCount - lastProgressAt >= 50) {
            lastProgressAt = tokenCount;
            onToken(tokenCount);
          }
          break;
        }
        case 'reasoning-delta': {
          thinkingChunks.push(part.text);
          break;
        }
        case 'tool-call': {
          toolCalls.push({
            id: part.toolCallId,
            name: part.toolName,
            arguments: typeof part.input === 'string' ? part.input : JSON.stringify(part.input),
          });
          break;
        }
        case 'finish': {
          finishReason = mapFinishReason(part.finishReason);
          break;
        }
        case 'error': {
          throw new DomainError(
            ERROR_CODES.LLM_REQUEST_FAILED,
            `Stream error from ${providerName}`,
          );
        }
        default:
          break;
      }
    }
  } catch (error) {
    if (error instanceof DomainError) throw error;
    throw mapAiSdkError(error, providerName);
  }

  // Final progress callback
  if (onToken && tokenCount > lastProgressAt) {
    onToken(tokenCount);
  }

  const fullContent = contentChunks.join('');
  const fullThinking = thinkingChunks.join('');

  if (!fullContent && !fullThinking && toolCalls.length === 0) {
    throw new DomainError(ERROR_CODES.LLM_EMPTY_RESPONSE, `Empty response from ${providerName}`);
  }

  return {
    content: fullContent,
    finishReason,
    toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
    thinking: fullThinking || undefined,
  };
}

/**
 * Convert our internal message format to AI SDK's ModelMessage format.
 *
 * Input format (OpenAI-style):
 *   { role: 'system'|'user'|'assistant'|'tool', content?, tool_calls?, tool_call_id? }
 *
 * Output format (AI SDK):
 *   SystemModelMessage | UserModelMessage | AssistantModelMessage | ToolModelMessage
 */
export function convertMessages(
  messages: Array<{ role: string; content?: string; tool_calls?: unknown[]; tool_call_id?: string }>,
): ModelMessage[] {
  const result: ModelMessage[] = [];

  for (const msg of messages) {
    switch (msg.role) {
      case 'system':
        result.push({ role: 'system', content: msg.content ?? '' });
        break;

      case 'user':
        result.push({ role: 'user', content: msg.content ?? '' });
        break;

      case 'assistant': {
        if (msg.tool_calls && Array.isArray(msg.tool_calls) && msg.tool_calls.length > 0) {
          // Assistant message with tool calls — build content parts array
          const parts: Array<{ type: 'text'; text: string } | { type: 'tool-call'; toolCallId: string; toolName: string; input: unknown }> = [];
          if (msg.content) {
            parts.push({ type: 'text', text: msg.content });
          }
          for (const tc of msg.tool_calls) {
            const toolCall = tc as {
              id?: string;
              function?: { name: string; arguments?: string };
            };
            parts.push({
              type: 'tool-call',
              toolCallId: toolCall.id ?? '',
              toolName: toolCall.function?.name ?? '',
              input: toolCall.function?.arguments
                ? safeParseJson(toolCall.function.arguments)
                : {},
            });
          }
          result.push({ role: 'assistant', content: parts });
        } else {
          result.push({ role: 'assistant', content: msg.content ?? '' });
        }
        break;
      }

      case 'tool': {
        // Tool result message
        result.push({
          role: 'tool',
          content: [
            {
              type: 'tool-result',
              toolCallId: msg.tool_call_id ?? '',
              toolName: '',
              output: { type: 'text' as const, value: msg.content ?? '' },
            },
          ],
        });
        break;
      }

      default:
        // Unknown role — treat as user message
        result.push({ role: 'user', content: msg.content ?? '' });
        break;
    }
  }

  return result;
}

/**
 * Convert our OpenAI-style tool definitions to AI SDK's ToolSet format.
 *
 * Input: [{ type: 'function', function: { name, description, parameters } }]
 * Output: Record<string, Tool> (AI SDK ToolSet)
 */
export function convertTools(tools: unknown[]): ToolSet {
  const result: ToolSet = {};

  for (const t of tools) {
    const toolDef = t as {
      type?: string;
      function?: { name: string; description?: string; parameters?: Record<string, unknown> };
    };
    if (toolDef.type === 'function' && toolDef.function) {
      result[toolDef.function.name] = aiTool({
        description: toolDef.function.description,
        inputSchema: jsonSchema(toolDef.function.parameters ?? { type: 'object', properties: {} }),
      });
    }
  }

  return result;
}

/**
 * Map AI SDK finish reason to our internal format.
 * AI SDK uses 'tool-calls' (hyphen), our services expect 'tool_calls' (underscore).
 */
export function mapFinishReason(reason: FinishReason): string {
  if (reason === 'tool-calls') return 'tool_calls';
  return reason;
}

function safeParseJson(str: string): unknown {
  try {
    return JSON.parse(str);
  } catch {
    return str;
  }
}
