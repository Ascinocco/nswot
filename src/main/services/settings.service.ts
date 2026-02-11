import { ok, err } from '../domain/result';
import type { Result } from '../domain/result';
import { DomainError, ERROR_CODES } from '../domain/errors';
import type { PreferencesRepository } from '../repositories/preferences.repository';
import type { SecureStorage } from '../infrastructure/safe-storage';
import type { OpenRouterProvider } from '../providers/llm/openrouter.provider';
import type { CircuitBreaker } from '../infrastructure/circuit-breaker';
import { CircuitOpenError } from '../infrastructure/circuit-breaker';
import { withRetry } from '../infrastructure/retry';
import type { LlmModel } from '../providers/llm/llm.types';

const API_KEY_STORAGE_KEY = 'openrouter_api_key';
const MODEL_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export class SettingsService {
  private modelCache: LlmModel[] | null = null;
  private modelCacheTime = 0;

  constructor(
    private readonly preferencesRepo: PreferencesRepository,
    private readonly secureStorage: SecureStorage,
    private readonly openRouterProvider: OpenRouterProvider,
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
      const key = this.getApiKey();
      return ok({ isSet: key !== null });
    } catch (cause) {
      return err(new DomainError(ERROR_CODES.INTERNAL_ERROR, 'Failed to check API key status', cause));
    }
  }

  async setApiKey(apiKey: string): Promise<Result<void, DomainError>> {
    try {
      if (!apiKey) {
        this.secureStorage.remove(API_KEY_STORAGE_KEY);
      } else {
        this.secureStorage.store(API_KEY_STORAGE_KEY, apiKey);
      }
      this.modelCache = null;
      this.modelCacheTime = 0;
      return ok(undefined);
    } catch (cause) {
      return err(new DomainError(ERROR_CODES.INTERNAL_ERROR, 'Failed to store API key', cause));
    }
  }

  async listModels(): Promise<Result<LlmModel[], DomainError>> {
    // Check cache
    if (this.modelCache && Date.now() - this.modelCacheTime < MODEL_CACHE_TTL_MS) {
      return ok(this.modelCache);
    }

    const apiKey = this.getApiKey();
    if (!apiKey) {
      return err(new DomainError(ERROR_CODES.LLM_AUTH_FAILED, 'API key is not configured'));
    }

    try {
      const models = await this.circuitBreaker.execute(() =>
        withRetry(() => this.openRouterProvider.listModels(apiKey)),
      );
      this.modelCache = models;
      this.modelCacheTime = Date.now();
      return ok(models);
    } catch (cause) {
      return err(this.mapProviderError(cause));
    }
  }

  getApiKey(): string | null {
    try {
      return this.secureStorage.retrieve(API_KEY_STORAGE_KEY);
    } catch {
      return null;
    }
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
        return new DomainError(ERROR_CODES.LLM_RATE_LIMITED, 'Rate limited by OpenRouter', cause);
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
