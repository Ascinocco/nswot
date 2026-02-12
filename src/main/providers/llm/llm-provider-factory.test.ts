import { describe, it, expect } from 'vitest';
import { createLlmProvider } from './llm-provider-factory';
import { OpenRouterProvider } from './openrouter.provider';
import { AnthropicProvider } from './anthropic.provider';

describe('createLlmProvider', () => {
  it('returns OpenRouterProvider for "openrouter"', () => {
    const provider = createLlmProvider('openrouter');
    expect(provider).toBeInstanceOf(OpenRouterProvider);
    expect(provider.name).toBe('openrouter');
  });

  it('returns AnthropicProvider for "anthropic"', () => {
    const provider = createLlmProvider('anthropic');
    expect(provider).toBeInstanceOf(AnthropicProvider);
    expect(provider.name).toBe('anthropic');
  });

  it('defaults to OpenRouterProvider when no type specified', () => {
    const provider = createLlmProvider();
    expect(provider).toBeInstanceOf(OpenRouterProvider);
  });

  it('throws for unknown provider type', () => {
    expect(() => createLlmProvider('unknown' as 'openrouter')).toThrow('Unknown LLM provider type');
  });
});
