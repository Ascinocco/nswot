import { DomainError, ERROR_CODES } from '../../domain/errors';

type ProviderName = 'anthropic' | 'openrouter' | 'openai';

interface ErrorCodeSet {
  auth: string;
  rateLimited: string;
}

const PROVIDER_ERROR_CODES: Record<ProviderName, ErrorCodeSet> = {
  anthropic: {
    auth: ERROR_CODES.ANTHROPIC_AUTH_FAILED,
    rateLimited: ERROR_CODES.ANTHROPIC_RATE_LIMITED,
  },
  openrouter: {
    auth: ERROR_CODES.LLM_AUTH_FAILED,
    rateLimited: ERROR_CODES.LLM_RATE_LIMITED,
  },
  openai: {
    auth: ERROR_CODES.OPENAI_AUTH_FAILED,
    rateLimited: ERROR_CODES.OPENAI_RATE_LIMITED,
  },
};

/**
 * Map an error thrown by AI SDK's streamText/generateText into a DomainError.
 * AI SDK throws APICallError with a `statusCode` property for HTTP-level failures.
 */
export function mapAiSdkError(error: unknown, provider: ProviderName): DomainError {
  const codes = PROVIDER_ERROR_CODES[provider];

  // AI SDK APICallError has statusCode, message, and sometimes responseBody
  if (isAiSdkApiError(error)) {
    const status = error.statusCode;
    const message = error.message || `${provider} API error (${status})`;

    if (status === 401 || status === 403) {
      return new DomainError(codes.auth as DomainError['code'], message, error, status);
    }
    if (status === 429) {
      return new DomainError(codes.rateLimited as DomainError['code'], message, error, status);
    }
    return new DomainError(ERROR_CODES.LLM_REQUEST_FAILED, message, error, status);
  }

  // Network / timeout errors
  if (error instanceof Error) {
    return new DomainError(
      ERROR_CODES.LLM_REQUEST_FAILED,
      error.message || `${provider} request failed`,
      error,
    );
  }

  return new DomainError(
    ERROR_CODES.LLM_REQUEST_FAILED,
    `Unknown ${provider} error`,
    error,
  );
}

interface AiSdkApiError {
  statusCode: number;
  message: string;
}

function isAiSdkApiError(error: unknown): error is AiSdkApiError {
  return (
    typeof error === 'object' &&
    error !== null &&
    'statusCode' in error &&
    typeof (error as AiSdkApiError).statusCode === 'number'
  );
}
