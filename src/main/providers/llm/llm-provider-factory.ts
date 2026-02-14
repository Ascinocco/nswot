import type { LLMProvider } from './llm-provider.interface';
import { OpenRouterProvider } from './openrouter.provider';
import { AnthropicProvider } from './anthropic.provider';
import { OpenAIProvider } from './openai.provider';

export type LlmProviderType = 'openrouter' | 'anthropic' | 'openai';

const providers: Record<LlmProviderType, () => LLMProvider> = {
  openrouter: () => new OpenRouterProvider(),
  anthropic: () => new AnthropicProvider(),
  openai: () => new OpenAIProvider(),
};

/**
 * Create an LLM provider by type.
 * Default: 'openrouter' (backwards compatible).
 */
export function createLlmProvider(type: LlmProviderType = 'openrouter'): LLMProvider {
  const factory = providers[type];
  if (!factory) {
    throw new Error(`Unknown LLM provider type: ${type}`);
  }
  return factory();
}
