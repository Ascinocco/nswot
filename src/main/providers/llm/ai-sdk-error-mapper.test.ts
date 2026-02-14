import { describe, it, expect } from 'vitest';
import { mapAiSdkError } from './ai-sdk-error-mapper';
import { DomainError } from '../../domain/errors';

function createApiError(statusCode: number, message: string): Error & { statusCode: number } {
  const error = new Error(message) as Error & { statusCode: number };
  error.statusCode = statusCode;
  return error;
}

describe('mapAiSdkError', () => {
  describe('anthropic', () => {
    it('maps 401 to ANTHROPIC_AUTH_FAILED', () => {
      const error = createApiError(401, 'invalid api key');
      const result = mapAiSdkError(error, 'anthropic');
      expect(result).toBeInstanceOf(DomainError);
      expect(result.code).toBe('ANTHROPIC_AUTH_FAILED');
      expect(result.status).toBe(401);
    });

    it('maps 403 to ANTHROPIC_AUTH_FAILED', () => {
      const error = createApiError(403, 'access denied');
      const result = mapAiSdkError(error, 'anthropic');
      expect(result.code).toBe('ANTHROPIC_AUTH_FAILED');
    });

    it('maps 429 to ANTHROPIC_RATE_LIMITED', () => {
      const error = createApiError(429, 'rate limited');
      const result = mapAiSdkError(error, 'anthropic');
      expect(result.code).toBe('ANTHROPIC_RATE_LIMITED');
    });

    it('maps 500 to LLM_REQUEST_FAILED', () => {
      const error = createApiError(500, 'server error');
      const result = mapAiSdkError(error, 'anthropic');
      expect(result.code).toBe('LLM_REQUEST_FAILED');
    });
  });

  describe('openrouter', () => {
    it('maps 401 to LLM_AUTH_FAILED', () => {
      const error = createApiError(401, 'bad key');
      const result = mapAiSdkError(error, 'openrouter');
      expect(result.code).toBe('LLM_AUTH_FAILED');
    });

    it('maps 429 to LLM_RATE_LIMITED', () => {
      const error = createApiError(429, 'rate limited');
      const result = mapAiSdkError(error, 'openrouter');
      expect(result.code).toBe('LLM_RATE_LIMITED');
    });
  });

  describe('openai', () => {
    it('maps 401 to OPENAI_AUTH_FAILED', () => {
      const error = createApiError(401, 'invalid key');
      const result = mapAiSdkError(error, 'openai');
      expect(result.code).toBe('OPENAI_AUTH_FAILED');
    });

    it('maps 429 to OPENAI_RATE_LIMITED', () => {
      const error = createApiError(429, 'rate limited');
      const result = mapAiSdkError(error, 'openai');
      expect(result.code).toBe('OPENAI_RATE_LIMITED');
    });
  });

  it('maps network errors to LLM_REQUEST_FAILED', () => {
    const error = new Error('fetch failed');
    const result = mapAiSdkError(error, 'anthropic');
    expect(result.code).toBe('LLM_REQUEST_FAILED');
    expect(result.message).toBe('fetch failed');
  });

  it('maps unknown errors to LLM_REQUEST_FAILED', () => {
    const result = mapAiSdkError('something went wrong', 'openai');
    expect(result.code).toBe('LLM_REQUEST_FAILED');
    expect(result.message).toContain('Unknown openai error');
  });
});
