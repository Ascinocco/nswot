import { CircuitOpenError } from './circuit-breaker';

export interface RetryConfig {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  jitter: boolean;
}

const DEFAULT_CONFIG: RetryConfig = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 10_000,
  jitter: true,
};

export async function withRetry<T>(
  fn: () => Promise<T>,
  config?: Partial<RetryConfig>
): Promise<T> {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  let lastError: unknown;

  for (let attempt = 0; attempt <= cfg.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (!isRetryable(error)) {
        throw error;
      }

      if (attempt === cfg.maxRetries) {
        break;
      }

      const delay = computeDelay(attempt, cfg, error);
      await sleep(delay);
    }
  }

  throw lastError;
}

function isRetryable(error: unknown): boolean {
  // Circuit open — fail fast
  if (error instanceof CircuitOpenError) return false;

  if (isHttpError(error)) {
    const status = error.status;
    // Non-retryable HTTP statuses
    if (status === 400 || status === 401 || status === 403 || status === 404) {
      return false;
    }
    // Retryable: 429, 503
    if (status === 429 || status === 503) {
      return true;
    }
    // Other 4xx are not retryable
    if (status >= 400 && status < 500) {
      return false;
    }
    // 5xx are retryable
    if (status >= 500) {
      return true;
    }
  }

  // Network errors are retryable
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    if (
      msg.includes('timeout') ||
      msg.includes('econnrefused') ||
      msg.includes('econnreset') ||
      msg.includes('enotfound') ||
      msg.includes('network') ||
      msg.includes('fetch failed')
    ) {
      return true;
    }
  }

  // Default: don't retry unknown errors (auth failures, parse errors, domain errors)
  return false;
}

function computeDelay(attempt: number, cfg: RetryConfig, error: unknown): number {
  // Respect Retry-After header if present
  if (isHttpError(error) && hasRetryAfter(error)) {
    const retryAfter = parseRetryAfter(error.retryAfter);
    if (retryAfter !== null && retryAfter > 0) {
      return Math.min(retryAfter * 1000, cfg.maxDelayMs);
    }
  }

  // Exponential backoff: baseDelay * 2^attempt
  let delay = cfg.baseDelayMs * Math.pow(2, attempt);
  delay = Math.min(delay, cfg.maxDelayMs);

  // Add jitter (random 0–500ms)
  if (cfg.jitter) {
    delay += Math.random() * 500;
  }

  return delay;
}

function parseRetryAfter(value: string | number): number | null {
  if (typeof value === 'number') return value;
  const parsed = Number(value);
  if (!Number.isNaN(parsed)) return parsed;
  // Could be a date string — try parsing
  const date = new Date(value);
  if (!Number.isNaN(date.getTime())) {
    return Math.max(0, (date.getTime() - Date.now()) / 1000);
  }
  return null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface HttpError {
  status: number;
}

interface HttpErrorWithRetryAfter extends HttpError {
  retryAfter: string | number;
}

function isHttpError(error: unknown): error is HttpError {
  return (
    typeof error === 'object' &&
    error !== null &&
    'status' in error &&
    typeof (error as HttpError).status === 'number'
  );
}

function hasRetryAfter(error: unknown): error is HttpErrorWithRetryAfter {
  return (
    typeof error === 'object' &&
    error !== null &&
    'retryAfter' in error
  );
}
