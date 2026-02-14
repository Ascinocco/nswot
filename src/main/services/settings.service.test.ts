import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SettingsService } from './settings.service';
import { CircuitBreaker, CircuitOpenError } from '../infrastructure/circuit-breaker';
import type { PreferencesRepository } from '../repositories/preferences.repository';
import type { SecureStorage } from '../infrastructure/safe-storage';
import type { LLMProvider } from '../providers/llm/llm-provider.interface';
import type { LlmProviderType } from '../providers/llm/llm-provider-factory';
import type { LlmModel } from '../providers/llm/llm.types';

// Mock retry to execute without delays
vi.mock('../infrastructure/retry', () => ({
  withRetry: vi.fn((fn: () => unknown) => fn()),
}));

function createMockPreferencesRepo(): PreferencesRepository {
  const store = new Map<string, string>();
  return {
    get: vi.fn(async (key: string) => {
      const value = store.get(key);
      return value !== undefined ? { key, value } : null;
    }),
    getSync: vi.fn((key: string) => {
      const value = store.get(key);
      return value !== undefined ? { key, value } : null;
    }),
    set: vi.fn(async (key: string, value: string) => {
      store.set(key, value);
    }),
    delete: vi.fn(async (key: string) => {
      store.delete(key);
    }),
    getAll: vi.fn(async () => Object.fromEntries(store)),
  } as unknown as PreferencesRepository;
}

function createMockSecureStorage(): SecureStorage & {
  _store: Map<string, string>;
} {
  const _store = new Map<string, string>();
  return {
    _store,
    store: vi.fn((key: string, value: string) => {
      _store.set(key, value);
    }),
    retrieve: vi.fn((key: string) => _store.get(key) ?? null),
    remove: vi.fn((key: string) => {
      _store.delete(key);
    }),
    isAvailable: vi.fn(() => true),
  };
}

function createMockProvider(name = 'openrouter'): LLMProvider {
  return {
    name,
    listModels: vi.fn(async (): Promise<LlmModel[]> => [
      {
        id: 'openai/gpt-4',
        name: 'GPT-4',
        contextLength: 8192,
        pricing: { prompt: 0.03, completion: 0.06 },
      },
      {
        id: 'anthropic/claude-3-opus',
        name: 'Claude 3 Opus',
        contextLength: 200000,
        pricing: { prompt: 0.015, completion: 0.075 },
      },
    ]),
    createChatCompletion: vi.fn(),
  };
}

