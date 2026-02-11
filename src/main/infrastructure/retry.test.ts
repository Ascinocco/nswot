import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { withRetry } from './retry';
import { CircuitOpenError } from './circuit-breaker';

describe('withRetry', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns on first success', async () => {
    const fn = vi.fn().mockResolvedValue('ok');
    const promise = withRetry(fn, { maxRetries: 3, baseDelayMs: 100, jitter: false });
    const result = await promise;
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries on retryable error and eventually succeeds', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(Object.assign(new Error('rate limited'), { status: 429 }))
      .mockResolvedValue('ok');

    const promise = withRetry(fn, { maxRetries: 3, baseDelayMs: 100, jitter: false });

    // Advance past the first retry delay
    await vi.advanceTimersByTimeAsync(200);

    const result = await promise;
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('does not retry on 401 (non-retryable)', async () => {
    const fn = vi.fn().mockRejectedValue(Object.assign(new Error('Unauthorized'), { status: 401 }));

    await expect(withRetry(fn, { maxRetries: 3, baseDelayMs: 100, jitter: false })).rejects.toThrow(
      'Unauthorized'
    );
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('does not retry on 403 (non-retryable)', async () => {
    const fn = vi.fn().mockRejectedValue(Object.assign(new Error('Forbidden'), { status: 403 }));

    await expect(withRetry(fn, { maxRetries: 3, baseDelayMs: 100, jitter: false })).rejects.toThrow(
      'Forbidden'
    );
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('does not retry on 404 (non-retryable)', async () => {
    const fn = vi.fn().mockRejectedValue(Object.assign(new Error('Not Found'), { status: 404 }));

    await expect(withRetry(fn, { maxRetries: 3, baseDelayMs: 100, jitter: false })).rejects.toThrow(
      'Not Found'
    );
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('does not retry on 400 (non-retryable)', async () => {
    const fn = vi.fn().mockRejectedValue(Object.assign(new Error('Bad Request'), { status: 400 }));

    await expect(withRetry(fn, { maxRetries: 3, baseDelayMs: 100, jitter: false })).rejects.toThrow(
      'Bad Request'
    );
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('does not retry on CircuitOpenError', async () => {
    const fn = vi.fn().mockRejectedValue(new CircuitOpenError('Circuit is open'));

    await expect(withRetry(fn, { maxRetries: 3, baseDelayMs: 100, jitter: false })).rejects.toThrow(
      CircuitOpenError
    );
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('uses exponential backoff', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(Object.assign(new Error('503'), { status: 503 }))
      .mockRejectedValueOnce(Object.assign(new Error('503'), { status: 503 }))
      .mockResolvedValue('ok');

    const promise = withRetry(fn, { maxRetries: 3, baseDelayMs: 100, jitter: false });

    // First retry: 100ms (100 * 2^0)
    await vi.advanceTimersByTimeAsync(100);
    expect(fn).toHaveBeenCalledTimes(2);

    // Second retry: 200ms (100 * 2^1)
    await vi.advanceTimersByTimeAsync(200);
    expect(fn).toHaveBeenCalledTimes(3);

    const result = await promise;
    expect(result).toBe('ok');
  });

  it('respects Retry-After header', async () => {
    const error = Object.assign(new Error('rate limited'), {
      status: 429,
      retryAfter: 2,
    });
    const fn = vi.fn().mockRejectedValueOnce(error).mockResolvedValue('ok');

    const promise = withRetry(fn, { maxRetries: 3, baseDelayMs: 100, jitter: false });

    // Should wait 2000ms (Retry-After: 2 seconds)
    await vi.advanceTimersByTimeAsync(1999);
    expect(fn).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1);
    expect(fn).toHaveBeenCalledTimes(2);

    const result = await promise;
    expect(result).toBe('ok');
  });

  it('throws after exhausting max retries', async () => {
    vi.useRealTimers();

    let callCount = 0;
    const fn = vi.fn().mockImplementation(async () => {
      callCount++;
      throw Object.assign(new Error('503'), { status: 503 });
    });

    await expect(
      withRetry(fn, { maxRetries: 2, baseDelayMs: 10, maxDelayMs: 50, jitter: false })
    ).rejects.toThrow('503');
    expect(callCount).toBe(3); // initial + 2 retries

    vi.useFakeTimers();
  });

  it('retries on network errors', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('fetch failed'))
      .mockResolvedValue('ok');

    const promise = withRetry(fn, { maxRetries: 3, baseDelayMs: 100, jitter: false });

    await vi.advanceTimersByTimeAsync(100);

    const result = await promise;
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });
});
