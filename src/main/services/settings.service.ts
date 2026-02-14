import { ok, err } from '../domain/result';
import type { Result } from '../domain/result';
import { DomainError, ERROR_CODES } from '../domain/errors';
import type { PreferencesRepository } from '../repositories/preferences.repository';
import type { SecureStorage } from '../infrastructure/safe-storage';
import type { LLMProvider } from '../providers/llm/llm-provider.interface';
import type { CircuitBreaker } from '../infrastructure/circuit-breaker';
import { CircuitOpenError } from '../infrastructure/circuit-breaker';
import { withRetry } from '../infrastructure/retry';
import type { LlmModel } from '../providers/llm/llm.types';
import type { LlmProviderType } from '../providers/llm/llm-provider-factory';

const OPENROUTER_KEY_STORAGE = 'openrouter_api_key';
const ANTHROPIC_KEY_STORAGE = 'anthropic_api_key';
const OPENAI_KEY_STORAGE = 'openai_api_key';
const MODEL_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export class SettingsService {
  private modelCache: LlmModel[] | null = null;
  private modelCacheTime = 0;
  private modelCacheProvider: string | null = null;

  constructor(
    private readonly preferencesRepo: PreferencesRepository,
    private readonly secureStorage: SecureStorage,
    private readonly resolveProvider: (type: LlmProviderType) => LLMProvider,
    private readonly circuitBreaker: CircuitBreaker,
  ) {}

  async getAllPreferences(): Promise<Result<Record<string, string>, DomainError>> {
    try {
      const prefs = await this.preferencesRepo.getAll();
      return ok(prefs);
    } catch (cause) {
      return err(new DomainError(ERROR_CODES.DB_ERROR, 'Failed to read preferences', cause));
    }
  }

  async setPreference(key: string, value: string): Promise<Result<void, DomainError>> {
    try {
      await this.preferencesRepo.set(key, value);
      return ok(undefined);
    } catch (cause) {
      return err(new DomainError(ERROR_CODES.DB_ERROR, 'Failed to save preference', cause));
    }
  }

  async getApiKeyStatus(): Promise<Result<{ isSet: boolean }, DomainError>> {
    try {
      const key = this.getActiveApiKey();
      return ok({ isSet: key !== null });
    } catch (cause) {
      return err(new DomainError(ERROR_CODES.INTERNAL_ERROR, 'Failed to check API key status', cause));
    }
  }

  async setApiKey(apiKey: string, providerType?: string): Promise<Result<void, DomainError>> {
    try {
      const target = (providerType as LlmProviderType) || this.getLlmProviderType();
      switch (target) {
        case 'anthropic':
          return this.setAnthropicApiKey(apiKey);
        case 'openai':
          return this.setOpenaiApiKey(apiKey);
        case 'openrouter':
        default:
          return this.setOpenrouterApiKey(apiKey);
      }
    } catch (cause) {
      return err(new DomainError(ERROR_CODES.INTERNAL_ERROR, 'Failed to store API key', cause));
    }
  }

  private async setOpenrouterApiKey(apiKey: string): Promise<Result<void, DomainError>> {
    try {
      if (!apiKey) {
        this.secureStorage.remove(OPENROUTER_KEY_STORAGE);
      } else {
        this.secureStorage.store(OPENROUTER_KEY_STORAGE, apiKey);
      }
      this.invalidateModelCache();
      return ok(undefined);
    } catch (cause) {
      return err(new DomainError(ERROR_CODES.INTERNAL_ERROR, 'Failed to store API key', cause));
    }
  }

  getApiKey(): string | null {
    try {
      return this.secureStorage.retrieve(OPENROUTER_KEY_STORAGE);
    } catch {
      return null;
    }
  }

  async setAnthropicApiKey(apiKey: string): Promise<Result<void, DomainError>> {
    try {
      if (!apiKey) {
        this.secureStorage.remove(ANTHROPIC_KEY_STORAGE);
      } else {
        this.secureStorage.store(ANTHROPIC_KEY_STORAGE, apiKey);
      }
      this.invalidateModelCache();
      return ok(undefined);
    } catch (cause) {
      return err(new DomainError(ERROR_CODES.INTERNAL_ERROR, 'Failed to store Anthropic API key', cause));
    }
  }

  getAnthropicApiKey(): string | null {
    try {
      return this.secureStorage.retrieve(ANTHROPIC_KEY_STORAGE);
    } catch {
      return null;
    }
  }

  async setOpenaiApiKey(apiKey: string): Promise<Result<void, DomainError>> {
    try {
      if (!apiKey) {
        this.secureStorage.remove(OPENAI_KEY_STORAGE);
      } else {
        this.secureStorage.store(OPENAI_KEY_STORAGE, apiKey);
      }
      this.invalidateModelCache();
      return ok(undefined);
    } catch (cause) {
      return err(new DomainError(ERROR_CODES.INTERNAL_ERROR, 'Failed to store OpenAI API key', cause));
    }
  }

  getOpenaiApiKey(): string | null {
    try {
      return this.secureStorage.retrieve(OPENAI_KEY_STORAGE);
    } catch {
      return null;
    }
  }

  /**
   * Get the API key for the given provider type.
   */
  getApiKeyForProvider(type: LlmProviderType): string | null {
    switch (type) {
      case 'openrouter':
        return this.getApiKey();
      case 'anthropic':
        return this.getAnthropicApiKey();
      case 'openai':
        return this.getOpenaiApiKey();
      default:
        return null;
    }
  }

  /**
   * Get the API key for the currently active LLM provider.
   */
  getActiveApiKey(): string | null {
    const providerType = this.getLlmProviderType();
    return this.getApiKeyForProvider(providerType);
  }

  getLlmProviderType(): LlmProviderType {
    try {
      const pref = this.preferencesRepo.getSync('llmProviderType');
      if (pref?.value === 'anthropic') return 'anthropic';
      if (pref?.value === 'openai') return 'openai';
      return 'openrouter';
    } catch {
      return 'openrouter';
    }
  }

  async listModels(provider?: LLMProvider): Promise<Result<LlmModel[], DomainError>> {
    const activeProvider = provider ?? this.resolveProvider(this.getLlmProviderType());
    const providerName = activeProvider.name;

    // Check cache (invalidate if provider changed)
    if (
      this.modelCache &&
      this.modelCacheProvider === providerName &&
      Date.now() - this.modelCacheTime < MODEL_CACHE_TTL_MS
    ) {
      return ok(this.modelCache);
    }

    const apiKey = this.getApiKeyForProvider(providerName as LlmProviderType) ?? this.getApiKey();

    if (!apiKey) {
      return err(new DomainError(ERROR_CODES.LLM_AUTH_FAILED, 'API key is not configured'));
    }

    try {
      const models = await this.circuitBreaker.execute(() =>
        withRetry(() => activeProvider.listModels(apiKey)),
      );
      this.modelCache = models;
      this.modelCacheTime = Date.now();
      this.modelCacheProvider = providerName;
      return ok(models);
    } catch (cause) {
      return err(this.mapProviderError(cause));
    }
  }

  private invalidateModelCache(): void {
    this.modelCache = null;
    this.modelCacheTime = 0;
    this.modelCacheProvider = null;
  }

  private mapProviderError(cause: unknown): DomainError {
    if (cause instanceof CircuitOpenError) {
      return new DomainError(ERROR_CODES.CIRCUIT_OPEN, 'Service temporarily unavailable', cause);
    }

    if (isHttpError(cause)) {
      if (cause.status === 401 || cause.status === 403) {
        return new DomainError(ERROR_CODES.LLM_AUTH_FAILED, 'Invalid API key', cause);
      }
      if (cause.status === 429) {
        return new DomainError(ERROR_CODES.LLM_RATE_LIMITED, 'Rate limited by provider', cause);
      }
    }

    return new DomainError(ERROR_CODES.LLM_REQUEST_FAILED, 'Failed to fetch models', cause);
  }
}

function isHttpError(error: unknown): error is { status: number } {
  return (
    typeof error === 'object' &&
    error !== null &&
    'status' in error &&
    typeof (error as { status: number }).status === 'number'
  );
}