describe('SettingsService', () => {
  let service: SettingsService;
  let prefsRepo: PreferencesRepository;
  let secureStorage: ReturnType<typeof createMockSecureStorage>;
  let provider: LLMProvider;
  let circuitBreaker: CircuitBreaker;
  let resolverFn: (type: LlmProviderType) => LLMProvider;

  beforeEach(() => {
    prefsRepo = createMockPreferencesRepo();
    secureStorage = createMockSecureStorage();
    provider = createMockProvider();
    circuitBreaker = new CircuitBreaker();
    resolverFn = vi.fn((_type: LlmProviderType) => provider);
    service = new SettingsService(prefsRepo, secureStorage, resolverFn, circuitBreaker);
  });

  describe('preferences', () => {
    it('gets all preferences', async () => {
      await prefsRepo.set('key1', 'val1');
      const result = await service.getAllPreferences();
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toEqual({ key1: 'val1' });
      }
    });

    it('sets a preference', async () => {
      const result = await service.setPreference('key1', 'val1');
      expect(result.ok).toBe(true);
      expect(prefsRepo.set).toHaveBeenCalledWith('key1', 'val1');
    });
  });

  describe('API key management', () => {
    it('reports API key as not set initially', async () => {
      const result = await service.getApiKeyStatus();
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.isSet).toBe(false);
      }
    });

    it('reports API key as set after storing for active provider', async () => {
      await service.setApiKey('sk-test-key');
      const result = await service.getApiKeyStatus();
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.isSet).toBe(true);
      }
    });

    it('stores OpenRouter API key by default', async () => {
      await service.setApiKey('sk-test-key');
      expect(secureStorage.store).toHaveBeenCalledWith('openrouter_api_key', 'sk-test-key');
    });

    it('stores Anthropic API key when providerType is anthropic', async () => {
      await service.setApiKey('sk-ant-test', 'anthropic');
      expect(secureStorage.store).toHaveBeenCalledWith('anthropic_api_key', 'sk-ant-test');
    });

    it('stores OpenAI API key when providerType is openai', async () => {
      await service.setApiKey('sk-openai-test', 'openai');
      expect(secureStorage.store).toHaveBeenCalledWith('openai_api_key', 'sk-openai-test');
    });

    it('clears API key when empty string is provided', async () => {
      await service.setApiKey('sk-test-key');
      await service.setApiKey('');
      expect(secureStorage.remove).toHaveBeenCalledWith('openrouter_api_key');
      const result = await service.getApiKeyStatus();
      if (result.ok) {
        expect(result.value.isSet).toBe(false);
      }
    });

    it('getApiKey returns the stored key', async () => {
      await service.setApiKey('sk-test-key');
      expect(service.getApiKey()).toBe('sk-test-key');
    });

    it('getApiKey returns null when not set', () => {
      expect(service.getApiKey()).toBeNull();
    });
  });

  describe('Anthropic API key management', () => {
    it('stores and retrieves Anthropic API key', async () => {
      await service.setAnthropicApiKey('sk-ant-test-key');
      expect(secureStorage.store).toHaveBeenCalledWith('anthropic_api_key', 'sk-ant-test-key');
      expect(service.getAnthropicApiKey()).toBe('sk-ant-test-key');
    });

    it('clears Anthropic API key when empty', async () => {
      await service.setAnthropicApiKey('sk-ant-test');
      await service.setAnthropicApiKey('');
      expect(secureStorage.remove).toHaveBeenCalledWith('anthropic_api_key');
      expect(service.getAnthropicApiKey()).toBeNull();
    });

    it('returns null when Anthropic key not set', () => {
      expect(service.getAnthropicApiKey()).toBeNull();
    });
  });

  describe('OpenAI API key management', () => {
    it('stores and retrieves OpenAI API key', async () => {
      await service.setOpenaiApiKey('sk-openai-key');
      expect(secureStorage.store).toHaveBeenCalledWith('openai_api_key', 'sk-openai-key');
      expect(service.getOpenaiApiKey()).toBe('sk-openai-key');
    });

    it('clears OpenAI API key when empty', async () => {
      await service.setOpenaiApiKey('sk-openai-key');
      await service.setOpenaiApiKey('');
      expect(secureStorage.remove).toHaveBeenCalledWith('openai_api_key');
      expect(service.getOpenaiApiKey()).toBeNull();
    });

    it('returns null when OpenAI key not set', () => {
      expect(service.getOpenaiApiKey()).toBeNull();
    });
  });

  describe('getApiKeyForProvider', () => {
    it('returns OpenRouter key for openrouter', async () => {
      await service.setApiKey('sk-or-key');
      expect(service.getApiKeyForProvider('openrouter')).toBe('sk-or-key');
    });

    it('returns Anthropic key for anthropic', async () => {
      await service.setAnthropicApiKey('sk-ant-key');
      expect(service.getApiKeyForProvider('anthropic')).toBe('sk-ant-key');
    });

    it('returns OpenAI key for openai', async () => {
      await service.setOpenaiApiKey('sk-openai-key');
      expect(service.getApiKeyForProvider('openai')).toBe('sk-openai-key');
    });

    it('returns null for unconfigured provider', () => {
      expect(service.getApiKeyForProvider('openrouter')).toBeNull();
      expect(service.getApiKeyForProvider('anthropic')).toBeNull();
      expect(service.getApiKeyForProvider('openai')).toBeNull();
    });
  });

  describe('getApiKeyStatus (active provider)', () => {
    it('checks key for active provider (openrouter by default)', async () => {
      await service.setApiKey('sk-or-key');
      const result = await service.getApiKeyStatus();
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value.isSet).toBe(true);
    });

    it('returns false when active provider key is not set', async () => {
      // Set a key for a non-active provider
      await service.setAnthropicApiKey('sk-ant-key');
      // Default active provider is openrouter, which has no key
      const result = await service.getApiKeyStatus();
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value.isSet).toBe(false);
    });
  });

  describe('listModels', () => {
    it('returns error when API key is not set', async () => {
      const result = await service.listModels();
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('LLM_AUTH_FAILED');
      }
    });

    it('fetches models when API key is set', async () => {
      await service.setApiKey('sk-test');
      const result = await service.listModels();
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toHaveLength(2);
        expect(result.value[0]!.id).toBe('openai/gpt-4');
      }
    });

    it('uses resolver to get active provider', async () => {
      await service.setApiKey('sk-test');
      await service.listModels();
      expect(resolverFn).toHaveBeenCalledWith('openrouter');
    });

    it('caches models for subsequent calls', async () => {
      await service.setApiKey('sk-test');
      await service.listModels();
      await service.listModels();
      expect(provider.listModels).toHaveBeenCalledTimes(1);
    });

    it('invalidates cache when API key is changed', async () => {
      await service.setApiKey('sk-test');
      await service.listModels();
      await service.setApiKey('sk-new');
      await service.listModels();
      expect(provider.listModels).toHaveBeenCalledTimes(2);
    });

    it('fetches models from a different provider', async () => {
      await service.setAnthropicApiKey('sk-ant-test');
      const anthropicProvider = createMockProvider('anthropic');
      vi.mocked(anthropicProvider.listModels).mockResolvedValueOnce([
        { id: 'claude-sonnet-4-5-20250929', name: 'Claude Sonnet 4.5', contextLength: 200000, pricing: { prompt: 0.003, completion: 0.015 } },
      ]);

      const result = await service.listModels(anthropicProvider);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toHaveLength(1);
        expect(result.value[0]!.id).toBe('claude-sonnet-4-5-20250929');
      }
    });

    it('invalidates cache when switching providers', async () => {
      await service.setApiKey('sk-or');
      await service.listModels();
      expect(provider.listModels).toHaveBeenCalledTimes(1);

      // Switch to anthropic provider
      await service.setAnthropicApiKey('sk-ant');
      const anthropicProvider = createMockProvider('anthropic');
      await service.listModels(anthropicProvider);
      expect(anthropicProvider.listModels).toHaveBeenCalledTimes(1);
    });

    it('maps 401 error to LLM_AUTH_FAILED', async () => {
      await service.setApiKey('sk-bad');
      const error = Object.assign(new Error('Unauthorized'), { status: 401 });
      vi.mocked(provider.listModels).mockRejectedValueOnce(error);

      const result = await service.listModels();
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('LLM_AUTH_FAILED');
      }
    });

    it('maps CircuitOpenError to CIRCUIT_OPEN', async () => {
      await service.setApiKey('sk-test');
      vi.mocked(provider.listModels).mockRejectedValue(
        new CircuitOpenError('Circuit is open'),
      );

      const result = await service.listModels();
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('CIRCUIT_OPEN');
      }
    });

    it('maps 429 error to LLM_RATE_LIMITED', async () => {
      await service.setApiKey('sk-test');
      const error = Object.assign(new Error('Rate limited'), { status: 429 });
      vi.mocked(provider.listModels).mockRejectedValue(error);

      const result = await service.listModels();
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('LLM_RATE_LIMITED');
      }
    });
  });
});
