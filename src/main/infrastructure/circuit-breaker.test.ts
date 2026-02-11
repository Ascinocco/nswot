import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CircuitBreaker, CircuitOpenError } from './circuit-breaker';

describe('CircuitBreaker', () => {
  let breaker: CircuitBreaker;

  beforeEach(() => {
    breaker = new CircuitBreaker({
      failureThreshold: 3,
      cooldownMs: 1000,
      monitorWindowMs: 5000,
    });
  });

  it('starts in CLOSED state', () => {
    expect(breaker.getState()).toBe('CLOSED');
  });

  it('executes function successfully in CLOSED state', async () => {
    const result = await breaker.execute(() => Promise.resolve('ok'));
    expect(result).toBe('ok');
    expect(breaker.getState()).toBe('CLOSED');
  });

  it('transitions CLOSED -> OPEN after reaching failure threshold', async () => {
    const error = new Error('timeout');

    for (let i = 0; i < 3; i++) {
      await expect(breaker.execute(() => Promise.reject(error))).rejects.toThrow('timeout');
    }

    expect(breaker.getState()).toBe('OPEN');
  });

  it('rejects immediately when OPEN', async () => {
    const error = new Error('timeout');
    for (let i = 0; i < 3; i++) {
      await expect(breaker.execute(() => Promise.reject(error))).rejects.toThrow();
    }

    await expect(breaker.execute(() => Promise.resolve('ok'))).rejects.toThrow(CircuitOpenError);
  });

  it('transitions OPEN -> HALF_OPEN after cooldown', async () => {
    vi.useFakeTimers();

    const error = new Error('timeout');
    for (let i = 0; i < 3; i++) {
      await expect(breaker.execute(() => Promise.reject(error))).rejects.toThrow();
    }
    expect(breaker.getState()).toBe('OPEN');

    vi.advanceTimersByTime(1001);
    expect(breaker.getState()).toBe('HALF_OPEN');

    vi.useRealTimers();
  });

  it('transitions HALF_OPEN -> CLOSED on success', async () => {
    vi.useFakeTimers();

    const error = new Error('timeout');
    for (let i = 0; i < 3; i++) {
      await expect(breaker.execute(() => Promise.reject(error))).rejects.toThrow();
    }

    vi.advanceTimersByTime(1001);
    expect(breaker.getState()).toBe('HALF_OPEN');

    const result = await breaker.execute(() => Promise.resolve('recovered'));
    expect(result).toBe('recovered');
    expect(breaker.getState()).toBe('CLOSED');

    vi.useRealTimers();
  });

  it('transitions HALF_OPEN -> OPEN on failure', async () => {
    vi.useFakeTimers();

    const error = new Error('timeout');
    for (let i = 0; i < 3; i++) {
      await expect(breaker.execute(() => Promise.reject(error))).rejects.toThrow();
    }

    vi.advanceTimersByTime(1001);
    expect(breaker.getState()).toBe('HALF_OPEN');

    await expect(breaker.execute(() => Promise.reject(new Error('still broken')))).rejects.toThrow();
    expect(breaker.getState()).toBe('OPEN');

    vi.useRealTimers();
  });

  it('does not trip on 4xx errors', async () => {
    const error = Object.assign(new Error('Not Found'), { status: 404 });

    for (let i = 0; i < 5; i++) {
      await expect(breaker.execute(() => Promise.reject(error))).rejects.toThrow();
    }

    // Should still be CLOSED since 404 doesn't trip the circuit
    expect(breaker.getState()).toBe('CLOSED');
  });

  it('trips on 5xx errors', async () => {
    const error = Object.assign(new Error('Internal Server Error'), { status: 500 });

    for (let i = 0; i < 3; i++) {
      await expect(breaker.execute(() => Promise.reject(error))).rejects.toThrow();
    }

    expect(breaker.getState()).toBe('OPEN');
  });

  it('prunes failures outside the monitoring window', async () => {
    vi.useFakeTimers();

    const error = new Error('timeout');

    // 2 failures
    await expect(breaker.execute(() => Promise.reject(error))).rejects.toThrow();
    await expect(breaker.execute(() => Promise.reject(error))).rejects.toThrow();

    // Advance past monitoring window
    vi.advanceTimersByTime(6000);

    // 2 more failures (old ones should be pruned, total now 2 not 4)
    await expect(breaker.execute(() => Promise.reject(error))).rejects.toThrow();
    await expect(breaker.execute(() => Promise.reject(error))).rejects.toThrow();

    // Should still be CLOSED (only 2 in window, threshold is 3)
    expect(breaker.getState()).toBe('CLOSED');

    vi.useRealTimers();
  });

  it('reset restores to initial state', async () => {
    const error = new Error('timeout');
    for (let i = 0; i < 3; i++) {
      await expect(breaker.execute(() => Promise.reject(error))).rejects.toThrow();
    }
    expect(breaker.getState()).toBe('OPEN');

    breaker.reset();
    expect(breaker.getState()).toBe('CLOSED');

    const result = await breaker.execute(() => Promise.resolve('works'));
    expect(result).toBe('works');
  });
});
