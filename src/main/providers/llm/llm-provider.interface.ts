import type { LlmModel, LlmResponse, LlmCompletionRequest } from './llm.types';

/**
 * Abstraction over LLM providers (OpenRouter, Anthropic, etc.).
 * Each provider handles its own HTTP transport, SSE parsing, and error mapping.
 * Services call through this interface — never directly to provider-specific APIs.
 */
export interface LLMProvider {
  readonly name: string;

  /**
   * List available models for this provider.
   */
  listModels(apiKey: string): Promise<LlmModel[]>;

  /**
   * Send a chat completion request with SSE streaming.
   * Returns accumulated response after stream completes.
   *
   * - `onChunk` fires on each text delta (for real-time UI streaming)
   * - `onToken` fires periodically with estimated token count (for progress)
   * - `tools` enables function/tool calling (provider maps to its native format)
   */
  createChatCompletion(request: LlmCompletionRequest): Promise<LlmResponse>;
}
