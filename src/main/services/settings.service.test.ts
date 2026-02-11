import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SettingsService } from './settings.service';
import { CircuitBreaker, CircuitOpenError } from '../infrastructure/circuit-breaker';
import type { PreferencesRepository } from '../repositories/preferences.repository';
import type { SecureStorage } from '../infrastructure/safe-storage';
import type { OpenRouterProvider } from '../providers/llm/openrouter.provider';
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

function createMockProvider(): OpenRouterProvider {
  return {
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
  } as unknown as OpenRouterProvider;
}

describe('SettingsService', () => {
  let service: SettingsService;
  let prefsRepo: PreferencesRepository;
  let secureStorage: ReturnType<typeof createMockSecureStorage>;
  let provider: OpenRouterProvider;
  let circuitBreaker: CircuitBreaker;

  beforeEach(() => {
    prefsRepo = createMockPreferencesRepo();
    secureStorage = createMockSecureStorage();
    provider = createMockProvider();
    circuitBreaker = new CircuitBreaker();
    service = new SettingsService(prefsRepo, secureStorage, provider, circuitBreaker);
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

    it('reports API key as set after storing', async () => {
      await service.setApiKey('sk-test-key');
      const result = await service.getApiKeyStatus();
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.isSet).toBe(true);
      }
    });

    it('stores API key via secure storage', async () => {
      await service.setApiKey('sk-test-key');
      expect(secureStorage.store).toHaveBeenCalledWith('openrouter_api_key', 'sk-test-key');
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

      // Trip the circuit by exhausting retries (the retry module doesn't retry CircuitOpenError)
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
